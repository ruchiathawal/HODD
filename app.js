/* ═══════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════ */
const state = {
  room: null, style: [], city: '', budget: { label: 'Mid-Range', value: '₹2,00,000', tier: 2 },
  constraints: new Set(), notes: '',
  uploadedFiles: [], referencePhoto: null,
  dims: { length: 18, breadth: 14, height: 10 },
  shape: 'rectangle',
  pillars: [],
  selectedDesign: null, favDesigns: new Set(), compareDesigns: new Set(),
  wallColor: '#f5ede0', sofa: 'modular', floor: 'wood', lighting: 'warm',
  decor: { plant: true, art: true, rug: false, curtains: false },
  cart: [], phase: 1,
};

const BUDGET_DATA = [
  { label: 'Budget-Friendly', value: '₹50,000',    tier: 0 },
  { label: 'Budget-Friendly', value: '₹1,00,000',  tier: 0 },
  { label: 'Mid-Range',       value: '₹2,00,000',  tier: 1 },
  { label: 'Mid-Range',       value: '₹5,00,000',  tier: 1 },
  { label: 'Premium',         value: '₹8,00,000',  tier: 2 },
  { label: 'Luxury',          value: '₹10,00,000+', tier: 3 },
];

/* ═══════════════════════════════════════════════════════════════
   SCREEN & PHASE MANAGEMENT
═══════════════════════════════════════════════════════════════ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setProgress(phase, total = 5) {
  state.phase = phase;
  document.getElementById('progressFill').style.width = `${(phase / total) * 100}%`;
  document.getElementById('stepLabel').textContent = `Step ${phase} of ${total}`;
}

function showPhase(n) {
  for (let i = 1; i <= 5; i++) document.getElementById(`phase${i}`).classList.toggle('hidden', i !== n);
  setProgress(n);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  autosave();
}

function startFlow() { showScreen('wizard'); showPhase(1); }
function quickStart(card) { state.style = [card.dataset.style]; startFlow(); }

function wizardBack() {
  if (state.phase <= 1) { showScreen('landing'); return; }
  showPhase(state.phase - 1);
}

function restart() {
  state.room = null; state.style = []; state.cart = [];
  state.favDesigns.clear(); state.compareDesigns.clear(); state.selectedDesign = null;
  state.uploadedFiles = []; state.referencePhoto = null;
  document.querySelectorAll('.chip.selected,.room-chip.selected').forEach(c => c.classList.remove('selected'));
  document.getElementById('uploadedGrid').innerHTML = '';
  const rs = document.getElementById('refStrip'); if (rs) rs.remove();
  updateUploadBadge();
  showScreen('landing');
}

/* ═══════════════════════════════════════════════════════════════
   PHASE 1 · INPUT ENGINE
═══════════════════════════════════════════════════════════════ */
function selectRoom(el) {
  document.querySelectorAll('.room-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.room = el.dataset.room;
  autosave();
}

function selectStyle(el) {
  const key = el.dataset.style;
  if (state.style.includes(key)) {
    state.style = state.style.filter(s => s !== key);
  } else {
    if (state.style.length >= 2) state.style.shift();
    state.style.push(key);
  }
  renderStyleCards();
  autosave();
}

function toggleConstraint(key, val) { val ? state.constraints.add(key) : state.constraints.delete(key); }

function updateBudget(val) {
  const d = BUDGET_DATA[val];
  state.budget = d;
  document.getElementById('budgetDisplay').textContent = d.value;
  document.getElementById('budgetTier').textContent = d.label;
  document.getElementById('budgetTier').style.background =
    d.label === 'Luxury' ? 'rgba(251,191,36,.2)' : d.label === 'Premium' ? 'rgba(52,211,153,.15)' : 'rgba(139,92,246,.15)';
  autosave();
}

/* real file upload ─────────────────────────────────────────── */
function handleFileSelect(files) {
  [...files].forEach(file => {
    if (state.uploadedFiles.length >= 8) return;
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => addUploadThumb({ type: 'image', src: e.target.result, name: file.name });
      reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      addUploadThumb({ type: 'pdf', src: null, name: file.name });
    }
  });
  // reset so same file can be re-selected
  document.getElementById('fileInput').value = '';
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag-over');
  if (e.dataTransfer?.files?.length) handleFileSelect(e.dataTransfer.files);
}

function addUploadThumb(file) {
  state.uploadedFiles.push(file);
  const grid = document.getElementById('uploadedGrid');
  const thumb = document.createElement('div');
  thumb.className = 'uploaded-thumb';
  thumb.dataset.index = state.uploadedFiles.length - 1;

  if (file.type === 'image') {
    const img = document.createElement('img');
    img.src = file.src;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
    thumb.appendChild(img);
  } else {
    thumb.innerHTML = `<div class="pdf-thumb"><span class="pdf-icon">📄</span><span class="pdf-name">${truncate(file.name, 12)}</span></div>`;
  }

  // remove button
  const rm = document.createElement('button');
  rm.className = 'thumb-remove';
  rm.textContent = '✕';
  rm.onclick = e => { e.stopPropagation(); removeUpload(thumb, parseInt(thumb.dataset.index)); };
  thumb.appendChild(rm);
  grid.appendChild(thumb);

  // use first image as reference photo for renders
  if (file.type === 'image' && !state.referencePhoto) {
    state.referencePhoto = file.src;
    updateUploadBadge();
  }
}

function removeUpload(thumb, idx) {
  const file = state.uploadedFiles[idx];
  if (file?.src === state.referencePhoto) {
    state.referencePhoto = state.uploadedFiles.find((f, i) => i !== idx && f.type === 'image')?.src || null;
  }
  state.uploadedFiles.splice(idx, 1);
  thumb.remove();
  // re-index remaining thumbs
  document.querySelectorAll('.uploaded-thumb').forEach((t, i) => t.dataset.index = i);
  updateUploadBadge();
}

function updateUploadBadge() {
  const zone = document.getElementById('uploadZone');
  const sub = zone.querySelector('.upload-sub');
  if (state.referencePhoto) {
    zone.style.borderColor = 'var(--accent)';
    zone.style.background = 'rgba(139,92,246,.06)';
    if (sub) sub.textContent = '✓ Reference photo set — AI will use this for your renders';
  } else {
    zone.style.borderColor = '';
    zone.style.background = '';
    if (sub) sub.textContent = 'JPG, PNG, HEIC, WebP, PDF · Multiple files supported';
  }
}

function truncate(str, n) { return str.length > n ? str.slice(0, n - 1) + '…' : str; }

/* ═══════════════════════════════════════════════════════════════
   ROOM LAYOUT INPUTS
═══════════════════════════════════════════════════════════════ */
function updateDim(axis, val) {
  const v = parseFloat(val) || 0;
  state.dims[axis] = v;
  const area = (state.dims.length * state.dims.breadth).toFixed(0);
  const badge = document.getElementById('dimAreaBadge');
  badge.textContent = area > 0 ? `${area} sq ft` : '— sq ft';
}

function selectShape(btn) {
  document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.shape = btn.dataset.shape;
}

/* ── Pillar form ─────────────────────────────────────────────── */
function openPillarForm() { document.getElementById('pillarForm').classList.remove('hidden'); }
function closePillarForm() { document.getElementById('pillarForm').classList.add('hidden'); }

function addPillar() {
  const pos = document.getElementById('pillarPos').value;
  const w = parseFloat(document.getElementById('pillarW').value) || 1.5;
  const d = parseFloat(document.getElementById('pillarD').value) || 1.5;
  const pillar = { pos, w, d, id: Date.now() };
  state.pillars.push(pillar);
  renderPillarChips();
  closePillarForm();
  document.getElementById('pillarW').value = '';
  document.getElementById('pillarD').value = '';
}

function removePillar(id) {
  state.pillars = state.pillars.filter(p => p.id !== id);
  renderPillarChips();
}

const PILLAR_LABELS = {
  'top-left': 'Top-Left', 'top-right': 'Top-Right',
  'bottom-left': 'Bot-Left', 'bottom-right': 'Bot-Right',
  'top-wall': 'Top wall', 'left-wall': 'Left wall',
  'right-wall': 'Right wall', 'bottom-wall': 'Bot wall',
  'center': 'Centre',
};

function renderPillarChips() {
  const list = document.getElementById('pillarList');
  list.innerHTML = '';
  state.pillars.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'pillar-chip';
    chip.innerHTML = `🟧 ${PILLAR_LABELS[p.pos]} · ${p.w}×${p.d} ft <button class="pillar-chip-remove" onclick="removePillar(${p.id})">✕</button>`;
    list.appendChild(chip);
  });
}

/* ═══════════════════════════════════════════════════════════════
   STYLE THEMES — visual data for selector + renders
═══════════════════════════════════════════════════════════════ */
const STYLE_THEMES = {
  'japandi': {
    name: 'Japandi', tag: 'Wabi-sabi calm · neutral warmth',
    palette: ['#d4c5b0','#8b7d6b','#5a4e3f','#2d2820','#c8bba8'],
    img: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=600&q=80',
    bg: ['#2a2218','#3d3120','#1a1510'],
    scene: (w,h) => `
      <!-- Japandi: low platform sofa, bamboo plant, shoji-screen light, minimal art -->
      <rect width="${w}" height="${h}" fill="#2a2218"/>
      <rect x="0" y="${h*.55}" width="${w}" height="${h*.45}" fill="#1e1a12"/>
      <!-- shoji screen / window light -->
      <rect x="${w*.02}" y="${h*.05}" width="${w*.12}" height="${h*.5}" fill="#d4c5b0" opacity=".07"/>
      <line x1="${w*.08}" y1="${h*.05}" x2="${w*.08}" y2="${h*.55}" stroke="#d4c5b008" stroke-width="1"/>
      <line x1="${w*.02}" y1="${h*.22}" x2="${w*.14}" y2="${h*.22}" stroke="#d4c5b008" stroke-width="1"/>
      <!-- single minimal wall art -->
      <rect x="${w*.35}" y="${h*.08}" width="${w*.22}" height="${h*.28}" rx="2" fill="none" stroke="#8b7d6b" stroke-width="1" opacity=".4"/>
      <line x1="${w*.39}" y1="${h*.18}" x2="${w*.53}" y2="${h*.30}" stroke="#8b7d6b" stroke-width=".8" opacity=".3"/>
      <!-- low platform sofa -->
      <rect x="${w*.12}" y="${h*.58}" width="${w*.55}" height="${h*.14}" rx="3" fill="#c8bba8" opacity=".3"/>
      <rect x="${w*.12}" y="${h*.55}" width="${w*.55}" height="${h*.07}" rx="2" fill="#d4c5b0" opacity=".38"/>
      <rect x="${w*.12}" y="${h*.56}" width="${w*.06}" height="${h*.16}" rx="2" fill="#d4c5b0" opacity=".4"/>
      <rect x="${w*.61}" y="${h*.56}" width="${w*.06}" height="${h*.16}" rx="2" fill="#d4c5b0" opacity=".4"/>
      <!-- single linen pillow -->
      <rect x="${w*.27}" y="${h*.56}" width="${w*.12}" height="${h*.06}" rx="4" fill="#8b7d6b" opacity=".55"/>
      <!-- thin coffee table -->
      <rect x="${w*.25}" y="${h*.73}" width="${w*.28}" height="${h*.05}" rx="2" fill="#5a4e3f" opacity=".55"/>
      <!-- bamboo plant (tall, slender) -->
      <rect x="${w*.74}" y="${h*.3}" width="${w*.02}" height="${h*.42}" rx="2" fill="#5a4e3f" opacity=".5"/>
      <ellipse cx="${w*.75}" cy="${h*.28}" rx="${w*.07}" ry="${h*.1}" fill="#6b7c4a" opacity=".45"/>
      <ellipse cx="${w*.72}" cy="${h*.22}" rx="${w*.05}" ry="${h*.07}" fill="#5a6b3a" opacity=".38"/>
      <ellipse cx="${w*.79}" cy="${h*.25}" rx="${w*.04}" ry="${h*.06}" fill="#6b7c4a" opacity=".4"/>
      <!-- small ceramic object on table -->
      <ellipse cx="${w*.34}" cy="${h*.73}" rx="${w*.02}" ry="${h*.03}" fill="#c8bba8" opacity=".4"/>`,
  },

  'modern-minimal': {
    name: 'Modern Minimal', tag: 'Clean geometry · pure whites',
    palette: ['#f0ede6','#d8d4cc','#9a9690','#4a4845','#1e1c1a'],
    img: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=600&q=80',
    bg: ['#1a1a1c','#28282c','#111114'],
    scene: (w,h) => `
      <!-- Modern Minimal: bright white walls, floating shelves, sleek sofa, pendant -->
      <rect width="${w}" height="${h}" fill="#1a1a1c"/>
      <rect x="0" y="${h*.52}" width="${w}" height="${h*.48}" fill="#111114"/>
      <!-- bright white wall panel -->
      <rect x="${w*.05}" y="${h*.04}" width="${w*.9}" height="${h*.5}" rx="3" fill="#f0ede6" opacity=".07"/>
      <!-- floating shelf with objects -->
      <rect x="${w*.22}" y="${h*.22}" width="${w*.45}" height="${w*.018}" rx="1" fill="#d8d4cc" opacity=".45"/>
      <rect x="${w*.26}" y="${h*.14}" width="${w*.06}" height="${h*.08}" rx="1" fill="#9a9690" opacity=".35"/>
      <rect x="${w*.34}" y="${h*.17}" width="${w*.04}" height="${h*.05}" rx="1" fill="#d8d4cc" opacity=".3"/>
      <ellipse cx="${w*.44}" cy="${h*.21}" rx="${w*.025}" ry="${h*.04}" fill="#d8d4cc" opacity=".4"/>
      <!-- sleek low sofa — sharp edges -->
      <rect x="${w*.1}" y="${h*.57}" width="${w*.58}" height="${h*.12}" rx="2" fill="#4a4845" opacity=".6"/>
      <rect x="${w*.1}" y="${h*.54}" width="${w*.58}" height="${h*.05}" rx="2" fill="#9a9690" opacity=".35"/>
      <rect x="${w*.1}" y="${h*.54}" width="${w*.025}" height="${h*.15}" rx="1" fill="#9a9690" opacity=".4"/>
      <rect x="${w*.655}" y="${h*.54}" width="${w*.025}" height="${h*.15}" rx="1" fill="#9a9690" opacity=".4"/>
      <!-- geometric pillows -->
      <rect x="${w*.18}" y="${h*.55}" width="${w*.1}" height="${h*.05}" rx="1" fill="#f0ede6" opacity=".2"/>
      <rect x="${w*.30}" y="${h*.55}" width="${w*.08}" height="${h*.05}" rx="1" fill="#9a9690" opacity=".25"/>
      <!-- rectangular glass coffee table -->
      <rect x="${w*.22}" y="${h*.72}" width="${w*.28}" height="${h*.04}" rx="1" fill="#d8d4cc" opacity=".15"/>
      <rect x="${w*.23}" y="${h*.72}" width="${w*.01}" height="${h*.07}" fill="#d8d4cc" opacity=".2"/>
      <rect x="${w*.49}" y="${h*.72}" width="${w*.01}" height="${h*.07}" fill="#d8d4cc" opacity=".2"/>
      <!-- pendant light (geometric) -->
      <line x1="${w*.5}" y1="${h*.0}" x2="${w*.5}" y2="${h*.16}" stroke="#d8d4cc" stroke-width="1" opacity=".3"/>
      <polygon points="${w*.44},${h*.16} ${w*.56},${h*.16} ${w*.53},${h*.24} ${w*.47},${h*.24}" fill="#d8d4cc" opacity=".18" stroke="#d8d4cc" stroke-width=".8"/>`,
  },

  'scandinavian': {
    name: 'Scandinavian', tag: 'Hygge warmth · birch & linen',
    palette: ['#f5f0e8','#d4c8b0','#9b8c78','#5c4f3d','#8fa88a'],
    img: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=600&q=80',
    bg: ['#221e18','#332e26','#16140f'],
    scene: (w,h) => `
      <!-- Scandi: birch furniture, candles, throw blanket, plants, cozy -->
      <rect width="${w}" height="${h}" fill="#221e18"/>
      <rect x="0" y="${h*.54}" width="${w}" height="${h*.46}" fill="#1a1710"/>
      <!-- warm light from window -->
      <rect x="0" y="${h*.0}" width="${w*.16}" height="${h*.56}" fill="#f5f0e8" opacity=".05"/>
      <!-- birch-tone art / gallery wall -->
      <rect x="${w*.28}" y="${h*.07}" width="${w*.14}" height="${h*.2}" rx="2" fill="#d4c8b0" opacity=".22"/>
      <rect x="${w*.44}" y="${h*.07}" width="${w*.18}" height="${h*.25}" rx="2" fill="#d4c8b0" opacity=".15"/>
      <rect x="${w*.64}" y="${h*.1}" width="${w*.1}" height="${h*.14}" rx="2" fill="#d4c8b0" opacity=".18"/>
      <!-- comfy rounded sofa with throw -->
      <rect x="${w*.1}" y="${h*.56}" width="${w*.56}" height="${h*.15}" rx="8" fill="#9b8c78" opacity=".4"/>
      <rect x="${w*.1}" y="${h*.54}" width="${w*.56}" height="${h*.06}" rx="6" fill="#d4c8b0" opacity=".35"/>
      <rect x="${w*.1}" y="${h*.55}" width="${w*.08}" height="${h*.16}" rx="6" fill="#d4c8b0" opacity=".42"/>
      <rect x="${w*.58}" y="${h*.55}" width="${w*.08}" height="${h*.16}" rx="6" fill="#d4c8b0" opacity=".42"/>
      <!-- throw blanket draped -->
      <path d="M${w*.48},${h*.55} Q${w*.52},${h*.62} ${w*.56},${h*.7}" fill="none" stroke="#8fa88a" stroke-width="${w*.04}" opacity=".4" stroke-linecap="round"/>
      <!-- chunky pillows -->
      <rect x="${w*.17}" y="${h*.55}" width="${w*.13}" height="${h*.06}" rx="5" fill="#f5f0e8" opacity=".25"/>
      <rect x="${w*.32}" y="${h*.55}" width="${w*.1}" height="${h*.06}" rx="5" fill="#d4c8b0" opacity=".28"/>
      <!-- birch round coffee table -->
      <ellipse cx="${w*.46}" cy="${h*.76}" rx="${w*.14}" ry="${h*.05}" fill="#9b8c78" opacity=".35"/>
      <!-- 3 candles on table -->
      <rect x="${w*.41}" y="${h*.7}" width="${w*.015}" height="${h*.06}" fill="#d4c8b0" opacity=".45"/>
      <rect x="${w*.46}" y="${h*.67}" width="${w*.015}" height="${h*.09}" fill="#d4c8b0" opacity=".45"/>
      <rect x="${w*.51}" y="${h*.71}" width="${w*.015}" height="${h*.05}" fill="#d4c8b0" opacity=".45"/>
      <circle cx="${w*.415}" cy="${h*.69}" r="2" fill="#fbbf24" opacity=".6"/>
      <circle cx="${w*.468}" cy="${h*.66}" r="2" fill="#fbbf24" opacity=".6"/>
      <circle cx="${w*.518}" cy="${h*.7}" r="2" fill="#fbbf24" opacity=".6"/>
      <!-- potted plant cluster -->
      <rect x="${w*.78}" y="${h*.48}" width="${w*.025}" height="${h*.24}" rx="2" fill="#5c4f3d" opacity=".5"/>
      <ellipse cx="${w*.79}" cy="${h*.46}" rx="${w*.06}" ry="${h*.09}" fill="#8fa88a" opacity=".5"/>
      <ellipse cx="${w*.76}" cy="${h*.5}" rx="${w*.04}" ry="${h*.06}" fill="#6b8a6b" opacity=".4"/>`,
  },

  'contemporary': {
    name: 'Contemporary', tag: 'Bold contrast · curated eclecticism',
    palette: ['#e8e0d4','#b8a898','#6b5c50','#3d2e28','#7a9898'],
    img: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=600&q=80',
    bg: ['#1e1a16','#2e2820','#131008'],
    scene: (w,h) => `
      <!-- Contemporary: bold geometric art, mixed materials, statement furniture -->
      <rect width="${w}" height="${h}" fill="#1e1a16"/>
      <rect x="0" y="${h*.53}" width="${w}" height="${h*.47}" fill="#13100a"/>
      <!-- large statement art panel -->
      <rect x="${w*.22}" y="${h*.05}" width="${w*.44}" height="${h*.34}" rx="3" fill="#3d2e28" opacity=".6"/>
      <rect x="${w*.25}" y="${h*.08}" width="${w*.38}" height="${h*.28}" rx="2" fill="#7a9898" opacity=".2"/>
      <circle cx="${w*.44}" cy="${h*.22}" r="${w*.08}" fill="none" stroke="#b8a898" stroke-width="1.5" opacity=".35"/>
      <line x1="${w*.28}" y1="${h*.34}" x2="${w*.6}" y2="${h*.1}" stroke="#b8a898" stroke-width="1" opacity=".2"/>
      <!-- sleek sectional sofa -->
      <rect x="${w*.08}" y="${h*.56}" width="${w*.65}" height="${h*.13}" rx="4" fill="#6b5c50" opacity=".55"/>
      <rect x="${w*.08}" y="${h*.54}" width="${w*.65}" height="${h*.05}" rx="3" fill="#b8a898" opacity=".3"/>
      <!-- chaise section -->
      <rect x="${w*.6}" y="${h*.56}" width="${w*.13}" height="${h*.24}" rx="4" fill="#6b5c50" opacity=".45"/>
      <!-- mixed pillows -->
      <rect x="${w*.14}" y="${h*.55}" width="${w*.11}" height="${h*.05}" rx="3" fill="#e8e0d4" opacity=".22"/>
      <rect x="${w*.27}" y="${h*.55}" width="${w*.09}" height="${h*.05}" rx="3" fill="#7a9898" opacity=".3"/>
      <rect x="${w*.38}" y="${h*.55}" width="${w*.07}" height="${h*.05}" rx="3" fill="#b8a898" opacity=".25"/>
      <!-- oval marble coffee table -->
      <ellipse cx="${w*.38}" cy="${h*.75}" rx="${w*.16}" ry="${h*.05}" fill="#e8e0d4" opacity=".12" stroke="#b8a898" stroke-width=".8"/>
      <!-- floor lamp arc -->
      <path d="M${w*.82},${h*.82} L${w*.82},${h*.2} Q${w*.82},${h*.06} ${w*.55},${h*.06}" fill="none" stroke="#b8a898" stroke-width="1.5" opacity=".35"/>
      <circle cx="${w*.55}" cy="${h*.06}" r="${w*.025}" fill="#fbbf24" opacity=".3"/>`,
  },

  'bohemian': {
    name: 'Bohemian', tag: 'Layered textiles · global eclecticism',
    palette: ['#c97c4a','#9b4f2a','#8b6914','#4a3208','#6b8a5a'],
    img: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=600&q=80',
    bg: ['#2a1a0a','#3d2a15','#1a0f05'],
    scene: (w,h) => `
      <!-- Boho: macramé, hanging plants, layered rugs, eclectic pillows, warm amber -->
      <rect width="${w}" height="${h}" fill="#2a1a0a"/>
      <rect x="0" y="${h*.55}" width="${w}" height="${h*.45}" fill="#1a1005"/>
      <!-- tapestry / wall hanging -->
      <rect x="${w*.25}" y="${h*.03}" width="${w*.3}" height="${h*.35}" rx="2" fill="#9b4f2a" opacity=".25"/>
      <line x1="${w*.28}" y1="${h*.08}" x2="${w*.28}" y2="${h*.38}" stroke="#c97c4a" stroke-width=".8" opacity=".25"/>
      <line x1="${w*.34}" y1="${h*.06}" x2="${w*.34}" y2="${h*.38}" stroke="#8b6914" stroke-width=".8" opacity=".22"/>
      <line x1="${w*.40}" y1="${h*.08}" x2="${w*.40}" y2="${h*.38}" stroke="#c97c4a" stroke-width=".8" opacity=".25"/>
      <line x1="${w*.46}" y1="${h*.06}" x2="${w*.46}" y2="${h*.36}" stroke="#9b4f2a" stroke-width=".8" opacity=".2"/>
      <!-- fringe at bottom of tapestry -->
      ${[...Array(8)].map((_,i)=>`<line x1="${w*(.27+i*.03)}" y1="${h*.38}" x2="${w*(.26+i*.03)}" y2="${h*.44}" stroke="#c97c4a" stroke-width=".7" opacity=".3"/>`).join('')}
      <!-- hanging plants from ceiling -->
      <line x1="${w*.15}" y1="${h*.0}" x2="${w*.15}" y2="${h*.22}" stroke="#6b8a5a" stroke-width=".8" opacity=".4"/>
      <ellipse cx="${w*.15}" cy="${h*.26}" rx="${w*.06}" ry="${h*.1}" fill="#6b8a5a" opacity=".45"/>
      <ellipse cx="${w*.12}" cy="${h*.2}" rx="${w*.04}" ry="${h*.06}" fill="#4a6a3a" opacity=".4"/>
      <line x1="${w*.75}" y1="${h*.0}" x2="${w*.75}" y2="${h*.18}" stroke="#6b8a5a" stroke-width=".8" opacity=".4"/>
      <ellipse cx="${w*.75}" cy="${h*.22}" rx="${w*.05}" ry="${h*.08}" fill="#6b8a5a" opacity=".4"/>
      <!-- low floor seating + cushions -->
      <rect x="${w*.1}" y="${h*.62}" width="${w*.5}" height="${h*.1}" rx="6" fill="#9b4f2a" opacity=".45"/>
      <rect x="${w*.1}" y="${h*.6}" width="${w*.5}" height="${h*.04}" rx="4" fill="#c97c4a" opacity=".35"/>
      <!-- eclectic pillows -->
      <rect x="${w*.14}" y="${h*.61}" width="${w*.1}" height="${h*.08}" rx="5" fill="#8b6914" opacity=".55"/>
      <rect x="${w*.26}" y="${h*.61}" width="${w*.09}" height="${h*.08}" rx="5" fill="#c97c4a" opacity=".5"/>
      <rect x="${w*.37}" y="${h*.61}" width="${w*.08}" height="${h*.08}" rx="5" fill="#9b4f2a" opacity=".5"/>
      <!-- layered rugs -->
      <ellipse cx="${w*.38}" cy="${h*.77}" rx="${w*.3}" ry="${h*.07}" fill="#8b6914" opacity=".25"/>
      <ellipse cx="${w*.35}" cy="${h*.77}" rx="${w*.2}" ry="${h*.05}" fill="#c97c4a" opacity=".2"/>
      <!-- moroccan lantern -->
      <rect x="${w*.7}" y="${h*.48}" width="${w*.04}" height="${h*.08}" rx="2" fill="#8b6914" opacity=".5"/>
      <polygon points="${w*.68},${h*.48} ${w*.72},${h*.38} ${w*.76},${h*.48}" fill="#8b6914" opacity=".45"/>
      <circle cx="${w*.72}" cy="${h*.46}" r="${w*.015}" fill="#fbbf24" opacity=".5"/>`,
  },

  'industrial': {
    name: 'Industrial', tag: 'Raw materials · exposed metal',
    palette: ['#6b5a4e','#4a3e38','#8c7b6e','#2a2420','#b87333'],
    img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80',
    bg: ['#1a1614','#2a2220','#0f0e0c'],
    scene: (w,h) => `
      <!-- Industrial: brick texture, metal shelving, Edison bulbs, dark leather sofa -->
      <rect width="${w}" height="${h}" fill="#1a1614"/>
      <rect x="0" y="${h*.52}" width="${w}" height="${h*.48}" fill="#0f0e0c"/>
      <!-- brick texture (right wall) -->
      ${[...Array(6)].map((_,row)=>
        [...Array(4)].map((_,col)=>
          `<rect x="${w*(.68+col*.08)}" y="${h*(.04+row*.09)}" width="${w*.07}" height="${h*.07}" rx="1" fill="#3a2820" opacity="${.3+col*.04}" stroke="#2a1e18" stroke-width=".5"/>`
        ).join('')
      ).join('')}
      <!-- exposed pipe / conduit -->
      <rect x="0" y="${h*.06}" width="${w*.7}" height="${w*.018}" rx="${w*.009}" fill="#4a3e38" opacity=".5"/>
      <circle cx="${w*.22}" cy="${h*.06}" r="${w*.018}" fill="#2a2420" stroke="#6b5a4e" stroke-width="1" opacity=".55"/>
      <circle cx="${w*.48}" cy="${h*.06}" r="${w*.018}" fill="#2a2420" stroke="#6b5a4e" stroke-width="1" opacity=".55"/>
      <!-- Edison bulb string -->
      ${[...Array(5)].map((_,i)=>`
        <line x1="${w*(0.1+i*.16)}" y1="${h*.06}" x2="${w*(0.1+i*.16)}" y2="${h*.2}" stroke="#4a3e38" stroke-width=".8" opacity=".4"/>
        <ellipse cx="${w*(0.1+i*.16)}" cy="${h*.22}" rx="${w*.015}" ry="${w*.022}" fill="#8c7b6e" opacity=".3"/>
        <circle cx="${w*(0.1+i*.16)}" cy="${h*.21}" r="${w*.008}" fill="#fbbf24" opacity=".55"/>
      `).join('')}
      <!-- dark leather sofa with visible stitching -->
      <rect x="${w*.1}" y="${h*.58}" width="${w*.55}" height="${h*.13}" rx="3" fill="#2a2420" opacity=".8"/>
      <rect x="${w*.1}" y="${h*.55}" width="${w*.55}" height="${h*.06}" rx="2" fill="#3a3028" opacity=".8"/>
      <rect x="${w*.1}" y="${h*.56}" width="${w*.04}" height="${h*.15}" rx="1" fill="#4a3e38" opacity=".6"/>
      <rect x="${w*.61}" y="${h*.56}" width="${w*.04}" height="${h*.15}" rx="1" fill="#4a3e38" opacity=".6"/>
      <!-- stitching lines on sofa -->
      <line x1="${w*.14}" y1="${h*.61}" x2="${w*.61}" y2="${h*.61}" stroke="#4a3e38" stroke-width=".6" stroke-dasharray="3,3" opacity=".4"/>
      <!-- metal pipe coffee table legs -->
      <rect x="${w*.22}" y="${h*.72}" width="${w*.24}" height="${w*.018}" rx="1" fill="#6b5a4e" opacity=".6"/>
      <rect x="${w*.23}" y="${h*.72}" width="${w*.012}" height="${h*.08}" fill="#4a3e38" opacity=".7"/>
      <rect x="${w*.44}" y="${h*.72}" width="${w*.012}" height="${h*.08}" fill="#4a3e38" opacity=".7"/>
      <!-- metal shelving unit -->
      <rect x="${w*.76}" y="${h*.12}" width="${w*.015}" height="${h*.6}" fill="#4a3e38" opacity=".6"/>
      <rect x="${w*.76}" y="${h*.25}" width="${w*.18}" height="${w*.012}" fill="#6b5a4e" opacity=".5"/>
      <rect x="${w*.76}" y="${h*.42}" width="${w*.18}" height="${w*.012}" fill="#6b5a4e" opacity=".5"/>
      <rect x="${w*.76}" y="${h*.58}" width="${w*.18}" height="${w*.012}" fill="#6b5a4e" opacity=".5"/>
      <!-- objects on shelves -->
      <rect x="${w*.8}" y="${h*.17}" width="${w*.04}" height="${h*.08}" rx="1" fill="#8c7b6e" opacity=".4"/>
      <ellipse cx="${w*.89}" cy="${h*.25}" rx="${w*.025}" ry="${h*.04}" fill="#b87333" opacity=".35"/>`,
  },

  'luxury-modern': {
    name: 'Luxury Modern', tag: 'Opulent materials · dramatic scale',
    palette: ['#c4b0e0','#9b7fd4','#6b3fa8','#2d1458','#f0d080'],
    img: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=600&q=80',
    bg: ['#1a0a2e','#2d1458','#0a0418'],
    scene: (w,h) => `
      <!-- Luxury Modern: dramatic dark, gold accents, chandelier, velvet sofa, marble -->
      <rect width="${w}" height="${h}" fill="#1a0a2e"/>
      <rect x="0" y="${h*.54}" width="${w}" height="${h*.46}" fill="#0a0418"/>
      <!-- dark panelled wall -->
      <rect x="${w*.04}" y="${h*.04}" width="${w*.42}" height="${h*.5}" rx="2" fill="#2d1458" opacity=".3" stroke="#6b3fa8" stroke-width=".5"/>
      <rect x="${w*.5}" y="${h*.04}" width="${w*.46}" height="${h*.5}" rx="2" fill="#2d1458" opacity=".3" stroke="#6b3fa8" stroke-width=".5"/>
      <!-- gold chandelier -->
      <line x1="${w*.5}" y1="${h*.0}" x2="${w*.5}" y2="${h*.1}" stroke="#f0d080" stroke-width="1.5" opacity=".5"/>
      <ellipse cx="${w*.5}" cy="${h*.1}" rx="${w*.18}" ry="${h*.04}" fill="none" stroke="#f0d080" stroke-width="1.2" opacity=".4"/>
      ${[...Array(8)].map((_,i)=>`
        <line x1="${w*(.5+.18*Math.cos(i*Math.PI/4))}" y1="${h*(.1+.04*Math.sin(i*Math.PI/4))}"
              x2="${w*(.5+.18*Math.cos(i*Math.PI/4))}" y2="${h*(.18+.04*Math.sin(i*Math.PI/4))}"
              stroke="#f0d080" stroke-width=".8" opacity=".4"/>
        <circle cx="${w*(.5+.18*Math.cos(i*Math.PI/4))}" cy="${h*(.18+.04*Math.sin(i*Math.PI/4))}"
                r="${w*.008}" fill="#fbbf24" opacity=".6"/>
      `).join('')}
      <!-- velvet sofa — deep jewel tone, rolled arms -->
      <rect x="${w*.08}" y="${h*.57}" width="${w*.62}" height="${h*.13}" rx="6" fill="#6b3fa8" opacity=".55"/>
      <rect x="${w*.08}" y="${h*.55}" width="${w*.62}" height="${h*.05}" rx="4" fill="#9b7fd4" opacity=".4"/>
      <ellipse cx="${w*.1}" cy="${h*.635}" rx="${w*.03}" ry="${h*.04}" fill="#9b7fd4" opacity=".45"/>
      <ellipse cx="${w*.68}" cy="${h*.635}" rx="${w*.03}" ry="${h*.04}" fill="#9b7fd4" opacity=".45"/>
      <!-- gold-trimmed cushions -->
      <rect x="${w*.16}" y="${h*.56}" width="${w*.12}" height="${h*.05}" rx="4" fill="#c4b0e0" opacity=".35"/>
      <rect x="${w*.31}" y="${h*.56}" width="${w*.1}" height="${h*.05}" rx="4" fill="#9b7fd4" opacity=".4"/>
      <rect x="${w*.44}" y="${h*.56}" width="${w*.09}" height="${h*.05}" rx="4" fill="#f0d080" opacity=".25"/>
      <!-- marble coffee table -->
      <rect x="${w*.2}" y="${h*.73}" width="${w*.3}" height="${h*.05}" rx="2" fill="#e8e0f0" opacity=".12" stroke="#f0d080" stroke-width=".8"/>
      <rect x="${w*.22}" y="${h*.73}" width="${w*.01}" height="${h*.08}" fill="#f0d080" opacity=".25"/>
      <rect x="${w*.48}" y="${h*.73}" width="${w*.01}" height="${h*.08}" fill="#f0d080" opacity=".25"/>
      <!-- tall decorative vase -->
      <rect x="${w*.79}" y="${h*.38}" width="${w*.03}" height="${h*.24}" rx="${w*.015}" fill="#f0d080" opacity=".35"/>
      <ellipse cx="${w*.805}" cy="${h*.37}" rx="${w*.05}" ry="${h*.03}" fill="#f0d080" opacity=".3"/>
      <!-- gold floor lamp -->
      <rect x="${w*.84}" y="${h*.2}" width="${w*.012}" height="${h*.42}" fill="#f0d080" opacity=".3"/>
      <path d="M${w*.84},${h*.2} Q${w*.84},${h*.1} ${w*.7},${h*.1}" fill="none" stroke="#f0d080" stroke-width="1.2" opacity=".35"/>`,
  },

  'warm-minimal': {
    name: 'Warm Minimal', tag: 'Organic shapes · cream & terracotta',
    palette: ['#f5e8d8','#e0c8a8','#c8a878','#8b6840','#c87858'],
    img: 'https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=600&q=80',
    bg: ['#261a10','#382618','#160e08'],
    scene: (w,h) => `
      <!-- Warm Minimal: curved organic sofa, terracotta pots, warm cream, minimal -->
      <rect width="${w}" height="${h}" fill="#261a10"/>
      <rect x="0" y="${h*.54}" width="${w}" height="${h*.46}" fill="#160e08"/>
      <!-- warm archway / curved wall detail -->
      <path d="M${w*.15},${h*.54} Q${w*.15},${h*.05} ${w*.5},${h*.05} Q${w*.85},${h*.05} ${w*.85},${h*.54}" fill="none" stroke="#8b6840" stroke-width="1.5" opacity=".2"/>
      <!-- single oval wall art -->
      <ellipse cx="${w*.5}" cy="${h*.22}" rx="${w*.12}" ry="${h*.14}" fill="none" stroke="#e0c8a8" stroke-width="1" opacity=".3"/>
      <ellipse cx="${w*.5}" cy="${h*.22}" rx="${w*.07}" ry="${h*.09}" fill="#c8a878" opacity=".12"/>
      <!-- organic cloud sofa (curved) -->
      <path d="M${w*.1},${h*.7} Q${w*.1},${h*.55} ${w*.25},${h*.55} Q${w*.35},${h*.52} ${w*.45},${h*.55} Q${w*.55},${h*.52} ${w*.65},${h*.55} Q${w*.78},${h*.55} ${w*.78},${h*.7} Q${w*.78},${h*.73} ${w*.44},${h*.73} Q${w*.1},${h*.73} ${w*.1},${h*.7} Z" fill="#e0c8a8" opacity=".32"/>
      <!-- organic pillows -->
      <ellipse cx="${w*.22}" cy="${h*.575}" rx="${w*.07}" ry="${h*.05}" fill="#f5e8d8" opacity=".3"/>
      <ellipse cx="${w*.38}" cy="${h*.565}" rx="${w*.06}" ry="${h*.04}" fill="#c87858" opacity=".35"/>
      <!-- terracotta pots cluster -->
      <path d="M${w*.79},${h*.68} Q${w*.79},${h*.56} ${w*.83},${h*.56} Q${w*.87},${h*.56} ${w*.87},${h*.68} Z" fill="#c87858" opacity=".5"/>
      <ellipse cx="${w*.83}" cy="${h*.56}" rx="${w*.04}" ry="${h*.02}" fill="#c87858" opacity=".45"/>
      <path d="M${w*.74},${h*.74} Q${w*.74},${h*.65} ${w*.77},${h*.65} Q${w*.80},${h*.65} ${w*.80},${h*.74} Z" fill="#8b6840" opacity=".5"/>
      <ellipse cx="${w*.77}" cy="${h*.65}" rx="${w*.03}" ry="${h*.015}" fill="#8b6840" opacity=".45"/>
      <!-- snake plant -->
      <rect x="${w*.82}" y="${h*.35}" width="${w*.015}" height="${h*.22}" rx="${w*.007}" fill="#6b8a5a" opacity=".5"/>
      <rect x="${w*.79}" y="${h*.25}" width="${w*.018}" height="${h*.3}" rx="${w*.009}" fill="#5a7a4a" opacity=".45" transform="rotate(-10 ${w*.79} ${h*.55})"/>
      <rect x="${w*.85}" y="${h*.3}" width="${w*.016}" height="${h*.27}" rx="${w*.008}" fill="#6b8a5a" opacity=".45" transform="rotate(8 ${w*.85} ${h*.57})"/>
      <!-- minimal side table (round) -->
      <ellipse cx="${w*.18}" cy="${h*.77}" rx="${w*.06}" ry="${h*.025}" fill="#c8a878" opacity=".35"/>
      <rect x="${w*.177}" y="${h*.77}" width="${w*.008}" height="${h*.07}" fill="#8b6840" opacity=".4"/>`,
  },

  'indian-modern': {
    name: 'Indian Modern', tag: 'Teak & brass · rich heritage tones',
    palette: ['#e8a870','#c97c4a','#8b4513','#4a2010','#d4a844'],
    img: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=600&q=80',
    bg: ['#2a1408','#3d2010','#1a0d04'],
    scene: (w,h) => `
      <!-- Indian Modern: teak furniture, brass lamps, block prints, warm amber -->
      <rect width="${w}" height="${h}" fill="#2a1408"/>
      <rect x="0" y="${h*.53}" width="${w}" height="${h*.47}" fill="#1a0d04"/>
      <!-- jali screen / decorative panel -->
      ${[...Array(5)].map((_,row)=>
        [...Array(7)].map((_,col)=>
          `<circle cx="${w*(.58+col*.062)}" cy="${h*(.08+row*.09)}" r="${w*.012}" fill="none" stroke="#d4a844" stroke-width=".6" opacity=".25"/>`
        ).join('')
      ).join('')}
      <!-- block-print textile / wall art -->
      <rect x="${w*.14}" y="${h*.06}" width="${w*.34}" height="${h*.3}" rx="2" fill="#c97c4a" opacity=".2"/>
      <rect x="${w*.17}" y="${h*.09}" width="${w*.28}" height="${h*.24}" rx="1" fill="#8b4513" opacity=".15"/>
      <!-- teak sofa with carved wooden legs -->
      <rect x="${w*.08}" y="${h*.57}" width="${w*.58}" height="${h*.13}" rx="3" fill="#8b4513" opacity=".5"/>
      <rect x="${w*.08}" y="${h*.55}" width="${w*.58}" height="${h*.05}" rx="2" fill="#c97c4a" opacity=".4"/>
      <!-- carved legs -->
      <rect x="${w*.1}" y="${h*.7}" width="${w*.025}" height="${h*.06}" rx="1" fill="#4a2010" opacity=".6"/>
      <rect x="${w*.62}" y="${h*.7}" width="${w*.025}" height="${h*.06}" rx="1" fill="#4a2010" opacity=".6"/>
      <!-- block-print cushions -->
      <rect x="${w*.13}" y="${h*.56}" width="${w*.12}" height="${h*.06}" rx="4" fill="#d4a844" opacity=".35"/>
      <rect x="${w*.27}" y="${h*.56}" width="${w*.1}" height="${h*.06}" rx="4" fill="#e8a870" opacity=".38"/>
      <rect x="${w*.39}" y="${h*.56}" width="${w*.09}" height="${h*.06}" rx="4" fill="#c97c4a" opacity=".42"/>
      <!-- brass coffee table -->
      <rect x="${w*.18}" y="${h*.73}" width="${w*.26}" height="${h*.04}" rx="1" fill="#d4a844" opacity=".35"/>
      <rect x="${w*.2}" y="${h*.73}" width="${w*.012}" height="${h*.07}" fill="#d4a844" opacity=".3"/>
      <rect x="${w*.42}" y="${h*.73}" width="${w*.012}" height="${h*.07}" fill="#d4a844" opacity=".3"/>
      <!-- brass floor lamp (traditional silhouette) -->
      <rect x="${w*.75}" y="${h*.22}" width="${w*.012}" height="${h*.5}" fill="#d4a844" opacity=".4"/>
      <path d="M${w*.756},${h*.22} Q${w*.85},${h*.22} ${w*.85},${h*.1}" fill="none" stroke="#d4a844" stroke-width="1.4" opacity=".4"/>
      <ellipse cx="${w*.85}" cy="${h*.1}" rx="${w*.04}" ry="${h*.03}" fill="#d4a844" opacity=".35"/>
      <!-- diyas / candles -->
      ${[...Array(3)].map((_,i)=>`
        <ellipse cx="${w*(.24+i*.04)}" cy="${h*.73}" rx="${w*.013}" ry="${h*.02}" fill="#8b4513" opacity=".5"/>
        <circle cx="${w*(.24+i*.04)}" cy="${h*.71}" r="${w*.005}" fill="#fbbf24" opacity=".6"/>
      `).join('')}
      <!-- potted tulsi / temple plant -->
      <rect x="${w*.79}" y="${h*.5}" width="${w*.02}" height="${h*.22}" rx="${w*.01}" fill="#4a2010" opacity=".5"/>
      <ellipse cx="${w*.8}" cy="${h*.48}" rx="${w*.055}" ry="${h*.09}" fill="#5a8a4a" opacity=".5"/>`,
  },

  'earthy-organic': {
    name: 'Earthy Organic', tag: 'Nature-first · abundant greenery',
    palette: ['#c8a878','#8b6840','#4a7a3a','#2a5020','#c87858'],
    img: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=600&q=80',
    bg: ['#1e1408','#30200c','#100c04'],
    scene: (w,h) => `
      <!-- Earthy Organic: plants everywhere, rattan, jute, terracotta, warm earth -->
      <rect width="${w}" height="${h}" fill="#1e1408"/>
      <rect x="0" y="${h*.53}" width="${w}" height="${h*.47}" fill="#100c04"/>
      <!-- living wall / vertical garden hints -->
      <rect x="${w*.0}" y="${h*.0}" width="${w*.14}" height="${h*.56}" fill="#2a5020" opacity=".25"/>
      ${[...Array(6)].map((_,i)=>`<ellipse cx="${w*.04}" cy="${h*(.06+i*.09)}" rx="${w*.06}" ry="${h*.05}" fill="#4a7a3a" opacity="${.3+i*.02}"/>`).join('')}
      ${[...Array(5)].map((_,i)=>`<ellipse cx="${w*.1}" cy="${h*(.1+i*.09)}" rx="${w*.05}" ry="${h*.04}" fill="#5a8a4a" opacity="${.25+i*.02}"/>`).join('')}
      <!-- rattan round chair (left) -->
      <ellipse cx="${w*.24}" cy="${h*.63}" rx="${w*.1}" ry="${h*.08}" fill="#8b6840" opacity=".3"/>
      <path d="M${w*.14},${h*.6} Q${w*.14},${h*.48} ${w*.24},${h*.48} Q${w*.34},${h*.48} ${w*.34},${h*.6}" fill="#8b6840" opacity=".35" stroke="#c8a878" stroke-width=".8"/>
      <!-- rattan weave pattern -->
      ${[...Array(4)].map((_,i)=>`<line x1="${w*(.16+i*.04)}" y1="${h*.5}" x2="${w*(.16+i*.04)}" y2="${h*.6}" stroke="#c8a878" stroke-width=".5" opacity=".2"/>`).join('')}
      <ellipse cx="${w*.24}" cy="${h*.6}" rx="${w*.06}" ry="${h*.04}" fill="#c87858" opacity=".3"/>
      <!-- organic sofa (middle) -->
      <path d="M${w*.38},${h*.69} Q${w*.38},${h*.56} ${w*.5},${h*.55} Q${w*.66},${h*.54} ${w*.74},${h*.57} Q${w*.78},${h*.6} ${w*.78},${h*.69} Q${w*.78},${h*.72} ${w*.58},${h*.73} Q${w*.38},${h*.72} ${w*.38},${h*.69} Z" fill="#8b6840" opacity=".4"/>
      <!-- jute rug -->
      <ellipse cx="${w*.52}" cy="${h*.78}" rx="${w*.32}" ry="${h*.07}" fill="#c8a878" opacity=".2"/>
      <!-- abundant plants cluster (right) -->
      <rect x="${w*.8}" y="${h*.25}" width="${w*.018}" height="${h*.37}" rx="${w*.009}" fill="#4a2010" opacity=".5"/>
      <ellipse cx="${w*.81}" cy="${h*.22}" rx="${w*.08}" ry="${h*.12}" fill="#4a7a3a" opacity=".55"/>
      <ellipse cx="${w*.76}" cy="${h*.28}" rx="${w*.06}" ry="${h*.09}" fill="#5a8a4a" opacity=".45"/>
      <ellipse cx="${w*.87}" cy="${h*.3}" rx="${w*.05}" ry="${h*.07}" fill="#3a6a2a" opacity=".45"/>
      <!-- small terracotta pots -->
      <path d="M${w*.44},${h*.76} Q${w*.44},${h*.7} ${w*.47},${h*.7} Q${w*.50},${h*.7} ${w*.50},${h*.76} Z" fill="#c87858" opacity=".5"/>
      <path d="M${w*.53},${h*.76} Q${w*.53},${h*.71} ${w*.555},${h*.71} Q${w*.58},${h*.71} ${w*.58},${h*.76} Z" fill="#8b6840" opacity=".5"/>
      <!-- leaf on table -->
      <path d="M${w*.46},${h*.7} Q${w*.46},${h*.64} ${w*.5},${h*.62} Q${w*.5},${h*.64} ${w*.5},${h*.7}" fill="#5a8a4a" opacity=".4"/>`,
  },
};

/* ── Render style selector cards (Phase 1) ───────────────────── */
function renderStyleCards() {
  const grid = document.getElementById('styleChips');
  if (!grid) return;
  grid.innerHTML = '';
  Object.entries(STYLE_THEMES).forEach(([key, theme]) => {
    const isSelected = state.style.includes(key);
    const card = document.createElement('button');
    card.className = `style-card${isSelected ? ' selected' : ''}`;
    card.dataset.style = key;
    card.onclick = () => selectStyle(card);
    const svgFallback = `<svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg">${theme.scene(200, 110)}</svg>`;
    card.innerHTML = `
      <div class="style-card-preview">
        <img src="${theme.img}" alt="${theme.name} interior" loading="lazy"
             onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
        <div class="style-card-svg-fallback" style="display:none">${svgFallback}</div>
        <div class="style-card-check">✓</div>
      </div>
      <div class="style-card-body">
        <div class="style-card-name">${theme.name}</div>
        <div class="style-card-tag">${theme.tag}</div>
        <div class="style-card-palette">
          ${theme.palette.slice(0,4).map(c => `<div class="style-card-swatch" style="background:${c}"></div>`).join('')}
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════════════════
   PHASE 2 · DESIGN ENGINE
═══════════════════════════════════════════════════════════════ */
const DESIGNS = [
  {
    id: 1, styleKey: 'japandi',
    name: 'Japandi Warmth',
    cost: '₹2,40,000', costNum: 240000, time: '3–4 weeks', confidence: 91,
    badges: ['badge-popular','badge-ai'], badgeText: ['Most Popular','AI Pick'],
    insight: 'Saves 18% vs comparable styles. Best for compact spaces under 250 sq ft.',
  },
  {
    id: 2, styleKey: 'indian-modern',
    name: 'Indian Modern',
    cost: '₹1,95,000', costNum: 195000, time: '2–3 weeks', confidence: 87,
    badges: ['badge-vastu'], badgeText: ['Vastu Aligned'],
    insight: 'Uses locally-sourced teak and brass. Fastest to execute in your city.',
  },
  {
    id: 3, styleKey: 'contemporary',
    name: 'Coastal Contemporary',
    cost: '₹3,10,000', costNum: 310000, time: '4–5 weeks', confidence: 83,
    badges: ['badge-ai'], badgeText: ['AI Pick'],
    insight: 'Maximises natural light. Ideal for south-facing rooms. Improves space feel by 23%.',
  },
  {
    id: 4, styleKey: 'luxury-modern',
    name: 'Luxury Modern',
    cost: '₹5,80,000', costNum: 580000, time: '5–6 weeks', confidence: 88,
    badges: ['badge-budget'], badgeText: ['Best Value'],
    insight: 'Premium materials at 22% below market average. Highest resale value uplift.',
  },
  {
    id: 5, styleKey: 'earthy-organic',
    name: 'Earthy Organic',
    cost: '₹1,60,000', costNum: 160000, time: '2 weeks', confidence: 85,
    badges: ['badge-budget'], badgeText: ['Most Affordable'],
    insight: 'Easiest to maintain. Uses natural, washable fabrics — ideal for families and pets.',
  },
];

/* ═══════════════════════════════════════════════════════════════
   AI RECOMMENDATION ENGINE
═══════════════════════════════════════════════════════════════ */
function getAIRecommendedDesigns() {
  const tier = state.budget.tier; // 0=budget 1=mid 2=premium 3=luxury
  const styles = state.style;
  const constraints = state.constraints;
  const room = state.room;
  const adjacent = {
    'japandi':       ['modern-minimal','scandinavian','warm-minimal'],
    'indian-modern': ['warm-minimal','bohemian','contemporary'],
    'contemporary':  ['modern-minimal','luxury-modern','industrial'],
    'luxury-modern': ['contemporary','industrial'],
    'earthy-organic':['warm-minimal','bohemian','scandinavian'],
    'scandinavian':  ['japandi','warm-minimal'],
    'modern-minimal':['japandi','contemporary','industrial'],
    'warm-minimal':  ['japandi','earthy-organic','scandinavian'],
    'bohemian':      ['earthy-organic','indian-modern','warm-minimal'],
    'industrial':    ['modern-minimal','contemporary'],
  };
  return DESIGNS.map(d => {
    let score = d.confidence;
    if (styles.includes(d.styleKey)) score += 18;
    else if (adjacent[d.styleKey]?.some(s => styles.includes(s))) score += 6;
    const dTier = d.costNum<200000?0:d.costNum<400000?1:d.costNum<700000?2:3;
    if (dTier===tier) score+=10;
    else if (Math.abs(dTier-tier)===1) score+=2;
    else score-=12;
    if (constraints.has('vastu') && d.badges.includes('badge-vastu')) score+=8;
    if (constraints.has('rental') && d.costNum<250000) score+=5;
    if (constraints.has('kids') && d.costNum<280000) score+=4;
    if (constraints.has('pet') && ['earthy-organic','japandi'].includes(d.styleKey)) score+=4;
    if (constraints.has('storage') && d.styleKey==='scandinavian') score+=3;
    if (room==='bedroom' && ['japandi','warm-minimal','scandinavian'].includes(d.styleKey)) score+=4;
    if (room==='office' && ['modern-minimal','industrial','contemporary'].includes(d.styleKey)) score+=4;
    if (room==='kids' && d.costNum<300000) score+=3;
    if (room==='living' && ['indian-modern','contemporary','luxury-modern'].includes(d.styleKey)) score+=3;
    if (room==='dining' && ['indian-modern','contemporary','scandinavian'].includes(d.styleKey)) score+=3;
    return { ...d, aiScore: Math.min(99, Math.max(55, Math.round(score))) };
  }).sort((a,b) => b.aiScore - a.aiScore);
}

function buildAIBanner() {
  const top = getAIRecommendedDesigns()[0];
  const styleNames = state.style.map(s => STYLE_THEMES[s]?.name || s);
  const parts = [];
  if (styleNames.length) parts.push(styleNames.join(' & ') + ' style');
  if (state.room) parts.push(state.room + ' room');
  parts.push(state.budget.label + ' budget');
  return `<div class="ai-reco-banner">
    <span class="ai-reco-icon">✦</span>
    <div class="ai-reco-text">
      <strong>AI personalised for you</strong> · Based on your ${parts.join(' · ')}
      ${top ? `&nbsp;·&nbsp;<em>${top.name}</em> is your top match at <strong>${top.aiScore}%</strong>` : ''}
    </div>
  </div>`;
}

function goPhase2() {
  showPhase(2);
  renderDesignCards();
}

function renderDesignCards() {
  const grid = document.getElementById('designsGrid');
  grid.innerHTML = '';

  // AI recommendation banner
  let aiBanner = document.getElementById('aiRecoBanner');
  if (!aiBanner) {
    aiBanner = document.createElement('div');
    aiBanner.id = 'aiRecoBanner';
    grid.parentNode.insertBefore(aiBanner, grid);
  }
  aiBanner.innerHTML = buildAIBanner();

  // Show reference photo strip if user uploaded images
  const ref = state.referencePhoto;
  let refStrip = document.getElementById('refStrip');
  if (ref && !refStrip) {
    refStrip = document.createElement('div');
    refStrip.id = 'refStrip';
    refStrip.className = 'ref-strip';
    refStrip.innerHTML = `
      <img src="${ref}" class="ref-thumb" alt="Your room" />
      <div class="ref-strip-text">
        <div class="ref-strip-title">Your room photo</div>
        <div class="ref-strip-sub">AI analysed layout, lighting & dimensions from your photo to generate these designs</div>
      </div>`;
    grid.parentNode.insertBefore(refStrip, grid);
  }

  const rankedDesigns = getAIRecommendedDesigns();
  rankedDesigns.forEach((d, i) => {
    const card = document.createElement('div');
    const isTopPick = i === 0;
    card.className = `design-card${state.favDesigns.has(d.id) ? ' favourited' : ''}${state.compareDesigns.has(d.id) ? ' compared' : ''}${isTopPick ? ' ai-top-pick' : ''}`;
    card.style.animationDelay = `${i * 0.07}s`;
    const isSelected = state.selectedDesign?.id === d.id;
    const theme = STYLE_THEMES[d.styleKey] || STYLE_THEMES['japandi'];
    card.innerHTML = `
      <div class="design-render">
        <svg viewBox="0 0 500 210" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">
          ${theme.scene(500, 210)}
        </svg>
        <div class="design-overlay">
          <div class="design-top-row">
            <button class="fav-btn${state.favDesigns.has(d.id) ? ' active' : ''}" onclick="toggleFav(${d.id})" title="Save">♡</button>
            <button class="compare-check${state.compareDesigns.has(d.id) ? ' active' : ''}" onclick="toggleCompareItem(${d.id})" title="Compare">⇄</button>
          </div>
          <div class="design-badges">
            ${isTopPick ? '<span class="d-badge badge-ai">✦ AI Top Pick</span>' : ''}
            ${d.badges.map((b, idx) => `<span class="d-badge ${b}">${d.badgeText[idx]}</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="design-info">
        <div class="design-style-name">${d.name}</div>
        <div class="design-meta">
          <div class="meta-item"><div class="meta-label">Est. Cost</div><div class="meta-val">${d.cost}</div></div>
          <div class="meta-item"><div class="meta-label">Timeline</div><div class="meta-val">${d.time}</div></div>
        </div>
        <div class="confidence-bar">
          <div class="conf-track"><div class="conf-fill" style="width:${d.aiScore}%"></div></div>
          <div class="conf-label">${d.aiScore}% AI match</div>
        </div>
        <div class="ai-insight-text">💡 ${d.insight}</div>
        <button class="design-select-btn${isSelected ? ' selected-design' : ''}" onclick="selectDesign(${d.id})">
          ${isSelected ? '✓ Selected' : 'Select This Design'}
        </button>
      </div>`;
    grid.appendChild(card);
  });
  updateCompareBtn();
}

function toggleFav(id) {
  state.favDesigns.has(id) ? state.favDesigns.delete(id) : state.favDesigns.add(id);
  document.getElementById('favCount').textContent = `${state.favDesigns.size} saved`;
  renderDesignCards();
  // Persist favourite to Firestore
  const design = DESIGNS.find(d => d.id === id);
  if (design && typeof fbSaveDesign === 'function') {
    fbSaveDesign(design, state.favDesigns.has(id)).catch(() => {});
  }
  autosave();
}

function toggleCompareItem(id) {
  if (state.compareDesigns.has(id)) { state.compareDesigns.delete(id); }
  else if (state.compareDesigns.size < 3) { state.compareDesigns.add(id); }
  renderDesignCards();
  updateCompareBtn();
}

function updateCompareBtn() {
  const btn = document.getElementById('compareBtn');
  const n = state.compareDesigns.size;
  btn.disabled = n < 2;
  if (n >= 2) btn.classList.add('active-tool'); else btn.classList.remove('active-tool');
  document.getElementById('compareHint').textContent = n < 2 ? 'Select 2–3 designs to compare' : `${n} selected — ready to compare`;
}

function selectDesign(id) {
  state.selectedDesign = DESIGNS.find(d => d.id === id);
  renderDesignCards();
}

function toggleCompare() {
  if (state.compareDesigns.size < 2) return;
  buildCompareOverlay();
  document.getElementById('compareOverlay').classList.remove('hidden');
}

function buildCompareOverlay() {
  const panels = document.getElementById('comparePanels');
  panels.innerHTML = '';
  const ids = [...state.compareDesigns];
  const items = ids.map(id => DESIGNS.find(d => d.id === id));
  const minCost = Math.min(...items.map(d => d.costNum));

  items.forEach(d => {
    const isMin = d.costNum === minCost;
    const panel = document.createElement('div');
    panel.className = 'compare-panel';
    panel.innerHTML = `
      <div class="compare-render">${drawRoomSVG(d.bg, d.furniture, d.accent)}</div>
      <div class="compare-details">
        <div style="font-weight:700;font-size:.95rem;padding:.75rem 0 .5rem">${d.name}</div>
        <div class="compare-row"><span class="compare-row-label">Estimated Cost</span><span class="compare-row-val${isMin ? ' compare-winner' : ''}">${d.cost}${isMin ? ' ✓ Best' : ''}</span></div>
        <div class="compare-row"><span class="compare-row-label">Timeline</span><span class="compare-row-val">${d.time}</span></div>
        <div class="compare-row"><span class="compare-row-label">AI Match</span><span class="compare-row-val">${d.confidence}%</span></div>
        <div class="compare-row"><span class="compare-row-label">Vastu</span><span class="compare-row-val">${d.badges.includes('badge-vastu') ? '✓ Aligned' : '—'}</span></div>
        <div style="font-size:.78rem;color:var(--muted2);padding:.65rem 0;line-height:1.5">${d.insight}</div>
        <button class="design-select-btn" onclick="selectDesign(${d.id});closeCompare()" style="margin-top:.25rem">Select This Design</button>
      </div>`;
    panels.appendChild(panel);
  });
}

function closeCompare() { document.getElementById('compareOverlay').classList.add('hidden'); }

function exportPDF() {
  alert('PDF export — your shortlisted designs with cost breakdowns would be generated here in production.');
}

/* ═══════════════════════════════════════════════════════════════
   ROOM SVG RENDERER
═══════════════════════════════════════════════════════════════ */
function drawRoomSVG(bg, furniture, accent, wallColor, lighting, decor) {
  const w = wallColor || '#f5ede0';
  const lightFilter = lighting === 'cool' ? 'hue-rotate(180deg) saturate(.8)' : lighting === 'dramatic' ? 'brightness(.6) contrast(1.3)' : '';
  const showPlant = !decor || decor.plant !== false;
  const showArt = !decor || decor.art !== false;
  const showRug = decor?.rug === true;

  return `<svg viewBox="0 0 500 280" xmlns="http://www.w3.org/2000/svg" style="filter:${lightFilter}">
    <defs>
      <linearGradient id="bgG${Math.random().toString(36).substr(2,4)}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${bg.match(/#[a-f0-9]{6}/gi)?.[0] || '#2a2218'}"/>
        <stop offset="100%" stop-color="${bg.match(/#[a-f0-9]{6}/gi)?.[2] || '#1a1510'}"/>
      </linearGradient>
    </defs>
    <!-- Room background -->
    <rect width="500" height="280" fill="${bg.match(/#[a-f0-9]{6}/gi)?.[1] || '#3d3120'}"/>
    <!-- Wall -->
    <rect x="30" y="20" width="440" height="180" rx="4" fill="${w}" opacity=".12"/>
    <!-- Floor -->
    <rect x="0" y="200" width="500" height="80" fill="${furniture}18"/>
    ${showRug ? `<ellipse cx="250" cy="225" rx="140" ry="22" fill="${accent}25"/>` : ''}
    <!-- Wall art -->
    ${showArt ? `<rect x="185" y="35" width="130" height="80" rx="5" fill="${furniture}28" stroke="${accent}50" stroke-width="1"/>
    <rect x="198" y="46" width="104" height="58" rx="3" fill="${accent}18"/>` : ''}
    <!-- Window -->
    <rect x="30" y="30" width="70" height="120" fill="${accent}10" stroke="${furniture}30" stroke-width="1"/>
    <line x1="65" y1="30" x2="65" y2="150" stroke="${furniture}25" stroke-width="1"/>
    <line x1="30" y1="90" x2="100" y2="90" stroke="${furniture}25" stroke-width="1"/>
    <!-- Sofa back -->
    <rect x="85" y="148" width="255" height="18" rx="7" fill="${furniture}70"/>
    <!-- Sofa seat -->
    <rect x="85" y="158" width="255" height="50" rx="9" fill="${furniture}58"/>
    <!-- Armrests -->
    <rect x="85" y="150" width="13" height="62" rx="5" fill="${furniture}80"/>
    <rect x="327" y="150" width="13" height="62" rx="5" fill="${furniture}80"/>
    <!-- Pillows -->
    <rect x="108" y="151" width="46" height="28" rx="7" fill="${accent}80"/>
    <rect x="166" y="151" width="46" height="28" rx="7" fill="${furniture}95"/>
    <rect x="255" y="151" width="46" height="28" rx="7" fill="${accent}65"/>
    <!-- Coffee table -->
    <rect x="160" y="214" width="170" height="9" rx="4" fill="${accent}60"/>
    <rect x="173" y="223" width="5" height="18" fill="${accent}48"/>
    <rect x="322" y="223" width="5" height="18" fill="${accent}48"/>
    <!-- Object on table -->
    <ellipse cx="248" cy="214" rx="18" ry="6" fill="${furniture}40"/>
    <!-- Plant -->
    ${showPlant ? `<rect x="382" y="172" width="10" height="38" rx="3" fill="${furniture}55"/>
    <ellipse cx="387" cy="167" rx="20" ry="22" fill="${accent}55"/>
    <ellipse cx="376" cy="160" rx="12" ry="14" fill="${accent}45"/>
    <ellipse cx="397" cy="163" rx="11" ry="13" fill="${accent}45"/>` : ''}
    <!-- Floor lamp -->
    <rect x="436" y="65" width="3.5" height="148" fill="${furniture}50"/>
    <ellipse cx="437.5" cy="62" rx="22" ry="10" fill="${furniture}42"/>
    <rect x="431" y="210" width="13" height="3.5" rx="2" fill="${furniture}60"/>
    <!-- Ambient glow from lamp -->
    <ellipse cx="437" cy="65" rx="50" ry="60" fill="${furniture}06"/>
  </svg>`;
}

/* ═══════════════════════════════════════════════════════════════
   PHASE 3 · DECISION ENGINE
═══════════════════════════════════════════════════════════════ */
function goPhase3() {
  if (!state.selectedDesign) state.selectedDesign = DESIGNS[0];
  showPhase(3);
  renderDecisionPreview();
  renderAIInsights();
  updateCommitCard();
}

function renderDecisionPreview() {
  const d = state.selectedDesign;
  document.getElementById('decisionPreview').innerHTML = drawRoomSVG(
    d.bg, d.furniture, d.accent, state.wallColor, state.lighting, state.decor
  );
}

function renderAIInsights() {
  const d = state.selectedDesign;
  const cheaper = DESIGNS.filter(x => x.costNum < d.costNum).length;
  document.getElementById('aiInsights').innerHTML = `
    <div class="insight-card"><div class="insight-icon">💰</div><div class="insight-text"><strong>${d.name}</strong> costs ${cheaper > 0 ? `less than ${cheaper} other design${cheaper > 1 ? 's' : ''}` : 'the most — but delivers the highest perceived value'}.</div></div>
    <div class="insight-card"><div class="insight-icon">📐</div><div class="insight-text">This layout <strong>improves space efficiency by 23%</strong> using furniture placement aligned to traffic flow.</div></div>
    <div class="insight-card"><div class="insight-icon">⏱</div><div class="insight-text">Estimated execution: <strong>${d.time}</strong>. ${state.constraints.has('rental') ? 'All items are rental-friendly and damage-free.' : 'All contractors available in your city.'}</div></div>
    ${state.constraints.has('vastu') ? `<div class="insight-card"><div class="insight-icon">🧭</div><div class="insight-text"><strong>Vastu compliant</strong>: seating faces east, main furniture avoids north-east quadrant.</div></div>` : ''}`;
}

function updateCommitCard() {
  const d = state.selectedDesign || DESIGNS[0];
  document.getElementById('commitTitle').textContent = `${d.name} · ${state.wallColor === '#2d2820' ? 'Charcoal' : state.wallColor === '#a8c4c8' ? 'Teal' : 'Light'} walls`;
  document.getElementById('commitCost').textContent = d.cost;
}

function setWall(color, el) {
  document.querySelectorAll('.color-sw').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  state.wallColor = color;
  renderDecisionPreview();
  updateCommitCard();
}

function setFurniture(type, val, btn) {
  const group = btn.closest('.swap-options');
  group.querySelectorAll('.swap-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state[type] = val;
  renderDecisionPreview();
}

function setLighting(mood, btn) {
  btn.closest('.swap-options').querySelectorAll('.swap-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.lighting = mood;
  renderDecisionPreview();
}

function toggleDecor(key, val) {
  state.decor[key] = val;
  renderDecisionPreview();
}

/* ═══════════════════════════════════════════════════════════════
   PHASE 4 · EXECUTION ENGINE
═══════════════════════════════════════════════════════════════ */
const MEP_DATA = {
  electrical: [
    { label: '5 power points (sofa wall)', color: '#60a5fa' },
    { label: '3 light switch clusters', color: '#60a5fa' },
    { label: '2 AC points (split unit)', color: '#60a5fa' },
    { label: '1 TV/media outlet cluster', color: '#60a5fa' },
  ],
  lighting: [
    { label: 'Recessed ceiling grid (6 pts)', color: '#fbbf24' },
    { label: 'Pendant over dining zone', color: '#fbbf24' },
    { label: '2 floor lamp positions', color: '#fbbf24' },
    { label: 'Cove LED strip (perimeter)', color: '#fbbf24' },
  ],
  plumbing: [
    { label: 'No plumbing changes required', color: '#34d399' },
  ],
};

const BOM_DATA = [
  { material: 'Interior Paint', spec: 'Asian Paints Royale Matt', qty: '24', unit: 'L', cost: '₹8,400', alt: 'Berger Silk' },
  { material: 'Hardwood Flooring', spec: 'Engineered Teak 12mm', qty: '180', unit: 'sq ft', cost: '₹36,000', alt: 'Vinyl Plank' },
  { material: 'Gypsum Ceiling', spec: 'Armstrong 10mm tiles', qty: '160', unit: 'sq ft', cost: '₹22,000', alt: 'POP finish' },
  { material: 'Fabric — Sofa', spec: 'Linen 30% cotton blend', qty: '18', unit: 'm', cost: '₹12,600', alt: 'Velvet weave' },
  { material: 'Curtain Fabric', spec: 'Blackout linen (3-layer)', qty: '12', unit: 'm', cost: '₹9,600', alt: 'Sheer voile' },
  { material: 'Area Rug', spec: 'Hand-tufted wool 8×10 ft', qty: '1', unit: 'pc', cost: '₹24,000', alt: 'Machine tufted' },
  { material: 'Wall Putty + Primer', spec: 'Birla White WallCare', qty: '40', unit: 'kg', cost: '₹4,200', alt: 'Asian Primers' },
  { material: 'Lighting Fixtures', spec: 'Philips LED downlights', qty: '8', unit: 'pc', cost: '₹11,200', alt: 'Havells range' },
];

const TIMELINE_DATA = [
  { week: 'Day 1–3 · Prep', tasks: [
    { icon: '🧹', name: 'Declutter & deep clean', dur: '1 day', cost: '₹2,000' },
    { icon: '📏', name: 'Measurements & site survey', dur: '0.5 day', cost: '₹1,500' },
  ]},
  { week: 'Week 1 · Structural', tasks: [
    { icon: '🎨', name: 'Ceiling gypsum work', dur: '3 days', cost: '₹22,000' },
    { icon: '🔌', name: 'Electrical & MEP work', dur: '2 days', cost: '₹18,000' },
    { icon: '🪵', name: 'Flooring installation', dur: '2 days', cost: '₹36,000' },
  ]},
  { week: 'Week 2 · Finishing', tasks: [
    { icon: '🖌', name: 'Painting — walls & ceilings', dur: '3 days', cost: '₹14,000' },
    { icon: '🚪', name: 'Doors, trims & hardware', dur: '1 day', cost: '₹8,000' },
  ]},
  { week: 'Week 3 · Furnishing', tasks: [
    { icon: '🛋', name: 'Furniture delivery & placement', dur: '1 day', cost: '₹1,20,000' },
    { icon: '💡', name: 'Lighting installation', dur: '0.5 day', cost: '₹11,200' },
    { icon: '🪴', name: 'Textiles, décor & styling', dur: '1 day', cost: '₹28,000' },
  ]},
];

function goPhase4() {
  showPhase(4);
  buildFloorPlan();
  buildMEP();
  buildBOM();
  buildTimeline();
}

function switchExecTab(tab, btn) {
  document.querySelectorAll('.exec-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.exec-panel').forEach(p => p.classList.add('hidden'));
  btn.classList.add('active');
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
}

function buildFloorPlan() {
  const svg = document.getElementById('floorPlanSVG');

  // canvas constants
  const PAD = 36, W = 400, H = 320;
  const roomW = W - PAD * 2;   // available pixel width
  const roomH = H - PAD * 2;   // available pixel height

  // real dims (use defaults if not entered)
  const L = state.dims.length  || 18;
  const B = state.dims.breadth || 14;
  const Ht = state.dims.height || 10;
  const area = (L * B).toFixed(0);

  // scale so the longer axis fills the available space
  const scaleX = roomW / L;
  const scaleY = roomH / B;
  const scale  = Math.min(scaleX, scaleY);

  // actual drawn room pixel size (centred in canvas)
  const rW = L * scale;
  const rH = B * scale;
  const ox  = PAD + (roomW - rW) / 2;   // top-left x
  const oy  = PAD + (roomH - rH) / 2;   // top-left y

  // helper: real-world ft → svg px relative to room origin
  const px = (ftX) => ox + ftX * scale;
  const py = (ftY) => oy + ftY * scale;
  const sw = (ft)  => ft * scale;  // size in px

  /* ── Room outline (shape-aware) ─────────────────────────── */
  let outline = '';
  if (state.shape === 'l-shape') {
    const cx = L * 0.6, cy = B * 0.45;
    outline = `M${px(0)},${py(0)} L${px(L)},${py(0)} L${px(L)},${py(cy)} L${px(cx)},${py(cy)} L${px(cx)},${py(B)} L${px(0)},${py(B)} Z`;
  } else if (state.shape === 'u-shape') {
    const inW = L * 0.3, inD = B * 0.45, inX = L * 0.35;
    outline = `M${px(0)},${py(0)} L${px(L)},${py(0)} L${px(L)},${py(B)} L${px(inX+inW)},${py(B)} L${px(inX+inW)},${py(inD)} L${px(inX)},${py(inD)} L${px(inX)},${py(B)} L${px(0)},${py(B)} Z`;
  } else if (state.shape === 'irregular') {
    outline = `M${px(0)},${py(B*0.3)} L${px(L*0.15)},${py(0)} L${px(L*0.85)},${py(0)} L${px(L)},${py(B*0.1)} L${px(L)},${py(B*0.9)} L${px(L*0.7)},${py(B)} L${px(0)},${py(B)} Z`;
  } else {
    // rectangle or square
    outline = `M${px(0)},${py(0)} L${px(L)},${py(0)} L${px(L)},${py(B)} L${px(0)},${py(B)} Z`;
  }

  /* ── Pillar rectangles ───────────────────────────────────── */
  const PILLAR_COORDS = (p) => {
    const gap = 0.3;
    const positions = {
      'top-left':     [gap,       gap],
      'top-right':    [L-p.w-gap, gap],
      'bottom-left':  [gap,       B-p.d-gap],
      'bottom-right': [L-p.w-gap, B-p.d-gap],
      'top-wall':     [(L-p.w)/2, gap],
      'bottom-wall':  [(L-p.w)/2, B-p.d-gap],
      'left-wall':    [gap,       (B-p.d)/2],
      'right-wall':   [L-p.w-gap, (B-p.d)/2],
      'center':       [(L-p.w)/2, (B-p.d)/2],
    };
    return positions[p.pos] || [1, 1];
  };

  const pillarsMarkup = state.pillars.map(p => {
    const [fx, fy] = PILLAR_COORDS(p);
    return `
      <rect x="${px(fx)}" y="${py(fy)}" width="${sw(p.w)}" height="${sw(p.d)}" rx="2"
            fill="rgba(251,146,60,.35)" stroke="#fb923c" stroke-width="1.5"/>
      <text x="${px(fx)+sw(p.w)/2}" y="${py(fy)+sw(p.d)/2+3}" fill="#fed7aa"
            font-size="7" text-anchor="middle" font-family="Inter" font-weight="600">PILLAR</text>`;
  }).join('');

  /* ── Furniture zones (proportional to room) ─────────────── */
  const sofaW = Math.min(L * 0.5, 10), sofaD = Math.min(B * 0.15, 3);
  const sofaX = (L - sofaW) / 2, sofaY = B * 0.55;
  const tableW = sofaW * 0.55, tableD = sofaD * 0.9;
  const tableX = (L - tableW) / 2, tableY = sofaY + sofaD + 0.8;
  const chairW = sofaD * 1.2, chairX = sofaX + sofaW + 0.8, chairY = sofaY;
  const storageW = Math.min(L * 0.12, 2.5), storageH = B * 0.3;

  svg.innerHTML = `
    <!-- Room fill -->
    <path d="${outline}" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.2)" stroke-width="2"/>

    <!-- Windows: top wall -->
    <rect x="${px(L*0.18)}" y="${oy-2}" width="${sw(L*0.2)}" height="5" rx="2" fill="#60a5fa" opacity=".55"/>
    <rect x="${px(L*0.55)}" y="${oy-2}" width="${sw(L*0.2)}" height="5" rx="2" fill="#60a5fa" opacity=".55"/>

    <!-- Door: left wall -->
    <rect x="${ox-2}" y="${py(B*0.35)}" width="4" height="${sw(B*0.15)}" fill="rgba(255,255,255,.3)"/>
    <path d="M${ox},${py(B*0.35)} Q${ox},${py(B*0.22)} ${px(L*0.12)},${py(B*0.22)}"
          fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1.2" stroke-dasharray="4,3"/>

    <!-- Seating zone -->
    <rect x="${px(sofaX-0.6)}" y="${py(sofaY-0.5)}" width="${sw(sofaW+chairW+2)}" height="${sw(sofaD+tableD+2.5)}"
          rx="5" fill="rgba(139,92,246,.08)" stroke="#8b5cf6" stroke-width="1" stroke-dasharray="4,3"/>
    <text x="${px(sofaX + (sofaW+chairW)/2)}" y="${py(sofaY-0.8)}"
          fill="#8b5cf6" font-size="7.5" text-anchor="middle" font-family="Inter" font-weight="600">SEATING ZONE</text>

    <!-- Sofa -->
    <rect x="${px(sofaX)}" y="${py(sofaY)}" width="${sw(sofaW)}" height="${sw(sofaD)}"
          rx="4" fill="rgba(212,197,176,.25)" stroke="rgba(212,197,176,.55)" stroke-width="1"/>
    <text x="${px(sofaX+sofaW/2)}" y="${py(sofaY+sofaD/2)+3}"
          fill="rgba(212,197,176,.8)" font-size="7.5" text-anchor="middle" font-family="Inter">SOFA</text>

    <!-- Coffee table -->
    <rect x="${px(tableX)}" y="${py(tableY)}" width="${sw(tableW)}" height="${sw(tableD)}"
          rx="3" fill="rgba(139,117,85,.2)" stroke="rgba(139,117,85,.45)" stroke-width="1"/>
    <text x="${px(tableX+tableW/2)}" y="${py(tableY+tableD/2)+3}"
          fill="rgba(139,117,85,.8)" font-size="7" text-anchor="middle" font-family="Inter">TABLE</text>

    <!-- Accent chair (only if room wide enough) -->
    ${chairX + chairW < L - 0.5 ? `
    <rect x="${px(chairX)}" y="${py(chairY)}" width="${sw(chairW)}" height="${sw(chairW)}"
          rx="3" fill="rgba(212,197,176,.18)" stroke="rgba(212,197,176,.4)" stroke-width="1"/>
    <text x="${px(chairX+chairW/2)}" y="${py(chairY+chairW/2)+3}"
          fill="rgba(212,197,176,.7)" font-size="6.5" text-anchor="middle" font-family="Inter">CHAIR</text>` : ''}

    <!-- Storage zone (right wall) -->
    <rect x="${px(L-storageW-0.3)}" y="${py(0.3)}" width="${sw(storageW)}" height="${sw(storageH)}"
          rx="3" fill="rgba(251,146,60,.1)" stroke="#fb923c" stroke-width="1" stroke-dasharray="3,3"/>
    <text x="${px(L-storageW/2-0.3)}" y="${py(0.3+storageH/2)+3}"
          fill="#fb923c" font-size="7" text-anchor="middle" font-family="Inter"
          transform="rotate(-90 ${px(L-storageW/2-0.3)} ${py(0.3+storageH/2)})">STORAGE</text>

    <!-- TV / focal wall -->
    <rect x="${px(L*0.2)}" y="${oy+2}" width="${sw(L*0.4)}" height="${sw(0.4)}"
          rx="2" fill="rgba(96,165,250,.2)" stroke="#60a5fa" stroke-width="1"/>
    <text x="${px(L*0.4)}" y="${oy+14}"
          fill="#60a5fa" font-size="7.5" text-anchor="middle" font-family="Inter">TV / FOCAL WALL</text>

    <!-- Circulation path -->
    <path d="M${ox+4},${py(B*0.7)} Q${px(L/2)},${py(B*0.7)} ${px(L*0.75)},${py(B*0.7)}"
          fill="none" stroke="#34d399" stroke-width="1.2" stroke-dasharray="5,4" opacity=".45"/>
    <path d="M${px(L*0.12)},${py(B*0.5)} L${px(L*0.12)},${py(B*0.9)}"
          fill="none" stroke="#34d399" stroke-width="1.2" stroke-dasharray="5,4" opacity=".45"/>

    <!-- Pillars -->
    ${pillarsMarkup}

    <!-- Dimension annotations -->
    <line x1="${ox}" y1="${oy+rH+12}" x2="${ox+rW}" y2="${oy+rH+12}" stroke="rgba(255,255,255,.15)" stroke-width="1"/>
    <line x1="${ox}" y1="${oy+rH+9}" x2="${ox}" y2="${oy+rH+15}" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
    <line x1="${ox+rW}" y1="${oy+rH+9}" x2="${ox+rW}" y2="${oy+rH+15}" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
    <text x="${ox+rW/2}" y="${oy+rH+22}" fill="rgba(255,255,255,.35)" font-size="8" text-anchor="middle" font-family="Inter">${L} ft</text>

    <line x1="${ox+rW+12}" y1="${oy}" x2="${ox+rW+12}" y2="${oy+rH}" stroke="rgba(255,255,255,.15)" stroke-width="1"/>
    <line x1="${ox+rW+9}" y1="${oy}" x2="${ox+rW+15}" y2="${oy}" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
    <line x1="${ox+rW+9}" y1="${oy+rH}" x2="${ox+rW+15}" y2="${oy+rH}" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
    <text x="${ox+rW+20}" y="${oy+rH/2+3}" fill="rgba(255,255,255,.35)" font-size="8" text-anchor="middle" font-family="Inter"
          transform="rotate(90 ${ox+rW+20} ${oy+rH/2})">${B} ft</text>

    <!-- Area + height label -->
    <text x="${PAD}" y="${PAD-10}" fill="rgba(255,255,255,.25)" font-size="8" font-family="Inter">${area} sq ft · Ht ${Ht} ft · ${state.shape}</text>
  `;
}

function buildMEP() {
  const grid = document.getElementById('mepGrid');
  grid.innerHTML = '';
  const icons = { electrical: '⚡', lighting: '💡', plumbing: '🚿' };
  Object.entries(MEP_DATA).forEach(([cat, items]) => {
    const card = document.createElement('div');
    card.className = 'mep-card';
    card.innerHTML = `
      <div class="mep-card-title">${icons[cat]} ${cat.charAt(0).toUpperCase() + cat.slice(1)}</div>
      ${items.map(it => `<div class="mep-item"><div class="mep-dot" style="background:${it.color}"></div>${it.label}</div>`).join('')}`;
    grid.appendChild(card);
  });
}

function buildBOM() {
  const body = document.getElementById('bomBody');
  body.innerHTML = '';
  let total = 0;
  BOM_DATA.forEach(row => {
    const cost = parseInt(row.cost.replace(/[^\d]/g, ''));
    total += cost;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600">${row.material}</td>
      <td style="color:var(--muted2)">${row.spec}</td>
      <td>${row.qty}</td>
      <td style="color:var(--muted)">${row.unit}</td>
      <td style="font-weight:600;color:var(--accent)">${row.cost}</td>
      <td><span class="bom-alt">↔ ${row.alt}</span></td>`;
    body.appendChild(tr);
  });
  document.getElementById('bomTotal').textContent = `₹${total.toLocaleString('en-IN')}`;
}

function buildTimeline() {
  const container = document.getElementById('timelineContainer');
  container.innerHTML = '';
  TIMELINE_DATA.forEach(week => {
    const wDiv = document.createElement('div');
    wDiv.className = 'tl-week';
    wDiv.innerHTML = `
      <div class="tl-week-label">${week.week}</div>
      <div class="tl-tasks">
        ${week.tasks.map(t => `
          <div class="tl-task">
            <div class="tl-task-icon">${t.icon}</div>
            <div class="tl-task-name">${t.name}</div>
            <div class="tl-task-dur">${t.dur}</div>
            <div class="tl-task-cost">${t.cost}</div>
          </div>`).join('')}
      </div>`;
    container.appendChild(wDiv);
  });
}

/* ═══════════════════════════════════════════════════════════════
   PHASE 5 · PROCUREMENT
═══════════════════════════════════════════════════════════════ */
/* category → gradient bg for product cards */
const CAT_GRADIENTS = {
  furniture: 'linear-gradient(135deg,#c8a878,#8b6840)',
  lighting:  'linear-gradient(135deg,#fde68a,#b07828)',
  textiles:  'linear-gradient(135deg,#fcd5b4,#c87858)',
  decor:     'linear-gradient(135deg,#bbf7d0,#4a7a3a)',
  material:  'linear-gradient(135deg,#e2d9d0,#9b8c78)',
};

const PRODUCTS = [
  // ── Furniture ───────────────────────────────────────────────────────────
  { id:1,  name:'Linen Modular Sofa 3-Seater',      brand:'Pepperfry',          price:58000, emoji:'🛋', category:'furniture', badge:'Top Pick',    styles:['japandi','scandinavian','modern-minimal','warm-minimal'] },
  { id:2,  name:'Sheesham Wood Coffee Table',        brand:'WoodenStreet',       price:22000, emoji:'🪵', category:'furniture', badge:null,           styles:['indian-modern','contemporary','warm-minimal','bohemian'] },
  { id:3,  name:'Rattan Accent Chair',               brand:'FabIndia',           price:18500, emoji:'🪑', category:'furniture', badge:null,           styles:['bohemian','earthy-organic','warm-minimal'] },
  { id:4,  name:'Teak Sideboard with Brass Handles', brand:'Urban Ladder',       price:45000, emoji:'🗄', category:'furniture', badge:'AI Pick',      styles:['indian-modern','contemporary','luxury-modern'] },
  { id:5,  name:'Velvet 2-Seater Sofa',              brand:'Nilkamal',           price:34000, emoji:'🛋', category:'furniture', badge:null,           styles:['luxury-modern','contemporary'] },
  { id:6,  name:'Minimalist Platform Bed Frame',     brand:'IKEA India',         price:28000, emoji:'🛏', category:'furniture', badge:null,           styles:['japandi','modern-minimal','scandinavian'] },
  { id:7,  name:'Jali Carved Bookshelf',             brand:'FabIndia',           price:38000, emoji:'📚', category:'furniture', badge:'Heritage',     styles:['indian-modern','bohemian'] },
  { id:8,  name:'Ergonomic Study Chair',             brand:'Featherlite',        price:16000, emoji:'🪑', category:'furniture', badge:null,           styles:['modern-minimal','contemporary','industrial'] },
  // ── Lighting ────────────────────────────────────────────────────────────
  { id:9,  name:'Arched Brass Floor Lamp',           brand:'Elvy',               price:12400, emoji:'💡', category:'lighting',  badge:'AI Pick',      styles:['indian-modern','luxury-modern','contemporary','warm-minimal'] },
  { id:10, name:'Rattan Pendant Light',              brand:'Nestasia',            price:5800,  emoji:'🪔', category:'lighting',  badge:null,           styles:['bohemian','earthy-organic','warm-minimal','scandinavian'] },
  { id:11, name:'Edison Bulb String 3m',             brand:'Philips India',       price:2200,  emoji:'✨', category:'lighting',  badge:'Value',        styles:['industrial','bohemian','scandinavian'] },
  { id:12, name:'Geometric Pendant Cluster',         brand:'Havells',             price:8600,  emoji:'🔆', category:'lighting',  badge:null,           styles:['modern-minimal','contemporary','luxury-modern'] },
  { id:13, name:'Brass Sconce Pair',                 brand:'Jainsons Emporio',    price:11200, emoji:'🕯', category:'lighting',  badge:null,           styles:['indian-modern','luxury-modern','contemporary'] },
  { id:14, name:'Cove LED Strip 5m',                 brand:'Syska',               price:1800,  emoji:'💫', category:'lighting',  badge:'Value',        styles:['modern-minimal','luxury-modern','contemporary','industrial'] },
  // ── Textiles ────────────────────────────────────────────────────────────
  { id:15, name:'Handwoven Jute Rug 8×10',           brand:'Chumbak',             price:14200, emoji:'🧶', category:'textiles',  badge:null,           styles:['earthy-organic','bohemian','warm-minimal','japandi'] },
  { id:16, name:'Linen Throw Pillows ×4',            brand:'FabIndia',            price:3800,  emoji:'🛏', category:'textiles',  badge:null,           styles:['japandi','scandinavian','warm-minimal','modern-minimal'] },
  { id:17, name:'Block-Print Curtain Set',           brand:'Good Earth',          price:6800,  emoji:'🎨', category:'textiles',  badge:'AI Pick',      styles:['indian-modern','bohemian','warm-minimal'] },
  { id:18, name:'Boucle Throw Blanket',              brand:'H&M Home',            price:2800,  emoji:'🧺', category:'textiles',  badge:null,           styles:['scandinavian','japandi','warm-minimal'] },
  { id:19, name:'Wool Dhurrie Rug 6×9',              brand:'Good Earth',          price:18500, emoji:'🧶', category:'textiles',  badge:'Heritage',     styles:['indian-modern','bohemian'] },
  { id:20, name:'Blackout Linen Drapes',             brand:'Spaces',              price:5200,  emoji:'🪟', category:'textiles',  badge:null,           styles:['modern-minimal','japandi','scandinavian','luxury-modern'] },
  // ── Décor ────────────────────────────────────────────────────────────────
  { id:21, name:'Monstera Deliciosa (large)',        brand:'Ugaoo',               price:1200,  emoji:'🪴', category:'decor',     badge:null,           styles:['earthy-organic','bohemian','scandinavian','warm-minimal'] },
  { id:22, name:'Abstract Canvas Print 36"',         brand:'Minted India',        price:6500,  emoji:'🖼', category:'decor',     badge:'AI Pick',      styles:['contemporary','modern-minimal','luxury-modern'] },
  { id:23, name:'Terracotta Vase Set of 3',          brand:'Craft Masters',       price:2200,  emoji:'🏺', category:'decor',     badge:null,           styles:['earthy-organic','warm-minimal','bohemian','indian-modern'] },
  { id:24, name:'Brass Diya Tray Set of 5',          brand:'FabIndia',            price:1800,  emoji:'🪔', category:'decor',     badge:'Heritage',     styles:['indian-modern'] },
  { id:25, name:'Geometric Wall Mirror 24"',         brand:'Pepperfry',           price:4800,  emoji:'🪞', category:'decor',     badge:null,           styles:['contemporary','modern-minimal','luxury-modern','industrial'] },
  { id:26, name:'Macramé Wall Hanging',              brand:'Nestasia',             price:3200,  emoji:'🎀', category:'decor',     badge:null,           styles:['bohemian','warm-minimal','earthy-organic'] },
  // ── Materials ────────────────────────────────────────────────────────────
  { id:27, name:'Engineered Teak Flooring 180sqft',  brand:'Pergo India',         price:36000, emoji:'🪵', category:'material',  badge:null,           styles:['japandi','indian-modern','warm-minimal','contemporary'] },
  { id:28, name:'Asian Paints Royale Matt 20L',      brand:'Asian Paints',        price:8400,  emoji:'🎨', category:'material',  badge:'Recommended',  styles:['all'] },
  { id:29, name:'Italian Marble Tiles (1 box)',      brand:'Johnson Tiles',       price:12000, emoji:'⬜', category:'material',  badge:null,           styles:['luxury-modern','contemporary'] },
  { id:30, name:'Microcement Wall Finish Kit',       brand:'Berger Paints',       price:4500,  emoji:'🔲', category:'material',  badge:'New',          styles:['industrial','modern-minimal'] },
];

function goPhase5() {
  showPhase(5);
  // Remove previous AI product notice if any
  document.getElementById('aiProductNotice')?.remove();
  renderProducts('all');
}

function renderProducts(filter) {
  const grid = document.getElementById('productGrid');
  grid.innerHTML = '';

  // Remove old AI product notice
  document.getElementById('aiProductNotice')?.remove();

  const styleKey = state.selectedDesign?.styleKey;
  let list = filter === 'all' ? [...PRODUCTS] : PRODUCTS.filter(p => p.category === filter);

  // Sort: style-matched products first
  if (styleKey) {
    list.sort((a, b) => {
      const aM = (a.styles?.includes(styleKey) || a.styles?.includes('all')) ? 1 : 0;
      const bM = (b.styles?.includes(styleKey) || b.styles?.includes('all')) ? 1 : 0;
      return bM - aM;
    });
  }

  // AI curation notice
  if (styleKey && filter === 'all') {
    const matchCount = list.filter(p => p.styles?.includes(styleKey) || p.styles?.includes('all')).length;
    const notice = document.createElement('div');
    notice.id = 'aiProductNotice';
    notice.className = 'ai-product-notice';
    notice.innerHTML = `<span class="ai-product-tag">✦ AI Curated</span>&nbsp; ${matchCount} items handpicked for your <strong>${STYLE_THEMES[styleKey]?.name || styleKey}</strong> design, sorted by style match`;
    grid.parentNode.insertBefore(notice, grid);
  }

  list.forEach((p, i) => {
    const inCart = state.cart.some(c => c.id === p.id);
    const isMatch = styleKey && (p.styles?.includes(styleKey) || p.styles?.includes('all'));
    const gradient = CAT_GRADIENTS[p.category] || CAT_GRADIENTS.furniture;
    const card = document.createElement('div');
    card.className = `product-card${inCart ? ' in-cart' : ''}${isMatch ? ' style-match' : ''}`;
    card.style.animationDelay = `${i * 0.04}s`;
    card.innerHTML = `
      <div class="product-img" style="background:${gradient}">
        <span class="product-emoji">${p.emoji}</span>
        ${p.badge ? `<div class="product-badge">${p.badge}</div>` : ''}
        ${isMatch ? '<div class="product-style-match">✦ Style Match</div>' : ''}
      </div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-brand">${p.brand}</div>
        <div class="product-footer">
          <div class="product-price">₹${p.price.toLocaleString('en-IN')}</div>
          <button class="add-to-cart${inCart ? ' added' : ''}" id="cart-btn-${p.id}" onclick="toggleCart(${p.id},this)">
            ${inCart ? '✓ Added' : '+ Add'}
          </button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

function filterProducts(filter, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderProducts(filter);
}

function toggleCart(id, btn) {
  const product = PRODUCTS.find(p => p.id === id);
  const idx = state.cart.findIndex(c => c.id === id);
  if (idx === -1) { state.cart.push(product); btn.textContent = '✓ Added'; btn.classList.add('added'); btn.closest('.product-card').classList.add('in-cart'); }
  else { state.cart.splice(idx, 1); btn.textContent = '+ Add'; btn.classList.remove('added'); btn.closest('.product-card').classList.remove('in-cart'); }
  updateCart();
  if (typeof fbSaveCart === 'function') fbSaveCart(state.cart).catch(() => {});
  if (typeof trackEvent === 'function') trackEvent(idx === -1 ? 'add_to_cart' : 'remove_from_cart', { item_id: id });
}

function updateCart() {
  const total = state.cart.reduce((s, p) => s + p.price, 0);
  document.getElementById('cartCount').textContent = `${state.cart.length} item${state.cart.length !== 1 ? 's' : ''}`;
  document.getElementById('cartTotal').textContent = `₹${total.toLocaleString('en-IN')}`;
  const items = document.getElementById('cartItems');
  items.innerHTML = '';
  state.cart.forEach(p => {
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `<span class="cart-item-icon">${p.emoji}</span><span class="cart-item-name">${p.name}</span><span class="cart-item-price">₹${p.price.toLocaleString('en-IN')}</span>`;
    items.appendChild(div);
  });
}

async function checkout() {
  if (state.cart.length === 0) { alert('Add at least one item to your cart first!'); return; }
  if (typeof fbCheckout === 'function') {
    await fbCheckout(state.cart).catch(() => {});
  }
  showScreen('success');
}

/* ═══════════════════════════════════════════════════════════════
   PERSISTENCE — localStorage auto-save + JSON export/import
═══════════════════════════════════════════════════════════════ */
const STORAGE_KEY = 'hodd_session_v1';

/** Fields safe to persist (skip non-serialisable Sets, large data-URLs) */
function stateToStorage() {
  return {
    room: state.room,
    style: state.style,
    city: state.city,
    budget: state.budget,
    constraints: [...state.constraints],
    notes: state.notes,
    dims: state.dims,
    shape: state.shape,
    pillars: state.pillars,
    selectedDesign: state.selectedDesign,
    favDesigns: [...state.favDesigns],
    wallColor: state.wallColor,
    sofa: state.sofa,
    floor: state.floor,
    lighting: state.lighting,
    decor: state.decor,
    cart: state.cart,
    phase: state.phase,
    savedAt: new Date().toISOString(),
  };
}

function saveToStorage() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToStorage())); } catch(e) {}
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    Object.assign(state, {
      room: saved.room ?? state.room,
      style: saved.style ?? state.style,
      city: saved.city ?? state.city,
      budget: saved.budget ?? state.budget,
      constraints: new Set(saved.constraints ?? []),
      notes: saved.notes ?? state.notes,
      dims: saved.dims ?? state.dims,
      shape: saved.shape ?? state.shape,
      pillars: saved.pillars ?? state.pillars,
      selectedDesign: saved.selectedDesign ?? state.selectedDesign,
      favDesigns: new Set(saved.favDesigns ?? []),
      wallColor: saved.wallColor ?? state.wallColor,
      sofa: saved.sofa ?? state.sofa,
      floor: saved.floor ?? state.floor,
      lighting: saved.lighting ?? state.lighting,
      decor: saved.decor ?? state.decor,
      cart: saved.cart ?? state.cart,
    });
    return saved.savedAt ? saved.savedAt : true;
  } catch(e) { return false; }
}

/** Auto-save every time state changes — called from key interactions */
function autosave() {
  saveToStorage();
  // Also sync to Firestore if user is logged in
  if (typeof fbSaveSession === 'function') fbSaveSession().catch(() => {});
  showSaveToast();
}

let toastTimer;
function showSaveToast() {
  let toast = document.getElementById('saveToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'saveToast';
    toast.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%) translateY(20px);background:var(--surface);border:1px solid var(--border2);color:var(--text);font-size:.78rem;font-weight:600;padding:.5rem 1.2rem;border-radius:100px;box-shadow:0 4px 20px rgba(0,0,0,.15);opacity:0;transition:opacity .25s,transform .25s;z-index:9999;pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = '✓ Progress saved';
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
  }, 2000);
}

/** Download current design as JSON */
function exportDesign() {
  const data = stateToStorage();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `HODD-design-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Import a previously exported JSON */
function importDesign(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const saved = JSON.parse(e.target.result);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      loadFromStorage();
      renderStyleCards();
      alert('✓ Design loaded! Continue from where you left off.');
      showScreen('wizard');
      showPhase(saved.phase || 1);
    } catch(err) { alert('Could not read file — make sure it\'s a valid HODD export.'); }
  };
  reader.readAsText(file);
}

/* ═══════════════════════════════════════════════════════════════
   SHARE DESIGN (URL hash-based)
═══════════════════════════════════════════════════════════════ */
function shareDesign() {
  const data = {
    r:  state.room,
    s:  state.style,
    bt: state.budget.tier,
    sd: state.selectedDesign?.id || null,
    wc: state.wallColor,
  };
  const hash = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  const url  = `${location.origin}${location.pathname}#share=${hash}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showShareToast('🔗 Link copied! Share it with anyone.'));
  } else {
    prompt('Copy this link to share your design:', url);
  }
}

function showShareToast(msg) {
  let t = document.getElementById('shareToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'shareToast';
    t.style.cssText = 'position:fixed;top:1.5rem;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;font-size:.82rem;font-weight:700;padding:.6rem 1.6rem;border-radius:100px;box-shadow:0 4px 24px rgba(0,0,0,.2);z-index:9999;display:none;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.display = 'block';
  t.style.animation = 'fadeSlide .25s ease';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, 3500);
}

function parseShareFromHash() {
  const m = location.hash.match(/#share=([A-Za-z0-9+/=]+)/);
  if (!m) return false;
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    if (data.r)  state.room   = data.r;
    if (data.s)  state.style  = data.s;
    if (data.bt !== undefined) state.budget = BUDGET_DATA[data.bt] || state.budget;
    if (data.wc) state.wallColor = data.wc;
    if (data.sd) state.selectedDesign = DESIGNS.find(d => d.id === data.sd) || null;
    return true;
  } catch(e) { return false; }
}

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Load shared design from URL hash (if any)
  const isShare = parseShareFromHash();

  if (isShare) {
    // Start wizard with shared state
    renderStyleCards();
    injectLandingScenes();
    setTimeout(() => {
      startFlow();
      if (state.selectedDesign) showPhase(3);
    }, 300);
    showShareToast('✦ Viewing a shared design!');
    return;
  }

  // Restore previous session if available
  const savedAt = loadFromStorage();
  if (savedAt) {
    const dateStr = typeof savedAt === 'string'
      ? new Date(savedAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
      : '';
    showResumeBanner(dateStr);
  }

  renderStyleCards();
  injectLandingScenes();
});

function showResumeBanner(dateStr) {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const banner = document.createElement('div');
  banner.id = 'resumeBanner';
  banner.style.cssText = 'display:flex;align-items:center;gap:.75rem;background:var(--surface);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:.65rem 1rem;margin:0 auto 1.5rem;max-width:480px;font-size:.82rem;';
  banner.innerHTML = `
    <span style="font-size:1.1rem">💾</span>
    <span style="flex:1;color:var(--muted2)">Session saved${dateStr ? ' · ' + dateStr : ''}</span>
    <button onclick="resumeSession()" style="background:var(--accent);color:#fff;border:none;border-radius:var(--radius-xs);padding:.3rem .8rem;font-size:.78rem;font-weight:600;cursor:pointer;">Resume →</button>
    <button onclick="clearSession()" style="background:none;border:none;color:var(--muted);font-size:.78rem;cursor:pointer;padding:.3rem;">Clear</button>`;
  hero.insertAdjacentElement('afterbegin', banner);
}

function resumeSession() {
  document.getElementById('resumeBanner')?.remove();
  renderStyleCards();
  showScreen('wizard');
  showPhase(state.phase || 1);
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  document.getElementById('resumeBanner')?.remove();
}


function injectLandingScenes() {
  document.querySelectorAll('.room-img[data-scene]').forEach(el => {
    const key = el.dataset.scene;
    const theme = STYLE_THEMES[key];
    if (!theme) return;
    const svgFallback = `<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">${theme.scene(400, 220)}</svg>`;
    el.innerHTML = `
      <img src="${theme.img}" alt="${theme.name} interior" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block"
           onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
      <div style="display:none;width:100%;height:100%">${svgFallback}</div>`;
  });
}
