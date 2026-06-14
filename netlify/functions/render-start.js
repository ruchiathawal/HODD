/* ─────────────────────────────────────────────────────────────────
   HODD · Render Start
   POST /.netlify/functions/render-start
   Body: { imageBase64, styleKey, roomType }
   Returns: { id }   (Replicate prediction ID to poll)
───────────────────────────────────────────────────────────────── */

const THEME_PROMPTS = {
  'japandi': [
    'japandi interior design style, wabi-sabi aesthetic, minimalist, warm neutral tones, natural bamboo furniture, linen textiles, muted earth palette, soft ambient lighting, serene and calm atmosphere, professional interior photography, 8k, photorealistic',
    'japandi style living room, low platform sofa in cream linen, bamboo shelving, stone coffee table, indoor plant, diffused natural light through shoji screens, ultra realistic, architectural digest style photography',
    'japandi bedroom interior, platform bed in natural oak, textured linen bedding in oat and sand tones, bamboo pendant light, minimalist bedside tables, tatami-inspired flooring, professional photography 4k',
    'japandi dining room, solid wood dining table, wishbone chairs in natural oak, wabi-sabi ceramic tableware, pendant rattan light, neutral walls with subtle texture, high-end interior photography',
    'japandi home office, natural wood desk, ergonomic chair in cream boucle, bamboo shelves with curated objects, large window with diffused light, monochrome art print, professional interior photo',
  ],
  'indian-modern': [
    'modern indian interior design, contemporary meets heritage, solid sheesham teak furniture, handbeaten brass accents, hand-blocked cotton textiles, warm terracotta and saffron palette, professional interior photography 8k',
    'modern indian living room, low teak wood sofa with bright cushions, brass floor lamp, jali screen divider, handwoven dhurrie rug, terracotta pots with indoor plants, architectural digest style photo',
    'modern indian bedroom, carved teak bed frame, brass hardware, block-print cotton duvet, woven jute rug, mud-plastered accent wall, warm pendant lighting, professional interior photography',
    'modern indian dining room, solid wood dining table with turned legs, cane-backed chairs, brass chandelier, hand-painted ceramic dinnerware, lime-washed walls, photorealistic interior design photo',
    'contemporary indian home office, rosewood desk with brass inlay, traditional patterns reinterpreted in modern form, vibrant silk cushion, hand-knotted rug, natural daylight, high quality interior photo',
  ],
  'contemporary': [
    'coastal contemporary interior design, airy bright space, whitewash oak furniture, rattan accents, linen upholstery, sandy and ocean blue palette, abundant natural light, professional interior photography 8k',
    'coastal contemporary living room, curved white sofa, rattan coffee table, sea glass ceramics, sheer linen curtains, bleached oak floors, indoor plants, architectural digest style photography',
    'coastal contemporary bedroom, white platform bed, natural rattan headboard, linen duvet in sand and white, driftwood side tables, large window with ocean-inspired views, 4k interior photography',
    'coastal contemporary dining room, whitewash oak dining table, rattan dining chairs, jute rug, white and blue ceramic vases, pendant woven light, bright airy space, professional photo',
    'coastal contemporary home office, white desk with rattan chair, natural fiber rug, navy and white accents, large window, minimalist shelving with sea-inspired objects, photorealistic interior',
  ],
  'luxury-modern': [
    'luxury modern interior design, high contrast drama, calacatta marble surfaces, brushed gold fixtures, deep velvet upholstery in emerald and navy, smoked glass accents, cinematic interior photography 8k',
    'luxury modern living room, sculptural curved sofa in dark velvet, marble coffee table with brass legs, statement art piece, gold pendant light, rich jewel tones, architectural digest style photo',
    'luxury modern master bedroom, upholstered bed in midnight blue velvet, marble side tables, brushed gold fixtures, floor to ceiling curtains, dramatic mood lighting, ultra premium interior photography',
    'luxury modern dining room, marble dining table, upholstered chairs in velvet, gold chandelier, dark fluted paneling, curated bar cart, dramatic ambient lighting, high-end interior photography',
    'luxury modern home office, dark walnut executive desk, leather chair, marble desktop accessories, floor to ceiling bookshelf, city view, moody dramatic lighting, professional interior photo',
  ],
  'earthy-organic': [
    'earthy organic interior design, natural and sustainable materials, terracotta, rattan, moss green linen, raw mango wood, clay textures, tactile surfaces, warm sunlit atmosphere, professional interior photography 8k',
    'earthy organic living room, mango wood sofa with moss green cushions, terracotta floor tiles, rattan pendant light, hand-thrown ceramic pots, cactus and ficus plants, cozy natural atmosphere, 4k photo',
    'earthy organic bedroom, raw wood bed frame, organic cotton duvet in earthy tones, woven rattan headboard, terracotta lamp, dried pampas grass, natural linen curtains, professional photography',
    'earthy organic dining room, live-edge mango wood dining table, rattan dining chairs, clay bowls, hanging terracotta pots with plants, jute rug, warm natural sunlight, interior photography',
    'earthy organic home office, reclaimed wood desk, natural fiber chair, living wall of plants, clay desk accessories, warm indirect lighting, sustainable materials, photorealistic interior photo',
  ],
};

const NEGATIVE_PROMPT = 'ugly, blurry, low quality, distorted, oversaturated, cartoon, illustration, drawing, painting, render, 3d, anime, watermark, text, logo, cropped, cut off, missing features, duplicate, deformed';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API token not configured' }) };
  }

  try {
    const { imageBase64, styleKey, roomType, variationIndex = 0 } = JSON.parse(event.body);

    const prompts = THEME_PROMPTS[styleKey] || THEME_PROMPTS['japandi'];
    const basePrompt = prompts[variationIndex % prompts.length];
    const fullPrompt = roomType ? `${roomType} room, ${basePrompt}` : basePrompt;

    // Use adirik/interior-design model (best for room-to-room style transfer)
    const response = await fetch(
      'https://api.replicate.com/v1/models/adirik/interior-design/predictions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            image: imageBase64,           // data URL or https:// URL
            prompt: fullPrompt,
            negative_prompt: NEGATIVE_PROMPT,
            guidance_scale: 15,
            num_inference_steps: 30,      // balance speed vs quality
            strength: 0.8,
            scheduler: 'DPMSolverMultistep',
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('Replicate API error:', err);
      return { statusCode: response.status, headers, body: JSON.stringify({ error: err }) };
    }

    const prediction = await response.json();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ id: prediction.id, status: prediction.status }),
    };

  } catch (err) {
    console.error('render-start error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
