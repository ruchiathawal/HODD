/* ═══════════════════════════════════════════════════════════════
   HODD · Firebase Backend
   ─────────────────────────────────────────────────────────────
   SETUP (one-time):
   1. Go to https://console.firebase.google.com → New project
   2. Enable Google Analytics when prompted
   3. Add a Web app → copy the config below
   4. Firestore Database → Create database (start in test mode)
   5. Authentication → Sign-in method → Enable Email/Password + Google
   6. Replace every "YOUR_…" value below with your real values
═══════════════════════════════════════════════════════════════ */

const firebaseConfig = {
  apiKey:            "AIzaSyCBTPvcIiu9r3fvwph_K-xdCWmrRZVtn3g",
  authDomain:        "hodd-7f6de.firebaseapp.com",
  projectId:         "hodd-7f6de",
  storageBucket:     "hodd-7f6de.firebasestorage.app",
  messagingSenderId: "151430626519",
  appId:             "1:151430626519:web:fa7cc9e84bc3ae837f4492",
  measurementId:     "G-6CWM9WWR82",
};

/* ── Firebase SDK (loaded via CDN in index.html) ─────────────── */
let db, auth, analytics, googleProvider;
let currentUser = null;

function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK not loaded — check CDN scripts in index.html');
    return false;
  }
  if (firebase.apps.length === 0) firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  // Force long-polling instead of WebSockets (fixes connection issues on some networks)
  db.settings({ experimentalForceLongPolling: true, merge: true });
  auth     = firebase.auth();
  googleProvider = new firebase.auth.GoogleAuthProvider();

  // Google Analytics
  if (firebaseConfig.measurementId && firebaseConfig.measurementId !== 'YOUR_GA_MEASUREMENT_ID') {
    analytics = firebase.analytics();
  }

  // Listen for auth state
  auth.onAuthStateChanged(user => {
    currentUser = user;
    onAuthChange(user);
  });

  return true;
}

/* ═══════════════════════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════════════════════ */
async function fbSignUp(email, password, name) {
  // Always create a fresh real account (guest data stays separate for analytics)
  if (auth.currentUser?.isAnonymous) await auth.currentUser.delete().catch(() => {});
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  await cred.user.updateProfile({ displayName: name });
  await fbSaveUserProfile(cred.user, { displayName: name, email, isAnonymous: false });
  trackEvent('sign_up', { method: 'email' });
  return cred.user;
}

async function fbSignIn(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  trackEvent('login', { method: 'email' });
  return cred.user;
}

async function fbSignInWithGoogle() {
  if (auth.currentUser?.isAnonymous) await auth.currentUser.delete().catch(() => {});
  const cred = await auth.signInWithPopup(googleProvider);
  const isNew = cred.additionalUserInfo?.isNewUser;
  await fbSaveUserProfile(cred.user, {
    displayName: cred.user.displayName,
    email: cred.user.email,
    isAnonymous: false,
  });
  trackEvent('login', { method: 'google', new_user: isNew });
  return cred.user;
}

async function fbSignOut() {
  await auth.signOut();
  trackEvent('logout');
}

/* ═══════════════════════════════════════════════════════════════
   USER PROFILE + DEMOGRAPHICS
═══════════════════════════════════════════════════════════════ */
async function fbSaveUserProfile(user, extra = {}) {
  if (!user) return;
  const ref = db.collection('users').doc(user.uid);
  await ref.set({
    uid:         user.uid,
    email:       user.email || null,
    displayName: user.displayName || extra.displayName || null,
    photoURL:    user.photoURL || null,
    isAnonymous: user.isAnonymous || false,
    city:        state.city || '',
    updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
    createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
    ...extra,
  }, { merge: true });
}

async function fbUpdateDemographics(data) {
  // data: { city, ageRange, incomeRange, homeType }
  if (!currentUser) return;
  await db.collection('users').doc(currentUser.uid).set({
    demographics: data,
    city: data.city || '',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  trackEvent('demographics_saved', data);
}

async function fbGetUserProfile() {
  if (!currentUser) return null;
  const snap = await db.collection('users').doc(currentUser.uid).get();
  return snap.exists ? snap.data() : null;
}

/* ═══════════════════════════════════════════════════════════════
   DESIGN SESSIONS
═══════════════════════════════════════════════════════════════ */
const SESSION_ID_KEY = 'hodd_session_id';

function getOrCreateSessionId() {
  let id = localStorage.getItem(SESSION_ID_KEY);
  if (!id) { id = 'sess_' + Date.now(); localStorage.setItem(SESSION_ID_KEY, id); }
  return id;
}

async function fbSaveSession() {
  if (!currentUser || !db) return;
  const sessionId = getOrCreateSessionId();
  const payload = {
    uid:       currentUser.uid,
    sessionId,
    room:      state.room,
    style:     state.style,
    city:      state.city,
    budget:    state.budget,
    dims:      state.dims,
    shape:     state.shape,
    pillars:   state.pillars,
    phase:     state.phase,
    wallColor: state.wallColor,
    sofa:      state.sofa,
    floor:     state.floor,
    lighting:  state.lighting,
    decor:     state.decor,
    constraints: [...state.constraints],
    notes:     state.notes,
    selectedDesign: state.selectedDesign,
    favDesigns: [...state.favDesigns],
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('users').doc(currentUser.uid)
          .collection('sessions').doc(sessionId).set(payload, { merge: true });
}

async function fbLoadLatestSession() {
  if (!currentUser || !db) return null;
  const snap = await db.collection('users').doc(currentUser.uid)
    .collection('sessions')
    .orderBy('updatedAt', 'desc').limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].data();
}

async function fbListSessions() {
  if (!currentUser || !db) return [];
  const snap = await db.collection('users').doc(currentUser.uid)
    .collection('sessions').orderBy('updatedAt', 'desc').limit(10).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ═══════════════════════════════════════════════════════════════
   SAVED DESIGNS / FAVOURITES
═══════════════════════════════════════════════════════════════ */
async function fbSaveDesign(design, isFavourite = false) {
  if (!currentUser || !db) return;
  const docId = `design_${design.id}_${getOrCreateSessionId()}`;
  await db.collection('users').doc(currentUser.uid)
    .collection('designs').doc(docId).set({
      ...design,
      isFavourite,
      savedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  trackEvent('design_saved', { style: design.styleKey, cost: design.costNum, favourite: isFavourite });
}

async function fbGetSavedDesigns() {
  if (!currentUser || !db) return [];
  const snap = await db.collection('users').doc(currentUser.uid)
    .collection('designs').orderBy('savedAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ═══════════════════════════════════════════════════════════════
   CART & ORDERS
═══════════════════════════════════════════════════════════════ */
async function fbSaveCart(cart) {
  if (!currentUser || !db) return;
  const total = cart.reduce((s, i) => s + (i.priceNum || 0), 0);
  await db.collection('users').doc(currentUser.uid)
    .collection('cart').doc('active').set({
      items:     cart,
      total,
      itemCount: cart.length,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
}

async function fbCheckout(cart) {
  if (!currentUser || !db) return;
  const total = cart.reduce((s, i) => s + (i.priceNum || 0), 0);
  // Archive the active cart as an order
  const orderId = 'order_' + Date.now();
  await db.collection('users').doc(currentUser.uid)
    .collection('orders').doc(orderId).set({
      items:   cart,
      total,
      status:  'confirmed',
      design:  state.selectedDesign,
      city:    state.city,
      orderedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  // Clear active cart
  await db.collection('users').doc(currentUser.uid)
    .collection('cart').doc('active').delete();
  trackEvent('purchase', { currency: 'INR', value: total, items: cart.length });
  return orderId;
}

/* ═══════════════════════════════════════════════════════════════
   GOOGLE ANALYTICS — EVENT TRACKING
═══════════════════════════════════════════════════════════════ */
function trackEvent(name, params = {}) {
  // Firebase Analytics
  if (analytics) {
    try { analytics.logEvent(name, params); } catch(e) {}
  }
  // gtag (GA4 via CDN)
  if (typeof gtag !== 'undefined') {
    gtag('event', name, params);
  }
  // Cookie consent check — only log if consented
  if (!getCookieConsent()) return;
  console.debug('[Analytics]', name, params);
}

function trackPageView(pageName) {
  trackEvent('page_view', { page_title: pageName, page_location: window.location.href });
}

function trackPhase(phase) {
  const names = ['','Input','Design','Decide','Execute','Shop'];
  trackEvent('wizard_phase', { phase_number: phase, phase_name: names[phase] || '' });
  if (typeof gtag !== 'undefined') {
    gtag('event', 'page_view', { page_title: `Phase ${phase}: ${names[phase]}` });
  }
}

/* ═══════════════════════════════════════════════════════════════
   COOKIE CONSENT (GDPR-lite)
═══════════════════════════════════════════════════════════════ */
const CONSENT_KEY = 'hodd_cookie_consent';

function getCookieConsent() {
  return localStorage.getItem(CONSENT_KEY) === 'accepted';
}

function setCookieConsent(accepted) {
  localStorage.setItem(CONSENT_KEY, accepted ? 'accepted' : 'declined');
  document.getElementById('cookieBanner')?.remove();
  if (accepted) trackEvent('cookie_consent_given');
}

function showCookieBanner() {
  if (localStorage.getItem(CONSENT_KEY)) return; // already decided
  const banner = document.createElement('div');
  banner.id = 'cookieBanner';
  banner.style.cssText = `
    position:fixed;bottom:0;left:0;right:0;z-index:9999;
    background:var(--surface);border-top:1px solid var(--border2);
    padding:1rem 2rem;display:flex;align-items:center;
    gap:1rem;flex-wrap:wrap;font-size:.82rem;color:var(--text);
    box-shadow:0 -4px 24px rgba(0,0,0,.08);`;
  banner.innerHTML = `
    <span style="flex:1;min-width:200px">🍪 We use cookies to remember your designs and improve your experience.
      <a href="#" style="color:var(--accent)">Learn more</a></span>
    <button onclick="setCookieConsent(true)" style="background:var(--accent);color:#fff;border:none;padding:.45rem 1.1rem;border-radius:var(--radius-xs);font-weight:600;cursor:pointer;font-size:.8rem;">Accept</button>
    <button onclick="setCookieConsent(false)" style="background:none;border:1px solid var(--border2);color:var(--muted);padding:.45rem 1rem;border-radius:var(--radius-xs);cursor:pointer;font-size:.8rem;">Decline</button>`;
  document.body.appendChild(banner);
}

/* ═══════════════════════════════════════════════════════════════
   AUTH STATE CHANGE → update UI
═══════════════════════════════════════════════════════════════ */
function onAuthChange(user) {
  updateAuthUI(user);
  if (!user) {
    // Sign in anonymously so interactions are always tracked in Firestore
    auth.signInAnonymously().catch(() => {});
    return;
  }
  if (user.isAnonymous) {
    // Guest — save profile stub for analytics, but no UI features
    fbSaveUserProfile(user, { type: 'anonymous' });
    return;
  }
  // Real signed-in user — full experience
  fbSaveUserProfile(user, { city: state.city });
  // Show resume banner if they have a saved session
  fbLoadLatestSession().then(saved => {
    if (saved) showResumeBanner(
      saved.updatedAt?.toDate
        ? saved.updatedAt.toDate().toLocaleDateString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
        : ''
    );
  });
}

function updateAuthUI(user) {
  const navRight = document.querySelector('.nav-right');
  if (!navRight) return;

  // Anonymous users — show Sign In / Sign Up only (no personal menu)
  if (!user || user.isAnonymous) {
    navRight.innerHTML = `
      <button class="nav-badge" onclick="openAuthModal('signin')" style="cursor:pointer">Sign In</button>
      <button class="btn-auth-cta" onclick="openAuthModal('signup')">Sign Up Free</button>`;
    return;
  }

  // Logged-in real user — show full menu
  const initials = (user.displayName || user.email || '?').charAt(0).toUpperCase();
  navRight.innerHTML = `
    <div class="user-menu" onclick="toggleUserMenu()">
      <div class="user-avatar">${user.photoURL
        ? `<img src="${user.photoURL}" alt="${initials}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
        : initials}</div>
      <span class="user-name">${user.displayName || user.email.split('@')[0]}</span>
      <span style="color:var(--muted);font-size:.8rem">▾</span>
    </div>
    <div class="user-dropdown hidden" id="userDropdown">
      <div class="dropdown-email">${user.email}</div>
      <button class="dropdown-item" onclick="showSavedDesigns()">📐 My Designs</button>
      <button class="dropdown-item" onclick="exportDesign()">⬇ Export Design</button>
      <hr style="border:none;border-top:1px solid var(--border);margin:.25rem 0">
      <button class="dropdown-item" onclick="fbSignOut().then(()=>location.reload())">Sign Out</button>
    </div>`;
}

function toggleUserMenu() {
  document.getElementById('userDropdown')?.classList.toggle('hidden');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.user-menu')) {
    document.getElementById('userDropdown')?.classList.add('hidden');
  }
});

/* ═══════════════════════════════════════════════════════════════
   AUTH MODAL
═══════════════════════════════════════════════════════════════ */
function openAuthModal(mode = 'signin') {
  let modal = document.getElementById('authModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'authModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(4px);';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border2);border-radius:var(--radius);padding:2rem;width:100%;max-width:400px;position:relative;">
      <button onclick="document.getElementById('authModal').remove()" style="position:absolute;top:.75rem;right:.75rem;background:none;border:none;color:var(--muted);font-size:1.2rem;cursor:pointer;">✕</button>

      <h2 style="font-family:'Playfair Display',serif;font-size:1.5rem;margin-bottom:.25rem">${mode==='signup' ? 'Create Account' : 'Welcome Back'}</h2>
      <p style="color:var(--muted);font-size:.84rem;margin-bottom:1.5rem">${mode==='signup' ? 'Save your designs across devices' : 'Continue where you left off'}</p>

      <button onclick="handleGoogleAuth()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:.65rem;background:var(--surface);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:.75rem;font-size:.88rem;font-weight:600;cursor:pointer;margin-bottom:1rem;color:var(--text);">
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" height="18"> Continue with Google
      </button>

      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;color:var(--muted);font-size:.75rem;">
        <hr style="flex:1;border:none;border-top:1px solid var(--border)"> or <hr style="flex:1;border:none;border-top:1px solid var(--border)">
      </div>

      ${mode==='signup' ? `<input id="authName" placeholder="Full name" style="width:100%;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:.88rem;padding:.65rem .9rem;border-radius:var(--radius-sm);outline:none;font-family:inherit;margin-bottom:.6rem;">` : ''}
      <input id="authEmail" type="email" placeholder="Email address" style="width:100%;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:.88rem;padding:.65rem .9rem;border-radius:var(--radius-sm);outline:none;font-family:inherit;margin-bottom:.6rem;">
      <input id="authPass" type="password" placeholder="Password" style="width:100%;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:.88rem;padding:.65rem .9rem;border-radius:var(--radius-sm);outline:none;font-family:inherit;margin-bottom:1rem;">

      <div id="authError" style="color:#e53e3e;font-size:.78rem;margin-bottom:.75rem;display:none;"></div>

      <button onclick="handleEmailAuth('${mode}')" style="width:100%;background:var(--accent);color:#fff;border:none;border-radius:var(--radius-sm);padding:.75rem;font-size:.92rem;font-weight:700;cursor:pointer;">
        ${mode==='signup' ? 'Create Account' : 'Sign In'}
      </button>

      <p style="text-align:center;font-size:.78rem;color:var(--muted);margin-top:1rem;">
        ${mode==='signup'
          ? `Already have an account? <a href="#" onclick="openAuthModal('signin')" style="color:var(--accent)">Sign in</a>`
          : `No account? <a href="#" onclick="openAuthModal('signup')" style="color:var(--accent)">Sign up free</a>`}
      </p>
    </div>`;
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
}

async function handleEmailAuth(mode) {
  const email = document.getElementById('authEmail')?.value?.trim();
  const pass  = document.getElementById('authPass')?.value;
  const name  = document.getElementById('authName')?.value?.trim();
  const errEl = document.getElementById('authError');

  if (!email || !pass) { showAuthError('Please fill in all fields.'); return; }
  try {
    if (mode === 'signup') {
      if (!name) { showAuthError('Please enter your name.'); return; }
      await fbSignUp(email, pass, name);
    } else {
      await fbSignIn(email, pass);
    }
    document.getElementById('authModal')?.remove();
    // After login, sync session to Firestore
    await fbSaveSession();
    showSaveToast();
  } catch(err) {
    showAuthError(friendlyAuthError(err.code));
  }
}

async function handleGoogleAuth() {
  try {
    await fbSignInWithGoogle();
    document.getElementById('authModal')?.remove();
    await fbSaveSession();
    showSaveToast();
  } catch(err) {
    showAuthError(friendlyAuthError(err.code));
  }
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function friendlyAuthError(code) {
  const map = {
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/user-not-found':       'No account found with this email.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

/* ═══════════════════════════════════════════════════════════════
   SAVED DESIGNS PANEL
═══════════════════════════════════════════════════════════════ */
async function showSavedDesigns() {
  document.getElementById('userDropdown')?.classList.add('hidden');
  const designs = await fbGetSavedDesigns();
  let panel = document.getElementById('savedPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'savedPanel';
    panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px);';
    document.body.appendChild(panel);
  }
  panel.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border2);border-radius:var(--radius) var(--radius) 0 0;padding:2rem;width:100%;max-width:680px;max-height:80vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h3 style="font-family:'Playfair Display',serif;font-size:1.3rem;">My Saved Designs</h3>
        <button onclick="document.getElementById('savedPanel').remove()" style="background:none;border:none;color:var(--muted);font-size:1.2rem;cursor:pointer;">✕</button>
      </div>
      ${designs.length === 0
        ? `<p style="color:var(--muted);text-align:center;padding:2rem">No saved designs yet. Star a design in the wizard to save it here.</p>`
        : designs.map(d => `
            <div style="display:flex;align-items:center;gap:1rem;padding:.85rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:.6rem;">
              <div style="font-size:1.5rem">${d.isFavourite ? '⭐' : '📐'}</div>
              <div style="flex:1">
                <div style="font-weight:600;font-size:.9rem">${d.name || d.styleKey || 'Design'}</div>
                <div style="font-size:.75rem;color:var(--muted)">${d.cost || ''} · ${d.savedAt?.toDate ? d.savedAt.toDate().toLocaleDateString('en-IN') : ''}</div>
              </div>
            </div>`).join('')}
    </div>`;
  panel.onclick = e => { if (e.target === panel) panel.remove(); };
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN — read-only stats (requires sign-in as admin UID)
═══════════════════════════════════════════════════════════════ */
const ADMIN_UID = 'REPLACE_WITH_YOUR_UID'; // set this to your Firebase UID

function isAdmin() {
  return currentUser && currentUser.uid === ADMIN_UID;
}

async function fbAdminGetUsers(limit = 50) {
  if (!db) return [];
  const snap = await db.collection('users')
    .orderBy('updatedAt', 'desc').limit(limit).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function fbAdminGetStats() {
  if (!db) return { users: 0, orders: 0 };
  // Count users (top-level collection)
  const usersSnap = await db.collection('users').get();
  return {
    users: usersSnap.size,
    userList: usersSnap.docs.map(d => ({
      uid:         d.id,
      email:       d.data().email || '(anonymous)',
      displayName: d.data().displayName || '—',
      city:        d.data().city || '—',
      isAnonymous: d.data().isAnonymous || false,
      updatedAt:   d.data().updatedAt,
    })),
  };
}

/* ═══════════════════════════════════════════════════════════════
   VENDOR SYSTEM
═══════════════════════════════════════════════════════════════ */

// Get verified vendors for a city + category (called by renderBOQ)
async function fbGetVendors(city, category) {
  if (!db || !city) return [];
  try {
    const snap = await db.collection('vendors')
      .where('verified', '==', true)
      .where('cities', 'array-contains', city.toLowerCase())
      .get();
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(v => v.categories?.includes(category));
  } catch(e) {
    console.warn('fbGetVendors error', e);
    return [];
  }
}

// Track a vendor click (commission evidence)
async function fbTrackVendorClick(vendorId, vendorName, city, category, type) {
  if (!db) return;
  try {
    const batch = db.batch();
    // Log individual click
    const clickRef = db.collection('vendor_clicks').doc();
    batch.set(clickRef, {
      vendorId, vendorName, city, category, type,
      userId: currentUser?.uid || null,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
    // Increment vendor click counter
    const vendorRef = db.collection('vendors').doc(vendorId);
    batch.update(vendorRef, { clicks: firebase.firestore.FieldValue.increment(1) });
    await batch.commit();
  } catch(e) {
    console.warn('fbTrackVendorClick error', e);
  }
}

// Admin: get all vendors (verified + pending)
async function fbAdminGetVendors() {
  if (!db) return [];
  const snap = await db.collection('vendors').orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Admin: verify or reject vendor
async function fbAdminSetVendorStatus(vendorId, verified) {
  if (!db) return;
  await db.collection('vendors').doc(vendorId).update({ verified, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
}

// Admin: get click stats for all vendors
async function fbAdminGetClickStats() {
  if (!db) return {};
  const snap = await db.collection('vendor_clicks').get();
  const stats = {};
  snap.docs.forEach(d => {
    const { vendorId, type } = d.data();
    if (!stats[vendorId]) stats[vendorId] = { total: 0, whatsapp: 0, catalog: 0 };
    stats[vendorId].total++;
    if (type === 'whatsapp') stats[vendorId].whatsapp++;
    else stats[vendorId].catalog++;
  });
  return stats;
}

/* ── Init on load ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();
  showCookieBanner();
});
