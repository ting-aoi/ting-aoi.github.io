// ═══════════════════════════════════════════════════════
// pages.js — 各頁渲染與玩家操作（碰 DOM）
// 所有數值一律經 WOL.state.derived 取得，不在此層自算。
// ═══════════════════════════════════════════════════════
'use strict';

var WOL = window.WOL = window.WOL || {};

WOL.cfgs = function () { return WOL.content.cfgs(); };

// 時段一律以圖示呈現（不用「早／中／晚」國字）。label 降級為無障礙名稱掛在
// title/aria-label 上，讀螢幕的人仍讀得到。圖示名由 rules.survival.json 決定。
WOL.phaseMark = function (id, cfg) {
  var label = WOL.time.phaseLabel(id, cfg);
  return '<span class="phase-mark" title="' + WOL.escH(label) + '" aria-label="' + WOL.escH(label) + '">'
    + WOL.icon(WOL.time.phaseIcon(id, cfg)) + '</span>';
};

function meter(kind, iconName, label, cur, max, low) {
  var pct = max > 0 ? Math.max(0, Math.min(100, Math.round(cur / max * 100))) : 0;
  return '<div class="meter meter-' + kind + (low ? ' meter-low' : '') + '">'
    + '<div class="meter-head">' + WOL.icon(iconName) + ' ' + WOL.escH(label)
    + '<span class="meter-val">' + cur + ' / ' + max + '</span></div>'
    + '<div class="meter-bar"><div class="meter-fill" style="width:' + pct + '%"></div></div></div>';
}

WOL.vitalsHtml = function (compact) {
  var g = WOL.game, c = WOL.cfgs();
  var d = WOL.state.derived(g, c);
  var sur = c.survival || {};
  var maxFood = Math.abs((sur.overnight && sur.overnight.food) || 1) * 5;
  var maxWater = Math.abs((sur.overnight && sur.overnight.water) || 1) * 5;
  return meter('hp', 'heart', '生命', g.hp, d.hpMax, g.hp <= d.hpMax * 0.25)
    + meter('st', 'bolt', '體力', g.st, d.stMax, g.st <= d.stMax * 0.2)
    + (compact ? '' :
        meter('food', 'meat', '食物', g.food, Math.max(g.food, maxFood), g.food === 0)
      + meter('water', 'drop', '水', g.water, Math.max(g.water, maxWater), g.water === 0));
};

WOL.renderSidebar = function () {
  var el = WOL.$opt('sb-vitals');
  if (!el || !WOL.game) return;
  el.innerHTML = '<div style="color:rgba(232,224,209,0.85)">'
    + '<div class="readout" style="font-size:11px;letter-spacing:1px;color:rgba(232,224,209,0.45);margin-bottom:8px">'
    + '第 ' + WOL.game.day + ' 天 · ' + WOL.phaseMark(WOL.game.phase, WOL.cfgs().survival)
    + ' · AP ' + WOL.game.ap + '</div>'
    + WOL.vitalsHtml(true) + '</div>';
  document.body.classList.toggle('in-combat', WOL.navLocked());
  WOL.PAGES.forEach(function (p) {
    var b = WOL.$opt(p + '-sb-btn');
    if (b) b.disabled = WOL.navLocked() && p !== 'combat';
  });
};

// ── 避難所 ──
WOL.renderShelter = function () {
  var g = WOL.game, c = WOL.cfgs(), sur = c.survival || {};
  var apMax = WOL.time.apOf(g.phase, sur);
  var dots = '';
  for (var i = 0; i < apMax; i++) dots += '<span class="ap-dot' + (i < g.ap ? ' on' : '') + '"></span>';

  WOL.$('clock').innerHTML =
      '<div class="clock-cell"><div class="clock-label">天數</div><div class="stat-num">' + g.day + '</div></div>'
    + '<div class="clock-cell"><div class="clock-label">時段</div><div class="stat-num">'
        + WOL.phaseMark(g.phase, sur) + '</div></div>'
    + '<div class="clock-cell"><div class="clock-label">行動點</div><div class="stat-num">' + g.ap + '</div>'
        + '<div class="ap-dots">' + dots + '</div></div>';

  var labels = WOL.rules.debuffLabels(g.debuffs, sur);
  WOL.$('debuff-row').innerHTML = labels.map(function (l) {
    return '<span class="debuff">' + WOL.icon('alert') + ' ' + WOL.escH(l) + '</span>';
  }).join('');

  WOL.$('shelter-meters').innerHTML = WOL.vitalsHtml(false);
  WOL.$('shelter-log').innerHTML = (g.log || []).length
    ? g.log.map(function (l) {
        return '<div class="log-line ' + WOL.escH(l.k) + '"><span class="tag">D' + l.day + '</span>'
          + WOL.escH(l.t) + '</div>';
      }).join('')
    : '<div class="muted">還沒有任何紀錄。</div>';

  WOL.$('content-warning').innerHTML = WOL.content.isEmpty()
    ? '<div class="empty-note" style="margin-bottom:14px"><b>' + WOL.icon('alert') + ' 內容資料未載入</b>'
      + '怪物、道具與地點表目前是空的，探索與戰鬥還無法進行。<br>'
      + '把資料填進 <code>assets/data/</code> 之後即可開始遊玩。</div>'
    : '';
};

WOL.advanceTime = function () {
  var g = WOL.game, c = WOL.cfgs();
  if (WOL.navLocked()) { WOL.toast('戰鬥中無法推進時間'); return; }
  if (g.trip) { WOL.toast('探索還沒結束'); return; }
  var res = WOL.time.advance(g, c);
  if (res.crossedDay) {
    var r = res.report;
    WOL.state.pushLog(g, '過夜：食物 −' + r.foodSpent + '、水 −' + r.waterSpent + '。', r.healthy ? 'good' : 'bad');
    if (r.hunger) WOL.state.pushLog(g, '飢餓啃著你的胃。', 'bad');
    if (r.thirst) WOL.state.pushLog(g, '喉嚨乾得發疼。', 'bad');
    if (r.hpMaxLossPct) WOL.state.pushLog(g, '長期匱乏讓體格衰退（生命上限 −' + r.hpMaxLossPct + '%）。', 'bad');
  } else {
    // 日誌是散文，塞圖示很怪；語句寫在 rules.survival.json 的 phases[].log
    WOL.state.pushLog(g, WOL.time.phaseLog(g.phase, c.survival), '');
  }
  WOL.saveLocal(g);
  WOL.showSaved(true);
  WOL.renderShelter();
  WOL.renderSidebar();
};

// ── 角色 ──
WOL.renderCharacter = function () {
  var g = WOL.game, c = WOL.cfgs();
  var attrCfg = c.attributes || {};
  var specs = attrCfg.attributes || {};
  WOL.$('attr-grid').innerHTML = Object.keys(specs).map(function (k) {
    return '<div class="attr-cell"><div class="attr-code">' + k.toUpperCase() + '</div>'
      + '<div class="attr-val">' + (g.attrs[k] || 0) + '</div>'
      + '<div class="attr-name">' + WOL.escH(specs[k].label || k) + '</div></div>';
  }).join('');

  var clean = WOL.rules.derive(g.attrs, attrCfg, {});
  var now = WOL.state.derived(g, c);
  var dspec = attrCfg.derived || {};
  WOL.$('derived-grid').innerHTML = Object.keys(dspec).map(function (k) {
    var down = now[k] < clean[k];
    return '<div class="derived-cell' + (down ? ' down' : '') + '">'
      + WOL.escH(dspec[k].label || k)
      + '<b>' + now[k] + (dspec[k].unit || '') + '</b></div>';
  }).join('');

  var pen = WOL.rules.penaltyPct(g.debuffs, c.survival);
  var notes = [];
  if (pen) notes.push('飢渴 debuff 生效中，屬性衍生值 −' + pen + '%（整數百分比疊加）。');
  if (g.hpMaxLossPct) notes.push('長期匱乏累積：生命上限 −' + g.hpMaxLossPct + '%。');
  WOL.$('derived-note').textContent = notes.join(' ');
};

// ── 背包 ──
WOL.renderInventory = function () {
  var g = WOL.game;
  var ids = Object.keys(g.inventory || {});
  if (!ids.length) {
    WOL.$('inv-list').innerHTML = '<div class="empty-note"><b>背包是空的</b>出門探索撿點東西回來吧。</div>';
    return;
  }
  WOL.$('inv-list').innerHTML = ids.map(function (id) {
    var it = WOL.content.byId('items', id);
    return '<div class="inv-row">' + WOL.icon('pack')
      + '<span class="inv-name">' + WOL.escH(it ? it.name : id) + '</span>'
      + (it && it.kind ? '<span class="inv-kind">' + WOL.escH(it.kind) + '</span>' : '')
      + '<span class="inv-count">×' + g.inventory[id] + '</span></div>';
  }).join('');
};

// ── 探索 ──
WOL.renderExplore = function () {
  var g = WOL.game;
  var locs = WOL.content.rows('locations');
  var trip = g.trip;

  WOL.$('trip-panel').innerHTML = trip
    ? '<div class="trip-bar">' + WOL.icon('compass')
      + '<span>探索中：' + WOL.escH((WOL.content.byId('locations', trip.locId) || {}).name || trip.locId) + '</span>'
      + '<span style="margin-left:auto">剩餘行動 <b>' + trip.remaining + '</b></span></div>'
      + '<div class="btn-row" style="margin-bottom:14px">'
      + '<button class="btn btn-pri" onclick="WOL.stepTrip()"' + (trip.remaining <= 0 ? ' disabled' : '') + '>前進一步</button>'
      + '<button class="btn" onclick="WOL.endTrip()">收工回避難所</button></div>'
    : '';

  if (!locs.length) {
    WOL.$('loc-list').innerHTML = '<div class="empty-note"><b>' + WOL.icon('alert') + ' 內容資料未載入</b>'
      + '<code>assets/data/locations.json</code> 目前沒有任何地點。<br>填入地點表後這裡就會列出可去的地方。</div>';
    return;
  }
  WOL.$('loc-list').innerHTML = locs.map(function (l) {
    var cost = WOL.explore.locationCost(l);
    var can = !trip && !WOL.navLocked() && g.ap >= cost;
    return '<div class="loc-card"><div class="loc-name">' + WOL.escH(l.name) + '</div>'
      + '<div class="loc-meta">' + (l.actions || 0) + ' 次行動 · 消耗 ' + cost + ' AP'
      + (l.desc ? ' · ' + WOL.escH(l.desc) : '') + '</div>'
      + '<button class="btn btn-pri" onclick="WOL.beginTrip(\'' + WOL.escH(l.id) + '\')"'
      + (can ? '' : ' disabled') + '>出發</button></div>';
  }).join('');
};

WOL.beginTrip = function (locId) {
  var g = WOL.game, loc = WOL.content.byId('locations', locId);
  if (!loc) return;
  var res = WOL.explore.begin(g, loc, WOL.cfgs());
  if (!res.ok) {
    WOL.toast(res.reason === 'no_ap' ? '行動點不足（需要 ' + res.cost + ' AP）' : '現在不能出發');
    return;
  }
  WOL.state.pushLog(g, '前往' + loc.name + '（−' + res.cost + ' AP）。', '');
  WOL.saveLocal(g);
  WOL.renderExplore();
  WOL.renderSidebar();
};

WOL.stepTrip = function () {
  var g = WOL.game;
  if (!g.trip) return;
  var loc = WOL.content.byId('locations', g.trip.locId) || {};
  var ev = WOL.explore.step(g, loc);
  if (ev.type === 'encounter') {
    var m = WOL.content.byId('monsters', ev.monsterId);
    if (!m) {
      WOL.state.pushLog(g, '遠處有動靜，但什麼也沒出現。', '');
    } else {
      WOL.combat.start(g, m, WOL.cfgs());
      WOL.state.pushLog(g, '遭遇' + m.name + '！', 'bad');
      WOL.saveLocal(g);
      WOL.showPage('combat');
      WOL.renderSidebar();
      return;
    }
  } else if (ev.type === 'scavenge') {
    var it = WOL.content.byId('items', ev.itemId);
    WOL.state.pushLog(g, '撿到 ' + ((it && it.name) || ev.itemId) + ' ×' + ev.count + '。', 'good');
  } else if (ev.type === 'nothing') {
    WOL.state.pushLog(g, '一無所獲。', '');
  } else if (ev.type === 'done') {
    WOL.toast('這趟已經走完了');
  }
  WOL.saveLocal(g);
  WOL.renderExplore();
  WOL.renderSidebar();
};

WOL.endTrip = function () {
  WOL.explore.end(WOL.game);
  WOL.state.pushLog(WOL.game, '你回到避難所。', '');
  WOL.saveLocal(WOL.game);
  WOL.showPage('shelter');
  WOL.renderSidebar();
};

// ── 戰鬥 ──
WOL.renderCombat = function () {
  var g = WOL.game, c = WOL.cfgs();
  var cb = g.combat;
  WOL.$('turn-badge').textContent = cb ? '第 ' + cb.turn + ' 回合' : '';
  if (!cb) {
    WOL.$('combat-body').innerHTML = '<div class="empty-note"><b>目前不在戰鬥中</b>'
      + '從探索遇上敵人時會自動進到這裡。</div>';
    return;
  }
  var d = WOL.state.derived(g, c);
  var e = cb.enemy;
  var combatCfg = c.combat || {};
  var acts = combatCfg.actions || {};
  var retreatPct = WOL.combat.retreatChance(d.spd, e.spd, combatCfg);
  var over = cb.over;

  WOL.$('combat-body').innerHTML =
      '<div class="combat-stage">'
    +   '<div class="enemy-card"><div class="enemy-name">' + WOL.escH(e.name) + '</div>'
    +     '<div class="muted" style="margin-bottom:8px">ATK ' + e.atk + ' · DEF ' + e.def + ' · SPD ' + e.spd + '</div>'
    +     meter('hp', 'heart', '敵方生命', e.hp, e.hpMax, false)
    +   '</div>'
    +   '<div class="card"><div class="card-title">' + WOL.icon('person') + ' 你</div>' + WOL.vitalsHtml(true) + '</div>'
    + '</div>'
    + (over ? '' :
        '<div class="combat-acts">'
      + '<button class="act-btn" onclick="WOL.combatAct(\'attack\')"><b>攻擊</b><span>耗體力 '
          + ((acts.attack && acts.attack.staminaCost) || 0) + '</span></button>'
      + '<button class="act-btn" onclick="WOL.combatAct(\'guard\')"><b>戒備</b><span>受傷降至 '
          + ((acts.guard && acts.guard.damageTakenPct) || 100) + '%</span></button>'
      + '<button class="act-btn" onclick="WOL.combatAct(\'rest\')"><b>喘息</b><span>無防禦，回體力 '
          + ((acts.rest && acts.rest.staminaRecover) || 0) + '</span></button>'
      + '<button class="act-btn" onclick="WOL.combatAct(\'retreat\')"><b>撤退</b><span>成功率 '
          + retreatPct + '%</span></button>'
      + '</div>')
    + (over ? '<div class="btn-row" style="margin-top:12px"><button class="btn btn-pri" onclick="WOL.combatFinish()">'
        + (cb.result === 'win' ? '收拾戰利品' : '離開') + '</button></div>' : '')
    + '<div class="sec-title">戰鬥紀錄</div>'
    + '<div class="log-box">' + ((cb.log || []).length
        ? cb.log.map(function (l) { return '<div class="log-line">' + WOL.escH(l) + '</div>'; }).join('')
        : '<div class="muted">等待你的動作。</div>') + '</div>';
};

WOL.combatAct = function (action) {
  var g = WOL.game;
  if (!g.combat || g.combat.over) return;
  WOL.combat.act(g, action, WOL.cfgs());
  WOL.saveLocal(g);
  WOL.renderCombat();
  WOL.renderSidebar();
};

WOL.combatFinish = function () {
  var g = WOL.game;
  var res = WOL.combat.finish(g);
  if (!res) return;
  if (res.result === 'win') {
    WOL.state.pushLog(g, '戰鬥勝利。', 'good');
    res.gained.forEach(function (x) {
      var it = WOL.content.byId('items', x.itemId);
      WOL.state.pushLog(g, '取得 ' + ((it && it.name) || x.itemId) + ' ×' + x.count + '。', 'good');
    });
  } else if (res.result === 'fled') {
    WOL.state.pushLog(g, '你逃離了戰鬥。', '');
  } else {
    WOL.state.pushLog(g, '你敗下陣來，被拖回避難所。', 'bad');
  }
  WOL.saveLocal(g);
  document.body.classList.remove('in-combat');
  WOL.showPage(res.result === 'lose' ? 'shelter' : (g.trip ? 'explore' : 'shelter'));
  WOL.renderSidebar();
};

// ── 存檔 ──
WOL.renderSave = function () {
  var g = WOL.game;
  WOL.$('save-info').innerHTML = '存檔格式 v' + WOL.state.SAVE_VERSION
    + ' · 儲存位置：本機瀏覽器（' + WOL.escH(WOL.LS_KEY) + '）<br>'
    + '目前進度：第 ' + g.day + ' 天 · ' + WOL.phaseMark(g.phase, WOL.cfgs().survival);
  var card = WOL.$opt('server-card');
  if (card) card.style.display = WOL.isStatic() ? 'none' : '';
};

// ── 設定 ──
WOL.renderSettings = function () {
  WOL.$('build-info').textContent = '版本 ' + WOL.VERSION + ' · BUILD ' + WOL.BUILD;
  var errs = WOL.content.errors || [];
  var rows = WOL.content.FILES.map(function (s) {
    var n = s.kind === 'table' ? WOL.content.rows(s.key).length : null;
    return '<div class="set-row">' + WOL.escH(s.file) + '<span class="spacer"></span>'
      + (n === null ? '規則' : n + ' 筆') + '</div>';
  }).join('');
  WOL.$('content-status').innerHTML = rows
    + (errs.length
        ? '<div class="empty-note" style="margin-top:10px;text-align:left"><b>資料有問題</b>'
          + errs.map(WOL.escH).join('<br>') + '</div>'
        : '<div class="muted" style="margin-top:10px">資料檔驗證通過。</div>');
};
