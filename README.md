# Datasheet Analiz

Datasheet PDF'ini yükle, soru sor; **her değer sayfa numarası ve PDF'ten
birebir alıntıyla** gelsin. Model uydurmaz: bilgi dokümanda yoksa cevap
"datasheet'te yok" der.

Kendi bilgisayarında çalışır, kendi API anahtarını kullanır.
**Anthropic (Claude), OpenAI veya Google Gemini** — hangisini istersen.

## Ne işe yarar

Bir komponentin 200 sayfalık datasheet'inde "V_IH kaç volt", "3.3 V lojikle
uyumlu mu", "absolute maximum ile recommended operating farkı ne" diye
aranırken kaybolmamak için. Uygulama:

- **Tüm PDF'i modele verir** — RAG yok, chunk seçimi yok. Tablolar, şekiller,
  dipnotlar dahil doküman bütün olarak okunur.
- **Her cevabı kaynaklandırır** — cevabın altındaki kaynak rozetine tıklayınca
  PDF o sayfaya gider ve alıntılanan cümle sayfada işaretlenir.
- **İki datasheet'i karşılaştırır** — aynı soruyu iki dokümana birden sorup
  yanıtları yan yana koyabilirsin.
- **Mühendis gibi cevap verir** — sistem promptu birimleri ve test koşullarını,
  min/typ/max kolonunu, varyant/revizyon farkını ve "absolute max ≠ recommended
  operating" ayrımını zorunlu tutar.
- **İstediğin modeli kullanır** — sağlayıcıyı ve model kimliğini panelden sen
  yazarsın; kapalı bir model listesi yok. Seçim varsayılan olarak saklanır,
  değiştirdiğinde yenisi varsayılan olur.
- **Anahtarını dışarı çıkarmaz** — anahtar tarayıcının localStorage'ında ya da
  sunucudaki `.env.local` dosyasında durur; sadece kendi localhost sunucuna,
  oradan da seçtiğin sağlayıcıya gider. Ne veritabanı ne bulut depolama var.

Soru dili cevabın dilini belirler: Türkçe sorarsan Türkçe, İngilizce sorarsan
İngilizce cevap gelir.

## Gereksinimler

- **Node.js 20.9 veya üstü** (Next.js 16 şartı) — [nodejs.org](https://nodejs.org)
- Bir sağlayıcı API anahtarı:
  [Anthropic](https://console.anthropic.com) ·
  [OpenAI](https://platform.openai.com/api-keys) ·
  [Google AI Studio](https://aistudio.google.com/apikey)

Anahtar kendi hesabındandır; her soru kendi kotandan token harcar.

## Kurulum

```bash
git clone https://github.com/alislhyldrm/datasheet.git
cd datasheet
npm install
npm run dev
```

Tarayıcıda **http://localhost:3000** açılır. Git kullanmak istemiyorsan
GitHub'da **Code → Download ZIP** ile indirip klasörü açtıktan sonra aynı
`npm install && npm run dev` adımlarını uygula.

Yapılandırma dosyası düzenlemek, hesap açmak, deploy etmek gerekmez.

## Kullanım

1. **Modelini seç.** Sağ üstteki dişli ikonu → sağlayıcı, model kimliği ve API
   anahtarı. Model alanı serbest metindir: anahtarının eriştiği **hangi model
   olursa olsun** yazabilirsin, kapalı bir liste yok. Kaydettiğin an bu seçim
   varsayılanın olur ve öyle kalır; dilediğin zaman paneli açıp değiştirirsin,
   yeni seçim yeni varsayılandır. Anahtar `.env.local` dosyasındaysa anahtar
   alanını boş bırakabilirsin.
2. **PDF yükle.** Datasheet'i sürükle-bırak ya da alandan seç. Dosya
   sağlayıcının Files API'sine yüklenir, geriye sadece opak bir dosya kimliği
   döner.
3. **Sor.** Alttaki kutuya yaz ya da hazır sorulardan birine tıkla: "Absolute
   maximum ratings nedir?", "Besleme gerilimi aralığı (min/typ/max)?", "3.3V
   lojik ile uyumlu mu?", "Pinout / bacak bağlantıları?"…
4. **Kaynağı doğrula.** Cevaptaki kaynak rozetine tıkla: PDF paneli ilgili
   sayfayı açar ve alıntılanan cümleyi vurgular. Geniş ekranda PDF sohbetin
   yanında durur, dar ekranda üstteki PDF ikonuyla açılıp kapanır.
5. **Karşılaştır.** İkinci bir datasheet yükle; PDF panelindeki alt alta / tek
   tek düğmesiyle iki dokümanı birlikte gör, tek soruda ikisini de sorgula.

Tema (açık/koyu) üstteki düğmeden değişir ve tarayıcıda hatırlanır.

### Anahtarı tarayıcıya hiç girmemek: `.env.local`

Ayarlar panelini hiç açmak istemiyorsan anahtarı dosyaya yaz. Uygulama açılışta
sunucuya "senin anahtarın var mı?" diye sorar; varsa doğrudan yükleme ekranıyla
açılır, anahtar tarayıcıya hiç inmez. Yapman gereken:

```bash
cp .env.example .env.local
```

sonra **kullanacağın sağlayıcının anahtar satırını doldurmak**. Doldurulacak tek
yer bu; sağlayıcıyı ayrıca yazmana gerek yok, hangi satırı doldurduğundan
anlaşılıyor. Birden fazla satırı doldurabilirsin: o zaman panelden hangisine
geçersen geç, anahtar hazırdır.

| Kullandığın sağlayıcı | Dolduracağın satır | Anahtarı nereden alırsın |
|-----------------------|--------------------|--------------------------|
| Anthropic (Claude) | `ANTHROPIC_API_KEY=` | https://console.anthropic.com |
| OpenAI | `OPENAI_API_KEY=` | https://platform.openai.com/api-keys |
| Google Gemini | `GEMINI_API_KEY=` | https://aistudio.google.com/apikey |

Örnek — Gemini kullanan bir `.env.local` bu kadar:

```ini
GEMINI_API_KEY=AIza...
```

Dosyadaki diğer iki satır isteğe bağlı, boş kalabilir:

```ini
# Sadece yukarıda birden fazla anahtar doluysa gerekir: hangisi kullanılsın?
LLM_PROVIDER=      # anthropic | openai | gemini
# Model kimliği. Boş = sağlayıcının varsayılan modeli.
LLM_MODEL=
```

Değerleri tırnak içine alma, satır sonuna boşluk bırakma. `.env.local`
`.gitignore`'da olduğu için anahtarın repoya gitmez. Dosyayı değiştirdikten
sonra dev sunucusunu yeniden başlat.

Birden fazla anahtarı doldurup `LLM_PROVIDER` yazmazsan uygulama hangisini
kastettiğini bilemez ve bunu açıkça söyler; o durumda `LLM_PROVIDER` satırını
doldur.

### Model seçimi ile anahtar ayrı şeyler

**Hangi model çalışacak** sorusunun cevabı panelden gelir, **anahtarı kim
veriyor** sorusununki tarayıcıdan ya da sunucudan:

- Paneli bir kez kaydettikten sonra seçtiğin sağlayıcı ve model, o tarayıcının
  varsayılanıdır. Sekmeyi, sunucuyu, bilgisayarı kapatsan da kalır; paneli
  açıp değiştirdiğinde yeni seçim varsayılan olur. Başka tarayıcıda, başka
  profilde veya gizli sekmede yeniden seçersin.
- Anahtar alanını doldurursan istek o anahtarla gider; boş bırakırsan sunucu
  `.env.local` içinde o sağlayıcı için tanımlı anahtarı kullanır ve anahtar
  tarayıcıya hiç inmez. Panel bunu ayrıca belirtmez — sessizce çalışır.
- Seçtiğin sağlayıcının anahtarı ne panelde ne sunucudaysa uygulama bunu soru
  sorduğunda söyler.

Yani `.env.local` yalnızca bir anahtar deposudur; hangi modeli kullanacağını hep
panelden değiştirebilirsin. Panel hiç açılmadıysa `.env.local`'daki sağlayıcı ve
`LLM_MODEL` (ya da o sağlayıcının varsayılan modeli) kullanılır.

### Model isimleri hakkında

Model alanı serbesttir: anahtarının çözebildiği herhangi bir kimlik çalışır.
Panelde birkaç öneri düşer ama liste kapalı değil, elle yazdığın kimlik
kullanılır.

Boş bırakırsan varsayılanlar devreye girer: Anthropic `claude-sonnet-5`, OpenAI
`gpt-5.1`, Gemini `gemini-pro-latest`. Google tarihli Gemini kimliklerini yeni
anahtarlara hızla kapatıyor (bütün `gemini-2.x` hattı gitti), o yüzden Gemini
tarafında dönen alias kullanılıyor. Bir kimlik çözülmezse panele güncel bir
kimlik yazman yeterli.

## Kaynak gösterimi sağlayıcıya göre değişir

| Sağlayıcı | PDF girişi | Alıntı |
|-----------|------------|--------|
| Anthropic | Files API | **yapısal** — sayfa + birebir alıntı doğrudan Citations API'den gelir |
| OpenAI | `input_file` | model her cümleden sonra `[[cite:page=N\|alıntı]]` işareti üretir; tarayıcı alıntıyı gerçek PDF metniyle karşılaştırıp sayfayı düzeltir ya da düşürür |
| Gemini | doküman girişi | OpenAI ile aynı prompt sözleşmesi + tarayıcı doğrulaması |

OpenAI ve Gemini'de alıntı PDF metninde bulunamazsa kaynak **sayfasız** (sadece
"kaynak", dosya seviyesinde) gösterilir. Uydurma sayfa numarası üretilmez —
bulunamamış olması dürüst sonuçtur. API tarafından doğrulanmış sayfa numarasını
yalnızca Anthropic verir.

## Sınırlar

- **PDF başına 100 MB.** Dosya tek istekte belleğe alınıp sağlayıcıya
  aktarıldığı için uygulamanın kendi sınırı bu; sağlayıcı tavanları farklı
  (Anthropic 500 MB, OpenAI 512 MB, Gemini 50 MB / 1000 sayfa). Gerçek
  datasheet'ler birkaç MB.
- Arayüzde aynı anda **2 datasheet** (karşılaştırma için); API'nin kendi tavanı
  istek başına 5 dosya. Soru başına 4000 karakter.
- IP başına dakikada 10 yükleme / 20 sohbet isteği (bellek içi sayaç).

## Test

Gerçek bir datasheet (NE555) üzerinde uçtan uca kabul testi:

```bash
npm run dev                                   # ayrı terminalde
npm test                                      # .env.local'daki sağlayıcıyla
PROVIDER=gemini LLM_API_KEY=... npm test      # ya da istediğin sağlayıcıyla
```

`npm test` gerçek sağlayıcıya gider ve token harcar. Doğrulanmış cevap anahtarı
Anthropic ile hazırlandı; diğer sağlayıcılarda sayfa doğrulaması tarayıcıda
çalıştığı için iddia "bir kaynak üretildi"ye gevşer. Ayrıntı:
`scripts/test-qa.md`.

Diğer komutlar:

```bash
npm run lint      # eslint — temiz geçmeli
npm run build     # üretim derlemesi
npm start         # derlenmiş sürümü çalıştır
```

## Başkalarına açacaksan

Uygulamada **giriş yok**; tek koruma IP başına bellek içi sayaç. `localhost`
için doğru takas, açık bir URL için değil: adresi bulan herkes senin API
bütçeni harcayabilir. Public'e koyacaksan önüne kendi kimlik doğrulamanı koy ve
sağlayıcı konsolunda harcama limiti tanımla.

## Mimari

```
Tarayıcı ──▶ /api/upload   PDF ──▶ sağlayıcı Files API ──▶ opak dosya kimliği
         ──▶ /api/chat     soru + dosya kimliği ──▶ model akışı
                           ──▶ SSE (text / citation / done / error)
```

```
app/api/chat/route.ts        SSE akışı, sağlayıcıdan bağımsız
app/api/upload/route.ts      PDF -> sağlayıcı Files API
app/api/config/route.ts      sunucuda anahtar var mı (anahtarın kendisi değil)
lib/llm/                     sağlayıcı adaptörleri + registry
lib/llm/citation-contract.ts satır içi alıntı işareti ve akış ayrıştırıcısı
lib/citations/verify.ts      alıntı -> gerçek sayfa metni doğrulaması (tarayıcı)
lib/pdf/highlight.ts         alıntılanan cümlenin sayfadaki konumu
lib/prompts.ts               datasheet sistem promptu
components/                  arayüz; components/pdf/ PDF paneli ve pdf.js
```

Yeni sağlayıcı eklemek: `lib/llm/` altına bir adaptör dosyası, `ADAPTERS` ve
`PROVIDER_META` içine birer satır. Route'lar, SSE protokolü ve arayüz değişmez.

## Lisans

MIT — bkz. [LICENSE](LICENSE).
