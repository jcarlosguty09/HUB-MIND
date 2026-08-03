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
function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}
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
  if (v === 'today')            renderDay('today', todayKey);
  if (v === 'classes') renderClasses();
  if (v === 'history')          renderHistory();
  if (v === 'leaderboard-admin') renderGlobalLeaderboard('view-leaderboard-admin');
  if (v === 'checkins') renderCheckins();
  if (v === 'dashboard-admin') renderAdminDashboard();
  if (v === 'members') renderMembers();
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

  // Drag & drop (admin only)
  if (state.role === 'admin') {
    const hasWod = state.wods[key] && Object.values(state.wods[key]).some(secs => secs && secs.length);

    if (hasWod) {
      cell.draggable = true;
      cell.classList.add('cal-day-draggable');

      cell.addEventListener('dragstart', e => {
        state.dragSourceKey = key;
        cell.classList.add('cal-day-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', key);
      });

      cell.addEventListener('dragend', () => {
        cell.classList.remove('cal-day-dragging');
        document.querySelectorAll('.cal-day-dragover').forEach(el => el.classList.remove('cal-day-dragover'));
      });
    }

    cell.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (state.dragSourceKey && state.dragSourceKey !== key) {
        cell.classList.add('cal-day-dragover');
      }
    });

    cell.addEventListener('dragleave', () => {
      cell.classList.remove('cal-day-dragover');
    });

    cell.addEventListener('drop', async e => {
      e.preventDefault();
      cell.classList.remove('cal-day-dragover');
      const sourceKey = state.dragSourceKey;
      if (!sourceKey || sourceKey === key) return;

      await moveWodDay(sourceKey, key);
    });
  }

  grid.appendChild(cell);
}

async function moveWodDay(fromKey, toKey) {
  const fromData = state.wods[fromKey];
  if (!fromData) return;

  const toData = state.wods[toKey] || {};
  const hasDestData = Object.values(toData).some(secs => secs && secs.length);

  // Confirm if destination has data
  if (hasDestData) {
    if (!confirm(`El día ${toKey} ya tiene WODs. ¿Quieres mezclarlos con los de ${fromKey}?`)) return;
    // Merge: combine sections for each class
    for (const classId of Object.keys(fromData)) {
      if (!toData[classId]) toData[classId] = [];
      toData[classId] = [...toData[classId], ...fromData[classId]];
    }
  } else {
    // Simple move
    Object.assign(toData, fromData);
  }

  // Clear source day
  const emptyData = {};

  setSyncState('syncing');
  const [okTo, okFrom] = await Promise.all([
    WodAPI.saveDay(toKey, toData),
    WodAPI.saveDay(fromKey, emptyData),
  ]);

  if (okTo && okFrom) {
    state.wods[toKey] = toData;
    state.wods[fromKey] = emptyData;
    state.dragSourceKey = null;
    showToast(`✓ WOD movido de ${fromKey} a ${toKey}`);
    renderCalendar();
    // Update day panel if open
    if (state.selectedDate === fromKey) {
      el('day-panel').style.display = 'none';
      state.selectedDate = null;
    } else if (state.selectedDate === toKey) {
      renderDay('cal', toKey);
    }
  } else {
    showToast('Error al mover el WOD');
  }
  setSyncState(okTo && okFrom ? 'ok' : 'error');
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

  // Add leaderboard to last section only (to avoid duplicates per class)
  if (idx === getSections(dateKey, classId).length - 1) {
    const lbWrap = document.createElement('div');
    card.appendChild(lbWrap);
    renderLeaderboard(lbWrap, dateKey, classId, state.role);
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
  if (ok) {
    showToast('¡Guardado!');
    // Send push notification to athletes
    const activeClasses = CLASSES.filter(c => {
      const secs = state.wods[dateKey]?.[c.id] || [];
      return secs.some(s => s.content && s.content.trim());
    });
    if (activeClasses.length) {
      sendWodNotification(dateKey, activeClasses.map(c => c.label).join(', '));
    }
  } else showToast('Error al guardar');
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

async function loadProjClass(classIdx) {
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

async function loadProjSection(secIdx) {
  Timer.stop();
  Timer.reset();
  state.projSectionIdx = secIdx;
  const sec = state.projSections[secIdx];
  if (!sec) return;

  el('proj-section-name').textContent  = sec.name || `Sección ${secIdx + 1}`;
  el('proj-wod-text').textContent      = sec.content || '';
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

  // Load top scores for this class
  await renderProjLeaderboard();
}

async function renderProjLeaderboard() {
  const lbEl = el('proj-leaderboard');
  if (!lbEl) return;
  lbEl.innerHTML = '';

  const cls     = state.projClasses[state.projClassIdx];
  const dateKey = state.projDateKey;
  if (!cls || !dateKey) return;

  const scores = await ScoreAPI.getLeaderboard(dateKey, cls.id);
  if (!scores.length) { lbEl.innerHTML = '<div class="proj-lb-empty">Sin scores todavía</div>'; return; }

  const scoreType = scores[0]?.score_type || 'high';
  const sorted = [...scores].sort((a, b) => {
    const na = parseFloat(a.score), nb = parseFloat(b.score);
    if (!isNaN(na) && !isNaN(nb)) return scoreType === 'high' ? nb - na : na - nb;
    return scoreType === 'high' ? b.score.localeCompare(a.score) : a.score.localeCompare(b.score);
  }).slice(0, 5);

  const profiles  = await ProfileAPI.getMany(sorted.map(s => s.user_id));
  const athletes  = await AthleteAPI.list();
  const nameMap   = {};
  athletes.forEach(a => nameMap[a.id] = a.display_name);

  const medals = ['🥇','🥈','🥉','4.','5.'];
  sorted.forEach((s, i) => {
    const profile = profiles[s.user_id];
    const name    = profile?.full_name || nameMap[s.user_id] || '—';
    const avatar  = profile?.avatar_url;
    const initials = ProfileAPI.getInitials(profile?.full_name, nameMap[s.user_id]);
    const avatarHTML = avatar
      ? `<img src="${avatar}" class="proj-lb-avatar-img" alt="${escHtml(name)}" />`
      : `<div class="proj-lb-avatar-placeholder">${escHtml(initials)}</div>`;

    const row = document.createElement('div');
    row.className = 'proj-lb-row' + (i === 0 ? ' proj-lb-first' : '');
    row.innerHTML = `
      <span class="proj-lb-medal">${medals[i]}</span>
      ${avatarHTML}
      <span class="proj-lb-name">${escHtml(name)}</span>
      <span class="proj-lb-score">${escHtml(s.score)}</span>`;
    lbEl.appendChild(row);
  });
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
  // Mostrar tab de Miembros solo para admin
  el('nav-tab-members').style.display = role === 'admin' ? '' : 'none';

  await renderCalendar();
  await renderToday();
}


async function showAtleta() {
  el('login-screen').classList.add('hidden');
  el('loading-screen').style.display = 'none';
  el('app').classList.add('hidden');
  el('app-atleta').classList.remove('hidden');
  state.role = 'atleta';

  const userId = Auth.getUser()?.id;
  const profile = await ProfileAPI.get(userId);
  state.profile = profile;

  // Update topbar with avatar and name
  updateAtletaTopbar(profile);

  const todayDate    = new Date();
  const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const todayK    = fmtKey(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
  const tomorrowK = fmtKey(tomorrowDate.getFullYear(), tomorrowDate.getMonth(), tomorrowDate.getDate());

  el('atleta-today-header').textContent    = todayDate.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });
  el('atleta-tomorrow-header').textContent = tomorrowDate.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });

  await loadMonth(todayDate.getFullYear(), todayDate.getMonth());
  await loadMonth(tomorrowDate.getFullYear(), tomorrowDate.getMonth());

  await renderAtletaDay('atleta-today-content', todayK);
  await renderAtletaDay('atleta-tomorrow-content', tomorrowK);
}

function updateAtletaTopbar(profile) {
  const userId   = Auth.getUser()?.id;
  const name     = profile?.full_name || Auth.getUser()?.email?.split('@')[0] || 'Atleta';
  const avatar   = profile?.avatar_url;
  const initials = ProfileAPI.getInitials(profile?.full_name, Auth.getUser()?.email);

  // Update name in topbar
  const nameEl = el('atleta-topbar-name');
  if (nameEl) nameEl.textContent = name;

  // Update avatar
  const avatarEl = el('atleta-topbar-avatar');
  if (avatarEl) {
    if (avatar) {
      avatarEl.innerHTML = `<img src="${avatar}" alt="${escHtml(name)}" />`;
    } else {
      avatarEl.innerHTML = `<span>${escHtml(initials)}</span>`;
    }
  }
}

async function renderAthleteDashboard() {
  const userId = Auth.getUser()?.id;
  const dashEl = el('aview-dashboard');
  if (!dashEl) return;
  dashEl.innerHTML = '<div class="atleta-loading"><i class="ti ti-loader-2"></i> Cargando...</div>';

  const [podiums, recentScores, profile] = await Promise.all([
    PodiumAPI.getForUser(userId),
    PodiumAPI.getRecentScores(userId, 10),
    ProfileAPI.get(userId),
  ]);

  const name     = profile?.full_name || Auth.getUser()?.email?.split('@')[0] || 'Atleta';
  const avatar   = profile?.avatar_url;
  const initials = ProfileAPI.getInitials(profile?.full_name, Auth.getUser()?.email);
  const avatarHTML = avatar
    ? `<img src="${avatar}" alt="${escHtml(name)}" class="dash-avatar-img" />`
    : `<div class="dash-avatar-placeholder">${escHtml(initials)}</div>`;

  const total = podiums.gold + podiums.silver + podiums.bronze;

  dashEl.innerHTML = `
    <div class="dash-profile-card">
      <div class="dash-avatar">${avatarHTML}</div>
      <div class="dash-profile-info">
        <div class="dash-name">${escHtml(name)}</div>
        <div class="dash-email">${escHtml(Auth.getUser()?.email || '')}</div>
      </div>
      <button class="dash-edit-btn" id="dash-edit-profile"><i class="ti ti-pencil"></i></button>
    </div>

    <div class="podium-cards">
      <div class="podium-card gold">
        <div class="podium-medal">🥇</div>
        <div class="podium-count">${podiums.gold}</div>
        <div class="podium-label">1er lugar</div>
      </div>
      <div class="podium-card silver">
        <div class="podium-medal">🥈</div>
        <div class="podium-count">${podiums.silver}</div>
        <div class="podium-label">2do lugar</div>
      </div>
      <div class="podium-card bronze">
        <div class="podium-medal">🥉</div>
        <div class="podium-count">${podiums.bronze}</div>
        <div class="podium-label">3er lugar</div>
      </div>
    </div>
    <div class="dash-total-label">${total} podio${total !== 1 ? 's' : ''} en total</div>

    <div class="dash-section-title">Scores recientes</div>
    <div class="dash-scores-list" id="dash-scores-list"></div>
  `;

  // Edit profile button
  el('dash-edit-profile').addEventListener('click', () => showProfileModal());

  // Recent scores
  const scoresList = el('dash-scores-list');
  if (!recentScores.length) {
    scoresList.innerHTML = '<div class="lb-empty">Sin scores todavía — ¡participa en una clase!</div>';
  } else {
    recentScores.forEach(s => {
      const row = document.createElement('div');
      row.className = 'dash-score-row';
      const date = new Date(s.date + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'short', day:'numeric', month:'short' });
      const classLabel = CLASSES.find(c => c.id === s.class_id)?.label || s.class_id;
      row.innerHTML = `
        <span class="dash-score-date">${date}</span>
        <span class="dash-score-class">${escHtml(classLabel)}</span>
        <span class="dash-score-val">${escHtml(s.score)}</span>`;
      scoresList.appendChild(row);
    });
  }
}

function showProfileModal() {
  const profile = state.profile;
  el('profile-name-input').value   = profile?.full_name || '';
  el('profile-gender-input').value = profile?.gender || '';
  el('profile-avatar-preview').innerHTML = profile?.avatar_url
    ? `<img src="${profile.avatar_url}" />`
    : `<span>${escHtml(ProfileAPI.getInitials(profile?.full_name, Auth.getUser()?.email))}</span>`;
  el('profile-modal').classList.remove('hidden');
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

// ---- LEADERBOARD ----
async function renderLeaderboard(container, dateKey, classId, userRole) {
  const isAdminOrCoach = userRole === 'admin' || userRole === 'coach';
  const currentUserId  = Auth.getUser()?.id;

  // Leaderboard section wrapper
  const lb = document.createElement('div');
  lb.className = 'leaderboard-section';
  lb.innerHTML = `<div class="leaderboard-header"><i class="ti ti-trophy"></i> Leaderboard</div>`;

  // Score type selector + add score (admin/coach only)
  if (isAdminOrCoach) {
    const addPanel = document.createElement('div');
    addPanel.className = 'lb-add-panel';
    addPanel.innerHTML = `
      <div class="lb-add-title">Agregar score</div>
      <div class="lb-add-row">
        <div class="lb-search-wrap">
          <input class="field-input lb-athlete-search" placeholder="Buscar atleta..." autocomplete="off" />
          <div class="lb-dropdown hidden"></div>
        </div>
        <select class="field-input lb-score-type" style="max-width:160px">
          <option value="high">↑ Más alto gana</option>
          <option value="low">↓ Más bajo gana</option>
        </select>
      </div>
      <div class="lb-add-row lb-score-row hidden">
        <input class="field-input lb-score-input" placeholder="Score (ej: 5 rondas, 12:34, 85 kg...)" />
        <button class="score-save-btn lb-score-save">Guardar</button>
      </div>
      <div class="lb-selected-athlete" style="display:none"></div>`;
    lb.appendChild(addPanel);

    // Athlete search logic
    let selectedAthlete = null;
    const searchInput  = addPanel.querySelector('.lb-athlete-search');
    const dropdown     = addPanel.querySelector('.lb-dropdown');
    const scoreRow     = addPanel.querySelector('.lb-score-row');
    const scoreInput   = addPanel.querySelector('.lb-score-input');
    const scoreType    = addPanel.querySelector('.lb-score-type');
    const saveBtn      = addPanel.querySelector('.lb-score-save');
    const selectedEl   = addPanel.querySelector('.lb-selected-athlete');

    const athletes = await AthleteAPI.list();

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      if (!q) { dropdown.classList.add('hidden'); return; }
      const matches = athletes.filter(a =>
        a.display_name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
      ).slice(0, 8);
      dropdown.innerHTML = matches.length
        ? matches.map(a => `<div class="lb-option" data-id="${a.id}" data-name="${escHtml(a.display_name)}">${escHtml(a.display_name)}<span>${escHtml(a.email)}</span></div>`).join('')
        : '<div class="lb-option lb-no-result">Sin resultados</div>';
      dropdown.classList.remove('hidden');
    });

    dropdown.addEventListener('click', e => {
      const opt = e.target.closest('.lb-option');
      if (!opt || !opt.dataset.id) return;
      selectedAthlete = { id: opt.dataset.id, name: opt.dataset.name };
      searchInput.value = '';
      dropdown.classList.add('hidden');
      scoreRow.classList.remove('hidden');
      selectedEl.style.display = 'block';
      selectedEl.innerHTML = `<span class="lb-selected-name"><i class="ti ti-user"></i> ${escHtml(selectedAthlete.name)}</span><button class="lb-clear-btn"><i class="ti ti-x"></i></button>`;
      selectedEl.querySelector('.lb-clear-btn').addEventListener('click', () => {
        selectedAthlete = null;
        scoreRow.classList.add('hidden');
        selectedEl.style.display = 'none';
        scoreInput.value = '';
      });
    });

    document.addEventListener('click', e => {
      if (!addPanel.contains(e.target)) dropdown.classList.add('hidden');
    });

    saveBtn.addEventListener('click', async () => {
      if (!selectedAthlete || !scoreInput.value.trim()) { showToast('Selecciona atleta y score'); return; }
      saveBtn.textContent = 'Guardando...'; saveBtn.disabled = true;
      const ok = await ScoreAPI.save(dateKey, classId, selectedAthlete.id, scoreInput.value.trim(), scoreType.value);
      saveBtn.textContent = 'Guardar'; saveBtn.disabled = false;
      if (ok) {
        showToast(`Score de ${selectedAthlete.name} guardado`);
        scoreInput.value = '';
        selectedAthlete = null;
        scoreRow.classList.add('hidden');
        selectedEl.style.display = 'none';
        // Refresh leaderboard
        await refreshLeaderboardTable(lb, dateKey, classId, currentUserId, isAdminOrCoach);
      } else showToast('Error al guardar');
    });

    scoreInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });
  }

  // Leaderboard table
  await refreshLeaderboardTable(lb, dateKey, classId, currentUserId, isAdminOrCoach);
  container.appendChild(lb);
}

async function refreshLeaderboardTable(lb, dateKey, classId, currentUserId, isAdminOrCoach) {
  // Remove existing table
  const existing = lb.querySelector('.lb-table-wrap');
  if (existing) existing.remove();

  const scores = await ScoreAPI.getLeaderboard(dateKey, classId);
  const wrap = document.createElement('div');
  wrap.className = 'lb-table-wrap';

  if (!scores.length) {
    wrap.innerHTML = '<div class="lb-empty">No hay scores aún.</div>';
    lb.appendChild(wrap);
    return;
  }

  // Determine sort type from first score
  const scoreType = scores[0]?.score_type || 'high';

  // Try numeric sort, fall back to string sort
  const sorted = [...scores].sort((a, b) => {
    const na = parseFloat(a.score), nb = parseFloat(b.score);
    if (!isNaN(na) && !isNaN(nb)) return scoreType === 'high' ? nb - na : na - nb;
    return scoreType === 'high' ? b.score.localeCompare(a.score) : a.score.localeCompare(b.score);
  });

  // Get athlete names
  const athletes = await AthleteAPI.list();
  const nameMap = {};
  athletes.forEach(a => nameMap[a.id] = a.display_name);

  // Get profiles for avatars
  const profileMap = await ProfileAPI.getMany(sorted.map(s => s.user_id));

  const rows = sorted.map((s, i) => {
    const isMe    = s.user_id === currentUserId;
    const medal   = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    const profile  = profileMap[s.user_id];
    const name     = profile?.full_name || nameMap[s.user_id] || s.user_id.slice(0,8);
    const avatar   = profile?.avatar_url;
    const initials = ProfileAPI.getInitials(profile?.full_name, nameMap[s.user_id]);
    const avatarHTML = avatar
      ? `<img src="${avatar}" class="lb-avatar-img" alt="${escHtml(name)}" />`
      : `<div class="lb-avatar-placeholder">${escHtml(initials)}</div>`;
    const deleteBtn = isAdminOrCoach 
      ? `<button class="lb-delete-btn" data-uid="${s.user_id}" data-date="${dateKey}" data-class="${classId}"><i class="ti ti-trash"></i></button>` 
      : '';
    return `<div class="lb-row${isMe ? ' lb-row-me' : ''}">
      <span class="lb-pos">${medal}</span>
      ${avatarHTML}
      <span class="lb-name">${escHtml(name)}${isMe ? ' <span class="lb-you">Tú</span>' : ''}</span>
      <span class="lb-score">${escHtml(s.score)}</span>
      ${deleteBtn}
    </div>`;
  }).join('');

  wrap.innerHTML = `<div class="lb-type-label">${scoreType === 'high' ? '↑ Más alto gana' : '↓ Más bajo gana'}</div><div class="lb-rows">${rows}</div>`;

  // Delete handlers
  if (isAdminOrCoach) {
    wrap.querySelectorAll('.lb-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este score?')) return;
        const ok = await ScoreAPI.delete(btn.dataset.date, btn.dataset.class, btn.dataset.uid);
        if (ok) await refreshLeaderboardTable(lb, dateKey, classId, currentUserId, isAdminOrCoach);
        else showToast('Error al eliminar');
      });
    });
  }

  lb.appendChild(wrap);
}

// ---- ADMIN DASHBOARD ----
async function renderAdminDashboard() {
  const container = el('admin-dashboard-content');
  if (!container) return;
  container.innerHTML = '<div class="atleta-loading"><i class="ti ti-loader-2"></i> Cargando...</div>';

  const today = new Date().toISOString().slice(0, 10);
  const todayLabel = new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });

  const [athletes, todayCheckins] = await Promise.all([
    AthleteAPI.list(),
    CheckinAPI.getForDate(today),
  ]);

  await loadMonth(new Date().getFullYear(), new Date().getMonth());
  const todayWods = state.wods[today] || {};
  const todayHasWod = Object.values(todayWods).some(s => s && s.length);
  const activeClasses = CLASSES.filter(c => todayWods[c.id]?.length > 0);
  const todayCheckinCount = todayCheckins.length;
  const identifiedCount = todayCheckins.filter(c => c.user_id).length;

  const recentIds = [...new Set(todayCheckins.filter(c => c.user_id).slice(0, 8).map(c => c.user_id))];
  const profiles = recentIds.length ? await ProfileAPI.getMany(recentIds) : {};
  const nameMap = {};
  athletes.forEach(a => nameMap[a.id] = a.display_name);

  container.innerHTML = `
    <div class="admin-dash">
      <div class="admin-greeting">
        <div class="admin-greeting-text">
          <div class="admin-greeting-title">¡Buen día! 💪</div>
          <div class="admin-greeting-sub">${todayLabel}</div>
        </div>
        <div class="admin-wod-status ${todayHasWod ? 'has-wod' : 'no-wod'}">
          <i class="ti ti-${todayHasWod ? 'check' : 'alert-triangle'}"></i>
          ${todayHasWod ? 'WOD listo' : 'Sin WOD hoy'}
        </div>
      </div>

      ${activeClasses.length ? `
      <div class="admin-section-title">Clases de hoy</div>
      <div class="admin-classes-row">
        ${activeClasses.map(c => `<span class="cal-wod-dot ${c.color}" style="font-size:12px;padding:4px 10px">${c.label}</span>`).join('')}
      </div>` : ''}

      <div class="admin-section-title">Resumen del día</div>
      <div class="admin-stats-grid">
        <div class="admin-stat-card blue"><i class="ti ti-users"></i><div class="admin-stat-num">${athletes.length}</div><div class="admin-stat-label">Atletas</div></div>
        <div class="admin-stat-card green"><i class="ti ti-scan"></i><div class="admin-stat-num">${todayCheckinCount}</div><div class="admin-stat-label">Check-ins hoy</div></div>
        <div class="admin-stat-card yellow"><i class="ti ti-user-check"></i><div class="admin-stat-num">${identifiedCount}</div><div class="admin-stat-label">Identificados</div></div>
        <div class="admin-stat-card purple"><i class="ti ti-barbell"></i><div class="admin-stat-num">${activeClasses.length}</div><div class="admin-stat-label">Clases</div></div>
      </div>

      <div class="admin-section-title">Acciones rápidas</div>
      <div class="admin-quick-actions">
        <button class="admin-action-btn" onclick="showView('today')"><i class="ti ti-barbell"></i><span>WOD de hoy</span></button>
        <button class="admin-action-btn" onclick="showView('checkins')"><i class="ti ti-scan"></i><span>Check-ins</span></button>
        <button class="admin-action-btn" onclick="showView('calendar')"><i class="ti ti-calendar"></i><span>Calendario</span></button>
        <button class="admin-action-btn" onclick="el('create-user-modal').classList.remove('hidden')"><i class="ti ti-user-plus"></i><span>Nuevo atleta</span></button>
      </div>

      <div class="admin-section-title">Últimos check-ins <span style="color:var(--text3);font-weight:400;font-size:12px">(hoy)</span></div>
      ${todayCheckins.length ? `
      <div class="admin-recent-checkins">
        ${todayCheckins.slice(0, 8).map(c => {
          const profile = c.user_id ? profiles[c.user_id] : null;
          const name = profile?.full_name || nameMap[c.user_id] || 'ZK#' + c.zk_user_id;
          const avatar = profile?.avatar_url;
          const initials = ProfileAPI.getInitials(profile?.full_name || name, '');
          const time = new Date(c.timestamp).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
          const avatarHTML = avatar
            ? '<img src="' + avatar + '" class="admin-ci-avatar-img" />'
            : '<div class="admin-ci-avatar-placeholder">' + escHtml(initials) + '</div>';
          return '<div class="admin-ci-row"><div class="admin-ci-avatar">' + avatarHTML + '</div><span class="admin-ci-name">' + escHtml(name) + '</span><span class="admin-ci-time">' + time + '</span></div>';
        }).join('')}
      </div>` : '<div class="lb-empty">Sin check-ins hoy todavía.</div>'}
    </div>`;

  setTimeout(() => { if (state.view === 'dashboard-admin') renderAdminDashboard(); }, 30000);
}

// ---- CHECK-INS ----
let _checkinPollInterval = null;
let _allCheckins = [];

async function renderCheckins() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

  el('checkins-date').value = today;
  el('checkins-date-label').textContent = new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // Load athletes and profiles for name lookup
  const athletes = await AthleteAPI.list();
  const nameMap = {};
  athletes.forEach(a => nameMap[a.id] = { name: a.display_name, avatar: a.avatar_url });
  // Clases por día de la semana (para el selector de asistencia)
  const allSchedule = await ScheduleAPI.getAll();

  async function load(date, search = '') {
    el('checkins-list').innerHTML = '<div class="atleta-loading"><i class="ti ti-loader-2"></i> Cargando...</div>';
    const rows = await CheckinAPI.getForDate(date);
    _allCheckins = rows;

    // Get profiles for user_ids
    const userIds = [...new Set(rows.filter(r => r.user_id).map(r => r.user_id))];
    const profiles = userIds.length ? await ProfileAPI.getMany(userIds) : {};

    // Filter by search
    const filtered = rows.filter(r => {
      if (!search) return true;
      const profile = r.user_id ? profiles[r.user_id] : null;
      const name = profile?.full_name || nameMap[r.user_id]?.name || r.zk_user_id;
      return name.toLowerCase().includes(search.toLowerCase());
    });

    // Stats
    const total = rows.length;
    const mapped = rows.filter(r => r.user_id).length;
    el('checkins-stats').innerHTML = `
      <div class="checkin-stat"><span class="checkin-stat-num">${total}</span><span class="checkin-stat-label">Total</span></div>
      <div class="checkin-stat"><span class="checkin-stat-num">${mapped}</span><span class="checkin-stat-label">Identificados</span></div>
      <div class="checkin-stat checkin-stat-unknown"><span class="checkin-stat-num">${total - mapped}</span><span class="checkin-stat-label">Sin vincular</span></div>`;

    const listEl = el('checkins-list');
    listEl.innerHTML = '';

    if (!filtered.length) {
      listEl.innerHTML = '<div class="lb-empty" style="padding:32px;text-align:center">Sin check-ins para este día.</div>';
      return;
    }

    filtered.forEach(row => {
      const profile = row.user_id ? profiles[row.user_id] : null;
      const name    = profile?.full_name || nameMap[row.user_id]?.name || `ZK#${row.zk_user_id}`;
      const avatar  = profile?.avatar_url || nameMap[row.user_id]?.avatar;
      const initials = ProfileAPI.getInitials(profile?.full_name || name, '');
      const time    = new Date(row.timestamp).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      const isUnknown = !row.user_id;

      const avatarHTML = avatar
        ? `<img src="${avatar}" class="checkin-avatar-img" />`
        : `<div class="checkin-avatar-placeholder${isUnknown ? ' unknown' : ''}">${escHtml(initials)}</div>`;

      const typeIcon = { face:'ti-face-id', fingerprint:'ti-fingerprint', card:'ti-credit-card', password:'ti-lock' }[row.verify_type] || 'ti-scan';

     // Clases del día de ESTE check-in (según su fecha)
      const rowDate = new Date(row.timestamp);
      const rowDayCdmx = new Date(rowDate.toLocaleString('en-US', { timeZone: 'America/Mexico_City' })).getDay();
      const dayClasses = allSchedule.filter(c => c.day_of_week === rowDayCdmx);
      const classOptions = dayClasses.map(c => {
        const info = CLASS_TYPE_INFO[c.class_type] || { label: c.class_type };
        const sel = row.assigned_class_id === c.id ? ' selected' : '';
        return `<option value="${c.id}"${sel}>${fmtTime(c.start_time)} · ${escHtml(info.label)}</option>`;
      }).join('');

      const card = document.createElement('div');
      card.className = `checkin-card${isUnknown ? ' checkin-unknown' : ''}`;
      card.innerHTML = `
        <div class="checkin-top">
          <div class="checkin-avatar">${avatarHTML}</div>
          <div class="checkin-info">
            <div class="checkin-name">${escHtml(name)}${isUnknown ? ' <span class="checkin-badge-unknown">Sin vincular</span>' : ''}</div>
            <div class="checkin-meta">
              <span><i class="ti ${typeIcon}"></i> ${row.verify_type || 'face'}</span>
              <span>ZK#${row.zk_user_id}</span>
            </div>
          </div>
          <div class="checkin-time">${time}</div>
        </div>
        <div class="checkin-class-row">
          <i class="ti ti-clock-hour-4"></i>
          <select class="checkin-class-select" data-checkin="${row.id}">
            <option value="">Sin clase asignada</option>
            ${classOptions}
          </select>
        </div>`;

      // Click to link unknown user
      if (isUnknown) {
        card.style.cursor = 'pointer';
        card.title = 'Clic para vincular con atleta';
        card.addEventListener('click', () => showLinkModal(row.zk_user_id, listEl, date, search, load));
      }

      // Selector de clase
      const classSelect = card.querySelector('.checkin-class-select');
      if (classSelect) {
        classSelect.addEventListener('change', async (e) => {
          const ok = await CheckinAPI.assignClass(row.id, e.target.value || null);
          if (ok) showToast('✓ Clase asignada');
          else showToast('Error al asignar clase');
        });
      }

      listEl.appendChild(card);
    });
  }

  // Initial load
  await load(today);

  // Date change
  el('checkins-date').addEventListener('change', async (e) => {
    const d = e.target.value;
    el('checkins-date-label').textContent = new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    await load(d, el('checkins-search').value);
  });

  // Search
  let searchTimeout;
  el('checkins-search').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => load(el('checkins-date').value, e.target.value), 300);
  });

  // Auto-refresh every 15 seconds
  if (_checkinPollInterval) clearInterval(_checkinPollInterval);
  _checkinPollInterval = setInterval(async () => {
    if (state.view === 'checkins') {
      await load(el('checkins-date').value, el('checkins-search').value);
    }
  }, 15000);
}

async function showLinkModal(zkUserId, listEl, date, search, reloadFn) {
  const athletes = await AthleteAPI.list();
  
  // Simple modal to link ZK user to HubMind user
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:380px">
      <div class="modal-title"><i class="ti ti-link" style="color:var(--blue)"></i> Vincular ZK#${escHtml(zkUserId)}</div>
      <div class="field-group">
        <label class="field-label">Selecciona el atleta</label>
        <input class="field-input" id="link-search" placeholder="Buscar atleta..." />
        <div class="lb-dropdown" id="link-dropdown" style="position:relative;margin-top:4px;max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;display:none"></div>
      </div>
      <div class="login-error hidden" id="link-error"></div>
      <div class="modal-actions">
        <button class="btn-secondary" id="link-cancel">Cancelar</button>
        <button class="save-btn" id="link-save" disabled><i class="ti ti-link"></i> Vincular</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  let selectedAthleteId = null;
  const searchInput = modal.querySelector('#link-search');
  const dropdown    = modal.querySelector('#link-dropdown');
  const saveBtn     = modal.querySelector('#link-save');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    if (!q) { dropdown.style.display = 'none'; return; }
    const matches = athletes.filter(a => a.display_name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)).slice(0, 8);
    dropdown.innerHTML = matches.map(a => `<div class="lb-option" data-id="${a.id}" data-name="${escHtml(a.display_name)}" style="padding:10px 12px;cursor:pointer">${escHtml(a.display_name)}<br><span style="font-size:11px;color:var(--text3)">${escHtml(a.email)}</span></div>`).join('');
    dropdown.style.display = 'block';
    dropdown.querySelectorAll('.lb-option').forEach(opt => {
      opt.addEventListener('click', () => {
        selectedAthleteId = opt.dataset.id;
        searchInput.value = opt.dataset.name;
        dropdown.style.display = 'none';
        saveBtn.disabled = false;
      });
    });
  });

  modal.querySelector('#link-cancel').addEventListener('click', () => modal.remove());
  
  saveBtn.addEventListener('click', async () => {
    if (!selectedAthleteId) return;
    saveBtn.textContent = 'Vinculando...'; saveBtn.disabled = true;
    try {
      const token = Auth.getToken();
      const athlete = athletes.find(a => a.id === selectedAthleteId);
      
      // Save to zk_user_map
      const res = await fetch(`${SUPABASE_URL}/rest/v1/zk_user_map`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({ zk_user_id: zkUserId, user_id: selectedAthleteId, full_name: athlete?.display_name }),
      });

      if (res.ok) {
        // Update existing checkins with this zk_user_id
        await fetch(`${SUPABASE_URL}/rest/v1/checkins?zk_user_id=eq.${zkUserId}&user_id=is.null`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ user_id: selectedAthleteId }),
        });
        modal.remove();
        showToast(`✓ ZK#${zkUserId} vinculado a ${athlete?.display_name}`);
        AthleteAPI.clearCache();
        await reloadFn(date, search);
      } else {
        modal.querySelector('#link-error').textContent = 'Error al vincular';
        modal.querySelector('#link-error').classList.remove('hidden');
        saveBtn.innerHTML = '<i class="ti ti-link"></i> Vincular'; saveBtn.disabled = false;
      }
    } catch(e) {
      saveBtn.innerHTML = '<i class="ti ti-link"></i> Vincular'; saveBtn.disabled = false;
    }
  });
}

// ---- GLOBAL LEADERBOARD ----
async function renderGlobalLeaderboard(containerId) {
  const container = el(containerId);
  if (!container) return;
  container.innerHTML = `
    <div class="glb-header">
      <div class="glb-filters">
        <div class="glb-filter-group">
          <label class="field-label">Fecha</label>
          <input type="date" class="field-input glb-date-input" id="glb-date" value="${todayKey}" />
        </div>
        <div class="glb-filter-group">
          <label class="field-label">Clase</label>
          <select class="field-input glb-class-input" id="glb-class">
            ${CLASSES.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="glb-gender-tabs">
        <button class="glb-gender-btn active" data-gender="all">Todos</button>
        <button class="glb-gender-btn" data-gender="H">Hombres</button>
        <button class="glb-gender-btn" data-gender="M">Mujeres</button>
      </div>
    </div>
    <div id="glb-table"></div>`;

  let selectedGender = 'all';

  async function load() {
    const date    = el('glb-date').value;
    const classId = el('glb-class').value;
    await renderGLBTable('glb-table', date, classId, selectedGender);
  }

  el('glb-date').addEventListener('change', load);
  el('glb-class').addEventListener('change', load);
  container.querySelectorAll('.glb-gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.glb-gender-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedGender = btn.dataset.gender;
      load();
    });
  });

  await load();
}

async function renderGLBTable(tableId, date, classId, genderFilter) {
  const tableEl = el(tableId);
  if (!tableEl) return;
  tableEl.innerHTML = '<div class="atleta-loading"><i class="ti ti-loader-2"></i> Cargando...</div>';

  const scores = await ScoreAPI.getLeaderboard(date, classId);
  if (!scores.length) {
    tableEl.innerHTML = '<div class="lb-empty" style="padding:32px;text-align:center">Sin scores para este día y clase.</div>';
    return;
  }

  const scoreType = scores[0]?.score_type || 'high';

  // Get profiles for all users
  const profiles = await ProfileAPI.getMany(scores.map(s => s.user_id));
  const athletes = await AthleteAPI.list();
  const nameMap  = {};
  athletes.forEach(a => nameMap[a.id] = a.display_name);

  // Filter by gender
  let filtered = scores.filter(s => {
    if (genderFilter === 'all') return true;
    const p = profiles[s.user_id];
    return p?.gender === genderFilter;
  });

  // Sort
  filtered = filtered.sort((a, b) => {
    const na = parseFloat(a.score), nb = parseFloat(b.score);
    if (!isNaN(na) && !isNaN(nb)) return scoreType === 'high' ? nb - na : na - nb;
    return scoreType === 'high' ? b.score.localeCompare(a.score) : a.score.localeCompare(b.score);
  });

  if (!filtered.length) {
    tableEl.innerHTML = '<div class="lb-empty" style="padding:32px;text-align:center">Sin scores para este filtro.</div>';
    return;
  }

  const currentUserId = Auth.getUser()?.id;
  const medals = ['🥇','🥈','🥉'];

  const rows = filtered.map((s, i) => {
    const profile  = profiles[s.user_id];
    const name     = profile?.full_name || nameMap[s.user_id] || '—';
    const avatar   = profile?.avatar_url;
    const initials = ProfileAPI.getInitials(profile?.full_name, nameMap[s.user_id]);
    const isMe     = s.user_id === currentUserId;
    const medal    = i < 3 ? medals[i] : `${i+1}.`;
    const avatarHTML = avatar
      ? `<img src="${avatar}" class="glb-avatar-img" />`
      : `<div class="glb-avatar-placeholder">${escHtml(initials)}</div>`;
    const genderIcon = profile?.gender === 'H' ? '♂' : profile?.gender === 'M' ? '♀' : '';

    return `<div class="glb-row${isMe ? ' glb-row-me' : ''}${i < 3 ? ' glb-row-podium' : ''}">
      <span class="glb-pos">${medal}</span>
      ${avatarHTML}
      <div class="glb-name-wrap">
        <span class="glb-name">${escHtml(name)}</span>
        ${genderIcon ? `<span class="glb-gender-icon">${genderIcon}</span>` : ''}
        ${isMe ? '<span class="lb-you">Tú</span>' : ''}
      </div>
      <span class="glb-score">${escHtml(s.score)}</span>
    </div>`;
  }).join('');

  const label = scoreType === 'high' ? '↑ Más alto gana' : '↓ Más bajo gana';
  tableEl.innerHTML = `<div class="glb-type-label">${label}</div><div class="glb-rows">${rows}</div>`;
}

function showPassModal() {
  el('new-password').value = '';
  el('confirm-password').value = '';
  el('pass-error').classList.add('hidden');
  el('pass-modal').classList.remove('hidden');
}

// ---- PUSH NOTIFICATIONS ----
const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa40M-RL9YYj9ld50YOHl1t5w7gHEG1U7eTkKpBN11Z7tIvxqOhR3OJ8AyRiUE';

async function setupPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (state.role !== 'atleta') return; // Only for athletes

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return; // Already subscribed

    // Ask permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    // Subscribe
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // Save subscription to Supabase
    const token = Auth.getToken();
    const userId = Auth.getUser()?.id;
    await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        subscription: JSON.stringify(sub),
        updated_at: new Date().toISOString(),
      }),
    });
    console.log('[Push] Subscribed successfully');
  } catch(e) {
    console.log('[Push] Setup failed:', e.message);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// Send push notification to all athletes (called when saving WOD)
async function sendWodNotification(dateKey, classLabel) {
  try {
    const token = Auth.getToken();
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `🏋️ WOD de HUB MIND`,
        body: `El WOD de ${classLabel} para ${new Date(dateKey + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' })} ya está listo`,
        url: '/',
      }),
    });
    console.log('[Push] Notification sent');
  } catch(e) {
    console.log('[Push] Send failed:', e.message);
  }
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

  // Auto-refresh token every 20 minutes
  setInterval(async () => {
    if (Auth.isLoggedIn()) {
      await Auth.refreshSession();
      console.log('[Auth] Token refreshed');
    }
  }, 20 * 60 * 1000);

  // Refresh when app comes back to foreground
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && Auth.isLoggedIn()) {
      const refreshed = await Auth.refreshSession();
      if (!refreshed) {
        showLogin();
      }
    }
  });

  // Refresh on user interaction after inactivity
  let lastActivity = Date.now();
  document.addEventListener('touchstart', async () => {
    const now = Date.now();
    if (now - lastActivity > 30 * 60 * 1000) { // 30 min inactive
      if (Auth.isLoggedIn()) await Auth.refreshSession();
    }
    lastActivity = now;
  });

  // Push notifications setup
  setupPushNotifications();

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

  // Create user button
  el('create-user-btn').addEventListener('click', () => {
    el('cu-name').value = '';
    el('cu-email').value = '';
    el('cu-password').value = 'HubMindAtleta';
    el('cu-role').value = 'atleta';
    el('cu-error').classList.add('hidden');
    el('cu-result').classList.add('hidden');
    el('create-user-modal').classList.remove('hidden');
  });
  el('cu-cancel').addEventListener('click', () => el('create-user-modal').classList.add('hidden'));
  el('cu-save').addEventListener('click', async () => {
    const name     = el('cu-name').value.trim();
    const email    = el('cu-email').value.trim();
    const password = el('cu-password').value.trim();
    const role     = el('cu-role').value;
    const errEl    = el('cu-error');
    const resEl    = el('cu-result');
    const btn      = el('cu-save');

    errEl.classList.add('hidden');
    resEl.classList.add('hidden');

    if (!email || !password) {
      errEl.textContent = 'Email y contraseña son obligatorios';
      errEl.classList.remove('hidden');
      return;
    }

    btn.textContent = 'Creando...'; btn.disabled = true;
    try {
      const data = await AdminAPI.createUser(email, password, role, name);
      resEl.textContent = `✓ Usuario creado: ${email}`;
      resEl.className = 'cu-result show';
      AthleteAPI.clearCache();
      showToast(`✓ ${name || email} creado como ${role}`);
      // Clear form for next user
      el('cu-name').value = '';
      el('cu-email').value = '';
    } catch(e) {
      errEl.textContent = e.message || 'Error al crear usuario';
      errEl.classList.remove('hidden');
    } finally {
      btn.innerHTML = '<i class="ti ti-user-plus"></i> Crear';
      btn.disabled = false;
    }
  });

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
      if (btn.dataset.aview === 'dashboard')   renderAthleteDashboard();
      if (btn.dataset.aview === 'leaderboard') renderGlobalLeaderboard('aview-leaderboard');
    });
  });

  // Profile modal
  el('profile-save-btn').addEventListener('click', async () => {
    const userId   = Auth.getUser()?.id;
    const name     = el('profile-name-input').value.trim();
    const fileInput = el('profile-avatar-input');
    const btn      = el('profile-save-btn');
    const errEl    = el('profile-error');
    errEl.classList.add('hidden');
    btn.textContent = 'Guardando...'; btn.disabled = true;

    let avatarUrl = state.profile?.avatar_url;
    if (fileInput.files[0]) {
      const url = await ProfileAPI.uploadAvatar(userId, fileInput.files[0]);
      if (url) avatarUrl = url;
      else { errEl.textContent = 'Error al subir foto'; errEl.classList.remove('hidden'); btn.innerHTML = '<i class="ti ti-check"></i> Guardar'; btn.disabled = false; return; }
    }

    const gender = el('profile-gender-input').value;
    const ok = await ProfileAPI.save(userId, name, avatarUrl, gender);
    btn.innerHTML = '<i class="ti ti-check"></i> Guardar'; btn.disabled = false;
    if (ok) {
      state.profile = { ...state.profile, full_name: name, avatar_url: avatarUrl, gender };
      AthleteAPI.clearCache();
      updateAtletaTopbar(state.profile);
      el('profile-modal').classList.add('hidden');
      showToast('¡Perfil actualizado!');
      renderAthleteDashboard();
    } else {
      errEl.textContent = 'Error al guardar'; errEl.classList.remove('hidden');
    }
  });

  // Avatar preview
  el('profile-avatar-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      el('profile-avatar-preview').innerHTML = `<img src="${ev.target.result}" />`;
    };
    reader.readAsDataURL(file);
  });

  el('profile-cancel-btn').addEventListener('click', () => el('profile-modal').classList.add('hidden'));

  const session = Auth.loadSession();
  if (session && Auth.isLoggedIn()) {
    // Refresh token if expired
    if (Auth.isTokenExpired()) {
      const refreshed = await Auth.refreshSession();
      if (!refreshed) { showLogin(); return; }
    }
    const role = await RoleAPI.getRole();
    if (role === 'atleta') await showAtleta();
    else await showApp();
  } else {
    showLogin();
  }
}
// ---- MEMBERS (admin only) ----
const ROLE_PERMISSIONS = {
  admin: [
    'Crear y editar WODs', 'Crear usuarios', 'Ver y gestionar check-ins',
    'Vincular ZK IDs', 'Editar/borrar cualquier score', 'Mover WODs entre días',
    'Ver panel de administración', 'Gestionar miembros',
  ],
  coach: [
    'Ver WODs', 'Agregar scores de atletas', 'Editar/borrar scores',
    'Ver check-ins', 'Proyectar WODs',
  ],
  atleta: [
    'Ver su WOD del día', 'Subir su propio score', 'Ver rankings',
    'Editar su perfil',
  ],
};

const ROLE_LABELS = { admin: 'Admin', coach: 'Coach', atleta: 'Atleta' };
const ROLE_COLORS = { admin: 'purple', coach: 'blue', atleta: 'green' };

async function renderMembers() {
  const listEl = el('members-list');
  listEl.innerHTML = '<div class="atleta-loading"><i class="ti ti-loader-2"></i> Cargando...</div>';

  const members = await MemberAPI.list();

  function render(search = '') {
    const filtered = members.filter(m => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (m.full_name || '').toLowerCase().includes(q)
          || (m.email || '').toLowerCase().includes(q)
          || (ROLE_LABELS[m.role] || m.role).toLowerCase().includes(q);
    });

    // Stats por rol
    const counts = { admin: 0, coach: 0, atleta: 0 };
    members.forEach(m => { counts[m.role] = (counts[m.role] || 0) + 1; });
    el('members-stats').innerHTML = `
      <div class="checkin-stat"><span class="checkin-stat-num">${counts.admin}</span><span class="checkin-stat-label">Admins</span></div>
      <div class="checkin-stat"><span class="checkin-stat-num">${counts.coach}</span><span class="checkin-stat-label">Coaches</span></div>
      <div class="checkin-stat"><span class="checkin-stat-num">${counts.atleta}</span><span class="checkin-stat-label">Atletas</span></div>`;

    if (!filtered.length) {
      listEl.innerHTML = '<div class="lb-empty" style="padding:32px;text-align:center">Sin miembros que coincidan.</div>';
      return;
    }

    listEl.innerHTML = '';
    filtered.forEach(m => {
      const name     = m.full_name || m.email?.split('@')[0] || '—';
      const initials = ProfileAPI.getInitials(m.full_name, m.email);
      const avatarHTML = m.avatar_url
        ? `<img src="${m.avatar_url}" class="checkin-avatar-img" />`
        : `<div class="checkin-avatar-placeholder">${escHtml(initials)}</div>`;
      const perms = (ROLE_PERMISSIONS[m.role] || []).map(p =>
        `<span class="member-perm"><i class="ti ti-check"></i> ${escHtml(p)}</span>`).join('');
    const zkBadge = `
        <div class="member-zk-edit">
          <input class="member-zk-input" type="text" inputmode="numeric"
                 value="${escHtml(m.zk_user_id || '')}" placeholder="ZK ID"
                 data-user="${m.id}" data-name="${escHtml(m.full_name || '')}" />
          <button class="member-zk-save" data-user="${m.id}"><i class="ti ti-device-floppy"></i></button>
        </div>`;
      const card = document.createElement('div');
      card.className = 'member-card';
      card.innerHTML = `
        <div class="member-head">
          <div class="checkin-avatar">${avatarHTML}</div>
          <div class="member-info">
            <div class="member-name">${escHtml(name)}
              <span class="member-role-badge ${ROLE_COLORS[m.role] || 'green'}">${ROLE_LABELS[m.role] || m.role}</span>
            </div>
            <div class="member-email">${escHtml(m.email || '')}</div>
          </div>
          ${zkBadge}
        </div>
        <div class="member-perms">${perms}</div>`;
      listEl.appendChild(card);
    });
    // Activar guardado de ZK IDs
    listEl.querySelectorAll('.member-zk-save').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.user;
        const input  = listEl.querySelector(`.member-zk-input[data-user="${userId}"]`);
        const zkId   = input.value.trim();
        const name   = input.dataset.name;

        if (!zkId) { showToast('Escribe un ZK ID'); return; }

        // Avisar si ya está en uso (pero permitir el cambio)
        const inUseBy = await MemberAPI.zkIdInUse(zkId, userId);
        if (inUseBy) {
          if (!confirm(`El ZK ID ${zkId} ya está asignado a ${inUseBy}. ¿Reasignarlo a ${name || 'este miembro'}?`)) return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="ti ti-loader-2"></i>';
        const ok = await MemberAPI.setZkId(userId, zkId, name);
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-device-floppy"></i>';

        if (ok) {
          showToast(`✓ ZK#${zkId} asignado a ${name || 'miembro'}`);
          AthleteAPI.clearCache();
        } else {
          showToast('Error al asignar ZK ID');
        }
      });
    });
  }

  render();

  el('members-search').oninput = (e) => render(e.target.value);
}
// ---- CLASSES SCHEDULE VIEW ----
const CLASS_TYPE_INFO = {
  crossfit: { label: 'HUB X',        color: 'blue'   },
  hyrox:    { label: 'HYROX',        color: 'yellow' },
  strength: { label: 'Strength Lab', color: 'purple' },
};

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function fmtTime(t) {
  // '17:00:00' -> '5:00 PM'
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

async function renderClasses() {
  const listEl = el('classes-list');
  listEl.innerHTML = '<div class="atleta-loading"><i class="ti ti-loader-2"></i> Cargando...</div>';

  // Fecha/hora actual en CDMX
  const now = new Date();
  const cdmxStr = now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' });
  const cdmx = new Date(cdmxStr);
  const dayOfWeek = cdmx.getDay();
  const nowMin = cdmx.getHours() * 60 + cdmx.getMinutes();

  el('classes-date-label').textContent = cdmx.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });

  const classes = await ScheduleAPI.getForDay(dayOfWeek);

  if (!classes.length) {
    listEl.innerHTML = '<div class="lb-empty" style="padding:32px;text-align:center">No hay clases programadas para hoy.</div>';
    return;
  }

  listEl.innerHTML = '';
  classes.forEach(c => {
    const startMin = timeToMinutes(c.start_time);
    const endMin   = timeToMinutes(c.end_time);
    const info     = CLASS_TYPE_INFO[c.class_type] || { label: c.class_type, color: 'green' };

    let status, statusLabel;
    if (nowMin >= startMin && nowMin < endMin) { status = 'live';     statusLabel = 'En curso'; }
    else if (nowMin >= endMin)                  { status = 'past';     statusLabel = 'Terminada'; }
    else                                        { status = 'upcoming'; statusLabel = 'Próxima'; }

    const card = document.createElement('div');
    card.className = `class-card class-${status}`;
    card.innerHTML = `
      <div class="class-time-col">
        <div class="class-time-start">${fmtTime(c.start_time)}</div>
        <div class="class-time-end">${fmtTime(c.end_time)}</div>
      </div>
      <div class="class-info-col">
        <span class="class-type-badge ${info.color}">${escHtml(info.label)}</span>
      </div>
      <div class="class-status-col">
        ${status === 'live' ? '<span class="class-live-dot"></span>' : ''}
        <span class="class-status-label class-status-${status}">${statusLabel}</span>
      </div>`;
    listEl.appendChild(card);
  });

  // Auto-refresh cada minuto para actualizar el estado en curso/pasada
  if (state.view === 'classes') {
    clearTimeout(window._classesTimer);
    window._classesTimer = setTimeout(() => { if (state.view === 'classes') renderClasses(); }, 60000);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
