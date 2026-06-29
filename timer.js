// timer.js — HUB MIND Timer Engine v3
// + 3 beeps before phase ends
// + rest value bug fixed

const Timer = (() => {
  let _interval  = null;
  let _running   = false;
  let _seconds   = 0;
  let _config    = {};
  let _phase     = 'work';
  let _phaseSecs = 0;
  let _round     = 1;

  let onTick = null;
  let onDone = null;

  // ---- AUDIO ----
  let _audioCtx = null;
  function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
  }

  function beep(freq = 880, duration = 0.12, delay = 0) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.4, t + 0.01);
      gain.gain.linearRampToValueAtTime(0, t + duration);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    } catch(e) {}
  }

  // 3 short pips — called when 3s remain in a phase
  function pipPipPip() {
    beep(880, 0.10, 0.0);
    beep(880, 0.10, 0.35);
    beep(880, 0.10, 0.70);
  }

  // Long beep — phase just changed or done
  function bong() {
    beep(660, 0.5, 0.0);
  }

  // ---- HELPERS ----
  function pad(n) { return String(Math.floor(Math.abs(n))).padStart(2, '0'); }
  function fmt(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  }

  // ---- STATE ----
  function getState() {
    const mode = _config.mode || 'stopwatch';
    const base = { mode, running: _running, round: _round, phase: _phase, done: false, phaseProgress: null, totalRounds: null, sub: '' };

    if (mode === 'stopwatch') return { ...base, display: fmt(_seconds) };

    if (mode === 'countdown') {
      const rem = Math.max(0, (_config.total || 0) - _seconds);
      return { ...base, display: fmt(rem), done: rem === 0 };
    }

    if (mode === 'emom') {
      const interval    = _config.interval || 60;
      const total       = _config.total || 600;
      const totalRounds = Math.floor(total / interval);
      const curRound    = Math.min(Math.floor(_seconds / interval) + 1, totalRounds);
      const phaseRem    = interval - (_seconds % interval);
      const done        = _seconds >= total;
      return { ...base, display: fmt(done ? 0 : phaseRem), round: curRound, totalRounds, sub: done ? '¡LISTO!' : `Ronda ${curRound} / ${totalRounds}`, done };
    }

    if (mode === 'tabata' || mode === 'intervals') {
      const workLen     = _config.work || 20;
      const restLen     = _config.rest || 10;
      const totalRounds = _config.rounds || 8;
      const phaseLen    = _phase === 'work' ? workLen : restLen;
      const phaseRem    = Math.max(0, phaseLen - _phaseSecs);
      const done        = _round > totalRounds;
      return { ...base, display: fmt(phaseRem), sub: _phase === 'work' ? '¡TRABAJO!' : 'DESCANSO', phaseProgress: phaseRem / phaseLen, round: _round, totalRounds, done };
    }

    return { ...base, display: '00:00' };
  }

  // ---- TICK ----
  function tick() {
    _seconds++;
    const mode = _config.mode;

    if (mode === 'tabata' || mode === 'intervals') {
      _phaseSecs++;
      const workLen  = _config.work  || 20;
      const restLen  = _config.rest  || 10;
      const phaseLen = _phase === 'work' ? workLen : restLen;
      const phaseRem = phaseLen - _phaseSecs;

      // 3 beeps at 3 seconds remaining in any phase
      if (phaseRem === 3) pipPipPip();

      if (_phaseSecs >= phaseLen) {
        _phaseSecs = 0;
        if (_phase === 'work') {
          _phase = 'rest';
        } else {
          _phase = 'work';
          _round++;
        }
        // Phase changed — long bong (if not done)
        if (_round <= (_config.rounds || 8)) bong();
      }

      if (_round > (_config.rounds || 8)) {
        _stop();
        if (onTick) onTick(getState());
        if (onDone) onDone();
        return;
      }
    }

    if (mode === 'countdown') {
      const rem = (_config.total || 0) - _seconds;
      if (rem === 3) pipPipPip();
      if (rem <= 0) {
        _stop();
        if (onTick) onTick(getState());
        if (onDone) onDone();
        return;
      }
    }

    if (mode === 'emom') {
      const interval = _config.interval || 60;
      const phaseRem = interval - (_seconds % interval);
      if (phaseRem === 3) pipPipPip();
      if (phaseRem === interval) bong(); // new round started
      if (_seconds >= (_config.total || 0)) {
        _stop();
        if (onTick) onTick(getState());
        if (onDone) onDone();
        return;
      }
    }

    if (onTick) onTick(getState());
  }

  // ---- CONTROLS ----
  function _stop() { _running = false; clearInterval(_interval); _interval = null; }

  function start() {
    if (_running) return;
    // Resume audio context if suspended (browser policy)
    if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
    _running = true;
    _interval = setInterval(tick, 1000);
    if (onTick) onTick(getState());
  }

  function stop()  { _stop(); if (onTick) onTick(getState()); }

  function reset() {
    _stop();
    _seconds = 0; _phaseSecs = 0; _round = 1; _phase = 'work';
    if (onTick) onTick(getState());
  }

  function skipRound() {
    const mode = _config.mode;
    if (mode === 'emom') {
      const interval    = _config.interval || 60;
      const total       = _config.total || 600;
      const totalRounds = Math.floor(total / interval);
      const curRound    = Math.floor(_seconds / interval) + 1;
      if (curRound < totalRounds) { _seconds = curRound * interval; }
      else { _stop(); if (onDone) onDone(); }
    } else if (mode === 'tabata' || mode === 'intervals') {
      if (_phase === 'work') { _phase = 'rest'; _phaseSecs = 0; }
      else { _phase = 'work'; _phaseSecs = 0; _round++; }
      if (_round > (_config.rounds || 8)) { _stop(); if (onDone) onDone(); if (onTick) onTick(getState()); return; }
      bong();
    }
    if (onTick) onTick(getState());
  }

  function configure(cfg) {
    _config = { ...cfg };
    _seconds = 0; _phaseSecs = 0; _round = 1; _phase = 'work';
    _stop();
    if (onTick) onTick(getState());
  }

  // ---- BUILD CONFIG FROM SECTION ----
  // Reads timerConfig object saved in the section
  function buildConfigFromSection(sec) {
    const mode = sec.timerMode || 'stopwatch';
    const cfg  = { mode };
    const t    = sec.timerConfig || {};
    if (mode === 'countdown') {
      cfg.total  = (parseInt(t.cdMin)    || 0)  * 60 + (parseInt(t.cdSec)    || 0);
    } else if (mode === 'emom') {
      cfg.total    = (parseInt(t.emomMin) || 12) * 60;
      cfg.interval = (parseInt(t.emomInt) || 1)  * 60;
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

  // ---- FIELD TEMPLATES ----
  // Values injected dynamically by renderTimerFields() in app.js
  const FIELDS = {
    stopwatch: `<p class="timer-hint">El cronómetro cuenta desde 00:00 hacia arriba.</p>`,
    countdown: `
      <div class="timer-row">
        <div><label class="field-label">Minutos</label><input class="field-input" data-key="cdMin" type="number" value="15" min="0" max="99"></div>
        <div><label class="field-label">Segundos</label><input class="field-input" data-key="cdSec" type="number" value="0" min="0" max="59"></div>
      </div>`,
    emom: `
      <div class="timer-row">
        <div><label class="field-label">Duración total (min)</label><input class="field-input" data-key="emomMin" type="number" value="12" min="1" max="60"></div>
        <div><label class="field-label">Intervalo (min)</label><input class="field-input" data-key="emomInt" type="number" value="1" min="1" max="10"></div>
      </div>`,
    tabata: `
      <div class="timer-row">
        <div><label class="field-label">Trabajo (seg)</label><input class="field-input" data-key="tabWork" type="number" value="20" min="5" max="120"></div>
        <div><label class="field-label">Descanso (seg)</label><input class="field-input" data-key="tabRest" type="number" value="10" min="5" max="120"></div>
      </div>
      <div class="timer-row single">
        <div><label class="field-label">Rondas</label><input class="field-input" data-key="tabRounds" type="number" value="8" min="1" max="64"></div>
      </div>`,
    intervals: `
      <div class="timer-row">
        <div><label class="field-label">Trabajo (seg)</label><input class="field-input" data-key="intWork" type="number" value="40" min="5" max="300"></div>
        <div><label class="field-label">Descanso (seg)</label><input class="field-input" data-key="intRest" type="number" value="20" min="5" max="300"></div>
      </div>
      <div class="timer-row single">
        <div><label class="field-label">Rondas</label><input class="field-input" data-key="intRounds" type="number" value="6" min="1" max="50"></div>
      </div>`,
  };

  return {
    start, stop, reset, skipRound, configure, buildConfigFromSection, getState, FIELDS,
    set onTick(fn) { onTick = fn; },
    set onDone(fn) { onDone = fn; },
  };
})();
