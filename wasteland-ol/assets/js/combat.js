// ═══════════════════════════════════════════════════════
// combat.js — 回合制戰鬥狀態機（零 DOM，Node 可直接 require）
// 四動作：攻擊／戒備／喘息／撤退，另有道具（耗掉整回合）。
// 敵人無體力、走固定行動表。敗北以 1 HP 返回避難所。
// ═══════════════════════════════════════════════════════
(function (root) {
  'use strict';
  var WOL = root.WOL = root.WOL || {};
  var C = WOL.combat = {};

  function clamp(v, lo, hi) { return WOL.rules.clamp(v, lo, hi); }
  function roll(pct, rng) { return (rng || Math.random)() * 100 < pct; }

  // 命中率 = clamp(攻方HIT − 守方EVA, min, max)
  C.hitChance = function (atkHit, defEva, cfg) {
    var h = (cfg && cfg.hit) || {};
    return clamp((atkHit || 0) - (defEva || 0), h.min == null ? 0 : h.min, h.max == null ? 100 : h.max);
  };

  // 撤退率 = clamp(base + (我SPD − 敵SPD) × spdFactor, min, max)
  C.retreatChance = function (mySpd, enemySpd, cfg) {
    var r = (cfg && cfg.retreat) || {};
    var base = r.base == null ? 50 : r.base;
    var f = r.spdFactor == null ? 3 : r.spdFactor;
    return clamp(base + ((mySpd || 0) - (enemySpd || 0)) * f, r.min, r.max);
  };

  C.rawDamage = function (atk, def, cfg) {
    var d = (cfg && cfg.damage) || {};
    return Math.max(d.minDamage == null ? 1 : d.minDamage, (atk || 0) - (def || 0));
  };

  // 由 monsters.json 的一筆資料建出戰鬥用敵人
  C.makeEnemy = function (m) {
    return {
      id: m.id, name: m.name,
      hp: m.hp, hpMax: m.hp,
      atk: m.atk || 0, def: m.def || 0, spd: m.spd || 0,
      hit: m.hit || 0, eva: m.eva || 0,
      crit: m.crit || 0, critMult: m.critMult || 150,
      pattern: (m.pattern && m.pattern.length) ? m.pattern.slice() : ['attack'],
      drops: m.drops || []
    };
  };

  C.start = function (st, monster, cfgs) {
    var d = WOL.state.derived(st, cfgs);
    var enemy = C.makeEnemy(monster);
    st.combat = {
      enemy: enemy,
      turn: 1,
      patternIndex: 0,
      playerFirst: WOL.rules.playerFirst(
        { spd: d.spd, agi: st.attrs.agi }, { spd: enemy.spd, agi: 0 }, (cfgs && cfgs.attributes) || {}),
      over: false,
      result: null,
      log: []
    };
    return st.combat;
  };

  function logLine(cb, text) { cb.log.push(text); }

  // 一次攻擊結算，回傳實際造成的傷害
  function strike(src, dst, cfgs, rng, takenPct, cb, srcName) {
    var combatCfg = (cfgs && cfgs.combat) || {};
    var chance = C.hitChance(src.hit, dst.eva, combatCfg);
    if (!roll(chance, rng)) {
      logLine(cb, srcName + '的攻擊落空了。');
      return 0;
    }
    var dmg = C.rawDamage(src.atk, dst.def, combatCfg);
    var crit = roll(src.crit || 0, rng);
    if (crit) dmg = Math.floor(dmg * (src.critMult || 150) / 100);
    if (takenPct != null && takenPct !== 100) dmg = Math.max(0, Math.floor(dmg * takenPct / 100));
    logLine(cb, srcName + '造成 ' + dmg + ' 點傷害' + (crit ? '（爆擊！）' : '') + '。');
    return dmg;
  }

  // 敵人回合：讀固定行動表
  function enemyTurn(st, cfgs, rng, guarding) {
    var cb = st.combat;
    var combatCfg = (cfgs && cfgs.combat) || {};
    var act = cb.enemy.pattern[cb.patternIndex % cb.enemy.pattern.length];
    cb.patternIndex += 1;

    if (act === 'guard' || act === 'rest') {
      logLine(cb, cb.enemy.name + (act === 'guard' ? '擺出防禦姿態。' : '喘了口氣。'));
      cb.enemyGuarding = (act === 'guard');
      return;
    }
    cb.enemyGuarding = false;

    var d = WOL.state.derived(st, cfgs);
    var takenPct = 100;
    if (guarding) {
      var g = (combatCfg.actions && combatCfg.actions.guard) || {};
      takenPct = g.damageTakenPct == null ? 100 : g.damageTakenPct;
    }
    var dmg = strike(cb.enemy, { eva: d.eva, def: d.def }, cfgs, rng, takenPct, cb, cb.enemy.name);
    st.hp = Math.max(0, st.hp - dmg);
    if (st.hp <= 0) {
      cb.over = true;
      cb.result = 'lose';
      var df = combatCfg.defeat || {};
      st.hp = df.hpOnDefeat == null ? 1 : df.hpOnDefeat;
      logLine(cb, '你倒下了……勉強撐回避難所。');
    }
  }

  // 玩家一個動作 = 一整個回合（含敵人行動）
  // action: 'attack' | 'guard' | 'rest' | 'retreat' | 'item'
  C.act = function (st, action, cfgs, rng, opts) {
    var cb = st.combat;
    if (!cb || cb.over) return { ok: false, reason: 'no_combat' };
    cb.log = [];
    opts = opts || {};

    var combatCfg = (cfgs && cfgs.combat) || {};
    var acts = combatCfg.actions || {};
    var d = WOL.state.derived(st, cfgs);
    var guarding = false;

    function playerTurn() {
      if (action === 'attack') {
        var a = acts.attack || {};
        var weak = st.st < (a.staminaCost || 0);
        st.st = Math.max(0, st.st - (a.staminaCost || 0));
        var player = { hit: d.hit, atk: d.atk, crit: d.crit, critMult: d.critMult };
        // 敵人戒備時同樣吃減傷
        var pct = cb.enemyGuarding
          ? ((acts.guard && acts.guard.damageTakenPct) == null ? 100 : acts.guard.damageTakenPct)
          : 100;
        if (weak) pct = Math.floor(pct * ((combatCfg.damage && combatCfg.damage.weakDamagePct) || 100) / 100);
        var dmg = strike(player, cb.enemy, cfgs, rng, pct, cb, '你');
        if (weak && dmg > 0) logLine(cb, '（體力見底，力道大打折扣）');
        cb.enemy.hp = Math.max(0, cb.enemy.hp - dmg);
        if (cb.enemy.hp <= 0) { cb.over = true; cb.result = 'win'; logLine(cb, cb.enemy.name + '倒下了。'); }
        return;
      }
      if (action === 'guard') {
        var g = acts.guard || {};
        guarding = true;
        // DEF 顯著高於敵 ATK 時反而回體力，否則照扣
        if ((d.def - cb.enemy.atk) >= (g.recoverThreshold == null ? 0 : g.recoverThreshold)) {
          st.st = Math.min(d.stMax, st.st + (g.staminaRecover || 0));
          logLine(cb, '你穩住架式，喘回 ' + (g.staminaRecover || 0) + ' 點體力。');
        } else {
          st.st = Math.max(0, st.st - (g.staminaCost || 0));
          logLine(cb, '你架起防禦，硬撐住壓力。');
        }
        return;
      }
      if (action === 'rest') {
        var r = acts.rest || {};
        st.st = Math.min(d.stMax, st.st + (r.staminaRecover || 0));
        logLine(cb, '你放下防備喘息，回復 ' + (r.staminaRecover || 0) + ' 點體力。');
        return;
      }
      if (action === 'retreat') {
        var rt = acts.retreat || {};
        var chance = C.retreatChance(d.spd, cb.enemy.spd, combatCfg);
        // 成功與失敗都扣體力
        st.st = Math.max(0, st.st - (rt.staminaCost || 0));
        if (roll(chance, rng)) {
          cb.over = true; cb.result = 'fled';
          logLine(cb, '你成功脫離戰鬥（成功率 ' + chance + '%）。');
        } else {
          logLine(cb, '撤退失敗（成功率 ' + chance + '%），對方咬得更緊。');
        }
        return;
      }
      if (action === 'item') {
        logLine(cb, '你使用了 ' + (opts.itemName || '道具') + '，耗掉一個回合。');
        return;
      }
      logLine(cb, '你什麼也沒做。');
    }

    if (cb.playerFirst) {
      playerTurn();
      if (!cb.over) enemyTurn(st, cfgs, rng, guarding);
    } else {
      enemyTurn(st, cfgs, rng, false);
      if (!cb.over) playerTurn();
    }

    WOL.state.clampVitals(st, cfgs);
    cb.turn += 1;
    return { ok: true, over: cb.over, result: cb.result, log: cb.log.slice() };
  };

  // 結束戰鬥：勝利發掉落，敗北清掉探索行程
  C.finish = function (st, rng) {
    var cb = st.combat;
    if (!cb) return null;
    var gained = [];
    if (cb.result === 'win') {
      (cb.enemy.drops || []).forEach(function (dp) {
        if ((rng || Math.random)() * 100 >= (dp.chance == null ? 100 : dp.chance)) return;
        var n = WOL.explore.randInt(dp.min, dp.max, rng);
        if (n > 0) { WOL.state.addItem(st, dp.itemId, n); gained.push({ itemId: dp.itemId, count: n }); }
      });
    }
    var result = cb.result;
    st.combat = null;
    if (result === 'lose') st.trip = null;
    return { result: result, gained: gained };
  };
})(typeof window !== 'undefined' ? window : globalThis);
