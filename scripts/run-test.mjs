// End-to-end test harness. Hits the running dev server's real routes
// (/api/upload + /api/chat) with the NE555 datasheet, asks a fixed question
// set, and checks answers + citations against the verified answer key.
//
// Usage: start `npm run dev` (with a key in .env.local), then:
//   node scripts/run-test.mjs
//
// Env:
//   BASE=http://localhost:3000     target server
//   PROVIDER=anthropic|openai|gemini   which adapter (default: server's env)
//   MODEL=<model id>               override the provider default
//   LLM_API_KEY=<key>             BYOK; omit to use the server's env key
//
// The verified answer key (values, pages) was built against Anthropic's native
// citations. OpenAI and Gemini cite through a prompt contract that the browser
// verifies against the PDF — the harness has no browser, so for those
// providers the page check is relaxed to "a citation was produced".

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || "http://localhost:3000";
const PDF = path.join(__dirname, "testdata", "ne555.pdf");
const PROVIDER = process.env.PROVIDER || "";
const MODEL = process.env.MODEL || "";
const API_KEY = process.env.LLM_API_KEY || "";
const NATIVE_CITES = PROVIDER === "" || PROVIDER === "anthropic";

const creds = {
  ...(PROVIDER ? { provider: PROVIDER } : {}),
  ...(MODEL ? { model: MODEL } : {}),
  ...(API_KEY ? { apiKey: API_KEY } : {}),
};

// A measured value plus its unit, tolerant of how the model laid it out. The
// model may answer in prose ("100 ns") or in a markdown table
// ("| 100 | 300 | ns |"), and both are correct — so allow a short run of other
// cells between the number and its unit, but stay on one line so this can't
// match a number here and a unit three paragraphs down.
function val(number, unit) {
  const n = String(number).replace(".", "\\.");
  return new RegExp(`(?<![\\d.])${n}(?![\\d])[^\\n]{0,24}?${unit}`, "i");
}

// Each check: expected regexes (all must match, case-insensitive), pages that a
// citation should land on (any one is enough), and trap=true for "must say not
// in document".
const CASES = [
  {
    q: "Absolute maximum VCC (supply voltage) kaç volt?",
    expect: [val(18, "V")],
    pages: [4],
  },
  {
    q: "Absolute maximum output current nedir?",
    expect: [val(225, "mA")],
    pages: [4],
  },
  {
    q: "Storage temperature (Tstg) aralığı nedir?",
    expect: [/-?65/, /150/, /°?C/i],
    pages: [4],
  },
  {
    q: "NE555 için recommended besleme gerilimi (VCC) aralığı nedir?",
    expect: [/4\.5/, val(16, "V")],
    pages: [4],
  },
  {
    q: "NE555'in çalışma sıcaklığı (TA) aralığı nedir?",
    expect: [/0/, /70/, /°?C/i],
    pages: [4],
  },
  {
    q: "TRIG hangi pin numarasında? (8 pinli paket)",
    expect: [/pin\s*2|2\s*(numaral|\.)|\b2\b/i],
    pages: [3],
  },
  {
    q: "VCC hangi pin numarasında? (8 pinli paket)",
    expect: [/pin\s*8|\b8\b/i],
    pages: [3],
  },
  {
    q: "Çıkış low durumunda, VCC=15V iken NE555 supply current typ ve max değeri?",
    expect: [val(10, "mA"), val(15, "mA")],
    pages: [6],
  },
  {
    q: "Output pulse rise time (tr) typ ve max değeri nedir, hangi koşulda?",
    expect: [val(100, "ns"), val(300, "ns"), val(15, "pF")],
    pages: [7],
  },
  {
    q: "VCC=5V, IOL=8mA iken NE555 low-level output voltage typ ve max?",
    expect: [val("0.15", "V"), val("0.4", "V")],
    pages: [6],
  },
  {
    q: "ESD HBM (human body model) rating değeri nedir?",
    expect: [val(500, "V")],
    pages: [4],
  },
  {
    q: "NE555 ile SE555 arasında maksimum VCC farkı nedir?",
    expect: [val(16, "V"), val(18, "V")],
    pages: [3, 4],
  },
  {
    q: "Bu çipi 3.3V besleme ile çalıştırabilir miyim?",
    expect: [/4\.5/, /(çalışm|olmaz|hayır|değil|yeter|desteklen|uyumsuz|no\b)/i],
    pages: [4],
  },
  {
    // TRAP: no such spec in an analog timer datasheet
    q: "Bu çipin dahili ADC çözünürlüğü kaç bit ve I2C adresi nedir?",
    trap: true,
  },
];

async function uploadPdf() {
  const buf = fs.readFileSync(PDF);
  const blob = new Blob([buf], { type: "application/pdf" });
  const fd = new FormData();
  fd.append("file", blob, "ne555.pdf");
  for (const [k, v] of Object.entries(creds)) fd.append(k, v);
  const res = await fetch(`${BASE}/api/upload`, { method: "POST", body: fd });
  if (!res.ok) {
    throw new Error(`upload failed ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function ask(fileId, fileName, question) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileIds: [fileId],
      fileNames: [fileName],
      question,
      history: [],
      ...creds,
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`chat failed ${res.status}: ${await res.text()}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let bufferStr = "";
  let text = "";
  const citations = [];
  let errored = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bufferStr += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = bufferStr.indexOf("\n\n")) !== -1) {
      const line = bufferStr.slice(0, idx).trim();
      bufferStr = bufferStr.slice(idx + 2);
      if (!line.startsWith("data:")) continue;
      const ev = JSON.parse(line.slice(5).trim());
      if (ev.type === "text") text += ev.text;
      else if (ev.type === "citation") citations.push(ev.citation);
      else if (ev.type === "error") errored = ev.message;
    }
  }
  return { text, citations, errored };
}

function checkCase(c, res) {
  const problems = [];
  if (res.errored) problems.push(`stream error: ${res.errored}`);

  const t = res.text;
  if (c.trap) {
    const saysNo =
      /(yok|belirtilm|bulunmuyor|not specified|not (in|found)|içermiyor|mevcut değil|geçmiyor|yer almıyor)/i.test(
        t
      );
    // Must NOT invent a bit count or hex address
    const invented = /\b(8|10|12|16)\s*bit\b/i.test(t) || /0x[0-9a-f]{2}/i.test(t);
    if (!saysNo) problems.push("trap: 'datasheet'te yok' demedi");
    if (invented) problems.push("trap: UYDURMA değer üretti");
    return problems;
  }

  for (const re of c.expect) {
    if (!re.test(t)) problems.push(`beklenen eşleşmedi: ${re}`);
  }
  if (c.pages) {
    if (res.citations.length === 0) {
      problems.push("citation yok");
    } else if (NATIVE_CITES) {
      const hit = res.citations.some(
        (ci) => ci.startPage != null && c.pages.includes(ci.startPage)
      );
      if (!hit)
        problems.push(
          `citation sayfası beklenenle uyuşmadı (beklenen ${c.pages.join(
            "/"
          )}, gelen ${res.citations.map((x) => x.startPage).join(",")})`
        );
    }
    // Non-native providers: page verified client-side, not here — presence is
    // all the harness can check.
  }
  return problems;
}

async function main() {
  console.log(
    `Test hedefi: ${BASE}\nSağlayıcı: ${PROVIDER || "(sunucu env)"}${
      MODEL ? ` / ${MODEL}` : ""
    }\nDatasheet: ${PDF}\n`
  );
  const up = await uploadPdf();
  console.log(`Yüklendi: ${up.fileId} (${up.fileName}, ${up.sizeBytes} B)\n`);

  let pass = 0;
  const lines = [];
  for (const c of CASES) {
    let res;
    try {
      res = await ask(up.fileId, up.fileName, c.q);
    } catch (e) {
      res = { text: "", citations: [], errored: String(e) };
    }
    const problems = checkCase(c, res);
    const ok = problems.length === 0;
    if (ok) pass++;
    const tag = ok ? "PASS" : "FAIL";
    console.log(
      `[${tag}] ${c.q}\n  → ${res.text.replace(/\s+/g, " ").slice(0, 180)}${
        res.text.length > 180 ? "…" : ""
      }`
    );
    if (res.citations.length)
      console.log(
        `  citations: ${res.citations
          .map((x) => "s." + x.startPage)
          .join(", ")}`
      );
    if (!ok) console.log(`  ✗ ${problems.join(" | ")}`);
    console.log("");
    lines.push(`- [${tag}] ${c.q}${ok ? "" : " — " + problems.join("; ")}`);
  }

  const total = CASES.length;
  const pct = ((pass / total) * 100).toFixed(1);
  console.log(`\n=== SONUÇ: ${pass}/${total} (${pct}%) ===`);
  lines.unshift(`## Otomatik test sonucu: ${pass}/${total} (${pct}%)  — ${new Date().toISOString()}\n`);
  fs.writeFileSync(
    path.join(__dirname, "test-result.md"),
    lines.join("\n") + "\n"
  );
  process.exit(pass === total ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS HATASI:", e);
  process.exit(2);
});
