# AWS Durum Paneli — Netlify Versiyonu

DownDetector + AWS'nin resmi durum feed'ini her 5 dakikada bir kontrol edip
çapraz doğrulayan, ntfy.sh ile bildirim atan ve sonucu canlı bir web
panelinde gösteren proje.

## Nasıl deploy edilir

### 1) GitHub'a yükle (önerilen yol)
```bash
git init
git add .
git commit -m "ilk kurulum"
```
Sonra bunu bir GitHub reposuna push et.

### 2) Netlify'da site oluştur
1. https://app.netlify.com adresine git, "Add new site" → "Import an existing project"
2. GitHub reponu seç
3. Build ayarları otomatik `netlify.toml`'dan okunur (publish: `public`, functions: `netlify/functions`) — değiştirmene gerek yok
4. Deploy'a bas

### 3) Netlify Blobs'u aktif et
Netlify Blobs, sitenle birlikte otomatik olarak aktif olur (ekstra kurulum
gerekmez). Fonksiyonlar `getStore("aws-status")` çağırdığında otomatik
oluşur.

### 4) ntfy topic'ini kontrol et
`netlify/functions/check-status.mts` içinde şu satır zaten senin topic'ine
ayarlı:
```ts
const NTFY_TOPIC = "aws-alerts-letanom-kevino007";
```
Telefonunda ntfy uygulamasında bu topic'e abone olduğundan emin ol.

### 4.5) Google Chat webhook'unu ekle
`check-status.mts` artık bir de Google Chat space'ine alert atıyor
(selector parse hatası, checker crash olursa, ve AWS durum değişikliklerinde).
Webhook URL'i **koda yazma** — içinde gizli bir `key` ve `token` var, repo
public olduğu için herkes görebilir. Onun yerine Netlify environment
variable olarak ekle:

1. Netlify dashboard → Site configuration → Environment variables → "Add a variable"
2. Key: `GOOGLE_CHAT_WEBHOOK_URL`
3. Value: Google Chat'te "Apps & integrations" → "Webhooks" üzerinden aldığın tam URL
   (`https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=...` formatında)
4. Kaydet ve siteyi yeniden deploy et (env var değişiklikleri yeni deploy ister)

Yerelde test edeceksen `netlify link` sonrası:
```bash
netlify env:set GOOGLE_CHAT_WEBHOOK_URL "https://chat.googleapis.com/v1/spaces/AAA.../messages?key=...&token=..."
```

### 5) Test et
Deploy bittikten sonra:
- Panel: `https://SITEN.netlify.app/`
- Ham veri: `https://SITEN.netlify.app/api/status`
- Scheduled function'ı elle tetiklemek için Netlify CLI kullanabilirsin:
  ```bash
  npm install -g netlify-cli
  netlify login
  netlify link
  netlify functions:invoke check-status
  ```

### 6) Otomatik çalışma
`check-status.mts` içindeki:
```ts
export const config: Config = {
  schedule: "*/5 * * * *",
};
```
satırı sayesinde Netlify bu fonksiyonu **deploy sonrası otomatik olarak her
5 dakikada bir** çalıştırır. Senin bilgisayarının açık olması, cron
kurman ya da bir şey çalıştırman gerekmiyor — tamamen Netlify'ın sunucusunda
çalışır.

## Yerelde test etmek istersen
```bash
npm install
npm install -g netlify-cli
netlify dev
```
Not: `netlify dev` scheduled function'ı otomatik zamanlamaz, sadece
`netlify functions:invoke check-status` ile elle tetikleyebilirsin.

## Dosya yapısı
```
netlify.toml                        -> Netlify build/functions ayarları
netlify/functions/check-status.mts  -> 5 dakikada bir çalışan kontrol fonksiyonu
netlify/functions/get-status.mts    -> panelin okuduğu /api/status endpoint'i
public/index.html                   -> canlı panel (client-side fetch ile güncellenir)
```

## Notlar
- DownDetector CSS class isimlerini otomatik/hash'li üretiyor, bu yüzden
  `selectorCandidates` listesi zaman zaman kırılabilir. Artık bu durumda
  (status "UNKNOWN - could not parse page" olduğunda) sessizce geçmiyor,
  hem ntfy hem Google Chat'e bir kere alert atıyor (her 5 dakikada tekrar
  spam yapmıyor, sadece durum değiştiğinde). Alert gelirse canlı sayfayı
  inceleyip `selectorCandidates`'i güncellemen gerekir.
- Checker fonksiyonu bir istisna/network hatasıyla tamamen çökerse de artık
  bir "🚨 AWS Status Checker Crashed" alert'i geliyor — önceden bu tamamen
  sessiz kalıyordu.
- Netlify'ın ücretsiz planında Scheduled Functions kullanılabilir; kullanım
  limitlerini Netlify'ın güncel fiyatlandırma sayfasından kontrol et.
