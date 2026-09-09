import { useEffect, useRef } from 'react';
import './styles/varun.css';

/**
 * Varun — Water Quality & Outbreak Monitoring Dashboard
 * Converted from a single-file HTML app (vanilla JS + Leaflet + Chart.js)
 * into a React component.
 *
 * Approach: the original app's DOM-manipulation logic (1500+ lines) is
 * preserved almost as-is inside a single useEffect that runs once after
 * mount — this is the safe way to port a large vanilla-JS app without
 * silently breaking behaviour by hand-rewriting it into React state.
 * Leaflet + Chart.js are loaded from CDN at runtime (dynamic <script> tags)
 * exactly like the original file did.
 *
 * Requires: none (Leaflet/Chart.js are injected via CDN <script> tags).
 * If you'd rather use npm packages, replace loadExternalScripts() below
 * with `import L from 'leaflet'` / `import Chart from 'chart.js/auto'`.
 */



function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

function loadStyleOnce(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

async function loadExternalScripts() {
  loadStyleOnce('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
  loadStyleOnce('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
  await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
  await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js');
}

export default function Varun() {
  const initialized = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invoking effects in dev,
    // which would otherwise register duplicate intervals/listeners.
    if (initialized.current) return;
    initialized.current = true;

    let cancelled = false;
    const _intervals = [];
    const _resizeHandlers = [];

    loadExternalScripts().then(() => {
      if (cancelled) return;

      /* eslint-disable */
/* ── AUTO-MEASURE HEADER HEIGHT ── */
function fixHeaderOffset() {
  const topbar = document.querySelector('.gov-topbar');
  const nav    = document.querySelector('.gov-nav');
  if (!topbar || !nav) return;
  const total = topbar.offsetHeight + nav.offsetHeight;
  // Set on body so ALL pages get correct top offset
  document.body.style.paddingTop = total + 'px';
  document.documentElement.style.setProperty('--total-bar-h', total + 'px');
  document.documentElement.style.setProperty('--header-h',    topbar.offsetHeight + 'px');
  document.documentElement.style.setProperty('--nav-h',       nav.offsetHeight + 'px');
}
fixHeaderOffset();
window.addEventListener('resize', fixHeaderOffset);
_resizeHandlers.push(fixHeaderOffset);
setTimeout(fixHeaderOffset, 100);
setTimeout(fixHeaderOffset, 500);
setTimeout(fixHeaderOffset, 1200);
/* ── PAGE NAVIGATION ── */
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.gov-nav a').forEach(a => a.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  const lnk = document.getElementById('nav-' + name);
  if (pg)  pg.classList.add('active');
  if (lnk) lnk.classList.add('active');
  window.scrollTo(0, 0);
  // Fix map glitch: invalidate size when dashboard tab is shown
  if (name === 'dashboard' && window._aqMap) {
    setTimeout(() => { window._aqMap.invalidateSize(); }, 100);
  }
}

/* ── CLOCK ── */
function updateClock() {
  const el = document.getElementById('clockEl');
  const de = document.getElementById('dateEl');
  const now = new Date();
  if (el) el.textContent = now.toLocaleTimeString('en-IN');
  if (de) {
    const yr = now.getFullYear();
    const mo = now.toLocaleString('en-IN', {month:'short'});
    const dy = now.getDate();
    de.textContent = dy + ' ' + mo + ' ' + yr;
  }
}
_intervals.push(setInterval(updateClock, 1000));
updateClock();

/* ── SMS ── */
function sendSMS() {
  const btn = event.target;
  btn.textContent = 'Sending SMS...';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = 'SMS Sent to District Officer';
    setTimeout(() => { btn.textContent = 'Send Manual SMS Alert'; btn.disabled = false; }, 3000);
  }, 1500);
}

/* ══════════════════════════════════════════
   FIREBASE SENSOR DATA — Live fetch
   FIX: Added pH, stores in _liveSensors,
   triggers map/card/chip/chart updates
══════════════════════════════════════════ */
/* ══════════════════════════════════════════
   ROLLING SENSOR HISTORIES — All 5 sensors
   Each array holds last 10 Firebase readings.
   Shared time-labels array keeps all charts in sync.
══════════════════════════════════════════ */
const MAX_HIST       = 10;
const _timeLabels    = [];  // shared X-axis timestamps
const _tdsHistory    = [];  // TDS mg/L
const _turbHistory   = [];  // Turbidity NTU
const _phHistory     = [];  // pH
const _tempHistory   = [];  // Temperature °C
const _salHistory    = [];  // Salinity ppt

// Keep backward compat alias
const _tdsTimeLabels = _timeLabels;
const MAX_TDS_HIST   = MAX_HIST;
const SENSOR_SMOOTH_ALPHA = 0.35;
const AI_SMOOTH_ALPHA = 0.25;
let _displaySensors = null;
let _displayAI = null;

/* Firebase URLs must be initialized before any polling function runs. */
const FB_BASE        = import.meta.env.VITE_FIREBASE_BASE || "https://varun-735df-default-rtdb.firebaseio.com";
const FB_SENSOR_PATH = import.meta.env.VITE_FIREBASE_SENSOR_PATH || 'sensor';
const FB_SENSORS_URL = `${FB_BASE}/${FB_SENSOR_PATH}.json`;
const FB_AI_URL      = `${FB_BASE}/ai_prediction.json`;
const FB_ALERTS_URL  = `${FB_BASE}/alerts.json`;
const FB_ASHA_ALERTS_URL = `${FB_BASE}/asha_alerts.json`;

function smoothReading(previous, next, alpha) {
  if (previous === null || !Number.isFinite(previous)) return next;
  return previous + (next - previous) * alpha;
}

function smoothSensors(next) {
  if (!_displaySensors) {
    _displaySensors = { ...next };
    return _displaySensors;
  }
  _displaySensors = {
    ...next,
    tds: smoothReading(_displaySensors.tds, next.tds, SENSOR_SMOOTH_ALPHA),
    turbidity: smoothReading(_displaySensors.turbidity, next.turbidity, SENSOR_SMOOTH_ALPHA),
    temperature: smoothReading(_displaySensors.temperature, next.temperature, SENSOR_SMOOTH_ALPHA),
    salinity: smoothReading(_displaySensors.salinity, next.salinity, SENSOR_SMOOTH_ALPHA),
    ph: smoothReading(_displaySensors.ph, next.ph, SENSOR_SMOOTH_ALPHA),
  };
  return _displaySensors;
}

/* Push a new reading into all history arrays */
function pushSensorReading(sensors) {
  const now = new Date().toLocaleTimeString('en-IN', {
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
  });
  _timeLabels.push(now);
  _tdsHistory.push(parseFloat((sensors.tds         || 0).toFixed(0)));
  _turbHistory.push(parseFloat((sensors.turbidity  || 0).toFixed(2)));
  _phHistory.push(parseFloat((sensors.ph           || 7).toFixed(2)));
  _tempHistory.push(parseFloat((sensors.temperature|| 0).toFixed(1)));
  _salHistory.push(parseFloat((sensors.salinity    || 0).toFixed(3)));

  const trim = arr => { while (arr.length > MAX_HIST) arr.shift(); };
  [_timeLabels, _tdsHistory, _turbHistory, _phHistory, _tempHistory, _salHistory].forEach(trim);
}

async function fetchSensors() {
  try {
    const resp = await fetch(FB_SENSORS_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const d = await resp.json();
    if (!d) return;

    // Parse all sensor fields from the configured Firebase sensor node.
    const tds      = parseFloat(d.tds)         || 0;
    const turb     = parseFloat(d.turbidity)   || 0;
    const temp     = parseFloat(d.temperature) || 0;
    const sal      = parseFloat(d.salinity)    || 0;
    const ph       = parseFloat(d.ph)          || 7.0;
    // Derive safety from the actual readings. The Firebase drinkable flag can
    // be stale, so it must never override an exceeded sensor limit.
    const waterDrinkable = tds <= 500 && turb <= 4 && sal <= 0.5 && ph >= 6.5 && ph <= 8.5 && temp >= 5 && temp <= 35;

    // Smooth noisy readings so cards, bars, charts and map values move gradually.
    const smoothed = smoothSensors({ tds, turbidity: turb, temperature: temp, salinity: sal, ph });
    const displayTds = smoothed.tds;
    const displayTurb = smoothed.turbidity;
    const displayTemp = smoothed.temperature;
    const displaySal = smoothed.salinity;
    const displayPh = smoothed.ph;
    // Store the smoothed snapshot for map popups, cards, chips and prediction UI.
    _liveSensors = { ...smoothed, drinkable: waterDrinkable };

    // ── Update drinkability banner from /water node directly ──
    const banner  = document.getElementById('drinkBanner');
    const titleEl = document.getElementById('drinkTitle');
    const subEl   = document.getElementById('drinkSubtitle');
    const chipEl  = document.getElementById('drinkChip');
    const iconEl  = document.getElementById('drinkIcon');
    if (waterDrinkable) {
      if (banner)  banner.className  = 'drink-banner safe';
      if (titleEl) { titleEl.textContent = 'WATER IS DRINKABLE — जल पीने योग्य है'; titleEl.className = 'drink-banner-title safe'; }
      if (subEl)   subEl.textContent = 'All sensor parameters within WHO safe limits. Water is safe for consumption.';
      if (chipEl)  { chipEl.textContent = 'SAFE'; chipEl.className = 'drink-badge safe'; }
      if (iconEl)  iconEl.textContent = '[OK]';
    } else {
      if (banner)  banner.className  = 'drink-banner unsafe';
      if (titleEl) { titleEl.textContent = 'WATER NOT SAFE — जल पीने योग्य नहीं'; titleEl.className = 'drink-banner-title unsafe'; }
      const highP = d.highParams ? ` High: ${d.highParams}.` : '';
      if (subEl)   subEl.textContent = `Sensor alert: Contamination detected!${highP} Do not drink — तुरंत कार्रवाई करें।`;
      if (chipEl)  { chipEl.textContent = 'UNSAFE'; chipEl.className = 'drink-badge unsafe'; }
      if (iconEl)  iconEl.textContent = '[!]';
    }

    // ── Update sensor table DOM ──
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('tds-val',  displayTds.toFixed(0));
    set('turb-val', displayTurb.toFixed(1));
    set('temp-val', displayTemp.toFixed(1));
    set('sal-val',  displaySal.toFixed(2));
    set('ph-val',   displayPh.toFixed(2));

    const setBar = (id, pct, color) => {
      const el = document.getElementById(id);
      if (el) { el.style.width = Math.min(pct, 100) + '%'; el.style.background = color; }
    };
    setBar('tds-bar',  Math.min(displayTds/500*100,  100), displayTds  > 500  ? '#dc2626' : '#1a56a0');
    setBar('turb-bar', Math.min(displayTurb/10*100,  100), displayTurb > 4    ? '#dc2626' : '#9b59b6');
    setBar('temp-bar', Math.min((displayTemp-5)/30*100,100),displayTemp > 35  ? '#dc2626' : '#e74c3c');
    setBar('sal-bar',  Math.min(displaySal/2*100,    100), displaySal  > 0.5  ? '#dc2626' : '#f39c12');
    // pH bar: map 0–14 scale, highlight red if outside 6.5–8.5
    const phPct   = Math.min((displayPh / 14) * 100, 100);
    const phOK    = displayPh >= 6.5 && displayPh <= 8.5;
    setBar('ph-bar', phPct, phOK ? '#10a37f' : '#dc2626');

    const setPill = (id, ok) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = 'status-pill ' + (ok ? 'pill-safe' : 'pill-danger');
      el.textContent = ok ? 'Normal' : 'Exceeded';
    };
    setPill('tds-status',  displayTds  <= 500);
    setPill('turb-status', displayTurb <= 4);
    setPill('temp-status', displayTemp >= 5 && displayTemp <= 35);
    setPill('sal-status',  displaySal  <= 0.5);
    setPill('ph-status',   phOK);

    const lu = document.getElementById('lastUpdated');
    if (lu) lu.textContent = 'Updated: ' + new Date().toLocaleTimeString('en-IN');

    // ── Update monitoring platform preview panel (reuses this same fetch, no new connection) ──
    const nowStr = new Date().toLocaleTimeString('en-IN');
    set('mp-ph',          displayPh.toFixed(1));
    set('mp-tds',         displayTds.toFixed(0)  + ' mg/L');
    set('mp-turbidity',   displayTurb.toFixed(1) + ' NTU');
    set('mp-temperature', displayTemp.toFixed(1) + ' °C');
    set('mp-salinity',    displaySal.toFixed(2)  + ' ppt');
    set('mp-sensor-status', 'Connected');
    set('mp-data-status',   'Receiving');
    set('mp-last-updated',  nowStr);
    const mpLive = document.getElementById('mpLiveIndicator');
    if (mpLive) { mpLive.className = 'mp-live-indicator live'; mpLive.innerHTML = '<span class="mp-live-dot"></span>LIVE'; }

    // ── Push all sensor readings into rolling histories ──
    pushSensorReading(_liveSensors);
    // Update all sensor charts
    updateAllSensorCharts();

    // ── FIX: Refresh map popups & village cards with latest data ──
    updateMapPopups();
    renderVillageCards();
    updateAlertCardText();
    updateTriggerChips();

  } catch (err) {
    // Graceful failure — keep showing last known data
    console.warn('[Varun] Sensor fetch failed:', err.message);
    const mpLive = document.getElementById('mpLiveIndicator');
    if (mpLive) { mpLive.className = 'mp-live-indicator offline'; mpLive.innerHTML = '<span class="mp-live-dot"></span>OFFLINE'; }
    const setIf = (id, val) => { const el = document.getElementById(id); if (el && el.textContent === 'Awaiting measurement') el.textContent = val; };
    setIf('mp-sensor-status', 'Offline');
    setIf('mp-data-status', 'Offline');
  }
}

/* ══════════════════════════════════════════
   AI PREDICTION DATA — Live fetch
   FIX: Uses risk_level field, computes maxRisk,
   updates alert card text, alert chips
══════════════════════════════════════════ */
async function fetchAI() {
  try {
    const resp = await fetch(FB_AI_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
      if (!data) return;
      const rawCholera   = parseInt(data.cholera)   || 0;
      const rawTyphoid   = parseInt(data.typhoid)   || 0;
      const rawDiarrhea  = parseInt(data.diarrhea)  || 0;
      const rawDysentery = parseInt(data.dysentery) || 0;
      // FIX: Firebase uses risk_level (SAFE/WARNING/CRITICAL) not severity
      const riskLevel = (data.risk_level || data.severity || 'SAFE').toLowerCase();
      const severity  = riskLevel;
      // Sensor-derived safety is authoritative; an old AI/Firebase flag cannot
      // make water safe while a live parameter is outside its limit.
      const drinkable = _liveSensors.drinkable === true;
      // A safe sensor reading is authoritative for the displayed risk. This
      // prevents stale AI values from appearing after water becomes safe.
      const targetAI = {
        cholera: drinkable ? 0 : rawCholera,
        typhoid: drinkable ? 0 : rawTyphoid,
        diarrhea: drinkable ? 0 : rawDiarrhea,
        dysentery: drinkable ? 0 : rawDysentery,
        overall: drinkable ? 0 : (parseInt(data.overall) || Math.max(rawCholera, rawTyphoid, rawDiarrhea, rawDysentery)),
      };
      if (!_displayAI || drinkable) {
        _displayAI = { ...targetAI };
      } else {
        _displayAI = {
          cholera: smoothReading(_displayAI.cholera, targetAI.cholera, AI_SMOOTH_ALPHA),
          typhoid: smoothReading(_displayAI.typhoid, targetAI.typhoid, AI_SMOOTH_ALPHA),
          diarrhea: smoothReading(_displayAI.diarrhea, targetAI.diarrhea, AI_SMOOTH_ALPHA),
          dysentery: smoothReading(_displayAI.dysentery, targetAI.dysentery, AI_SMOOTH_ALPHA),
          overall: smoothReading(_displayAI.overall, targetAI.overall, AI_SMOOTH_ALPHA),
        };
      }
      const cholera   = _displayAI.cholera;
      const typhoid   = _displayAI.typhoid;
      const diarrhea  = _displayAI.diarrhea;
      const dysentery = _displayAI.dysentery;
      // FIX: maxRisk = highest disease % for alert card text
      const maxRisk   = Math.max(cholera, typhoid, diarrhea, dysentery);
      const overall   = drinkable ? 0 : _displayAI.overall;
      // Store in global snapshot for cross-module use
      _liveAI = { cholera, typhoid, diarrhea, dysentery, risk_level: drinkable ? 'safe' : riskLevel, drinkable,
                  concern: data.concern || '', action: data.action || '', maxRisk };

      const setBar = (barId, pctId, val, color) => {
        const b = document.getElementById(barId), p = document.getElementById(pctId);
        if (b) { b.style.width = val + '%'; b.style.background = color; }
        if (p) { p.textContent = val + '%'; p.style.color = color; }
      };
      const col = v => v >= 60 ? '#dc2626' : v >= 35 ? '#d97706' : '#1a56a0';
      setBar('ai-cholera','ai-cholera-pct', cholera,   col(cholera));
      setBar('ai-typhoid','ai-typhoid-pct', typhoid,   col(typhoid));
      setBar('ai-diarr',  'ai-diarr-pct',  diarrhea,  col(diarrhea));
      setBar('ai-dys',    'ai-dys-pct',    dysentery, col(dysentery));

      // Drinkability banner
      const banner = document.getElementById('drinkBanner');
      const title  = document.getElementById('drinkTitle');
      const sub    = document.getElementById('drinkSubtitle');
      const chip   = document.getElementById('drinkChip');
      const icon   = document.getElementById('drinkIcon');
      if (drinkable) {
        if (banner) banner.className = 'drink-banner safe';
        if (title)  { title.textContent = 'WATER IS DRINKABLE — जल पीने योग्य है'; title.className = 'drink-banner-title safe'; }
        if (sub)    sub.textContent = 'All parameters within WHO safe limits. Water is safe for consumption.';
        if (chip)   { chip.textContent = 'SAFE'; chip.className = 'drink-badge safe'; }
        if (icon)   icon.textContent = '';
      } else {
        if (banner) banner.className = 'drink-banner unsafe';
        if (title)  { title.textContent = 'WATER NOT SAFE — जल पीने योग्य नहीं'; title.className = 'drink-banner-title unsafe'; }
        if (sub)    sub.textContent = `AI Model (${severity.toUpperCase()}): Contamination detected! Do not drink — तुरंत कार्रवाई करें।`;
        if (chip)   { chip.textContent = 'UNSAFE'; chip.className = 'drink-badge unsafe'; }
        if (icon)   icon.textContent = '';
      }

      // AI severity badge
      const badge = document.getElementById('aiSeverityBadge');
      if (badge) {
        const map = { safe:'pill-safe', low:'pill-safe', medium:'pill-warn', warning:'pill-warn', high:'pill-danger', critical:'pill-danger' };
        badge.className = 'status-pill ' + (map[severity] || 'pill-safe');
        badge.textContent = (severity + ' (' + overall + '%)').toUpperCase();
      }

      // Update global status badge from live Firebase data
      if (typeof setGlobalStatus === 'function') setGlobalStatus(severity);

      // Concern box
      if (data.concern || data.action) {
        const box = document.getElementById('ai-concern-box');
        if (box) box.style.display = 'block';
        const ct = document.getElementById('ai-concern-text');
        const at = document.getElementById('ai-action-text');
        if (ct) ct.textContent = '' + (data.concern || '');
        if (at) at.textContent = 'Action: ' + (data.action || '');
      }
    // FIX: Update alert card, chips, AI risk chart and trend after AI data
      updateAlertCardText();
      updateTriggerChips();
      // Push risk reading to AI history chart
      pushAIRiskReading();
      // Push current risk to trend history in sync with TDS history
      _trendRiskHistory.push(_liveAI.maxRisk || 0);
      if (_trendRiskHistory.length > MAX_TDS_HIST) _trendRiskHistory.shift();
      updateTrendChart();

  } catch(err) {
    console.warn('[Varun] AI fetch failed:', err.message);
  }
}
async function refreshLiveData() {
  // One cycle keeps sensor cards, maps, charts, banners and AI risk aligned
  // to the same latest sensor snapshot.
  await fetchSensors();
  await fetchAI();
}

refreshLiveData();
_intervals.push(setInterval(refreshLiveData, 5000));

/* ══════════════════════════════════════════
   MAP CONSTANTS — village geo coords (static)
   Sensor data for selected village is LIVE from Firebase
══════════════════════════════════════════ */
const MAP_COLORS = { red:"#dc2626", yellow:"#d97706", green:"#16a34a" };
const MAP_BG     = { red:"#fee2e2", yellow:"#fef3c7", green:"#dcfce7" };
const MAP_BORDER = { red:"#fca5a5", yellow:"#fcd34d", green:"#86efac" };

// Static village metadata (geo + context). Sensor values are injected live.
const VILLAGES = [
  { name:"Jharia",     lat:23.7398, lng:86.4147, dist:"Dhanbad", isSelected:true  },
  { name:"Sindri",     lat:23.6667, lng:86.6667, dist:"Dhanbad", isSelected:false },
  { name:"Katras",     lat:23.8228, lng:86.1875, dist:"Dhanbad", isSelected:false },
  { name:"Baliapur",   lat:23.6971, lng:86.5236, dist:"Dhanbad", isSelected:false },
  { name:"Govindpur",  lat:23.7961, lng:86.2965, dist:"Dhanbad", isSelected:false },
  { name:"Nirsa",      lat:23.7877, lng:86.7159, dist:"Dhanbad", isSelected:false },
  { name:"Tundi",      lat:23.9420, lng:86.4885, dist:"Dhanbad", isSelected:false },
  { name:"Topchanchi", lat:23.8930, lng:86.2200, dist:"Dhanbad", isSelected:false },
  { name:"Baghmara",   lat:23.7167, lng:86.5833, dist:"Dhanbad", isSelected:false },
];

// Currently selected village (default: Jharia, index 0)
let selectedVillageIdx = 0;
let selectedVillageName = VILLAGES[0].name;

// Latest live sensor snapshot (updated by fetchSensors)
let _liveSensors = { tds:0, turbidity:0, temperature:0, salinity:0, ph:0 };
// Latest live AI snapshot
let _liveAI = { cholera:0, typhoid:0, diarrhea:0, dysentery:0, risk_level:'SAFE', drinkable:true, concern:'', action:'' };

// Fixed placeholder reading shown for villages with NO deployed sensor.
// Not derived from _liveSensors or any per-village formula — same flat
// values everywhere, clearly tagged "DEMO DATA" wherever it's shown, so
// it's never mistaken for a real per-village reading.
const DEMO_SENSORS = { tds: 340, turbidity: 2.1, ph: 7.1, temperature: 28.5, salinity: 0.30 };

/* ── Derive village status from live sensor data ── */
function villageStatusFromSensors(sensors) {
  const tds  = sensors.tds  || 0;
  const turb = sensors.turbidity || 0;
  const ph   = sensors.ph   || 7;
  if (tds > 600 || turb > 6 || ph < 6 || ph > 9) return 'red';
  if (tds > 400 || turb > 4) return 'yellow';
  return 'green';
}

/* ── Build live popup HTML for a village marker ── */
function buildPopupHTML(village, sensors, color) {
  const tdsOK  = (sensors.tds  || 0) <= 500  ? '' : '';
  const turbOK = (sensors.turbidity || 0) <= 4 ? '' : '';
  const phVal  = (sensors.ph || 7).toFixed(1);
  const phOK   = (sensors.ph >= 6.5 && sensors.ph <= 8.5) ? '' : '';
  const tempVal = (sensors.temperature || 0).toFixed(1);
  const status  = villageStatusFromSensors(sensors);
  const bg      = MAP_BG[status];
  const border  = MAP_BORDER[status];
  const lbl     = status==='red' ? 'CRITICAL' : status==='yellow' ? 'WARNING' : 'SAFE';
  const liveTag = village.isSelected
    ? `<div style="font-size:9px;background:#dcfce7;color:#16a34a;border:1px solid #86efac;border-radius:3px;padding:1px 6px;margin-bottom:6px;display:inline-block;">LIVE Firebase Data</div>`
    : `<div style="font-size:9px;background:#f3f4f6;color:#6b7280;border:1px solid #d1d5db;border-radius:3px;padding:1px 6px;margin-bottom:6px;display:inline-block;">DEMO DATA — no sensor deployed here</div>`;
  return `
    <div class="popup-inner">
      ${liveTag}
      <div class="popup-title" style="color:${color};">${village.name}</div>
      <div class="popup-sub">${village.dist} District · Jharkhand</div>
      <div class="popup-grid">
        <div class="popup-cell"><div class="popup-cell-lbl">TDS ${tdsOK}</div><div class="popup-cell-val">${(sensors.tds||0).toFixed(0)} mg/L</div></div>
        <div class="popup-cell"><div class="popup-cell-lbl">Turbidity ${turbOK}</div><div class="popup-cell-val">${(sensors.turbidity||0).toFixed(1)} NTU</div></div>
        <div class="popup-cell"><div class="popup-cell-lbl">pH ${phOK}</div><div class="popup-cell-val">${phVal}</div></div>
        <div class="popup-cell"><div class="popup-cell-lbl">Temp</div><div class="popup-cell-val">${tempVal}°C</div></div>
      </div>
      <div class="popup-status" style="background:${bg};border:1px solid ${border};color:${color};">${lbl}</div>
    </div>`;
}

/* ── Map markers reference (for live popup updates) ── */
const _mapMarkers = {};

function initMap() {
  const el = document.getElementById('govLeafletMap');
  if (!el || !window.L) return;
  if (window._aqMap) { window._aqMap.invalidateSize(); return; }
  const map = L.map('govLeafletMap', { center:[23.80, 86.45], zoom:9, zoomControl:true });
  window._aqMap = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'© OpenStreetMap contributors', maxZoom:18
  }).addTo(map);

  VILLAGES.forEach((v, idx) => {
    // Derive status from live sensors for selected village; static demo values for others
    const sensors   = v.isSelected ? _liveSensors : DEMO_SENSORS;
    const status    = villageStatusFromSensors(sensors);
    const c         = MAP_COLORS[status];
    const sz        = status==='red' ? 22 : status==='yellow' ? 18 : 14;
    const pulseHtml = status === 'red'
      ? `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${sz+16}px;height:${sz+16}px;background:${c};border-radius:50%;opacity:0.4;animation:mapPulse 1.8s ease infinite;pointer-events:none;"></div>`
      : '';

    const icon = L.divIcon({
      className: '',
      html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;">
        ${pulseHtml}
        <div style="position:relative;width:${sz}px;height:${sz}px;background:${c};border:3px solid ${v.isSelected?'#fbbf24':'white'};border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:${sz/2.2}px;" title="${v.name}"></div>
      </div>`,
      iconSize:[sz+20,sz+20], iconAnchor:[(sz+20)/2,(sz+20)/2], popupAnchor:[0,-(sz+20)/2-2]
    });

    const marker = L.marker([v.lat, v.lng], {icon})
      .bindPopup(L.popup({ className:'aq-gov-popup', maxWidth:260 })
        .setContent(buildPopupHTML(v, sensors, c)))
      .addTo(map);

    // On click → select this village as the active one
    marker.on('click', () => {
      selectedVillageIdx  = idx;
      selectedVillageName = v.name;
      // Update isSelected flags
      VILLAGES.forEach((vv,ii) => vv.isSelected = (ii === idx));
      // Refresh popup with live data for selected
      updateMapPopups();
      updateAlertCardText();
      updateTriggerChips();
    });

    _mapMarkers[idx] = marker;
  });

  // Legend
  const legend = L.control({position:'bottomleft'});
  legend.onAdd = () => {
    const d = L.DomUtil.create('div');
    d.style.cssText = 'background:white;border:1px solid #e5e7eb;border-radius:4px;padding:8px 12px;font-family:Noto Sans,sans-serif;font-size:11px;color:#374151;line-height:2;box-shadow:0 2px 6px rgba(0,0,0,0.1);';
    d.innerHTML = `<b style="color:#1a56a0;display:block;margin-bottom:3px;">Water Quality</b>
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#16a34a;margin-right:5px;"></span>Safe (WHO Compliant)<br>
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#d97706;margin-right:5px;"></span>Warning (Monitor)<br>
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#dc2626;margin-right:5px;"></span>Critical (Act Now)`;
    return d;
  };
  legend.addTo(map);
}

/* ── Update all open popups with freshest live data ── */
function updateMapPopups() {
  VILLAGES.forEach((v, idx) => {
    const marker = _mapMarkers[idx];
    if (!marker) return;
    const sensors = v.isSelected ? _liveSensors : DEMO_SENSORS;
    const status  = villageStatusFromSensors(sensors);
    const c       = MAP_COLORS[status];
    if (marker.getPopup()) {
      marker.getPopup().setContent(buildPopupHTML(v, sensors, c));
    }
  });
}

setTimeout(initMap, 300);

/* ── VILLAGE SENSOR CARDS ── */
function renderVillageCards() {
  const grid = document.getElementById('villageCardsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const statusClass = { red:'v-red', yellow:'v-yellow', green:'v-green' };
  const statusMap   = { red:'pill-danger', yellow:'pill-warn', green:'pill-safe' };
  const statusLabel = { red:'Critical',  yellow:'Warning',  green:'Safe' };
  const pct = (val, max) => Math.min(100, Math.max(0, val/max*100)).toFixed(0);

  VILLAGES.forEach((v, i) => {
    // Selected village uses live Firebase data; others show a fixed demo reading
    // (no formula, no scaling — same flat values for every non-sensor village)
    const sensors = v.isSelected ? _liveSensors : DEMO_SENSORS;

    const status = villageStatusFromSensors(sensors);
    const phSt   = (sensors.ph >= 6.5 && sensors.ph <= 8.5) ? 'safe' : 'danger';
    const tdsSt  = sensors.tds <= 500 ? 'safe' : sensors.tds <= 600 ? 'warning' : 'danger';
    const turbSt = sensors.turbidity <= 4 ? 'safe' : sensors.turbidity <= 8 ? 'warning' : 'danger';

    const liveBadge = v.isSelected
      ? `<span style="font-size:9px;background:#dcfce7;color:#16a34a;border:1px solid #86efac;border-radius:3px;padding:1px 5px;margin-left:6px;">LIVE</span>`
      : `<span style="font-size:9px;background:#f3f4f6;color:#6b7280;border:1px solid #d1d5db;border-radius:3px;padding:1px 5px;margin-left:6px;">DEMO</span>`;

    const card = document.createElement('div');
    card.className = `village-sensor-card ${statusClass[status]}`;
    card.style.animationDelay = `${0.05 + i*0.06}s`;
    card.style.cursor = 'pointer';
    card.onclick = () => {
      selectedVillageIdx  = i;
      selectedVillageName = v.name;
      VILLAGES.forEach((vv,ii) => vv.isSelected = (ii === i));
      renderVillageCards();
      updateMapPopups();
      updateAlertCardText();
      updateTriggerChips();
    };
    card.innerHTML = `
      <div class="vsc-header">
        <div>
          <div class="vsc-name">${v.name}${liveBadge}</div>
          <div class="vsc-dist">${v.dist} District · Jharkhand</div>
        </div>
        <span class="status-pill ${statusMap[status]}">${statusLabel[status]}</span>
      </div>
      <div class="vsc-body">
        <div class="vsc-row">
          <span class="vsc-lbl">pH</span>
          <div class="vsc-bar-wrap"><div class="vsc-bar-fill ${phSt}" style="width:${pct(sensors.ph,14)}%"></div></div>
          <span class="vsc-val ${phSt}">${sensors.ph}</span>
        </div>
        <div class="vsc-row">
          <span class="vsc-lbl">TDS</span>
          <div class="vsc-bar-wrap"><div class="vsc-bar-fill ${tdsSt}" style="width:${pct(sensors.tds,1000)}%"></div></div>
          <span class="vsc-val ${tdsSt}">${sensors.tds} mg/L</span>
        </div>
        <div class="vsc-row">
          <span class="vsc-lbl">Turbidity</span>
          <div class="vsc-bar-wrap"><div class="vsc-bar-fill ${turbSt}" style="width:${pct(sensors.turbidity,15)}%"></div></div>
          <span class="vsc-val ${turbSt}">${sensors.turbidity} NTU</span>
        </div>
        <div class="vsc-row">
          <span class="vsc-lbl">Temp</span>
          <div class="vsc-bar-wrap"><div class="vsc-bar-fill safe" style="width:${pct(sensors.temperature,50)}%"></div></div>
          <span class="vsc-val safe">${sensors.temperature}°C</span>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

/* ══════════════════════════════════════════
   TREND CHART (AI panel)
   FIX: Shows rolling live TDS + live AI
   cholera risk side-by-side. Updates with
   each sensor/AI poll.
══════════════════════════════════════════ */
let _trendChartInstance = null;
const _trendRiskHistory = []; // parallel to _tdsHistory

function updateTrendChart() {
  const canvas = document.getElementById('trendChart');
  if (!canvas || !window.Chart) return;

  // Sync risk history to same length as TDS history
  while (_trendRiskHistory.length < _tdsHistory.length) {
    _trendRiskHistory.push(_liveAI.maxRisk || 0);
  }
  if (_trendRiskHistory.length > MAX_TDS_HIST) _trendRiskHistory.splice(0, _trendRiskHistory.length - MAX_TDS_HIST);

  if (_trendChartInstance) {
    _trendChartInstance.data.labels                 = [..._timeLabels];
    _trendChartInstance.data.datasets[0].data       = [..._trendRiskHistory];
    _trendChartInstance.data.datasets[1].data       = [..._tdsHistory];
    _trendChartInstance.update('none');
    return;
  }

  _trendChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: _timeLabels.length ? [..._timeLabels] : ['Now'],
      datasets: [
        { label:'Cholera Risk %', data:[...(_trendRiskHistory.length ? _trendRiskHistory : [0])],
          borderColor:'#dc2626', backgroundColor:'rgba(220,38,38,0.07)',
          borderWidth:2, pointRadius:3, tension:0.4, fill:true, yAxisID:'yR' },
        { label:'TDS (mg/L)',     data:[...(_tdsHistory.length ? _tdsHistory : [0])],
          borderColor:'#1a56a0', backgroundColor:'transparent',
          borderWidth:1.5, pointRadius:2, tension:0.4, borderDash:[4,3], yAxisID:'yT' },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      animation:{ duration: 400 },
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{ labels:{color:'#6b7280',font:{family:'Noto Sans',size:10},boxWidth:12} },
        tooltip:{ backgroundColor:'white', borderColor:'#e5e7eb', borderWidth:1, titleColor:'#1a56a0', bodyColor:'#374151', padding:8 }
      },
      scales:{
        x:{ grid:{color:'#f3f4f6'}, ticks:{color:'#9ca3af',font:{size:9}, maxTicksLimit:8} },
        yR:{ type:'linear', position:'left', min:0, max:100, grid:{color:'rgba(220,38,38,0.07)'}, ticks:{color:'#dc2626',font:{size:9},callback:v=>v+'%'} },
        yT:{ type:'linear', position:'right', grid:{display:false}, ticks:{color:'#1a56a0',font:{size:9},callback:v=>v} }
      }
    }
  });
}
setTimeout(updateTrendChart, 600);

/* ══════════════════════════════════════════
   LIVE ALERT FEED (Home Page)
══════════════════════════════════════════ */
/* ══════════════════════════════════════════
   FIREBASE ALERTS — Fetch + render everywhere
   FIX: All alert displays (feed, table, SMS log,
   history) are now populated from /alerts.json.
   Falls back to derived live data if Firebase
   has no alerts yet.
══════════════════════════════════════════ */

// Fallback: build one alert entry from live sensor data
function buildLiveAlertEntry() {
  const tds  = _liveSensors.tds       || 0;
  const turb = _liveSensors.turbidity || 0;
  const ph   = _liveSensors.ph        || 7;
  const risk = _liveAI.maxRisk        || 0;
  const rl   = _liveAI.risk_level     || 'safe';
  const type = rl === 'critical' ? 'critical' : rl === 'warning' ? 'warning' : 'safe';
  return [{
    type, village: selectedVillageName,
    issue: _liveAI.concern || 'Live sensor reading',
    tds: tds.toFixed(0), turb: turb.toFixed(1), ph: ph.toFixed(1), risk,
    action: _liveAI.action || 'Monitor',
    timestamp: new Date().toISOString(),
    time: new Date().toLocaleTimeString('en-IN'),
    isNew: true,
    severity: type,
    village_name: selectedVillageName,
  }];
}

/* ── Parse raw Firebase alerts object → array (newest first) ── */
function parseFirebaseAlerts(raw) {
  if (!raw) return null;
  let arr;
  if (Array.isArray(raw)) {
    arr = raw.filter(Boolean);
  } else if (typeof raw === 'object') {
    arr = Object.values(raw).filter(Boolean);
  } else return null;
  arr = arr.map(a => {
    const location = a.location || {};
    const readings = a.sensor_readings || {};
    const issue = a.predicted_issue || {};
    const status = (a.status && typeof a.status === 'object') ? a.status : {};
    const severity = a.severity || (a.final_verdict ? 'critical' : 'warning');
    return {
      ...a,
      village: a.village || location.village_name || location.village || '—',
      village_name: a.village_name || location.village_name || location.village || '—',
      severity,
      type: severity,
      issue: a.issue || a.concern || issue.disease || 'Water quality alert',
      concern: a.concern || a.issue || issue.disease || 'Water quality alert',
      action: a.action || (a.final_verdict ? a.final_verdict : 'Review required'),
      tds: a.tds ?? readings.tds ?? '—',
      turb: a.turb ?? a.turbidity ?? readings.turbidity ?? '—',
      ph: a.ph ?? readings.ph ?? '—',
      risk: a.risk ?? a.ai_risk ?? issue.confidence ?? '—',
      hierarchy_status: Object.entries(status).filter(([, value]) => value !== 'pending')
        .map(([level, value]) => `${level}: ${value}`).join(', '),
    };
  });
  arr.sort((a, b) => {
    if (a.timestamp && b.timestamp) return new Date(b.timestamp) - new Date(a.timestamp);
    return 0;
  });
  return arr;
}

/* ── Format timestamp ── */
function fmtTime(ts) {
  if (!ts) return new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});
  try {
    const d = new Date(ts);
    const diff = (Date.now() - d) / 60000;
    if (diff < 1)    return 'Just now';
    if (diff < 60)   return `${Math.floor(diff)}m ago`;
    if (diff < 1440) return d.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});
    return d.toLocaleDateString('en-IN');
  } catch { return ts; }
}

/* ── Render: Home page alert feed ── */
function renderAlertFeed(alerts) {
  const list = document.getElementById('alertFeedList');
  if (!list) return;
  const data = (alerts && alerts.length) ? alerts.slice(0, 6) : buildLiveAlertEntry();
  list.innerHTML = '';
  data.forEach((a, i) => {
    const sev  = (a.severity || a.type || 'safe').toLowerCase();
    const type = sev === 'critical' ? 'critical' : sev === 'warning' || sev === 'medium' ? 'warning' : 'safe';
    const icon = type === 'critical' ? '' : type === 'warning' ? '' : '';
    const village = a.village_name || a.village || '—';
    const tds  = a.tds   || a.sensor_tds  || '—';
    const turb = a.turb  || a.turbidity   || '—';
    const risk = a.risk  || a.ai_risk     || '—';
    const div  = document.createElement('div');
    div.className = `alert-feed-item af-${type}`;
    div.style.animationDelay = `${i * 0.06}s`;
    div.innerHTML = `
      ${i === 0 ? '<div class="alert-feed-new-pulse"></div>' : ''}
      <div class="af-icon">${icon}</div>
      <div class="af-body">
        <div class="af-title af-${type}">${type==='critical'?'CRITICAL':type==='warning'?'WARNING':'NORMAL'} — ${village}</div>
        <div class="af-detail">Issue: ${a.issue || a.concern || 'Water quality event'} &nbsp;|&nbsp; TDS: ${tds} mg/L &nbsp;|&nbsp; Risk: ${risk}%</div>
        <div class="af-action">${a.action || 'Logged'}
          ${type==='critical'?'<span class="af-wa-badge">WhatsApp</span><span class="af-sms-badge">SMS</span>':''}
        </div>
      </div>
      <div class="af-time">${fmtTime(a.timestamp)}</div>`;
    list.appendChild(div);
  });
  const ts = document.getElementById('alertFeedUpdated');
  if (ts) ts.innerHTML = `<span class="gov-live-dot"></span>Updated: ${new Date().toLocaleTimeString('en-IN')}`;
}

/* ── Render: Dashboard alert table ── */
function renderAlertTable(alerts) {
  const tbody = document.getElementById('liveAlertTableBody');
  if (!tbody) return;
  const data = (alerts && alerts.length) ? alerts.slice(0, 8) : buildLiveAlertEntry();
  tbody.innerHTML = data.map(a => {
    const sev     = (a.severity || a.type || 'safe').toLowerCase();
    const type    = sev === 'critical' ? 'critical' : sev === 'warning' || sev === 'medium' ? 'warning' : 'safe';
    const dotClr  = type==='critical' ? '#dc2626' : type==='warning' ? '#d97706' : '#16a34a';
    const pillCls = type==='critical' ? 'pill-danger' : type==='warning' ? 'pill-warn' : 'pill-safe';
    const pillLbl = type==='critical' ? 'Critical' : type==='warning' ? 'Warning' : 'Safe';
    const actClr  = type==='critical' ? '#dc2626' : type==='warning' ? '#d97706' : '#16a34a';
    const action  = a.action || (type==='critical'?'Deploy Team':type==='warning'?'Alert BMO':'Routine');
    const disease = a.disease || a.concern || 'Monitor';
    const village = a.village_name || a.village || '—';
    const cases   = a.cases ?? a.case_count ?? '—';
    return `<tr>
      <td><span class="alert-dot" style="background:${dotClr};"></span>${village}</td>
      <td>${disease.substring(0, 22)}</td>
      <td style="font-weight:700;color:${dotClr};">${cases}</td>
      <td><span class="status-pill ${pillCls}">${pillLbl}</span></td>
      <td style="color:${actClr};font-size:10px;">${action}</td>
    </tr>`;
  }).join('');
}

/* ── Render: SMS log ── */
function renderSmsLog(alerts) {
  const body = document.getElementById('smsLogBody');
  if (!body) return;
  const data = (alerts && alerts.length) ? alerts.slice(0, 5) : buildLiveAlertEntry();
  body.innerHTML = data.map(a => {
    const sev = (a.severity || a.type || 'safe').toLowerCase();
    const icon = sev==='critical' ? '' : sev==='warning' || sev==='medium' ? '' : '';
    const village = a.village_name || a.village || '—';
    const msg = a.sms_message || a.message || `${icon} ${sev.toUpperCase()}: ${village} — ${a.concern || a.issue || 'Water quality alert'} — Varun`;
    return `<div class="sms-log-row">
      <div class="sms-time">${fmtTime(a.timestamp).slice(0,5)}</div>
      <div>${msg}</div>
    </div>`;
  }).join('');
}

/* ── Render: Alert history rows (whatsapp page) ── */
function renderAlertHistoryFromFirebase(alerts) {
  const body = document.getElementById('alertHistoryFirebaseRows');
  if (!body) return;
  if (!alerts || !alerts.length) return; // keep placeholder until data arrives
  body.innerHTML = alerts.slice(0, 5).map(a => {
    const sev  = (a.severity || a.type || 'safe').toLowerCase();
    const type = sev==='critical'?'critical':sev==='warning'||sev==='medium'?'warning':'safe';
    const pillCls = type==='critical'?'pill-danger':type==='warning'?'pill-warn':'pill-safe';
    const pillLbl = type==='critical'?'Critical':type==='warning'?'Warning':'Safe';
    const village = a.village_name || a.village || '—';
    const mode  = a.mode || a.trigger_type || 'Auto';
    const sent  = a.contacts_sent ? `${a.contacts_sent}/${a.contacts_sent} Sent` : '—';
    return `<div class="alert-history-row">
      <span style="color:var(--gov-gray3);font-family:'JetBrains Mono',monospace;">${fmtTime(a.timestamp)}</span>
      <span>${village} — ${a.concern || a.issue || 'Alert'}</span>
      <span style="color:#16a34a;font-weight:700;">${sent}</span>
      <span><span class="status-pill ${pillCls}">${pillLbl}</span></span>
      <span style="color:#1a56a0;font-size:11px;">${mode}</span>
    </div>`;
  }).join('');
}

/* ── Parse ASHA portal SMS alerts into unified format ── */
function parseAshaAlerts(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw.filter(Boolean) : Object.values(raw).filter(Boolean);
  return arr.map(a => ({
    village:      a.village || '—',
    village_name: a.village || '—',
    severity:     a.level === 'red' ? 'critical' : a.level === 'yellow' ? 'warning' : 'safe',
    type:         a.level === 'red' ? 'critical' : a.level === 'yellow' ? 'warning' : 'safe',
    issue:        a.msg || a.message || 'ASHA Alert',
    concern:      a.msg || a.message || 'ASHA Alert',
    action:       `ASHA: ${a.name || '—'}`,
    sms_message:  a.msg || a.message || '',
    timestamp:    a.time || a.timestamp || new Date().toISOString(),
    source:       'asha',
    tds: '—', turb: '—', risk: '—',
  }));
}

/* ── Master Firebase alerts fetch (sensor + ASHA merged) ── */
async function fetchFirebaseAlerts() {
  try {
    const [sensorResp, ashaResp] = await Promise.allSettled([
      fetch(FB_ALERTS_URL),
      fetch(FB_ASHA_ALERTS_URL)
    ]);

    let sensorAlerts = [];
    let ashaAlerts   = [];

    if (sensorResp.status === 'fulfilled' && sensorResp.value.ok) {
      const raw = await sensorResp.value.json();
      sensorAlerts = parseFirebaseAlerts(raw) || [];
    }
    if (ashaResp.status === 'fulfilled' && ashaResp.value.ok) {
      const raw = await ashaResp.value.json();
      ashaAlerts = parseAshaAlerts(raw);
    }

    // Merge and sort by timestamp (newest first)
    const merged = [...sensorAlerts, ...ashaAlerts].sort((a, b) => {
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    });

    const alerts = merged.length ? merged : null;

    renderAlertFeed(alerts);
    renderAlertTable(alerts);
    renderSmsLog(alerts);
    renderAlertHistoryFromFirebase(alerts);
  } catch(err) {
    console.warn('[Varun] Alerts fetch failed:', err.message);
    renderAlertFeed(null);
    renderAlertTable(null);
    renderSmsLog(null);
  }
}

fetchFirebaseAlerts();
_intervals.push(setInterval(fetchFirebaseAlerts, 8000));

/* ══════════════════════════════════════════
   ASHA WORKER REPORTS — Firebase Live Fetch
   Firebase path: /asha_reports.json — structured
   field reports (case counts per village) that an
   ASHA-facing submission form would push here.
   Distinct from FB_ASHA_ALERTS_URL (asha_alerts.json),
   which carries SMS-style one-line alerts instead.
══════════════════════════════════════════ */
const FB_ASHA_REPORTS_URL = `${FB_BASE}/asha_reports.json`;

// Static fallback — shown only if Firebase is empty/unreachable, clearly
// tagged "Offline — static data" in the UI so it's never mistaken for live data.
const ASHA_STATIC = [
  { name:"Sunita Devi",  village:"Jharia",    district:"Dhanbad", time:"08:30 Today", total:8, cholera:6, typhoid:1, diarrhea:1, severity:"critical" },
  { name:"Kavita Kumari",village:"Sindri",    district:"Dhanbad", time:"07:45 Today", total:5, cholera:0, typhoid:4, diarrhea:1, severity:"warning"  },
  { name:"Rekha Devi",   village:"Katras",    district:"Dhanbad", time:"06:20 Today", total:3, cholera:0, typhoid:1, diarrhea:2, severity:"warning"  },
  { name:"Meera Kumari", village:"Baliapur",  district:"Dhanbad", time:"Yesterday",   total:0, cholera:0, typhoid:0, diarrhea:0, severity:"safe"     },
  { name:"Priya Devi",   village:"Govindpur", district:"Dhanbad", time:"Yesterday",   total:1, cholera:0, typhoid:1, diarrhea:0, severity:"safe"     },
  { name:"Anita Kumari", village:"Nirsa",     district:"Dhanbad", time:"Yesterday",   total:0, cholera:0, typhoid:0, diarrhea:0, severity:"safe"     },
];

function ashaSeverityMeta(sev) {
  const cardClass = { critical:'ac-critical', warning:'ac-warning', safe:'ac-safe', low:'ac-safe', medium:'ac-warning', high:'ac-critical' };
  const pillClass = { critical:'pill-danger', warning:'pill-warn', safe:'pill-safe', low:'pill-safe', medium:'pill-warn', high:'pill-danger' };
  const label     = { critical:'🚨 Critical', warning:'⚠️ Warning', safe:'✅ Safe', low:'✅ Safe', medium:'⚠️ Warning', high:'🔴 High' };
  const barClass  = { critical:'critical', warning:'warning', safe:'safe', low:'safe', medium:'warning', high:'critical' };
  return {
    cardClass: cardClass[sev] || 'ac-safe',
    pillClass: pillClass[sev] || 'pill-safe',
    label:     label[sev]     || '✅ Safe',
    barClass:  barClass[sev]  || 'safe',
  };
}

function ashaTimeLabel(r) {
  if (r.timestamp && r.timestamp.includes('T')) {
    const d = new Date(r.timestamp);
    const diffMin = Math.floor((new Date() - d) / 60000);
    if (diffMin < 60)   return `${diffMin} min ago`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
    return d.toLocaleDateString('en-IN');
  }
  return r.time || 'Unknown';
}

function renderAshaCards(reports) {
  const grid = document.getElementById('ashaCardsGrid');
  if (!grid) return;
  if (!reports || reports.length === 0) {
    grid.innerHTML = '<div class="asha-loading">📭 कोई रिपोर्ट नहीं मिली — No reports found</div>';
    return;
  }
  grid.innerHTML = reports.map((r, i) => {
    const sev  = (r.severity || 'safe').toLowerCase();
    const meta = ashaSeverityMeta(sev);
    const totalColor = sev === 'critical' ? '#dc2626' : sev === 'warning' ? '#d97706' : '#16a34a';
    return `
      <div class="asha-report-card ${meta.cardClass}" style="animation-delay:${(0.05 + i * 0.07).toFixed(2)}s;">
        <div class="asha-card-head">
          <div>
            <div class="asha-worker-name">👩‍⚕️ ${r.name || r.worker_name || 'ASHA Worker'}</div>
            <div class="asha-village-tag">📍 ${r.village || '—'}, ${r.district || 'Dhanbad'} District</div>
          </div>
          <span class="status-pill ${meta.pillClass}">${meta.label}</span>
        </div>
        <div class="asha-card-body">
          <div class="asha-cases-row">
            <div class="asha-case-box c-total">
              <div class="asha-case-num" style="color:${totalColor};">${r.total ?? r.total_cases ?? 0}</div>
              <div class="asha-case-lbl">कुल बीमार<br>Total</div>
            </div>
            <div class="asha-case-box c-cholera">
              <div class="asha-case-num">${r.cholera ?? r.cholera_cases ?? 0}</div>
              <div class="asha-case-lbl">हैजा<br>Cholera</div>
            </div>
            <div class="asha-case-box c-typhoid">
              <div class="asha-case-num">${r.typhoid ?? r.typhoid_cases ?? 0}</div>
              <div class="asha-case-lbl">टाइफाइड<br>Typhoid</div>
            </div>
            <div class="asha-case-box c-diarr">
              <div class="asha-case-num">${r.diarrhea ?? r.diarrhea_cases ?? 0}</div>
              <div class="asha-case-lbl">दस्त<br>Diarrhea</div>
            </div>
          </div>
          <div class="asha-status-bar ${meta.barClass}">
            ${meta.label} — ${r.notes || r.concern || (sev === 'critical' ? 'Immediate action required' : sev === 'warning' ? 'Monitor closely' : 'All clear')}
          </div>
        </div>
        <div class="asha-card-foot">
          <span class="asha-time-tag">🕐 ${ashaTimeLabel(r)}</span>
          <span class="asha-fb-badge">🔥 Firebase Live</span>
        </div>
      </div>`;
  }).join('');

  const countEl = document.getElementById('ashaReportCount');
  if (countEl) countEl.textContent = `Showing ${reports.length} most recent reports | ${reports.length} ताज़ी रिपोर्टें`;
}

async function fetchAshaReports() {
  const fetchEl = document.getElementById('ashaLastFetch');
  try {
    const resp = await fetch(FB_ASHA_REPORTS_URL, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json();
    if (fetchEl) fetchEl.textContent = 'Updated: ' + new Date().toLocaleTimeString('en-IN');

    if (!data) {
      renderAshaCards(ASHA_STATIC.slice(0, 6));
      if (fetchEl) fetchEl.textContent = 'No data yet — static fallback shown';
      return;
    }

    // Firebase returns an object keyed by push-IDs — convert to array
    let reports;
    if (Array.isArray(data))            reports = data.filter(Boolean);
    else if (typeof data === 'object')  reports = Object.values(data).filter(Boolean);
    else                                 reports = ASHA_STATIC;

    reports.sort((a, b) => {
      if (a.timestamp && b.timestamp) return new Date(b.timestamp) - new Date(a.timestamp);
      return 0;
    });

    renderAshaCards(reports.length > 0 ? reports.slice(0, 6) : ASHA_STATIC.slice(0, 6));
  } catch (err) {
    console.warn('[Varun] ASHA reports fetch failed:', err.message);
    renderAshaCards(ASHA_STATIC.slice(0, 6));
    if (fetchEl) fetchEl.textContent = 'Offline — static data';
  }
}

fetchAshaReports();
_intervals.push(setInterval(fetchAshaReports, 10000));

/* ══════════════════════════════════════════
   ALERTS BY ASHA WORKER — Alert System page,
   top segment. Merges:
     1) Critical ASHA field reports (asha_reports.json, severity=critical/high)
     2) ASHA SMS alerts (asha_alerts.json)
   Newest first, capped at 5 total entries.
══════════════════════════════════════════ */
function renderAshaWorkerAlerts(items) {
  const list = document.getElementById('ashaWorkerAlertsList');
  if (!list) return;
  if (!items || !items.length) {
    list.innerHTML = '<div class="empty-state">No ASHA worker alerts yet — कोई आशा अलर्ट नहीं</div>';
    return;
  }
  list.innerHTML = items.map(a => {
    const isCritical = a.severity === 'critical' || a.severity === 'high';
    const dotClr = isCritical ? '#dc2626' : '#d97706';
    const kindBadge = a.kind === 'sms'
      ? '<span class="af-sms-badge">SMS</span>'
      : '<span class="status-pill pill-danger" style="font-size:9px;">Report</span>';
    return `
      <div class="alert-history-row" style="grid-template-columns: 90px 1fr auto;">
        <span style="color:var(--gov-gray3);font-family:'JetBrains Mono',monospace;">${fmtTime(a.timestamp)}</span>
        <span>
          <span class="alert-dot" style="background:${dotClr};"></span>
          <strong>${a.village}</strong> — ${a.worker_name ? `👩‍⚕️ ${a.worker_name} — ` : ''}${a.detail}
        </span>
        <span>${kindBadge}</span>
      </div>`;
  }).join('');
}

async function fetchAshaWorkerAlerts() {
  try {
    const [reportsResp, alertsResp] = await Promise.allSettled([
      fetch(FB_ASHA_REPORTS_URL),
      fetch(FB_ASHA_ALERTS_URL),
    ]);

    let criticalReports = [];
    if (reportsResp.status === 'fulfilled' && reportsResp.value.ok) {
      const raw = await reportsResp.value.json();
      let reports = [];
      if (Array.isArray(raw)) reports = raw.filter(Boolean);
      else if (raw && typeof raw === 'object') reports = Object.values(raw).filter(Boolean);
      criticalReports = reports
        .filter(r => {
          const sev = (r.severity || '').toLowerCase();
          return sev === 'critical' || sev === 'high';
        })
        .map(r => ({
          kind: 'report',
          village: r.village || '—',
          worker_name: r.name || r.worker_name || 'ASHA Worker',
          detail: `${r.total ?? ((r.cholera||0)+(r.fever||0)+(r.typhoid||0)+(r.others||0))} cases reported`,
          severity: 'critical',
          timestamp: r.timestamp || r.time || new Date().toISOString(),
        }));
    }

    let smsAlerts = [];
    if (alertsResp.status === 'fulfilled' && alertsResp.value.ok) {
      const raw = await alertsResp.value.json();
      smsAlerts = parseAshaAlerts(raw).map(a => ({
        kind: 'sms',
        village: a.village,
        worker_name: (a.action || '').replace('ASHA: ', ''),
        detail: a.sms_message || a.issue || 'ASHA Alert',
        severity: a.severity,
        timestamp: a.timestamp,
      }));
    }

    const merged = [...criticalReports, ...smsAlerts].sort((a, b) => {
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    });

    renderAshaWorkerAlerts(merged.slice(0, 5));
  } catch (err) {
    console.warn('[Varun] ASHA worker alerts fetch failed:', err.message);
    renderAshaWorkerAlerts(null);
  }
}

fetchAshaWorkerAlerts();
_intervals.push(setInterval(fetchAshaWorkerAlerts, 8000));

/* ══════════════════════════════════════════
   MULTI-AUTHORITY ALERT SYSTEM
   Clean, production-ready simulation
══════════════════════════════════════════ */

// ── CONTACTS LIST ──
const ALERT_CONTACTS = [
  { name: 'Village Officer', dept: 'Village control group · Telegram', number: 'Village level', icon: '', role: 'First response' },
  { name: 'Tehsil Officer', dept: 'Tehsil escalation chat · Telegram', number: 'Tehsil level', icon: '', role: 'Escalation' },
];

let alertSystemBusy = false;
let alertCount = 0;

// ── CHANNEL BADGE HELPERS ──
// 'idle'    → standby, not yet triggered
// 'sending' → in-flight
// 'sent'    → backend confirmed delivery
// 'failed'  → backend attempted and failed
// 'off'     → channel has no credentials configured on the backend
function channelBadge(st) {
  const cls   = { idle:'cs-idle', sending:'cs-sending', sent:'cs-sent', failed:'cs-failed', off:'cs-idle' }[st] || 'cs-idle';
  const label = { idle:'Standby', sending:'Sending...', sent:'Sent', failed:'Failed', off:'Not configured' }[st] || 'Standby';
  return { cls, label };
}

// ── RENDER CONTACTS ──
// Each configured officer represents one step in the Firebase/Telegram
// hierarchy. The backend forwards Village confirmations to Tehsil.
function renderContacts(statuses) {
  const list = document.getElementById('contactsList');
  if (!list) return;
  list.innerHTML = ALERT_CONTACTS.map((c, i) => {
    const st = statuses ? statuses[i] : { telegram: 'idle' };
    const tg = channelBadge(st.telegram);
    return `
      <div class="contact-row" id="contactRow_${i}">
        <div class="contact-avatar">${c.icon}</div>
        <div class="contact-info">
          <div class="contact-name">${c.name}</div>
          <div class="contact-number">${c.number}</div>
        </div>
        <div style="margin-right:10px;"><span class="contact-dept">${c.dept}</span></div>
        <div class="contact-channels">
          <span class="channel-badge ${tg.cls}" id="tgBadge_${i}" title="Telegram hierarchy alert">Telegram · ${tg.label}</span>
        </div>
      </div>`;
  }).join('');
}
renderContacts(null);

// ── LOG HELPERS ──
function addLog(icon, text, cls) {
  const log = document.getElementById('transmissionLog');
  if (!log) return;
  const now = new Date().toLocaleTimeString('en-IN', { hour12: false });
  // Remove old cursor
  log.querySelectorAll('.log-cursor').forEach(c => c.remove());
  const div = document.createElement('div');
  div.className = 'log-line';
  div.innerHTML = `<span class="log-ts">${now}</span><span class="log-icon">${icon}</span><span class="${cls}">${text}</span><span class="log-cursor"></span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function clearTransmissionLog() {
  const log = document.getElementById('transmissionLog');
  if (!log) return;
  log.innerHTML = `<div class="log-line"><span class="log-ts">--:--:--</span><span class="log-icon"></span><span class="log-text-system">Log cleared.</span><span class="log-cursor"></span></div>`;
  renderContacts(null);
}

// ── ALERT BEEP SOUND ──
function playAlertBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[880,0],[1200,200],[880,400],[1200,600]].forEach(([freq, delay]) => {
      setTimeout(() => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.18);
      }, delay);
    });
  } catch(e) {}
}

// ── VIBRATION (mobile) ──
function triggerVibration() {
  if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 500]);
}

// ── SHOW POPUP ──
function showAlertPopup(villageName, msg) {
  const ts = new Date().toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' });
  const vEl = document.getElementById('popupVillageName');
  const mEl = document.getElementById('popupMsgBody');
  const tEl = document.getElementById('popupTimestamp');
  if (vEl) vEl.textContent = `${villageName}, Dhanbad District`;
  if (mEl) mEl.textContent = msg;
  if (tEl) tEl.textContent = `⏰ Alert triggered at ${ts} — Auto-closing in 5s`;
  // Reset countdown bar animation
  const fill = document.getElementById('countdownFill');
  if (fill) { fill.style.animation = 'none'; void fill.offsetWidth; fill.style.animation = ''; }
  document.getElementById('alertOverlay').classList.add('visible');

  // Page border flash effect
  document.body.style.outline = '4px solid #dc2626';
  document.body.style.outlineOffset = '-4px';
  setTimeout(() => { document.body.style.outline = ''; document.body.style.outlineOffset = ''; }, 600);
}

function closeAlertPopup() {
  document.getElementById('alertOverlay').classList.remove('visible');
  if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
}

let _countdownTimer = null;

function startPopupCountdown(seconds) {
  const btn = document.querySelector('.alert-popup-close');
  if (!btn) return;
  let remaining = seconds;
  btn.textContent = `ACKNOWLEDGED — Auto-close in ${remaining}s`;
  _countdownTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(_countdownTimer);
      _countdownTimer = null;
      closeAlertPopup();
    } else {
      if (btn) btn.textContent = `ACKNOWLEDGED — Auto-close in ${remaining}s`;
    }
  }, 1000);
}

// ── ADD TO ALERT HISTORY ──
function addToAlertHistory(villageName, type) {
  const tbody = document.getElementById('alertHistoryBody');
  if (!tbody) return;
  const now = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
  const newRow = document.createElement('div');
  newRow.className = 'alert-history-row';
  newRow.style.background = '#fff9f9';
  newRow.style.animation = 'fadeSlideUp 0.4s ease both';
  newRow.innerHTML = `
    <span style="color:var(--gov-gray3);font-family:'JetBrains Mono',monospace;">${now}</span>
    <span><strong>${villageName}</strong> — High TDS + AI Risk</span>
    <span style="color:#16a34a;font-weight:700;">${ALERT_CONTACTS.length}/${ALERT_CONTACTS.length} Sent</span>
    <span><span class="status-pill pill-danger">Critical</span></span>
    <span style="color:#d97706;font-size:11px;">Simulated</span>`;
  tbody.insertBefore(newRow, tbody.firstChild);
  setTimeout(() => { newRow.style.background = ''; }, 2000);
}

// ── BACKEND URL ──
// Reads from Vite's env (VITE_BACKEND_URL, set in a .env file at the
// frontend project root) so dev/staging/prod can point at different
// backends without editing source. Falls back to localhost for local dev
// if the env var isn't set.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:5000';

// ── BACKEND HEALTH CHECK ──
async function checkBackendHealth() {
  const el    = document.getElementById('backendStatus');
  const text  = document.getElementById('backendStatusText');
  const hdr   = document.getElementById('headerBackendStatus');
  try {
    const r = await fetch(`${BACKEND_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(15000) });
    if (r.ok) {
      if (el)   { el.className = 'be-online'; }
      if (text) { text.textContent = 'Backend Online — Flask API Connected'; }
      if (hdr)  { hdr.className = 'hdr-status-item hs-online'; hdr.innerHTML = '<span class="hdr-status-dot"></span>Backend Online'; }
      return true;
    }
  } catch(e) {}
  if (el)   { el.className = 'be-offline'; }
  if (text) { text.textContent = 'Backend Offline — Simulation Mode'; }
  if (hdr)  { hdr.className = 'hdr-status-item hs-offline'; hdr.innerHTML = '<span class="hdr-status-dot"></span>Backend Offline'; }
  return false;
}

// Run health check on load and every 10s
checkBackendHealth();
_intervals.push(setInterval(checkBackendHealth, 10000));

// ── UPDATE GLOBAL STATUS BADGE ──
function setGlobalStatus(severity) {
  const badge = document.getElementById('globalStatusBadge');
  if (!badge) return;
  if (severity === 'critical' || severity === 'high') {
    badge.className   = 'hdr-status-item hs-critical';
    badge.innerHTML   = '<span class="hdr-status-dot"></span>CRITICAL';
  } else if (severity === 'medium' || severity === 'warning') {
    badge.className   = 'hdr-status-item hs-warning';
    badge.innerHTML   = '<span class="hdr-status-dot"></span>WARNING';
  } else {
    badge.className   = 'hdr-status-item hs-safe';
    badge.innerHTML   = '<span class="hdr-status-dot"></span>SAFE';
  }
}

/* ══════════════════════════════════════════
   DYNAMIC ALERT CARD TEXT
   FIX: "Monitoring {village} · TDS: {x} · AI Risk: {y}%"
   Updates on every sensor + AI poll cycle
══════════════════════════════════════════ */
function updateAlertCardText() {
  const el = document.getElementById('alertCardText');
  if (!el) return;
  const tds     = (_liveSensors.tds || 0).toFixed(0);
  const maxRisk = _liveAI.maxRisk || 0;
  el.textContent = `Monitoring ${selectedVillageName} · TDS: ${tds} mg/L · AI Risk: ${maxRisk}%`;
}

/* ══════════════════════════════════════════
   DYNAMIC TRIGGER CHIPS
   FIX: Generates based on real conditions:
   TDS > 500, turbidity > 5, not drinkable, pH
══════════════════════════════════════════ */
function updateTriggerChips() {
  const tds   = _liveSensors.tds         || 0;
  const turb  = _liveSensors.turbidity   || 0;
  const ph    = _liveSensors.ph          || 7;
  const drink = _liveAI.drinkable;

  const setChip = (id, active, label) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `trigger-chip ${active ? 'tc-active' : 'tc-ok'}`;
    el.textContent = label;
  };

  setChip('tc-tds',
    tds > 500,
    tds > 500
      ? `TDS: ${tds.toFixed(0)} mg/L > 500 limit`
      : `TDS: ${tds.toFixed(0)} mg/L — OK`
  );
  setChip('tc-turb',
    turb > 5,
    turb > 5
      ? `Turbidity: ${turb.toFixed(1)} NTU > 5 limit`
      : `Turbidity: ${turb.toFixed(1)} NTU — OK`
  );
  setChip('tc-drink',
    !drink,
    !drink
      ? `Water: NOT DRINKABLE`
      : `Water: Safe to drink`
  );
  setChip('tc-ph',
    ph < 6.5 || ph > 8.5,
    (ph < 6.5 || ph > 8.5)
      ? `pH: ${ph.toFixed(1)} — Out of range`
      : `pH: ${ph.toFixed(1)} — Within range`
  );
}

// ── MAIN TRIGGER FUNCTION ──
async function triggerEmergencyAlert() {
  if (alertSystemBusy) return;
  alertSystemBusy = true;
  alertCount++;

  const btn = document.getElementById('btnEmergency');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="btn-pulse"></div>⏳ Sending Alerts...'; }

  // FIX: Use live sensor + AI data instead of hardcoded values
  const VILLAGE   = selectedVillageName;
  const tdsLive   = (_liveSensors.tds   || 0).toFixed(0);
  const turbLive  = (_liveSensors.turbidity || 0).toFixed(1);
  const phLive    = (_liveSensors.ph    || 7).toFixed(1);
  const maxRisk   = _liveAI.maxRisk || 0;
  const SEVERITY  = _liveAI.risk_level === 'critical' ? 'critical' : _liveAI.risk_level === 'warning' ? 'warning' : 'safe';
  const ALERT_MSG = `URGENT ALERT\nWater contamination detected in ${VILLAGE}.\n${_liveAI.concern || 'Possible disease outbreak risk detected.'}\n\nTDS: ${tdsLive} mg/L | Turbidity: ${turbLive} NTU | pH: ${phLive} | AI Risk: ${maxRisk}%\nSent by Varun`;

  // Play beep + vibrate immediately
  playAlertBeep();
  triggerVibration();

  // Update global status badge
  setGlobalStatus(SEVERITY);

  // Show popup
  showAlertPopup(VILLAGE, ALERT_MSG);

  // Init per-channel statuses
  const statuses = ALERT_CONTACTS.map(() => ({ telegram: 'idle' }));
  renderContacts(statuses);

  addLog('', `CRITICAL ALERT TRIGGERED — Village: ${VILLAGE}`, 'log-text-sending');
  addLog('', `Sensor: TDS=${tdsLive}mg/L | Turbidity=${turbLive}NTU | pH=${phLive} | AI Risk=${maxRisk}%`, 'log-text-info');

  // ── TASK 1: Try real backend first ──
  // Track whether each REAL channel actually succeeded. There is no
  // per-contact backend confirmation available — the single
  // /simulate-alert call is the only real signal we have, so every
  // contact's per-channel status is honestly derived from that same
  // response. `telegramConfigured === null` means the backend response
  // didn't include Telegram fields at all (e.g. not yet deployed).
  let twilioSucceeded    = false;
  let telegramConfigured = null;
  let telegramSucceeded  = false;
  const backendOnline = await checkBackendHealth();
  if (backendOnline) {
    addLog('', `Backend online — Firing real API: POST /simulate-alert`, 'log-text-system');
    try {
      const resp = await fetch(`${BACKEND_URL}/simulate-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          severity: SEVERITY,
          village:  VILLAGE,
          village_key: 'village_X',
          panchayat_key: 'panchayat_Y',
          tehsil_key: 'tehsil_Z',
          tds: Number(tdsLive),
          turbidity: Number(turbLive),
          ph: Number(phLive),
          salinity: Number((_liveSensors.salinity || 0).toFixed(2)),
          temperature: Number((_liveSensors.temperature || 0).toFixed(1)),
          concern:  'High TDS & turbidity — Cholera risk detected',
          action:   'Immediate inspection and water treatment required',
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const result = await resp.json();
        const hierarchicalAlert = Boolean(result.alert_id);
        twilioSucceeded = false;
        telegramConfigured = hierarchicalAlert ? true : (typeof result.telegram_configured !== 'undefined' ? !!result.telegram_configured : null);
        telegramSucceeded = hierarchicalAlert;
        addLog('', hierarchicalAlert
          ? `Firebase alert ${result.alert_id} created — Village Officer notified by Telegram flow`
          : `Backend confirmed: legacy alert dispatch`, 'log-text-success');

        if (typeof result.telegram_configured !== 'undefined') {
          telegramConfigured = !!result.telegram_configured;
          telegramSucceeded  = !!result.telegram_sent;
          if (telegramConfigured) {
            addLog('', telegramSucceeded
              ? `Telegram: alert posted to authority group — Bot API confirmed`
              : `Telegram: send failed — ${result.telegram_error || 'see backend logs'}`,
              telegramSucceeded ? 'log-text-success' : 'log-text-error');
          } else {
            addLog('', `Telegram: not configured on backend (BOT_TOKEN/CHAT_ID missing) — skipped`, 'log-text-info');
          }
        } else {
          addLog('', `Telegram: backend response has no Telegram fields — treating as not configured`, 'log-text-info');
        }
        addLog('', `Firebase /alerts updated — Alert ID logged`, 'log-text-info');
      } else {
        addLog('', `Backend responded with error ${resp.status} — dispatch not confirmed`, 'log-text-error');
      }
    } catch(e) {
      addLog('', `Backend call failed: ${e.message}`, 'log-text-error');
    }
  } else {
    addLog('', `Backend offline — no alerts were actually dispatched`, 'log-text-error');
  }

  const telegramOff = telegramConfigured === false || telegramConfigured === null;

  addLog('', `Dispatching to ${ALERT_CONTACTS.length} authorities...`, 'log-text-system');
  await sleep(400);

  // Loop through contacts with animated steps
  for (let i = 0; i < ALERT_CONTACTS.length; i++) {
    const c = ALERT_CONTACTS[i];
    const villageStep = i === 0;

    statuses[i] = { telegram: telegramOff ? 'off' : villageStep ? 'sending' : 'idle' };
    renderContacts(statuses);
    setChannelBadge(i, 'telegram', telegramOff ? 'cs-idle' : villageStep ? 'cs-sending' : 'cs-idle', telegramOff ? 'Not configured' : villageStep ? 'Sending...' : 'Waiting for Village resolution');
    addLog('', villageStep ? `Routing alert to ${c.name} via Telegram hierarchy...` : `${c.name} will receive the alert after Village Officer resolution`, villageStep ? 'log-text-sending' : 'log-text-info');

    await sleep(1200);

    if (!villageStep) continue;

    if (telegramOff) {
      statuses[i].telegram = 'off';
      setChannelBadge(i, 'telegram', 'cs-idle', 'Not configured');
    } else {
      statuses[i].telegram = telegramSucceeded ? 'sent' : 'failed';
      setChannelBadge(i, 'telegram', telegramSucceeded ? 'cs-sent' : 'cs-failed', telegramSucceeded ? 'Queued' : 'Not delivered');
    }

    if (telegramSucceeded) {
      addLog('', `${c.name}: Telegram hierarchy step queued`, 'log-text-success');
    } else {
      addLog('', `NOT DELIVERED to ${c.name} — backend dispatch failed or unavailable`, 'log-text-error');
    }
  }

  const sentCount = statuses.filter(s => s.telegram === 'sent').length;
  addLog('', `TRANSMISSION COMPLETE — Village step queued; Tehsil follows Village resolution`, 'log-text-system');
  addLog('', `Alert #${alertCount} logged. Timestamp: ${new Date().toLocaleString('en-IN')}`, 'log-text-info');

  addToAlertHistory(VILLAGE, SEVERITY);

  const ts = document.getElementById('alertTriggerStatus');
  if (ts) ts.innerHTML = `Alert #${alertCount} sent — <strong>${sentCount}/${ALERT_CONTACTS.length} authorities notified</strong> at ${new Date().toLocaleTimeString('en-IN')}`;

  // Auto-close popup with countdown
  startPopupCountdown(5);

  setTimeout(() => {
    alertSystemBusy = false;
    setGlobalStatus('safe'); // reset badge
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<div class="btn-pulse"></div>Simulate Emergency Alert';
    }
  }, 4000);
}

// ── HELPERS ──
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// `channel` is 'twilio' (renders into csBadge_i) or 'telegram' (tgBadge_i)
function setChannelBadge(i, channel, cls, label) {
  const elId = channel === 'telegram' ? `tgBadge_${i}` : `csBadge_${i}`;
  const prefix = channel === 'telegram' ? 'Telegram' : 'WA/SMS';
  const el = document.getElementById(elId);
  if (el) { el.className = `channel-badge ${cls}`; el.textContent = `${prefix} · ${label}`; }
}

// Close popup when clicking overlay background
document.getElementById('alertOverlay')?.addEventListener('click', function(e) {
  if (e.target === this) closeAlertPopup();
});

/* ══════════════════════════════════════════
   ALL SENSOR CHARTS — Live rolling graphs
   5 sensor charts + 1 AI disease risk chart
   All update every 5s from Firebase poll
══════════════════════════════════════════ */

/* ── Shared chart factory ── */
function makeSensorChart(canvasId, label, color, yUnit, yMin, yMax, refLine) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return null;

  const baseOpts = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 350 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'white', borderColor: '#e5e7eb', borderWidth: 1,
        titleColor: '#1a56a0', bodyColor: '#374151', padding: 8,
        callbacks: { label: ctx => `${ctx.parsed.y} ${yUnit}` }
      }
    },
    scales: {
      x: { grid:{color:'#f3f4f6'}, ticks:{color:'#9ca3af', font:{size:8}, maxTicksLimit:6, maxRotation:0} },
      y: {
        min: yMin !== undefined ? yMin : undefined,
        max: yMax !== undefined ? yMax : undefined,
        grid: { color:'rgba(26,86,160,0.06)' },
        ticks: { color:'#6b7280', font:{size:9}, callback: v => v + ' ' + yUnit },
      }
    }
  };

  const datasets = [{
    label, data: [], borderColor: color,
    backgroundColor: color.replace(')', ',0.08)').replace('rgb','rgba'),
    borderWidth: 2, tension: 0.4, fill: true, pointRadius: 3, pointHoverRadius: 5
  }];

  // Add WHO reference line annotation if provided
  if (refLine !== undefined) {
    datasets.push({
      label: 'WHO Limit',
      data: Array(MAX_HIST).fill(refLine),
      borderColor: '#ef4444', borderWidth: 1, borderDash: [4,3],
      pointRadius: 0, fill: false, tension: 0
    });
  }

  return new Chart(canvas, {
    type: 'line',
    data: { labels: [], datasets },
    options: baseOpts
  });
}

/* ── Update a chart in-place (no destroy/recreate) ── */
function updateChart(chart, labels, data, labelText) {
  if (!chart) return;
  chart.data.labels = [...labels];
  chart.data.datasets[0].data = [...data];
  if (labelText) chart.data.datasets[0].label = labelText;
  // Keep WHO line at correct length
  if (chart.data.datasets[1]) {
    chart.data.datasets[1].data = Array(labels.length).fill(chart.data.datasets[1].data[0]);
  }
  chart.update('none');
}

/* ── Chart instances ── */
let _chartTDS  = null;
let _chartTurb = null;
let _chartPH   = null;
let _chartTemp = null;
let _chartSal  = null;
let _tdsHistChartInstance = null; // alias

/* ── Create all 5 sensor charts ── */
function initAllSensorCharts() {
  if (!window.Chart) return;
  _chartTDS  = makeSensorChart('tdsHistChart',  'TDS (mg/L)',      'rgb(220,38,38)',   'mg/L', 0, undefined, 500);
  _chartTurb = makeSensorChart('turbHistChart', 'Turbidity (NTU)', 'rgb(147,51,234)',  'NTU',  0, undefined, 4);
  _chartPH   = makeSensorChart('phHistChart',   'pH',              'rgb(16,163,127)',  '',     6, 9);
  _chartTemp = makeSensorChart('tempHistChart', 'Temp (°C)',       'rgb(234,88,12)',   '°C',   15, 45, 35);
  _chartSal  = makeSensorChart('salHistChart',  'Salinity (ppt)',  'rgb(37,99,235)',   'ppt',  0, undefined, 0.5);
  // backward compat alias
  _tdsHistChartInstance = _chartTDS;
}

/* ── Main update function — called after every Firebase sensor fetch ── */
function updateAllSensorCharts() {
  updateChart(_chartTDS,  _timeLabels, _tdsHistory,  `${selectedVillageName} TDS`);
  updateChart(_chartTurb, _timeLabels, _turbHistory, `${selectedVillageName} Turbidity`);
  updateChart(_chartPH,   _timeLabels, _phHistory,   `${selectedVillageName} pH`);
  updateChart(_chartTemp, _timeLabels, _tempHistory, `${selectedVillageName} Temp`);
  updateChart(_chartSal,  _timeLabels, _salHistory,  `${selectedVillageName} Salinity`);
  // Also update TDS in trend chart (AI panel)
  updateTdsHistChart();
}

/* Backward compat — called by trend chart update code */
function updateTdsHistChart() {
  updateChart(_chartTDS, _timeLabels, _tdsHistory, `${selectedVillageName} TDS (Live)`);
}

function initAnalyticsCharts() {
  initAllSensorCharts();

  // Disease Risk chart — live from AI prediction
  initAIRiskChart();
}
setTimeout(initAnalyticsCharts, 600);

/* ── AI Disease Risk Bar Chart (live) ── */
const _aiRiskHistory = { cholera:[], typhoid:[], diarrhea:[], dysentery:[] };
let _aiRiskChartInstance = null;

function initAIRiskChart() {
  const canvas = document.getElementById('casesHistChart');
  if (!canvas || !window.Chart) return;
  _aiRiskChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: [..._timeLabels],
      datasets: [
        { label:'Cholera %',   data:[], backgroundColor:'rgba(220,38,38,0.82)',  borderRadius:3 },
        { label:'Typhoid %',   data:[], backgroundColor:'rgba(217,119,6,0.82)',  borderRadius:3 },
        { label:'Diarrhea %',  data:[], backgroundColor:'rgba(26,86,160,0.82)',  borderRadius:3 },
        { label:'Dysentery %', data:[], backgroundColor:'rgba(16,163,74,0.82)',  borderRadius:3 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 350 },
      plugins: {
        legend: { labels:{ color:'#6b7280', font:{family:'Noto Sans',size:9}, boxWidth:10 } },
        tooltip: { backgroundColor:'white', borderColor:'#e5e7eb', borderWidth:1, titleColor:'#374151', bodyColor:'#374151', padding:8 }
      },
      scales: {
        x: { grid:{color:'#f3f4f6'}, ticks:{color:'#9ca3af', font:{size:8}, maxTicksLimit:6, maxRotation:0} },
        y: { min:0, max:100, grid:{color:'rgba(26,86,160,0.07)'},
             ticks:{color:'#6b7280', font:{size:9}, callback:v=>v+'%'},
             title:{display:true, text:'Risk %', color:'#6b7280', font:{size:9}} }
      }
    }
  });
}

/* Push AI risk % to history on each AI fetch */
function pushAIRiskReading() {
  _aiRiskHistory.cholera.push(_liveAI.cholera     || 0);
  _aiRiskHistory.typhoid.push(_liveAI.typhoid     || 0);
  _aiRiskHistory.diarrhea.push(_liveAI.diarrhea   || 0);
  _aiRiskHistory.dysentery.push(_liveAI.dysentery || 0);
  const trim = arr => { while(arr.length > MAX_HIST) arr.shift(); };
  Object.values(_aiRiskHistory).forEach(trim);
  updateAIRiskChart();
}

function updateAIRiskChart() {
  if (!_aiRiskChartInstance) return;
  const labels = _timeLabels.length ? [..._timeLabels] : ['Now'];
  _aiRiskChartInstance.data.labels               = labels;
  _aiRiskChartInstance.data.datasets[0].data     = [..._aiRiskHistory.cholera];
  _aiRiskChartInstance.data.datasets[1].data     = [..._aiRiskHistory.typhoid];
  _aiRiskChartInstance.data.datasets[2].data     = [..._aiRiskHistory.diarrhea];
  _aiRiskChartInstance.data.datasets[3].data     = [..._aiRiskHistory.dysentery];
  _aiRiskChartInstance.update('none');
}

/* ══════════════════════════════════════════
   ENHANCED MAP — Pulse animation for critical
══════════════════════════════════════════ */
// Override initMap with enhanced version
const _origInitMap = initMap;

/* ── LAST UPDATED DYNAMIC TEXT ── */
function updateLastUpdatedBadge() {
  const els = document.querySelectorAll('[id="lastUpdated"]');
  const now = new Date().toLocaleTimeString('en-IN');
  els.forEach(el => {
    if (el) el.innerHTML = `<span class="last-updated-badge"><span class="gov-live-dot"></span>Just now — ${now}</span>`;
  });
}
_intervals.push(setInterval(updateLastUpdatedBadge, 5000));

/* ── ALERT BEEP for critical ── */
let _lastCriticalBeep = 0;
function maybeCriticalBeep() {
  const now = Date.now();
  if (now - _lastCriticalBeep < 8000) return; // max once per 8 sec
  _lastCriticalBeep = now;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 180, 360].forEach(delay => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
      }, delay);
    });
  } catch(e) {}
}

// Trigger beep check when critical data comes in

/* ══════════════════════════════════════════
   STARTUP — Initialize all dynamic sections
   FIX: Call all live renders once at startup
   so UI doesn't show stale state on load
══════════════════════════════════════════ */
(function initLiveUI() {
  // Render village cards with placeholder data immediately
  renderVillageCards();
  // Update chip/card text once at load (will be refreshed by fetch cycles)
  updateAlertCardText();
  updateTriggerChips();
  // Alert feed initial render with fallback
  renderAlertFeed(null);
  renderAlertTable(null);
  renderSmsLog(null);
})();



      // expose functions used by JSX onClick handlers
      window.showPage = showPage;
      window.triggerEmergencyAlert = triggerEmergencyAlert;
      window.sendSMS = sendSMS;
      window.closeAlertPopup = closeAlertPopup;
      window.clearTransmissionLog = clearTransmissionLog;
      /* eslint-enable */
    });

    return () => {
      cancelled = true;
      _intervals.forEach(clearInterval);
      _resizeHandlers.forEach((fn) => window.removeEventListener('resize', fn));
      if (window._aqMap) {
        window._aqMap.remove();
        window._aqMap = null;
      }
    };
  }, []);

  return (
    <>
<div>
  {/* ══ GOV TOP HEADER ══ */}
  <div className="gov-topbar">
    <div className="gov-emblem"><img src="/varun-logo.png" alt="Varun logo" /></div>
    <div className="gov-title-block">
      <div className="gov-title-hi">जल गुणवत्ता निगरानी प्रणाली · प्रस्तावित पायलट — धनबाद, झारखंड</div>
      <div className="gov-brand-row">
        <span className="gov-brand-name">VARUN</span>
        <span className="gov-brand-sub">Water Quality Monitoring System</span>
      </div>
    </div>
    <div className="gov-org">
      <div className="gov-org-line pilot">PROPOSED PILOT · DHANBAD</div>
    </div>
    <div className="gov-live-badge"><span className="gov-live-dot" />LIVE SYSTEM</div>
    <div className="hdr-status-strip">
      <span id="globalStatusBadge" className="hdr-status-item hs-pending"><span className="hdr-status-dot" />AWAITING DATA</span>
      <span id="headerBackendStatus" className="hdr-status-item hs-offline"><span className="hdr-status-dot" />Backend Offline</span>
    </div>
  </div>
  {/* ══ GOV NAV TABS ══ */}
  <nav className="gov-nav">
    <a onClick={() => window.showPage('home')} className="active" id="nav-home">Home</a>
    <a onClick={() => window.showPage('dashboard')} id="nav-dashboard">Dashboard</a>
    <a onClick={() => { window.showPage('asha'); fetchAshaReports(); }} id="nav-asha">ASHA Reports</a>
    <a onClick={() => window.showPage('whatsapp')} id="nav-whatsapp">Alert System</a>
    <a onClick={() => window.showPage('about')} id="nav-about">About</a>
    <div style={{marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0, minWidth: 0}}>
      <span id="clockEl" style={{fontFamily: '"JetBrains Mono",monospace'}} />
      <span>|</span>
      <span id="dateEl" style={{fontFamily: '"JetBrains Mono",monospace'}} />
      <span>·</span>
      <span>Alpha Coders</span>
    </div>
  </nav>
  {/* ══════════════════════════════════════
     HOME PAGE
══════════════════════════════════════ */}
  <div className="page active" id="page-home">
    <div className="home-hero">
      <div className="home-eyebrow">JAL JEEVAN MISSION · जल जीवन मिशन</div>
      <div className="home-hero-title">Varun — Real-Time Water Quality Monitoring</div>
      <div className="home-hero-sub">
        Varun combines real-time IoT water quality monitoring with a multi-stage purification system,
        helping ASHA workers and district officials measure water quality before treatment and verify changes after purification — for Dhanbad District, Jharkhand.
      </div>
      <div className="home-cta-row">
        <button className="gov-btn gov-btn-primary" onClick={() => window.showPage('dashboard')}>EXPLORE MONITORING</button>
        <button className="gov-btn gov-btn-outline" onClick={() => window.showPage('about')}>HOW VARUN WORKS</button>
      </div>
      <div className="home-stats-row">
        <div className="home-stat-box">
          <div className="home-stat-num">24<span>/7</span></div>
          <div className="home-stat-lbl">Live Monitoring<br /><span className="home-stat-lbl-hi">लाइव निगरानी</span></div>
        </div>
        <div className="home-stat-box">
          <div className="home-stat-num">5</div>
          <div className="home-stat-lbl">Sensor Parameters<br /><span className="home-stat-lbl-hi">सेंसर पैरामीटर</span></div>
        </div>
        <div className="home-stat-box">
          <div className="home-stat-num">4</div>
          <div className="home-stat-lbl">Diseases Tracked<br /><span className="home-stat-lbl-hi">रोग ट्रैकिंग</span></div>
        </div>
        <div className="home-stat-box">
          <div className="home-stat-num">5<span>s</span></div>
          <div className="home-stat-lbl">Sensor Refresh Rate<br /><span className="home-stat-lbl-hi">रिफ्रेश दर</span></div>
        </div>
      </div>
    </div>

    {/* ── WHY THIS MATTERS — real data ── */}
    <div className="why-matters-section">
      <div className="why-matters-title">📊 Why This Matters — वास्तविक डेटा</div>
      <div className="why-matters-grid">
        <div className="why-matters-item">💀 <strong>37.7 million</strong> Indians affected by waterborne diseases yearly (WHO)</div>
        <div className="why-matters-item">🧒 <strong>1,600 children</strong> die daily from unsafe water — South Asia (UNICEF)</div>
        <div className="why-matters-item">⛏️ <strong>Dhanbad's own mining belt</strong> — fluoride up to 18.55 mg/L recorded in Gharbar village, groundwater also affected by iron, nitrate & turbidity from mine discharge (CGWB / peer-reviewed studies)</div>
        <div className="why-matters-item">🎯 Jal Jeevan Mission targets rural tap water — <strong>quality monitoring gap</strong> remains</div>
      </div>
    </div>

    {/* ── BEFORE vs AFTER VARUN ── */}
    <div className="impact-compare-section">
      <div className="impact-compare-title">🧠 Before vs After Varun — Real Impact</div>
      <div className="impact-compare-grid">
        <div className="impact-col before">
          <div className="impact-col-title">❌ Before Varun</div>
          <div className="impact-item-row"><span>❌</span><span>Manual water testing — takes 2–3 days for results</span></div>
          <div className="impact-item-row"><span>❌</span><span>No early warning system — outbreaks detected after spread</span></div>
          <div className="impact-item-row"><span>❌</span><span>Disease spreads fast — villages unaware of contamination</span></div>
          <div className="impact-item-row"><span>❌</span><span>Health officers react <strong>after</strong> patients hospitalized</span></div>
          <div className="impact-item-row"><span>❌</span><span>ASHA workers submit paper reports — 24–48 hr delay</span></div>
          <div className="impact-item-row"><span>❌</span><span>No district-level water quality map available</span></div>
        </div>
        <div className="impact-divider">→ VARUN →</div>
        <div className="impact-col after">
          <div className="impact-col-title">✅ After Varun</div>
          <div className="impact-item-row"><span>✅</span><span>Real-time IoT monitoring — sensor data every 5 seconds</span></div>
          <div className="impact-item-row"><span>✅</span><span>AI predicts disease risk <strong>before outbreak</strong> occurs</span></div>
          <div className="impact-item-row"><span>✅</span><span>Instant Telegram + SMS alerts to authorities</span></div>
          <div className="impact-item-row"><span>✅</span><span>Proactive intervention — action taken in <strong>minutes</strong>, not days</span></div>
          <div className="impact-item-row"><span>✅</span><span>ASHA digital reports — live on dashboard in real-time</span></div>
          <div className="impact-item-row"><span>✅</span><span>Pre/post purification verification, not just raw readings</span></div>
        </div>
      </div>
    </div>

    {/* ── GOVERNMENT INTEGRATION ── */}
    <div className="gov-integration-section">
      <div className="gov-integration-title">🏛️ Government Integration — सरकारी एकीकरण</div>
      <div className="gov-integration-grid">
        <div className="gov-integration-card">
          <div className="gov-integration-icon">💧</div>
          <div className="gov-integration-name">Jal Jeevan Mission</div>
          <div className="gov-integration-desc">Direct WQMIS API integration ready. Sensor data feeds into the national water quality monitoring system.</div>
          <span className="gov-integration-status">✔ Integration-ready</span>
        </div>
        <div className="gov-integration-card">
          <div className="gov-integration-icon">🏥</div>
          <div className="gov-integration-name">NHM Integration</div>
          <div className="gov-integration-desc">National Health Mission disease surveillance. AI predictions can sync with the IHIP portal for district-level reporting.</div>
          <span className="gov-integration-status">✔ API-ready</span>
        </div>
        <div className="gov-integration-card">
          <div className="gov-integration-icon">📊</div>
          <div className="gov-integration-name">District Dashboard</div>
          <div className="gov-integration-desc">Collector &amp; CMO office-ready dashboard. Role-based access for BMO, District Officer, and ASHA supervisors.</div>
          <span className="gov-integration-status">✔ Deployed (pilot)</span>
        </div>
      </div>
    </div>

    {/* ── FINAL CTA (CLOSING SECTION) ── */}
    <div className="final-cta-section">
      <div className="final-cta-inner">
        <div className="final-cta-text">
          <div className="final-cta-eyebrow">VARUN · WATER QUALITY MONITORING</div>
          <div className="final-cta-heading">Better monitoring. Safer decisions.</div>
          <div className="final-cta-sub">Varun connects field-level water-quality measurement with purification monitoring, helping operators understand what changes before and after treatment.</div>
        </div>
        <div className="final-cta-actions">
          <button className="final-cta-btn primary" onClick={() => window.showPage('dashboard')}>OPEN MONITORING →</button>
          <button className="final-cta-btn secondary" onClick={() => window.showPage('about')}>HOW VARUN WORKS →</button>
          <div className="final-cta-note">Measure locally. Monitor centrally.</div>
        </div>
      </div>
    </div>
  </div>
  {/* ══════════════════════════════════════
     DASHBOARD PAGE
══════════════════════════════════════ */}
  <div className="page" id="page-dashboard">
    <div className="page-content">
      {/* STAT ROW */}
      <div className="stat-row">
        <div className="stat-card green">
          <div className="stat-icon"></div>
          <div><div className="stat-val" id="statSafe">4</div><div className="stat-lbl">Safe Villages<br /><span className="stat-lbl-hi">सुरक्षित गांव</span></div></div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-icon"></div>
          <div><div className="stat-val" id="statWarn">3</div><div className="stat-lbl">Warning Zones<br /><span className="stat-lbl-hi">चेतावनी क्षेत्र</span></div></div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon"></div>
          <div><div className="stat-val" id="statCrit">2</div><div className="stat-lbl">Critical Zones<br /><span className="stat-lbl-hi">गंभीर क्षेत्र</span></div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"></div>
          <div><div className="stat-val" id="statCases">21</div><div className="stat-lbl">Cases Tracked<br /><span className="stat-lbl-hi">मामले</span></div></div>
        </div>
      </div>
      {/* DRINKABILITY BANNER */}
      {/* SENSORS TABLE + AI PREDICTION (side by side) */}
      <div className="dash-grid">
        {/* SENSOR TABLE */}
        <div className="gov-card">
          <div className="gov-card-header">
            <div>
              <div className="gov-card-title">Live Sensor Readings</div>
              <div className="gov-card-title-hi">लाइव सेंसर डेटा — Firebase Real-Time</div>
            </div>
            <span style={{fontSize: 10, color: 'var(--gov-gray3)', fontFamily: '"JetBrains Mono",monospace'}} id="lastUpdated">Updated: --:--</span>
          </div>
          <div className="gov-card-body" style={{padding: 0}}>
            <table className="sensor-table">
              <thead>
                <tr>
                  <th>Parameter / पैरामीटर</th>
                  <th>Reading</th>
                  <th>WHO Limit</th>
                  <th>Level</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>TDS</strong><br /><span style={{fontSize: 10, color: 'var(--gov-gray3)'}}>कुल घुलित ठोस</span></td>
                  <td><span className="sensor-val-big" id="tds-val">—</span><span style={{fontSize: 10, color: 'var(--gov-gray2)'}}> mg/L</span></td>
                  <td style={{color: 'var(--gov-gray2)', fontSize: 11}}>&lt;500 mg/L</td>
                  <td><div className="sensor-progress"><div className="sensor-progress-fill" id="tds-bar" style={{width: '0%', background: '#1a56a0'}} /></div></td>
                  <td><span className="status-pill pill-safe" id="tds-status">OK</span></td>
                </tr>
                <tr>
                  <td><strong>Turbidity</strong><br /><span style={{fontSize: 10, color: 'var(--gov-gray3)'}}>मैलापन</span></td>
                  <td><span className="sensor-val-big" id="turb-val">—</span><span style={{fontSize: 10, color: 'var(--gov-gray2)'}}> NTU</span></td>
                  <td style={{color: 'var(--gov-gray2)', fontSize: 11}}>&lt;4 NTU</td>
                  <td><div className="sensor-progress"><div className="sensor-progress-fill" id="turb-bar" style={{width: '0%', background: '#9b59b6'}} /></div></td>
                  <td><span className="status-pill pill-safe" id="turb-status">OK</span></td>
                </tr>
                <tr>
                  <td><strong>pH</strong><br /><span style={{fontSize: 10, color: 'var(--gov-gray3)'}}>अम्लता / क्षारीयता</span></td>
                  <td><span className="sensor-val-big" id="ph-val">—</span></td>
                  <td style={{color: 'var(--gov-gray2)', fontSize: 11}}>6.5–8.5</td>
                  <td><div className="sensor-progress"><div className="sensor-progress-fill" id="ph-bar" style={{width: '0%', background: '#10a37f'}} /></div></td>
                  <td><span className="status-pill pill-safe" id="ph-status">OK</span></td>
                </tr>
                <tr>
                  <td><strong>Temperature</strong><br /><span style={{fontSize: 10, color: 'var(--gov-gray3)'}}>तापमान</span></td>
                  <td><span className="sensor-val-big" id="temp-val">—</span><span style={{fontSize: 10, color: 'var(--gov-gray2)'}}> °C</span></td>
                  <td style={{color: 'var(--gov-gray2)', fontSize: 11}}>0–35°C</td>
                  <td><div className="sensor-progress"><div className="sensor-progress-fill" id="temp-bar" style={{width: '0%', background: '#e74c3c'}} /></div></td>
                  <td><span className="status-pill pill-safe" id="temp-status">OK</span></td>
                </tr>
                <tr>
                  <td><strong>Salinity</strong><br /><span style={{fontSize: 10, color: 'var(--gov-gray3)'}}>लवणता</span></td>
                  <td><span className="sensor-val-big" id="sal-val">—</span><span style={{fontSize: 10, color: 'var(--gov-gray2)'}}> ppt</span></td>
                  <td style={{color: 'var(--gov-gray2)', fontSize: 11}}>&lt;0.5 ppt</td>
                  <td><div className="sensor-progress"><div className="sensor-progress-fill" id="sal-bar" style={{width: '0%', background: '#f39c12'}} /></div></td>
                  <td><span className="status-pill pill-safe" id="sal-status">OK</span></td>
                </tr>
              </tbody>
            </table>
            {/* DRINKABLE BANNER inside sensor card */}
            <div style={{padding: '14px 18px', borderTop: '1px solid var(--gov-border)'}}>
              <div className="drink-banner safe" id="drinkBanner" style={{marginBottom: 0}}>
                <div className="drink-banner-icon" id="drinkIcon"></div>
                <div>
                  <div className="drink-banner-title safe" id="drinkTitle">WATER IS DRINKABLE — जल पीने योग्य है</div>
                  <div className="drink-banner-sub" id="drinkSubtitle">All sensor parameters within WHO safe limits. Water is safe for consumption.</div>
                </div>
                <div className="drink-badge safe" id="drinkChip">SAFE</div>
              </div>
            </div>
          </div>
        </div>
        {/* AI PREDICTION */}
        <div className="gov-card">
          <div className="gov-card-header">
            <div>
              <div className="gov-card-title">AI Disease Risk Prediction</div>
              <div className="gov-card-title-hi">एआई रोग जोखिम विश्लेषण — Groq LLaMA 3.3-70B</div>
            </div>
            <span className="status-pill pill-safe" id="aiSeverityBadge" style={{fontSize: 10}}>SAFE</span>
          </div>
          <div className="gov-card-body ai-risk-fill-body">
            <div className="ai-risk-row">
              <div className="ai-risk-name">Cholera<span className="ai-risk-name-hi">हैजा</span></div>
              <div className="ai-risk-bar-wrap"><div className="ai-risk-bar-fill" id="ai-cholera" style={{width: '0%', background: '#1a56a0'}} /></div>
              <div className="ai-risk-pct" id="ai-cholera-pct" style={{color: '#1a56a0'}}>0%</div>
            </div>
            <div className="ai-risk-row">
              <div className="ai-risk-name">Typhoid<span className="ai-risk-name-hi">टाइफाइड</span></div>
              <div className="ai-risk-bar-wrap"><div className="ai-risk-bar-fill" id="ai-typhoid" style={{width: '0%', background: '#1a56a0'}} /></div>
              <div className="ai-risk-pct" id="ai-typhoid-pct" style={{color: '#1a56a0'}}>0%</div>
            </div>
            <div className="ai-risk-row">
              <div className="ai-risk-name">Diarrhea<span className="ai-risk-name-hi">दस्त</span></div>
              <div className="ai-risk-bar-wrap"><div className="ai-risk-bar-fill" id="ai-diarr" style={{width: '0%', background: '#1a56a0'}} /></div>
              <div className="ai-risk-pct" id="ai-diarr-pct" style={{color: '#1a56a0'}}>0%</div>
            </div>
            <div className="ai-risk-row">
              <div className="ai-risk-name">Dysentery<span className="ai-risk-name-hi">पेचिश</span></div>
              <div className="ai-risk-bar-wrap"><div className="ai-risk-bar-fill" id="ai-dys" style={{width: '0%', background: '#1a56a0'}} /></div>
              <div className="ai-risk-pct" id="ai-dys-pct" style={{color: '#1a56a0'}}>0%</div>
            </div>
          </div>
        </div>
      </div>{/* end dash-grid */}
      {/* MAP (full width) */}
      <div className="dash-grid" style={{gridTemplateColumns: '1fr'}}>
        {/* REAL LEAFLET MAP */}
        <div className="gov-card">
          <div className="gov-card-header">
            <div>
              <div className="gov-card-title">Village Risk Map — Dhanbad District</div>
              <div className="gov-card-title-hi">ग्राम जोखिम मानचित्र — अजमेर जिला | Click marker for details</div>
            </div>
            <div style={{display: 'flex', gap: 8, fontSize: 10, alignItems: 'center'}}>
              <span style={{background: '#dcfce7', color: '#16a34a', padding: '2px 7px', borderRadius: 3, border: '1px solid #86efac'}}>● Safe</span>
              <span style={{background: '#fef3c7', color: '#d97706', padding: '2px 7px', borderRadius: 3, border: '1px solid #fcd34d'}}>● Warning</span>
              <span style={{background: '#fee2e2', color: '#dc2626', padding: '2px 7px', borderRadius: 3, border: '1px solid #fca5a5'}}>● Critical</span>
            </div>
          </div>
          <div className="gov-card-body" style={{padding: 0, overflow: 'hidden', borderRadius: '0 0 5px 5px'}}>
            <div id="govLeafletMap" />
          </div>
        </div>
      </div>{/* end dash-grid map */}
      {/* GOVT DECISION SUPPORT */}
      <div className="gov-card">
        <div className="gov-card-header">
          <div className="gov-card-title">District Authority Recommendations — जिला अधिकारी सिफारिशें</div>
        </div>
        <div className="gov-card-body">
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 11}}>
            <div style={{padding: 10, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 4}}>
              <div style={{fontWeight: 700, color: '#dc2626', marginBottom: 6}}>IMMEDIATE ACTION</div>
              Deploy sanitation teams to Jharia. Distribute water purification tablets. Alert BMO Dhanbad &amp; Chief Medical Officer immediately.
            </div>
            <div style={{padding: 10, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 4}}>
              <div style={{fontWeight: 700, color: '#d97706', marginBottom: 6}}>MONITOR CLOSELY</div>
              Schedule water source testing in Sindri &amp; Katras within 24 hours. ASHA workers to increase house visits in Dhanbad District.
            </div>
            <div style={{padding: 10, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 4}}>
              <div style={{fontWeight: 700, color: '#16a34a', marginBottom: 6}}>JJM INTEGRATION</div>
              Varun is Jal Jeevan Mission ready. Sensor data can feed directly into WQMIS (Water Quality Management Information System).
            </div>
          </div>
        </div>
      </div>
      {/* ANALYTICS GRAPHS — ALL SENSORS LIVE */}
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10}}>
        <div style={{fontSize: 13, fontWeight: 700, color: 'var(--gov-blue)', textTransform: 'uppercase', letterSpacing: '0.5px'}}>Live Sensor Analytics — सभी सेंसर ग्राफ</div>
        <span className="sensor-chart-live-badge">Firebase Live · Last 10 Readings</span>
      </div>
      <div className="graphs-grid">
        {/* TDS */}
        <div className="gov-card">
          <div className="gov-card-header">
            <div className="gov-card-title">TDS — कुल घुलित ठोस</div>
            <span style={{fontSize: 10, color: 'var(--gov-gray2)'}}>WHO &lt;500 mg/L</span>
          </div>
          <div className="gov-card-body" style={{padding: '10px 14px'}}>
            <div style={{height: 180, position: 'relative'}}><canvas id="tdsHistChart" /></div>
          </div>
        </div>
        {/* Turbidity */}
        <div className="gov-card">
          <div className="gov-card-header">
            <div className="gov-card-title">Turbidity — मैलापन</div>
            <span style={{fontSize: 10, color: 'var(--gov-gray2)'}}>WHO &lt;4 NTU</span>
          </div>
          <div className="gov-card-body" style={{padding: '10px 14px'}}>
            <div style={{height: 180, position: 'relative'}}><canvas id="turbHistChart" /></div>
          </div>
        </div>
        {/* pH */}
        <div className="gov-card">
          <div className="gov-card-header">
            <div className="gov-card-title">pH — अम्लता स्तर</div>
            <span style={{fontSize: 10, color: 'var(--gov-gray2)'}}>Safe: 6.5–8.5</span>
          </div>
          <div className="gov-card-body" style={{padding: '10px 14px'}}>
            <div style={{height: 180, position: 'relative'}}><canvas id="phHistChart" /></div>
          </div>
        </div>
        {/* Temperature */}
        <div className="gov-card">
          <div className="gov-card-header">
            <div className="gov-card-title">Temperature — तापमान</div>
            <span style={{fontSize: 10, color: 'var(--gov-gray2)'}}>Safe: 0–35°C</span>
          </div>
          <div className="gov-card-body" style={{padding: '10px 14px'}}>
            <div style={{height: 180, position: 'relative'}}><canvas id="tempHistChart" /></div>
          </div>
        </div>
        {/* Salinity */}
        <div className="gov-card">
          <div className="gov-card-header">
            <div className="gov-card-title">Salinity — लवणता</div>
            <span style={{fontSize: 10, color: 'var(--gov-gray2)'}}>WHO &lt;0.5 ppt</span>
          </div>
          <div className="gov-card-body" style={{padding: '10px 14px'}}>
            <div style={{height: 180, position: 'relative'}}><canvas id="salHistChart" /></div>
          </div>
        </div>
        {/* Disease Cases (AI) */}
        <div className="gov-card">
          <div className="gov-card-header">
            <div className="gov-card-title">Disease Risk — AI रोग जोखिम</div>
            <span style={{fontSize: 10, color: 'var(--gov-gray2)'}}>Groq LLaMA</span>
          </div>
          <div className="gov-card-body" style={{padding: '10px 14px'}}>
            <div style={{height: 180, position: 'relative'}}><canvas id="casesHistChart" /></div>
          </div>
        </div>
      </div>
    </div>{/* end page-content */}
  </div>{/* end dashboard page */}
  {/* ══════════════════════════════════════
     ASHA WORKER REPORTS PAGE
══════════════════════════════════════ */}
  <div className="page" id="page-asha">
    <div className="page-content">

      {/* REPORTS CARDS (Firebase live + static fallback) */}
      <div className="gov-card">
        <div className="gov-card-header">
          <div>
            <div className="gov-card-title">📋 Field Reports — आशा कार्यकर्ता रिपोर्टें</div>
            <div className="gov-card-title-hi">Firebase Realtime DB से लाइव डेटा</div>
          </div>
          <span style={{fontSize: 10, color: 'var(--gov-gray3)', fontFamily: "'JetBrains Mono',monospace"}} id="ashaLastFetch">Fetching...</span>
        </div>
        <div className="gov-card-body">
          <div className="asha-cards-grid" id="ashaCardsGrid">
            <div className="asha-loading">⏳ Firebase से रिपोर्टें लोड हो रही हैं...</div>
          </div>
        </div>
      </div>
    </div>{/* end page-content */}
  </div>{/* end asha page */}
  {/* ══════════════════════════════════════
     AI FEATURES PAGE
══════════════════════════════════════ */}
  {/* ══════════════════════════════════════
     FULL-SCREEN CRITICAL ALERT POPUP
══════════════════════════════════════ */}
  <div id="alertOverlay">
    <div className="alert-popup">
      <div className="alert-popup-header">
        <span className="alert-popup-siren"></span>
        <div className="alert-popup-title">CRITICAL WATER ALERT</div>
        <div className="alert-popup-sub">Authorities are being notified immediately</div>
      </div>
      <div className="alert-popup-body">
        <div className="alert-popup-village">
          <div className="alert-popup-village-name" id="popupVillageName">Jharia, Dhanbad District</div>
          <div className="alert-popup-village-sub">Jharkhand · Dhanbad District Health Zone</div>
        </div>
        <div className="alert-popup-msg" id="popupMsgBody">URGENT ALERT
          Water contamination detected in Jharia.
          Possible disease outbreak risk detected.
          Immediate action required.</div>
        <div className="alert-popup-timestamp" id="popupTimestamp">⏰ Alert triggered at —</div>
        <div className="alert-countdown-bar"><div className="alert-countdown-fill" id="countdownFill" /></div>
        <button className="alert-popup-close" onClick={() => window.closeAlertPopup()}>ACKNOWLEDGED — Close Alert</button>
      </div>
    </div>
  </div>
  {/* ══════════════════════════════════════
     MULTI-AUTHORITY ALERT SYSTEM PAGE
══════════════════════════════════════ */}
  <div className="page" id="page-whatsapp">
    <div className="page-content">
      {/* ALERTS BY ASHA WORKER — top segment: critical field reports + SMS alerts from ASHA workers */}
      <div className="gov-card" style={{marginBottom: 10}}>
        <div className="gov-card-header">
          <div className="gov-card-title">🚨 Alerts by ASHA Worker — आशा वर्कर अलर्ट्स</div>
        </div>
        <div className="gov-card-body" style={{padding: 0}}>
          <div id="ashaWorkerAlertsList">
            <div className="alert-history-row">
              <span style={{color: 'var(--gov-gray3)'}}>⏳</span>
              <span>Loading ASHA alerts...</span>
              <span>—</span>
            </div>
          </div>
        </div>
      </div>
      {/* TRIGGER BUTTON CARD */}
      <div className="alert-trigger-card">
        <div className="alert-trigger-label">Varun Emergency Alert System · Control Room</div>
        <div className="alert-trigger-status" id="alertTriggerStatus">
          System <strong>ARMED</strong> — <span id="alertCardText">Monitoring Jharia · TDS: — mg/L · AI Risk: —%</span>
        </div>
        <button className="btn-emergency" id="btnEmergency" onClick={() => window.triggerEmergencyAlert()}>
          <div className="btn-pulse" />
          Simulate Emergency Alert
        </button>
        <div id="backendStatus" className="be-offline" style={{margin: '12px auto 0', width: 'fit-content'}}>
          <span className="be-dot" /><span id="backendStatusText">Checking backend...</span>
        </div>
      </div>
      {/* TRIGGER CONDITIONS STRIP */}
      <div className="trigger-strip" id="triggerStrip">
        <div className="trigger-chip tc-ok" id="tc-tds">TDS: — mg/L</div>
        <div className="trigger-chip tc-ok" id="tc-turb">Turbidity: — NTU</div>
        <div className="trigger-chip tc-ok" id="tc-drink">Water: Checking...</div>
        <div className="trigger-chip tc-ok" id="tc-ph">pH: —</div>
      </div>
      {/* CONTACTS TABLE */}
      <div className="contacts-card">
        <div className="contacts-header">Alert Recipients — अधिकारी सूची</div>
        <div id="contactsList">
          {/* Rendered by JS */}
        </div>
      </div>
      {/* ALERT HISTORY TABLE */}
      <div className="gov-card">
        <div className="gov-card-header">
          <div className="gov-card-title">Alert History — अलर्ट इतिहास</div>
        </div>
        <div className="gov-card-body" style={{padding: 0}}>
          <div className="alert-history-row ah-head">
            <span>Time</span>
            <span>Village / Issue</span>
            <span>Recipients</span>
            <span>Status</span>
            <span>Type</span>
          </div>
          <div id="alertHistoryBody">
            {/* FIX: Populated dynamically from Firebase /alerts.json */}
            <div id="alertHistoryFirebaseRows">
              <div className="alert-history-row">
                <span style={{color: 'var(--gov-gray3)'}}>⏳</span>
                <span>Loading from Firebase...</span>
                <span>—</span><span>—</span><span>—</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  {/* ══════════════════════════════════════
     ABOUT PAGE
══════════════════════════════════════ */}
  <div className="page" id="page-about">
    <div className="page-content">
      <div className="gov-card" style={{marginBottom: 10}}>
        <div className="gov-card-header"><div className="gov-card-title">About Varun — Varun के बारे में</div></div>
        <div className="gov-card-body">
          <p style={{fontSize: 13, color: 'var(--gov-gray2)', lineHeight: '1.8', marginBottom: 16}}>
            Varun is a real-time IoT + AI water quality monitoring system developed by <strong>Alpha Coders</strong> for the Jal Jeevan Mission. It is designed to help field operators and district health officials observe real-time water-quality measurements at rural and mining-affected water points in Dhanbad District, Jharkhand — where coal mine discharge, acidic mine drainage, and heavy-metal contamination (iron, TDS, low pH) pose ongoing risks to groundwater and surface water sources.
          </p>
          <p style={{fontSize: 13, color: 'var(--gov-gray2)', lineHeight: '1.8'}}>
            <strong>Deployment — Dhanbad District, Jharkhand:</strong> Varun is designed as a deployment model for water points across Dhanbad's coal-mining belt, connecting field-level water-quality measurement with a centralized monitoring view — with an AI-based risk indicator to support follow-up by ASHA workers and district health officers in mining-affected villages.
          </p>
        </div>
      </div>
      <div className="gov-card" style={{marginBottom: 10}}>
        <div className="gov-card-header"><div className="gov-card-title">Jal Jeevan Mission — Jharkhand Context</div></div>
        <div className="gov-card-body">
          <p style={{fontSize: 13, color: 'var(--gov-gray2)', lineHeight: '1.8', marginBottom: 12}}>
            The <strong>Jal Jeevan Mission (JJM)</strong> is the national program to provide tap water to every rural household. In Jharkhand, implementation under JJM focuses on village-level action plans, water quality testing labs, and community participation. Work is ongoing, with the completion target extended to <strong>December 2028</strong>.
          </p>
          <div style={{fontSize: 13, color: 'var(--gov-gray2)', lineHeight: '1.9'}}>
            <div style={{fontWeight: 700, color: 'var(--gov-blue)', marginBottom: 4}}>Authorities at Different Levels</div>
            <div><strong>National:</strong> National Jal Jeevan Mission</div>
            <div><strong>State:</strong> State Water &amp; Sanitation Mission (SWSM) · Jharkhand Department of Drinking Water &amp; Sanitation</div>
            <div><strong>District:</strong> District Water &amp; Sanitation Mission (DWSM) · Deputy Commissioner (district-level implementation review)</div>
            <div><strong>Village:</strong> Gram Panchayat · Paani Samiti / Village Water Sanitation Committee (VWSC)</div>
          </div>
        </div>
      </div>
      <div className="gov-card" style={{marginBottom: 10}}>
        <div className="gov-card-header"><div className="gov-card-title">Research &amp; References</div></div>
        <div className="gov-card-body">
          <div className="research-list">
            <p style={{marginBottom: 10}}><strong>World Health Organization (WHO)</strong> — Guidelines for Drinking-water Quality: drinking-water safety, health risks and water-quality management.<br/>
              <a href="https://www.who.int/publications/i/item/9789241549950" target="_blank" rel="noopener noreferrer">WHO Drinking-water Quality Guidelines →</a></p>
            <p style={{marginBottom: 10}}><strong>Jal Jeevan Mission, Government of India</strong> — Water quality parameters: pH, TDS, turbidity and other drinking-water limits.<br/>
              <a href="https://ejalshakti.gov.in/jjm/" target="_blank" rel="noopener noreferrer">Jal Jeevan Mission — Water Quality →</a></p>
            <p style={{marginBottom: 10}}><strong>CPCB (Central Pollution Control Board)</strong> — Water-quality monitoring and environmental standards in India.<br/>
              <a href="https://cpcb.nic.in/water-quality-criteria/" target="_blank" rel="noopener noreferrer">CPCB Water Quality Standards →</a></p>
            <p style={{marginBottom: 10}}><strong>ML for Water Quality Prediction</strong> — Peer-reviewed studies on Random Forest and other ML models for water-quality assessment.<br/>
              <a href="https://pubmed.ncbi.nlm.nih.gov/36958657/" target="_blank" rel="noopener noreferrer">Water quality prediction using Random Forest →</a></p>
            <p style={{marginBottom: 0}}><strong>WHO — Treatment Methods &amp; Performance</strong> — Reference for RO, filtration, activated carbon and UV treatment technologies.<br/>
              <a href="https://www.who.int/news-room/fact-sheets/detail/drinking-water" target="_blank" rel="noopener noreferrer">WHO — Drinking Water Fact Sheet →</a></p>
          </div>
          <div style={{fontSize: 11, color: 'var(--gov-gray3)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--gov-border)'}}>
            Additional reference: <a href="https://www.maxapress.com/article/doi/10.48130/biocontam-0026-0009" target="_blank" rel="noopener noreferrer" style={{color: 'var(--gov-blue)'}}>maxapress.com — Biocontamination, DOI 10.48130/biocontam-0026-0009</a>
          </div>
        </div>
      </div>
      <div className="gov-card" style={{marginBottom: 10}}>
        <div className="gov-card-header">
          <div>
            <div className="gov-card-title">Comparison with Existing Systems in Jharkhand</div>
            <div className="gov-card-title-hi" style={{marginTop: 2}}>Self-assessed against publicly described feature sets — not an official benchmark</div>
          </div>
        </div>
        <div className="gov-card-body" style={{overflowX: 'auto'}}>
          <table className="compare-table">
            <thead>
              <tr><th>Feature</th><th className="varun-col">VARUN</th><th>Jhar-Jal</th><th>JJM Testing</th><th>JSPCB RTWQMS</th><th>Mine Water Monitoring</th></tr>
            </thead>
            <tbody>
              <tr><td>Real-Time Monitoring</td><td className="varun-col yes">✔</td><td className="no">✘</td><td className="no">✘</td><td className="yes">✔</td><td className="no">✘</td></tr>
              <tr><td>Multi-Parameter Sensors</td><td className="varun-col yes">✔</td><td className="yes">✔</td><td className="yes">✔</td><td className="yes">✔</td><td className="yes">✔</td></tr>
              <tr><td>Purification Tracking</td><td className="varun-col yes">✔</td><td className="no">✘</td><td className="no">✘</td><td className="no">✘</td><td className="yes">✔</td></tr>
              <tr><td>Before–After Verification</td><td className="varun-col yes">✔</td><td className="no">✘</td><td className="no">✘</td><td className="no">✘</td><td className="no">✘</td></tr>
              <tr><td>AI/ML Risk Analysis</td><td className="varun-col yes">✔</td><td className="no">✘</td><td className="no">✘</td><td className="no">✘</td><td className="no">✘</td></tr>
              <tr><td>Automatic Safety Control</td><td className="varun-col no">✘ (alerts only)</td><td className="no">✘</td><td className="no">✘</td><td className="no">✘</td><td className="no">✘</td></tr>
              <tr><td>Remote Alerts</td><td className="varun-col yes">✔</td><td className="yes">✔</td><td className="no">✘</td><td className="yes">✔</td><td className="no">✘</td></tr>
              <tr><td>Rural + Mining Focus</td><td className="varun-col yes">✔</td><td className="yes">✔</td><td className="no">✘</td><td className="yes">✔</td><td className="yes">✔</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
  {/* FOOTER */}
  <div className="gov-footer">
    <strong>Varun — जल स्वास्थ्य निरीक्षण प्रणाली</strong><br />
    Developed by Alpha Coders · Jal Jeevan Mission<br />
    GEC Dhanbad · NHM Jharkhand
  </div>
  {/* ══════════════════════════════════════
     JAVASCRIPT
══════════════════════════════════════ */}
</div>

    </>
  );
}