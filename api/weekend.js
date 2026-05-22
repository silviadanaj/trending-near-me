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
  const todayStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const prompt = `Today is ${todayStr}. You are a local events researcher for ${city}, Netherlands.

Search the web NOW using ALL of these search queries to find events this weekend (${weekend}):

1. Search: "${city} evenementen dit weekend"
2. Search: "wat te doen ${city} dit weekend"
3. Search: "uitagenda ${city} weekend"
4. Search: "${city} events this weekend"
5. Search: site:uitagenda.nl "${city}"
6. Search: site:eventbrite.nl "${city}"
7. Search: "${city} markt zaterdag zondag"
8. Search: "${city} live muziek dit weekend"
9. Search: "${city} festival weekend"
10. Search: "${city} theater voorstelling weekend"

Compile everything you find into a single list. Include ALL types of events:
🎵 Live music, concerts, DJ nights
🛍️ Markets, flea markets, Sunday markets, food markets
🎨 Art openings, exhibitions, museum events
🍽️ Food festivals, tastings, pop-ups, restaurant events
🎭 Theatre, comedy, dance, cabaret
🎉 Club nights, parties, social events
🌳 Outdoor events, sports, park activities
👨‍👩‍👧 Family events, kids activities
🎪 Festivals, fairs, neighbourhood events

Format each item exactly like this:
🎵 **[Event Name]**
[Venue name], [time if known]
[One sentence description. Free/€XX if known.]

Aim for 12-20 items. Include both free and paid events. Include events at all scales — small café gigs count just as much as big festivals. Search Dutch AND English sources. Only list events actually happening this specific weekend. Start the list immediately with no introduction.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 2000, temperature: 0.5 }
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
      || 'Nothing found — try a different city or check back closer to the weekend.';
    return res.status(200).json({ intel, weekend, city });
  } catch (error) {
    console.error('Weekend intel error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
