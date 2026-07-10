# Datasheet Analiz

Elektronik mühendisleri için kaynaklı, halüsinasyonsuz datasheet asistanı. PDF
datasheet yükle, sor; her cevap **datasheet içindeki sayfa + birebir alıntı** ile
gelir. Dokümanda olmayan bilgi uydurulmaz.

- **Model:** Claude Opus 4.8 (native PDF: tablolar + grafikler görsel olarak okunur)
- **Citations API** ile her iddia sayfa referanslı — RAG yok, chunk hatası yok
- İki datasheet'i yan yana karşılaştırma
- Prompt caching: ilk sorudan sonra aynı datasheet ~%90 daha ucuz
- Mobil öncelikli, koyu tema

## Kurulum (lokal)

```bash
npm install
cp .env.example .env.local     # ANTHROPIC_API_KEY'i gir
npm run dev                     # http://localhost:3000
```

`.env.local` içine Anthropic API anahtarını yaz:

```
ANTHROPIC_API_KEY=sk-ant-...
```

## Test

Gerçek datasheet (NE555) ile uçtan uca kabul testi. Dev server çalışırken:

```bash
npm run dev            # ayrı terminalde
npm test               # scripts/run-test.mjs — upload + 14 soru + citation kontrolü
```

Geçme kriteri: her sayısal cevap doğru + doğru sayfa citation'ı + tuzak soruda
"datasheet'te yok". Detay: `scripts/test-qa.md`.

## Deploy (GitHub → Vercel)

1. Repo'yu GitHub'a push et.
2. [vercel.com](https://vercel.com) → **Add New → Project → Import** (GitHub repo).
3. **Environment Variables**: `ANTHROPIC_API_KEY` ekle.
4. Deploy. Prod link telefondan kullanılabilir.

> Uygulamada kimlik doğrulaması yok: linki bilen herkes soru sorabilir ve her
> soru Anthropic faturasına yazılır. Anthropic konsolunda harcama limiti tanımlı
> tutun ve linki dar paylaşın.

## PDF boyut sınırı

Üst sınır **100 MB**. Vercel bir serverless fonksiyonun istek gövdesini ~4.5 MB
ile sınırlar, o yüzden 4 MB'ın altındaki PDF'ler doğrudan `/api/upload`'a gider;
büyükler tarayıcıdan private bir Vercel Blob store'una yüklenir ve sunucu blob'u
oradan çekip Anthropic Files API'ye aktarır, sonra blob'u siler. Blob store
yoksa 4 MB üstü yüklemeler çalışmaz.

Asıl tavan Anthropic tarafında: Files API 500 MB'a kadar dosya kabul eder, ama
PDF'ler sayfa sayısıyla sınırlıdır (1M bağlamlı modellerde 600 sayfa). 100 MB
sınırı, upload route'unun `maxDuration` bütçesine göre seçildi — ölçümde 50 MB
sunucuda 4.9 saniye sürüyor.

## Mimari

```
Tarayıcı → /api/upload (PDF → Anthropic Files API → file_id)
        → /api/chat  (soru + file_id → Opus 4.8 stream + citations → SSE)
```

- `lib/prompts.ts` — katı sistem promptu (birim/koşul, min/typ/max, varyant, absolute-max ayrımı)
- `app/api/chat/route.ts` — streaming + citations + cache_control
- `components/CitationChip.tsx` — "s.14" rozeti → alıntı popover

## Erişim / maliyet

Şu an auth yok (açık link). Link yayılırsa API maliyeti hesap sahibine yazar.
Basit tek-şifre eklemek için `middleware.ts` yeterli — ileride 10 dk'lık iş.
