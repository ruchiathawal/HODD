/* ─────────────────────────────────────────────────────────────────
   HODD · Render Start
   POST /.netlify/functions/render-start
   Body: { imageBase64, styleKey, roomType, variationIndex?, customPrompt? }
   Returns: { id }   (Replicate prediction ID to poll)
───────────────────────────────────────────────────────────────── */

// Room-type specific prefixes for more accurate renders
const ROOM_PREFIXES = {
  living:     'photorealistic living room interior,',
  bedroom:    'photorealistic bedroom interior,',
  kitchen:    'photorealistic kitchen interior,',
  dining:     'photorealistic dining room interior,',
  bathroom:   'photorealistic bathroom interior,',
  office:     'photorealistic home office interior,',
  workoffice: 'photorealistic modern office workspace interior,',
  kids:       'photorealistic kids bedroom interior,',
  studio:     'photorealistic studio apartment interior,',
};

const THEME_PROMPTS = {
  'japandi': [
    'japandi interior style, wabi-sabi, minimalist, warm neutral tones, natural wood furniture, linen textiles, muted earth palette, soft diffused lighting, serene atmosphere, photorealistic architectural photography, shot on Phase One, 8k',
    'japandi style, low platform furniture in natural oak, bamboo shelving, stone surfaces, indoor fiddle leaf plant, natural light through shoji-inspired windows, photorealistic, architectural digest quality',
    'japandi interior, warm oatmeal and sand tones, tactile linen upholstery, rattan pendant lamp, exposed concrete wall texture, hand-thrown ceramic objects, professional architectural photography 4k',
    'japandi aesthetic, neutral palette with warm wood grain, minimal decor, single statement artwork, bamboo blinds, muted sage plant, photorealistic interior design photograph',
    'japandi home interior, organic shapes, warm whites and soft browns, textured walls, curated minimal objects, ambient floor lamp, dusk natural light, ultra high quality photo',
  ],
  'indian-modern': [
    'modern indian interior design, contemporary meets heritage, solid sheesham teak furniture, handbeaten brass accents, hand-blocked cotton textiles, warm terracotta and saffron palette, photorealistic architectural photography 8k',
    'modern indian interior, low teak sofa with vibrant cushions, brass floor lamp, handwoven dhurrie rug, terracotta pots, warm amber lighting, photorealistic interior photo, architectural digest style',
    'contemporary indian interior, carved wood furniture, brass hardware, block-print textiles, mud-plaster accent wall, warm pendant lighting, rich jewel tone accents, photorealistic 4k',
    'modern indian style, rosewood and brass tones, hand-painted ceramic accents, lattice jali screen, lime-washed wall texture, curated craft objects, professional interior photography',
    'contemporary indian home, warm terracotta floor, handloom textiles, natural teak furniture, brass chandelier, indoor plants, tropical natural light, ultra photorealistic interior photo',
  ],
  'contemporary': [
    'contemporary interior design, clean lines, high ceilings, large windows, neutral palette with bold accent, mixed materials wood and metal, photorealistic architectural photography 8k',
    'contemporary living space, architectural design, floating shelves, statement artwork, curved sofa, polished concrete floor, floor-to-ceiling glass, professional interior photography',
    'contemporary interior, warm whites and mid-century modern shapes, open plan, dramatic pendant lighting, textured rug, curated gallery wall, photorealistic interior design photo',
    'contemporary style interior, sleek cabinetry, integrated lighting, natural stone surfaces, minimal clutter, indoor plants, bright airy atmosphere, architectural photography',
    'contemporary modern home, streamlined furniture, contrasting textures, warm neutral palette, designer lighting, large art piece, photorealistic high quality interior photo',
  ],
  'luxury-modern': [
    'luxury modern interior design, high contrast drama, calacatta marble surfaces, brushed gold fixtures, deep velvet upholstery, smoked glass accents, cinematic professional photography 8k',
    'luxury interior, sculptural sofa in dark velvet, marble surfaces with gold veining, statement chandelier, rich jewel tones, ambient mood lighting, architectural digest premium photo',
    'high-end luxury interior, upholstered walls, floor-to-ceiling velvet curtains, marble coffee table, brushed brass accents, dramatic directional lighting, ultra premium photography 4k',
    'luxury modern home, dark fluted wood paneling, brushed gold hardware, marble and onyx surfaces, bespoke furniture, cinematic interior architectural photography',
    'opulent interior design, silk upholstery, crystal chandelier, book-matched marble walls, deep emerald and navy palette, luxury residential photography, architectural digest',
  ],
  'earthy-organic': [
    'earthy organic interior design, natural sustainable materials, terracotta, rattan, moss green, raw mango wood, clay textures, warm sunlit atmosphere, photorealistic interior photography 8k',
    'biophilic interior design, living wall of plants, terracotta floor tiles, rattan furniture, hand-thrown ceramic pots, warm natural sunlight, photorealistic 4k interior photo',
    'earthy organic interior, raw wood and linen, organic cotton textiles, woven rattan pendant, dried pampas grass, warm indirect amber light, cozy natural atmosphere, professional photography',
    'nature-inspired interior, mango wood furniture, tactile clay wall plaster, jute rug, indoor tropical plants, terracotta accents, golden hour natural lighting, architectural photography',
    'organic modern interior, live-edge wood, moss green and terracotta palette, hand-crafted ceramics, macramé wall art, abundant plants, warm natural light, photorealistic interior',
  ],
};

// Suffix added to ALL prompts for maximum photorealism
const REALISM_SUFFIX = 'ultra photorealistic, professional interior design photography, Canon EOS R5, 35mm lens, natural lighting, f/2.8, architectural digest, no people, high resolution 8k';

const NEGATIVE_PROMPT = 'ugly, blurry, low quality, distorted, oversaturated, cartoon, illustration, painting, render, 3d, anime, watermark, text, logo, cropped, missing features, duplicate, deformed, unnatural colors, unrealistic, sketch, drawing';

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
    const { imageBase64, styleKey, roomType, variationIndex = 0, customPrompt } = JSON.parse(event.body);

    let fullPrompt;
    if (customPrompt) {
      // Custom prompt from Phase 3 re-render (includes user's specific selections)
      fullPrompt = `${customPrompt}, ${REALISM_SUFFIX}`;
    } else {
      const prompts = THEME_PROMPTS[styleKey] || THEME_PROMPTS['japandi'];
      const basePrompt = prompts[variationIndex % prompts.length];
      const roomPrefix = ROOM_PREFIXES[roomType] || 'photorealistic interior,';
      fullPrompt = `${roomPrefix} ${basePrompt}, ${REALISM_SUFFIX}`;
    }

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
            image: imageBase64,
            prompt: fullPrompt,
            negative_prompt: NEGATIVE_PROMPT,
            guidance_scale: 12,
            num_inference_steps: 20,   // 20 steps = ~15-20s vs 50 steps = ~45-60s
            strength: 0.75,
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
