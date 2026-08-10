// ═══════════════════════════════════════════════════════
// app.js — Futaba event wiring + boot
// ═══════════════════════════════════════════════════════
'use strict';

var FT = window.FT;

// ── Wire all events ──
function wireEvents() {
  // 狀態列兩鍵：版本號=更新日誌、右下本數=寫入診斷（左標籤為純顯示；功能頁改由左滑手勢開啟）
  FT.$('stat-ver').addEventListener('click',  () => { FT.showPage('changelog'); });
  // Diagnostic: tap book-count label to see last server-write status
  FT.$('stat-count').addEventListener('click', () => {
    const w = FT._lastWrite;
    let msg = '伺服器寫入診斷\n\n';
    if (w) {
      msg += '最後寫入：' + w.at + '\n'
           + '狀態：' + (w.ok ? '✓ 成功（' + w.status + '）' : '✗ 失敗（' + (w.err||w.status) + '）') + '\n'
           + '路徑：' + w.path + '\n';
    } else {
      msg += '尚未寫入（本次啟動後尚未存檔，\n或資料僅存於 localStorage）\n';
    }
    msg += '\n書評數：' + Object.keys(FT.books || {}).length;
    msg += '\n伺服器狀態：' + (FT.serverAvailable() === true ? '連線' : FT.serverAvailable() === false ? '離線' : '未知');
    alert(msg);
  });

  // 滑動手勢（v2.9c）——左右鏡像、以側欄狀態分流，兩手勢互斥不重疊：
  //   右滑：側欄關 → 開側欄；側欄開 → 無動作
  //   左滑：側欄開 → 關側欄（優先）；側欄關 → 開功能頁
  // 防誤觸：水平位移 >70px、垂直 <60px、耗時 <600ms；起點在輸入框則忽略。
  (function() {
    let sx = 0, sy = 0, st = 0, track = false;
    document.addEventListener('touchstart', e => {
      const t0 = e.touches[0];
      if (e.target.closest('input,textarea,select')) { track = false; return; }
      sx = t0.clientX; sy = t0.clientY; st = Date.now(); track = true;
    }, { passive: true });
    document.addEventListener('touchend', e => {
      if (!track) return;
      track = false;
      if (window._searchQ) return;   // 搜尋結果瀏覽中停用手勢，避免誤觸（返回鍵/✕ 可關搜尋）
      if (FT._appsSort) return;      // 磚牆排序模式中停用左右滑（拖曳優先）
      const t0 = e.changedTouches[0];
      const dx = t0.clientX - sx, dy = Math.abs(t0.clientY - sy);
      if (Date.now() - st > 600 || dy > 60 || Math.abs(dx) < 70) return;
      const sbOpen = FT.$('sidebar').classList.contains('open');
      const fromSb = !!(e.target.closest && e.target.closest('#sidebar'));
      if (dx > 0) {
        if (!sbOpen && !fromSb) FT.openSb();
      } else {
        if (sbOpen) FT.closeSb();
        else if (FT.currentPage !== 'apps') {
          FT.saveCurrentBook(); FT.showPage('apps');
          // 方向性滑入動畫：重置 → 強制 reflow → 觸發
          const pg = FT.$('apps-page');
          pg.classList.remove('slide-in'); void pg.offsetWidth; pg.classList.add('slide-in');
        }
      }
    }, { passive: true });
  })();

  // Sidebar nav
  FT.$('new-btn').addEventListener('click', () => { FT.newBook(); FT.closeSb(); });
  FT.$('toggle-sb').addEventListener('click', () => {
    const sb = FT.$('sidebar');
    if (window.innerWidth <= 700) {
      sb.classList.contains('open') ? FT.closeSb() : FT.openSb();
    } else {
      sb.classList.toggle('collapsed');
    }
  });
  FT.$('overlay').addEventListener('click', FT.closeSb);

  // Page nav — header
  FT.$('logo-home-btn').addEventListener('click', () => { FT.saveCurrentBook(); FT.showPage('home'); });
  FT.$('home-btn').addEventListener('click', () => { FT.saveCurrentBook(); FT.showPage('home'); });
  FT.$('trash-btn').addEventListener('click', () => { FT.saveCurrentBook(); FT.showPage('trash'); });
  FT.$('settings-btn').addEventListener('click', () => { FT.saveCurrentBook(); FT.showPage('settings'); });
  FT.$('apps-btn').addEventListener('click',     () => { FT.saveCurrentBook(); FT.showPage('apps'); });

  // v3.0 燙金光澤:主按鈕按下時斜向亮帶掃過(事件委派)
  document.addEventListener('click', e => {
    const btn = e.target.closest('#new-btn, .io-act-pri');
    if (!btn || btn.querySelector('.gilt-shine')) return;
    const s = document.createElement('span');
    s.className = 'gilt-shine';
    btn.appendChild(s);
    setTimeout(() => s.remove(), 720);
  }, { passive: true });

  // v3.0 點星落定回彈
  document.addEventListener('click', e => {
    const st = e.target.closest('.star');
    if (!st) return;
    st.classList.remove('pop'); void st.offsetWidth; st.classList.add('pop');
  }, { passive: true });

  // Page nav — sidebar
  FT.$('apps-sb-btn').addEventListener('click',     () => { FT.saveCurrentBook(); FT.showPage('apps');     FT.closeSb(); });
  FT.$('settings-sb-btn').addEventListener('click', () => { FT.saveCurrentBook(); FT.showPage('settings'); FT.closeSb(); });

  // Note actions
  FT.$('delete-btn').addEventListener('click', FT.softDelete);
  FT.$('empty-trash-btn').addEventListener('click', FT.emptyAllTrash);

  // Search
  const searchEl = FT.$('search');
  const headerEl = FT.$('header');
  searchEl.addEventListener('input', e => {
    window._searchQ = e.target.value;
    const sc = FT.$opt('search-clear');
    if (sc) sc.style.display = e.target.value ? 'flex' : 'none';
    FT.renderList();
    FT.renderSearchOverlay();
  });
  searchEl.addEventListener('focus',  () => headerEl.classList.add('search-focus'));
  searchEl.addEventListener('blur',   () => setTimeout(() => headerEl.classList.remove('search-focus'), 150));

  // Filters & sort
  FT.$('filter-status').addEventListener('change', e => {
    window._filterStatus = e.target.value;
    FT.renderList();
  });
  FT.$('sort-select').addEventListener('change', e => {
    window._sortKey = e.target.value;
    FT.renderList();
  });

  // Mode badge click
  FT.$('mode-badge').addEventListener('click', () => {
    FT.isReadMode = !FT.isReadMode;
    FT.settings.readModeDefault = FT.isReadMode;
    const tog = FT.$('readmode-toggle');
    if (tog) tog.checked = FT.isReadMode;
    FT.applyReadMode();
    FT.debSave();
  });

  // Settings toggles
  FT.$('night-toggle').addEventListener('change', e => {
    FT.applyNightMode(e.target.checked);
    FT.debSave();
  });
  FT.$('readmode-toggle').addEventListener('change', e => {
    FT.settings.readModeDefault = e.target.checked;
    FT.isReadMode = e.target.checked;
    if (FT.currentPage === 'note') FT.applyReadMode();
    FT.debSave();
  });

  // Note field changes (text inputs)
  // Text inputs → onFieldChange
  FT.initSmartPaste();
  const titleIn = FT.$opt('book-title-input');
  if (titleIn) titleIn.addEventListener('input', FT.checkDuplicateTitle);
  ['book-title-input','f-author','f-synopsis','f-review','f-notes']
    .forEach(id => { const el = FT.$opt(id); if (el) el.addEventListener('input', FT.onFieldChange); });
  // Audio platform: also update dependent fields visibility
  const audioPlatEl = FT.$opt('f-audio-platform');
  if (audioPlatEl) audioPlatEl.addEventListener('change', e => {
    FT.updateAudioFields(e.target.value);
    FT.saveCurrentBook();
    FT.debSave();
  });

  // Note field changes (selects)
  ['f-text-platform','f-audio-platform','f-cv-type','f-ai-cv','f-cv-change','f-voice-exp']
    .forEach(id => FT.$(id)?.addEventListener('change', FT.onFieldChange));

  // Stars
  FT.initStars();

  // Tag modal
  FT.$('tag-input').addEventListener('input', FT.renderTagCloud);
  FT.$('tag-modal').addEventListener('click', e => {
    if (e.target === FT.$opt('tag-modal')) FT.closeTagModal();
  });

  // Install banner
  FT.$('install-btn').addEventListener('click', FT.installApp);

  // Save on visibility change / page hide
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { FT.flushCharInputs(); FT.saveCurrentBook(); FT.saveAll(); }
  });
  window.addEventListener('pagehide', () => { FT.flushCharInputs(); FT.saveCurrentBook(); FT.saveAll(); });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); FT.saveCurrentBook(); FT.saveAll(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'e' && FT.currentPage==='note') { e.preventDefault(); FT.exportBook(); }
    if (e.key === 'Escape') { FT.closeTagModal(); FT.clearSearch(); }
  });
}

// ── Boot ──
(async () => {
  // 展示模式種子必須在 loadAll 之前完成（loadAll 的離線 fallback 讀 localStorage）
  await FT.initDemo().catch(e => console.warn('[Futaba] demo:', e.message));
  try {
    await Promise.all([
      FT.loadAll().catch(e => console.warn('[Futaba] loadAll:', e.message)),
      FT.loadSc2tc().catch(e => console.warn('[Futaba] sc2tc:', e.message)),
      FT.loadDefaults().catch(e => console.warn('[Futaba] defaults:', e.message)),
    ]);
  } catch(e) { console.warn('[Futaba] boot load:', e); }

  // Fill any still-empty list settings from built-in DEFAULTS (single source of truth)
  FT.fillDefaults();

  // 逐步執行，每步獨立隔離，單一失敗不阻斷後續
  [
    ['demoBanner',        function(){ if (FT.isDemo()) document.body.classList.add('demo'); }],
    ['sc2tcNotice',       function(){ if (!FT.sc2tcReady) setTimeout(function(){
                            FT.toast('簡繁對照表未載入，搜尋暫時無法簡繁互通', 3500); }, 1200); }],
    ['applyNightMode',    function(){ FT.applyNightMode(FT.settings.nightMode); }],
    ['initConflictModal', function(){ FT.initConflictModal(); }],
    ['initPWA',           function(){ FT.initPWA(); }],
    ['wireEvents',        function(){ wireEvents(); }],
    ['renderList',        function(){ FT.renderList(); }],
    ['renderStatusFilter',function(){ FT.renderStatusFilter(); }],
    ['startSync',         function(){ FT.startSync(); }],
    ['autoCleanTrash',    function(){ FT.autoCleanTrash().then(n => { if (n) FT.toast('已自動清理回收桶 '+n+' 本'); }).catch(function(){}); }],
    ['showPage(home)',    function(){ FT.showPage('home', {}, true); }],
    ['initHistory',       function(){ FT.initHistory(); }],
  ].forEach(function(step) {
    try { step[1](); }
    catch(e) { console.error('[Futaba] ' + step[0] + ' failed:', e.message, e); }
  });
})();

// 清除搜尋按鈕
(function(){
  const sc = FT.$opt('search-clear');
  if (!sc) return;
  sc.addEventListener('click', () => {
    const s = FT.$opt('search');
    if (s) { s.value = ''; s.focus(); }
    window._searchQ = '';
    sc.style.display = 'none';
    FT.renderList();
  });
})();
