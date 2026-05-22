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

  const { city = 'The Hague' } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Gemini API key not configured' });

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const weekend = getWeekendDates(new Date());

  const prompt = `You are a local events scout for ${city}, Netherlands.

Search the web RIGHT NOW for events and activities happening THIS WEEKEND (${weekend}) in ${city}. 

Look for ALL of these types of things:
- Local markets, flea markets, farmers markets, Sunday markets
- Pop-up events, temporary exhibitions, art openings, gallery events
- Neighbourhood festivals, street parties, fairs
- Live music events, DJ nights, concerts (including free ones)
- Theatre, comedy, dance performances
- Café and bar special events, quiz nights, tastings, workshops
- Community events, sports events, outdoor activities
- Food festivals, food truck events
- Family-friendly events, kids activities
- Club nights, cultural events

Search in Dutch too (e.g. "weekend ${city} activiteiten", "${city} evenementen dit weekend", "uitagenda ${city}").

Be specific: use real names, real venues, real times. Format as a clean emoji-bulleted list:
🎵 for music, 🛍️ for markets, 🎨 for art, 🍽️ for food, 🎪 for festivals, 🎭 for theatre, 🏃 for sports, 🎉 for parties.

Each item: bold name, then venue and time on the next line. Aim for 8-12 items. No intro text — start the list immediately.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 1500, temperature: 0.7 }
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
      || 'Nothing found for this weekend — try a different city or check back later.';
    return res.status(200).json({ intel, weekend, city });
  } catch (error) {
    console.error('Weekend intel error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
