// ═══════════════════════════════════════════════════════
// app.js — 開機序、事件接線、返回鍵、手勢
// ═══════════════════════════════════════════════════════
'use strict';

var WOL = window.WOL = window.WOL || {};

WOL.afterLoad = function () {
  WOL.renderSidebar();
  WOL.showPage(WOL.currentPage, true);
};

function wire() {
  WOL.$('toggle-sb').addEventListener('click', WOL.toggleSb);
  WOL.$('logo-home-btn').addEventListener('click', function () { WOL.showPage('shelter'); });
  ['shelter', 'explore', 'settings'].forEach(function (p) {
    var b = WOL.$opt(p + '-btn');
    if (b) b.addEventListener('click', function () { WOL.showPage(p); });
  });
  WOL.PAGES.forEach(function (p) {
    var b = WOL.$opt(p + '-sb-btn');
    if (b) b.addEventListener('click', function () { WOL.showPage(p); });
  });
  WOL.$('advance-btn').addEventListener('click', WOL.advanceTime);
  // 狀態列版號 → 更新日誌
  WOL.$('stat-ver').addEventListener('click', function () { WOL.showPage('changelog'); });

  // 返回鍵：扁平兩層，任何頁一律回避難所。戰鬥中不放行。
  window.addEventListener('popstate', function (e) {
    if (WOL.navLocked()) {
      history.pushState({ page: 'combat' }, '', '#combat');
      WOL.toast('戰鬥中無法離開');
      return;
    }
    var page = (e.state && e.state.page) || 'shelter';
    WOL._histPage = page;
    WOL.showPage(page, true);
  });

  // 手勢：右滑開側欄、左滑關側欄（戰鬥中停用）
  var sx = 0, sy = 0, st = 0;
  document.addEventListener('touchstart', function (e) {
    var t = e.touches[0];
    sx = t.clientX; sy = t.clientY; st = Date.now();
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (WOL.navLocked()) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - sx, dy = Math.abs(t.clientY - sy), dt = Date.now() - st;
    if (Math.abs(dx) < 70 || dy > 60 || dt > 600) return;
    if (dx > 0) WOL.openSb(); else WOL.closeSb();
  }, { passive: true });
}

// 瀏覽器端的資料讀取器（content.loadAll 接受任何 url → Promise<物件> 的函式）
function fetchJson(url) {
  return fetch(url + '?v=' + WOL.BUILD, { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

(async function boot() {
  // 夜間模式
  var night = false;
  try { night = localStorage.getItem('wol_night') === '1'; } catch (e) {}
  WOL.applyNight(night);

  // 網址帶 #update 直接強制更新（免確認），不進遊戲
  if (location.hash === '#update') { WOL.forceUpdate(true); return; }

  // 版本顯示（index.html 的錨點是唯一事實來源，這裡只補狀態列以外的地方）
  WOL.$('build-info').textContent = '版本 ' + WOL.VERSION + ' · BUILD ' + WOL.BUILD;

  await WOL.content.loadAll(fetchJson, './assets/data/');
  var cfgs = WOL.content.cfgs();

  var loaded = WOL.loadLocal();
  if (loaded.state) {
    WOL.game = loaded.state;
  } else {
    WOL.game = WOL.state.create(cfgs);
    WOL.time.enterPhase(WOL.game, WOL.game.phase, cfgs.survival);
    WOL.state.pushLog(WOL.game, '你在瓦礫堆裡醒來。', '');
    WOL.saveLocal(WOL.game);
  }
  if (loaded.discarded) WOL.toast('偵測到不相容的舊存檔，已重新開始');

  wire();

  var hash = (location.hash || '').replace('#', '');
  var start = WOL.PAGES.indexOf(hash) >= 0 ? hash : 'shelter';
  if (WOL.navLocked()) start = 'combat';
  history.replaceState({ page: start }, '', '#' + start);
  WOL._histPage = start;
  WOL.currentPage = start;
  WOL.renderSidebar();
  WOL.showPage(start, true);

  if (WOL.content.errors && WOL.content.errors.length)
    WOL.toast('資料檔有 ' + WOL.content.errors.length + ' 項問題，詳見設定頁');

  // navigator.serviceWorker 在無頭環境是 undefined，'in' 判斷會過但取用會炸
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function () {});
  }
})();
