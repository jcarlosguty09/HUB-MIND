// app.js — HUB MIND WOD App v2
// Sections per day, each with independent timer config

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MODE_LABELS = { stopwatch:'Cronómetro', countdown:'Temporizador', emom:'EMOM', tabata:'Tabata', intervals:'Intervalos' };

// ---- STATE ----
const state = {
  view: 'calendar',
  curYear:  new Date().getFullYear(),
  curMonth: new Date().getMonth(),
  selectedDate: null,
  // wods[dateKey] = [ { id, name, content, timerMode, timerConfig:{} }, ... ]
  wods: {},
  history: [],
  isDark: true,
  loadedMonths: new Set(),
  // Projection
  projSections: [],
  projIdx: 0,
  projDateKey: null,
};

const today    = new Date();
const todayKey = fmtKey(today.getFullYear(), today.getMonth(), today.getDate());

// ---- UTILS ----
function fmtKey(y, m, d) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function fmtMonthKey(y, m) { return `${y}-${String(m+1).padStart(2,'0')}`; }
function fmtDateLabel(k) {
  return new Date(k + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });
}
function el(id) { return document.getElementById(id); }
function uid()  { return Math.random().toString(36).slice(2, 9); }

function setSyncState(s) {
  const dot = el('sync-dot');
  dot.className = 'sync-dot' + (s === 'syncing' ? ' syncing' : s === 'error' ? ' error' : '');
}
function showToast(msg, ms = 2200) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

// ---- THEME ----
function initTheme() {
  const saved = localStorage.getItem('hm-theme');
  state.isDark = saved !== 'light';
  document.body.dataset.theme = state.isDark ? 'dark' : 'light';
  el('theme-toggle').innerHTML = `<i class="ti ti-${state.isDark ? 'sun' : 'moon'}"></i>`;
}
function toggleTheme() {
  state.isDark = !state.isDark;
  document.body.dataset.theme = state.isDark ? 'dark' : 'light';
  el('theme-toggle').innerHTML = `<i class="ti ti-${state.isDark ? 'sun' : 'moon'}"></i>`;
  localStorage.setItem('hm-theme', state.isDark ? 'dark' : 'light');
}

// ---- VIEW ----
function showView(v) {
  state.view = v;
  document.querySelectorAll('.view').forEach(s => s.classList.remove('active'));
  el(`view-${v}`).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'today')   renderSections('today', todayKey);
  if (v === 'history') renderHistory();
}

// ---- SUPABASE LOAD ----
async function loadMonth(y, m) {
  const key = fmtMonthKey(y, m);
  if (state.loadedMonths.has(key)) return;
  setSyncState('syncing');
  try {
    // rows: { date, sections: JSON string }
    const rows = await WodAPI.getMonth(key);
    // WodAPI returns { 'YYYY-MM-DD': [ ...sections ] }
    Object.assign(state.wods, rows);
    state.loadedMonths.add(key);
    setSyncState('ok');
  } catch { setSyncState('error'); }
}

// ---- CALENDAR ----
async function renderCalendar() {
  await loadMonth(state.curYear, state.curMonth);
  el('cal-month-label').textContent = `${MONTHS[state.curMonth]} ${state.curYear}`;
  const grid = el('cal-grid');
  grid.innerHTML = '';
  DAYS.forEach(d => { const h = document.createElement('div'); h.className = 'cal-day-name'; h.textContent = d; grid.appendChild(h); });
  const firstDay  = new Date(state.curYear, state.curMonth, 1).getDay();
  const daysInMon = new Date(state.curYear, state.curMonth + 1, 0).getDate();
  const prevDays  = new Date(state.curYear, state.curMonth, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    const pm = state.curMonth === 0 ? 11 : state.curMonth - 1;
    const py = state.curMonth === 0 ? state.curYear - 1 : state.curYear;
    addCalDay(grid, prevDays - i, py, pm, true);
  }
  for (let d = 1; d <= daysInMon; d++) addCalDay(grid, d, state.curYear, state.curMonth, false);
  const rem = (7 - ((firstDay + daysInMon) % 7)) % 7;
  for (let i = 1; i <= rem; i++) {
    const nm = state.curMonth === 11 ? 0 : state.curMonth + 1;
    const ny = state.curMonth === 11 ? state.curYear + 1 : state.curYear;
    addCalDay(grid, i, ny, nm, true);
  }
}

function addCalDay(grid, d, y, m, other) {
  const key      = fmtKey(y, m, d);
  const isToday  = key === todayKey;
  const isSel    = key === state.selectedDate;
  const cell     = document.createElement('div');
  cell.className = 'cal-day' + (other ? ' other-month' : '') + (isToday ? ' today' : '') + (isSel ? ' selected' : '');
  const num = document.createElement('div'); num.className = 'cal-day-num'; num.textContent = d;
  cell.appendChild(num);
  const secs = state.wods[key];
  if (secs && secs.length) {
    const dots = document.createElement('div'); dots.className = 'cal-wods';
    secs.slice(0, 3).forEach(s => {
      const dot = document.createElement('div');
      dot.className = 'cal-wod-dot';
      dot.textContent = s.name || 'Sección';
      dots.appendChild(dot);
    });
    if (secs.length > 3) { const more = document.createElement('div'); more.className = 'cal-wod-dot more'; more.textContent = `+${secs.length - 3}`; dots.appendChild(more); }
    cell.appendChild(dots);
  }
  cell.addEventListener('click', () => {
    if (other) { state.curYear = y; state.curMonth = m; renderCalendar(); }
    selectDay(y, m, d);
  });
  grid.appendChild(cell);
}

function selectDay(y, m, d) {
  state.selectedDate = fmtKey(y, m, d);
  renderCalendar();
  const panel = el('day-panel');
  panel.style.display = 'block';
  el('day-panel-date').textContent = fmtDateLabel(state.selectedDate);
  renderSections('cal', state.selectedDate);
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---- SECTIONS ----
function getSections(dateKey) {
  if (!state.wods[dateKey]) state.wods[dateKey] = [];
  return state.wods[dateKey];
}

function renderSections(ctx, dateKey) {
  const container = el(`sections-${ctx}`);
  container.innerHTML = '';
  const sections = getSections(dateKey);
  if (!sections.length) {
    container.innerHTML = `<div class="sections-empty"><i class="ti ti-layout-list"></i><p>Sin secciones. Agrega una para empezar.</p></div>`;
    return;
  }
  sections.forEach((sec, idx) => {
    container.appendChild(buildSectionCard(ctx, dateKey, sec, idx));
  });
}

function buildSectionCard(ctx, dateKey, sec, idx) {
  const card = document.createElement('div');
  card.className = 'section-card';
  card.dataset.id = sec.id;

  const mode = sec.timerMode || 'stopwatch';
  const timerFieldsHTML = Timer.FIELDS[mode] || '';

  card.innerHTML = `
    <div class="section-card-header">
      <input class="section-name-input" value="${escHtml(sec.name || '')}" placeholder="Nombre de la sección (ej: MetCon, Strength...)" data-idx="${idx}" />
      <button class="section-delete-btn" data-idx="${idx}" aria-label="Eliminar sección"><i class="ti ti-trash"></i></button>
    </div>
    <textarea class="wod-editor" data-idx="${idx}" placeholder="Escribe el WOD aquí...">${escHtml(sec.content || '')}</textarea>
    <div class="section-timer-config">
      <div class="section-timer-label"><i class="ti ti-clock"></i> Timer</div>
      <div class="timer-modes">
        ${['stopwatch','countdown','emom','tabata','intervals'].map(m =>
          `<button class="timer-mode-btn${mode === m ? ' active' : ''}" data-mode="${m}" data-idx="${idx}">
            <i class="ti ti-${modeIcon(m)}"></i><br>${MODE_LABELS[m]}
          </button>`).join('')}
      </div>
      <div class="timer-fields" data-idx="${idx}">${renderTimerFields(mode, sec.timerConfig || {})}</div>
    </div>
    <div class="section-footer">
      <span class="save-status" data-idx="${idx}"></span>
      <button class="save-btn section-save-btn" data-idx="${idx}"><i class="ti ti-device-floppy"></i> Guardar</button>
    </div>`;

  // Name change
  card.querySelector('.section-name-input').addEventListener('input', e => {
    getSections(dateKey)[idx].name = e.target.value;
  });

  // Content change
  card.querySelector('.wod-editor').addEventListener('input', e => {
    getSections(dateKey)[idx].content = e.target.value;
  });

  // Timer mode buttons
  card.querySelectorAll('.timer-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const newMode = btn.dataset.mode;
      getSections(dateKey)[idx].timerMode = newMode;
      getSections(dateKey)[idx].timerConfig = {};
      card.querySelectorAll('.timer-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === newMode));
      card.querySelector(`.timer-fields[data-idx="${idx}"]`).innerHTML = renderTimerFields(newMode, {});
      bindTimerFieldEvents(card, dateKey, idx);
    });
  });

  // Timer field changes
  bindTimerFieldEvents(card, dateKey, idx);

  // Delete
  card.querySelector('.section-delete-btn').addEventListener('click', () => {
    getSections(dateKey).splice(idx, 1);
    renderSections(ctx, dateKey);
  });

  // Save
  card.querySelector('.section-save-btn').addEventListener('click', async () => {
    await saveDay(ctx, dateKey, idx, card);
  });

  return card;
}

function bindTimerFieldEvents(card, dateKey, idx) {
  card.querySelectorAll('.field-input').forEach(input => {
    input.addEventListener('input', e => {
      if (!getSections(dateKey)[idx].timerConfig) getSections(dateKey)[idx].timerConfig = {};
      getSections(dateKey)[idx].timerConfig[e.target.dataset.key] = e.target.value;
    });
  });
}

function renderTimerFields(mode, cfg) {
  let html = Timer.FIELDS[mode] || '';
  // Inject saved values by replacing default value attribute for each key
  if (cfg && Object.keys(cfg).length) {
    Object.entries(cfg).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      // Replace: data-key="KEY" type="number" value="ANYTHING"
      const re = new RegExp(`(data-key="${k}"[^>]*?)value="[^"]*"`, 'g');
      html = html.replace(re, `$1value="${v}"`);
    });
  }
  return html;
}

function modeIcon(m) {
  return { stopwatch:'clock-play', countdown:'clock-down', emom:'repeat', tabata:'activity', intervals:'refresh' }[m] || 'clock';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function addSection(ctx, dateKey) {
  const sections = getSections(dateKey);
  sections.push({ id: uid(), name: '', content: '', timerMode: 'stopwatch', timerConfig: {} });
  renderSections(ctx, dateKey);
  // Scroll to last card
  const container = el(`sections-${ctx}`);
  const cards = container.querySelectorAll('.section-card');
  if (cards.length) cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---- SAVE ----
async function saveDay(ctx, dateKey, idx, card) {
  const statusEl = card ? card.querySelector(`.save-status[data-idx="${idx}"]`) : null;
  if (statusEl) { statusEl.textContent = 'Guardando...'; statusEl.className = 'save-status'; }
  setSyncState('syncing');
  const sections = getSections(dateKey);
  const ok = await WodAPI.saveDay(dateKey, sections);
  setSyncState(ok ? 'ok' : 'error');
  if (ok) {
    if (statusEl) { statusEl.textContent = '✓ Guardado'; statusEl.className = 'save-status ok'; }
    showToast('¡Guardado!');
    if (ctx === 'cal') renderCalendar();
  } else {
    if (statusEl) { statusEl.textContent = 'Error al guardar'; statusEl.className = 'save-status error'; }
    showToast('Error al guardar');
  }
}

// ---- TODAY ----
async function renderToday() {
  el('today-date-label').textContent = today.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  await loadMonth(today.getFullYear(), today.getMonth());
  renderSections('today', todayKey);
}

// ---- HISTORY ----
async function renderHistory() {
  setSyncState('syncing');
  const rows = await WodAPI.getHistory(60);
  setSyncState('ok');
  const list = el('history-list');
  list.innerHTML = '';
  if (!rows.length) {
    list.innerHTML = `<div class="history-empty"><i class="ti ti-calendar-off"></i><p>No hay WODs guardados aún.</p></div>`;
    return;
  }
  rows.forEach(row => {
    const sections = row.sections || [];
    const card = document.createElement('div');
    card.className = 'history-card';
    const dateLabel = fmtDateLabel(row.date);
    const preview = sections.map(s => s.name || 'Sección').join(' · ') || 'Sin secciones';
    card.innerHTML = `
      <div class="hcard-top">
        <span class="hcard-date">${dateLabel}</span>
        <span class="hcard-count">${sections.length} sección${sections.length !== 1 ? 'es' : ''}</span>
      </div>
      <div class="hcard-preview">${preview}</div>`;
    card.addEventListener('click', () => {
      const d = new Date(row.date + 'T12:00:00');
      state.curYear = d.getFullYear(); state.curMonth = d.getMonth();
      showView('calendar');
      renderCalendar().then(() => selectDay(d.getFullYear(), d.getMonth(), d.getDate()));
    });
    list.appendChild(card);
  });
}

// ---- PROJECTION ----
function launchProjection(ctx, dateKey) {
  const sections = getSections(dateKey).filter(s => s.content && s.content.trim());
  if (!sections.length) { showToast('Escribe al menos un WOD primero'); return; }
  state.projSections = sections;
  state.projIdx      = 0;
  state.projDateKey  = dateKey;
  el('proj-date').textContent = fmtDateLabel(dateKey);
  loadProjSection(0);
  el('projection').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}

function loadProjSection(idx) {
  Timer.stop();
  Timer.reset();
  const sections = state.projSections;
  const sec = sections[idx];
  if (!sec) return;
  state.projIdx = idx;

  el('proj-section-name').textContent = sec.name || `Sección ${idx + 1}`;
  el('proj-wod-text').textContent     = sec.content || '';
  el('proj-nav-label').textContent    = `${idx + 1} / ${sections.length}`;

  // Configure timer for this section
  const cfg = Timer.buildConfigFromSection(sec);
  Timer.configure(cfg);

  const mode = sec.timerMode || 'stopwatch';
  el('proj-timer-mode-label').textContent = MODE_LABELS[mode] || '';

  const hasBar   = ['tabata','intervals'].includes(mode);
  const hasRound = ['tabata','intervals','emom'].includes(mode);
  el('proj-phase-bar').style.display  = hasBar   ? 'block' : 'none';
  el('proj-round-info').style.display = hasRound ? 'block' : 'none';

  // Nav buttons
  el('proj-prev').disabled = idx === 0;
  el('proj-next').disabled = idx === sections.length - 1;

  updateTimerUI(Timer.getState());
}

function closeProjection() {
  Timer.stop();
  el('projection').classList.add('hidden');
  document.body.style.overflow = '';
  if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
}

function updateTimerUI(s) {
  const disp = el('proj-timer-display');
  disp.textContent = s.display;
  disp.className   = 'proj-timer-display' + (s.done ? ' done' : s.running ? (s.phase === 'rest' ? ' rest' : ' running') : '');

  el('proj-timer-sub').textContent = s.sub || '';

  if (s.phaseProgress !== null && s.phaseProgress !== undefined) {
    el('proj-phase-fill').style.width      = (s.phaseProgress * 100) + '%';
    el('proj-phase-fill').style.background = s.phase === 'work' ? '#3B82F6' : '#64748B';
  }

  if (s.totalRounds) {
    el('proj-round-cur').textContent   = s.round;
    el('proj-round-total').textContent = s.totalRounds;
  }

  el('proj-play').innerHTML = s.running
    ? '<i class="ti ti-player-pause"></i>'
    : '<i class="ti ti-player-play"></i>';
}

// ---- PWA ----
let _deferredInstall = null;
function setupPWA() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); _deferredInstall = e;
    if (!localStorage.getItem('hm-install-dismissed')) showInstallBanner();
  });
  window.addEventListener('appinstalled', () => { hideInstallBanner(); showToast('¡App instalada!', 3000); });
}
function showInstallBanner() {
  if (el('install-banner')) return;
  const b = document.createElement('div'); b.id = 'install-banner'; b.className = 'install-banner';
  b.innerHTML = `<div class="install-banner-text"><strong>Instalar HUB MIND</strong>Agrega la app a tu pantalla de inicio</div><button class="install-banner-btn" id="install-banner-btn">Instalar</button><button class="install-banner-close" id="install-banner-close"><i class="ti ti-x"></i></button>`;
  document.body.appendChild(b);
  el('install-banner-btn').addEventListener('click', async () => {
    if (!_deferredInstall) return;
    _deferredInstall.prompt();
    const { outcome } = await _deferredInstall.userChoice;
    if (outcome === 'accepted') hideInstallBanner();
    _deferredInstall = null;
  });
  el('install-banner-close').addEventListener('click', () => { hideInstallBanner(); localStorage.setItem('hm-install-dismissed','1'); });
}
function hideInstallBanner() { const b = el('install-banner'); if (b) b.remove(); }

// ---- INIT ----
async function init() {
  initTheme();
  setupPWA();

  // Nav
  document.querySelectorAll('.nav-tab').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  el('theme-toggle').addEventListener('click', toggleTheme);

  // Calendar nav
  el('prev-month').addEventListener('click', () => { if (--state.curMonth < 0) { state.curMonth = 11; state.curYear--; } renderCalendar(); });
  el('next-month').addEventListener('click', () => { if (++state.curMonth > 11) { state.curMonth = 0;  state.curYear++; } renderCalendar(); });

  // Add section buttons
  el('add-section-cal').addEventListener('click', () => { if (state.selectedDate) addSection('cal', state.selectedDate); });
  el('add-section-today').addEventListener('click', () => addSection('today', todayKey));

  // Project buttons
  el('project-btn-cal').addEventListener('click', () => { if (state.selectedDate) launchProjection('cal', state.selectedDate); });
  el('project-btn-today').addEventListener('click', () => launchProjection('today', todayKey));

  // Projection controls
  el('proj-play').addEventListener('click', () => {
    const s = Timer.getState();
    if (s.running) Timer.stop(); else Timer.start();
  });
  el('proj-reset').addEventListener('click', () => Timer.reset());
  el('proj-skip').addEventListener('click', () => Timer.skipRound());
  el('proj-prev').addEventListener('click', () => { if (state.projIdx > 0) loadProjSection(state.projIdx - 1); });
  el('proj-next').addEventListener('click', () => { if (state.projIdx < state.projSections.length - 1) loadProjSection(state.projIdx + 1); });
  el('close-proj-btn').addEventListener('click', closeProjection);

  // Keyboard
  document.addEventListener('keydown', e => {
    const inProj = !el('projection').classList.contains('hidden');
    if (e.key === 'Escape') closeProjection();
    if (e.key === ' ' && inProj) { e.preventDefault(); el('proj-play').click(); }
    if (e.key === 'ArrowRight' && inProj) el('proj-next').click();
    if (e.key === 'ArrowLeft'  && inProj) el('proj-prev').click();
  });

  // Timer callbacks
  Timer.onTick = updateTimerUI;
  Timer.onDone = () => {
    showToast('¡Tiempo!', 3000);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  };

  // Loading screen
  const ls = el('loading-screen');
  ls.classList.add('fade-out');
  setTimeout(() => { ls.style.display = 'none'; }, 500);
  el('app').classList.remove('hidden');

  await renderCalendar();
  await renderToday();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
