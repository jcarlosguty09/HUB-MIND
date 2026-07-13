// app.js — HUB MIND WOD App v4
// Structure: Day → Classes → Sections

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MODE_LABELS = { stopwatch:'Cronómetro', countdown:'Temporizador', emom:'EMOM', tabata:'Tabata', intervals:'Intervalos' };

const CLASSES = [
  { id: 'crossfit',     label: 'CrossFit',         color: 'blue'   },
  { id: 'hyrox',        label: 'HYROX',             color: 'yellow' },
  { id: 'strength',     label: 'Strength Lab',      color: 'purple' },
  { id: 'openbox_hyrox',label: 'Open Box (HYROX)',  color: 'orange' },
  { id: 'openbox',      label: 'Open Box',          color: 'green'  },
];

// ---- STATE ----
const state = {
  view: 'calendar',
  curYear:  new Date().getFullYear(),
  curMonth: new Date().getMonth(),
  selectedDate: null,
  selectedClass: { cal: 'crossfit', today: 'crossfit' },
  // wods[dateKey] = { crossfit: [...sections], hyrox: [...sections], ... }
  wods: {},
  history: [],
  isDark: true,
  loadedMonths: new Set(),
  role: 'coach',
  // Projection
  projClasses: [],   // active classes for the day
  projClassIdx: 0,
  projSections: [],
  projSectionIdx: 0,
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
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function getClassInfo(id) { return CLASSES.find(c => c.id === id) || CLASSES[0]; }

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
  if (v === 'today')   renderDay('today', todayKey);
  if (v === 'history') renderHistory();
}

// ---- SUPABASE LOAD ----
async function loadMonth(y, m) {
  const key = fmtMonthKey(y, m);
  if (state.loadedMonths.has(key)) return;
  setSyncState('syncing');
  try {
    const data = await WodAPI.getMonth(key);
    Object.assign(state.wods, data);
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
  DAYS.forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-day-name';
    h.textContent = d;
    grid.appendChild(h);
  });
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
  const key     = fmtKey(y, m, d);
  const isToday = key === todayKey;
  const isSel   = key === state.selectedDate;
  const cell    = document.createElement('div');
  cell.className = 'cal-day' + (other ? ' other-month' : '') + (isToday ? ' today' : '') + (isSel ? ' selected' : '');
  const num = document.createElement('div'); num.className = 'cal-day-num'; num.textContent = d;
  cell.appendChild(num);
  const dayData = state.wods[key];
  if (dayData) {
    const dots = document.createElement('div'); dots.className = 'cal-wods';
    CLASSES.forEach(cls => {
      const secs = dayData[cls.id];
      if (secs && secs.length) {
        const dot = document.createElement('div');
        dot.className = `cal-wod-dot ${cls.color}`;
        dot.textContent = cls.label;
        dots.appendChild(dot);
      }
    });
    if (dots.children.length) cell.appendChild(dots);
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
  renderDay('cal', state.selectedDate);
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---- DAY RENDER (class tabs + sections) ----
function getDayData(dateKey) {
  if (!state.wods[dateKey]) state.wods[dateKey] = {};
  return state.wods[dateKey];
}
function getSections(dateKey, classId) {
  const day = getDayData(dateKey);
  if (!day[classId]) day[classId] = [];
  return day[classId];
}

function renderDay(ctx, dateKey) {
  const container = el(`day-content-${ctx}`);
  container.innerHTML = '';

  // Class tabs
  const tabsEl = document.createElement('div');
  tabsEl.className = 'class-type-tabs';
  CLASSES.forEach(cls => {
    const tab = document.createElement('button');
    tab.className = `class-type-tab ${cls.color}${state.selectedClass[ctx] === cls.id ? ' active' : ''}`;
    tab.dataset.class = cls.id;
    const secs = getSections(dateKey, cls.id);
    tab.innerHTML = `${cls.label}${secs.length ? `<span class="tab-count">${secs.length}</span>` : ''}`;
    tab.addEventListener('click', () => {
      state.selectedClass[ctx] = cls.id;
      renderDay(ctx, dateKey);
    });
    tabsEl.appendChild(tab);
  });
  container.appendChild(tabsEl);

  // Sections for selected class
  const classId = state.selectedClass[ctx];
  const sections = getSections(dateKey, classId);
  const sectionsEl = document.createElement('div');
  sectionsEl.className = 'sections-list';

  if (!sections.length) {
    sectionsEl.innerHTML = `<div class="sections-empty"><i class="ti ti-layout-list"></i><p>Sin secciones. Agrega una para empezar.</p></div>`;
  } else {
    sections.forEach((sec, idx) => {
      sectionsEl.appendChild(buildSectionCard(ctx, dateKey, classId, sec, idx));
    });
  }
  container.appendChild(sectionsEl);

  // Add section button (admin only)
  if (state.role === 'admin') {
    const addBtn = document.createElement('button');
    addBtn.className = 'add-section-btn';
    addBtn.innerHTML = '<i class="ti ti-plus"></i> Agregar sección';
    addBtn.addEventListener('click', () => addSection(ctx, dateKey, classId));
    container.appendChild(addBtn);
  }
}

// ---- SECTION CARD ----
function buildSectionCard(ctx, dateKey, classId, sec, idx) {
  const card = document.createElement('div');
  card.className = 'section-card';
  const isCoach = state.role === 'coach';
  const mode = sec.timerMode || 'stopwatch';

  card.innerHTML = `
    <div class="section-card-header">
      <input class="section-name-input" value="${escHtml(sec.name || '')}" placeholder="Nombre (ej: MetCon, Strength...)" ${isCoach ? 'readonly style="pointer-events:none"' : ''} />
      ${isCoach ? '' : `<button class="section-delete-btn" aria-label="Eliminar"><i class="ti ti-trash"></i></button>`}
    </div>
    <textarea class="wod-editor" placeholder="Escribe el WOD aquí..." ${isCoach ? 'readonly style="background:var(--surface2);cursor:default"' : ''}>${escHtml(sec.content || '')}</textarea>
    <div class="section-timer-config">
      <div class="section-timer-label"><i class="ti ti-clock"></i> Timer</div>
      <div class="timer-modes">
        ${['stopwatch','countdown','emom','tabata','intervals'].map(m =>
          `<button class="timer-mode-btn${mode === m ? ' active' : ''}" data-mode="${m}">
            <i class="ti ti-${modeIcon(m)}"></i><br>${MODE_LABELS[m]}
          </button>`).join('')}
      </div>
      <div class="timer-fields">${renderTimerFields(mode, sec.timerConfig || {})}</div>
    </div>
    ${isCoach ? '' : `<div class="section-footer"><span class="save-status"></span><button class="save-btn section-save-btn"><i class="ti ti-device-floppy"></i> Guardar</button></div>`}`;

  // Name
  card.querySelector('.section-name-input').addEventListener('input', e => {
    getSections(dateKey, classId)[idx].name = e.target.value;
  });
  // Content
  card.querySelector('.wod-editor').addEventListener('input', e => {
    getSections(dateKey, classId)[idx].content = e.target.value;
  });
  // Timer modes
  card.querySelectorAll('.timer-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const newMode = btn.dataset.mode;
      getSections(dateKey, classId)[idx].timerMode = newMode;
      getSections(dateKey, classId)[idx].timerConfig = {};
      card.querySelectorAll('.timer-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === newMode));
      card.querySelector('.timer-fields').innerHTML = renderTimerFields(newMode, {});
      bindTimerFields(card, dateKey, classId, idx);
    });
  });
  bindTimerFields(card, dateKey, classId, idx);
  // Delete
  if (!isCoach) {
    card.querySelector('.section-delete-btn').addEventListener('click', () => {
      getSections(dateKey, classId).splice(idx, 1);
      renderDay(ctx, dateKey);
    });
    // Save
    card.querySelector('.section-save-btn').addEventListener('click', async () => {
      const statusEl = card.querySelector('.save-status');
      statusEl.textContent = 'Guardando...';
      statusEl.className = 'save-status';
      const ok = await saveDay(dateKey);
      statusEl.textContent = ok ? '✓ Guardado' : 'Error';
      statusEl.className = 'save-status ' + (ok ? 'ok' : 'error');
      if (ok && ctx === 'cal') renderCalendar();
    });
  }
  return card;
}

function bindTimerFields(card, dateKey, classId, idx) {
  const sec = getSections(dateKey, classId)[idx];
  if (!sec.timerConfig) sec.timerConfig = {};
  card.querySelectorAll('.field-input').forEach(input => {
    const k = input.dataset.key;
    if (!k) return;
    if (sec.timerConfig[k] !== undefined && sec.timerConfig[k] !== '') {
      input.value = sec.timerConfig[k];
    } else {
      sec.timerConfig[k] = input.value;
    }
    input.addEventListener('input', e => {
      getSections(dateKey, classId)[idx].timerConfig[k] = e.target.value;
    });
  });
}

function renderTimerFields(mode, cfg) {
  let html = Timer.FIELDS[mode] || '';
  if (cfg && Object.keys(cfg).length) {
    Object.entries(cfg).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      const re = new RegExp(`(data-key="${k}"[^>]*?)value="[^"]*"`, 'g');
      html = html.replace(re, `$1value="${v}"`);
    });
  }
  return html;
}

function modeIcon(m) {
  return { stopwatch:'clock-play', countdown:'clock-down', emom:'repeat', tabata:'activity', intervals:'refresh' }[m] || 'clock';
}

function addSection(ctx, dateKey, classId) {
  getSections(dateKey, classId).push({ id: uid(), name: '', content: '', timerMode: 'stopwatch', timerConfig: {} });
  renderDay(ctx, dateKey);
  const container = el(`day-content-${ctx}`);
  const cards = container.querySelectorAll('.section-card');
  if (cards.length) cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---- SAVE ----
async function saveDay(dateKey) {
  setSyncState('syncing');
  const ok = await WodAPI.saveDay(dateKey, state.wods[dateKey] || {});
  setSyncState(ok ? 'ok' : 'error');
  if (ok) showToast('¡Guardado!');
  else showToast('Error al guardar');
  return ok;
}

// ---- TODAY ----
async function renderToday() {
  el('today-date-label').textContent = today.toLocaleDateString('es-MX', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });
  await loadMonth(today.getFullYear(), today.getMonth());
  renderDay('today', todayKey);
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
    const card = document.createElement('div');
    card.className = 'history-card';
    const activeClasses = CLASSES.filter(c => row.data[c.id] && row.data[c.id].length);
    const pills = activeClasses.map(c => `<span class="cal-wod-dot ${c.color}">${c.label}</span>`).join('');
    card.innerHTML = `
      <div class="hcard-top">
        <span class="hcard-date">${fmtDateLabel(row.date)}</span>
      </div>
      <div class="hcard-classes">${pills || '<span style="color:var(--text3);font-size:12px">Sin clases</span>'}</div>`;
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
  const dayData = state.wods[dateKey] || {};
  // Build list of classes that have at least one section with content
  const activeClasses = CLASSES.filter(c => {
    const secs = dayData[c.id] || [];
    return secs.some(s => s.content && s.content.trim());
  });
  if (!activeClasses.length) { showToast('No hay WODs para proyectar'); return; }

  state.projClasses    = activeClasses;
  state.projClassIdx   = 0;
  state.projDateKey    = dateKey;
  el('proj-date').textContent = fmtDateLabel(dateKey);

  loadProjClass(0);
  el('projection').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}

function loadProjClass(classIdx) {
  state.projClassIdx = classIdx;
  const cls = state.projClasses[classIdx];
  const dayData = state.wods[state.projDateKey] || {};
  const sections = (dayData[cls.id] || []).filter(s => s.content && s.content.trim());
  state.projSections   = sections;
  state.projSectionIdx = 0;

  // Update class badge
  const badge = el('proj-class-badge');
  badge.textContent  = cls.label;
  badge.className    = `proj-class-badge ${cls.color}`;

  // Update class nav
  el('proj-class-label').textContent = `${classIdx + 1} / ${state.projClasses.length}`;
  el('proj-class-prev').disabled = classIdx === 0;
  el('proj-class-next').disabled = classIdx === state.projClasses.length - 1;

  loadProjSection(0);
}

function loadProjSection(secIdx) {
  Timer.stop();
  Timer.reset();
  state.projSectionIdx = secIdx;
  const sec = state.projSections[secIdx];
  if (!sec) return;

  el('proj-section-name').textContent = sec.name || `Sección ${secIdx + 1}`;
  el('proj-wod-text').textContent     = sec.content || '';
  el('proj-section-label').textContent = `${secIdx + 1} / ${state.projSections.length}`;
  el('proj-section-prev').disabled = secIdx === 0;
  el('proj-section-next').disabled = secIdx === state.projSections.length - 1;

  const cfg = Timer.buildConfigFromSection(sec);
  Timer.configure(cfg);

  const mode = sec.timerMode || 'stopwatch';
  el('proj-timer-mode-label').textContent = MODE_LABELS[mode] || '';

  el('proj-phase-bar').style.display  = ['tabata','intervals'].includes(mode) ? 'block' : 'none';
  el('proj-round-info').style.display = ['tabata','intervals','emom'].includes(mode) ? 'block' : 'none';

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
  el('proj-play').innerHTML = s.running ? '<i class="ti ti-player-pause"></i>' : '<i class="ti ti-player-play"></i>';
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

// ---- AUTH UI ----
async function showLogin() {
  el('loading-screen').style.display = 'none';
  el('login-screen').classList.remove('hidden');
  el('app').classList.add('hidden');
}

async function showApp() {
  el('login-screen').classList.add('hidden');
  el('loading-screen').style.display = 'none';
  el('app').classList.remove('hidden');
  el('app-atleta').classList.add('hidden');

  const role = await RoleAPI.getRole();
  state.role = role;
  const badge = el('role-badge');
  badge.textContent = role === 'admin' ? 'Admin' : 'Coach';
  badge.className = 'role-badge ' + role;

  await renderCalendar();
  await renderToday();
}

async function showAtleta() {
  el('login-screen').classList.add('hidden');
  el('loading-screen').style.display = 'none';
  el('app').classList.add('hidden');
  el('app-atleta').classList.remove('hidden');
  state.role = 'atleta';

  const todayDate = new Date();
  const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const todayK    = fmtKey(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
  const tomorrowK = fmtKey(tomorrowDate.getFullYear(), tomorrowDate.getMonth(), tomorrowDate.getDate());

  el('atleta-today-header').textContent = todayDate.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });
  el('atleta-tomorrow-header').textContent = tomorrowDate.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });

  await loadMonth(todayDate.getFullYear(), todayDate.getMonth());
  await loadMonth(tomorrowDate.getFullYear(), tomorrowDate.getMonth());

  await renderAtletaDay('atleta-today-content', todayK);
  await renderAtletaDay('atleta-tomorrow-content', tomorrowK);
}

async function renderAtletaDay(containerId, dateKey) {
  const container = el(containerId);
  container.innerHTML = '';
  const dayData = state.wods[dateKey] || {};
  const scores  = await ScoreAPI.getForDate(dateKey);
  const userId  = Auth.getUser()?.id;

  const activeClasses = CLASSES.filter(c => {
    const secs = dayData[c.id] || [];
    return secs.some(s => s.content && s.content.trim());
  });

  if (!activeClasses.length) {
    container.innerHTML = `<div class="atleta-empty"><i class="ti ti-barbell"></i><p>No hay WOD programado para este día.</p></div>`;
    return;
  }

  activeClasses.forEach(cls => {
    const sections = (dayData[cls.id] || []).filter(s => s.content && s.content.trim());
    const card = document.createElement('div');
    card.className = 'atleta-class-card';

    const header = document.createElement('div');
    header.className = 'atleta-class-header';
    const badge = document.createElement('span');
    badge.className = `cal-wod-dot ${cls.color}`;
    badge.textContent = cls.label;
    const name = document.createElement('div');
    name.className = 'atleta-class-name';
    name.textContent = cls.label;
    const toggle = document.createElement('i');
    toggle.className = 'ti ti-chevron-down atleta-class-toggle open';
    header.appendChild(badge);
    header.appendChild(name);
    header.appendChild(toggle);

    const sectionsEl = document.createElement('div');
    sectionsEl.className = 'atleta-sections';

    sections.forEach(sec => {
      const secEl = document.createElement('div');
      secEl.className = 'atleta-section';
      if (sec.name) {
        const secName = document.createElement('div');
        secName.className = 'atleta-section-name';
        secName.textContent = sec.name;
        secEl.appendChild(secName);
      }
      const wodText = document.createElement('div');
      wodText.className = 'atleta-wod-text';
      wodText.textContent = sec.content;
      secEl.appendChild(wodText);
      sectionsEl.appendChild(secEl);
    });

    // Score input
    const scoreRow = document.createElement('div');
    scoreRow.className = 'score-row';
    const scoreInput = document.createElement('input');
    scoreInput.className = 'score-input';
    scoreInput.type = 'text';
    scoreInput.placeholder = 'Tu score (ej: 5 rondas, 12:34, 85 kg...)';
    scoreInput.value = scores[cls.id] || '';
    const scoreBtn = document.createElement('button');
    scoreBtn.className = 'score-save-btn';
    scoreBtn.textContent = 'Guardar';
    const scoreSaved = document.createElement('span');
    scoreSaved.className = 'score-saved';
    scoreSaved.textContent = '✓ Guardado';

    scoreBtn.addEventListener('click', async () => {
      const ok = await ScoreAPI.save(dateKey, cls.id, userId, scoreInput.value.trim());
      if (ok) { scoreSaved.classList.add('show'); setTimeout(() => scoreSaved.classList.remove('show'), 2000); }
      else showToast('Error al guardar score');
    });
    scoreInput.addEventListener('keydown', e => { if (e.key === 'Enter') scoreBtn.click(); });

    scoreRow.appendChild(scoreInput);
    scoreRow.appendChild(scoreBtn);
    sectionsEl.appendChild(scoreRow);
    sectionsEl.appendChild(scoreSaved);

    // Toggle collapse
    header.addEventListener('click', () => {
      const isOpen = sectionsEl.style.display !== 'none';
      sectionsEl.style.display = isOpen ? 'none' : 'block';
      toggle.classList.toggle('open', !isOpen);
    });

    card.appendChild(header);
    card.appendChild(sectionsEl);
    container.appendChild(card);
  });
}

function showPassModal() {
  el('new-password').value = '';
  el('confirm-password').value = '';
  el('pass-error').classList.add('hidden');
  el('pass-modal').classList.remove('hidden');
}

// ---- INIT ----
async function init() {
  initTheme();
  setupPWA();

  document.querySelectorAll('.nav-tab').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  el('theme-toggle').addEventListener('click', toggleTheme);

  el('prev-month').addEventListener('click', () => { if (--state.curMonth < 0) { state.curMonth = 11; state.curYear--; } renderCalendar(); });
  el('next-month').addEventListener('click', () => { if (++state.curMonth > 11) { state.curMonth = 0;  state.curYear++; } renderCalendar(); });

  el('project-btn-cal').addEventListener('click',   () => { if (state.selectedDate) launchProjection('cal', state.selectedDate); });
  el('project-btn-today').addEventListener('click', () => launchProjection('today', todayKey));

  // Projection controls
  el('proj-play').addEventListener('click',  () => { const s = Timer.getState(); if (s.running) Timer.stop(); else Timer.start(); });
  el('proj-reset').addEventListener('click', () => Timer.reset());
  el('proj-skip').addEventListener('click',  () => Timer.skipRound());

  // Section nav
  el('proj-section-prev').addEventListener('click', () => { if (state.projSectionIdx > 0) loadProjSection(state.projSectionIdx - 1); });
  el('proj-section-next').addEventListener('click', () => { if (state.projSectionIdx < state.projSections.length - 1) loadProjSection(state.projSectionIdx + 1); });

  // Class nav
  el('proj-class-prev').addEventListener('click', () => { if (state.projClassIdx > 0) loadProjClass(state.projClassIdx - 1); });
  el('proj-class-next').addEventListener('click', () => { if (state.projClassIdx < state.projClasses.length - 1) loadProjClass(state.projClassIdx + 1); });

  el('close-proj-btn').addEventListener('click', closeProjection);

  document.addEventListener('keydown', e => {
    const inProj = !el('projection').classList.contains('hidden');
    if (e.key === 'Escape') closeProjection();
    if (e.key === ' ' && inProj) { e.preventDefault(); el('proj-play').click(); }
    if (e.key === 'ArrowRight' && inProj) el('proj-section-next').click();
    if (e.key === 'ArrowLeft'  && inProj) el('proj-section-prev').click();
    if (e.key === 'ArrowUp'    && inProj) el('proj-class-prev').click();
    if (e.key === 'ArrowDown'  && inProj) el('proj-class-next').click();
  });

  Timer.onTick = updateTimerUI;
  Timer.onDone = () => { showToast('¡Tiempo!', 3000); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); };

  // Login
  el('login-btn').addEventListener('click', async () => {
    const email    = el('login-email').value.trim();
    const password = el('login-password').value;
    const remember = el('remember-me').checked;
    const errEl    = el('login-error');
    const btn      = el('login-btn');
    errEl.classList.add('hidden');
    btn.textContent = 'Entrando...'; btn.disabled = true;
    try {
      await Auth.signIn(email, password, remember);
      const role = await RoleAPI.getRole();
      if (role === 'atleta') await showAtleta();
      else await showApp();
    }
    catch(e) { errEl.textContent = e.message; errEl.classList.remove('hidden'); }
    finally { btn.innerHTML = '<i class="ti ti-login"></i> Entrar'; btn.disabled = false; }
  });
  el('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') el('login-btn').click(); });

  // Logout admin/coach
  el('logout-btn').addEventListener('click', async () => { await Auth.signOut(); showLogin(); });
  // Logout atleta
  el('logout-atleta').addEventListener('click', async () => { await Auth.signOut(); showLogin(); });

  // Theme toggle atleta
  el('theme-toggle-atleta').addEventListener('click', toggleTheme);

  // Change password buttons
  el('change-pass-btn').addEventListener('click', () => showPassModal());
  el('change-pass-atleta').addEventListener('click', () => showPassModal());
  el('pass-cancel').addEventListener('click', () => el('pass-modal').classList.add('hidden'));
  el('pass-save').addEventListener('click', async () => {
    const np = el('new-password').value;
    const cp = el('confirm-password').value;
    const errEl = el('pass-error');
    errEl.classList.add('hidden');
    if (np.length < 6) { errEl.textContent = 'Mínimo 6 caracteres'; errEl.classList.remove('hidden'); return; }
    if (np !== cp)     { errEl.textContent = 'Las contraseñas no coinciden'; errEl.classList.remove('hidden'); return; }
    try {
      await PasswordAPI.change(np);
      el('pass-modal').classList.add('hidden');
      el('new-password').value = '';
      el('confirm-password').value = '';
      showToast('¡Contraseña actualizada!');
    } catch(e) { errEl.textContent = e.message; errEl.classList.remove('hidden'); }
  });

  // Atleta nav tabs
  document.querySelectorAll('[data-aview]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-aview]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#app-atleta .view').forEach(s => s.classList.remove('active'));
      el(`aview-${btn.dataset.aview}`).classList.add('active');
    });
  });

  const session = Auth.loadSession();
  if (session && Auth.isLoggedIn()) {
    const role = await RoleAPI.getRole();
    if (role === 'atleta') await showAtleta();
    else await showApp();
  } else {
    showLogin();
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
