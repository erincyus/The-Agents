/* =====================================================================
   EVOMYTH — ortak oyun motoru (site, öğrenci portalı ve akıllı tahta)
   thegamifyclass.com · Evolet verileri, tür matrisi, statlar, hasar,
   drop oranları, Ruh serisi, dinlenme/iksir, 20 sn hamle saati,
   PvP ve Yelbegen savaş motorları, kart çizimi, Excel okuma/yazma.
   Tarayıcıda window.EVO, Node'da module.exports olarak kullanılır.
   ===================================================================== */
(function (root) {
'use strict';

const EVO = {};
EVO.VERSION = '1.0.0';
EVO.SITE = 'https://www.thegamifyclass.com';
EVO.FIREBASE = {
  apiKey: 'AIzaSyBxBzCkrJ9D8Uf9EcVGC80WcD116BtoUI4',
  authDomain: 'the-agents-69182.firebaseapp.com',
  databaseURL: 'https://the-agents-69182-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'the-agents-69182',
  storageBucket: 'the-agents-69182.firebasestorage.app',
  messagingSenderId: '516259979836',
  appId: '1:516259979836:web:868a36a1551cb2e9d61939',
};
EVO.ADMIN_UID = 'eDTGhzccveNDugVZ9z0e2HmEhqr2';
EVO.STUDENT_DOMAIN = 'ogrenci.thegamifyclass.com'; // öğrenci giriş e-postası: kullaniciadi@ogrenci.thegamifyclass.com
EVO.ART_BASE = 'assets/evomyth/evolets/';           // Evolet görselleri: <evoletId>-<evre 1|2|3>.webp (arka plansız)
// Görseli hazır olan kartlar (ör. 'akana-1'). Listede olmayanlar sembolle çizilir. Aşağıda EVOLETS'ten sonra doldurulur.
EVO.ART_READY = [];

/* ------------------------------------------------------------------ */
/* 1. TÜRLER VE TÜR MATRİSİ (Excel: TÜR MATRİSİ VE HASAR SİSTEMİ)      */
/* ------------------------------------------------------------------ */
EVO.TYPES = ['su', 'alev', 'doga', 'zehir', 'toprak', 'gok', 'bocek', 'elektrik', 'ruh', 'tas'];
EVO.TYPE_INFO = {
  su:       { name: 'Su',       color: '#2f9bff', icon: '💧' },
  alev:     { name: 'Alev',     color: '#ff5a1f', icon: '🔥' },
  doga:     { name: 'Doğa',     color: '#2fbf57', icon: '🌿' },
  zehir:    { name: 'Zehirli',  color: '#a347f0', icon: '☠️' },
  toprak:   { name: 'Toprak',   color: '#b3772f', icon: '⛰️' },
  gok:      { name: 'Gökyüzü',  color: '#55c8f5', icon: '☁️' },
  bocek:    { name: 'Böcek',    color: '#93b81a', icon: '🐛' },
  elektrik: { name: 'Elektrik', color: '#f5c400', icon: '⚡' },
  ruh:      { name: 'Ruh',      color: '#7f6bff', icon: '🔮' },
  tas:      { name: 'Taş',      color: '#8d8f9a', icon: '🧱' },
};
// Satır = saldıran, sütun = savunan (EVO.TYPES sırasıyla). Excel'deki 1. tablonun birebir kopyası.
EVO.MATRIX = {
  su:       [0.5, 2,   0.5, 1,   2,   1,   1,   1,   1,   2  ],
  alev:     [0.5, 0.5, 2,   1,   1,   1,   2,   1,   1,   0.5],
  doga:     [2,   0.5, 0.5, 0.5, 2,   0.5, 0.5, 1,   1,   2  ],
  zehir:    [1,   1,   2,   0.5, 0.5, 1,   1,   1,   2,   0.5],
  toprak:   [1,   2,   0.5, 2,   1,   0.5, 0.5, 2,   1,   2  ],
  gok:      [1,   1,   2,   1,   2,   1,   2,   0.5, 1,   0.5],
  bocek:    [1,   0.5, 2,   0.5, 1,   0.5, 1,   2,   0.5, 1  ],
  elektrik: [2,   1,   0.5, 1,   0.5, 2,   1,   0.5, 1,   1  ],
  ruh:      [1,   1,   1,   1,   1,   1,   1,   1,   2,   1  ],
  tas:      [1,   2,   1,   1,   0.5, 2,   2,   1,   1,   1  ],
};
EVO.typeMult = (atk, def) => EVO.MATRIX[atk][EVO.TYPES.indexOf(def)];

// Kartlardaki "kime karşı güçlü / zayıf" bilgisi doğrudan matristen hesaplanır
EVO.typeRelations = function (type) {
  const row = EVO.MATRIX[type];
  const strong = [], weakAtk = [], weakDef = [], resist = [];
  EVO.TYPES.forEach((t, i) => {
    if (row[i] === 2) strong.push(t);
    if (row[i] === 0.5) weakAtk.push(t);
    const inc = EVO.MATRIX[t][EVO.TYPES.indexOf(type)];
    if (inc === 2) weakDef.push(t);
    if (inc === 0.5) resist.push(t);
  });
  return { strong, weakAtk, weakDef, resist };
};

/* ------------------------------------------------------------------ */
/* 2. EVRELER, EVOLETLER VE YETENEKLER                                 */
/* ------------------------------------------------------------------ */
EVO.STAGES = [
  { key: 'temel', title: 'Temel',               prefix: '',     maxLevel: 3,        skills: 2 },
  { key: 'mid',   title: 'Gelişmiş',            prefix: 'mid ', maxLevel: 6,        skills: 3 },
  { key: 'mpg',   title: 'Mega Pantheon Guard', prefix: 'mpg ', maxLevel: Infinity, skills: 4 },
];
EVO.stageOf = (level) => (level <= 3 ? 0 : level <= 6 ? 1 : 2);

// Yetenek: n ad, p güç, a isabet %, cd bekleme (tur), fx etki, v etki değeri
// Etkiler: heal (kendini max HP'nin v%'i kadar iyileştir), drain (verdiği hasarın v%'i kadar iyileş),
// atkUp/defUp (kendine +1 kademe), atkDown/defDown (%v olasılıkla rakibe −1 kademe),
// burn/poison (%v olasılıkla yanık/zehir), stun (%v olasılıkla rakip 1 tur bekler),
// crit (kritik şansı +%v), recoil (verdiği hasarın %v'i kadar kendine hasar)
const S = (n, p, a, cd, fx, v) => ({ n, p, a, cd, fx: fx || '', v: v || 0 });

// [id, ad, tür, tasvir, sembol(ler), taban statlar {hp, atk, def, spd}, 4 yetenek]
const RAW = [
  ['akana', 'Akana', 'su', 'Su tanrıçası', '🧜‍♀️', [60, 14, 12, 16], [
    S('Dalga Tokadı', 40, 100, 0), S('Şifalı Akıntı', 55, 95, 2, 'heal', 12), S('Gelgit Kalkanı', 70, 95, 2, 'defUp'), S('Okyanusun Kalbi', 95, 90, 3, 'heal', 15)]],
  ['hydra', 'Hydra', 'su', 'Mitolojik timsah', '🐊', [72, 15, 16, 8], [
    S('Pençe Sıçratma', 40, 100, 0), S('Timsah Isırığı', 65, 95, 1, 'defDown', 30), S('Bataklık Çekişi', 75, 90, 2, 'atkDown', 40), S('Çok Başlı Girdap', 105, 85, 3)]],
  ['poseidis', 'Poseidis', 'su', 'Su tanrısı', '🔱', [62, 18, 12, 11], [
    S('Su Mızrağı', 40, 100, 0), S('Üç Dişli Darbe', 65, 95, 1, 'crit', 25), S('Deniz Fırtınası', 80, 90, 2, 'defDown', 30), S('Tsunami Hükmü', 110, 85, 3)]],
  ['arinna', 'Arinna', 'alev', 'Güneş tanrıçası', '☀️', [56, 17, 10, 16], [
    S('Güneş Kıvılcımı', 40, 100, 0), S('Şafak Işını', 60, 95, 1, 'burn', 30), S('Gün Ortası Kavurması', 80, 90, 2, 'burn', 40), S('Güneş Tacı', 105, 90, 3, 'heal', 10)]],
  ['surtrus', 'Surtrus', 'alev', 'Alevli savaşçı', '⚔️', [64, 19, 13, 9], [
    S('Alevli Kılıç', 40, 100, 0), S('Kor Yarma', 65, 95, 1, 'crit', 20), S('Muspelheim Öfkesi', 80, 90, 2, 'atkUp'), S('Ragnarök Alevi', 115, 85, 3, 'recoil', 15)]],
  ['oteesi', 'Oteesi', 'alev', 'Kor ateş ruhu', '☄️', [52, 16, 10, 18], [
    S('Kor Dokunuşu', 40, 100, 0), S('Ateş Dansı', 60, 95, 1, 'burn', 35), S('Yanan Ruh', 75, 95, 2, 'drain', 30), S('Sönmeyen Kor', 100, 90, 3, 'burn', 50)]],
  ['yggdror', 'Yggdror', 'doga', 'Ağaç formunda insansı canlı', '🌳', [76, 13, 17, 8], [
    S('Kök Kırbacı', 40, 100, 0), S('Dal Çarpması', 60, 95, 1, 'defUp'), S('Dünya Ağacı Kökleri', 75, 95, 2, 'drain', 35), S('Dokuz Dünyanın Gücü', 100, 90, 3, 'heal', 15)]],
  ['cernunnos', 'Cernunnos', 'doga', 'Tek boynuzlu kedi — evrimle aslana dönüşür', ['🐱', '🐆', '🦁'], [58, 17, 11, 15], [
    S('Boynuz Sıçrayışı', 40, 100, 0), S('Orman Pençesi', 65, 95, 1, 'crit', 25), S('Vahşi Kükreyiş', 75, 90, 2, 'atkDown', 50), S('Aslan Kral Hücumu', 110, 85, 3)]],
  ['nefesi', 'Nefesi', 'doga', 'Gövdesi sarmaşık ve yapraklarla kaplı ala geyik', '🦌', [66, 15, 14, 11], [
    S('Sarmaşık Sarması', 40, 100, 0), S('Yaprak Fırtınası', 60, 95, 1, 'defDown', 30), S('Ala Geyik Hücumu', 80, 90, 2), S('Baharın Nefesi', 95, 95, 3, 'heal', 20)]],
  ['basilisk', 'Basilisk', 'zehir', 'Horoz kafalı varlık', '🐓', [60, 16, 13, 13], [
    S('Zehirli Gaga', 40, 100, 0), S('Taşlaştıran Bakış', 55, 90, 2, 'stun', 25), S('Horoz Çığlığı', 75, 90, 2, 'atkDown', 40), S('Ölümcül Nazar', 105, 85, 3, 'poison', 40)]],
  ['medusa', 'Medusa', 'zehir', 'Yılan saçlı kadın', '🐍', [56, 17, 11, 15], [
    S('Yılan Isırığı', 40, 100, 0, 'poison', 20), S('Zehir Saçı', 60, 95, 1, 'poison', 40), S('Gorgon Bakışı', 70, 90, 3, 'stun', 25), S('Taş Kesilme Laneti', 105, 85, 3, 'defDown', 50)]],
  ['mantikor', 'Mantikor', 'zehir', 'Akrep kuyruklu aslan', '🦂', [68, 18, 13, 8], [
    S('Akrep İğnesi', 40, 100, 0, 'poison', 20), S('Aslan Pençesi', 65, 95, 1, 'crit', 20), S('Zehirli Kuyruk Savuruşu', 80, 90, 2, 'poison', 40), S('Mantikor Öfkesi', 115, 80, 3)]],
  ['kibele', 'Kibele', 'toprak', 'Çatlamış topraktan kadın', '🏺', [64, 14, 16, 11], [
    S('Toprak Çatlağı', 40, 100, 0), S('Bereket Kalkanı', 55, 95, 1, 'defUp'), S('Yer Sarsıntısı', 75, 90, 2, 'defDown', 30), S('Ana Tanrıça Gazabı', 100, 90, 3, 'heal', 12)]],
  ['gaia', 'Gaia', 'toprak', 'Dağ titanı', '🏔️', [80, 15, 18, 4], [
    S('Kaya Yumruğu', 40, 100, 0), S('Dağ Devrilmesi', 65, 95, 1, 'atkDown', 25), S('Titan Adımı', 80, 90, 3, 'stun', 20), S('Dünya Titremesi', 110, 85, 3)]],
  ['jormunground', 'Jörmunground', 'toprak', 'Topraktan savaşçı', '🛡️', [66, 17, 15, 8], [
    S('Toprak Kılıcı', 40, 100, 0), S('Çamur Kalkanı', 60, 95, 1, 'defUp'), S('Yeraltı Pususu', 80, 90, 2, 'crit', 25), S('Dünya Yılanı Halkası', 110, 85, 3, 'defDown', 40)]],
  ['tulpar', 'Tulpar', 'gok', 'Kanatlı at', '🐎', [58, 15, 11, 18], [
    S('Kanat Rüzgârı', 40, 100, 0), S('Gök Toynağı', 65, 95, 1, 'crit', 20), S('Bulut Hücumu', 75, 95, 2, 'atkUp'), S('Göksel Dörtnala', 105, 90, 3)]],
  ['huma', 'Huma', 'gok', 'Ayaksız, renkli kanatlı anka benzeri kuş', '🦚', [60, 16, 12, 14], [
    S('Renkli Tüy Oku', 40, 100, 0), S('Talih Gölgesi', 55, 95, 2, 'heal', 15), S('Gökkuşağı Işıltısı', 75, 90, 2, 'atkDown', 40), S('Devlet Kuşu Kanatları', 100, 90, 3, 'heal', 15)]],
  ['oksoko', 'Öksökö', 'gok', 'Çift başlı kartal', '🦅', [62, 18, 12, 12], [
    S('Çift Gaga Darbesi', 40, 100, 0), S('Pike Dalışı', 65, 95, 1, 'crit', 30), S('İki Başlı Çığlık', 75, 90, 2, 'defDown', 40), S('Gökyüzü Hükümdarı', 110, 85, 3)]],
  ['arachne', 'Arachne', 'bocek', 'Örümcek', '🕷️', [56, 16, 11, 16], [
    S('Ağ Atışı', 40, 100, 0), S('Zehirli Diş', 60, 95, 1, 'poison', 35), S('İpek Tuzak', 70, 90, 3, 'stun', 25), S('Dokumacı Laneti', 105, 90, 3, 'atkDown', 40)]],
  ['myrmidon', 'Myrmidon', 'bocek', 'Karınca asker', '🐜', [66, 16, 16, 9], [
    S('Mandibula Kıskacı', 40, 100, 0), S('Kalkan Duvarı', 60, 95, 1, 'defUp'), S('Koloni Hücumu', 80, 90, 2, 'atkUp'), S('Mirmidon Lejyonu', 110, 85, 3)]],
  ['khepri', 'Khepri', 'bocek', 'Şahin kanatlı bok böceği', '🐞', [62, 15, 14, 13], [
    S('Gübre Topu', 40, 100, 0), S('Şahin Kanadı', 65, 95, 1, 'crit', 20), S('Güneş Diski', 75, 90, 2, 'burn', 30), S('Yeniden Doğuş', 95, 95, 3, 'heal', 20)]],
  ['tengron', 'Tengron', 'elektrik', 'Elektrikli asa tanrısı', '🌩️', [58, 18, 11, 14], [
    S('Asa Kıvılcımı', 40, 100, 0), S('Şimşek Asası', 65, 95, 1, 'stun', 15), S('Tengri Işığı', 80, 90, 2, 'crit', 25), S('Gök Tanrının Hükmü', 110, 85, 3)]],
  ['perun', 'Perun', 'elektrik', 'Boynuzlarından elektrik saçan keçi', '🐐', [62, 17, 13, 12], [
    S('Boynuz Akımı', 40, 100, 0), S('Keçi Toslaması', 65, 95, 1, 'defDown', 30), S('Yıldırım Boynuzları', 80, 90, 3, 'stun', 20), S('Perun\'un Fırtınası', 110, 85, 3)]],
  ['mjolneer', 'Mjölneer', 'elektrik', 'Canlı şimşek çekici', '🔨', [60, 20, 12, 10], [
    S('Çekiç Darbesi', 40, 100, 0), S('Gök Gürültüsü', 65, 95, 1, 'atkDown', 30), S('Şimşek Fırlatışı', 85, 90, 2, 'crit', 20), S('Tanrıların Çekici', 120, 80, 3, 'recoil', 10)]],
  ['aura', 'Aura', 'ruh', 'Süzülen rüzgâr ruhu', '🌬️', [56, 15, 12, 16], [
    S('Ruh Esintisi', 40, 100, 0), S('Fısıldayan Rüzgâr', 55, 95, 1, 'atkDown', 40), S('Hayalet Kasırga', 75, 95, 2, 'drain', 30), S('Ebedi Esinti', 100, 90, 3, 'heal', 15)]],
  ['banshee', 'Banshee', 'ruh', 'Yırtık, eskimiş siyah elbiseli ruh', '👻', [58, 18, 10, 15], [
    S('Hıçkırık', 40, 100, 0), S('Yas Çığlığı', 60, 95, 1, 'defDown', 40), S('Lanetli Ağıt', 75, 90, 3, 'stun', 20), S('Ölüm Feryadı', 110, 85, 3)]],
  ['anubisi', 'Anubisi', 'ruh', 'Kaslı siyah çakal', '🐺', [66, 17, 14, 10], [
    S('Çakal Pençesi', 40, 100, 0), S('Ölüler Terazisi', 65, 95, 1, 'drain', 30), S('Gölge Sıçrayışı', 80, 90, 2, 'crit', 25), S('Duat\'ın Hükmü', 110, 85, 3)]],
  ['golem', 'Golem', 'tas', 'Taş golem', '🗿', [74, 14, 18, 6], [
    S('Taş Yumruk', 40, 100, 0), S('Kaya Zırhı', 55, 95, 1, 'defUp'), S('Çığ Gövdesi', 75, 90, 3, 'stun', 20), S('Sarsılmaz Dev', 105, 85, 3, 'defUp')]],
  ['enkidu', 'Enkidu', 'tas', 'Yabanıl taş insan', '🦍', [68, 17, 15, 8], [
    S('Yaban Darbesi', 40, 100, 0), S('Kaya Fırlatma', 65, 95, 1, 'crit', 20), S('Bozkır Öfkesi', 80, 90, 2, 'atkUp'), S('Sedir Ormanı Bekçisi', 105, 90, 3, 'drain', 25)]],
  ['gilgamash', 'Gilgamash', 'tas', 'Taştan yapılmış kral', '👑', [70, 16, 16, 9], [
    S('Kral Kılıcı', 40, 100, 0), S('Uruk Surları', 60, 95, 1, 'defUp'), S('Ölümsüzlük Arayışı', 75, 90, 2, 'heal', 15), S('Taş Kralın Destanı', 115, 85, 3)]],
];

EVO.EVOLETS = RAW.map(([id, name, type, desc, sym, b, skills]) => ({
  id, name, type, desc,
  symbols: Array.isArray(sym) ? sym : [sym, sym, sym],
  base: { hp: b[0], atk: b[1], def: b[2], spd: b[3] },
  skills,
}));
EVO.BY_ID = Object.fromEntries(EVO.EVOLETS.map((e) => [e.id, e]));
// 30 Evoletin 3 evresinin ve Yelbegen'in görselleri hazır (kullanıcının çizimleri, 2026-09-26)
EVO.ART_READY = EVO.EVOLETS.flatMap((e) => [1, 2, 3].map((s) => `${e.id}-${s}`)).concat(['yelbegen']);
EVO.stageName = (id, level) => EVO.STAGES[EVO.stageOf(level)].prefix + EVO.BY_ID[id].name;
EVO.skillsFor = (id, level) => EVO.BY_ID[id].skills.slice(0, EVO.STAGES[EVO.stageOf(level)].skills);

/* ------------------------------------------------------------------ */
/* 3. EKONOMİ: EP DAVRANIŞLARI, LEVEL MALİYETİ, İKSİR, ÖDÜLLER          */
/* ------------------------------------------------------------------ */
EVO.BEHAVIORS = {
  plus: [
    { k: 'dogru',  label: 'Soruya doğru cevap',       ep: 5,  icon: '✅' },
    { k: 'gorev',  label: 'Bireysel görevi başardı',  ep: 10, icon: '🎯' },
    { k: 'katilim', label: 'Derse etkin katılım',     ep: 3,  icon: '🙋' },
  ],
  minus: [
    { k: 'odevyok',   label: 'Ödev yapmadı',              ep: -5, icon: '📕' },
    { k: 'duzen',     label: 'Sınıf düzenini bozdu',      ep: -5, icon: '🚫' },
    { k: 'materyal',  label: 'Ders materyali getirmedi',  ep: -3, icon: '🎒' },
    { k: 'dinlemedi', label: 'Dersi dinlemedi',           ep: -3, icon: '🙉' },
    { k: 'sozsuz',    label: 'Söz almadan konuştu',       ep: -2, icon: '🗣️' },
    { k: 'gec',       label: 'Derse geç geldi',           ep: -2, icon: '⏰' },
  ],
  classPlus: [
    { k: 'c_duzen',  label: 'Ders düzenine uydu',            ep: 20, icon: '📐' },
    { k: 'c_temiz',  label: 'Sınıf düzenli ve temiz',        ep: 20, icon: '🧹' },
    { k: 'c_birlik', label: 'Birlik ve beraberlik sağlandı', ep: 20, icon: '🤝' },
    { k: 'c_gorev',  label: 'Verilen görev yapıldı',         ep: 30, icon: '🏅' },
  ],
  classMinus: [
    { k: 'c_duzenbozdu', label: 'Ders düzeni bozuldu',          ep: -20, icon: '📢' },
    { k: 'c_kirli',      label: 'Sınıf düzensiz ve kirli',      ep: -20, icon: '🗑️' },
    { k: 'c_birlikbozdu', label: 'Birlik ve beraberlik bozuldu', ep: -20, icon: '💢' },
    { k: 'c_gorevyok',   label: 'Verilen görev yapılmadı',      ep: -30, icon: '❌' },
  ],
};
EVO.HOMEWORK_EP = 10;         // ödev yapan öğrenci: +10 EP + 1 Evolet
EVO.HOMEWORK_MISS_EP = -5;    // ödev yapmayan
EVO.ALL_OWNED_BONUS_EP = 15;  // tüm Evoletlere sahipse drop yerine bonus EP
EVO.CLASS_GOAL = 1000;        // sınıf ortak sayacı hedefi
EVO.RUH_STREAK = 5;           // 5 ardışık ödevde Ruh türü

// Level L → L+1 maliyeti (EP). Evrim geçişleri (3→4, 6→7) bilerek pahalıdır.
EVO.LEVEL_COST = [0, 20, 30, 60, 45, 55, 100, 75, 85];
EVO.levelCost = (L) => (L < EVO.LEVEL_COST.length ? EVO.LEVEL_COST[L] : 85 + 12 * (L - 8));
EVO.costToReach = (L) => { let s = 0; for (let i = 1; i < L; i++) s += EVO.levelCost(i); return s; };

// Dinlenme ve iksirler
EVO.REST_MS = 18 * 3600 * 1000;
EVO.POTIONS = {
  kucuk: { label: 'Küçük İksir', cost: 12, cutMs: 8 * 3600 * 1000, icon: '🧪' },
  buyuk: { label: 'Büyük İksir', cost: 30, cutMs: Infinity,        icon: '⚗️' },
};

// Savaş ayarları
EVO.TURN_MS = 20000;          // hamle süresi
EVO.TURN_GRACE_MS = 1500;     // süre dolduktan sonra oto-hamle için tolerans (ağ gecikmesi)
EVO.PVP_POINTS = { win: 3, loss: 1 };
EVO.RAID_SIZE = 6;
EVO.PLATINUM_TOP = 3;         // haftayı ilk 3'te bitirenlere platin çerçeve (1 hafta)
EVO.DRAGON_DAYS = 14;         // Yelbegen'i yenenlere ejderha sembolü + alev efekti (2 hafta)

/* ------------------------------------------------------------------ */
/* 4. STATLAR                                                          */
/* ------------------------------------------------------------------ */
// Evre içinde her level +%10 (mpg'de +%8); evrim anında büyük sıçrama:
// L3 ×1,20 → L4 ×1,45 (+%21)   ·   L6 ×1,74 → L7 ×2,40 (+%38)
EVO.statMult = function (L) {
  if (L <= 3) return 1 + 0.10 * (L - 1);
  if (L <= 6) return 1.45 * (1 + 0.10 * (L - 4));
  return 2.40 * (1 + 0.08 * (L - 7));
};
EVO.stats = function (id, L) {
  const b = EVO.BY_ID[id].base, m = EVO.statMult(L);
  return { hp: Math.round(b.hp * m), atk: Math.round(b.atk * m), def: Math.round(b.def * m), spd: Math.round(b.spd * m) };
};
EVO.power = (id, L) => { const s = EVO.stats(id, L); return Math.round(s.hp / 4 + s.atk + s.def + s.spd); };

/* ------------------------------------------------------------------ */
/* 5. HASAR HESABI                                                     */
/* ------------------------------------------------------------------ */
EVO.DMG_DIV = 16; // savaş uzunluğu ayarı (büyüdükçe savaşlar uzar)
const stageMul = (st) => 1 + 0.25 * Math.max(-2, Math.min(2, st || 0)); // −2..+2 kademe → ×0,5..×1,5

/**
 * calculateDamage — tür matrisine göre hasar
 * @param {object} o { level, atk, def, power, typeMult, extra, crit, roll }
 *   level: saldıranın leveli · atk/def: kademeler uygulanmış statlar · power: yetenek gücü
 *   typeMult: tür çarpanı (0,5 / 1 / 2) · extra: ek çarpan (ör. Gökyüzü→Yelbegen 1,5)
 *   crit: kritik mi (×1,5) · roll: 0,90–1,00 arası rastgelelik
 */
EVO.calculateDamage = function (o) {
  const base = ((2 * o.level / 5 + 2) * o.power * (o.atk / Math.max(1, o.def))) / EVO.DMG_DIV + 2;
  const mult = (o.typeMult == null ? 1 : o.typeMult) * (o.extra || 1) * (o.crit ? 1.5 : 1) * (o.roll == null ? 1 : o.roll);
  return Math.max(1, Math.floor(base * mult));
};

// Kartta gösterilen "ortalama hasar": aynı leveldeki ortalama savunmaya, nötr (1x) türe
EVO.AVG_DEF_BASE = 13.6;
EVO.estimateDamage = function (id, L, skill, typeMult) {
  const s = EVO.stats(id, L);
  return EVO.calculateDamage({ level: L, atk: s.atk, def: EVO.AVG_DEF_BASE * EVO.statMult(L), power: skill.p, typeMult: typeMult == null ? 1 : typeMult, roll: 0.95 });
};

/* ------------------------------------------------------------------ */
/* 6. RASTGELELİK                                                      */
/* ------------------------------------------------------------------ */
EVO.rng = Math.random;
EVO.seeded = function (seed) { // mulberry32 — testler için tekrarlanabilir rastgelelik
  let a = seed >>> 0;
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};
const pick = (arr, rng) => arr[Math.floor((rng || EVO.rng)() * arr.length)];

/* ------------------------------------------------------------------ */
/* 7. DROP ORANI + 5 ARDIŞIK ÖDEV (RUH) + YOKLAMA DONDURMA             */
/* ------------------------------------------------------------------ */
EVO.DROP_TIERS = [
  { key: 'yuksek', label: 'Yüksek', rate: 40, types: ['alev', 'bocek', 'doga'] },
  { key: 'orta',   label: 'Orta',   rate: 33, types: ['su', 'zehir', 'toprak', 'tas'] },
  { key: 'dusuk',  label: 'Düşük',  rate: 27, types: ['elektrik', 'gok'] },
];
const RUH_IDS = () => EVO.EVOLETS.filter((e) => e.type === 'ruh').map((e) => e.id);

/**
 * Normal drop: önce kademe (%40/%33/%27), sonra o kademedeki sahip olunmayan Evoletlerden biri.
 * Sahip olunan Evolet tekrar düşmez; bir kademede hiç kalmadıysa oranlar kalan kademelere dağıtılır.
 * Ruh türü bu havuzda asla yoktur. Hiç Evolet kalmadıysa null döner.
 */
EVO.rollDrop = function (owned, rng) {
  rng = rng || EVO.rng;
  const has = owned instanceof Set ? owned : new Set(owned || []);
  const tiers = EVO.DROP_TIERS.map((t) => ({ ...t, pool: EVO.EVOLETS.filter((e) => t.types.includes(e.type) && !has.has(e.id)) }))
    .filter((t) => t.pool.length);
  if (!tiers.length) return null;
  const total = tiers.reduce((s, t) => s + t.rate, 0);
  let r = rng() * total;
  const tier = tiers.find((t) => (r -= t.rate) < 0) || tiers[tiers.length - 1];
  return pick(tier.pool, rng).id;
};
EVO.rollRuh = function (owned, rng) {
  const has = owned instanceof Set ? owned : new Set(owned || []);
  const pool = RUH_IDS().filter((id) => !has.has(id));
  return pool.length ? pick(pool, rng) : null;
};

/**
 * Ödev kontrolü — tek öğrenci için sonuç
 * @param {object} st { streak, owned:[ids] }
 * @param {'done'|'missed'|'absent'} mark  absent = devamsız/izinli/raporlu → seri DONDURULUR
 * @returns {object} { ep, streak, drop, reason }  reason: 'ruh' | 'normal' | 'bonus' | 'frozen' | 'missed'
 */
EVO.processHomework = function (st, mark, rng) {
  const streak = st.streak || 0;
  if (mark === 'absent') return { ep: 0, streak, drop: null, reason: 'frozen' };
  if (mark === 'missed') return { ep: EVO.HOMEWORK_MISS_EP, streak: 0, drop: null, reason: 'missed' };
  const next = streak + 1;
  let drop = null, reason = 'normal';
  if (next % EVO.RUH_STREAK === 0) { drop = EVO.rollRuh(st.owned, rng); if (drop) reason = 'ruh'; }
  if (!drop) drop = EVO.rollDrop(st.owned, rng);
  if (!drop) return { ep: EVO.HOMEWORK_EP + EVO.ALL_OWNED_BONUS_EP, streak: next, drop: null, reason: 'bonus' };
  return { ep: EVO.HOMEWORK_EP, streak: next, drop, reason };
};

// Sınıf 1000 EP ödülü: her öğrenciye sahip olmadığı rastgele 1 Evolet (Ruh hariç, drop oranlarıyla)
EVO.rollClassReward = (owned, rng) => EVO.rollDrop(owned, rng);

/* ------------------------------------------------------------------ */
/* 8. DİNLENME (18 SAAT) VE EP İKSİRİ                                  */
/* ------------------------------------------------------------------ */
EVO.restLeft = (entry, now) => Math.max(0, ((entry && entry.rest) || 0) - now);
EVO.isResting = (entry, now) => EVO.restLeft(entry, now) > 0;
EVO.applyKO = (entry, now) => { entry.rest = now + EVO.REST_MS; return entry; };
/**
 * İksir kullan: { ok, rest, ep, cost, msg } döner (girdileri değiştirmez)
 */
EVO.usePotion = function (entry, kind, ep, now) {
  const p = EVO.POTIONS[kind];
  if (!p) return { ok: false, msg: 'Geçersiz iksir.' };
  const left = EVO.restLeft(entry, now);
  if (!left) return { ok: false, msg: 'Bu Evolet zaten dinlenmiş, iksire gerek yok.' };
  if (ep < p.cost) return { ok: false, msg: `Yeterli EP yok (${p.cost} EP gerekli).` };
  const rest = p.cutMs === Infinity || left <= p.cutMs ? 0 : entry.rest - p.cutMs;
  return { ok: true, rest, ep: ep - p.cost, cost: p.cost, msg: rest ? `${p.label}: dinlenme ${EVO.fmtDur(rest - now)} kaldı.` : `${p.label}: Evolet savaşa hazır!` };
};
EVO.fmtDur = function (ms) {
  const m = Math.ceil(ms / 60000), h = Math.floor(m / 60);
  return h ? `${h} sa ${m % 60} dk` : `${m} dk`;
};

/* ------------------------------------------------------------------ */
/* 9. SAVAŞ MOTORU (PvP ve Yelbegen ortak)                              */
/* ------------------------------------------------------------------ */
// Savaşçı: veritabanına yazılabilir düz nesne (null yok — RTDB null alanları siler)
EVO.fighter = function (who, id, L) {
  const s = EVO.stats(id, L);
  return {
    sid: who.sid, uid: who.uid || '', name: who.name || '', eid: id, lvl: L, type: EVO.BY_ID[id].type,
    title: EVO.stageName(id, L), max: s.hp, hp: s.hp, atk: s.atk, def: s.def, spd: s.spd,
    sa: 0, sd: 0, cd: [0, 0, 0, 0], dot: 0, dotK: '', stun: 0, imm: 0,
  };
};
const logPush = (state, msg) => { state.log = (state.log || []).concat([msg]).slice(-10); };

// Tek yetenek kullanımı; att/dfn nesnelerini değiştirir, metin döner
function useSkill(att, dfn, si, rng, opt) {
  opt = opt || {};
  const sk = EVO.BY_ID[att.eid].skills[si];
  const cd = att.cd || [0, 0, 0, 0];
  for (let k = 0; k < cd.length; k++) cd[k] = Math.max(0, (cd[k] || 0) - 1);
  cd[si] = sk.cd;
  att.cd = cd;
  const who = att.title + (att.name ? ` (${att.name})` : '');
  if (rng() * 100 >= sk.a) return { dmg: 0, text: `${who} → ${sk.n}: ıskaladı!` };
  const tm = opt.typeMult != null ? opt.typeMult : EVO.typeMult(att.type, dfn.type);
  const crit = rng() * 100 < 6 + (sk.fx === 'crit' ? sk.v : 0);
  const dmg = EVO.calculateDamage({ level: att.lvl, atk: att.atk * stageMul(att.sa), def: dfn.def * stageMul(dfn.sd), power: sk.p, typeMult: tm, extra: opt.extra, crit, roll: 0.9 + 0.1 * rng() });
  dfn.hp = Math.max(0, dfn.hp - dmg);
  const notes = [];
  if (crit) notes.push('KRİTİK');
  if (tm >= 2) notes.push('çok etkili');
  else if (tm <= 0.5) notes.push('pek etkili değil');
  const chance = () => rng() * 100 < sk.v;
  switch (sk.fx) {
    case 'heal': { const h = Math.round(att.max * sk.v / 100); att.hp = Math.min(att.max, att.hp + h); notes.push(`+${h} can`); break; }
    case 'drain': { const h = Math.round(dmg * sk.v / 100); att.hp = Math.min(att.max, att.hp + h); notes.push(`+${h} can emdi`); break; }
    case 'recoil': { const r = Math.round(dmg * sk.v / 100); att.hp = Math.max(1, att.hp - r); notes.push(`geri tepme −${r}`); break; }
    case 'atkUp': att.sa = Math.min(2, (att.sa || 0) + 1); notes.push('ATK ↑'); break;
    case 'defUp': att.sd = Math.min(2, (att.sd || 0) + 1); notes.push('DEF ↑'); break;
    case 'atkDown': if (dfn.hp > 0 && chance()) { dfn.sa = Math.max(-2, (dfn.sa || 0) - 1); notes.push('rakip ATK ↓'); } break;
    case 'defDown': if (dfn.hp > 0 && chance()) { dfn.sd = Math.max(-2, (dfn.sd || 0) - 1); notes.push('rakip DEF ↓'); } break;
    case 'burn': case 'poison':
      if (dfn.hp > 0 && !opt.noDot && chance()) { dfn.dot = sk.fx === 'burn' ? 2 : 3; dfn.dotK = sk.fx; notes.push(sk.fx === 'burn' ? 'yanık' : 'zehir'); }
      break;
    case 'stun': if (dfn.hp > 0 && !dfn.imm && !opt.noStun && chance()) { dfn.stun = 1; notes.push('sersemletti'); } break;
  }
  return { dmg, text: `${who} → ${sk.n}: ${dmg} hasar${notes.length ? ' (' + notes.join(', ') + ')' : ''}` };
}
// Tur sonu yanık/zehir etkisi
function tickDot(f) {
  if (!f.dot || f.hp <= 0) return '';
  const burn = f.dotK === 'burn';
  const d = Math.max(1, Math.round(f.max * (burn ? 6 : 8) / 100));
  f.hp = Math.max(0, f.hp - d);
  f.dot -= 1;
  if (!f.dot) f.dotK = '';
  return `${f.title} ${burn ? 'yanıyor' : 'zehirleniyor'}: −${d}`;
}
// Seçilen yetenek kullanılamıyorsa (kilitli ya da beklemede) temel saldırıya düşülür
EVO.validSkill = function (f, si) {
  const n = EVO.STAGES[EVO.stageOf(f.lvl)].skills;
  return Number.isInteger(si) && si >= 0 && si < n && !((f.cd || [])[si] > 0) ? si : 0;
};

/* ---------- 9a. MythBattle Arena (1v1) ---------- */
EVO.pvpCreate = function (A, B, now, rng) {
  rng = rng || EVO.rng;
  const fa = EVO.fighter(A, A.eid, A.level), fb = EVO.fighter(B, B.eid, B.level);
  const first = fa.spd === fb.spd ? (rng() < 0.5 ? 'A' : 'B') : fa.spd > fb.spd ? 'A' : 'B';
  return { kind: 'pvp', status: 'active', created: now, A: fa, B: fb, turn: first, turnNo: 1, deadline: now + EVO.TURN_MS, winner: '', log: [`Savaş başladı! İlk hamle: ${(first === 'A' ? fa : fb).title}`] };
};
/**
 * Hamle uygula. auto=true ise süre dolmuş, sistem temel saldırıyı yapar.
 * Aynı durumu değiştirir ve döner; hamle geçersizse null döner.
 */
EVO.pvpMove = function (state, side, si, now, rng, auto) {
  rng = rng || EVO.rng;
  if (!state || state.status !== 'active' || state.turn !== side) return null;
  const me = state[side], foe = state[side === 'A' ? 'B' : 'A'];
  const idx = auto ? 0 : EVO.validSkill(me, si);
  const r = useSkill(me, foe, idx, rng);
  logPush(state, (auto ? '⏱ Süre doldu — ' : '') + r.text);
  const dt = tickDot(me); if (dt) logPush(state, dt);
  if (foe.hp <= 0 || me.hp <= 0) return EVO.pvpFinish(state, foe.hp <= 0 ? side : (side === 'A' ? 'B' : 'A'), now);
  // Sıra rakibe geçer; rakip sersemlediyse tur kaybeder ve bir tur bağışık olur
  let next = side === 'A' ? 'B' : 'A';
  if (state[next].stun) {
    state[next].stun = 0; state[next].imm = 1;
    logPush(state, `${state[next].title} sersemledi, sırasını kaybetti!`);
    next = side;
  } else state[next].imm = 0;
  state.turn = next; state.turnNo += 1; state.deadline = now + EVO.TURN_MS;
  return state;
};
EVO.pvpFinish = function (state, winner, now) {
  state.status = 'done'; state.winner = winner; state.ended = now; state.turn = '';
  logPush(state, `🏆 ${state[winner].title} (${state[winner].name}) kazandı!`);
  return state;
};

/* ---------- 9b. 20 SANİYE HAMLE SAATİ / AFK ÖNLEME ---------- */
// Kalan süre (ms) ve oto-hamle gerekip gerekmediği. Savaştaki HERHANGİ bir istemci
// süre + tolerans dolunca oto-hamleyi işlem (transaction) içinde yapar → savaş kilitlenmez.
EVO.turnLeft = (state, now) => Math.max(0, (state.deadline || 0) - now);
EVO.shouldAutoMove = (state, now) => !!state && state.status === 'active' && now > (state.deadline || 0) + EVO.TURN_GRACE_MS;
/**
 * createTurnWatcher: her saniye sayaç çizer; süre dolunca onAuto() çağırır.
 * @param {function} getState  güncel savaş durumu
 * @param {function} onTick    (kalanSaniye, state) → arayüz güncellemesi
 * @param {function} onAuto    (state) → oto-hamleyi veritabanına işleyen işlev
 * @param {function} now       sunucuyla eşitlenmiş saat
 */
EVO.createTurnWatcher = function ({ getState, onTick, onAuto, now }) {
  let busy = false;
  const timer = setInterval(async () => {
    const st = getState();
    if (!st || st.status !== 'active') { onTick && onTick(0, st); return; }
    const t = now();
    onTick && onTick(Math.ceil(EVO.turnLeft(st, t) / 1000), st);
    if (!busy && EVO.shouldAutoMove(st, t)) {
      busy = true;
      try { await onAuto(st); } catch (e) { console.warn('Oto-hamle', e); }
      busy = false;
    }
  }, 500);
  return () => clearInterval(timer);
};

/* ---------- 9c. YELBEGEN vs ALPLER (6 kişilik boss) ---------- */
EVO.BOSS = {
  name: 'Yelbegen', title: 'Üç Başlı Zırhlı Ejderha', level: 12,
  hpRef: 9,              // HP en az 6 adet Level 9 mpg Evoletin toplam HP'si
  atk: 80, def: 50, spd: 10, // simülasyonla ayarlandı: 6×L9 ≈ %79 zafer, ~8 tur, ~3 Evolet düşer
  skills: [
    { n: 'Ejder Pençesi',          p: 70, a: 95, target: 'one' },
    { n: 'Zırhlı Kuyruk Savuruşu', p: 60, a: 95, target: 'one', fx: 'defDown' },
    { n: 'Üç Baş Alev Nefesi',     p: 40, a: 90, target: 'all' },
  ],
};
// En yüksek taban HP'li 6 Evoletin Level 9 toplamı (hangi takım gelirse gelsin "en az" koşulu sağlanır)
EVO.bossMinHP = function () {
  const hps = EVO.EVOLETS.map((e) => EVO.stats(e.id, EVO.BOSS.hpRef).hp).sort((a, b) => b - a);
  return hps.slice(0, EVO.RAID_SIZE).reduce((s, x) => s + x, 0);
};
// Takım bu referanstan güçlüyse boss da takımın toplam canına ölçeklenir
EVO.bossHP = (team) => Math.max(EVO.bossMinHP(), team.reduce((s, f) => s + f.max, 0));
EVO.bossVsMult = (type) => (type === 'ruh' ? 1 : 2);    // Pasif 1: Ruh hariç herkese 2x
EVO.vsBossMult = (type) => (type === 'gok' ? 1.5 : 1);  // Pasif 2: Gökyüzü → Yelbegen 1,5x

EVO.raidCreate = (host, now) => ({ kind: 'raid', status: 'lobby', created: now, host: host.sid, slots: {}, log: [] });
EVO.raidStart = function (state, now, rng) {
  rng = rng || EVO.rng;
  const team = Object.values(state.slots || {});
  const hp = EVO.bossHP(team);
  state.boss = { title: EVO.BOSS.name, name: '', eid: '', type: 'ejderha', lvl: EVO.BOSS.level, max: hp, hp, atk: EVO.BOSS.atk, def: EVO.BOSS.def, spd: EVO.BOSS.spd, sa: 0, sd: 0, dot: 0, dotK: '', stun: 0, imm: 0 };
  state.order = team.slice().sort((a, b) => b.spd - a.spd || (rng() < 0.5 ? -1 : 1)).map((f) => f.sid);
  state.idx = 0; state.round = 1; state.status = 'active'; state.started = now;
  state.deadline = now + EVO.TURN_MS;
  state.log = [`⚔ Yelbegen uyandı! Canı: ${hp}. Sıra: ${state.order.map((s) => state.slots[s].name).join(' → ')}`];
  return state;
};
EVO.raidActor = (state) => (state && state.order ? state.order[state.idx] : null);
function raidAlive(state) { return (state.order || []).filter((s) => state.slots[s].hp > 0); }
function bossAct(state, rng) {
  const b = state.boss;
  if (b.stun) { b.stun = 0; b.imm = 1; logPush(state, '🐉 Yelbegen sersemledi, bu tur saldıramadı!'); return; }
  b.imm = 0;
  const alive = raidAlive(state);
  if (!alive.length) return;
  const sk = state.round % 3 === 0 ? EVO.BOSS.skills[2] : EVO.BOSS.skills[(state.round + 1) % 2];
  const targets = sk.target === 'all' ? alive : [pick(alive, rng)];
  const parts = [];
  targets.forEach((sid) => {
    const f = state.slots[sid];
    if (rng() * 100 >= sk.a) { parts.push(`${f.name}: ıskaladı`); return; }
    const dmg = EVO.calculateDamage({ level: b.lvl, atk: b.atk * stageMul(b.sa), def: f.def * stageMul(f.sd), power: sk.p, typeMult: EVO.bossVsMult(f.type), roll: 0.9 + 0.1 * rng() });
    f.hp = Math.max(0, f.hp - dmg);
    if (sk.fx === 'defDown') f.sd = Math.max(-2, (f.sd || 0) - 1);
    parts.push(`${f.name} −${dmg}${f.hp <= 0 ? ' 💀' : ''}`);
  });
  logPush(state, `🐉 Yelbegen → ${sk.n}: ${parts.join(', ')}`);
  const dt = tickDot(b); if (dt) logPush(state, dt);
}
/**
 * Yelbegen savaşında bir hamle. Sıra order[idx]'teki öğrencidedir; tüm canlılar oynayınca boss saldırır.
 */
EVO.raidMove = function (state, sid, si, now, rng, auto) {
  rng = rng || EVO.rng;
  if (!state || state.status !== 'active' || EVO.raidActor(state) !== sid) return null;
  const me = state.slots[sid], b = state.boss;
  if (me.stun) { me.stun = 0; logPush(state, `${me.name} sersemlediği için bekledi.`); }
  else {
    const idx = auto ? 0 : EVO.validSkill(me, si);
    const r = useSkill(me, b, idx, rng, { typeMult: 1, extra: EVO.vsBossMult(me.type), noStun: !!b.imm });
    logPush(state, (auto ? '⏱ Süre doldu — ' : '') + r.text);
    const dt = tickDot(me); if (dt) logPush(state, dt);
  }
  if (b.hp <= 0) return EVO.raidEnd(state, 'won', now);
  // Sıradaki canlı oyuncu; tur bittiyse Yelbegen saldırır
  let i = state.idx + 1;
  while (i < state.order.length && state.slots[state.order[i]].hp <= 0) i++;
  if (i >= state.order.length) {
    bossAct(state, rng);
    if (b.hp <= 0) return EVO.raidEnd(state, 'won', now);
    if (!raidAlive(state).length) return EVO.raidEnd(state, 'lost', now);
    state.round += 1;
    i = 0;
    while (state.slots[state.order[i]].hp <= 0) i++;
  }
  state.idx = i; state.deadline = now + EVO.TURN_MS;
  return state;
};
EVO.raidEnd = function (state, result, now) {
  state.status = result; state.ended = now;
  logPush(state, result === 'won' ? '🏆 Yelbegen yenildi! Semruk kurtarıldı!' : '💀 Alpler yenildi… Yelbegen kazandı.');
  return state;
};

/* ------------------------------------------------------------------ */
/* 10. TARİH / HAFTA                                                   */
/* ------------------------------------------------------------------ */
EVO.dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// ISO hafta (Pazartesi başlar): "2026-W39" — liderlik tablosu her Pazartesi 00:00'da sıfırlanır
EVO.weekKey = function (t) {
  const d = new Date(t); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  const wk = 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`;
};
EVO.prevWeekKey = (t) => EVO.weekKey(t - 7 * 86400000);
// Öğretmenin açtığı saat aralığı kontrolü: { mode: 'always'|'off'|'window', from:'HH:MM', to:'HH:MM' }
EVO.isOpen = function (cfg, t) {
  if (!cfg || cfg.mode === 'always') return true;
  if (cfg.mode === 'off') return false;
  const d = new Date(t), m = d.getHours() * 60 + d.getMinutes();
  const toMin = (s) => { const [h, mm] = String(s || '0:0').split(':').map(Number); return h * 60 + (mm || 0); };
  const a = toMin(cfg.from), b = toMin(cfg.to);
  return a <= b ? m >= a && m < b : m >= a || m < b;
};
EVO.scheduleText = (cfg) => (!cfg || cfg.mode === 'always' ? 'Sürekli açık' : cfg.mode === 'off' ? 'Kapalı' : `${cfg.from}–${cfg.to} arası açık`);

/* ------------------------------------------------------------------ */
/* 11. KULLANICI ADI / ŞİFRE                                           */
/* ------------------------------------------------------------------ */
EVO.slug = (s) => String(s || '').toLocaleLowerCase('tr')
  .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 20);
EVO.validUsername = (u) => /^[a-z0-9][a-z0-9._]{2,23}$/.test(u);
EVO.studentEmail = (u) => `${u}@${EVO.STUDENT_DOMAIN}`;
EVO.genPassword = function (rng) {
  const cs = 'abcdefghkmnprstuvyz23456789';
  let p = ''; for (let i = 0; i < 6; i++) p += cs[Math.floor((rng || EVO.rng)() * cs.length)];
  return p;
};

/* ------------------------------------------------------------------ */
/* 12. KART ÇİZİMİ (HTML)                                              */
/* ------------------------------------------------------------------ */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
EVO.esc = esc;
EVO.typeChip = (t, small) => `<span class="evo-chip${small ? ' sm' : ''}" style="--tc:${EVO.TYPE_INFO[t].color}">${EVO.TYPE_INFO[t].icon} ${EVO.TYPE_INFO[t].name}</span>`;
EVO.artHTML = function (id, level, cls) {
  const st = EVO.stageOf(level) + 1, key = `${id}-${st}`;
  const ev = EVO.BY_ID[id];
  if (EVO.ART_READY.includes(key)) return `<img class="${cls || 'evo-art'}" src="${EVO.ART_BASE}${key}.webp" alt="${esc(EVO.stageName(id, level))}" loading="lazy">`;
  return `<div class="${cls || 'evo-art'} evo-sym s${st}"><span>${ev.symbols[st - 1]}</span></div>`;
};
// Küçük görsel (ödül listeleri, arena listesi): görsel varsa resim, yoksa sembol
EVO.thumbHTML = (id, level, cls) => {
  const st = EVO.stageOf(level || 1) + 1, key = `${id}-${st}`;
  return EVO.ART_READY.includes(key) ? `<img class="${cls || 'sym'}" src="${EVO.ART_BASE}${key}.webp" alt="">` : `<span class="${cls || 'sym'}">${EVO.BY_ID[id].symbols[st - 1]}</span>`;
};
/**
 * Evolet kartı
 * @param {object} entry { eid, level, rest }
 * @param {object} o { now, compact, frame:'platinum', dragon, owner, actions (HTML) }
 */
EVO.cardHTML = function (entry, o) {
  o = o || {};
  const ev = EVO.BY_ID[entry.eid];
  if (!ev) return '';
  const L = entry.level || 1, st = EVO.stageOf(L), ti = EVO.TYPE_INFO[ev.type];
  const s = EVO.stats(ev.id, L);
  const rest = o.now != null ? EVO.restLeft(entry, o.now) : 0;
  const rel = EVO.typeRelations(ev.type);
  const chips = (arr) => (arr.length ? arr.map((t) => EVO.typeChip(t, true)).join('') : '<span class="evo-none">—</span>');
  const skills = EVO.skillsFor(ev.id, L).map((sk, i) => `<li><b>${esc(sk.n)}</b><span>Güç ${sk.p} · ~${EVO.estimateDamage(ev.id, L, sk)} hasar${sk.cd ? ` · ${sk.cd} tur bekler` : ''}${sk.a < 100 ? ` · %${sk.a}` : ''}</span></li>`).join('');
  const locked = ev.skills.map((sk, i) => (i < EVO.STAGES[st].skills ? '' : `<li class="locked"><b>🔒 ${esc(sk.n)}</b><span>${i === 2 ? 'Level 4 (mid)' : 'Level 7 (mpg)'} ile açılır</span></li>`)).join('');
  return `<div class="evo-card st${st + 1}${o.frame ? ' fr-' + o.frame : ''}${o.dragon ? ' dragon' : ''}${rest ? ' resting' : ''}${o.compact ? ' compact' : ''}" style="--tc:${ti.color}" data-eid="${ev.id}">
    ${o.dragon ? '<div class="evo-dragon" title="Yelbegen\'i yendi!">🐉</div>' : ''}
    <div class="evo-top"><span class="evo-stage">${EVO.STAGES[st].title}</span><span class="evo-lvl">Lv ${L}</span></div>
    ${EVO.artHTML(ev.id, L)}
    <div class="evo-name">${esc(EVO.stageName(ev.id, L))}</div>
    <div class="evo-sub">${EVO.typeChip(ev.type)}${o.owner ? `<span class="evo-owner">${esc(o.owner)}</span>` : ''}</div>
    ${o.compact ? '' : `
    <div class="evo-desc">${esc(ev.desc)}</div>
    <div class="evo-stats"><div><i>HP</i><b>${s.hp}</b></div><div><i>ATK</i><b>${s.atk}</b></div><div><i>DEF</i><b>${s.def}</b></div><div><i>SPD</i><b>${s.spd}</b></div></div>
    <ul class="evo-skills">${skills}${locked}</ul>
    <div class="evo-rel">
      <div><span>⚔️ Güçlü (2x vurur)</span>${chips(rel.strong)}</div>
      <div><span>🛡️ Zayıf (2x yer)</span>${chips(rel.weakDef)}</div>
      <div><span>✋ Dirençli (½ yer)</span>${chips(rel.resist)}</div>
      <div><span>🔻 Az etkili (½ vurur)</span>${chips(rel.weakAtk)}</div>
    </div>`}
    ${rest ? `<div class="evo-rest">😴 Son savaşta gücünü kaybetti, dinleniyor<br><b>${EVO.fmtDur(rest)}</b></div>` : ''}
    ${o.actions || ''}
  </div>`;
};
// Tür tablosu (10x10 renkli matris)
EVO.matrixHTML = function () {
  const head = EVO.TYPES.map((t) => `<th title="${EVO.TYPE_INFO[t].name}" style="--tc:${EVO.TYPE_INFO[t].color}">${EVO.TYPE_INFO[t].icon}<small>${EVO.TYPE_INFO[t].name}</small></th>`).join('');
  const rows = EVO.TYPES.map((a) => `<tr><th style="--tc:${EVO.TYPE_INFO[a].color}">${EVO.TYPE_INFO[a].icon} ${EVO.TYPE_INFO[a].name}</th>${EVO.MATRIX[a].map((v) => `<td class="m${String(v).replace('.', '')}">${v === 0.5 ? '½' : v}x</td>`).join('')}</tr>`).join('');
  return `<div class="evo-matrix-wrap"><table class="evo-matrix"><thead><tr><th>Saldıran ↓ / Savunan →</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
};

/* ------------------------------------------------------------------ */
/* 13. EXCEL (.xlsx) — okuma (öğrenci listesi) ve yazma (şablon/liste)  */
/* ------------------------------------------------------------------ */
EVO.Xlsx = {
  crcT: null,
  crc32(b) {
    if (!this.crcT) { this.crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; this.crcT[n] = c >>> 0; } }
    let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = this.crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  },
  zipBytes(files) {
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.text), crc = this.crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true); cd.setUint16(28, name.length, true); cd.setUint32(42, off, true);
      central.push(new Uint8Array(cd.buffer), name);
      off += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((n, p) => n + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0)); let o = 0;
    all.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
  },
  x: (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''),
  col(i) { let s = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; },
  // sheets: [{ name, rows, widths }] · hücre: string | number | { v, s } (s: 1 başlık, 2 yeşil, 3 kırmızı, 4 büyük başlık, 5 gri not)
  build(sheets) {
    const x = this.x;
    const sheetXml = (sh) => {
      const rows = sh.rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => {
        if (cell === null || cell === undefined || cell === '') return '';
        const v = typeof cell === 'object' ? cell.v : cell, s = typeof cell === 'object' && cell.s ? ` s="${cell.s}"` : '', ref = `${this.col(c)}${r + 1}`;
        return typeof v === 'number' ? `<c r="${ref}"${s}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
      }).join('')}</row>`).join('');
      const cols = (sh.widths || []).length ? `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`;
    };
    const safe = (n, i) => x(String(n || `Sayfa${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    return this.zipBytes([
      { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
      { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${safe(sh.name, i)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF666666"/><name val="Calibri"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC6EFCE"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0E6B45"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
      ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(sh) })),
    ]);
  },
  download(bytes, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  },

  /** .xlsx okur → ilk sayfanın satırları (string dizileri). Sıkıştırılmış (deflate) dosyaları da açar. */
  async read(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Bu dosya bir Excel (.xlsx) dosyası değil.');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const entries = {};
    const dec = new TextDecoder();
    for (let k = 0; k < n; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      entries[name] = { method, csize, lo };
      p += 46 + nl + el + cl;
    }
    const get = async (name) => {
      const e = entries[name]; if (!e) return null;
      const start = e.lo + 30 + dv.getUint16(e.lo + 26, true) + dv.getUint16(e.lo + 28, true);
      const raw = u8.subarray(start, start + e.csize);
      if (e.method === 0) return dec.decode(raw);
      if (typeof DecompressionStream === 'undefined') throw new Error('Tarayıcı sıkıştırılmış Excel dosyasını açamıyor.');
      const ds = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(ds).text();
    };
    const unx = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
    const texts = (xml) => [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => unx(m[1])).join('');
    const ssx = await get('xl/sharedStrings.xml');
    const ss = ssx ? [...ssx.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => texts(m[1])) : [];
    // İlk sayfa: workbook.xml'deki ilk sheet → rels hedefi
    let sheetPath = 'xl/worksheets/sheet1.xml';
    const wb = await get('xl/workbook.xml'), rels = await get('xl/_rels/workbook.xml.rels');
    if (wb && rels) {
      const rid = (wb.match(/<(?:\w+:)?sheet\b[^>]*\br:id="([^"]+)"/) || [])[1];
      const rel = rid && [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${rid}"`));
      const tgt = rel && (rel.match(/Target="([^"]+)"/) || [])[1];
      if (tgt) sheetPath = tgt.startsWith('/') ? tgt.slice(1) : 'xl/' + tgt.replace(/^\.\//, '');
    }
    const sx = await get(sheetPath) || await get(Object.keys(entries).find((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)));
    if (!sx) throw new Error('Excel dosyasında sayfa bulunamadı.');
    const rows = [];
    for (const rm of sx.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
      const row = [];
      for (const cm of rm[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
        const attrs = cm[1], body = cm[2] || '';
        const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1];
        const t = (attrs.match(/\bt="(\w+)"/) || [])[1];
        const v = (body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/) || [])[1];
        let val = '';
        if (t === 's') val = ss[+v] || '';
        else if (t === 'inlineStr') val = texts(body);
        else if (v != null) val = unx(v);
        let ci = row.length;
        if (ref) { ci = 0; for (const ch of ref) ci = ci * 26 + (ch.charCodeAt(0) - 64); ci -= 1; }
        row[ci] = String(val).trim();
      }
      rows.push(Array.from(row, (x) => x || ''));
    }
    return rows;
  },
};

/**
 * Excel satırlarından öğrenci listesi: başlık satırını ("Ad Soyad", "Kullanıcı Adı", "Şifre") bulur.
 * Başlık yoksa A=Ad Soyad, B=Kullanıcı adı, C=Şifre kabul edilir. Boş kullanıcı adı/şifre otomatik üretilir.
 */
EVO.parseStudentRows = function (rows) {
  const norm = (s) => EVO.slug(s).replace(/\./g, '');
  let hi = rows.findIndex((r) => r.some((c) => /^(adsoyad|ad|ogrenci|ogrenciadi|isim|adisoyadi)$/.test(norm(c))));
  let ci = { name: 0, user: 1, pass: 2 };
  if (hi >= 0) {
    const h = rows[hi].map(norm);
    const f = (re) => h.findIndex((c) => re.test(c));
    ci = { name: f(/^(adsoyad|ad|ogrenci|ogrenciadi|isim|adisoyadi)$/), user: f(/kullanici|username|kadi/), pass: f(/sifre|parola|password/) };
  }
  const out = [];
  rows.slice(hi + 1).forEach((r) => {
    const name = String(r[ci.name] || '').trim();
    if (!name || /^örnek|^ornek/i.test(name)) return;
    out.push({ name, username: ci.user >= 0 ? EVO.slug(r[ci.user] || '').replace(/[^a-z0-9._]/g, '') : '', password: ci.pass >= 0 ? String(r[ci.pass] || '').trim() : '' });
  });
  return out;
};
// Öğretmenlere verilen örnek şablon
EVO.templateXlsx = function () {
  return EVO.Xlsx.build([
    { name: 'Öğrenciler', widths: [28, 22, 14], rows: [
      [{ v: 'Ad Soyad', s: 1 }, { v: 'Kullanıcı Adı', s: 1 }, { v: 'Şifre', s: 1 }],
      ['Ayşe Yılmaz', 'ayse.yilmaz', 'ay4567'],
      ['Mehmet Kaya', 'mehmet.kaya', 'mk2025'],
      ['Zeynep Demir', '', ''],
      ['Ali Can Öztürk', 'alican.7b', ''],
    ] },
    { name: 'Nasıl Doldurulur', widths: [100], rows: [
      [{ v: 'Evomyth — Öğrenci Listesi Şablonu', s: 4 }],
      ['1) "Öğrenciler" sayfasında her satıra bir öğrenci yazın. Başlık satırını silmeyin.'],
      ['2) Ad Soyad zorunludur.'],
      ['3) Kullanıcı Adı boş bırakılırsa addan otomatik üretilir (ör. zeynep.demir). Türkçe harf ve boşluk kullanılmaz; yalnızca a-z, 0-9, nokta.'],
      ['4) Şifre boş bırakılırsa 6 karakterlik şifre otomatik üretilir. Elle yazılacaksa en az 6 karakter olmalıdır.'],
      ['5) Kullanıcı adları tüm sitede tektir. Aynı ad başka okulda da varsa sonuna sınıf/okul ekleyin (ör. ali.can.7b).'],
      ['6) Dosyayı kaydedip akıllı tahtada "Sınıf Ekle → Excel\'den Yükle" ile seçin. Oluşan kullanıcı adı ve şifre listesini oradan tekrar Excel olarak indirebilirsiniz.'],
      [{ v: 'Öğrenciler www.thegamifyclass.com/Evomyth.html adresinden bu kullanıcı adı ve şifreyle giriş yapar.', s: 5 }],
    ] },
  ]);
};

if (typeof module !== 'undefined' && module.exports) module.exports = EVO;
else root.EVO = EVO;
})(typeof window !== 'undefined' ? window : globalThis);
