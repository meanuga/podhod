(function () {
  'use strict';

  /* ---------- вспомогательное ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const num = v => parseFloat(String(v == null ? '' : v).replace(',', '.')) || 0;
  const fmtN = n => String(Math.round(n * 100) / 100).replace('.', ',');
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = ts => { const d = new Date(ts); return d.getDate() + ' ' + MON[d.getMonth()]; };
  const fmtDur = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + pad(m) : m) + ':' + pad(s % 60); };
  // русские окончания: 1 подход, 2 подхода, 5 подходов
  const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11) ? one : ((n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many);
  const MONN = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const DOWS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const ICS_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const dayStart = ts => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const weekStart = ts => { const d = new Date(dayStart(ts)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
  const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const timeOf = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const dtLocal = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  // напоминания: дни недели (0 — воскресенье) и время
  function normRemind(r) {
    const days = r && Array.isArray(r.days) ? [...new Set(r.days.map(Number).filter(d => d >= 0 && d <= 6 && Number.isInteger(d)))] : [];
    const time = r && /^\d{2}:\d{2}$/.test(String(r.time || '')) ? String(r.time) : '19:00';
    return { days, time };
  }
  function daysTxt(days) {
    const list = DOW_ORDER.filter(d => days.indexOf(d) >= 0);
    if (!list.length) return 'не выбраны';
    if (list.length === 7) return 'каждый день';
    return list.map(d => DOWS[d]).join(', ');
  }
  function streakWeeks() {
    const weeks = new Set(S.workouts.map(w => weekStart(w.ts)));
    let cur = weekStart(Date.now()), n = 0;
    if (!weeks.has(cur)) cur -= 7 * DAY;
    while (weeks.has(cur)) { n++; cur -= 7 * DAY; }
    return n;
  }
  const FALLBACK = { id: '?', n: 'Удалённое упражнение', g: 'arms', eq: '', lv: 1, m: 'r', mu: '', s: [], e: [], t: '' };
  function allCustom() { return S.custom || []; }
  // каталог: встроенные упражнения и свои, скрытые не показываем
  function allEx() { return EX.concat(allCustom().filter(e => !e.hidden)); }
  const exById = id => EX.find(e => e.id === id) || allCustom().find(e => e.id === id) || FALLBACK;
  const isCustom = e => !!(e && e.custom);
  const plate = g => '<span class="plate" style="--pc:var(' + GR[g][1] + ')"></span>';
  const est1 = (w, r) => r <= 0 ? 0 : (r === 1 ? w : w * (1 + r / 30));

  const I = {
    today: '<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>',
    exercises: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    programs: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    progress: '<path d="M3 20V4M3 20h18M7 15l4-4 3 3 6-7"/>',
    notes: '<path d="M5 3h11l3 3v15H5zM9 9h6M9 13h6M9 17h4"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  const svg = (k, s) => '<svg width="' + (s || 22) + '" height="' + (s || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[k] + '</svg>';

  /* ---------- хранилище ---------- */
  // всё хранится только на этом устройстве, в браузере
  const KEY = 'podhod_v1';
  const blank = () => ({ workouts: [], notes: [], body: [], rest: 90, active: null, profile: null, custom: [], programs: [], draft: null, restUntil: 0, restTotal: 0, restBeeped: false, remind: { days: [], time: '19:00' } });
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw), s = Object.assign(blank(), o);
        s.custom = Array.isArray(s.custom) ? s.custom : [];
        s.programs = Array.isArray(s.programs) ? s.programs : [];
        s.remind = normRemind(s.remind);
        // старые шаблоны из тренировок превращаются в личные программы
        if (Array.isArray(o.templates) && o.templates.length) {
          s.programs = s.programs.concat(o.templates.map(t => ({ id: t.id, n: t.name, d: 'Твой план из прошлой тренировки.', days: [{ n: 'Тренировка', ex: t.ex }], custom: true })));
        }
        delete s.templates;
        return s;
      }
    } catch (e) { /* хранилище недоступно */ }
    return blank();
  }
  let S = load();
  // таймер отдыха не должен переживать сам себя: если время вышло, пока приложение было закрыто, просто убираем его
  if (S.restUntil && S.restUntil <= Date.now()) { S.restUntil = 0; S.restTotal = 0; S.restBeeped = true; }
  let saveT = null;
  function save() { clearTimeout(saveT); saveT = setTimeout(saveNow, 200); }
  function saveNow() { clearTimeout(saveT); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* без сохранения */ } }
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

  /* ---------- расчёты по истории ---------- */
  const setsOf = w => w.ex.reduce((a, x) => a + x.sets.length, 0);
  const wName = w => {
    const gs = [...new Set(w.ex.map(x => exById(x.id).g))].slice(0, 3).map(g => GR[g][0]);
    return gs.join(' · ') || 'Тренировка';
  };
  // сессии по упражнению от старых к новым
  function hist(id) {
    return S.workouts.filter(w => w.ex.some(x => x.id === id)).sort((a, b) => a.ts - b.ts)
      .map(w => ({ ts: w.ts, sets: w.ex.filter(x => x.id === id).reduce((a, x) => a.concat(x.sets), []) }));
  }
  const modeOf = (ex, sets) => (ex.m === 'w' && sets.some(s => num(s.w) > 0)) ? 'w' : 'r';
  const scoreMode = (md, sets) => Math.max(0, ...sets.map(s => md === 'w' ? (num(s.w) > 0 ? est1(num(s.w), num(s.r)) : 0) : num(s.r)));
  function exStats(id) {
    const ex = exById(id), h = hist(id);
    if (!h.length) return { n: 0 };
    const all = h.reduce((a, s) => a.concat(s.sets), []);
    const md = modeOf(ex, all);
    const pts = h.map(s => ({ ts: s.ts, y: Math.round(scoreMode(md, s.sets) * 10) / 10 }));
    const best = Math.max(...pts.map(p => p.y));
    return { n: h.length, md, pts, best, last: h[h.length - 1], sess: h };
  }
  // у упражнений на время ex.u — 'сек' или 'мин'
  const uAbbr = ex => ex.u === 'мин' ? ' мин' : ' с';
  const uWord = ex => ex.u === 'мин' ? 'Минуты' : 'Секунды';
  const bestTxt = (ex, st) => st.md === 'w' ? '1ПМ ≈ ' + fmtN(st.best) + ' кг' : (ex.u ? 'лучшее: ' + st.best + uAbbr(ex) : 'лучшее: ' + st.best + ' повт.');
  const setTxt = (ex, s) => ex.u ? num(s.r) + uAbbr(ex) : (num(s.w) > 0 ? fmtN(num(s.w)) + '×' + num(s.r) : num(s.r) + ' повт.');
  const unitOf = (st, ex) => st.md === 'w' ? 'расчётный 1ПМ, кг' : (ex && ex.u === 'мин' ? 'минут' : ex && ex.u ? 'секунд' : 'повторений');

  /* ---------- состояние интерфейса ---------- */
  const TABNAMES = ['today', 'exercises', 'programs', 'progress', 'notes'];
  const UI = {
    tab: TABNAMES.indexOf(location.hash.slice(1)) >= 0 ? location.hash.slice(1) : 'today',
    view: null, stack: [], q: '', g: 'all', sg: 'all', pq: '', pg: 'all', psg: 'all', sub: 'records', exSel: '', noteTag: 'all', nq: '',
    cf: null, open: null, tpl: false, calc: { w: '', r: '' }, plt: { t: '', bar: '20' }, ob: null, fit: false,
    pedit: null, exf: null, impText: '', wedit: null, weditDirty: false, cal: null
  };
  let cfT = null, toastT = null;

  const app = document.getElementById('app');
  const dockEl = document.getElementById('dock');
  const navEl = document.getElementById('nav');
  const toastEl = document.getElementById('toast');

  function toast(t) {
    toastEl.textContent = t; toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 2400);
  }
  // двойное нажатие для опасных действий: первое запрашивает подтверждение
  function conf(key) {
    if (UI.cf === key) { UI.cf = null; return true; }
    UI.cf = key; clearTimeout(cfT);
    cfT = setTimeout(() => { UI.cf = null; render(); }, 3500);
    render();
    return false;
  }
  const cfTxt = (key, normal) => UI.cf === key ? 'Точно?' : normal;

  function go(v) { UI.stack.push(UI.view); UI.view = v; render(true); }
  function back() {
    if (UI.view && UI.view.t === 'note') cleanNote(UI.view.id);
    const prev = UI.stack.pop();
    UI.view = prev == null ? null : prev;
    render(true);
  }
  function setTab(t) {
    UI.tab = t; UI.view = null; UI.stack = [];
    try { location.hash = t; } catch (e) { /* без хэша */ }
    render(true);
  }
  window.addEventListener('hashchange', () => {
    const t = location.hash.slice(1);
    if (TABNAMES.indexOf(t) >= 0 && (t !== UI.tab || UI.view)) { UI.tab = t; UI.view = null; UI.stack = []; render(true); }
  });

  /* ---------- графики ---------- */
  function niceStep(range, n) {
    const raw = range / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), nm = raw / mag;
    return (nm <= 1 ? 1 : nm <= 2 ? 2 : nm <= 5 ? 5 : 10) * mag;
  }
  function chart(pts, unit) {
    if (pts.length < 2) return '<p class="muted pad">Для графика нужно хотя бы две записи.</p>';
    const W = 340, H = 180, L = 40, R = 14, T = 16, B = 26, n = pts.length;
    const ys = pts.map(p => p.y);
    let lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    const st = niceStep((hi - lo) || Math.max(hi, 1) * .1, 4);
    lo = Math.floor(lo / st) * st; hi = Math.ceil(hi / st) * st;
    if (hi === lo) hi = lo + st;
    const X = i => L + (W - L - R) * i / (n - 1);
    const Y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    let grid = '';
    const steps = Math.round((hi - lo) / st);
    for (let k = 0; k <= steps; k++) {
      const v = lo + k * st;
      grid += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/>' +
        '<text class="gt" x="' + (L - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + fmtN(v) + '</text>';
    }
    const line = pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join('');
    const area = line + 'L' + X(n - 1).toFixed(1) + ' ' + (H - B) + 'L' + X(0).toFixed(1) + ' ' + (H - B) + 'Z';
    const dots = pts.map((p, i) => '<circle class="' + (i === n - 1 ? 'dl' : 'dp') + '" cx="' + X(i).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="' + (i === n - 1 ? 5 : 3.5) + '"/>').join('');
    const lp = pts[n - 1], ly = Y(lp.y) - 10 < 12 ? Y(lp.y) + 22 : Y(lp.y) - 10;
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="График: ' + esc(unit) + '">' + grid +
      '<path class="ar" d="' + area + '"/><path class="ln" d="' + line + '"/>' + dots +
      '<text class="gv" x="' + X(n - 1).toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="end">' + fmtN(lp.y) + '</text>' +
      '<text class="gt" x="' + L + '" y="' + (H - 6) + '" text-anchor="start">' + fmtDate(pts[0].ts) + '</text>' +
      '<text class="gt" x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + fmtDate(lp.ts) + '</text></svg>' +
      '<div class="muted sm">' + esc(unit) + '</div>';
  }

  /* ---------- пример данных ---------- */
  function loadDemo() {
    const now = Date.now();
    for (let i = 0; i < 7; i++) {
      const t1 = now - ((6 - i) * 7 + 4) * DAY, t2 = now - ((6 - i) * 7 + 1) * DAY;
      S.workouts.push({ id: uid(), ts: t1, dur: 3500 + i * 60, note: '', demo: true, ex: [
        { id: 'bench', sets: [{ w: 50 + 2.5 * i, r: 8 }, { w: 50 + 2.5 * i, r: 8 }, { w: 50 + 2.5 * i, r: 7 }] },
        { id: 'bbrow', sets: [{ w: 40 + 2.5 * i, r: 10 }, { w: 40 + 2.5 * i, r: 9 }, { w: 40 + 2.5 * i, r: 8 }] },
        { id: 'ohp', sets: [{ w: 30 + 1.25 * i, r: 8 }, { w: 30 + 1.25 * i, r: 8 }, { w: 30 + 1.25 * i, r: 6 }] }] });
      S.workouts.push({ id: uid(), ts: t2, dur: 3900 + i * 60, note: '', demo: true, ex: [
        { id: 'squat', sets: [{ w: 60 + 5 * i, r: 8 }, { w: 60 + 5 * i, r: 8 }, { w: 60 + 5 * i, r: 6 }] },
        { id: 'rdl', sets: [{ w: 50 + 5 * i, r: 10 }, { w: 50 + 5 * i, r: 10 }, { w: 50 + 5 * i, r: 8 }] },
        { id: 'pullup', sets: [{ w: 0, r: 5 + Math.floor(i / 2) }, { w: 0, r: 5 }, { w: 0, r: 4 }] }] });
      S.body.push({ id: uid(), ts: now - (6 - i) * 7 * DAY, w: [79.2, 79, 78.8, 78.9, 78.4, 78.2, 78][i], demo: true });
    }
    save(); toast('Пример данных добавлен. Его можно убрать в резервной копии.');
  }
  const hasDemo = () => S.workouts.some(w => w.demo) || S.body.some(b => b.demo);
  const demoBtn = () => S.workouts.length ? '' : '<button class="btn" data-a="demo">Показать на примере</button>';

  /* ---------- тренировка: план, старт, подходы ---------- */
  const newSets = n => Array.from({ length: n }, () => ({ w: '', r: '', done: false }));
  const clampSets = n => Math.max(1, Math.min(12, Math.round(n) || 3));

  function ensureDraft() { if (!S.draft) S.draft = { ex: [], note: '' }; return S.draft; }
  function openPlanner() { ensureDraft(); UI.stack = []; UI.view = { t: 'workout' }; render(true); }
  // собрать план из программы или прошлой тренировки, не запуская таймер
  function planList(list) {
    if (S.active) { toast('Сначала заверши текущую тренировку'); UI.stack = []; UI.view = { t: 'workout' }; render(true); return false; }
    S.draft = { ex: list.map(a => ({ id: a[0], n: clampSets(a[1]), tr: a[2] ? String(a[2]) : '' })), note: '' };
    saveNow(); UI.stack = []; UI.view = { t: 'workout' }; render(true); return true;
  }
  function startWorkout() {
    const d = S.draft;
    if (!d || !d.ex.length) { toast('Добавь хотя бы одно упражнение'); return; }
    if (S.active) { toast('Тренировка уже идёт'); return; }
    S.active = { id: uid(), start: Date.now(), note: d.note || '', ex: d.ex.map(x => ({ id: x.id, tr: x.tr || '', sets: newSets(clampSets(x.n)) })) };
    S.draft = null; saveNow();
    UI.stack = []; UI.view = { t: 'workout' }; render(true); toast('Тренировка началась');
  }
  function clearDraft() { S.draft = null; saveNow(); UI.stack = []; UI.view = null; render(true); }
  // добавление упражнения: пока тренировка не начата — только в план
  function addEx(id) {
    if (S.active) {
      if (S.active.ex.some(x => x.id === id)) { toast('Это упражнение уже в тренировке'); return false; }
      S.active.ex.push({ id, tr: '', sets: newSets(3) }); save(); return true;
    }
    const d = ensureDraft();
    if (d.ex.some(x => x.id === id)) { toast('Это упражнение уже в плане'); return false; }
    d.ex.push({ id, tr: '', n: 3 }); save(); return true;
  }

  // цель по повторениям из строки вида «8–12» или «30»
  function targetReps(tr) {
    const ns = String(tr || '').match(/\d+(?:[.,]\d+)?/g);
    if (!ns) return null;
    const a = num(ns[0]), b = ns[1] != null ? num(ns[1]) : a;
    return { lo: Math.max(1, Math.round(Math.min(a, b))), hi: Math.max(1, Math.round(Math.max(a, b))) };
  }
  // подсказка веса: цель из плана, а без плана — тот же вес и на повторение больше
  function suggest(id, tr) {
    const ex = exById(id), t = targetReps(tr), h = hist(id);
    if (!h.length) return { w: '', r: t ? String(t.lo) : '', first: true };
    const last = h[h.length - 1].sets;
    const best = Math.max.apply(null, last.map(s => num(s.r)));
    if (ex.m === 'w' && last.some(s => num(s.w) > 0)) {
      const base = Math.max.apply(null, last.map(s => num(s.w)));
      const up = !!t && last.every(s => num(s.r) >= t.hi);
      const w = Math.round((base + (up ? 2.5 : 0)) * 2) / 2;
      const r = t ? t.lo : Math.min(12, best + 1);
      return { w: String(w).replace('.', ','), r: String(r), up, prev: base, note: up ? 'можно прибавить вес' : (t ? 'как в прошлый раз' : 'тот же вес, на повторение больше') };
    }
    if (ex.u) {
      const step = ex.u === 'мин' ? 2 : 5, unitWord = ex.u === 'мин' ? 'минуты' : 'секунд';
      const up = !!t && best >= t.hi;
      return { w: '', r: String(up ? best + step : (t ? best : best + step)), up, note: up ? 'можно прибавить время' : (t ? 'как в прошлый раз' : 'на ' + step + ' ' + unitWord + ' дольше') };
    }
    const up = !!t && last.every(s => num(s.r) >= t.hi);
    return { w: '', r: String(up ? best + 1 : (t ? best : best + 1)), up, note: up ? 'можно прибавить' : (t ? 'как в прошлый раз' : 'на повторение больше') };
  }
  // что подставить в пустые поля подхода
  function ph(i, j) {
    const x = S.active.ex[i], sg = suggest(x.id, x.tr), h = hist(x.id), last = h.length ? h[h.length - 1].sets : [];
    const ls = last[j] || last[last.length - 1];
    return { w: sg.w || (ls && num(ls.w) > 0 ? String(fmtN(num(ls.w))) : ''), r: sg.r || (ls ? String(ls.r) : '') };
  }
  function fillHint(i) {
    const x = S.active.ex[i], sg = suggest(x.id, x.tr);
    if (!sg.w && !sg.r) return;
    x.sets.forEach(s => { if (s.done) return; if (sg.w && s.w === '') s.w = sg.w; if (sg.r && s.r === '') s.r = sg.r; });
    save(); render(); toast('Подходы заполнены подсказкой');
  }
  function hintHtml(x, i) {
    const e = exById(x.id), sg = suggest(x.id, x.tr), t = targetReps(x.tr), h = hist(x.id);
    if (!h.length) {
      return '<div class="hint"><span class="grow">Первый раз: ' + (e.m === 'w'
        ? 'возьми вес, с которым останется 2–3 повторения в запасе.'
        : 'работай в комфортном темпе и следи за техникой.') + '</span></div>';
    }
    const lastTxt = h[h.length - 1].sets.map(s => setTxt(e, s)).join(', ');
    const rTxt = t ? (t.lo + (t.hi !== t.lo ? '–' + t.hi : '')) : sg.r;
    const goal = sg.w ? fmtN(num(sg.w)) + ' кг × ' + rTxt : rTxt + (e.u ? uAbbr(e) : ' повт.');
    return '<div class="hint"><span class="grow"><b>Подсказка: ' + esc(goal) + '</b>' + (sg.note ? ' · ' + esc(sg.note) : '') +
      '<span class="muted sm">Прошлый раз: ' + esc(lastTxt) + '</span></span>' +
      '<button class="btn sm" data-a="fill" data-i="' + i + '">Вписать</button></div>';
  }
  function checkSet(i, j) {
    const x = S.active.ex[i], s = x.sets[j];
    if (s.done) { s.done = false; save(); render(); return; }
    const p = ph(i, j);
    const w = s.w === '' ? p.w : s.w, r = s.r === '' ? p.r : s.r;
    if (num(r) <= 0) { UI.err = i + '-' + j; toast('Укажи число повторений'); render(); return; }
    UI.err = null; s.w = w; s.r = r; s.done = true; save(); startRest(); render();
  }
  function finish() {
    const a = S.active;
    const ex = a.ex.map(x => ({ id: x.id, sets: x.sets.filter(s => s.done).map(s => ({ w: num(s.w), r: num(s.r) })) })).filter(x => x.sets.length);
    if (!ex.length) { toast('Отметь хотя бы один выполненный подход'); return; }
    const w = { id: uid(), ts: a.start, dur: Math.round((Date.now() - a.start) / 1000), note: a.note || '', ex };
    const prs = [];
    ex.forEach(x => {
      const e = exById(x.id), h = hist(x.id);
      const all = h.reduce((acc, s) => acc.concat(s.sets), []).concat(x.sets);
      const md = modeOf(e, all);
      const prev = Math.max(0, ...h.map(s => scoreMode(md, s.sets))), nw = scoreMode(md, x.sets);
      if (prev > 0 && nw > prev + 0.0001) prs.push({ id: x.id, md, from: Math.round(prev * 10) / 10, to: Math.round(nw * 10) / 10 });
    });
    S.workouts.push(w); S.active = null; stopRest(); saveNow();
    UI.stack = []; UI.view = { t: 'summary', id: w.id, prs }; render(true);
  }

  /* ---------- таймер отдыха: хранится в S и переживает перезагрузку ---------- */
  const restLeft = () => S.restUntil ? Math.max(0, Math.ceil((S.restUntil - Date.now()) / 1000)) : 0;
  function startRest() {
    S.restTotal = S.rest; S.restUntil = Date.now() + S.rest * 1000; S.restBeeped = false;
    saveNow(); dock();
  }
  function stopRest() { S.restUntil = 0; S.restTotal = 0; S.restBeeped = true; saveNow(); }
  let actx = null;
  function beep() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.connect(g); g.connect(actx.destination); o.frequency.value = 880;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.25, t + .03); g.gain.exponentialRampToValueAtTime(.0001, t + .6);
      o.start(t); o.stop(t + .6);
    } catch (e) { /* звук недоступен */ }
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* без вибрации */ }
  }
  function tick() {
    const now = Date.now();
    if (S.restUntil) {
      const left = restLeft();
      const t = document.getElementById('rtime'), f = document.getElementById('rfill');
      if (t) t.textContent = left > 0 ? fmtDur(left) : 'Пора!';
      if (f) f.style.width = (S.restTotal ? Math.min(100, (1 - (S.restUntil - now) / (S.restTotal * 1000)) * 100) : 100) + '%';
      if (left === 0 && !S.restBeeped) {
        S.restBeeped = true; save(); beep();
        setTimeout(() => { if (S.restBeeped && restLeft() === 0) { stopRest(); dock(); } }, 4000);
      }
    }
    const el = document.getElementById('elapsed'), p1 = document.getElementById('pillt'), p2 = document.getElementById('heroT');
    if (S.active) { const t = fmtDur(Math.floor((now - S.active.start) / 1000)); [el, p1, p2].forEach(n => { if (n) n.textContent = t; }); }
  }
  setInterval(tick, 500);

  let wl = null;
  async function lock() {
    if (wl || !navigator.wakeLock) return;
    try { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); } catch (e) { /* не разрешено */ }
  }
  function unlock() { if (wl) { try { wl.release(); } catch (e) { /* ничего */ } wl = null; } }

  function dock() {
    if (UI.ob) { dockEl.innerHTML = ''; document.body.classList.remove('dockon'); return; }
    let h = '';
    if (S.restUntil) {
      h += '<div class="rest" id="restbar"><span class="rtime" id="rtime">0:00</span><span class="muted sm">отдых</span><span class="sp"></span>' +
        '<button class="btn sm" data-a="rminus">−15</button><button class="btn sm" data-a="rplus">+15</button><button class="btn sm" data-a="rskip">Пропустить</button>' +
        '<div class="rbar"><i id="rfill"></i></div></div>';
    }
    const inWork = UI.view && (UI.view.t === 'workout' || UI.view.t === 'pick');
    const inPlan = UI.view && UI.view.t === 'workout' && !S.active && S.draft && S.draft.ex.length;
    if (inPlan) {
      h += '<button class="pill" data-a="startNow"><span class="dotlive"></span>Начать тренировку<span class="grow"></span>' + S.draft.ex.length + ' упр.</button>';
    } else if (S.active && !inWork) {
      h += '<button class="pill" data-a="resume"><span class="dotlive"></span>Тренировка идёт <b id="pillt">' + fmtDur(Math.floor((Date.now() - S.active.start) / 1000)) + '</b><span class="grow"></span>Открыть</button>';
    } else if (S.draft && S.draft.ex.length && !inWork) {
      h += '<button class="pill" data-a="resume"><span class="dotlive"></span>План: ' + S.draft.ex.length + ' упр.<span class="grow"></span>Открыть</button>';
    }
    dockEl.innerHTML = h;
    document.body.classList.toggle('dockon', !!h);
    tick();
  }

  /* ---------- разметка: общие куски ---------- */
  const head = (t, right) => '<header class="top"><h1 class="h1 disp" style="margin:0">' + t + '</h1>' + (right || '') + '</header>';
  const chips = (items, cur, act, cls) => '<div class="chips' + (cls ? ' ' + cls : '') + '">' + items.map(i =>
    '<button class="chip" data-a="' + act + '" data-v="' + i[0] + '" aria-pressed="' + (cur === i[0]) + '">' + esc(i[1]) + '</button>').join('') + '</div>';
  // второй ряд чипов: подгруппы выбранной группы
  const sChips = (g, cur, act) => g !== 'all' && SUBS[g] ? chips([['all', 'Все']].concat(SUBS[g]), cur, act, 'sub') : '';
  const gChips = (cur, act) => chips([['all', 'Все']].concat(Object.keys(GR).map(k => [k, GR[k][0]])), cur, act);
  const empty = (t, d, extra) => '<div class="empty"><b>' + t + '</b><p class="muted">' + d + '</p>' + (extra || '') + '</div>';

  /* ---------- профиль: место, инвентарь, рекомендации ---------- */
  const placeOf = () => S.profile ? S.profile.place : 'gym';
  function eqSet() {
    const s = new Set((S.profile && S.profile.equip) || []);
    s.delete('none');
    if (s.has('bench')) s.add('step');
    return s;
  }
  // можно ли сделать упражнение с тем, что есть у пользователя
  function availEx(e) {
    if (e.custom) return true;
    if (placeOf() === 'gym') return true;
    if (!e.need) return false;
    const s = eqSet();
    return e.need.some(alt => alt.every(k => s.has(k)));
  }
  // подгруппы мышц упражнения
  const subTags = e => {
    const names = (e.sub || []).map(k => (SUBS[e.g] || []).filter(x => x[0] === k).map(x => x[1])[0]).filter(Boolean);
    return names.length ? '<div class="meta">' + names.map(n => '<span class="tag">' + esc(n) + '</span>').join('') + '</div>' : '';
  };
  function rowTag(e) {
    if (e.custom) return 'своё';
    const lvl = e.lv === 1 ? 'новичкам' : 'нужен опыт';
    if (availEx(e)) return lvl;
    if (placeOf() === 'both') return 'в зале';
    return e.need ? 'нужен инвентарь' : 'только зал';
  }
  function fitChip() {
    const pl = placeOf();
    if (pl === 'gym') return '';
    return chips([['fit', pl === 'home' ? 'Только с моим инвентарём' : 'Только то, что можно дома']], UI.fit ? 'fit' : '', 'fit');
  }
  function fitsProg(p) {
    const pl = placeOf();
    if (p.loc === 'gym') return pl !== 'home';
    return pl !== 'gym' && p.days.every(d => d.ex.every(a => availEx(exById(a[0]))));
  }
  function recProg() {
    const p = S.profile, lv = p ? p.level : 'novice', pl = placeOf();
    const gymO = lv === 'pro' ? ['p-ppl', 'p-ul', 'p-full'] : lv === 'mid' ? ['p-ul', 'p-ppl', 'p-full'] : ['p-full', 'p-ul', 'p-ppl'];
    const homeO = ['p-homedb', 'p-homeband', 'p-home0'];
    const order = pl === 'home' ? homeO : pl === 'gym' ? gymO : gymO.concat(homeO);
    return order.map(id => PROGS.find(x => x.id === id)).find(fitsProg) || null;
  }
  function progRow(p, tag) {
    const n = p.days.length;
    return '<button class="row" data-a="prog" data-id="' + p.id + '"><span class="grow"><span class="rt">' + esc(p.n) + '</span><span class="muted sm">' +
      n + ' ' + plural(n, 'день', 'дня', 'дней') + ' в цикле</span></span>' + (tag ? '<span class="tag">' + tag + '</span>' : '') + '</button>';
  }
  function progList() {
    const rec = recProg();
    const fit = PROGS.filter(fitsProg).sort((a, b) => (b === rec) - (a === rec)), rest = PROGS.filter(p => !fitsProg(p));
    const mine = (S.programs || []).slice();
    return '<p class="muted">Планы с подходами и повторениями. Нажми на программу, чтобы увидеть дни и собрать тренировку.</p>' +
      (mine.length ? '<h2 class="h2 disp">Мои программы</h2>' + mine.map(p => progRow(p, 'своя')).join('') : '') +
      (fit.length ? '<h2 class="h2 disp">Для тебя</h2>' + fit.map(p => progRow(p, p === rec ? 'рекомендуем' : '')).join('') : '') +
      (rest.length ? '<h2 class="h2 disp">Другие программы</h2>' + rest.map(p => progRow(p, p.loc === 'gym' ? 'для зала' : 'нужен инвентарь')).join('') : '');
  }
  const profLine = () => { const p = S.profile; return LV[p.level][0] + ' · ' + PLACE[p.place][0].toLowerCase(); };
  function recBlock() {
    const p = S.profile;
    if (!p) return '';
    const r = recProg(), g = GOAL[p.goal];
    return '<h2 class="h2 disp">Для тебя</h2><div class="day-tip"><div class="muted sm">' + esc(profLine()) + '</div>' +
      (r ? '<b>' + esc(r.n) + '</b><div><button class="btn sm" data-a="prog" data-id="' + r.id + '">Открыть программу</button></div>'
        : '<p class="muted">Готовой программы под твой инвентарь пока нет. Собери тренировку сам из подходящих упражнений.</p>') +
      (g ? '<p class="muted">Цель «' + esc(g[0].toLowerCase()) + '»: ' + esc(g[1]) + '.</p>' : '') + '</div>';
  }

  function filt(q, g, sg) {
    q = q.trim().toLowerCase();
    let l = allEx().filter(e => (g === 'all' || e.g === g) && (!sg || sg === 'all' || (e.sub || []).indexOf(sg) >= 0) && (!q || (e.n + ' ' + e.mu + ' ' + e.eq).toLowerCase().indexOf(q) >= 0));
    if (UI.fit && placeOf() !== 'gym') l = l.filter(availEx);
    const lv = S.profile && S.profile.level;
    if (lv === 'novice' || lv === 'ret') l = l.slice().sort((a, b) => a.lv - b.lv);
    // свои упражнения всегда наверху, встроенный порядок не ломаем
    return l.slice().sort((a, b) => (b.custom ? 1 : 0) - (a.custom ? 1 : 0));
  }
  function listHtml(q, g, act) {
    const l = filt(q, g, act === 'ex' ? UI.sg : UI.psg);
    if (!l.length) return '<p class="muted pad">Ничего не нашлось. Попробуй другое слово или группу мышц.</p>';
    return l.map(e => '<button class="row" data-a="' + act + '" data-id="' + e.id + '">' + plate(e.g) +
      '<span class="grow"><span class="rt">' + esc(e.n) + '</span><span class="muted sm">' + esc(e.eq) + '</span></span>' +
      '<span class="tag">' + rowTag(e) + '</span></button>').join('');
  }
  const recentRows = (list, rep) => list.map(w => { const sn = setsOf(w); return '<div class="row" style="cursor:default">' +
    '<span class="grow"><span class="rt">' + esc(wName(w)) + (w.demo ? '<span class="demo">пример</span>' : '') + '</span>' +
    '<span class="muted sm">' + fmtDate(w.ts) + ' · ' + sn + ' ' + plural(sn, 'подход', 'подхода', 'подходов') + '</span></span>' +
    (rep ? '<button class="btn sm" data-a="repeat" data-id="' + w.id + '">' + cfTxt('replw' + w.id, 'Повторить') + '</button>' : '') + '</div>'; }).join('');

  /* ---------- вкладки ---------- */
  const T = {};

  T.today = () => {
    const now = Date.now(), d = new Date();
    const wk = S.workouts.filter(w => w.ts > now - 7 * DAY), mo = S.workouts.filter(w => w.ts > now - 30 * DAY);
    const sets7 = wk.reduce((a, w) => a + setsOf(w), 0);
    const pool = allEx().filter(e => e.t);
    const tip = pool.length ? pool[Math.floor(now / DAY) % pool.length] : null;
    const recent = S.workouts.slice().sort((a, b) => b.ts - a.ts).slice(0, 3);
    const draft = S.draft && S.draft.ex.length ? S.draft : null;
    const main = S.active
      ? '<div class="hero"><div class="muted sm">Тренировка идёт</div><div class="big disp" id="heroT">' + fmtDur(Math.floor((now - S.active.start) / 1000)) + '</div>' +
        '<div class="muted">Упражнений в списке: ' + S.active.ex.length + '</div><button class="btn pri lg full" data-a="resume">Продолжить</button></div>'
      : draft
        ? '<div class="hero"><div class="muted sm">План тренировки</div><div class="big disp">' + draft.ex.length + '</div>' +
          '<div class="muted">' + draft.ex.reduce((a, x) => a + clampSets(x.n), 0) + ' ' + plural(draft.ex.reduce((a, x) => a + clampSets(x.n), 0), 'подход', 'подхода', 'подходов') + ' · таймер ещё не идёт</div>' +
          '<button class="btn pri lg full" data-a="startNow">Начать тренировку</button>' +
          '<button class="btn full" data-a="resume">Изменить план</button></div>'
        : '<div class="hero"><button class="btn pri lg full" data-a="start">Собрать тренировку</button><button class="btn full" data-a="tab" data-v="programs">Выбрать программу</button>' +
          '<p class="muted sm">Добавь упражнения в список, а таймер запустится отдельно.</p></div>';
    const rem = S.remind;
    const remToday = rem && rem.days && rem.days.indexOf(d.getDay()) >= 0 && !S.active && !draft && !S.workouts.some(w => dayStart(w.ts) === dayStart(now));
    const remHtml = remToday
      ? '<div class="hint" style="margin:0 0 8px"><span class="grow"><b>Сегодня тренировка по плану</b><span class="muted sm">Напоминание на ' + esc(rem.time || '19:00') + '</span></span><button class="btn sm" data-a="start">Собрать</button></div>'
      : '';
    return '<header class="top"><div><div class="brand disp">Подход</div><div class="muted">' + DOW[d.getDay()] + ', ' + d.getDate() + ' ' + MONF[d.getMonth()] + '</div></div>' +
      '<button class="icon" data-a="profile" aria-label="Мой профиль">' + svg('user') + '</button></header>' +
      main + remHtml +
      '<div class="stats"><div><b class="disp">' + wk.length + '</b><span>' + plural(wk.length, 'тренировка', 'тренировки', 'тренировок') + ' за 7 дней</span></div>' +
      '<div><b class="disp">' + mo.length + '</b><span>' + plural(mo.length, 'тренировка', 'тренировки', 'тренировок') + ' за 30 дней</span></div>' +
      '<div><b class="disp">' + sets7 + '</b><span>' + plural(sets7, 'подход', 'подхода', 'подходов') + ' за 7 дней</span></div></div>' +
      recBlock() +
      (recent.length ? '<h2 class="h2 disp">Последние тренировки</h2>' + recentRows(recent, true) : '') +
      (tip ? '<h2 class="h2 disp">Техника дня</h2><div class="day-tip"><div class="exhead">' + plate(tip.g) + '<b>' + esc(tip.n) + '</b></div>' +
        '<p class="muted">' + esc(tip.t) + '</p><div><button class="btn sm" data-a="ex" data-id="' + tip.id + '">Открыть технику</button></div></div>' : '') +
      '<h2 class="h2 disp">Инструменты</h2><div class="tools">' +
      '<button class="tool" data-a="calc">Калькулятор 1ПМ</button><button class="tool" data-a="plates">Блины на гриф</button>' +
      '<button class="tool" data-a="backup">Резервная копия</button><button class="tool" data-a="remind">Напоминания</button></div>' +
      '<p class="note-sm">Приложение не заменяет тренера и врача. Если чувствуешь боль в суставах или спине, остановись и обратись к специалисту. Данные хранятся только в этом браузере.</p>';
  };

  T.exercises = () => head('Упражнения', '<button class="btn pri sm" data-a="exNew">' + svg('plus', 16) + 'Своё</button>') +
    '<input class="in" id="q" data-in="q" type="search" placeholder="Поиск по названию или мышцам" value="' + esc(UI.q) + '" aria-label="Поиск упражнения">' +
    '<div style="height:10px"></div>' + fitChip() + gChips(UI.g, 'g') + sChips(UI.g, UI.sg, 'sg') + '<div id="exlist">' + listHtml(UI.q, UI.g, 'ex') + '</div>' +
    '<p class="note-sm">Не нашёл нужное? Добавь своё упражнение — оно появится в каталоге и поиске.</p>';

  const progOf = id => PROGS.find(x => x.id === id) || (S.programs || []).find(x => x.id === id) || null;
  T.programs = () => head('Программы', '<button class="btn pri sm" data-a="progNew">' + svg('plus', 16) + 'Своя</button>') + progList() +
    (!S.programs || !S.programs.length
      ? '<h2 class="h2 disp">Своя программа</h2><p class="muted">Собери свой цикл: дни, упражнения, подходы и повторения. Программа сохранится на этом устройстве.</p>' +
        '<button class="btn full" data-a="progNew">Создать программу</button>'
      : '<p class="note-sm">Свою программу можно изменить или удалить внутри карточки программы.</p>');

  const P = {};
  P.records = () => {
    const rows = EX.concat(allCustom()).map(e => ({ e: e, st: exStats(e.id) })).filter(r => r.st.n > 0).sort((a, b) => b.st.last.ts - a.st.last.ts);
    if (!rows.length) return empty('Здесь будут твои рекорды', 'Заверши первую тренировку, и для каждого упражнения появится лучший результат и график.', demoBtn());
    return rows.map(r => '<button class="row" data-a="ex" data-id="' + r.e.id + '">' + plate(r.e.g) +
      '<span class="grow"><span class="rt">' + esc(r.e.n) + '</span><span class="muted sm">последний раз ' + fmtDate(r.st.last.ts) + ' · записей: ' + r.st.n + '</span></span>' +
      '<b>' + esc(bestTxt(r.e, r.st).replace('лучшее: ', '')) + '</b></button>').join('');
  };
  P.chart = () => {
    const rows = EX.concat(allCustom()).map(e => ({ e: e, st: exStats(e.id) })).filter(r => r.st.n > 0);
    if (!rows.length) return empty('Графики появятся после тренировок', 'Для каждого упражнения строится график прогресса.', demoBtn());
    if (!rows.some(r => r.e.id === UI.exSel)) UI.exSel = rows[0].e.id;
    const r = rows.find(x => x.e.id === UI.exSel);
    return '<label class="lbl">Упражнение<select class="in" id="exsel" data-in="exsel">' +
      rows.map(x => '<option value="' + x.e.id + '"' + (x.e.id === UI.exSel ? ' selected' : '') + '>' + esc(x.e.n) + '</option>').join('') + '</select></label>' +
      '<div style="height:12px"></div>' + chart(r.st.pts, unitOf(r.st, r.e)) +
      '<h2 class="h2 disp">Последние занятия</h2>' +
      r.st.sess.slice(-6).reverse().map(s => '<div class="sess"><b>' + fmtDate(s.ts) + '</b><div class="muted">' + s.sets.map(x => setTxt(r.e, x)).join(', ') + '</div></div>').join('');
  };
  P.body = () => {
    const l = S.body.slice().sort((a, b) => a.ts - b.ts);
    return '<div class="inline-form"><input class="in" id="bwv" data-in="bwv" inputmode="decimal" placeholder="Вес тела, кг" aria-label="Вес тела, кг"><button class="btn pri" data-a="bwAdd">Записать</button></div>' +
      (l.length ? chart(l.map(b => ({ ts: b.ts, y: b.w })), 'вес тела, кг') : empty('Записей веса пока нет', 'Взвешивайся в одно и то же время и записывай результат. Тут появится график.', demoBtn())) +
      (l.length ? '<h2 class="h2 disp">Записи</h2>' + l.slice().reverse().slice(0, 10).map(b => '<div class="row" style="cursor:default"><span class="grow"><span class="rt">' + fmtN(b.w) + ' кг' + (b.demo ? '<span class="demo">пример</span>' : '') + '</span><span class="muted sm">' + fmtDate(b.ts) + '</span></span>' +
        '<button class="btn sm ' + (UI.cf === 'bw' + b.id ? 'bad' : 'ghost') + '" data-a="bwDel" data-id="' + b.id + '">' + cfTxt('bw' + b.id, 'Удалить') + '</button></div>').join('') : '');
  };
  P.hist = () => {
    const l = S.workouts.slice().sort((a, b) => b.ts - a.ts);
    if (!l.length) return empty('История пуста', 'Каждая завершённая тренировка сохраняется здесь вместе с подходами.', demoBtn());
    return l.map(w => '<details id="w' + w.id + '"' + (UI.open === w.id ? ' open' : '') + '><summary data-a="wopen" data-id="' + w.id + '"><span class="grow"><b>' + esc(wName(w)) + '</b>' + (w.demo ? '<span class="demo">пример</span>' : '') +
      '<div class="muted sm">' + fmtDate(w.ts) + ', ' + timeOf(w.ts) + ' · ' + fmtDur(w.dur) + ' · ' + setsOf(w) + ' ' + plural(setsOf(w), 'подход', 'подхода', 'подходов') + '</div></span></summary>' +
      '<div style="padding-bottom:12px">' + w.ex.map(x => { const e = exById(x.id); return '<div class="sess"><b>' + esc(e.n) + '</b><div class="muted">' + x.sets.map(s => setTxt(e, s)).join(', ') + '</div></div>'; }).join('') +
      (w.note ? '<p class="muted" style="margin:10px 0">Заметка: ' + esc(w.note) + '</p>' : '') +
      '<div class="three" style="margin-top:10px"><button class="btn sm" data-a="repeat" data-id="' + w.id + '">' + cfTxt('replw' + w.id, 'Повторить') + '</button>' +
      '<button class="btn sm" data-a="wEdit" data-id="' + w.id + '">Изменить</button>' +
      '<button class="btn sm ' + (UI.cf === 'w' + w.id ? 'bad' : 'ghost') + '" data-a="wDel" data-id="' + w.id + '">' + cfTxt('w' + w.id, 'Удалить') + '</button></div></div></details>').join('');
  };
  P.cal = () => {
    if (!UI.cal) {
      const now = new Date();
      UI.cal = { y: now.getFullYear(), m: now.getMonth(), sel: dayStart(now) };
    }
    const y = UI.cal.y, m = UI.cal.m;
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7;
    const dim = new Date(y, m + 1, 0).getDate();
    const monthW = S.workouts.filter(w => { const d = new Date(w.ts); return d.getFullYear() === y && d.getMonth() === m; });
    const byDay = {};
    monthW.forEach(w => { const k = dayKey(w.ts); byDay[k] = (byDay[k] || 0) + 1; });
    const sel = UI.cal.sel, hasSel = sel != null, selDay = hasSel ? dayStart(sel) : null;
    const list = hasSel ? S.workouts.filter(w => dayStart(w.ts) === selDay).sort((a, b) => b.ts - a.ts) : [];
    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<span class="cd cd-x"></span>';
    for (let d = 1; d <= dim; d++) {
      const ts = new Date(y, m, d).getTime();
      const has = byDay[dayKey(ts)] || 0;
      const isSel = hasSel && selDay === ts;
      const isToday = dayStart(Date.now()) === ts;
      cells += '<button class="cd' + (has ? ' has' : '') + (isSel ? ' sel' : '') + (isToday ? ' today' : '') + '" data-a="calDay" data-t="' + ts + '" aria-label="' + d + ' ' + MONF[m] + (has ? ', тренировок: ' + has : '') + '"' + (isSel ? ' aria-pressed="true"' : '') + '>' + d + '</button>';
    }
    const streak = streakWeeks(), daysCount = Object.keys(byDay).length;
    const rem = S.remind || { days: [], time: '19:00' };
    return '<div class="calhead"><button class="mini" data-a="calPrev" aria-label="Предыдущий месяц">‹</button><b>' + MONN[m] + ' ' + y + '</b>' +
      '<button class="mini" data-a="calNext" aria-label="Следующий месяц">›</button><button class="btn sm ghost" data-a="calToday">Сегодня</button></div>' +
      '<div class="calgrid caldow">' + DOW_ORDER.map(d => '<span>' + DOWS[d] + '</span>').join('') + '</div>' +
      '<div class="calgrid">' + cells + '</div>' +
      '<div class="calfoot"><span class="muted sm">' + monthW.length + ' ' + plural(monthW.length, 'тренировка', 'тренировки', 'тренировок') + ' · ' + daysCount + ' ' + plural(daysCount, 'день', 'дня', 'дней') + '</span>' +
      '<span class="tag">' + (streak ? streak + ' ' + plural(streak, 'неделя', 'недели', 'недель') + ' подряд' : 'серии пока нет') + '</span></div>' +
      (hasSel ? '<h2 class="h2 disp">' + new Date(selDay).getDate() + ' ' + MONF[new Date(selDay).getMonth()] + '</h2>' : '') +
      (hasSel
        ? (list.length
          ? list.map(w => '<div class="row" style="cursor:default"><span class="grow"><span class="rt">' + esc(wName(w)) + (w.demo ? '<span class="demo">пример</span>' : '') + '</span>' +
            '<span class="muted sm">' + timeOf(w.ts) + ' · ' + fmtDur(w.dur) + ' · ' + setsOf(w) + ' ' + plural(setsOf(w), 'подход', 'подхода', 'подходов') + '</span></span>' +
            '<button class="btn sm" data-a="calOpen" data-id="' + w.id + '">Открыть</button></div>').join('')
          : '<p class="muted pad">В этот день тренировок не было.</p>')
        : '<p class="muted pad">Выбери день в календаре, чтобы увидеть тренировки.</p>') +
      '<h2 class="h2 disp">Напоминание</h2>' +
      (rem.days.length
        ? '<div class="kv"><span class="muted">' + esc(daysTxt(rem.days)) + '</span><b>' + esc(rem.time) + '</b></div><div style="height:10px"></div><button class="btn full" data-a="remind">Изменить напоминание</button>'
        : '<p class="muted">Календарь телефона напомнит о тренировке, даже если приложение закрыто.</p><div style="height:10px"></div><button class="btn full" data-a="remind">Настроить напоминание</button>');
  };

  T.progress = () => head('Прогресс') +
    '<div class="seg">' + [['records', 'Рекорды'], ['chart', 'График'], ['body', 'Вес'], ['hist', 'История'], ['cal', 'Календарь']].map(s =>
      '<button data-a="sub" data-v="' + s[0] + '" aria-pressed="' + (UI.sub === s[0]) + '">' + s[1] + '</button>').join('') + '</div>' + P[UI.sub]();

  function notesHtml() {
    const q = UI.nq.trim().toLowerCase();
    const l = S.notes.filter(n => (UI.noteTag === 'all' || n.tag === UI.noteTag) && (!q || (n.title + ' ' + n.text).toLowerCase().indexOf(q) >= 0)).sort((a, b) => b.up - a.up);
    if (!l.length) return empty(S.notes.length ? 'Ничего не нашлось' : 'Блокнот пока пуст', S.notes.length ? 'Измени поиск или метку.' : 'Записывай самочувствие, питание, цели и идеи для тренировок.');
    return l.map(n => '<button class="row" data-a="noteOpen" data-id="' + n.id + '"><span class="grow"><span class="rt">' + esc(n.title || 'Без названия') + '</span>' +
      '<span class="muted sm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc((n.text || '').replace(/\s+/g, ' ').slice(0, 90) || 'Пустая запись') + '</span></span>' +
      '<span class="grow" style="flex:none;text-align:right"><span class="tag">' + esc(n.tag) + '</span><span class="muted sm" style="display:block">' + fmtDate(n.up) + '</span></span></button>').join('');
  }
  T.notes = () => head('Блокнот', '<button class="btn pri sm" data-a="noteNew">' + svg('plus', 16) + 'Запись</button>') +
    '<input class="in" id="nq" data-in="nq" type="search" placeholder="Поиск по записям" value="' + esc(UI.nq) + '" aria-label="Поиск по записям">' +
    '<div style="height:10px"></div>' + chips([['all', 'Все']].concat(TAGS.map(t => [t, t])), UI.noteTag, 'ntagf') + '<div id="nlist">' + notesHtml() + '</div>';

  /* ---------- экраны поверх вкладок ---------- */
  const V = {};

  const hasHow = e => !!((e.s && e.s.length) || (e.e && e.e.length) || e.t);

  V.how = v => {
    const e = exById(v.id);
    return '<div class="bar2"><button class="icon" data-a="back" aria-label="Назад">' + svg('back') + '</button><span class="muted sm">Как выполнять</span></div>' +
      '<h1 class="h1 disp">' + esc(e.n) + '</h1>' +
      (e.mu ? '<p class="muted">Работают: ' + esc(e.mu) + '.</p>' : '') +
      (e.s.length ? '<h2 class="h2 disp">Шаги</h2><ol class="steps">' + e.s.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' : '') +
      (e.e.length ? '<h2 class="h2 disp">Частые ошибки</h2><ul class="errs">' + e.e.map(s => '<li>' + esc(s) + '</li>').join('') + '</ul>' : '') +
      (e.t ? '<div class="tipbox"><b>Совет.</b> ' + esc(e.t) + '</div>' : '') +
      '<div style="height:18px"></div><button class="btn pri lg full" data-a="addw" data-id="' + e.id + '">Добавить в ' + (S.active ? 'тренировку' : 'план') + '</button>';
  };

  V.ex = v => {
    const e = exById(v.id), st = exStats(e.id), c = isCustom(e);
    const target = S.active ? 'тренировку' : 'план';
    return '<div class="bar2"><button class="icon" data-a="back" aria-label="Назад">' + svg('back') + '</button><span class="muted sm">' + (c ? 'Своё упражнение' : 'Техника выполнения') + '</span></div>' +
      '<div class="exhead">' + plate(e.g) + '<span class="muted">' + GR[e.g][0] + '</span></div>' +
      '<h1 class="h1 disp">' + esc(e.n) + '</h1>' +
      '<div class="meta"><span class="tag">' + esc(e.eq || '—') + '</span><span class="tag">' + (c ? (e.hidden ? 'скрыто' : 'своё') : (e.lv === 1 ? 'подходит новичкам' : 'нужен опыт')) + '</span>' +
      '<span class="tag">' + (e.u ? 'на время' : (e.m === 'w' ? 'вес и повторы' : 'повторения')) + '</span></div>' +
      subTags(e) +
      (e.mu ? '<p class="muted">Работают: ' + esc(e.mu) + '.</p>' : '') +
      (hasHow(e) ? '<button class="btn lg full howbtn" data-a="how" data-id="' + e.id + '"><span>Как выполнять</span><span aria-hidden="true">' + svg('next') + '</span></button>' : '') +
      (c && !hasHow(e) ? '<div class="tipbox"><b>Своё упражнение.</b> Технику можно дописать в редакторе — она будет видна на экране «Как выполнять».</div>' : '') +
      '<h2 class="h2 disp">Твои результаты</h2>' +
      (st.n ? '<div class="kv"><span class="muted">Лучший результат</span><b>' + esc(bestTxt(e, st)) + '</b></div>' +
        '<div class="kv"><span class="muted">Последний раз, ' + fmtDate(st.last.ts) + '</span><b>' + esc(st.last.sets.map(s => setTxt(e, s)).join(', ')) + '</b></div>'
        : '<p class="muted">Записей пока нет. Добавь упражнение в ' + target + ' и отметь подходы.</p>') +
      (c ? '<div style="height:18px"></div><div class="two"><button class="btn" data-a="exEdit" data-id="' + e.id + '">Изменить</button>' +
        (e.hidden
          ? '<button class="btn pri" data-a="exUnhide" data-id="' + e.id + '">Вернуть в каталог</button>'
          : '<button class="btn ' + (UI.cf === 'exd' + e.id ? 'bad' : 'ghost') + '" data-a="exCustomDel" data-id="' + e.id + '">' + cfTxt('exd' + e.id, 'Удалить') + '</button>') + '</div>' : '') +
      '<div style="height:18px"></div><button class="btn pri lg full" data-a="addw" data-id="' + e.id + '">Добавить в ' + target + '</button>';
  };

  // план: список упражнений до старта, таймер ещё не идёт
  function planView(d) {
    const total = d.ex.reduce((a, x) => a + clampSets(x.n), 0);
    const cards = d.ex.map((x, i) => {
      const e = exById(x.id);
      return '<section class="pcard"><div class="ptop">' + plate(e.g) +
        '<button class="pname" data-a="ex" data-id="' + e.id + '">' + esc(e.n) + '</button>' +
        '<button class="mini" data-a="planUp" data-i="' + i + '" aria-label="Выше">↑</button>' +
        '<button class="mini" data-a="planDown" data-i="' + i + '" aria-label="Ниже">↓</button>' +
        '<button class="mini" data-a="planDel" data-i="' + i + '" aria-label="Убрать из плана">' + svg('trash', 17) + '</button></div>' +
        '<div class="pmeta"><span class="stepper"><button data-a="planMinus" data-i="' + i + '" aria-label="Меньше подходов">−</button><span>' + clampSets(x.n) + '</span><button data-a="planPlus" data-i="' + i + '" aria-label="Больше подходов">+</button></span>' +
        '<span class="muted sm">подх.</span>' +
        '<label class="pinline">' + (e.u ? uWord(e) : 'Повторы') + ' <input class="in" data-in="ptr" data-i="' + i + '" value="' + esc(x.tr) + '" placeholder="' + (e.u === 'мин' ? '20' : e.u ? '30' : '10–12') + '" inputmode="numeric" aria-label="' + (e.u ? uWord(e) : 'Повторы') + '"></label></div></section>';
    }).join('');
    return '<div class="work-top"><button class="icon" data-a="back" aria-label="Свернуть план">' + svg('back') + '</button>' +
      '<div class="grow"><span class="muted sm">План тренировки</span><span class="pcount">' + d.ex.length + ' упр. · ' + total + ' ' + plural(total, 'подход', 'подхода', 'подходов') + '</span></div></div>' +
      '<p class="muted sm plan-note">' + (d.ex.length
        ? 'Таймер и отдых включатся после старта. Когда список готов — жми «Начать тренировку» внизу.'
        : 'Таймер и отдых включатся после старта. Добавь упражнения — и внизу появится кнопка старта.') + '</p>' +
      (cards || empty('Список пуст', 'Добавь упражнения из каталога — кнопка старта появится внизу, когда будет что начинать.')) +
      '<button class="btn full" data-a="pickOpen">' + svg('plus', 18) + 'Добавить упражнение</button>' +
      (d.ex.length ? '<div style="height:10px"></div><button class="btn ghost full ' + (UI.cf === 'clearplan' ? 'bad' : '') + '" data-a="clearPlan">' + cfTxt('clearplan', 'Очистить план') + '</button>' : '');
  }

  V.workout = () => {
    if (!S.active) {
      if (!S.draft) return '<div class="bar2"><button class="icon" data-a="back" aria-label="Назад">' + svg('back') + '</button></div>' + empty('Плана пока нет', 'Собери тренировку на вкладке «Сегодня».');
      return planView(S.draft);
    }
    const a = S.active;
    const cards = a.ex.map((x, i) => {
      const e = exById(x.id), sec = !!e.u;
      // у своих упражнений без веса поле веса не показываем
      const weighted = !sec && (e.m === 'w' || !e.custom);
      const rows = x.sets.map((s, j) => {
        const p = ph(i, j);
        return '<div class="srow' + (s.done ? ' done' : '') + (UI.err === i + '-' + j ? ' err' : '') + '"><span class="sn">' + (j + 1) + '</span>' +
          (weighted ? '<input class="in" inputmode="decimal" placeholder="' + esc(p.w || '0') + '" value="' + esc(s.w) + '" data-in="w" data-i="' + i + '" data-j="' + j + '" aria-label="Вес, кг, подход ' + (j + 1) + '">' : '') +
          '<input class="in" inputmode="numeric" placeholder="' + esc(p.r) + '" value="' + esc(s.r) + '" data-in="r" data-i="' + i + '" data-j="' + j + '" aria-label="' + (sec ? uWord(e) : 'Повторения') + ', подход ' + (j + 1) + '">' +
          '<button class="chk" data-a="chk" data-i="' + i + '" data-j="' + j + '" aria-pressed="' + !!s.done + '" aria-label="Подход ' + (j + 1) + ' выполнен">' + svg('check', 22) + '</button></div>';
      }).join('');
      return '<section class="card"><div class="exh">' + plate(e.g) + '<button class="exname" data-a="ex" data-id="' + e.id + '">' + esc(e.n) + '</button>' +
        '<button class="icon" data-a="exdel" data-i="' + i + '" aria-label="Убрать упражнение" style="' + (UI.cf === 'ed' + i ? 'border-color:var(--bad);color:var(--bad);width:auto;padding:0 10px' : '') + '">' + (UI.cf === 'ed' + i ? 'Точно?' : svg('trash', 18)) + '</button></div>' +
        (x.tr ? '<div class="muted sm">План: ' + esc(x.tr) + (sec ? (e.u === 'мин' ? ' мин' : ' сек') : ' повторений') + '</div>' : '') +
        hintHtml(x, i) +
        '<div class="sets' + (weighted ? '' : ' t') + '"><div class="shead"><span>№</span>' + (weighted ? '<span>Вес, кг</span>' : '') + '<span>' + (sec ? uWord(e) : 'Повторы') + '</span><span></span></div>' + rows + '</div>' +
        '<button class="btn sm" data-a="setadd" data-i="' + i + '">' + svg('plus', 16) + 'Подход</button></section>';
    }).join('');
    return '<div class="work-top"><button class="icon" data-a="back" aria-label="Свернуть тренировку">' + svg('back') + '</button>' +
      '<div class="grow"><span class="muted sm">Тренировка</span><span class="elapsed" id="elapsed">' + fmtDur(Math.floor((Date.now() - a.start) / 1000)) + '</span></div>' +
      '<button class="btn pri" data-a="finish">Завершить</button></div>' +
      '<div class="muted sm" style="margin:2px 0 4px">Отдых между подходами, секунд</div>' +
      chips([60, 90, 120, 180].map(n => [String(n), String(n)]), String(S.rest), 'rest') +
      (cards || empty('Пока пусто', 'Добавь первое упражнение, чтобы записывать подходы.')) +
      '<button class="btn full" data-a="pickOpen">' + svg('plus', 18) + 'Добавить упражнение</button>' +
      '<h2 class="h2 disp">Заметка</h2><textarea class="in" id="wnote" data-in="wnote" style="min-height:90px" placeholder="Как прошла тренировка?">' + esc(a.note) + '</textarea>' +
      '<div class="stack" style="margin-top:16px">' +
      (UI.tpl ? '<div class="inline-form"><input class="in" id="tplname" placeholder="Название программы" aria-label="Название программы"><button class="btn pri" data-a="tplSave">Сохранить</button></div>'
        : (a.ex.length ? '<button class="btn" data-a="tplOpen">Сохранить как программу</button>' : '')) +
      '<button class="btn ' + (UI.cf === 'cancel' ? 'bad' : 'ghost') + '" data-a="cancelW">' + cfTxt('cancel', 'Отменить тренировку') + '</button></div>';
  };

  // правка уже завершённой тренировки
  V.wEdit = () => {
    const w = UI.wedit;
    if (!w) return '';
    const durMin = Math.round((num(w.dur) || 0) / 60);
    const cards = w.ex.map((x, i) => {
      const e = exById(x.id), sec = !!e.u;
      const weighted = !sec && (e.m === 'w' || !e.custom);
      const rows = x.sets.map((s, j) =>
        '<div class="srow"><span class="sn">' + (j + 1) + '</span>' +
        (weighted ? '<input class="in" inputmode="decimal" value="' + esc(s.w) + '" data-in="wed" data-i="' + i + '" data-j="' + j + '" data-f="w" aria-label="Вес, кг, подход ' + (j + 1) + '">' : '') +
        '<input class="in" inputmode="numeric" value="' + esc(s.r) + '" data-in="wed" data-i="' + i + '" data-j="' + j + '" data-f="r" aria-label="' + (sec ? uWord(e) : 'Повторы') + ', подход ' + (j + 1) + '">' +
        '<button class="mini" data-a="wSetDel" data-i="' + i + '" data-j="' + j + '" aria-label="Удалить подход">' + svg('close', 16) + '</button></div>').join('');
      return '<section class="card"><div class="exh">' + plate(e.g) + '<button class="exname" data-a="ex" data-id="' + e.id + '">' + esc(e.n) + '</button>' +
        '<button class="icon" data-a="wExDel" data-i="' + i + '" aria-label="Убрать упражнение" style="' + (UI.cf === 'wex' + i ? 'border-color:var(--bad);color:var(--bad);width:auto;padding:0 10px' : '') + '">' + (UI.cf === 'wex' + i ? 'Точно?' : svg('trash', 18)) + '</button></div>' +
        '<div class="sets' + (weighted ? '' : ' t') + '"><div class="shead"><span>№</span>' + (weighted ? '<span>Вес, кг</span>' : '') + '<span>' + (sec ? uWord(e) : 'Повторы') + '</span><span></span></div>' + rows + '</div>' +
        '<button class="btn sm" data-a="wSetAdd" data-i="' + i + '">' + svg('plus', 16) + 'Подход</button></section>';
    }).join('');
    return '<div class="bar2"><button class="icon" data-a="wEditBack" aria-label="Назад">' + svg('back') + '</button><span class="grow muted sm">Правка тренировки</span>' +
      '<button class="btn pri sm" data-a="wEditSave">Сохранить</button></div>' +
      '<h1 class="h1 disp">Изменить тренировку</h1>' +
      '<p class="muted">Поправь дату, время, подходы или заметку. Рекорды и графики пересчитаются сами.</p><div style="height:14px"></div>' +
      '<label class="lbl">Дата и время<input class="in" type="datetime-local" data-in="wdate" value="' + dtLocal(w.ts) + '"></label>' +
      '<label class="lbl" style="margin-top:10px">Длительность, минут<input class="in" inputmode="numeric" data-in="wdur" value="' + (durMin || '') + '" placeholder="0"></label>' +
      '<h2 class="h2 disp">Упражнения</h2>' + (cards || '<p class="muted">Пока нет упражнений.</p>') +
      '<button class="btn full" data-a="wAddEx">' + svg('plus', 18) + 'Добавить упражнение</button>' +
      '<h2 class="h2 disp">Заметка</h2><textarea class="in" data-in="wnote2" style="min-height:90px" placeholder="Заметка к тренировке">' + esc(w.note || '') + '</textarea>' +
      '<div style="height:18px"></div><button class="btn pri lg full" data-a="wEditSave">Сохранить изменения</button>';
  };

  V.pick = v => '<div class="bar2"><button class="icon" data-a="back" aria-label="Назад">' + svg('back') + '</button><span class="grow muted sm">' + (v.mode === 'pedit' ? 'Упражнение в программу' : v.mode === 'wedit' ? 'Упражнение в тренировку' : 'Выбери упражнение') + '</span>' +
    '<button class="btn sm" data-a="exNew">' + svg('plus', 16) + 'Своё</button></div>' +
    '<input class="in" id="pq" data-in="pq" type="search" placeholder="Поиск" value="' + esc(UI.pq) + '" aria-label="Поиск упражнения"><div style="height:10px"></div>' +
    fitChip() + gChips(UI.pg, 'pg') + sChips(UI.pg, UI.psg, 'psg') + '<div id="pklist">' + listHtml(UI.pq, UI.pg, 'pick') + '</div>';

  V.summary = v => {
    const w = S.workouts.find(x => x.id === v.id);
    if (!w) return '';
    return '<h1 class="h1 disp" style="margin-top:24px">Тренировка завершена</h1>' +
      '<div class="stats"><div><b class="disp">' + fmtDur(w.dur) + '</b><span>время</span></div><div><b class="disp">' + setsOf(w) + '</b><span>' + plural(setsOf(w), 'подход', 'подхода', 'подходов') + '</span></div><div><b class="disp">' + w.ex.length + '</b><span>' + plural(w.ex.length, 'упражнение', 'упражнения', 'упражнений') + '</span></div></div>' +
      (v.prs.length ? '<h2 class="h2 disp">Новые рекорды</h2>' + v.prs.map(p => { const e = exById(p.id); return '<div class="kv"><span>' + esc(e.n) + '</span><b>' + fmtN(p.from) + ' → ' + fmtN(p.to) + (p.md === 'w' ? ' кг' : (e.u ? ' с' : ' повт.')) + '</b></div>'; }).join('')
        : '<p class="muted pad">Рекордов в этот раз нет. Стабильная работа тоже двигает вперёд.</p>') +
      '<div style="height:16px"></div><button class="btn pri lg full" data-a="doneSum">Готово</button>';
  };

  V.prog = v => {
    const p = progOf(v.id);
    if (!p) return '';
    const custom = !!p.custom;
    return '<div class="bar2"><button class="icon" data-a="back" aria-label="Назад">' + svg('back') + '</button><span class="grow muted sm">' + (custom ? 'Своя программа' : 'Готовая программа') + '</span>' +
      (custom ? '<button class="btn sm" data-a="progEdit" data-id="' + p.id + '">Изменить</button>' : '') + '</div>' +
      '<h1 class="h1 disp">' + esc(p.n) + '</h1><p class="muted">' + esc(p.d) + '</p>' +
      p.days.map((d, di) => '<h2 class="h2 disp">' + esc(d.n) + '</h2>' + d.ex.map(a => { const e = exById(a[0]); return '<button class="row" data-a="ex" data-id="' + e.id + '">' + plate(e.g) +
        '<span class="grow"><span class="rt">' + esc(e.n) + '</span></span><b>' + a[1] + ' × ' + esc(a[2] || '–') + '</b></button>'; }).join('') +
        '<div style="height:10px"></div><button class="btn pri full" data-a="startDay" data-id="' + p.id + '" data-d="' + di + '">' + (UI.cf === 'repl' + p.id + di ? 'Заменить план?' : 'Собрать: ' + esc(d.n)) + '</button>').join('') +
      (custom ? '<div style="height:20px"></div><button class="btn ' + (UI.cf === 'pd' + p.id ? 'bad' : 'ghost') + ' full" data-a="progDel" data-id="' + p.id + '">' + cfTxt('pd' + p.id, 'Удалить программу') + '</button>'
        : '<div style="height:20px"></div><button class="btn full" data-a="progCopy" data-id="' + p.id + '">Скопировать в свои и изменить</button>');
  };

  // своё упражнение: название, группа, инвентарь и единица записи
  V.exEdit = () => {
    const f = UI.exf;
    if (!f) return '';
    const modes = [['w', 'Вес и повторы'], ['r', 'Повторы'], ['s', 'Секунды']];
    const cur = f.u === 'сек' ? 's' : f.m;
    return '<div class="bar2"><button class="icon" data-a="exBack" aria-label="Назад">' + svg('back') + '</button><span class="muted sm">' + (f.id ? 'Своё упражнение' : 'Новое упражнение') + '</span></div>' +
      '<h1 class="h1 disp">' + (f.id ? 'Изменить упражнение' : 'Своё упражнение') + '</h1>' +
      '<p class="muted">Добавь то, чего нет в каталоге. Оно появится в поиске, программах и записях.</p><div style="height:14px"></div>' +
      '<label class="lbl">Название<input class="in" data-in="exn" value="' + esc(f.n) + '" placeholder="Например, тяга резины к поясу" autocomplete="off"></label>' +
      '<div style="height:14px"></div><div class="muted sm" style="margin-bottom:6px">Группа мышц</div>' + chips(Object.keys(GR).map(k => [k, GR[k][0]]), f.g, 'exfg', 'wrap') +
      '<label class="lbl">Инвентарь<input class="in" data-in="exeq" value="' + esc(f.eq) + '" placeholder="Свой вес, гантели, резина…"></label>' +
      '<div style="height:14px"></div><div class="muted sm" style="margin-bottom:6px">Что записываем</div>' + chips(modes, cur, 'exfm') +
      '<label class="lbl">Работающие мышцы<input class="in" data-in="exmu" value="' + esc(f.mu) + '" placeholder="Необязательно"></label>' +
      '<label class="lbl" style="margin-top:12px">Заметка по технике<textarea class="in" data-in="ext" style="min-height:110px" placeholder="Необязательно: как выполнять, на что смотреть">' + esc(f.t) + '</textarea></label>' +
      '<div style="height:18px"></div><button class="btn pri lg full" data-a="exSave">Сохранить упражнение</button>';
  };

  // конструктор своей программы: дни и упражнения с подходами и повторами
  V.progEdit = () => {
    const pe = UI.pedit;
    if (!pe) return '';
    const days = pe.days.map((d, di) => {
      const rows = d.ex.map((a, ei) => {
        const e = exById(a[0]);
        return '<div class="brow"><span class="bn">' + esc(e.n) + '<small>' + esc(GR[e.g][0]) + '</small></span>' +
          '<span class="bctl"><button class="mini" data-a="bUp" data-d="' + di + '" data-e="' + ei + '" aria-label="Выше">↑</button>' +
          '<button class="mini" data-a="bDown" data-d="' + di + '" data-e="' + ei + '" aria-label="Ниже">↓</button>' +
          '<button class="mini" data-a="bExDel" data-d="' + di + '" data-e="' + ei + '" aria-label="Убрать упражнение">' + svg('trash', 16) + '</button></span></div>' +
          '<div class="bfields"><label class="lbl">Подходы<input class="in sets" data-in="pset" data-d="' + di + '" data-e="' + ei + '" inputmode="numeric" value="' + esc(a[1]) + '"></label>' +
          '<label class="lbl">Повторы<input class="in" data-in="ptrb" data-d="' + di + '" data-e="' + ei + '" value="' + esc(a[2]) + '" placeholder="8–12"></label></div>';
      }).join('');
      return '<div class="daycard"><div class="dayhead"><input class="in" data-in="pdn" data-d="' + di + '" value="' + esc(d.n) + '" aria-label="Название дня">' +
        '<button class="mini" data-a="bDayDel" data-d="' + di + '" aria-label="Удалить день">' + svg('trash', 16) + '</button></div>' +
        (rows || '<p class="muted sm">Пока нет упражнений.</p>') +
        '<div style="height:10px"></div><button class="btn sm" data-a="bAddEx" data-d="' + di + '">' + svg('plus', 16) + 'Упражнение</button></div>';
    }).join('');
    return '<div class="bar2"><button class="icon" data-a="progBack" aria-label="Назад">' + svg('back') + '</button><span class="grow muted sm">' + (pe.id ? 'Своя программа' : 'Новая программа') + '</span>' +
      '<button class="btn pri sm" data-a="progSave">Сохранить</button></div>' +
      '<h1 class="h1 disp">' + (pe.id ? 'Изменить программу' : 'Своя программа') + '</h1>' +
      '<label class="lbl">Название<input class="in" data-in="pn" value="' + esc(pe.n) + '" placeholder="Например, Верх / Низ" autocomplete="off"></label>' +
      '<label class="lbl" style="margin-top:10px">Описание<input class="in" data-in="pdesc" value="' + esc(pe.d) + '" placeholder="Сколько раз в неделю и для кого"></label>' +
      '<h2 class="h2 disp">Дни</h2>' + days +
      '<button class="btn full" data-a="bAddDay">' + svg('plus', 18) + 'Добавить день</button>' +
      '<div style="height:16px"></div><button class="btn pri lg full" data-a="progSave">Сохранить программу</button>';
  };

  // напоминание: событие для календаря телефона
  V.remind = () => {
    const r = S.remind || { days: [], time: '19:00' };
    const dayChips = DOW_ORDER.map(d => '<button class="chip" data-a="remDay" data-v="' + d + '" aria-pressed="' + (r.days.indexOf(d) >= 0) + '">' + DOWS[d] + '</button>').join('');
    return '<div class="bar2"><button class="icon" data-a="back" aria-label="Назад">' + svg('back') + '</button><span class="muted sm">Напоминания</span></div>' +
      '<h1 class="h1 disp">Напоминание о тренировке</h1>' +
      '<p class="muted">Приложение не может разбудить телефон, когда закрыто. Поэтому я создам повторяющееся событие в календаре — он напомнит в выбранные дни.</p>' +
      '<div class="muted sm" style="margin:16px 0 6px">Дни недели</div>' +
      '<div class="chips wrap">' + dayChips + '</div>' +
      '<label class="lbl">Время<input class="in" type="time" data-in="remTime" value="' + esc(r.time) + '"></label>' +
      '<div class="tipbox"><b>Как это работает.</b> Нажми «Добавить в календарь», открой скачанный файл и подтверди событие. Телефон будет напоминать за 15 минут. Удалить или изменить событие можно в обычном календаре.</div>' +
      '<button class="btn pri lg full" data-a="remIcs">Добавить в календарь</button>' +
      (r.days.length ? '<div style="height:10px"></div><button class="btn ghost full ' + (UI.cf === 'remoff' ? 'bad' : '') + '" data-a="remOff">' + cfTxt('remoff', 'Выключить напоминания') + '</button>' : '');
  };

  function nextReminderDate() {
    const r = S.remind || {};
    const days = r.days || [];
    if (!days.length) return null;
    const m = /^(\d{2}):(\d{2})$/.exec(r.time || '19:00');
    const hh = m ? +m[1] : 19, mm = m ? +m[2] : 0;
    const now = Date.now();
    for (let k = 0; k < 8; k++) {
      const d = new Date();
      d.setHours(hh, mm, 0, 0);
      d.setDate(d.getDate() + k);
      if (days.indexOf(d.getDay()) >= 0 && d.getTime() > now) return d;
    }
    return null;
  }
  function icsEsc(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function icsLocal(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }
  function icsStamp() {
    const d = new Date();
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }
  // строки ICS не длиннее 75 байт: длинные переносим с пробелом в начале
  function icsFold(line) {
    const enc = new TextEncoder(), parts = [];
    let cur = '', bytes = 0;
    for (const ch of line) {
      const b = enc.encode(ch).length;
      if (bytes + b > 73) { parts.push(cur); cur = ' ' + ch; bytes = 1 + b; }
      else { cur += ch; bytes += b; }
    }
    parts.push(cur);
    return parts.join('\r\n');
  }
  function makeIcs() {
    const start = nextReminderDate();
    if (!start) return '';
    const end = new Date(start.getTime() + 3600e3);
    const byday = DOW_ORDER.filter(d => S.remind.days.indexOf(d) >= 0).map(d => ICS_DAY[d]).join(',');
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Podhod//Training Reminder//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:podhod-' + start.getTime() + '@podhod',
      'DTSTAMP:' + icsStamp(),
      'DTSTART:' + icsLocal(start),
      'DTEND:' + icsLocal(end),
      'RRULE:FREQ=WEEKLY;BYDAY=' + byday,
      'SUMMARY:' + icsEsc('Тренировка — Подход'),
      'DESCRIPTION:' + icsEsc('Время собрать тренировку. Открой «Подход» и составь план.'),
      'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc('Скоро тренировка'), 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR', ''
    ].map(icsFold).join('\r\n');
  }


  V.note = v => {
    const n = S.notes.find(x => x.id === v.id);
    if (!n) return '';
    return '<div class="bar2"><button class="icon" data-a="back" aria-label="Назад">' + svg('back') + '</button><span class="grow muted sm">Запись сохраняется сама</span>' +
      '<button class="btn sm ' + (UI.cf === 'n' + n.id ? 'bad' : 'ghost') + '" data-a="noteDel" data-id="' + n.id + '">' + cfTxt('n' + n.id, 'Удалить') + '</button></div>' +
      '<input class="in" id="ntitle" data-in="ntitle" placeholder="Заголовок" value="' + esc(n.title) + '" aria-label="Заголовок" style="font-weight:600;font-size:18px">' +
      '<div style="height:10px"></div>' + chips(TAGS.map(t => [t, t]), n.tag, 'ntag') +
      '<textarea class="in" id="ntext" data-in="ntext" placeholder="Пиши здесь: самочувствие, питание, цели, идеи">' + esc(n.text) + '</textarea>';
  };
  function cleanNote(id) {
    const n = S.notes.find(x => x.id === id);
    if (n && !n.title.trim() && !n.text.trim()) { S.notes = S.notes.filter(x => x.id !== id); save(); }
  }

  V.calc = () => '<div class="bar2"><button class="icon" data-a="back" aria-label="Назад">' + svg('back') + '</button></div><h1 class="h1 disp">Калькулятор 1ПМ</h1>' +
    '<p class="muted">Введи вес и число повторений, которые ты сделал до отказа или близко к нему. Для точности лучше брать до 10 повторений.</p><div style="height:12px"></div>' +
    '<div class="two"><label class="lbl">Вес, кг<input class="in" id="cw" data-in="cw" inputmode="decimal" value="' + esc(UI.calc.w) + '"></label>' +
    '<label class="lbl">Повторения<input class="in" id="cr" data-in="cr" inputmode="numeric" value="' + esc(UI.calc.r) + '"></label></div><div id="calcOut">' + calcOut() + '</div>';
  function calcOut() {
    const w = num(UI.calc.w), r = Math.round(num(UI.calc.r));
    if (w <= 0 || r <= 0) return '<p class="muted pad">Расчётный максимум и рабочие веса появятся здесь.</p>';
    const one = est1(w, r);
    return '<div class="kv" style="margin-top:14px"><span>Расчётный 1ПМ</span><b>' + fmtN(Math.round(one * 10) / 10) + ' кг</b></div>' +
      '<h2 class="h2 disp">Рабочие веса</h2>' + [95, 90, 85, 80, 75, 70, 65, 60].map(p => {
        const reps = Math.round(30 * (100 / p - 1));
        return '<div class="kv"><span class="muted">' + p + '% от максимума · около ' + reps + ' повт.</span><b>' + fmtN(Math.round(one * p / 100 * 2) / 2) + ' кг</b></div>';
      }).join('') + '<p class="note-sm">Это расчёт по формуле Эпли. Реальные возможности зависят от упражнения и самочувствия.</p>';
  }

  const PLC = { 25: ['#e07a7a', '100%'], 20: ['#6f9ae0', '100%'], 15: ['#e3b765', '84%'], 10: ['#6fb895', '68%'], 5: ['#e6e9ec', '54%'], 2.5: ['#3b4552', '42%'], 1.25: ['#93a0b0', '34%'] };
  V.plates = () => '<div class="bar2"><button class="icon" data-a="back" aria-label="Назад">' + svg('back') + '</button></div><h1 class="h1 disp">Блины на гриф</h1>' +
    '<p class="muted">Какие блины навесить на каждую сторону, чтобы получить нужный общий вес.</p><div style="height:12px"></div>' +
    '<div class="two"><label class="lbl">Общий вес, кг<input class="in" id="pt" data-in="pt" inputmode="decimal" value="' + esc(UI.plt.t) + '"></label>' +
    '<label class="lbl">Гриф<select class="in" id="pb" data-in="pb"><option value="20"' + (UI.plt.bar === '20' ? ' selected' : '') + '>Олимпийский, 20 кг</option><option value="15"' + (UI.plt.bar === '15' ? ' selected' : '') + '>Женский, 15 кг</option><option value="10"' + (UI.plt.bar === '10' ? ' selected' : '') + '>Лёгкий, 10 кг</option></select></label></div>' +
    '<div id="plOut">' + plOut() + '</div>';
  function plOut() {
    const t = num(UI.plt.t), bar = num(UI.plt.bar);
    if (t <= 0) return '<p class="muted pad">Введи вес штанги, и здесь появится схема.</p>';
    if (t < bar) return '<p class="muted pad">Это меньше веса грифа. Возьми гриф легче или увеличь вес.</p>';
    let rest = (t - bar) / 2;
    const out = [];
    [25, 20, 15, 10, 5, 2.5, 1.25].forEach(s => {
      const c = Math.floor(rest / s + 1e-9);
      if (c > 0) { out.push([s, c]); rest = Math.round((rest - c * s) * 1000) / 1000; }
    });
    const reach = t - rest * 2;
    const pl = out.map(o => Array.from({ length: o[1] }, () => '<i class="pl" style="--c:' + PLC[o[0]][0] + ';--h:' + PLC[o[0]][1] + '"></i>').join('')).join('');
    return '<div class="barbell" aria-hidden="true"><span class="bar"></span>' + pl + '<span class="end"></span></div>' +
      (out.length ? out.map(o => '<div class="kv"><span><i class="plate" style="display:inline-block;vertical-align:middle;margin-right:8px;--pc:' + PLC[o[0]][0] + '"></i>' + fmtN(o[0]) + ' кг</span><b>× ' + o[1] + ' с каждой стороны</b></div>').join('') : '<p class="muted pad">Только гриф, без блинов.</p>') +
      '<div class="kv"><span class="muted">Получится</span><b>' + fmtN(reach) + ' кг</b></div>' +
      (rest > 0.0001 ? '<p class="note-sm">Точный вес ' + fmtN(t) + ' кг набрать не получится: не хватает блинов меньше 1,25 кг.</p>' : '');
  }

  V.backup = () => '<div class="bar2"><button class="icon" data-a="back" aria-label="Назад">' + svg('back') + '</button></div><h1 class="h1 disp">Резервная копия</h1>' +
    '<p class="muted">Данные лежат только в этом браузере. Скачай файл копии или скопируй текст — так их можно перенести на другое устройство.</p><div style="height:12px"></div>' +
    '<textarea class="in" id="bk" readonly style="min-height:120px;font-size:12px">' + esc(JSON.stringify(S)) + '</textarea><div style="height:10px"></div>' +
    '<div class="stack"><button class="btn pri full" data-a="dlBk">Скачать файл копии</button>' +
    '<button class="btn full" data-a="copyBk">Скопировать текстом</button></div>' +
    '<h2 class="h2 disp">Восстановить</h2>' +
    '<label class="btn full" for="bkfile" style="margin-bottom:10px">Выбрать файл копии (.json)</label>' +
    '<input id="bkfile" type="file" accept=".json,application/json" hidden>' +
    '<textarea class="in" id="impt" data-in="impt" placeholder="Или вставь сюда скопированный ранее текст" style="min-height:100px;font-size:12px">' + esc(UI.impText) + '</textarea><div style="height:10px"></div>' +
    '<button class="btn full ' + (UI.cf === 'imp' ? 'bad' : '') + '" data-a="impBk">' + cfTxt('imp', 'Восстановить из копии') + '</button>' +
    '<h2 class="h2 disp">Очистка</h2><div class="stack">' +
    (hasDemo() ? '<button class="btn" data-a="clearDemo">Убрать пример данных</button>' : '') +
    '<button class="btn ' + (UI.cf === 'wipe' ? 'bad' : 'ghost') + '" data-a="wipe">' + cfTxt('wipe', 'Стереть все данные') + '</button></div>';

  /* ---------- профиль ---------- */
  V.profile = () => {
    const p = S.profile;
    if (!p) return '';
    const kv = (k, v) => '<div class="kv"><span class="muted">' + k + '</span><b style="text-align:right">' + esc(v) + '</b></div>';
    const eqs = p.place === 'gym' ? '' : kv('Инвентарь дома', p.equip.map(id => (EQ.find(e => e[0] === id) || [0, id])[1]).join(', '));
    const bmi = p.h && p.w ? p.w / Math.pow(p.h / 100, 2) : 0;
    const rem = S.remind || { days: [], time: '19:00' };
    let cat = '';
    if (bmi && (!p.age || p.age >= 18)) cat = bmi < 18.5 ? 'ниже нормы' : bmi < 25 ? 'в пределах нормы' : bmi < 30 ? 'выше нормы' : 'заметно выше нормы';
    return '<div class="bar2"><button class="icon" data-a="back" aria-label="Назад">' + svg('back') + '</button></div><h1 class="h1 disp">Мой профиль</h1>' +
      kv('Опыт', LV[p.level][0]) + kv('Где занимаюсь', PLACE[p.place][0]) + eqs +
      kv('Пол', SEX[p.sex] || 'Не указан') + (p.age ? kv('Возраст', p.age + ' лет') : '') + (p.h ? kv('Рост', p.h + ' см') : '') + (p.w ? kv('Вес', fmtN(p.w) + ' кг') : '') +
      kv('Цель', GOAL[p.goal][0]) + kv('Тренировок в неделю', String(p.days)) +
      kv('Напоминания', rem.days.length ? daysTxt(rem.days) + ', ' + rem.time : 'не настроены') +
      (bmi ? kv('Индекс массы тела', fmtN(Math.round(bmi * 10) / 10) + (cat ? ', ' + cat : '')) +
        '<p class="note-sm">Индекс массы тела не учитывает мышечную массу, поэтому у тех, кто тренируется, он условный.' + (p.age && p.age < 18 ? ' Для подростков оценка делается по другим таблицам.' : '') + '</p>' : '') +
      (p.age && p.age < 16 ? '<p class="note-sm">До 16 лет силовые тренировки лучше проводить под присмотром тренера или взрослого.</p>' : '') +
      '<div style="height:18px"></div><div class="stack"><button class="btn" data-a="remind">Напоминания</button><button class="btn" data-a="tour">Показать обучение</button><button class="btn pri" data-a="obStart">Изменить анкету</button></div>';
  };

  /* ---------- анкета первого запуска ---------- */
  function newOb(p) {
    const o = { i: 0, level: null, place: null, equip: [], sex: null, age: '', h: '', w: '', goal: null, days: 3 };
    if (p) Object.assign(o, { level: p.level, place: p.place, equip: p.equip.slice(), sex: p.sex, age: p.age ? String(p.age) : '', h: p.h ? String(p.h) : '', w: p.w ? String(p.w) : '', goal: p.goal, days: p.days });
    return o;
  }
  const obSteps = () => UI.ob.place === 'gym' ? ['level', 'place', 'body', 'goal'] : ['level', 'place', 'equip', 'body', 'goal'];
  const opt = (k, v, t, d, on) => '<button class="opt" data-a="obOpt" data-k="' + k + '" data-v="' + v + '" aria-pressed="' + on + '"><b>' + esc(t) + '</b>' +
    (d ? '<span class="muted sm">' + esc(d) + '</span>' : '') + '</button>';
  function obHtml() {
    const o = UI.ob, steps = obSteps(), cur = steps[o.i], n = steps.length;
    let body = '';
    if (cur === 'level') {
      body = '<h1 class="h1 disp">Какой у тебя опыт?</h1><p class="muted">От этого зависят рекомендуемые программы и порядок упражнений.</p><div class="opts">' +
        Object.keys(LV).map(k => opt('level', k, LV[k][0], LV[k][1], o.level === k)).join('') + '</div>';
    } else if (cur === 'place') {
      body = '<h1 class="h1 disp">Где будешь заниматься?</h1><p class="muted">Покажу упражнения, которые подходят месту.</p><div class="opts">' +
        Object.keys(PLACE).map(k => opt('place', k, PLACE[k][0], PLACE[k][1], o.place === k)).join('') + '</div>';
    } else if (cur === 'equip') {
      body = '<h1 class="h1 disp">Что есть дома?</h1><p class="muted">Отметь всё, что у тебя есть. Если инвентаря нет, выбери первый вариант: упражнений с собственным весом тоже хватает.</p><div class="opts">' +
        EQ.map(e => '<button class="opt" data-a="obEq" data-v="' + e[0] + '" aria-pressed="' + (o.equip.indexOf(e[0]) >= 0) + '"><b>' + esc(e[1]) + '</b></button>').join('') + '</div>';
    } else if (cur === 'body') {
      body = '<h1 class="h1 disp">Расскажи о себе</h1><p class="muted">Эти данные остаются на твоём устройстве. Можно пропустить и заполнить позже в профиле.</p>' +
        '<div class="muted sm" style="margin:16px 0 6px">Пол</div>' + chips(Object.keys(SEX).map(k => [k, SEX[k]]), o.sex, 'obSex') +
        '<div class="fields"><label class="lbl">Возраст<input class="in" id="oba" data-in="oba" inputmode="numeric" placeholder="лет" value="' + esc(o.age) + '"></label>' +
        '<label class="lbl">Рост<input class="in" id="obh" data-in="obh" inputmode="numeric" placeholder="см" value="' + esc(o.h) + '"></label>' +
        '<label class="lbl">Вес<input class="in" id="obw" data-in="obw" inputmode="decimal" placeholder="кг" value="' + esc(o.w) + '"></label></div>';
    } else {
      body = '<h1 class="h1 disp">Какая цель?</h1><p class="muted">Подберу ориентиры по повторениям и отдыху.</p><div class="opts">' +
        Object.keys(GOAL).map(k => opt('goal', k, GOAL[k][0], GOAL[k][1], o.goal === k)).join('') + '</div>' +
        '<div class="muted sm" style="margin-bottom:6px">Сколько дней в неделю хочешь тренироваться?</div>' + chips([2, 3, 4, 5, 6].map(d => [String(d), String(d)]), String(o.days), 'obDays') + '<div style="height:12px"></div>';
    }
    return '<div class="obtop">' + (o.i > 0 ? '<button class="icon" data-a="obBack" aria-label="Назад">' + svg('back') + '</button>' : '') +
      '<span class="muted sm grow">Шаг ' + (o.i + 1) + ' из ' + n + '</span>' +
      (S.profile ? '<button class="icon" data-a="obCancel" aria-label="Закрыть анкету">' + svg('close') + '</button>' : '') + '</div>' +
      '<div class="prog"><i style="width:' + Math.round((o.i + 1) / n * 100) + '%"></i></div>' + body +
      '<div class="stack"><button class="btn pri lg full" data-a="obNext">' + (o.i === n - 1 ? 'Готово' : 'Дальше') + '</button>' +
      (cur === 'body' ? '<button class="btn ghost full" data-a="obSkip">Пропустить</button>' : '') + '</div>';
  }
  function obNext() {
    const o = UI.ob, cur = obSteps()[o.i];
    if (cur === 'level' && !o.level) { toast('Выбери свой уровень'); return; }
    if (cur === 'place' && !o.place) { toast('Выбери, где ты занимаешься'); return; }
    if (cur === 'equip' && !o.equip.length) { toast('Отметь инвентарь или вариант «У меня нет инвентаря»'); return; }
    if (cur === 'body') {
      const a = String(o.age).trim(), h = String(o.h).trim(), w = String(o.w).trim();
      if (a && (num(a) < 10 || num(a) > 100)) { toast('Возраст: от 10 до 100 лет'); return; }
      if (h && (num(h) < 100 || num(h) > 230)) { toast('Рост: от 100 до 230 см'); return; }
      if (w && (num(w) < 25 || num(w) > 300)) { toast('Вес: от 25 до 300 кг'); return; }
    }
    if (cur === 'goal') { if (!o.goal) { toast('Выбери цель'); return; } obFinish(); return; }
    o.i++; render(true);
  }
  function obFinish() {
    const o = UI.ob, wt = num(o.w);
    S.profile = { level: o.level, place: o.place, equip: o.place === 'gym' ? [] : o.equip.slice(), sex: o.sex || 'x',
      age: Math.round(num(o.age)) || '', h: Math.round(num(o.h)) || '', w: wt || '', goal: o.goal, days: o.days };
    S.rest = GOAL[o.goal][2];
    if (wt) {
      const last = S.body.slice().sort((a, b) => b.ts - a.ts)[0];
      if (!last || last.w !== wt) S.body.push({ id: uid(), ts: Date.now(), w: wt });
    }
    UI.fit = o.place === 'home';
    UI.plt.bar = S.profile.sex === 'f' ? '15' : '20';
    UI.ob = null; UI.stack = []; UI.view = null; UI.tab = 'today';
    saveNow(); render(true); toast('Профиль сохранён');
    if (!S.tourDone) setTimeout(startTour, 700);
  }

  /* ---------- отрисовка ---------- */
  function renderNav() {
    const items = [['today', 'Сегодня'], ['exercises', 'Упражнения'], ['programs', 'Программы'], ['progress', 'Прогресс'], ['notes', 'Блокнот']];
    navEl.hidden = !!UI.view || !!UI.ob;
    navEl.innerHTML = '<div class="in2">' + items.map(i => '<button data-a="tab" data-v="' + i[0] + '"' + (UI.tab === i[0] ? ' aria-current="page"' : '') + '>' + svg(i[0], 22) + '<span>' + i[1] + '</span></button>').join('') + '</div>';
  }
  function render(top) {
    const y = window.scrollY, v = UI.view;
    app.innerHTML = UI.ob ? obHtml() : (v ? V[v.t](v) : T[UI.tab]());
    renderNav();
    document.body.classList.toggle('nonav', !!v || !!UI.ob);
    dock();
    if (!UI.ob && v && v.t === 'workout' && S.active) lock(); else unlock();
    window.scrollTo(0, top ? 0 : y);
    // выбранный чип не должен прятаться за краем прокручиваемого ряда
    app.querySelectorAll('.chips:not(.wrap) .chip[aria-pressed="true"]').forEach(c => { const r = c.parentElement; r.scrollLeft = c.offsetLeft - (r.clientWidth - c.offsetWidth) / 2; });
  }

  /* ---------- действия ---------- */
  function moveIn(arr, i, delta) {
    if (!arr) return;
    const j = i + delta;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const x = arr.splice(i, 1)[0];
    arr.splice(j, 0, x);
  }
  function openProgEdit(id) {
    const p = id ? progOf(id) : null;
    if (p && !p.custom) { toast('Готовую программу нельзя изменить. Создай свою.'); return; }
    UI.pedit = {
      id: p ? p.id : null,
      n: p ? p.n : '',
      d: p ? (p.d || '') : '',
      days: p && p.days.length ? p.days.map(d => ({ n: d.n, ex: d.ex.map(a => [a[0], String(a[1] || 3), a[2] || '']) })) : [{ n: 'День 1', ex: [] }],
      dirty: false
    };
    UI.stack = []; UI.view = { t: 'progEdit' }; render(true);
  }
  // готовая программа как основа для своей
  function copyProg(p) {
    UI.pedit = {
      id: null,
      n: p.n + ' — моя',
      d: p.d || '',
      days: p.days.map(d => ({ n: d.n, ex: d.ex.map(a => [a[0], String(a[1] || 3), a[2] || '']) })),
      dirty: true
    };
    UI.stack = []; UI.view = { t: 'progEdit' }; render(true);
  }
  function saveProg() {
    const pe = UI.pedit;
    if (!pe) return;
    const name = String(pe.n || '').trim();
    if (!name) { toast('Введи название программы'); return; }
    const days = pe.days.map((d, di) => ({
      n: String(d.n || '').trim() || 'День ' + (di + 1),
      ex: d.ex.map(a => [a[0], String(Math.max(1, Math.min(12, Math.round(num(a[1])) || 3))), String(a[2] || '').trim()])
    })).filter(d => d.ex.length);
    if (!days.length) { toast('Добавь хотя бы одно упражнение'); return; }
    const dropped = pe.days.filter(d => !d.ex.length).length;
    const obj = { id: pe.id || ('u' + uid()), n: name, d: String(pe.d || '').trim() || 'Твой план тренировок.', days, custom: true };
    if (pe.id) S.programs = S.programs.map(p => p.id === pe.id ? obj : p);
    else S.programs.push(obj);
    UI.pedit = null; saveNow();
    UI.stack = []; UI.view = { t: 'prog', id: obj.id }; render(true);
    toast(dropped ? 'Сохранено. Пустые дни не добавлены' : 'Программа сохранена');
  }

  function openWEdit(id) {
    const src = S.workouts.find(x => x.id === id);
    if (!src) return;
    UI.wedit = JSON.parse(JSON.stringify(src));
    UI.wedit.ex.forEach(x => x.sets.forEach(s => {
      s.w = num(s.w) > 0 ? fmtN(num(s.w)) : '';
      s.r = String(num(s.r) || '');
    }));
    UI.weditDirty = false;
    UI.stack = []; UI.view = { t: 'wEdit' }; render(true);
  }
  function scrollToW(id) {
    const el = document.getElementById('w' + id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    window.scrollTo(0, Math.max(0, window.scrollY + r.top - 80));
  }
  function saveWEdit() {
    const w = UI.wedit;
    if (!w) return;
    const ex = w.ex.map(x => ({
      id: x.id,
      sets: x.sets.map(s => ({ w: num(s.w), r: num(s.r) })).filter(s => s.r > 0)
    })).filter(x => x.sets.length);
    if (!ex.length) { toast('Оставь хотя бы один подход с повторами'); return; }
    const orig = S.workouts.find(x => x.id === w.id);
    if (!orig) { toast('Тренировка не найдена'); return; }
    orig.ts = w.ts || orig.ts;
    orig.dur = Math.max(0, Math.round(num(w.dur)));
    orig.note = String(w.note || '');
    orig.ex = ex;
    delete orig.demo;
    saveNow();
    UI.wedit = null; UI.weditDirty = false;
    UI.stack = []; UI.view = null; UI.tab = 'progress'; UI.sub = 'hist'; UI.open = orig.id;
    render(true); toast('Тренировка обновлена');
    setTimeout(() => scrollToW(orig.id), 80);
  }

  function act(a, d) {
    switch (a) {
      case 'tab': setTab(d.v); break;
      case 'fit': UI.fit = !UI.fit; render(); break;
      case 'profile': go({ t: 'profile' }); break;
      case 'obStart': UI.ob = newOb(S.profile); render(true); break;
      case 'obCancel': UI.ob = null; render(true); break;
      case 'obBack': if (UI.ob.i > 0) { UI.ob.i--; render(true); } break;
      case 'obNext': obNext(); break;
      case 'obSkip': UI.ob.sex = null; UI.ob.age = ''; UI.ob.h = ''; UI.ob.w = ''; UI.ob.i++; render(true); break;
      case 'obOpt': UI.ob[d.k] = d.v; render(); break;
      case 'obSex': UI.ob.sex = d.v; render(); break;
      case 'obDays': UI.ob.days = +d.v; render(); break;
      case 'obEq': {
        const q = UI.ob.equip, k = d.v, at = q.indexOf(k);
        if (k === 'none') UI.ob.equip = at >= 0 ? [] : ['none'];
        else { if (at >= 0) q.splice(at, 1); else q.push(k); const z = q.indexOf('none'); if (z >= 0) q.splice(z, 1); }
        render(); break;
      }
      case 'back': back(); break;
      case 'tour': startTour(); break;
      case 'tourNext': if (UI.tour) { if (UI.tour.i >= TOUR.length - 1) endTour(); else { UI.tour.i++; tourShow(); } } break;
      case 'tourBack': if (UI.tour && UI.tour.i > 0) { UI.tour.i--; tourShow(); } break;
      case 'tourSkip': endTour(); break;
      case 'how': go({ t: 'how', id: d.id }); break;
      case 'ex': go({ t: 'ex', id: d.id }); break;
      case 'prog': go({ t: 'prog', id: d.id }); break;
      case 'g': UI.g = d.v; UI.sg = 'all'; render(); break;
      case 'sg': UI.sg = d.v; render(); break;
      case 'pg': UI.pg = d.v; UI.psg = 'all'; render(); break;
      case 'psg': UI.psg = d.v; render(); break;
      case 'sub': UI.sub = d.v; render(true); break;
      case 'ntagf': UI.noteTag = d.v; render(); break;

      // тренировка: собрать план, начать отдельно
      case 'start': openPlanner(); break;
      case 'startNow': startWorkout(); break;
      case 'resume': UI.stack = []; UI.view = { t: 'workout' }; render(true); break;
      case 'startDay': {
        const p = progOf(d.id);
        if (!p) break;
        if (S.active) { toast('Сначала заверши текущую тренировку'); UI.stack = []; UI.view = { t: 'workout' }; render(true); break; }
        if (S.draft && S.draft.ex.length && !conf('repl' + d.id + d.d)) { toast('Ещё раз — и текущий план заменится днём программы'); break; }
        planList(p.days[+d.d].ex); break;
      }
      case 'repeat': {
        const w = S.workouts.find(x => x.id === d.id);
        if (!w) break;
        if (S.active) { toast('Сначала заверши текущую тренировку'); break; }
        if (S.draft && S.draft.ex.length && !conf('replw' + d.id)) { toast('Ещё раз — и текущий план заменится этой тренировкой'); break; }
        planList(w.ex.map(x => [x.id, x.sets.length, ''])); break;
      }
      case 'addw': if (addEx(d.id)) { toast(S.active ? 'Добавлено в тренировку' : 'Добавлено в план'); render(); } break;
      case 'pickOpen': UI.pq = ''; UI.pg = 'all'; UI.psg = 'all'; go({ t: 'pick', mode: (UI.view && UI.view.mode) || '' }); break;
      case 'pick': {
        if (UI.view && UI.view.mode === 'pedit') {
          const pe = UI.pedit, di = UI.peditDay;
          if (!pe || !pe.days[di]) break;
          if (pe.days[di].ex.some(a => a[0] === d.id)) { toast('В этом дне уже есть это упражнение'); break; }
          pe.days[di].ex.push([d.id, '3', '10–12']);
          pe.dirty = true;
          back(); break;
        }
        if (UI.view && UI.view.mode === 'wedit') {
          const w = UI.wedit;
          if (!w) break;
          if (w.ex.some(x => x.id === d.id)) { toast('Это упражнение уже в тренировке'); break; }
          w.ex.push({ id: d.id, sets: [{ w: '', r: '' }, { w: '', r: '' }, { w: '', r: '' }] });
          UI.weditDirty = true;
          back(); break;
        }
        if (addEx(d.id)) back();
        break;
      }
      case 'planUp': if (S.draft) { moveIn(S.draft.ex, +d.i, -1); save(); render(); } break;
      case 'planDown': if (S.draft) { moveIn(S.draft.ex, +d.i, 1); save(); render(); } break;
      case 'planDel': if (S.draft) { S.draft.ex.splice(+d.i, 1); saveNow(); render(); } break;
      case 'planPlus': if (S.draft && S.draft.ex[+d.i]) { S.draft.ex[+d.i].n = clampSets(clampSets(S.draft.ex[+d.i].n) + 1); save(); render(); } break;
      case 'planMinus': if (S.draft && S.draft.ex[+d.i]) { S.draft.ex[+d.i].n = clampSets(clampSets(S.draft.ex[+d.i].n) - 1); save(); render(); } break;
      case 'clearPlan': if (conf('clearplan')) { clearDraft(); toast('План очищен'); } break;

      // начатая тренировка
      case 'setadd': S.active.ex[+d.i].sets.push({ w: '', r: '', done: false }); save(); render(); break;
      case 'exdel': if (conf('ed' + d.i)) { S.active.ex.splice(+d.i, 1); save(); render(); } break;
      case 'chk': checkSet(+d.i, +d.j); break;
      case 'fill': fillHint(+d.i); break;
      case 'rest': S.rest = +d.v; save(); render(); break;
      case 'rplus': if (S.restUntil) { S.restUntil += 15000; S.restTotal += 15; S.restBeeped = false; saveNow(); } dock(); break;
      case 'rminus': if (S.restUntil) { S.restUntil -= 15000; S.restTotal = Math.max(1, S.restTotal - 15); } saveNow(); dock(); break;
      case 'rskip': stopRest(); dock(); break;
      case 'finish': finish(); break;
      case 'cancelW': if (conf('cancel')) { S.active = null; stopRest(); saveNow(); UI.stack = []; UI.view = null; render(true); } break;
      case 'tplOpen': UI.tpl = true; render(); break;
      case 'tplSave': {
        const el = document.getElementById('tplname'), name = el ? el.value.trim() : '';
        if (!name) { toast('Введи название программы'); break; }
        S.programs.push({ id: 'u' + uid(), n: name, d: 'Сохранено из тренировки.', days: [{ n: 'Тренировка', ex: S.active.ex.map(x => [x.id, x.sets.length, x.tr || '']) }], custom: true });
        UI.tpl = false; saveNow(); toast('Программа сохранена во вкладке «Программы»'); render(); break;
      }
      case 'doneSum': UI.stack = []; UI.view = null; UI.tab = 'progress'; UI.sub = 'records'; render(true); break;

      // свои упражнения
      case 'exNew': UI.exf = { id: null, n: '', g: 'chest', eq: '', m: 'w', u: '', mu: '', t: '', dirty: false }; go({ t: 'exEdit' }); break;
      case 'exEdit': {
        const e = exById(d.id);
        if (!isCustom(e)) break;
        UI.exf = { id: e.id, n: e.n, g: e.g, eq: e.eq || '', m: e.m || 'w', u: e.u || '', mu: e.mu || '', t: e.t || '', dirty: false };
        go({ t: 'exEdit' }); break;
      }
      case 'exBack': {
        const f = UI.exf;
        if (f && f.dirty && !conf('exdiscard')) { toast('Есть несохранённые данные. Нажми ещё раз, чтобы выйти'); break; }
        UI.exf = null; back(); break;
      }
      case 'exfg': if (UI.exf) { UI.exf.g = d.v; UI.exf.dirty = true; render(); } break;
      case 'exfm': if (UI.exf) { UI.exf.m = d.v === 's' ? 'r' : d.v; UI.exf.u = d.v === 's' ? 'сек' : ''; UI.exf.dirty = true; render(); } break;
      case 'exSave': {
        const f = UI.exf;
        if (!f) break;
        const name = String(f.n || '').trim();
        if (name.length < 2) { toast('Введи название упражнения'); break; }
        const data = {
          n: name, g: f.g, eq: String(f.eq || '').trim() || 'Свой вес', lv: 1, m: f.m,
          u: f.m === 'r' && f.u === 'сек' ? 'сек' : '', mu: String(f.mu || '').trim(), s: [], e: [], t: String(f.t || '').trim(), custom: true, need: [[]]
        };
        if (f.id) {
          const ex = allCustom().find(x => x.id === f.id);
          if (ex) Object.assign(ex, data);
        } else {
          S.custom.push(Object.assign({ id: 'u' + uid() }, data));
        }
        UI.exf = null; saveNow();
        back(); toast('Упражнение сохранено');
        break;
      }
      case 'exCustomDel': {
        if (!conf('exd' + d.id)) break;
        const ex = allCustom().find(x => x.id === d.id);
        if (!ex) break;
        const inWork = S.workouts.some(w => w.ex.some(x => x.id === d.id));
        const inProg = (S.programs || []).some(p => p.days.some(day => day.ex.some(a => a[0] === d.id)));
        const inPlan = (S.draft && S.draft.ex.some(x => x.id === d.id)) || (S.active && S.active.ex.some(x => x.id === d.id));
        if (inWork || inProg || inPlan) { ex.hidden = true; toast('Убрано из каталога, история и программы сохранены'); }
        else { S.custom = allCustom().filter(x => x.id !== d.id); toast('Упражнение удалено'); }
        saveNow(); UI.stack = []; UI.view = null; UI.tab = 'exercises'; render(true); break;
      }
      case 'exUnhide': {
        const ex = allCustom().find(x => x.id === d.id);
        if (ex) { ex.hidden = false; saveNow(); toast('Упражнение снова в каталоге'); render(); }
        break;
      }

      // свои программы
      case 'progNew': openProgEdit(null); break;
      case 'progEdit': openProgEdit(d.id); break;
      case 'progCopy': { const p = progOf(d.id); if (p) copyProg(p); break; }
      case 'progBack': {
        if (UI.pedit && UI.pedit.dirty && !conf('pdiscard')) { toast('Есть несохранённые изменения. Нажми ещё раз, чтобы выйти'); break; }
        UI.pedit = null; back(); break;
      }
      case 'progSave': saveProg(); break;
      case 'progDel': if (conf('pd' + d.id)) { S.programs = (S.programs || []).filter(p => p.id !== d.id); saveNow(); UI.stack = []; UI.view = null; UI.tab = 'programs'; render(true); toast('Программа удалена'); } break;
      case 'bAddDay': if (UI.pedit) { UI.pedit.days.push({ n: 'День ' + (UI.pedit.days.length + 1), ex: [] }); UI.pedit.dirty = true; render(); } break;
      case 'bDayDel': {
        if (!UI.pedit) break;
        if (!conf('bday' + d.d)) { toast('Ещё раз — удалить день'); break; }
        UI.pedit.days.splice(+d.d, 1); UI.pedit.dirty = true; render(); break;
      }
      case 'bAddEx': UI.peditDay = +d.d; UI.pq = ''; UI.pg = 'all'; UI.psg = 'all'; go({ t: 'pick', mode: 'pedit' }); break;
      case 'bExDel': if (UI.pedit) { UI.pedit.days[+d.d].ex.splice(+d.e, 1); UI.pedit.dirty = true; render(); } break;
      case 'bUp': if (UI.pedit) { moveIn(UI.pedit.days[+d.d].ex, +d.e, -1); UI.pedit.dirty = true; render(); } break;
      case 'bDown': if (UI.pedit) { moveIn(UI.pedit.days[+d.d].ex, +d.e, 1); UI.pedit.dirty = true; render(); } break;

      // прогресс
      case 'bwAdd': {
        const el = document.getElementById('bwv'), w = num(el && el.value);
        if (w < 20 || w > 400) { toast('Введи вес в килограммах, например 78,5'); break; }
        S.body.push({ id: uid(), ts: Date.now(), w }); save(); render(); break;
      }
      case 'bwDel': if (conf('bw' + d.id)) { S.body = S.body.filter(b => b.id !== d.id); save(); render(); } break;
      case 'wopen': UI.open = UI.open === d.id ? null : d.id; break;
      case 'wDel': if (conf('w' + d.id)) { S.workouts = S.workouts.filter(w => w.id !== d.id); save(); render(); } break;
      case 'wEdit': openWEdit(d.id); break;
      case 'wEditBack': {
        if (UI.weditDirty && !conf('wediscard')) { toast('Есть несохранённые изменения. Нажми ещё раз, чтобы выйти'); break; }
        UI.wedit = null; UI.weditDirty = false;
        UI.stack = []; UI.view = null; UI.tab = 'progress'; UI.sub = 'hist'; render(true);
        break;
      }
      case 'wEditSave': saveWEdit(); break;
      case 'wSetAdd': if (UI.wedit) { UI.wedit.ex[+d.i].sets.push({ w: '', r: '' }); UI.weditDirty = true; render(); } break;
      case 'wSetDel': if (UI.wedit) { UI.wedit.ex[+d.i].sets.splice(+d.j, 1); UI.weditDirty = true; render(); } break;
      case 'wExDel': {
        if (!UI.wedit) break;
        if (!conf('wex' + d.i)) { toast('Ещё раз — убрать упражнение'); break; }
        UI.wedit.ex.splice(+d.i, 1); UI.weditDirty = true; render(); break;
      }
      case 'wAddEx': UI.pq = ''; UI.pg = 'all'; UI.psg = 'all'; go({ t: 'pick', mode: 'wedit' }); break;

      // календарь
      case 'calPrev': if (UI.cal) { const x = new Date(UI.cal.y, UI.cal.m - 1, 1); UI.cal = { y: x.getFullYear(), m: x.getMonth(), sel: null }; render(); } break;
      case 'calNext': if (UI.cal) { const x = new Date(UI.cal.y, UI.cal.m + 1, 1); UI.cal = { y: x.getFullYear(), m: x.getMonth(), sel: null }; render(); } break;
      case 'calToday': { const x = new Date(); UI.cal = { y: x.getFullYear(), m: x.getMonth(), sel: dayStart(x.getTime()) }; render(); break; }
      case 'calDay': if (UI.cal) { UI.cal.sel = +d.t; render(); } break;
      case 'calOpen': {
        const w = S.workouts.find(x => x.id === d.id);
        if (!w) break;
        UI.tab = 'progress'; UI.sub = 'hist'; UI.open = w.id; UI.view = null; UI.stack = [];
        render(true);
        setTimeout(() => scrollToW(w.id), 80);
        break;
      }

      // напоминания
      case 'remind': go({ t: 'remind' }); break;
      case 'remDay': {
        const r = S.remind, v = +d.v, at = r.days.indexOf(v);
        if (at >= 0) r.days.splice(at, 1); else r.days.push(v);
        save(); render(); break;
      }
      case 'remOff': if (conf('remoff')) { S.remind.days = []; saveNow(); render(); toast('Напоминания выключены'); } break;
      case 'remIcs': {
        if (!S.remind.days.length) { toast('Выбери хотя бы один день'); break; }
        try {
          const ics = makeIcs();
          if (!ics) { toast('Не получилось собрать событие'); break; }
          const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
          const a = document.createElement('a');
          a.href = url; a.download = 'podhod-napominanie.ics';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          toast('Файл сохранён. Открой его и добавь событие в календарь');
        } catch (e) { toast('Не удалось скачать файл. Попробуй ещё раз.'); }
        break;
      }

      // блокнот
      case 'noteNew': {
        const n = { id: uid(), title: '', text: '', tag: TAGS[0], ts: Date.now(), up: Date.now() };
        S.notes.push(n); save(); go({ t: 'note', id: n.id }); break;
      }
      case 'noteOpen': go({ t: 'note', id: d.id }); break;
      case 'ntag': { const n = S.notes.find(x => x.id === UI.view.id); if (n) { n.tag = d.v; n.up = Date.now(); save(); render(); } break; }
      case 'noteDel': if (conf('n' + d.id)) { S.notes = S.notes.filter(n => n.id !== d.id); save(); back(); } break;

      // инструменты
      case 'calc': go({ t: 'calc' }); break;
      case 'plates': go({ t: 'plates' }); break;
      case 'backup': go({ t: 'backup' }); break;
      case 'demo': loadDemo(); render(); break;
      case 'clearDemo': S.workouts = S.workouts.filter(w => !w.demo); S.body = S.body.filter(b => !b.demo); save(); toast('Пример данных убран'); render(); break;
      case 'wipe': if (conf('wipe')) { S = blank(); UI.pedit = null; UI.exf = null; UI.impText = ''; UI.ob = newOb(null); saveNow(); UI.stack = []; UI.view = null; UI.tab = 'today'; render(true); toast('Все данные стёрты'); } break;
      case 'dlBk': {
        try {
          const d0 = new Date();
          const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'podhod-' + d0.getFullYear() + '-' + pad(d0.getMonth() + 1) + '-' + pad(d0.getDate()) + '.json';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          toast('Файл копии сохранён');
        } catch (e) { toast('Не удалось сохранить файл. Скопируй текст вручную.'); }
        break;
      }
      case 'copyBk': {
        const ta = document.getElementById('bk'); if (!ta) break;
        const fallback = () => { ta.focus(); ta.select(); toast('Текст выделен: скопируй его вручную'); };
        try { navigator.clipboard.writeText(ta.value).then(() => toast('Копия скопирована'), fallback); } catch (e) { fallback(); }
        break;
      }
      case 'impBk': {
        const el = document.getElementById('impt');
        const txt = ((el && el.value) || UI.impText || '').trim();
        if (!txt) { toast('Сначала вставь копию или выбери файл'); break; }
        if (!conf('imp')) break;
        try {
          const o = JSON.parse(txt);
          if (!o || !Array.isArray(o.workouts)) throw new Error('bad');
          S = Object.assign(blank(), o);
          S.custom = Array.isArray(S.custom) ? S.custom : [];
          S.programs = Array.isArray(S.programs) ? S.programs : [];
          S.remind = normRemind(S.remind);
          if (Array.isArray(S.templates) && S.templates.length) {
            S.programs = S.programs.concat(S.templates.map(t => ({ id: t.id, n: t.name, d: 'Твой план из прошлой тренировки.', days: [{ n: 'Тренировка', ex: t.ex }], custom: true })));
          }
          delete S.templates;
          S.draft = (S.draft && Array.isArray(S.draft.ex)) ? S.draft : null;
          S.restUntil = 0; S.restTotal = 0; S.restBeeped = true;
          ['workouts', 'notes', 'body'].forEach(k => { if (!Array.isArray(S[k])) S[k] = []; });
          saveNow(); UI.impText = ''; UI.stack = []; UI.view = null; UI.tab = 'today';
          UI.ob = S.profile ? null : newOb(null);
          render(true); toast('Данные восстановлены');
        } catch (e) { toast('Не получилось прочитать копию. Проверь, что вставлен весь текст.'); }
        break;
      }
    }
  }

  /* ---------- обучение ---------- */
  const TOUR = [
    { h: 'Добро пожаловать в «Подход»', p: 'Короткий тур покажет, где что находится. Это займёт меньше минуты.' },
    { tab: 'today', sel: '#nav [data-v="today"]', h: 'Сегодня', p: 'Главный экран. Нажми «Собрать тренировку», выбери упражнения и записывай подходы: вес, повторы и отдых между ними.' },
    { tab: 'exercises', sel: '#nav [data-v="exercises"]', h: 'Упражнения', p: 'Каталог с фильтрами. Открой упражнение и нажми «Как выполнять»: там шаги, частые ошибки и совет.' },
    { tab: 'programs', sel: '#nav [data-v="programs"]', h: 'Программы', p: 'Готовые планы на несколько дней. Возьми любой за основу и измени под себя или создай свой.' },
    { tab: 'progress', sel: '#nav [data-v="progress"]', h: 'Прогресс', p: 'История тренировок, рекорды и вес тела. Здесь видно, как растут твои результаты.' },
    { tab: 'notes', sel: '#nav [data-v="notes"]', h: 'Блокнот', p: 'Записывай самочувствие, замечания по технике и планы на следующую тренировку.' },
    { tab: 'today', sel: '[data-a="profile"]', h: 'Профиль', p: 'Здесь анкета, напоминания о тренировках и кнопка «Показать обучение», если захочешь пройти тур ещё раз.' }
  ];
  function tourLayout() {
    const el = document.getElementById('tour');
    if (!el || !UI.tour) return;
    const s = TOUR[UI.tour.i], t = s.sel ? document.querySelector(s.sel) : null, spot = el.querySelector('.tspot'), card = el.querySelector('.tcard');
    const vh = window.innerHeight;
    el.classList.toggle('has', !!t);
    card.style.top = card.style.bottom = '';
    if (t) {
      const r = t.getBoundingClientRect(), pad = 6;
      spot.hidden = false;
      spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px';
      spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
      if (r.top > vh / 2) card.style.bottom = (vh - r.top + 16) + 'px'; else card.style.top = (r.bottom + 16) + 'px';
    } else {
      spot.hidden = true;
      card.style.top = Math.max(24, (vh - card.offsetHeight) / 2) + 'px';
    }
  }
  function tourShow() {
    const s = TOUR[UI.tour.i];
    if (s.tab) { UI.view = null; UI.stack = []; UI.ob = null; UI.tab = s.tab; render(true); }
    let el = document.getElementById('tour');
    if (!el) { el = document.createElement('div'); el.id = 'tour'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el); }
    const last = UI.tour.i === TOUR.length - 1;
    el.innerHTML = '<div class="tspot" hidden></div><div class="tcard"><h3>' + esc(s.h) + '</h3><p>' + esc(s.p) + '</p><div class="tfoot"><div class="dots">' +
      TOUR.map((x, i) => '<i' + (i === UI.tour.i ? ' class="on"' : '') + '></i>').join('') + '</div>' +
      (last ? '' : '<button class="tskip" data-a="tourSkip">Пропустить</button>') +
      (UI.tour.i > 0 ? '<button class="btn" data-a="tourBack">Назад</button>' : '') +
      '<button class="btn pri" data-a="tourNext">' + (last ? 'Готово' : UI.tour.i === 0 ? 'Начать' : 'Дальше') + '</button></div></div>';
    tourLayout();
    const nb = el.querySelector('[data-a="tourNext"]'); if (nb) nb.focus({ preventScroll: true });
  }
  function startTour() {
    if (UI.ob || UI.tour) return;
    UI.tour = { i: 0 };
    tourShow();
  }
  function endTour() {
    UI.tour = null;
    const el = document.getElementById('tour'); if (el) el.remove();
    if (!S.tourDone) { S.tourDone = true; saveNow(); }
    UI.view = null; UI.stack = []; UI.tab = 'today'; render(true);
  }
  window.addEventListener('resize', tourLayout);
  document.addEventListener('keydown', e => { if (UI.tour && e.key === 'Escape') endTour(); });

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    if (el.tagName === 'SUMMARY') { act(el.dataset.a, el.dataset); return; }
    act(el.dataset.a, el.dataset);
  });

  // ввод: обновляем данные без перерисовки, чтобы не терять фокус
  document.addEventListener('input', e => {
    const t = e.target, k = t.dataset && t.dataset.in;
    if (!k) return;
    const i = +t.dataset.i, j = +t.dataset.j;
    switch (k) {
      case 'w': S.active.ex[i].sets[j].w = t.value; save(); break;
      case 'r': S.active.ex[i].sets[j].r = t.value; save(); break;
      case 'wnote': S.active.note = t.value; save(); break;
      case 'q': UI.q = t.value; document.getElementById('exlist').innerHTML = listHtml(UI.q, UI.g, 'ex'); break;
      case 'pq': UI.pq = t.value; document.getElementById('pklist').innerHTML = listHtml(UI.pq, UI.pg, 'pick'); break;
      case 'nq': UI.nq = t.value; document.getElementById('nlist').innerHTML = notesHtml(); break;
      case 'ntitle': case 'ntext': {
        const n = S.notes.find(x => x.id === UI.view.id);
        if (n) { if (k === 'ntitle') n.title = t.value; else n.text = t.value; n.up = Date.now(); save(); }
        break;
      }
      case 'oba': UI.ob.age = t.value; break;
      case 'obh': UI.ob.h = t.value; break;
      case 'obw': UI.ob.w = t.value; break;
      case 'ptr': { const x = S.draft && S.draft.ex[+t.dataset.i]; if (x) { x.tr = t.value; save(); } break; }
      case 'pn': if (UI.pedit) { UI.pedit.n = t.value; UI.pedit.dirty = true; } break;
      case 'pdesc': if (UI.pedit) { UI.pedit.d = t.value; UI.pedit.dirty = true; } break;
      case 'pdn': if (UI.pedit && UI.pedit.days[+t.dataset.d]) { UI.pedit.days[+t.dataset.d].n = t.value; UI.pedit.dirty = true; } break;
      case 'pset': if (UI.pedit && UI.pedit.days[+t.dataset.d]) { UI.pedit.days[+t.dataset.d].ex[+t.dataset.e][1] = t.value; UI.pedit.dirty = true; } break;
      case 'ptrb': if (UI.pedit && UI.pedit.days[+t.dataset.d]) { UI.pedit.days[+t.dataset.d].ex[+t.dataset.e][2] = t.value; UI.pedit.dirty = true; } break;
      case 'exn': if (UI.exf) { UI.exf.n = t.value; UI.exf.dirty = true; } break;
      case 'exeq': if (UI.exf) { UI.exf.eq = t.value; UI.exf.dirty = true; } break;
      case 'exmu': if (UI.exf) { UI.exf.mu = t.value; UI.exf.dirty = true; } break;
      case 'ext': if (UI.exf) { UI.exf.t = t.value; UI.exf.dirty = true; } break;
      case 'wed': {
        const x = UI.wedit && UI.wedit.ex[+t.dataset.i];
        if (x) { x.sets[+t.dataset.j][t.dataset.f] = t.value; UI.weditDirty = true; }
        break;
      }
      case 'wdate': {
        const dd = new Date(t.value);
        if (UI.wedit && !isNaN(dd.getTime())) { UI.wedit.ts = dd.getTime(); UI.weditDirty = true; }
        break;
      }
      case 'wdur': if (UI.wedit) { UI.wedit.dur = Math.max(0, Math.round(num(t.value) * 60)); UI.weditDirty = true; } break;
      case 'wnote2': if (UI.wedit) { UI.wedit.note = t.value; UI.weditDirty = true; } break;
      case 'remTime': if (S.remind && /^\d{2}:\d{2}$/.test(t.value)) { S.remind.time = t.value; save(); } break;
      case 'impt': UI.impText = t.value; break;
      case 'cw': UI.calc.w = t.value; document.getElementById('calcOut').innerHTML = calcOut(); break;
      case 'cr': UI.calc.r = t.value; document.getElementById('calcOut').innerHTML = calcOut(); break;
      case 'pt': UI.plt.t = t.value; document.getElementById('plOut').innerHTML = plOut(); break;
    }
  });
  document.addEventListener('change', e => {
    const t = e.target, k = t.dataset && t.dataset.in;
    if (t.id === 'bkfile' && t.files && t.files[0]) {
      const f = t.files[0], r = new FileReader();
      r.onload = () => {
        const txt = String(r.result || '');
        try {
          const o = JSON.parse(txt);
          if (!o || !Array.isArray(o.workouts)) throw new Error('bad');
          UI.impText = txt; render(true);
          toast('Файл прочитан. Нажми «Восстановить из копии»');
        } catch (err) { toast('Это не файл копии «Подхода»'); }
      };
      r.onerror = () => toast('Не удалось прочитать файл');
      r.readAsText(f);
      t.value = '';
      return;
    }
    if (k === 'exsel') { UI.exSel = t.value; render(); }
    if (k === 'pb') { UI.plt.bar = t.value; document.getElementById('plOut').innerHTML = plOut(); }
    if (k === 'remTime' && /^\d{2}:\d{2}$/.test(t.value)) { S.remind.time = t.value; save(); }
    if (k === 'wdate') {
      const dd = new Date(t.value);
      if (UI.wedit && !isNaN(dd.getTime())) { UI.wedit.ts = dd.getTime(); UI.weditDirty = true; }
    }
  });

  // при первом запуске открываем анкету
  if (!S.profile) UI.ob = newOb(null);
  else { UI.fit = S.profile.place === 'home'; if (S.profile.sex === 'f') UI.plt.bar = '15'; }
  render(true);
  if (S.profile && !S.tourDone) setTimeout(startTour, 600);
})();
