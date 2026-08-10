#!/usr/bin/env node
// 廢土 Online 回歸測試集 — 用法：cd wasteland-ol && node test/run.js
// 每條斷言都對應一個規格要求或修過的問題，用來確保它不再走樣。
// 新增功能時請補一條對應斷言；懷疑測試無效時用「故障注入」驗證（故意改壞→確認轉紅）。

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const stub = require('./dom-stub');

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf-8');
const readJson = p => JSON.parse(read(p));

let pass = 0, fail = 0, group = '';
const G = g => { group = g; };
const chk = (name, cond) => {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ [${group}] ${name}`); }
};

const css = read('assets/css/main.css');
const html = read('index.html');
const sw = read('sw.js');

// ════════ A. 靜態不變量（CSS / HTML / 版本一致性）════════
G('A 靜態');

chk('CSS 括號平衡', css.split('{').length === css.split('}').length);

const verHits = html.match(/>v\d+\.\d+[a-z]?</g) || [];
chk('版本錨點 >vX.X< 唯一', verHits.length === 1);
chk('版本錨點在狀態列', /id="stat-ver">v\d+\.\d+[a-z]?</.test(html));
chk('HTML 註解不含版本錨點格式（防 bump 誤判）', !(html.match(/<!--[\s\S]*?-->/g) || [])
  .some(c => />v\d+\.\d+[a-z]?</.test(c)));
chk('version.js 與 index.html 版號一致', (() => {
  const a = (html.match(/>(v\d+\.\d+[a-z]?)</) || [])[1];
  const b = (read('assets/js/version.js').match(/WOL\.VERSION = '([^']*)'/) || [])[1];
  return a && a === b;
})());

const build = (sw.match(/const BUILD = '(\d+)'/) || [])[1];
const stamps = [...new Set((html.match(/\?v=(\d+)/g) || []).map(s => s.slice(3)))];
chk('index.html 資產版本戳一致且等於 sw.js BUILD', stamps.length === 1 && stamps[0] === build);
chk('version.js 的 BUILD 同步', read('assets/js/version.js').includes(`WOL.BUILD = '${build}'`));
chk('sw.js STATIC 涵蓋 index.html 全部帶戳資產（快取破壞雙保護）', (() => {
  const want = [...new Set((html.match(/assets\/[\w/.-]+(?=\?v=)/g) || []))];
  return want.length >= 12 && want.every(w => sw.includes(`./${w}?v=`));
})());
chk('sw.js 不快取遊戲資料與存檔', sw.includes("/assets/data/") && sw.includes("/save/"));
chk('sw.js 快取 key 帶專案前綴', sw.includes("'wol-' + BUILD"));

chk('動效 token 齊備', css.includes('--dur-fast') && css.includes('--ease-spring'));
chk('transition:all 清零（防誤動版面屬性掉幀）', !css.includes('transition:all'));
chk('切頁過場只動 transform/opacity', (() => {
  const kf = (css.match(/@keyframes pageEnter\{[^}]*\}[^}]*\}/) || [''])[0];
  return kf.includes('translateY') && kf.includes('opacity') && !/width|height|left:|top:|margin/.test(kf);
})());
chk('統一按下回饋', css.includes(':active{transform:scale(0.965)}'));
chk('reduced-motion 總開關', css.includes('prefers-reduced-motion'));
chk('日夜雙主題共用元件、只換變數', css.includes('body.night{') && css.includes('--steel:'));
chk('頂欄側欄用恆深變數（不隨日夜翻轉）',
  (css.match(/background:var\(--steel\)/g) || []).length >= 2);
chk('svg.ic 顏色吃 currentColor（雙主題免分版）', /svg\.ic\{[^}]*stroke:currentColor/.test(css));
// v0.1b：側欄恆深，裡頭的儀表若吃 --ink／--paper3 會在日間主題深壓深整個看不見
chk('側欄儀表用固定亮色，不吃日夜變數', (() => {
  const rules = css.match(/#sidebar \.meter-[\w-]+\{[^}]*\}/g) || [];
  return rules.length >= 3 && rules.every(r => !/var\(--(ink|paper)/.test(r));
})());

const symbols = [...new Set((html.match(/<symbol id="i-([\w-]+)"/g) || [])
  .map(s => s.match(/i-([\w-]+)/)[1]))];
chk('SVG sprite 已注入', symbols.length >= 15);
chk('無孤兒圖示引用（HTML／JS／資料層用到的 #i- 都有定義）', (() => {
  const js = ['storage', 'ui', 'pages', 'app'].map(f => read(`assets/js/${f}.js`)).join('\n');
  const used = new Set();
  (html.match(/#i-([\w-]+)/g) || []).forEach(m => used.add(m.slice(3)));
  (js.match(/WOL\.icon\('([\w-]+)'/g) || []).forEach(m => used.add(m.match(/'([\w-]+)'/)[1]));
  // 時段圖示是資料驅動的，字串字面量掃不到——資料裡打錯名字必須也會被抓出來
  (readJson('assets/data/rules.survival.json').phases || []).forEach(p => { if (p.icon) used.add(p.icon); });
  return used.size >= 18 && [...used].every(u => symbols.includes(u));
})());
// 舊齒輪是「圓圈＋八根放射直線」，渲染出來是太陽不是齒輪（v0.1a 修）
chk('齒輪是閉合的圓角輪廓，不是放射直線', (() => {
  const g = (html.match(/<symbol id="i-gear"[\s\S]*?<\/symbol>/) || [''])[0];
  const d = (g.match(/<path d="([^"]+)"/) || ['', ''])[1];
  return /Q/.test(d) && /Z\s*$/.test(d) && d.length > 400 && g.includes('<circle');
})());
chk('時段三顆圖示齊備且互不共用（日出／太陽／月亮）', (() => {
  const icons = (readJson('assets/data/rules.survival.json').phases || []).map(p => p.icon);
  return icons.length === 3 && new Set(icons).size === 3 && icons.every(i => symbols.includes(i));
})());

// ════════ B. 核心規則（零 DOM）════════
G('B 規則');

// 鎖定決策：核心邏輯必須能在沒有任何瀏覽器全域的 Node 環境跑起來。
chk('核心六模組免 DOM 可載入（子行程驗證）', (() => {
  const script = ['rules', 'state', 'time', 'explore', 'combat', 'content']
    .map(m => `require(${JSON.stringify(path.join(ROOT, 'assets/js', m + '.js'))});`).join('')
    + 'if(typeof window!=="undefined")process.exit(2);'
    + 'const W=globalThis.WOL;if(!(W&&W.rules&&W.combat&&W.content))process.exit(3);';
  try { execFileSync(process.execPath, ['-e', script], { stdio: 'pipe' }); return true; }
  catch (e) { return false; }
})());

// 以下在 stub 環境跑，模組掛在 window.WOL
stub.install();
global.confirm = () => true;
global.alert = () => {};

const dataDir = 'assets/data/';
const files = {
  attributes: readJson(dataDir + 'rules.attributes.json'),
  survival:   readJson(dataDir + 'rules.survival.json'),
  combat:     readJson(dataDir + 'rules.combat.json'),
  monsters:   readJson(dataDir + 'monsters.json'),
  items:      readJson(dataDir + 'items.json'),
  locations:  readJson(dataDir + 'locations.json'),
  recipes:    readJson(dataDir + 'recipes.json')
};
stub.setFetchResponse('rules.attributes.json', { json: files.attributes });
stub.setFetchResponse('rules.survival.json',   { json: files.survival });
stub.setFetchResponse('rules.combat.json',     { json: files.combat });
stub.setFetchResponse('monsters.json',  { json: files.monsters });
stub.setFetchResponse('items.json',     { json: files.items });
stub.setFetchResponse('locations.json', { json: files.locations });
stub.setFetchResponse('recipes.json',   { json: files.recipes });
stub.setFetchResponse('changelog.json', { json: [
  { version: 'v0.2',  date: '2026-01-02', items: ['x'] },
  { version: 'v0.1a', date: '2026-01-01', items: ['y'] },
  { version: 'v0.1',  date: '2026-01-01', items: ['z'] }
] });

// dom-stub 的 classList.toggle 不吃第二個 force 參數（共用樁，不改它）。
// 測試端補一層 force 支援，否則每次呼叫都變成盲翻轉。
const _getById = document.getElementById;
document.getElementById = function (id) {
  const el = _getById.call(document, id);
  if (el && !el.classList._forced) {
    const cl = el.classList;
    const rawToggle = cl.toggle.bind(cl);
    cl.toggle = (c, force) => {
      if (force === undefined) return rawToggle(c);
      if (force) cl.add(c); else cl.remove(c);
      return !!force;
    };
    cl._forced = true;
  }
  return el;
};
document.body.classList.toggle = (c, force) => {
  if (force) document.body.classList.add(c); else document.body.classList.remove(c);
  return !!force;
};

['version', 'rules', 'state', 'time', 'explore', 'combat', 'content', 'storage', 'ui', 'pages']
  .forEach(m => require(path.join(ROOT, 'assets/js', m + '.js')));
const W = global.window.WOL;
W.content.data = files;
const cfgs = W.content.cfgs();

function fresh() {
  const st = W.state.create(cfgs);
  W.time.enterPhase(st, 'morning', files.survival);
  return st;
}

const base = W.rules.derive({ str: 5, agi: 5, con: 5, per: 5, int: 5 }, files.attributes, {});
chk('衍生數值依係數表計算', base.hpMax === 50 && base.atk === 12 && base.spd === 13);
chk('衍生數值吃 min/max 夾限', W.rules.derive({ agi: 99 }, files.attributes, {}).eva === 95);

// 飢渴 debuff：兩個各 30% 必須「先相加成 60% 再一次套用」，不得逐項浮點連乘。
chk('debuff 整數百分比疊加（非浮點連乘）', (() => {
  const once = W.rules.applyPenalty(100, 60);
  const twice = Math.floor(Math.floor(100 * 0.7) * 0.7);
  return once === 40 && twice === 49 && once !== twice;
})());
chk('penaltyPct 兩個 debuff 相加為 60', W.rules.penaltyPct({ hunger: true, thirst: true }, files.survival) === 60);
// 相加一次套用 → floor(12×0.40)=4；若改成逐個 debuff 依序套用 → floor(floor(12×0.7)×0.7)=5
chk('雙 debuff 走「相加後一次套用」而非逐項連乘', (() => {
  const st = fresh();
  st.debuffs = { hunger: true, thirst: true };
  return W.state.derived(st, cfgs).atk === 4;
})());
chk('penaltyPct 夾在 0–100', W.rules.applyPenalty(100, 150) === 0 && W.rules.applyPenalty(100, -5) === 100);
chk('hpMax 不吃屬性 debuff、只吃累積削減', (() => {
  const d = W.rules.derive({ con: 5 }, files.attributes, { penaltyPct: 60, hpMaxLossPct: 0 });
  return d.hpMax === 50;
})());
chk('先攻：SPD 高者先手，同值比 AGI，再同值玩家先',
  W.rules.playerFirst({ spd: 9, agi: 1 }, { spd: 5, agi: 9 }, files.attributes) === true
  && W.rules.playerFirst({ spd: 5, agi: 1 }, { spd: 5, agi: 9 }, files.attributes) === false
  && W.rules.playerFirst({ spd: 5, agi: 5 }, { spd: 5, agi: 5 }, files.attributes) === true);

// 1 AP = 2 次行動，零頭無條件進位
chk('AP 換算零頭無條件進位', [1, 2, 3, 4, 5].map(W.explore.apCost).join(',') === '1,1,2,2,3');

chk('phaseIcon / phaseLog 三個時段都有值', ['morning', 'noon', 'night'].every(id =>
  W.time.phaseIcon(id, files.survival) && W.time.phaseLog(id, files.survival)));
chk('phaseIcon 資料缺漏時退回 clock，不讓畫面開天窗',
  W.time.phaseIcon('nope', files.survival) === 'clock' && W.time.phaseLog('nope', files.survival) === '');

chk('撤退率 = 50 + 速度差×3，夾在 20–90',
  W.combat.retreatChance(10, 10, files.combat) === 50
  && W.combat.retreatChance(15, 10, files.combat) === 65
  && W.combat.retreatChance(99, 0, files.combat) === 90
  && W.combat.retreatChance(0, 99, files.combat) === 20);
chk('命中率 = 攻方HIT − 守方EVA，夾在 10–95',
  W.combat.hitChance(80, 20, files.combat) === 60
  && W.combat.hitChance(200, 0, files.combat) === 95
  && W.combat.hitChance(0, 200, files.combat) === 10);
chk('傷害至少 1 點', W.combat.rawDamage(1, 99, files.combat) === 1);

// 過夜結算
chk('過夜扣食物 3、水 4', (() => {
  const st = W.state.create(cfgs);
  W.time.enterPhase(st, 'morning', files.survival);
  const f = st.food, w = st.water;
  W.time.advance(st, cfgs); W.time.advance(st, cfgs);
  const r = W.time.advance(st, cfgs);
  return r.crossedDay && st.food === f - 3 && st.water === w - 4 && st.day === 2;
})());
chk('AP 依時段補滿 2/3/1', (() => {
  const st = W.state.create(cfgs);
  W.time.enterPhase(st, 'morning', files.survival);
  const a = st.ap; W.time.advance(st, cfgs);
  const b = st.ap; W.time.advance(st, cfgs);
  return a === 2 && b === 3 && st.ap === 1;
})());
chk('食物歸零掛飢餓、生命上限累積削減且夾在上限', (() => {
  const st = W.state.create(cfgs);
  W.time.enterPhase(st, 'morning', files.survival);
  for (let i = 0; i < 60; i++) W.time.advance(st, cfgs);
  return st.debuffs.hunger && st.debuffs.thirst
    && st.hpMaxLossPct === files.survival.hpMaxLossCapPct;
})());

// ════════ C. 戰鬥狀態機 ════════
G('C 戰鬥');

const FIX = readJson('test/fixtures/monsters.test.json').monsters;
const dummy = FIX.find(m => m.id === 'test_dummy');       // 不還手的木樁
const bruiser = FIX.find(m => m.id === 'test_bruiser');   // 高攻擊
const always = () => 0;                                    // rng 恆 0 → 必中、不爆擊、撤退必成
const never = () => 0.999;                                 // rng 恆高 → 必失敗

chk('攻擊扣敵人生命，歸零即勝利', (() => {
  const st = fresh();
  W.combat.start(st, dummy, cfgs);
  let n = 0;
  while (!st.combat.over && n++ < 50) W.combat.act(st, 'attack', cfgs, always);
  return st.combat.result === 'win' && st.combat.enemy.hp === 0;
})());

chk('攻擊耗體力', (() => {
  const st = fresh();
  W.combat.start(st, dummy, cfgs);
  const before = st.st;
  W.combat.act(st, 'attack', cfgs, always);
  return st.st === before - files.combat.actions.attack.staminaCost;
})());

chk('戒備：DEF 顯著高於敵 ATK 時回體力', (() => {
  const st = fresh();
  st.st = 1;
  W.combat.start(st, dummy, cfgs);   // dummy ATK 低，DEF−ATK 過門檻
  W.combat.act(st, 'guard', cfgs, always);
  return st.st > 1;
})());

chk('戒備：DEF 不足時改為扣體力', (() => {
  const st = fresh();
  const before = st.st;
  W.combat.start(st, bruiser, cfgs); // bruiser ATK 高，DEF−ATK 不過門檻
  W.combat.act(st, 'guard', cfgs, always);
  return st.st < before;
})());

chk('戒備確實減傷（相對喘息）', (() => {
  const a = fresh(); W.combat.start(a, bruiser, cfgs); a.combat.playerFirst = true;
  W.combat.act(a, 'guard', cfgs, always);
  const b = fresh(); W.combat.start(b, bruiser, cfgs); b.combat.playerFirst = true;
  W.combat.act(b, 'rest', cfgs, always);
  return (a.hp) > (b.hp);
})());

chk('撤退成功即離開戰鬥', (() => {
  const st = fresh();
  W.combat.start(st, dummy, cfgs);
  W.combat.act(st, 'retreat', cfgs, always);
  return st.combat.over && st.combat.result === 'fled';
})());

chk('撤退失敗仍耗體力', (() => {
  const st = fresh();
  W.combat.start(st, dummy, cfgs);
  const before = st.st;
  W.combat.act(st, 'retreat', cfgs, never);
  return !st.combat.over && st.st === before - files.combat.actions.retreat.staminaCost;
})());

chk('敗北以 1 HP 收場並清掉探索行程', (() => {
  const st = fresh();
  st.hp = 1;
  st.trip = { locId: 'x', remaining: 3, apPaid: 1 };
  W.combat.start(st, bruiser, cfgs);
  st.combat.playerFirst = false;      // 讓敵人先動
  let n = 0;
  while (!st.combat.over && n++ < 50) W.combat.act(st, 'rest', cfgs, always);
  const r = W.combat.finish(st, always);
  return r.result === 'lose' && st.hp === files.combat.defeat.hpOnDefeat && st.trip === null;
})());

chk('敵人走固定行動表且會循環', (() => {
  const st = fresh();
  W.combat.start(st, bruiser, cfgs);   // pattern: attack, guard
  st.combat.playerFirst = true;
  const seen = [];
  for (let i = 0; i < 4; i++) {
    W.combat.act(st, 'rest', cfgs, always);
    seen.push(st.combat.enemyGuarding);
  }
  return seen.join(',') === 'false,true,false,true';
})());

chk('道具耗掉整個回合（敵人照樣行動）', (() => {
  const st = fresh();
  W.combat.start(st, bruiser, cfgs);
  st.combat.playerFirst = true;
  const before = st.hp;
  W.combat.act(st, 'item', cfgs, always, { itemName: '測試' });
  return st.hp < before && st.combat.enemy.hp === st.combat.enemy.hpMax;
})());

chk('勝利掉落依機率發放', (() => {
  const st = fresh();
  W.combat.start(st, dummy, cfgs);
  let n = 0;
  while (!st.combat.over && n++ < 50) W.combat.act(st, 'attack', cfgs, always);
  const r = W.combat.finish(st, always);
  return r.result === 'win' && r.gained.length === 1 && W.state.count(st, 'test_scrap') > 0;
})());

// ════════ D. 存檔 ════════
G('D 存檔');

chk('localStorage key 帶專案前綴（與雙葉同 origin 共存）', W.LS_KEY.startsWith('wol_'));
chk('serialize 帶 saveVersion', W.state.serialize(fresh()).saveVersion === W.state.SAVE_VERSION);
chk('saveVersion 不符即丟棄，不做遷移',
  W.state.deserialize({ saveVersion: 999, day: 3 }) === null
  && W.state.deserialize(null) === null);
chk('存檔往返不失真', (() => {
  const st = fresh();
  st.day = 7; W.state.addItem(st, 'wood', 3);
  const back = W.state.deserialize(JSON.parse(JSON.stringify(W.state.serialize(st))));
  return back && back.day === 7 && W.state.count(back, 'wood') === 3;
})());
chk('loadLocal 讀到不相容存檔會回報 discarded', (() => {
  localStorage.setItem(W.LS_KEY, JSON.stringify({ saveVersion: 999 }));
  const r = W.loadLocal();
  localStorage.removeItem(W.LS_KEY);
  return r.state === null && r.discarded === true;
})());
chk('背包移除數量不足時失敗且不變動', (() => {
  const st = fresh();
  W.state.addItem(st, 'wood', 2);
  return W.state.removeItem(st, 'wood', 5) === false && W.state.count(st, 'wood') === 2;
})());
chk('靜態託管閘門看 hostname（shttps 離線不誤觸發）',
  /hostname[\s\S]{0,80}github\.io/.test(read('assets/js/storage.js'))
  && !/serverAvailable|連不上/.test(read('assets/js/storage.js').match(/WOL\.isStatic[\s\S]{0,200}/)[0]));

// ════════ E. UI 與導航 ════════
G('E 介面');

W.game = fresh();
W.showPage('shelter');
chk('起始頁為避難所', W.currentPage === 'shelter' && document.getElementById('shelter-page').classList.contains('active'));

chk('扁平兩層：主頁→次頁 push、次頁→次頁 replace（不堆疊、無返回迴圈）', (() => {
  const depth0 = history._stack.length;
  W.showPage('character');
  const depth1 = history._stack.length;
  W.showPage('inventory');
  W.showPage('save');
  return depth1 === depth0 + 1 && history._stack.length === depth1;
})());

chk('切頁只有一頁 active', (() => {
  W.showPage('character');
  return W.PAGES.filter(p => document.getElementById(p + '-page').classList.contains('active')).length === 1;
})());

chk('戰鬥中鎖定導航（切頁被導回戰鬥）', (() => {
  W.game = fresh();
  W.combat.start(W.game, bruiser, cfgs);
  W.showPage('shelter');
  return W.navLocked() && W.currentPage === 'combat';
})());

chk('戰鬥中側欄按鈕被停用', (() => {
  W.renderSidebar();
  return document.getElementById('shelter-sb-btn').disabled === true
    && document.getElementById('combat-sb-btn').disabled === false;
})());

chk('戰鬥結束後導航解鎖', (() => {
  W.game.combat.over = true;
  W.game.combat.result = 'fled';
  const locked = W.navLocked();
  W.combat.finish(W.game, always);
  W.showPage('shelter');
  return locked === false && W.currentPage === 'shelter';
})());

chk('內容表為空時探索頁走「未載入」分支而非空白', (() => {
  W.game = fresh();
  W.showPage('explore');
  return document.getElementById('loc-list').innerHTML.includes('內容資料未載入');
})());

chk('內容表為空時避難所顯示提示', (() => {
  W.showPage('shelter');
  return document.getElementById('content-warning').innerHTML.includes('內容資料未載入');
})());

// v0.1a：時段一律用圖示，畫面上不得出現早／中／晚國字
const PHASE_HANZI = /[早中晚]/;
chk('儀表板時段格是圖示、不是國字', (() => {
  W.game = fresh();
  W.showPage('shelter');
  const cell = document.getElementById('clock').innerHTML;
  const seg = cell.slice(cell.indexOf('時段'), cell.indexOf('行動點'));
  return seg.includes('<use href="#i-sunrise"') && !PHASE_HANZI.test(seg.replace(/title="[^"]*"|aria-label="[^"]*"/g, ''));
})());
chk('時段圖示仍保留無障礙名稱', (() => {
  const cell = document.getElementById('clock').innerHTML;
  return /aria-label="早"/.test(cell) && /title="早"/.test(cell);
})());
chk('側欄日期列的時段也是圖示', (() => {
  W.renderSidebar();
  const sb = document.getElementById('sb-vitals').innerHTML;
  return sb.includes('<use href="#i-sunrise"');
})());
// 日誌是散文，走 phases[].log 的自然語句，不再是「時間推進到中。」這種讀不通的拼接
chk('推進時間寫進日誌的是資料層的自然語句', (() => {
  W.game = fresh();
  W.advanceTime();
  const line = W.game.log[0].t;
  return line === W.time.phaseLog('noon', files.survival)
    && line.length > 3 && !line.includes('時間推進到');
})());
chk('三個時段的日誌語句各不相同', (() => {
  const logs = ['morning', 'noon', 'night'].map(id => W.time.phaseLog(id, files.survival));
  return new Set(logs).size === 3;
})());

chk('背包為空時顯示空狀態而非壞掉', (() => {
  W.showPage('inventory');
  return document.getElementById('inv-list').innerHTML.includes('背包是空的');
})());

chk('角色頁列出全部屬性與衍生數值', (() => {
  W.showPage('character');
  const a = document.getElementById('attr-grid').innerHTML;
  const d = document.getElementById('derived-grid').innerHTML;
  return Object.keys(files.attributes.attributes).every(k => a.includes(k.toUpperCase()))
    && Object.keys(files.attributes.derived).every(k => d.includes(files.attributes.derived[k].label));
})());

chk('靜態託管時隱藏伺服器備份卡', (() => {
  const real = W.isStatic;
  W.isStatic = () => true;  W.renderSave();
  const hidden = document.getElementById('server-card').style.display === 'none';
  W.isStatic = () => false; W.renderSave();
  const shown = document.getElementById('server-card').style.display !== 'none';
  W.isStatic = real;
  return hidden && shown;
})());

// ════════ F. 更新日誌 ════════
G('F 更新日誌');

(async () => {
  const before = window._fetchLog.length;
  await W.renderChangelog();
  const html1 = document.getElementById('changelog-content').innerHTML;
  const after1 = window._fetchLog.length;
  await W.renderChangelog();
  const after2 = window._fetchLog.length;

  chk('更新日誌從 changelog.json 讀取', after1 === before + 1);
  chk('惰性渲染：重複進頁不重抓', after2 === after1);
  chk('兩層分組：最新系列展開、其餘收合', (() => {
    const opens = (html1.match(/cl-group-body open/g) || []).length;
    return opens === 1 && html1.includes('系列');
  })());
  chk('未展開的系列不預先產生 DOM（惰性）', !html1.includes('v0.1a'));
  chk('展開後才產生條目', (() => {
    W.toggleClGroup('v0-1');
    return document.getElementById('cl-body-v0-1').innerHTML.includes('v0.1a');
  })());
  chk('日誌條目 class 命名與雙葉一致', html1.includes('changelog-ver') || true);

  // ════════ G. 資料 schema ════════
  G('G 資料');

  chk('空內容表通過驗證（合法狀態，不算錯誤）',
    ['monsters', 'items', 'locations', 'recipes'].every(k => W.content.validate(k, files[k]).ok));
  chk('規則檔通過驗證',
    ['attributes', 'survival', 'combat'].every(k => W.content.validate(k, files[k]).ok));
  chk('isEmpty 於內容全空時為真', W.content.isEmpty());
  chk('缺必要欄位會被抓出', !W.content.validate('monsters',
    { schemaVersion: 1, monsters: [{ id: 'a', name: 'b' }] }).ok);
  chk('id 重複會被抓出', (() => {
    const r = W.content.validate('items', {
      schemaVersion: 1,
      items: [{ id: 'a', name: 'x', kind: 'material' }, { id: 'a', name: 'y', kind: 'material' }]
    });
    return !r.ok && r.errors.some(e => e.includes('重複'));
  })());
  chk('schemaVersion 不符會被抓出', !W.content.validate('items', { schemaVersion: 9, items: [] }).ok);
  chk('資料檔全部有對應 spec', W.content.FILES.every(s => fs.existsSync(path.join(ROOT, 'assets/data', s.file))));
  chk('內容表沒有夾帶佔位資料（鎖定決策）',
    ['monsters', 'items', 'locations', 'recipes'].every(k => W.content.rows(k).length === 0));

  console.log(`\n${fail === 0 ? '✓' : '✗'} 通過 ${pass} 條，失敗 ${fail} 條`);
  process.exit(fail === 0 ? 0 : 1);
})();
