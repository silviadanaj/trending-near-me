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

  const { lat, lng } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Gemini API key not configured' });

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const weekend = getWeekendDates(new Date());

  const prompt = `You are a local events scout for the area around ${lat}, ${lng} — this is the Voorburg / The Hague area in the Netherlands.

Search the web for what is happening THIS WEEKEND (${weekend}) in this area. Focus specifically on things NOT on major ticketing sites:
- Local markets, flea markets, farmers markets, Sunday markets
- Pop-up events, temporary exhibitions, art openings
- Neighbourhood festivals or street parties
- Café and bar special events (live music, DJ nights, quiz nights, tastings)
- Community events, charity events
- Outdoor activities, park events, sports events
- Food events, workshops, classes

Be specific: include real names, real locations, and times where you found them. Format your response as a clean list using emoji bullets (🎪 for festivals, 🎵 for music, 🛍️ for markets, 🍽️ for food, 🎨 for art, etc). Keep each item to 2-3 lines. Aim for 6-10 items. Start directly with the list — no intro sentence needed.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
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
    const intel = result.candidates?.[0]?.content?.parts?.[0]?.text || 'Nothing found for this weekend.';
    return res.status(200).json({ intel, weekend });
  } catch (error) {
    console.error('Weekend intel error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
