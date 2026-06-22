/* ═══════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════ */
const state = {
  room: null, style: [], city: '', budget: { label: 'Mid-Range', value: '₹2,00,000', tier: 1, numValue: 200000 },
  constraints: new Set(), notes: '',
  uploadedFiles: [], referencePhoto: null,
  dims: { length: 18, breadth: 14, height: 10 },
  shape: 'rectangle',
  pillars: [],
  furniture: { existing: [], wanted: [], reconfigure: false },
  selectedDesign: null, favDesigns: new Set(), compareDesigns: new Set(),
  wallColor: '#F5F0E8', sofa: { style: 'modular', material: 'fabric', color: '#C8C0B0', size: '3-seater' }, floor: 'teak-hardwood', lighting: 'warm', wallFinish: 'matte', lightingType: 'recessed', ceiling: 'plain', curtain: {}, rug: {},
  decor: { plant: true, art: true, rug: false, curtains: false },
  cart: [], phase: 1,
};

const BUDGET_DATA = [
  { label: 'Budget-Friendly', value: '₹50,000',    tier: 0 },
  { label: 'Budget-Friendly', value: '₹75,000',    tier: 0 },
  { label: 'Budget-Friendly', value: '₹1,00,000',  tier: 0 },
  { label: 'Budget-Friendly', value: '₹1,25,000',  tier: 0 },
  { label: 'Mid-Range',       value: '₹1,50,000',  tier: 1 },
  { label: 'Mid-Range',       value: '₹1,75,000',  tier: 1 },
  { label: 'Mid-Range',       value: '₹2,00,000',  tier: 1 },
  { label: 'Mid-Range',       value: '₹2,50,000',  tier: 1 },
  { label: 'Mid-Range',       value: '₹3,00,000',  tier: 1 },
  { label: 'Mid-Range',       value: '₹3,50,000',  tier: 1 },
  { label: 'Mid-Range',       value: '₹4,00,000',  tier: 1 },
  { label: 'Mid-Range',       value: '₹5,00,000',  tier: 1 },
  { label: 'Premium',         value: '₹6,00,000',  tier: 2 },
  { label: 'Premium',         value: '₹7,00,000',  tier: 2 },
  { label: 'Premium',         value: '₹8,00,000',  tier: 2 },
  { label: 'Premium',         value: '₹10,00,000', tier: 2 },
  { label: 'Luxury',          value: '₹12,00,000', tier: 3 },
  { label: 'Luxury',          value: '₹15,00,000+', tier: 3 },
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
  if (n === 1) syncBudgetSlider();
  autosave();
}

function syncBudgetSlider() {
  const slider = document.getElementById('budgetSlider');
  if (!slider) return;
  const num = state.budget?.numValue || 200000;
  slider.value = num;
  document.getElementById('budgetDisplay').textContent = state.budget?.value || formatINR(num);
  document.getElementById('budgetTier').textContent = state.budget?.label || 'Mid-Range';
}

function startFlow() { showScreen('wizard'); showPhase(1); warmReplicate(); }

/* Fire a tiny placeholder prediction to wake the Replicate model while user
   fills in Step 1 — so by the time they reach Phase 2 the cold-start is gone. */
async function warmReplicate() {
  try {
    await fetch('/.netlify/functions/render-poll?id=warmup', { method: 'GET' });
  } catch (_) { /* silent — warmup is best-effort */ }
}
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
function selectRoomDropdown(val) {
  state.room = val || null;
  autosave();
}
// legacy — keep so any old references don't break
function selectRoom(el) {
  state.room = el?.dataset?.room || null;
  autosave();
}

/* ── Layout popup ── */
function showLayoutPopup() {
  document.getElementById('layoutPopupOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeLayoutPopup() {
  document.getElementById('layoutPopupOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}
function generateAndShowLayout() {
  closeLayoutPopup();
  // show canvas panel, hide upload area
  document.getElementById('p1UploadArea').classList.add('hidden');
  document.getElementById('p1ImagePreview').classList.add('hidden');
  document.getElementById('p1CanvasWrap').classList.remove('hidden');
  drawRoomLayout();
}

/* ── Room canvas visualizer ── */
function drawRoomLayout() {
  const canvas = document.getElementById('roomCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const l = parseFloat(document.getElementById('dimLength')?.value) || 18;
  const b = parseFloat(document.getElementById('dimBreadth')?.value) || 14;
  const shape = state.shape || state.roomShape || 'rectangle';

  const pad = 52;
  const scale = Math.min((W - pad * 2) / l, (H - pad * 2) / b);
  const rw = l * scale, rh = b * scale;
  const rx = (W - rw) / 2, ry = (H - rh) / 2;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#16100a';
  ctx.fillRect(0, 0, W, H);

  // Grid lines (1 ft spacing)
  ctx.strokeStyle = 'rgba(201,146,58,.07)';
  ctx.lineWidth = 1;
  for (let x = rx; x <= rx + rw + 0.5; x += scale) {
    ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x, ry + rh); ctx.stroke();
  }
  for (let y = ry; y <= ry + rh + 0.5; y += scale) {
    ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx + rw, y); ctx.stroke();
  }

  // ── Build room path (reusable for fill, stroke, clip) ──────────
  function buildRoomPath() {
    ctx.beginPath();
    if (shape === 'l-shape') {
      const mx = rx + rw * 0.55, my = ry + rh * 0.45;
      ctx.moveTo(rx, ry); ctx.lineTo(mx, ry); ctx.lineTo(mx, my);
      ctx.lineTo(rx + rw, my); ctx.lineTo(rx + rw, ry + rh);
      ctx.lineTo(rx, ry + rh); ctx.closePath();
    } else if (shape === 't-shape') {
      // Top bar full width, stem comes down from center
      const sw = rw * 0.38, sx = rx + (rw - sw) / 2;
      const barH = rh * 0.4;
      ctx.moveTo(rx, ry); ctx.lineTo(rx + rw, ry);
      ctx.lineTo(rx + rw, ry + barH); ctx.lineTo(sx + sw, ry + barH);
      ctx.lineTo(sx + sw, ry + rh); ctx.lineTo(sx, ry + rh);
      ctx.lineTo(sx, ry + barH); ctx.lineTo(rx, ry + barH);
      ctx.closePath();
    } else if (shape === 'u-shape') {
      const wa = rw * 0.28, wb = rw * 0.72, mh = rh * 0.5;
      ctx.moveTo(rx, ry); ctx.lineTo(rx + wa, ry); ctx.lineTo(rx + wa, ry + mh);
      ctx.lineTo(rx + wb, ry + mh); ctx.lineTo(rx + wb, ry);
      ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + rh);
      ctx.lineTo(rx, ry + rh); ctx.closePath();
    } else if (shape === 'circle') {
      ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
    } else if (shape === 'trapezoid') {
      const inset = rw * 0.18;
      ctx.moveTo(rx + inset, ry); ctx.lineTo(rx + rw - inset, ry);
      ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx, ry + rh);
      ctx.closePath();
    } else if (shape === 'octagon') {
      const cut = Math.min(rw, rh) * 0.22;
      ctx.moveTo(rx + cut, ry); ctx.lineTo(rx + rw - cut, ry);
      ctx.lineTo(rx + rw, ry + cut); ctx.lineTo(rx + rw, ry + rh - cut);
      ctx.lineTo(rx + rw - cut, ry + rh); ctx.lineTo(rx + cut, ry + rh);
      ctx.lineTo(rx, ry + rh - cut); ctx.lineTo(rx, ry + cut);
      ctx.closePath();
    } else if (shape === 'square') {
      const s = Math.min(rw, rh);
      ctx.rect(rx + (rw - s) / 2, ry + (rh - s) / 2, s, s);
    } else {
      ctx.rect(rx, ry, rw, rh);
    }
  }

  // Fill
  buildRoomPath();
  ctx.fillStyle = 'rgba(201,146,58,.07)';
  ctx.fill();

  // ── Furniture clipped to room shape ─────────────────────────
  ctx.save();
  buildRoomPath();
  ctx.clip();
  drawFurniture(ctx, rx, ry, rw, rh, shape, state.room);
  ctx.restore();

  // Room outline (drawn after clip restore so it stays sharp)
  buildRoomPath();
  ctx.strokeStyle = '#c9923a';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Door arc — bottom-right corner of the room
  const doorSize = Math.min(scale * 3, rw * 0.22);
  ctx.beginPath();
  ctx.arc(rx + rw, ry + rh, doorSize, Math.PI, Math.PI * 1.5);
  ctx.strokeStyle = 'rgba(201,146,58,.45)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.clearRect(rx + rw - doorSize - 1, ry + rh - 2.5, doorSize + 1, 5);

  // Dimension labels
  ctx.fillStyle = '#c9923a';
  ctx.font = `bold ${Math.max(11, Math.min(14, scale * 0.7))}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${l} ft`, rx + rw / 2, ry - 18);
  ctx.save();
  ctx.translate(rx - 20, ry + rh / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${b} ft`, 0, 0);
  ctx.restore();

  // Dimension tick marks
  ctx.strokeStyle = 'rgba(201,146,58,.5)';
  ctx.lineWidth = 1.2;
  [[rx, ry-10, rx, ry-26],[rx+rw, ry-10, rx+rw, ry-26],
   [rx-10, ry, rx-26, ry],[rx-10, ry+rh, rx-26, ry+rh]].forEach(([x1,y1,x2,y2]) => {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  });
  ctx.beginPath(); ctx.moveTo(rx, ry-18); ctx.lineTo(rx+rw, ry-18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rx-18, ry); ctx.lineTo(rx-18, ry+rh); ctx.stroke();

  // Pillars (also clipped to room via save/restore above — draw separately)
  if (state.pillars?.length) {
    ctx.save();
    buildRoomPath(); ctx.clip();
    state.pillars.forEach(p => {
      const pw = (p.w || 1.5) * scale, pd = (p.d || 1.5) * scale;
      let px = rx, py = ry;
      if (p.pos.includes('right')) px = rx + rw - pw;
      if (p.pos.includes('bottom')) py = ry + rh - pd;
      if (p.pos === 'center') { px = rx + rw/2 - pw/2; py = ry + rh/2 - pd/2; }
      if (p.pos === 'top-wall') px = rx + rw/2 - pw/2;
      if (p.pos === 'bottom-wall') { px = rx + rw/2 - pw/2; py = ry + rh - pd; }
      if (p.pos === 'left-wall') py = ry + rh/2 - pd/2;
      if (p.pos === 'right-wall') { px = rx + rw - pw; py = ry + rh/2 - pd/2; }
      ctx.fillStyle = 'rgba(201,146,58,.6)';
      ctx.fillRect(px, py, pw, pd);
      ctx.strokeStyle = '#c9923a'; ctx.lineWidth = 1.5;
      ctx.strokeRect(px, py, pw, pd);
      ctx.strokeStyle = 'rgba(201,146,58,.25)'; ctx.lineWidth = 1;
      for (let i = 0; i < pw + pd; i += 5) {
        ctx.beginPath();
        ctx.moveTo(px + Math.max(0,i-pd), py + Math.min(pd,i));
        ctx.lineTo(px + Math.min(pw,i), py + Math.max(0,i-pw));
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  // Compass rose
  drawCompass(ctx, W - 26, 26, 14);
}

function drawFurniture(ctx, rx, ry, rw, rh, shape, room) {
  ctx.save();
  ctx.globalAlpha = 0.38;
  const c = '#d4a050';

  // ── Per-shape safe zone centers ──────────────────────────────
  // For irregular shapes we place furniture in the guaranteed-inside zones.
  // The clip set by the caller prevents any overflow.
  let zones;
  if (shape === 'l-shape') {
    zones = {
      main:  { cx: rx + rw * 0.275, cy: ry + rh * 0.55 },
      table: { cx: rx + rw * 0.275, cy: ry + rh * 0.35 },
      alt:   { cx: rx + rw * 0.78,  cy: ry + rh * 0.72 },
      wall:  { top: ry + 8, left: rx + 8, right: rx + rw * 0.52, bottom: ry + rh - 8 },
    };
  } else if (shape === 't-shape') {
    // Stem center is safe for main furniture
    const sw = rw * 0.38, sx = rx + (rw - sw) / 2;
    zones = {
      main:  { cx: sx + sw / 2, cy: ry + rh * 0.72 },
      table: { cx: sx + sw / 2, cy: ry + rh * 0.55 },
      alt:   { cx: rx + rw * 0.15, cy: ry + rh * 0.22 },
      wall:  { top: ry + 8, left: sx + 6, right: sx + sw - 6, bottom: ry + rh - 8 },
    };
  } else if (shape === 'circle' || shape === 'octagon' || shape === 'trapezoid') {
    // Center is always safe for these
    zones = {
      main:  { cx: rx + rw * 0.5,  cy: ry + rh * 0.62 },
      table: { cx: rx + rw * 0.5,  cy: ry + rh * 0.42 },
      alt:   { cx: rx + rw * 0.72, cy: ry + rh * 0.28 },
      wall:  { top: ry + rh * 0.15, left: rx + rw * 0.15, right: rx + rw * 0.85, bottom: ry + rh * 0.85 },
    };
  } else if (shape === 'u-shape') {
    // Bottom connecting bar is safest for main furniture
    // U: left col (0→28%), right col (72→100%), bottom bar (28%→72%, 50%→100%)
    zones = {
      main:  { cx: rx + rw * 0.5,  cy: ry + rh * 0.75 },
      table: { cx: rx + rw * 0.5,  cy: ry + rh * 0.6  },
      alt:   { cx: rx + rw * 0.14, cy: ry + rh * 0.35 },
      wall:  { top: ry + rh*0.52, left: rx + rw*0.3, right: rx + rw*0.7, bottom: ry + rh - 8 },
    };
  } else {
    // Rectangle / square — full center
    zones = {
      main:  { cx: rx + rw * 0.5,  cy: ry + rh * 0.62 },
      table: { cx: rx + rw * 0.5,  cy: ry + rh * 0.42 },
      alt:   { cx: rx + rw * 0.82, cy: ry + rh * 0.2  },
      wall:  { top: ry + 8, left: rx + 8, right: rx + rw - 8, bottom: ry + rh - 8 },
    };
  }

  const { main, table, alt, wall } = zones;

  if (room === 'bedroom') {
    const bw = Math.min(rw * 0.48, 95), bh = Math.min(rh * 0.42, 75);
    // Bed centred on main zone, pushed toward top
    const bx = main.cx - bw/2, by = ry + (main.cy - ry) * 0.3;
    roundRect(ctx, bx, by, bw, bh, 6, c);
    ctx.fillStyle = c; ctx.globalAlpha = 0.55;
    ctx.fillRect(bx, by, bw, 9); // headboard
    ctx.globalAlpha = 0.38;
    roundRect(ctx, bx - 16, by + 4, 13, 13, 3, c); // side table L
    roundRect(ctx, bx + bw + 3, by + 4, 13, 13, 3, c); // side table R
    // Wardrobe along wall
    ctx.fillStyle = c; ctx.fillRect(wall.left, wall.bottom - 22, Math.min(rw*0.35, 60), 20);

  } else if (room === 'dining') {
    const tr = Math.min(rw, rh) * 0.16;
    ctx.beginPath(); ctx.arc(main.cx, main.cy, tr, 0, Math.PI*2);
    ctx.fillStyle = c; ctx.fill();
    for (let a = 0; a < 4; a++) {
      const ang = a * Math.PI/2, cr = tr * 1.75;
      roundRect(ctx, main.cx + Math.cos(ang)*cr - 9, main.cy + Math.sin(ang)*cr - 9, 18, 18, 4, c);
    }

  } else if (room === 'kitchen') {
    // L-shaped counter hugging two walls (top + left) — always safe
    ctx.fillStyle = c;
    ctx.fillRect(wall.left, wall.top, Math.min(rw * 0.7, wall.right - wall.left), 18); // top counter
    ctx.fillRect(wall.left, wall.top, 18, Math.min(rh * 0.5, wall.bottom - wall.top)); // left counter
    // Island in main zone
    roundRect(ctx, main.cx - 22, main.cy - 14, 44, 28, 4, c);

  } else if (room === 'office' || room === 'workoffice') {
    const dw = Math.min(rw * 0.52, 95), dh = 36;
    // Desk against top wall of main zone
    roundRect(ctx, main.cx - dw/2, ry + (main.cy - ry)*0.25, dw, dh, 4, c);
    // Chair in front
    ctx.beginPath(); ctx.arc(main.cx, ry + (main.cy - ry)*0.25 + dh + 20, 15, 0, Math.PI*2);
    ctx.fillStyle = c; ctx.fill();
    // Side cabinet
    roundRect(ctx, alt.cx - 12, alt.cy - 8, 24, 18, 3, c);

  } else {
    // Living room (default)
    const sw = Math.min(rw * 0.52, 98), sh = 26;
    // Sofa in main zone
    roundRect(ctx, main.cx - sw/2, main.cy, sw, sh, 5, c);
    ctx.fillStyle = c; ctx.globalAlpha = 0.55;
    ctx.fillRect(main.cx - sw/2, main.cy, sw, 8); // sofa back
    ctx.globalAlpha = 0.38;
    roundRect(ctx, main.cx - sw/2 - 11, main.cy, 11, sh, 5, c); // arm L
    roundRect(ctx, main.cx + sw/2,      main.cy, 11, sh, 5, c); // arm R
    // Coffee table
    roundRect(ctx, table.cx - 22, table.cy - 13, 44, 26, 4, c);
    // TV unit on opposite wall
    ctx.fillStyle = c; ctx.fillRect(wall.left + 6, wall.top + 2, Math.min(sw*0.8, 70), 12);
    // Plant in alt corner
    ctx.beginPath(); ctx.arc(alt.cx, alt.cy, 9, 0, Math.PI*2);
    ctx.fillStyle = c; ctx.fill();
    ctx.beginPath(); ctx.arc(alt.cx, alt.cy, 4, 0, Math.PI*2);
    ctx.fillStyle = '#16100a'; ctx.fill();
  }

  // Draw user-selected existing and wanted furniture
  const allSelected = [...(state.furniture.existing || []), ...(state.furniture.wanted || [])];
  if (allSelected.length) {
    const c2 = '#d4a050';
    ctx.globalAlpha = 0.35;
    // Place items in a row along the bottom-right area
    const positions = [
      { cx: wall.right - 20, cy: wall.bottom - 20 },
      { cx: wall.right - 50, cy: wall.bottom - 20 },
      { cx: wall.right - 80, cy: wall.bottom - 20 },
      { cx: wall.right - 20, cy: wall.bottom - 50 },
      { cx: wall.right - 50, cy: wall.bottom - 50 },
      { cx: wall.right - 80, cy: wall.bottom - 50 },
    ];
    allSelected.slice(0, positions.length).forEach((key, i) => {
      const { cx, cy } = positions[i];
      drawFurnitureItem(ctx, key, cx, cy, Math.min(rw, rh) / 200, c2);
    });
  }

  ctx.restore();
}

function drawFurnitureItem(ctx, key, cx, cy, scale, color) {
  const s = Math.max(scale * 40, 14);
  ctx.fillStyle = color;
  switch (key) {
    case 'sofa':
      roundRect(ctx, cx - s, cy - s*0.4, s*2, s*0.8, 4, color);
      ctx.fillRect(cx - s, cy - s*0.4, s*2, s*0.2); break;
    case 'bed':
      ctx.fillRect(cx - s*0.7, cy - s*0.9, s*1.4, s*1.6);
      ctx.globalAlpha *= 1.5; ctx.fillRect(cx - s*0.7, cy - s*0.9, s*1.4, s*0.3); ctx.globalAlpha /= 1.5; break;
    case 'wardrobe':
      ctx.fillRect(cx - s, cy - s*0.7, s*2, s*1.4);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, cy - s*0.7); ctx.lineTo(cx, cy + s*0.7); ctx.stroke(); break;
    case 'tv-unit':
      ctx.fillRect(cx - s, cy - s*0.25, s*2, s*0.5); break;
    case 'desk':
      ctx.fillRect(cx - s*0.7, cy - s*0.5, s*1.4, s); break;
    case 'bookshelf':
      ctx.fillRect(cx - s*0.6, cy - s*0.8, s*1.2, s*1.6);
      ctx.strokeStyle = color; ctx.lineWidth = 0.5;
      for (let r2 = 0; r2 < 3; r2++) { ctx.beginPath(); ctx.moveTo(cx - s*0.6, cy - s*0.8 + r2*(s*1.6/3)); ctx.lineTo(cx + s*0.6, cy - s*0.8 + r2*(s*1.6/3)); ctx.stroke(); } break;
    case 'dining-table':
      ctx.fillRect(cx - s*0.6, cy - s*0.4, s*1.2, s*0.8);
      [[cx - s*0.9, cy - s*0.3],[cx + s*0.7, cy - s*0.3],[cx - s*0.9, cy + s*0.1],[cx + s*0.7, cy + s*0.1]]
        .forEach(([x,y]) => ctx.fillRect(x, y, s*0.25, s*0.25)); break;
    case 'center-table':
      roundRect(ctx, cx - s*0.6, cy - s*0.35, s*1.2, s*0.7, 4, color); break;
    case 'accent-chair':
      ctx.beginPath(); ctx.arc(cx, cy, s*0.45, 0, Math.PI*2); ctx.fill(); break;
    case 'storage':
      ctx.setLineDash([3,3]); ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - s*0.6, cy - s*0.5, s*1.2, s); ctx.setLineDash([]); break;
    case 'side-table':
      roundRect(ctx, cx - s*0.3, cy - s*0.3, s*0.6, s*0.6, 3, color); break;
    case 'lounge-chair':
      roundRect(ctx, cx - s*0.45, cy - s*0.45, s*0.9, s*0.9, 5, color); break;
    case 'shoe-rack':
      ctx.fillRect(cx - s*0.7, cy - s*0.15, s*1.4, s*0.3); break;
    default:
      ctx.fillRect(cx - s*0.5, cy - s*0.5, s, s); break;
  }
}

function roundRect(ctx, x, y, w, h, r, color) {
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
}

function drawCompass(ctx, cx, cy, r) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#c9923a'; ctx.fillStyle = '#c9923a';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
  ['N','E','S','W'].forEach((d, i) => {
    const a = i * Math.PI/2 - Math.PI/2;
    ctx.font = '8px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(d, cx + Math.cos(a)*(r+7), cy + Math.sin(a)*(r+7));
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a)*(r-3), cy + Math.sin(a)*(r-3));
    ctx.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r); ctx.stroke();
  });
  ctx.restore();
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

function toggleFurniture(type, key, btn) {
  const arr = state.furniture[type];
  const idx = arr.indexOf(key);
  if (idx === -1) { arr.push(key); btn.classList.add('furn-active'); }
  else { arr.splice(idx, 1); btn.classList.remove('furn-active'); }
  // Cross-list logic: if selecting 'existing', hide matching chip in 'wanted'
  if (type === 'existing') {
    const wantedChip = document.querySelector(`#wantedFurnitureChips [data-furn="${key}"]`);
    if (wantedChip) {
      const isSelected = idx === -1; // just added
      wantedChip.classList.toggle('furn-hidden', isSelected);
    }
  }
  drawRoomLayout(); // update canvas to show furniture
  autosave();
}

function updateBudget(val) {
  const num = parseInt(val, 10);

  // Derive tier from rupee value
  let label, tier;
  if (num < 125000)       { label = 'Budget-Friendly'; tier = 0; }
  else if (num < 500000)  { label = 'Mid-Range';       tier = 1; }
  else if (num < 1000000) { label = 'Premium';         tier = 2; }
  else                    { label = 'Luxury';          tier = 3; }

  // Format as Indian notation  ₹X,XX,XXX
  const formatted = formatINR(num);

  state.budget = { label, value: formatted, tier, numValue: num };
  document.getElementById('budgetDisplay').textContent = formatted;
  document.getElementById('budgetTier').textContent = label;
  document.getElementById('budgetTier').style.background =
    tier === 3 ? 'rgba(251,191,36,.2)' :
    tier === 2 ? 'rgba(52,211,153,.15)' : 'rgba(139,92,246,.15)';
  autosave();
}

function formatINR(num) {
  if (num >= 1500000) return '₹15,00,000+';
  // Indian numbering: last 3 digits, then groups of 2
  const s = num.toString();
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest  = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + grouped + ',' + last3;
}

/* real file upload ─────────────────────────────────────────── */
function handleFileSelect(files) {
  [...files].forEach(file => {
    if (state.uploadedFiles.length >= 8) return;
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target.result;
        addUploadThumb({ type: 'image', src: dataUrl, name: file.name });
        showRoomImagePreview(dataUrl);
        // Analyse first uploaded photo only
        if (state.uploadedFiles.length === 1) analyzeRoomPhoto(dataUrl);
      };
      reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      addUploadThumb({ type: 'pdf', src: null, name: file.name });
    }
  });
  document.getElementById('fileInput').value = '';
}

async function analyzeRoomPhoto(dataUrl) {
  showAnalysisBanner('analyzing');
  try {
    const res = await fetch('/.netlify/functions/analyze-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: dataUrl }),
    });
    if (!res.ok) throw new Error('Analysis failed');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    applyRoomAnalysis(data);
    showAnalysisBanner('done', data);
  } catch (e) {
    console.warn('Room analysis failed:', e.message);
    showAnalysisBanner('error');
  }
}

function applyRoomAnalysis(data) {
  // Auto-fill room type
  if (data.roomType && !state.room) {
    state.room = data.roomType;
    const sel = document.getElementById('roomSelect');
    if (sel) sel.value = data.roomType;
  }
  // Auto-fill dimensions
  if (data.dims?.length) {
    state.dims.length = data.dims.length;
    state.dims.breadth = data.dims.breadth || data.dims.length;
    state.dims.height = data.dims.height || 10;
    const lenEl = document.getElementById('roomLength');
    const widEl = document.getElementById('roomWidth');
    if (lenEl) lenEl.value = state.dims.length;
    if (widEl) widEl.value = state.dims.breadth;
  }
  // Auto-fill existing furniture
  if (data.existingFurniture?.length) {
    state.furniture.existing = data.existingFurniture;
    // Tick matching chips in the UI
    data.existingFurniture.forEach(item => {
      document.querySelectorAll(`.furn-chip[data-item="${item}"]`).forEach(c => c.classList.add('selected'));
    });
    renderFurnitureChips();
  }
  // Suggest style if user hasn't picked one
  if (data.currentStyle && data.currentStyle !== 'none' && !state.style.length) {
    state.style = [data.currentStyle];
    document.querySelectorAll(`.style-card[data-style="${data.currentStyle}"]`).forEach(c => c.classList.add('selected'));
  }
  state.referencePhoto = dataUrl;
  autosave();
}

function showAnalysisBanner(status, data) {
  let banner = document.getElementById('analysisBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'analysisBanner';
    banner.style.cssText = 'margin-top:.8rem;padding:.75rem 1rem;border-radius:12px;font-size:.82rem;display:flex;align-items:center;gap:.6rem;';
    const preview = document.getElementById('p1ImagePreview');
    if (preview) preview.appendChild(banner);
  }
  if (status === 'analyzing') {
    banner.style.background = 'rgba(201,146,58,.12)';
    banner.style.color = '#7a4a10';
    banner.innerHTML = '<span style="animation:spin 1s linear infinite;display:inline-block">⏳</span> Analysing your room — detecting dimensions, furniture & style…';
  } else if (status === 'done' && data) {
    const dimStr = data.dims?.length ? `${data.dims.length}×${data.dims.breadth} ft` : '';
    const furStr = data.existingFurniture?.slice(0,3).join(', ') || '';
    banner.style.background = 'rgba(58,138,80,.1)';
    banner.style.color = '#1a5c30';
    banner.innerHTML = `✦ Room analysed${dimStr ? ' · ' + dimStr : ''}${furStr ? ' · Found: ' + furStr : ''} · Form auto-filled below`;
    const badge = document.getElementById('p1ImageBadge');
    if (badge) badge.textContent = `✦ ${dimStr || 'Room'} analysed`;
  } else {
    const badge = document.getElementById('p1ImageBadge');
    if (badge) badge.textContent = '✦ Photo uploaded';
    banner.style.background = 'rgba(180,60,60,.08)';
    banner.style.color = '#8b2020';
    banner.innerHTML = '⚠ Could not analyse photo — please fill in details manually';
  }
}

function showRoomImagePreview(src) {
  document.getElementById('p1UploadArea').classList.add('hidden');
  document.getElementById('p1CanvasWrap').classList.add('hidden');
  const preview = document.getElementById('p1ImagePreview');
  document.getElementById('p1PreviewImg').src = src;
  preview.classList.remove('hidden');
}

function clearRoomImage() {
  state.uploadedFiles = [];
  state.referencePhoto = null;
  document.getElementById('p1ImagePreview').classList.add('hidden');
  document.getElementById('p1UploadArea').classList.remove('hidden');
  updateUploadBadge();
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
    variations: [
      'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1567016432779-094069958ea5?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1600210491892-03d54079340e?auto=format&fit=crop&w=900&q=80',
    ],
    roomImages: {
      living:     'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80',
      bedroom:    'https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=800&q=80',
      kitchen:    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=800&q=80',
      dining:     'https://images.unsplash.com/photo-1567016432779-094069958ea5?auto=format&fit=crop&w=800&q=80',
      office:     'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&w=800&q=80',
      workoffice: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80',
      bathroom:   'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?auto=format&fit=crop&w=800&q=80',
      kids:       'https://images.unsplash.com/photo-1617104678098-de229db51175?auto=format&fit=crop&w=800&q=80',
      studio:     'https://images.unsplash.com/photo-1560185009-5bf9f2849488?auto=format&fit=crop&w=800&q=80',
    },
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
    variations: [
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1560448204-603b3fc33ddc?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=900&q=80',
    ],
    roomImages: {
      living:     'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
      bedroom:    'https://images.unsplash.com/photo-1560184897-ae5f0be82d25?auto=format&fit=crop&w=800&q=80',
      kitchen:    'https://images.unsplash.com/photo-1556909172-54557c7e4fb7?auto=format&fit=crop&w=800&q=80',
      dining:     'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=800&q=80',
      office:     'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80',
      workoffice: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80',
      bathroom:   'https://images.unsplash.com/photo-1620626011761-996317702574?auto=format&fit=crop&w=800&q=80',
      kids:       'https://images.unsplash.com/photo-1617104678098-de229db51175?auto=format&fit=crop&w=800&q=80',
      studio:     'https://images.unsplash.com/photo-1560185009-5bf9f2849488?auto=format&fit=crop&w=800&q=80',
    },
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
    variations: [
      'https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1615529328331-f8917597711f?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1618219908412-a29a1bb7b86e?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1600607687644-aac4c3eac7f4?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1600121848594-d8644e57abab?auto=format&fit=crop&w=900&q=80',
    ],
    roomImages: {
      living:     'https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=800&q=80',
      bedroom:    'https://images.unsplash.com/photo-1615529328331-f8917597711f?auto=format&fit=crop&w=800&q=80',
      kitchen:    'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=800&q=80',
      dining:     'https://images.unsplash.com/photo-1550226891-ef816aed4a98?auto=format&fit=crop&w=800&q=80',
      office:     'https://images.unsplash.com/photo-1600121848594-d8644e57abab?auto=format&fit=crop&w=800&q=80',
      workoffice: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80',
      bathroom:   'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?auto=format&fit=crop&w=800&q=80',
      kids:       'https://images.unsplash.com/photo-1617104678098-de229db51175?auto=format&fit=crop&w=800&q=80',
      studio:     'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
    },
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
    variations: [
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1585412727339-54e4bae3bbf9?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80',
    ],
    roomImages: {
      living:     'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80',
      bedroom:    'https://images.unsplash.com/photo-1586105251261-72a756497a11?auto=format&fit=crop&w=800&q=80',
      kitchen:    'https://images.unsplash.com/photo-1585412727339-54e4bae3bbf9?auto=format&fit=crop&w=800&q=80',
      dining:     'https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&w=800&q=80',
      office:     'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&w=800&q=80',
      workoffice: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80',
      bathroom:   'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?auto=format&fit=crop&w=800&q=80',
      kids:       'https://images.unsplash.com/photo-1617104678098-de229db51175?auto=format&fit=crop&w=800&q=80',
      studio:     'https://images.unsplash.com/photo-1560185009-5bf9f2849488?auto=format&fit=crop&w=800&q=80',
    },
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
    variations: [
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1600210491892-03d54079340e?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=900&q=80',
    ],
    roomImages: {
      living:     'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80',
      bedroom:    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80',
      kitchen:    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=800&q=80',
      dining:     'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=800&q=80',
      office:     'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&w=800&q=80',
      workoffice: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80',
      bathroom:   'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?auto=format&fit=crop&w=800&q=80',
      kids:       'https://images.unsplash.com/photo-1617104678098-de229db51175?auto=format&fit=crop&w=800&q=80',
      studio:     'https://images.unsplash.com/photo-1560185009-5bf9f2849488?auto=format&fit=crop&w=800&q=80',
    },
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
/* ═══════════════════════════════════════════════════════════════
   THEME CATALOGUE  (base data per style)
═══════════════════════════════════════════════════════════════ */
const THEME_CATALOGUE = {
  'japandi': {
    styleKey: 'japandi', baseName: 'Japandi',
    confidence: 91,
    variations: [
      { suffix: 'Warmth',   mood:['Calm','Grounded','Timeless'],   materials:['Bamboo','Linen','Matte Stone','Teak'],        costNum:240000, time:'3–4 weeks', badges:['badge-popular','badge-ai'], badgeText:['Most Popular','AI Pick'], desc:'Quiet luxury meets wabi-sabi. Low furniture, muted neutrals, and intentional breathing space.' },
      { suffix: 'Mono',     mood:['Clean','Pure','Minimal'],        materials:['White Oak','Cement','Paper Clay','Linen'],     costNum:210000, time:'2–3 weeks', badges:['badge-budget'],             badgeText:['Best Value'],              desc:'All-white palette with raw concrete and whitewash oak. Stripped back to what matters.' },
      { suffix: 'Forest',   mood:['Earthy','Fresh','Alive'],        materials:['Bamboo','Moss Green','Stone','Rattan'],        costNum:260000, time:'3–4 weeks', badges:[],                           badgeText:[],                          desc:'Forest-bathing indoors. Deep moss greens, stone textures, and an abundance of living plants.' },
      { suffix: 'Noir',     mood:['Moody','Dramatic','Refined'],    materials:['Dark Oak','Washi Paper','Slate','Charcoal'],   costNum:350000, time:'4–5 weeks', badges:[],                           badgeText:[],                          desc:'Dark japandi — charcoal and ebony oak against paper-white walls. Quiet but commanding.' },
      { suffix: 'Edit',     mood:['Simple','Airy','Essential'],     materials:['Pine','Cotton Voile','Clay Paint','Jute'],     costNum:160000, time:'2 weeks',   badges:['badge-budget'],             badgeText:['Most Affordable'],         desc:'Just the essentials. Budget-conscious japandi using pine and cotton for the same serene feel.' },
    ],
    img: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80',
  },
  'indian-modern': {
    styleKey: 'indian-modern', baseName: 'Indian Modern',
    confidence: 87,
    variations: [
      { suffix: 'Heritage', mood:['Warm','Rich','Soulful'],         materials:['Sheesham Teak','Handbeaten Brass','Jute','Block Cotton'], costNum:195000, time:'2–3 weeks', badges:['badge-vastu'],  badgeText:['Vastu Aligned'],  desc:'Heritage craft meets contemporary form. Teak joinery, handbeaten brass, and hand-blocked textiles.' },
      { suffix: 'Saffron',  mood:['Vibrant','Festive','Lively'],    materials:['Mango Wood','Copper','Silk Cushions','Dhurrie'],          costNum:220000, time:'3 weeks',   badges:[],               badgeText:[],                 desc:'A burst of saffron and turmeric woven through natural wood and copper accents.' },
      { suffix: 'Slate',    mood:['Modern','Grounded','Sharp'],     materials:['Dark Teak','Slate Stone','Indigo Linen','Iron'],          costNum:275000, time:'3–4 weeks', badges:[],               badgeText:[],                 desc:'Contemporary India in dark teak and slate. Clean lines with craft detail.' },
      { suffix: 'Terrace',  mood:['Breezy','Open','Artisanal'],     materials:['Cane','Lime Plaster','Terracotta','Khadi'],               costNum:170000, time:'2 weeks',   badges:['badge-budget'], badgeText:['Most Affordable'], desc:'A rooftop terrace brought inside — cane furniture, lime-washed walls, terracotta floor.' },
      { suffix: 'Opulent',  mood:['Regal','Layered','Luxurious'],   materials:['Rosewood','Zardozi Fabric','Onyx','Gilded Brass'],        costNum:480000, time:'5–6 weeks', badges:[],               badgeText:[],                 desc:'Royal opulence — rosewood, gilded brass, and hand-embroidered zardozi textiles.' },
    ],
    img: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80',
  },
  'contemporary': {
    styleKey: 'contemporary', baseName: 'Contemporary',
    confidence: 83,
    variations: [
      { suffix: 'Coastal',  mood:['Fresh','Airy','Expansive'],      materials:['Whitewash Oak','Rattan','Linen Weave','Sea Glass'], costNum:310000, time:'4–5 weeks', badges:['badge-ai'],     badgeText:['AI Pick'],        desc:'Soft blues, sandy textures, and open sightlines. Lets your room breathe and feel twice its size.' },
      { suffix: 'Urban',    mood:['Sharp','Dynamic','Confident'],   materials:['Polished Concrete','Steel','Leather','Glass'],      costNum:360000, time:'4–5 weeks', badges:[],               badgeText:[],                 desc:'City energy in dark concrete, steel accents, and bold leather upholstery.' },
      { suffix: 'Nordic',   mood:['Warm','Hygge','Balanced'],       materials:['Blonde Oak','Bouclé','Matte Brass','Wool'],         costNum:280000, time:'3–4 weeks', badges:[],               badgeText:[],                 desc:'Nordic warmth — blonde oak, bouclé textures, and soft pendants for a hygge-filled home.' },
      { suffix: 'Gallery',  mood:['Curated','Bold','Expressive'],   materials:['White Plaster','Oak','Abstract Art','Terrazzo'],    costNum:340000, time:'4 weeks',   badges:[],               badgeText:[],                 desc:'A gallery-style space where bold art and clean architecture share the spotlight.' },
      { suffix: 'Breeze',   mood:['Bright','Open','Relaxed'],       materials:['White Oak','Sheer Linen','Cane','Marble'],          costNum:250000, time:'3 weeks',   badges:['badge-budget'], badgeText:['Best Value'],      desc:'Light-flooded and breezy. Sheer curtains, cane details, and white marble — effortlessly open.' },
    ],
    img: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
  },
  'luxury-modern': {
    styleKey: 'luxury-modern', baseName: 'Luxury Modern',
    confidence: 88,
    variations: [
      { suffix: 'Marble',   mood:['Bold','Opulent','Dramatic'],     materials:['Calacatta Marble','Brushed Gold','Bouclé Velvet','Smoked Glass'], costNum:580000, time:'5–6 weeks', badges:['badge-ai'],    badgeText:['AI Pick'],        desc:'High-contrast drama — calacatta marble, velvet, and brushed gold commanding every surface.' },
      { suffix: 'Obsidian', mood:['Dark','Cinematic','Powerful'],   materials:['Black Granite','Onyx','Chrome','Dark Velvet'],                    costNum:680000, time:'6 weeks',   badges:[],              badgeText:[],                 desc:'Obsidian and chrome — a cinematic space built for pure dramatic impact.' },
      { suffix: 'Ivory',    mood:['Serene','Premium','Airy'],       materials:['Ivory Plaster','Alabaster','Cream Bouclé','Travertine'],          costNum:520000, time:'5 weeks',   badges:[],              badgeText:[],                 desc:'All-ivory luxury — travertine, cream bouclé, and alabaster in a space of quiet grandeur.' },
      { suffix: 'Emerald',  mood:['Rich','Jewel-toned','Lush'],     materials:['Emerald Velvet','Dark Walnut','Brass','Terrazzo'],                costNum:620000, time:'5–6 weeks', badges:[],              badgeText:[],                 desc:'Deep emerald velvet against dark walnut and brushed brass — lush jewel-tone luxury.' },
      { suffix: 'Suite',    mood:['Refined','Hotel-grade','Clean'], materials:['Linen','Walnut','Cashmere','Matte Stone'],                        costNum:450000, time:'4–5 weeks', badges:['badge-budget'], badgeText:['Best Value'],     desc:'Five-star hotel suite energy — linen, walnut, and cashmere in a restrained luxury edit.' },
    ],
    img: 'https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=800&q=80',
  },
  'earthy-organic': {
    styleKey: 'earthy-organic', baseName: 'Earthy Organic',
    confidence: 85,
    variations: [
      { suffix: 'Clay',     mood:['Natural','Tactile','Serene'],    materials:['Rattan','Terracotta','Moss Linen','Raw Mango Wood'],   costNum:160000, time:'2 weeks',   badges:['badge-budget'], badgeText:['Most Affordable'], desc:'Clay, cane, and moss-green linen — a room that feels like it grew there. Sustainable and liveable.' },
      { suffix: 'Grove',    mood:['Lush','Alive','Breathing'],      materials:['Live-edge Wood','Moss','Jute','River Stone'],          costNum:195000, time:'2–3 weeks', badges:[],               badgeText:[],                  desc:'A grove indoors — live-edge wood, river stones, hanging plants, and raw jute everywhere.' },
      { suffix: 'Sahara',   mood:['Warm','Sandy','Desert-inspired'],materials:['Adobe Clay','Camel Linen','Driftwood','Sand Stone'],   costNum:180000, time:'2–3 weeks', badges:[],               badgeText:[],                  desc:'Desert warmth — adobe clay walls, camel linen, and driftwood in sandy, sun-baked tones.' },
      { suffix: 'Prairie',  mood:['Rustic','Cozy','Handcrafted'],   materials:['Reclaimed Wood','Cotton Knit','Wheat Grass','Wool'],   costNum:170000, time:'2 weeks',   badges:[],               badgeText:[],                  desc:'Handcrafted and cozy — reclaimed wood, woven cotton, and wheat-tone textiles for a rustic feel.' },
      { suffix: 'Biophilic',mood:['Green','Healing','Alive'],       materials:['Bamboo','Monstera Leaves','Cork','Hemp'],             costNum:220000, time:'3 weeks',   badges:['badge-ai'],     badgeText:['AI Pick'],         desc:'Maximum biophilia — bamboo, cork floors, and walls of living plants for a healing sanctuary.' },
    ],
    img: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80',
  },
};

/* ═══════════════════════════════════════════════════════════════
   AI RECOMMENDATION ENGINE
═══════════════════════════════════════════════════════════════ */
let DESIGNS = []; // populated dynamically by buildDesignsForTopTheme()

function pickTopThemeKey() {
  const tier = state.budget.tier;
  const styles = state.style;
  const constraints = state.constraints;
  const room = state.room;
  const adjacent = {
    'japandi':       ['modern-minimal','scandinavian','warm-minimal'],
    'indian-modern': ['warm-minimal','bohemian','contemporary'],
    'contemporary':  ['modern-minimal','luxury-modern','industrial'],
    'luxury-modern': ['contemporary','industrial'],
    'earthy-organic':['warm-minimal','bohemian','scandinavian'],
  };
  const scores = Object.values(THEME_CATALOGUE).map(t => {
    let score = t.confidence;
    if (styles.includes(t.styleKey)) score += 18;
    else if (adjacent[t.styleKey]?.some(s => styles.includes(s))) score += 6;
    const avgCost = t.variations.reduce((s,v)=>s+v.costNum,0)/t.variations.length;
    const dTier = avgCost<200000?0:avgCost<400000?1:avgCost<700000?2:3;
    if (dTier===tier) score+=10; else if(Math.abs(dTier-tier)===1) score+=4; else score-=10;
    if (constraints.has('vastu') && t.styleKey==='indian-modern') score+=8;
    if (constraints.has('rental') && ['japandi','earthy-organic'].includes(t.styleKey)) score+=5;
    if (constraints.has('kids') && ['earthy-organic','japandi'].includes(t.styleKey)) score+=4;
    if (constraints.has('pet') && ['earthy-organic','japandi'].includes(t.styleKey)) score+=4;
    if (room==='bedroom' && ['japandi','earthy-organic'].includes(t.styleKey)) score+=4;
    if (room==='office' && ['contemporary','luxury-modern'].includes(t.styleKey)) score+=4;
    if (room==='living' && ['indian-modern','contemporary','luxury-modern'].includes(t.styleKey)) score+=3;
    if (room==='dining' && ['indian-modern','contemporary'].includes(t.styleKey)) score+=3;
    return { styleKey: t.styleKey, score: Math.min(99, Math.max(55, Math.round(score))) };
  });
  scores.sort((a,b)=>b.score-a.score);
  return { styleKey: scores[0].styleKey, aiScore: scores[0].score };
}

function buildDesignsForTopTheme() {
  const { styleKey, aiScore } = pickTopThemeKey();
  const theme = THEME_CATALOGUE[styleKey];
  DESIGNS = theme.variations.map((v, i) => ({
    id: i + 1,
    styleKey,
    variationIndex: i,
    name: `${theme.baseName} · ${v.suffix}`,
    desc: v.desc,
    mood: v.mood,
    materials: v.materials,
    img: theme.img,
    cost: formatINR(v.costNum), costNum: v.costNum,
    time: v.time,
    confidence: theme.confidence,
    badges: v.badges, badgeText: v.badgeText,
    insight: v.desc,
    aiScore: i === 0 ? aiScore : Math.max(aiScore - 5 - i * 3, 60),
  }));
  return { styleKey, aiScore, themeName: theme.baseName };
}

function getAIRecommendedDesigns() {
  if (!DESIGNS.length) buildDesignsForTopTheme();
  return [...DESIGNS].sort((a,b) => b.aiScore - a.aiScore);
}

function buildAIBanner() {
  const { styleKey, aiScore, themeName } = buildDesignsForTopTheme();
  const theme = THEME_CATALOGUE[styleKey];
  const parts = [];
  if (state.room) parts.push(state.room.charAt(0).toUpperCase() + state.room.slice(1) + ' Room');
  parts.push(state.budget.label + ' budget');

  const topImg = theme?.img || '';
  const topThumb = topImg ? `<img src="${topImg}" class="ai-banner-thumb" alt="${themeName}" />` : `<span class="ai-reco-icon">✦</span>`;

  return `<div class="ai-reco-banner2">
    ${topThumb}
    <div class="ai-banner-body">
      <div class="ai-banner-title">✦ AI picked <em>${themeName}</em> for your space</div>
      <div class="ai-banner-sub">Showing 5 variations · ${parts.join(' · ')} — <strong>${aiScore}% match</strong></div>
    </div>
    <div class="ai-banner-score">${aiScore}<span>%</span></div>
  </div>`;
}

function goPhase2() {
  DESIGNS = []; // reset so buildDesignsForTopTheme() re-runs with current state
  showPhase(2);
  renderDesignCards();
  startAIRenders();
}

/* ═══════════════════════════════════════════════════════════════
   AI RENDER ENGINE  (Replicate via Netlify Functions)
═══════════════════════════════════════════════════════════════ */

// Resize image to max 512px before sending to API — faster render, smaller payload
function resizeImageForAI(dataUrl, maxSize = 512) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
}

async function startPrediction(styleKey, roomType, variationIndex, customPrompt) {
  // Resize uploaded photo for ControlNet (frame-preserved) if available
  let imageBase64 = null;
  if (state.referencePhoto) {
    imageBase64 = await resizeImageForAI(state.referencePhoto, 768);
  }

  const res = await fetch('/.netlify/functions/render-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      styleKey, roomType, variationIndex: variationIndex ?? 0, customPrompt,
      imageBase64,
      dims: state.dims,
      furniture: { existing: state.furniture.existing, wanted: state.furniture.wanted },
      constraints: [...state.constraints],
      city: state.city,
    }),
  });
  if (!res.ok) throw new Error(`render-start failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data; // { id, status, output? }
}

async function pollPrediction(id, onUpdate, maxWait = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch(`/.netlify/functions/render-poll?id=${id}`);
    const data = await res.json();
    const output = data.output || null;
    onUpdate({ status: data.status, output });
    if (data.status === 'succeeded') return output;
    if (data.status === 'failed') throw new Error(data.error || 'Render failed');
  }
  throw new Error('Render timed out');
}

// State for renders
const aiRenders = {}; // { designId: { status, url } }

/* Render a single design by ID; used both for auto top-pick and on-demand clicks */
async function renderOneDesign(designId) {
  const d = DESIGNS.find(x => x.id === designId);
  if (!d) return;
  const roomType = state.room || 'living';

  aiRenders[d.id] = { status: 'loading', url: null };
  updateCardRenderState(d.id, 'loading', null);

  const activeId = parseInt(document.getElementById('p2ConfirmBtn')?.dataset.pendingId);
  if (activeId === d.id || !activeId) p2ShowRenderLoading(d);

  try {
    const result = await startPrediction(d.styleKey, roomType, d.variationIndex ?? 0);

    // FLUX-schnell with 'Prefer: wait' may return result immediately
    if (result.status === 'succeeded' && result.output) {
      aiRenders[d.id] = { status: 'done', url: result.output };
      updateCardRenderState(d.id, 'done', result.output);
      const nowActive = parseInt(document.getElementById('p2ConfirmBtn')?.dataset.pendingId);
      if (nowActive === d.id || !nowActive) p2UpdatePreviewImage(result.output, d);
      return;
    }

    // Otherwise poll until done
    const url = await pollPrediction(result.id, (data) => {
      if (data.status === 'processing') updateCardRenderState(d.id, 'processing', null);
    });
    aiRenders[d.id] = { status: 'done', url };
    updateCardRenderState(d.id, 'done', url);
    const nowActive = parseInt(document.getElementById('p2ConfirmBtn')?.dataset.pendingId);
    if (nowActive === d.id || !nowActive) p2UpdatePreviewImage(url, d);
  } catch (err) {
    console.warn(`Render failed for ${d.name}:`, err.message);
    aiRenders[d.id] = { status: 'error', url: null };
    updateCardRenderState(d.id, 'error', null);
  }
}

async function startAIRenders() {
  const rankedDesigns = getAIRecommendedDesigns();

  // Show "Generate AI" buttons on cards 2-5 so user can trigger on demand
  rankedDesigns.forEach((d, i) => {
    if (i > 0) updateCardRenderState(d.id, 'idle', null);
  });

  // Only auto-render the top pick — fastest perceived experience
  renderOneDesign(rankedDesigns[0].id);
}

function updateCardRenderState(designId, status, url) {
  const card = document.querySelector(`.design-card-compact[data-design-id="${designId}"]`);
  if (!card) return;
  const thumb  = card.querySelector('.dcc-thumb');
  const wrap   = card.querySelector('.dcc-thumb-wrap');
  // Remove any existing badge before placing new one
  card.querySelector('.dcc-render-badge')?.remove();

  if (status === 'loading' || status === 'processing') {
    if (thumb) thumb.style.opacity = '.4';
    const b = document.createElement('div');
    b.className = 'dcc-render-badge';
    b.innerHTML = '<span class="render-spinner"></span> Rendering…';
    wrap?.appendChild(b);

  } else if (status === 'idle') {
    // Show on-demand "Generate AI" button for cards 2-5
    if (thumb) thumb.style.opacity = '1';
    const b = document.createElement('button');
    b.className = 'dcc-render-badge dcc-render-idle';
    b.title = 'Generate AI render for this style';
    b.innerHTML = '✦ AI Render';
    b.onclick = async (e) => {
      e.stopPropagation();
      b.remove();
      renderOneDesign(designId);
    };
    wrap?.appendChild(b);

  } else if (status === 'done' && url) {
    if (thumb) {
      thumb.src = url;
      thumb.style.opacity = '1';
      thumb.style.transition = 'opacity .5s ease';
    }
    const b = document.createElement('div');
    b.className = 'dcc-render-badge';
    b.innerHTML = '✦ AI render';
    b.style.background = 'rgba(58,138,80,.85)';
    wrap?.appendChild(b);

  } else if (status === 'error') {
    if (thumb) thumb.style.opacity = '1';
    const b = document.createElement('button');
    b.className = 'dcc-render-badge dcc-render-idle';
    b.innerHTML = '↺ Retry';
    b.onclick = async (e) => {
      e.stopPropagation();
      b.remove();
      renderOneDesign(designId);
    };
    wrap?.appendChild(b);
  }
}

function p2ShowRenderLoading(design) {
  // If user uploaded their room, show it immediately as the base image
  if (state.referencePhoto) {
    const imgA = document.getElementById('p2ImgA');
    const imgB = document.getElementById('p2ImgB');
    const active = _p2ActiveImgSlot === 'a' ? imgA : imgB;
    if (active && !active.src) {
      active.src = state.referencePhoto;
    }
    // Add a semi-transparent overlay showing it's being restyled
    let overlay = document.getElementById('p2RenderOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'p2RenderOverlay';
      overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6rem;border-radius:inherit;z-index:2;';
      overlay.innerHTML = `
        <span class="render-spinner" style="width:2rem;height:2rem;border-width:3px"></span>
        <span style="color:#fff;font-size:.85rem;font-weight:600;text-align:center;padding:0 1rem">
          Restyling your room in<br><em>${design.name}</em>
        </span>
        <span style="color:rgba(255,255,255,.6);font-size:.72rem">Preserving your layout & dimensions</span>`;
      const wrap = imgA?.parentNode;
      if (wrap) wrap.style.position = 'relative', wrap.appendChild(overlay);
    }
  }

  const name = document.getElementById('p2OvName');
  if (name && design) {
    const existing = document.getElementById('p2RenderStatus');
    if (!existing) {
      const el = document.createElement('div');
      el.id = 'p2RenderStatus';
      el.className = 'p2-render-status';
      el.innerHTML = state.referencePhoto
        ? `<span class="render-spinner"></span> Restyling <em>your room</em> in ${design.name}…`
        : `<span class="render-spinner"></span> Generating <em>${design.name}</em> design…`;
      name.parentNode.insertBefore(el, name);
    }
  }
}

function p2UpdatePreviewImage(url, design) {
  // Remove render status and overlay
  document.getElementById('p2RenderStatus')?.remove();
  document.getElementById('p2RenderOverlay')?.remove();
  // Add "Your room" badge
  const topTag = document.getElementById('p2TopTag');
  if (topTag) topTag.innerHTML = `<span class="d-badge badge-ai" style="background:rgba(58,138,80,.9)">✦ Your actual room</span>`;
  // Crossfade to the AI render
  const imgA = document.getElementById('p2ImgA');
  const imgB = document.getElementById('p2ImgB');
  if (!imgA || !imgB) return;
  const next = _p2ActiveImgSlot === 'a' ? imgB : imgA;
  const curr = _p2ActiveImgSlot === 'a' ? imgA : imgB;
  next.src = url;
  next.onload = () => {
    next.classList.add('active');
    curr.classList.remove('active');
    _p2ActiveImgSlot = _p2ActiveImgSlot === 'a' ? 'b' : 'a';
  };
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

  // Set initial live preview to top pick (or previously selected)
  const initDesign = state.selectedDesign
    ? rankedDesigns.find(d => d.id === state.selectedDesign.id) || rankedDesigns[0]
    : rankedDesigns[0];
  p2SetPreview(initDesign, true);

  rankedDesigns.forEach((d, i) => {
    const card = document.createElement('div');
    const isTopPick = i === 0;
    const isFav = state.favDesigns.has(d.id);
    const isCompared = state.compareDesigns.has(d.id);
    const isSelected = state.selectedDesign?.id === d.id || (i === 0 && !state.selectedDesign);
    const theme = STYLE_THEMES[d.styleKey] || STYLE_THEMES['japandi'];
    const imgSrc = theme.roomImages?.[state.room] || d.img || theme.img || '';

    // Palette
    const palette = theme.palette || ['#d4c5b0','#8b7d6b','#5a4e3f','#2d2820'];
    const swatches = palette.slice(0,4).map(c =>
      `<span class="dcc-swatch" style="background:${c}" title="${c}"></span>`).join('');

    card.className = `design-card-compact${isSelected ? ' dcc-active' : ''}${isFav ? ' favourited' : ''}${isTopPick ? ' ai-top-pick' : ''}`;
    card.dataset.designId = d.id;
    card.style.animationDelay = `${i * 0.06}s`;

    // Hover → live preview
    card.addEventListener('mouseenter', () => p2SetPreview(d, false));

    card.innerHTML = `
      <div class="dcc-thumb-wrap">
        <img class="dcc-thumb" src="${imgSrc}" alt="${d.name}" loading="lazy"
          onerror="this.style.display='none'" />
        <div class="dcc-match-badge">✦ ${d.aiScore}%</div>
      </div>
      <div class="dcc-body">
        <div class="dcc-top">
          <div class="dcc-name">${d.name}</div>
          <div class="dcc-actions">
            <button class="fav-btn${isFav ? ' active' : ''}" onclick="event.stopPropagation();toggleFav(${d.id})" title="Save">♡</button>
          </div>
        </div>
        <div class="dcc-swatches">${swatches}</div>
        <div class="dcc-meta">${d.cost} &nbsp;·&nbsp; ${d.time}</div>
        ${isTopPick ? '<div class="dcc-ai-tag">✦ AI Top Pick</div>' : ''}
      </div>`;

    // Click → select + lock preview
    card.addEventListener('click', () => {
      selectDesign(d.id);
      p2SetPreview(d, true);
    });

    grid.appendChild(card);
  });
  updateCompareBtn();
}

/* ── Live preview updater ─────────────────────────────────────── */
let _p2ActiveImgSlot = 'a'; // crossfade between two img elements

function p2SetPreview(d, lock = false) {
  if (!d) return;
  const theme = STYLE_THEMES[d.styleKey] || STYLE_THEMES['japandi'];
  const imgSrc = theme.roomImages?.[state.room] || d.img || theme.img || '';
  const palette = theme.palette || [];

  // Crossfade image
  const imgA = document.getElementById('p2ImgA');
  const imgB = document.getElementById('p2ImgB');
  if (imgA && imgB) {
    const next = _p2ActiveImgSlot === 'a' ? imgB : imgA;
    const curr = _p2ActiveImgSlot === 'a' ? imgA : imgB;
    next.src = imgSrc;
    next.onload = () => {
      next.classList.add('active');
      curr.classList.remove('active');
      _p2ActiveImgSlot = _p2ActiveImgSlot === 'a' ? 'b' : 'a';
    };
    // If already cached (onload won't fire again)
    if (next.complete && next.naturalWidth) {
      next.classList.add('active');
      curr.classList.remove('active');
      _p2ActiveImgSlot = _p2ActiveImgSlot === 'a' ? 'b' : 'a';
    }
  }

  // Overlay text
  const name = document.getElementById('p2OvName');
  const mood = document.getElementById('p2OvMood');
  const match = document.getElementById('p2OvMatch');
  const topTag = document.getElementById('p2TopTag');
  if (name)  name.textContent = d.name;
  if (mood)  mood.innerHTML = (d.mood||[]).map(m=>`<span class="p2-mood-pill">${m}</span>`).join('');
  if (match) match.innerHTML = `<span class="p2-match-ring">${d.aiScore}%</span> AI match for your space`;
  if (topTag) topTag.innerHTML = d.badges.includes('badge-ai') || lock
    ? `<span class="d-badge badge-ai">✦ ${lock ? 'Selected' : 'AI Top Pick'}</span>` : '';

  // Palette strip
  const ps = document.getElementById('p2PaletteStrip');
  if (ps) ps.innerHTML = `
    <span class="p2-strip-label">Palette</span>
    <div class="p2-swatches">${palette.slice(0,5).map(c=>`<span class="p2-swatch" style="background:${c}" title="${c}"></span>`).join('')}</div>
    <span class="p2-strip-label" style="margin-left:.75rem">Materials</span>
    <div class="p2-mats">${(d.materials||[]).map(m=>`<span class="p2-mat">${m}</span>`).join('')}</div>`;

  // Description
  const desc = document.getElementById('p2Desc');
  if (desc) desc.textContent = d.desc || '';

  // Update confirm button
  const btn = document.getElementById('p2ConfirmBtn');
  if (btn) {
    btn.textContent = lock ? '✓ Design Locked In →' : `Select "${d.name}" →`;
    btn.dataset.pendingId = d.id;
    btn.classList.toggle('locked', lock);
  }

  // Highlight active card
  document.querySelectorAll('.design-card-compact').forEach(c => {
    c.classList.toggle('dcc-active', parseInt(c.dataset.designId) === d.id);
  });

  // Variations strip (Change 3)
  const varStrip = document.getElementById('p2VariationsStrip');
  const varThumbs = document.getElementById('p2VarThumbs');
  if (varStrip && varThumbs && theme?.variations) {
    varStrip.classList.remove('hidden');
    varThumbs.innerHTML = theme.variations.map((url, i) =>
      `<img class="p2-var-thumb${i===0?' active':''}" src="${url}" onclick="p2SwapVariation('${url}', this)" loading="lazy" />`
    ).join('');
  }
}

function p2SwapVariation(url, el) {
  document.querySelectorAll('.p2-var-thumb').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const imgA = document.getElementById('p2ImgA');
  const imgB = document.getElementById('p2ImgB');
  const next = _p2ActiveImgSlot === 'a' ? imgB : imgA;
  const curr = _p2ActiveImgSlot === 'a' ? imgA : imgB;
  next.src = url;
  next.onload = () => { next.classList.add('active'); curr.classList.remove('active'); _p2ActiveImgSlot = _p2ActiveImgSlot === 'a' ? 'b' : 'a'; };
  if (next.complete && next.naturalWidth) { next.classList.add('active'); curr.classList.remove('active'); _p2ActiveImgSlot = _p2ActiveImgSlot === 'a' ? 'b' : 'a'; }
}

function confirmDesignAndNext() {
  const btn = document.getElementById('p2ConfirmBtn');
  const id = parseInt(btn?.dataset.pendingId);
  // selectDesign re-renders cards but we navigate away immediately after
  if (id) state.selectedDesign = DESIGNS.find(d => d.id === id) || state.selectedDesign;
  if (!state.selectedDesign) state.selectedDesign = DESIGNS[0];
  goPhase3();
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
  renderBOQ();
  updateCommitCard();
}

// ── Wall colour name lookup ────────────────────────────────────
const WALL_COLOR_NAMES = {
  '#FFFFFF':'Pure White','#F5F0E8':'Ivory Dust','#F2EDE3':'Warm Cream','#EDE8DE':'Magnolia',
  '#E8E0D0':'Linen','#DDD5C5':'Greige','#D0C8B8':'Parchment','#C4BCA8':'Sand Stone',
  '#E8C9A0':'Honey Wheat','#D4A574':'Terracotta Mist','#C4885C':'Burnt Sienna','#B87044':'Rustic Bronze',
  '#E8D5B0':'Sahara Sand','#D4C090':'Golden Wheat','#C8A870':'Desert Gold','#A87850':'Adobe',
  '#C8D8C0':'Sage Mist','#A8C4A0':'Eucalyptus','#88A880':'Fern Green','#6A8C68':'Olive Grove',
  '#B8D0D8':'Morning Sky','#90B8C8':'Coastal Blue','#6898B8':'Denim','#487898':'Aegean',
  '#2D4A3E':'Forest Night','#1E3A4A':'Midnight Blue','#3A2A4A':'Aubergine','#2D2820':'Charcoal',
  '#1A1A1A':'Jet Black','#8B2020':'Crimson','#7A5C38':'Mocha','#4A6058':'Dark Teal',
};

function renderDecisionPreview() {
  const d = state.selectedDesign;
  if (!d) return;
  const theme = STYLE_THEMES[d.styleKey] || STYLE_THEMES['japandi'];
  const imgSrc = theme.roomImages?.[state.room] || d.img || theme.img || '';

  const img = document.getElementById('p3RoomImg');
  if (img) { img.src = imgSrc; img.alt = d.name; }

  updateP3WallOverlay();
  updateP3LightingOverlay();
  updateP3DesignBoard();
  renderBOQ();
}

/* Wall colour: gradient that paints upper walls strongly, fades over furniture */
function updateP3WallOverlay() {
  const overlay = document.getElementById('p3WallOverlay');
  const frame   = document.getElementById('p3ImgFrame');
  if (!overlay) return;
  const c = state.wallColor || '#F5F0E8';

  // Parse hex to get rgba
  const hex = c.replace('#','');
  const r = parseInt(hex.substr(0,2),16);
  const g = parseInt(hex.substr(2,2),16);
  const b = parseInt(hex.substr(4,2),16);

  // Strong gradient: top 40% of image = wall area → heavily tinted
  overlay.style.background = `linear-gradient(to bottom,
    rgba(${r},${g},${b},0.72) 0%,
    rgba(${r},${g},${b},0.45) 30%,
    rgba(${r},${g},${b},0.08) 55%,
    transparent 70%)`;

  // Also paint the frame border the wall colour so user clearly sees the choice
  if (frame) frame.style.borderColor = c;
}

/* Lighting: CSS filter on the photo */
function updateP3LightingOverlay() {
  const img = document.getElementById('p3RoomImg');
  const lo  = document.getElementById('p3LightingOverlay');
  if (!img) return;
  const mood = state.lighting || 'warm';
  const filters = {
    warm:     'brightness(1.06) saturate(1.15) sepia(0.12)',
    neutral:  'brightness(1.02) saturate(1.0)',
    cool:     'brightness(1.08) saturate(0.88) hue-rotate(195deg)',
    dramatic: 'brightness(0.72) contrast(1.25) saturate(1.3)',
    rgb:      'brightness(1.0) saturate(1.6) hue-rotate(30deg)',
  };
  img.style.filter = filters[mood] || filters.warm;
  // Tint overlay for lighting mood
  if (lo) {
    const tints = {
      warm:     'rgba(255,200,100,0.08)',
      neutral:  'transparent',
      cool:     'rgba(100,160,220,0.08)',
      dramatic: 'rgba(0,0,0,0.18)',
      rgb:      'rgba(180,100,255,0.06)',
    };
    lo.style.background = tints[mood] || 'transparent';
  }
}

/* Design Board — visual summary strip below the photo */
function updateP3DesignBoard() {
  const c = state.wallColor || '#F5F0E8';
  const wallName = WALL_COLOR_NAMES[c.toUpperCase()] || WALL_COLOR_NAMES[c.toLowerCase()] || WALL_COLOR_NAMES[c] || 'Custom';
  const finish   = (state.wallFinish || 'matte').replace(/-/g,' ');

  const floorVal = state.floor ? state.floor.replace(/-/g,' ') : 'Teak Hardwood';

  const sofaStyle    = state.sofa?.style    || 'Modular';
  const sofaMaterial = state.sofa?.material || 'Fabric';
  const sofaColor    = state.sofa?.color    || '#C8C0B0';

  const lightVal = {
    warm:'Warm White 3000K', neutral:'Neutral 4000K', cool:'Cool 6500K',
    dramatic:'Dramatic Accent', rgb:'RGB Colour',
  }[state.lighting || 'warm'] || 'Warm White';
  const lightType = (state.lightingType || 'recessed').replace(/-/g,' ');

  const curtainStyle = state.curtain?.style || '';
  const curtainColor = state.curtain?.color || '#F5F0E8';
  const curtainLabel = curtainStyle ? curtainStyle.replace(/-/g,' ') : 'Not selected';

  const ceilingLabel = (state.ceiling || 'plain').replace(/-/g,' ');

  const _set = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
  const _bg  = (id, col) => { const el=document.getElementById(id); if(el) el.style.background=col; };

  _bg('pdbWallSwatch', c);
  _set('pdbWallVal',   `${wallName} · ${finish}`);
  _set('pdbFloorVal',  floorVal);
  _bg('pdbSofaSwatch', sofaColor);
  _set('pdbSofaVal',   `${sofaStyle} · ${sofaMaterial}`);
  _set('pdbLightVal',  `${lightVal} · ${lightType}`);
  _bg('pdbCurtainSwatch', curtainColor);
  _set('pdbCurtainVal', curtainLabel);
  _set('pdbCeilingVal', ceilingLabel);

  // Update commit card title with wall name
  const d = state.selectedDesign || DESIGNS[0];
  const titleEl = document.getElementById('commitTitle');
  if (titleEl && d) titleEl.textContent = `${d.name} · ${wallName} walls`;
}

/* AI re-render: use selected design photo + customisations as Replicate prompt */
async function triggerP3Rerender() {
  const btn   = document.getElementById('p3RerenderBtn');
  const label = document.getElementById('p3RerenderLabel');
  const img   = document.getElementById('p3RoomImg');
  if (!img?.src) return;

  btn.disabled = true;
  label.textContent = '⏳ Rendering…';

  const d    = state.selectedDesign || DESIGNS[0];
  const room = state.room || 'living';
  const wallName   = WALL_COLOR_NAMES[state.wallColor?.toUpperCase()] || 'warm white';
  const floorLabel = (state.floor || 'teak hardwood').replace(/-/g,' ');
  const sofaLabel  = `${state.sofa?.style || 'modular'} ${state.sofa?.material || 'fabric'} sofa`;
  const lightLabel = (state.lighting || 'warm') + ' lighting';

  try {
    const customPrompt = `A beautiful ${room.replace(/-/g,' ')} interior in ${d.name} style, ${wallName} painted walls, ${floorLabel} flooring, ${sofaLabel}, ${lightLabel}, professional interior photography`;

    const result = await startPrediction(d.styleKey, room, 0, customPrompt);

    const applyUrl = (url) => {
      const newImg = document.getElementById('p3RoomImg');
      if (newImg) {
        newImg.style.opacity = '0';
        newImg.src = url;
        newImg.onload = () => { newImg.style.transition = 'opacity .4s'; newImg.style.opacity = '1'; };
      }
      label.textContent = '✦ AI Preview';
      btn.disabled = false;
    };

    if (result.status === 'succeeded' && result.output) {
      applyUrl(result.output);
    } else {
      const url = await pollPrediction(result.id, () => {});
      applyUrl(url);
    }
  } catch(e) {
    label.textContent = '✦ AI Preview';
    btn.disabled = false;
    console.warn('Re-render failed:', e);
  }
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

/* ═══════════════════════════════════════════════════════════════
   BOQ ENGINE — city-specific pricing
═══════════════════════════════════════════════════════════════ */
const CITY_MULT = {
  // Metros
  'mumbai':1.45,'bombay':1.45,'navi mumbai':1.28,'thane':1.22,'kalyan':1.15,
  'delhi':1.30,'new delhi':1.30,'noida':1.22,'gurugram':1.25,'gurgaon':1.25,'faridabad':1.12,'ghaziabad':1.12,
  'bengaluru':1.0,'bangalore':1.0,'bengalore':1.0,
  'hyderabad':1.05,'secunderabad':1.02,
  'chennai':1.05,'madras':1.05,
  'kolkata':0.98,'calcutta':0.98,
  // Tier 1
  'pune':1.10,'pimpri':1.05,
  'ahmedabad':0.92,'surat':0.88,'vadodara':0.85,'baroda':0.85,
  'kochi':0.95,'cochin':0.95,'thiruvananthapuram':0.88,'trivandrum':0.88,
  'chandigarh':0.92,'mohali':0.90,'panchkula':0.90,
  // Tier 2
  'jaipur':0.82,'jodhpur':0.78,'udaipur':0.80,'ajmer':0.76,
  'lucknow':0.80,'kanpur':0.75,'agra':0.75,'varanasi':0.74,'allahabad':0.73,'prayagraj':0.73,
  'indore':0.80,'bhopal':0.78,'jabalpur':0.74,
  'nagpur':0.85,'nashik':0.82,'aurangabad':0.78,
  'ludhiana':0.85,'amritsar':0.82,'jalandhar':0.80,
  'coimbatore':0.88,'madurai':0.82,'tiruchirappalli':0.80,
  'visakhapatnam':0.85,'vijayawada':0.82,'guntur':0.78,'warangal':0.78,
  'patna':0.75,'ranchi':0.74,'dhanbad':0.72,
  'raipur':0.75,'bhubaneswar':0.80,'cuttack':0.75,
  'guwahati':0.78,'shillong':0.75,
  'dehradun':0.85,'haridwar':0.80,
  'srinagar':0.80,'jammu':0.78,
  'mysuru':0.88,'mysore':0.88,'mangaluru':0.90,'hubli':0.82,
};

const QUALITY_MULT = { 0:0.62, 1:1.0, 2:1.55, 3:2.50 };

const BOQ_BASE = {
  furniture: {
    'sofa':           { label:'Sofa (3-seater)',            base:55000 },
    'bed':            { label:'Bed with headboard (Queen)', base:38000 },
    'wardrobe':       { label:'Wardrobe (6ft sliding)',     base:45000 },
    'dining-table':   { label:'Dining table (6-seater)',    base:42000 },
    'tv-unit':        { label:'TV unit',                    base:28000 },
    'desk':           { label:'Study/work desk',            base:22000 },
    'bookshelf':      { label:'Bookshelf',                  base:18000 },
    'center-table':   { label:'Center/coffee table',        base:14000 },
    'accent-chair':   { label:'Accent chair',               base:22000 },
    'lounge-chair':   { label:'Lounge chair',               base:30000 },
    'side-table':     { label:'Side table',                 base:8000  },
    'dresser':        { label:'Dresser with mirror',        base:28000 },
    'shoe-rack':      { label:'Shoe rack',                  base:7500  },
    'storage':        { label:'Storage cabinet',            base:18000 },
    'bean-bag':       { label:'Bean bag',                   base:6000  },
    'pooja-unit':     { label:'Pooja unit',                 base:22000 },
    'bar-cabinet':    { label:'Bar cabinet',                base:35000 },
    'chest-of-drawers':{ label:'Chest of drawers',         base:20000 },
    'display-cabinet':{ label:'Display cabinet',           base:28000 },
  },
  flooring: {
    'teak-hardwood':  { label:'Teak hardwood flooring',     base:185, unit:'sqft' },
    'oak-hardwood':   { label:'Oak hardwood flooring',      base:165, unit:'sqft' },
    'marble':         { label:'Marble flooring',            base:225, unit:'sqft' },
    'italian-marble': { label:'Italian marble flooring',    base:390, unit:'sqft' },
    'vitrified-tiles':{ label:'Vitrified tile flooring',    base:88,  unit:'sqft' },
    'laminate':       { label:'Laminate wood flooring',     base:98,  unit:'sqft' },
    'cement':         { label:'Polished concrete floor',    base:72,  unit:'sqft' },
    'bamboo':         { label:'Bamboo flooring',            base:135, unit:'sqft' },
  },
  wallFinish: {
    'matte':          { label:'Premium matte paint',        base:38,  unit:'sqft' },
    'textured':       { label:'Textured paint finish',      base:58,  unit:'sqft' },
    'wallpaper':      { label:'Designer wallpaper',         base:125, unit:'sqft' },
    'lime-wash':      { label:'Lime wash finish',           base:48,  unit:'sqft' },
    'panelling':      { label:'Wall panelling',             base:290, unit:'sqft' },
  },
  ceiling: {
    'plain':          { label:'Painted plain ceiling',      base:22,  unit:'sqft' },
    'false-ceiling':  { label:'Gypsum false ceiling',       base:115, unit:'sqft' },
    'coffered':       { label:'Coffered ceiling',           base:185, unit:'sqft' },
    'wooden':         { label:'Wooden ceiling panels',      base:230, unit:'sqft' },
  },
  lighting: {
    'recessed':       { label:'Recessed LED downlight',     base:2200 },
    'pendant':        { label:'Pendant light',              base:8000 },
    'chandelier':     { label:'Chandelier',                 base:28000 },
    'track':          { label:'Track light point',          base:3500 },
    'cove':           { label:'Cove lighting (per rft)',    base:280, unit:'rft' },
  },
};

function getCityMult(cityStr) {
  if (!cityStr) return 1.0;
  const c = cityStr.toLowerCase().trim();
  if (CITY_MULT[c]) return CITY_MULT[c];
  for (const [k,v] of Object.entries(CITY_MULT)) {
    if (c.includes(k) || k.includes(c)) return v;
  }
  return 0.88; // default: smaller city
}

function round100(n) { return Math.round(n / 100) * 100; }

function generateBOQ() {
  const d = state.selectedDesign || DESIGNS[0];
  const cityMult = getCityMult(state.city);
  const qualMult = QUALITY_MULT[state.budget?.tier ?? 1];
  const L = state.dims?.length || 18;
  const B = state.dims?.breadth || 14;
  const H = state.dims?.height || 10;
  const area = L * B;
  const wallArea = 2 * (L + B) * H;
  const P = (base) => round100(base * cityMult * qualMult);
  const sections = [];

  // 1. Furniture
  const allFurn = [...new Set([...(state.furniture.existing||[]), ...(state.furniture.wanted||[])])];
  const defaultFurn = { living:['sofa','center-table','tv-unit'], bedroom:['bed','wardrobe','side-table'], dining:['dining-table'], office:['desk','bookshelf'], kids:['bed','desk'], studio:['sofa','bed'] };
  const furnList = allFurn.length ? allFurn : (defaultFurn[state.room] || defaultFurn.living);
  const furnItems = furnList.map(k => {
    const b = BOQ_BASE.furniture[k]; if (!b) return null;
    const up = P(b.base);
    return { label:b.label, qty:1, unit:'nos', unitPrice:up, total:up };
  }).filter(Boolean);
  if (furnItems.length) sections.push({ icon:'🪑', title:'Furniture', items:furnItems });

  // 2. Flooring
  const floorBp = BOQ_BASE.flooring[state.floor] || BOQ_BASE.flooring['teak-hardwood'];
  sections.push({ icon:'🪵', title:'Flooring', items:[{
    label: floorBp.label, qty: area, unit:'sqft', unitPrice: P(floorBp.base), total: round100(P(floorBp.base) * area)
  }]});

  // 3. Wall finish
  const wallBp = BOQ_BASE.wallFinish[state.wallFinish] || BOQ_BASE.wallFinish['matte'];
  const wallName = WALL_COLOR_NAMES?.[state.wallColor?.toUpperCase()] || 'Custom colour';
  sections.push({ icon:'🎨', title:'Wall Finish', items:[{
    label:`${wallBp.label} · ${wallName}`, qty: Math.round(wallArea), unit:'sqft', unitPrice: P(wallBp.base), total: round100(P(wallBp.base) * wallArea)
  }]});

  // 4. Ceiling
  const ceilBp = BOQ_BASE.ceiling[state.ceiling] || BOQ_BASE.ceiling['plain'];
  sections.push({ icon:'✦', title:'Ceiling', items:[{
    label:ceilBp.label, qty:area, unit:'sqft', unitPrice:P(ceilBp.base), total:round100(P(ceilBp.base)*area)
  }]});

  // 5. Lighting
  const lightCount = Math.max(4, Math.round(area / 28));
  const lightBp = BOQ_BASE.lighting[state.lightingType] || BOQ_BASE.lighting['recessed'];
  const lightItems = [{ label:lightBp.label, qty:lightCount, unit:'nos', unitPrice:P(lightBp.base), total:round100(P(lightBp.base)*lightCount) }];
  if (state.budget?.tier >= 2) lightItems.push({ label:'Statement pendant / chandelier', qty:1, unit:'nos', unitPrice:P(15000), total:P(15000) });
  const covePerim = 2*(L+B);
  lightItems.push({ label:'Cove LED strip lighting', qty:covePerim, unit:'rft', unitPrice:P(280), total:round100(P(280)*covePerim) });
  sections.push({ icon:'💡', title:'Lighting', items:lightItems });

  // 6. Soft furnishings
  const softItems = [];
  if (state.curtain?.material) softItems.push({ label:`Curtains · ${state.curtain.style||'panel'} · ${state.curtain.material}`, qty:2, unit:'panels', unitPrice:P(9000), total:P(9000)*2 });
  if (state.rug?.material) softItems.push({ label:`Area rug · ${state.rug.material}`, qty:1, unit:'nos', unitPrice:P(15000), total:P(15000) });
  if (softItems.length) sections.push({ icon:'🪟', title:'Soft Furnishings', items:softItems });

  // 7. MEP
  const elecPoints = Math.max(8, Math.round(area/22));
  const fanCount = Math.ceil(area/130);
  const mepItems = [
    { label:'Modular electrical switches & sockets', qty:elecPoints, unit:'nos', unitPrice:P(1200), total:round100(P(1200)*elecPoints) },
    { label:'Ceiling fan point (wiring)', qty:fanCount, unit:'nos', unitPrice:P(1500), total:round100(P(1500)*fanCount) },
  ];
  if (['living','bedroom','office','workoffice'].includes(state.room)) {
    mepItems.push({ label:'AC point (wiring + drainage)', qty:1, unit:'nos', unitPrice:P(4800), total:P(4800) });
  }
  if (['kitchen','bathroom'].includes(state.room)) {
    mepItems.push({ label:'Plumbing points', qty:4, unit:'nos', unitPrice:P(3500), total:round100(P(3500)*4) });
  }
  sections.push({ icon:'⚡', title:'MEP (Electrical / Plumbing)', items:mepItems });

  // Subtotal
  const subtotal = sections.reduce((s,sec)=>s+sec.items.reduce((ss,i)=>ss+i.total,0),0);
  const carpentry = round100(subtotal * 0.12);
  const designFee = round100(subtotal * 0.10);
  sections.push({ icon:'🔨', title:'Labor & Professional Fees', items:[
    { label:'Carpentry & site installation', qty:1, unit:'lumpsum', unitPrice:carpentry, total:carpentry },
    { label:'Interior designer fee (10%)', qty:1, unit:'lumpsum', unitPrice:designFee, total:designFee },
  ]});

  const grandTotal = subtotal + carpentry + designFee;
  const cityLabel = state.city ? state.city.charAt(0).toUpperCase()+state.city.slice(1) : 'Your city';
  return { sections, subtotal, grandTotal, cityLabel, cityMult, area };
}

function renderBOQ() {
  const el = document.getElementById('boqContainer');
  if (!el) return;
  const { sections, subtotal, grandTotal, cityLabel, cityMult, area } = generateBOQ();
  const cityTag = cityMult >= 1.3 ? '🔴 High cost city' : cityMult >= 1.0 ? '🟡 Moderate cost city' : '🟢 Affordable city';

  el.innerHTML = `
    <div class="boq-header">
      <div class="boq-title">📋 Bill of Quantities</div>
      <div class="boq-meta">${cityLabel} · ${area} sqft · ${state.budget?.label || 'Mid-Range'} quality <span class="boq-city-tag">${cityTag}</span></div>
    </div>
    ${sections.map(sec => `
      <div class="boq-section">
        <div class="boq-sec-title">${sec.icon} ${sec.title}</div>
        <table class="boq-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>
          <tbody>
            ${sec.items.map(i=>`<tr>
              <td>${i.label}</td>
              <td>${typeof i.qty==='number'&&i.qty%1!==0?i.qty.toFixed(0):i.qty}</td>
              <td>${i.unit}</td>
              <td>${formatINR(i.unitPrice)}</td>
              <td class="boq-amount">${formatINR(i.total)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}
    <div class="boq-totals">
      <div class="boq-subtotal"><span>Subtotal</span><span>${formatINR(subtotal)}</span></div>
      <div class="boq-grand"><span>Total Estimated Cost</span><span>${formatINR(grandTotal)}</span></div>
      <div class="boq-disclaimer">* Prices based on ${cityLabel} market rates. Actual costs may vary ±15% based on brand, contractor, and material availability.</div>
    </div>`;
}

function updateCommitCard() {
  const d = state.selectedDesign || DESIGNS[0];
  const costEl = document.getElementById('commitCost');
  if (costEl) costEl.textContent = d.cost;
  const timeEl = document.getElementById('p3Timeline');
  if (timeEl) timeEl.textContent = d.time;
  updateP3DesignBoard();
}

function setWall(color, el) {
  document.querySelectorAll('#wallSwatches .color-sw').forEach(s => s.classList.remove('selected'));
  if (el) el.classList.add('selected');
  state.wallColor = color;
  updateP3WallOverlay();
  updateP3DesignBoard();
}

function setWallFinish(finish, btn) {
  if (btn) { btn.closest('.p3-option-chips').querySelectorAll('.p3-chip').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
  state.wallFinish = finish;
  updateP3DesignBoard();
}

function setFloor(type, btn) {
  if (btn) { btn.closest('.p3-option-chips').querySelectorAll('.p3-chip').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
  state.floor = type;
  updateP3DesignBoard();
}

function setSofa(aspect, value, el) {
  if (!state.sofa) state.sofa = {};
  if (el) {
    el.closest('.p3-option-chips, .p3-color-grid')?.querySelectorAll('.p3-chip, .color-sw').forEach(b => b.classList.remove('active','selected'));
    el.classList.add(el.classList.contains('color-sw') ? 'selected' : 'active');
  }
  state.sofa[aspect] = value;
  updateP3DesignBoard();
}

function setLightingType(type, btn) {
  if (btn) { btn.closest('.p3-option-chips').querySelectorAll('.p3-chip').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
  state.lightingType = type;
  updateP3DesignBoard();
}

function setCurtain(aspect, value, el) {
  if (!state.curtain) state.curtain = {};
  if (el) {
    el.closest('.p3-option-chips, .p3-color-grid')?.querySelectorAll('.p3-chip, .color-sw').forEach(b => b.classList.remove('active','selected'));
    el.classList.add(el.classList.contains('color-sw') ? 'selected' : 'active');
  }
  state.curtain[aspect] = value;
  updateP3DesignBoard();
}

function setRug(aspect, value, btn) {
  if (!state.rug) state.rug = {};
  if (btn) {
    btn.closest('.p3-option-chips').querySelectorAll('.p3-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  state.rug[aspect] = value;
  updateP3DesignBoard();
}

function setCeiling(type, btn) {
  if (btn) { btn.closest('.p3-option-chips').querySelectorAll('.p3-chip').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
  state.ceiling = type;
  updateP3DesignBoard();
}

function setFurniture(type, val, btn) {
  if (btn) {
    const group = btn.closest('.swap-options');
    if (group) group.querySelectorAll('.swap-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  state[type] = val;
}

function setLighting(mood, btn) {
  if (btn) {
    const g = btn.closest('.swap-options, .p3-option-chips');
    if (g) g.querySelectorAll('.swap-btn, .p3-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  state.lighting = mood;
  updateP3LightingOverlay();
  updateP3DesignBoard();
}

function toggleDecor(key, val) {
  if (!state.decor) state.decor = {};
  state.decor[key] = !state.decor[key];
  updateP3DesignBoard();
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
      // Migrate old budget format (had no numValue) — default to ₹2L if stale
      budget: (saved.budget?.numValue) ? saved.budget : state.budget,
      constraints: new Set(saved.constraints ?? []),
      notes: saved.notes ?? state.notes,
      dims: saved.dims ?? state.dims,
      shape: saved.shape ?? state.shape,
      pillars: saved.pillars ?? state.pillars,
      selectedDesign: saved.selectedDesign ?? state.selectedDesign,
      favDesigns: new Set(saved.favDesigns ?? []),
      wallColor: saved.wallColor ?? state.wallColor,
      // Validate sofa — old format was a string, new is object
      sofa: (saved.sofa && typeof saved.sofa === 'object') ? saved.sofa : state.sofa,
      // Validate floor — old values like 'wood' map to new chip labels
      floor: (saved.floor && saved.floor.includes('-')) ? saved.floor : state.floor,
      lighting: saved.lighting ?? state.lighting,
      wallFinish: saved.wallFinish ?? state.wallFinish,
      lightingType: saved.lightingType ?? state.lightingType,
      ceiling: saved.ceiling ?? state.ceiling,
      curtain: saved.curtain ?? state.curtain,
      rug: saved.rug ?? state.rug,
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
