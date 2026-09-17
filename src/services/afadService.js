const AFAD_URL = 'https://deprem.afad.gov.tr/EventData/GetEventsByFilter';

async function fetchPage(skip, take) {
  const response = await fetch(AFAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({
      EventSearchFilterList: [],
      Skip: skip,
      Take: take,
      SortDescriptor: { field: 'eventDate', dir: 'desc' }
    })
  });

  if (!response.ok) {
    throw new Error(`AFAD API isteği başarısız oldu: HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.eventList || [];
}

async function fetchLatestEarthquakes(totalCount = 45) {
  const PAGE_SIZE = 20;
  const promises = [];

  for (let skip = 0; skip < totalCount; skip += PAGE_SIZE) {
    const take = Math.min(PAGE_SIZE, totalCount - skip);
    promises.push(fetchPage(skip, take));
  }

  const pages = await Promise.all(promises);
  return pages.flat().slice(0, totalCount);
}

module.exports = { fetchLatestEarthquakes };
