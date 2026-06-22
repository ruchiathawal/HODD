/* ─────────────────────────────────────────────────────────────────
   HODD · Vastu Shastra Rules Engine
   Based on classical Vastu Vidya (Manasara, Mayamata texts)
   All directions are for the main entrance / plot orientation
───────────────────────────────────────────────────────────────── */

const VASTU = (() => {

  // ── 1. Auspiciousness of main door direction ─────────────────
  const DOOR_AUSPICIOUSNESS = {
    N:  { score: 9, label: 'Excellent', reason: 'North (Kubera) brings wealth & prosperity' },
    NE: { score: 10, label: 'Most Auspicious', reason: 'Northeast (Ishanya) — divine energy, ideal for entrance' },
    E:  { score: 9, label: 'Excellent', reason: 'East (Surya) — morning light, positive energy' },
    SE: { score: 5, label: 'Neutral', reason: 'Southeast (Agni) — acceptable if no alternative' },
    S:  { score: 3, label: 'Avoid', reason: 'South (Yama) — inauspicious for main entrance' },
    SW: { score: 2, label: 'Inauspicious', reason: 'Southwest (Nairutya) — causes instability & health issues' },
    W:  { score: 7, label: 'Good', reason: 'West (Varuna) — good for prosperity' },
    NW: { score: 7, label: 'Good', reason: 'Northwest (Vayu) — good for business owners' },
  };

  // ── 2. Ideal room placement by compass zone ──────────────────
  const ROOM_ZONES = {
    living:   { ideal: ['N','NE','E','NW'],  avoid: ['SW'],      reason: 'Living room in North or East draws positive energy for social gatherings' },
    bedroom:  { ideal: ['SW','S','W'],       avoid: ['NE','SE'], reason: 'Master bedroom in Southwest gives stability and sound sleep' },
    kitchen:  { ideal: ['SE','NW'],          avoid: ['NE','SW'], reason: 'Kitchen in Southeast (Agni zone) aligns with fire element' },
    dining:   { ideal: ['W','E'],            avoid: ['S'],       reason: 'Dining in West promotes satisfaction; facing East while eating is best' },
    bathroom: { ideal: ['NW','W'],           avoid: ['NE','SW','SE'], reason: 'Bathrooms in Northwest or West are acceptable; never in sacred NE' },
    office:   { ideal: ['N','NE','E'],       avoid: ['S','SW'],  reason: 'Office/study in North or Northeast enhances concentration' },
    kids:     { ideal: ['W','NW'],           avoid: ['SW'],      reason: "Children's room in West promotes creativity and discipline" },
    studio:   { ideal: ['N','E'],            avoid: ['SW'],      reason: 'Studio space in North or East supports creativity' },
  };

  // ── 3. Furniture placement rules by room ─────────────────────
  const FURNITURE_RULES = {
    bed: {
      headDirection: ['S','E'],
      avoid: ['N'],
      reason: 'Head towards South or East during sleep; North disturbs magnetic field and causes health issues',
    },
    sofa: {
      faceDirection: ['E','N'],
      placement: ['S wall','W wall'],
      reason: 'Sofa against South or West wall, occupants face East or North',
    },
    'dining-table': {
      placement: ['W zone','center-W'],
      faceWhileEating: ['E','N'],
      reason: 'Dining table in West zone; family should face East or North while eating',
    },
    desk: {
      faceDirection: ['E','N'],
      avoid: ['S','W'],
      reason: 'Study/work desk facing East or North enhances focus and memory',
    },
    'tv-unit': {
      placement: ['SE wall','E wall'],
      avoid: ['NE','SW'],
      reason: 'TV/electronics in Southeast (fire element); never in sacred Northeast',
    },
    wardrobe: {
      placement: ['SW wall','S wall','W wall'],
      avoid: ['NE','N','E'],
      reason: 'Heavy storage on South or West/Southwest walls',
    },
    bookshelf: {
      placement: ['E wall','N wall'],
      avoid: ['S','W'],
      reason: 'Books and knowledge items in East or North (Kubera/Surya zones)',
    },
    'center-table': {
      placement: ['center','slightly-E'],
      avoid: ['exact-center-of-brahmasthana'],
      reason: 'Center table slightly east of center; keep Brahmasthana (room center) as open as possible',
    },
  };

  // ── 4. Colors by direction/zone ──────────────────────────────
  const ZONE_COLORS = {
    NE: { good: ['#FFFDE7','#F5F5F5','#E8F5E9'], names: ['Cream','White','Pale green'], element: 'Water/Earth' },
    N:  { good: ['#E8F5E9','#C8E6C9','#B2EBF2'], names: ['Green','Light green','Aqua'], element: 'Water' },
    NW: { good: ['#F5F5F5','#ECEFF1','#CFD8DC'], names: ['White','Light grey','Silver'], element: 'Air' },
    W:  { good: ['#E3F2FD','#BBDEFB','#F5F5F5'], names: ['Blue','Light blue','White'], element: 'Water' },
    SW: { good: ['#EFEBE9','#D7CCC8','#BCAAA4'], names: ['Brown','Earthy','Tan'], element: 'Earth' },
    S:  { good: ['#FFEBEE','#FFCDD2','#EF9A9A'], names: ['Coral','Pink','Light red'], element: 'Fire' },
    SE: { good: ['#FFF3E0','#FFE0B2','#FFCC80'], names: ['Orange','Amber','Warm yellow'], element: 'Fire' },
    E:  { good: ['#FFFDE7','#FFF9C4','#FFFFFF'], names: ['White','Pale yellow','Ivory'], element: 'Air/Space' },
  };

  // ── 5. Brahmasthana (centre) rules ──────────────────────────
  const BRAHMASTHANA = {
    rule: 'Keep the central zone of the room open and uncluttered',
    avoid: ['heavy furniture','pillars','toilets','stairs','clutter'],
    encourage: ['open space','light','circulation area'],
  };

  // ── 6. Lighting rules ────────────────────────────────────────
  const LIGHTING_RULES = {
    NE: 'Natural light from Northeast is most sacred — keep windows here unobstructed',
    E:  'Eastern windows for morning sunlight — essential for positive energy',
    SE: 'Good for kitchen lighting; warm tones',
    SW: 'Avoid large windows in Southwest — minimise openings here',
    S:  'South windows acceptable but add shading to reduce heat',
  };

  // ── 7. Compute vastu score & recommendations ─────────────────
  function analyse({ doorDir, roomType, furniture = [], roomZone = null }) {
    const tips = [];
    const warnings = [];
    let score = 6; // default neutral

    // Door direction
    const door = DOOR_AUSPICIOUSNESS[doorDir];
    if (door) {
      score = Math.round((score + door.score) / 2);
      if (door.score >= 8) tips.push(`✓ Main door faces ${doorDir} — ${door.reason}`);
      else if (door.score <= 4) warnings.push(`⚠ Main door faces ${doorDir} — ${door.reason}. Consider a nameplate with Om or Swastik symbol at entrance.`);
    }

    // Room zone (if user's room is in a specific part of the flat)
    const roomRules = ROOM_ZONES[roomType];
    if (roomRules && roomZone) {
      if (roomRules.ideal.includes(roomZone)) {
        score = Math.min(10, score + 1);
        tips.push(`✓ ${capitalize(roomType)} in ${roomZone} zone — ${roomRules.reason}`);
      } else if (roomRules.avoid.includes(roomZone)) {
        score = Math.max(1, score - 2);
        warnings.push(`⚠ ${capitalize(roomType)} in ${roomZone} zone — ${roomRules.reason}`);
      }
    }

    // Furniture rules
    furniture.forEach(item => {
      const rule = FURNITURE_RULES[item];
      if (rule) tips.push(`• ${item}: ${rule.reason}`);
    });

    // Brahmasthana reminder
    tips.push(`• Keep the room's centre (Brahmasthana) open — avoid placing heavy furniture in the exact middle`);

    // Zone colour recommendation
    const effectiveZone = roomZone || doorDir;
    const colorInfo = ZONE_COLORS[effectiveZone];
    if (colorInfo) {
      tips.push(`• Recommended wall colours for ${effectiveZone} zone: ${colorInfo.names.join(', ')} (${colorInfo.element} element)`);
    }

    return {
      score: Math.min(10, Math.max(1, score)),
      tips,
      warnings,
      doorAuspiciousness: door,
      roomGuidance: roomRules,
      colorRecommendation: colorInfo,
    };
  }

  // ── 8. Build prompt fragment for AI image generation ─────────
  function buildPromptFragment({ doorDir, roomType, furniture = [] }) {
    const parts = [];
    const roomRules = ROOM_ZONES[roomType];

    // Furniture placement
    const bedRule = FURNITURE_RULES['bed'];
    const sofaRule = FURNITURE_RULES['sofa'];
    const tvRule = FURNITURE_RULES['tv-unit'];
    const deskRule = FURNITURE_RULES['desk'];

    if (furniture.includes('bed') || roomType === 'bedroom') {
      parts.push(`bed headboard against south or east wall (vastu: head points South or East)`);
    }
    if (furniture.includes('sofa') || roomType === 'living') {
      parts.push(`sofa against south or west wall with seating facing east or north`);
    }
    if (furniture.includes('tv-unit') || furniture.includes('desk')) {
      parts.push(`TV unit or electronics on southeast wall`);
    }
    if (furniture.includes('desk') || roomType === 'office') {
      parts.push(`study desk facing east or north`);
    }
    if (roomType === 'kitchen') {
      parts.push(`cooking platform on southeast wall, cook facing east`);
    }

    // Colours
    const colorInfo = ZONE_COLORS[doorDir];
    if (colorInfo) {
      parts.push(`walls in vastu-appropriate ${colorInfo.names[0].toLowerCase()} or ${colorInfo.names[1].toLowerCase()} tones`);
    }

    // Brahmasthana
    parts.push(`centre of room kept open and uncluttered (Brahmasthana)`);

    // Natural light
    if (['NE','E'].includes(doorDir)) {
      parts.push(`natural light from northeast or east windows unobstructed`);
    }

    return parts.length ? `vastu-compliant layout: ${parts.join(', ')}` : 'vastu-compliant layout';
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  return { DOOR_AUSPICIOUSNESS, ROOM_ZONES, FURNITURE_RULES, ZONE_COLORS, BRAHMASTHANA, analyse, buildPromptFragment };
})();
