/* ─────────────────────────────────────────────────────────────────
   HODD · Upload Image
   POST /.netlify/functions/upload-image
   Body: { imageBase64: dataUrl }
   Returns: { url } — a Replicate-hosted file URL usable in img2img
───────────────────────────────────────────────────────────────── */

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) return { statusCode: 500, headers, body: JSON.stringify({ error: 'REPLICATE_API_TOKEN not configured' }) };

  try {
    const { imageBase64 } = JSON.parse(event.body);
    if (!imageBase64) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No image provided' }) };

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const mimeType   = imageBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
    const binary     = Buffer.from(base64Data, 'base64');

    // Build multipart body manually — avoids FormData/Blob compatibility issues
    const boundary = '----ReplicateBoundary' + Date.now();
    const CRLF = '\r\n';
    const header = `--${boundary}${CRLF}Content-Disposition: form-data; name="content"; filename="room.jpg"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`;
    const footer = `${CRLF}--${boundary}--${CRLF}`;

    const headerBuf = Buffer.from(header, 'utf8');
    const footerBuf = Buffer.from(footer, 'utf8');
    const bodyBuf   = Buffer.concat([headerBuf, binary, footerBuf]);

    const uploadRes = await fetch('https://api.replicate.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(bodyBuf.length),
      },
      body: bodyBuf,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error('Replicate upload error:', uploadRes.status, err);
      return { statusCode: uploadRes.status, headers, body: JSON.stringify({ error: `Upload failed: ${err}` }) };
    }

    const fileData = await uploadRes.json();
    const url = fileData.urls?.get;
    if (!url) return { statusCode: 500, headers, body: JSON.stringify({ error: 'No URL returned from Replicate' }) };

    return { statusCode: 200, headers, body: JSON.stringify({ url }) };

  } catch (err) {
    console.error('upload-image error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
