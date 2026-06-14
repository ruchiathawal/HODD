/* ─────────────────────────────────────────────────────────────────
   HODD · Render Poll
   GET /.netlify/functions/render-poll?id={predictionId}
   Returns: { status, output }
   status: 'starting' | 'processing' | 'succeeded' | 'failed'
   output: image URL (when succeeded)
───────────────────────────────────────────────────────────────── */

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { id } = event.queryStringParameters || {};
  if (!id) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing prediction id' }) };
  }

  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API token not configured' }) };
  }

  try {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { 'Authorization': `Bearer ${apiToken}` },
    });

    const data = await response.json();
    const outputUrl = Array.isArray(data.output) ? data.output[0] : data.output;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: data.status,
        output: outputUrl || null,
        error: data.error || null,
        progress: data.metrics?.predict_time ? Math.min(99, Math.round(data.metrics.predict_time * 10)) : null,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
