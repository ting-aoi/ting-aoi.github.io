// ═══════════════════════════════════════════════════════
// rules.js — 屬性與衍生數值（零 DOM，Node 可直接 require）
// 所有係數來自 assets/data/rules.attributes.json，本檔不寫死任何數值。
// ═══════════════════════════════════════════════════════
(function (root) {
  'use strict';
  var WOL = root.WOL = root.WOL || {};
  var R = WOL.rules = {};

  R.clamp = function (v, lo, hi) {
    if (lo != null && v < lo) v = lo;
    if (hi != null && v > hi) v = hi;
    return v;
  };

  // 整數百分比削減。飢渴 debuff 必須先把百分比「相加」再一次套用，
  // 不得逐項浮點連乘——連乘會累積誤差，是明列的鎖定決策。
  R.applyPenalty = function (value, pct) {
    pct = R.clamp(Math.round(pct || 0), 0, 100);
    return Math.floor(value * (100 - pct) / 100);
  };

  function roundBy(mode, v) {
    if (mode === 'ceil') return Math.ceil(v);
    if (mode === 'round') return Math.round(v);
    return Math.floor(v);
  }

  // attrs: { str, agi, con, per, int }
  // cfg:   rules.attributes.json
  // opts:  { penaltyPct:0, hpMaxLossPct:0 }
  R.derive = function (attrs, cfg, opts) {
    attrs = attrs || {};
    opts = opts || {};
    var out = {};
    var spec = (cfg && cfg.derived) || {};
    var debuffed = (cfg && cfg._debuffApplies) || [];
    var penalty = opts.penaltyPct || 0;

    Object.keys(spec).forEach(function (key) {
      var d = spec[key];
      var v = d.base || 0;
      var per = d.per || {};
      Object.keys(per).forEach(function (a) {
        v += (attrs[a] || 0) * per[a];
      });
      v = roundBy(d.round, v);
      if (debuffed.indexOf(key) >= 0 && penalty > 0) v = R.applyPenalty(v, penalty);
      out[key] = R.clamp(v, d.min, d.max);
    });

    // hpMax 不吃屬性 debuff 百分比，改吃「累積上限削減」——兩者是不同機制，
    // 疊在一起會讓餓一天就掉半條命。
    if (out.hpMax != null && opts.hpMaxLossPct) {
      var lossFloor = (spec.hpMax && spec.hpMax.min) || 1;
      out.hpMax = Math.max(lossFloor, R.applyPenalty(out.hpMax, opts.hpMaxLossPct));
    }
    return out;
  };

  // 生效中的 debuff → 總削減百分比（整數相加）
  R.penaltyPct = function (flags, survivalCfg) {
    var d = (survivalCfg && survivalCfg.debuffs) || {};
    var sum = 0;
    Object.keys(d).forEach(function (k) {
      if (flags && flags[k]) sum += Math.round(d[k].attrPenaltyPct || 0);
    });
    return R.clamp(sum, 0, 100);
  };

  R.debuffLabels = function (flags, survivalCfg) {
    var d = (survivalCfg && survivalCfg.debuffs) || {};
    return Object.keys(d).filter(function (k) { return flags && flags[k]; })
      .map(function (k) { return d[k].label || k; });
  };

  // 先攻判定：SPD 高者先手；同值比 AGI；再同值玩家先手。
  R.playerFirst = function (player, enemy, cfg) {
    var key = (cfg && cfg.initiative && cfg.initiative.key) || 'spd';
    var p = player[key] || 0, e = enemy[key] || 0;
    if (p !== e) return p > e;
    var pa = player.agi || 0, ea = enemy.agi || 0;
    if (pa !== ea) return pa > ea;
    return true;
  };
})(typeof window !== 'undefined' ? window : globalThis);
