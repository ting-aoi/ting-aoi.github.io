# AI-CONTEXT — 雙葉書庫（Futaba）
> 交接文件 · 對應版本 **v3.7** · 供 AI 助手跨對話接手用。動工前先讀完本檔。

## 0. 一句話
個人書評 PWA：vanilla JS、全域 `FT` 命名空間、shttps 本地檔案伺服器（localhost:8080）做資料持久化，Android + Brave 為主要環境，使用者 Ting，全程繁體中文。

## 1. 鐵律（違反=事故）
1. **書櫃功能永久放棄**：`shelfDict`、`book.shelves`、書櫃 chips、`/櫃名` 搜尋——v2.9 時代已全面撤除，**任何情況下不得重新引入**，除非 Ting 明確要求。注意「書庫」（library，v3.1 的整版書單頁）與「書櫃」無關，不要混淆。
2. **扁平兩層導航**：`LAYER = { home:1, 其餘全部:2 }`。任何頁按返回=回主頁，不做多層堆疊。
3. **更新機制不得退化**：index.html 永遠走網路 + 全資產 `?v=BUILD` 版本戳（雙保險）；`updateViaCache:'none'`；設定頁強制更新按鈕 + 網址 `/#update` 觸發 `FT.forceUpdate`。
4. **bump.py 版本錨定 `>vX.X<`**：HTML 註解等處不得出現同格式字串。
5. **側欄與頂欄永遠深色**（`--leather`），不隨日夜翻轉；側欄完成度符號 `badge-r/badge-y` 用固定亮色。
6. **確認後執行**：重大設計先提案、Ting 核可才動工；鎖定決策不得擅自回退。

## 2. 檔案結構與模組
```
booknotes-pwa/
├─ test/               回歸測試集（run.js + dom-stub.js）— 交付前必跑
├─ index.html          單頁殼：11 個 page 區塊、設定分頁結構
├─ sw.js               SW：CACHE=futaba-<BUILD>；fonts 走獨立 futaba-fonts 快取（activate 清理排除）
├─ manifest.json       全相對路徑；orientation portrait；琥珀配色
├─ bump.py             版本工具（見 §4）
├─ CHANGES.md          待寫入 changelog 的條目（bump 時消費）
├─ AI-CONTEXT.md       本檔
└─ assets/
   ├─ css/main.css     全部樣式（變數層日夜雙主題）
   ├─ changelog.json   更新日誌資料（新→舊）
   ├─ icons/           PWA 圖示（已程式化重上色為琥珀）
   └─ js/  storage.js(606行:資料/API/completionLevel/applySettings)
           ui.js(705行:導航/側欄/搜尋/日誌摺疊/forceUpdate/主題)
           pages.js(~420行:磚牆/拖排/書庫/標籤頁/作者/統計)
           editor.js(540行:書評表單/星等/角色/標籤)
           settings.js(503行:設定分頁/摺疊/平台/狀態/匯出入)
           search.js(119行:解析與比對)  app.js(239行:開機/事件/手勢)
```
- 資料目錄由 `location.pathname` 推導（`_base`），放子資料夾自動跟隨；`/api/` 絕對引用是正確的（shttps API 在伺服器根）。
- `index.json` 為衍生資料（書 id 清單），匯出**不含**它、匯入時 `saveAll()` 自動重建——這是正確設計，勿「修復」。

## 3. 資料模型要點
- `FT.books[id]`：title/author/rating(0-5)/myProgress/textPlatform/audioPlatform/cvType/aiCv/cvChange/voiceExp/characters[]/tags[](id 引用 tagDict)/synopsis/review/notes/created。
- `FT.missingFields(b)` → `{hard:[], soft:[]}` 是完成度的**單一事實來源**（v3.7）：hard=書名/作者/進度/雙平台/角色/標籤/有聲四欄（audioPlatform='無' 時免），soft=簡介/心得；`FT.MISSING_LABELS` 為固定顯示順序。`FT.completionLevel(b)` 只是它的薄包裝 → `'red'`(◆缺漏，hard 缺任一)/`'yellow'`(◇待補，僅 soft 缺)/`'ok'`。**新增完成度相關功能一律走 missingFields，不得另寫一套判定**（統計頁「還缺什麼」即靠此同源，test/run.js 有斷言把關）。
- `FT.settings` 整包序列化寫 `data/settings.json`。特殊鍵：
  - `appsOrder`：功能磚順序（拖排持久化）
  - `settingsSecOpen`：設定頁「預設展開」的**區名清單**（出廠 `['系統更新','外觀','新書預設值']`；區名=標題去表情與空白，如 `換CV選項`；無 UI，手動改 JSON）
  - `settingsSecDefaultOpen`（舊布林，已廢棄，讀到即忽略）
  - `backupKeep`：每日備份保留份數（預設 7，手動改 JSON）
- **每日自動備份**（storage.js `_dailyBackup`/`_pruneBackups`）：每日首次存檔時把 books/trash/settings 快照寫入 `data/data.bak.<本地日期>.json`，只留最近 `backupKeep` 份。v3.2 修正原本用 UTC 取日期導致清晨錯開一天的問題；設定頁「資料維護」可見最後備份日期與份數，並有「立即備份」按鈕（`FT.runBackupNow`/`FT.backupInfo`）。

## 4. 工作流（每次交付必守）
1. 從 `/mnt/user-data/outputs/` 最新 zip 解壓至 `/home/claude/booknotes-pwa`
2. 修改 → `node --check` 全 JS + CSS 括號平衡檢查
3. **跑回歸測試集：`node test/run.js`**（v3.2 起固化在 repo，v3.3 現為 71 條斷言涵蓋歷次修過的 bug）
   - 環境模擬在 `test/dom-stub.js`（`makeEnv()` 一行備妥 window/document/fetch/history/navigator）
   - 改完功能請**補一條對應斷言**再交付；懷疑測試無效時用「故障注入」驗證（故意改壞→確認會失敗）
   - 針對新功能仍可另寫臨時 smoke test，但通用行為一律進 test/run.js
4. 寫 `CHANGES.md`（bump 時寫入 changelog 並清空）
5. `python3 bump.py debug|minor|major`（debug=字母 v3.1→v3.1a；minor=v3.1→v3.2；major=v3→v4）
   - 自動：改 index.html 版號、sw.js `BUILD='<秒>'`、8 處 `?v=BUILD`、changelog.json、打包
   - zip 檔名含版本（futaba-pwa-v3.1c.zip）、內部資料夾固定 `booknotes-pwa/`、排除 .zip 與 data/index.json、data/settings.json
6. 刪 outputs 舊 zip → cp 新 zip → present_files
- 部署方式（v3.3 起雙管道）：①shttps：Ting 解壓覆蓋 shttps 目錄 → 頁面 `/#update` 一次；②GitHub：repo 位於 ting-aoi/ting-aoi.github.io 的 `futaba-bookshelf/` 子資料夾，commit → push `main` → GitHub Pages 自動更新（zip 被 .gitignore 排除不入庫）。

### 測試雷點（血淚）
- Node 22 `navigator` 唯讀：mock 要 `Object.defineProperty(globalThis,'navigator',...)`
- app.js boot 是 async IIFE：require 後要 `await setTimeout ~80ms` 才驗綁定
- mock 元素需先經 `getElementById` 建立才能操作
- CSS 孤兒掃描必須含**動態組字串前綴**防護（`badge-${...}` 曾被誤刪釀成 v2.9c 事故）
- 拖曳測試斷言「拖曳中 DOM 零重建」（v3.0c 事故：重建銷毀觸控目標致事件流中斷）

## 5. 琥珀廳設計系統（v3.0 起）
- **雙主題共用元件規則，只換變數**。日=羊皮紙+銅金（--paper:#f0e7d4 --gold:#a97b3f）、夜=深咖啡+燙金（--paper:#221a12 --gold:#d6a45a）。
- 關鍵變數：`--leather`（頂欄/側欄恆深：日#33281a/夜#1a140c）、`--glow`（夜間微光/日 transparent）、`--card-grad`（皮革/紙面漸層）、`--paper-glass`（毛玻璃底）、`--gold-dim`（金邊框）、`--bg-glow`（頂部氛圍光）。theme-color 日#33281a/夜#1a140c。
- **字體三角色**：LXGW WenKai TC（手寫=作品內容：logo/頁大標/書名/作者/進度/#標籤/@角色/平台名/心得簡介/內容輸入框）；Caveat 700 -2.5°（隨筆數字：`.stat-num` 32px，夜間 text-shadow var(--glow)，**單一定義**勿再出現第二條被級聯覆蓋）；Noto Sans TC（介面）。「書庫」二字金色**不斜體**。Playfair/Noto Serif 已退役。字型由 SW `futaba-fonts` 執行期快取，離線可用。
- **動效**（v3.5 全面整理）：token 在 `:root`——時長 `--dur-fast/.13s`、`--dur/.22s`、`--dur-slow/.34s`，緩動 `--ease`（減速收尾）與 `--ease-spring`（微回彈）。切頁 `pageEnter`（淡入＋上浮 10px，**只動 transform/opacity**）；手勢滑入 pageSlideIn；統一按下回饋 `:active{transform:scale(0.965)}`（排序模式磚塊除外——inline transform 歸拖曳引擎）；主按鈕 `.gilt-shine` 光澤掃過（app.js 事件委派 #new-btn/.io-act-pri）、`.star.pop` 點星回彈、toast 彈性緩動、theme-switch 過渡（僅切換瞬間掛 class）、統計卡 `::before` 桌燈暈（僅夜間）。**`transition:all` 已清零**（v3.5，21 處改明確五屬性 background/color/border-color/transform/box-shadow）——新樣式不得再寫 `transition:all`。全部受 `prefers-reduced-motion` 總開關管制。
- **圖示系統**（v3.6，取代舊「頂欄符號＋側欄 emoji」慣例——該慣例已由 Ting 明確推翻）：35 顆內嵌 SVG sprite 在 index.html `<body>` 開頭（`#i-<name>`），線條 1.7/圓端點/24 網格；`svg.ic` 尺寸吃 font-size、顏色吃 currentColor（雙主題免分版）。JS 端用 `FT.icon(name)`（storage.js）產出 `<use>` 標記——**只能用於 innerHTML 路徑，textContent 塞不進去**（v3.6 曾把排序鈕 textContent 改 innerHTML）。原生對話框（alert/confirm）內文字的 emoji 保留。★ 星等、◆◇✓ 完成度符號、聊天式 ✕/＋ 小字元屬**排版系統**，不在圖示範圍。PWA icon-192/512＋mask 版為 **v3.2 原版琥珀雙葉 PNG（Ting 指定保留，勿再重繪）**——v3.6 曾重繪、v3.6a 依 Ting 要求還原。
- 星等一律 `.gilt-star` 金屬漸層（渲染點：ui.js 首頁/側欄、pages.js 作者/統計）。
- 毛玻璃黏頂面板（設定分頁列、書庫篩選列）：`--paper-glass` + blur + `--gold-dim` 邊框，z-index:10（**必須低於側欄 15**，v3.1 曾出過圖層事故）。

## 6. 頁面清單（11 頁）與要點
| 頁 | 要點 |
|---|---|
| home | 手寫大標、統計卡（Caveat 數字+夜燈暈）、最近記錄（右上「全部 ›」→library）、標籤雲（「管理 ›」→tags）；home-sec 為 flex+滿寬底線 |
| note | 編輯表單；內容欄手寫；角色列 baseline 對齊；閱讀模式 badge |
| apps | 磚牆 9 格；標題右「⇅ 排序」；**拖排=transform 位移制**（拖曳期間零 DOM 重建；讓位步距=實測 tiles[1].left-tiles[0].left；命中=寬/3；touchcancel/visibilitychange/關閉排序皆取消不提交）；排序模式抑制選取/長按選單/滑動手勢；順序存 settings.appsOrder |
| library | v3.1 新增（≠書櫃）。**五下拉**毛玻璃黏頂（排序/進度/評分/完成度＋v3.7 作品狀態，2 欄 grid、第 5 個 `nth-child(5)` span 2 佔滿末行），頁內狀態 `FT._lib`，`FT.libSet(k,v)` 統一入口；皮革卡片列 |
| tags | v3.0b 自設定獨立；元素 id 沿用 settings-tag-list 等；管理函式零改動 |
| authors | 列表↔細節；細節頭「＋ 新增書評」`FT.newBookForAuthor` 自動帶作者；（未填作者）無此鈕 |
| stats | 六區塊：總覽/評分分佈/**連載狀態**(v3.7)/平台/**完成度＋還缺什麼**(v3.7)/熱門標籤 TOP20。全部即時由 `FT.books` 聚合，不寫伺服器；`tally(key)`＋`platBlock(title,key)` 是加新分佈區塊的現成工具 |
| backup / trash | 變數換色即可，結構穩定；備份頁四張 io-card（全部備份/書評資料/**Markdown**(v3.7 匯出限定)/設定檔）|
| settings | 三分頁 ⚙️一般/📖書目/🎧有聲（黏頂毛玻璃）；各區摺疊卡由 `settingsSecOpen` 控制；狀態子標題低調樣式 |
| changelog | 兩層摺疊（大版本系列→小版本系列）+ 惰性渲染；最新系列預設開 |

## 7. 互動機制
- **展示模式**（v3.4，GitHub Pages 訪客沙盒）：閘門=`FT.isDemo()`（hostname 以 github.io 結尾才 true——shttps 離線**絕不誤觸發**，此設計不得改用「伺服器連不上」判斷）；開機 `FT.initDemo()` 在 loadAll **之前**執行，展示環境且 localStorage `futaba_v2` 為空時以 `assets/demo.json` 為種子（books 9 本=Ting 真實書評、trash 空、settings 只收 tagDict+平台+選項清單等內容性鍵），之後全走既有離線 fallback，訪客增刪改只存自己瀏覽器；`body.demo` 顯示 `#demo-banner` 常駐橫幅。**demo.json 內容更動需 Ting 過目才可 push（公開上網）**。
- **存檔提示誠實化**（v3.4）：`FT.showSaved()` 依 `FT._lastWrite.ok` 區分——伺服器寫入失敗顯示「⚠ 未寫入伺服器」（`.warn` 紅字、4 秒），不再失敗也顯示已儲存；展示模式例外（localStorage 即預期儲存地，寫入即成功）。
- **搜尋語法**（search.js）：`#標籤`、`@人名`、`~內文`（v3.3 起；全文=簡介+心得+備註+角色描述）、`:狀態`（v3.7 起；比對 workStatus+audioStatus+myProgress）——各前綴多詞皆 AND、可互相混用；無前綴文字只搜書名+作者。簡繁比對：**只對查詢詞做變體展開**（sc2tcVariants 有 64 種上限），長原文僅 lowercase 直接 includes——不得把原文丟進變體展開，會被截斷漏比。
- **手勢**（app.js）：右滑開側欄；左滑=側欄開時關側欄、否則開功能頁（apps-page 加 .slide-in）；搜尋中（window._searchQ）與排序模式（FT._appsSort）停用；防誤觸=位移>70/垂直<60/耗時<600ms/輸入框起點忽略。
- **返回鍵**：popstate 先攔搜尋（清除+補 pushState 留原頁）；showPage 開頭清搜尋殘留；✕ 按鈕的隱藏收斂在 `FT.clearSearch` 內。
- **強制更新** `FT.forceUpdate(skipConfirm)`：註銷全部 SW → 清全部快取 → `location.replace(pathname+'?fresh=')`；`#update` hash 開機偵測自動觸發（免確認）。
- 橫式攔截層 `#rotate-guard`：橫向+觸控+高≤520px 顯示；manifest portrait 僅安裝版有效。
- 排序下拉 `_sortKey` 不持久化（開機 date-desc）；**無 A→Z 選項**（中文無意義，v3.1a 移除）；**無「狀態排序」**（v3.7 移除——它讀一個不存在的 settings 鍵與不存在的 `b.status`，選中即 TypeError 中斷側欄渲染，是 v2.x 狀態拆三組的遺留死路徑）。
- **側欄篩選下拉**（v3.7）：單一 `#filter-status` 用 `<optgroup>` 涵蓋兩維度，value 帶前綴 `prog:` / `work:`；`renderList` 依前綴分派比對 `myProgress` 或 `workStatus`，無前綴的舊值一律當 `prog`。側欄寬度有限，**不要再加第三個 select**——要擴維度就加 optgroup。

## 8. 路線圖與待辦
- **已提案未動工（後段不急）**：側欄改版（A 維持現狀=推薦/B 純導航/C 最近+釘選），等 Ting 選
- **Icon 更換（後段不急）**：outputs 有 futaba-icon-inventory.md 全站清單，等 Ting 標註後批次換
- **明確不排**：連載追蹤、時間統計、封面圖（v4.0）——Ting 2026-08 規劃時未選
- 設計文件（outputs）：futaba-v3-spec.md、futaba-v3-font-map.md、兩份 preview html
- 慣例：每次改版**更新本檔**再打包

## 9. 溝通慣例
Ting 以編號列需求；模糊處先問再做；每版交付附「根因說明+驗證結果」；出錯直接認錯並說明根因；諮詢類問題給選項+推薦而非直接實作。
