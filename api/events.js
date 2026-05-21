// Convert a JS Date to Ticketmaster's required format: YYYY-MM-DDTHH:mm:ssZ (no milliseconds)
function toTicketmasterFormat(d) {
  return d.toISOString().split('.')[0] + 'Z';
}

// Compute start/end datetimes for a named window
// Note: runs in UTC on the server; close enough for an MVP across NL/EU timezones
function getDateRange(window) {
  const now = new Date();
  let start = new Date(now);
  let end   = new Date(now);

  if (window === 'today') {
    end.setHours(23, 59, 59, 999);

  } else if (window === 'weekend') {
    const day = now.getDay(); // 0=Sun ... 6=Sat
    if (day === 0) {
      // Sunday: just the rest of today
      end.setHours(23, 59, 59, 999);
    } else if (day === 6) {
      // Saturday: today + Sunday
      end.setDate(now.getDate() + 1);
      end.setHours(23, 59, 59, 999);
    } else {
      // Mon–Fri: upcoming Friday 00:00 through Sunday 23:59
      const daysToFri = (5 - day + 7) % 7;
      const friday = new Date(now);
      friday.setDate(now.getDate() + daysToFri);
      friday.setHours(0, 0, 0, 0);
      const sunday = new Date(friday);
      sunday.setDate(friday.getDate() + 2);
      sunday.setHours(23, 59, 59, 999);
      start = (day === 5) ? now : friday; // if it's already Friday, start from now
      end   = sunday;
    }

  } else if (window === 'week') {
    end.setDate(now.getDate() + 7);
    end.setHours(23, 59, 59, 999);

  } else {
    // default: next 30 days
    end.setDate(now.getDate() + 30);
    end.setHours(23, 59, 59, 999);
  }

  return {
    startDateTime: toTicketmasterFormat(start),
    endDateTime:   toTicketmasterFormat(end)
  };
}

// Human-friendly date label, e.g. "Sat, 23 May · 20:00"
function formatDateLabel(localDate, localTime) {
  if (!localDate) return 'Date TBA';
  const d = new Date(localDate + (localTime ? `T${localTime}` : 'T00:00:00'));
  let label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  if (localTime) label += ` · ${localTime.slice(0, 5)}`;
  return label;
}

// Pick the best image: prefer 16:9, widest available
function pickImage(images = []) {
  if (!images.length) return null;
  const wide = images.filter(i => i.ratio === '16_9').sort((a, b) => (b.width || 0) - (a.width || 0));
  if (wide.length) return wide[0].url;
  return images.slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0].url;
}

// Format a price range, e.g. "€25–€60"
function formatPrice(priceRanges = []) {
  if (!priceRanges.length) return null;
  const pr  = priceRanges[0];
  const sym = pr.currency === 'EUR' ? '\u20AC' : pr.currency === 'USD' ? '$' : pr.currency + ' ';
  if (pr.min == null) return null;
  if (pr.min === pr.max) return `${sym}${Math.round(pr.min)}`;
  return `${sym}${Math.round(pr.min)}\u2013${sym}${Math.round(pr.max)}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  const { lat, lng, window = 'weekend' } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng query params are required' });
  }

  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Ticketmaster API key not configured' });
  }

  const { startDateTime, endDateTime } = getDateRange(window);

  const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
  url.searchParams.set('apikey',        apiKey);
  url.searchParams.set('latlong',       `${lat},${lng}`);
  url.searchParams.set('radius',        '20');
  url.searchParams.set('unit',          'km');
  url.searchParams.set('startDateTime', startDateTime);
  url.searchParams.set('endDateTime',   endDateTime);
  url.searchParams.set('sort',          'date,asc');
  url.searchParams.set('size',          '50');

  try {
    const response = await fetch(url.toString());
    const data = await response.json();

    const rawEvents = data?._embedded?.events || [];
    const events = [];

    for (const ev of rawEvents) {
      const venue = ev._embedded?.venues?.[0];
      const loc   = venue?.location;
      if (!loc || !loc.latitude || !loc.longitude) continue; // need coords to place on the map

      const segment = ev.classifications?.[0]?.segment?.name || 'Event';

      events.push({
        id:        ev.id,
        name:      ev.name,
        category:  'event',
        segment,
        date:      ev.dates?.start?.localDate || null,
        time:      ev.dates?.start?.localTime || null,
        dateLabel: formatDateLabel(ev.dates?.start?.localDate, ev.dates?.start?.localTime),
        venue:     venue?.name || 'Venue TBA',
        address:   venue?.address?.line1 || venue?.city?.name || '',
        image:     pickImage(ev.images) || `https://placehold.co/600x400/db2777/ffffff?text=${encodeURIComponent(segment)}`,
        url:       ev.url || null,
        price:     formatPrice(ev.priceRanges),
        lat:       parseFloat(loc.latitude),
        lng:       parseFloat(loc.longitude),
      });
    }

    return res.status(200).json({ events, count: events.length, window });

  } catch (error) {
    console.error('Events proxy error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
