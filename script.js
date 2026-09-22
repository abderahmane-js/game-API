/* =========================================================
   Game Diary — script.js
   Modal logic + RAWG-backed game rendering
   ========================================================= */

// ---- RAWG API config -------------------------------------------------
const API_KEY = 'cdf0396863c347d49c5faaed011ecebf';
const API_BASE = 'https://api.rawg.io/api/games';

// Cover gradients cycled for games with no background_image
const COVER_FALLBACKS = [
  'linear-gradient(160deg,#2c1b4d,#0f0a1e)',
  'linear-gradient(160deg,#123326,#081712)',
  'linear-gradient(160deg,#331414,#160707)',
  'linear-gradient(160deg,#123143,#050f16)',
  'linear-gradient(160deg,#3a2a10,#170f04)',
  'linear-gradient(160deg,#1c1c3d,#08081a)',
];

// Offline / error fallback sample data, shaped like RAWG results
// so renderGames() doesn't need to branch on data source.
const FALLBACK_GAMES = [
  { id: 'elden-ring',      name: 'Elden Ring',       background_image: null, genres: [{ name: 'Action RPG' }],   rating: 4.8,  released: '2022-02-25' },
  { id: 'hollow-knight',   name: 'Hollow Knight',    background_image: null, genres: [{ name: 'Metroidvania' }], rating: 4.5,  released: '2017-02-24' },
  { id: 'hades',           name: 'Hades',            background_image: null, genres: [{ name: 'Roguelike' }],    rating: 4.65, released: '2020-09-17' },
  { id: 'baldurs-gate-3',  name: "Baldur's Gate 3",  background_image: null, genres: [{ name: 'RPG' }],          rating: 4.85, released: '2023-08-03' },
  { id: 'stardew-valley',  name: 'Stardew Valley',   background_image: null, genres: [{ name: 'Simulation' }],   rating: 4.55, released: '2016-02-26' },
  { id: 'celeste',         name: 'Celeste',          background_image: null, genres: [{ name: 'Platformer' }],   rating: 4.6,  released: '2018-01-25' },
];

// ---- Animation helper --------------------------------------------------
// All motion lives here instead of in CSS transitions/keyframes.
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function fx(el, keyframes, options = {}) {
  if (!el || prefersReducedMotion) return { finished: Promise.resolve() };
  return el.animate(keyframes, { duration: 180, easing: 'ease', fill: 'forwards', ...options });
}

const CARD_REST  = { transform: 'translateY(0)',    boxShadow: '0 0 0 rgba(0,0,0,0)',    borderColor: '#232329' };
const CARD_HOVER = { transform: 'translateY(-3px)', boxShadow: '0 12px 28px rgba(0,0,0,.45)', borderColor: '#2c8f5c' };

// ---- DOM refs ----------------------------------------------------------
const gameGrid   = document.querySelector('.game-grid');
const overlay    = document.getElementById('logModal');
const modalTitle = document.getElementById('modalGameTitle');
const modalYear  = document.querySelector('.modal-year');
const modalCover = document.querySelector('.modal-cover');
const reviewText     = document.getElementById('reviewText');
const playedBeforeCheck = document.getElementById('playedBeforeCheck');
const completedCheck = document.getElementById('completedCheck');
const modalSaveBtn   = document.getElementById('modalSave');
let currentGame = { title: '', year: '', cover: '', id: '' };
const starPicker  = document.getElementById('starPicker');
const starFill    = document.getElementById('starFill');
const starHitlayer = document.getElementById('starHitlayer');
const starValue   = document.getElementById('starValue');
let currentRating = 0;

const homeHero  = document.getElementById('homeHero');
const homeMain  = document.getElementById('homeMain');
const diaryMain = document.getElementById('diaryMain');
const diaryGrid = document.getElementById('diaryGrid');
const navHome   = document.getElementById('navHome');
const navDiary  = document.getElementById('navDiary');

// Build 20 half-star hit zones (0.5 through 10 in 0.5 steps) once.
for (let i = 1; i <= 20; i++) {
  const value = i * 0.5;
  const hit = document.createElement('button');
  hit.type = 'button';
  hit.className = 'star-hit';
  hit.dataset.value = value;
  hit.setAttribute('aria-label', `Rate ${value} out of 10`);
  starHitlayer.appendChild(hit);
}
const starHits = starHitlayer.querySelectorAll('.star-hit');

function setStarDisplay(value) {
  starFill.style.setProperty('--pct', (value / 10) * 100 + '%');
}

function commitRating(value) {
  currentRating = value;
  setStarDisplay(value);
  starValue.textContent = `${value} / 10`;
  starHitlayer.setAttribute('aria-valuenow', value);
}

starHits.forEach(hit => {
  const val = Number(hit.dataset.value);
  hit.addEventListener('mouseenter', () => setStarDisplay(val));
  hit.addEventListener('click', () => commitRating(val));
});
starPicker.addEventListener('mouseleave', () => setStarDisplay(currentRating));


// =========================================================
// Modal open / close + rating-picker sync
// (ported as-is from the original inline <script>, plus a
// reset step so a new card doesn't inherit the last pick)
// =========================================================
function openModal({ title = 'Untitled', year = '', cover = '', id = '' } = {}) {
  currentGame = { title, year, cover, id };
  modalTitle.textContent = title;
  if (modalYear) modalYear.textContent = year;
  if (modalCover) modalCover.style.background = cover || COVER_FALLBACKS[0];

  resetStarPicker();
  reviewText.value = '';
  playedBeforeCheck.checked = false;
  completedCheck.checked = true;

  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
  const modalEl = overlay.querySelector('.modal');
  fx(overlay, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
  fx(modalEl, [
    { opacity: 0, transform: 'translateY(8px)' },
    { opacity: 1, transform: 'translateY(0)' },
  ], { duration: 180 });
}

async function closeModal() {
  const modalEl = overlay.querySelector('.modal');
  const anims = [
    fx(overlay, [{ opacity: 1 }, { opacity: 0 }], { duration: 140 }),
    fx(modalEl, [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(8px)' },
    ], { duration: 140 }),
  ];
  await Promise.all(anims.map(a => a.finished));
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
}

function resetStarPicker() {
  currentRating = 0;
  setStarDisplay(0);
  starValue.textContent = '— / 10';
  starHitlayer.setAttribute('aria-valuenow', 0);
}

function getEntries() {
  try {
    return JSON.parse(localStorage.getItem('gameDiaryEntries')) || [];
  } catch {
    return [];
  }
}

function persistEntries(entries) {
  localStorage.setItem('gameDiaryEntries', JSON.stringify(entries));
}

function saveEntry() {
  const entry = {
    id: currentGame.id,
    game: currentGame.title,
    year: currentGame.year,
    cover: currentGame.cover,
    rating: currentRating,
    review: reviewText.value.trim(),
    playedBefore: playedBeforeCheck.checked,
    completed: completedCheck.checked,
    loggedAt: new Date().toISOString(),
  };

  // One entry per game — logging the same game again overwrites its entry.
  const entries = getEntries();
  const idx = entries.findIndex(e => e.id === entry.id);
  if (idx > -1) entries[idx] = entry; else entries.push(entry);
  persistEntries(entries);

  if (!diaryMain.hidden) renderDiary();

  // Quick visual confirmation on the button itself.
  const original = modalSaveBtn.textContent;
  modalSaveBtn.textContent = 'Saved ✓';
  modalSaveBtn.disabled = true;
  setTimeout(() => {
    modalSaveBtn.textContent = original;
    modalSaveBtn.disabled = false;
    closeModal();
  }, 500);
}

modalSaveBtn.addEventListener('click', saveEntry);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCancel').addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// =========================================================
// Rendering
// =========================================================

// RAWG's `rating` field is on a 0–5 scale; the UI is built for 0–10,
// so it's doubled here and everywhere else a "/10" value is shown.
function toTenScale(rawgRating) {
  const n = Number(rawgRating);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 2 * 10) / 10 : null;
}

function getYear(releasedDate) {
  if (!releasedDate) return 'Unknown';
  const year = new Date(releasedDate).getFullYear();
  return Number.isFinite(year) ? year : 'Unknown';
}

function getGenre(genres) {
  return (Array.isArray(genres) && genres.length && genres[0].name) ? genres[0].name : 'Unclassified';
}

function buildCard(game, index) {
  const title    = game.name || 'Untitled';
  const year     = getYear(game.released);
  const genre    = getGenre(game.genres);
  const rating10 = toTenScale(game.rating);
  const pct      = rating10 !== null ? `${rating10 * 10}%` : '0%';
  const badge    = rating10 !== null ? rating10.toFixed(1) : 'N/A';

  const coverStyle = game.background_image
    ? `background-image:url('${game.background_image}'); background-size:cover; background-position:center;`
    : `background:${COVER_FALLBACKS[index % COVER_FALLBACKS.length]};`;

  const glyph = title.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const card = document.createElement('article');
  card.className = 'game-card';
  card.innerHTML = `
    <div class="card-cover" style="${coverStyle}">
      ${game.background_image ? '' : `<span class="cover-glyph">${glyph}</span>`}
      <span class="rating-badge">${badge}</span>
      <div class="card-hover">
        <button class="btn btn-log" data-open-modal>+ Log</button>
      </div>
    </div>
    <div class="card-body">
      <h3 class="game-title" title="${title}">${title}</h3>
      <p class="game-year">${year} · ${genre}</p>
      <div class="star-rating" role="img" aria-label="${badge} out of 10 stars">
        <span class="stars-fill" style="--pct:${pct}"></span>
      </div>
    </div>
  `;

  // Stash the data the modal needs on the button itself.
  const logBtn = card.querySelector('[data-open-modal]');
  logBtn.dataset.id = game.id;
  logBtn.dataset.game = title;
  logBtn.dataset.year = year;
  logBtn.dataset.cover = game.background_image
    ? `url('${game.background_image}')`
    : COVER_FALLBACKS[index % COVER_FALLBACKS.length];

  // Hover lift + log-overlay fade (replaces the old CSS :hover transitions).
  const overlayEl = card.querySelector('.card-hover');
  card.addEventListener('mouseenter', () => {
    fx(card, [CARD_REST, CARD_HOVER], { duration: 180 });
    fx(overlayEl, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
  });
  card.addEventListener('mouseleave', () => {
    fx(card, [CARD_HOVER, CARD_REST], { duration: 160 });
    fx(overlayEl, [{ opacity: 1 }, { opacity: 0 }], { duration: 140 });
  });

  return card;
}

function renderGames(gameList) {
  const games = Array.isArray(gameList) && gameList.length ? gameList : FALLBACK_GAMES;

  gameGrid.innerHTML = '';
  const fragment = document.createDocumentFragment();

  games.forEach((game, index) => {
    fragment.appendChild(buildCard(game, index));
  });

  gameGrid.appendChild(fragment);
  attachLogButtonListeners();
}

// Dynamically wire every rendered card's "+ Log" button to the modal.
function attachLogButtonListeners() {
  gameGrid.querySelectorAll('[data-open-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      openModal({
        title: btn.dataset.game,
        year: btn.dataset.year,
        cover: btn.dataset.cover,
        id: btn.dataset.id,
      });
    });
  });
}

// =========================================================
// My Diary — reads logged entries back out of localStorage
// =========================================================
function buildDiaryCard(entry) {
  const rating   = Number(entry.rating) || 0;
  const pct      = `${rating * 10}%`;
  const badge    = rating ? rating.toFixed(1) : 'N/A';
  const cover    = entry.cover || COVER_FALLBACKS[0];
  const isImage  = cover.startsWith('url(');
  const glyph    = entry.game.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const loggedOn = entry.loggedAt ? new Date(entry.loggedAt).toLocaleDateString() : '';

  const card = document.createElement('article');
  card.className = 'game-card';
  card.innerHTML = `
    <div class="card-cover" style="background:${cover};background-size:cover;background-position:center;">
      ${isImage ? '' : `<span class="cover-glyph">${glyph}</span>`}
      <span class="rating-badge">${badge}</span>
    </div>
    <div class="card-body">
      <h3 class="game-title" title="${entry.game}">${entry.game}</h3>
      <p class="game-year">${entry.year} · logged ${loggedOn}</p>
      <div class="star-rating" role="img" aria-label="${badge} out of 10">
        <span class="stars-fill" style="--pct:${pct}"></span>
      </div>
    </div>
  `;
  return card;
}

function renderDiary() {
  const entries = getEntries();
  diaryGrid.innerHTML = '';

  if (!entries.length) {
    diaryGrid.innerHTML = `<p class="empty-state">Nothing logged yet — hit “+ Log” on a game from Home.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  entries.slice().reverse().forEach(entry => fragment.appendChild(buildDiaryCard(entry)));
  diaryGrid.appendChild(fragment);
}

// ---- Home / My Diary view switching -------------------------------------
function showView(view) {
  const isDiary = view === 'diary';
  homeHero.hidden = isDiary;
  homeMain.hidden = isDiary;
  diaryMain.hidden = !isDiary;
  navHome.classList.toggle('is-active', !isDiary);
  navDiary.classList.toggle('is-active', isDiary);
  if (isDiary) renderDiary();
}

navHome.addEventListener('click', (e) => { e.preventDefault(); showView('home'); });
navDiary.addEventListener('click', (e) => { e.preventDefault(); showView('diary'); });

// =========================================================
// RAWG fetch
// =========================================================
async function fetchGames(query = '') {
  try {
    const params = new URLSearchParams({ key: API_KEY, page_size: '6' });

    if (query) {
      params.set('search', query);
    } else {
      // No real diary data yet (favorites / rated games), so this is a
      // stand-in: randomize the page of well-rated games each load.
      params.set('ordering', '-rating');
      params.set('page', String(Math.floor(Math.random() * 5) + 1));
    }

    const url = `${API_BASE}?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) throw new Error(`RAWG request failed: ${res.status}`);

    const data = await res.json();
    const games = data.results && data.results.length ? data.results : FALLBACK_GAMES;
    renderGames(games);
  } catch (err) {
    console.warn('RAWG fetch failed, showing sample data instead:', err.message);
    renderGames(FALLBACK_GAMES);
  }
}

// ---- Wire up the search bars to fetchGames() ----------------------------
document.querySelector('.hero-search')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const query = e.target.querySelector('input').value.trim();
  fetchGames(query);
});

// ---- Button press bounce (delegated — covers static + rendered buttons) --
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  fx(btn, [{ transform: 'scale(1)' }, { transform: 'scale(0.94)' }, { transform: 'scale(1)' }], { duration: 180 });
});

// ---- Init ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  fetchGames(); // falls back to FALLBACK_GAMES automatically if offline / no key
});
