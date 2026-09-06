// ═══════════════════════════════════════════════════════
// settings.js — Futaba settings management  v2.0
// ═══════════════════════════════════════════════════════
'use strict';
var FT = window.FT;

// ── Load defaults from assets/defaults.json ──
FT.loadDefaults = async function() {
  try {
    const r = await fetch('./assets/defaults.json', { cache: 'force-cache' });
    if (!r.ok) return;
    const d = await r.json();
    FT.LIST_KEYS.forEach(k => {
      if ((!FT.settings[k] || FT.settings[k].length === 0) && d[k]) FT.settings[k] = d[k];
    });
  } catch {}
};

// ── Render settings page ──
// v3.0a 設定頁摺疊：一次性把各區內容包進 .settings-sec-body（仿日誌收合邏輯），
// 點標題展開/收合；預設全部收合，展開狀態於本次瀏覽期間記憶。
let _settingsWrapped = false;
function _wrapSettingsSections() {
  if (_settingsWrapped) return;
  document.querySelectorAll('#settings-page .settings-sec').forEach(sec => {
    const title = sec.querySelector('.settings-sec-title');
    if (!title) return;
    const body = document.createElement('div');
    body.className = 'settings-sec-body';
    while (title.nextSibling) body.appendChild(title.nextSibling);
    sec.appendChild(body);
    // v3.0f：依 settings.json 的 settingsSecOpen 區名清單決定預設展開（比對用標題去表情/空白）
    const secName = (title.textContent || '').replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '');
    if ((FT.settings.settingsSecOpen || []).includes(secName)) sec.classList.add('open');
    title.addEventListener('click', () => sec.classList.toggle('open'));
  });
  _settingsWrapped = true;
}

// v3.0b 設定分頁：一般/書目/有聲
FT._settingsTab = 'general';
FT.switchSettingsTab = function(tab, btn) {
  FT._settingsTab = tab;
  document.querySelectorAll('#settings-page .settings-tab').forEach(b =>
    b.classList.toggle('on', b === btn || b.dataset.stab === tab));
  document.querySelectorAll('#settings-page .settings-sec[data-tab]').forEach(sec =>
    sec.classList.toggle('tab-visible', sec.dataset.tab === tab));
};

// v3.2 備份狀態顯示與手動備份
FT.refreshBackupInfo = async function() {
  const el = FT.$opt('backup-info');
  if (!el) return;
  const i = await FT.backupInfo();
  el.textContent = i.last
    ? `最後備份 ${i.last}　共 ${i.count} 份（保留最近 ${i.keep} 份）`
    : '尚無備份（首次存檔時自動建立）';
};

FT.backupNow = async function() {
  const btn = FT.$opt('backup-now-btn');
  if (btn) { btn.disabled = true; btn.textContent = '備份中…'; }
  const stamp = await FT.runBackupNow();
  if (btn) { btn.disabled = false; btn.textContent = '🗄️ 立即備份'; }
  FT.toast(stamp ? '已備份 ' + stamp : '備份失敗，請確認伺服器連線');
  FT.refreshBackupInfo();
};

FT.renderSettings = function() {
  _wrapSettingsSections();
  FT.switchSettingsTab(FT._settingsTab, null);
  FT.renderPlatformList('text');
  FT.renderPlatformList('audio');
  FT.renderStatusManageList();
  FT.renderCvOptionList('cvType');
  FT.renderCvOptionList('aiCv');
  FT.renderCvOptionList('cvChange');
  FT.renderCvOptionList('voiceExp');
  const sv = document.getElementById('settings-ver');
  if (sv) sv.textContent = (FT.$('stat-ver').textContent || '—');
  FT.renderNewBookDefaults();
  FT.refreshBackupInfo().catch(function(){});
  const tc = FT.$opt('trash-clean-toggle');
  if (tc) tc.checked = !!FT.settings.trashAutoClean;
};

// ── Platform lists ──
FT.renderPlatformList = function(type) {
  const key = type === 'text' ? 'textPlatforms' : 'audioPlatforms';
  const listId = type === 'text' ? 'text-platform-list' : 'audio-platform-list';
  const inputId = type === 'text' ? 'text-platform-input' : 'audio-platform-input';
  const usedP = new Set(Object.values(FT.books).map(b => type==='text'?b.textPlatform:b.audioPlatform).filter(Boolean));
  document.getElementById(listId).innerHTML =
    FT.settings[key].map((p, i) => {
      const u = usedP.has(p);
      return `<div class="edit-item">
        <input type="text" value="${FT.escH(p)}" onchange="FT.renamePlatform('${type}',${i},this.value)">
        ${u ? '<span class="used-dot" title="使用中"></span>' : ''}
        <button class="edit-del" ${u?'disabled':''} onclick="FT.deletePlatform('${type}',${i})">✕</button>
      </div>`;
    }).join('');
};

FT.addPlatform = function(type) {
  const inputId = type==='text' ? 'text-platform-input' : 'audio-platform-input';
  const key     = type==='text' ? 'textPlatforms' : 'audioPlatforms';
  const input   = FT.$opt(inputId); if (!input) return;
  const val = input.value.trim(); if (!val) return;
  if (!FT.settings[key].includes(val)) {
    FT.settings[key].push(val);
    FT.saveAll(); FT.renderPlatformList(type);
  }
  input.value = '';
};

FT.renamePlatform = function(type, idx, newName) {
  newName = newName.trim(); if (!newName) return;
  const key = type==='text' ? 'textPlatforms' : 'audioPlatforms';
  const old = FT.settings[key][idx];
  if (old === newName) return;
  Object.values(FT.books).forEach(b => {
    if (type==='text'  && b.textPlatform===old)  b.textPlatform  = newName;
    if (type==='audio' && b.audioPlatform===old) b.audioPlatform = newName;
  });
  FT.settings[key][idx] = newName;
  FT.saveAll();
};

FT.deletePlatform = function(type, idx) {
  const key = type==='text' ? 'textPlatforms' : 'audioPlatforms';
  const p = FT.settings[key][idx];
  const field = type==='text' ? 'textPlatform' : 'audioPlatform';
  if (Object.values(FT.books).some(b => b[field]===p)) { alert(`「${p}」使用中，無法刪除。`); return; }
  FT.settings[key].splice(idx, 1);
  FT.saveAll(); FT.renderPlatformList(type);
};

// ── Status management (3-group) ──
const _STATUS_GROUPS = [
  { key:'workStatusOptions',  field:'workStatus',  label:'作品狀態' },
  { key:'audioStatusOptions', field:'audioStatus', label:'聽書狀態' },
  { key:'myProgressOptions',  field:'myProgress',  label:'我的進度' },
];

FT.renderStatusManageList = function() {
  var el = document.getElementById('status-manage-list');
  if (!el) return;
  var html = '';
  _STATUS_GROUPS.forEach(function(g) {
    var usedS = new Set(Object.values(FT.books).map(b => b[g.field]).filter(Boolean));
    var list = FT.settings[g.key] || [];
    html += '<div class="settings-status-group">';
    html += '<div class="settings-status-group-label">' + g.label + '</div>';
    html += '<div class="edit-list">';
    list.forEach(function(sv, i) {
      var u = usedS.has(sv);
      html += '<div class="edit-item">';
      html += '<input type="text" value="' + FT.escH(sv) + '" onchange="FT.renameStatus(this.dataset.key,+this.dataset.idx,this.value)" data-key="' + g.key + '" data-idx="' + i + '">';
      if (u) html += '<span class="used-dot" title="使用中"></span>';
      html += '<button class="edit-del" ' + (u?'disabled':'') + ' data-key="' + g.key + '" data-idx="' + i + '" onclick="FT.deleteStatus(this.dataset.key,+this.dataset.idx)">✕</button>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div class="add-row" style="margin-bottom:14px">';
    html += '<input type="text" id="status-input-' + g.key + '" placeholder="新增' + g.label + '…" autocomplete="off">';
    html += '<button data-key="' + g.key + '" onclick="FT.addStatus(this.dataset.key)">新增</button>';
    html += '</div>';
    html += '</div>';
  });
  el.innerHTML = html;
  _STATUS_GROUPS.forEach(function(g) {
    var inp = document.getElementById('status-input-' + g.key);
    if (inp) inp.addEventListener('keydown', function(e){ if(e.key==='Enter') FT.addStatus(g.key); });
  });
};

FT.addStatus = function(key) {
  const input = document.getElementById('status-input-' + key);
  const val = input ? input.value.trim() : ''; if (!val) return;
  FT.settings[key] = FT.settings[key] || [];
  if (!FT.settings[key].includes(val)) {
    FT.settings[key].push(val);
    FT.saveAll(); FT.renderStatusManageList(); FT.renderStatusButtons();
  }
  if (input) input.value = '';
};

FT.renameStatus = function(key, idx, newName) {
  newName = newName.trim(); if (!newName) return;
  const g = _STATUS_GROUPS.find(g => g.key === key); if (!g) return;
  const old = FT.settings[key][idx]; if (old === newName) return;
  Object.values(FT.books).forEach(b => { if (b[g.field]===old) b[g.field] = newName; });
  FT.settings[key][idx] = newName;
  FT.saveAll();
  if (FT.currentPage==='note' && FT.activeId) FT.renderStatusButtons();
};

FT.deleteStatus = function(key, idx) {
  const g = _STATUS_GROUPS.find(g => g.key===key); if (!g) return;
  const val = FT.settings[key][idx];
  if (Object.values(FT.books).some(b => b[g.field]===val)) { alert(`「${val}」使用中，無法刪除。`); return; }
  FT.settings[key].splice(idx, 1);
  FT.saveAll(); FT.renderStatusManageList();
};

// ── CV option lists ──
const _CV_META = {
  cvType:   { listId:'cv-type-list',   inputId:'cv-type-input',   field:'cvType'   },
  aiCv:     { listId:'ai-cv-list',     inputId:'ai-cv-input',     field:'aiCv'     },
  cvChange: { listId:'cv-change-list', inputId:'cv-change-input', field:'cvChange' },
  voiceExp: { listId:'voice-exp-list', inputId:'voice-exp-input', field:'voiceExp' },
};

FT.renderCvOptionList = function(key) {
  const m = _CV_META[key]; if (!m) return;
  const el = document.getElementById(m.listId); if (!el) return;
  const usedV = new Set(Object.values(FT.books).map(b => b[m.field]).filter(Boolean));
  const list  = FT.settings[key+'Options'] || FT.settings[key] || [];
  el.innerHTML = list.map((v,i) => {
    const u = usedV.has(v);
    return `<div class="edit-item">
      <input type="text" value="${FT.escH(v)}" onchange="FT.renameCvOption('${key}',${i},this.value)">
      ${u ? '<span class="used-dot" title="使用中"></span>' : ''}
      <button class="edit-del" ${u?'disabled':''} onclick="FT.deleteCvOption('${key}',${i})">✕</button>
    </div>`;
  }).join('');
};

FT.addCvOption = function(key) {
  const m = _CV_META[key]; if (!m) return;
  const input = FT.$opt(m.inputId); if (!input) return;
  const val = input.value.trim(); if (!val) return;
  const arr = FT.settings[key+'Options'] || (FT.settings[key+'Options'] = []);
  if (!arr.includes(val)) { arr.push(val); FT.saveAll(); FT.renderCvOptionList(key); }
  input.value = '';
};

FT.renameCvOption = function(key, idx, newName) {
  newName = newName.trim(); if (!newName) return;
  const m = _CV_META[key]; if (!m) return;
  const arr = FT.settings[key+'Options'] || [];
  const old = arr[idx]; if (old===newName) return;
  Object.values(FT.books).forEach(b => { if (b[m.field]===old) b[m.field] = newName; });
  arr[idx] = newName; FT.saveAll();
};

FT.deleteCvOption = function(key, idx) {
  const m = _CV_META[key]; if (!m) return;
  const arr = FT.settings[key+'Options'] || [];
  const val = arr[idx];
  if (Object.values(FT.books).some(b => b[m.field]===val)) { alert(`「${val}」使用中，無法刪除。`); return; }
  arr.splice(idx,1); FT.saveAll(); FT.renderCvOptionList(key);
};

// ── Tag dictionary ──
FT.renderSettingsTagList = function() {
  const usedIds = new Set(Object.values(FT.books).flatMap(b => b.tags||[]));
  const groups  = {};
  FT.settings.tagDict.forEach(t => { (groups[t.group]=groups[t.group]||[]).push(t); });
  const grpKeys = Object.keys(groups).sort();
  let html = '';
  grpKeys.forEach(grp => {
    if (grp) html += '<div class="tag-group-header">'+FT.escH(grp)+'</div>';
    groups[grp].forEach(t => {
      const i = FT.settings.tagDict.indexOf(t);
      const u = usedIds.has(t.id);
      html += '<div class="edit-item">'
        + '<input type="text" value="'+FT.escH(t.label)+'" onchange="FT.renameTagLabel('+i+',this.value)">'
        + (u?'<span class="used-dot" title="使用中"></span>':'')
        + '<button class="edit-del" '+(u?'disabled':'')+' onclick="FT.deleteTagFromDict('+i+')">✕</button>'
        + '</div>';
    });
  });
  document.getElementById('settings-tag-list').innerHTML = html || '<div style="font-size:13px;color:var(--ink3);padding:8px 0">尚無標籤</div>';
  _updateGroupDatalist();
};

function _updateGroupDatalist() {
  const groups = [...new Set(FT.settings.tagDict.map(t=>t.group).filter(Boolean))].sort();
  const opts = groups.map(g=>'<option value="'+FT.escH(g)+'">').join('');
  ['tag-groups-datalist','tag-groups-datalist-modal'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}
FT._updateGroupDatalist = _updateGroupDatalist;

FT.renameTagLabel = function(idx, newLabel) {
  newLabel = newLabel.trim(); if (!newLabel) return;
  FT.settings.tagDict[idx].label = newLabel;
  FT.saveAll();
};

FT.deleteTagFromDict = function(idx) {
  const t = FT.settings.tagDict[idx]; if (!t) return;
  if (Object.values(FT.books).some(b=>(b.tags||[]).includes(t.id))) {
    alert(`標籤「${t.label}」使用中，無法刪除。`); return;
  }
  FT.settings.tagDict.splice(idx,1);
  FT.saveAll(); FT.renderSettingsTagList();
};

FT.addTagFromSettings = function() {
  const labelIn = FT.$opt('settings-tag-input');
  const groupIn = FT.$opt('settings-tag-group-input');
  const label = labelIn ? labelIn.value.trim().replace(/^#/,'') : '';
  const group = groupIn ? groupIn.value.trim() : '';
  if (!label) return;
  FT.addTagToDict(label, group);
  if (labelIn) { labelIn.value=''; labelIn.focus(); }
  FT.saveAll(); FT.renderSettingsTagList();
};

// ── IO modal ──


// ── Export functions ──
// v3.7a：JSZip 走 CDN，離線或 CDN 不通時會是 undefined。原本五個入口直接 new JSZip()，
// 未捕捉的 ReferenceError 讓按鈕「按了毫無反應」。統一在入口擋下並說人話。
function _zipReady() {
  if (typeof JSZip !== 'undefined') return true;
  const msg = '壓縮元件尚未載入（需要網路連線一次），請連上網後重新整理再試。';
  FT.toast ? FT.toast(msg, 4000) : alert(msg);
  return false;
}
FT.exportAll = async function() {
  if (!_zipReady()) return;
  FT.saveCurrentBook();
  const zip = new JSZip();
  // Raw book JSON files
  const booksFolder = zip.folder('books');
  Object.values(FT.books).forEach(b => booksFolder.file(b.id+'.json', JSON.stringify(b,null,2)));
  // MD notes
  const notesFolder = zip.folder('notes');
  const usedNames = new Set();
  Object.values(FT.books).forEach(b => notesFolder.file(FT.uniqueFilename(b.title, usedNames), FT.bookToMd(b)));
  // Trash and settings
  zip.file('trash.json',    JSON.stringify(FT.trash,    null,2));
  zip.file('settings.json', JSON.stringify(FT.settings, null,2));
  const blob = await zip.generateAsync({type:'blob'});
  _download(blob, `雙葉書庫_全部備份_${FT.nowStamp()}.zip`);
};

FT.exportBooksOnly = async function() {
  if (!_zipReady()) return;
  FT.saveCurrentBook();
  const zip = new JSZip();
  const booksFolder = zip.folder('books');
  Object.values(FT.books).forEach(b => booksFolder.file(b.id+'.json', JSON.stringify(b,null,2)));
  zip.file('trash.json', JSON.stringify(FT.trash,null,2));
  const blob = await zip.generateAsync({type:'blob'});
  _download(blob, `雙葉書庫_書評資料_${FT.nowStamp()}.zip`);
};

// v3.7：整庫 Markdown 獨立出口（原本只夾在「全部備份」zip 裡，沒有單獨入口）
FT.exportMarkdown = async function() {
  if (!_zipReady()) return;
  FT.saveCurrentBook();
  const zip = new JSZip();
  const notesFolder = zip.folder('notes');
  const usedNames = new Set();
  Object.values(FT.books).forEach(b => notesFolder.file(FT.uniqueFilename(b.title, usedNames), FT.bookToMd(b)));
  const blob = await zip.generateAsync({type:'blob'});
  _download(blob, `雙葉書庫_Markdown_${FT.nowStamp()}.zip`);
};

FT.exportSettings = function() {
  const blob = new Blob([JSON.stringify(FT.settings,null,2)], {type:'application/json'});
  _download(blob, `雙葉書庫_設定_${FT.nowStamp()}.json`);
};

// v3.8：改走 FT.saveBlob 統一出口（APK 在 WebView 內無法用 blob: 下載）
function _download(blob, filename) { FT.saveBlob(blob, filename); }

// ── Import functions ──

// 匯入前預覽：比較 zip 內容與現有書庫，回傳 false 表示使用者取消
function _confirmImport(newBooks, kind) {
  const curIds = new Set(Object.keys(FT.books));
  const newIds = new Set(Object.keys(newBooks));
  let added = 0, overwritten = 0;
  newIds.forEach(id => curIds.has(id) ? overwritten++ : added++);
  let removed = 0;
  curIds.forEach(id => { if (!newIds.has(id)) removed++; });
  const lines = [`即將匯入${kind}：`, '',
    `➕ 新增 ${added} 本`,
    `✏️ 覆蓋 ${overwritten} 本`,
    `➖ 移除 ${removed} 本（現有但不在匯入檔中）`,
    '', '匯入會以檔案內容完整取代現有書庫。確定繼續？'];
  return confirm(lines.join('\n'));
}

FT.importAll = async function(input) {
  const file = input.files[0]; if (!file) return;
  input.value = '';
  if (!_zipReady()) return;
  try {
    const zip = await JSZip.loadAsync(file);
    const newBooks = {};
    for (const [name, f] of Object.entries(zip.files)) {
      if (name.startsWith('books/') && name.endsWith('.json') && !f.dir) {
        const b = JSON.parse(await f.async('string'));
        if (b.id) newBooks[b.id] = b;
      }
    }
    const tf = zip.file('trash.json');
    FT.trash = tf ? JSON.parse(await tf.async('string')) : {};
    if (!_confirmImport(newBooks, '全部備份')) return;
    const sf = zip.file('settings.json');
    if (sf) FT.applySettings(JSON.parse(await sf.async('string')));
    FT.books = newBooks;
    FT.activeId = null;
    FT.applyNightMode(FT.settings.nightMode);
    FT.showPage('home'); FT.renderList(); FT.renderStatusFilter();
    FT.saveAll();    alert('✅ 匯入成功：'+Object.keys(newBooks).length+' 本書評');
  } catch(e) { alert('❌ 匯入失敗：'+e.message); }
};

FT.importBooksOnly = async function(input) {
  const file = input.files[0]; if (!file) return;
  input.value = '';
  if (!_zipReady()) return;
  try {
    const zip = await JSZip.loadAsync(file);
    const newBooks = {};
    for (const [name, f] of Object.entries(zip.files)) {
      if (name.startsWith('books/') && name.endsWith('.json') && !f.dir) {
        const b = JSON.parse(await f.async('string'));
        if (b.id) newBooks[b.id] = b;
      }
    }
    if (!_confirmImport(newBooks, '書評資料')) return;
    const tf = zip.file('trash.json');
    if (tf) FT.trash = JSON.parse(await tf.async('string'));
    FT.books = newBooks;
    FT.activeId = null;
    FT.showPage('home'); FT.renderList(); FT.renderStatusFilter();
    FT.saveAll();    alert('✅ 匯入書評：'+Object.keys(newBooks).length+' 本（設定未變更）');
  } catch(e) { alert('❌ 匯入失敗：'+e.message); }
};

FT.importSettings = async function(input) {
  const file = input.files[0]; if (!file) return;
  input.value = '';
  try {
    const text = await file.text();
    FT.applySettings(JSON.parse(text));
    FT.fillDefaults();
    FT.applyNightMode(FT.settings.nightMode);
    FT.renderSettings(); FT.renderList(); FT.renderStatusFilter();
    FT.saveAll();    alert('✅ 設定匯入成功');
  } catch(e) { alert('❌ 匯入失敗：'+e.message); }
};

// ── Misc ──
FT.uniqueFilename = function(title, used) {
  let name = FT.sanitize(title||'未命名')+'.md';
  let i=1;
  while (used.has(name)) { name = FT.sanitize(title||'未命名')+'_'+i+++'.md'; }
  used.add(name); return name;
};


// ── 新書預設值 ──
FT.renderNewBookDefaults = function() {
  const d = FT.settings.newBookDefaults || {textPlatform:'', audioPlatform:''};
  const mk = (list, cur, extra='') =>
    '<option value="">（不預設）</option>' + extra +
    list.map(p => `<option value="${FT.escH(p)}" ${p===cur?'selected':''}>${FT.escH(p)}</option>`).join('');
  const tEl = FT.$opt('default-text-platform');
  const aEl = FT.$opt('default-audio-platform');
  if (tEl) tEl.innerHTML = mk(FT.settings.textPlatforms, d.textPlatform);
  if (aEl) aEl.innerHTML = mk(FT.settings.audioPlatforms, d.audioPlatform,
    `<option value="無" ${'無'===d.audioPlatform?'selected':''}>無</option>`);
};

FT.setNewBookDefault = function(field, value) {
  FT.settings.newBookDefaults = FT.settings.newBookDefaults || {textPlatform:'', audioPlatform:''};
  FT.settings.newBookDefaults[field] = value;
  FT.saveAll();
};

// ── 資料維護：孤兒檔案 ──
FT.runOrphanScan = async function() {
  const btn = FT.$opt('orphan-scan-btn');
  if (btn) { btn.disabled = true; btn.textContent = '掃描中…'; }
  try {
    const orphans = await FT.scanOrphans();
    if (!orphans.length) { alert('✅ 沒有發現孤兒檔案，資料完整。'); return; }
    if (confirm(`發現 ${orphans.length} 個孤兒書評檔案（不在書庫索引中）。\n\n按「確定」救回書庫\n按「取消」進入刪除選項`)) {
      const n = await FT.rescueOrphans(orphans);
      FT.renderList(); FT.renderStatusFilter();
      alert(`✅ 已救回 ${n} 本書評`);
    } else if (confirm(`永久刪除這 ${orphans.length} 個檔案？此操作無法復原。`)) {
      await FT.deleteOrphans(orphans);
      alert('🗑 已刪除孤兒檔案');
    }
  } catch(e) {
    alert('❌ 掃描失敗：' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '掃描孤兒檔案'; }
  }
};

// ── 標籤合併 ──
FT.renderTagMergeSelects = function() {
  const opts = FT.settings.tagDict
    .map(t => `<option value="${FT.escA(t.id)}">${FT.escH(t.group?t.group+'·'+t.label:t.label)}（${t.count||0}）</option>`)
    .join('');
  const src = FT.$opt('merge-src'), dst = FT.$opt('merge-dst');
  if (src) src.innerHTML = '<option value="">來源標籤…</option>' + opts;
  if (dst) dst.innerHTML = '<option value="">合併到…</option>' + opts;
};

FT.mergeTags = function() {
  const srcId = FT.$('merge-src').value;
  const dstId = FT.$('merge-dst').value;
  if (!srcId || !dstId) { alert('請選擇來源與目標標籤'); return; }
  if (srcId === dstId)  { alert('來源與目標不能相同'); return; }
  const src = FT.tagById(srcId), dst = FT.tagById(dstId);
  if (!src || !dst) return;
  if (!confirm(`將「${src.label}」合併到「${dst.label}」？\n所有使用「${src.label}」的書評會改用「${dst.label}」，且「${src.label}」會從字典移除。`)) return;
  let n = 0;
  const swap = b => {
    const tags = b.tags || [];
    const i = tags.indexOf(srcId);
    if (i < 0) return;
    tags.splice(i, 1);
    if (!tags.includes(dstId)) tags.push(dstId);
    n++;
  };
  Object.values(FT.books).forEach(swap);
  Object.values(FT.trash).forEach(swap);
  const di = FT.settings.tagDict.findIndex(t => t.id === srcId);
  if (di >= 0) FT.settings.tagDict.splice(di, 1);
  FT.saveAll();
  const sv = document.getElementById('settings-ver');
  if (sv) sv.textContent = (FT.$('stat-ver').textContent || '—');
  FT.renderSettingsTagList();
  FT.renderTagMergeSelects();
  FT.renderList();
  FT.toast(`已合併：${n} 本書評更新`);
};
