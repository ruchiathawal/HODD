/* ─────────────────────────────────────────────────────────────────
   HODD · Analyze Room  (multi-angle aware, Claude Haiku)
   POST /.netlify/functions/analyze-room
   Body: { images: [dataUrl, ...] }  — up to 3 photos
         { imageBase64: dataUrl }    — legacy single-photo fallback
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
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };

  try {
    const body = JSON.parse(event.body);

    // Normalise to array — accept both new { images } and legacy { imageBase64 }
    const rawImages = body.images
      ? body.images.filter(Boolean)
      : body.imageBase64 ? [body.imageBase64] : [];

    if (!rawImages.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No image provided' }) };
    }

    // Build Claude content blocks — one image block per photo, then the text prompt
    const imageBlocks = rawImages.map(dataUrl => {
      const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const media_type = dataUrl.startsWith('data:image/png')  ? 'image/png'  :
                         dataUrl.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
      return {
        type: 'image',
        source: { type: 'base64', media_type, data: base64Data },
      };
    });

    const angleNote = rawImages.length > 1
      ? `You are given ${rawImages.length} photos of the SAME room taken from different angles. Synthesise all photos to produce the most accurate analysis — use the doorway shot for overall layout and the corner shot(s) for dimension depth and ceiling height estimation.`
      : 'You are given one photo of a room.';

    const prompt = `${angleNote}

Return a JSON object ONLY (no explanation, no markdown, no code fences):
{
  "roomType": one of ["living","bedroom","kitchen","dining","bathroom","office","kids","studio"],
  "dims": {
    "length": estimated length in feet (integer),
    "breadth": estimated breadth in feet (integer),
    "height": estimated ceiling height in feet (integer, usually 9-12),
    "confidence": "low"|"medium"|"high"
  },
  "existingFurniture": array of furniture item names visible across ALL photos (use these exact names: sofa, bed, dining-table, wardrobe, tv-unit, desk, bookshelf, center-table, accent-chair, side-table, dresser),
  "currentStyle": one of ["japandi","indian-modern","contemporary","luxury-modern","earthy-organic","eclectic","traditional","none"],
  "dominantColors": array of 2-3 hex color codes of the dominant wall/floor colors,
  "naturalLight": "low"|"medium"|"high",
  "condition": "needs-renovation"|"good"|"excellent",
  "notes": one short sentence summarising the room's key characteristic
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [...imageBlocks, { type: 'text', text: prompt }],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Claude API error:', response.status, err);
      let detail = err;
      try { detail = JSON.parse(err)?.error?.message || err; } catch (_) {}
      return { statusCode: response.status, headers, body: JSON.stringify({ error: `Claude ${response.status}: ${detail}` }) };
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '{}';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return { statusCode: 200, headers, body: JSON.stringify(analysis) };

  } catch (err) {
    console.error('analyze-room error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
