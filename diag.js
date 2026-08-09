/* ─────────────────────────────────────────────────────────────────────────
 * Bilal diagnostics.
 *
 * Built because the worst failures this product has produced were ones nobody
 * could report. A black rectangle on a wall is indistinguishable from the
 * television being switched off. An empty prayer rail looks like the mosque
 * has not published. A mosque wrongly labelled "no jama'ah times" looks like
 * the mosque's fault. In every one of those the person sees nothing worth
 * filing a bug about, so waiting to be told is waiting forever.
 *
 * So this does three things, in descending order of how much it matters:
 *
 *   1. Catches thrown errors and unhandled rejections on its own.
 *   2. Sends a heartbeat, so a screen that goes quiet is itself the signal.
 *   3. Makes a person's own report one tap, with the state already attached.
 *
 * Everything it reads is observable from the DOM: the status line, the audio
 * line, whether the shell revealed, how many times are on the rail. It is
 * deliberately not wired into the display's internals, so refactoring the
 * display cannot quietly stop diagnostics working.
 *
 * The device id is a random string in localStorage, scoped to one browser on
 * one screen. It is there so someone can quote it from across a room. It is
 * not a user identifier and carries nothing personal.
 * ───────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  var SB  = 'https://vstfgrlkwqevonrznzwm.supabase.co/rest/v1/bilal_reports';
  var SBK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzdGZncmxrd3Fldm9ucnpuendtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDAwOTUsImV4cCI6MjA4OTk3NjA5NX0.IjPhlACgy3xslF9EvhKeIemoobHKR02LXcEgiKYHdYg';

  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no O/0, no I/1: it gets read aloud
  var errors = [];
  var MAX_ERRORS = 8;

  function deviceId() {
    try {
      var id = localStorage.getItem('bilal.did');
      if (id) return id;
      id = '';
      for (var i = 0; i < 6; i++) id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      localStorage.setItem('bilal.did', id);
      return id;
    } catch (e) { return 'NOSTORE'; }
  }

  function text(id) {
    try { var el = document.getElementById(id); return el ? el.textContent.trim() : null; }
    catch (e) { return null; }
  }

  function page() {
    var p = location.pathname.replace(/^.*\//, '') || 'index.html';
    return p.replace(/\.html$/, '');
  }

  /* What kind of screen this is, in the words a person would use rather than a
     user-agent string. The full UA goes in too, but "Fire TV" is what makes a
     report readable at a glance. */
  function device() {
    var ua = navigator.userAgent || '';
    if (/AFT[A-Z0-9]/i.test(ua))          return 'Fire TV';
    if (/Echo|AEO[A-Z]/i.test(ua))        return 'Echo Show';
    if (/KF[A-Z]{2}/i.test(ua))           return 'Fire tablet';
    if (/Silk/i.test(ua))                 return 'Amazon Silk';
    if (/iPhone|iPod/i.test(ua))          return 'iPhone';
    if (/iPad/i.test(ua))                 return 'iPad';
    if (/Android.*Mobile/i.test(ua))      return 'Android phone';
    if (/Android/i.test(ua))              return 'Android tablet';
    return 'desktop';
  }

  function config() {
    try { return JSON.parse(localStorage.getItem('bilal.config') || 'null'); }
    catch (e) { return null; }
  }

  /* How old the cached timetable is, and whether it still covers today. The
     second half is the one that matters: a cache can be recent and still have
     run out of days. */
  function cache(cfg) {
    if (!cfg || !cfg.slug) return null;
    try {
      var c = JSON.parse(localStorage.getItem('bilal.tt.' + cfg.slug) || 'null');
      if (!c || !c.j) return { present: false };
      var d = new Date(), k = d.getFullYear() + '-' +
        ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      var rows = (c.j.timetable || []);
      var hasToday = false;
      for (var i = 0; i < rows.length; i++)
        if (String(rows[i].date).slice(0, 10) === k) { hasToday = true; break; }
      return { present: true, ageHours: Math.round((Date.now() - c.t) / 3600000),
               days: rows.length, coversToday: hasToday };
    } catch (e) { return { present: false, error: true }; }
  }

  function snapshot() {
    var cfg = config();
    var shell = document.getElementById('shell');
    var rail  = document.getElementById('rail');
    return {
      at: new Date().toISOString(),
      tzOffsetMin: new Date().getTimezoneOffset(),
      device: device(),
      ua: (navigator.userAgent || '').slice(0, 300),
      viewport: (innerWidth || 0) + 'x' + (innerHeight || 0),
      screen: ((screen && screen.width) || 0) + 'x' + ((screen && screen.height) || 0),
      dpr: global.devicePixelRatio || 1,
      url: location.href.slice(0, 300),
      online: navigator.onLine !== false,
      mosque: cfg ? { slug: cfg.slug, name: cfg.name, walk: cfg.walk } : null,
      cache: cache(cfg),
      /* The three lines that would have caught 9 August's failures without
         anyone filing anything: did the shell ever become visible, does the
         rail actually have times on it, and what does the status line claim. */
      shellRevealed: shell ? shell.classList.contains('go') : null,
      railTimes: rail ? (rail.textContent.match(/\d{1,2}:\d{2}/g) || []).length : null,
      status: text('statText'),
      audio: text('audioState'),
      errors: errors.slice()
    };
  }

  /* asDevice lets a phone file a report against the screen it is complaining
     about, so a person's words land beside that screen's own heartbeats and
     errors instead of beside the phone's. The phone's own id is kept in diag
     so the two are never confused. */
  function send(kind, message, asDevice) {
    var diag = snapshot();
    if (asDevice) diag.reportedFrom = deviceId();
    var body = {
      kind: kind, device_id: asDevice || deviceId(), page: page(),
      message: message || null, diag: diag
    };
    try {
      return fetch(SB, {
        method: 'POST', keepalive: true,
        headers: { 'apikey': SBK, 'Authorization': 'Bearer ' + SBK,
                   'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(body)
      });
    } catch (e) { return Promise.resolve(); }
  }

  function note(where, msg, extra) {
    if (errors.length >= MAX_ERRORS) return;      // a loop must not become a flood
    errors.push({ where: where, msg: String(msg).slice(0, 300), extra: extra || null,
                  at: new Date().toISOString() });
  }

  global.addEventListener('error', function (e) {
    note('error', e.message, (e.filename || '').replace(/^.*\//, '') + ':' + e.lineno);
    send('error', e.message);
  });
  global.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    note('rejection', (r && r.message) || r);
    send('error', 'unhandled rejection: ' + ((r && r.message) || r));
  });

  /* A screen that stops reporting is the signal. Half-hourly is often enough to
     notice a display that died overnight and rare enough that a handful of
     screens will not fill a table. */
  setTimeout(function () { send('heartbeat'); }, 20000);
  setInterval(function () { send('heartbeat'); }, 30 * 60 * 1000);

  global.BilalDiag = { id: deviceId, snapshot: snapshot, send: send, note: note };
})(this);
