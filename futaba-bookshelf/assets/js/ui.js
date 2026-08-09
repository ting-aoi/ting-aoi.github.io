// ═══════════════════════════════════════════════════════
// ui.js — Futaba UI shell: pages, home, sidebar, search, PWA
// ═══════════════════════════════════════════════════════
'use strict';

var FT = window.FT;

// ── Helpers ──
FT.escH = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// FT.escA is defined in storage.js (single source)

// ── Night mode ──
FT.applyNightMode = function(on) {
  // v3.0 主題切換過渡：僅切換瞬間掛 transition，避免常駐渲染成本
  document.body.classList.add('theme-switch');
  setTimeout(() => document.body.classList.remove('theme-switch'), 400);
  document.body.classList.toggle('night', on);
  FT.settings.nightMode = on;
  const tog = FT.$('night-toggle');
  if (tog) tog.checked = on;
  // Android 狀態列顏色跟隨主題
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', on ? '#1a140c' : '#33281a');
};

// ── Page routing ──
FT.showPage = function(page, opts, fromPop) {
  // 切換頁面時清除搜尋殘留：避免搜尋結果層蓋住新頁面（需手動清字才看得到的問題）
  if (window._searchQ) FT.clearSearch();
  FT.currentPage = page;
  // 層級導航（扁平兩層模型）：home=1，其餘頁面一律=2。
  // 主頁→任何頁 push 一層；頁與頁之間切換 replace（不堆疊）。
  // 任何頁面按返回鍵一律直接回主頁；歷史深度恆定，不會殘留中間頁。
  if (!fromPop) {
    const LAYER = { home: 1, note: 2, apps: 2, authors: 2, backup: 2, trash: 2, settings: 2, stats: 2, changelog: 2, tags: 2, library: 2 };
    const st = { page };
    if (page === 'note' && FT.activeId) st.bookId = FT.activeId;
    const cur = history.state;
    if (!(cur && cur.page === st.page && cur.bookId === st.bookId)) {
      const curLayer = (cur && LAYER[cur.page]) || 1;
      const newLayer = LAYER[page] || 1;
      if (newLayer > curLayer) history.pushState(st, '', '#' + page);
      else                     history.replaceState(st, '', '#' + page);
    }
  }
  ['home','note','apps','authors','backup','trash','settings','stats','changelog','tags','library'].forEach(p => {
    FT.$(p + '-page').classList.toggle('active', p === page);
  });
  ['home-btn','trash-btn','settings-btn','changelog-btn','apps-btn'].forEach(id => {
    const el = FT.$(id);
    if (el) el.classList.toggle('active', id.replace('-btn','') === page);
  });
  ['apps-sb-btn','settings-sb-btn'].forEach(id => {
    FT.$(id).classList.toggle('active', id.replace('-sb-btn','') === page);
  });
  // mode-badge only on note page
  const badge = FT.$('mode-badge');
  if (badge) badge.style.display = page === 'note' ? 'inline-flex' : 'none';
  const labels = { home:'雙葉書庫', apps:'功能', authors:'作者', backup:'備份', trash:'回收桶', settings:'設定', stats:'統計', changelog:'更新日誌', tags:'標籤', library:'書庫' };
  if (labels[page]) FT.$('stat-note').textContent = labels[page];
  if (page === 'home')     FT.renderHome();
  if (page === 'apps')     FT.renderApps();
  if (page === 'authors')  FT.renderAuthors();
  if (page === 'trash')    FT.renderTrash();
  if (page === 'settings') FT.renderSettings();
  if (page === 'tags')     FT.renderTagsPage();
  if (page === 'library')  FT.renderLibrary();
  if (page === 'stats')    FT.renderStats();
  if (page === 'changelog') FT.renderChangelog();
};

// Called by poll when remote data changes
// remoteData passed when conflict detected
FT.onRemoteUpdate = function(remote) {
  if (remote) {
    // Conflict: show modal with a per-book diff summary
    FT._pendingRemote = remote;
    const diffEl = FT.$opt('conflict-diff');
    if (diffEl) {
      const d = FT.diffRemote(remote);
      const row = (icon, label, list) => list.length
        ? `<div style="margin:4px 0"><b>${icon} ${label}（${list.length}）</b>：${FT.escH(list.slice(0,5).join('、'))}${list.length>5?` 等 ${list.length} 本`:''}</div>`
        : '';
      const html = row('➕','遠端新增', d.added)
                 + row('✏️','內容不同', d.modified)
                 + row('➖','遠端已刪', d.removed);
      diffEl.innerHTML = html || '<div style="opacity:0.7">（僅版本號不同，書評內容一致）</div>';
    }
    const m = FT.$('conflict-modal');
    if (m) m.style.display = 'flex';
    return;
  }
  FT._applyRemoteAndRender();
};

FT._applyRemoteAndRender = function() {
  FT.renderList();
  FT.renderStatusFilter();
  if (FT.currentPage === 'home')     FT.renderHome();
  if (FT.currentPage === 'trash')    FT.renderTrash();
  if (FT.currentPage === 'settings') FT.renderSettings();
  if (FT.currentPage === 'stats')    FT.renderStats();
  if (FT.currentPage === 'apps')     FT.renderApps();
  if (FT.currentPage === 'library')  FT.renderLibrary();
  if (FT.currentPage === 'authors')  FT.renderAuthors();
};

FT.initConflictModal = function() {
  const m = FT.$('conflict-modal');
  if (!m) return;
  FT.$('conflict-keep-local').addEventListener('click', () => {
    m.style.display = 'none';
    FT._pendingRemote = null;
    FT.saveAll(); // force overwrite remote with our version
  });
  FT.$('conflict-load-remote').addEventListener('click', () => {
    m.style.display = 'none';
    const d = FT._pendingRemote;
    if (d) {
      FT.applyRemote(d);   // correctly replaces state + primes diff-write cache
      FT._pendingRemote = null;
    }
    FT._applyRemoteAndRender();
  });
};

// ── Home page ──
FT.renderHome = function() {
  const {escH, escA} = FT;
  const all = Object.values(FT.books);
  const byS = {};
  (FT.settings.myProgressOptions||[]).forEach(s => byS[s] = 0);
  all.forEach(b => { if (b.myProgress && byS[b.myProgress] !== undefined) byS[b.myProgress]++; });
  const rated = all.filter(b => b.rating);
  const avg = rated.length ? (rated.reduce((s,b) => s + b.rating, 0) / rated.length).toFixed(1) : '-';

  FT.$('home-stats').innerHTML =
    `<div class="stat-card"><div class="stat-num">${all.length}</div><div class="stat-label">總書評數</div></div>` +
    (FT.settings.myProgressOptions||[]).map(s =>
      `<div class="stat-card"><div class="stat-num">${byS[s]||0}</div><div class="stat-label">${escH(s)}</div></div>`
    ).join('') +
    `<div class="stat-card"><div class="stat-num">${avg}</div><div class="stat-label">平均評分</div></div>`;

  const recent = [...all].sort((a,b) => b.created - a.created).slice(0, 6);
  FT.$('recent-grid').innerHTML = recent.length
    ? recent.map(b => `<div class="recent-card" onclick="FT.openBook('${b.id}')">
        <span style="font-size:20px">📖</span>
        <div class="recent-info">
          <div class="recent-title">${escH(b.title||'（無標題）')}</div>
          <div class="recent-meta">
            <span>${escH(b.author||'—')}</span>
            ${b.myProgress ? `<span>${escH(b.myProgress)}</span>` : ''}
            ${b.rating ? `<span class="gilt-star">${'★'.repeat(b.rating)}</span>` : ''}
          </div>
        </div></div>`).join('')
    : '<div style="font-size:13px;color:var(--ink3)">尚無書評，點擊「新增書評」開始記錄。</div>';

  // Tag cloud — grouped display
  const usedTagIds = [...new Set(all.flatMap(b => b.tags || []))];
  const usedTags = usedTagIds
    .map(id => FT.tagById(id))
    .filter(Boolean)
    .sort((a,b) => a.group.localeCompare(b.group,'zh-TW') || a.label.localeCompare(b.label,'zh-TW'));

  FT.$('home-tag-cloud').innerHTML = usedTags.length
    ? usedTags.map(t =>
        `<span class="tc" onclick="FT.filterByTag('${escA(t.id)}')">${t.group ? `<span style="color:var(--ink4);font-size:10px">${escH(t.group)}·</span>` : ''}${escH(t.label)}</span>`
      ).join('')
    : '<span style="font-size:13px;color:var(--ink3)">尚無標籤</span>';
};

FT.filterByTag = function(tagId) {
  const t = FT.tagById(tagId);
  if (!t) return;
  const q = '#' + (t.group ? t.group + ':' + t.label : t.label);
  FT.$('search').value = q;
  window._searchQ = q;
  FT.renderList();
  FT.renderSearchOverlay();
};

// ── Book list (sidebar) ──
window._searchQ    = '';
window._filterStatus = '';
window._sortKey    = 'date-desc';

FT.sortBooks = function(list) {
  const idx = FT.settings.statusOptions;
  return list.sort((a, b) => {
    switch (window._sortKey) {
      case 'date-asc':   return a.created - b.created;
      case 'rating-desc':return (b.rating||0) - (a.rating||0);
      case 'rating-asc': return (a.rating||0) - (b.rating||0);
      case 'status':     return idx.indexOf(a.status) - idx.indexOf(b.status);
      default:           return b.created - a.created;
    }
  });
};

FT.renderList = function() {
  const el = FT.$('book-list');
  if (!el) return;
  const q = (window._searchQ || '').trim();
  const parsed = FT.parseSearch(q.toLowerCase());
  const badgeMap = { red: '◆', yellow: '◇' };

  let list = Object.values(FT.books).filter(b => {
    if (window._filterStatus && b.myProgress !== window._filterStatus) return false;
    if (!q) return true;
    return FT.bookMatchesSearch(b, parsed);
  });
  list = FT.sortBooks(list);

  if (!list.length) {
    el.innerHTML = `<div class="list-empty">${q || window._filterStatus ? '沒有符合的書評' : '書庫是空的<br>點擊上方「＋ 新增書評」開始'}</div>`;
  } else {
    el.innerHTML = list.map(b => {
      const lv = FT.completionLevel(b);
      const badge = lv !== 'ok'
        ? `<span class="book-badge badge-${lv==='red'?'r':'y'}">${badgeMap[lv]}</span>`
        : '';
      const tagStr = (b.tags||[]).slice(0,3).map(id => '#' + FT.tagLabel(id)).join(' ');
      const sel = FT.batchMode && FT.batchSel.has(b.id);
      const check = FT.batchMode ? `<span class="batch-check ${sel?'on':''}">${sel?'✓':''}</span>` : '';
      return `<div class="book-item ${b.id===FT.activeId?'active':''} ${sel?'batch-sel':''}"
        onclick="FT.onBookItemClick('${b.id}')"
        onpointerdown="FT._lpStart('${b.id}')" onpointerup="FT._lpEnd()"
        onpointercancel="FT._lpEnd()" onpointermove="FT._lpEnd()">
        ${check}<div class="book-item-text">
          <div class="book-title-sb">${FT.escH(b.title||'（無標題）')}</div>
          <div class="book-meta-sb">
            <span>${FT.escH(b.author||'—')}</span>
            ${b.myProgress ? `<span>${FT.escH(b.myProgress)}</span>` : ''}
            ${b.rating ? `<span class="book-rating-sb gilt-star">${'★'.repeat(b.rating)}</span>` : ''}
            ${tagStr ? `<span>${FT.escH(tagStr)}</span>` : ''}
          </div>
        </div>${badge}
      </div>`;
    }).join('');
  }

  FT.$('stat-count').textContent = Object.keys(FT.books).length + ' 本';
  FT.renderCompletionBar();
  FT.renderBatchBar();
};

// ── 完成度進度條 ──
FT.renderCompletionBar = function() {
  const el = FT.$opt('completion-bar');
  if (!el) return;
  const all = Object.values(FT.books);
  if (!all.length) { el.style.display = 'none'; return; }
  let ok=0, y=0, r=0;
  all.forEach(b => { const lv = FT.completionLevel(b); lv==='ok'?ok++:lv==='yellow'?y++:r++; });
  const n = all.length;
  el.style.display = 'block';
  el.innerHTML = `
    <div class="cbar-track">
      <div class="cbar-seg cbar-ok" style="width:${ok/n*100}%"></div>
      <div class="cbar-seg cbar-y"  style="width:${y/n*100}%"></div>
      <div class="cbar-seg cbar-r"  style="width:${r/n*100}%"></div>
    </div>
    <div class="cbar-label">完成 ${ok} · 待補 ${y} · 缺漏 ${r}</div>`;
};

// ── 批次操作 ──
FT.batchMode = false;
FT.batchSel  = new Set();
let _lpTimer = null, _lpFired = false;

FT._lpStart = function(id) {
  _lpFired = false;
  clearTimeout(_lpTimer);
  _lpTimer = setTimeout(() => {
    _lpFired = true;
    if (!FT.batchMode) { FT.batchMode = true; FT.batchSel.clear(); }
    FT.batchSel.add(id);
    FT.renderList();
  }, 550);
};
FT._lpEnd = function() { clearTimeout(_lpTimer); };

FT.onBookItemClick = function(id) {
  if (_lpFired) { _lpFired = false; return; }   // suppress click after long-press
  if (FT.batchMode) {
    FT.batchSel.has(id) ? FT.batchSel.delete(id) : FT.batchSel.add(id);
    if (!FT.batchSel.size) FT.exitBatch(); else FT.renderList();
    return;
  }
  FT.openBook(id); FT.closeSb();
};

FT.exitBatch = function() {
  FT.batchMode = false;
  FT.batchSel.clear();
  FT.renderList();
};

FT.renderBatchBar = function() {
  const bar = FT.$opt('batch-bar');
  if (!bar) return;
  if (!FT.batchMode) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const sel = FT.$opt('batch-progress');
  if (sel && !sel.dataset.filled) {
    sel.innerHTML = '<option value="">改進度…</option>' +
      FT.settings.myProgressOptions.map(o => `<option>${FT.escH(o)}</option>`).join('');
    sel.dataset.filled = '1';
  }
  FT.$('batch-count').textContent = FT.batchSel.size + ' 本';
};

FT.batchSetProgress = function(val) {
  if (!val) return;
  FT.batchSel.forEach(id => { if (FT.books[id]) FT.books[id].myProgress = val; });
  FT.saveAll(); FT.exitBatch();
  FT.toast(`已將 ${'進度設為「'+val+'」'}`);
};

FT.batchAddTag = function() {
  FT._batchTagging = true;
  FT.openTagModal();
};

FT.batchTrash = function() {
  if (!confirm(`將選取的 ${FT.batchSel.size} 本移至回收桶？`)) return;
  const now = Date.now();
  FT.batchSel.forEach(id => {
    const b = FT.books[id];
    if (!b) return;
    b.deletedAt = now;
    FT.trash[id] = b;
    delete FT.books[id];
  });
  FT.saveAll(); FT.exitBatch();
};

// ── Toast ──
FT.toast = function(msg, ms=2200) {
  let t = FT.$opt('ft-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'ft-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), ms);
};

FT.renderStatusFilter = function() {
  const sel = FT.$('filter-status');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">── 全部進度 ──</option>' +
    (FT.settings.myProgressOptions||[]).map(s =>
      `<option value="${FT.escH(s)}" ${cur===s?'selected':''}>${FT.escH(s)}</option>`
    ).join('');
  sel.value = cur;
};

// ── Search overlay ──
FT.renderSearchOverlay = function() {
  const overlay = FT.$('search-overlay');
  const q = (window._searchQ || '').trim();
  if (!q) { overlay.classList.remove('active'); return; }
  overlay.classList.add('active');
  const parsed = FT.parseSearch(q.toLowerCase());
  const badgeMap = { red: '◆', yellow: '◇' };
  const list = FT.sortBooks(Object.values(FT.books).filter(b => FT.bookMatchesSearch(b, parsed)));
  FT.$('search-count-label').textContent = `搜尋「${q}」— 共 ${list.length} 筆`;
  FT.$('search-results-list').innerHTML = list.length
    ? list.map(b => {
        const lv = FT.completionLevel(b);
        const badge = lv !== 'ok' ? `<span class="sr-badge badge-${lv==='red'?'r':'y'}">${badgeMap[lv]}</span>` : '';
        return `<div class="sr-item" onclick="FT.openBookFromSearch('${b.id}')">
          <div class="sr-item-body">
            <div class="sr-title">${FT.escH(b.title||'（無標題）')}</div>
            <div class="sr-meta">
              <span>${FT.escH(b.author||'—')}</span>
              ${b.myProgress ? `<span>${FT.escH(b.myProgress)}</span>` : ''}
              ${b.rating ? `<span class="gilt-star">${'★'.repeat(b.rating)}</span>` : ''}
              ${(b.tags||[]).length ? `<span>${(b.tags||[]).slice(0,3).map(id=>'#'+FT.tagLabel(id)).map(FT.escH).join(' ')}</span>` : ''}
            </div>
          </div>${badge}
        </div>`;
      }).join('')
    : `<div class="sr-empty">找不到符合「${FT.escH(q)}」的書評</div>`;
};

FT.clearSearch = function() {
  FT.$('search').value = '';
  window._searchQ = '';
  const sc = FT.$opt('search-clear');
  if (sc) sc.style.display = 'none';   // ✕ 的隱藏收斂於此：返回鍵/切頁/Escape 各路徑一致（v2.9e）
  FT.renderList();
  FT.renderSearchOverlay();
  FT.$('search').blur();
};

FT.openBookFromSearch = function(id) {
  FT.clearSearch();
  FT.openBook(id);
};

// ── Trash ──
FT.renderTrash = function() {
  const list = Object.values(FT.trash).sort((a,b) => (b.deletedAt||0) - (a.deletedAt||0));
  FT.$('trash-list').innerHTML = list.length
    ? list.map(b => `<div class="trash-item">
        <div class="trash-info">
          <div class="trash-name">${FT.escH(b.title||'（無標題）')}</div>
          <div class="trash-meta">${FT.escH(b.author||'—')}${b.myProgress?' · '+FT.escH(b.myProgress):''} · 刪除於 ${new Date(b.deletedAt||0).toLocaleDateString('zh-TW')}</div>
        </div>
        <div class="trash-actions">
          <button class="act-btn restore" onclick="FT.restoreBook('${b.id}')">還原</button>
          <button class="act-btn danger"  onclick="FT.permDelete('${b.id}')">永久刪除</button>
        </div></div>`).join('')
    : '<div style="font-size:13px;color:var(--ink3);text-align:center;padding:40px 0">回收桶是空的</div>';
};

FT.restoreBook = function(id) {
  if (!FT.trash[id]) return;
  delete FT.trash[id].deletedAt;
  FT.books[id] = FT.trash[id];
  delete FT.trash[id];
  FT.renderTrash(); FT.renderList(); FT.saveAll();
};

FT.permDelete = function(id) {
  if (!confirm(`永久刪除「${FT.trash[id]?.title||'此筆記'}」？此操作無法復原。`)) return;
  // Delete physical file first (non-blocking)
  FT.deleteBookFile(id);
  delete FT.trash[id];
  FT.renderTrash();
  FT.saveAll();
};

FT.emptyAllTrash = function() {
  if (!Object.keys(FT.trash).length) return;
  if (!confirm(`永久刪除回收桶中全部 ${Object.keys(FT.trash).length} 本？`)) return;
  const ids = Object.keys(FT.trash);
  // Delete all physical files (non-blocking)
  ids.forEach(id => FT.deleteBookFile(id));
  FT.trash = {};
  FT.renderTrash();
  FT.saveAll();
};

// ── Sidebar ──
FT.openSb = function() {
  FT.$('sidebar').classList.add('open');
  FT.$('overlay').classList.add('on');
  // 開側欄即重繪：書目小標、完成度條、進度篩選計數全部即時
  FT.renderList();
  FT.renderStatusFilter();
};
FT.closeSb = function() {
  FT.$('sidebar').classList.remove('open');
  FT.$('overlay').classList.remove('on');
};

// ── 直式鎖定（v2.9）：安裝版 PWA 依 manifest 鎖 portrait；
// 此處再以 Screen Orientation API 盡力鎖定（瀏覽器分頁通常拒絕，靜默略過）──
try {
  if (screen.orientation && screen.orientation.lock) {
    const tryLock = () => screen.orientation.lock('portrait').catch(() => {});
    tryLock();
    screen.orientation.addEventListener && screen.orientation.addEventListener('change', tryLock);
  }
} catch (e) { /* 不支援即略過 */ }
// 註：瀏覽器分頁無權鎖定方向；保證性的防護由 #rotate-guard 橫式攔截層負責。

// ── 強制更新（v2.9h）：SW 註銷 → 全快取清除 → 帶時間戳重載（繞過 HTTP 快取）──
// 書評資料在伺服器與 localStorage，不受影響。
FT.forceUpdate = async function(skipConfirm) {
  if (!skipConfirm && !confirm('強制更新會清除快取並重新載入頁面（書評資料不受影響）。繼續？')) return;
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch (e) {}
  try {
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (e) {}
  location.replace(location.pathname + '?fresh=' + Date.now());
};

// 網址列 #update 觸發強制更新（v2.9i）：
// 即使頁面（含設定頁）全卡在舊版，於網址列輸入 …/#update 也是一次全新導航——
// index.html 走網路取得新版 → 新 JS 開機偵測到 #update → 直接執行強制更新。
// forceUpdate 內以 location.replace 導向 ?fresh=…（不含 hash），不會迴圈。
if (location.hash === '#update') {
  FT.forceUpdate(true);
}

// ── PWA install ──
let _deferredPrompt = null;
FT.initPWA = function() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
      // Immediately check for updates + on every tab focus
      reg.update();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update();
      });
      // If a SW is already waiting (e.g. previous update was deferred), activate it now
      if (reg.waiting) reg.waiting.postMessage('skipWaiting');
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed') nw.postMessage('skipWaiting');
          if (nw.state === 'activated' && navigator.serviceWorker.controller) {
            const t = document.createElement('div');
            t.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--gold);border:1px solid var(--gold);border-radius:8px;padding:8px 16px;font-size:12px;z-index:999;white-space:nowrap';
            t.textContent = '✦ 已更新新版本，重新載入中…';
            document.body.appendChild(t);
            setTimeout(() => window.location.reload(), 1200);
          }
        });
      });
    }).catch(() => {});
    // controllerchange fires when new SW takes control → reload
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
  });

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredPrompt = e;
    if (!localStorage.getItem('pwa_dismissed'))
      setTimeout(() => FT.$('install-banner').classList.add('on'), 2500);
  });
  window.addEventListener('appinstalled', FT.dismissInstall);
};

FT.installApp = async function() {
  if (!_deferredPrompt) return;
  _deferredPrompt.prompt();
  const { outcome } = await _deferredPrompt.userChoice;
  if (outcome === 'accepted') FT.dismissInstall();
  _deferredPrompt = null;
};

FT.dismissInstall = function() {
  FT.$('install-banner').classList.remove('on');
  localStorage.setItem('pwa_dismissed', '1');
};

// ── Changelog: load from changelog.json ──
var _changelogLoaded = false;
// ── 更新日誌（v2.9g：兩層分組 + 惰性渲染）──
// 第一層：大版本（v1、v2…）。「當前大版本」不包大分組，其小版本系列直接平鋪；
//         舊大版本整個包成「vN 系列」大分組（摺疊）。
// 第二層：小版本系列（v2.8～v2.8b 為一組）。最新系列也是分組，只是預設展開。
// 所有摺疊內容一律惰性渲染：第一次展開前不產生 DOM。
FT._clReg = null;   // key → { kind:'minor'|'major', entries?|minors? }

FT._clEntryHtml = function(e) {
  return '<div class="changelog-ver">'
    + '<div class="changelog-ver-header">'
    + '<span class="changelog-ver-num">' + FT.escH(e.version) + '</span>'
    + '<span class="changelog-ver-date">' + FT.escH(e.date) + '</span>'
    + '</div>'
    + '<ul class="changelog-list">'
    + (e.items || []).map(function(item) { return '<li>' + FT.escH(item) + '</li>'; }).join('')
    + '</ul></div>';
};

// 產生一個摺疊組的外殼（標頭＋空內容區）；open=true 時內容直接渲染並展開
FT._clGroupShell = function(key, title, meta, bodyHtml, open, big) {
  return '<div class="cl-group' + (big ? ' cl-group-big' : '') + '">'
    + '<button class="cl-group-head" onclick="FT.toggleClGroup(\'' + key + '\')">'
    + '<span class="cl-group-arrow" id="cl-arrow-' + key + '">' + (open ? '▾' : '▸') + '</span>'
    + '<span class="cl-group-title">' + FT.escH(title) + '</span>'
    + '<span class="cl-group-meta">' + FT.escH(meta) + '</span>'
    + '</button>'
    + '<div class="cl-group-body' + (open ? ' open' : '') + '" id="cl-body-' + key + '">' + (open ? bodyHtml : '') + '</div>'
    + '</div>';
};

FT._clMinorShell = function(g, open) {
  var nItems = g.entries.reduce(function(s, e) { return s + (e.items || []).length; }, 0);
  var body = open ? g.entries.map(FT._clEntryHtml).join('') : '';
  return FT._clGroupShell(g.key, g.base + ' 系列', g.entries.length + ' 個版本 · ' + nItems + ' 項', body, open, false);
};

FT.renderChangelog = async function() {
  var el = FT.$opt('changelog-content');
  if (!el) return;
  try {
    var r = await fetch('./assets/changelog.json', { cache: 'no-store', headers: {'Cache-Control':'no-cache'} });
    if (!r.ok) throw new Error('fetch failed');
    var entries = await r.json();
    if (!entries.length) { el.innerHTML = ''; return; }

    // 兩層分組（維持 changelog 新到舊順序）
    var reg = {}, majors = [], byMajor = {};
    entries.forEach(function(e) {
      var base  = String(e.version).replace(/[a-z]$/, '');            // v2.8b → v2.8
      var major = base.split('.')[0];                                  // v2.8  → v2
      if (!byMajor[major]) { byMajor[major] = { major: major, minors: [], byBase: {} }; majors.push(byMajor[major]); }
      var M = byMajor[major];
      if (!M.byBase[base]) {
        var g = { key: base.replace(/\./g, '-'), base: base, entries: [] };
        M.byBase[base] = g; M.minors.push(g);
      }
      M.byBase[base].entries.push(e);
    });

    var html = '';
    majors.forEach(function(M, mi) {
      M.minors.forEach(function(g) { reg[g.key] = { kind: 'minor', g: g }; });
      if (mi === 0) {
        // 當前大版本：小版本系列平鋪；最新系列預設展開（仍是分組，可收合）
        html += M.minors.map(function(g, gi) { return FT._clMinorShell(g, gi === 0); }).join('');
      } else {
        // 舊大版本：整個包成大分組，內容（小系列標頭）惰性渲染
        var mKey = 'M' + M.major.replace(/\./g, '-');
        reg[mKey] = { kind: 'major', M: M };
        var nVer = M.minors.reduce(function(s, g) { return s + g.entries.length; }, 0);
        var nItm = M.minors.reduce(function(s, g) {
          return s + g.entries.reduce(function(x, e) { return x + (e.items || []).length; }, 0);
        }, 0);
        html += FT._clGroupShell(mKey, M.major + ' 系列', nVer + ' 個版本 · ' + nItm + ' 項', '', false, true);
      }
    });
    FT._clReg = reg;
    el.innerHTML = html;
  } catch(err) {
    el.innerHTML = '<div style="font-size:13px;color:var(--ink3);padding:10px 0">無法載入更新日誌。</div>';
  }
};

FT.toggleClGroup = function(key) {
  var body = FT.$opt('cl-body-' + key);
  var arrow = FT.$opt('cl-arrow-' + key);
  var node = FT._clReg && FT._clReg[key];
  if (!body || !node) return;
  if (body.classList.contains('open')) {
    body.classList.remove('open');
    if (arrow) arrow.textContent = '▸';
    return;
  }
  if (!body.innerHTML) {   // 惰性渲染：第一次展開才產生 DOM
    body.innerHTML = node.kind === 'major'
      ? node.M.minors.map(function(g) { return FT._clMinorShell(g, false); }).join('')
      : node.g.entries.map(FT._clEntryHtml).join('');
  }
  body.classList.add('open');
  if (arrow) arrow.textContent = '▾';
};

// ── History API: handle back gesture ──
// 返回鍵：在主頁需於 2.5 秒內按兩次才真正離開
let _exitArmedAt = 0;

window.addEventListener('popstate', function(e) {
  // 搜尋中按返回鍵：優先退出搜尋、停留原頁（補回被消耗的歷史項）（v2.9d）
  if (window._searchQ) {
    FT.clearSearch();
    history.pushState({ page: FT.currentPage }, '', '#' + FT.currentPage);
    return;
  }
  // Reached the bottom history entry (no state) while on home → exit guard
  if (!e.state || e.state.root) {
    if (FT.currentPage === 'home') {
      if (Date.now() - _exitArmedAt < 2500) {
        history.back();              // second back within window → really leave
        return;
      }
      _exitArmedAt = Date.now();
      FT.toast('再按一次返回鍵離開');
      history.pushState({page:'home'}, '', '#home');   // re-arm
      return;
    }
    // Not on home (e.g. landed via hash) — treat as navigate home
    FT.saveCurrentBook && FT.saveCurrentBook();
    FT.showPage('home', {}, true);
    return;
  }
  const page = e.state.page || 'home';
  if (page === 'note' && e.state.bookId && FT.books[e.state.bookId]) {
    FT.activeId = e.state.bookId;
    FT.showPage('note', {}, true);
    FT.loadForm(FT.books[e.state.bookId]);
  } else {
    FT.saveCurrentBook && FT.saveCurrentBook();
    FT.showPage(page, {}, true);
  }
});

// ── 歷史堆疊初始化：確保主頁下方有 root 入口，返回鍵才有攔截空間 ──
FT.initHistory = function() {
  try {
    history.replaceState({ page: 'home', root: true }, '', '#home');
    history.pushState({ page: 'home' }, '', '#home');
  } catch {}
};
