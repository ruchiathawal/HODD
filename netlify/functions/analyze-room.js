/* ─────────────────────────────────────────────────────────────────
   HODD · Analyze Room
   POST /.netlify/functions/analyze-room
   Body: { imageBase64 }  (data URL or raw base64)
   Returns: { roomType, dims, furniture, style, colors, confidence }
───────────────────────────────────────────────────────────────── */

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };

  try {
    const { imageBase64 } = JSON.parse(event.body);
    if (!imageBase64) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No image provided' }) };

    // Strip data URL prefix if present
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const mediaType = imageBase64.startsWith('data:image/png') ? 'image/png' :
                      imageBase64.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data },
            },
            {
              type: 'text',
              text: `Analyse this room photo and return a JSON object only (no explanation, no markdown):
{
  "roomType": one of ["living","bedroom","kitchen","dining","bathroom","office","kids","studio"],
  "dims": {
    "length": estimated length in feet (integer),
    "breadth": estimated breadth in feet (integer),
    "height": estimated ceiling height in feet (integer, usually 9-12),
    "confidence": "low"|"medium"|"high"
  },
  "existingFurniture": array of furniture item names visible in the room (use these exact names where possible: sofa, bed, dining-table, wardrobe, tv-unit, desk, bookshelf, center-table, accent-chair, side-table, dresser),
  "currentStyle": one of ["japandi","indian-modern","contemporary","luxury-modern","earthy-organic","eclectic","traditional","none"],
  "dominantColors": array of 2-3 hex color codes of the dominant wall/floor colors,
  "naturalLight": "low"|"medium"|"high",
  "condition": "needs-renovation"|"good"|"excellent",
  "notes": one short sentence about the room's key characteristic
}`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Claude API error:', err);
      return { statusCode: response.status, headers, body: JSON.stringify({ error: 'Analysis failed' }) };
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '{}';

    // Extract JSON from response (Claude sometimes adds extra text)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return { statusCode: 200, headers, body: JSON.stringify(analysis) };

  } catch (err) {
    console.error('analyze-room error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
