/* =====================================================================
   EVOMYTH — Öğrenci portalı (Evomyth.html içinde)
   Sekmeler: Panteon · MythBattle Arena · Yelbegen · Liderlik · Tür Tablosu · Kurallar
   ===================================================================== */
(function () {
'use strict';
const EVO = window.EVO, esc = EVO.esc;
const $ = (s, r = document) => r.querySelector(s);
const INVITE_TTL = 10 * 60 * 1000;

const P = window.Portal = {
  root: null, me: null, tab: 'panteon', offs: [], d: {}, battle: null, battleOff: null, stopWatch: null, raidWatch: null, posted: new Set(),

  start(root, me) {
    this.stop();
    this.root = root; this.me = me; this.d = {};
    try { this.tab = localStorage.getItem('evo-tab') || 'panteon'; } catch (_) {}
    const c = `classes/${me.cid}/`;
    const on = (path, key) => { const r = EVO.ref(c + path); const cb = r.on('value', (s) => { this.d[key] = s.val(); this.changed(key); }, (e) => this.fail(e)); this.offs.push(() => r.off('value', cb)); };
    on('meta', 'meta'); on('students', 'students'); on('panteon', 'panteon'); on('lb', 'lb'); on('invites', 'invites');
    on(`inbox/${me.sid}`, 'inbox'); on('raid', 'raid'); on('raidHistory', 'raidHistory'); on('online', 'online');
    // Çevrimiçi göstergesi
    const pr = EVO.ref(`${c}online/${me.sid}`);
    pr.set(EVO.TS()).catch(() => {}); pr.onDisconnect().remove();
    this.offs.push(() => pr.remove().catch(() => {}));
    this.ticker = setInterval(() => this.tick(), 30000);
    root.innerHTML = '<p class="center emuted">Panteon yükleniyor…</p>';
  },
  stop() {
    this.offs.forEach((f) => { try { f(); } catch (_) {} });
    this.offs = [];
    if (this.battleOff) this.battleOff(); this.battleOff = null; this.battle = null;
    if (this.stopWatch) this.stopWatch(); this.stopWatch = null;
    if (this.raidWatch) this.raidWatch(); this.raidWatch = null;
    clearInterval(this.ticker);
  },
  fail(e) { console.warn(e); EVO.toast(EVO.authError(e), true); },
  ready() { return this.d.meta !== undefined && this.d.students !== undefined && this.d.panteon !== undefined; },
  meS() { return (this.d.students || {})[this.me.sid] || {}; },
  mine() { return (this.d.panteon || {})[this.me.sid] || {}; },
  tick() { if (this.ready() && ['panteon', 'raid', 'arena'].includes(this.tab) && !this.busy()) this.render(); },
  busy() { const a = document.activeElement; return a && a.tagName === 'INPUT'; },

  changed(key) {
    if (!this.ready()) return;
    if (!this.d.students[this.me.sid]) { this.root.innerHTML = '<div class="epanel center"><div class="enote bad">Sınıf kaydın bulunamadı. Öğretmenin seni sınıftan çıkarmış olabilir.</div></div>'; return; }
    // İkisi de tekrar çağrılmaya dayanıklı; veriler hangi sırayla gelirse gelsin savaş takibi başlar
    this.followBattle();
    this.raidPost();
    this.render();
  },

  /* ---------------- Çerçeve ---------------- */
  render() {
    if (!this.root || !this.ready()) return;
    const now = EVO.now(), s = this.meS(), m = this.d.meta || {};
    const plat = EVO.platinumSet(this.d.lb, now), drag = EVO.dragonSet(this.d.raidHistory, now);
    this.plat = plat; this.drag = drag;
    const inc = this.incoming().length;
    const streak = (s.streak || 0) % EVO.RUH_STREAK;
    const tabs = [['panteon', '🏛 Panteon'], ['arena', '⚔ MythBattle Arena'], ['raid', '🐉 Yelbegen'], ['lb', '🏆 Liderlik'], ['types', '🧭 Tür Tablosu'], ['rules', '📜 Kurallar']];
    this.root.innerHTML = `
      <div class="app-head">
        <img src="assets/evomyth_logo.png" alt="Evomyth" style="width:84px">
        <div class="who">
          <h1>${EVO.nameTag(s.name, this.me.sid, plat, drag)}</h1>
          <div class="emuted small">${esc(m.name || '')} · ${esc(m.ownerName || '')}${plat.has(this.me.sid) ? ' · ✨ Platin çerçeve (geçen haftanın ilk 3\'ü)' : ''}${drag.has(this.me.sid) ? ' · 🐉 Yelbegen avcısı' : ''}</div>
        </div>
        <div class="row">
          <span class="ep-pill" title="Educational Point">💠 ${s.ep || 0} EP</span>
          <span class="streak" title="Ödev serisi: 5 ardışık ödevde Ruh türü Evolet">${Array.from({ length: EVO.RUH_STREAK }, (_, i) => `<i class="${i < streak ? 'f' : ''}"></i>`).join('')}<small class="emuted">🔮</small></span>
          <button class="ebtn sm" id="p-out">Çıkış</button>
        </div>
      </div>
      <div id="battle-slot"></div>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="tab${this.tab === k ? ' on' : ''}" data-tab="${k}">${l}${k === 'arena' && inc ? '<span class="dot"></span>' : ''}</button>`).join('')}</div>
      <div id="tab-body"></div>`;
    $('#p-out').addEventListener('click', () => { this.stop(); EVO.auth.signOut(); });
    this.root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.tab; try { localStorage.setItem('evo-tab', this.tab); } catch (_) {} this.render(); }));
    const body = $('#tab-body');
    ({ panteon: () => this.renderPanteon(body), arena: () => this.renderArena(body), raid: () => this.renderRaid(body), lb: () => this.renderLB(body), types: () => this.renderTypes(body), rules: () => this.renderRules(body) })[this.tab]();
    this.renderBattle();
  },

  /* ---------------- Panteon ---------------- */
  renderPanteon(body) {
    const now = EVO.now(), mine = this.mine(), s = this.meS();
    const owned = Object.entries(mine).sort((a, b) => (b[1].level || 1) - (a[1].level || 1) || (a[1].got || 0) - (b[1].got || 0));
    const frame = this.plat.has(this.me.sid) ? 'platinum' : '', dragon = this.drag.has(this.me.sid);
    const cards = owned.map(([eid, e]) => {
      const cost = EVO.levelCost(e.level || 1), rest = EVO.isResting(e, now);
      const next = (e.level || 1) + 1, evolve = EVO.stageOf(next) !== EVO.stageOf(e.level || 1);
      const act = `<div class="evo-actions">
        <button class="ebtn ${evolve ? 'copper' : 'primary'} sm" data-lvl="${eid}" ${(s.ep || 0) < cost ? 'disabled' : ''} title="${evolve ? 'Bu level atlayışında EVRİM gerçekleşir!' : ''}">${evolve ? '🧬 Evrimleştir' : '⬆ Level'} · ${cost} EP</button>
        ${rest ? Object.entries(EVO.POTIONS).map(([k, p]) => `<button class="ebtn sm" data-pot="${eid}" data-kind="${k}" ${(s.ep || 0) < p.cost ? 'disabled' : ''} title="${p.cutMs === Infinity ? 'Dinlenmeyi hemen bitirir' : EVO.fmtDur(p.cutMs) + ' kısaltır'}">${p.icon} ${p.label} · ${p.cost} EP</button>`).join('') : ''}
      </div>`;
      return EVO.cardHTML({ eid, level: e.level || 1, rest: e.rest }, { now, frame, dragon, actions: act });
    }).join('');
    const missing = EVO.EVOLETS.filter((e) => !mine[e.id]);
    body.innerHTML = `
      <div class="spread" style="margin-bottom:12px">
        <div><b style="font-size:1.1rem">Panteon</b> <span class="emuted">· ${owned.length} / ${EVO.EVOLETS.length} Evolet</span></div>
        <div class="emuted small">Ödev serisi: <b style="color:var(--em-text)">${s.streak || 0}</b> · Yapılan ödev: ${s.hwDone || 0} · Toplam kazanılan EP: ${s.epEarned || 0}</div>
      </div>
      ${owned.length ? `<div class="evo-grid">${cards}</div>` : '<div class="epanel center"><p>Henüz Evoletin yok. Ödevini yap, öğretmenin ödev kontrolünde ilk Evoletin Panteon\'una düşsün! 🎁</p></div>'}
      <h3 class="evo-h" style="margin:26px 0 10px">Keşfedilmemiş Evoletler (${missing.length})</h3>
      <div class="evo-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${missing.map((e) => `<div class="ghost-card" style="--tc:${EVO.TYPE_INFO[e.type].color}"><div><div class="q">${e.symbols[0]}</div><b>???</b><br>${EVO.typeChip(e.type, true)}${e.type === 'ruh' ? '<br><small>5 ardışık ödevle</small>' : ''}</div></div>`).join('')}</div>`;
    body.querySelectorAll('[data-lvl]').forEach((b) => b.addEventListener('click', () => this.levelUp(b.dataset.lvl, b)));
    body.querySelectorAll('[data-pot]').forEach((b) => b.addEventListener('click', () => this.potion(b.dataset.pot, b.dataset.kind, b)));
  },
  async levelUp(eid, btn) {
    btn.disabled = true;
    const before = (this.mine()[eid] || {}).level || 1;
    try {
      const r = await EVO.S.levelUp(this.me.cid, this.me.sid, eid);
      if (r.evolved) {
        const m = EVO.modal(`<div class="center"><h2>🧬 EVRİM!</h2><p class="emuted">${esc(EVO.stageName(eid, before))} → <b style="color:var(--em-text)">${esc(EVO.stageName(eid, r.level))}</b></p>
          <div style="max-width:300px;margin:0 auto">${EVO.cardHTML({ eid, level: r.level }, { now: EVO.now() })}</div>
          <p class="emuted small">Statlar katlanarak arttı ve yeni bir yetenek açıldı!</p><button class="ebtn primary lg" data-close>Harika!</button></div>`, { width: 460 });
        m.querySelector('[data-close]').addEventListener('click', () => m.close());
      } else EVO.toast(`${EVO.stageName(eid, r.level)} Level ${r.level} oldu!`);
    } catch (e) { EVO.toast(e.message || EVO.authError(e), true); btn.disabled = false; }
  },
  async potion(eid, kind, btn) {
    btn.disabled = true;
    try { const r = await EVO.S.potion(this.me.cid, this.me.sid, eid, kind); EVO.toast(r.msg); }
    catch (e) { EVO.toast(e.message || EVO.authError(e), true); btn.disabled = false; }
  },

  // Evolet seçme penceresi (savaş için)
  pickEvolet(title, onPick) {
    const now = EVO.now();
    const list = Object.entries(this.mine()).sort((a, b) => EVO.power(b[0], b[1].level || 1) - EVO.power(a[0], a[1].level || 1));
    if (!list.length) { EVO.toast('Panteon\'unda henüz Evolet yok.', true); return; }
    const m = EVO.modal(`<h2>${title}</h2><p class="emuted small">Dinlenen Evoletler savaşa giremez. Kartın üzerine dokun.</p>
      <div class="pick-grid">${list.map(([eid, e]) => `<div data-pick="${eid}" class="${EVO.isResting(e, now) ? 'dis' : ''}">${EVO.cardHTML({ eid, level: e.level || 1, rest: e.rest }, { now, compact: true })}<div class="center small emuted">Güç ${EVO.power(eid, e.level || 1)}</div></div>`).join('')}</div>
      <button class="ebtn wide" data-close style="margin-top:12px">Vazgeç</button>`, { width: 820 });
    m.querySelector('[data-close]').addEventListener('click', () => m.close());
    m.querySelectorAll('[data-pick]').forEach((el) => el.addEventListener('click', () => {
      if (el.classList.contains('dis')) { EVO.toast('Bu Evolet dinleniyor. İksirle hemen hazırlayabilirsin.', true); return; }
      m.close(); onPick(el.dataset.pick, (this.mine()[el.dataset.pick] || {}).level || 1);
    }));
  },

  /* ---------------- MythBattle Arena ---------------- */
  incoming() {
    const now = EVO.now();
    return Object.entries(((this.d.invites || {})[this.me.sid]) || {}).filter(([, x]) => x && now - (x.at || 0) < INVITE_TTL);
  },
  outgoing() {
    const now = EVO.now(), out = [];
    Object.entries(this.d.invites || {}).forEach(([to, from]) => { const x = from && from[this.me.sid]; if (x && now - (x.at || 0) < INVITE_TTL) out.push([to, x]); });
    return out;
  },
  renderArena(body) {
    const now = EVO.now(), m = this.d.meta || {}, open = EVO.isOpen(m.arena, now);
    const st = this.d.students || {}, online = this.d.online || {};
    const inc = this.incoming(), out = this.outgoing(), outTo = new Set(out.map(([to]) => to));
    const best = (sid) => { const p = (this.d.panteon || {})[sid] || {}; const e = Object.entries(p).sort((a, b) => EVO.power(b[0], b[1].level || 1) - EVO.power(a[0], a[1].level || 1))[0]; return e ? `${EVO.BY_ID[e[0]].symbols[EVO.stageOf(e[1].level || 1)]} ${esc(EVO.stageName(e[0], e[1].level || 1))} · Lv ${e[1].level || 1}` : '<span class="emuted">Evolet yok</span>'; };
    const mates = Object.entries(st).filter(([sid]) => sid !== this.me.sid).sort((a, b) => (online[b[0]] ? 1 : 0) - (online[a[0]] ? 1 : 0) || a[1].name.localeCompare(b[1].name, 'tr'));
    body.innerHTML = `
      <div class="enote ${open ? 'ok' : 'warn'}">⏰ Arena: <b>${EVO.scheduleText(m.arena)}</b>${open ? '' : ' — şu an davet gönderilemez.'} · Her hamle için ${EVO.TURN_MS / 1000} sn; süre dolarsa sistem temel saldırıyı yapar. Kaybeden Evolet 18 saat dinlenir.</div>
      ${inc.length ? `<div class="epanel" style="margin:12px 0"><h3 class="evo-h" style="margin:0 0 8px">📨 Sana gelen davetler</h3>${inc.map(([from, x]) => `<div class="mate"><div class="grow">${EVO.nameTag(x.name, from, this.plat, this.drag)} seni savaşa çağırıyor<br><small class="emuted">${EVO.BY_ID[x.eid].symbols[EVO.stageOf(x.level)]} ${esc(EVO.stageName(x.eid, x.level))} · Lv ${x.level} · ${EVO.TYPE_INFO[EVO.BY_ID[x.eid].type].name}</small></div><button class="ebtn primary sm" data-acc="${from}" ${open ? '' : 'disabled'}>Kabul Et</button><button class="ebtn danger sm" data-rej="${from}">Reddet</button></div>`).join('')}</div>` : ''}
      ${out.length ? `<div class="epanel" style="margin:12px 0"><h3 class="evo-h" style="margin:0 0 8px">⏳ Gönderdiğin davetler</h3>${out.map(([to, x]) => `<div class="mate"><div class="grow">${esc((st[to] || {}).name || '?')} — ${esc(EVO.stageName(x.eid, x.level))} ile</div><button class="ebtn sm" data-cancel="${to}">Geri Al</button></div>`).join('')}</div>` : ''}
      <h3 class="evo-h">Sınıf arkadaşların</h3>
      <div class="mates">${mates.map(([sid, x]) => `<div class="mate"><span class="on${online[sid] ? ' y' : ''}" title="${online[sid] ? 'Çevrimiçi' : 'Çevrimdışı'}"></span><div class="grow">${EVO.nameTag(x.name, sid, this.plat, this.drag)}<br><small>${best(sid)}</small></div>
        <button class="ebtn primary sm" data-inv="${sid}" ${!open || outTo.has(sid) || !Object.keys((this.d.panteon || {})[sid] || {}).length ? 'disabled' : ''}>⚔ Davet</button></div>`).join('') || '<p class="emuted">Sınıfta başka öğrenci yok.</p>'}</div>`;
    body.querySelectorAll('[data-inv]').forEach((b) => b.addEventListener('click', () => this.pickEvolet(`⚔ ${esc(st[b.dataset.inv].name)} ile savaş — Evoletini seç`, async (eid, lvl) => {
      try { await EVO.S.invite(this.me.cid, { sid: this.me.sid, name: this.meS().name }, b.dataset.inv, eid, lvl); EVO.toast('Davet gönderildi!'); } catch (e) { EVO.toast(EVO.authError(e), true); }
    })));
    body.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => EVO.S.cancelInvite(this.me.cid, this.me.sid, b.dataset.cancel)));
    body.querySelectorAll('[data-rej]').forEach((b) => b.addEventListener('click', () => EVO.S.cancelInvite(this.me.cid, b.dataset.rej, this.me.sid)));
    body.querySelectorAll('[data-acc]').forEach((b) => b.addEventListener('click', () => {
      const from = b.dataset.acc, inv = ((this.d.invites || {})[this.me.sid] || {})[from];
      if (!inv) return;
      if (EVO.isResting(((this.d.panteon || {})[from] || {})[inv.eid], EVO.now())) { EVO.toast('Rakibin Evoleti şu an dinleniyor.', true); EVO.S.cancelInvite(this.me.cid, from, this.me.sid); return; }
      this.pickEvolet(`⚔ ${esc(inv.name)} ile savaş — Evoletini seç`, async (eid, lvl) => {
        try { await EVO.S.accept(this.me.cid, { sid: this.me.sid, uid: this.me.uid, name: this.meS().name }, from, inv, eid, lvl, (st[from] || {}).uid); }
        catch (e) { EVO.toast(EVO.authError(e), true); }
      });
    }));
  },

  // inbox'taki savaşı izle
  followBattle() {
    const bid = this.d.inbox && this.d.inbox.bid;
    if (this.battle && this.battle.bid === bid) return;
    if (this.battleOff) this.battleOff(); this.battleOff = null; this.battle = null;
    if (this.stopWatch) this.stopWatch(); this.stopWatch = null;
    if (!bid) return;
    const ref = EVO.ref(`classes/${this.me.cid}/battles/${bid}`);
    const cb = ref.on('value', (s) => {
      const st = s.val();
      if (!st) { this.battle = null; this.renderBattle(); return; }
      const prev = this.battle && this.battle.st;
      this.battle = { bid, st, prevHp: prev ? { A: prev.A.hp, B: prev.B.hp } : null };
      if (st.status === 'done') this.battlePost(bid, st);
      this.renderBattle();
    });
    this.battleOff = () => ref.off('value', cb);
    this.stopWatch = EVO.createTurnWatcher({
      now: EVO.now,
      getState: () => this.battle && this.battle.st,
      onTick: (left) => { const t = $('#b-timer'); if (t) { t.querySelector('span').textContent = left; t.style.setProperty('--p', left / (EVO.TURN_MS / 1000)); t.classList.toggle('low', left <= 5); } },
      onAuto: (st) => EVO.S.move(this.me.cid, bid, st.turn, 0, true),
    });
  },
  // Savaş sonu: puan (bir kez), kaybeden Evoletin 18 saat dinlenmesi
  async battlePost(bid, st) {
    const side = (st.u || {})[this.me.uid];
    if (!side || this.posted.has(bid)) return;
    this.posted.add(bid);
    const loser = st.winner === 'A' ? 'B' : 'A';
    await EVO.S.setRest(this.me.cid, st[loser].sid, st[loser].eid, (st.ended || EVO.now()) + EVO.REST_MS);
    const r = await EVO.ref(`classes/${this.me.cid}/battles/${bid}/post${side}`).transaction((v) => (v ? undefined : true));
    if (r.committed) await EVO.S.addPoints(this.me.cid, this.me.sid, st.winner === side).catch((e) => console.warn(e));
  },
  renderBattle() {
    const slot = $('#battle-slot');
    if (!slot) return;
    const b = this.battle;
    if (!b || !b.st) { slot.innerHTML = ''; return; }
    const st = b.st, mySide = (st.u || {})[this.me.uid];
    if (!mySide) { slot.innerHTML = ''; return; }
    const foeSide = mySide === 'A' ? 'B' : 'A', me = st[mySide], foe = st[foeSide];
    const myTurn = st.status === 'active' && st.turn === mySide;
    const hp = (f) => { const p = Math.max(0, f.hp / f.max); return `<div class="hpbar"><i class="${p < 0.25 ? 'low' : p < 0.5 ? 'mid' : ''}" style="width:${p * 100}%"></i></div><div class="hptext">${f.hp} / ${f.max} HP</div>`; };
    const stat = (f) => [f.sa ? `ATK ${f.sa > 0 ? '↑' : '↓'}${Math.abs(f.sa)}` : '', f.sd ? `DEF ${f.sd > 0 ? '↑' : '↓'}${Math.abs(f.sd)}` : '', f.dot ? (f.dotK === 'burn' ? '🔥 yanık' : '☠️ zehir') : '', f.stun ? '💫 sersem' : ''].filter(Boolean).join(' · ');
    const side = (f, s, label) => `<div class="b-side${st.turn === s && st.status === 'active' ? ' turn' : ''}${b.prevHp && b.prevHp[s] > f.hp ? ' hit' : ''}" style="--tc:${EVO.TYPE_INFO[f.type].color}">
      <div class="small emuted">${label}</div>${EVO.artHTML(f.eid, f.lvl)}<div class="evo-name" style="font-size:1rem">${esc(f.title)}</div>
      <div class="small">${EVO.nameTag(f.name, f.sid, this.plat, this.drag)} · Lv ${f.lvl} · ${EVO.typeChip(f.type, true)}</div>${hp(f)}<div class="b-status">${stat(f)}</div></div>`;
    const skills = EVO.skillsFor(me.eid, me.lvl).map((sk, i) => `<button class="b-skill" style="--tc:${EVO.TYPE_INFO[me.type].color}" data-sk="${i}" ${!myTurn || (me.cd || [])[i] > 0 ? 'disabled' : ''}>
      <b>${esc(sk.n)}</b><small>Güç ${sk.p}${sk.a < 100 ? ` · %${sk.a}` : ''}${(me.cd || [])[i] > 0 ? ` · ⏳ ${me.cd[i]} tur` : sk.cd ? ` · ${sk.cd} tur bekler` : ''} · ${EVO.typeMult(me.type, foe.type) >= 2 ? '✅ çok etkili' : EVO.typeMult(me.type, foe.type) <= 0.5 ? '🔻 az etkili' : 'nötr'}</small></button>`).join('');
    const done = st.status === 'done', won = st.winner === mySide;
    slot.innerHTML = `<div class="epanel battle" style="margin-bottom:16px;border-color:${done ? (won ? 'var(--em-ok)' : 'var(--em-danger)') : 'var(--em-copper)'}">
      <div class="spread"><h2 class="evo-h" style="margin:0">⚔ MythBattle Arena</h2>${done ? '' : '<button class="ebtn danger sm" id="b-ff">🏳 Teslim Ol</button>'}</div>
      <div class="b-field">${side(me, mySide, 'Sen')}<div><div class="b-vs">VS</div>${done ? '' : `<div class="b-timer" id="b-timer" style="--p:${EVO.turnLeft(st, EVO.now()) / EVO.TURN_MS}"><span>${Math.ceil(EVO.turnLeft(st, EVO.now()) / 1000)}</span></div><div class="center small emuted">${myTurn ? '<b style="color:var(--em-ok)">Senin sıran!</b>' : 'Rakibin düşünüyor…'}</div>`}</div>${side(foe, foeSide, 'Rakip')}</div>
      ${done ? `<div class="center"><div class="huge">${won ? '🏆' : '😴'}</div><h2 class="evo-h">${won ? `Kazandın! +${EVO.PVP_POINTS.win} liderlik puanı` : `Kaybettin. +${EVO.PVP_POINTS.loss} katılım puanı`}</h2>${won ? '' : `<p class="emuted">${esc(me.title)} gücünü kaybetti, 18 saat dinlenecek. İksirle erkenden hazırlayabilirsin.</p>`}<button class="ebtn primary" id="b-close">Kapat</button></div>`
        : `<div class="b-skills">${skills}</div>`}
      <div class="b-log">${(st.log || []).slice().reverse().map((l) => `<div>${esc(l)}</div>`).join('')}</div></div>`;
    b.prevHp = null; // vuruş animasyonu yalnızca bir kez
    slot.querySelectorAll('[data-sk]').forEach((btn) => btn.addEventListener('click', async () => {
      slot.querySelectorAll('[data-sk]').forEach((x) => { x.disabled = true; });
      try { await EVO.S.move(this.me.cid, b.bid, mySide, +btn.dataset.sk, false); } catch (e) { EVO.toast(EVO.authError(e), true); }
    }));
    $('#b-ff')?.addEventListener('click', () => { if (confirm('Teslim olursan Evoletin 18 saat dinlenir. Emin misin?')) EVO.S.forfeit(this.me.cid, b.bid, mySide); });
    $('#b-close')?.addEventListener('click', async () => {
      // İki taraf da puanını aldıysa savaş kaydı silinir
      const cur = (await EVO.ref(`classes/${this.me.cid}/battles/${b.bid}`).once('value')).val();
      await EVO.ref(`classes/${this.me.cid}/inbox/${this.me.sid}`).remove();
      if (cur && cur.postA && cur.postB) EVO.ref(`classes/${this.me.cid}/battles/${b.bid}`).remove().catch(() => {});
    });
  },

  /* ---------------- Yelbegen ---------------- */
  raidPost() {
    const s = this.d.raid;
    if (this.raidWatch && (!s || s.status !== 'active')) { this.raidWatch(); this.raidWatch = null; }
    if (s && s.status === 'active' && !this.raidWatch) {
      this.raidWatch = EVO.createTurnWatcher({
        now: EVO.now,
        getState: () => this.d.raid,
        onTick: (left) => { const t = $('#r-timer'); if (t) { t.querySelector('span').textContent = left; t.style.setProperty('--p', left / (EVO.TURN_MS / 1000)); t.classList.toggle('low', left <= 5); } },
        onAuto: (st) => EVO.S.raidMove(this.me.cid, EVO.raidActor(st), 0, true),
      });
    }
    if (s && ['won', 'lost'].includes(s.status) && s.slots && s.slots[this.me.sid] && !this.posted.has('raid' + s.started)) {
      this.posted.add('raid' + s.started);
      EVO.S.raidArchive(this.me.cid, s).catch((e) => console.warn(e));
      Object.values(s.slots).forEach((f) => { if (f.hp <= 0) EVO.S.setRest(this.me.cid, f.sid, f.eid, (s.ended || EVO.now()) + EVO.REST_MS); });
    }
  },
  renderRaid(body) {
    const now = EVO.now(), m = this.d.meta || {}, open = EVO.isOpen(m.raid, now), s = this.d.raid;
    const slots = (s && s.slots) || {}, inTeam = !!slots[this.me.sid];
    const bossArt = EVO.ART_READY.includes('yelbegen') ? `<div class="boss-art"><img src="${EVO.ART_BASE}yelbegen.webp" alt="Yelbegen"></div>` : '<div class="boss-art">🐲🐲🐲</div>';
    const intro = `<div class="enote ${open ? 'ok' : 'warn'}">⏰ Yelbegen savaşı: <b>${EVO.scheduleText(m.raid)}</b>${open ? '' : ' — şu an takıma katılınamaz.'}</div>
      <div class="boss-box">${bossArt}<h2 class="evo-h" style="margin:4px 0">Yelbegen vs Alpler: Semruk'u Kurtarmak</h2>
      <p class="emuted small">Üç başlı, zırh pullu ejderha Yelbegen, Semruk'u esir aldı! 6 Alp en güçlü Evoletleriyle birlikte savaşır.<br>
      <b>Pasif 1:</b> Ruh türü hariç tüm Evoletlere 2x vurur. · <b>Pasif 2:</b> Gökyüzü türü Evoletler Yelbegen'e 1,5x vurur.<br>
      Can: en az ${EVO.bossMinHP()} (6 adet Level 9 mpg Evoletin toplam canı). Zafer ödülü: 2 hafta 🐉 ejderha sembolü ve alevli isim kartı.</p></div>`;
    if (!s || s.status === 'lobby') {
      const list = Object.values(slots);
      body.innerHTML = intro + `<div class="epanel" style="margin-top:12px"><div class="spread"><h3 class="evo-h" style="margin:0">Alpler Takımı (${list.length}/${EVO.RAID_SIZE})</h3>
        <div class="row">${inTeam ? '<button class="ebtn danger sm" id="r-leave">Takımdan Ayrıl</button>' : `<button class="ebtn primary" id="r-join" ${open ? '' : 'disabled'}>🛡 Takıma Katıl</button>`}
        ${list.length >= EVO.RAID_SIZE && inTeam ? '<button class="ebtn copper" id="r-start">⚔ Savaşı Başlat</button>' : ''}</div></div>
        <div class="raid-team" style="margin-top:10px">${list.map((f) => this.raidSlot(f, s)).join('')}${Array.from({ length: EVO.RAID_SIZE - list.length }, () => '<div class="ghost-card" style="min-height:150px">Boş yer</div>').join('')}</div>
        <p class="emuted small">Takım 6 kişi olunca takımdaki herkes savaşı başlatabilir. Sıra hız (SPD) değerine göredir; herkes oynadıktan sonra Yelbegen saldırır.</p></div>` + this.raidHistoryHTML();
      $('#r-join')?.addEventListener('click', () => this.pickEvolet('🛡 Yelbegen\'e karşı Evoletini seç', async (eid, lvl) => {
        try { await EVO.S.raidJoin(this.me.cid, { sid: this.me.sid, uid: this.me.uid, name: this.meS().name }, eid, lvl); } catch (e) { EVO.toast(e.message || EVO.authError(e), true); }
      }));
      $('#r-leave')?.addEventListener('click', () => EVO.S.raidLeave(this.me.cid, this.me.sid));
      $('#r-start')?.addEventListener('click', () => EVO.S.raidStart(this.me.cid));
      return;
    }
    const actor = EVO.raidActor(s), myTurn = s.status === 'active' && actor === this.me.sid, me = slots[this.me.sid];
    const bp = Math.max(0, s.boss.hp / s.boss.max);
    const done = s.status !== 'active';
    body.innerHTML = `<div class="epanel battle">
      <div class="boss-box">${bossArt}<h2 class="evo-h" style="margin:4px 0">Yelbegen · Tur ${s.round}</h2>
        <div class="hpbar" style="height:20px"><i class="${bp < 0.25 ? 'low' : bp < 0.5 ? 'mid' : ''}" style="width:${bp * 100}%"></i></div><div class="hptext">${s.boss.hp} / ${s.boss.max} HP${s.boss.sd ? ` · DEF ${s.boss.sd > 0 ? '↑' : '↓'}` : ''}${s.boss.dot ? ' · ' + (s.boss.dotK === 'burn' ? '🔥' : '☠️') : ''}</div></div>
      ${done ? `<div class="center"><div class="huge">${s.status === 'won' ? '🏆' : '💀'}</div><h2 class="evo-h">${s.status === 'won' ? 'Zafer! Semruk kurtarıldı!' : 'Yelbegen kazandı…'}</h2><p class="emuted">${s.status === 'won' ? 'Takımdaki herkesin isim kartında 2 hafta boyunca 🐉 ejderha sembolü ve alev efekti yanacak!' : 'Evoletlerini güçlendirip tekrar deneyin.'} Canı biten Evoletler 18 saat dinlenir.</p><button class="ebtn primary" id="r-new">Yeni Takım Kur</button></div>`
        : `<div class="row" style="justify-content:center"><div class="b-timer" id="r-timer" style="--p:${EVO.turnLeft(s, now) / EVO.TURN_MS}"><span>${Math.ceil(EVO.turnLeft(s, now) / 1000)}</span></div><div>${myTurn ? '<b style="color:var(--em-ok);font-size:1.1rem">Senin sıran!</b>' : `Sıra: <b>${esc((slots[actor] || {}).name || '')}</b>`}</div></div>`}
      <div class="raid-team">${(s.order || []).map((sid) => this.raidSlot(slots[sid], s)).join('')}</div>
      ${myTurn && me ? `<div class="b-skills">${EVO.skillsFor(me.eid, me.lvl).map((sk, i) => `<button class="b-skill" style="--tc:${EVO.TYPE_INFO[me.type].color}" data-rsk="${i}" ${(me.cd || [])[i] > 0 ? 'disabled' : ''}><b>${esc(sk.n)}</b><small>Güç ${sk.p}${(me.cd || [])[i] > 0 ? ` · ⏳ ${me.cd[i]}` : ''}${me.type === 'gok' ? ' · 🪶 1,5x' : ''}</small></button>`).join('')}</div>` : ''}
      <div class="b-log">${(s.log || []).slice().reverse().map((l) => `<div>${esc(l)}</div>`).join('')}</div></div>` + this.raidHistoryHTML();
    body.querySelectorAll('[data-rsk]').forEach((b) => b.addEventListener('click', async () => { body.querySelectorAll('[data-rsk]').forEach((x) => { x.disabled = true; }); try { await EVO.S.raidMove(this.me.cid, this.me.sid, +b.dataset.rsk, false); } catch (e) { EVO.toast(EVO.authError(e), true); } }));
    $('#r-new')?.addEventListener('click', async () => { await EVO.S.raidArchive(this.me.cid, s).catch(() => {}); await EVO.S.raidReset(this.me.cid); });
  },
  raidSlot(f, s) {
    if (!f) return '';
    const p = Math.max(0, f.hp / f.max), turn = s.status === 'active' && EVO.raidActor(s) === f.sid;
    return `<div class="b-side${turn ? ' turn' : ''}${f.hp <= 0 ? ' ko' : ''}" style="--tc:${EVO.TYPE_INFO[f.type].color}">${EVO.artHTML(f.eid, f.lvl)}
      <div class="small"><b>${esc(f.title)}</b> · Lv ${f.lvl}</div><div class="small">${EVO.nameTag(f.name, f.sid, this.plat, this.drag)}</div>
      ${s.status === 'lobby' ? `<div class="small emuted">${f.max} HP · ${EVO.TYPE_INFO[f.type].name}</div>` : `<div class="hpbar"><i class="${p < 0.25 ? 'low' : p < 0.5 ? 'mid' : ''}" style="width:${p * 100}%"></i></div><div class="hptext">${f.hp}/${f.max}</div>`}</div>`;
  },
  raidHistoryHTML() {
    const h = Object.values(this.d.raidHistory || {}).sort((a, b) => b.at - a.at).slice(0, 6);
    if (!h.length) return '';
    const st = this.d.students || {};
    return `<div class="epanel" style="margin-top:12px"><h3 class="evo-h" style="margin:0 0 8px">Geçmiş savaşlar</h3>${h.map((x) => `<div class="kv"><span>${new Date(x.at).toLocaleDateString('tr-TR')} · ${x.rounds} tur</span><b>${x.won ? '🏆 Zafer' : '💀 Yenilgi'} — ${Object.keys(x.sids || {}).map((s) => esc((st[s] || {}).name || '?')).join(', ')}</b></div>`).join('')}</div>`;
  },

  /* ---------------- Liderlik ---------------- */
  renderLB(body) {
    const now = EVO.now(), wk = EVO.weekKey(now), cur = (this.d.lb || {})[wk] || {}, st = this.d.students || {};
    const rows = Object.entries(st).map(([sid, s]) => ({ sid, name: s.name, ...(cur[sid] || { p: 0, w: 0, l: 0 }) })).sort((a, b) => b.p - a.p || b.w - a.w || a.name.localeCompare(b.name, 'tr'));
    const prev = [...this.plat].map((sid) => esc((st[sid] || {}).name || '?'));
    const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + 7);
    body.innerHTML = `<div class="epanel">
      <div class="spread"><h3 class="evo-h" style="margin:0">🏆 Haftalık Liderlik (${wk})</h3><span class="emuted small">Sıfırlanma: ${monday.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} 00:00</span></div>
      <p class="emuted small">MythBattle Arena: galibiyet +${EVO.PVP_POINTS.win}, mağlubiyet +${EVO.PVP_POINTS.loss} puan. Haftayı ilk ${EVO.PLATINUM_TOP}'te bitirenlerin kartları 1 hafta boyunca ✨ platin çerçeveyle parlar.</p>
      ${prev.length ? `<div class="enote ok">✨ Geçen haftanın şampiyonları: <b>${prev.join(', ')}</b></div>` : ''}
      <table class="lb"><thead><tr><th>#</th><th>Öğrenci</th><th>Puan</th><th>G / M</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="${r.sid === this.me.sid ? 'me' : ''}"><td class="rank">${i < 3 && r.p > 0 ? `<span class="medal">${['🥇', '🥈', '🥉'][i]}</span>` : i + 1}</td><td>${EVO.nameTag(r.name, r.sid, this.plat, this.drag)}</td><td><b>${r.p}</b></td><td>${r.w} / ${r.l}</td></tr>`).join('')}
      </tbody></table></div>`;
  },

  /* ---------------- Tür tablosu / Kurallar ---------------- */
  renderTypes(body) {
    body.innerHTML = `<div class="epanel"><h3 class="evo-h" style="margin:0 0 6px">🧭 Tür Matrisi</h3>
      <p class="emuted small">Satırdaki tür, sütundaki türe saldırınca hasar bu çarpanla çarpılır. <b style="color:#9ff0c2">2x</b> çok etkili, <b style="color:#ffc2c9">½x</b> az etkili.</p>${EVO.matrixHTML()}</div>
      <div class="epanel" style="margin-top:12px"><h3 class="evo-h" style="margin:0 0 8px">Tüm Evoletler</h3>
      ${EVO.TYPES.map((t) => `<div class="kv"><span>${EVO.typeChip(t)}</span><b>${EVO.EVOLETS.filter((e) => e.type === t).map((e) => `${e.symbols[0]} ${esc(e.name)}`).join(' · ')}</b></div>`).join('')}</div>`;
  },
  renderRules(body) {
    const B = EVO.BEHAVIORS;
    const li = (arr) => arr.map((b) => `<div class="kv"><span>${b.icon} ${esc(b.label)}</span><b style="color:${b.ep > 0 ? 'var(--em-ok)' : 'var(--em-danger)'}">${b.ep > 0 ? '+' : ''}${b.ep} EP</b></div>`).join('');
    body.innerHTML = `<div class="grid2">
      <div class="epanel"><h3 class="evo-h" style="margin:0 0 8px">💠 EP nasıl kazanılır?</h3>
        <div class="kv"><span>📗 Ödev yaptı</span><b style="color:var(--em-ok)">+${EVO.HOMEWORK_EP} EP + 1 Evolet</b></div>${li(B.plus)}
        <h3 class="evo-h" style="margin:14px 0 8px">EP kaybettiren davranışlar</h3>${li(B.minus)}</div>
      <div class="epanel"><h3 class="evo-h" style="margin:0 0 8px">🧬 Level ve Evrim</h3>
        ${Array.from({ length: 9 }, (_, i) => `<div class="kv"><span>Level ${i + 1} → ${i + 2}${i + 1 === 3 || i + 1 === 6 ? ' <b style="color:var(--em-copper)">EVRİM</b>' : ''}</span><b>${EVO.levelCost(i + 1)} EP</b></div>`).join('')}
        <p class="emuted small">Level 1–3 Temel · 4–6 Gelişmiş (mid) · 7+ Mega Pantheon Guard (mpg, sınırsız). Evrimde statlar katlanarak artar ve yeni yetenek açılır.</p>
        <h3 class="evo-h" style="margin:14px 0 8px">🎁 Evolet kazanma</h3>
        <div class="kv"><span>🔥 Alev · 🐛 Böcek · 🌿 Doğa</span><b>%40</b></div><div class="kv"><span>💧 Su · ☠️ Zehirli · ⛰️ Toprak · 🧱 Taş</span><b>%33</b></div><div class="kv"><span>⚡ Elektrik · ☁️ Gökyüzü</span><b>%27</b></div>
        <div class="kv"><span>🔮 Ruh</span><b>Yalnızca 5 ardışık ödevde</b></div>
        <p class="emuted small">Sahip olduğun Evolet tekrar düşmez. Devamsız/izinli/raporlu günlerde ödev serin dondurulur, bozulmaz.</p>
        <h3 class="evo-h" style="margin:14px 0 8px">😴 Dinlenme ve iksirler</h3>
        <p class="small">Savaşta canı biten Evolet 18 saat dinlenir. ${Object.values(EVO.POTIONS).map((p) => `${p.icon} ${p.label}: ${p.cost} EP (${p.cutMs === Infinity ? 'hemen hazır' : EVO.fmtDur(p.cutMs) + ' kısaltır'})`).join(' · ')}</p></div></div>`;
  },
};
})();
