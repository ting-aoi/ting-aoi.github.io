// ═══════════════════════════════════════════════════════
// storage.js — 存檔層與共用小工具（碰 DOM）
// localStorage 為主要存檔地；shttps 只做手動備份／還原。
// ═══════════════════════════════════════════════════════
'use strict';

var WOL = window.WOL = window.WOL || {};

// ── 安全 DOM 存取（缺元素時回傳啞物件，避免整條渲染鏈掛掉）──
var _dummy = {
  value: '', checked: false, textContent: '', innerHTML: '', style: {}, dataset: {},
  disabled: false,
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  addEventListener() {}, focus() {}, blur() {}, setAttribute() {}, getAttribute() { return null; },
  appendChild() {}, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  click() {}
};
WOL.$ = function (id) { return document.getElementById(id) || _dummy; };
WOL.$opt = function (id) { return document.getElementById(id); };

WOL.escH = function (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};
// 圖示助手：只能用於 innerHTML 路徑，textContent 塞不進去
WOL.icon = function (n, style) {
  return '<svg class="ic"' + (style ? ' style="' + style + '"' : '') + '><use href="#i-' + n + '"/></svg>';
};

WOL.toast = function (msg) {
  var el = WOL.$opt('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove('on'); }, 2200);
};

WOL.showSaved = function (ok, label) {
  var el = WOL.$opt('stat-save');
  if (!el) return;
  el.textContent = ok === false ? '⚠ ' + (label || '存檔失敗') : '✓ ' + (label || '已存檔');
  el.classList.toggle('warn', ok === false);
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove('on'); }, ok === false ? 4000 : 1600);
};

// ── 路徑推導（與雙葉同法：由 location.pathname 取得所在子目錄）──
// 放在 /wasteland-ol/ 底下時 _base === 'wasteland-ol'
var _base = location.pathname.replace(/\/[^/]*$/, '').replace(/^\//, '');
var _saveDir = (_base ? _base + '/' : '') + 'save/';
var _readSave = '/' + _saveDir + 'save.json';

// ── 靜態託管閘門 ──
// 只有 *.github.io 算靜態展示環境。shttps 暫時離線絕不能誤觸發，
// 否則備份鍵會憑空消失、Ting 會以為功能壞了。
WOL.isStatic = function () {
  return String((typeof location !== 'undefined' && location.hostname) || '').endsWith('github.io');
};

// ── localStorage（主要存檔地）──
WOL.LS_KEY = 'wol_save_v1';   // 專案前綴：與雙葉的 futaba_v2 同 origin 共存

WOL.saveLocal = function (st) {
  try {
    localStorage.setItem(WOL.LS_KEY, JSON.stringify(WOL.state.serialize(st)));
    return true;
  } catch (e) {
    console.warn('[WOL] saveLocal:', e && e.message);
    return false;
  }
};

// 回傳 { state, discarded } — discarded=true 代表讀到不相容存檔並已丟棄
WOL.loadLocal = function () {
  var raw;
  try { raw = JSON.parse(localStorage.getItem(WOL.LS_KEY) || 'null'); }
  catch (e) { return { state: null, discarded: true }; }
  if (!raw) return { state: null, discarded: false };
  var st = WOL.state.deserialize(raw);
  return { state: st, discarded: !st };
};

WOL.clearLocal = function () {
  try { localStorage.removeItem(WOL.LS_KEY); } catch (e) {}
};

WOL.saveNow = function () {
  var ok = WOL.saveLocal(WOL.game);
  WOL.showSaved(ok);
  if (WOL.renderSave) WOL.renderSave();
};

// ── shttps 手動備份 ──
async function _put(filename, pathParam, obj) {
  var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  var fd = new FormData();
  fd.append('files[]', blob, filename);
  var r = await fetch('/api/file/upload?path=' + pathParam, { method: 'PUT', body: fd });
  if (!r.ok && r.status !== 200 && r.status !== 204) throw new Error('PUT ' + r.status);
  return r;
}

async function _mkDir(parentPath, name) {
  return fetch('/api/file/new-folder', {
    method: 'POST', body: new URLSearchParams({ path: parentPath, name: name })
  });
}

WOL.backupUpload = async function () {
  try {
    var root = _base ? '/' + _base : '/';
    await _mkDir(root, 'save').catch(function () {});
    await _put('save.json', _saveDir, WOL.state.serialize(WOL.game));
    WOL.toast('已上傳到伺服器');
    WOL.showSaved(true, '已上傳');
  } catch (e) {
    WOL.toast('上傳失敗：' + (e && e.message ? e.message : e));
    WOL.showSaved(false, '上傳失敗');
  }
};

WOL.backupRestore = async function () {
  if (!confirm('從伺服器還原會覆蓋本機目前的進度，確定嗎？')) return;
  try {
    var r = await fetch(_readSave + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var raw = await r.json();
    var st = WOL.state.deserialize(raw);
    if (!st) { WOL.toast('伺服器存檔版本不相容，已略過'); return; }
    WOL.game = st;
    WOL.saveLocal(st);
    WOL.afterLoad();
    WOL.toast('已從伺服器還原');
  } catch (e) {
    WOL.toast('還原失敗：' + (e && e.message ? e.message : e));
  }
};

// ── 檔案匯出入 ──
WOL.exportFile = function () {
  var data = JSON.stringify(WOL.state.serialize(WOL.game), null, 2);
  var blob = new Blob([data], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'wasteland-save-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
};

WOL.importFile = function () {
  var input = WOL.$opt('import-input');
  if (!input) return;
  input.value = '';
  input.onchange = function () {
    var f = input.files && input.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var st = null;
      try { st = WOL.state.deserialize(JSON.parse(reader.result)); } catch (e) {}
      if (!st) { WOL.toast('存檔格式不符或版本不相容'); return; }
      WOL.game = st;
      WOL.saveLocal(st);
      WOL.afterLoad();
      WOL.toast('已匯入存檔');
    };
    reader.readAsText(f);
  };
  input.click();
};

WOL.resetGame = function () {
  if (!confirm('重新開始會清掉目前的進度，確定嗎？')) return;
  WOL.clearLocal();
  WOL.game = WOL.state.create(WOL.content.cfgs());
  WOL.time.enterPhase(WOL.game, WOL.game.phase, WOL.content.cfgs().survival);
  WOL.state.pushLog(WOL.game, '你在瓦礫堆裡醒來。', '');
  WOL.saveLocal(WOL.game);
  WOL.afterLoad();
  WOL.toast('已重新開始');
};
