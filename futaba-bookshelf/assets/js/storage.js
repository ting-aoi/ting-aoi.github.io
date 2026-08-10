// ═══════════════════════════════════════════════════════
// storage.js — Futaba v2.0  data persistence layer
// ═══════════════════════════════════════════════════════
'use strict';

var FT = window.FT = window.FT || {};

// ── Defaults ──
FT.DEFAULTS = {
  textPlatforms:     ['番茄小說','晉江文學城','起點中文','縱橫中文','掌閱','微信讀書','書旗小說','七貓小說'],
  audioPlatforms:    ['喜馬拉雅','番茄暢聽','懶人聽書','蜻蜓FM','荔枝','酷我音樂','網易雲音樂','咪咕音樂'],
  workStatusOptions: ['連載中','已完結','斷更'],
  audioStatusOptions:['製作中','已完結','停更'],
  myProgressOptions: ['書單','閱讀中','棄坑','閱讀完'],
  cvTypeOptions:     ['單播','雙播','多播','AI'],
  cvChangeOptions:   ['無換CV','換AI','更換重要角色CV'],
  voiceExpOptions:   ['極佳','優良','普通','略差','很差'],
  aiCvOptions:       ['無','有']
};
FT.LIST_KEYS = Object.keys(FT.DEFAULTS);

// ── State ──
FT.books    = {};
FT.trash    = {};
FT.settings = {
  // v3.0f:設定頁「預設展開」的區名清單(無介面,手動改 data/settings.json 的此陣列;
  // 區名為標題去除表情與空白,如 "系統更新"、"換CV選項")
  settingsSecOpen: ['系統更新','外觀','新書預設值'],
  backupKeep: 7,                        // 每日備份保留份數（手動改 settings.json 可調）
  tagDict:[], textPlatforms:[], audioPlatforms:[],
  workStatusOptions:[], audioStatusOptions:[], myProgressOptions:[],
  cvTypeOptions:[], cvChangeOptions:[], voiceExpOptions:[], aiCvOptions:[],
  nightMode:false, readModeDefault:false,
  newBookDefaults:{textPlatform:'', audioPlatform:''},
  trashAutoClean:true, trashRetentionDays:30
};
FT.activeId    = null;
FT.currentPage = 'home';
FT.isReadMode  = false;

FT.fillDefaults = function() {
  FT.LIST_KEYS.forEach(k => {
    if (!FT.settings[k] || !FT.settings[k].length)
      FT.settings[k] = FT.DEFAULTS[k].slice();
  });
};

FT.applySettings = function(s) {
  if (!s) return;
  FT.LIST_KEYS.forEach(k => { if (s[k] && s[k].length) FT.settings[k] = s[k]; });
  if (s.tagDict)              FT.settings.tagDict          = s.tagDict;
  if (Array.isArray(s.appsOrder)) FT.settings.appsOrder    = s.appsOrder;
  if (Array.isArray(s.settingsSecOpen)) FT.settings.settingsSecOpen = s.settingsSecOpen;
  if (s.backupKeep != null && parseInt(s.backupKeep,10) > 0) FT.settings.backupKeep = parseInt(s.backupKeep,10);
  if (s.nightMode      != null) FT.settings.nightMode      = s.nightMode;
  if (s.readModeDefault!= null) FT.settings.readModeDefault= s.readModeDefault;
  if (s.newBookDefaults)         FT.settings.newBookDefaults = {textPlatform:'', audioPlatform:'', ...s.newBookDefaults};
  if (s.trashAutoClean    != null) FT.settings.trashAutoClean    = s.trashAutoClean;
  if (s.trashRetentionDays!= null) FT.settings.trashRetentionDays= s.trashRetentionDays;
};

// ── Safe DOM accessors ──
const _dummy = {
  value:'', checked:false, textContent:'', innerHTML:'', style:{}, dataset:{},
  readOnly:false, disabled:false,
  classList:{add(){},remove(){},toggle(){},contains(){return false;}},
  addEventListener(){}, focus(){}, blur(){}, setAttribute(){}, getAttribute(){return null;},
  appendChild(){}, remove(){}, querySelector(){return null;}, querySelectorAll(){return[];}
};
FT.$    = id => document.getElementById(id) || _dummy;
FT.$opt = id => document.getElementById(id);
FT.serverAvailable = () => _serverAvailable;

// ── Utilities ──
FT.escH    = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// escA: escape for use inside single-quoted JS strings in inline handlers
FT.escA    = s => String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
FT.sanitize= s => String(s).replace(/[/\\:*?"<>|]/g,'_').trim()||'untitled';
FT.nowStamp= () => new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
// v3.6 SVG 圖示（index.html 內嵌 sprite），name 對應 #i-<name>
FT.icon    = (n,style) => '<svg class="ic"'+(style?' style="'+style+'"':'')+'><use href="#i-'+n+'"/></svg>';

FT.showSaved = function() {
  try {
    const sb = document.getElementById('sidebar');
    if (sb && sb.classList.contains('open') && FT.renderList) FT.renderList();
    else if (FT.renderCompletionBar) FT.renderCompletionBar();
  } catch {}
  const el = document.getElementById('stat-save');
  if (!el) return;
  // v3.4：依 _lastWrite.ok 誠實顯示，不再失敗也裝「已儲存」。
  // 展示模式例外：localStorage 就是預期儲存地，寫入即成功。
  const failed = !!(FT._lastWrite && FT._lastWrite.ok === false) && !FT.isDemo();
  el.textContent = failed ? '⚠ 未寫入伺服器' : '✓ 已儲存';
  el.classList.toggle('warn', failed);
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), failed ? 4000 : 1800);
};

// ── Tag helpers ──
// 平均評分（僅計已評分者）：回傳 {n, avg}；avg 為字串（一位小數）或 '—'
FT.avgRating = list => {
  const rated = list.filter(b => b.rating);
  if (!rated.length) return { n: 0, avg: '—' };
  return { n: rated.length, avg: (rated.reduce((s,b) => s+b.rating, 0) / rated.length).toFixed(1) };
};
FT.tagById      = id => FT.settings.tagDict.find(t => t.id===id)||null;
FT.tagLabel     = id => { const t=FT.tagById(id); return t?t.label:id; };
FT.tagFullLabel = id => { const t=FT.tagById(id); if(!t)return id; return t.group?t.group+'·'+t.label:t.label; };
FT.addTagToDict = (label, group='') => {
  const existing = FT.settings.tagDict.find(t => t.label===label && t.group===group);
  if (existing) return existing.id;
  const id = 'tag_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  FT.settings.tagDict.push({id, label, group, count:0});
  return id;
};

function _recomputeTagCounts() {
  const counts={};
  Object.values(FT.books).forEach(b=>(b.tags||[]).forEach(tid=>{counts[tid]=(counts[tid]||0)+1;}));
  FT.settings.tagDict.forEach(t=>{t.count=counts[t.id]||0;});
}

// ── Book model ──
FT.emptyBook = id => ({
  id, title:'', author:'',
  workStatus:'', audioStatus:'', myProgress:'',
  rating:0, textPlatform:'', audioPlatform:'',
  cvType:'', aiCv:'', cvChange:'', voiceExp:'',
  synopsis:'', review:'', characters:[], notes:'',
  tags:[], created:Date.now()
});

// v3.7：把「缺哪些欄位」抽成單一事實來源，completionLevel 與統計頁共用，
// 避免兩處各算各的而失準。hard 缺任一 = red；hard 齊全但 soft 缺 = yellow。
FT.MISSING_LABELS = ['書名','作者','我的進度','配音類型','AI 配音','換 CV','聲音體驗',
                     '閱讀平台','聽書平台','重要角色','標籤','劇情簡介','個人心得'];
FT.missingFields = function(b) {
  const noAudio = b.audioPlatform==='無';
  const filled  = k => b[k] && b[k].trim();
  const hard = [];
  if (!b.title) hard.push('書名');
  if (!filled('author')) hard.push('作者');
  if (!filled('myProgress')) hard.push('我的進度');
  if (!noAudio) {
    if (!filled('cvType'))    hard.push('配音類型');
    if (!filled('aiCv'))      hard.push('AI 配音');
    if (!filled('cvChange'))  hard.push('換 CV');
    if (!filled('voiceExp'))  hard.push('聲音體驗');
  }
  if (!b.textPlatform)  hard.push('閱讀平台');
  if (!b.audioPlatform) hard.push('聽書平台');
  if (!(b.characters && b.characters.length>0)) hard.push('重要角色');
  if (!(b.tags && b.tags.length>0)) hard.push('標籤');
  const soft = [];
  if (!b.synopsis) soft.push('劇情簡介');
  if (!b.review)   soft.push('個人心得');
  return { hard, soft };
};
FT.completionLevel = function(b) {
  const m = FT.missingFields(b);
  if (m.hard.length) return 'red';
  if (m.soft.length) return 'yellow';
  return 'ok';
};

FT.bookToMd = function(b) {
  const stars = '★'.repeat(b.rating||0)+'☆'.repeat(5-(b.rating||0));
  const chars = (b.characters||[]).map(c=>`- **${c.name}**：${c.desc}`).join('\n')||'（無）';
  const tags  = (b.tags||[]).map(id=>FT.tagFullLabel(id)).join('、')||'（無）';
  return `# ${b.title||'（無標題）'}

## 基本資料
- 作者：${b.author}
- 作品狀態：${b.workStatus}
- 聽書狀態：${b.audioStatus}
- 我的進度：${b.myProgress}
- 評分：${stars}

## 平台資訊
- 閱讀平台：${b.textPlatform}
- 聽書平台：${b.audioPlatform}
- 配音類型：${b.cvType}
- AI 配音：${b.aiCv}
- 換 CV：${b.cvChange}
- 聲音體驗：${b.voiceExp}

## 劇情簡介
${b.synopsis||'（未填寫）'}

## 個人心得
${b.review||'（未填寫）'}

## 重要角色
${chars}

## 標籤
${tags}

## 備註
${b.notes||'（無）'}

---
*建立於 ${new Date(b.created).toLocaleString('zh-TW')}*`;
};

FT.exportBook = function(id) {
  const b = id?FT.books[id]:(FT.activeId?FT.books[FT.activeId]:null);
  if (!b) return;
  const blob = new Blob([FT.bookToMd(b)],{type:'text/markdown;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=FT.sanitize(b.title||'未命名')+'.md'; a.click();
  URL.revokeObjectURL(url);
};

// ── Paths ──
// _base: directory portion of current URL (empty string for root)
const _base = location.pathname.replace(/\/[^/]*$/, '').replace(/^\//, '');
// Upload path: shttps expects path relative to served root, no leading slash
// e.g. '' for root, 'booknotes-pwa/' for subdir
const _dataDir   = (_base ? _base+'/' : '')+'data/';
const _booksDir  = _dataDir+'books/';
const _uploadData  = _dataDir;   // NOT encoded — shttps accepts plain relative path
const _uploadBooks = _booksDir;
// Read paths: fetch needs leading slash for absolute URL path
const _readBase  = '/'+_dataDir;
const _readBooks = '/'+_booksDir;

// ── Server I/O ──
let _serverAvailable = null;
FT._lastWrite = null;
// Snapshot of each book's JSON at last successful server write,
// used by _writeBookIfChanged to skip unchanged books (diff write).
const _written = {};   // { [id]: jsonString }

async function _get(url) {
  const r = await fetch(url+'?t='+Date.now(),{cache:'no-store'});
  if (!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

async function _put(filename, pathParam, obj) {
  const blob = new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
  const fd   = new FormData();
  fd.append('files[]', blob, filename);
  const r = await fetch('/api/file/upload?path='+pathParam,{method:'PUT',body:fd});
  if (!r.ok && r.status!==204 && r.status!==200)
    throw new Error(filename+' PUT '+r.status);
  return r;
}

// Create a folder via shttps API (path = parent, name = folder to create)
// 404 means parent not found; ignore 4xx if folder already exists (shttps returns 500 for exists)
async function _mkDir(parentPath, name) {
  const body = new URLSearchParams({path: parentPath, name});
  const r = await fetch('/api/file/new-folder', {method:'POST', body});
  // Any response is OK — folder either created or already existed
  return r;
}

// Ensure data/ and data/books/ exist on the server
let _foldersReady = false;
async function _ensureFolders() {
  if (_foldersReady) return;
  try {
    // Use shttps absolute path (with leading slash) for new-folder API
    const root = _base ? '/'+_base : '/';
    await _mkDir(root, 'data');
    const dataPath = root === '/' ? '/data' : root+'/data';
    await _mkDir(dataPath, 'books');
    _foldersReady = true;
  } catch(e) {
    console.warn('[Futaba] _ensureFolders:', e.message);
  }
}

// Delete a book file from server
async function _deleteBookFile(id) {
  delete _written[id];  // forget diff snapshot so a re-imported book gets written
  try {
    const booksPath = '/'+_booksDir.replace(/\/$/, '');
    const r = await fetch('/api/file/delete', {
      method: 'DELETE',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({path: booksPath, files: [id+'.json']})
    });
    if (!r.ok && r.status !== 404)
      console.warn('[Futaba] deleteBookFile failed:', id, r.status);
  } catch(e) {
    console.warn('[Futaba] deleteBookFile error:', id, e.message);
  }
}
FT.deleteBookFile = _deleteBookFile;

// List entries in a server folder (absolute path, e.g. "/data/books")
async function _listDir(absPath) {
  const r = await fetch('/api/file/list?path='+encodeURIComponent(absPath), {cache:'no-store'});
  if (!r.ok) throw new Error('list '+r.status);
  return r.json();
}

// ── Data maintenance: orphan book files ──
// Orphans = {id}.json files in data/books/ not referenced by index.json
// (legacy of pre-v2.1l deletes that only updated the index).
FT.scanOrphans = async function() {
  const booksPath = '/'+_booksDir.replace(/\/$/, '');
  const [entries, idx] = await Promise.all([_listDir(booksPath), _readIndex()]);
  const known = new Set([...(idx.bookIds||[]), ...(idx.trashIds||[])]);
  return entries
    .filter(e => !e.directory && e.name.endsWith('.json'))
    .map(e => e.name.replace(/\.json$/, ''))
    .filter(id => !known.has(id));
};

// Rescue orphans back into the library (reads each file, re-registers in index)
FT.rescueOrphans = async function(ids) {
  let n = 0;
  for (const id of ids) {
    try {
      const b = await _readBook(id);
      if (!b || !b.id) continue;
      b.tags = (b.tags||[]).filter(t => t != null);
      FT.books[b.id] = b;
      _written[b.id] = JSON.stringify(b);
      n++;
    } catch {}
  }
  if (n) await FT.saveAll();
  return n;
};

FT.deleteOrphans = async function(ids) {
  for (const id of ids) await _deleteBookFile(id);
  return ids.length;
};

const _readIndex    = ()  => _get(_readBase+'index.json');
const _readBook     = id  => _get(_readBooks+id+'.json');
const _readSettings = ()  => _get(_readBase+'settings.json').catch(()=>null);
const _writeBook    = b   => _put(b.id+'.json', _uploadBooks, b);
const _writeSettings= ()  => _put('settings.json', _uploadData, {...FT.settings, _v:Date.now()});

async function _writeIndex(idx) {
  const r = await _put('index.json', _uploadData, idx);
  FT._lastWrite = {ok:r.ok, status:r.status, path:_dataDir, at:new Date().toLocaleTimeString()};
}

// ── localStorage (offline fallback only) ──
const LS = 'futaba_v2';
const _lsSave = () => { try { localStorage.setItem(LS, JSON.stringify(
  {books:FT.books, trash:FT.trash, settings:FT.settings})); } catch {} };
const _lsLoad = () => { try { return JSON.parse(localStorage.getItem(LS)||'null'); } catch { return null; } };

// ── 展示模式（v3.4，GitHub Pages 訪客沙盒）──
// 閘門看 hostname：只有掛在 *.github.io 才算展示環境——shttps 暫時離線
// 絕不能誤觸發（否則 Ting 會看到範例資料以為自己的書全沒了）。
FT.isDemo = () => String((typeof location !== 'undefined' && location.hostname) || '').endsWith('github.io');

// 展示環境且訪客沒有自己的資料時，以 assets/demo.json 為種子寫入
// localStorage；之後一切走既有離線 fallback，訪客可增刪改（只存在其瀏覽器）。
FT.initDemo = async function() {
  if (!FT.isDemo() || _lsLoad()) return;
  const r = await fetch('./assets/demo.json', {cache:'no-store'});
  if (!r.ok) return;
  const demo = await r.json();
  try { localStorage.setItem(LS, JSON.stringify(demo)); } catch {}
};

// ── Daily backup ──
// 每日首次存檔時，將 books/trash/settings 快照寫入 data/data.bak.<日期>.json，
// 僅保留最近 settings.backupKeep 份（預設 7），較舊者自動刪除。
// v3.2：日期改用「本地時區」計算（原 toISOString 為 UTC，台灣清晨會錯開一天）。
let _saveCount = 0;

function _localDateStamp(d) {
  d = d || new Date();
  return d.getFullYear() + '-'
       + String(d.getMonth()+1).padStart(2,'0') + '-'
       + String(d.getDate()).padStart(2,'0');
}
FT.localDateStamp = _localDateStamp;

async function _dailyBackup(force) {
  try {
    const stamp = _localDateStamp();
    if (!force && localStorage.getItem('_bak_date')===stamp) return null;
    localStorage.setItem('_bak_date', stamp);
    const combined = {books:FT.books, trash:FT.trash, settings:FT.settings, backedAt:stamp};
    const fd = new FormData();
    fd.append('files[]', new Blob([JSON.stringify(combined,null,2)],{type:'application/json'}),
              'data.bak.'+stamp+'.json');
    await fetch('/api/file/upload?path='+_uploadData,{method:'PUT',body:fd});
    _pruneBackups().catch(()=>{});
    return stamp;
  } catch { return null; }
}

// 保留最近 N 份每日備份，其餘刪除（N = settings.backupKeep，預設 7，最低 1）
const _bakRe = /^(data|settings)\.bak\..*\.json$/;
async function _pruneBackups() {
  const keep = Math.max(1, parseInt(FT.settings.backupKeep, 10) || 7);
  const dataPath = '/'+_dataDir.replace(/\/$/, '');
  const entries = await _listDir(dataPath);
  const baks = entries
    .filter(e => !e.directory && _bakRe.test(e.name))
    .sort((a,b) => b.name.localeCompare(a.name)); // date in name → desc = newest first
  const stale = baks.slice(keep).map(e => e.name);
  if (!stale.length) return 0;
  await fetch('/api/file/delete', {
    method:'DELETE',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({path: dataPath, files: stale})
  });
  return stale.length;
}

// 對外：立即備份（設定頁按鈕用）與備份狀態查詢
FT.runBackupNow = () => _dailyBackup(true);
FT.backupInfo = async function() {
  const dataPath = '/'+_dataDir.replace(/\/$/, '');
  try {
    const entries = await _listDir(dataPath);
    const baks = entries.filter(e => !e.directory && _bakRe.test(e.name))
                        .map(e => e.name).sort().reverse();
    const m = baks.length && baks[0].match(/(\d{4}-\d{2}-\d{2})/);
    return { count: baks.length, last: m ? m[1] : null,
             keep: Math.max(1, parseInt(FT.settings.backupKeep, 10) || 7) };
  } catch {
    return { count: 0, last: localStorage.getItem('_bak_date'), keep: 7, offline: true };
  }
};

// ── Load ──
FT.loadAll = async function() {
  try {
    const idx = await _readIndex();
    const bookIds  = idx.bookIds  || [];
    const trashIds = idx.trashIds || [];
    const [br, tr] = await Promise.all([
      Promise.allSettled(bookIds.map(_readBook)),
      Promise.allSettled(trashIds.map(_readBook))
    ]);
    FT.books = {};
    br.forEach((r,i) => {
      if (r.status==='fulfilled') {
        const b = r.value;
        b.tags = (b.tags||[]).filter(t => t != null); // strip null/undefined
        FT.books[bookIds[i]] = b;
        _written[b.id] = JSON.stringify(b);  // prime diff-write snapshot
      }
    });
    FT.trash = {};
    tr.forEach((r,i) => {
      if (r.status==='fulfilled') {
        const b = r.value;
        b.tags = (b.tags||[]).filter(t => t != null);
        FT.trash[trashIds[i]] = b;
        _written[b.id] = JSON.stringify(b);
      }
    });
    const sv = await _readSettings();
    if (sv) FT.applySettings(sv);
    _serverAvailable = true;
    _lsSave();
    return;
  } catch(e) {
    // index.json not found (first install) — try to create folder structure
    if (e.message && e.message.includes('404')) {
      try {
        await _ensureFolders();
        await _writeIndex({bookIds:[], trashIds:[], version:0});
        console.info('[Futaba] Fresh install: created data/index.json');
        _serverAvailable = true;
        return;
      } catch {}
    }
    console.warn('[Futaba] server load failed:', e.message);
  }
  _serverAvailable = false;
  const cached = _lsLoad();
  if (cached) {
    FT.books = cached.books || {};
    FT.trash  = cached.trash || {};
    // Sanitize null tags from any cached data
    Object.values(FT.books).forEach(b => { b.tags = (b.tags||[]).filter(t => t!=null); });
    Object.values(FT.trash).forEach(b => { b.tags = (b.tags||[]).filter(t => t!=null); });
    FT.applySettings(cached.settings || {});
  }
};

// ── Save ──
let _saving = false, _savePending = false, _saveTimer = null;
let _indexVersion = 0;

// Compute index ids merged with the server's current index, so books that
// exist on the server but aren't in memory are never wiped from the index.
async function _mergedIds() {
  let bookIds  = Object.keys(FT.books);
  let trashIds = Object.keys(FT.trash);
  try {
    const idx = await _readIndex();
    bookIds  = [...new Set([...bookIds,  ...(idx.bookIds ||[]).filter(i => !FT.trash[i])])];
    trashIds = [...new Set([...trashIds, ...(idx.trashIds||[]).filter(i => !FT.books[i])])];
  } catch {} // server index unreadable → fall back to memory-only ids
  return {bookIds, trashIds};
}

// Write one book only if its content changed since the last successful write.
async function _writeBookIfChanged(b) {
  const json = JSON.stringify(b);
  if (_written[b.id] === json) return;       // unchanged → skip
  await _writeBook(b);
  _written[b.id] = json;
}

// Write the merged index and record diagnostics.
async function _commitIndex() {
  const {bookIds, trashIds} = await _mergedIds();
  const ver = Date.now();
  await _writeIndex({bookIds, trashIds, version: ver});
  _indexVersion = ver;
}

FT.saveAll = async function() {
  if (_saving) { _savePending = true; return; }
  _saving = true;
  try {
    _recomputeTagCounts();
    _lsSave();
    _saveCount++;
    if (_saveCount === 1 || _saveCount % 20 === 0) await _dailyBackup();
    await _ensureFolders();
    // Diff write: only books whose content changed since last write
    // v3.7a：單本失敗原本被 Promise.all 吞掉、整體仍標成功——存檔提示因此說謊。
    // 改為計數後反映到 _lastWrite，讓狀態列的「⚠ 未寫入伺服器」誠實觸發。
    const failed = [];
    await Promise.all([
      ...Object.values(FT.books).map(b => _writeBookIfChanged(b)
        .catch(e => { failed.push(b.id); console.warn('[Futaba] book write:', b.id, e.message); })),
      ...Object.values(FT.trash).map(b => _writeBookIfChanged(b)
        .catch(e => { failed.push(b.id); console.warn('[Futaba] trash write:', b.id, e.message); })),
    ]);
    await _commitIndex();
    await _writeSettings().catch(e => { failed.push('settings'); console.warn('[Futaba] settings write:', e.message); });
    _serverAvailable = failed.length === 0;
    FT._lastWrite = failed.length
      ? {ok:false, status:0, path:_dataDir, err:failed.length+' 個項目寫入失敗', failed,
         at:new Date().toLocaleTimeString()}
      : {ok:true, status:204, path:_dataDir, at:new Date().toLocaleTimeString()};
  } catch(e) {
    _serverAvailable = false;
    FT._lastWrite = {ok:false, status:0, path:_dataDir, err:e.message, at:new Date().toLocaleTimeString()};
    console.warn('[Futaba] saveAll:', e.message);
  } finally {
    _saving = false;
    FT.showSaved();
    if (_savePending) { _savePending = false; setTimeout(FT.saveAll, 0); }
  }
};

FT.saveBook = async function(id) {
  if (!id || !FT.books[id]) return;
  _lsSave();
  try {
    await _ensureFolders();
    await _writeBookIfChanged(FT.books[id]);
    await _commitIndex();
    _serverAvailable = true;
    FT._lastWrite = {ok:true, status:204, path:_booksDir, at:new Date().toLocaleTimeString()};
  } catch(e) {
    _serverAvailable = false;
    FT._lastWrite = {ok:false, status:0, path:_booksDir, err:e.message, at:new Date().toLocaleTimeString()};
    console.warn('[Futaba] saveBook:', id, e.message);
  }
  FT.showSaved();
};

FT.debSave = function() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    if (FT.currentPage==='note' && FT.activeId && FT.books[FT.activeId])
      FT.saveBook(FT.activeId);
    else
      FT.saveAll();
  }, 600);
};

// Flush on app hide/close
function _flush() {
  if (document.visibilityState!=='hidden') return;
  clearTimeout(_saveTimer); _saveTimer = null;
  if (FT.currentPage==='note' && FT.activeId) {
    try { FT.saveCurrentBook(); } catch {}
    FT.saveBook(FT.activeId);
  }
}
document.addEventListener('visibilitychange', _flush);
window.addEventListener('pagehide', _flush);

// ── Poll (exponential backoff) ──
let _pollInterval=8000, _pollFail=0, _pollStarted=false;

// Fetch the complete remote state described by an index
async function _fetchRemoteSnapshot(idx) {
  const bookIds  = idx.bookIds  || [];
  const trashIds = idx.trashIds || [];
  const all = [...new Set([...bookIds, ...trashIds])];
  const results = await Promise.allSettled(all.map(_readBook));
  const books = {}, trash = {};
  results.forEach(r => {
    if (r.status !== 'fulfilled') return;
    const b = r.value;
    b.tags = (b.tags||[]).filter(t => t != null);
    (bookIds.includes(b.id) ? books : trash)[b.id] = b;
  });
  return { books, trash, version: idx.version || 0 };
}

// Replace in-memory state with a remote snapshot (and prime diff-write cache)
FT.applyRemote = function(remote) {
  FT.books = remote.books || {};
  FT.trash  = remote.trash || {};
  Object.values(FT.books).forEach(b => { _written[b.id] = JSON.stringify(b); });
  Object.values(FT.trash).forEach(b => { _written[b.id] = JSON.stringify(b); });
  _indexVersion = remote.version || _indexVersion;
  _lsSave();
};

// Summarize how remote differs from memory: which books were
// added / removed / modified on the other device.
FT.diffRemote = function(remote) {
  const t = b => (b && b.title) || '（無標題）';
  const localAll  = {...FT.trash, ...FT.books};
  const remoteAll = {...(remote.trash||{}), ...(remote.books||{})};
  const out = { added:[], removed:[], modified:[] };
  for (const id in remoteAll) {
    if (!localAll[id]) out.added.push(t(remoteAll[id]));
    else if (JSON.stringify(remoteAll[id]) !== JSON.stringify(localAll[id]))
      out.modified.push(t(remoteAll[id]));
  }
  for (const id in localAll)
    if (!remoteAll[id]) out.removed.push(t(localAll[id]));
  return out;
};

async function _poll() {
  if (document.hidden || _serverAvailable!==true) { setTimeout(_poll,_pollInterval); return; }
  try {
    const idx = await _readIndex();
    _pollFail=0; _pollInterval=8000;
    if ((idx.version||0) <= _indexVersion) { setTimeout(_poll,_pollInterval); return; }
    const remote = await _fetchRemoteSnapshot(idx);
    if (_saving) {
      // True write race — let the user decide, with a diff summary
      FT.onRemoteUpdate && FT.onRemoteUpdate(remote);
    } else {
      FT.applyRemote(remote);
      FT.onRemoteUpdate && FT.onRemoteUpdate();
    }
  } catch {
    _pollFail++;
    _pollInterval = Math.min(8000*Math.pow(2,_pollFail), 120000);
  }
  setTimeout(_poll, _pollInterval);
}

FT.startSync = function() {
  if (_pollStarted) return;
  _pollStarted = true;
  setTimeout(_poll, _pollInterval);
};

// ── 回收桶自動清理：刪除超過保留天數的項目 ──
FT.autoCleanTrash = async function() {
  if (!FT.settings.trashAutoClean) return 0;
  const days = FT.settings.trashRetentionDays || 30;
  const cutoff = Date.now() - days * 86400000;
  const stale = Object.values(FT.trash)
    .filter(b => b.deletedAt && b.deletedAt < cutoff)
    .map(b => b.id);
  if (!stale.length) return 0;
  stale.forEach(id => { _deleteBookFile(id); delete FT.trash[id]; });
  await FT.saveAll();
  return stale.length;
};
