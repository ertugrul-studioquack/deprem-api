require('dotenv').config();
const express = require('express');
const { connectDB } = require('./db');
const Earthquake = require('./models/Earthquake');
const { syncEarthquakes, getLastSyncStatus } = require('./services/syncService');

const app = express();
const PORT = process.env.PORT || 3000;
const SYNC_INTERVAL_MINUTES = parseInt(process.env.SYNC_INTERVAL_MINUTES || '2', 10);
const FETCH_COUNT = parseInt(process.env.FETCH_COUNT || '45', 10);

app.use(express.json());

// HTML Ana Sayfası: Veritabanındaki depremleri listeler
app.get('/', async (req, res) => {
  try {
    const totalInDb = await Earthquake.countDocuments();
    const latestList = await Earthquake.find()
      .sort({ eventDate: -1 })
      .limit(FETCH_COUNT)
      .lean();

    const syncStatus = getLastSyncStatus();
    const lastSyncText = syncStatus.lastRun
      ? `${new Date(syncStatus.lastRun).toLocaleString('tr-TR')} (Yeni: ${syncStatus.inserted}, Atlanan/Mevcut: ${syncStatus.skipped})`
      : 'Henüz yapılmadı';

    const rows = latestList
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
        <td style="color:#94a3b8; font-size: 12px;">ID: ${e.id}</td>
      </tr>
    `
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AFAD Deprem Takip & MongoDB</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; background: #f8fafc; color: #1e293b; margin: 0; }
    .container { max-width: 1100px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 20px; gap: 12px; }
    h1 { margin: 0; font-size: 24px; color: #0f172a; }
    .stats-bar { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .stat-card { background: #fff; padding: 14px 18px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex: 1; min-width: 200px; }
    .stat-card .label { font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
    .stat-card .value { font-size: 18px; font-weight: 700; color: #0f172a; }
    .btn { background: #2563eb; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; font-size: 14px; }
    .btn:hover { background: #1d4ed8; }
    .table-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th, td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    th { background: #0f172a; color: #f8fafc; font-weight: 600; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; }
    tr:hover { background-color: #f8fafc; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>AFAD Deprem Takip Sistemi</h1>
        <div style="color: #64748b; font-size: 14px; margin-top: 4px;">MongoDB Entegrasyonlu & Otomatik Tekilleştirme (Deduplication)</div>
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
        <div class="label">Otomatik Senkron Aralık</div>
        <div class="value">Her ${SYNC_INTERVAL_MINUTES} dakikada bir</div>
      </div>
      <div class="stat-card">
        <div class="label">Son Senkronizasyon</div>
        <div class="value" style="font-size: 14px; font-weight: 500;">${lastSyncText}</div>
      </div>
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
          ${rows.length > 0 ? rows : '<tr><td colspan="7" style="text-align:center; padding: 30px;">Kayıt bulunamadı. Lütfen bekleyin veya senkronize edin.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    async function triggerSync() {
      const btn = document.querySelector('.btn');
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

// JSON API: Depremleri listele
app.get('/api/earthquakes', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || `${FETCH_COUNT}`, 10), 100);
    const earthquakes = await Earthquake.find()
      .sort({ eventDate: -1 })
      .limit(limit)
      .lean();

    const total = await Earthquake.countDocuments();
    res.json({
      success: true,
      total,
      count: earthquakes.length,
      data: earthquakes
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// JSON API: Manuel senkronizasyon tetikle
app.post('/api/sync', async (req, res) => {
  try {
    const count = parseInt(req.body.count || `${FETCH_COUNT}`, 10);
    const result = await syncEarthquakes(count);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sağlık kontrolü (Healthcheck)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Sunucuyu ve zamanlayıcıyı başlat
async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`[APP] Sunucu çalışıyor: http://localhost:${PORT}`);
  });

  // İlk açılışta hemen bir kez veri çek
  await syncEarthquakes(FETCH_COUNT);

  // Belirtilen aralıklarla periyodik olarak çek
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
