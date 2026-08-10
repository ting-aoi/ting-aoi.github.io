// ═══════════════════════════════════════════════════════
// explore.js — 探索（零 DOM，Node 可直接 require）
// 1 AP = 2 次行動，零頭無條件進位（4 次=2AP、5 次=3AP）。
// ═══════════════════════════════════════════════════════
(function (root) {
  'use strict';
  var WOL = root.WOL = root.WOL || {};
  var E = WOL.explore = {};

  E.ACTIONS_PER_AP = 2;

  // 零頭無條件進位——這是明列的規格，不得改成四捨五入。
  E.apCost = function (actions) {
    return Math.ceil(Math.max(0, actions || 0) / E.ACTIONS_PER_AP);
  };

  E.locationCost = function (loc) { return E.apCost(loc && loc.actions); };

  E.pick = function (list, rng) {
    if (!list || !list.length) return null;
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += (list[i].weight || 1);
    var r = (rng || Math.random)() * total;
    for (i = 0; i < list.length; i++) {
      r -= (list[i].weight || 1);
      if (r < 0) return list[i];
    }
    return list[list.length - 1];
  };

  E.randInt = function (min, max, rng) {
    min = min || 0; max = max == null ? min : max;
    return min + Math.floor((rng || Math.random)() * (max - min + 1));
  };

  // 出發：先付清整趟的 AP，再把行動次數掛上狀態
  E.begin = function (st, loc, cfgs) {
    if (st.combat) return { ok: false, reason: 'in_combat' };
    if (st.trip) return { ok: false, reason: 'in_trip' };
    var cost = E.locationCost(loc);
    if (!WOL.time.spend(st, cost)) return { ok: false, reason: 'no_ap', cost: cost };
    st.trip = { locId: loc.id, remaining: loc.actions || 0, apPaid: cost };
    return { ok: true, cost: cost, remaining: st.trip.remaining };
  };

  // 解一次行動：回傳遭遇或拾荒結果。戰鬥中不得推進。
  E.step = function (st, loc, rng) {
    if (!st.trip || st.trip.remaining <= 0) return { type: 'done' };
    if (st.combat) return { type: 'blocked' };
    st.trip.remaining -= 1;

    var chance = loc.encounterChance || 0;
    var roll = (rng || Math.random)() * 100;
    if (roll < chance && loc.encounters && loc.encounters.length) {
      var e = E.pick(loc.encounters, rng);
      return { type: 'encounter', monsterId: e && e.monsterId, remaining: st.trip.remaining };
    }
    if (loc.scavenge && loc.scavenge.length) {
      var s = E.pick(loc.scavenge, rng);
      if (s) {
        var n = E.randInt(s.min, s.max, rng);
        if (n > 0) WOL.state.addItem(st, s.itemId, n);
        return { type: 'scavenge', itemId: s.itemId, count: n, remaining: st.trip.remaining };
      }
    }
    return { type: 'nothing', remaining: st.trip.remaining };
  };

  E.end = function (st) {
    var trip = st.trip;
    st.trip = null;
    return trip;
  };
})(typeof window !== 'undefined' ? window : globalThis);
