import { useEffect, useRef } from 'react';
import './styles/varun.css';
import './styles/asha.css';

/**
 * VARUN — ASHA Worker Portal
 * Converted from the standalone single-file HTML app at
 * public/asha/index.html (vanilla JS + IndexedDB offline queue) into a
 * React component — same porting approach used for AquaGuard.jsx: the
 * original DOM-manipulation logic is preserved almost as-is inside a
 * single useEffect that runs once after mount, and JSX (with the same
 * element ids) replaces the original HTML body.
 *
 */

const FB_BASE = import.meta.env.VITE_FIREBASE_BASE || 'https://varun-735df-default-rtdb.firebaseio.com';
const FB_R = `${FB_BASE}/asha_reports.json`;
const FB_A = `${FB_BASE}/asha_alerts.json`;

export default function AshaPortal() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    /* eslint-disable */
    const _intervals = [];

    // ═══════════════════════════════════════
    // LANGUAGE SYSTEM
    // ═══════════════════════════════════════
    const LANGS = {
      hi: {
        nav_home: 'होम', nav_sms: 'अलर्ट', nav_history: 'इतिहास', nav_dash: 'रैंकिंग',
        bc_home: 'फील्ड रिपोर्ट', bc_home_sub: 'रिपोर्ट दर्ज करें', bc_sms: 'SMS अलर्ट', bc_sms_sub: 'अलर्ट भेजें',
        bc_history: 'रिपोर्ट इतिहास', bc_history_sub: 'पुरानी रिपोर्टें', bc_dash: 'गांव रैंकिंग',
        card_worker: 'ASHA कार्यकर्ता विवरण', card_worker_sub: 'आशा कार्यकर्ता की जानकारी',
        card_quick: 'त्वरित लक्षण', card_quick_sub: 'जल्दी लक्षण चुनें',
        card_cases: 'बीमारी के मामले', card_cases_sub: 'गांव में बीमारी',
        card_sev: 'गंभीरता', card_sev_sub: 'स्थिति की गंभीरता',
        card_alert: 'नया अलर्ट', card_alert_sub: 'नया अलर्ट संदेश लिखें',
        card_sent: 'भेजे गए अलर्ट', card_trend: 'बीमारी विश्लेषण', card_activity: 'हाल की गतिविधि',
        lbl_name: 'आशा का नाम', lbl_village: 'गांव', lbl_district: 'जिला', lbl_date: 'तारीख',
        lbl_notes: 'विशेष जानकारी', lbl_level: 'अलर्ट स्तर',
        dis_cholera: 'हैजा / Cholera', dis_fever: 'बुखार / Fever', dis_typhoid: 'टाइफाइड', dis_others: 'अन्य',
        sev_low: 'सामान्य', sev_med: 'मध्यम', sev_high: 'गंभीर',
        btn_submit: 'रिपोर्ट भेजें', btn_send_alert: 'डैशबोर्ड पर भेजें',
        lv_normal: 'सामान्य', lv_warn: 'चेतावनी', lv_emergency: 'आपातकाल',
        mandatory_hdr: 'अनिवार्य हेडर — स्वचालित:',
        offline_queued: 'रिपोर्ट ऑफलाइन सेव', offline_sub: 'इंटरनेट आने पर सिंक होगी',
        wx_label: 'आज का जल जोखिम परामर्श',
        qs_total: 'कुल मामले', qs_reports: 'रिपोर्ट', qs_fever: 'बुखार',
        rank_title: 'गांव रैंकिंग — स्वास्थ्य स्कोर', rank_sub: 'कम बीमारी = बेहतर रैंक', rank_empty: 'अभी कोई रिपोर्ट नहीं',
        empty_alerts: 'कोई अलर्ट नहीं', empty_history: 'कोई रिपोर्ट नहीं', empty_activity: 'कोई गतिविधि नहीं',
        voice_fill: 'आवाज से फॉर्म भरें',
        hdr_hi: 'जल स्वास्थ्य निरीक्षण — आशा पोर्टल', live_txt: 'सक्रिय',
        t_ok: 'रिपोर्ट जमा!', t_high: 'गंभीर! अलर्ट गया!', t_offline: 'ऑफलाइन — सेव हुई',
        t_synced: 'सिंक हो गई!', t_name: 'अपना नाम लिखें!', t_village: 'गांव का नाम लिखें!', t_msg: 'संदेश खाली है!',
      },
      en: {
        nav_home: 'Home', nav_sms: 'Alert', nav_history: 'History', nav_dash: 'Rankings',
        bc_home: 'Field Report', bc_home_sub: 'Submit Report', bc_sms: 'SMS Alert', bc_sms_sub: 'Send Alert',
        bc_history: 'Report History', bc_history_sub: 'Past Reports', bc_dash: 'Village Rankings',
        card_worker: 'ASHA Worker Details', card_worker_sub: 'Worker information',
        card_quick: 'Quick Symptoms', card_quick_sub: 'Tap to select symptoms',
        card_cases: 'Disease Cases', card_cases_sub: 'Village disease cases',
        card_sev: 'Severity', card_sev_sub: 'Situation severity',
        card_alert: 'New Alert', card_alert_sub: 'Write a new alert',
        card_sent: 'Sent Alerts', card_trend: 'Disease Breakdown', card_activity: 'Recent Activity',
        lbl_name: 'ASHA Name', lbl_village: 'Village', lbl_district: 'District', lbl_date: 'Date',
        lbl_notes: 'Special Notes', lbl_level: 'Alert Level',
        dis_cholera: 'Cholera / हैजा', dis_fever: 'Fever / बुखार', dis_typhoid: 'Typhoid', dis_others: 'Others',
        sev_low: 'Normal', sev_med: 'Moderate', sev_high: 'Critical',
        btn_submit: 'Submit Report', btn_send_alert: 'Send to Dashboard',
        lv_normal: 'Normal', lv_warn: 'Warning', lv_emergency: 'Emergency',
        mandatory_hdr: 'Mandatory Header — Auto Added:',
        offline_queued: 'Reports saved offline', offline_sub: 'Will sync when online',
        wx_label: "Today's Water Risk Advisory",
        qs_total: 'Total Cases', qs_reports: 'Reports', qs_fever: 'Fever',
        rank_title: 'Village Rankings — Health Score', rank_sub: 'Fewer cases = better rank', rank_empty: 'No reports yet',
        empty_alerts: 'No alerts sent yet', empty_history: 'No reports yet', empty_activity: 'No activity yet',
        voice_fill: 'Fill form by voice',
        hdr_hi: 'Water Health Surveillance — ASHA Portal', live_txt: 'LIVE',
        t_ok: 'Report submitted!', t_high: 'Critical! Alert sent!', t_offline: 'Offline — saved locally',
        t_synced: 'All synced!', t_name: 'Please enter your name!', t_village: 'Please enter village!', t_msg: 'Message is empty!',
      },
      mr: {
        nav_home: 'घर', nav_sms: 'सूचना', nav_history: 'इतिहास', nav_dash: 'रैंकिंग',
        bc_home: 'खेत रिपोर्ट', bc_home_sub: 'रिपोर्ट दर्ज करो', bc_sms: 'सूचना', bc_sms_sub: 'सूचना भेजो',
        bc_history: 'रिपोर्ट इतिहास', bc_history_sub: 'पुरानी रिपोर्ट', bc_dash: 'गांव रैंकिंग',
        card_worker: 'आशा कार्यकर्ता जाणकारी', card_worker_sub: 'आशा कार्यकर्ता री जाणकारी',
        card_quick: 'जल्दी लक्षण', card_quick_sub: 'लक्षण चुनो',
        card_cases: 'बीमारी रा मामला', card_cases_sub: 'गांव में बीमारी',
        card_sev: 'गंभीरता', card_sev_sub: 'हालत री गंभीरता',
        card_alert: 'नयो अलर्ट', card_alert_sub: 'नयो अलर्ट लिखो',
        card_sent: 'भेजिया अलर्ट', card_trend: 'बीमारी विश्लेषण', card_activity: 'ताजी गतिविधि',
        lbl_name: 'आशा रो नाम', lbl_village: 'गांव', lbl_district: 'जिलो', lbl_date: 'तारीख',
        lbl_notes: 'खास बात', lbl_level: 'अलर्ट स्तर',
        dis_cholera: 'हैजो / Cholera', dis_fever: 'बुखार / Fever', dis_typhoid: 'टाइफाइड', dis_others: 'दूजा',
        sev_low: 'सामान्य', sev_med: 'मध्यम', sev_high: 'गंभीर',
        btn_submit: 'रिपोर्ट भेजो', btn_send_alert: 'डैशबोर्ड पर भेजो',
        lv_normal: 'सामान्य', lv_warn: 'चेतावनी', lv_emergency: 'आपातकाल',
        mandatory_hdr: 'जरूरी हेडर — अपने आप:',
        offline_queued: 'रिपोर्ट ऑफलाइन सेव', offline_sub: 'इंटरनेट आयां सिंक होसी',
        wx_label: 'आज रो जल जोखिम परामर्श',
        qs_total: 'कुल मामला', qs_reports: 'रिपोर्ट', qs_fever: 'बुखार',
        rank_title: 'गांव रैंकिंग — स्वास्थ्य स्कोर', rank_sub: 'कम बीमारी = बेहतर रैंक', rank_empty: 'अभी कोई रिपोर्ट नहीं',
        empty_alerts: 'कोई अलर्ट नहीं', empty_history: 'कोई रिपोर्ट नहीं', empty_activity: 'कोई गतिविधि नहीं',
        voice_fill: "बोल'र फॉर्म भरो",
        hdr_hi: 'जल सेवा निगरानी — आशा पोर्टल', live_txt: 'सक्रिय',
        t_ok: 'रिपोर्ट जमा हो गी!', t_high: 'गंभीर! अलर्ट गयो!', t_offline: 'ऑफलाइन — सेव हो गी',
        t_synced: 'सारी सिंक हो गी!', t_name: 'आपरो नाम लिखो!', t_village: 'गांव रो नाम लिखो!', t_msg: 'संदेश खाली है!',
      },
    };

    let currentLang = localStorage.getItem('asha_lang') || 'hi';
    function t(key) { return (LANGS[currentLang] || {})[key] || (LANGS.en || {})[key] || key; }

    function setLang(lang) {
      currentLang = lang;
      localStorage.setItem('asha_lang', lang);
      document.querySelectorAll('.asha-app .lang-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('lb-' + lang)?.classList.add('active');
      applyLang();
    }

    function applyLang() {
      document.querySelectorAll('.asha-app [data-key]').forEach(el => {
        const v = t(el.getAttribute('data-key'));
        if (v) el.textContent = v;
      });
      const hdrHi = document.getElementById('hdr-hi'); if (hdrHi) hdrHi.textContent = t('hdr_hi');
      const liveTxt = document.getElementById('live-txt'); if (liveTxt) liveTxt.textContent = t('live_txt') || 'LIVE';
      updatePreview();
    }

    // ═══════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════
    const state = {
      currentLevel: 'green', severity: 'low', smsCount: 0, criticals: 0, reports: 0,
      totals: { cholera: 0, fever: 0, typhoid: 0, others: 0 },
      villages: new Set(), historyItems: [], selectedSymptoms: new Set(),
      isOnline: navigator.onLine, voiceActive: false,
    };

    // ═══════════════════════════════════════
    // INDEXED DB
    // ═══════════════════════════════════════
    let db;
    const DB_NAME = 'AshaPortalOffline', DB_VER = 1;
    const STORE_R = 'pending_reports', STORE_A = 'pending_alerts';

    function initDB() {
      return new Promise((res, rej) => {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = e => {
          const d = e.target.result;
          if (!d.objectStoreNames.contains(STORE_R)) d.createObjectStore(STORE_R, { keyPath: 'id', autoIncrement: true });
          if (!d.objectStoreNames.contains(STORE_A)) d.createObjectStore(STORE_A, { keyPath: 'id', autoIncrement: true });
        };
        req.onsuccess = e => { db = e.target.result; res(db); };
        req.onerror = () => rej(req.error);
      });
    }
    function dbAdd(store, data) { return new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); const req = tx.objectStore(store).add(data); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
    function dbGetAll(store) { return new Promise((res, rej) => { const tx = db.transaction(store, 'readonly'); const req = tx.objectStore(store).getAll(); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
    function dbDelete(store, id) { return new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); const req = tx.objectStore(store).delete(id); req.onsuccess = () => res(); req.onerror = () => rej(req.error); }); }
    async function dbCount(store) { return (await dbGetAll(store)).length; }

    // ═══════════════════════════════════════
    // ONLINE / OFFLINE
    // ═══════════════════════════════════════
    function updateOnlineStatus() {
      const wasOnline = state.isOnline;
      state.isOnline = navigator.onLine;
      const bar = document.getElementById('offline-bar');
      const topbar = document.getElementById('asha-topbar');
      const app = document.getElementById('app');
      if (!bar || !topbar || !app) return;
      if (!state.isOnline) {
        bar.classList.add('show');
        topbar.style.top = '32px'; app.style.top = '92px';
        document.getElementById('live-txt').textContent = 'Offline';
      } else {
        bar.classList.remove('show');
        topbar.style.top = '0'; app.style.top = '60px';
        document.getElementById('live-txt').textContent = t('live_txt') || 'LIVE';
        if (!wasOnline) syncOfflineQueue();
      }
      updateQueueUI();
    }
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    async function updateQueueUI() {
      if (!db) return;
      const rc = await dbCount(STORE_R);
      const ac = await dbCount(STORE_A);
      const total = rc + ac;
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('queue-count-badge', total + ' pending');
      set('queueCountHome', total);
      set('queueCountSms', total);
      set('dashQueueCount', total);
      const show = total > 0;
      document.getElementById('queueBanner')?.classList.toggle('show', show);
      document.getElementById('queueBannerSms')?.classList.toggle('show', show);
      const offCard = document.getElementById('offlineDashCard');
      if (offCard) offCard.style.display = show ? 'block' : 'none';
    }

    async function syncOfflineQueue() {
      if (!state.isOnline || !db) return;
      const spinner = document.getElementById('sync-spinner');
      if (spinner) spinner.style.display = 'block';
      try {
        for (const r of await dbGetAll(STORE_R)) {
          const { id, ...data } = r;
          try { const res = await fetch(FB_R, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, synced: true, syncedAt: new Date().toISOString() }) }); if (res.ok) await dbDelete(STORE_R, id); } catch (e) {}
        }
        for (const a of await dbGetAll(STORE_A)) {
          const { id, ...data } = a;
          try { const res = await fetch(FB_A, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, synced: true, syncedAt: new Date().toISOString() }) }); if (res.ok) await dbDelete(STORE_A, id); } catch (e) {}
        }
        const rem = (await dbCount(STORE_R)) + (await dbCount(STORE_A));
        if (rem === 0) showToast(t('t_synced'), 'ok');
        await updateQueueUI();
      } finally {
        if (spinner) spinner.style.display = 'none';
      }
    }

    async function forceSyncNow() {
      if (!state.isOnline) { showToast('Internet nahi hai!', 'err'); return; }
      await syncOfflineQueue();
    }

    async function bridgeSaveReport(r) {
      const payload = { ...r, savedAt: new Date().toISOString() };
      if (state.isOnline) {
        const response = await fetch(FB_R, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`Report save failed: HTTP ${response.status}`);
        return;
      }
      await dbAdd(STORE_R, payload);
      await updateQueueUI();
    }
    async function bridgeSave(name, village, msg, level) {
      const payload = { name, village, msg, level, time: new Date().toISOString() };
      if (state.isOnline) {
        const response = await fetch(FB_A, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`Alert save failed: HTTP ${response.status}`);
        return;
      }
      await dbAdd(STORE_A, payload);
      await updateQueueUI();
    }

    function firebaseValues(data) {
      if (Array.isArray(data)) return data.filter(Boolean);
      if (data && typeof data === 'object') return Object.values(data).filter(Boolean);
      return [];
    }

    function reportToHistoryItem(report) {
      return {
        name: report.name || report.worker_name || 'ASHA Worker',
        village: report.village || '—',
        district: report.district || '—',
        date: report.date || (report.timestamp || report.savedAt || '').slice(0, 10) || '—',
        timeStr: report.timeStr || (report.timestamp || report.savedAt ? new Date(report.timestamp || report.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'),
        c: Number(report.cholera ?? report.cholera_cases ?? 0),
        f: Number(report.fever ?? report.fever_cases ?? 0),
        t: Number(report.typhoid ?? report.typhoid_cases ?? 0),
        o: Number(report.others ?? report.other_cases ?? report.diarrhea ?? report.diarrhea_cases ?? 0),
        sev: (report.severity || 'low').toLowerCase(),
        notes: report.notes || '',
      };
    }

    function renderDatabaseHistory(reports) {
      const feed = document.getElementById('histFeed');
      if (!feed) return;
      feed.innerHTML = '';
      state.historyItems = reports.map(reportToHistoryItem);
      if (!state.historyItems.length) {
        feed.innerHTML = `<div class="empty-state">${t('empty_history')}</div>`;
      } else {
        state.historyItems.forEach(item => addHistItem(item, false));
      }
      document.getElementById('histCount').textContent = state.historyItems.length + ' Reports';
      document.getElementById('clearHistBtn').style.display = state.historyItems.length ? 'inline-flex' : 'none';
      document.getElementById('exportBtn').style.display = state.historyItems.length ? 'inline-flex' : 'none';
    }

    function renderDatabaseAlerts(alerts) {
      const feed = document.getElementById('smsFeed');
      if (!feed) return;
      feed.innerHTML = '';
      if (!alerts.length) {
        feed.innerHTML = `<div class="empty-state">${t('empty_alerts')}</div>`;
        document.getElementById('sentBadge').classList.remove('show');
      } else {
        alerts.forEach(alert => {
          const level = alert.level || 'green';
          const div = document.createElement('div');
          div.className = `sms-item ${level}`;
          div.innerHTML = `<div class="sms-item-head"><div class="sms-item-who ${level}">${alert.name || 'ASHA Worker'} — ${alert.village || '—'}</div><div class="sms-item-time">${alert.time ? new Date(alert.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</div></div><div class="sms-item-msg">${alert.msg || alert.message || 'ASHA Alert'}</div><div class="sms-item-delivered"><span class="live-dot"></span>Database se loaded</div>`;
          feed.appendChild(div);
        });
        const badge = document.getElementById('sentBadge');
        badge.textContent = alerts.length;
        badge.classList.add('show');
      }
      state.smsCount = alerts.length;
        const smsCount = document.getElementById('d-sms');
        if (smsCount) smsCount.textContent = alerts.length;
    }

    async function refreshDatabaseData() {
      if (!state.isOnline) return;
      try {
        const [reportsResp, alertsResp] = await Promise.all([fetch(FB_R), fetch(FB_A)]);
        if (!reportsResp.ok || !alertsResp.ok) throw new Error('Firebase read failed');
        const reports = firebaseValues(await reportsResp.json()).sort((a, b) => new Date(b.timestamp || b.savedAt || 0) - new Date(a.timestamp || a.savedAt || 0));
        const alerts = firebaseValues(await alertsResp.json()).sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
        renderDatabaseHistory(reports);
        renderDatabaseAlerts(alerts);
        state.reports = reports.length;
        state.totals = reports.reduce((totals, report) => {
          totals.cholera += Number(report.cholera ?? 0);
          totals.fever += Number(report.fever ?? 0);
          totals.typhoid += Number(report.typhoid ?? 0);
          totals.others += Number(report.others ?? 0);
          return totals;
        }, { cholera: 0, fever: 0, typhoid: 0, others: 0 });
        state.villages = new Set(reports.map(report => report.village).filter(Boolean));
        refreshQuickStats();
      } catch (error) {
        console.warn('[ASHA] Firebase reports/alerts fetch failed:', error.message);
      }
    }

    // ═══════════════════════════════════════
    // NAVIGATION
    // ═══════════════════════════════════════
    function goTo(page) {
      document.querySelectorAll('.asha-app .page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.asha-app .asha-tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('pg-' + page)?.classList.add('active');
      document.getElementById('nb-' + page)?.classList.add('active');
      if (page === 'dash') { refreshRankings(); }
    }

    // ═══════════════════════════════════════
    // WEATHER
    // ═══════════════════════════════════════
    async function loadWeather() {
      try {
        const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=23.80&longitude=86.45&current=temperature_2m,precipitation,weathercode&daily=precipitation_sum&timezone=Asia/Kolkata&forecast_days=1');
        const d = await r.json();
        const temp = Math.round(d.current.temperature_2m);
        const rain = d.daily.precipitation_sum[0];
        let icon = '🌤️', advisory = '';
        if (rain > 20) { icon = '🌧️'; advisory = currentLang === 'en' ? '⚠️ Heavy rain — high waterborne disease risk!' : '⚠️ भारी बारिश — जलजनित बीमारी का खतरा!'; }
        else if (rain > 5) { icon = '🌦️'; advisory = currentLang === 'en' ? '⚠️ Rain — monitor water sources' : '⚠️ बारिश — पानी के स्रोत जांचें'; }
        else if (temp > 40) { icon = '🌡️'; advisory = currentLang === 'en' ? '⚠️ Extreme heat — dehydration risk' : '⚠️ अत्यधिक गर्मी — डिहाइड्रेशन'; }
        else { advisory = currentLang === 'en' ? '✅ Conditions normal' : '✅ मौसम सामान्य'; }
        document.getElementById('wx-icon').textContent = icon;
        document.getElementById('wx-detail').textContent = `${temp}°C | Rain: ${rain}mm | Dhanbad`;
        document.getElementById('wx-advisory').textContent = advisory;
      } catch (e) {
        const wx = document.getElementById('wx-detail'); if (wx) wx.textContent = state.isOnline ? 'Unavailable' : 'Offline';
      }
    }

    // ═══════════════════════════════════════
    // AI RISK
    // ═══════════════════════════════════════
    function updateAIRisk() {
      const c = parseInt(document.getElementById('f-cholera')?.value) || 0;
      const f = parseInt(document.getElementById('f-fever')?.value) || 0;
      const ty = parseInt(document.getElementById('f-typhoid')?.value) || 0;
      const o = parseInt(document.getElementById('f-others')?.value) || 0;
      const total = c + f + ty + o;
      const card = document.getElementById('aiRiskCard');
      if (!card) return;
      if (total === 0) { card.style.display = 'none'; return; }
      card.style.display = 'block';
      const weighted = (c * 3) + (ty * 3) + f + (o * 1.5);
      const score = Math.min(100, Math.round((weighted / 30) * 100));
      let risk, color, msg;
      if (score >= 70 || c >= 3 || ty >= 3) { risk = 'CRITICAL'; color = '#dc2626'; msg = currentLang === 'en' ? 'Outbreak risk! Immediate action required.' : 'गंभीर प्रकोप! तुरंत कार्रवाई जरूरी।'; autoSetSev('high'); }
      else if (score >= 40) { risk = 'HIGH'; color = '#d97706'; msg = currentLang === 'en' ? 'High risk. Monitor closely.' : 'उच्च जोखिम। नज़र रखें।'; autoSetSev('med'); }
      else if (score >= 15) { risk = 'MODERATE'; color = '#f59e0b'; msg = currentLang === 'en' ? 'Moderate risk. Continue surveillance.' : 'मध्यम जोखिम।'; }
      else { risk = 'LOW'; color = '#16a34a'; msg = currentLang === 'en' ? 'Low risk. Routine reporting.' : 'कम जोखिम।'; }
      document.getElementById('ai-risk-val').textContent = risk;
      document.getElementById('ai-risk-val').style.color = color;
      document.getElementById('ai-risk-msg').textContent = msg;
      document.getElementById('ai-risk-fill').style.width = score + '%';
      document.getElementById('ai-risk-fill').style.background = color;
    }

    function autoSetSev(level) {
      const opts = document.querySelectorAll('.asha-app .sev-opt');
      opts.forEach(o => o.classList.remove('chosen'));
      const idx = level === 'high' ? 2 : level === 'med' ? 1 : 0;
      if (opts[idx]) { opts[idx].classList.add('chosen'); state.severity = level; opts[idx].querySelector('input').checked = true; }
    }

    // ═══════════════════════════════════════
    // SYMPTOMS
    // ═══════════════════════════════════════
    function toggleSymptom(el, name) {
      el.classList.toggle('sel');
      if (el.classList.contains('sel')) state.selectedSymptoms.add(name);
      else state.selectedSymptoms.delete(name);
      const notes = document.getElementById('f-notes');
      const base = notes.value.replace(/\nSelected symptoms:.*/s, '').trim();
      notes.value = state.selectedSymptoms.size > 0 ? base + (base ? '\n' : '') + 'Selected symptoms: ' + [...state.selectedSymptoms].join(', ') : base;
    }

    // ═══════════════════════════════════════
    // VOICE INPUT
    // ═══════════════════════════════════════
    let recognition = null;
    function toggleVoice() {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { showToast('Voice not supported', 'err'); return; }
      if (state.voiceActive) { recognition && recognition.stop(); return; }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SR();
      recognition.lang = currentLang === 'en' ? 'en-IN' : 'hi-IN';
      recognition.onstart = () => { state.voiceActive = true; document.getElementById('voiceBtn').classList.add('recording'); document.getElementById('voice-btn-text').textContent = '🔴 Bol rahe hain...'; };
      recognition.onresult = e => {
        const tx = e.results[0][0].transcript;
        document.getElementById('f-notes').value += (document.getElementById('f-notes').value ? ' ' : '') + tx;
        showToast('Voice record hui!', 'ok');
      };
      recognition.onend = () => { state.voiceActive = false; document.getElementById('voiceBtn').classList.remove('recording'); document.getElementById('voice-btn-text').textContent = t('voice_fill'); };
      recognition.onerror = () => { showToast('Voice error', 'err'); state.voiceActive = false; document.getElementById('voiceBtn').classList.remove('recording'); };
      recognition.start();
    }

    // ═══════════════════════════════════════
    // FORM SYNC
    // ═══════════════════════════════════════
    function syncTop() {
      const name = document.getElementById('f-name').value.trim();
      const village = document.getElementById('f-village').value.trim();
      const chip = document.getElementById('workerChip');
      if (name || village) {
        chip.style.display = 'flex';
        document.getElementById('topName').textContent = name || '—';
        document.getElementById('topVillage').textContent = (currentLang === 'en' ? 'Village: ' : 'गांव: ') + (village || '—');
        document.getElementById('quickStats').style.display = 'grid';
        document.getElementById('sms-name').value = name;
        document.getElementById('sms-village').value = village;
        updatePreview();
      } else { chip.style.display = 'none'; document.getElementById('quickStats').style.display = 'none'; }
    }
    function syncSmsToHome() {
      document.getElementById('f-name').value = document.getElementById('sms-name').value;
      document.getElementById('f-village').value = document.getElementById('sms-village').value;
      syncTop();
    }
    function setSev(val, el) { state.severity = val; document.querySelectorAll('.asha-app .sev-opt').forEach(o => o.classList.remove('chosen')); el.classList.add('chosen'); }
    function setLevel(el) { document.querySelectorAll('.asha-app .level-btn-gov').forEach(b => b.classList.remove('sel')); el.classList.add('sel'); state.currentLevel = el.dataset.level; }
    function updateCharCount() { document.getElementById('charCount').textContent = document.getElementById('smsText').value.length + ' / 300'; }
    function updatePreview() {
      const name = document.getElementById('sms-name')?.value.trim() || '—';
      const village = document.getElementById('sms-village')?.value.trim() || '—';
      const d = new Date().toLocaleDateString(currentLang === 'en' ? 'en-IN' : 'hi-IN');
      const el = document.getElementById('mandatoryPreview');
      if (el) el.textContent = `ASHA ALERT | Gaon: ${village} | ASHA: ${name} | Taareekh: ${d}`;
    }

    // ═══════════════════════════════════════
    // SUBMIT REPORT
    // ═══════════════════════════════════════
    async function submitReport() {
      const name = document.getElementById('f-name').value.trim();
      const village = document.getElementById('f-village').value.trim();
      const district = document.getElementById('f-district').value;
      const date = document.getElementById('f-date').value || new Date().toLocaleDateString('en-IN');
      const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const c = parseInt(document.getElementById('f-cholera').value) || 0;
      const f = parseInt(document.getElementById('f-fever').value) || 0;
      const ty = parseInt(document.getElementById('f-typhoid').value) || 0;
      const o = parseInt(document.getElementById('f-others').value) || 0;
      const notes = document.getElementById('f-notes').value.trim();
      const sev = state.severity;
      const total = c + f + ty + o;
      if (!name) { showToast(t('t_name'), 'err'); return; }
      if (!village) { showToast(t('t_village'), 'err'); return; }
      if (!district) { showToast('Zila chunen!', 'err'); return; }
      state.reports++; state.totals.cholera += c; state.totals.fever += f; state.totals.typhoid += ty; state.totals.others += o; state.villages.add(village);
      const reportObj = { worker_name: name, village, district, date, timeStr, timestamp: new Date().toISOString(), cholera: c, fever: f, typhoid: ty, others: o, total, severity: sev, notes, symptoms: [...state.selectedSymptoms] };
      addHistItem({ name, village, district, date, timeStr, c, f, t: ty, o, sev, notes });
      if (sev === 'high' || c >= 3 || ty >= 3) {
        const autoMsg = `AUTO-ALERT | ${village},${district} | HIGH | C:${c} F:${f} T:${ty} O:${o} | Total:${total}`;
        await dispatchSMS(name, village, autoMsg, 'red', true);
        document.getElementById('nb-sms-badge').classList.add('show');
      }
        try {
          await bridgeSave(name, village, `ASHA REPORT|${village},${district}|Cases:${total}|${sev.toUpperCase()}`, sev === 'high' ? 'red' : sev === 'med' ? 'yellow' : 'green');
          await bridgeSaveReport(reportObj);
        } catch (error) {
          console.error('[ASHA] Report save failed:', error);
          showToast('Database save failed. Report queued for retry.', 'err');
          await dbAdd(STORE_R, reportObj);
          await updateQueueUI();
          return;
        }
      refreshRankings();
      ['f-cholera', 'f-fever', 'f-typhoid', 'f-others', 'f-notes'].forEach(id => document.getElementById(id).value = '');
      autoSetSev('low'); state.selectedSymptoms.clear(); document.querySelectorAll('.asha-app .sym-chip').forEach(c => c.classList.remove('sel'));
      document.getElementById('aiRiskCard').style.display = 'none';
      refreshQuickStats();
      showToast(!state.isOnline ? t('t_offline') : sev === 'high' ? t('t_high') : t('t_ok'), !state.isOnline ? 'warn' : sev === 'high' ? 'warn' : 'ok');
    }

    // ═══════════════════════════════════════
    // SEND ALERT
    // ═══════════════════════════════════════
    async function sendAlert() {
      const name = document.getElementById('sms-name').value.trim();
      const village = document.getElementById('sms-village').value.trim();
      const msg = document.getElementById('smsText').value.trim();
      if (!name) { showToast(t('t_name'), 'err'); return; }
      if (!village) { showToast(t('t_village'), 'err'); return; }
      if (!msg) { showToast(t('t_msg'), 'err'); return; }
      const d = new Date().toLocaleDateString(currentLang === 'en' ? 'en-IN' : 'hi-IN');
      const fullMsg = `ASHA ALERT | Gaon: ${village} | ASHA: ${name} | Taareekh: ${d}\n\n${msg}`;
      await dispatchSMS(name, village, fullMsg, state.currentLevel, false);
      try {
        await bridgeSave(name, village, fullMsg, state.currentLevel);
      } catch (error) {
        console.error('[ASHA] Alert save failed:', error);
        showToast('Database save failed. Alert queued for retry.', 'err');
        await dbAdd(STORE_A, { name, village, msg: fullMsg, level: state.currentLevel, time: new Date().toISOString() });
        await updateQueueUI();
        return;
      }
      document.getElementById('smsText').value = ''; document.getElementById('charCount').textContent = '0 / 300';
      syncTop(); showToast(state.isOnline ? 'Alert bhej diya!' : t('t_offline'), state.isOnline ? 'ok' : 'warn');
    }

    async function dispatchSMS(name, village, msg, level, isAuto) {
      const feed = document.getElementById('smsFeed');
      const empty = feed.querySelector('.empty-state'); if (empty) empty.remove();
      state.smsCount++; if (level === 'red') state.criticals++;
      document.getElementById('sentCounter').textContent = state.smsCount + ' bheje';
      const smsCount = document.getElementById('d-sms');
      const criticalCount = document.getElementById('d-critical');
      if (smsCount) smsCount.textContent = state.smsCount;
      if (criticalCount) criticalCount.textContent = state.criticals;
      const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const div = document.createElement('div');
      const cls = state.isOnline ? level : 'queued';
      div.className = `sms-item ${cls}`;
      const delivLabel = state.isOnline
        ? `<div class="sms-item-delivered"><span class="live-dot"></span>Dashboard par deliver hua</div>`
        : `<div style="margin-top:4px;font-size:10px;color:var(--gov-gray3);">Offline — sync pending</div>`;
      div.innerHTML = `<div class="sms-item-head"><div class="sms-item-who ${level}">${name} — ${village}${isAuto ? ' <span style="font-size:9px;background:rgba(220,38,38,0.15);padding:1px 4px;border-radius:3px;color:var(--gov-red);">AUTO</span>' : ''}</div><div class="sms-item-time">${timeStr}</div></div><div class="sms-item-msg">${msg}</div>${delivLabel}`;
      feed.insertBefore(div, feed.firstChild);
      const badge = document.getElementById('sentBadge'); badge.textContent = state.smsCount; badge.classList.add('show');
      addActivity(level, `SMS: ${village} — ${msg.substring(0, 50)}...`, timeStr);
    }

    // ═══════════════════════════════════════
    // HISTORY — now includes the live pH captured at report time
    // ═══════════════════════════════════════
    function addHistItem(e, track = true) {
      const feed = document.getElementById('histFeed');
      const empty = feed.querySelector('.empty-state'); if (empty) empty.remove();
      const isHigh = e.sev === 'high', isMed = e.sev === 'med';
      const chip = isHigh ? '<span class="gov-pill pill-danger">Gambhir</span>' : isMed ? '<span class="gov-pill pill-warn">Madhyam</span>' : '<span class="gov-pill pill-safe">Normal</span>';
      const offPill = !state.isOnline ? '<span class="gov-pill pill-offline" style="margin-left:4px;">Offline</span>' : '';
      const bl = isHigh ? 'var(--gov-red)' : isMed ? 'var(--gov-yellow)' : 'var(--gov-green)';
      const div = document.createElement('div'); div.className = 'hist-item'; div.style.borderLeft = `3px solid ${bl}`;
      div.innerHTML = `<div class="hist-head"><div><div class="hist-worker">${e.name}</div><div class="hist-village">${e.village}, ${e.district}</div></div><div><div class="hist-time">${e.timeStr}<br>${e.date}</div><div style="margin-top:4px;text-align:right;">${chip}${offPill}</div></div></div><div class="hist-diseases"><div class="hist-d"><div class="hist-d-val" style="color:var(--gov-red)">${e.c}</div><div class="hist-d-lbl">Cholera</div></div><div class="hist-d"><div class="hist-d-val" style="color:var(--gov-yellow)">${e.f}</div><div class="hist-d-lbl">Fever</div></div><div class="hist-d"><div class="hist-d-val" style="color:#7c3aed">${e.t}</div><div class="hist-d-lbl">Typhoid</div></div><div class="hist-d"><div class="hist-d-val" style="color:var(--gov-blue)">${e.o}</div><div class="hist-d-lbl">Others</div></div></div>${e.notes ? `<div class="hist-notes">${e.notes}</div>` : ''}`;
      feed.insertBefore(div, feed.firstChild);
      if (track) state.historyItems.unshift(e);
      document.getElementById('histCount').textContent = state.historyItems.length + ' Reports';
      document.getElementById('clearHistBtn').style.display = 'inline-flex';
      document.getElementById('exportBtn').style.display = 'inline-flex';
      document.getElementById('nb-hist-badge').classList.add('show');
    }
    function clearHistory() { if (!confirm('Saari history delete karni hai?')) return; document.getElementById('histFeed').innerHTML = '<div class="empty-state">Koi report nahi</div>'; document.getElementById('histCount').textContent = '0 Reports'; document.getElementById('clearHistBtn').style.display = 'none'; document.getElementById('exportBtn').style.display = 'none'; state.historyItems = []; }

    // ═══════════════════════════════════════
    // CSV EXPORT
    // ═══════════════════════════════════════
    function exportCSV() {
      if (!state.historyItems.length) return;
      const h = ['Name', 'Village', 'District', 'Date', 'Time', 'Cholera', 'Fever', 'Typhoid', 'Others', 'Total', 'Severity', 'Notes'];
      const rows = state.historyItems.map(e => [e.name, e.village, e.district, e.date, e.timeStr, e.c, e.f, e.t, e.o, e.c + e.f + e.t + e.o, e.sev, '"' + (e.notes || '').replace(/"/g, "'") + '"']);
      const csv = [h, ...rows].map(r => r.join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `ASHA_Reports_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      showToast('CSV download ho raha!', 'ok');
    }

    // ═══════════════════════════════════════
    // VILLAGE RANKINGS — Health Score leaderboard
    // Score = 100 − (total cases × 2) − (critical reports × 15), min 0.
    // ═══════════════════════════════════════
    async function refreshRankings() {
      const listEl = document.getElementById('rankList');
      const updEl = document.getElementById('rankLastUpdate');
      if (!listEl) return;
      try {
        const resp = await fetch(FB_R, { signal: AbortSignal.timeout(5000) });
        const data = await resp.json();

        let reports = [];
        if (Array.isArray(data)) reports = data.filter(Boolean);
        else if (data && typeof data === 'object') reports = Object.values(data).filter(Boolean);

        const byVillage = {};
        reports.forEach(r => {
          const v = r.village || 'Unknown';
          if (!byVillage[v]) byVillage[v] = { cases: 0, critical: 0 };
          const total = r.total ?? ((r.cholera || 0) + (r.fever || 0) + (r.typhoid || 0) + (r.others || 0));
          byVillage[v].cases += total;
          const sev = (r.severity || '').toLowerCase();
          if (sev === 'high' || sev === 'critical') byVillage[v].critical += 1;
        });

        const ranked = Object.entries(byVillage)
          .map(([village, d]) => ({
            village,
            score: Math.max(0, Math.min(100, Math.round(100 - (d.cases * 2) - (d.critical * 15)))),
          }))
          .sort((a, b) => b.score - a.score);

        if (updEl) updEl.textContent = 'Updated: ' + new Date().toLocaleTimeString('en-IN');

        if (!ranked.length) {
          listEl.innerHTML = `<div class="empty-state">${t('rank_empty')}</div>`;
          return;
        }

        listEl.innerHTML = ranked.map((r, i) => {
          const rank = i + 1;
          const color = r.score >= 70 ? '#16a34a' : r.score >= 40 ? '#d97706' : '#dc2626';
          const medal = rank === 1 ? '#1' : rank === 2 ? '#2' : rank === 3 ? '#3' : `#${rank}`;
          const medalStyle = rank <= 3 ? `font-weight:800;color:${color};` : '';
          return `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--gov-border,#e5e7eb);">
              <div style="font-size:15px;min-width:32px;text-align:center;font-weight:700;${medalStyle}">${medal}</div>
              <div style="flex:1;font-weight:600;font-size:13px;">${r.village}</div>
              <div style="font-weight:800;font-size:15px;color:${color};">${r.score}</div>
            </div>`;
        }).join('');
      } catch (err) {
        console.warn('[ASHA] rankings fetch failed:', err.message);
        listEl.innerHTML = `<div class="empty-state">${t('rank_empty')}</div>`;
      }
    }

    function refreshQuickStats() {
      const { cholera: c, fever: f, typhoid: ty, others: o } = state.totals;
      document.getElementById('qs-total').textContent = c + f + ty + o;
      document.getElementById('qs-reports').textContent = state.reports;
      document.getElementById('qs-cholera').textContent = c;
      document.getElementById('qs-fever').textContent = f;
    }

    function addActivity(level, text, time) {
      const feed = document.getElementById('activityFeed');
      const empty = feed.querySelector('.empty-state'); if (empty) empty.remove();
      const div = document.createElement('div'); div.className = 'act-item';
      div.innerHTML = `<div class="act-dot ${level}"></div><div><div class="act-text">${text}</div><div class="act-time">${time}</div></div>`;
      feed.insertBefore(div, feed.firstChild);
      const items = feed.querySelectorAll('.act-item'); if (items.length > 10) items[items.length - 1].remove();
    }

    // ═══════════════════════════════════════
    // TOAST
    // ═══════════════════════════════════════
    let toastTimer;
    function showToast(msg, type = 'ok') {
      clearTimeout(toastTimer);
      const toast = document.getElementById('toast');
      if (!toast) return;
      const icons = { ok: '[OK]', err: '[!]', warn: '[!!]', info: '[i]' };
      document.getElementById('t-icon').textContent = icons[type] || '[i]';
      document.getElementById('t-msg').textContent = msg;
      toast.className = `toast show ${type}`;
      toastTimer = setTimeout(() => { toast.className = 'toast ' + type; }, 3200);
    }

    // ═══════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════
    async function init() {
      document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
      try { await initDB(); } catch (e) { console.warn('IndexedDB unavailable:', e); }
      setLang(currentLang);
      updateOnlineStatus();
      loadWeather();
      await updateQueueUI();
      await refreshDatabaseData();
      refreshRankings();
    }

    init();
    _intervals.push(setInterval(refreshDatabaseData, 10000));
    _intervals.push(setInterval(refreshRankings, 10000));

    // expose functions used by JSX onClick/onInput handlers
    window.ashaGoTo = goTo;
    window.ashaSetLang = setLang;
    window.ashaToggleVoice = toggleVoice;
    window.ashaSyncTop = syncTop;
    window.ashaSyncSmsToHome = syncSmsToHome;
    window.ashaUpdatePreview = updatePreview;
    window.ashaToggleSymptom = toggleSymptom;
    window.ashaUpdateAIRisk = updateAIRisk;
    window.ashaSetSev = setSev;
    window.ashaSetLevel = setLevel;
    window.ashaUpdateCharCount = updateCharCount;
    window.ashaSubmitReport = submitReport;
    window.ashaSendAlert = sendAlert;
    window.ashaExportCSV = exportCSV;
    window.ashaClearHistory = clearHistory;
    window.ashaForceSyncNow = forceSyncNow;
    /* eslint-enable */

    return () => {
      _intervals.forEach(clearInterval);
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  return (
    <div className="asha-app">
      {/* OFFLINE BANNER */}
      <div id="offline-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>&#x25CF;</span><span id="offline-text">Offline Mode — Reports queued</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="sync-count" id="queue-count-badge">0 pending</span>
          <div className="sync-spinner" id="sync-spinner" />
        </div>
      </div>

      {/* HEADER */}
      <div className="gov-topbar" id="asha-topbar">
        <div className="gov-emblem"><img src="/varun-logo.png" alt="VARUN" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
        <div className="gov-title-block">
          <div className="gov-title-hi" id="hdr-hi">जल स्वास्थ्य निरीक्षण — आशा पोर्टल</div>
          <div className="gov-title-en">VARUN — ASHA Worker Portal</div>
        </div>
        <div className="lang-toggle">
          <button className="lang-btn active" onClick={() => window.ashaSetLang('hi')} id="lb-hi">हिं</button>
          <button className="lang-btn" onClick={() => window.ashaSetLang('en')} id="lb-en">EN</button>
          <button className="lang-btn" onClick={() => window.ashaSetLang('mr')} id="lb-mr">मार</button>
        </div>
        <div className="worker-chip-gov" id="workerChip" style={{ display: 'none' }}>
          <div className="worker-dot-gov" />
          <div><div className="worker-name-chip" id="topName">—</div><div className="worker-village-chip" id="topVillage">गांव: —</div></div>
        </div>
        <div className="gov-live-badge"><span className="gov-live-dot" /><span id="live-txt">LIVE</span></div>
      </div>

      {/* APP AREA — bottom footer nav, no top nav offset */}
      <div id="app">
        {/* HOME */}
        <div className="page active" id="pg-home">
          <div className="breadcrumb-pg"><span className="bc-page" data-key="bc_home">Field Report</span> — <span data-key="bc_home_sub">रिपोर्ट दर्ज करें</span></div>

          <div className="queue-banner" id="queueBanner">
            <div className="queue-banner-text">
              <strong data-key="offline_queued">Reports saved offline</strong>
              <span data-key="offline_sub">Will sync when internet returns</span>
            </div>
            <div className="queue-count-pill" id="queueCountHome">0</div>
          </div>

          {/* Weather Advisory */}
          <div className="weather-strip">
            <div className="weather-icon sym-weather" id="wx-icon">&#x2600;</div>
            <div className="weather-info">
              <div className="weather-label" data-key="wx_label">Today's Water Risk Advisory</div>
              <div className="weather-detail" id="wx-detail">Loading...</div>
              <div className="weather-advisory" id="wx-advisory" />
            </div>
          </div>

          <div className="stat-row-gov" id="quickStats" style={{ display: 'none' }}>
            <div className="stat-card-gov"><div><div className="stat-val-gov" id="qs-total">0</div><div className="stat-lbl-gov" data-key="qs_total">कुल Cases</div></div></div>
            <div className="stat-card-gov green"><div><div className="stat-val-gov" id="qs-reports">0</div><div className="stat-lbl-gov" data-key="qs_reports">Reports</div></div></div>
            <div className="stat-card-gov red"><div><div className="stat-val-gov" id="qs-cholera">0</div><div className="stat-lbl-gov">Cholera</div></div></div>
            <div className="stat-card-gov yellow"><div><div className="stat-val-gov" id="qs-fever">0</div><div className="stat-lbl-gov" data-key="qs_fever">Bukhar</div></div></div>
          </div>

          <div className="gov-card">
            <div className="gov-card-header">
              <div><div className="gov-card-title"><span data-key="card_worker">ASHA Worker Details</span></div><div className="gov-card-title-hi" data-key="card_worker_sub">आशा कार्यकर्ता की जानकारी</div></div>
            </div>
            <div className="gov-card-body">
              <button className="voice-btn" id="voiceBtn" onClick={() => window.ashaToggleVoice()}>
                <span className="voice-sym">&#x25CF;</span> <span id="voice-btn-text" data-key="voice_fill">Voice se form bharein</span>
              </button>
              <div className="two-col">
                <div className="field"><label className="gov-label"><span data-key="lbl_name">ASHA Ka Naam</span> <span className="req">*</span></label><input type="text" className="gov-input" id="f-name" placeholder="Poora naam" onInput={() => window.ashaSyncTop()} /></div>
                <div className="field"><label className="gov-label"><span data-key="lbl_village">Gaon</span> <span className="req">*</span></label><input type="text" className="gov-input" id="f-village" placeholder="Gaon ka naam" onInput={() => window.ashaSyncTop()} /></div>
              </div>
              <div className="two-col">
                <div className="field">
                  <label className="gov-label"><span data-key="lbl_district">Zila</span> <span className="req">*</span></label>
                  <select className="gov-select" id="f-district" defaultValue="">
                    <option value="">-- Chunen --</option>
                    <option>Bokaro</option><option>Chatra</option><option>Deoghar</option><option>Dhanbad</option><option>Dumka</option><option>East Singhbhum</option><option>Garhwa</option><option>Giridih</option><option>Godda</option><option>Gumla</option><option>Hazaribagh</option><option>Jamtara</option><option>Khunti</option><option>Koderma</option><option>Latehar</option><option>Lohardaga</option><option>Pakur</option><option>Palamu</option><option>Ramgarh</option><option>Ranchi</option><option>Sahebganj</option><option>Seraikela Kharsawan</option><option>Simdega</option><option>West Singhbhum</option>
                  </select>
                </div>
                <div className="field"><label className="gov-label"><span data-key="lbl_date">Taareekh</span></label><input type="date" className="gov-input" id="f-date" /></div>
              </div>
            </div>
          </div>

          {/* Quick Symptoms */}
          <div className="gov-card">
            <div className="gov-card-header"><div><div className="gov-card-title"><span data-key="card_quick">Quick Symptoms</span></div><div className="gov-card-title-hi" data-key="card_quick_sub">जल्दी लक्षण चुनें</div></div></div>
            <div className="gov-card-body">
              <div className="symptom-chips">
                <div className="sym-chip" onClick={(e) => window.ashaToggleSymptom(e.currentTarget, 'Dast')}><span className="chip-sym">&#x25BC;</span> Dast</div>
                <div className="sym-chip" onClick={(e) => window.ashaToggleSymptom(e.currentTarget, 'Ulti')}><span className="chip-sym">&#x21BA;</span> Ulti</div>
                <div className="sym-chip" onClick={(e) => window.ashaToggleSymptom(e.currentTarget, 'Tez Bukhar')}><span className="chip-sym">&#x25B2;</span> Tez Bukhar</div>
                <div className="sym-chip" onClick={(e) => window.ashaToggleSymptom(e.currentTarget, 'Paet Dard')}><span className="chip-sym">&#x2715;</span> Paet Dard</div>
                <div className="sym-chip" onClick={(e) => window.ashaToggleSymptom(e.currentTarget, 'Kaanpna')}><span className="chip-sym">&#x223C;</span> Kaanpna</div>
                <div className="sym-chip" onClick={(e) => window.ashaToggleSymptom(e.currentTarget, 'Kamzori')}><span className="chip-sym">&#x2193;</span> Kamzori</div>
                <div className="sym-chip" onClick={(e) => window.ashaToggleSymptom(e.currentTarget, 'Paani Dast')}><span className="chip-sym">&#x7E;</span> Paani Dast</div>
                <div className="sym-chip" onClick={(e) => window.ashaToggleSymptom(e.currentTarget, 'Sir Dard')}><span className="chip-sym">&#x21AF;</span> Sir Dard</div>
              </div>
            </div>
          </div>

          <div className="gov-card">
            <div className="gov-card-header"><div><div className="gov-card-title"><span data-key="card_cases">Bimari Cases</span></div><div className="gov-card-title-hi" data-key="card_cases_sub">गांव में बीमारी के मामले</div></div></div>
            <div className="gov-card-body">
              <div className="disease-grid">
                <div className="dtile active-c"><div className="dtile-label c"><span data-key="dis_cholera">Cholera</span></div><input type="number" className="gov-input" id="f-cholera" placeholder="0" min="0" onInput={() => window.ashaUpdateAIRisk()} /></div>
                <div className="dtile active-f"><div className="dtile-label f"><span data-key="dis_fever">Bukhar</span></div><input type="number" className="gov-input" id="f-fever" placeholder="0" min="0" onInput={() => window.ashaUpdateAIRisk()} /></div>
                <div className="dtile active-t"><div className="dtile-label t"><span data-key="dis_typhoid">Typhoid</span></div><input type="number" className="gov-input" id="f-typhoid" placeholder="0" min="0" onInput={() => window.ashaUpdateAIRisk()} /></div>
                <div className="dtile active-o"><div className="dtile-label o"><span data-key="dis_others">Others</span></div><input type="number" className="gov-input" id="f-others" placeholder="0" min="0" onInput={() => window.ashaUpdateAIRisk()} /></div>
              </div>
            </div>
          </div>

          {/* AI Risk */}
          <div className="ai-risk-card" id="aiRiskCard">
            <div className="ai-risk-label">AI Risk Assessment</div>
            <div className="ai-risk-val" id="ai-risk-val">LOW</div>
            <div className="ai-risk-msg" id="ai-risk-msg" />
            <div className="ai-risk-meter"><div className="ai-risk-fill" id="ai-risk-fill" style={{ width: '0%', background: '#4ade80' }} /></div>
          </div>

          <div className="gov-card">
            <div className="gov-card-header"><div><div className="gov-card-title"><span data-key="card_sev">Gambhirta / Severity</span></div><div className="gov-card-title-hi" data-key="card_sev_sub">स्थिति की गंभीरता</div></div></div>
            <div className="gov-card-body">
              <div className="sev-options" id="sevOpts">
                <label className="sev-opt low chosen" onClick={(e) => window.ashaSetSev('low', e.currentTarget)}><input type="radio" name="sev" value="low" defaultChecked /><span className="sev-opt-lbl" data-key="sev_low">Normal</span></label>
                <label className="sev-opt med" onClick={(e) => window.ashaSetSev('med', e.currentTarget)}><input type="radio" name="sev" value="med" /><span className="sev-opt-lbl" data-key="sev_med">Madhyam</span></label>
                <label className="sev-opt high" onClick={(e) => window.ashaSetSev('high', e.currentTarget)}><input type="radio" name="sev" value="high" /><span className="sev-opt-lbl" data-key="sev_high">Gambhir</span></label>
              </div>
              <div className="field">
                <label className="gov-label"><span data-key="lbl_notes">Vishesh Baat</span> (Optional)</label>
                <textarea className="gov-textarea" id="f-notes" placeholder="Paani ki halat, symptoms..." />
              </div>
              <button className="gov-btn gov-btn-primary" onClick={() => window.ashaSubmitReport()}><span data-key="btn_submit">Report Submit Karo</span></button>
            </div>
          </div>
        </div>

        {/* SMS */}
        <div className="page" id="pg-sms">
          <div className="breadcrumb-pg"><span className="bc-page" data-key="bc_sms">SMS Alert</span> — <span data-key="bc_sms_sub">अलर्ट भेजें</span></div>
          <div className="queue-banner" id="queueBannerSms">
            <div className="queue-banner-text"><strong data-key="offline_queued">Alerts offline saved</strong><span data-key="offline_sub">Will sync when online</span></div>
            <div className="queue-count-pill" id="queueCountSms">0</div>
          </div>
          <div className="gov-card">
            <div className="gov-card-header"><div><div className="gov-card-title"><span data-key="card_alert">Naya Alert Message</span></div><div className="gov-card-title-hi" data-key="card_alert_sub">नया अलर्ट संदेश लिखें</div></div></div>
            <div className="gov-card-body">
              <div className="mandatory-box">
                <strong data-key="mandatory_hdr">Mandatory Header — Auto Add:</strong>
                <div className="mandatory-preview" id="mandatoryPreview">ASHA ALERT | Gaon: — | ASHA: — | Taareekh: —</div>
              </div>
              <div className="two-col" style={{ marginBottom: 10 }}>
                <div className="field" style={{ margin: 0 }}><label className="gov-label"><span data-key="lbl_name">Naam</span> <span className="req">*</span></label><input type="text" className="gov-input" id="sms-name" placeholder="Naam" onInput={() => { window.ashaSyncSmsToHome(); window.ashaUpdatePreview(); }} /></div>
                <div className="field" style={{ margin: 0 }}><label className="gov-label"><span data-key="lbl_village">Gaon</span> <span className="req">*</span></label><input type="text" className="gov-input" id="sms-village" placeholder="Gaon" onInput={() => { window.ashaSyncSmsToHome(); window.ashaUpdatePreview(); }} /></div>
              </div>
              <div className="field" style={{ marginBottom: 6 }}><label className="gov-label" data-key="lbl_level">Alert Level</label></div>
              <div className="level-row">
                <div className="level-btn-gov lv-normal sel" data-level="green" onClick={(e) => window.ashaSetLevel(e.currentTarget)}><span data-key="lv_normal">Normal</span></div>
                <div className="level-btn-gov lv-warn" data-level="yellow" onClick={(e) => window.ashaSetLevel(e.currentTarget)}><span data-key="lv_warn">Warning</span></div>
                <div className="level-btn-gov lv-emergency" data-level="red" onClick={(e) => window.ashaSetLevel(e.currentTarget)}><span data-key="lv_emergency">Emergency</span></div>
              </div>
              <div className="compose-wrap">
                <textarea className="gov-textarea" id="smsText" placeholder="Apna message yahan likhein..." maxLength={300} onInput={() => window.ashaUpdateCharCount()} style={{ minHeight: 90 }} />
                <div className="char-count" id="charCount">0 / 300</div>
              </div>
              <button className="gov-btn gov-btn-danger" onClick={() => window.ashaSendAlert()}><span data-key="btn_send_alert">Dashboard Par Alert Bhejo</span></button>
            </div>
          </div>
          <div className="gov-card">
            <div className="gov-card-header"><div><div className="gov-card-title"><span data-key="card_sent">Bheje Gaye Alerts</span> <span className="alert-count-badge" id="sentBadge" /></div></div><span style={{ fontSize: 10, color: 'var(--gov-gray3)', fontFamily: "'JetBrains Mono',monospace" }} id="sentCounter">0 bheje</span></div>
            <div className="gov-card-body"><div id="smsFeed"><div className="empty-state"><span data-key="empty_alerts">Koi alert nahi bheja</span></div></div></div>
          </div>
        </div>

        {/* HISTORY */}
        <div className="page" id="pg-history">
          <div className="breadcrumb-pg"><span className="bc-page" data-key="bc_history">Report History</span> — <span data-key="bc_history_sub">पुरानी रिपोर्टें</span></div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gov-blue)', textTransform: 'uppercase', letterSpacing: '0.5px' }} id="histCount">0 Reports</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="gov-btn gov-btn-outline" onClick={() => window.ashaExportCSV()} id="exportBtn" style={{ display: 'none' }}>Export CSV</button>
              <button className="gov-btn gov-btn-outline" onClick={() => window.ashaClearHistory()} id="clearHistBtn" style={{ display: 'none' }}>Clear</button>
            </div>
          </div>
          <div id="histFeed"><div className="empty-state"><span data-key="empty_history">Koi report nahi</span></div></div>
        </div>

        {/* VILLAGE RANKINGS */}
        <div className="page" id="pg-dash">
          <div className="breadcrumb-pg"><span className="bc-page" data-key="bc_dash">Village Rankings</span></div>

          <div className="gov-card">
            <div className="gov-card-header">
              <div>
                <div className="gov-card-title" data-key="rank_title">Village Rankings — Health Score</div>
                <div style={{ fontSize: 11, opacity: 0.65 }} data-key="rank_sub">Fewer cases = better rank</div>
              </div>
              <div style={{ fontSize: 10, opacity: 0.6 }} id="rankLastUpdate">Loading...</div>
            </div>
            <div className="gov-card-body" style={{ padding: 0 }}>
              <div id="rankList"><div className="empty-state" data-key="rank_empty">No reports yet</div></div>
            </div>
          </div>

          {/* Offline sync card */}
          <div className="gov-card" id="offlineDashCard" style={{ display: 'none' }}>
            <div className="gov-card-header"><div><div className="gov-card-title">Offline Queue</div></div></div>
            <div className="gov-card-body">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ fontSize: 12 }}>Pending sync reports</span><span className="queue-count-pill" id="dashQueueCount" style={{ background: 'var(--gov-yellow)', color: 'white' }}>0</span></div>
              <button className="gov-btn gov-btn-success" onClick={() => window.ashaForceSyncNow()}>Sync Karo Abhi</button>
            </div>
          </div>
          <div className="gov-card">
            <div className="gov-card-header"><div><div className="gov-card-title"><span data-key="card_activity">Recent Activity</span></div></div></div>
            <div className="gov-card-body"><div id="activityFeed"><div className="empty-state"><span data-key="empty_activity">Koi activity nahi</span></div></div></div>
          </div>
        </div>
      </div>

      {/* BOTTOM TAB BAR — Android/iOS style footer nav */}
      <nav className="asha-bottom-nav" id="goNav">
        <button className="asha-tab-btn active" id="nb-home" onClick={() => window.ashaGoTo('home')}>
          <span className="asha-tab-icon">&#x2302;</span>
          <span className="asha-tab-label" data-key="nav_home">Home</span>
        </button>
        <button className="asha-tab-btn" id="nb-sms" onClick={() => window.ashaGoTo('sms')}>
          <span className="nav-badge-gov" id="nb-sms-badge">!</span>
          <span className="asha-tab-icon">&#x2709;</span>
          <span className="asha-tab-label" data-key="nav_sms">Alert</span>
        </button>
        <button className="asha-tab-btn" id="nb-history" onClick={() => window.ashaGoTo('history')}>
          <span className="nav-badge-gov" id="nb-hist-badge">!</span>
          <span className="asha-tab-icon">&#x25A4;</span>
          <span className="asha-tab-label" data-key="nav_history">History</span>
        </button>
        <button className="asha-tab-btn" id="nb-dash" onClick={() => window.ashaGoTo('dash')}>
          <span className="asha-tab-icon">&#x2605;</span>
          <span className="asha-tab-label" data-key="nav_dash">Rankings</span>
        </button>
      </nav>

      <div className="toast" id="toast"><span id="t-icon" /><span id="t-msg" /></div>
    </div>
  );
}
