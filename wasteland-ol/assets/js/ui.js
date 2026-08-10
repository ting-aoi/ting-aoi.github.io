// ═══════════════════════════════════════════════════════
// ui.js — 導航／側欄／主題／更新日誌／強制更新（碰 DOM）
// 扁平兩層導航：避難所=1，其餘一律=2；任何頁按返回一律回避難所。
// ═══════════════════════════════════════════════════════
'use strict';

var WOL = window.WOL = window.WOL || {};

WOL.PAGES = ['shelter', 'character', 'inventory', 'explore', 'combat', 'save', 'settings', 'changelog'];
// 層級導航（扁平兩層模型）：主頁→任何頁 push 一層，頁與頁之間 replace。
// 歷史深度恆定，不會殘留中間頁，也就不會出現返回迴圈。
WOL.LAYER = { shelter: 1, character: 2, inventory: 2, explore: 2, combat: 2, save: 2, settings: 2, changelog: 2 };
WOL.PAGE_LABEL = {
  shelter: '避難所', character: '角色', inventory: '背包', explore: '探索',
  combat: '戰鬥', save: '存檔', settings: '設定', changelog: '更新日誌'
};

WOL.currentPage = 'shelter';

// 戰鬥中鎖定導航：只能打完或撤退，不能靠切頁脫戰。
WOL.navLocked = function () {
  return !!(WOL.game && WOL.game.combat && !WOL.game.combat.over);
};

WOL.showPage = function (page, fromPop) {
  if (WOL.PAGES.indexOf(page) < 0) page = 'shelter';
  if (WOL.navLocked() && page !== 'combat') {
    WOL.toast('戰鬥中無法離開');
    page = 'combat';
  }
  WOL.closeSb();
  WOL.currentPage = page;

  if (!fromPop) {
    // history.state 在部分環境讀不回來（無頭測試、舊瀏覽器還原時為 null），
    // 只靠它判層會讓每次切頁都變成 push，返回鍵得按很多下才出得去。
    // 因此另存一份 _histPage 當備援事實來源。
    var st = { page: page };
    var cur = history.state || (WOL._histPage ? { page: WOL._histPage } : null);
    if (!(cur && cur.page === page)) {
      var curLayer = (cur && WOL.LAYER[cur.page]) || 1;
      var newLayer = WOL.LAYER[page] || 1;
      if (newLayer > curLayer) history.pushState(st, '', '#' + page);
      else                     history.replaceState(st, '', '#' + page);
    }
    WOL._histPage = page;
  }

  WOL.PAGES.forEach(function (p) {
    WOL.$(p + '-page').classList.toggle('active', p === page);
    var sb = WOL.$opt(p + '-sb-btn');
    if (sb) sb.classList.toggle('active', p === page);
  });
  ['shelter', 'explore', 'settings'].forEach(function (p) {
    var b = WOL.$opt(p + '-btn');
    if (b) b.classList.toggle('active', p === page);
  });
  WOL.$('stat-note').textContent = WOL.PAGE_LABEL[page] || '';

  if (page === 'shelter')   WOL.renderShelter();
  if (page === 'character') WOL.renderCharacter();
  if (page === 'inventory') WOL.renderInventory();
  if (page === 'explore')   WOL.renderExplore();
  if (page === 'combat')    WOL.renderCombat();
  if (page === 'save')      WOL.renderSave();
  if (page === 'settings')  WOL.renderSettings();
  if (page === 'changelog') WOL.renderChangelog();
};

// ── 側欄 ──
WOL.openSb = function () {
  WOL.$('sidebar').classList.add('open');
  WOL.$('overlay').classList.add('on');
};
WOL.closeSb = function () {
  WOL.$('sidebar').classList.remove('open');
  WOL.$('overlay').classList.remove('on');
};
WOL.toggleSb = function () {
  var sb = WOL.$('sidebar');
  if (sb.classList.contains('open')) WOL.closeSb(); else WOL.openSb();
};

// ── 主題 ──
WOL.applyNight = function (on) {
  document.body.classList.toggle('night', !!on);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', on ? '#0e1012' : '#2a2823');
  var sw = WOL.$opt('sw-night');
  if (sw) sw.classList.toggle('on', !!on);
};
WOL.toggleNight = function () {
  var on = !document.body.classList.contains('night');
  WOL.applyNight(on);
  try { localStorage.setItem('wol_night', on ? '1' : '0'); } catch (e) {}
};

// ── 設定頁區塊摺疊 ──
WOL.toggleSec = function (id) {
  var el = WOL.$opt(id);
  if (el) el.classList.toggle('open');
};

// ── 強制更新：註銷 SW → 清快取 → 重新載入 ──
WOL.forceUpdate = async function (skipConfirm) {
  if (!skipConfirm && !confirm('強制更新會清除快取並重新載入，確定嗎？')) return;
  try {
    if (navigator.serviceWorker) {
      var regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(function (r) { return r.unregister(); }));
    }
    if (window.caches) {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }
  } catch (e) {}
  // 導向不含 hash 的網址，避免 #update 再次觸發造成重載迴圈
  location.replace(location.pathname + '?fresh=' + Date.now());
};

// ══════ 更新日誌（兩層分組 + 惰性渲染，結構與雙葉一致）══════
// 第一層：大版本（v0、v1…）。當前大版本的小版本系列直接平鋪；
//         舊大版本整個包成「vN 系列」大分組（摺疊）。
// 第二層：小版本系列（v0.1～v0.1b 為一組）。最新系列預設展開。
// 所有摺疊內容一律惰性渲染：第一次展開前不產生 DOM。
WOL._clReg = null;
WOL._clFetched = false;

WOL._clEntryHtml = function (e) {
  return '<div class="changelog-ver">'
    + '<div class="changelog-ver-header">'
    + '<span class="changelog-ver-num">' + WOL.escH(e.version) + '</span>'
    + '<span class="changelog-ver-date">' + WOL.escH(e.date) + '</span>'
    + '</div>'
    + '<ul class="changelog-list">'
    + (e.items || []).map(function (it) { return '<li>' + WOL.escH(it) + '</li>'; }).join('')
    + '</ul></div>';
};

WOL._clGroupShell = function (key, title, meta, bodyHtml, open, big) {
  return '<div class="cl-group' + (big ? ' cl-group-big' : '') + '">'
    + '<button class="cl-group-head" onclick="WOL.toggleClGroup(\'' + key + '\')">'
    + '<span class="cl-group-arrow" id="cl-arrow-' + key + '">' + (open ? '▾' : '▸') + '</span>'
    + '<span class="cl-group-title">' + WOL.escH(title) + '</span>'
    + '<span class="cl-group-meta">' + WOL.escH(meta) + '</span>'
    + '</button>'
    + '<div class="cl-group-body' + (open ? ' open' : '') + '" id="cl-body-' + key + '">'
    + (open ? bodyHtml : '') + '</div></div>';
};

WOL._clMinorShell = function (g, open) {
  var nItems = g.entries.reduce(function (s, e) { return s + (e.items || []).length; }, 0);
  var body = open ? g.entries.map(WOL._clEntryHtml).join('') : '';
  return WOL._clGroupShell(g.key, g.base + ' 系列', g.entries.length + ' 個版本 · ' + nItems + ' 項', body, open, false);
};

WOL.renderChangelog = async function () {
  var el = WOL.$opt('changelog-content');
  if (!el) return;
  if (WOL._clFetched) return;      // 惰性：同一次執行期只抓一次
  try {
    var r = await fetch('./assets/changelog.json', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
    if (!r.ok) throw new Error('fetch failed');
    var entries = await r.json();
    WOL._clFetched = true;
    if (!entries.length) { el.innerHTML = '<div class="muted">尚無更新紀錄。</div>'; return; }

    var reg = {}, majors = [], byMajor = {};
    entries.forEach(function (e) {
      var base = String(e.version).replace(/[a-z]$/, '');   // v0.1b → v0.1
      var major = base.split('.')[0];                        // v0.1  → v0
      if (!byMajor[major]) { byMajor[major] = { major: major, minors: [], byBase: {} }; majors.push(byMajor[major]); }
      var M = byMajor[major];
      if (!M.byBase[base]) {
        var g = { key: base.replace(/\./g, '-'), base: base, entries: [] };
        M.byBase[base] = g; M.minors.push(g);
      }
      M.byBase[base].entries.push(e);
    });

    var html = '';
    majors.forEach(function (M, mi) {
      M.minors.forEach(function (g) { reg[g.key] = { kind: 'minor', g: g }; });
      if (mi === 0) {
        html += M.minors.map(function (g, gi) { return WOL._clMinorShell(g, gi === 0); }).join('');
      } else {
        var mKey = 'M' + M.major.replace(/\./g, '-');
        reg[mKey] = { kind: 'major', M: M };
        var nVer = M.minors.reduce(function (s, g) { return s + g.entries.length; }, 0);
        var nItm = M.minors.reduce(function (s, g) {
          return s + g.entries.reduce(function (x, e) { return x + (e.items || []).length; }, 0);
        }, 0);
        html += WOL._clGroupShell(mKey, M.major + ' 系列', nVer + ' 個版本 · ' + nItm + ' 項', '', false, true);
      }
    });
    WOL._clReg = reg;
    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = '<div class="muted">無法載入更新日誌。</div>';
  }
};

WOL.toggleClGroup = function (key) {
  var body = WOL.$opt('cl-body-' + key);
  var arrow = WOL.$opt('cl-arrow-' + key);
  var node = WOL._clReg && WOL._clReg[key];
  if (!body || !node) return;
  var open = body.classList.contains('open');
  if (!open && !body.innerHTML) {
    // 惰性渲染：第一次展開才產生內容
    if (node.kind === 'minor') body.innerHTML = node.g.entries.map(WOL._clEntryHtml).join('');
    else body.innerHTML = node.M.minors.map(function (g) { return WOL._clMinorShell(g, false); }).join('');
  }
  body.classList.toggle('open', !open);
  if (arrow) arrow.textContent = open ? '▸' : '▾';
};
