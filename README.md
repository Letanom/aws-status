# AWS Durum Paneli

AWS'nin resmi durum akışını, canlı bölge sondalarını ve kullanıcı raporlarını (DownDetector) karşılaştırıp tek bir karar üreten bağımsız durum paneli. Netlify üzerinde çalışır, sunucu yönetmen gerekmez.

## Ne yapar

- **Karar özeti:** Sorun yok, Dikkat, Performans sorunu, Kesinti ya da Doğrulanamıyor. Kararın nedenleri hemen altında yazar.
- **Bölge ve servis tablosu:** Hangi servisin hangi bölgede etkilendiği tek bakışta görünür. Hücreye tıklayınca olaylar süzülür.
- **İzleme listesi:** Sadece kendi bölge ve servislerini seç. Seçim bağlantıya yansır (`?r=eu-central-1&s=eks,rds&mine=1`), paylaşılabilir.
- **Olaylar ve geçmiş:** Aynı olayın güncellemeleri tek kayıtta toplanır. Arama ve süzme vardır.
- **Canlı sondalar:** Her kontrolde AWS uç noktalarına gerçek istek atılır, gecikme ve hata ölçülür.
- **Son 24 saat grafiği ve 90 günlük çubuklar.**
- **"Veri nereden geliyor, ne kadar güvenilir?" bölümü:** Her kaynağın ne ölçtüğü, nasıl çekildiği, ne sıklıkta güncellendiği, sınırı ve şu anki durumu yazar.
- **Bildirim:** ntfy, Google Chat ya da genel webhook. Tarayıcı bildirimi de açılabilir.
- Türkçe ve İngilizce, açık ve koyu tema, mobil uyumlu.

## Güvenilirlik nasıl sağlanıyor

| Kaynak | Güven | Neden |
|---|---|---|
| AWS resmi durum akışı | Yüksek | AWS'nin kendi bildirimi. Bazen geç gelir. |
| Canlı sondalar | Orta-yüksek | Gerçek istek. Ama Netlify sunucusundan ölçer, senin ağından değil. |
| DownDetector | Düşük | Kalabalık raporu. Tek başına en fazla "Dikkat" üretir. |

- Tek başarısız sonda gürültü sayılır. Art arda **iki** kontrolde başarısız olursa sorun kabul edilir.
- Bütün sondalar aynı anda başarısız olursa suç bizim çıkış ağımızdadır: bölge bildirimi gönderilmez, en fazla "Dikkat" gösterilir.
- AWS akışı okunamazsa sayfa yeşil göstermez, "Doğrulanamıyor" der.
- İlk çalıştırmada mevcut olaylar için bildirim gönderilmez.
- Bir olay için yalnızca ilk görülme, kötüleşme ve çözülmede bildirim gider. Hiçbir kanala ulaşılamazsa bir sonraki kontrolde yeniden denenir.
- Kontrol 15 dakikadan uzun süre çalışmazsa sayfanın üstünde uyarı çıkar. Dış izleme için `/api/health` kullanılabilir (bayatsa 503 döner).

## Kurulum

1. Bu klasörü GitHub'a gönder.
2. Netlify'da **Add new site > Import an existing project** ile repo'yu seç. Ayarları `netlify.toml` zaten içeriyor.
3. Netlify Blobs sitede otomatik etkindir, ek ayar gerekmez.
4. Bildirim istiyorsan `.env.example` içindeki değişkenlerden istediklerini Netlify'da tanımla.
5. İlk ziyarette ilk kontrol anında yapılır, sonra her 5 dakikada bir kendiliğinden çalışır.

> Zamanlanmış fonksiyonlar yalnızca yayındaki (production) sürümde çalışır. Netlify'ın ücretsiz plan limitlerini fiyat sayfasından kontrol et.

## Yerelde çalıştırma ve test

```bash
npm install
npm test          # backend ve ön yüz testleri (Node 22.18+)
npm run typecheck
npx netlify dev   # yerel geliştirme (zamanlama kendiliğinden tetiklenmez)
npx netlify functions:invoke check-status   # kontrolü elle çalıştır
```

Testler gerçek ağa çıkmaz. AWS akışı, sondalar ve DownDetector sahte yanıtlarla denenir. Ön yüz jsdom içinde gerçek bir snapshot ile çizdirilir.

## Uç noktalar

- `GET /api/status`: panelin okuduğu tam anlık görüntü
- `GET /api/health`: veri tazeyse 200, bayatsa 503

## Yapı

```
netlify/functions/check-status.mts   zamanlanmış kontrol (her 5 dk)
netlify/functions/get-status.mts     /api/status ve /api/health
netlify/lib/aws.ts                   RSS çözümleme, olay gruplama
netlify/lib/probes.ts                canlı sondalar
netlify/lib/downdetector.ts          DownDetector okuma
netlify/lib/status.ts                çapraz doğrulama ve genel karar
netlify/lib/alerts.ts                hangi bildirimlerin gideceği
netlify/lib/notify.ts                ntfy, Google Chat, webhook gönderimi
netlify/lib/check.ts                 tüm akışı yöneten ana işlev
public/                              ön yüz (index.html, app.js, styles.css)
```

## Bakım notları

- DownDetector sayfayı değiştirir ya da bot koruması gösterirse durum "okunamadı" olur. Panel bunu açıkça gösterir ve karar bu yüzden bozulmaz.
- `DOWNDETECTOR=off` ile bu kaynak tamamen kapatılabilir.
- Resmi akış yalnızca olay başlıklarını verir. Hesabına özel olaylar için AWS Health API (Business/Enterprise Support gerekir) ayrıca kullanılabilir.
