/* =====================================================================
   EVOMYTH — Akıllı Tahta kontrol çubuğu (Evomyth-Tahta.html)
   Masaüstü kabuğu (Electron) varsa window.evoShell üzerinden pencere
   boyutu/kenarı yönetilir; yoksa sayfa tarayıcıda tam ekran çalışır.
   ===================================================================== */
(function () {
'use strict';
const EVO = window.EVO, esc = EVO.esc;
const $ = (s, r = document) => r.querySelector(s);
const shell = window.evoShell || null;
document.body.classList.add(shell ? 'shell' : 'browser');
const { db, auth } = EVO.initFirebase();
const QR_REFRESH_MS = 4.5 * 60 * 1000;
const ATT = [['var', 'Var'], ['devamsiz', 'Devamsız'], ['izinli', 'İzinli'], ['raporlu', 'Raporlu']];
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };

const B = window.Board = {
  teacher: null, cid: null, classes: [], d: {}, offs: [], panel: null, mode: 'login', side: 'right',
  hwMarks: null, qr: null, lastRewards: null,
  timer: { total: 300, left: 300, run: false, end: 0, iv: null },
  sw: { run: false, start: 0, acc: 0, laps: [], iv: null },
  wheel: { angle: 0, spinning: false, removed: new Set(), winner: '' },
};

/* ---------------- Pencere modları ---------------- */
function setMode(m) {
  B.mode = m;
  if (shell) shell.setMode(m);
}
async function initShell() {
  if (!shell) return;
  try { const st = await shell.getState(); B.side = st.side || 'right'; B.onTop = st.onTop !== false; } catch (_) {}
}
function openSite() {
  if (shell) shell.openSite(EVO.SITE); else window.open(EVO.SITE, '_blank', 'noopener');
}

/* =================================================================== */
/* GİRİŞ (QR)                                                           */
/* =================================================================== */
function loginShell(inner) {
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
  $('#login').innerHTML = `<div class="login-card">
    ${shell ? '<div class="win-ctl"><button id="w-min" title="Küçült">—</button><button id="w-close" title="Kapat">✕</button></div>' : ''}
    <img class="lg-logo" id="lg-logo" src="assets/evomyth_logo.png" alt="Evomyth — thegamifyclass.com">
    ${inner}
    <p class="emuted" style="font-size:.72rem;margin:10px 0 0">© 2026 Erincyus · <a href="#" id="lg-site" style="text-decoration:underline">www.thegamifyclass.com</a></p></div>`;
  $('#lg-logo').addEventListener('click', openSite);
  $('#lg-site').addEventListener('click', (e) => { e.preventDefault(); openSite(); });
  $('#w-min')?.addEventListener('click', () => shell.minimize());
  $('#w-close')?.addEventListener('click', () => shell.close());
}
async function startLogin(msg) {
  stopClass();
  B.teacher = null;
  setMode('login');
  loginShell(`<h2 class="evo-h" style="margin:6px 0 2px;font-size:1.15rem">Öğretmen Girişi</h2>
    <p class="emuted small" style="margin:0">Telefonunuzun kamerasıyla QR kodu okutun ve thegamifyclass.com hesabınızla giriş yapın.</p>
    <div class="qr" id="qr"><span class="emuted">Hazırlanıyor…</span></div>
    <p class="small" id="qr-status" style="min-height:1.3em">${msg ? `<span style="color:#ffc2c9">${esc(msg)}</span>` : ''}</p>
    <details style="text-align:left;margin-top:6px"><summary class="emuted small" style="cursor:pointer">Telefon yok mu? Bu cihazda e-posta ile giriş</summary>
      <form id="direct" style="margin-top:8px"><input class="einput" type="email" name="email" placeholder="E-posta" required style="margin-bottom:6px"><input class="einput" type="password" name="pw" placeholder="Şifre" required>
      <button class="ebtn primary wide" style="margin-top:8px">Giriş Yap</button><p class="eerr" id="d-err"></p></form></details>`);
  $('#direct').addEventListener('submit', directLogin);
  try {
    await auth.setPersistence(shell ? firebase.auth.Auth.Persistence.NONE : firebase.auth.Auth.Persistence.SESSION).catch(() => {});
    if (!auth.currentUser || !auth.currentUser.isAnonymous) { if (auth.currentUser) await auth.signOut(); await auth.signInAnonymously(); }
    await newQR();
  } catch (e) {
    console.error(e);
    const anonOff = String(e.code || '').includes('operation-not-allowed') || String(e.code || '').includes('admin-restricted');
    $('#qr').innerHTML = '<span style="font-size:3rem">⚠️</span>';
    $('#qr-status').innerHTML = `<span style="color:#ffc2c9">${anonOff ? 'Firebase\'de "Anonim" giriş yöntemi kapalı. Yönetici Firebase konsolundan açmalı (kurulum rehberi, 2. adım).' : 'Bağlantı kurulamadı: ' + esc(EVO.authError(e))}</span><br><button class="ebtn sm" id="retry" style="margin-top:6px">Tekrar dene</button>`;
    $('#retry').addEventListener('click', () => startLogin());
  }
}
async function newQR() {
  if (B.qr) { B.qr.off(); clearTimeout(B.qr.t); EVO.ref(`boardReq/${B.qr.code}`).remove().catch(() => {}); }
  const code = EVO.Board.newCode();
  await EVO.Board.request(code);
  const url = EVO.isMock() ? new URL(`Evomyth.html?mock=1#tahta=${code}`, location.href).href : EVO.Board.qrURL(code);
  const box = $('#qr');
  if (!box) return;
  if (window.qrcode) { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 5, margin: 0, scalable: true }); }
  else box.innerHTML = `<a href="${url}" style="color:#000;word-break:break-all;font-size:.7rem">${url}</a>`;
  if (EVO.isMock()) box.title = url;
  window.__evoQR = url; // (test için)
  const exp = Date.now() + QR_REFRESH_MS;
  $('#qr-status').innerHTML = `<span class="emuted">Kod ${new Date(exp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'e kadar geçerli, sonra yenilenir.</span>`;
  const ref = EVO.ref(`boardReq/${code}/ok`);
  const cb = ref.on('value', async (s) => {
    if (!s.val()) return;
    $('#qr-status').textContent = '✅ Onaylandı, açılıyor…';
    ref.off('value', cb); clearTimeout(B.qr.t);
    const rec = (await EVO.ref(`boards/${auth.currentUser.uid}`).once('value')).val();
    EVO.ref(`boardReq/${code}`).remove().catch(() => {});
    B.qr = null;
    if (!rec) return startLogin('Onay okunamadı, tekrar deneyin.');
    unlock({ uid: rec.teacher, name: rec.name, school: rec.school, quota: rec.quota, exp: rec.exp, direct: false });
  });
  B.qr = { code, off: () => ref.off('value', cb), t: setTimeout(() => newQR().catch(console.error), QR_REFRESH_MS) };
}
async function directLogin(e) {
  e.preventDefault();
  const f = e.target, err = $('#d-err');
  err.textContent = '';
  try {
    if (B.qr) { B.qr.off(); clearTimeout(B.qr.t); B.qr = null; }
    if (auth.currentUser && auth.currentUser.isAnonymous) await auth.signOut();
    const cr = await auth.signInWithEmailAndPassword(f.email.value.trim(), f.pw.value);
    const rec = await EVO.T.teacherRecord(cr.user.uid);
    if (!EVO.T.isActive(rec)) { await auth.signOut(); return startLogin(!rec ? 'Öğretmen kaydı bulunamadı.' : 'Hesabınızın Evomyth sınıf kotası 0 ya da hesap askıda.'); }
    unlock({ uid: cr.user.uid, name: rec.displayName || rec.email, school: rec.school, quota: Number(rec.evMaxClasses), exp: Infinity, direct: true });
  } catch (ex) { err.textContent = EVO.authError(ex); }
}
async function resume() {
  await initShell();
  const u = auth.currentUser;
  if (u && u.isAnonymous) {
    const rec = (await EVO.ref(`boards/${u.uid}`).once('value').catch(() => null))?.val();
    if (rec && rec.exp > EVO.now()) return unlock({ uid: rec.teacher, name: rec.name, school: rec.school, quota: rec.quota, exp: rec.exp, direct: false });
  } else if (u && !String(u.email || '').endsWith('@' + EVO.STUDENT_DOMAIN)) {
    const rec = await EVO.T.teacherRecord(u.uid).catch(() => null);
    if (EVO.T.isActive(rec)) return unlock({ uid: u.uid, name: rec.displayName || rec.email, school: rec.school, quota: Number(rec.evMaxClasses), exp: Infinity, direct: true });
  }
  startLogin();
}
async function logout() {
  const u = auth.currentUser;
  if (u && u.isAnonymous) await EVO.ref(`boards/${u.uid}`).remove().catch(() => {});
  await auth.signOut().catch(() => {});
  startLogin();
}

/* =================================================================== */
/* ANA UYGULAMA                                                         */
/* =================================================================== */
async function unlock(t) {
  B.teacher = t;
  $('#login').classList.add('hidden');
  $('#login').innerHTML = '';
  $('#app').classList.remove('hidden');
  applySide();
  B.classes = await EVO.T.classesOf(t.uid).catch((e) => { console.warn(e); return []; });
  const saved = ls.get('evo-board-cid-' + t.uid, null);
  const cid = (B.classes.find((c) => c.cid === saved) || B.classes[0] || {}).cid;
  renderBar();
  if (cid) selectClass(cid); else { setMode('expanded'); openPanel('ayarlar'); }
  clearInterval(B.expIv);
  B.expIv = setInterval(() => { if (B.teacher && !B.teacher.direct && EVO.now() > B.teacher.exp) startLogin('Tahta oturumunun süresi doldu (en fazla ' + EVO.BOARD_HOURS + ' saat). QR ile yeniden giriş yapın.'); }, 60000);
}
function applySide() {
  const app = $('#app');
  app.classList.remove('side-left', 'side-right', 'side-top');
  app.classList.add('side-' + (shell ? B.side : ls.get('evo-board-side', 'left')));
}
function stopClass() {
  B.offs.forEach((f) => { try { f(); } catch (_) {} });
  B.offs = []; B.d = {}; B.hwMarks = null;
}
function selectClass(cid) {
  stopClass();
  B.cid = cid;
  ls.set('evo-board-cid-' + B.teacher.uid, cid);
  const day = EVO.dayKey(EVO.now());
  const on = (path, key) => { const r = EVO.ref(`classes/${cid}/${path}`); const cb = r.on('value', (s) => { B.d[key] = s.val(); changed(key); }, (e) => EVO.toast(EVO.authError(e), true)); B.offs.push(() => r.off('value', cb)); };
  on('meta', 'meta'); on('students', 'students'); on('panteon', 'panteon'); on(`attendance/${day}`, 'att'); on('lb', 'lb'); on('raidHistory', 'raidHistory');
  const hr = EVO.ref(`classes/${cid}/hw`).orderByKey().limitToLast(1);
  const hcb = hr.on('value', (s) => { B.d.lastHw = s.val(); });
  B.offs.push(() => hr.off('value', hcb));
  renderBar();
  if (B.panel) renderPanel(); else setMode('dock');
}
function changed(key) {
  if (key === 'meta' || key === 'students') renderBar();
  if (!B.panel) return;
  const a = document.activeElement;
  if (a && ['INPUT', 'SELECT', 'TEXTAREA'].includes(a.tagName) && $('#p-body').contains(a)) return; // yazarken bozulmasın
  if (['yoklama', 'liste', 'odev', 'sinifep'].includes(B.panel)) renderPanel();
}
const students = () => Object.entries(B.d.students || {}).sort((a, b) => a[1].name.localeCompare(b[1].name, 'tr'));
const attOf = (sid) => (B.d.att || {})[sid] || 'var';
const ownedCount = (sid) => Object.keys((B.d.panteon || {})[sid] || {}).length;

/* ---------------- Kontrol çubuğu ---------------- */
const ITEMS = [
  ['yoklama', '📋', 'Yoklama'], ['liste', '👥', 'Sınıf Listesi'], ['ekle', '➕', 'Sınıf Ekle'], ['odev', '📚', 'Ödev Kontrolü'],
  ['cark', '🎡', 'Çark'], ['sure', '⏱️', 'Süre'], ['sinifep', '', 'Sınıf EP'], ['ayarlar', '⚙️', 'Ayarlar'],
];
function renderBar() {
  const bar = $('#bar');
  if (!bar || !B.teacher) return;
  const m = B.d.meta || {}, ep = m.classEP || 0, p = Math.min(1, ep / EVO.CLASS_GOAL);
  const absent = Object.values(B.d.att || {}).filter(Boolean).length;
  const timerBadge = B.timer.run ? fmtMS(Math.max(0, B.timer.end - Date.now())) : B.sw.run ? '⏱' : '';
  bar.innerHTML = `<img class="bar-logo" id="bar-logo" src="assets/evomyth_logo.png" alt="Evomyth" title="www.thegamifyclass.com">
    <div class="cls-name" title="Seçili sınıf">${esc(m.name || '—')}</div><div class="bar-sep"></div>
    ${ITEMS.map(([k, ic, label]) => k === 'sinifep'
      ? `<button class="bb${B.panel === k ? ' on' : ''}" data-p="${k}" title="Sınıf EP sayacı: ${ep} / ${EVO.CLASS_GOAL}"><span class="ring${ep >= EVO.CLASS_GOAL ? ' full' : ''}" style="--p:${p}"><span>${ep}<br><small>/${EVO.CLASS_GOAL}</small></span></span>${label}</button>`
      : `<button class="bb${B.panel === k ? ' on' : ''}" data-p="${k}"><span class="ic">${ic}</span>${label}${k === 'yoklama' && absent ? `<span class="badge">${absent}</span>` : ''}${k === 'sure' && timerBadge ? `<span class="badge" style="background:var(--em-copper)">${timerBadge}</span>` : ''}</button>`).join('')}
    ${shell ? `<div class="bar-sep"></div><button class="bb" id="bar-min" title="Küçült"><span class="ic">➖</span>Küçült</button>` : ''}`;
  bar.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => (B.panel === b.dataset.p ? closePanel() : openPanel(b.dataset.p))));
  $('#bar-logo').addEventListener('click', openSite);
  $('#bar-min')?.addEventListener('click', () => shell.minimize());
}
const TITLES = { yoklama: '📋 Yoklama', liste: '👥 Sınıf Listesi', ekle: '➕ Sınıf Ekle', odev: '📚 Ödev Kontrolü', cark: '🎡 Çark', sure: '⏱️ Süre', sinifep: '🏆 Sınıf EP Sayacı', ayarlar: '⚙️ Ayarlar' };
function openPanel(k) {
  if (!B.cid && k !== 'ayarlar') { EVO.toast('Önce bir sınıf oluşturun.', true); k = 'ayarlar'; }
  B.panel = k;
  $('#panel').classList.remove('closed');
  setMode('expanded');
  renderBar(); renderPanel();
}
function closePanel() {
  B.panel = null;
  $('#panel').classList.add('closed');
  $('#p-title').textContent = ''; $('#p-body').innerHTML = shell ? '' : '<p class="emuted">Soldaki çubuktan bir araç seçin.</p>';
  setMode('dock'); renderBar();
}
$('#p-close').addEventListener('click', closePanel);
function renderPanel() {
  $('#p-title').textContent = TITLES[B.panel] || '';
  const body = $('#p-body');
  const top = body.scrollTop;
  ({ yoklama: pYoklama, liste: pListe, ekle: pEkle, odev: pOdev, cark: pCark, sure: pSure, sinifep: pSinifEP, ayarlar: pAyarlar })[B.panel](body);
  body.scrollTop = top;
}

/* ---------------- Tahtada büyük gösterim ---------------- */
function present(title, html, onClose) {
  B.prevMode = B.mode;
  document.body.classList.add('present');
  setMode('present');
  $('#pv-title').textContent = title;
  $('#pv-body').innerHTML = html;
  const close = () => { document.body.classList.remove('present'); $('#pv-body').innerHTML = ''; setMode(B.panel ? 'expanded' : 'dock'); onClose && onClose(); };
  $('#pv-close').onclick = close;
  return { body: $('#pv-body'), close };
}
// Ödül listesi: öğretmen "Kapat" demeden kapanmaz
function showRewards(title, list) {
  B.lastRewards = { title, list };
  const rows = list.map((r, i) => {
    if (!r.eid) return `<div class="reward-row" style="--tc:#e0915f;animation-delay:${i * 70}ms"><span class="sym">💰</span><span><b>${esc(r.name)}</b> <span class="arrow">→</span> Tüm Evoletlere sahip! +${EVO.ALL_OWNED_BONUS_EP} EP bonus</span></div>`;
    const ev = EVO.BY_ID[r.eid], ti = EVO.TYPE_INFO[ev.type];
    return `<div class="reward-row" style="--tc:${ti.color};animation-delay:${i * 70}ms">${EVO.thumbHTML(ev.id, 1)}<span><b>${esc(r.name)}</b> <span class="arrow">→</span> <b class="evn">${esc(ev.name)}</b> (${ti.name}) Panteon'a eklendi!${r.reason === 'ruh' ? ' 🔮 <i>5 ödev serisi ödülü!</i>' : ''}</span></div>`;
  }).join('');
  const p = present(title, `<div class="reward-list">${rows || '<p class="emuted">Bu sefer Evolet kazanan olmadı.</p>'}</div><button class="ebtn primary lg wide" id="rw-close" style="margin-top:10px">Kapat</button>`);
  $('#rw-close').addEventListener('click', p.close);
}

/* =================================================================== */
/* PANELLER                                                             */
/* =================================================================== */
function pYoklama(body) {
  const list = students(), day = EVO.dayKey(EVO.now());
  const counts = ATT.map(([k, l]) => `${l}: ${list.filter(([sid]) => attOf(sid) === k).length}`).join(' · ');
  body.innerHTML = `<p class="emuted small">${new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${counts}</p>
    <div class="enote warn small">Devamsız / İzinli / Raporlu işaretlenen öğrencilerin <b>ödev serisi dondurulur</b> (bozulmaz); o günün ödev kontrolünde otomatik "Yok" sayılır.</div>
    ${list.map(([sid, s]) => `<div class="srow"><span class="nm">${esc(s.name)}</span><span class="seg">${ATT.map(([k, l]) => `<button class="v-${k}${attOf(sid) === k ? ' on' : ''}" data-sid="${sid}" data-v="${k}">${l}</button>`).join('')}</span></div>`).join('') || '<p class="emuted">Sınıfta öğrenci yok. "Sınıf Ekle"den ekleyin.</p>'}`;
  body.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => EVO.T.setAttendance(B.cid, day, b.dataset.sid, b.dataset.v === 'var' ? null : b.dataset.v).catch((e) => EVO.toast(EVO.authError(e), true))));
}

function pListe(body) {
  const now = EVO.now(), plat = EVO.platinumSet(B.d.lb, now), drag = EVO.dragonSet(B.d.raidHistory, now);
  const list = students();
  body.innerHTML = `<p class="emuted small">Öğrenciye dokunun: EP verin/düşün, Panteon'unu tahtada gösterin.</p>
    <div class="stu-grid">${list.map(([sid, s]) => `<button class="stu${attOf(sid) !== 'var' ? ' absent' : ''}${plat.has(sid) ? ' tag-platinum' : ''}${drag.has(sid) ? ' tag-flame' : ''}" data-sid="${sid}">
      <div class="n">${drag.has(sid) ? '🐉 ' : ''}${esc(s.name)}</div><div class="e">💠 ${s.ep || 0} EP</div><div class="c">🏛 ${ownedCount(sid)} · 🔮 ${(s.streak || 0) % EVO.RUH_STREAK}/${EVO.RUH_STREAK}</div></button>`).join('') || '<p class="emuted">Sınıfta öğrenci yok.</p>'}</div>`;
  body.querySelectorAll('[data-sid]').forEach((b) => b.addEventListener('click', () => studentSheet(b.dataset.sid)));
}
function studentSheet(sid) {
  const s = (B.d.students || {})[sid];
  if (!s) return;
  const beh = (arr, cls) => arr.map((x) => `<button class="${cls}" data-ep="${x.ep}" data-k="${x.k}">${x.icon} ${esc(x.label)}<b>${x.ep > 0 ? '+' : ''}${x.ep}</b></button>`).join('');
  const m = EVO.modal(`<div class="spread"><h2>${esc(s.name)}</h2><span class="ep-pill" id="ss-ep">💠 ${s.ep || 0} EP</span></div>
    <p class="emuted small">Kullanıcı adı: <b>${esc(s.username)}</b> · Evolet: ${ownedCount(sid)} · Ödev serisi: ${s.streak || 0} · Yapılan ödev: ${s.hwDone || 0}</p>
    <h3 class="evo-h" style="margin:8px 0 6px;font-size:.95rem">Olumlu davranış</h3><div class="beh">${beh(EVO.BEHAVIORS.plus, 'p')}</div>
    <h3 class="evo-h" style="margin:12px 0 6px;font-size:.95rem">Olumsuz davranış</h3><div class="beh">${beh(EVO.BEHAVIORS.minus, 'm')}</div>
    <div class="row" style="margin-top:12px"><input class="einput" id="ss-amt" type="number" placeholder="Özel EP (ör. 7 ya da -4)" style="max-width:220px;margin:0"><button class="ebtn sm" id="ss-apply">Uygula</button></div>
    <div class="row" style="margin-top:14px">
      <button class="ebtn copper sm" id="ss-pan">🏛 Panteon'u tahtada göster</button>
      <button class="ebtn sm" id="ss-pw">🔑 Şifreyi göster / yenile</button>
      <button class="ebtn sm" id="ss-ren">✏️ Adı düzenle</button>
      <button class="ebtn danger sm" id="ss-del">🗑 Sınıftan sil</button>
      <button class="ebtn primary sm" data-close style="margin-left:auto">Kapat</button></div>`, { width: 620 });
  const give = async (ep, k) => {
    try { const applied = await EVO.T.award(B.cid, sid, ep, k); EVO.toast(`${s.name}: ${applied >= 0 ? '+' : ''}${applied} EP`); const cur = (B.d.students || {})[sid]; $('#ss-ep', m).textContent = `💠 ${(cur && cur.ep) || 0} EP`; }
    catch (e) { EVO.toast(EVO.authError(e), true); }
  };
  m.querySelectorAll('[data-ep]').forEach((b) => b.addEventListener('click', () => give(+b.dataset.ep, b.dataset.k)));
  $('#ss-apply', m).addEventListener('click', () => { const n = parseInt($('#ss-amt', m).value, 10); if (n) give(n, 'ozel'); });
  $('[data-close]', m).addEventListener('click', () => m.close());
  $('#ss-pan', m).addEventListener('click', () => { m.close(); showPanteon(sid); });
  $('#ss-ren', m).addEventListener('click', async () => { const n = prompt('Yeni ad soyad:', s.name); if (n && n.trim()) { await EVO.T.renameStudent(B.cid, sid, n); m.close(); } });
  $('#ss-del', m).addEventListener('click', async () => {
    if (!confirm(`${s.name} sınıftan silinsin mi? Hesabı, EP'leri ve tüm Evoletleri silinir. Bu işlem geri alınamaz.`)) return;
    try { await EVO.T.deleteStudent(B.cid, sid); m.close(); EVO.toast('Öğrenci silindi.'); } catch (e) { EVO.toast(EVO.authError(e), true); }
  });
  $('#ss-pw', m).addEventListener('click', async () => {
    const c = ((await EVO.T.credentials(B.cid)) || {})[sid] || {};
    const n = prompt(`${s.name}\nKullanıcı adı: ${c.u || s.username}\nŞifre: ${c.p || '?'}\n\nYeni şifre vermek için yazın (boş bırakırsanız otomatik üretilir), vazgeçmek için İptal:`, '');
    if (n === null) return;
    try { const pw = await EVO.T.resetPassword(B.cid, sid, n); alert(`Yeni şifre: ${pw}`); } catch (e) { EVO.toast(EVO.authError(e), true); }
  });
}
function showPanteon(sid) {
  const s = (B.d.students || {})[sid], now = EVO.now();
  const p = (B.d.panteon || {})[sid] || {};
  const plat = EVO.platinumSet(B.d.lb, now), drag = EVO.dragonSet(B.d.raidHistory, now);
  const cards = Object.entries(p).sort((a, b) => (b[1].level || 1) - (a[1].level || 1)).map(([eid, e]) => EVO.cardHTML({ eid, level: e.level || 1, rest: e.rest }, { now, frame: plat.has(sid) ? 'platinum' : '', dragon: drag.has(sid) })).join('');
  present(`🏛 ${s.name} — Panteon (${Object.keys(p).length} / ${EVO.EVOLETS.length})`, cards ? `<div class="evo-grid">${cards}</div>` : '<p class="emuted">Henüz Evolet yok.</p>');
}

/* ---------------- Sınıf Ekle ---------------- */
function pEkle(body) {
  body.innerHTML = `<h3 style="margin-top:0">Tek tek ekle</h3>
    <form id="add1"><input class="einput" name="name" placeholder="Ad Soyad" required>
      <div class="row" style="margin-top:6px"><input class="einput" name="user" placeholder="Kullanıcı adı (boşsa otomatik)" style="flex:1;margin:0"><input class="einput" name="pw" placeholder="Şifre (boşsa otomatik)" style="flex:1;margin:0"></div>
      <button class="ebtn primary wide" style="margin-top:8px">➕ Öğrenciyi Ekle</button><p class="eerr" id="add1-err"></p></form>
    <h3>Excel'den toplu ekle</h3>
    <p class="emuted small">Sütunlar: <b>Ad Soyad</b> · <b>Kullanıcı Adı</b> (isteğe bağlı) · <b>Şifre</b> (isteğe bağlı). Boş bırakılan kullanıcı adı ve şifreler otomatik üretilir.</p>
    <div class="row"><button class="ebtn sm" id="tpl">⬇ Örnek Excel şablonunu indir</button><label class="ebtn copper sm" style="cursor:pointer">📂 Excel dosyası seç<input type="file" id="xfile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label></div>
    <div id="xprev"></div>
    <h3>Şifre listesi</h3><p class="emuted small">Öğrencilerin kullanıcı adı ve şifrelerini Excel olarak indirip dağıtabilirsiniz.</p>
    <button class="ebtn sm" id="creds">📊 Şifre listesini indir</button>
    <p class="emuted small" style="margin-top:14px">Öğrenciler <b>www.thegamifyclass.com/Evomyth.html</b> adresinden bu bilgilerle girer.</p>`;
  $('#add1').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, err = $('#add1-err'), btn = f.querySelector('button');
    err.textContent = ''; btn.disabled = true;
    try {
      const row = { name: f.name.value, username: f.user.value.trim(), password: f.pw.value.trim() };
      const r = row.username ? await EVO.T.addStudent(B.cid, row) : await EVO.T.addStudentAuto(B.cid, row);
      err.innerHTML = `<span style="color:var(--em-ok)">✓ Eklendi — kullanıcı adı: <b>${esc(r.username)}</b> · şifre: <b>${esc(r.password)}</b></span>`;
      f.reset();
    } catch (ex) { err.textContent = ex.message || EVO.authError(ex); }
    btn.disabled = false;
  });
  $('#tpl').addEventListener('click', () => EVO.Xlsx.download(EVO.templateXlsx(), 'Evomyth-Ogrenci-Sablonu.xlsx'));
  $('#creds').addEventListener('click', downloadCreds);
  $('#xfile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const rows = EVO.parseStudentRows(await EVO.Xlsx.read(await file.arrayBuffer()));
      if (!rows.length) throw new Error('Dosyada öğrenci bulunamadı. Şablondaki gibi "Ad Soyad" sütunu olmalı.');
      importPreview(rows);
    } catch (ex) { $('#xprev').innerHTML = `<div class="enote bad">${esc(ex.message)}</div>`; }
    e.target.value = '';
  });
}
function importPreview(rows) {
  const seen = new Set();
  rows.forEach((r) => {
    r.err = '';
    if (r.username && !EVO.validUsername(r.username)) r.err = 'Kullanıcı adı geçersiz';
    if (r.password && r.password.length < 6) r.err = 'Şifre en az 6 karakter';
    if (r.username) { if (seen.has(r.username)) r.err = 'Dosyada aynı kullanıcı adı iki kez var'; seen.add(r.username); }
  });
  const ok = rows.filter((r) => !r.err).length;
  const box = $('#xprev');
  box.innerHTML = `<div class="enote ${ok === rows.length ? 'ok' : 'warn'}">${rows.length} satır okundu · ${ok} hesap oluşturulabilir.</div>
    <table class="tbl" id="xtbl"><thead><tr><th>Ad Soyad</th><th>Kullanıcı adı</th><th>Şifre</th><th>Durum</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr class="${r.err ? 'err' : ''}" data-i="${i}"><td>${esc(r.name)}</td><td>${esc(r.username || '(otomatik)')}</td><td>${esc(r.password || '(otomatik)')}</td><td class="st">${esc(r.err || 'Hazır')}</td></tr>`).join('')}</tbody></table>
    <button class="ebtn primary wide" id="xgo" style="margin-top:8px" ${ok ? '' : 'disabled'}>✅ ${ok} Öğrenci Hesabını Oluştur</button>`;
  $('#xgo').addEventListener('click', async () => {
    $('#xgo').disabled = true;
    const created = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], tr = box.querySelector(`tr[data-i="${i}"]`), st = tr.querySelector('.st');
      if (r.err) continue;
      st.textContent = '⏳ Oluşturuluyor…';
      try {
        const res = r.username ? await EVO.T.addStudent(B.cid, r) : await EVO.T.addStudentAuto(B.cid, r);
        created.push({ name: r.name, ...res });
        tr.children[1].textContent = res.username; tr.children[2].textContent = res.password; st.textContent = '✓ Oluşturuldu';
      } catch (ex) { tr.classList.add('err'); st.textContent = '✗ ' + (ex.message || EVO.authError(ex)); }
      await new Promise((ok2) => setTimeout(ok2, 250)); // Firebase hız sınırına takılmamak için
    }
    $('#xgo').outerHTML = `<div class="enote ok">${created.length} hesap oluşturuldu.</div><button class="ebtn copper wide" id="xdl">📊 Oluşturulan hesapları Excel olarak indir</button>`;
    $('#xdl').addEventListener('click', () => EVO.Xlsx.download(credsXlsx(created.map((c) => [c.name, c.username, c.password])), `Evomyth ${(B.d.meta || {}).name || ''} yeni hesaplar.xlsx`));
  });
}
const credsXlsx = (rows) => EVO.Xlsx.build([{ name: 'Öğrenciler', widths: [28, 24, 14], rows: [[{ v: 'Ad Soyad', s: 1 }, { v: 'Kullanıcı Adı', s: 1 }, { v: 'Şifre', s: 1 }], ...rows, [], [{ v: 'Giriş: www.thegamifyclass.com/Evomyth.html', s: 5 }]] }]);
async function downloadCreds() {
  const c = await EVO.T.credentials(B.cid);
  const rows = students().map(([sid, s]) => [s.name, (c[sid] || {}).u || s.username, (c[sid] || {}).p || '']);
  EVO.Xlsx.download(credsXlsx(rows), `Evomyth ${(B.d.meta || {}).name || ''} şifreler.xlsx`);
}

/* ---------------- Ödev Kontrolü ---------------- */
function pOdev(body) {
  const list = students();
  if (!B.hwMarks) B.hwMarks = {};
  // Yoklamada yok olanlar "Yok"; diğerleri başlangıçta "Yapmadı" (öğretmen "Tümü Yaptı" ile hepsini çevirir)
  list.forEach(([sid]) => { if (attOf(sid) !== 'var') B.hwMarks[sid] = 'absent'; else if (!B.hwMarks[sid]) B.hwMarks[sid] = 'missed'; });
  const n = (v) => list.filter(([sid]) => B.hwMarks[sid] === v).length;
  const last = Object.values(B.d.lastHw || {})[0];
  const today = last && last.day === EVO.dayKey(EVO.now());
  body.innerHTML = `
    ${today ? `<div class="enote warn small">Bugün ${new Date(last.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'de bir ödev kontrolü zaten yapıldı. Yeni bir ödev için tekrar yapabilirsiniz.</div>` : ''}
    <button class="ebtn primary wide lg" id="hw-all">✅ Tüm Sınıfa "Ödev Yaptı" İşaretle</button>
    <p class="emuted small" style="margin:8px 0">Sonra yalnızca yapmayanlara dokunun. Yoklamada Devamsız/İzinli/Raporlu olanlar "Yok" sayılır ve serileri dondurulur. 🔮 5 ardışık ödevde Ruh türü Evolet!</p>
    <p class="small"><b style="color:var(--em-ok)">Yaptı: ${n('done')}</b> · <b style="color:var(--em-danger)">Yapmadı: ${n('missed')}</b> · <b style="color:#9fb3ff">Yok: ${n('absent')}</b></p>
    ${list.map(([sid, s]) => { const nx = (s.streak || 0) + 1; return `<div class="srow"><span class="nm">${esc(s.name)}<br><span class="meta">🔮 seri ${s.streak || 0}${nx % EVO.RUH_STREAK === 0 && B.hwMarks[sid] !== 'absent' ? ' · <b style="color:#c3b8ff">bu ödevde Ruh!</b>' : ''}</span></span>
      <span class="seg">${[['done', 'Yaptı'], ['missed', 'Yapmadı'], ['absent', 'Yok']].map(([k, l]) => `<button class="v-${k}${B.hwMarks[sid] === k ? ' on' : ''}" data-sid="${sid}" data-v="${k}">${l}</button>`).join('')}</span></div>`; }).join('') || '<p class="emuted">Sınıfta öğrenci yok.</p>'}
    <button class="ebtn copper wide lg" id="hw-ok" style="margin-top:10px" ${list.length ? '' : 'disabled'}>🎁 Onayla ve Evoletleri Dağıt</button>
    ${B.lastRewards ? '<button class="ebtn wide" id="hw-last" style="margin-top:8px">Son ödül listesini tekrar göster</button>' : ''}`;
  $('#hw-all').addEventListener('click', () => { list.forEach(([sid]) => { if (B.hwMarks[sid] !== 'absent') B.hwMarks[sid] = 'done'; }); renderPanel(); });
  body.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { B.hwMarks[b.dataset.sid] = b.dataset.v; renderPanel(); }));
  $('#hw-last')?.addEventListener('click', () => showRewards(B.lastRewards.title, B.lastRewards.list));
  $('#hw-ok').addEventListener('click', async () => {
    const marks = {};
    list.forEach(([sid]) => { marks[sid] = B.hwMarks[sid] || 'missed'; });
    if (!confirm(`Ödev kontrolü onaylansın mı?\nYaptı: ${n('done')} · Yapmadı: ${n('missed')} · Yok: ${n('absent')}\n\nYapanlara +${EVO.HOMEWORK_EP} EP ve 1 Evolet, yapmayanlara ${EVO.HOMEWORK_MISS_EP} EP.`)) return;
    $('#hw-ok').disabled = true;
    try { const rewards = await EVO.T.homework(B.cid, marks); B.hwMarks = null; renderPanel(); showRewards('📚 Ödev Kontrolü — Yeni Evoletler', rewards); }
    catch (e) { EVO.toast(EVO.authError(e), true); $('#hw-ok').disabled = false; }
  });
}

/* ---------------- Çark ---------------- */
const WHEEL_COLORS = ['#12a26a', '#132a57', '#e0915f', '#2f9bff', '#a347f0', '#b3772f', '#0d7a4f', '#7f6bff', '#ff5a1f', '#55c8f5'];
function pCark(body) {
  const w = B.wheel;
  const pool = students().filter(([sid]) => attOf(sid) === 'var' && !w.removed.has(sid));
  body.innerHTML = `<div class="wheel-wrap"><canvas id="wheel" width="440" height="440"></canvas></div>
    <div class="winner" id="winner">${esc(w.winner)}</div>
    <div class="row" style="justify-content:center;margin-top:8px"><button class="ebtn primary lg" id="spin" ${pool.length < 1 ? 'disabled' : ''}>🎡 Çevir</button>
      <button class="ebtn" id="w-big">🖥 Tahtada büyüt</button></div>
    <label class="emuted small" style="display:flex;gap:6px;align-items:center;justify-content:center;margin-top:10px"><input type="checkbox" id="w-rm" ${ls.get('evo-wheel-rm', true) ? 'checked' : ''}> Seçilen öğrenci bir sonraki çevirişte çarktan çıksın</label>
    <p class="center emuted small">Çarkta ${pool.length} öğrenci (yoklamada olmayanlar dahil edilmez).${w.removed.size ? ` <button class="linkbtn ebtn sm" id="w-reset">Çarkı sıfırla (${w.removed.size} çıkarılan)</button>` : ''}</p>`;
  drawWheel($('#wheel'), pool.map(([, s]) => s.name), w.angle);
  $('#w-rm').addEventListener('change', (e) => ls.set('evo-wheel-rm', e.target.checked));
  $('#w-reset')?.addEventListener('click', () => { w.removed.clear(); w.winner = ''; renderPanel(); });
  $('#spin').addEventListener('click', () => spinWheel($('#wheel'), pool, () => renderPanel()));
  $('#w-big').addEventListener('click', () => {
    const p = present('🎡 Çark', `<div class="wheel-wrap" style="width:min(80vh,100%)"><canvas id="wheel-big" width="720" height="720"></canvas></div><div class="winner" id="winner-big" style="font-size:3rem">${esc(w.winner)}</div><div class="center"><button class="ebtn primary lg" id="spin-big">🎡 Çevir</button></div>`, () => renderPanel());
    const pool2 = () => students().filter(([sid]) => attOf(sid) === 'var' && !w.removed.has(sid));
    drawWheel($('#wheel-big'), pool2().map(([, s]) => s.name), w.angle);
    $('#spin-big').addEventListener('click', () => spinWheel($('#wheel-big'), pool2(), () => { $('#winner-big').textContent = w.winner; drawWheel($('#wheel-big'), pool2().map(([, s]) => s.name), w.angle); }, '#winner-big'));
  });
}
function drawWheel(cv, names, angle) {
  if (!cv) return;
  const g = cv.getContext('2d'), W = cv.width, R = W / 2 - 6, n = Math.max(1, names.length);
  g.clearRect(0, 0, W, W);
  g.save(); g.translate(W / 2, W / 2); g.rotate(angle);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a1); g.closePath();
    g.fillStyle = names.length ? WHEEL_COLORS[i % WHEEL_COLORS.length] : '#333'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.stroke();
    if (!names.length) continue;
    g.save(); g.rotate((a0 + a1) / 2); g.textAlign = 'right'; g.fillStyle = '#fff';
    // Yazı dilime ve göbeğe sığacak kadar küçültülür
    let fs = Math.max(11, Math.min(W / 17, (W / 18) * Math.min(1, 14 / n) + 6));
    const label = names[i].length > 20 ? names[i].slice(0, 19) + '…' : names[i], maxW = R * 0.78 - 12;
    g.font = `700 ${fs}px Inter, sans-serif`;
    const mw = g.measureText(label).width;
    if (mw > maxW) { fs = Math.max(9, fs * maxW / mw); g.font = `700 ${fs}px Inter, sans-serif`; }
    g.fillText(label, R - 12, fs * 0.35); g.restore();
  }
  g.restore();
  g.beginPath(); g.arc(W / 2, W / 2, W * 0.07, 0, Math.PI * 2); g.fillStyle = '#0a1c2b'; g.fill(); g.strokeStyle = '#e0915f'; g.lineWidth = 4; g.stroke();
}
function spinWheel(cv, pool, done, winnerSel) {
  const w = B.wheel;
  if (w.spinning || !pool.length) return;
  if (w.lastSid && ls.get('evo-wheel-rm', true)) { w.removed.add(w.lastSid); pool = pool.filter(([sid]) => sid !== w.lastSid); w.lastSid = null; if (!pool.length) { w.winner = 'Herkes seçildi! Çarkı sıfırlayın.'; done(); return; } }
  w.spinning = true;
  const names = pool.map(([, s]) => s.name), n = names.length;
  const pick = Math.floor(Math.random() * n);
  // Üstteki işaret (−90°) seçilen dilimin ortasına gelsin
  const target = -Math.PI / 2 - ((pick + 0.5) / n) * Math.PI * 2;
  const start = w.angle, turns = 6 + Math.floor(Math.random() * 3);
  let delta = ((target - start) % (Math.PI * 2) + Math.PI * 4) % (Math.PI * 2) + turns * Math.PI * 2;
  const t0 = performance.now(), dur = 4800;
  const el = $(winnerSel || '#winner'); if (el) el.textContent = '…';
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
    w.angle = start + delta * e;
    drawWheel(cv, names, w.angle);
    if (k < 1) return requestAnimationFrame(step);
    w.spinning = false; w.winner = '🎉 ' + names[pick]; w.lastSid = pool[pick][0];
    beep(880, 0.15);
    done();
  };
  requestAnimationFrame(step);
}

/* ---------------- Süre (geri sayım + kronometre) ---------------- */
const fmtMS = (ms) => { const s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const fmtSW = (ms) => { const cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`; };
let audioCtx = null;
function beep(freq, dur, times) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < (times || 1); i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + i * (dur + 0.12);
      o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.start(t); o.stop(t + dur);
    }
  } catch (_) {}
}
function pSure(body, big) {
  const T = B.timer, S = B.sw;
  const left = T.run ? Math.max(0, T.end - Date.now()) : T.left * 1000;
  const html = `<h3 style="margin-top:0">⏳ Geri Sayım</h3>
    <div class="bigtime${T.alarm ? ' alarm' : ''}" id="t-disp">${fmtMS(left)}</div>
    <div class="row" style="justify-content:center">${[1, 2, 3, 5, 10, 15, 20].map((m) => `<button class="ebtn sm" data-min="${m}">${m} dk</button>`).join('')}
      <input class="einput" id="t-custom" type="number" min="1" max="180" placeholder="dk" style="width:80px;margin:0"></div>
    <div class="row" style="justify-content:center;margin-top:10px"><button class="ebtn primary lg" id="t-go">${T.run ? '⏸ Durdur' : '▶ Başlat'}</button><button class="ebtn lg" id="t-reset">↺ Sıfırla</button></div>
    <h3>⏱ Kronometre</h3>
    <div class="bigtime" id="s-disp">${fmtSW(S.acc + (S.run ? Date.now() - S.start : 0))}</div>
    <div class="row" style="justify-content:center"><button class="ebtn primary lg" id="s-go">${S.run ? '⏸ Durdur' : '▶ Başlat'}</button><button class="ebtn lg" id="s-lap" ${S.run ? '' : 'disabled'}>🏁 Tur</button><button class="ebtn lg" id="s-reset">↺ Sıfırla</button></div>
    <div class="small emuted" style="text-align:center;margin-top:8px">${S.laps.map((l, i) => `Tur ${i + 1}: <b style="color:var(--em-text)">${fmtSW(l)}</b>`).join(' · ')}</div>
    ${big ? '' : '<div class="center" style="margin-top:14px"><button class="ebtn copper" id="t-big">🖥 Tahtada büyüt</button></div>'}`;
  body.innerHTML = html;
  body.querySelectorAll('[data-min]').forEach((b) => b.addEventListener('click', () => { setTimer(+b.dataset.min * 60); pSure(body, big); }));
  $('#t-custom', body).addEventListener('change', (e) => { const m = parseInt(e.target.value, 10); if (m > 0) { setTimer(m * 60); pSure(body, big); } });
  $('#t-go', body).addEventListener('click', () => { toggleTimer(); pSure(body, big); });
  $('#t-reset', body).addEventListener('click', () => { setTimer(T.total); pSure(body, big); });
  $('#s-go', body).addEventListener('click', () => { if (S.run) { S.acc += Date.now() - S.start; S.run = false; } else { S.start = Date.now(); S.run = true; } tickLoop(); pSure(body, big); });
  $('#s-lap', body).addEventListener('click', () => { S.laps.push(S.acc + Date.now() - S.start); pSure(body, big); });
  $('#s-reset', body).addEventListener('click', () => { S.run = false; S.acc = 0; S.laps = []; pSure(body, big); });
  $('#t-big', body)?.addEventListener('click', () => { const p = present('⏱️ Süre', '', () => renderPanel()); p.body.style.setProperty('--x', 1); pSure(p.body, true); p.body.querySelectorAll('.bigtime').forEach((x) => { x.style.fontSize = 'clamp(4rem, 16vw, 12rem)'; }); });
  B.sureBody = body;
  tickLoop();
}
function setTimer(sec) { const T = B.timer; T.total = sec; T.left = sec; T.run = false; T.alarm = false; renderBar(); }
function toggleTimer() {
  const T = B.timer;
  if (T.run) { T.left = Math.max(0, Math.ceil((T.end - Date.now()) / 1000)); T.run = false; }
  else { if (T.left <= 0) T.left = T.total; T.end = Date.now() + T.left * 1000; T.run = true; T.alarm = false; }
  tickLoop(); renderBar();
}
function tickLoop() {
  if (B.tickIv) return;
  B.tickIv = setInterval(() => {
    const T = B.timer, S = B.sw;
    if (T.run && Date.now() >= T.end) { T.run = false; T.left = 0; T.alarm = true; beep(660, 0.35, 4); renderBar(); if (B.sureBody && document.body.contains(B.sureBody)) pSure(B.sureBody, !$('#t-big', B.sureBody)); }
    const td = B.sureBody && $('#t-disp', B.sureBody); if (td && T.run) td.textContent = fmtMS(Math.max(0, T.end - Date.now()));
    const sd = B.sureBody && $('#s-disp', B.sureBody); if (sd && S.run) sd.textContent = fmtSW(S.acc + Date.now() - S.start);
    if (T.run && Math.floor(Date.now() / 1000) !== B.lastBarSec) { B.lastBarSec = Math.floor(Date.now() / 1000); const bb = $('#bar [data-p="sure"] .badge'); if (bb) bb.textContent = fmtMS(Math.max(0, T.end - Date.now())); else renderBar(); }
    if (!T.run && !S.run) { clearInterval(B.tickIv); B.tickIv = null; }
  }, 50);
}

/* ---------------- Sınıf EP sayacı ---------------- */
function pSinifEP(body) {
  const m = B.d.meta || {}, ep = m.classEP || 0, full = ep >= EVO.CLASS_GOAL;
  const beh = (arr, cls) => arr.map((x) => `<button class="${cls}" data-ep="${x.ep}" data-k="${x.k}">${x.icon} ${esc(x.label)}<b>${x.ep > 0 ? '+' : ''}${x.ep}</b></button>`).join('');
  body.innerHTML = `<div class="ring classep${full ? ' full' : ''}" style="--p:${Math.min(1, ep / EVO.CLASS_GOAL)}"><span>${ep}<br><small style="font-size:.9rem">/ ${EVO.CLASS_GOAL} EP</small></span></div>
    <p class="center emuted small">Öğrencilerin kazandığı her EP ve sınıf davranışları bu ortak sayaca eklenir. ${EVO.CLASS_GOAL} EP'de herkes Panteon'unda olmayan rastgele 1 Evolet kazanır!</p>
    <button class="ebtn copper wide lg" id="cr-go" ${full ? '' : 'disabled'}>🎁 ${full ? 'Ödülü Dağıt: Herkese +1 Evolet' : `Ödüle ${EVO.CLASS_GOAL - ep} EP kaldı`}</button>
    <h3>Sınıf bazlı olumlu davranış</h3><div class="beh">${beh(EVO.BEHAVIORS.classPlus, 'p')}</div>
    <h3>Sınıf bazlı olumsuz davranış</h3><div class="beh">${beh(EVO.BEHAVIORS.classMinus, 'm')}</div>`;
  body.querySelectorAll('[data-ep]').forEach((b) => b.addEventListener('click', async () => {
    try { await EVO.T.classAward(B.cid, +b.dataset.ep, b.dataset.k); EVO.toast(`Sınıf: ${+b.dataset.ep > 0 ? '+' : ''}${b.dataset.ep} EP`); } catch (e) { EVO.toast(EVO.authError(e), true); }
  }));
  $('#cr-go').addEventListener('click', async () => {
    if (!confirm(`Sınıf ödülü dağıtılsın mı? Sayaçtan ${EVO.CLASS_GOAL} EP düşülür ve her öğrenciye rastgele 1 Evolet verilir.`)) return;
    try { const r = await EVO.T.classReward(B.cid); showRewards(`🏆 Sınıf Ödülü — ${EVO.CLASS_GOAL} EP'ye ulaştınız!`, r); } catch (e) { EVO.toast(e.message || EVO.authError(e), true); }
  });
}

/* ---------------- Ayarlar ---------------- */
function pAyarlar(body) {
  const m = B.d.meta || {}, t = B.teacher, quota = Number(t.quota) || 0;
  const sched = (key, label) => { const c = m[key] || { mode: 'always', from: '12:00', to: '13:00' }; return `<div class="srow" style="flex-wrap:wrap"><span class="nm">${label}</span>
    <select class="einput" data-sch="${key}" style="width:auto;margin:0"><option value="always" ${c.mode === 'always' ? 'selected' : ''}>Sürekli Açık</option><option value="window" ${c.mode === 'window' ? 'selected' : ''}>Saat Aralığı</option><option value="off" ${c.mode === 'off' ? 'selected' : ''}>Kapalı</option></select>
    <input class="einput" type="time" data-from="${key}" value="${c.from || '12:00'}" style="width:auto;margin:0" ${c.mode === 'window' ? '' : 'disabled'}> – <input class="einput" type="time" data-to="${key}" value="${c.to || '13:00'}" style="width:auto;margin:0" ${c.mode === 'window' ? '' : 'disabled'}></div>`; };
  const side = shell ? B.side : ls.get('evo-board-side', 'left');
  body.innerHTML = `<p class="emuted small">👩‍🏫 <b style="color:var(--em-text)">${esc(t.name)}</b>${t.school ? ' · ' + esc(t.school) : ''}${t.direct ? '' : ` · Oturum ${new Date(t.exp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'e kadar`}</p>
    <h3 style="margin-top:6px">Sınıflar (${B.classes.length} / ${quota})</h3>
    ${B.classes.map((c) => `<div class="srow"><span class="nm">${c.cid === B.cid ? '✅ ' : ''}${esc(c.name)}</span>${c.cid === B.cid ? '<span class="meta">seçili</span>' : `<button class="ebtn sm" data-sel="${c.cid}">Seç</button>`}</div>`).join('') || '<p class="emuted">Henüz sınıf yok.</p>'}
    ${B.classes.length < quota ? `<form id="newcls" class="row" style="margin-top:6px"><input class="einput" name="n" placeholder="Yeni sınıf adı (ör. 7-B)" required style="flex:1;margin:0"><button class="ebtn primary sm">➕ Sınıf Oluştur</button></form>` : `<p class="emuted small">Sınıf kotanız dolu. Daha fazla sınıf için yöneticinizle iletişime geçin.</p>`}
    ${B.cid ? `<div class="row" style="margin-top:8px"><button class="ebtn sm" id="ren">✏️ Sınıfın adını değiştir</button><button class="ebtn danger sm" id="delcls">🗑 Sınıfı sil</button></div>
    <h3>Savaş saatleri</h3>${sched('arena', '⚔ MythBattle Arena davetleri')}${sched('raid', '🐉 Yelbegen savaşına giriş')}` : ''}
    <h3>Çubuğun yeri</h3><div class="seg">${[['left', '⬅ Sol'], ['right', 'Sağ ➡'], ['top', '⬆ Üst']].map(([k, l]) => `<button class="${side === k ? 'on v-var' : ''}" data-side="${k}">${l}</button>`).join('')}</div>
    ${shell ? `<label class="small" style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="ontop" ${B.onTop !== false ? 'checked' : ''}> Her zaman en önde kalsın</label>` : ''}
    <h3>Oturum</h3><button class="ebtn danger" id="lock">🔒 Oturumu kapat (QR ekranına dön)</button>
    ${shell ? '<button class="ebtn" id="quit" style="margin-left:6px">✕ Uygulamadan çık</button>' : ''}
    <p class="emuted small" style="margin-top:14px">Evomyth ${EVO.VERSION} · <a href="#" id="site" style="text-decoration:underline">www.thegamifyclass.com</a></p>`;
  body.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => { selectClass(b.dataset.sel); renderPanel(); }));
  $('#newcls', body)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const cid = await EVO.T.createClass(t.uid, { evMaxClasses: quota, displayName: t.name, school: t.school }, e.target.n.value.trim()); B.classes = await EVO.T.classesOf(t.uid); selectClass(cid); openPanel('ekle'); EVO.toast('Sınıf oluşturuldu. Şimdi öğrencileri ekleyin.'); }
    catch (ex) { EVO.toast(ex.message || EVO.authError(ex), true); }
  });
  $('#ren', body)?.addEventListener('click', async () => { const n = prompt('Sınıfın yeni adı:', m.name || ''); if (n && n.trim()) { await EVO.T.renameClass(t.uid, B.cid, n.trim()); B.classes = await EVO.T.classesOf(t.uid); renderPanel(); } });
  $('#delcls', body)?.addEventListener('click', async () => {
    const n = prompt(`DİKKAT: "${m.name}" sınıfı, tüm öğrenci hesapları, EP'ler ve Evoletlerle birlikte kalıcı olarak silinecek.\nOnaylamak için sınıfın adını yazın:`);
    if (n !== m.name) { if (n !== null) EVO.toast('Ad eşleşmedi, silinmedi.', true); return; }
    await EVO.T.deleteClass(t.uid, B.cid, (i, k) => { $('#p-title').textContent = `Siliniyor… ${i}/${k}`; });
    stopClass(); B.cid = null; B.classes = await EVO.T.classesOf(t.uid);
    if (B.classes[0]) selectClass(B.classes[0].cid); else renderBar();
    renderPanel();
  });
  const saveSch = (key) => EVO.T.setSchedule(B.cid, key, { mode: $(`[data-sch="${key}"]`, body).value, from: $(`[data-from="${key}"]`, body).value || '12:00', to: $(`[data-to="${key}"]`, body).value || '13:00' }).then(() => EVO.toast('Kaydedildi.')).catch((e) => EVO.toast(EVO.authError(e), true));
  body.querySelectorAll('[data-sch]').forEach((s) => s.addEventListener('change', () => { saveSch(s.dataset.sch); }));
  body.querySelectorAll('[data-from],[data-to]').forEach((s) => s.addEventListener('change', () => saveSch(s.dataset.from || s.dataset.to)));
  body.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', async () => {
    if (shell) { B.side = b.dataset.side; await shell.setSide(B.side); } else ls.set('evo-board-side', b.dataset.side);
    applySide(); renderPanel();
  }));
  $('#ontop', body)?.addEventListener('change', async () => { B.onTop = await shell.toggleOnTop(); });
  $('#lock', body).addEventListener('click', () => { if (confirm('Oturum kapatılsın mı? Tekrar açmak için QR okutmanız gerekir.')) { closePanel(); logout(); } });
  $('#quit', body)?.addEventListener('click', () => shell.close());
  $('#site', body).addEventListener('click', (e) => { e.preventDefault(); openSite(); });
}

/* ---------------- Başlangıç ---------------- */
let started = false;
auth.onAuthStateChanged(() => { if (started) return; started = true; resume().catch((e) => { console.error(e); startLogin(); }); });
window.addEventListener('beforeunload', () => {
  if (B.qr) EVO.ref(`boardReq/${B.qr.code}`).remove();
  // Masaüstü uygulaması kapanınca tahta oturumu da biter (tarayıcıda sayfa yenilemede korunur)
  const u = auth.currentUser;
  if (shell && u && u.isAnonymous) EVO.ref(`boards/${u.uid}`).remove();
});
})();
