# AFAD Deprem Takip & MongoDB REST API

AFAD'ın son depremler servisi (`GetEventsByFilter`) üzerinden verileri periyodik olarak çeken, mükerrer kayıtları engelleyerek MongoDB'ye kaydeden ve uygulamalarınızda tüketebilmeniz için gelişmiş filtrelemeli REST API sunan Docker tabanlı servis.

## Özellikler

- **Otomatik Senkronizasyon:** Belirtilen aralıklarla (varsayılan 2 dakika) AFAD'dan güncel depremleri çeker.
- **Mükerrer Kayıt Engelleme (Deduplication):** AFAD `id` alanı üzerinde veritabanı seviyesinde `unique` indeks ve `$setOnInsert` ile aynı depremin tekrar yazılması engellenir.
- **Gelişmiş REST API:**
  - **Şehir / İlçe Filtreleme:** Türkçe karakter duyarsız arama (`?city=Malatya`, `?city=İzmir`).
  - **Sayfalama & Limit:** `page`, `limit` parametreleri ve detaylı pagination metadata.
  - **Konumsal (Geospatial) Arama:** GPS koordinatına göre yarıçap filtreleme ve yakındakileri mesafe hesabıyla (`distanceKm`) listeleme.
  - **Büyüklük & Derinlik & Tarih Filtreleri:** `minMag`, `maxMag`, `minDepth`, `startDate`, `endDate`.
  - **Şehir ve İstatistik API'leri:** Veritabanındaki şehirlerin deprem sayıları ve özet analizler.
- **Docker Desteği:** `docker-compose.yml` ile tek komutta ayağa kalkar.
- **Modern Web Kontrol Paneli:** Veritabanındaki kayıtları anlık arama/filtreleme imkanı.

---

## Kurulum ve Çalıştırma

### Docker ile (Önerilen)

```bash
docker compose up -d --build
```

Konteynerler ayağa kalktıktan sonra:
- **Web Kontrol Paneli:** [http://localhost:3000](http://localhost:3000)
- **Ana API:** [http://localhost:3000/api/earthquakes](http://localhost:3000/api/earthquakes)

---

## API Uç Noktaları ve Kullanım

### 1. Genel Deprem Listesi ve Filtreleme (`GET /api/earthquakes`)

| Parametre | Tip | Varsayılan | Açıklama |
|---|---|---|---|
| `page` | number | `1` | Sayfa numarası |
| `limit` | number | `20` | Sayfa başına kayıt (Maks: 100) |
| `city` | string | - | Şehir / ilçe / bölge adı (Ör: `Malatya`, `İzmir`, `Ege`) |
| `minMag` | number | - | Minimum büyüklük (Ör: `2.5`) |
| `maxMag` | number | - | Maksimum büyüklük (Ör: `5.0`) |
| `minDepth` | number | - | Minimum derinlik (km) |
| `maxDepth` | number | - | Maksimum derinlik (km) |
| `startDate` | string | - | Başlangıç tarihi (YYYY-MM-DD veya ISO) |
| `endDate` | string | - | Bitiş tarihi |
| `lat`, `lng` | number | - | GPS koordinatı (Enlem ve Boylam) |
| `radiusKm` | number | - | Koordinat etrafındaki arama yarıçapı (km) |
| `sort` | string | `desc` | Sıralama yönü (`desc` veya `asc`) |
| `sortBy` | string | `eventDate` | Sıralanacak alan (`eventDate`, `magnitude`, `depth`) |

#### Örnek İstekler:
```bash
# Son 10 deprem
curl "http://localhost:3000/api/earthquakes?limit=10"

# Malatya'daki depremler (Sayfa 1, 10 kayıt)
curl "http://localhost:3000/api/earthquakes?city=Malatya&limit=10&page=1"

# Büyüklüğü 3.0 ve üzeri olanlar
curl "http://localhost:3000/api/earthquakes?minMag=3.0"

# Belirli bir koordinatın 50 km çevresi
curl "http://localhost:3000/api/earthquakes?lat=38.4&lng=27.1&radiusKm=50"
```

#### Örnek JSON Yanıtı:
```json
{
  "success": true,
  "pagination": {
    "total": 48,
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "filters": {
    "city": "Malatya",
    "minMag": null,
    "maxMag": null,
    "lat": null,
    "lng": null,
    "radiusKm": null
  },
  "data": [
    {
      "id": 593740,
      "eventDate": "2026-09-17T09:12:30.000Z",
      "magnitude": 2.8,
      "magnitudeType": "ML",
      "depth": 7.0,
      "location": "Pütürge (Malatya)",
      "latitude": 38.254,
      "longitude": 38.865,
      "distanceKm": 12.4
    }
  ]
}
```

---

### 2. GPS Konumuna En Yakın Depremler (`GET /api/earthquakes/nearby`)

Verilen enlem ve boylama göre MongoDB `2dsphere` indeksi ve `$geoNear` kullanarak mesafeye göre sıralı getirir:

```bash
curl "http://localhost:3000/api/earthquakes/nearby?lat=38.4237&lng=27.1428&radiusKm=100&limit=10"
```

Yanıt içinde her depremin verilen noktaya olan uzaklığı `distanceKm` olarak yer alır:
```json
{
  "success": true,
  "origin": { "lat": 38.4237, "lng": 27.1428 },
  "radiusKm": 100,
  "count": 5,
  "data": [
    {
      "id": 593697,
      "eventDate": "2026-09-16T18:56:55.000Z",
      "magnitude": 1.1,
      "location": "Ege Denizi - [21.20 km] Söke (Aydın)",
      "latitude": 37.6498,
      "longitude": 26.9415,
      "distanceKm": 88.3
    }
  ]
}
```

---

### 3. Şehir Dağılımı (`GET /api/earthquakes/cities`)

Veritabanında kayıtlı şehirleri ve her şehirde kaç deprem kaydedildiğini döner:

```bash
curl "http://localhost:3000/api/earthquakes/cities"
```

```json
{
  "success": true,
  "totalCities": 18,
  "data": [
    { "city": "Malatya", "count": 12 },
    { "city": "Muğla", "count": 8 },
    { "city": "İzmir", "count": 5 }
  ]
}
```

---

### 4. İstatistikler (`GET /api/earthquakes/stats`)

```bash
curl "http://localhost:3000/api/earthquakes/stats"
```

```json
{
  "success": true,
  "total": 48,
  "last24hCount": 35,
  "latest": { "id": 593754, "magnitude": 2.9, "location": "Ege Denizi" },
  "max": { "id": 593710, "magnitude": 4.1, "location": "Akdeniz" },
  "magnitudeDistribution": [
    { "_id": 0, "count": 22 },
    { "_id": 2, "count": 19 },
    { "_id": 3, "count": 6 },
    { "_id": 4, "count": 1 }
  ]
}
```

---

### 5. Tekil Deprem Detayı (`GET /api/earthquakes/:id`)

```bash
curl "http://localhost:3000/api/earthquakes/593697"
```

---

## Çevre Değişkenleri (.env)

| Değişken | Varsayılan Değer | Açıklama |
|---|---|---|
| `PORT` | `3000` | Web ve API sunucusu portu |
| `MONGO_URI` | `mongodb://mongo:27017/deprem_db` | MongoDB bağlantı URL'i |
| `SYNC_INTERVAL_MINUTES` | `2` | Senkronizasyon aralığı (dakika) |
| `FETCH_COUNT` | `45` | Her senkronda çekilecek kayıt sayısı |
