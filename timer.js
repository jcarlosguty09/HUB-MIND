// timer.js — HUB MIND Timer Engine v2
// Fixed: real-time tick updates, all modes working correctly

const Timer = (() => {
  let _interval  = null;
  let _running   = false;
  let _seconds   = 0;
  let _config    = {};
  let _phase     = 'work';
  let _phaseSecs = 0;
  let _round     = 1;

  // Public callbacks — set from app.js
  let onTick = null;
  let onDone = null;

  function pad(n) { return String(Math.floor(Math.abs(n))).padStart(2, '0'); }
  function fmt(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  }

  function getState() {
    const mode = _config.mode || 'stopwatch';
    const base = { mode, running: _running, round: _round, phase: _phase, done: false, phaseProgress: null, totalRounds: null, sub: '' };

    if (mode === 'stopwatch') {
      return { ...base, display: fmt(_seconds) };
    }

    if (mode === 'countdown') {
      const rem = Math.max(0, (_config.total || 0) - _seconds);
      return { ...base, display: fmt(rem), done: rem === 0 };
    }

    if (mode === 'emom') {
      const interval = _config.interval || 60;
      const total    = _config.total || 600;
      const totalRounds = Math.floor(total / interval);
      const curRound = Math.min(Math.floor(_seconds / interval) + 1, totalRounds);
      const phaseRem = interval - (_seconds % interval);
      const done = _seconds >= total;
      return {
        ...base,
        display: fmt(done ? 0 : phaseRem),
        round: curRound,
        totalRounds,
        sub: done ? '¡LISTO!' : `Ronda ${curRound} / ${totalRounds}`,
        done,
      };
    }

    if (mode === 'tabata' || mode === 'intervals') {
      const workLen = _config.work || 20;
      const restLen = _config.rest || 10;
      const totalRounds = _config.rounds || 8;
      const phaseLen = _phase === 'work' ? workLen : restLen;
      const phaseRem = Math.max(0, phaseLen - _phaseSecs);
      const done = _round > totalRounds;
      return {
        ...base,
        display: fmt(phaseRem),
        sub: _phase === 'work' ? '¡TRABAJO!' : 'DESCANSO',
        phaseProgress: phaseRem / phaseLen,
        round: _round,
        totalRounds,
        done,
      };
    }

    return { ...base, display: '00:00' };
  }

  function tick() {
    _seconds++;

    const mode = _config.mode;
    if (mode === 'tabata' || mode === 'intervals') {
      _phaseSecs++;
      const phaseLen = _phase === 'work' ? (_config.work || 20) : (_config.rest || 10);
      if (_phaseSecs >= phaseLen) {
        _phaseSecs = 0;
        if (_phase === 'work') {
          _phase = 'rest';
        } else {
          _phase = 'work';
          _round++;
        }
      }
      if (_round > (_config.rounds || 8)) {
        _stop();
        if (onTick) onTick(getState());
        if (onDone) onDone();
        return;
      }
    }

    if (mode === 'countdown' && _seconds >= (_config.total || 0)) {
      _stop();
      if (onTick) onTick(getState());
      if (onDone) onDone();
      return;
    }

    if (mode === 'emom' && _seconds >= (_config.total || 0)) {
      _stop();
      if (onTick) onTick(getState());
      if (onDone) onDone();
      return;
    }

    if (onTick) onTick(getState());
  }

  function _stop() {
    _running = false;
    clearInterval(_interval);
    _interval = null;
  }

  function start() {
    if (_running) return;
    _running = true;
    _interval = setInterval(tick, 1000);
    if (onTick) onTick(getState());
  }

  function stop() {
    _stop();
    if (onTick) onTick(getState());
  }

  function reset() {
    _stop();
    _seconds = 0; _phaseSecs = 0; _round = 1; _phase = 'work';
    if (onTick) onTick(getState());
  }

  function skipRound() {
    const mode = _config.mode;
    if (mode === 'emom') {
      const interval = _config.interval || 60;
      const total = _config.total || 600;
      const totalRounds = Math.floor(total / interval);
      const curRound = Math.floor(_seconds / interval) + 1;
      if (curRound < totalRounds) {
        _seconds = curRound * interval;
      } else {
        _stop();
        if (onDone) onDone();
      }
    } else if (mode === 'tabata' || mode === 'intervals') {
      if (_phase === 'work') {
        _phase = 'rest'; _phaseSecs = 0;
      } else {
        _phase = 'work'; _phaseSecs = 0; _round++;
        if (_round > (_config.rounds || 8)) {
          _stop();
          if (onDone) onDone();
          if (onTick) onTick(getState());
          return;
        }
      }
    }
    if (onTick) onTick(getState());
  }

  function configure(cfg) {
    _config = { ...cfg };
    _seconds = 0; _phaseSecs = 0; _round = 1; _phase = 'work';
    _stop();
    if (onTick) onTick(getState());
  }

  // Build config from timer fields in a section
  function buildConfigFromSection(sec) {
    const mode = sec.timerMode || 'stopwatch';
    const cfg = { mode };
    const t = sec.timerConfig || {};
    if (mode === 'countdown') {
      cfg.total = (parseInt(t.cdMin) || 0) * 60 + (parseInt(t.cdSec) || 0);
    } else if (mode === 'emom') {
      cfg.total    = (parseInt(t.emomMin) || 12) * 60;
      cfg.interval = (parseInt(t.emomInt) || 1) * 60;
    } else if (mode === 'tabata') {
      cfg.work   = parseInt(t.tabWork)   || 20;
      cfg.rest   = parseInt(t.tabRest)   || 10;
      cfg.rounds = parseInt(t.tabRounds) || 8;
    } else if (mode === 'intervals') {
      cfg.work   = parseInt(t.intWork)   || 40;
      cfg.rest   = parseInt(t.intRest)   || 20;
      cfg.rounds = parseInt(t.intRounds) || 6;
    }
    return cfg;
  }

  const FIELDS = {
    stopwatch:  `<p class="timer-hint">El cronómetro cuenta desde 00:00 hacia arriba.</p>`,
    countdown:  `<div class="timer-row"><div><label class="field-label">Minutos</label><input class="field-input" data-key="cdMin" type="number" value="15" min="0" max="99"></div><div><label class="field-label">Segundos</label><input class="field-input" data-key="cdSec" type="number" value="0" min="0" max="59"></div></div>`,
    emom:       `<div class="timer-row"><div><label class="field-label">Duración total (min)</label><input class="field-input" data-key="emomMin" type="number" value="12" min="1" max="60"></div><div><label class="field-label">Intervalo (min)</label><input class="field-input" data-key="emomInt" type="number" value="1" min="1" max="10"></div></div>`,
    tabata:     `<div class="timer-row"><div><label class="field-label">Trabajo (seg)</label><input class="field-input" data-key="tabWork" type="number" value="20" min="5" max="120"></div><div><label class="field-label">Descanso (seg)</label><input class="field-input" data-key="tabRest" type="number" value="10" min="5" max="120"></div></div><div class="timer-row single"><div><label class="field-label">Rondas</label><input class="field-input" data-key="tabRounds" type="number" value="8" min="1" max="64"></div></div>`,
    intervals:  `<div class="timer-row"><div><label class="field-label">Trabajo (seg)</label><input class="field-input" data-key="intWork" type="number" value="40" min="5" max="300"></div><div><label class="field-label">Descanso (seg)</label><input class="field-input" data-key="intRest" type="number" value="20" min="5" max="300"></div></div><div class="timer-row single"><div><label class="field-label">Rondas</label><input class="field-input" data-key="intRounds" type="number" value="6" min="1" max="50"></div></div>`,
  };

  return { start, stop, reset, skipRound, configure, buildConfigFromSection, getState, FIELDS, set onTick(fn) { onTick = fn; }, set onDone(fn) { onDone = fn; } };
})();
