const Earthquake = require('../models/Earthquake');
const { fetchLatestEarthquakes } = require('./afadService');

let lastSyncStatus = {
  lastRun: null,
  success: null,
  fetched: 0,
  inserted: 0,
  skipped: 0,
  error: null
};

// Eski kayıtlar varsa geo alanını geriye dönük tamamla
async function migrateMissingGeo() {
  try {
    const missingDocs = await Earthquake.find({
      $or: [
        { geo: { $exists: false } },
        { 'geo.coordinates': { $size: 0 } },
        { 'geo.coordinates': [0, 0] }
      ]
    }).limit(500);

    if (missingDocs.length > 0) {
      console.log(`[MIGRATION] ${missingDocs.length} adet eski kaydın koordinatları (geo) güncelleniyor...`);
      const ops = missingDocs.map(doc => ({
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              geo: {
                type: 'Point',
                coordinates: [Number(doc.longitude) || 0, Number(doc.latitude) || 0]
              }
            }
          }
        }
      }));
      await Earthquake.bulkWrite(ops);
      console.log('[MIGRATION] Koordinat güncellemesi tamamlandı.');
    }
  } catch (err) {
    console.error('[MIGRATION] Geo migrasyon hatası:', err.message);
  }
}

async function syncEarthquakes(count = 45) {
  const startTime = new Date();
  console.log(`\n[SYNC] AFAD senkronizasyonu başlatıldı (${startTime.toLocaleTimeString('tr-TR')}, Hedef: ${count} kayıt)...`);

  try {
    const earthquakes = await fetchLatestEarthquakes(count);
    if (!earthquakes || earthquakes.length === 0) {
      console.log('[SYNC] AFAD servisinden veri dönmedi.');
      lastSyncStatus = {
        lastRun: startTime,
        success: true,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        error: null
      };
      return lastSyncStatus;
    }

    const operations = earthquakes.map(item => ({
      updateOne: {
        filter: { id: item.id },
        update: {
          $setOnInsert: {
            id: item.id,
            eventDate: new Date(item.eventDate),
            magnitude: Number(item.magnitude) || 0,
            magnitudeType: item.magnitudeType || '',
            depth: Number(item.depth) || 0,
            location: item.location || '',
            latitude: Number(item.latitude) || 0,
            longitude: Number(item.longitude) || 0,
            geo: {
              type: 'Point',
              coordinates: [Number(item.longitude) || 0, Number(item.latitude) || 0]
            },
            eaeventId: item.eaeventId,
            raw: item
          }
        },
        upsert: true
      }
    }));

    const result = await Earthquake.bulkWrite(operations, { ordered: false });

    const insertedCount = result.upsertedCount || 0;
    const skippedCount = earthquakes.length - insertedCount;

    lastSyncStatus = {
      lastRun: startTime,
      success: true,
      fetched: earthquakes.length,
      inserted: insertedCount,
      skipped: skippedCount,
      error: null
    };

    console.log(`[SYNC] Başarılı: Toplam ${earthquakes.length} kayıt alındı.`);
    console.log(`[SYNC] -> Yeni Eklenen (DB): ${insertedCount}`);
    console.log(`[SYNC] -> Zaten Mevcut (Atlanan): ${skippedCount}`);

    return lastSyncStatus;
  } catch (error) {
    console.error(`[SYNC] Hata oluştu: ${error.message}`);
    lastSyncStatus = {
      lastRun: startTime,
      success: false,
      fetched: 0,
      inserted: 0,
      skipped: 0,
      error: error.message
    };
    return lastSyncStatus;
  }
}

function getLastSyncStatus() {
  return lastSyncStatus;
}

module.exports = { syncEarthquakes, getLastSyncStatus, migrateMissingGeo };
