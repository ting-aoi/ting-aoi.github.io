// ═══════════════════════════════════════════════════════
// time.js — 天數／時段／AP 與過夜結算（零 DOM，Node 可直接 require）
// 早 2 AP／中 3 AP／晚 1 AP，手動推進；晚→隔日早時結算一次過夜。
// ═══════════════════════════════════════════════════════
(function (root) {
  'use strict';
  var WOL = root.WOL = root.WOL || {};
  var T = WOL.time = {};

  T.phases = function (cfg) { return (cfg && cfg.phases) || []; };

  T.phaseAt = function (id, cfg) {
    var list = T.phases(cfg);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };

  T.phaseIndex = function (id, cfg) {
    var list = T.phases(cfg);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  };

  T.phaseLabel = function (id, cfg) {
    var p = T.phaseAt(id, cfg);
    return p ? p.label : id;
  };

  T.apOf = function (id, cfg) {
    var p = T.phaseAt(id, cfg);
    return p ? (p.ap || 0) : 0;
  };

  // 進入某時段：AP 補到該時段的額度
  T.enterPhase = function (st, id, cfg) {
    st.phase = id;
    st.ap = T.apOf(id, cfg);
    return st.ap;
  };

  T.canSpend = function (st, n) { return (st.ap || 0) >= n; };

  T.spend = function (st, n) {
    if (!T.canSpend(st, n)) return false;
    st.ap -= n;
    return true;
  };

  // 手動推進到下一個時段；若目前是最後一個時段則跨日並結算過夜。
  // 回傳 { crossedDay:bool, report:{...}|null }
  T.advance = function (st, cfgs) {
    var surCfg = (cfgs && cfgs.survival) || {};
    var list = T.phases(surCfg);
    if (!list.length) return { crossedDay: false, report: null };
    var i = T.phaseIndex(st.phase, surCfg);
    if (i < 0) i = 0;
    if (i < list.length - 1) {
      T.enterPhase(st, list[i + 1].id, surCfg);
      return { crossedDay: false, report: null };
    }
    st.day += 1;
    T.enterPhase(st, list[0].id, surCfg);
    return { crossedDay: true, report: T.overnight(st, cfgs) };
  };

  // 過夜結算：扣食物與水 → 判定飢渴 debuff → 累積生命上限削減 → 回復
  T.overnight = function (st, cfgs) {
    var surCfg = (cfgs && cfgs.survival) || {};
    var ov = surCfg.overnight || {};
    var debuffCfg = surCfg.debuffs || {};
    var rest = surCfg.restore || {};

    var foodBefore = st.food, waterBefore = st.water;
    st.food = Math.max(0, st.food + (ov.food || 0));
    st.water = Math.max(0, st.water + (ov.water || 0));

    st.debuffs = st.debuffs || {};
    st.debuffs.hunger = st.food === 0;
    st.debuffs.thirst = st.water === 0;

    // 生命上限累積削減：每個生效中的 debuff 每天各加一份，夾在 cap
    var loss = 0;
    Object.keys(debuffCfg).forEach(function (k) {
      if (st.debuffs[k]) loss += Math.round(debuffCfg[k].hpMaxLossPctPerDay || 0);
    });
    var cap = Math.round(surCfg.hpMaxLossCapPct || 0);
    if (loss > 0) st.hpMaxLossPct = Math.min(cap, (st.hpMaxLossPct || 0) + loss);

    // 回復：吃飽喝足才回血，體力一律睡飽（仍夾在上限）
    var healthy = !st.debuffs.hunger && !st.debuffs.thirst;
    if (healthy) st.hp += (rest.hpPerNight || 0);
    st.st += (rest.stPerNight || 0);
    var d = WOL.state.clampVitals(st, cfgs);

    return {
      foodSpent: foodBefore - st.food,
      waterSpent: waterBefore - st.water,
      hunger: !!st.debuffs.hunger,
      thirst: !!st.debuffs.thirst,
      hpMaxLossPct: st.hpMaxLossPct || 0,
      hpMax: d.hpMax,
      healthy: healthy
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
