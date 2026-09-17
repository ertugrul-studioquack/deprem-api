require('dotenv').config();
const express = require('express');
const { connectDB } = require('./db');
const Earthquake = require('./models/Earthquake');
const { syncEarthquakes, getLastSyncStatus, migrateMissingGeo } = require('./services/syncService');
const earthquakeRoutes = require('./routes/earthquakeRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
const SYNC_INTERVAL_MINUTES = parseInt(process.env.SYNC_INTERVAL_MINUTES || '2', 10);
const FETCH_COUNT = parseInt(process.env.FETCH_COUNT || '45', 10);

app.use(express.json());

// API Rotaları
app.use('/api/earthquakes', earthquakeRoutes);

// Manuel senkronizasyon tetikleme ucu
app.post('/api/sync', async (req, res) => {
  try {
    const count = parseInt(req.body.count || `${FETCH_COUNT}`, 10);
    const result = await syncEarthquakes(count);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sağlık kontrolü
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// HTML Kontrol Paneli (Arama & Filtreleme Destekli)
app.get('/', async (req, res) => {
  try {
    const cityFilter = req.query.city || '';
    const limitFilter = Math.min(100, Math.max(1, parseInt(req.query.limit || '45', 10)));
    const minMagFilter = parseFloat(req.query.minMag) || 0;

    const query = {};
    if (cityFilter) {
      query.location = { $regex: new RegExp(cityFilter, 'i') };
    }
    if (minMagFilter > 0) {
      query.magnitude = { $gte: minMagFilter };
    }

    const totalInDb = await Earthquake.countDocuments();
    const filteredCount = await Earthquake.countDocuments(query);
    const list = await Earthquake.find(query)
      .sort({ eventDate: -1 })
      .limit(limitFilter)
      .lean();

    const syncStatus = getLastSyncStatus();
    const lastSyncText = syncStatus.lastRun
      ? `${new Date(syncStatus.lastRun).toLocaleString('tr-TR')} (Yeni: ${syncStatus.inserted}, Atlanan: ${syncStatus.skipped})`
      : 'Henüz yapılmadı';

    const rows = list
      .map(
        (e, index) => `
      <tr>
        <td style="color:#64748b; font-weight: 500;">${index + 1}</td>
        <td>${new Date(e.eventDate).toLocaleString('tr-TR')}</td>
        <td>
          <span style="display:inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; background: ${
            e.magnitude >= 4 ? '#fee2e2' : '#f1f5f9'
          }; color: ${e.magnitude >= 4 ? '#b91c1c' : '#0f172a'};">
            ${e.magnitude.toFixed(1)} ${e.magnitudeType || ''}
          </span>
        </td>
        <td>${e.depth} km</td>
        <td><strong>${e.location}</strong></td>
        <td style="font-family: monospace; font-size: 13px; color: #475569;">${e.latitude}, ${e.longitude}</td>
        <td style="color:#94a3b8; font-size: 12px;">${e.id}</td>
      </tr>
    `
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AFAD Deprem Takip & API Paneli</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; background: #f8fafc; color: #1e293b; margin: 0; }
    .container { max-width: 1100px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 20px; gap: 12px; }
    h1 { margin: 0; font-size: 24px; color: #0f172a; }
    .stats-bar { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .stat-card { background: #fff; padding: 14px 18px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex: 1; min-width: 180px; }
    .stat-card .label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
    .stat-card .value { font-size: 18px; font-weight: 700; color: #0f172a; }
    .filter-card { background: #fff; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .filter-card input, .filter-card select { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; }
    .btn { background: #2563eb; color: #fff; border: none; padding: 9px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; font-size: 14px; }
    .btn:hover { background: #1d4ed8; }
    .btn-secondary { background: #e2e8f0; color: #334155; }
    .btn-secondary:hover { background: #cbd5e1; }
    .api-links { margin-bottom: 16px; font-size: 13px; color: #64748b; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .api-badge { background: #e0e7ff; color: #3730a3; padding: 4px 10px; border-radius: 9999px; text-decoration: none; font-family: monospace; font-size: 12px; font-weight: 600; }
    .table-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th, td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    th { background: #0f172a; color: #f8fafc; font-weight: 600; text-transform: uppercase; font-size: 12px; }
    tr:hover { background-color: #f8fafc; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>AFAD Deprem Takip & API Paneli</h1>
        <div style="color: #64748b; font-size: 14px; margin-top: 4px;">MongoDB Entegrasyonlu & Şehir/Limit/Konum Filtreli API Servisi</div>
      </div>
      <div>
        <button class="btn" onclick="triggerSync()">Şimdi Senkronize Et</button>
      </div>
    </div>

    <div class="stats-bar">
      <div class="stat-card">
        <div class="label">Toplam Kayıt (DB)</div>
        <div class="value">${totalInDb} adet</div>
      </div>
      <div class="stat-card">
        <div class="label">Listelenen / Eşleşen</div>
        <div class="value">${list.length} / ${filteredCount} adet</div>
      </div>
      <div class="stat-card">
        <div class="label">Otomatik Senkron</div>
        <div class="value">Her ${SYNC_INTERVAL_MINUTES} dk</div>
      </div>
      <div class="stat-card">
        <div class="label">Son Senkronizasyon</div>
        <div class="value" style="font-size: 13px; font-weight: 500;">${lastSyncText}</div>
      </div>
    </div>

    <form method="GET" action="/" class="filter-card">
      <strong style="font-size: 14px;">Filtrele:</strong>
      <input type="text" name="city" placeholder="Şehir / İlçe ara (ör. Malatya)" value="${cityFilter}">
      <select name="limit">
        <option value="20" ${limitFilter === 20 ? 'selected' : ''}>Limit: 20</option>
        <option value="45" ${limitFilter === 45 ? 'selected' : ''}>Limit: 45</option>
        <option value="100" ${limitFilter === 100 ? 'selected' : ''}>Limit: 100</option>
      </select>
      <select name="minMag">
        <option value="0" ${minMagFilter === 0 ? 'selected' : ''}>Tüm Büyüklükler</option>
        <option value="2" ${minMagFilter === 2 ? 'selected' : ''}>M ≥ 2.0</option>
        <option value="3" ${minMagFilter === 3 ? 'selected' : ''}>M ≥ 3.0</option>
        <option value="4" ${minMagFilter === 4 ? 'selected' : ''}>M ≥ 4.0</option>
      </select>
      <button type="submit" class="btn">Uygula</button>
      ${cityFilter || minMagFilter > 0 ? '<a href="/" class="btn btn-secondary">Temizle</a>' : ''}
    </form>

    <div class="api-links">
      <span><strong>Hızlı API Testleri:</strong></span>
      <a class="api-badge" href="/api/earthquakes" target="_blank">GET /api/earthquakes</a>
      <a class="api-badge" href="/api/earthquakes?city=Malatya&limit=5" target="_blank">?city=Malatya</a>
      <a class="api-badge" href="/api/earthquakes/nearby?lat=38.4&lng=27.1&radiusKm=100" target="_blank">/nearby?lat=38.4&lng=27.1</a>
      <a class="api-badge" href="/api/earthquakes/cities" target="_blank">/cities</a>
      <a class="api-badge" href="/api/earthquakes/stats" target="_blank">/stats</a>
    </div>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Tarih / Saat</th>
            <th>Büyüklük</th>
            <th>Derinlik</th>
            <th>Yer</th>
            <th>Koordinat</th>
            <th>AFAD ID</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="7" style="text-align:center; padding: 30px;">Kayıt bulunamadı.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    async function triggerSync() {
      const btn = document.querySelector('.header .btn');
      btn.innerText = 'Çekiliyor...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/sync', { method: 'POST' });
        const data = await res.json();
        alert('Senkronizasyon tamamlandı!\\nYeni Eklenen: ' + data.inserted + '\\nAtlanan (Mevcut): ' + data.skipped);
        window.location.reload();
      } catch(e) {
        alert('Hata: ' + e.message);
      } finally {
        btn.innerText = 'Şimdi Senkronize Et';
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (err) {
    res.status(500).send('Hata: ' + err.message);
  }
});

// Başlatma
async function start() {
  await connectDB();
  await migrateMissingGeo();

  app.listen(PORT, () => {
    console.log(`[APP] Sunucu çalışıyor: http://localhost:${PORT}`);
  });

  await syncEarthquakes(FETCH_COUNT);

  const intervalMs = SYNC_INTERVAL_MINUTES * 60 * 1000;
  console.log(`[SCHEDULER] Otomatik senkronizasyon kuruldu: Her ${SYNC_INTERVAL_MINUTES} dakikada bir çalışacak.`);
  setInterval(() => {
    syncEarthquakes(FETCH_COUNT).catch(err => {
      console.error('[SCHEDULER] Periyodik senkronizasyon hatası:', err.message);
    });
  }, intervalMs);
}

start().catch(err => {
  console.error('[FATAL] Uygulama başlatılamadı:', err);
  process.exit(1);
});
