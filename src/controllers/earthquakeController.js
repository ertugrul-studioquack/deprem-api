const Earthquake = require('../models/Earthquake');

// Haversine formülü ile iki koordinat arası mesafe (KM)
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// Türkçe karakter duyarsız regex oluşturucu
function createTurkishRegex(text) {
  if (!text) return null;
  const cleaned = text.trim();
  const pattern = cleaned
    .replace(/[iİıI]/g, '[iİıI]')
    .replace(/[sSşŞ]/g, '[sSşŞ]')
    .replace(/[gGğĞ]/g, '[gGğĞ]')
    .replace(/[uUüÜ]/g, '[uUüÜ]')
    .replace(/[oOöÖ]/g, '[oOöÖ]')
    .replace(/[cCçÇ]/g, '[cCçÇ]');
  return new RegExp(pattern, 'i');
}

/**
 * GET /api/earthquakes
 * Şehir, limit, sayfa, büyüklük ve tarih filtreli sorgulama
 */
async function getEarthquakes(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const query = {};

    // 1. Şehir / Konum filtresi
    const city = req.query.city || req.query.location;
    if (city) {
      const regex = createTurkishRegex(city);
      if (regex) {
        query.location = { $regex: regex };
      }
    }

    // 2. Büyüklük filtresi
    const minMag = parseFloat(req.query.minMag);
    const maxMag = parseFloat(req.query.maxMag);
    if (!isNaN(minMag) || !isNaN(maxMag)) {
      query.magnitude = {};
      if (!isNaN(minMag)) query.magnitude.$gte = minMag;
      if (!isNaN(maxMag)) query.magnitude.$lte = maxMag;
    }

    // 3. Derinlik filtresi
    const minDepth = parseFloat(req.query.minDepth);
    const maxDepth = parseFloat(req.query.maxDepth);
    if (!isNaN(minDepth) || !isNaN(maxDepth)) {
      query.depth = {};
      if (!isNaN(minDepth)) query.depth.$gte = minDepth;
      if (!isNaN(maxDepth)) query.depth.$lte = maxDepth;
    }

    // 4. Tarih aralığı filtresi
    if (req.query.startDate || req.query.endDate) {
      query.eventDate = {};
      if (req.query.startDate) query.eventDate.$gte = new Date(req.query.startDate);
      if (req.query.endDate) query.eventDate.$lte = new Date(req.query.endDate);
    }

    // 5. GPS konumu ve yarıçap filtresi
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng || req.query.lon);
    const radiusKm = parseFloat(req.query.radiusKm || req.query.maxDistance);

    if (!isNaN(lat) && !isNaN(lng) && !isNaN(radiusKm)) {
      // 1 radyan ~ 6378.1 km
      const radiusRadians = radiusKm / 6378.1;
      query.geo = {
        $geoWithin: {
          $centerSphere: [[lng, lat], radiusRadians]
        }
      };
    }

    // Sıralama
    const sortField = req.query.sortBy || 'eventDate';
    const sortDir = req.query.sort === 'asc' ? 1 : -1;
    const sortObj = { [sortField]: sortDir };

    const total = await Earthquake.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;

    let items = await Earthquake.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    // Eğer konum verilmişse mesafeyi de her kayda ekle
    if (!isNaN(lat) && !isNaN(lng)) {
      items = items.map(e => ({
        ...e,
        distanceKm: calculateDistanceKm(lat, lng, e.latitude, e.longitude)
      }));
    }

    res.json({
      success: true,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      filters: {
        city: city || null,
        minMag: !isNaN(minMag) ? minMag : null,
        maxMag: !isNaN(maxMag) ? maxMag : null,
        lat: !isNaN(lat) ? lat : null,
        lng: !isNaN(lng) ? lng : null,
        radiusKm: !isNaN(radiusKm) ? radiusKm : null
      },
      data: items
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/earthquakes/nearby
 * Kullanıcının koordinatına en yakın depremleri mesafeye göre döner
 */
async function getNearbyEarthquakes(req, res) {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng || req.query.lon);
    const radiusKm = parseFloat(req.query.radiusKm || '100');
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const minMag = parseFloat(req.query.minMag || '0');

    if (isNaN(lat) || !isFinite(lat) || isNaN(lng) || !isFinite(lng)) {
      return res.status(400).json({
        success: false,
        error: 'Geçersiz koordinat. Lütfen "lat" ve "lng" parametrelerini belirtin (Örnek: ?lat=38.4&lng=27.1).'
      });
    }

    const radiusMeters = radiusKm * 1000;

    const results = await Earthquake.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] },
          distanceField: 'distanceMeters',
          maxDistance: radiusMeters,
          query: { magnitude: { $gte: minMag } },
          spherical: true
        }
      },
      { $limit: limit },
      {
        $addFields: {
          distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 1] }
        }
      }
    ]);

    res.json({
      success: true,
      origin: { lat, lng },
      radiusKm,
      count: results.length,
      data: results
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/earthquakes/cities
 * Veritabanındaki şehirlerin deprem sayılarıyla listesi
 */
async function getCities(req, res) {
  try {
    const earthquakes = await Earthquake.find({}, { location: 1 }).lean();
    const cityCounts = {};

    earthquakes.forEach(e => {
      if (!e.location) return;
      // AFAD genelde "İlçe (İl)" formatında verir, parantez içindeki ili yakalayalım
      const match = e.location.match(/\(([^)]+)\)/);
      const cityName = match ? match[1].trim() : e.location.split('-').pop().trim();
      if (cityName) {
        cityCounts[cityName] = (cityCounts[cityName] || 0) + 1;
      }
    });

    const sortedCities = Object.entries(cityCounts)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      totalCities: sortedCities.length,
      data: sortedCities
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/earthquakes/stats
 * Genel istatistikler ve büyüklük dağılımı
 */
async function getStats(req, res) {
  try {
    const total = await Earthquake.countDocuments();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24hCount = await Earthquake.countDocuments({ eventDate: { $gte: oneDayAgo } });

    const maxEarthquake = await Earthquake.findOne().sort({ magnitude: -1 }).lean();
    const latestEarthquake = await Earthquake.findOne().sort({ eventDate: -1 }).lean();

    const magnitudeGroups = await Earthquake.aggregate([
      {
        $bucket: {
          groupBy: '$magnitude',
          boundaries: [0, 2, 3, 4, 5, 10],
          default: 'other',
          output: { count: { $sum: 1 } }
        }
      }
    ]);

    res.json({
      success: true,
      total,
      last24hCount,
      latest: latestEarthquake
        ? {
            id: latestEarthquake.id,
            eventDate: latestEarthquake.eventDate,
            magnitude: latestEarthquake.magnitude,
            location: latestEarthquake.location
          }
        : null,
      max: maxEarthquake
        ? {
            id: maxEarthquake.id,
            eventDate: maxEarthquake.eventDate,
            magnitude: maxEarthquake.magnitude,
            location: maxEarthquake.location
          }
        : null,
      magnitudeDistribution: magnitudeGroups
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/earthquakes/:id
 * ID'ye göre tekil deprem bilgisi
 */
async function getEarthquakeById(req, res) {
  try {
    const paramId = req.params.id;
    let earthquake = null;

    if (!isNaN(parseInt(paramId, 10))) {
      earthquake = await Earthquake.findOne({ id: parseInt(paramId, 10) }).lean();
    }

    if (!earthquake && paramId.match(/^[0-9a-fA-F]{24}$/)) {
      earthquake = await Earthquake.findById(paramId).lean();
    }

    if (!earthquake) {
      return res.status(404).json({ success: false, error: 'Deprem kaydı bulunamadı.' });
    }

    res.json({ success: true, data: earthquake });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getEarthquakes,
  getNearbyEarthquakes,
  getCities,
  getStats,
  getEarthquakeById
};
