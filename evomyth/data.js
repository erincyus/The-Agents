/* =====================================================================
   EVOMYTH — veri katmanı (Firebase Realtime Database)
   Tüm yollar "evomyth/" altındadır. Şema için Evomyth-GDD.html → Bölüm 1.
   Hem öğrenci portalı hem akıllı tahta bu dosyayı kullanır.
   ===================================================================== */
(function () {
'use strict';
const EVO = window.EVO;
const R = 'evomyth/';
let app, db, auth, secApp;

EVO.isMock = () => !!(window.firebase && window.firebase.isMock);
EVO.initFirebase = function () {
  if (db) return { db, auth };
  app = firebase.initializeApp(EVO.FIREBASE);
  db = app.database(); auth = app.auth();
  EVO._off = 0;
  db.ref('.info/serverTimeOffset').on('value', (s) => { EVO._off = s.val() || 0; });
  EVO.db = db; EVO.auth = auth;
  return { db, auth };
};
EVO.now = () => Date.now() + (EVO._off || 0);
EVO.ref = (p) => db.ref(R + p);
EVO.TS = () => firebase.database.ServerValue.TIMESTAMP;
const val = async (p) => (await EVO.ref(p).once('value')).val();

// Öğrenci hesabı açma/şifre değiştirme, öğretmen oturumunu bozmadan ikinci bir Firebase örneğinde yapılır
async function secondaryAuth() {
  if (!secApp) {
    try { secApp = firebase.app('evoSecondary'); } catch (_) { secApp = firebase.initializeApp(EVO.FIREBASE, 'evoSecondary'); }
    try { await secApp.auth().setPersistence(firebase.auth.Auth.Persistence.NONE); } catch (_) {}
  }
  return secApp.auth();
}
EVO.authError = function (e) {
  const c = (e && e.code) || '';
  if (c.includes('email-already-in-use')) return 'Bu kullanıcı adı başka bir öğrenci tarafından kullanılıyor.';
  if (c.includes('weak-password')) return 'Şifre en az 6 karakter olmalı.';
  if (c.includes('invalid-email')) return 'Kullanıcı adı geçersiz (yalnızca a-z, 0-9 ve nokta).';
  if (c.includes('too-many-requests')) return 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.';
  if (c.includes('network')) return 'İnternet bağlantısı yok.';
  if (c.includes('invalid-credential') || c.includes('invalid-login') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Kullanıcı adı veya şifre hatalı.';
  if (c.includes('user-disabled')) return 'Bu hesap devre dışı bırakılmış.';
  if (c.includes('permission') || /permission/i.test(e && e.message)) return 'Bu işlem için yetki yok (güvenlik kuralları).';
  return (e && e.message) || 'Bilinmeyen hata';
};

/* =================================================================== */
/* ÖĞRETMEN / TAHTA İŞLEMLERİ                                           */
/* =================================================================== */
EVO.T = {
  // Öğretmen kaydı (admin/teachers) — kota ve askı kontrolü
  async teacherRecord(uid) { return (await db.ref('admin/teachers/' + uid).once('value')).val(); },
  isActive: (rec) => !!rec && !rec.suspended && !rec.evSuspended && Number(rec.evMaxClasses) > 0,

  async classesOf(teacherUid) {
    const idx = (await val('teacherClasses/' + teacherUid)) || {};
    const out = [];
    for (const cid of Object.keys(idx)) { const m = await val(`classes/${cid}/meta`); if (m) out.push({ cid, ...m }); }
    return out.sort((a, b) => (a.created || 0) - (b.created || 0));
  },
  // rec: { evMaxClasses, displayName, school } — tahtada boards/<uid> kaydındaki quota'dan gelir
  async createClass(teacherUid, rec, name) {
    const list = await this.classesOf(teacherUid);
    const quota = Number(rec.evMaxClasses) || 0;
    if (list.length >= quota) throw new Error(`Sınıf kotanız dolu (${list.length} / ${quota}). Daha fazla sınıf için yöneticinizle iletişime geçin.`);
    const cid = EVO.ref('classes').push().key;
    const meta = { name, owner: teacherUid, ownerName: rec.displayName || rec.email || '', school: rec.school || '', created: EVO.now(), classEP: 0,
      arena: { mode: 'always', from: '12:00', to: '13:00' }, raid: { mode: 'always', from: '12:00', to: '13:00' } };
    await EVO.ref(`classes/${cid}/meta`).set(meta);
    await EVO.ref(`teacherClasses/${teacherUid}/${cid}`).set(name);
    return cid;
  },
  async renameClass(teacherUid, cid, name) {
    await EVO.ref(`classes/${cid}/meta/name`).set(name);
    await EVO.ref(`teacherClasses/${teacherUid}/${cid}`).set(name);
  },
  async deleteClass(teacherUid, cid, onProgress) {
    const creds = (await val(`creds/${cid}`)) || {};
    const ids = Object.keys(creds);
    for (let i = 0; i < ids.length; i++) { onProgress && onProgress(i + 1, ids.length); try { await this.deleteStudent(cid, ids[i], true); } catch (e) { console.warn(e); } }
    await EVO.ref(`classes/${cid}`).remove();
    await EVO.ref(`creds/${cid}`).remove();
    await EVO.ref(`teacherClasses/${teacherUid}/${cid}`).remove();
  },

  /**
   * Öğrenci ekle: Firebase Auth hesabı (kullaniciadi@ogrenci.thegamifyclass.com) + sınıf kaydı + şifre kaydı
   * @returns {object} { sid, username, password }
   */
  async addStudent(cid, { name, username, password }) {
    if (!cid) throw new Error('Önce bir sınıf seçin.');
    name = String(name || '').trim();
    if (!name) throw new Error('Ad soyad boş olamaz.');
    username = EVO.slug(username || name).replace(/[^a-z0-9._]/g, '');
    if (!EVO.validUsername(username)) throw new Error(`"${username}" geçerli bir kullanıcı adı değil (en az 3 karakter, a-z 0-9 .).`);
    password = String(password || '').trim() || EVO.genPassword();
    if (password.length < 6) throw new Error('Şifre en az 6 karakter olmalı.');
    const sa = await secondaryAuth();
    let cred;
    try { cred = await sa.createUserWithEmailAndPassword(EVO.studentEmail(username), password); }
    catch (e) { throw Object.assign(new Error(EVO.authError(e)), { code: e.code }); }
    const uid = cred.user.uid;
    await sa.signOut();
    const sid = EVO.ref(`classes/${cid}/students`).push().key;
    await EVO.ref('').update({
      [`users/${uid}`]: { cid, sid },
      [`classes/${cid}/students/${sid}`]: { name, username, uid, ep: 0, epEarned: 0, streak: 0, hwDone: 0, hwMissed: 0, created: EVO.now() },
      [`creds/${cid}/${sid}`]: { u: username, p: password, uid },
    });
    return { sid, username, password };
  },
  // Kullanıcı adı alınmışsa sonuna sayı ekleyerek dener (Excel'de kullanıcı adı boş bırakıldıysa)
  async addStudentAuto(cid, row) {
    const base = EVO.slug(row.username || row.name).replace(/[^a-z0-9._]/g, '').slice(0, 20);
    for (let i = 0; i < 6; i++) {
      const u = i === 0 ? base : `${base}${i + 1}`;
      try { return await this.addStudent(cid, { ...row, username: u }); }
      catch (e) { if (!(row.username === '' || !row.username) || !String(e.code).includes('email-already-in-use')) throw e; }
    }
    throw new Error('Uygun kullanıcı adı bulunamadı.');
  },
  async resetPassword(cid, sid, newPw) {
    const c = await val(`creds/${cid}/${sid}`);
    if (!c) throw new Error('Şifre kaydı bulunamadı.');
    newPw = String(newPw || '').trim() || EVO.genPassword();
    if (newPw.length < 6) throw new Error('Şifre en az 6 karakter olmalı.');
    const sa = await secondaryAuth();
    const cr = await sa.signInWithEmailAndPassword(EVO.studentEmail(c.u), c.p);
    await cr.user.updatePassword(newPw);
    await sa.signOut();
    await EVO.ref(`creds/${cid}/${sid}/p`).set(newPw);
    return newPw;
  },
  async deleteStudent(cid, sid, quiet) {
    const c = await val(`creds/${cid}/${sid}`);
    if (c) {
      try { const sa = await secondaryAuth(); const cr = await sa.signInWithEmailAndPassword(EVO.studentEmail(c.u), c.p); await cr.user.delete(); }
      catch (e) { if (!quiet) console.warn('Hesap silinemedi (yalnızca kayıt silinecek)', e); }
    }
    const st = await val(`classes/${cid}/students/${sid}`);
    await EVO.ref('').update({
      [`classes/${cid}/students/${sid}`]: null, [`classes/${cid}/panteon/${sid}`]: null, [`creds/${cid}/${sid}`]: null,
      ...(st && st.uid ? { [`users/${st.uid}`]: null } : {}),
    });
  },
  async renameStudent(cid, sid, name) { await EVO.ref(`classes/${cid}/students/${sid}/name`).set(String(name).trim()); },

  // Bireysel EP: öğrenci EP'si 0'ın altına düşmez; kazanılan EP sınıf sayacına da eklenir
  async award(cid, sid, delta, reason) {
    let applied = 0;
    await EVO.ref(`classes/${cid}/students/${sid}`).transaction((s) => {
      if (!s) return s;
      const before = s.ep || 0;
      s.ep = Math.max(0, before + delta); applied = s.ep - before;
      if (delta > 0) s.epEarned = (s.epEarned || 0) + delta;
      return s;
    });
    if (delta > 0) await this.addClassEP(cid, delta);
    await EVO.ref(`classes/${cid}/log`).push({ at: EVO.TS(), sid, ep: applied, k: reason || '' });
    return applied;
  },
  async addClassEP(cid, delta) {
    await EVO.ref(`classes/${cid}/meta/classEP`).transaction((v) => Math.max(0, (v || 0) + delta));
  },
  async classAward(cid, delta, reason) {
    await this.addClassEP(cid, delta);
    await EVO.ref(`classes/${cid}/log`).push({ at: EVO.TS(), sid: '_class', ep: delta, k: reason || '' });
  },
  async setAttendance(cid, day, sid, status) {
    await EVO.ref(`classes/${cid}/attendance/${day}/${sid}`).set(status || null);
  },

  /**
   * Ödev kontrolü onayı
   * @param {object} marks { sid: 'done' | 'missed' | 'absent' }
   * @returns {Array} ödül listesi [{ sid, name, eid, reason }]
   */
  async homework(cid, marks) {
    const [students, panteon] = await Promise.all([val(`classes/${cid}/students`), val(`classes/${cid}/panteon`)]);
    const now = EVO.now(), upd = {}, results = {}, rewards = [];
    let classGain = 0;
    for (const [sid, mark] of Object.entries(marks)) {
      const s = students && students[sid];
      if (!s) continue;
      const owned = Object.keys((panteon && panteon[sid]) || {});
      const r = EVO.processHomework({ streak: s.streak || 0, owned }, mark);
      const ep = Math.max(0, (s.ep || 0) + r.ep);
      upd[`classes/${cid}/students/${sid}/ep`] = ep;
      upd[`classes/${cid}/students/${sid}/streak`] = r.streak;
      if (mark === 'done') { upd[`classes/${cid}/students/${sid}/hwDone`] = (s.hwDone || 0) + 1; upd[`classes/${cid}/students/${sid}/epEarned`] = (s.epEarned || 0) + r.ep; classGain += r.ep; }
      if (mark === 'missed') upd[`classes/${cid}/students/${sid}/hwMissed`] = (s.hwMissed || 0) + 1;
      if (r.drop) {
        upd[`classes/${cid}/panteon/${sid}/${r.drop}`] = { level: 1, got: now, via: r.reason === 'ruh' ? 'ruh' : 'odev', rest: 0 };
        rewards.push({ sid, name: s.name, eid: r.drop, reason: r.reason });
      } else if (r.reason === 'bonus') rewards.push({ sid, name: s.name, eid: '', reason: 'bonus' });
      results[sid] = { m: mark, drop: r.drop || '', ep: r.ep, streak: r.streak };
    }
    const hid = EVO.ref(`classes/${cid}/hw`).push().key;
    upd[`classes/${cid}/hw/${hid}`] = { at: now, day: EVO.dayKey(now), results };
    if (rewards.length) upd[`classes/${cid}/rewards/${hid}`] = { at: now, kind: 'hw', list: rewards };
    await EVO.ref('').update(upd);
    if (classGain) await this.addClassEP(cid, classGain);
    return rewards;
  },

  // Sınıf sayacı 1000 EP → herkese sahip olmadığı rastgele 1 Evolet; sayaçtan 1000 düşülür
  async classReward(cid) {
    let ok = false;
    await EVO.ref(`classes/${cid}/meta/classEP`).transaction((v) => { if ((v || 0) < EVO.CLASS_GOAL) { ok = false; return; } ok = true; return v - EVO.CLASS_GOAL; });
    if (!ok) throw new Error(`Sınıf sayacı henüz ${EVO.CLASS_GOAL} EP'ye ulaşmadı.`);
    const [students, panteon] = await Promise.all([val(`classes/${cid}/students`), val(`classes/${cid}/panteon`)]);
    const now = EVO.now(), upd = {}, rewards = [];
    Object.entries(students || {}).forEach(([sid, s]) => {
      const eid = EVO.rollClassReward(Object.keys((panteon && panteon[sid]) || {}));
      if (eid) { upd[`classes/${cid}/panteon/${sid}/${eid}`] = { level: 1, got: now, via: 'sinif', rest: 0 }; rewards.push({ sid, name: s.name, eid, reason: 'sinif' }); }
      else { upd[`classes/${cid}/students/${sid}/ep`] = (s.ep || 0) + EVO.ALL_OWNED_BONUS_EP; rewards.push({ sid, name: s.name, eid: '', reason: 'bonus' }); }
    });
    const rid = EVO.ref(`classes/${cid}/rewards`).push().key;
    upd[`classes/${cid}/rewards/${rid}`] = { at: now, kind: 'sinif', list: rewards };
    await EVO.ref('').update(upd);
    return rewards;
  },
  async setSchedule(cid, which, cfg) { await EVO.ref(`classes/${cid}/meta/${which}`).set(cfg); },
  async credentials(cid) { return (await val(`creds/${cid}`)) || {}; },
  async clearRest(cid, sid, eid) { await EVO.ref(`classes/${cid}/panteon/${sid}/${eid}/rest`).set(0); },
};

/* =================================================================== */
/* TAHTA GİRİŞİ (QR)                                                     */
/* Tahta anonim oturum açar ve boardReq/<kod> yazar; öğretmen telefonla   */
/* giriş yapıp boards/<tahtaUid> = { teacher, exp } yazar.               */
/* =================================================================== */
EVO.BOARD_HOURS = 14;
EVO.Board = {
  newCode() { const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(''); },
  async request(code) {
    await EVO.ref(`boardReq/${code}`).set({ anon: auth.currentUser.uid, at: EVO.TS() });
  },
  qrURL: (code) => `${EVO.SITE}/Evomyth.html#tahta=${code}`,
  // Telefon tarafı: öğretmen doğrulandıktan sonra tahtayı bağlar
  async approve(code, teacherUid, rec) {
    const req = await val(`boardReq/${code}`);
    if (!req || !req.anon) throw new Error('Bu QR kodu geçersiz ya da süresi dolmuş. Tahtadaki yeni kodu okutun.');
    if (req.ok) throw new Error('Bu QR kodu zaten kullanıldı. Tahtadaki yeni kodu okutun.');
    if (EVO.now() - (req.at || 0) > 10 * 60 * 1000) throw new Error('QR kodunun süresi dolmuş. Tahtadaki yeni kodu okutun.');
    await EVO.ref(`boards/${req.anon}`).set({ teacher: teacherUid, name: rec.displayName || rec.email || '', school: rec.school || '', quota: Number(rec.evMaxClasses) || 0, exp: EVO.now() + EVO.BOARD_HOURS * 3600e3, at: EVO.TS() });
    await EVO.ref(`boardReq/${code}/ok`).set(teacherUid);
  },
};

/* =================================================================== */
/* ÖĞRENCİ İŞLEMLERİ                                                     */
/* =================================================================== */
EVO.S = {
  async whoAmI(uid) { return val(`users/${uid}`); },

  // Level atlat: EP düşülür, level +1 (güvenlik kuralı maliyeti config/cost üzerinden doğrular)
  async levelUp(cid, sid, eid) {
    const [st, pe] = await Promise.all([val(`classes/${cid}/students/${sid}`), val(`classes/${cid}/panteon/${sid}/${eid}`)]);
    if (!st || !pe) throw new Error('Evolet bulunamadı.');
    const cost = EVO.levelCost(pe.level);
    if ((st.ep || 0) < cost) throw new Error(`Yeterli EP yok. Gerekli: ${cost} EP, sende: ${st.ep || 0} EP.`);
    await EVO.ref(`classes/${cid}`).update({ [`students/${sid}/ep`]: st.ep - cost, [`panteon/${sid}/${eid}/level`]: pe.level + 1 });
    return { level: pe.level + 1, evolved: EVO.stageOf(pe.level + 1) !== EVO.stageOf(pe.level) };
  },
  async potion(cid, sid, eid, kind) {
    const [st, pe] = await Promise.all([val(`classes/${cid}/students/${sid}`), val(`classes/${cid}/panteon/${sid}/${eid}`)]);
    const r = EVO.usePotion(pe || {}, kind, (st && st.ep) || 0, EVO.now());
    if (!r.ok) throw new Error(r.msg);
    await EVO.ref(`classes/${cid}`).update({ [`students/${sid}/ep`]: r.ep, [`panteon/${sid}/${eid}/rest`]: r.rest });
    return r;
  },
  // Yenilen Evolet 18 saat dinlenir (değer savaş bitiş anından hesaplanır → iki taraf da aynı değeri yazar)
  async setRest(cid, sid, eid, until) {
    try { await EVO.ref(`classes/${cid}/panteon/${sid}/${eid}/rest`).set(until); } catch (e) { /* daha büyük değer zaten yazılmış olabilir */ }
  },
  async addPoints(cid, sid, won) {
    const wk = EVO.weekKey(EVO.now());
    await EVO.ref(`classes/${cid}/lb/${wk}/${sid}`).transaction((x) => {
      x = x || { p: 0, w: 0, l: 0 };
      x.p += won ? EVO.PVP_POINTS.win : EVO.PVP_POINTS.loss;
      if (won) x.w += 1; else x.l += 1;
      return x;
    });
  },

  /* ---- MythBattle Arena ---- */
  async invite(cid, me, toSid, eid, level) {
    await EVO.ref(`classes/${cid}/invites/${toSid}/${me.sid}`).set({ at: EVO.TS(), eid, level, name: me.name });
  },
  async cancelInvite(cid, fromSid, toSid) { await EVO.ref(`classes/${cid}/invites/${toSid}/${fromSid}`).remove(); },
  async accept(cid, me, fromSid, inv, myEid, myLevel, fromUid) {
    const bid = EVO.ref(`classes/${cid}/battles`).push().key;
    const st = EVO.pvpCreate({ sid: fromSid, uid: fromUid, name: inv.name, eid: inv.eid, level: inv.level }, { sid: me.sid, uid: me.uid, name: me.name, eid: myEid, level: myLevel }, EVO.now());
    st.u = { [fromUid]: 'A', [me.uid]: 'B' };
    await EVO.ref(`classes/${cid}/battles/${bid}`).set(st);
    await EVO.ref('').update({
      [`classes/${cid}/invites/${me.sid}/${fromSid}`]: null,
      [`classes/${cid}/inbox/${fromSid}`]: { bid, at: EVO.TS() },
      [`classes/${cid}/inbox/${me.sid}`]: { bid, at: EVO.TS() },
    });
    return bid;
  },
  async move(cid, bid, side, si, auto) {
    const r = await EVO.ref(`classes/${cid}/battles/${bid}`).transaction((s) => {
      if (!s) return s;
      if (auto ? !EVO.shouldAutoMove(s, EVO.now()) || s.turn !== side : s.turn !== side) return; // başkası çoktan oynadı
      return EVO.pvpMove(s, side, si, EVO.now(), EVO.rng, auto) || undefined;
    });
    return r.committed;
  },
  async forfeit(cid, bid, side) {
    await EVO.ref(`classes/${cid}/battles/${bid}`).transaction((s) => {
      if (!s || s.status !== 'active') return;
      s[side].hp = 0;
      return EVO.pvpFinish(s, side === 'A' ? 'B' : 'A', EVO.now());
    });
  },

  /* ---- Yelbegen (sınıf başına tek aktif savaş: classes/<cid>/raid) ---- */
  async raidJoin(cid, me, eid, level) {
    let err = '';
    const r = await EVO.ref(`classes/${cid}/raid`).transaction((s) => {
      err = '';
      if (s && s.status === 'active') { err = 'Savaş şu an sürüyor; bitince yeni takım kurulabilir.'; return; }
      if (!s || s.status !== 'lobby') s = EVO.raidCreate(me, EVO.now());
      s.slots = s.slots || {};
      if (!s.slots[me.sid] && Object.keys(s.slots).length >= EVO.RAID_SIZE) { err = 'Takım dolu (6/6).'; return; }
      s.slots[me.sid] = EVO.fighter(me, eid, level);
      return s;
    });
    if (err) throw new Error(err);
    return r.committed;
  },
  async raidLeave(cid, sid) {
    await EVO.ref(`classes/${cid}/raid`).transaction((s) => { if (!s || s.status !== 'lobby' || !s.slots || !s.slots[sid]) return; delete s.slots[sid]; return s; });
  },
  async raidStart(cid) {
    await EVO.ref(`classes/${cid}/raid`).transaction((s) => {
      if (!s || s.status !== 'lobby' || Object.keys(s.slots || {}).length < EVO.RAID_SIZE) return;
      return EVO.raidStart(s, EVO.now());
    });
  },
  async raidMove(cid, sid, si, auto) {
    const r = await EVO.ref(`classes/${cid}/raid`).transaction((s) => {
      if (!s || s.status !== 'active' || EVO.raidActor(s) !== sid) return;
      if (auto && !EVO.shouldAutoMove(s, EVO.now())) return;
      return EVO.raidMove(s, sid, si, EVO.now(), EVO.rng, auto) || undefined;
    });
    return r.committed;
  },
  // Biten savaşın özeti (ejderha rozeti bundan hesaplanır); her istemci aynı anahtarla yazar
  async raidArchive(cid, s) {
    if (!s || !['won', 'lost'].includes(s.status)) return;
    await EVO.ref(`classes/${cid}/raidHistory/${s.started}`).set({ at: s.ended || EVO.now(), won: s.status === 'won', sids: Object.keys(s.slots || {}).reduce((o, k) => ((o[k] = true), o), {}), rounds: s.round || 0 });
  },
  async raidReset(cid) {
    await EVO.ref(`classes/${cid}/raid`).transaction((s) => (s && ['won', 'lost'].includes(s.status) ? null : undefined));
  },
};

/* =================================================================== */
/* GÖRÜNÜM YARDIMCILARI (platin çerçeve, ejderha)                        */
/* =================================================================== */
// Geçen haftanın ilk 3'ü (puan, sonra galibiyet)
EVO.platinumSet = function (lbAll, now) {
  const prev = (lbAll || {})[EVO.prevWeekKey(now)] || {};
  return new Set(Object.entries(prev).filter(([, x]) => x && x.p > 0).sort((a, b) => b[1].p - a[1].p || b[1].w - a[1].w).slice(0, EVO.PLATINUM_TOP).map(([sid]) => sid));
};
EVO.dragonSet = function (history, now) {
  const set = new Set();
  Object.values(history || {}).forEach((h) => { if (h && h.won && now - h.at < EVO.DRAGON_DAYS * 86400e3) Object.keys(h.sids || {}).forEach((s) => set.add(s)); });
  return set;
};
EVO.nameTag = (name, sid, plat, drag) => `<span class="evo-tag${plat && plat.has(sid) ? ' tag-platinum' : ''}${drag && drag.has(sid) ? ' tag-flame' : ''}">${drag && drag.has(sid) ? '<span class="dr">🐉</span>' : ''}${EVO.esc(name)}</span>`;

/* ---------- küçük arayüz yardımcıları ---------- */
EVO.toast = function (msg, bad) {
  const t = document.createElement('div');
  t.className = 'etoast' + (bad ? ' bad' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), bad ? 5000 : 3000);
};
EVO.modal = function (html, opts) {
  opts = opts || {};
  const back = document.createElement('div');
  back.className = 'emodal-back';
  back.innerHTML = `<div class="emodal" style="${opts.width ? `width:min(${opts.width}px,100%)` : ''}">${html}</div>`;
  if (!opts.sticky) back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  document.body.appendChild(back);
  back.close = () => back.remove();
  return back;
};
// Ödül listesi: öğretmen "Kapat" demeden kapanmaz
EVO.rewardModal = function (title, list, onClose) {
  const rows = list.map((r, i) => {
    if (!r.eid) return `<div class="reward-row" style="--tc:#e0915f;animation-delay:${i * 60}ms"><span class="sym">💰</span><span><b>${EVO.esc(r.name)}</b> <span class="arrow">→</span> Tüm Evoletlere sahip! +${EVO.ALL_OWNED_BONUS_EP} EP bonus</span></div>`;
    const ev = EVO.BY_ID[r.eid], ti = EVO.TYPE_INFO[ev.type];
    return `<div class="reward-row" style="--tc:${ti.color};animation-delay:${i * 60}ms">${EVO.thumbHTML(ev.id, 1)}<span><b>${EVO.esc(r.name)}</b> <span class="arrow">→</span> <b class="evn">${EVO.esc(ev.name)}</b> (${ti.name}) Panteon'a eklendi!${r.reason === 'ruh' ? ' 🔮 <i>5 ödev serisi ödülü</i>' : ''}</span></div>`;
  }).join('');
  const m = EVO.modal(`<h2>${title}</h2><div class="reward-list">${rows || '<p class="emuted">Bu sefer Evolet kazanan olmadı.</p>'}</div><button class="ebtn primary lg wide" data-close>Kapat</button>`, { sticky: true, width: 820 });
  m.querySelector('[data-close]').addEventListener('click', () => { m.close(); onClose && onClose(); });
  return m;
};
})();
