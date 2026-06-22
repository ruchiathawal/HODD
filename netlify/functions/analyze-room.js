/* ─────────────────────────────────────────────────────────────────
   HODD · Analyze Room  (multi-angle aware)
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };

  try {
    const body = JSON.parse(event.body);

    // Normalise to array — accept both new { images } and legacy { imageBase64 }
    const rawImages = body.images
      ? body.images.filter(Boolean)
      : body.imageBase64 ? [body.imageBase64] : [];

    if (!rawImages.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No image provided' }) };
    }

    // Parse each image into { data, mime_type }
    const imageParts = rawImages.map(dataUrl => {
      const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const mime_type  = dataUrl.startsWith('data:image/png')  ? 'image/png'  :
                         dataUrl.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
      return { inline_data: { mime_type, data: base64Data } };
    });

    const angleNote = imageParts.length > 1
      ? `You are given ${imageParts.length} photos of the SAME room taken from different angles. Synthesise all photos to produce the most accurate analysis — use the doorway shot for overall layout and the corner shot(s) for dimension depth and ceiling height estimation.`
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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              ...imageParts,   // all images first
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini API error:', err);
      return { statusCode: response.status, headers, body: JSON.stringify({ error: 'Analysis failed' }) };
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return { statusCode: 200, headers, body: JSON.stringify(analysis) };

  } catch (err) {
    console.error('analyze-room error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
