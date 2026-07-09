# Test Protokolü — NE555 (TI SLFS022K)

Test datasheet: `scripts/testdata/ne555.pdf` (TI xx555 Precision Timers, 39 sayfa).
Cevap anahtarı PDF'ten (pypdf ile) doğrulanarak çıkarıldı. Sayfa no'ları PDF içi
gerçek sayfalar (1-indexed).

## Geçme kriteri
- Beklenen değerler cevapta doğru (birim + koşul + min/typ/max dahil)
- Her sayısal cevapta doğru sayfaya işaret eden en az bir citation
- Tuzak soruda "datasheet'te yok / belirtilmemiş" cevabı — uydurma YOK
- Varyant sorusunda doğru varyant ayrımı (NE555 vs SE555)

## Cevap anahtarı (doğrulanmış)

| # | Soru | Beklenen (kaynak sayfa) |
|---|------|--------------------------|
| 1 | Absolute max VCC? | 18 V (s.4, Absolute Maximum Ratings) |
| 2 | Absolute max output current? | ±225 mA (s.4) |
| 3 | Storage temperature aralığı? | –65 to 150 °C (s.4) |
| 4 | Recommended VCC aralığı (NE555)? | 4.5–16 V; SE555 4.5–18 V (s.4) |
| 5 | NE555 çalışma sıcaklığı (TA)? | 0–70 °C (s.4). NA555 –40–105, SA555 –40–85, SE555 –55–125 |
| 6 | Output current (recommended)? | ±200 mA (s.4) |
| 7 | Pin 2 nedir? / TRIG hangi pin? | Pin 2 = TRIG (s.3) |
| 8 | VCC hangi pin? | Pin 8 (s.3) |
| 9 | Supply current, çıkış low, VCC=15V (NE555)? | typ 10 mA, max 15 mA (s.6) |
| 10 | Output rise time (tr)? | typ 100 ns, max 300 ns (NA/NE/SA); SE555 max 200 ns; @ CL=15pF, 20–80% (s.7) |
| 11 | Timing temp coefficient (SE555 monostable)? | typ 30, max 100 ppm/°C (s.7) |
| 12 | Low-level output voltage @ VCC=5V, IOL=8mA (NE555)? | typ 0.15 V, max 0.4 V (s.6) |
| 13 | ESD HBM rating? | ±500 V (s.4) |
| 14 | **TUZAK:** SPI arayüzü / I2C adresi / dahili ADC çözünürlüğü? | Datasheet'te yok — NE555 timer, dijital arayüzü yok. Model "yok" demeli, uydurmamalı |
| 15 | **VARYANT:** NE555 ve SE555 max VCC farkı? | NE555=16V, SE555=18V (s.3/s.4) — ayrım net olmalı |
| 16 | **UYUMLULUK:** 3.3V sistemle çalışır mı? | VCC min 4.5V (s.4) → 3.3V beslemeyle çalışMAZ; net hayır + gerekçe |

## Sonuç kaydı

(otomatik harness `scripts/run-test.mjs` çıktısı buraya yapıştırılır)
