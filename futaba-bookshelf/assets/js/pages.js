// ═══════════════════════════════════════════════════════
// pages.js — Futaba 聚合頁（功能磚牆、作者頁、統計分析頁）
// 特性：全部由 FT.books 即時聚合，唯讀展示、不寫入伺服器。
// 依賴：storage.js（資料與 helpers）、ui.js（showPage 路由）
// ═══════════════════════════════════════════════════════
'use strict';

var FT = window.FT;

// ── 功能頁（app 磚牆，v2.7b）──
// 未來新頁面（作者頁、書櫃…）只要在此登錄表加一格即可。
FT.APPS = [
  { id:'home',      icon:'home', label:'主頁',     sub:() => Object.keys(FT.books).length + ' 本書評' },
  { id:'library',   icon:'library', label:'書庫',     sub:() => Object.keys(FT.books).length + ' 本' },
  { id:'stats',     icon:'chart', label:'統計分析', sub:() => {
      const r = FT.avgRating(Object.values(FT.books));
      return r.n ? '平均 ' + r.avg + '★' : '尚無評分';
    } },
  { id:'authors',   icon:'pen', label:'作者',     sub:() => {
      const s = new Set(Object.values(FT.books).map(b => (b.author||'').trim() || '（未填作者）'));
      return s.size + ' 位';
    } },
  { id:'tags',      icon:'tag', label:'標籤',     sub:() => (FT.settings.tagDict||[]).length + ' 個' },
  { id:'trash',     icon:'trash', label:'回收桶',   sub:() => Object.keys(FT.trash).length + ' 本' },
  { id:'backup',    icon:'backup', label:'備份',     sub:() => '匯出 / 匯入' },
  { id:'settings',  icon:'gear', label:'設定',     sub:() => FT.settings.nightMode ? '夜間模式' : '日間模式' },
  { id:'changelog', icon:'clipboard', label:'更新日誌', sub:() => FT.$('stat-ver').textContent || '' },
];

// v3.0c 磚牆順序：settings.appsOrder 持久化；未列入的新磚自動附尾
FT.orderedApps = function() {
  const order = FT.settings.appsOrder;
  if (!Array.isArray(order) || !order.length) return FT.APPS;
  const byId = Object.fromEntries(FT.APPS.map(a => [a.id, a]));
  const sorted = order.map(id => byId[id]).filter(Boolean);
  FT.APPS.forEach(a => { if (!order.includes(a.id)) sorted.push(a); });
  return sorted;
};

FT.renderApps = function() {
  const grid = FT.$opt('apps-grid');
  if (!grid) return;
  grid.classList.toggle('sorting', !!FT._appsSort);
  const btn = FT.$opt('apps-sort-btn');
  if (btn) { btn.classList.toggle('on', !!FT._appsSort); btn.innerHTML = FT._appsSort ? '✓ 完成' : FT.icon('sort')+' 排序'; }
  grid.innerHTML = FT.orderedApps().map(a => {
    let sub = '';
    try { sub = a.sub ? a.sub() : ''; } catch { sub = ''; }
    return `<button class="app-tile" onclick="FT.openApp('${a.id}')">
      <span class="app-tile-icon">${FT.icon(a.icon)}</span>
      <span class="app-tile-label">${FT.escH(a.label)}</span>
      <span class="app-tile-sub">${FT.escH(sub)}</span>
    </button>`;
  }).join('');
};

FT.openApp = function(page) {
  if (FT._appsSort) return;   // 排序模式中點擊不導航
  if (page === 'authors') FT._authorSel = null;   // 從磚牆進入一律回作者列表
  FT.saveCurrentBook && FT.saveCurrentBook();
  FT.showPage(page);
};

// ── 作者頁 (v2.8) ──
// 完全由 FT.books 即時聚合：不新增欄位、不寫入伺服器。
// 頁內兩態：列表（全部作者）↔ 細節（單一作者）。返回鍵維持扁平鐵律（回主頁），
// 細節內建「← 全部作者」按鈕回列表。
FT._authorSel = null;   // null=列表；字串=檢視中的作者名

FT.authorKey = b => (b.author || '').trim() || '（未填作者）';

FT.renderAuthors = function() {
  const wrap = FT.$opt('authors-content');
  if (!wrap) return;
  const {escH, escA} = FT;
  const all = Object.values(FT.books);

  if (!all.length) {
    wrap.innerHTML = '<div class="stats-empty">書庫還是空的。<br>新增書評後，這裡會自動聚合作者。</div>';
    return;
  }

  // 聚合 作者 → 作品
  const byA = {};
  all.forEach(b => { const k = FT.authorKey(b); (byA[k] ||= []).push(b); });

  // ── 細節模式 ──
  const sel = FT._authorSel;
  if (sel && byA[sel]) {
    const books = FT.sortBooks([...byA[sel]]);
    const rated = books.filter(b => b.rating);
    const avg = FT.avgRating(books).avg;
    const best = rated.length ? Math.max(...rated.map(b => b.rating)) : 0;
    wrap.innerHTML =
        `<button class="author-back" onclick="FT.openAuthor(null)">← 全部作者</button>`
      + `<div class="author-detail-head"><div class="author-detail-name">${escH(sel)}</div>`
      + (sel !== '（未填作者）' ? `<button class="author-new-btn" onclick="FT.newBookForAuthor('${escA(sel)}')">＋ 新增書評</button>` : '')
      + `</div>`
      + `<div class="stats-grid" style="margin-bottom:20px">`
      +   `<div class="stat-card"><div class="stat-num">${books.length}</div><div class="stat-label">總作品</div></div>`
      +   `<div class="stat-card"><div class="stat-num">${avg}</div><div class="stat-label">平均分</div></div>`
      +   `<div class="stat-card"><div class="stat-num stat-num-stars gilt-star">${best ? '★'.repeat(best) : '—'}</div><div class="stat-label">最高分</div></div>`
      + `</div>`
      + books.map(b =>
          `<div class="author-book-row" onclick="FT.openBook('${escA(b.id)}')">
            <div class="author-book-stars gilt-star">${b.rating ? '★'.repeat(b.rating) + '☆'.repeat(5 - b.rating) : '未評分'}</div>
            <div class="author-book-title">${escH(b.title || '（無標題）')}</div>
            ${b.myProgress ? `<div class="author-book-progress">${escH(b.myProgress)}</div>` : ''}
          </div>`).join('');
    return;
  }

  // ── 列表模式：作品數降序 → 平均分降序 → 名稱 ──
  FT._authorSel = null;
  const rows = Object.entries(byA).map(([name, books]) => {
    const r = FT.avgRating(books);
    return { name, n: books.length, avg: r.n ? parseFloat(r.avg) : 0, hasRating: r.n > 0 };
  }).sort((a,b) => b.n - a.n || b.avg - a.avg || a.name.localeCompare(b.name, 'zh-TW'));

  wrap.innerHTML =
      `<div class="stats-caption">共 ${rows.length} 位作者 · 由書評即時聚合，點一位查看作品。</div>`
    + rows.map(r =>
        `<div class="author-row" onclick="FT.openAuthor('${escA(r.name)}')">
          <div class="author-row-name">${escH(r.name)}</div>
          <div class="author-row-meta">
            <span>作品 ${r.n}</span>
            ${r.hasRating ? `<span class="author-row-avg">${r.avg.toFixed(1)}★</span>` : '<span>未評分</span>'}
          </div>
        </div>`).join('');
};

// v3.1：從作者頁新增書評，自動帶入該作者
FT.newBookForAuthor = function(name) {
  FT.newBook();
  const b = FT.books[FT.activeId];
  if (b) { b.author = name; const el = FT.$opt('f-author'); if (el) el.value = name; FT.debSave(); }
};

FT.openAuthor = function(name) {
  FT._authorSel = name;
  FT.renderAuthors();
  const inner = document.querySelector('#authors-page .page-inner');
  if (inner) inner.scrollTop = 0;
};

// ── 功能磚拖動排序 (v3.0c) ──
FT._appsSort = false;

FT.toggleAppsSort = function() {
  FT._appsSort = !FT._appsSort;
  if (!FT._appsSort) FT.saveAll();   // 完成時持久化
  FT.renderApps();
};

// 觸控拖曳（v3.0d 重寫：transform 位移制）
// 核心原則：拖曳期間絕不重建/移動 DOM——被按住的磚一旦被銷毀，Android 會中止
// 觸控事件流（v3.0c「動一格就斷」的根因）。其餘磚以 CSS transform 平滑讓位，
// 放開（或取消）時才一次性落定並重繪。
(function() {
  let drag = null;   // { srcIdx, dstIdx, order, tiles[], ghost, gx, gy, cellW, cellH, grid }

  function cleanup(commit) {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.ghost) d.ghost.remove();
    d.tiles.forEach(tl => { tl.style.transform = ''; tl.classList.remove('drag-src'); });
    d.grid.classList.remove('dragging');
    if (commit && d.dstIdx !== d.srcIdx) {
      const ids = d.order.slice();
      const [m] = ids.splice(d.srcIdx, 1);
      ids.splice(d.dstIdx, 0, m);
      FT.settings.appsOrder = ids;
    }
    FT.renderApps();
  }

  function applyShift(d) {
    // 其餘磚讓位：src<dst 時 (src,dst] 前移一格；src>dst 時 [dst,src) 後移一格
    d.tiles.forEach((tl, i) => {
      if (i === d.srcIdx) return;
      let j = i;
      if (d.srcIdx < d.dstIdx && i > d.srcIdx && i <= d.dstIdx) j = i - 1;
      else if (d.srcIdx > d.dstIdx && i >= d.dstIdx && i < d.srcIdx) j = i + 1;
      const dx = (j % 3 - i % 3) * d.cellW;
      const dy = (Math.floor(j / 3) - Math.floor(i / 3)) * d.cellH;
      tl.style.transform = (dx || dy) ? `translate(${dx}px,${dy}px)` : '';
    });
  }

  document.addEventListener('touchstart', e => {
    if (!FT._appsSort || drag || e.touches.length > 1) return;
    const tile = e.target.closest('#apps-grid .app-tile');
    if (!tile) return;
    const grid = FT.$opt('apps-grid');
    const tiles = Array.from(grid.querySelectorAll('.app-tile'));
    const srcIdx = tiles.indexOf(tile);
    if (srcIdx < 0) return;
    const tr = tile.getBoundingClientRect();
    const gr = grid.getBoundingClientRect();
    // 命中判定用三等分；「讓位位移」必須用實測步距（含 gap），否則被動移動的磚會偏移未對齊
    const hitW  = gr.width / 3;
    const cellW = tiles.length > 1
      ? tiles[1].getBoundingClientRect().left - tiles[0].getBoundingClientRect().left
      : hitW;
    const cellH = tiles.length > 3
      ? tiles[3].getBoundingClientRect().top - tiles[0].getBoundingClientRect().top
      : tr.height + 14;
    const t0 = e.touches[0];
    const ghost = tile.cloneNode(true);
    ghost.classList.add('app-tile-ghost');
    ghost.classList.remove('drag-src');
    ghost.style.width = tr.width + 'px';
    ghost.style.height = tr.height + 'px';
    ghost.style.left = tr.left + 'px';
    ghost.style.top = tr.top + 'px';
    document.body.appendChild(ghost);
    tile.classList.add('drag-src');
    grid.classList.add('dragging');
    drag = { srcIdx, dstIdx: srcIdx, order: FT.orderedApps().map(a => a.id),
             tiles, ghost, gx: t0.clientX - tr.left, gy: t0.clientY - tr.top,
             cellW, cellH, hitW, grid };
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!drag) return;
    e.preventDefault();   // 拖曳中鎖頁面捲動
    const t0 = e.touches[0];
    drag.ghost.style.left = (t0.clientX - drag.gx) + 'px';
    drag.ghost.style.top  = (t0.clientY - drag.gy) + 'px';
    const r = drag.grid.getBoundingClientRect();
    const col = Math.min(2, Math.max(0, Math.floor((t0.clientX - r.left) / drag.hitW)));
    const row = Math.max(0, Math.floor((t0.clientY - r.top) / drag.cellH));
    const dst = Math.min(drag.order.length - 1, row * 3 + col);
    if (dst !== drag.dstIdx) { drag.dstIdx = dst; applyShift(drag); }
  }, { passive: false });

  // #4 延伸：排序模式中抑制長按系統選單（複製/分享彈窗）
  document.addEventListener('contextmenu', e => {
    if (FT._appsSort && e.target.closest && e.target.closest('#apps-grid')) e.preventDefault();
  });

  document.addEventListener('touchend',    () => cleanup(true),  { passive: true });
  // #3 鎖屏/來電/系統手勢中止：一律取消拖曳、清除殘影
  document.addEventListener('touchcancel', () => cleanup(false), { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cleanup(false); });
  // 排序模式被關閉時若仍在拖曳，同步清理
  const _origToggle = FT.toggleAppsSort;
  FT.toggleAppsSort = function() { cleanup(false); _origToggle(); };
})();

// ── 書庫頁 (v3.1a)：整版書單——五下拉(排序/進度/評分/完成度/作品狀態) ──
FT._lib = { prog:'', sort:'date-desc', rating:'', comp:'', work:'' };   // 頁內篩選狀態

FT._libSorters = {
  'date-desc':   (a,b) => b.created - a.created,
  'date-asc':    (a,b) => a.created - b.created,
  'rating-desc': (a,b) => (b.rating||0) - (a.rating||0),
  'rating-asc':  (a,b) => (a.rating||0) - (b.rating||0),
};

FT.renderLibrary = function() {
  const wrap = FT.$opt('library-content');
  if (!wrap) return;
  const {escH, escA} = FT;
  const all = Object.values(FT.books);
  if (!all.length) {
    wrap.innerHTML = '<div class="stats-empty">書庫還是空的。<br>點側欄「＋ 新增書評」開始。</div>';
    return;
  }
  const L = FT._lib;
  const progOpts = FT.settings.myProgressOptions || [];
  const workOpts = FT.settings.workStatusOptions || [];
  if (L.prog && !progOpts.includes(L.prog)) L.prog = '';
  if (L.work && !workOpts.includes(L.work)) L.work = '';

  let list = all.filter(b => {
    if (L.prog && b.myProgress !== L.prog) return false;
    if (L.work && b.workStatus !== L.work) return false;
    if (L.rating === 'unrated') { if (b.rating) return false; }
    else if (L.rating && (b.rating|0) !== +L.rating) return false;
    if (L.comp && FT.completionLevel(b) !== L.comp) return false;
    return true;
  }).sort(FT._libSorters[L.sort] || FT._libSorters['date-desc']);

  const sel = (id, opts, cur) =>
    `<select class="lib-select" onchange="FT.libSet('${id}',this.value)">`
    + opts.map(([v,l]) => `<option value="${v}"${v===cur?' selected':''}>${l}</option>`).join('')
    + '</select>';

  const badgeMap = { red: '◆', yellow: '◇' };
  wrap.innerHTML =
      '<div class="lib-controls">'
    +   sel('sort', [['date-desc','最新優先'],['date-asc','最舊優先'],['rating-desc','評分高→低'],['rating-asc','評分低→高']], L.sort)
    +   sel('prog', [['','全部進度']].concat(progOpts.map(p => [p, p])), L.prog)
    +   sel('rating', [['','全部評分'],['5','★★★★★'],['4','★★★★'],['3','★★★'],['2','★★'],['1','★'],['unrated','未評分']], L.rating)
    +   sel('comp', [['','全部完成度'],['ok','✓ 完成'],['yellow','◇ 待補'],['red','◆ 缺漏']], L.comp)
    +   sel('work', [['','全部作品狀態']].concat(workOpts.map(w => [w, w])), L.work)
    + '</div>'
    + `<div class="lib-count">${list.length} 本</div>`
    + list.map(b => {
        const lv = FT.completionLevel(b);
        const badge = lv !== 'ok' ? `<span class="lib-badge badge-${lv === 'red' ? 'r' : 'y'}">${badgeMap[lv]}</span>` : '';
        const tags = (b.tags || []).slice(0, 4).map(id => '#' + FT.tagLabel(id)).join('  ');
        return `<div class="lib-card" onclick="FT.openBook('${escA(b.id)}')">
          <div class="lib-title-row"><div class="lib-title">${escH(b.title || '（無標題）')}</div>${badge}</div>
          <div class="lib-meta">
            ${b.author ? `<span>${escH(b.author)}</span>` : ''}
            ${b.myProgress ? `<span>${escH(b.myProgress)}</span>` : ''}
            ${b.rating ? `<span class="gilt-star">${'★'.repeat(b.rating)}</span>` : ''}
          </div>
          ${tags ? `<div class="lib-tags">${escH(tags)}</div>` : ''}
        </div>`;
      }).join('');
};

FT.libSet = function(key, val) {
  FT._lib[key] = val;
  FT.renderLibrary();
};

// ── 標籤頁 (v3.0b:標籤字典自設定頁獨立) ──
// UI 元素 id 沿用設定頁時期(settings-tag-list 等),管理函式(addTagFromSettings/mergeTags)零改動。
FT.renderTagsPage = function() {
  FT.renderSettingsTagList();
  FT.renderTagMergeSelects();
};

// ── 統計分析頁 (v2.7) ──
// 全部即時由 FT.books 聚合，不動任何資料結構、不寫入伺服器。
FT.renderStats = function() {
  const {escH, escA} = FT;
  const wrap = FT.$opt('stats-content');
  if (!wrap) return;
  const all = Object.values(FT.books);

  if (!all.length) {
    wrap.innerHTML = '<div class="stats-empty">書庫還是空的。<br>新增書評後，這裡會自動生出統計。</div>';
    return;
  }

  // 水平長條列（CSS 繪製，隨主題色與寬度自適應）
  const bar = (label, count, max, cls, click) => {
    const pct = max ? Math.round(count / max * 100) : 0;
    const attr = click ? ` class="stat-bar-row clickable" onclick="${click}"` : ' class="stat-bar-row"';
    return `<div${attr}>`
      + `<div class="stat-bar-label">${label}</div>`
      + `<div class="stat-bar-track"><div class="stat-bar-fill ${cls}" style="width:${pct}%"></div></div>`
      + `<div class="stat-bar-count">${count}</div></div>`;
  };

  // ── 一、總覽 ──
  const progOpts = FT.settings.myProgressOptions || [];
  const progCount = {};
  progOpts.forEach(p => progCount[p] = 0);
  all.forEach(b => { if (b.myProgress && progCount[b.myProgress] !== undefined) progCount[b.myProgress]++; });
  const overview =
    `<div class="stat-card"><div class="stat-num">${all.length}</div><div class="stat-label">收藏</div></div>` +
    progOpts.map(p => `<div class="stat-card"><div class="stat-num">${progCount[p]}</div><div class="stat-label">${escH(p)}</div></div>`).join('');

  // ── 二、評分 ──
  const rc = [0,0,0,0,0,0];
  all.forEach(b => { const r = b.rating|0; if (r>=1 && r<=5) rc[r]++; });
  const ratedN = rc[1]+rc[2]+rc[3]+rc[4]+rc[5];
  const ratedSum = 1*rc[1]+2*rc[2]+3*rc[3]+4*rc[4]+5*rc[5];
  const ratedAvg = ratedN ? (ratedSum/ratedN).toFixed(1) : '—';
  const rMax = Math.max(1, rc[1],rc[2],rc[3],rc[4],rc[5]);
  let ratingRows = '';
  for (let s=5; s>=1; s--) ratingRows += bar('★'.repeat(s), rc[s], rMax, 'gold');

  // ── 三、平台 ──
  const tally = key => {
    const m = {};
    all.forEach(b => {
      let v = b[key];
      if (v == null || v === '') v = '（未填）';
      m[v] = (m[v]||0) + 1;
    });
    return Object.entries(m).sort((a,b) => b[1]-a[1]);
  };
  const platBlock = (title, key) => {
    const rows = tally(key);
    if (!rows.length) return '';
    const mx = rows[0][1] || 1;
    return `<div class="stats-sub">${escH(title)}</div>`
      + rows.map(([name,c]) => bar(escH(name), c, mx, 'green')).join('');
  };

  // ── 四、完成度（v3.7）：三態計數 + 「還缺什麼」明細，與 FT.missingFields 同源 ──
  const compCount = { ok:0, yellow:0, red:0 };
  const missCount = {};
  all.forEach(b => {
    compCount[FT.completionLevel(b)]++;
    const m = FT.missingFields(b);
    [...m.hard, ...m.soft].forEach(f => { missCount[f] = (missCount[f]||0) + 1; });
  });
  const compMax  = Math.max(compCount.ok, compCount.yellow, compCount.red, 1);
  const compRows = bar('✓ 完成', compCount.ok, compMax, 'green')
                 + bar('◇ 待補', compCount.yellow, compMax, 'gold')
                 + bar('◆ 缺漏', compCount.red, compMax, 'tag');
  // 明細依 MISSING_LABELS 固定順序（與表單欄位順序一致），只列真的有缺的
  const missRows = FT.MISSING_LABELS.filter(f => missCount[f])
                     .map(f => bar(escH(f), missCount[f], all.length || 1, 'tag')).join('');

  // ── 五、Tag（TOP 20，點擊直接篩選）──
  const tagCount = {};
  all.forEach(b => (b.tags||[]).filter(t => t != null).forEach(id => { tagCount[id] = (tagCount[id]||0)+1; }));
  const topTags = Object.entries(tagCount).sort((a,b) => b[1]-a[1]).slice(0, 20);
  const tMax = topTags.length ? topTags[0][1] : 1;
  const tagRows = topTags.length
    ? topTags.map(([id,c]) => {
        const t = FT.tagById(id);
        const lbl = '#' + (t ? (t.group ? t.group + '·' + t.label : t.label) : id);
        return bar(escH(lbl), c, tMax, 'tag', `FT.statsFilterTag('${escA(id)}')`);
      }).join('')
    : '<div class="stats-caption">尚無標籤</div>';

  wrap.innerHTML =
      `<div class="stats-sec"><div class="stats-sec-title">${FT.icon('library')} 總覽</div>`
    +   `<div class="stats-grid">${overview}</div></div>`
    + `<div class="stats-sec"><div class="stats-sec-title"><span class="gilt-star">★</span> 評分分佈</div>`
    +   `<div class="stats-caption">已評分 ${ratedN} 本 · 平均 ${ratedAvg}★</div>${ratingRows}</div>`
    + `<div class="stats-sec"><div class="stats-sec-title">${FT.icon('refresh')} 連載狀態</div>`
    +   platBlock('作品狀態', 'workStatus')
    +   platBlock('聽書狀態', 'audioStatus') + `</div>`
    + `<div class="stats-sec"><div class="stats-sec-title">${FT.icon('device')} 平台</div>`
    +   platBlock('小說平台', 'textPlatform')
    +   platBlock('有聲平台', 'audioPlatform') + `</div>`
    + `<div class="stats-sec"><div class="stats-sec-title">${FT.icon('check')} 完成度</div>`
    +   compRows
    +   (missRows ? `<div class="stats-sub">還缺什麼</div>${missRows}` : '<div class="stats-caption">全部書評都填滿了。</div>')
    +   `</div>`
    + `<div class="stats-sec"><div class="stats-sec-title">${FT.icon('tag')} 熱門標籤 TOP 20</div>`
    +   `<div class="stats-caption">點一下直接搜尋該標籤。</div>${tagRows}</div>`;
};

// 從統計頁點標籤 → 回主頁並套用搜尋
FT.statsFilterTag = function(tagId) {
  FT.showPage('home');
  FT.filterByTag(tagId);
  FT.closeSb && FT.closeSb();
};
