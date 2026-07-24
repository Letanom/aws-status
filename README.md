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
- DownDetector'ın HTML yapısı değişirse `check-status.mts` içindeki
  `selectorCandidates` listesini güncellemen gerekebilir.
- Netlify'ın ücretsiz planında Scheduled Functions kullanılabilir; kullanım
  limitlerini Netlify'ın güncel fiyatlandırma sayfasından kontrol et.
