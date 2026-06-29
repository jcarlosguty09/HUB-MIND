// timer.js — HUB MIND Timer Engine
// Handles: stopwatch | countdown | emom | tabata | intervals

const Timer = (() => {
  let _interval   = null;
  let _running    = false;
  let _seconds    = 0;      // total elapsed seconds
  let _config     = {};
  let _phase      = 'work'; // 'work' | 'rest'
  let _phaseSecs  = 0;      // seconds elapsed in current phase
  let _round      = 1;
  let _onTick     = null;   // callback(state)
  let _onDone     = null;   // callback()

  function pad(n) { return String(Math.floor(Math.abs(n))).padStart(2, '0'); }

  function fmt(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  }

  function getState() {
    const mode = _config.mode;
    const state = {
      mode,
      running: _running,
      round: _round,
      phase: _phase,
    };

    if (mode === 'stopwatch') {
      state.display = fmt(_seconds);
      state.sub = '';
      state.phaseProgress = null;
      state.totalRounds = null;
      state.done = false;
    }

    else if (mode === 'countdown') {
      const rem = Math.max(0, _config.total - _seconds);
      state.display = fmt(rem);
      state.sub = '';
      state.phaseProgress = null;
      state.totalRounds = null;
      state.done = rem === 0;
    }

    else if (mode === 'emom') {
      const totalRounds = Math.floor(_config.total / _config.interval);
      _round = Math.min(Math.floor(_seconds / _config.interval) + 1, totalRounds);
      const phaseRem = _config.interval - (_seconds % _config.interval);
      state.display = fmt(Math.max(0, phaseRem));
      state.sub = _seconds < _config.total ? `Ronda ${_round} / ${totalRounds}` : '¡LISTO!';
      state.phaseProgress = null;
      state.round = _round;
      state.totalRounds = totalRounds;
      state.done = _seconds >= _config.total;
    }

    else if (mode === 'tabata' || mode === 'intervals') {
      const workLen = _config.work;
      const restLen = _config.rest;
      const totalRounds = _config.rounds;
      const phaseLen = _phase === 'work' ? workLen : restLen;
      const phaseRem = Math.max(0, phaseLen - _phaseSecs);

      state.display = fmt(phaseRem);
      state.sub = _phase === 'work' ? '¡TRABAJO!' : 'DESCANSO';
      state.phaseProgress = phaseRem / phaseLen; // 1 → 0
      state.round = _round;
      state.totalRounds = totalRounds;
      state.done = _round > totalRounds;
    }

    return state;
  }

  function tick() {
    _seconds++;

    const mode = _config.mode;

    if (mode === 'tabata' || mode === 'intervals') {
      _phaseSecs++;
      const phaseLen = _phase === 'work' ? _config.work : _config.rest;
      if (_phaseSecs >= phaseLen) {
        _phaseSecs = 0;
        if (_phase === 'work') {
          _phase = 'rest';
        } else {
          _phase = 'work';
          _round++;
        }
      }
      if (_round > _config.rounds) {
        stop();
        if (_onDone) _onDone();
        if (_onTick) _onTick(getState());
        return;
      }
    }

    if (mode === 'countdown' && _seconds >= _config.total) {
      stop();
      if (_onDone) _onDone();
    }

    if (mode === 'emom' && _seconds >= _config.total) {
      stop();
      if (_onDone) _onDone();
    }

    if (_onTick) _onTick(getState());
  }

  function start() {
    if (_running) return;
    _running = true;
    _interval = setInterval(tick, 1000);
    if (_onTick) _onTick(getState());
  }

  function stop() {
    _running = false;
    clearInterval(_interval);
    _interval = null;
  }

  function reset() {
    stop();
    _seconds   = 0;
    _phaseSecs = 0;
    _round     = 1;
    _phase     = 'work';
    if (_onTick) _onTick(getState());
  }

  function skipRound() {
    const mode = _config.mode;
    if (mode === 'emom') {
      _seconds = _round * _config.interval;
    } else if (mode === 'tabata' || mode === 'intervals') {
      if (_phase === 'work') {
        _phase    = 'rest';
        _phaseSecs = 0;
      } else {
        _phase    = 'work';
        _phaseSecs = 0;
        _round++;
      }
      if (_round > _config.rounds) {
        stop();
        if (_onDone) _onDone();
      }
    }
    if (_onTick) _onTick(getState());
  }

  function configure(cfg) {
    _config = { ...cfg };
    reset();
  }

  // Build timer config from current UI state
  function buildConfig(mode) {
    const g = id => {
      const el = document.getElementById(id);
      return el ? parseInt(el.value) || 0 : 0;
    };
    const cfg = { mode };
    if (mode === 'countdown') {
      cfg.total = g('t-cd-min') * 60 + g('t-cd-sec');
    } else if (mode === 'emom') {
      cfg.total    = g('t-emom-min') * 60;
      cfg.interval = g('t-emom-int') * 60;
    } else if (mode === 'tabata') {
      cfg.work   = g('t-tab-work');
      cfg.rest   = g('t-tab-rest');
      cfg.rounds = g('t-tab-rounds');
    } else if (mode === 'intervals') {
      cfg.work   = g('t-int-work');
      cfg.rest   = g('t-int-rest');
      cfg.rounds = g('t-int-rounds');
    }
    return cfg;
  }

  // Field templates
  const FIELDS = {
    stopwatch: `<p style="font-size:13px;color:var(--text3);padding:4px 0">El cronómetro cuenta desde 00:00 hacia arriba.</p>`,
    countdown: `
      <div class="timer-row">
        <div><label class="field-label">Minutos</label><input class="field-input" type="number" id="t-cd-min" value="15" min="0" max="99"></div>
        <div><label class="field-label">Segundos</label><input class="field-input" type="number" id="t-cd-sec" value="0" min="0" max="59"></div>
      </div>`,
    emom: `
      <div class="timer-row">
        <div><label class="field-label">Duración total (min)</label><input class="field-input" type="number" id="t-emom-min" value="12" min="1" max="60"></div>
        <div><label class="field-label">Intervalo (min)</label><input class="field-input" type="number" id="t-emom-int" value="1" min="1" max="10"></div>
      </div>`,
    tabata: `
      <div class="timer-row">
        <div><label class="field-label">Trabajo (seg)</label><input class="field-input" type="number" id="t-tab-work" value="20" min="5" max="120"></div>
        <div><label class="field-label">Descanso (seg)</label><input class="field-input" type="number" id="t-tab-rest" value="10" min="5" max="120"></div>
      </div>
      <div class="timer-row single">
        <div><label class="field-label">Rondas</label><input class="field-input" type="number" id="t-tab-rounds" value="8" min="1" max="64"></div>
      </div>`,
    intervals: `
      <div class="timer-row">
        <div><label class="field-label">Trabajo (seg)</label><input class="field-input" type="number" id="t-int-work" value="40" min="5" max="300"></div>
        <div><label class="field-label">Descanso (seg)</label><input class="field-input" type="number" id="t-int-rest" value="20" min="5" max="300"></div>
      </div>
      <div class="timer-row single">
        <div><label class="field-label">Rondas</label><input class="field-input" type="number" id="t-int-rounds" value="6" min="1" max="50"></div>
      </div>`,
  };

  return { start, stop, reset, skipRound, configure, buildConfig, getState, FIELDS };
})();
