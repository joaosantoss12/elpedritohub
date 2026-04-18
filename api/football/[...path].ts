import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { path } = req.query;
  const apiPath = Array.isArray(path) ? path.join('/') : path || '';
  
  // Build query string from remaining params (exclude 'path')
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    if (Array.isArray(value)) {
      value.forEach(v => params.append(key, v));
    } else if (value) {
      params.append(key, value);
    }
  }
  const qs = params.toString();
  const url = `https://api.football-data.org/v4/${apiPath}${qs ? '?' + qs : ''}`;

  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const response = await fetch(url, {
      headers: { 'X-Auth-Token': apiKey },
    });

    const data = await response.json();

    // Cache for 15 minutes
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to fetch from football API' });
  }
}
