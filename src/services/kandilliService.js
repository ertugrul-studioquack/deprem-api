const KANDILLI_URL = 'http://www.koeri.boun.edu.tr/scripts/lst0.asp';

/**
 * Kandilli Rasathanesi sayfasını çeker, windows-1254 formatından çözer ve 500 depremi parse eder.
 */
async function fetchKandilliEarthquakes(options = {}) {
  const { limit = 500, city, minMag } = options;

  const response = await fetch(KANDILLI_URL);
  if (!response.ok) {
    throw new Error(`Kandilli sayfasına erişilemedi: HTTP ${response.status}`);
  }

  // Kandilli 'windows-1254' (Türkçe) karakter kodlaması kullanır
  const buffer = await response.arrayBuffer();
  const decoder = new TextDecoder('windows-1254');
  const html = decoder.decode(buffer);

  // <pre> etiketleri arasındaki metni al
  const preMatch = html.match(/<pre>([\s\S]*?)<\/pre>/i);
  if (!preMatch) {
    throw new Error('Kandilli sayfasında <pre> veri bloğu bulunamadı.');
  }

  const rawLines = preMatch[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^\d{4}\.\d{2}\.\d{2}/.test(line));

  // Kandilli satır formatı regex'i:
  // Tarih Saat Enlem Boylam Derinlik MD ML Mw Yer Çözüm Niteliği
  const lineRegex = /^(\d{4}\.\d{2}\.\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+([-\d\.]+)\s+([-\d\.]+)\s+([-\d\.]+)\s+(.*)$/;

  let earthquakes = [];

  for (const line of rawLines) {
    const match = line.match(lineRegex);
    if (!match) continue;

    const [_, dateStr, timeStr, latStr, lngStr, depthStr, mdStr, mlStr, mwStr, rest] = match;

    const restParts = rest.split(/\s{2,}/);
    const location = restParts[0]?.trim() || '';
    const attribute = restParts.slice(1).join(' ').trim() || 'İlksel';

    const md = mdStr !== '-.-' ? parseFloat(mdStr) : null;
    const ml = mlStr !== '-.-' ? parseFloat(mlStr) : null;
    const mw = mwStr !== '-.-' ? parseFloat(mwStr) : null;
    const magnitude = mw || ml || md || 0;

    const latitude = parseFloat(latStr);
    const longitude = parseFloat(lngStr);
    const depth = parseFloat(depthStr);

    const formattedDate = `${dateStr.replace(/\./g, '-')}T${timeStr}`;

    earthquakes.push({
      id: `koeri_${dateStr.replace(/\./g, '')}_${timeStr.replace(/:/g, '')}_${latStr}_${lngStr}`,
      source: 'KANDILLI',
      eventDate: formattedDate,
      latitude,
      longitude,
      depth,
      magnitude,
      magnitudeType: mw ? 'Mw' : ml ? 'ML' : md ? 'MD' : '',
      magnitudes: { md, ml, mw },
      location,
      attribute,
      geo: {
        type: 'Point',
        coordinates: [longitude, latitude]
      }
    });
  }

  // Filtreler
  if (city) {
    const regex = new RegExp(city, 'i');
    earthquakes = earthquakes.filter(e => regex.test(e.location));
  }

  if (minMag && !isNaN(parseFloat(minMag))) {
    const m = parseFloat(minMag);
    earthquakes = earthquakes.filter(e => e.magnitude >= m);
  }

  return earthquakes.slice(0, limit);
}

module.exports = { fetchKandilliEarthquakes };
