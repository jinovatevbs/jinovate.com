/* Jinovate OS – PIN app (www.jinovate.com/ops). Backend: Apps Script doPost (same sheets as before). */
'use strict';
var API_URL = '__API_URL__';
var LS = { tok: 'jos_tok', email: 'jos_email', boot: 'jos_boot', ib: 'jos_ib_no' };

/* ---------------- state ---------------- */
var TOKEN = null, D = null, V = { tab: 'aaj', scr: null, id: null, cid: null, showLater: false, all: { q: '', st: 'open', who: '' }, cq: '' };
var NEW = null, SHEET = null, MENU = false, BUSY = {}, DPROMPT = null;

function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
function $(s) { return document.querySelector(s); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function toast(m, bad) { var t = $('#toast'); t.textContent = m; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(t._h); t._h = setTimeout(function () { t.hidden = true; }, bad ? 4200 : 2600); }
function buzz(n) { try { if (navigator.vibrate) navigator.vibrate(n || 15); } catch (e) {} }

/* ---------------- API ---------------- */
function api(fn, args) {
  return fetch(API_URL, { method: 'POST', body: JSON.stringify({ fn: fn, args: args || {}, token: TOKEN }), redirect: 'follow' })
    .then(function (r) { return r.json(); }, function () { throw new Error('Internet nahi chal raha – net check karke dobara try karo'); })
    .then(function (j) {
      if (j && j.ok) return j.data;
      var m = (j && j.error) || 'Kuch gadbad hui';
      if (m === 'LOGIN') { logout(true); throw new Error('Dobara login karo'); }
      throw new Error(m);
    });
}

/* ---------------- dates ---------------- */
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var DAY = ['Ravi', 'Som', 'Mangal', 'Budh', 'Guru', 'Shukra', 'Shani'];
function todayStr() { return D && D.today ? D.today : ymd(new Date()); }
function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function addDays(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
function diff(a, b) { return Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 864e5); }
function nice(s) { if (!s) return ''; var p = s.substring(0, 10).split('-'); return +p[2] + ' ' + MON[+p[1] - 1] + (p[0] !== todayStr().substring(0, 4) ? ' ' + p[0].slice(2) : ''); }
function dueTxt(t) {
  if (!t.due) return { c: '', s: 'Due date nahi' };
  if (!isOpen(t)) return { c: '', s: nice(t.due) };
  var d = diff(t.due, todayStr());
  if (d < 0) return { c: 'late', s: (-d) + ' din late' };
  if (d === 0) return { c: 'today', s: 'Aaj' };
  if (d === 1) return { c: 'soon', s: 'Kal' };
  if (d <= 7) return { c: 'soon', s: d + ' din mein' };
  return { c: '', s: nice(t.due) };
}

/* ---------------- helpers ---------------- */
function isOpen(t) { return t.status !== 'Done' && t.status !== 'Cancelled'; }
function isAdmin() { return D && D.me.role === 'ADMIN'; }
function me() { return D.me.name; }
function tk(id) { for (var i = 0; i < D.tickets.length; i++) if (D.tickets[i].id === id) return D.tickets[i]; return null; }
function client(id) { for (var i = 0; i < D.clients.length; i++) if (D.clients[i].id === id) return D.clients[i]; return null; }
var AVC = ['#0D2A5E', '#5B3FD0', '#12804A', '#C2410C', '#1E5BD8', '#8A6400', '#BE185D', '#0E7490'];
function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function initials(n) {
  var w = String(n || '?').replace(/\(.*?\)/g, ' ').replace(/\b(pvt|ltd|llp|private|limited|the|m\/s|and)\b\.?/gi, ' ').replace(/[^A-Za-z0-9ऀ-ॿ ]/g, ' ').trim().split(/\s+/);
  return ((w[0] || '?')[0] + ((w[1] || '')[0] || '')).toUpperCase();
}
function avatar(name) { return '<span class="av" style="background:' + AVC[hash(name) % AVC.length] + '" aria-hidden="true">' + esc(initials(name)) + '</span>'; }
function shortClient(n) { return String(n || '').replace(/\s+(Pvt\.?\s*Ltd\.?|Private Limited|LLP)$/i, ''); }
function saveBoot() { if (D) ls(LS.boot, JSON.stringify(D)); }
function upsert(t) { if (!t) return; for (var i = 0; i < D.tickets.length; i++) if (D.tickets[i].id === t.id) { D.tickets[i] = t; saveBoot(); return; } D.tickets.push(t); saveBoot(); }
function guessCat(s) {
  var r = [[/gstr|\bgst\b|\bitc\b|rfd|drc|e-?way|e-?inv|iff|cmp-?08/i, 'GST'], [/\btds\b|24q|26q|27q|\btcs\b|form ?16/i, 'TDS'],
    [/\bitr\b|income tax|advance tax|26as|\bais\b|sch ?fa|80[cdg]|refund.*it\b/i, 'Income Tax'], [/\broc\b|\bmca\b|aoc|mgt|dir-?3|dir-?12|adt-?1|inc-?20|form ?8|form ?11|spice|msme-?1|dpt-?3/i, 'ROC'],
    [/\bpf\b|\besi|ecr|\buan\b/i, 'PF/ESI'], [/salary|payroll|offer letter|appointment/i, 'Payroll'], [/tally|ledger|books|accounts|reco\b|reconcil/i, 'Accounting'],
    [/invoice|\binv\b|billing/i, 'Invoicing'], [/fema|fc-?gpr|fc-?trs|odi|\bfdi\b/i, 'FEMA']];
  for (var i = 0; i < r.length; i++) if (r[i][0].test(s) && D.categories.indexOf(r[i][1]) !== -1) return r[i][1];
  return '';
}

/* ---------------- svg icons ---------------- */
var IC = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', back: '<path d="M15 5l-7 7 7 7"/>', refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>',
  home: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>', list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', users: '<path d="M4 20v-1a5 5 0 0 1 10 0v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 4a4 4 0 0 1 0 8M20 20v-1a5 5 0 0 0-3-4.6"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h3"/>', rupee: '<path d="M7 4h11M7 9h11M14 4c3 0 3 10-7 10l8 7"/>'
};
function svg(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[n] + '</svg>'; }

/* ================= RENDER ================= */
function render() {
  var a = $('#app');
  if (!TOKEN || !D) { a.innerHTML = loginHtml(); return; }
  var h = '';
  if (V.scr === 'ticket') h = ticketScreen();
  else if (V.scr === 'client') h = clientScreen();
  else if (V.tab === 'add') h = addScreen();
  else if (V.tab === 'all') h = allScreen();
  else if (V.tab === 'clients') h = clientsScreen();
  else if (V.tab === 'eod') h = eodScreen();
  else if (V.tab === 'score') h = scoreScreen();
  else if (V.tab === 'rec') h = recScreen();
  else if (V.tab === 'bill' && isAdmin()) h = billScreen();
  else h = todayScreen();
  if (!V.scr) h += navHtml();
  if (MENU) h += menuHtml();
  if (SHEET) h += '<div class="sheet" data-a="sheetbg"><div class="sp" role="dialog" aria-modal="true"><div class="grab"></div>' + SHEET.html() + '</div></div>';
  var y = window.scrollY; a.innerHTML = h;
  if (render.keep) window.scrollTo(0, y); render.keep = false;
  if (SHEET && SHEET.focus) { var f = document.getElementById(SHEET.focus); if (f) f.focus(); SHEET.focus = null; }
}
function rerender() { render.keep = true; render(); }

function header(title, sub, back) {
  return '<header class="hdr">' +
    (back ? '<button class="ib" data-a="back" aria-label="Peeche">' + svg('back') + '</button>'
          : '<button class="ib" data-a="menu" aria-label="Menu">' + svg('menu') + '</button><img class="hlogo" src="icon-192.png" alt="">') +
    '<div class="tt"><h1>' + esc(title) + '</h1>' + (sub ? '<p class="sub">' + esc(sub) + '</p>' : '') + '</div>' +
    '<button class="ib" data-a="refresh" aria-label="Refresh">' + svg('refresh') + '</button></header>' +
    (navigator.onLine ? '' : '<div class="net">📵 Net nahi hai – net aate hi refresh karo</div>');
}

function navHtml() {
  var items = [['aaj', 'Aaj', 'home'], ['all', 'Sab kaam', 'list'], ['add', 'Naya', 'plus'], ['clients', 'Clients', 'users']];
  items.push(isAdmin() ? ['bill', 'Billing', 'rupee'] : ['eod', 'EOD', 'note']);
  var rv = isAdmin() ? D.tickets.filter(function (t) { return t.status === 'Review'; }).length : 0;
  return '<nav class="nav">' + items.map(function (x) {
    var badge = (x[0] === 'aaj' && rv) ? '<span class="badge">' + rv + '</span>' : (x[0] === 'bill' && D.billingPending ? '<span class="badge">' + esc(D.billingPending) + '</span>' : '');
    return '<button class="' + (x[0] === 'add' ? 'add ' : '') + (V.tab === x[0] ? 'on' : '') + '" data-a="tab" data-v="' + x[0] + '">' + svg(x[2]) + '<span>' + x[1] + '</span>' + badge + '</button>';
  }).join('') + '</nav>';
}

function menuHtml() {
  return '<div class="menu" data-a="menubg"><div class="mp"><div class="who"><p style="margin:0;font-size:19px;font-weight:800">' + esc(me()) + '</p><p class="rs">' + (isAdmin() ? 'Admin' : 'Team') + '</p></div>' +
    (isAdmin() ? '<button class="item" data-a="tab" data-v="eod">📝 EOD</button>' : '') +
    '<button class="item" data-a="tab" data-v="rec">🔁 Recurring kaam</button>' +
    '<button class="item" data-a="tab" data-v="score">🏆 Score</button>' +
    '<button class="item" data-a="pinchange">🔑 PIN badlo</button>' +
    (DPROMPT ? '<button class="item" data-a="install">📲 Phone par install karo</button>' : '') +
    '<button class="item" data-a="logout">🚪 Logout</button>' +
    '<p class="hint" style="padding:16px 18px;margin-top:auto">Jinovate OS · data Jinovate ke Google Sheet mein</p></div></div>';
}

/* ---------- row ---------- */
function rowBtn(t) {
  if (!isOpen(t)) return '';
  var mine = t.owner === me(), b = BUSY[t.id] ? ' busy' : '';
  if (t.status === 'Review') return isAdmin() ? '<button class="ab rv' + b + '" data-a="approve" data-id="' + esc(t.id) + '"><span>✓</span>Approve</button>' : '';
  if (!mine && !isAdmin()) return '';
  if (t.status === 'Open') return '<button class="ab go' + b + '" data-a="start" data-id="' + esc(t.id) + '"><span>▶</span>Shuru</button>';
  if (t.status === 'Waiting') return '<button class="ab wt' + b + '" data-a="resume" data-id="' + esc(t.id) + '"><span>↺</span>Chalu</button>';
  return '<button class="ab ok' + b + '" data-a="finish" data-id="' + esc(t.id) + '"><span>✓</span>Ho gaya</button>';
}
function row(t, showOwner) {
  var d = dueTxt(t), st = t.status !== 'Open' ? '<span class="tag t-' + esc(t.status.replace(' ', '')) + '">' + esc(t.status === 'In Progress' ? 'Chal raha' : t.status) + '</span>' : '';
  return '<div class="row ' + esc(t.priority) + (BUSY[t.id] ? ' saving' : '') + (V.flash === t.id ? ' flash' : '') + '" role="button" tabindex="0" data-a="open" data-id="' + esc(t.id) + '">' +
    avatar(t.client) + '<div class="rb"><p class="rn">' + esc(t.title) + '</p>' +
    '<p class="rs">' + st + '<span class="d ' + d.c + '">' + esc(d.s) + '</span> · ' + esc(shortClient(t.client)) + (showOwner || t.owner !== me() ? ' · 👤 ' + esc(t.owner) : '') + '</p>' +
    (t.status === 'Waiting' && t.waiting ? '<p class="rs">⏳ ' + esc(t.waiting) + '</p>' : '') + '</div>' + rowBtn(t) + '</div>';
}
function section(title, cls, list, showOwner) {
  if (!list.length) return '';
  return '<h2 class="sh ' + cls + '"><span>' + title + '<span class="c">' + list.length + '</span></span></h2><div class="list">' + list.map(function (t) { return row(t, showOwner); }).join('') + '</div>';
}
function byDue(a, b) { return (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : (a.priority === 'HIGH' ? -1 : 1); }

/* ---------- AAJ ---------- */
function todayScreen() {
  var T = todayStr(), mine = D.tickets.filter(function (t) { return t.owner === me() && isOpen(t); });
  var act = mine.filter(function (t) { return t.status !== 'Review'; }).sort(byDue);
  var late = act.filter(function (t) { return t.due && t.due < T; });
  var tod = act.filter(function (t) { return t.due === T; });
  var wk = act.filter(function (t) { return t.due > T && t.due <= addDays(T, 7); });
  var later = act.filter(function (t) { return t.due > addDays(T, 7); });
  var nod = act.filter(function (t) { return !t.due; });
  var inRev = mine.filter(function (t) { return t.status === 'Review'; });
  var dn = new Date(T + 'T12:00:00');
  var sub = DAY[dn.getDay()] + ', ' + nice(T) + ' · ' + (late.length + tod.length ? (late.length + tod.length) + ' kaam aaj tak ke' : 'aaj ka sab clear');
  var h = header('Namaste, ' + me(), sub);
  if (DPROMPT && !ls(LS.ib)) h += '<div class="install">📲 Jinovate OS ko phone par app ki tarah rakho<button class="chip on" data-a="install">Install</button><button class="chip" data-a="ibno">Baad mein</button></div>';
  if (!D.eodDone && new Date().getHours() >= 17) h += '<div class="install" style="background:var(--yelbg);color:var(--yel)">📝 Aaj ka EOD baaki hai<button class="chip on" data-a="tab" data-v="eod">Bharo</button></div>';
  if (isAdmin()) {
    var rv = D.tickets.filter(function (t) { return t.status === 'Review'; }).sort(byDue);
    h += section('Aapke review ke liye', 'bl', rv, true);
  }
  h += section('Late ho gaye', 'r', late) + section('Aaj karna hai', 'o', tod) + section('Agle 7 din', '', wk) + section('Bina due date', '', nod);
  if (later.length) h += V.showLater ? section('Baad mein', '', later) : '<h2 class="sh"><span>Baad mein<span class="c">' + later.length + '</span></span></h2><button class="more" data-a="showlater">Dikhao ▾</button>';
  if (inRev.length) h += section('Utsav ke review mein', 'bl', inRev);
  if (!late.length && !tod.length && !wk.length && !nod.length && !(isAdmin() && D.tickets.some(function (t) { return t.status === 'Review'; })))
    h += '<div class="empty"><b>Sab clear 🎉</b>Naya kaam aaye to neeche ➕ Naya dabao</div>';
  return h + '<div class="body"></div>';
}

/* ---------- SAB KAAM ---------- */
function allScreen() {
  var F = V.all, q = F.q.toLowerCase();
  var chip = function (k, v, l) { return '<button class="sc' + (F[k] === v ? ' on' : '') + '" data-a="filt" data-k="' + k + '" data-v="' + esc(v) + '">' + l + '</button>'; };
  var list = D.tickets.filter(function (t) {
    if (F.who && t.owner !== F.who) return false;
    if (F.st === 'open' && !isOpen(t)) return false;
    if (F.st === 'late' && !(isOpen(t) && t.status !== 'Review' && t.due && t.due < todayStr())) return false;
    if (['open', 'late', ''].indexOf(F.st) === -1 && t.status !== F.st) return false;
    if (q && (t.title + ' ' + t.client + ' ' + t.id + ' ' + t.category).toLowerCase().indexOf(q) === -1) return false;
    return true;
  }).sort(F.st === 'Done' ? function (a, b) { return a.closed < b.closed ? 1 : -1; } : byDue);
  var h = header('Sab kaam', list.length + ' kaam');
  h += '<div class="pad" style="padding-bottom:0"><input class="in" type="search" id="allq" placeholder="🔎 Kaam, client ya JIN no." value="' + esc(F.q) + '" autocomplete="off"></div>';
  h += '<div class="strip" style="border:0;background:none">' + chip('st', 'open', 'Sab open') + chip('st', 'late', 'Late') + chip('st', 'In Progress', 'Chal raha') + chip('st', 'Waiting', 'Waiting') + chip('st', 'Review', 'Review') + chip('st', 'Done', 'Done') + '</div>';
  h += '<div class="strip" style="border:0;background:none;padding-top:0">' + chip('who', '', 'Sab log') + D.users.map(function (u) { return chip('who', u, u === me() ? 'Mere' : esc(u)); }).join('') + '</div>';
  h += list.length ? '<div class="list">' + list.slice(0, 200).map(function (t) { return row(t, true); }).join('') + '</div>' : '<div class="empty">Is filter mein kuch nahi</div>';
  return h + '<div class="body"></div>';
}

/* ---------- CLIENTS ---------- */
function clientStats(c) {
  var ts = D.tickets.filter(function (t) { return t.clientId === c.id && isOpen(t); });
  return { open: ts.length, late: ts.filter(function (t) { return t.status !== 'Review' && t.due && t.due < todayStr(); }).length };
}
function clientsScreen() {
  var q = V.cq.toLowerCase();
  var cs = D.clients.filter(function (c) { return c.status !== 'Inactive' && (!q || (c.name + ' ' + c.short + ' ' + c.gstin).toLowerCase().indexOf(q) !== -1); })
    .map(function (c) { var s = clientStats(c); return { c: c, s: s }; })
    .sort(function (a, b) { return (b.s.late - a.s.late) || (b.s.open - a.s.open) || (a.c.name < b.c.name ? -1 : 1); });
  var h = header('Clients', cs.length + ' clients');
  h += '<div class="pad" style="padding-bottom:10px"><input class="in" type="search" id="cq" placeholder="🔎 Client ka naam" value="' + esc(V.cq) + '" autocomplete="off"></div><div class="list">';
  h += cs.map(function (x) {
    return '<div class="row" role="button" tabindex="0" data-a="client" data-id="' + esc(x.c.id) + '">' + avatar(x.c.name) + '<div class="rb"><p class="rn">' + esc(x.c.name) + '</p><p class="rs">' + esc(x.c.type || '') + (x.c.status && x.c.status !== 'Active' ? ' · ' + esc(x.c.status) : '') + ' · ' + x.s.open + ' open</p></div>' +
      (x.s.late ? '<span class="tag" style="background:var(--redbg);color:var(--red);font-size:13px">' + x.s.late + ' late</span>' : '') + '</div>';
  }).join('') + '</div>';
  return h + '<div class="body"></div>';
}
function clientScreen() {
  var c = client(V.cid); if (!c) { V.scr = null; return todayScreen(); }
  var ts = D.tickets.filter(function (t) { return t.clientId === c.id; });
  var open = ts.filter(isOpen).sort(byDue), done = ts.filter(function (t) { return !isOpen(t); }).sort(function (a, b) { return a.closed < b.closed ? 1 : -1; });
  var h = header(shortClient(c.name), (c.type || '') + (c.gstin ? ' · ' + c.gstin : ''), true);
  h += '<div class="pad"><div class="acts">' + '<button class="btn" data-a="addfor" data-id="' + esc(c.id) + '">➕ Iska kaam</button>' +
    (/^https:\/\//.test(c.folder) ? '<a class="btn o" style="text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center" href="' + esc(c.folder) + '" target="_blank" rel="noopener">📁 Drive folder</a>' : '<button class="btn o" disabled>📁 Folder nahi</button>') +
    '</div>' + (isAdmin() && c.notes ? '<div class="card" style="font-size:14px">📌 ' + esc(c.notes) + '</div>' : '') + '</div>';
  h += open.length ? section('Chal rahe kaam', '', open, true) : '<div class="empty">Is client ka koi kaam pending nahi</div>';
  if (done.length) h += section('Ho chuke', '', done.slice(0, 30), true);
  return h + '<div class="body"></div>';
}

/* ---------- TICKET DETAIL ---------- */
function ticketScreen() {
  var t = tk(V.id); if (!t) { V.scr = null; return todayScreen(); }
  var d = dueTxt(t), mine = t.owner === me(), adm = isAdmin(), open = isOpen(t), b = [];
  if (open && (mine || adm) && t.status !== 'Review') {
    if (t.status !== 'In Progress') b.push('<button class="btn ghost" data-a="start" data-id="' + esc(t.id) + '">▶ ' + (t.status === 'Waiting' ? 'Phir chalu' : 'Shuru karo') + '</button>');
    if (t.status !== 'Waiting') b.push('<button class="btn ghost" data-a="wait" data-id="' + esc(t.id) + '">⏳ Waiting</button>');
    b.push('<button class="btn g full" data-a="finish" data-id="' + esc(t.id) + '">✓ ' + (adm && mine ? 'Ho gaya – Done' : 'Ho gaya – Review bhejo') + '</button>');
  }
  if (open && adm && t.status === 'Review') {
    b.push('<button class="btn bl" data-a="approve" data-id="' + esc(t.id) + '">✓ Approve</button>');
    b.push('<button class="btn r" data-a="sendback" data-id="' + esc(t.id) + '">↩ Wapas bhejo</button>');
  }
  if (adm) {
    if (open) {
      b.push('<button class="btn o" data-a="due" data-id="' + esc(t.id) + '">📅 Date badlo</button>');
      b.push('<button class="btn o" data-a="owner" data-id="' + esc(t.id) + '">👤 Kisko do</button>');
      b.push('<button class="btn o" data-a="editt" data-id="' + esc(t.id) + '">✏ Badlo</button>');
      b.push('<button class="btn o" data-a="cancel" data-id="' + esc(t.id) + '">✖ Cancel</button>');
    } else b.push('<button class="btn o full" data-a="reopen" data-id="' + esc(t.id) + '">↩ Dobara kholo</button>');
  }
  var h = header(t.id, shortClient(t.client), true) + '<div class="pad">';
  h += '<div class="card"><p class="dt-title">' + esc(t.title) + '</p><div class="meta">' +
    '<span class="tag t-' + esc(t.status.replace(' ', '')) + '">' + esc(t.status === 'In Progress' ? 'Chal raha' : t.status) + '</span>' +
    '<span class="tag"><span class="d ' + d.c + '">📅 ' + esc(d.s) + (t.due && d.s !== nice(t.due) ? ' (' + esc(nice(t.due)) + ')' : '') + '</span></span>' +
    '<span class="tag">👤 ' + esc(t.owner) + '</span><span class="tag">' + esc(t.category) + '</span>' + (t.priority === 'HIGH' ? '<span class="tag" style="background:var(--redbg);color:var(--red)">Urgent</span>' : '') + '</div>' +
    (t.waiting ? '<p class="det" style="color:var(--yel)">⏳ Waiting: ' + esc(t.waiting) + '</p>' : '') +
    (t.details ? '<p class="det">' + linkify(t.details) + '</p>' : '') +
    (t.proofRef || t.proofLink ? '<p class="det">🧾 Proof: ' + esc(t.proofRef.replace(/^'/, '')) + ' ' + (/^https:\/\//.test(t.proofLink) ? '<a href="' + esc(t.proofLink) + '" target="_blank" rel="noopener">file kholo</a>' : '') + '</p>' : '') +
    '<p class="hint">Banaya ' + esc(nice(t.created)) + ' · ' + esc(t.createdBy) + (t.reopen ? ' · ' + t.reopen + 'x wapas aaya' : '') + '</p></div>';
  if (b.length) h += '<div class="acts">' + b.join('') + '</div>';
  h += '<div class="card"><label class="lb" for="cm">Comment / update likho</label><textarea class="in" id="cm" placeholder="Jaise: client ko call kiya, kal data bhejega"></textarea><div style="height:10px"></div><button class="btn ghost" data-a="comment" data-id="' + esc(t.id) + '">Comment save karo</button></div>';
  h += '<div class="card"><label class="lb">History</label><div class="hist" id="hist">' + (V.hist && V.hist.id === t.id ? histHtml(V.hist.l) : 'Load ho raha hai…') + '</div></div>';
  return h + '</div><div class="body"></div>';
}
function linkify(s) { return esc(s).replace(/https:\/\/[^\s<]+/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + (u.length > 40 ? u.substring(0, 40) + '…' : u) + '</a>'; }); }
function histHtml(l) {
  if (!l.length) return '–';
  return l.slice().reverse().map(function (x) { return '<div>' + esc(nice(x.at)) + ' ' + esc(x.at.substring(11)) + ' · <b>' + esc(x.user) + '</b> · ' + esc(x.action === 'STATUS' ? (x.from + ' → ' + x.to) : x.action === 'COMMENT' ? '💬' : x.action) + (x.note ? ' — ' + esc(x.note) : '') + '</div>'; }).join('');
}
function loadHist(id) { api('log', { id: id }).then(function (l) { V.hist = { id: id, l: l }; if (V.scr === 'ticket' && V.id === id) { var e = $('#hist'); if (e) e.innerHTML = histHtml(l); } }).catch(function () {}); }

/* ---------- ADD ---------- */
function newDraft(cid) { return { title: '', cid: cid || '', cq: '', due: '', dueMode: '', owner: me(), pri: 'MED', cat: '', catAuto: true, src: 'WhatsApp', details: '', showMore: false, rec: false, freq: 'Daily', rday: '', rdate: '' }; }
function privClients() { return D.clients.filter(function (c) { return c.status === 'Private'; }); }
function isPrivC(id) { var c = client(id); return !!(c && c.status === 'Private'); }
function recentClients() {
  var seen = {}, out = [];
  D.tickets.slice().sort(function (a, b) { return a.created < b.created ? 1 : -1; }).forEach(function (t) { if (!seen[t.clientId] && client(t.clientId) && !isPrivC(t.clientId) && out.length < 8) { seen[t.clientId] = 1; out.push(client(t.clientId)); } });
  return out;
}
function addScreen() {
  if (!NEW) NEW = newDraft();
  var N = NEW, T = todayStr(), c = client(N.cid);
  var dchip = function (v, l) { return '<button class="chip' + (N.dueMode === v ? ' on' : '') + '" data-a="nd" data-v="' + v + '">' + l + '</button>'; };
  var h = header(N.rec ? 'Naya recurring kaam' : 'Naya kaam', N.rec ? 'Ek baar set karo – ticket apne aap banega' : 'Bas 3 cheezein: kaam, client, kab tak', !!N.back) + '<div class="pad">';
  h += '<div class="chips"><button class="chip' + (!N.rec ? ' on' : '') + '" data-a="nrec" data-v="0">Ek baar ka</button><button class="chip' + (N.rec ? ' on' : '') + '" data-a="nrec" data-v="1">🔁 Baar-baar hota hai</button></div>';
  h += '<div><label class="lb" for="nt">Kaam kya hai?</label><textarea class="in big" id="nt" placeholder="Jaise: VSPW Nov GSTR-1 file karna" style="min-height:76px">' + esc(N.title) + '</textarea></div>';
  h += '<div><label class="lb" for="ncq">Client</label>';
  if (c) h += '<div class="sel">' + avatar(c.name) + '<span style="flex:1">' + esc(c.name) + '</span><button data-a="nclr">Badlo</button></div>';
  else {
    var q = N.cq.toLowerCase(), res = q ? D.clients.filter(function (x) { return x.status !== 'Inactive' && (x.name + ' ' + x.short).toLowerCase().indexOf(q) !== -1; }).slice(0, 8) : [];
    h += '<input class="in" id="ncq" type="search" placeholder="🔎 Naam likho…" value="' + esc(N.cq) + '" autocomplete="off">';
    h += q ? '<div class="pick">' + (res.map(function (x) { return '<button data-a="ncl" data-id="' + esc(x.id) + '">' + esc(x.name) + '</button>'; }).join('') || '<button disabled>Koi client nahi mila</button>') + '</div>'
           : '<div class="chips" style="margin-top:10px">' + (isAdmin() ? privClients().map(function (x) { return '<button class="chip" data-a="ncl" data-id="' + esc(x.id) + '">' + (/genpact/i.test(x.name) ? '💼 ' : '🙋 ') + esc(x.short || x.name) + '</button>'; }).join('') : '') + recentClients().map(function (x) { return '<button class="chip" data-a="ncl" data-id="' + esc(x.id) + '">' + esc(shortClient(x.short || x.name)) + '</button>'; }).join('') + '</div>';
  }
  h += '</div>';
  if (N.rec) {
    var fchip = function (v, l) { return '<button class="chip' + (N.freq === v ? ' on' : '') + '" data-a="nfreq" data-v="' + v + '">' + l + '</button>'; };
    h += '<div><label class="lb">Kitni baar?</label><div class="chips">' + fchip('Daily', 'Roz') + fchip('Weekly', 'Har hafte') + fchip('Monthly', 'Har mahine') + fchip('Annual', 'Har saal') + '</div>';
    if (N.freq === 'Daily') h += '<p class="hint">Som se Shani roz subah ticket banega (Ravivar chhutti), due usi din.</p>';
    if (N.freq === 'Weekly') h += '<label class="lb" style="margin-top:12px">Kis din?</label><div class="chips">' + [1, 2, 3, 4, 5, 6, 7].map(function (d) { return '<button class="chip' + (String(N.rday) === String(d) ? ' on' : '') + '" data-a="nrday" data-v="' + d + '">' + DAY[d % 7] + '</button>'; }).join('') + '</div><p class="hint">Har Somvaar subah ticket banega, due is din.</p>';
    if (N.freq === 'Monthly') h += '<label class="lb" style="margin-top:12px" for="nrd">Mahine ki kaunsi tareekh?</label><select class="in" id="nrd"><option value="">-- chuno --</option>' + Array.apply(null, Array(31)).map(function (_, i) { return '<option' + (String(N.rday) === String(i + 1) ? ' selected' : '') + '>' + (i + 1) + '</option>'; }).join('') + '</select><p class="hint">Har mahine ki 1 tareekh ko ticket banega. 31 chuna to chhote mahine mein aakhri din.</p>';
    if (N.freq === 'Annual') h += '<label class="lb" style="margin-top:12px" for="nry">Har saal kis din? (saal koi bhi chalega)</label><input class="in" type="date" id="nry" value="' + esc(N.rdate) + '"><p class="hint">Us mahine ki 1 tareekh ko ticket banega.</p>';
    h += '</div>';
  } else {
    h += '<div><label class="lb">Kab tak?</label><div class="chips">' + dchip('0', 'Aaj') + dchip('1', 'Kal') + dchip('3', '3 din') + dchip('7', '1 hafta') + dchip('d', '📅 Date') + '</div>' +
      (N.dueMode === 'd' ? '<input class="in" type="date" id="ndd" min="' + addDays(T, -30) + '" value="' + esc(N.due) + '" style="margin-top:10px">' : '') +
      (N.due && N.dueMode !== 'd' ? '<p class="hint">Due: ' + esc(nice(N.due)) + '</p>' : '') + '</div>';
  }
  if (!isPrivC(N.cid)) h += '<div><label class="lb">Kiska kaam?</label><div class="chips">' + D.users.filter(function (u) { return isAdmin() || !N.rec || u === me(); }).map(function (u) { return '<button class="chip' + (N.owner === u ? ' on' : '') + '" data-a="no" data-v="' + esc(u) + '">' + (u === me() ? 'Mera' : esc(u)) + '</button>'; }).join('') + '</div></div>';
  else h += '<p class="hint" style="margin:0">🔒 Ye kaam sirf aapko dikhega – Nirmala ko nahi, billing/score mein nahi.</p>';
  h += '<div><label class="lb">Kitna zaroori?</label><div class="chips"><button class="chip' + (N.pri === 'MED' ? ' on' : '') + '" data-a="np" data-v="MED">Normal</button><button class="chip red' + (N.pri === 'HIGH' ? ' on' : '') + '" data-a="np" data-v="HIGH">🔴 Urgent</button><button class="chip' + (N.pri === 'LOW' ? ' on' : '') + '" data-a="np" data-v="LOW">Aaram se</button></div></div>';
  h += '<div><label class="lb">Type ' + (N.cat && N.catAuto ? '<span style="font-weight:500">(apne aap chuna)</span>' : '') + '</label><div class="chips">' + D.categories.map(function (x) { return '<button class="chip' + (N.cat === x ? ' on' : '') + '" data-a="nk" data-v="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div></div>';
  if (N.showMore && !N.rec) {
    h += '<div><label class="lb">Kahan se aaya?</label><div class="chips">' + D.sources.map(function (x) { return '<button class="chip' + (N.src === x ? ' on' : '') + '" data-a="ns" data-v="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div></div>';
    h += '<div><label class="lb" for="ndt">Details (optional)</label><textarea class="in" id="ndt" placeholder="Link, amount, client ne kya kaha…">' + esc(N.details) + '</textarea></div>';
  } else if (!N.rec) h += '<button class="lnk" data-a="nmore">+ Details / kahan se aaya</button>';
  if (N.err) h += '<div class="err">' + esc(N.err) + '</div>';
  h += '<button class="btn" data-a="nsave"' + (N.saving ? ' disabled' : '') + '>' + (N.saving ? 'Save ho raha hai…' : N.rec ? '🔁 Recurring set karo' : '✓ Kaam add karo') + '</button></div>';
  return h + '<div class="body"></div>';
}
function readNew() {
  if (!NEW) return; var e;
  if ((e = $('#nt'))) { NEW.title = e.value; if (NEW.catAuto) { var g = guessCat(NEW.title); if (g) NEW.cat = g; } }
  if ((e = $('#ncq'))) NEW.cq = e.value;
  if ((e = $('#ndd'))) NEW.due = e.value;
  if ((e = $('#ndt'))) NEW.details = e.value;
  if ((e = $('#nrd'))) NEW.rday = e.value;
  if ((e = $('#nry'))) NEW.rdate = e.value;
}
function saveNew() {
  readNew(); var N = NEW; N.err = '';
  if (isPrivC(N.cid)) N.owner = me();
  if (N.title.trim().length < 5) N.err = 'Kaam ka naam thoda detail mein likho (5+ akshar)';
  else if (!N.cid) N.err = 'Client chuno';
  else if (!N.rec && !N.due) N.err = 'Kab tak – date chuno';
  else if (N.rec && (N.freq === 'Weekly' || N.freq === 'Monthly') && !N.rday) N.err = N.freq === 'Weekly' ? 'Hafte ka din chuno' : 'Mahine ki tareekh chuno';
  else if (N.rec && N.freq === 'Annual' && !N.rdate) N.err = 'Saal ki tareekh chuno';
  if (N.err) { rerender(); return; }
  if (!N.cat) N.cat = D.categories.indexOf('Other') !== -1 ? 'Other' : D.categories[0];
  if (N.rec) { saveRec(N); return; }
  N.saving = true; rerender();
  api('create', { clientId: N.cid, title: N.title.trim(), details: N.details, source: N.src, category: N.cat, priority: N.pri, owner: N.owner, due: N.due })
    .then(function (t) {
      upsert(t); buzz(30); toast(t.id + ' ban gaya ✓');
      var back = N.back; NEW = null; V.flash = t.id; setTimeout(function () { V.flash = null; }, 1200);
      if (back === 'client') { V.tab = V.prevTab || 'clients'; V.scr = 'client'; } else { V.scr = null; V.tab = t.owner === me() ? 'aaj' : 'all'; }
      render(); window.scrollTo(0, 0);
    })
    .catch(function (e) { N.saving = false; N.err = e.message; rerender(); });
}

function saveRec(N) {
  N.saving = true; rerender();
  var p = { clientId: N.cid, title: N.title.trim(), category: N.cat, priority: N.pri, owner: N.owner, freq: N.freq };
  if (N.freq === 'Weekly' || N.freq === 'Monthly') p.day = N.rday;
  if (N.freq === 'Annual') { p.day = +N.rdate.substring(8, 10); p.month = +N.rdate.substring(5, 7); }
  api('recAdd', p).then(function (r) {
    (r.tickets || []).forEach(upsert); REC = null; NEW = null; buzz(30);
    toast('🔁 Recurring set ✓' + (r.tickets && r.tickets.length ? ' · pehla ticket ' + r.tickets[0].id + ' bhi bana' : ''));
    V.scr = null; V.tab = 'rec'; render(); window.scrollTo(0, 0);
  }).catch(function (e) { N.saving = false; N.err = e.message; rerender(); });
}

/* ---------- RECURRING LIST ---------- */
var REC = null;
var FREQ_L = { Daily: 'Roz', Weekly: 'Har hafte', Monthly: 'Har mahine', 'Monthly-QRMP': 'Har mahine (QRMP)', Quarterly: 'Har quarter', Annual: 'Har saal' };
function recWhen(r) {
  var ms = function () { return String(r.months).split(',').filter(String).map(function (m) { return MON[+m - 1]; }).join(', '); };
  if (r.freq === 'Weekly') return 'Har ' + DAY[(+r.day) % 7];
  if (r.freq === 'Monthly' || r.freq === 'Monthly-QRMP') return 'Har mahine ' + r.day + ' tareekh';
  if (r.freq === 'Annual') return 'Har saal ' + r.day + ' ' + ms();
  if (r.freq === 'Quarterly') return r.day + ' tareekh (' + ms() + ')';
  return FREQ_L[r.freq] || r.freq;
}
function recScreen() {
  var h = header('Recurring kaam', 'Ye ticket apne aap bante hain');
  h += '<div class="pad" style="padding-bottom:4px"><button class="btn" data-a="recnew">➕ Naya recurring kaam</button></div>';
  if (!REC) { if (!recScreen.loading) { recScreen.loading = true; api('recList').then(function (l) { recScreen.loading = false; REC = l; if (V.tab === 'rec') rerender(); }).catch(function (e) { recScreen.loading = false; toast(e.message, true); }); } return h + '<div class="pad"><p class="hint">Load ho raha hai…</p></div><div class="body"></div>'; }
  var mine = REC.filter(function (r) { return r.start; }), sys = REC.filter(function (r) { return !r.start; });
  var rr = function (r) {
    return '<div class="row' + (r.active ? '' : ' saving') + '">' + avatar(r.client) + '<div class="rb"><p class="rn">' + esc(r.title) + '</p><p class="rs"><b>' + esc(recWhen(r)) + '</b> · ' + esc(shortClient(r.client)) + ' · 👤 ' + esc(r.owner) + '</p></div>' +
      '<button class="ab ' + (r.active ? 'go' : 'ok') + '" data-a="rectog" data-id="' + esc(r.id) + '"><span>' + (r.active ? '⏸' : '▶') + '</span>' + (r.active ? 'Roko' : 'Chalu') + '</button></div>';
  };
  h += mine.length ? '<h2 class="sh"><span>App se bane<span class="c">' + mine.length + '</span></span></h2><div class="list">' + mine.map(rr).join('') + '</div>' : '<div class="empty"><b>Abhi koi nahi</b>Roz / hafte / mahine / saal wale kaam yahan set karo</div>';
  if (sys.length) h += '<h2 class="sh"><span>Compliance (GST/TDS/ROC…)<span class="c">' + sys.length + '</span></span></h2><div class="list">' + sys.map(rr).join('') + '</div>';
  return h + '<div class="body"></div>';
}

/* ---------- EOD ---------- */
function eodScreen() {
  var T = todayStr(), m = me();
  var cleared = D.tickets.filter(function (t) { return t.owner === m && ((t.submitted || '').substring(0, 10) === T || (t.closed || '').substring(0, 10) === T) && t.status !== 'Cancelled'; });
  var waits = D.tickets.filter(function (t) { return t.owner === m && t.status === 'Waiting'; });
  var tom = D.tickets.filter(function (t) { return t.owner === m && isOpen(t) && t.status !== 'Review' && t.due && t.due <= addDays(T, 1); }).sort(byDue);
  var ln = function (t) { return '• ' + shortClient(t.client) + ' – ' + t.title; };
  var h = header('EOD', DAY[new Date(T + 'T12:00:00').getDay()] + ', ' + nice(T), V.tab === 'eod' && isAdmin() ? false : false) + '<div class="pad">';
  if (D.eodDone) h += '<div class="card" style="background:var(--grnbg);border-color:#BDE5CD;color:var(--grn);font-weight:700">✓ Aaj ka EOD ho gaya</div>';
  else {
    h += '<div class="card"><p class="hint" style="margin:0 0 12px">Neeche aaj ke kaam se apne aap bhara hai – bas dekh lo, badlo aur bhejo.</p>' +
      '<label class="lb" for="e1">Aaj kya kiya</label><textarea class="in" id="e1">' + esc(cleared.map(ln).join('\n')) + '</textarea><div style="height:12px"></div>' +
      '<label class="lb" for="e2">Kahan atka / kiska wait</label><textarea class="in" id="e2">' + esc(waits.map(function (t) { return ln(t) + (t.waiting ? ' (' + t.waiting + ')' : ''); }).join('\n')) + '</textarea><div style="height:12px"></div>' +
      '<label class="lb" for="e3">Kal kya karoge</label><textarea class="in" id="e3">' + esc(tom.map(ln).join('\n')) + '</textarea><div style="height:12px"></div>' +
      '<button class="btn" data-a="eodsave">EOD bhejo</button></div>';
  }
  h += '<div id="eodl"><p class="hint">Pichhle EOD load ho rahe hain…</p></div></div>';
  setTimeout(function () {
    api('eodList', { days: 7 }).then(function (l) {
      var e = $('#eodl'); if (!e) return;
      e.innerHTML = '<label class="lb">Pichhle 7 din</label>' + (l.map(function (x) { return '<div class="card" style="margin-bottom:10px;font-size:14px"><b>' + esc(x.user) + '</b> · ' + esc(nice(x.date)) + '<p class="det" style="margin-top:6px"><b>Kiya:</b> ' + esc(x.done) + (x.blocked ? '\n<b>Atka:</b> ' + esc(x.blocked) : '') + '\n<b>Kal:</b> ' + esc(x.plan) + '</p></div>'; }).join('') || '<p class="hint">Abhi kuch nahi</p>');
    }).catch(function () {});
  }, 0);
  return h + '<div class="body"></div>';
}

/* ---------- SCORE ---------- */
function scoreScreen() {
  var h = header('Score', 'Pichhle 30 din') + '<div class="pad"><div class="card" id="scc"><p class="hint">Load ho raha hai…</p></div><p class="hint">Points: kaam band +10, time pe +5, EOD +2, late −5, wapas aaya −5. Sab ke liye same niyam.</p></div>';
  setTimeout(function () {
    api('score', { days: 30 }).then(function (s) {
      var e = $('#scc'); if (!e) return;
      var c = function (v, p) { return v == null ? '–' : v + (p ? '%' : ''); };
      e.innerHTML = '<table class="tbl"><tr><th></th>' + s.map(function (x) { return '<th class="n">' + esc(x.name) + '</th>'; }).join('') + '</tr>' +
        [['Points', 'points'], ['Kaam band', 'closed'], ['Time pe', 'onTimePct', 1], ['Abhi late', 'overdue'], ['Open', 'open'], ['Wapas aaye', 'reopened'], ['Din / kaam', 'avgDays'], ['EOD bhara', 'eodPct', 1]]
          .map(function (r) { return '<tr><td>' + r[0] + '</td>' + s.map(function (x) { return '<td class="n"' + (r[1] === 'overdue' && x.overdue ? ' style="color:var(--red);font-weight:700"' : r[1] === 'points' ? ' style="font-weight:800"' : '') + '>' + esc(c(x[r[1]], r[2])) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
    }).catch(function (er) { var e = $('#scc'); if (e) e.innerHTML = '<p class="err">' + esc(er.message) + '</p>'; });
  }, 0);
  return h + '<div class="body"></div>';
}

/* ---------- BILLING (admin only) ---------- */
var B = null;
function billScreen() {
  var h = header('Billing', 'Sirf aapke liye');
  if (!B) { loadBill(); return h + '<div class="pad"><p class="hint">Load ho raha hai…</p></div><div class="body"></div>'; }
  var pend = B.queue.filter(function (r) { return r.decision === 'Pending' || r.decision === 'Later'; });
  var toBill = B.queue.filter(function (r) { return r.decision === 'Bill' && !r.invNo; });
  var unpaid = B.queue.filter(function (r) { return r.decision === 'Bill' && r.invNo && !r.paidOn; });
  var brow = function (r, btn) {
    return '<div class="row" role="button" tabindex="0" data-a="bedit" data-id="' + esc(r.id) + '">' + avatar(r.client) + '<div class="rb"><p class="rn">' + esc(r.work) + '</p><p class="rs">' + esc(shortClient(r.client)) + ' · ' + esc(nice(r.doneOn) || r.doneOn) + (r.amount ? ' · <b>₹' + esc(r.amount) + '</b>' : '') + (r.invNo ? ' · Inv ' + esc(r.invNo) : '') + (r.decision === 'Later' ? ' · baad mein' : '') + '</p></div>' + btn + '</div>';
  };
  h += '<div class="strip"><span class="sc o">❓ ' + pend.length + ' decide</span><span class="sc bl">🧾 ' + toBill.length + ' bill banana</span><span class="sc r">💰 ' + unpaid.length + ' payment</span></div>';
  h += pend.length ? '<h2 class="sh o"><span>Bill banega?<span class="c">' + pend.length + '</span></span></h2><div class="list">' + pend.map(function (r) {
    return brow(r, '<span style="display:flex;gap:6px;flex:none"><button class="ab ok" data-a="bbill" data-id="' + esc(r.id) + '"><span>🧾</span>Bill</button><button class="ab go" data-a="bret" data-id="' + esc(r.id) + '"><span>✓</span>Nahi</button></span>');
  }).join('') + '</div>' : '';
  h += toBill.length ? '<h2 class="sh bl"><span>Bill banana hai<span class="c">' + toBill.length + '</span></span></h2><div class="list">' + toBill.map(function (r) { return brow(r, '<button class="ab rv" data-a="binv" data-id="' + esc(r.id) + '"><span>🧾</span>Inv no.</button>'); }).join('') + '</div>' : '';
  h += unpaid.length ? '<h2 class="sh r"><span>Payment aana hai<span class="c">' + unpaid.length + '</span></span></h2><div class="list">' + unpaid.map(function (r) { return brow(r, '<button class="ab ok" data-a="bpaid" data-id="' + esc(r.id) + '"><span>💰</span>Aa gaya</button>'); }).join('') + '</div>' : '';
  if (!pend.length && !toBill.length && !unpaid.length) h += '<div class="empty"><b>Billing clear 🎉</b>Kuch pending nahi</div>';
  h += '<h2 class="sh"><span>Fee master<span class="c">' + B.fees.length + '</span></span></h2><div class="pad" style="padding-top:4px"><div class="card"><table class="tbl">' + B.fees.map(function (f) { return '<tr><td>' + esc(shortClient(f.client)) + '</td><td>' + esc(f.type) + '</td><td class="n">₹' + esc(f.amount) + '</td></tr>'; }).join('') + '</table></div></div>';
  return h + '<div class="body"></div>';
}
function loadBill() { api('x1').then(function (b) { B = b; if (V.tab === 'bill') rerender(); }).catch(function (e) { toast(e.message, true); }); }
function bq(id) { for (var i = 0; i < B.queue.length; i++) if (B.queue[i].id === id) return B.queue[i]; return null; }
function billSave(id, p, msg) {
  p.id = id; var r = bq(id), old = JSON.stringify(r);
  Object.keys(p).forEach(function (k) { if (k !== 'id') r[k] = p[k]; }); SHEET = null; rerender();
  api('x2', p).then(function () { toast(msg || 'Save ho gaya ✓'); api('boot').then(function (d) { D.billingPending = d.billingPending; saveBoot(); }); })
    .catch(function (e) { var o = JSON.parse(old); Object.keys(o).forEach(function (k) { r[k] = o[k]; }); toast(e.message, true); rerender(); });
}

/* ================= SHEETS ================= */
function openSheet(s) { SHEET = s; rerender(); }
function closeSheet() { SHEET = null; rerender(); }

function finishSheet(t) {
  var adm = isAdmin() && t.owner === me(), strict = D.proofCategories.indexOf(t.category) !== -1;
  openSheet({ focus: 'fr', html: function () {
    return '<h2>' + (adm ? 'Done karo' : 'Review ke liye bhejo') + '</h2><p class="hint" style="margin:0">' + esc(t.title) + '</p><div class="stack">' +
      '<div><label class="lb" for="fr">ARN / SRN / challan / ack no.' + (!adm && strict ? ' *' : ' (ho to)') + '</label><input class="in" id="fr" autocomplete="off" autocapitalize="characters"></div>' +
      '<div><label class="lb" for="fl">Drive file link (optional)</label><input class="in" id="fl" type="url" placeholder="https://drive.google.com/…"></div>' +
      '<div><label class="lb" for="fn">Kya kiya – 1 line</label><input class="in" id="fn" placeholder="Jaise: return file kiya, client ko mail kiya"></div>' +
      (adm ? '<p class="hint" style="margin:0">Proof nahi daala to "Proof upload" ka task apne aap ban jayega.</p>' : (strict ? '' : '<p class="hint" style="margin:0">Proof na ho to note 20+ akshar ka likho.</p>')) +
      '<div id="ferr"></div><button class="btn g" data-a="finishgo" data-id="' + esc(t.id) + '">' + (adm ? '✓ Done' : '📤 Review bhejo') + '</button><button class="lnk" data-a="close">Rehne do</button></div>';
  } });
}
function waitSheet(t) {
  var R = ['Client se data', 'Client ka sign / OTP', 'Client payment', 'Portal / department', 'Utsav ka decision'];
  openSheet({ html: function () {
    return '<h2>Kiska intezaar hai?</h2><div class="stack"><div class="chips">' + R.map(function (r) { return '<button class="chip" data-a="waitgo" data-id="' + esc(t.id) + '" data-v="' + esc(r) + '">' + esc(r) + '</button>'; }).join('') + '</div>' +
      '<input class="in" id="wv" placeholder="Ya khud likho…"><button class="btn" data-a="waitgo" data-id="' + esc(t.id) + '">Waiting mein daalo</button><button class="lnk" data-a="close">Rehne do</button></div>';
  } });
}
function reasonSheet(t, to, title, btn, cls) {
  openSheet({ focus: 'rv', html: function () {
    return '<h2>' + title + '</h2><p class="hint" style="margin:0">' + esc(t.title) + '</p><div class="stack"><input class="in" id="rv" placeholder="Reason likho"><div id="ferr"></div>' +
      '<button class="btn ' + cls + '" data-a="reasongo" data-id="' + esc(t.id) + '" data-v="' + to + '">' + btn + '</button><button class="lnk" data-a="close">Rehne do</button></div>';
  } });
}
function dueSheet(t) {
  var T = todayStr(), o = [['Aaj', 0], ['Kal', 1], ['+3 din', 3], ['+1 hafta', 7], ['+15 din', 15]];
  openSheet({ html: function () {
    return '<h2>Nayi due date</h2><p class="hint" style="margin:0">Abhi: ' + esc(t.due ? nice(t.due) : '–') + '</p><div class="stack"><div class="chips">' +
      o.map(function (x) { var v = addDays(x[1] === 0 || x[1] === 1 ? T : (t.due && t.due > T ? t.due : T), x[1]); return '<button class="chip" data-a="duego" data-id="' + esc(t.id) + '" data-v="' + v + '">' + x[0] + '</button>'; }).join('') +
      '</div><input class="in" type="date" id="dv" value="' + esc(t.due) + '"><button class="btn" data-a="duego" data-id="' + esc(t.id) + '">Date save karo</button><button class="lnk" data-a="close">Rehne do</button></div>';
  } });
}
function ownerSheet(t) {
  openSheet({ html: function () {
    return '<h2>Ye kaam kisko do?</h2><div class="stack"><div class="chips">' + D.users.map(function (u) { return '<button class="chip' + (u === t.owner ? ' on' : '') + '" data-a="ownergo" data-id="' + esc(t.id) + '" data-v="' + esc(u) + '">' + esc(u) + '</button>'; }).join('') + '</div><button class="lnk" data-a="close">Rehne do</button></div>';
  } });
}
function editSheet(t) {
  openSheet({ html: function () {
    return '<h2>Kaam badlo</h2><div class="stack"><div><label class="lb" for="et">Kaam</label><textarea class="in" id="et">' + esc(t.title) + '</textarea></div>' +
      '<div><label class="lb">Zaroori?</label><div class="chips">' + [['HIGH', '🔴 Urgent'], ['MED', 'Normal'], ['LOW', 'Aaram se']].map(function (p) { return '<button class="chip' + (t.priority === p[0] ? ' on' : '') + '" data-a="epri" data-v="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div></div>' +
      '<div><label class="lb" for="ek">Type</label><select class="in" id="ek">' + (D.categories.indexOf(t.category) === -1 ? '<option selected>' + esc(t.category) + '</option>' : '') + D.categories.map(function (c) { return '<option' + (c === t.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="lb" for="ed">Details</label><textarea class="in" id="ed">' + esc(t.details) + '</textarea></div>' +
      '<button class="btn" data-a="editgo" data-id="' + esc(t.id) + '">Save karo</button><button class="lnk" data-a="close">Rehne do</button></div>';
  }, pri: t.priority });
}
function billSheet(r, mode) {
  var T = todayStr();
  openSheet({ focus: mode === 'paid' ? 'pa' : 'ba', html: function () {
    var h = '<h2>' + esc(shortClient(r.client)) + '</h2><p class="hint" style="margin:0">' + esc(r.work) + '</p><div class="stack">';
    if (mode === 'paid') h += '<div><label class="lb" for="pa">Kitna aaya (₹)</label><input class="in big" id="pa" inputmode="decimal" value="' + esc(r.paidAmt || r.amount) + '"></div><div><label class="lb" for="pd">Kab aaya</label><input class="in" type="date" id="pd" value="' + T + '"></div><button class="btn g" data-a="bpaidgo" data-id="' + esc(r.id) + '">💰 Payment aa gaya</button>';
    else if (mode === 'inv') h += '<div><label class="lb" for="bi">Invoice no.</label><input class="in big" id="bi" value="' + esc(r.invNo) + '"></div><div><label class="lb" for="bd">Invoice date</label><input class="in" type="date" id="bd" value="' + esc(r.invDate || T) + '"></div><div><label class="lb" for="ba">Amount (₹)</label><input class="in" id="ba" inputmode="decimal" value="' + esc(r.amount) + '"></div><button class="btn" data-a="binvgo" data-id="' + esc(r.id) + '">Save karo</button>';
    else if (mode === 'bill') h += '<div><label class="lb" for="ba">Kitne ka bill (₹)</label><input class="in big" id="ba" inputmode="decimal" value="' + esc(r.amount) + '"></div><div><label class="lb" for="bi">Invoice no. (bana diya ho to)</label><input class="in" id="bi" value="' + esc(r.invNo) + '"></div><button class="btn" data-a="bbillgo" data-id="' + esc(r.id) + '">🧾 Bill banega – save</button>';
    else h += '<div class="chips">' + [['Pending', 'Decide nahi kiya'], ['Bill', 'Bill banega'], ['No-Retainer', 'Nahi (retainer)'], ['Later', 'Baad mein']].map(function (d) { return '<button class="chip' + (r.decision === d[0] ? ' on' : '') + '" data-a="bdec" data-id="' + esc(r.id) + '" data-v="' + d[0] + '">' + d[1] + '</button>'; }).join('') + '</div>' +
      '<div><label class="lb" for="ba">Amount (₹)</label><input class="in" id="ba" inputmode="decimal" value="' + esc(r.amount) + '"></div><div><label class="lb" for="bi">Invoice no.</label><input class="in" id="bi" value="' + esc(r.invNo) + '"></div>' +
      '<div><label class="lb" for="bnn">Note</label><input class="in" id="bnn" value="' + esc(r.notes) + '"></div><button class="btn" data-a="ballgo" data-id="' + esc(r.id) + '">Save karo</button>';
    return h + '<button class="lnk" data-a="close">Rehne do</button></div>';
  } });
}
function pinSheet() {
  openSheet({ focus: 'po', html: function () {
    return '<h2>PIN badlo</h2><div class="stack"><div><label class="lb" for="po">Purana PIN</label><input class="in pin" id="po" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password"></div>' +
      '<div><label class="lb" for="pn">Naya PIN (6 ank)</label><input class="in pin" id="pn" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div><div id="ferr"></div>' +
      '<button class="btn" data-a="pingo">PIN badlo</button><button class="lnk" data-a="close">Rehne do</button></div>';
  } });
}
function sheetErr(m) { var e = $('#ferr'); if (e) e.innerHTML = '<div class="err">' + esc(m) + '</div>'; else toast(m, true); var b = document.querySelector('.sheet .btn[disabled]'); if (b) b.disabled = false; }

/* ================= ACTIONS ================= */
function move(id, to, extra, opts) {
  var t = tk(id); if (!t || BUSY[id]) return;
  opts = opts || {};
  var before = JSON.stringify(t);
  var p = { id: id, to: to }; Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k]; });
  if (opts.optimistic) {
    t.status = to; if (to !== 'Waiting') t.waiting = '';
    if (to === 'Waiting') t.waiting = p.waiting;
    BUSY[id] = 1; buzz(); rerender();
  } else { var b = document.querySelector('.sheet .btn'); if (b) b.disabled = true; }
  return api('move', p).then(function (r) {
    delete BUSY[id]; upsert(r.t); if (r.extra) upsert(r.extra);
    if (!opts.optimistic) SHEET = null;
    V.flash = id; buzz(30);
    toast(opts.msg || 'Ho gaya ✓'); if (r.extra) setTimeout(function () { toast('Proof ka task ' + r.extra.id + ' bana diya'); }, 2700);
    if (V.hist && V.hist.id === id) loadHist(id);
    rerender(); setTimeout(function () { V.flash = null; }, 1200);
  }).catch(function (e) {
    delete BUSY[id];
    if (opts.optimistic) { var o = JSON.parse(before); Object.keys(o).forEach(function (k) { t[k] = o[k]; }); toast(e.message, true); rerender(); }
    else sheetErr(e.message);
  });
}
function edit(id, p, msg) {
  p.id = id; var b = document.querySelector('.sheet .btn'); if (b) b.disabled = true;
  api('edit', p).then(function (t) { upsert(t); SHEET = null; toast(msg || 'Badal diya ✓'); if (V.hist && V.hist.id === id) loadHist(id); rerender(); })
    .catch(function (e) { sheetErr(e.message); });
}

function go(tab) { V.tab = tab; V.scr = null; MENU = false; SHEET = null; if (tab === 'add' && !NEW) NEW = newDraft(); if (tab === 'bill') { B = null; } if (tab === 'rec') { REC = null; } render(); window.scrollTo(0, 0); }

document.addEventListener('click', function (ev) {
  var el = ev.target.closest('[data-a]'); if (!el) return;
  var a = el.dataset.a, id = el.dataset.id, v = el.dataset.v, t = id ? tk(id) : null;
  if (a === 'sheetbg' || a === 'menubg') { if (ev.target !== el) return; SHEET = null; MENU = false; rerender(); return; }
  switch (a) {
    case 'tab': go(v); break;
    case 'menu': MENU = true; rerender(); break;
    case 'back':
      if (V.scr === 'ticket' && V.backTo === 'client') { V.scr = 'client'; V.backTo = null; }
      else if (V.tab === 'add' && NEW && NEW.back === 'client') { NEW = null; V.tab = V.prevTab || 'clients'; V.scr = 'client'; }
      else V.scr = null;
      render(); break;
    case 'refresh': refresh(true); break;
    case 'open': V.backTo = V.scr === 'client' ? 'client' : null; V.scr = 'ticket'; V.id = id; render(); window.scrollTo(0, 0); loadHist(id); break;
    case 'client': V.scr = 'client'; V.cid = id; render(); window.scrollTo(0, 0); break;
    case 'showlater': V.showLater = true; rerender(); break;
    case 'filt': V.all[el.dataset.k] = v; rerender(); break;
    case 'start': move(id, 'In Progress', {}, { optimistic: true, msg: 'Shuru ✓' }); break;
    case 'resume': move(id, 'In Progress', {}, { optimistic: true, msg: 'Phir chalu ✓' }); break;
    case 'approve': move(id, 'Done', {}, { optimistic: true, msg: 'Approve – Done ✓' }); break;
    case 'finish': finishSheet(t); break;
    case 'finishgo': {
      var adm = isAdmin() && t.owner === me();
      move(id, adm ? 'Done' : 'Review', { proofRef: $('#fr').value.trim(), proofLink: $('#fl').value.trim(), note: $('#fn').value.trim() }, { msg: adm ? 'Done ✓' : 'Review mein bhej diya ✓' });
      break; }
    case 'wait': waitSheet(t); break;
    case 'waitgo': { var w = v || ($('#wv') && $('#wv').value.trim()); if (!w || w.length < 3) { toast('Kiska wait hai – chuno ya likho', true); break; } SHEET = null; move(id, 'Waiting', { waiting: w }, { optimistic: true, msg: 'Waiting mein ✓' }); break; }
    case 'sendback': reasonSheet(t, 'In Progress', 'Wapas bhejo', '↩ Wapas bhejo', 'r'); break;
    case 'cancel': reasonSheet(t, 'Cancelled', 'Kaam cancel karo', '✖ Cancel karo', 'r'); break;
    case 'reopen': reasonSheet(t, 'In Progress', 'Dobara kholo', '↩ Dobara kholo', ''); break;
    case 'reasongo': { var r = $('#rv').value.trim(); if (r.length < 5) { sheetErr('Reason thoda likho (5+ akshar)'); break; } move(id, v, { note: r }, { msg: 'Ho gaya ✓' }); break; }
    case 'due': dueSheet(t); break;
    case 'duego': { var d = v || $('#dv').value; if (!d) { sheetErr('Date chuno'); break; } edit(id, { due: d }, 'Nayi date: ' + nice(d)); break; }
    case 'owner': ownerSheet(t); break;
    case 'ownergo': edit(id, { owner: v }, v + ' ko de diya ✓'); break;
    case 'editt': editSheet(t); break;
    case 'epri': SHEET.pri = v; document.querySelectorAll('[data-a="epri"]').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); }); break;
    case 'editgo': edit(id, { title: $('#et').value.trim(), details: $('#ed').value, category: $('#ek').value, priority: SHEET.pri }); break;
    case 'comment': {
      var c = $('#cm').value.trim(); if (c.length < 2) { toast('Comment khaali hai', true); break; }
      el.disabled = true;
      api('comment', { id: id, note: c }).then(function () { toast('Comment save ✓'); $('#cm').value = ''; el.disabled = false; loadHist(id); }).catch(function (e) { el.disabled = false; toast(e.message, true); });
      break; }
    case 'close': closeSheet(); break;
    /* add */
    case 'addfor': NEW = newDraft(id); NEW.back = 'client'; V.prevTab = V.tab; V.scr = null; V.tab = 'add'; render(); window.scrollTo(0, 0); break;
    case 'ncl': readNew(); NEW.cid = id; NEW.cq = ''; if (isPrivC(id)) NEW.owner = me(); rerender(); break;
    case 'nclr': readNew(); NEW.cid = ''; rerender(); setTimeout(function () { var e = $('#ncq'); if (e) e.focus(); }, 0); break;
    case 'nd': readNew(); NEW.dueMode = v; if (v !== 'd') NEW.due = addDays(todayStr(), +v); rerender(); if (v === 'd') { var dd = $('#ndd'); if (dd) { try { dd.showPicker(); } catch (e) { dd.focus(); } } } break;
    case 'no': readNew(); NEW.owner = v; rerender(); break;
    case 'np': readNew(); NEW.pri = v; rerender(); break;
    case 'nk': readNew(); NEW.cat = v; NEW.catAuto = false; rerender(); break;
    case 'ns': readNew(); NEW.src = v; rerender(); break;
    case 'nmore': readNew(); NEW.showMore = true; rerender(); break;
    case 'nsave': saveNew(); break;
    case 'nrec': readNew(); NEW.rec = v === '1'; NEW.err = ''; if (NEW.rec && !isAdmin()) NEW.owner = me(); rerender(); break;
    case 'nfreq': readNew(); NEW.freq = v; NEW.rday = ''; NEW.err = ''; rerender(); break;
    case 'nrday': readNew(); NEW.rday = v; rerender(); break;
    case 'recnew': NEW = newDraft(); NEW.rec = true; V.tab = 'add'; V.scr = null; render(); window.scrollTo(0, 0); break;
    case 'rectog': {
      var rr = null; REC.forEach(function (x) { if (x.id === id) rr = x; }); if (!rr) break;
      rr.active = !rr.active; rerender();
      api('recToggle', { id: id, active: rr.active }).then(function () { toast(rr.active ? 'Phir chalu ✓' : 'Rok diya ⏸'); }).catch(function (e) { rr.active = !rr.active; toast(e.message, true); rerender(); });
      break; }
    /* eod */
    case 'eodsave': {
      el.disabled = true;
      api('eod', { done: $('#e1').value, blocked: $('#e2').value, plan: $('#e3').value }).then(function () { D.eodDone = true; saveBoot(); buzz(30); toast('EOD bhej diya ✓'); rerender(); })
        .catch(function (e) { el.disabled = false; toast(e.message, true); });
      break; }
    /* billing */
    case 'bedit': billSheet(bq(id), 'all'); break;
    case 'bbill': billSheet(bq(id), 'bill'); break;
    case 'bret': billSave(id, { decision: 'No-Retainer' }, 'Bill nahi banega ✓'); break;
    case 'binv': billSheet(bq(id), 'inv'); break;
    case 'bpaid': billSheet(bq(id), 'paid'); break;
    case 'bbillgo': { var am = $('#ba').value.trim(); if (!am) { toast('Amount daalo', true); break; } var p = { decision: 'Bill', amount: am }; var iv = $('#bi').value.trim(); if (iv) { p.invNo = iv; p.invDate = todayStr(); } billSave(id, p, 'Bill banega ✓'); break; }
    case 'binvgo': { var i2 = $('#bi').value.trim(); if (!i2) { toast('Invoice no. daalo', true); break; } billSave(id, { invNo: i2, invDate: $('#bd').value, amount: $('#ba').value.trim() }, 'Invoice save ✓'); break; }
    case 'bpaidgo': billSave(id, { paidOn: $('#pd').value || todayStr(), paidAmt: $('#pa').value.trim() }, '💰 Payment aa gaya ✓'); break;
    case 'bdec': document.querySelectorAll('[data-a="bdec"]').forEach(function (b) { b.classList.toggle('on', b === el); }); SHEET.dec = v; break;
    case 'ballgo': { var q = { amount: $('#ba').value.trim(), invNo: $('#bi').value.trim(), notes: $('#bnn').value }; if (SHEET.dec) q.decision = SHEET.dec; billSave(id, q); break; }
    /* menu */
    case 'pinchange': MENU = false; pinSheet(); break;
    case 'pingo': {
      var po = $('#po').value, pn = $('#pn').value;
      api('changePin', { old: po, pin: pn }).then(function () { SHEET = null; toast('PIN badal gaya ✓'); rerender(); }).catch(function (e) { sheetErr(e.message); });
      break; }
    case 'install': if (DPROMPT) { DPROMPT.prompt(); DPROMPT.userChoice.then(function () { DPROMPT = null; MENU = false; rerender(); }); } break;
    case 'ibno': ls(LS.ib, '1'); rerender(); break;
    case 'logout': if (confirmLogout()) logout(); break;
    /* login */
    case 'lgo': doLogin(); break;
    case 'lforgot': L.mode = 'otp'; L.err = ''; L.msg = ''; render(); break;
    case 'lback': L.mode = 'pin'; L.err = ''; L.msg = ''; render(); break;
    case 'otpsend': sendOtp(); break;
    case 'setpin': doSetPin(); break;
  }
});
document.addEventListener('input', function (ev) {
  var t = ev.target;
  if (t.id === 'allq') { V.all.q = t.value; clearTimeout(t._h); t._h = setTimeout(function () { var p = t.selectionStart; rerender(); var e = $('#allq'); if (e) { e.focus(); e.setSelectionRange(p, p); } }, 250); }
  else if (t.id === 'cq') { V.cq = t.value; clearTimeout(t._h); t._h = setTimeout(function () { var p = t.selectionStart; rerender(); var e = $('#cq'); if (e) { e.focus(); e.setSelectionRange(p, p); } }, 200); }
  else if (t.id === 'ncq') { NEW.cq = t.value; readNew(); clearTimeout(t._h); t._h = setTimeout(function () { var p = t.selectionStart; rerender(); var e = $('#ncq'); if (e) { e.focus(); e.setSelectionRange(p, p); } }, 200); }
  else if (t.id === 'nt' && NEW) { NEW.title = t.value; if (NEW.catAuto) { var g = guessCat(t.value); if (g && g !== NEW.cat) { NEW.cat = g; document.querySelectorAll('[data-a="nk"]').forEach(function (b) { b.classList.toggle('on', b.dataset.v === g); }); } } }
  else if (t.id === 'ndd' && NEW) NEW.due = t.value;
  else if (t.id === 'ndt' && NEW) NEW.details = t.value;
  else if (t.id === 'nrd' && NEW) NEW.rday = t.value;
  else if (t.id === 'nry' && NEW) NEW.rdate = t.value;
});
document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Enter' && ev.target.classList && ev.target.classList.contains('row')) ev.target.click();
  if (ev.key === 'Enter' && (ev.target.id === 'lp' || ev.target.id === 'lp2')) { ev.preventDefault(); L.mode === 'pin' ? doLogin() : doSetPin(); }
  if (ev.key === 'Escape' && (SHEET || MENU)) { SHEET = null; MENU = false; rerender(); }
});
function dirty() { return Array.prototype.some.call(document.querySelectorAll('#app textarea, #app input:not([type=search])'), function (e) { return e.value !== e.defaultValue; }); }
function confirmLogout() { return window.confirm('Logout karna hai? Dobara PIN se login karna padega.'); }

/* ================= LOGIN ================= */
var L = { mode: 'pin', err: '', msg: '', busy: false };
function loginHtml() {
  var em = esc(ls(LS.email) || '');
  var h = '<div class="login"><div class="lhead"><img src="icon-192.png" alt=""><h1>Jinovate OS</h1><p>' + (L.mode === 'pin' ? 'Apna email aur 6 ank ka PIN daalo' : 'Naya PIN banao – code aapke email par aayega') + '</p></div><div class="pad" style="padding-top:22px">';
  h += '<div><label class="lb" for="le">Jinovate email</label><input class="in" id="le" type="email" inputmode="email" autocomplete="username" placeholder="naam@jinovate.com" value="' + em + '"></div>';
  if (L.mode === 'pin') {
    h += '<div><label class="lb" for="lp">PIN</label><input class="in pin" id="lp" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="current-password"></div>';
    h += (L.err ? '<div class="err">' + esc(L.err) + '</div>' : '') + '<button class="btn" data-a="lgo"' + (L.busy ? ' disabled' : '') + '>' + (L.busy ? 'Khul raha hai…' : 'Login') + '</button><button class="lnk" data-a="lforgot">Pehli baar / PIN bhool gaye?</button>';
  } else {
    h += '<button class="btn o" data-a="otpsend"' + (L.busy ? ' disabled' : '') + '>📧 Email par code bhejo</button>' + (L.msg ? '<p class="hint" style="color:var(--grn);font-weight:600">' + esc(L.msg) + '</p>' : '');
    h += '<div><label class="lb" for="lo">Email wala 6 ank ka code</label><input class="in pin" id="lo" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div>';
    h += '<div><label class="lb" for="lp2">Naya PIN (6 ank, yaad rakhna)</label><input class="in pin" id="lp2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>';
    h += (L.err ? '<div class="err">' + esc(L.err) + '</div>' : '') + '<button class="btn" data-a="setpin"' + (L.busy ? ' disabled' : '') + '>PIN set karo aur khol do</button><button class="lnk" data-a="lback">← Login par wapas</button>';
  }
  return h + '<p class="hint" style="text-align:center;margin-top:18px">Sirf Jinovate team ke liye</p></div></div>';
}
function loginDone(r) {
  TOKEN = r.token; ls(LS.tok, TOKEN); D = r.boot; saveBoot(); L = { mode: 'pin', err: '', msg: '', busy: false };
  V.tab = 'aaj'; V.scr = null; render();
}
function lval(id) { var e = $('#' + id); return e ? e.value.trim() : ''; }
function doLogin() {
  var em = lval('le').toLowerCase(), pin = lval('lp');
  if (!em || !/^\d{6}$/.test(pin)) { L.err = 'Email aur 6 ank ka PIN daalo'; render(); return; }
  ls(LS.email, em); L.busy = true; L.err = ''; render();
  api('login', { email: em, pin: pin }).then(loginDone).catch(function (e) { L.busy = false; L.err = e.message; render(); });
}
function sendOtp() {
  var em = lval('le').toLowerCase(); if (!em) { L.err = 'Pehle email likho'; render(); return; }
  ls(LS.email, em); L.busy = true; L.err = ''; render();
  api('otp', { email: em }).then(function (m) { L.busy = false; L.msg = m; render(); var o = $('#lo'); if (o) o.focus(); }).catch(function (e) { L.busy = false; L.err = e.message; render(); });
}
function doSetPin() {
  var em = lval('le').toLowerCase(), otp = lval('lo'), pin = lval('lp2');
  if (!/^\d{6}$/.test(otp)) { L.err = 'Email wala 6 ank ka code daalo'; render(); return; }
  if (!/^\d{6}$/.test(pin)) { L.err = 'Naya PIN 6 ank ka rakho'; render(); return; }
  var keepOtp = otp; L.busy = true; L.err = ''; render();
  api('setPin', { email: em, otp: keepOtp, pin: pin }).then(function (r) { toast('PIN set ho gaya ✓'); loginDone(r); }).catch(function (e) { L.busy = false; L.err = e.message; render(); });
}
function logout(silent) {
  if (TOKEN && !silent) { try { api('logout'); } catch (e) {} }
  TOKEN = null; D = null; B = null; NEW = null; SHEET = null; MENU = false; ls(LS.tok, null); ls(LS.boot, null); render();
}

/* ================= BOOT / REFRESH ================= */
function refresh(manual) {
  if (!TOKEN) return;
  if (manual) toast('Refresh ho raha hai…');
  return api('boot').then(function (d) {
    D = d; saveBoot(); if (V.tab === 'bill' && manual) B = null;
    if (!SHEET && !MENU && V.tab !== 'add' && !dirty() && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) rerender();
    if (manual) toast('Taaza ✓');
  }).catch(function (e) { if (manual) toast(e.message, true); });
}
(function start() {
  TOKEN = ls(LS.tok);
  try { D = JSON.parse(ls(LS.boot) || 'null'); } catch (e) { D = null; }
  if (TOKEN && !D) { $('#app').innerHTML = '<div class="boot"><img src="icon-192.png" alt="" width="72" height="72"><p>Data aa raha hai…</p></div>'; api('boot').then(function (d) { D = d; saveBoot(); render(); }).catch(function (e) { toast(e.message, true); logout(true); }); }
  else { render(); if (TOKEN) refresh(false); }
  setInterval(function () { if (TOKEN && D && document.visibilityState === 'visible' && !SHEET && !MENU) refresh(false); }, 120000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && TOKEN && D) refresh(false); });
  addEventListener('online', function () { if (D) { rerender(); refresh(false); } });
  addEventListener('offline', function () { if (D) rerender(); });
  addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); DPROMPT = e; if (D && !V.scr && V.tab === 'aaj') rerender(); });
  if ('serviceWorker' in navigator) addEventListener('load', function () { navigator.serviceWorker.register('sw.js'); });
})();
