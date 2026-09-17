# AFAD Deprem Takip & MongoDB Servisi

AFAD'ın son depremler servisi (`GetEventsByFilter`) üzerinden verileri periyodik olarak çeken, mükerrer kayıtları engelleyerek MongoDB'ye kaydeden ve Docker Compose ile çalışan Node.js servisi.

## Özellikler

- **Otomatik Senkronizasyon:** Belirtilen aralıklarla (varsayılan 2 dakika) AFAD'dan güncel depremleri çeker.
- **Mükerrer Kayıt Engelleme (Deduplication):** AFAD deprem `id` alanı üzerinde veritabanı seviyesinde `unique` indeks ve `$setOnInsert` tabanlı `bulkWrite` kullanımı ile aynı depremin tekrar yazılması engellenir.
- **Docker Desteği:** `docker-compose.yml` ile MongoDB ve Node.js uygulaması tek komutla ayağa kaldırılır.
- **Web Paneli:** Veritabanındaki depremleri, toplam kayıt sayısını ve senkronizasyon durumunu gösteren modern kullanıcı arayüzü.
- **REST API:** Deprem verilerini JSON olarak sorgulama ve manuel senkronizasyon tetikleme desteği.

## Kurulum ve Çalıştırma

### Docker ile (Önerilen)

```bash
docker compose up -d --build
```

Konteynerler ayağa kalktıktan sonra:
- **Web Arayüzü:** [http://localhost:3000](http://localhost:3000)
- **API Endpoint:** [http://localhost:3000/api/earthquakes](http://localhost:3000/api/earthquakes)

### Yerel Ortamda Çalıştırma

```bash
npm install
npm start
```

## API Uç Noktaları

- `GET /`: Web kontrol paneli (HTML)
- `GET /api/earthquakes?limit=45`: Kaydedilmiş depremleri JSON olarak listeler.
- `POST /api/sync`: AFAD'dan anlık manuel senkronizasyon tetikler.
- `GET /health`: Uygulama sağlık kontrolü (Healthcheck)

## Çevre Değişkenleri (.env)

| Değişken | Varsayılan Değer | Açıklama |
|---|---|---|
| `PORT` | `3000` | Web sunucusu portu |
| `MONGO_URI` | `mongodb://mongo:27017/deprem_db` | MongoDB bağlantı adresi |
| `SYNC_INTERVAL_MINUTES` | `2` | Otomatik çekilme sıklığı (dakika) |
| `FETCH_COUNT` | `45` | Her istekte çekilecek kayıt adedi |
