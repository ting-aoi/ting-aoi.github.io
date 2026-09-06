#!/usr/bin/env node
// 雙葉書庫 回歸測試集 — 用法：cd booknotes-pwa && node test/run.js
// 每條斷言都對應一個歷史上真實修過的 bug，用來確保它不再復發。
// 新增修復時，請在對應區塊補一條斷言並註明版本。

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { makeEnv } = require('./dom-stub');

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf-8');
const css = read('assets/css/main.css');
const html = read('index.html');

let pass = 0, fail = 0, group = '';
const G = g => { group = g; };
const chk = (name, cond) => {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ [${group}] ${name}`); }
};

// ════════ A. 靜態不變量（CSS / HTML）════════
G('A 靜態');
chk('CSS 括號平衡', css.split('{').length === css.split('}').length);
chk('v2.9c 誤刪回歸：側欄完成度符號固定亮色', /\.badge-r\{color:#[0-9a-f]{6}\}/.test(css) && /\.badge-y\{color:#[0-9a-f]{6}\}/.test(css));
chk('v3.0a：stat-num 單一定義且為 Caveat', (css.match(/\.stat-num\{/g) || []).length === 1 && /\.stat-num\{font-family:'Caveat'/.test(css));
chk('v3.0a：隨筆數字微傾與夜間微光', /\.stat-num\{[^}]*rotate\(-2\.5deg\)[^}]*var\(--glow\)/.test(css));
chk('v3.0a：「書庫」不用斜體', css.includes('.logo span{font-weight:400') && !/\.logo span\{[^}]*italic/.test(css));
chk('v3.0：Playfair 全站退役', !css.includes('Playfair') && !html.includes('Playfair'));
// v3.8 起字體來源在 fonts.css（抽換層），main.css 只負責使用
chk('v3.0：手寫字體與 Caveat 已載入', (() => {
  const fonts = read('assets/css/fonts.css');
  return fonts.includes('LXGW+WenKai+TC') && fonts.includes('Caveat')
    && css.includes("'LXGW WenKai TC'") && css.includes("'Caveat'");
})());
chk('v3.0：頂欄側欄用皮革變數（日夜恆深）', css.includes('--leather') && (css.match(/background:var\(--leather\)/g) || []).length >= 2);
chk('v3.0：reduced-motion 總開關', css.includes('prefers-reduced-motion'));
chk('v3.5：動效 token 齊備', css.includes('--dur-fast') && css.includes('--ease-spring'));
chk('v3.5：transition:all 清零（防掉幀）', !css.includes('transition:all'));
chk('v3.5：切頁過場只動 transform/opacity', (() => {
  const kf = (css.match(/@keyframes pageEnter\{[^}]*\}[^}]*\}/) || [''])[0];
  return kf.includes('translateY') && kf.includes('opacity')
    && !/width|height|left:|top:|margin/.test(kf);
})());
chk('v3.5：統一按下回饋', css.includes(':active{transform:scale(0.965)}'));
chk('v3.5：排序模式按下不縮（拖曳引擎接管 transform）', css.includes('.apps-grid.sorting .app-tile:active{transform:none}'));
chk('v3.6：SVG sprite 已注入（35 顆）', (html.match(/<symbol id="i-/g) || []).length === 35);
chk('v3.6：.ic 基礎樣式（currentColor 雙主題）', /svg\.ic\{[^}]*stroke:currentColor/.test(css));
chk('v3.6：頂欄不再有 emoji 圖示', (() => {
  const header = html.slice(html.indexOf('id="header"'), html.indexOf('id="main"'));
  return !/[🏠🗑⚙⊞🔍☰]/u.test(header) && (header.match(/<use href="#i-/g) || []).length >= 6;
})());
chk('v3.6：FT.APPS 改用具名圖示', (() => {
  const p = read('assets/js/pages.js');
  return p.includes("icon:'home'") && p.includes("icon:'library'") && !/icon:'[^a-z]/.test(p);
})());
chk('v3.6：FT.icon 助手存在', read('assets/js/storage.js').includes('FT.icon'));
chk('v3.7a：五個 zip 入口全有 JSZip 防護', (() => {
  const s = read('assets/js/settings.js');
  return s.includes('function _zipReady()') && (s.match(/_zipReady\(\)/g) || []).length === 6;
})());
chk('v3.7a：單本寫入失敗會反映到 _lastWrite', (() => {
  const s = read('assets/js/storage.js');
  return s.includes('failed.push(b.id)') && s.includes('_serverAvailable = failed.length === 0');
})());
chk('v3.7a：閱讀視圖靠 body.read-mode（不做 DOM 手術）',
  read('assets/js/editor.js').includes("classList.toggle('read-mode', ro)")
  && css.includes('body.read-mode .field textarea'));
chk('v3.7a：切換閱讀模式後重算長文高度（否則字級變大會截斷）',
  read('assets/js/editor.js').includes('FT.resizeLongFields();'));
// ── APK 相容層（v3.8）：這四條護住「網頁與 APK 共用同一份原始碼」 ──
chk('v3.8：字體來源獨立成抽換層（APK 靠換掉這檔才有內建字體）', (() => {
  const f = read('assets/css/fonts.css');
  return /^@import url\('fonts\.css'\)/.test(css)          // main.css 只引用抽換層
    && f.includes('fonts.googleapis.com')                  // 網頁版仍走 CDN
    && !css.includes('fonts.googleapis.com');              // 不得搬回 main.css
})());
chk('v3.8：FT.saveBlob 是全站唯一存檔出口', (() => {
  const st = read('assets/js/storage.js'), se = read('assets/js/settings.js');
  return st.includes('FT.saveBlob = function') && st.includes('FutabaNative')
    && se.includes('function _download(blob, filename) { FT.saveBlob(blob, filename); }');
})());
chk('v3.8：除 saveBlob 外無人自組 <a download>', (() => {
  const src = ['storage','settings','ui','pages','editor','app','search']
    .map(m => read('assets/js/' + m + '.js')).join('\n');
  // a.download 只該出現在 saveBlob 的瀏覽器分支那一次
  return (src.match(/\.download\s*=/g) || []).length === 1;
})());
chk('v3.8：APK 環境跳過 Service Worker 註冊', (() => {
  const u = read('assets/js/ui.js');
  const i = u.indexOf('FT.initPWA');
  return u.slice(i, i + 260).includes('if (window.FutabaNative) return;');
})());
chk('v3.8：bump.py 網頁包排除 android 與 CI', (() => {
  const b = read('bump.py');
  return b.includes("'android'") && b.includes("'.github'");
})());
chk('v3.6b：磚牆按鈕 color 明確（不掉 UA 黑）', css.includes('.app-tile{color:var(--ink)}'));
chk('v3.6b：圖示金色點綴規則齊備', css.includes('.app-tile-icon,.sec-title .ic'));
chk('v3.6b：齒輪已圓角化（Q 貝茲曲線）', /id="i-gear"[^>]*><path d="M[\d. ]+Q/.test(html));
chk('v3.6d：頁標題靠左接圖示（SVG flex item 陷阱）',
  /\.page-title\{[^}]*justify-content:flex-start/.test(css) && css.includes('.page-title button{margin-left:auto}'));
chk('v3.6d：作者列直接顯示平均分（無「平均」前綴）', !read('assets/js/pages.js').includes('平均 ${r.avg'));
chk('v3.1：黏頂面板必須低於側欄', /\.settings-tabs\{[^}]*z-index:10/.test(css) && /\.lib-controls\{[^}]*z-index:10/.test(css) && /#sidebar\{[^}]*z-index:15/.test(css));
chk('v3.1c：黏頂面板有金框（不像破圖）', /\.settings-tabs\{[^}]*border:1px solid var\(--gold-dim\)/.test(css) && /\.lib-controls\{[^}]*border:1px solid var\(--gold-dim\)/.test(css));
chk('v3.1：功能標題底線在整列（不被排序鈕截斷）', /\.apps-title-row\{[^}]*border-bottom/.test(css) && css.includes('.apps-title-row .page-title{border-bottom:none'));
chk('v3.1：home-sec flex 且底線滿寬', /\.home-sec\{[^}]*display:flex/.test(css) && /\.home-sec\{[^}]*border-bottom/.test(css));
chk('v3.1：角色列基線對齊', /\.char-item\{[^}]*align-items:baseline/.test(css));
chk('v3.0c：磚牆副標單行省略（磚等大）', /\.app-tile-sub\{[^}]*text-overflow:ellipsis/.test(css));
chk('v3.0d：排序模式抑制選取與長按', /\.apps-grid\.sorting\{[^}]*user-select:none/.test(css) && css.includes('-webkit-touch-callout:none'));
chk('v3.1b：書庫篩選列 2 欄', /\.lib-controls\{display:grid;grid-template-columns:repeat\(2,1fr\)/.test(css));
chk('v3.7：第 5 個下拉獨佔末行滿寬', css.includes('.lib-controls .lib-select:nth-child(5){grid-column:span 2}'));
chk('v3.7：狀態排序死路徑零殘留', (() => {
  // 只看實際程式碼——註解裡記錄根因時會提到該鍵名，不算殘留
  const code = read('assets/js/ui.js').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  return !html.includes('value="status"') && !code.includes('statusOptions');
})());
chk('v3.1a：側欄無書名 A→Z 排序', !html.includes('title-asc') && !html.includes('title-desc'));
chk('v3.0b：字體 preconnect', html.includes('fonts.googleapis.com') && html.includes('crossorigin'));
chk('v3.0b：設定三分頁 11 區標記', (html.match(/data-tab="/g) || []).length === 11);
chk('v3.1：11 個頁面區塊齊備', ['home','note','apps','authors','backup','trash','settings','stats','changelog','tags','library']
  .every(p => html.includes(`id="${p}-page"`)));
chk('鐵律：書櫃功能零殘留', !html.includes('shelfDict') && !html.includes('book.shelves') && !/shelf/i.test(read('assets/js/pages.js')));

// ════════ B. 資產與版本一致性 ════════
G('B 版本');
const sw = read('sw.js');
const build = (sw.match(/BUILD\s*=\s*'(\d+)'/) || [])[1];
chk('sw.js 有 BUILD 戳', !!build);
chk('index.html 資產戳與 BUILD 一致', build && html.includes('?v=' + build));
chk('版本號格式可被 bump.py 偵測', /<span id="stat-ver">v\d+\.\d+[a-z]?<\/span>/.test(html) || />v\d+\.\d+[a-z]?</.test(html));
chk('SW 字型獨立快取且不被 activate 清除', sw.includes('futaba-fonts') && sw.includes("k!=='futaba-fonts'"));
chk('manifest 相對路徑與直式鎖定', (() => {
  const m = JSON.parse(read('manifest.json'));
  return m.start_url.startsWith('./') && m.scope === './' && m.orientation === 'portrait';
})());

// ════════ C. 執行期行為 ════════
G('C 執行期');
const env = makeEnv();
require(path.join(ROOT, 'assets/js/storage.js'));
require(path.join(ROOT, 'assets/js/search.js'));
require(path.join(ROOT, 'assets/js/ui.js'));
require(path.join(ROOT, 'assets/js/pages.js'));
const FT = global.FT;
const realRenderStatusFilter = FT.renderStatusFilter;   // 替身蓋掉前先留一份（C5b 要驗）

// 測試替身
['renderHome','renderTrash','renderSettings','renderStats','renderChangelog',
 'renderAuthors','renderStatusFilter','renderTagsRow','loadForm','applyReadMode',
 // 註：renderStatusFilter 被替身蓋掉，C5b 要驗它得用下方保留的 realRenderStatusFilter
 'renderCharacters','flushCharInputs','saveCurrentBook','renderSearchOverlay'].forEach(f => { FT[f] = () => {}; });
FT.debSave = () => {}; FT.saveAll = () => {};
FT.settings.myProgressOptions = ['書單','閱讀中','棄坑','閱讀完'];
FT.settings.tagDict = [{ id:'t1', label:'系統流', group:'' }];
const full = { author:'甲', myProgress:'閱讀完', textPlatform:'起點', audioPlatform:'無',
               characters:[{name:'角色'}], tags:['t1'], synopsis:'s', review:'r' };
FT.books = {
  b1: { id:'b1', title:'完整書', rating:5, created:3, ...full },
  b2: { id:'b2', title:'待補書', rating:3, created:2, ...full, synopsis:'', review:'', myProgress:'閱讀中' },
  b3: { id:'b3', title:'空殼書', author:'', rating:0, myProgress:'書單', tags:[], created:1 },
};
FT.trash = {};

// C1 完成度
chk('completionLevel 三態正確', FT.completionLevel(FT.books.b1)==='ok'
  && FT.completionLevel(FT.books.b2)==='yellow' && FT.completionLevel(FT.books.b3)==='red');

// C2 側欄清單與 badge
FT.renderList();
chk('側欄清單渲染 badge class', /badge-[ry]/.test(env.html('book-list')));
chk('側欄星等套金屬漸層', env.html('book-list').includes('gilt-star'));

// C3 搜尋與返回鍵（v2.9d/v2.9e）
env.el('search-clear').style.display = 'flex';
window._searchQ = '測試'; env.el('search').value = '測試';
FT.currentPage = 'home';
env.fireWin('popstate', { state:{ page:'home' } });
chk('v2.9d：返回鍵先退出搜尋', window._searchQ === '');
chk('v2.9d：退出搜尋後留在原頁', FT.currentPage === 'home');
chk('v2.9e：✕ 按鈕同步隱藏', env.el('search-clear').style.display === 'none');

// C4 導航層級（鐵律）
env.el('sidebar').classList.add('open'); env.el('overlay').classList.add('on');
FT.showPage('stats');
chk('切頁正常', FT.currentPage === 'stats');
chk('v3.6c：任何導航一律收起側欄（頂欄鍵曾漏收）',
  !env.el('sidebar').classList.contains('open') && !env.el('overlay').classList.contains('on'));
env.fireWin('popstate', { state:{ page:'home' } });
chk('扁平兩層：任何頁返回即回主頁', FT.currentPage === 'home');

// C5 書庫頁（v3.1/v3.1a/v3.1b）
const libHtml = () => env.html('library-content');
const card = t => libHtml().indexOf('>' + t + '</div>');
FT._lib = { prog:'', sort:'date-desc', rating:'', comp:'' };
FT.renderLibrary();
chk('書庫列出全部', libHtml().includes('3 本'));
chk('v3.7：書庫五顆下拉（＋作品狀態）', (libHtml().match(/class="lib-select"/g) || []).length === 5);
chk('最新優先', card('完整書') < card('空殼書'));
FT.libSet('sort','rating-asc');
chk('評分低→高', card('空殼書') < card('完整書'));
FT.libSet('sort','date-desc'); FT.libSet('rating','unrated');
chk('未評分篩選', libHtml().includes('1 本') && card('空殼書') >= 0);
FT.libSet('rating',''); FT.libSet('comp','yellow');
chk('待補狀態篩選', libHtml().includes('1 本') && card('待補書') >= 0);
FT.libSet('comp',''); FT.libSet('prog','閱讀中');
chk('進度篩選', libHtml().includes('1 本') && card('待補書') >= 0);
chk('下拉選中態保留', /value="閱讀中" selected/.test(libHtml()));
FT.libSet('prog','');

// C5b 作品狀態：書庫篩選＋側欄分組下拉（v3.7）
FT.settings.workStatusOptions = ['連載中','已完結','斷更'];
FT.books.b1.workStatus = '連載中';
FT.books.b2.workStatus = '已完結';
FT.libSet('work','連載中');
chk('v3.7：書庫作品狀態篩選', libHtml().includes('1 本') && card('完整書') >= 0);
FT.libSet('work','');
realRenderStatusFilter();
chk('v3.7：側欄下拉分兩組（我的進度／作品狀態）',
  (env.html('filter-status').match(/<optgroup/g) || []).length === 2
  && env.html('filter-status').includes('value="work:連載中"'));
window._filterStatus = 'work:已完結'; FT.renderList();
chk('v3.7：側欄依 work 前綴只篩作品狀態',
  env.html('book-list').includes('待補書') && !env.html('book-list').includes('完整書'));
window._filterStatus = '閱讀中'; FT.renderList();   // 無前綴舊值 → 當 prog
chk('v3.7：無前綴舊值仍當我的進度處理', env.html('book-list').includes('待補書'));
window._filterStatus = '';

// C5c 完成度單一事實來源（v3.7）：missingFields 與 completionLevel 不得分家
chk('v3.7：missingFields 與 completionLevel 同源', (() => {
  const lv = b => FT.completionLevel(b), mf = b => FT.missingFields(b);
  return mf(FT.books.b1).hard.length === 0 && mf(FT.books.b1).soft.length === 0 && lv(FT.books.b1) === 'ok'
      && mf(FT.books.b2).hard.length === 0 && mf(FT.books.b2).soft.length > 0  && lv(FT.books.b2) === 'yellow'
      && mf(FT.books.b3).hard.length > 0                                       && lv(FT.books.b3) === 'red';
})());
chk('v3.7：缺漏明細指得出實際欄位', (() => {
  const h = FT.missingFields(FT.books.b3).hard;
  return h.includes('作者') && h.includes('標籤') && h.includes('重要角色');
})());
chk('v3.7：明細標籤清單涵蓋所有可能缺項', (() => {
  const all = [...FT.missingFields(FT.books.b3).hard, ...FT.missingFields(FT.books.b3).soft];
  return all.every(f => FT.MISSING_LABELS.includes(f));
})());

// C6 功能磚與排序（v3.0c/v3.0d）
env.el('stat-ver').textContent = 'test';
FT.renderApps();
chk('磚牆九格', (env.html('apps-grid').match(/app-tile-icon/g) || []).length === 9);
chk('設定磚副標為當前模式', /日間模式|夜間模式/.test(env.html('apps-grid')));
FT.settings.appsOrder = ['stats','home'];
const ord = FT.orderedApps().map(a => a.id);
chk('自訂順序生效且未列磚附尾', ord[0]==='stats' && ord[1]==='home' && ord.length === FT.APPS.length);
FT.settings.appsOrder = null;
FT._appsSort = true;
FT.currentPage = 'apps';
FT.openApp('trash');
chk('v3.0c：排序模式中點磚不導航', FT.currentPage === 'apps');
FT._appsSort = false;

// C7 標籤頁與作者頁（v3.0b/v3.1）
FT.renderTagMergeSelects = FT.renderTagMergeSelects || (() => {});
FT.renderSettingsTagList = FT.renderSettingsTagList || (() => {});
FT._authorSel = null;
chk('標籤頁渲染函式存在', typeof FT.renderTagsPage === 'function');
chk('作者帶入新書函式存在', typeof FT.newBookForAuthor === 'function');

// C8 強制更新（v2.9h/v2.9i）
chk('forceUpdate 存在', typeof FT.forceUpdate === 'function');
chk('#update 開機偵測就位', read('assets/js/ui.js').includes("location.hash === '#update'"));

// C9 備份（v3.2 強化）
chk('備份日期用本地時區（非 UTC）', (() => {
  const d = new Date(2026, 0, 1, 0, 30);   // 本地 1/1 00:30；UTC 可能是前一天
  return FT.localDateStamp(d) === '2026-01-01';
})());
chk('備份保留份數可由設定調整', (() => {
  FT.applySettings({ backupKeep: 14 });
  return FT.settings.backupKeep === 14;
})());
chk('備份份數非法值不覆蓋', (() => {
  FT.applySettings({ backupKeep: 0 });
  return FT.settings.backupKeep === 14;
})());
FT.settings.backupKeep = 7;
chk('備份對外介面齊備', typeof FT.runBackupNow === 'function' && typeof FT.backupInfo === 'function');

// C10 設定頁預設開合（v3.0f）
chk('settingsSecOpen 出廠三區', JSON.stringify(FT.settings.settingsSecOpen) === JSON.stringify(['系統更新','外觀','新書預設值']));
chk('settingsSecOpen 非陣列不覆蓋', (() => {
  FT.applySettings({ settingsSecOpen: 'bad' });
  return Array.isArray(FT.settings.settingsSecOpen);
})());

// ════════ D. 原始碼衛生 ════════
G('D 衛生');
const jsFiles = fs.readdirSync(path.join(ROOT, 'assets/js')).filter(f => f.endsWith('.js'));
const allJs = jsFiles.map(f => read('assets/js/' + f)).join('\n');
chk('無 console.log 殘留', !/console\.log\(/.test(allJs));
chk('事件引用的 FT 函式皆有定義', (() => {
  const defined = new Set([...allJs.matchAll(/FT\.(\w+)\s*=/g)].map(m => m[1]));
  const called = new Set([...(allJs + html).matchAll(/on(?:click|change)=\\?"FT\.(\w+)\(/g)].map(m => m[1]));
  const missing = [...called].filter(c => !defined.has(c));
  if (missing.length) console.log('    缺失:', missing.join(', '));
  return missing.length === 0;
})());
chk('拖曳引擎：拖曳期間不得重建 DOM', (() => {
  const pages = read('assets/js/pages.js');
  // touchmove 處理中不得出現 renderApps()（v3.0c 事故根因）
  const mv = pages.slice(pages.indexOf("addEventListener('touchmove'"), pages.indexOf("addEventListener('touchend'"));
  return !mv.includes('FT.renderApps()');
})());
chk('拖曳讓位使用實測步距（v3.1）', read('assets/js/pages.js').includes('tiles[1].getBoundingClientRect().left'));
chk('拖曳中斷保險齊備', (() => {
  const p = read('assets/js/pages.js');
  return p.includes("addEventListener('touchcancel'") && p.includes("addEventListener('visibilitychange'");
})());

// ════════ E. 全文搜尋（v3.3）════════
// async：需先以真實 sc2tc.json 餵入 loadSc2tc；總結隨之移入此塊（D 區同步斷言已先跑完）
(async () => {
  G('E 全文搜尋');
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => JSON.parse(read('assets/sc2tc.json')) });
  await FT.loadSc2tc();
  global.fetch = realFetch;

  const bk = { title:'孤帆記', author:'乙', tags:['t1'],
               characters:[{ name:'葉修', desc:'沉默的舵手' }],
               synopsis:'一場橫渡的旅程', review:'結尾的燈塔太動人', notes:'第三章重讀' };
  const m = q => FT.bookMatchesSearch(bk, FT.parseSearch(q));

  chk('v3.3：~ 命中心得內文', m('~燈塔'));
  chk('v3.3：~ 命中備註與角色描述', m('~重讀') && m('~舵手'));
  chk('v3.3：~ 不搜書名（範圍正確）', !m('~孤帆'));
  chk('v3.3：無前綴文字仍只搜書名作者', m('孤帆') && !m('燈塔'));
  chk('v3.3：多個 ~ 詞為 AND', m('~燈塔 ~旅程') && !m('~燈塔 ~不存在'));
  chk('v3.3：#標籤 與 ~ 混用', m('#系統流 ~燈塔') && !m('#不存在 ~燈塔'));
  chk('v3.3：簡體 ~ 查詢命中繁體內文', m('~灯塔') && m('~动人'));
  chk('v3.3：@人名 簡繁正規化', m('@叶修'));
  // v3.7 :狀態 前綴
  const bs = { ...bk, workStatus:'連載中', audioStatus:'製作中', myProgress:'閱讀中' };
  const ms = q => FT.bookMatchesSearch(bs, FT.parseSearch(q));
  chk('v3.7：: 命中作品狀態與聽書狀態', ms(':連載中') && ms(':製作中'));
  chk('v3.7：: 也涵蓋我的進度', ms(':閱讀中'));
  chk('v3.7：: 不誤命中書名內文', !ms(':孤帆') && !ms(':燈塔'));
  chk('v3.7：多個 : 詞為 AND', ms(':連載中 :製作中') && !ms(':連載中 :已完結'));
  chk('v3.7：: 與其他前綴混用', ms('#系統流 :連載中 ~燈塔'));
  chk('v3.7：: 簡體查詢命中繁體狀態', ms(':连载中'));
  // v3.7a 前綴只在詞首生效
  const P = s => FT.parseSearch(s);
  chk('v3.7a：夾在字中間的符號不被當前綴', (() => {
    const a = P('abc:def'), b = P('a#b'), c = P('mail@x.com'), d = P('12:30 開始');
    return a.stats.length===0 && b.tags.length===0 && c.chars.length===0 && d.stats.length===0;
  })());
  chk('v3.7a：詞首前綴仍正常', (() => {
    const a = P('#系統流'), b = P(':連載中'), c = P('~內文'), d = P('@人名');
    return a.tags.length===1 && b.stats.length===1 && c.fulls.length===1 && d.chars.length===1;
  })());
  chk('v3.7a：連續兩個前綴不黏成一詞', P('#a #b').tags.length === 2);
  chk('v3.7a：夾中間的符號留在 rest 供書名比對', P('abc:def').rest.split('|')[0] === 'abc:def');
  chk('v3.3：長內文不被 64 變體上限截斷', (() => {
    // 故障注入等價驗證：needle 藏在超長 haystack 尾端——若 haystack 走了變體展開，
    // 64 上限會把它截成前綴，此斷言必失敗
    const long = { ...bk, review: '書'.repeat(300) + '深夜燈塔' };
    return FT.bookMatchesSearch(long, FT.parseSearch('~深夜燈塔'));
  })());

  // ════════ F. 展示模式（v3.4）════════
  G('F 展示模式');
  // 閘門：只認 hostname，shttps 離線絕不誤觸發
  location.hostname = 'localhost';
  chk('v3.4：localhost 不進展示模式', !FT.isDemo());
  location.hostname = 'ting-aoi.github.io';
  chk('v3.4：github.io 進展示模式', FT.isDemo());
  // 種子：只在 localStorage 為空時寫入
  localStorage.removeItem('futaba_v2');
  global.fetch = async () => ({ ok:true, json: async () => ({books:{d1:{id:'d1',title:'種子書'}},trash:{},settings:{}}) });
  await FT.initDemo();
  chk('v3.4：空 localStorage 時種入範例', (localStorage.getItem('futaba_v2')||'').includes('種子書'));
  global.fetch = async () => ({ ok:true, json: async () => ({books:{d2:{id:'d2',title:'覆蓋書'}},trash:{},settings:{}}) });
  await FT.initDemo();
  chk('v3.4：訪客已有資料不覆蓋', !(localStorage.getItem('futaba_v2')||'').includes('覆蓋書'));
  global.fetch = realFetch;
  // demo.json 靜態檢查
  chk('v3.4：demo.json 結構正確（無回收桶、無個人偏好鍵、標籤引用齊全）', (() => {
    const d = JSON.parse(read('assets/demo.json'));
    const banned = ['appsOrder','backupKeep','nightMode','settingsSecOpen',
                    'readModeDefault','trashAutoClean','trashRetentionDays','newBookDefaults'];
    return Object.keys(d.books).length > 0
      && Object.keys(d.trash).length === 0
      && banned.every(k => !(k in d.settings))
      && Array.isArray(d.settings.tagDict) && d.settings.tagDict.length > 0
      && Object.values(d.books).every(b => (b.tags||[]).every(t => d.settings.tagDict.some(td => td.id === t)));
  })());
  chk('v3.4：展示橫幅標記與雙主題樣式', html.includes('id="demo-banner"') && css.includes('body.demo #demo-banner'));
  // 存檔提示誠實化
  location.hostname = 'localhost';
  const sv = env.el('stat-save');
  FT._lastWrite = { ok:false, status:0 };
  FT.showSaved();
  chk('v3.4：存檔失敗顯示警示（不再假裝成功）', sv.textContent.includes('未寫入') && sv.classList.contains('warn'));
  FT._lastWrite = { ok:true, status:204 };
  FT.showSaved();
  chk('v3.4：存檔成功恢復 ✓ 已儲存', sv.textContent.includes('已儲存') && !sv.classList.contains('warn'));
  location.hostname = 'ting-aoi.github.io';
  FT._lastWrite = { ok:false, status:0 };
  FT.showSaved();
  chk('v3.4：展示模式存 localStorage 視為成功', sv.textContent.includes('已儲存'));
  location.hostname = 'localhost';

  // ════════ 總結 ════════
  console.log(`\n${fail ? '✗ 失敗' : '✓ 全部通過'} — ${pass} 通過 / ${fail} 失敗`);
  process.exit(fail ? 1 : 0);
})();
