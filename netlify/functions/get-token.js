exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: process.env.REPLICATE_API_TOKEN || '' }),
});
