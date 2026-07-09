# Datasheet Analiz — Frontend Tasarım Planı

> Bu plan Fable 5 ile hazırlandı; uygulama Opus 4.8 oturumunda yapılacak.
> Kaynak skiller: [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) + [impeccable](https://github.com/pbakaus/impeccable).
> Gerekli tüm kurallar bu dosyaya damıtıldı — skill repolarını yeniden klonlamak şart değil.

## 0. Uygulamadan önce (ZORUNLU)

1. **Next.js 16.2.10 bu bildiğin Next.js değil.** Kod yazmadan önce
   `node_modules/next/dist/docs/01-app/` altındaki ilgili rehberleri oku
   (özellikle routing, fonts, image, client/server component konvansiyonları).
   AGENTS.md'deki uyarı geçerli: API'ler ve konvansiyonlar eğitim verinden farklı olabilir.
2. Tailwind **v4** (CSS-first config, `@theme`). `tailwind.config.js` yok; token'lar
   `app/globals.css` içinde tanımlanır.
3. Mevcut backend'e (app/api/, lib/anthropic.ts, lib/prompts.ts) **dokunma**.
   Bu iş sadece frontend/UI. `lib/types.ts`'teki `MessageSegment`/`Citation` modeli korunur.
4. Her fazdan sonra `npm run dev` ile gerçek tarayıcıda doğrula; 375px, 768px, 1024px,
   1440px genişliklerinde test et.

## 1. Kullanıcı kararları (soruldu, onaylandı)

| Karar | Seçim |
|---|---|
| Desktop düzeni | **Split view**: solda PDF görüntüleyici, sağda chat. Citation tıklanınca PDF ilgili sayfaya atlar. Mobil tek kolon chat + PDF'e geçiş sekmesi. |
| Tema | **Koyu + açık, sistem takipli** (`prefers-color-scheme`) + manuel toggle. |
| Kimlik | **Teknik-hassas**: ölçüm cihazı hissi. Mono font sayısal değer/citation'larda, hassas 1px çizgiler, tek disiplinli accent, sıkı grid. Linear/Raycast ligi. |
| Kapsam ekstraları | Markdown/tablo render, upload progress + doküman kartı, boş durum/karşılama yenileme. Oturum geçmişi (localStorage) **kapsam dışı**. |

## 2. Tasarım sistemi

### Register: PRODUCT (impeccable)

Bu bir araç UI'ı — tasarım ürüne hizmet eder. Test: "Linear/Figma/Raycast kullanan bir
mühendis bu arayüze oturduğunda güvenir mi, yoksa her komponentte duraksar mı?"
Araç görevin içinde kaybolmalı.

### Renk — OKLCH token'ları

Mevcut emerald kimlik korunur (committed brand color → identity preservation) ama
OKLCH ile rafine edilir. Strateji: **Restrained** — accent yalnızca birincil aksiyon,
seçim ve state göstergelerinde; asla dekorasyon.

`app/globals.css` içinde semantik token seti (her iki tema için):

```css
:root {
  /* light */
  --bg: oklch(0.985 0.002 160);        /* nötr, krem DEĞİL */
  --surface: oklch(1 0 0);
  --surface-2: oklch(0.965 0.003 160); /* ikinci nötr katman: panel/sidebar */
  --ink: oklch(0.21 0.01 160);         /* gövde metni ≥4.5:1 */
  --ink-muted: oklch(0.45 0.01 160);   /* ikincil metin, YİNE ≥4.5:1 */
  --border: oklch(0.88 0.004 160);
  --accent: oklch(0.60 0.13 163);      /* emerald, aksiyonlar */
  --accent-ink: oklch(0.995 0 0);
  --danger: oklch(0.55 0.19 25);
}
[data-theme="dark"] {
  --bg: oklch(0.17 0.006 160);
  --surface: oklch(0.21 0.007 160);
  --surface-2: oklch(0.19 0.006 160);
  --ink: oklch(0.93 0.005 160);
  --ink-muted: oklch(0.68 0.01 160);   /* zinc-500 yerine — kontrast düzeltmesi */
  --border: oklch(0.30 0.008 160);
  --accent: oklch(0.72 0.14 163);
  --accent-ink: oklch(0.16 0.02 163);
  --danger: oklch(0.68 0.17 25);
}
```

Değerler başlangıç noktası; uygulamada kontrast doğrulanacak (aşağıda §6).
Tailwind v4'te `@theme inline` ile `--color-*` olarak bağla, `@custom-variant dark`
ile `[data-theme="dark"]` varyantı tanımla.

**Tema mekanizması:** bağımlılık ekleme (next-themes gerekmez). `layout.tsx` head'ine
FOUC önleyici inline script: localStorage'da tercih varsa onu, yoksa
`matchMedia('(prefers-color-scheme: dark)')` sonucunu `data-theme` olarak `<html>`e yaz.
Header'da üç durumlu olmayan basit toggle (sistem ↔ manuel override), `color-scheme`
CSS'i güncel tut. `viewport.themeColor` her iki tema için `media` ile ver.

### Tipografi

- **Geist Sans** tek aile — başlık, gövde, buton, label (product register: tek aile doğru).
- **Geist Mono** görev-kritik yerlerde: sayısal değerler, citation rozetleri (s.14),
  doküman indeksleri [1]/[2], pin isimleri. "Ölçüm cihazı" kimliğinin taşıyıcısı bu.
- Sabit rem skala, oran ~1.2: 12 / 13 / 15 / 18 / 22px. Fluid/clamp başlık YOK.
- Gövde satır uzunluğu ≤ 72ch. `text-wrap: balance` başlıklarda, `pretty` uzun cevaplarda.

### İkonlar

- **lucide-react** ekle. TÜM emoji-ikonlar gider: `▚` → logo işareti (küçük SVG),
  `✕` → `<X>`, `＋` → `<Plus>`, `⚠` → `<TriangleAlert>`, spinner → `<Loader2>` yerine
  tercihen skeleton.
- Tek stil (outline), tutarlı boyut token'ları (16/20px), stroke 1.5–2px sabit.

### Motion

- 150–250ms, `ease-out` (quart/expo). Bounce/elastic yok.
- Motion yalnızca state iletir: mesaj girişi (hafif fade+2px yukarı), panel açılışı,
  hover/focus geçişleri, streaming göstergesi. Sayfa yükleme koreografisi YOK.
- Her animasyona `@media (prefers-reduced-motion: reduce)` alternatifi: anlık/crossfade.

### Kesin yasaklar (her iki skill ortak)

- Emoji ikon, gradient text (`background-clip: text`), side-stripe border (kalın renkli
  sol/sağ kenar), glassmorphism default, her bölümde uppercase eyebrow, hero-metric
  şablonu, birbirinin aynı kart grid'leri, 999/9999 z-index (semantik skala kur),
  içerik ortasında spinner (skeleton kullan), dekoratif motion, display font UI'da,
  custom scrollbar aşırılığı (mevcut ince scrollbar kalabilir), inaktif state'te doygun renk.
- **Kart tembelliktir**: nested kart asla; kartı yalnızca gerçekten en iyi affordance ise kullan.
- Modal ilk akla gelen olmasın: inline/progressive alternatif önce.

## 3. Bilgi mimarisi ve düzen

### Desktop (≥1024px): split view

```
┌──────────────────────────────┬────────────────────────────┐
│ PDF PANELİ (surface-2)       │ CHAT PANELİ (bg)           │
│ ┌─ doküman sekmeleri [1][2] ─┤ ┌─ header: logo · tema ──┐ │
│ │ pdf.js canvas render       │ │ doküman kartları        │ │
│ │ (citation → sayfaya scroll)│ │ mesaj akışı             │ │
│ │                            │ │  · markdown + tablolar  │ │
│ │ ◄ sayfa 14 / 32 ►  zoom ±  │ │  · citation chip → PDF  │ │
│ └────────────────────────────┤ │ composer (sticky alt)   │ │
│  genişlik ~55% / min 480px   │ └─ genişlik ~45% ────────┘ │
└──────────────────────────────┴────────────────────────────┘
```

- Panel ayrımı 1px `--border` çizgisi (teknik-hassas kimlik; kalın divider yok).
- PDF paneli yalnızca doküman yüklüyken görünür; yokken chat ortalanmış tek kolon
  (karşılama ekranı, §5).
- Citation chip tıklaması: PDF panelinde ilgili sayfaya smooth scroll + sayfa kısa
  vurgusu (200ms border flash). Popover yine açılır (alıntı metni), ama artık
  `position: fixed`/Popover API ile — scroll container kırpılması çözülür.

### Tablet (768–1023px)

Split view dar: PDF paneli kapatılabilir (toggle buton header'da). Varsayılan kapalı,
citation tıklanınca yandan slide-in panel (overlay değil, yan panel).

### Mobil (<768px)

- Tek kolon chat (mevcut yapı korunur, iyileştirilir).
- Alt segment kontrol veya header sekmesi: **Sohbet | PDF**. Citation tıklaması
  PDF sekmesine geçirip sayfaya götürür; geri dönüş tek dokunuş.
- Composer: safe-area (`env(safe-area-inset-bottom)`), 44pt dokunma hedefleri,
  `100dvh` (mevcut, korunur).

### PDF görüntüleyici teknik notu

- `pdfjs-dist` doğrudan kullan (react-pdf sarmalayıcısına gerek yok; Next 16 + React 19
  uyumluluğunu docs'tan doğrula). Worker'ı `new URL(...)` ile bundle et.
- Kaynak: upload anındaki `File` nesnesinden `URL.createObjectURL` — sunucudan tekrar
  indirme yok. `UploadedDoc` tipine `objectUrl?: string` ve `pageCount?: number` eklenir
  (yalnız client-side alan; API sözleşmesi değişmez).
- Sayfa yenilenince objectUrl kaybolur → PDF paneli "yeniden yükle" boş durumu gösterir
  (oturum geçmişi kapsam dışı olduğundan kabul edilebilir).
- Sanal render: yalnızca görünür sayfa ± 1 render et (büyük datasheet'ler 100+ sayfa).

## 4. Komponent spesifikasyonları

Her interaktif komponentte 7 state: default, hover, focus-visible, active, disabled,
loading, error. Yarısıyla teslim etme.

### 4.1 UploadZone v2

- Sürükle-bırak alanı korunur; `dragOver` state'i accent kenar + hafif surface tonu.
- **Upload progress**: `XMLHttpRequest` upload.onprogress (fetch upload progress vermez)
  → ince progress bar (2px, accent) + yüzde (mono). `lib/upload-client.ts`'e progress
  callback eklenir.
- Yükleme bitince **doküman kartı**: dosya adı (truncate), boyut, sayfa sayısı
  (pdfjs'ten), `[1]`/`[2]` mono indeks rozeti, kaldır butonu (X ikonu, 44pt hedef).
- Hata: inline, `--danger` metin + tekrar dene aksiyonu. PDF-dışı dosya ve boyut
  aşımı için ayrı, net mesajlar (clarify: ne oldu + ne yapmalı).

### 4.2 ChatMessage v2 — markdown + citation

- `react-markdown` + `remark-gfm` ekle (tablolar için).
- **Segment→markdown köprüsü**: segmentleri tek metinde birleştir, her segment
  sınırındaki citation'lar için `[[cite:n]]` sentinel'i enjekte et; markdown render
  sonrası sentinel'leri custom text-node işleyicisiyle `<CitationChip>`e çevir.
  Streaming sırasında yarım markdown tolere edilir (react-markdown her flush'ta
  yeniden parse eder; performans için mesaj memo'lanır, yalnız son mesaj re-render).
- Tablo stili: mono font sayısal hücrelerde, 1px `--border` çizgiler, başlık satırı
  `--surface-2`, yatay taşmada `overflow-x: auto` konteyner. Min/typ/max sütunları
  sağa hizalı.
- Kullanıcı balonu: mavi gider → **accent değil, nötr**: `--surface-2` + 1px border
  (Restrained: iki accent karışıklığı biter). Asistan mesajı balonsuz ya da çok hafif
  yüzey — uzun teknik içerik balon içinde sıkışmasın, tam genişlik metin bloğu.
- Streaming göstergesi: içerik ortasında spinner yerine son mesajın altında ince
  "analiz ediliyor" satırı + yanıp sönen caret (mono, teknik his).

### 4.3 CitationChip v2

- Rozet: mono `s.14`, accent tonu (yalnız burada — citation bu ürünün çekirdek
  değeri, accent'i hak ediyor). 44pt dokunma hedefi için padding/hitbox ayarı.
- Tıklama davranışı düzene göre: desktop → PDF sayfaya atla + popover; mobil → PDF
  sekmesine geç. Popover: Popover API ya da `position: fixed` + konum hesabı;
  Escape/dış-tık kapatır; `role="dialog"`, focus yönetimi.
- Popover içeriği: doküman adı (multiDoc'ta), sayfa, alıntı metni, "PDF'te gör" aksiyonu.

### 4.4 Header

- Sol: logo işareti (basit geometrik SVG — devre/ölçüm göndermesi, emoji değil) + ürün adı.
- Sağ: tema toggle (Sun/Moon ikonu, 44pt), doküman varken "PDF panelini aç/kapat"
  (tablet) veya sekme kontrolü (mobil).
- Alt açıklama satırı yalnız karşılama ekranında; doküman yüklüyken header tek satıra
  iner (dikey alan chate).

### 4.5 Composer

- Textarea otomatik yükselir (max 6 satır), Enter=gönder / Shift+Enter=satır (mevcut).
- Gönder butonu: ikon (`ArrowUp` veya `Send`), accent dolgu, disabled state düşük
  vurgu — ama placeholder dahil tüm metinler ≥4.5:1.
- Streaming'de "durdur" affordance'ı gerekmiyorsa buton disabled + spinner değil,
  buton ikonu değişir (Square=durdur eklemek istersen backend değişikliği gerekir —
  kapsam dışı, disabled yeterli).

## 5. Karşılama / boş durumlar

- **Doküman yok**: öğreten karşılama — kısa değer önermesi (1 cümle), upload alanı
  odakta, altında 3 maddelik "nasıl çalışır" (sayfa referanslı cevap · uydurma yok ·
  iki datasheet karşılaştırma). 4 bullet'lık mevcut liste sadeleşir. Eyebrow/numaralı
  bölüm başlığı YOK.
- **Doküman var, mesaj yok**: örnek soru çipleri kalır (SUGGESTIONS), ama doküman
  kartının altında; çipler 44pt, mono değil (soru cümleleri).
- **PDF paneli, doküman yokken** (yenileme sonrası): "PDF önizlemesi için dokümanı
  yeniden yükle" + upload kısayolu.

## 6. Kalite kapısı (teslim öncesi, her faz sonunda)

- [ ] Kontrast: gövde ≥4.5:1, büyük metin ≥3:1, placeholder dahil. Her İKİ temada
      ayrı doğrula (araç: OKLCH → hesap ya da devtools).
- [ ] `focus-visible` tüm interaktiflerde görünür (2px accent ring, offset'li).
- [ ] Dokunma hedefleri ≥44×44pt (citation chip, X butonları, tema toggle dahil).
- [ ] Klavye: tab sırası görsel sırayla eşleşir; popover Escape ile kapanır.
- [ ] `prefers-reduced-motion` altında tüm animasyonlar anlık/crossfade.
- [ ] 375px, 768px, 1024px, 1440px + landscape testi; başlık/tablo taşması yok
      (taşan tablo kendi konteynerinde scroll).
- [ ] Streaming sırasında layout shift yok; skeleton'lar gerçek içerik boyutuna yakın.
- [ ] `npm run lint` + `npm run build` temiz; `npm test` (dev server ile) geçiyor.
- [ ] AI-slop testi: hiçbir ekran "bunu AI yaptı" dedirtmiyor — yasak listesi §2 tara.

## 7. Uygulama fazları (sıralı)

| Faz | İş | Dokunulan dosyalar |
|---|---|---|
| 1 | Token sistemi + tema (OKLCH, dark/light, FOUC script, toggle) | `globals.css`, `layout.tsx`, yeni `components/ThemeToggle.tsx` |
| 2 | Bağımlılıklar: `lucide-react`, `react-markdown`, `remark-gfm`, `pdfjs-dist`; ikon değişimi | `package.json`, mevcut komponentler |
| 3 | Düzen kabuğu: split view + tablet/mobil davranış, header v2 | `page.tsx`, yeni `components/AppShell.tsx` (veya page içi grid) |
| 4 | ChatMessage v2: markdown + tablo + sentinel-citation köprüsü | `ChatMessage.tsx`, `CitationChip.tsx` |
| 5 | PDF görüntüleyici + citation senkronu | yeni `components/PdfViewer.tsx`, `lib/types.ts` (client alanları) |
| 6 | UploadZone v2: progress + doküman kartı | `UploadZone.tsx`, `upload-client.ts`, yeni `components/DocCard.tsx` |
| 7 | Karşılama/boş durumlar + motion + kalite kapısı (§6 tam tur) | tümü |

Her faz sonunda çalışan uygulama; faz atlanmaz, yarım state bırakılmaz.
