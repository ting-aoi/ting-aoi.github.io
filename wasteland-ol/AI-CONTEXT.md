# AI-CONTEXT — 廢土 Online（wasteland-ol）

> 交接文件 · 對應版本 **v0.1b** · 供 AI 助手跨對話接手用。
> 動工前先讀完本檔與 `CONVENTIONS.md`（鎖定決策在那邊）。

## 0. 一句話

末日生存管理遊戲：瀏覽器回合制、vanilla JS、全域 `WOL` 命名空間、
localStorage 存檔 ＋ shttps 手動備份，底層與雙葉書庫同一套（靜態 HTML PWA），
使用者 Ting，全程繁體中文。

## 1. 目前狀態（v0.1b）

**引擎與介面全部到位，內容表是空的。** 五個系統可跑：

| 系統 | 狀態 |
|---|---|
| 屬性與衍生數值 | ✅ 完成，係數全在 `assets/data/rules.attributes.json` |
| 時間與生存循環 | ✅ 完成（天數／早中晚／AP／過夜結算／飢渴 debuff） |
| 探索 | ✅ 引擎完成，**沒有地點資料可去** |
| 戰鬥 | ✅ 引擎完成，**沒有怪物資料可打** |
| 背包 | ✅ 完成，**沒有道具資料** |
| 合成台、電力 | ⛔ 依鎖定決策延後（`recipes.json` 只佔檔位） |

介面在資料表為空時會顯示「內容資料未載入」的明確提示，不會白畫面。

## 2. ⚠️ 待 Ting 提供的資料（填完就能玩）

四張表都在 `assets/data/`，每個檔案的 `_fields` 區塊寫著欄位說明，`_example` 是格式範例
（**不會被載入**，只是給人看的）。填進對應的空陣列即可，程式不用改。

1. **`items.json` → `items[]`**（先填這張，其他表會引用 itemId）
   - `id` / `name` / `kind`（material｜food｜water｜consumable｜gear）/ `desc`
   - 木頭、石頭、廢鐵這類資源就登錄在這裡，當成一般道具
   - 可食用的填 `use: { hp, st, food, water }`
2. **`monsters.json` → `monsters[]`**
   - `id` / `name` / `hp` / `atk` / `def` / `spd` / `hit` / `eva`（`crit`、`critMult` 可省略）
   - `pattern`：固定行動表，逐回合循環，元素為 `attack` | `guard` | `rest`
   - `drops`：`[{ itemId, min, max, chance }]`，chance 是整數百分比
3. **`locations.json` → `locations[]`**
   - `id` / `name` / `desc` / `actions`（一趟幾次行動，AP＝`ceil(actions/2)`）
   - `encounterChance`（整數百分比）/ `encounters[{monsterId,weight}]` / `scavenge[{itemId,min,max,weight}]`
4. **`recipes.json` → `recipes[]`**（合成台做了才會用到，可以最後再給）

**鎖定決策：這四張表一律由 Ting 提供，AI 不得生成佔位內容。**

## 3. ⚠️ 待 Ting 確認的提案數值

v0.1 的規則係數是我提的初版，全部集中在三個 JSON，改平衡不用碰程式碼：

- `rules.attributes.json`：五屬性起始值 5；HP＝20+CON×6、體力＝10+CON×2+STR×1、
  ATK＝2+STR×2、DEF＝1+CON、SPD＝3+AGI×2、命中＝60+AGI×2+PER×3、閃避＝5+AGI×3、
  爆擊＝3+PER×2、爆傷＝150+STR×2。預設角色（全 5）→ HP 50／體力 25／ATK 12／SPD 13。
- `rules.survival.json`：起始食物與水各 10；過夜食物 −3／水 −4；飢餓與口渴各 −30% 屬性，
  每天各再累積 −5% 生命上限，上限削減封頂 60%；健康過夜回 3 HP、體力睡飽。
- `rules.combat.json`：攻擊耗體力 2；戒備受傷降到 40%，`DEF − 敵ATK ≥ 3` 時改回 2 點體力、
  否則扣 1；喘息全額受傷、回 5 點體力；撤退耗體力 2，成功率 `50 + 速度差×3` 夾 20–90%；
  命中率 `攻方HIT − 守方EVA` 夾 10–95%；體力不足時攻擊傷害砍半；敗北以 1 HP 回避難所。

實測：全屬性 5 的角色餓＋渴滿檔時，ATK 12 → 4、生命上限 50 → 20。**偏嚴苛，等 Ting 定奪。**

## 4. 分支與部署（‼️ 動 git 之前先讀完本節）

repo `ting-aoi/ting-aoi.github.io` 是**一站多專案**：`futaba-bookshelf/`（雙葉書庫）
與 `wasteland-ol/`（本專案）路徑互不重疊。GitHub Pages **只從 `main` 部署**，
所以兩個資料夾必須同時存在於 main——main 是整合分支＝部署分支，不是被污染。

廢土走 **雙分支制**（Ting 2026-08 定案）：

| 分支 | 樹內容 | 角色 |
|---|---|---|
| `wasteland-ol` | **只有廢土本體**（本檔所在處就是根） | 開發主場、**事實來源**，一切改動都在這裡 |
| `wasteland-ol-release` | main 完整站台樹 ＋ `wasteland-ol/` 子資料夾 | 只為開 PR 上線的**衍生物，永不手改** |
| `main` | 全部專案 | 整合＋部署。**AI 不得直推、不得自行合併** |

`wasteland-ol` 與 main **沒有共同祖先**（由 `git subtree split` 切出，歷史完整保留）。
這是刻意的：從 main 長出來的分支若刪掉 `futaba-bookshelf/`，合併時會把雙葉從線上站台
一併刪掉——merge 是套用差異，分支裡的「刪除」會原封套到 main。orphan 才能讓樹裡真的
只有廢土又不誤傷雙葉。代價是 GitHub 無法對它開 PR（422 No commits between），
所以上線得繞 release 分支。

### 上線同步流程（每次要讓線上版更新時跑）

```bash
git fetch origin main wasteland-ol
git checkout -B wasteland-ol-release origin/main
git rm -r --quiet --cached wasteland-ol 2>/dev/null || true   # 整包移除→確保是鏡像而非疊加
git read-tree --prefix=wasteland-ol/ -u wasteland-ol          # 把開發分支整棵掛到子資料夾
git commit -m "廢土 Online vX.Yz：自 wasteland-ol 分支同步"
git push -u origin wasteland-ol-release
# 開草稿 PR：wasteland-ol-release → main，由 Ting 親自按合併
```

**推送前必驗**（守住「合併不會刪掉雙葉」這條命）：

```bash
git diff --name-only origin/main...HEAD | cut -d/ -f1 | sort -u    # 只能有 wasteland-ol（與 BRANCHES.md）
git diff --name-only origin/main...HEAD -- futaba-bookshelf | wc -l # 必須是 0
```

雙葉那邊的分支（`futaba-bookshelf`）不歸這裡處理，勿主動合併或改動；反之亦然。

## 5. 檔案結構

分支根目錄就是專案根目錄（`wasteland-ol` 分支上無任何外層資料夾）：

```
（branch root）
├─ index.html        單頁殼：頂欄／側欄／8 個 .page ／內嵌 SVG sprite
│                    狀態列 <span id="stat-ver"> 是 bump.py 的版本錨點
├─ sw.js             SW：CACHE='wol-'+BUILD；字型走獨立 wol-fonts 快取
├─ manifest.json     全相對路徑、portrait、廢土配色
├─ bump.py           版本工具（見 CONVENTIONS §4）
├─ CHANGES.md        待寫入 changelog 的條目（bump 時消費並清空）
├─ AI-CONTEXT.md     本檔     CONVENTIONS.md  鎖定決策
├─ test/             run.js（89 條斷言）＋ dom-stub.js ＋ fixtures/（測試專用假怪）
└─ assets/
   ├─ css/main.css   全部樣式，變數層日夜雙主題
   ├─ changelog.json 更新日誌資料（新→舊，bump 寫入）
   ├─ icons/         PWA 圖示 ＋ icon-source.svg ＋ .nomedia
   ├─ data/          遊戲資料（規則三檔已填、內容四檔空）
   └─ js/
      version.js  WOL.VERSION / WOL.BUILD（bump 同步改寫）
      ── 核心（零 DOM，Node 可 require）──
      rules.js    屬性→衍生數值、整數百分比 debuff、先攻判定
      state.js    狀態單一事實來源、背包、序列化（saveVersion）
      time.js     天／時段／AP、過夜結算
      explore.js  AP 換算、地點抽取、行程推進
      combat.js   四動作狀態機、命中／傷害／撤退
      content.js  資料載入與 schema 驗證（空表視為合法）
      ── UI（碰 DOM）──
      storage.js  localStorage 存檔、shttps 備份、匯出入、toast
      ui.js       導航／側欄／主題／更新日誌／強制更新
      pages.js    各頁渲染與玩家操作
      app.js      開機序、事件接線、返回鍵、手勢
```

## 6. 關鍵設計要點

- **衍生數值一律走 `WOL.state.derived(st, cfgs)`**，不得在 UI 層自算。
  `rules.derive` 讀 `_debuffApplies` 決定哪些項目吃 debuff；`hpMax` **不吃屬性百分比**，
  只吃「累積上限削減」——兩者疊在一起會讓餓一天就掉半條命。
- **戰鬥中鎖定導航**（`WOL.navLocked()`）：側欄按鈕停用、切頁被導回戰鬥、返回鍵擋下，
  避免靠切頁脫戰。戰鬥結束（`over`）才解鎖。
- **`_histPage` 備援**：`history.state` 在無頭環境與部分還原情境讀不回來，只靠它判層會讓
  每次切頁都變 push、返回鍵要按很多下。`ui.js` 另存一份 `_histPage` 當備援事實來源。
- **更新日誌惰性渲染**：`_clFetched` 保證同一次執行期只抓一次 `changelog.json`；
  未展開的系列不預先產生 DOM，`toggleClGroup` 首次展開才渲染。
- **存檔誠實化**：`WOL.showSaved(ok)` 失敗時顯示紅字「⚠ …」，不會失敗也裝已存檔。
- **靜態託管閘門** `WOL.isStatic()` 看 **hostname 結尾是否 github.io**——
  不可改成「伺服器連不上」判斷，否則 shttps 暫時離線時備份鍵會憑空消失。
- **探索行程**：`begin` 先付清整趟 AP，`step` 一次解一個事件；遭遇怪物會把 `st.trip`
  保留著切進戰鬥，戰鬥結束再回探索頁續走。敗北會清掉 `trip`。
- **時段一律以圖示呈現**（v0.1a，Ting 指定）：畫面上不出現「早／中／晚」國字。
  圖示名寫在 `rules.survival.json` 的 `phases[].icon`，由 `WOL.time.phaseIcon()` 取值、
  `WOL.phaseMark()`（pages.js）包成帶 `title`／`aria-label` 的 span——`label` 降級為
  無障礙名稱，讀螢幕的人仍讀得到。事件日誌走 `phases[].log` 的**自然語句**
  （「天亮了。」而非「時間推進到早。」），因為日誌是散文，塞圖示很怪、也免得為此
  在 `escH` 之外開 HTML 注入口。
  ⚠️ **時段圖示是資料驅動的**，字串字面量掃不到——`test/run.js` 的孤兒圖示掃描
  已把 `rules.survival.json` 的 icon 名納入 used 集合，改資料打錯字會轉紅。
- **齒輪與更新日誌圖示**（v0.1a 重畫）：舊 `#i-gear` 是「圓圈＋八根放射直線」，
  渲染出來是**太陽**不是齒輪；已改為 8 齒閉合輪廓（齒尖以二次貝茲圓角過渡，
  頂點退 0.85 取控制點，與雙葉 v3.6b 同手法）。舊 `#i-scroll` 路徑自我交疊、
  1em 下糊成一條，改成「文件＋摺角＋行」並正名為 `#i-log`。
  **新圖示一律先在 16／24／40px 三尺寸目視過再進版**——1em 約 14–17px 才是實際使用尺寸。

## 7. 測試雷點（血淚）

- 共用的 `test/dom-stub.js` 的 `classList.toggle` **不吃第二個 force 參數**，
  `run.js` 在測試端補了一層 force 支援。**不要去改樁本身**。
- 樁的 `history` **沒有 `state` 屬性**，這正是 `_histPage` 備援存在的原因。
- 樁的 `navigator.serviceWorker` 是 `undefined` 但 key 存在，
  所以 `'serviceWorker' in navigator` 會過而取用會炸——程式碼一律改判 `navigator.serviceWorker`。
- 戰鬥測試用固定 rng（`() => 0` 必中、`() => 0.999` 必失敗）取代亂數，不得靠機率碰運氣。

## 8. 路線圖

- **下一步（等資料）**：Ting 給四張內容表 → 補進 `assets/data/` → 實測平衡 → v0.2
- **等資料到位後才有意義**：怪物 SVG 剪影（規範在 CONVENTIONS §3）、道具使用效果、
  探索事件文案
- **已明確延後**：合成台、電力
- 慣例：每次改版**先更新本檔**再打包
