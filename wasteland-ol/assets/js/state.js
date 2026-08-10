// ═══════════════════════════════════════════════════════
// state.js — 遊戲狀態單一事實來源（零 DOM，Node 可直接 require）
// 主畫面資源只有食物與水；木頭／石頭／廢鐵是背包個別道具，
// 「材料」只是描述性標籤，不是遊戲物件。
// ═══════════════════════════════════════════════════════
(function (root) {
  'use strict';
  var WOL = root.WOL = root.WOL || {};
  var S = WOL.state = {};

  // 存檔格式版本。不相容即丟棄，不做遷移（鎖定決策）。
  S.SAVE_VERSION = 1;

  S.create = function (cfgs) {
    var attrCfg = (cfgs && cfgs.attributes) || {};
    var surCfg = (cfgs && cfgs.survival) || {};
    var start = surCfg.start || {};
    var attrs = {};
    Object.keys(attrCfg.attributes || {}).forEach(function (k) {
      attrs[k] = attrCfg.attributes[k].start || 0;
    });
    var derived = WOL.rules.derive(attrs, attrCfg, {});
    return {
      saveVersion: S.SAVE_VERSION,
      day: start.day || 1,
      phase: start.phase || 'morning',
      ap: 0,                       // 由 time.enterPhase 補滿
      food: start.food || 0,
      water: start.water || 0,
      attrs: attrs,
      hp: derived.hpMax || 1,
      st: derived.stMax || 1,
      hpMaxLossPct: 0,             // 飢渴累積的生命上限削減
      debuffs: { hunger: false, thirst: false },
      inventory: {},               // { itemId: count }
      log: [],                     // 最近事件（僅顯示用，上限 LOG_MAX）
      combat: null,                // 進行中的戰鬥（null = 不在戰鬥）
      createdAt: Date.now()
    };
  };

  S.LOG_MAX = 60;
  S.pushLog = function (st, text, kind) {
    if (!st.log) st.log = [];
    st.log.unshift({ t: text, k: kind || '', day: st.day, phase: st.phase });
    if (st.log.length > S.LOG_MAX) st.log.length = S.LOG_MAX;
  };

  // ── 背包 ──
  S.count = function (st, id) { return (st.inventory && st.inventory[id]) || 0; };
  S.addItem = function (st, id, n) {
    if (!id || !n) return 0;
    st.inventory = st.inventory || {};
    st.inventory[id] = (st.inventory[id] || 0) + n;
    if (st.inventory[id] <= 0) delete st.inventory[id];
    return st.inventory[id] || 0;
  };
  S.removeItem = function (st, id, n) {
    if (S.count(st, id) < n) return false;
    S.addItem(st, id, -n);
    return true;
  };

  // ── 衍生數值（永遠經此取得，不得各處自算）──
  S.derived = function (st, cfgs) {
    var attrCfg = (cfgs && cfgs.attributes) || {};
    var surCfg = (cfgs && cfgs.survival) || {};
    return WOL.rules.derive(st.attrs, attrCfg, {
      penaltyPct: WOL.rules.penaltyPct(st.debuffs, surCfg),
      hpMaxLossPct: st.hpMaxLossPct || 0
    });
  };

  // 夾住 hp/st 不超過當前上限（debuff 生效後上限會縮）
  S.clampVitals = function (st, cfgs) {
    var d = S.derived(st, cfgs);
    if (st.hp > d.hpMax) st.hp = d.hpMax;
    if (st.st > d.stMax) st.st = d.stMax;
    if (st.hp < 0) st.hp = 0;
    if (st.st < 0) st.st = 0;
    return d;
  };

  // ── 存檔序列化 ──
  S.serialize = function (st) {
    var out = JSON.parse(JSON.stringify(st));
    out.saveVersion = S.SAVE_VERSION;
    out.savedAt = Date.now();
    return out;
  };

  // saveVersion 不符即丟棄（回傳 null），呼叫端負責提示使用者。
  S.deserialize = function (raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.saveVersion !== S.SAVE_VERSION) return null;
    return raw;
  };
})(typeof window !== 'undefined' ? window : globalThis);
