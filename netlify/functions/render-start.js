/* ─────────────────────────────────────────────────────────────────
   HODD · Render Start  (FLUX-schnell — text-to-image, 3-8s)
   POST /.netlify/functions/render-start
   Body: { styleKey, roomType, variationIndex?, customPrompt? }
   Returns: { id, status, output? }
───────────────────────────────────────────────────────────────── */

// Vastu-aware prompt builder (inline rules — no external import needed)
function buildVastuPrompt(doorDir, roomType, wantedFurniture = []) {
  const ZONE_COLORS = {
    NE:'cream or white', N:'soft green or aqua', NW:'white or light grey',
    W:'pale blue or white', SW:'earthy brown or tan', S:'coral or warm pink',
    SE:'warm amber or orange', E:'white or pale ivory',
  };
  const parts = ['vastu-compliant layout'];
  if (roomType === 'bedroom' || wantedFurniture.includes('bed')) parts.push('bed headboard against south or east wall');
  if (roomType === 'living' || wantedFurniture.includes('sofa')) parts.push('sofa against south or west wall with seating facing east');
  if (wantedFurniture.includes('tv-unit') || wantedFurniture.includes('desk')) parts.push('TV or electronics on southeast wall');
  if (roomType === 'kitchen') parts.push('cooking platform on southeast wall');
  if (roomType === 'office' || wantedFurniture.includes('desk')) parts.push('study desk facing east or north');
  if (ZONE_COLORS[doorDir]) parts.push(`walls in vastu-appropriate ${ZONE_COLORS[doorDir]} tones`);
  parts.push('centre of room open and uncluttered (Brahmasthana)');
  if (['NE','E'].includes(doorDir)) parts.push('natural light from northeast or east windows');
  return parts.join(', ');
}

const ROOM_PREFIXES = {
  living:     'photorealistic living room interior,',
  bedroom:    'photorealistic bedroom interior,',
  kitchen:    'photorealistic modern kitchen interior,',
  dining:     'photorealistic dining room interior,',
  bathroom:   'photorealistic luxury bathroom interior,',
  office:     'photorealistic home office interior,',
  workoffice: 'photorealistic modern office workspace interior,',
  kids:       'photorealistic kids bedroom interior,',
  studio:     'photorealistic studio apartment interior,',
};

const THEME_PROMPTS = {
  'japandi': [
    'japandi interior style, wabi-sabi minimalism, warm neutral tones, natural oak furniture, linen textiles, muted earth palette, soft diffused lighting, serene atmosphere, professional architectural photography',
    'japandi style living space, low platform furniture in natural oak, bamboo shelving, stone surfaces, indoor fiddle leaf plant, natural light through shoji-inspired windows, architectural digest quality',
    'japandi interior, warm oatmeal and sand tones, tactile linen upholstery, rattan pendant lamp, exposed concrete wall texture, hand-thrown ceramic objects, professional photography',
    'japandi aesthetic, neutral palette with warm wood grain, minimal decor, single statement artwork, bamboo blinds, muted sage plant, interior design photograph',
    'japandi home, organic shapes, warm whites and soft browns, textured walls, curated minimal objects, ambient floor lamp, dusk natural light',
  ],
  'indian-modern': [
    'modern indian interior design, contemporary meets heritage, solid sheesham teak furniture, handbeaten brass accents, hand-blocked cotton textiles, warm terracotta and saffron palette, architectural photography',
    'modern indian interior, teak sofa with vibrant cushions, brass floor lamp, handwoven dhurrie rug, terracotta pots, warm amber lighting, interior photo',
    'contemporary indian interior, carved wood furniture, brass hardware, block-print textiles, mud-plaster accent wall, warm pendant lighting, rich jewel tone accents',
    'modern indian style, rosewood and brass tones, hand-painted ceramic accents, lattice jali screen, lime-washed wall texture, curated craft objects, professional interior photography',
    'contemporary indian home, warm terracotta floor, handloom textiles, natural teak furniture, brass chandelier, indoor plants, tropical natural light',
  ],
  'contemporary': [
    'contemporary interior design, clean lines, high ceilings, large windows, neutral palette with bold accent, mixed materials wood and metal, architectural photography',
    'contemporary living space, floating shelves, statement artwork, curved sofa, polished concrete floor, floor-to-ceiling glass, professional interior photography',
    'contemporary interior, warm whites and mid-century modern shapes, open plan, dramatic pendant lighting, textured rug, curated gallery wall',
    'contemporary style interior, sleek cabinetry, integrated lighting, natural stone surfaces, minimal clutter, indoor plants, bright airy atmosphere',
    'contemporary modern home, streamlined furniture, contrasting textures, warm neutral palette, designer lighting, large art piece, photorealistic interior',
  ],
  'luxury-modern': [
    'luxury modern interior design, high contrast drama, calacatta marble surfaces, brushed gold fixtures, deep velvet upholstery, smoked glass accents, professional photography',
    'luxury interior, sculptural sofa in dark velvet, marble surfaces with gold veining, statement chandelier, rich jewel tones, ambient mood lighting',
    'high-end luxury interior, upholstered walls, floor-to-ceiling velvet curtains, marble coffee table, brushed brass accents, dramatic directional lighting',
    'luxury modern home, dark fluted wood paneling, brushed gold hardware, marble and onyx surfaces, bespoke furniture, cinematic interior architectural photography',
    'opulent interior design, silk upholstery, crystal chandelier, book-matched marble walls, deep emerald and navy palette, architectural digest',
  ],
  'earthy-organic': [
    'earthy organic interior design, natural sustainable materials, terracotta, rattan, moss green, raw mango wood, clay textures, warm sunlit atmosphere, interior photography',
    'biophilic interior design, living wall of plants, terracotta floor tiles, rattan furniture, hand-thrown ceramic pots, warm natural sunlight',
    'earthy organic interior, raw wood and linen, organic cotton textiles, woven rattan pendant, dried pampas grass, warm indirect amber light, cozy natural atmosphere',
    'nature-inspired interior, mango wood furniture, tactile clay wall plaster, jute rug, indoor tropical plants, terracotta accents, golden hour natural lighting',
    'organic modern interior, live-edge wood, moss green and terracotta palette, hand-crafted ceramics, macramé wall art, abundant plants, warm natural light',
  ],
};

const REALISM_SUFFIX = 'ultra photorealistic, professional interior design photography, Canon EOS R5, 35mm lens, natural lighting, no people, high resolution 8k, architectural digest quality';
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
    const { styleKey, roomType, variationIndex = 0, customPrompt, imageBase64, imageUrl, dims, furniture, constraints, city, vastuDoorDir } = JSON.parse(event.body);

    let fullPrompt;
    if (customPrompt) {
      fullPrompt = `${customPrompt}, ${REALISM_SUFFIX}`;
    } else {
      const prompts = THEME_PROMPTS[styleKey] || THEME_PROMPTS['japandi'];
      const basePrompt = prompts[variationIndex % prompts.length];
      const roomPrefix = ROOM_PREFIXES[roomType] || 'photorealistic interior,';

      // Build room-specific context from user inputs
      const parts = [];
      if (dims?.length && dims?.breadth) parts.push(`${dims.length}x${dims.breadth} foot room`);
      if (furniture?.existing?.length) parts.push(`keeping existing ${furniture.existing.slice(0,3).join(', ')}`);
      if (furniture?.wanted?.length) parts.push(`adding new ${furniture.wanted.slice(0,3).join(', ')}`);
      if (constraints?.includes('vastu')) {
        if (vastuDoorDir) {
          parts.push(buildVastuPrompt(vastuDoorDir, roomType, furniture?.wanted || []));
        } else {
          parts.push('vastu-compliant layout');
        }
      }
      if (constraints?.includes('rental')) parts.push('no permanent modifications, rental-friendly');
      if (constraints?.includes('kids')) parts.push('child-safe furniture choices');
      if (city) parts.push(`${city} home`);
      const roomContext = parts.length ? `, ${parts.join(', ')},` : ',';

      fullPrompt = `${roomPrefix} ${basePrompt}${roomContext} ${REALISM_SUFFIX}`;
    }

    let response;

    if (imageUrl) {
      // ── Frame-preserved: SDXL img2img using pre-uploaded image URL ──
      response = await fetch(
        'https://api.replicate.com/v1/models/stability-ai/sdxl/predictions',
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: {
              image: imageUrl,
              prompt: fullPrompt,
              negative_prompt: NEGATIVE_PROMPT,
              image_strength: 0.35,
              num_inference_steps: 30,
              guidance_scale: 8,
              width: 1024,
              height: 768,
            },
          }),
        }
      );
    } else {
      // ── FLUX-schnell: text-to-image (no photo uploaded) ──
      response = await fetch(
        'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: {
              prompt: fullPrompt,
              num_inference_steps: 4,
              width: 1024,
              height: 768,
              output_format: 'webp',
              output_quality: 90,
            },
          }),
        }
      );
    }

    if (!response.ok) {
      const err = await response.text();
      console.error('Replicate API error:', err);
      return { statusCode: response.status, headers, body: JSON.stringify({ error: err }) };
    }

    const prediction = await response.json();

    // FLUX with Prefer:wait may return completed result immediately
    if (prediction.status === 'succeeded' && prediction.output) {
      const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ id: prediction.id, status: 'succeeded', output: outputUrl }),
      };
    }

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
