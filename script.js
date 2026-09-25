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
let currentGame = { title: '', year: '', cover: '', id: '', genres: [] };
const starPicker  = document.getElementById('starPicker');
const starFill    = document.getElementById('starFill');
const starHitlayer = document.getElementById('starHitlayer');
const starValue   = document.getElementById('starValue');
let currentRating = 0;

const homeHero  = document.getElementById('homeHero');
const homeMain  = document.getElementById('homeMain');
const diaryMain = document.getElementById('diaryMain');
const diaryGrid = document.getElementById('diaryGrid');
const diarySort = document.getElementById('diarySort');
const diarySearch = document.getElementById('diarySearch');
const diaryStatus = document.getElementById('diaryStatus');
const diaryGenre = document.getElementById('diaryGenre');
const diaryFavoritesOnly = document.getElementById('diaryFavoritesOnly');
const diarySummary = document.getElementById('diarySummary');
const wishlistMain = document.getElementById('wishlistMain');
const wishlistGrid = document.getElementById('wishlistGrid');
const wishlistCount = document.getElementById('wishlistCount');
const wishlistSearch = document.getElementById('wishlistSearch');
const wishlistSort = document.getElementById('wishlistSort');
const navHome   = document.getElementById('navHome');
const navDiary  = document.getElementById('navDiary');
const navWishlist = document.getElementById('navWishlist');
const statusSelect = document.getElementById('statusSelect');
const favoriteCheck = document.getElementById('favoriteCheck');
let editingEntryId = null;

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
function openModal({ title = 'Untitled', year = '', cover = '', id = '', genres = [] } = {}, existing = null, fromWishlist = false) {
  currentGame = { title, year, cover, id, genres, fromWishlist };
  editingEntryId = existing?.id || null;

  modalTitle.textContent = title;
  document.querySelector('.modal-kicker').textContent = existing ? 'Editing entry' : 'Logging';
  if (modalYear) modalYear.textContent = year;
  if (modalCover) modalCover.style.background = cover || COVER_FALLBACKS[0];

  resetStarPicker();
  reviewText.value = existing?.review || '';
  playedBeforeCheck.checked = Boolean(existing?.playedBefore);
  favoriteCheck.checked = Boolean(existing?.favorite);

  const legacyStatus = existing?.status || (existing?.completed ? 'completed' : 'backlog');
  statusSelect.value = ['backlog', 'playing', 'completed', 'dropped'].includes(legacyStatus)
    ? legacyStatus
    : 'backlog';

  modalSaveBtn.textContent = existing ? 'Save changes' : 'Save entry';

  if (existing && Number(existing.rating) > 0) {
    commitRating(Number(existing.rating));
  }

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
  editingEntryId = null;
}

function resetStarPicker() {
  currentRating = 0;
  setStarDisplay(0);
  starValue.textContent = '— / 10';
  starHitlayer.setAttribute('aria-valuenow', 0);
}

function getEntries() {
  try {
    const raw = JSON.parse(localStorage.getItem('gameDiaryEntries')) || [];
    return Array.isArray(raw) ? raw.map(normalizeEntry) : [];
  } catch {
    return [];
  }
}

function normalizeEntry(entry) {
  return {
    ...entry,
    id: entry.id || (entry.game || 'game') + '-' + (entry.year || ''),
    genres: getGenreNames(entry.genres?.length ? entry.genres : (entry.genre ? [entry.genre] : [])),
    rating: Number(entry.rating) || 0,
    review: entry.review || '',
    status: entry.status || (entry.completed ? 'completed' : 'backlog'),
    favorite: Boolean(entry.favorite),
    playedBefore: Boolean(entry.playedBefore),
    loggedAt: entry.loggedAt || new Date(0).toISOString(),
  };
}

function persistEntries(entries) {
  localStorage.setItem('gameDiaryEntries', JSON.stringify(entries));
}

function saveEntry() {
  const entries = getEntries();
  const previous = editingEntryId
    ? entries.find(entry => entry.id === editingEntryId)
    : entries.find(entry => entry.id === currentGame.id);

  const entry = {
    id: currentGame.id,
    game: currentGame.title,
    year: currentGame.year,
    cover: currentGame.cover,
    // Keep saved genres when the current API result has none.
    genres: getGenreNames(currentGame.genres?.length ? currentGame.genres : (previous?.genres || [])),
    rating: currentRating,
    review: reviewText.value.trim(),
    playedBefore: playedBeforeCheck.checked,
    status: statusSelect.value,
    completed: statusSelect.value === 'completed',
    favorite: favoriteCheck.checked,
    loggedAt: previous?.loggedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const idx = editingEntryId
    ? entries.findIndex(e => e.id === editingEntryId)
    : entries.findIndex(e => e.id === entry.id);

  if (idx > -1) entries[idx] = entry;
  else entries.push(entry);

  persistEntries(entries);
  updateHomeStats();
  if (!diaryMain.hidden) renderDiary();

  // Logging a wishlisted game moves it into the diary and out of the wishlist.
  if (currentGame.fromWishlist) {
    persistWishlist(getWishlist().filter(item => String(item.id) !== String(currentGame.id)));
    renderWishlist();
    document.querySelectorAll('[data-wishlist]').forEach(syncWishlistButton);
  }

  const original = modalSaveBtn.textContent;
  modalSaveBtn.textContent = 'Saved ✓';
  modalSaveBtn.disabled = true;

  setTimeout(() => {
    modalSaveBtn.textContent = original;
    modalSaveBtn.disabled = false;
    closeModal();
  }, 450);
}

function editEntry(id) {
  const entry = getEntries().find(item => item.id === id);
  if (!entry) return;

  openModal({
    title: entry.game,
    year: entry.year,
    cover: entry.cover,
    id: entry.id,
    genres: entry.genres,
  }, entry);
}

function deleteEntry(id) {
  const entries = getEntries();
  const entry = entries.find(item => item.id === id);
  if (!entry) return;

  if (!confirm('Delete “' + entry.game + '” from your diary?')) return;

  persistEntries(entries.filter(item => item.id !== id));
  updateHomeStats();
  renderDiary();
}

function toggleFavorite(id) {
  const entries = getEntries();
  const entry = entries.find(item => item.id === id);
  if (!entry) return;

  entry.favorite = !entry.favorite;
  entry.updatedAt = new Date().toISOString();
  persistEntries(entries);
  updateHomeStats();
  renderDiary();
}

modalSaveBtn.addEventListener('click', saveEntry);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCancel').addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// =========================================================
// Repair missing genres in older diary entries
// =========================================================
async function hydrateMissingGenres() {
  const entries = getEntries();
  const missing = entries.filter(entry => !getGenreNames(entry.genres) .length && entry.id);
  if (!missing.length) return;

  let changed = false;
  for (const entry of missing) {
    try {
      const numericId = /^\\d+$/.test(String(entry.id));
      const endpoint = numericId ? API_BASE + '/' + encodeURIComponent(entry.id) : API_BASE;
      const params = new URLSearchParams({ key: API_KEY });
      if (!numericId) {
        params.set('search', entry.game || '');
        params.set('page_size', '1');
      }
      const res = await fetch(endpoint + '?' + params.toString());
      if (!res.ok) continue;
      const data = await res.json();
      const genres = numericId
        ? getGenreNames(data.genres)
        : getGenreNames(data.results?.[0]?.genres);
      if (genres.length) {
        entry.genres = genres;
        changed = true;
      }
    } catch {}
  }

  if (changed) {
    persistEntries(entries);
    updateHomeStats();
    if (!diaryMain.hidden) renderDiary();
  }
}

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

function getGenreNames(genres) {
  if (!Array.isArray(genres)) return [];

  return genres
    .map(genre => {
      if (typeof genre === 'string') return genre.trim();
      if (genre && typeof genre === 'object') return String(genre.name || '').trim();
      return '';
    })
    .filter(Boolean);
}

// Shared cover handling: supports RAWG URLs and legacy CSS url('...') values.
function getCoverUrl(cover) {
  if (typeof cover !== 'string') return '';
  const value = cover.trim();
  const match = value.match(/^url\([\"']?(.*?)[\"']?\)$/i);
  const url = match ? match[1] : value;
  try {
    const parsed = new URL(url, window.location.href);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : '';
  } catch { return ''; }
}

function applyCoverImage(container, cover, glyph = '🎮') {
  if (!container) return;
  const url = getCoverUrl(cover);
  container.style.background = COVER_FALLBACKS[0];
  container.querySelector('.cover-glyph')?.remove();
  container.querySelector('.cover-art')?.remove();
  if (!url) {
    const fallback = document.createElement('span');
    fallback.className = 'cover-glyph'; fallback.textContent = glyph;
    container.prepend(fallback); return;
  }
  const image = document.createElement('img');
  image.className = 'cover-art'; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
  image.src = url;
  image.addEventListener('error', () => {
    image.remove();
    if (!container.querySelector('.cover-glyph')) {
      const fallback = document.createElement('span');
      fallback.className = 'cover-glyph'; fallback.textContent = glyph;
      container.prepend(fallback);
    }
  }, { once: true });
  container.prepend(image);
}

function getGenre(genres) {
  return getGenreNames(genres).join(' · ') || 'Unclassified';
}

function buildCard(game, index) {
  const title    = game.name || 'Untitled';
  const year     = getYear(game.released);
  const genre    = getGenre(game.genres);
  const rating10 = toTenScale(game.rating);
  const pct      = rating10 !== null ? `${rating10 * 10}%` : '0%';
  const badge    = rating10 !== null ? rating10.toFixed(1) : 'N/A';

  const coverStyle = `background:${COVER_FALLBACKS[index % COVER_FALLBACKS.length]};`;

  const glyph = title.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const card = document.createElement('article');
  card.className = 'game-card';
  card.innerHTML = `
    <div class="card-cover" style="${coverStyle}">
      
      <span class="rating-badge">${badge}</span>
      <div class="card-hover card-hover-actions">
        <button class="btn btn-log" data-open-modal>+ Log</button>
        <button class="btn btn-wishlist" data-wishlist>+ Wishlist</button>
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

  applyCoverImage(card.querySelector('.card-cover'), game.background_image, glyph);

  // Stash the data the modal needs on the button itself.
  const logBtn = card.querySelector('[data-open-modal]');
  const wishlistBtn = card.querySelector('[data-wishlist]');
  logBtn.dataset.id = game.id;
  logBtn.dataset.game = title;
  logBtn.dataset.year = year;
  logBtn.dataset.cover = game.background_image
    ? `url('${game.background_image}')`
    : COVER_FALLBACKS[index % COVER_FALLBACKS.length];
  logBtn.dataset.genres = JSON.stringify(
    getGenreNames(game.genres)
  );

  wishlistBtn.dataset.id = game.id;
  wishlistBtn.dataset.game = title;
  wishlistBtn.dataset.year = year;
  wishlistBtn.dataset.cover = game.background_image
    ? "url('" + game.background_image + "')"
    : COVER_FALLBACKS[index % COVER_FALLBACKS.length];
  wishlistBtn.dataset.genres = logBtn.dataset.genres;
  syncWishlistButton(wishlistBtn);

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
    btn.addEventListener('click', () => openModal({
      title: btn.dataset.game,
      year: btn.dataset.year,
      cover: btn.dataset.cover,
      id: btn.dataset.id,
      genres: JSON.parse(btn.dataset.genres || '[]'),
    }));
  });

  gameGrid.querySelectorAll('[data-wishlist]').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleWishlist({
        id: btn.dataset.id,
        game: btn.dataset.game,
        year: btn.dataset.year,
        cover: btn.dataset.cover,
        genres: JSON.parse(btn.dataset.genres || '[]'),
      });
      syncWishlistButton(btn);
    });
  });
}

// =========================================================
// Home stats — calculated from the user's diary
// =========================================================
function updateHomeStats() {
  const entries = getEntries();

  const countEl = document.getElementById('statGamesLogged');
  const avgEl = document.getElementById('statAverageRating');
  const genreEl = document.getElementById('statTopGenre');
  const shelfEl = document.getElementById('topRatedShelf');
  const emptyEl = document.getElementById('statsEmpty');

  const count = entries.length;
  if (countEl) countEl.textContent = count;
  if (avgEl) {
    const rated = entries.filter(e => Number(e.rating) > 0);
    const average = rated.length
      ? rated.reduce((sum, e) => sum + Number(e.rating), 0) / rated.length
      : null;
    avgEl.textContent = average === null ? 'N/A' : average.toFixed(1);
  }

  const genreCounts = {};
  entries.forEach(entry => {
    (Array.isArray(entry.genres) ? entry.genres : []).forEach(genre => {
      if (!genre) return;
      genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    });
  });

  const topGenre = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
  if (genreEl) genreEl.textContent = topGenre;

  if (shelfEl) {
    shelfEl.innerHTML = '';
    const topRated = entries
      .filter(e => Number(e.rating) > 0)
      .sort((a, b) => Number(b.rating) - Number(a.rating))
      .slice(0, 5);

    if (!topRated.length) {
      shelfEl.innerHTML = '<p class="empty-state">Log and rate some games to build your favorites.</p>';
    } else {
      const fragment = document.createDocumentFragment();
      topRated.forEach(entry => fragment.appendChild(buildTopRatedCard(entry)));
      shelfEl.appendChild(fragment);
    }
  }

  if (emptyEl) emptyEl.hidden = count > 0;
}

function buildTopRatedCard(entry) {
  const rating = Number(entry.rating) || 0;
  const cover = entry.cover || COVER_FALLBACKS[0];
  const isImage = cover.startsWith('url(');
  const glyph = (entry.game || 'Game').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const card = document.createElement('article');
  card.className = 'top-rated-card';
  card.innerHTML = `
    <div class="top-rated-cover" style="background:${cover};background-size:cover;background-position:center;">
      ${isImage ? '' : `<span class="cover-glyph">${glyph}</span>`}
      <span class="rating-badge">${rating.toFixed(1)}</span>
    </div>
    <div class="top-rated-body">
      <h3 class="game-title" title="${entry.game}">${entry.game}</h3>
      <span class="top-rated-score">${rating.toFixed(1)} / 10</span>
    </div>
  `;
  applyCoverImage(card.querySelector('.top-rated-cover'), cover, glyph);
  return card;
}

// =========================================================
// My Diary — reads logged entries back out of localStorage
// =========================================================
function getWishlist() {
  try {
    const raw = JSON.parse(localStorage.getItem('gameDiaryWishlist')) || [];
    if (!Array.isArray(raw)) return [];

    // Older versions could store duplicates; normalize them by game ID.
    const seen = new Set();
    return raw.filter(item => {
      if (!item || item.id == null || String(item.id).trim() === '') return false;
      const id = String(item.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  } catch {
    return [];
  }
}

function persistWishlist(items) {
  const seen = new Set();
  const unique = (Array.isArray(items) ? items : []).filter(item => {
    if (!item || item.id == null || String(item.id).trim() === '') return false;
    const id = String(item.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  localStorage.setItem('gameDiaryWishlist', JSON.stringify(unique));
}

function toggleWishlist(game) {
  const items = getWishlist();
  const id = String(game.id);
  const exists = items.some(item => String(item.id) === id);
  persistWishlist(exists ? items.filter(item => String(item.id) !== id) : [...items, game]);
  renderWishlist();
  document.querySelectorAll('[data-wishlist]').forEach(syncWishlistButton);
}

function syncWishlistButton(button) {
  if (!button) return;
  const exists = getWishlist().some(item => item.id === button.dataset.id);
  button.textContent = exists ? '✓ Wishlisted' : '+ Wishlist';
  button.classList.toggle('is-wishlisted', exists);
}

function removeFromWishlist(id) {
  persistWishlist(getWishlist().filter(item => String(item.id) !== String(id)));
  renderWishlist();
  document.querySelectorAll('[data-wishlist]').forEach(btn => syncWishlistButton(btn));
}

function buildDiaryCard(entry) {
  const rating = Number(entry.rating) || 0;
  const pct = (rating * 10) + '%';
  const badge = rating ? rating.toFixed(1) : 'N/A';
  const cover = entry.cover || COVER_FALLBACKS[0];
  const isImage = cover.startsWith('url(');
  const glyph = (entry.game || 'Game').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const status = entry.status || (entry.completed ? 'completed' : 'backlog');
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const review = entry.review || 'No review yet.';

  const card = document.createElement('article');
  card.className = 'game-card diary-card';
  card.innerHTML = `
    <div class="card-cover" style="background:${cover};background-size:cover;background-position:center;">
      ${isImage ? '' : '<span class="cover-glyph">' + glyph + '</span>'}
      <span class="rating-badge">${badge}</span>
      <span class="diary-status status-${status}">${statusLabel}</span>
      ${entry.favorite ? '<span class="favorite-badge">♥</span>' : ''}
    </div>
    <div class="card-body">
      <h3 class="game-title" title="${entry.game}">${entry.game}</h3>
      <p class="game-year">${entry.year} · ${statusLabel}</p>
      <div class="star-rating" role="img" aria-label="${badge} out of 10">
        <span class="stars-fill" style="--pct:${pct}"></span>
      </div>
      <p class="diary-review" title="${review}">${review}</p>
      <div class="diary-actions">
        <button class="diary-action" data-action="edit" type="button">Edit</button>
        <button class="diary-action" data-action="favorite" type="button" aria-label="${entry.favorite ? 'Remove from favorites' : 'Add to favorites'}">${entry.favorite ? '♥' : '♡'}</button>
        <button class="diary-action diary-action-danger" data-action="delete" type="button">Delete</button>
      </div>
    </div>
  `;

  applyCoverImage(card.querySelector('.card-cover'), cover, glyph);

  card.querySelector('[data-action="edit"]').addEventListener('click', () => editEntry(entry.id));
  card.querySelector('[data-action="favorite"]').addEventListener('click', () => toggleFavorite(entry.id));
  card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteEntry(entry.id));

  return card;
}

function renderDiary() {
  const entries = getEntries();
  diaryGrid.innerHTML = '';
  populateGenreFilter(entries);
  updateDiarySummary(entries);

  if (!entries.length) {
    diaryGrid.innerHTML = '<p class="empty-state">Nothing logged yet — search for a game and hit “+ Log”.</p>';
    return;
  }

  const query = (diarySearch?.value || '').trim().toLowerCase();
  const status = diaryStatus?.value || 'all';
  const genre = diaryGenre?.value || 'all';
  const favoritesOnly = diaryFavoritesOnly?.getAttribute('aria-pressed') === 'true';

  const filtered = entries.filter(entry => {
    const haystack = ((entry.game || '') + ' ' + (entry.review || '')).toLowerCase();
    const matchesSearch = !query || haystack.includes(query);
    const matchesStatus = status === 'all' || (entry.status || 'backlog') === status;
    const matchesGenre = genre === 'all' || getGenreNames(entry.genres).includes(genre);
    const matchesFavorite = !favoritesOnly || entry.favorite;
    return matchesSearch && matchesStatus && matchesGenre && matchesFavorite;
  });

  const sort = diarySort?.value || 'recent';
  filtered.sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return new Date(a.loggedAt) - new Date(b.loggedAt);
      case 'rating-high':
        return Number(b.rating || 0) - Number(a.rating || 0);
      case 'rating-low':
        return Number(a.rating || 0) - Number(b.rating || 0);
      case 'name-a-z':
        return (a.game || '').localeCompare(b.game || '');
      case 'name-z-a':
        return (b.game || '').localeCompare(a.game || '');
      default:
        return new Date(b.loggedAt) - new Date(a.loggedAt);
    }
  });

  if (!filtered.length) {
    diaryGrid.innerHTML = '<p class="empty-state">No diary entries match these filters.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach(entry => fragment.appendChild(buildDiaryCard(entry)));
  diaryGrid.appendChild(fragment);
}

function populateGenreFilter(entries) {
  if (!diaryGenre) return;

  const current = diaryGenre.value || 'all';
  const genres = [...new Set(entries.flatMap(entry => getGenreNames(entry.genres)))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  diaryGenre.innerHTML = '<option value="all">All genres</option>';

  genres.forEach(genre => {
    const option = document.createElement('option');
    option.value = genre;
    option.textContent = genre;
    diaryGenre.appendChild(option);
  });

  diaryGenre.value = genres.includes(current) ? current : 'all';
}

function updateDiarySummary(entries) {
  if (!diarySummary) return;

  const counts = {
    all: entries.length,
    completed: entries.filter(e => e.status === 'completed').length,
    playing: entries.filter(e => e.status === 'playing').length,
    backlog: entries.filter(e => e.status === 'backlog').length,
    dropped: entries.filter(e => e.status === 'dropped').length,
    favorites: entries.filter(e => e.favorite).length,
  };

  diarySummary.innerHTML =
    '<span>' + counts.all + ' total</span>' +
    '<span>' + counts.completed + ' completed</span>' +
    '<span>' + counts.playing + ' playing</span>' +
    '<span>' + counts.backlog + ' backlog</span>' +
    '<span>' + counts.dropped + ' dropped</span>' +
    '<span>' + counts.favorites + ' favorites</span>';
}

function buildWishlistCard(item) {
  const cover = item.cover || COVER_FALLBACKS[0];
  const isImage = cover.startsWith('url(');
  const glyph = (item.game || 'Game').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const card = document.createElement('article');
  card.className = 'game-card diary-card';
  card.innerHTML = `
    <div class="card-cover" style="background:${cover};background-size:cover;background-position:center;">
      ${isImage ? '' : '<span class="cover-glyph">' + glyph + '</span>'}
      <span class="wishlist-badge">WISHLIST</span>
    </div>
    <div class="card-body">
      <h3 class="game-title" title="${item.game}">${item.game}</h3>
      <p class="game-year">${item.year}</p>
      <div class="diary-actions">
        <button class="diary-action wishlist-log" type="button">+ Log</button>
        <button class="diary-action diary-action-danger wishlist-remove" type="button">Remove</button>
      </div>
    </div>
  `;

  applyCoverImage(card.querySelector('.card-cover'), cover, glyph);

  card.querySelector('.wishlist-log').addEventListener('click', () => {
    openModal(item, null, true);
  });

  card.querySelector('.wishlist-remove').addEventListener('click', () => {
    removeFromWishlist(item.id);
  });

  return card;
}

function renderWishlist() {
  if (!wishlistGrid) return;

  const allItems = getWishlist();
  const query = (wishlistSearch?.value || '').trim().toLocaleLowerCase();
  const sort = wishlistSort?.value || 'added';
  let items = allItems.filter(item => {
    const name = String(item.game || '').toLocaleLowerCase();
    const year = String(item.year || '').toLocaleLowerCase();
    return !query || name.includes(query) || year.includes(query);
  });

  if (sort === 'name-a-z') {
    items.sort((a, b) => String(a.game || '').localeCompare(String(b.game || '')));
  } else if (sort === 'name-z-a') {
    items.sort((a, b) => String(b.game || '').localeCompare(String(a.game || '')));
  } else if (sort === 'year-newest') {
    items.sort((a, b) => {
      const ay = Number.parseInt(a.year, 10) || 0;
      const by = Number.parseInt(b.year, 10) || 0;
      return by - ay || String(a.game || '').localeCompare(String(b.game || ''));
    });
  } else if (sort === 'year-oldest') {
    items.sort((a, b) => {
      const ay = Number.parseInt(a.year, 10) || 0;
      const by = Number.parseInt(b.year, 10) || 0;
      return ay - by || String(a.game || '').localeCompare(String(b.game || ''));
    });
  }

  wishlistGrid.innerHTML = '';
  if (wishlistCount) {
    wishlistCount.textContent = query
      ? `${items.length} of ${allItems.length} games`
      : `${allItems.length} ${allItems.length === 1 ? 'game' : 'games'}`;
  }

  if (!allItems.length) {
    wishlistGrid.innerHTML = '<p class="empty-state">Your wishlist is empty — add games from Home.</p>';
    return;
  }
  if (!items.length) {
    wishlistGrid.innerHTML = '<p class="empty-state">No wishlist games match your search.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach(item => fragment.appendChild(buildWishlistCard(item)));
  wishlistGrid.appendChild(fragment);
}

function showView(view) {
  const isDiary = view === 'diary';
  const isWishlist = view === 'wishlist';

  homeHero.hidden = isDiary || isWishlist;
  homeMain.hidden = isDiary || isWishlist;
  diaryMain.hidden = !isDiary;
  wishlistMain.hidden = !isWishlist;

  navHome.classList.toggle('is-active', !isDiary && !isWishlist);
  navDiary.classList.toggle('is-active', isDiary);
  navWishlist.classList.toggle('is-active', isWishlist);

  if (isDiary) renderDiary();
  if (isWishlist) renderWishlist();
}

wishlistSearch?.addEventListener('input', renderWishlist);
wishlistSort?.addEventListener('change', renderWishlist);

diarySort?.addEventListener('change', renderDiary);
diarySearch?.addEventListener('input', renderDiary);
diaryStatus?.addEventListener('change', renderDiary);
diaryGenre?.addEventListener('change', renderDiary);
diaryFavoritesOnly?.addEventListener('click', () => {
  const active = diaryFavoritesOnly.getAttribute('aria-pressed') === 'true';
  diaryFavoritesOnly.setAttribute('aria-pressed', String(!active));
  diaryFavoritesOnly.classList.toggle('is-active', !active);
  renderDiary();
});

navHome.addEventListener('click', (e) => { e.preventDefault(); showView('home'); });
navDiary.addEventListener('click', (e) => { e.preventDefault(); showView('diary'); });
navWishlist.addEventListener('click', (e) => { e.preventDefault(); showView('wishlist'); });

// ---- Home / My Diary / Wishlist view switching -------------------------
function showView(view) {
  const isDiary = view === 'diary';
  const isWishlist = view === 'wishlist';

  homeHero.hidden = isDiary || isWishlist;
  homeMain.hidden = isDiary || isWishlist;
  diaryMain.hidden = !isDiary;
  wishlistMain.hidden = !isWishlist;

  navHome.classList.toggle('is-active', !isDiary && !isWishlist);
  navDiary.classList.toggle('is-active', isDiary);
  navWishlist.classList.toggle('is-active', isWishlist);

  if (isDiary) renderDiary();
  if (isWishlist) renderWishlist();
}

navHome.addEventListener('click', (e) => { e.preventDefault(); showView('home'); });
navDiary.addEventListener('click', (e) => { e.preventDefault(); showView('diary'); });
navWishlist.addEventListener('click', (e) => { e.preventDefault(); showView('wishlist'); });

// =========================================================
// RAWG fetch
// =========================================================
async function fetchGames(query = '') {
  try {
    const params = new URLSearchParams({ key: API_KEY, page_size: '10' });

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


// =========================================================
// Search autocomplete / suggestions
// =========================================================
let suggestionTimer;
let suggestionRequest = 0;

function getSuggestionBox(input) {
  const wrapper = input?.closest('.header-search, .hero-search');
  if (!wrapper) return null;

  wrapper.classList.add('search-wrapper');

  let box = wrapper.querySelector('.search-suggestions');
  if (!box) {
    box = document.createElement('div');
    box.className = 'search-suggestions';
    wrapper.appendChild(box);
  }

  return box;
}

function hideSuggestions(input) {
  const box = input?.closest('.search-wrapper')?.querySelector('.search-suggestions');
  if (!box) return;
  box.innerHTML = '';
  box.hidden = true;
}

function showSuggestions(input, games) {
  const box = getSuggestionBox(input);
  if (!box) return;

  box.innerHTML = '';

  games.slice(0, 5).forEach(game => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'search-suggestion';

    const year = game.released
      ? new Date(game.released).getFullYear()
      : '';

    item.innerHTML = `
      <span class="suggestion-cover">
        ${game.background_image ? `<img src="${game.background_image}" alt="">` : ''}
      </span>
      <span class="suggestion-info">
        <strong>${game.name}</strong>
        <small>${year || 'Unknown'}</small>
      </span>
    `;

    item.addEventListener('mousedown', e => e.preventDefault());
    item.addEventListener('click', () => {
      input.value = game.name;
      hideSuggestions(input);
      fetchGames(game.name);
    });

    box.appendChild(item);
  });

  box.hidden = games.length === 0;
}

async function fetchSuggestions(input, query) {
  const requestId = ++suggestionRequest;

  try {
    const params = new URLSearchParams({
      key: API_KEY,
      search: query,
      page_size: '5'
    });

    const res = await fetch(`${API_BASE}?${params.toString()}`);
    if (!res.ok) return;

    const data = await res.json();
    if (requestId !== suggestionRequest) return;

    showSuggestions(input, data.results || []);
  } catch {
    hideSuggestions(input);
  }
}

function setupAutocomplete(input) {
  if (!input) return;

  input.addEventListener('input', () => {
    const query = input.value.trim();
    clearTimeout(suggestionTimer);

    if (query.length < 2) {
      hideSuggestions(input);
      return;
    }

    suggestionTimer = setTimeout(() => {
      fetchSuggestions(input, query);
    }, 300);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideSuggestions(input);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => hideSuggestions(input), 150);
  });
}

const headerSearchInput = document.querySelector('.header-search input');
const heroSearchInput = document.querySelector('.hero-search input');

setupAutocomplete(headerSearchInput);
setupAutocomplete(heroSearchInput);

// ---- Wire up the search bars to fetchGames() ----------------------------
document.querySelectorAll('.hero-search, .header-search').forEach(searchEl => {
  const formOrWrapper = searchEl.closest('form') || searchEl;

  if (formOrWrapper.dataset.searchWired) return;
  formOrWrapper.dataset.searchWired = 'true';

  formOrWrapper.addEventListener('submit', e => {
    e.preventDefault();
    const input = searchEl.querySelector('input');
    const query = input?.value.trim() || '';

    hideSuggestions(input);
    if (query) fetchGames(query);
  });
});

// ---- Button press bounce (delegated — covers static + rendered buttons) --
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  fx(btn, [{ transform: 'scale(1)' }, { transform: 'scale(0.94)' }, { transform: 'scale(1)' }], { duration: 180 });
});

// ---- Init ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  updateHomeStats();
  renderWishlist();
  await hydrateMissingGenres();
  updateHomeStats();
  fetchGames(); // falls back to FALLBACK_GAMES automatically if offline / no key
});
