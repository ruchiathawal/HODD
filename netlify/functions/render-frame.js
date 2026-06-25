/* ─────────────────────────────────────────────────────────────────
   HODD · Render Frame  (frame-preserved img2img via fal.ai)
   POST /.netlify/functions/render-frame
   Body: { imageBase64, prompt }
   Returns: { url } or { error }
───────────────────────────────────────────────────────────────── */

exports.handler = async function(event) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  var apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'REPLICATE_API_TOKEN not configured' }) };

  try {
    var body = JSON.parse(event.body);
    var imageBase64 = body.imageBase64;
    var prompt = body.prompt;

    if (!imageBase64 || !prompt) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Missing imageBase64 or prompt' }) };
    }

    // Step 1: Upload image to Replicate file storage
    var base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    var mimeType = imageBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
    var binary = Buffer.from(base64Data, 'base64');

    var boundary = 'boundary' + Date.now();
    var CRLF = '\r\n';
    var partHeader = '--' + boundary + CRLF +
      'Content-Disposition: form-data; name="content"; filename="room.jpg"' + CRLF +
      'Content-Type: ' + mimeType + CRLF + CRLF;
    var partFooter = CRLF + '--' + boundary + '--' + CRLF;

    var headerBuf = Buffer.from(partHeader, 'binary');
    var footerBuf = Buffer.from(partFooter, 'binary');
    var multipart = Buffer.concat([headerBuf, binary, footerBuf]);

    var uploadRes = await fetch('https://api.replicate.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiToken,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
      },
      body: multipart,
    });

    if (!uploadRes.ok) {
      var uploadErr = await uploadRes.text();
      console.error('Upload failed:', uploadErr);
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Image upload failed: ' + uploadErr }) };
    }

    var fileData = await uploadRes.json();
    var imageUrl = fileData.urls && fileData.urls.get;
    if (!imageUrl) {
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'No URL from file upload' }) };
    }

    // Step 2: Submit SDXL img2img prediction
    var predRes = await fetch('https://api.replicate.com/v1/models/stability-ai/sdxl/predictions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: {
          image: imageUrl,
          prompt: prompt,
          negative_prompt: 'ugly, blurry, low quality, distorted, cartoon, watermark, text',
          image_strength: 0.35,
          num_inference_steps: 30,
          guidance_scale: 8,
          width: 1024,
          height: 768,
        },
      }),
    });

    if (!predRes.ok) {
      var predErr = await predRes.text();
      return { statusCode: predRes.status, headers: headers, body: JSON.stringify({ error: predErr }) };
    }

    var prediction = await predRes.json();
    return { statusCode: 200, headers: headers, body: JSON.stringify({ id: prediction.id, status: prediction.status }) };

  } catch (err) {
    console.error('render-frame error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
