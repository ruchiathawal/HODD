/* ─────────────────────────────────────────────────────────────────
   HODD · Upload Room Image  (imgbb proxy)
   POST /.netlify/functions/upload-room
   Body: { imageBase64: dataUrl }
   Returns: { url }
───────────────────────────────────────────────────────────────── */

exports.handler = async function(event) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  var apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'IMGBB_API_KEY not configured' }) };

  try {
    var body = JSON.parse(event.body);
    var imageBase64 = body.imageBase64;
    if (!imageBase64) return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'No image provided' }) };

    // Strip data URL prefix — imgbb wants raw base64
    var base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    // imgbb accepts base64 as a simple URL-encoded form field — no multipart needed
    var formBody = 'image=' + encodeURIComponent(base64Data) + '&expiration=3600';

    var res = await fetch('https://api.imgbb.com/1/upload?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody,
    });

    if (!res.ok) {
      var err = await res.text();
      return { statusCode: res.status, headers: headers, body: JSON.stringify({ error: 'imgbb error: ' + err }) };
    }

    var data = await res.json();
    var url = data.data && data.data.url;
    if (!url) return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'No URL from imgbb' }) };

    return { statusCode: 200, headers: headers, body: JSON.stringify({ url: url }) };

  } catch (err) {
    console.error('upload-room error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
