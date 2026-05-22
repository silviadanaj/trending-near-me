function getWeekendDates(now) {
  const day = now.getDay();
  const opts = { weekday: 'short', day: 'numeric', month: 'long' };
  if (day === 0) return `Sunday ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`;
  if (day === 6) {
    const sun = new Date(now); sun.setDate(now.getDate() + 1);
    return `${now.toLocaleDateString('en-GB', opts)} – ${sun.toLocaleDateString('en-GB', opts)}`;
  }
  const fri = new Date(now); fri.setDate(now.getDate() + (5 - day));
  const sun = new Date(fri); sun.setDate(fri.getDate() + 2);
  return `${fri.toLocaleDateString('en-GB', opts)} – ${sun.toLocaleDateString('en-GB', opts)}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { city = 'Den Haag' } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Gemini API key not configured' });

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const now = new Date();
  const weekend = getWeekendDates(now);
  const todayStr = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const prompt = `Today is ${todayStr}. You are a local discovery scout for ${city}, Netherlands.

Your mission: find things happening THIS WEEKEND (${weekend}) in ${city} that a local resident would NOT find out about unless they specifically went looking. Think: fairs, markets, pop-ups, neighbourhood festivals, one-off events, temporary exhibitions, community happenings — the kind of thing you stumble upon or hear about from a friend.

Search these sources aggressively:

1. "${city} kermis dit weekend"
2. "${city} braderie weekend"  
3. "${city} markt buurtfeest ${weekend}"
4. "${city} rommelmarkt vlooienmarkt weekend"
5. "evenementen ${city} dit weekend site:uitagenda.nl"
6. "evenementen ${city} dit weekend site:eventbrite.nl"
7. "${city} festival braderie kermis 2026"
8. "${city} open dag expositie tijdelijk"
9. "facebook events ${city} this weekend"
10. "site:partyflock.nl ${city} weekend"
11. "site:meetup.com ${city} this weekend"
12. "${city} what's on this weekend hidden gems"
13. "${city} neighbourhood event street party weekend"
14. "gemeente ${city} activiteiten weekend"

Focus especially on:
🎡 Fairs (kermis), funfairs, carnivals
🛍️ Street markets, braderie, rommelmarkt, Sunday markets
🎪 Neighbourhood festivals, buurtfeesten, straatfeesten
🌳 Park events, outdoor pop-ups, temporary installations
🏛️ Open days (open dag) at unusual locations
🎨 Pop-up exhibitions, temporary shows
🍺 Local pub/café special events, terras events
🎠 Family days, kids events in unexpected locations
🎶 Free outdoor concerts, busking events
🏘️ Community events most tourists wouldn't know about

For each thing you find, write it like a friend texting you a tip:
- Lead with WHY it's worth knowing about
- Be specific: real name, real location, real time
- Flag if it's free or costs money
- Flag if it's rare or unusual ("only happens once a year", "first time in the city", etc.)

Format:
🎡 **[Event name]**
📍 [Venue/Location], [time]
💬 [Why you'd want to know about this — 1-2 sentences in friendly tone]

Find 10-15 things. Prioritise the unexpected over the obvious. Start immediately with no intro.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 2500, temperature: 0.4 }
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errData = await response.json();
      return res.status(502).json({ error: 'Gemini API error', details: errData });
    }
    const result = await response.json();
    const intel = result.candidates?.[0]?.content?.parts?.[0]?.text
      || 'Nothing unexpected found this weekend — try a different city or check back Friday when more events get posted.';
    return res.status(200).json({ intel, weekend, city });
  } catch (error) {
    console.error('Weekend intel error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
