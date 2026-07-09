// End-to-end test harness. Hits the running dev server's real routes
// (/api/upload + /api/chat) with the NE555 datasheet, asks a fixed question
// set, and checks answers + citations against the verified answer key.
//
// Usage: start `npm run dev` (with ANTHROPIC_API_KEY in .env.local), then:
//   node scripts/run-test.mjs
// Optional: BASE=http://localhost:3000 node scripts/run-test.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || "http://localhost:3000";
const PDF = path.join(__dirname, "testdata", "ne555.pdf");

// Each check: expected regexes (all must match, case-insensitive), pages that a
// citation should land on (any one is enough), and trap=true for "must say not
// in document".
const CASES = [
  {
    q: "Absolute maximum VCC (supply voltage) kaç volt?",
    expect: [/18\s*V/i],
    pages: [4],
  },
  {
    q: "Absolute maximum output current nedir?",
    expect: [/(±|\+\/-|\+-)?\s*225\s*mA/i],
    pages: [4],
  },
  {
    q: "Storage temperature (Tstg) aralığı nedir?",
    expect: [/-?65/, /150/, /°?C/i],
    pages: [4],
  },
  {
    q: "NE555 için recommended besleme gerilimi (VCC) aralığı nedir?",
    expect: [/4\.5/, /16\s*V/i],
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
    expect: [/10\s*mA/i, /15\s*mA/i],
    pages: [6],
  },
  {
    q: "Output pulse rise time (tr) typ ve max değeri nedir, hangi koşulda?",
    expect: [/100\s*ns/i, /300\s*ns/i, /15\s*pF/i],
    pages: [7],
  },
  {
    q: "VCC=5V, IOL=8mA iken NE555 low-level output voltage typ ve max?",
    expect: [/0\.15\s*V/i, /0\.4\s*V/i],
    pages: [6],
  },
  {
    q: "ESD HBM (human body model) rating değeri nedir?",
    expect: [/(±|\+\/-|\+-)?\s*500\s*V/i],
    pages: [4],
  },
  {
    q: "NE555 ile SE555 arasında maksimum VCC farkı nedir?",
    expect: [/16\s*V/i, /18\s*V/i],
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
    const hit = res.citations.some(
      (ci) => ci.startPage != null && c.pages.includes(ci.startPage)
    );
    if (res.citations.length === 0) problems.push("citation yok");
    else if (!hit)
      problems.push(
        `citation sayfası beklenenle uyuşmadı (beklenen ${c.pages.join(
          "/"
        )}, gelen ${res.citations.map((x) => x.startPage).join(",")})`
      );
  }
  return problems;
}

async function main() {
  console.log(`Test hedefi: ${BASE}\nDatasheet: ${PDF}\n`);
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
