# CONVENTIONS — 廢土 Online（wasteland-ol）

> 鎖定決策與工程慣例。**已鎖定的項目不得擅自回退，除非 Ting 明確指示。**
> 動工前先讀本檔與 `AI-CONTEXT.md`。

## 0. 專案常數

| 項目 | 值 |
|---|---|
| 專案資料夾 | `wasteland-ol/`（GitHub Pages repo 的子資料夾，與 `futaba-bookshelf/` 平行） |
| 開發分支 | `wasteland-ol`（從 main 長出；雙葉走 `futaba-bookshelf`，不歸這裡碰） |
| 成品 zip | `wasteland-ol-vX.X.zip` |
| zip 內部頂層資料夾 | 固定 `wasteland-ol/` |
| 全域命名空間 | `WOL`（`assets/js/version.js` 內 `WOL.VERSION`、`WOL.BUILD`） |
| localStorage 存檔鍵 | `wol_save_v1` |
| 版本錨點 | `index.html` 狀態列的 `>vX.X<` |
| 版本 tag | `wasteland-vX.Yz`（annotated，指向該版本的 commit，穩定版才打） |
| 線上位置 | `https://ting-aoi.github.io/wasteland-ol/` |

## 1. 鐵律（違反＝事故）

1. **內容資料一律由 Ting 提供**：怪物表、道具表、地點表、配方表**不得生成佔位內容**。
   資料表可以是空的（介面會顯示「內容資料未載入」），但不能塞假貨充數。
   `test/fixtures/` 底下的假怪物是**測試專用**，不得搬進 `assets/data/`。
2. **核心邏輯零 DOM**：`rules / state / time / explore / combat / content` 六個模組必須能在
   沒有任何瀏覽器全域的 Node 環境 `require` 起來。碰 DOM 的只有
   `storage / ui / pages / app` 四個。`test/run.js` 有子行程斷言把關。
3. **扁平兩層導航**：`LAYER = { shelter:1, 其餘全部:2 }`。任何頁按返回＝回避難所，不做多層堆疊。
4. **更新機制不得退化**：`index.html` 永遠走網路 ＋ 全資產 `?v=BUILD` 版本戳（雙保險）；
   SW 註冊帶 `updateViaCache:'none'`；設定頁有強制更新鍵、網址 `/#update` 也能觸發。
5. **bump.py 版本錨定 `>vX.X<`**：HTML 註解等處不得出現同格式字串，否則會被誤抓。
6. **整數百分比疊加**：飢渴等 debuff 必須「先把百分比相加、再一次套用」
   （`floor(base × (100 − Σpct) / 100)`），**嚴禁逐項浮點連乘**——會累積誤差。
7. **存檔帶 `saveVersion`，不相容即丟棄**，不寫遷移程式。
8. **localStorage 鍵一律帶 `wol_` 前綴**：與雙葉書庫同 origin 共存，沒前綴會互相污染。
9. **確認後執行**：重大設計先提案、Ting 核可才動工。
10. **跨界問題要提出、不要自己動手**（Ting 2026-08-10 確認）：發現別的專案或共用檔案
    （如根目錄 `BRANCHES.md`）有錯誤或不一致時，**回報給 Ting 讓他決定**，
    既不默默略過、也不自行修改。有跨界需求時 Ting 會明確授權。

## 2. 設計系統

結構沿用雙葉書庫、**配色是廢土自己的**（鏽鐵／塵沙／輻射綠）：

- **雙主題共用元件，只換變數**。日＝正午塵沙（`--paper:#e5ddce`／`--rust:#9c5730`）；
  夜＝廢墟夜營（`--paper:#15171a`／`--rust:#cf7a42`）。夜間不得另寫一份元件樣式。
- `--steel` 是頂欄／側欄專用色，**日夜恆深**，不隨主題翻轉。
- **動效 token**：`--dur-fast/.13s`、`--dur/.22s`、`--dur-slow/.34s`、`--ease`、`--ease-spring`。
  切頁 `pageEnter` **只動 transform/opacity**；統一按下回饋 `:active{transform:scale(0.965)}`；
  **禁止 `transition:all`**（測試會擋）；全部受 `prefers-reduced-motion` 管制。
- **字體三角色**：LXGW WenKai TC（手寫＝倖存者筆記：logo／頁標／事件日誌／地點名／敵名）、
  JetBrains Mono（儀表數字：`.stat-num`、`.readout`、狀態列）、Noto Sans TC（介面）。
  `.stat-num` **單一定義**，勿再出現第二條被級聯覆蓋。
- **SVG 圖示**：內嵌 sprite（`#i-<name>`），線條 1.7／圓端點／24 網格；
  `svg.ic` 尺寸吃 `font-size`、顏色吃 `currentColor`（雙主題免分版）。
  JS 端用 `WOL.icon(name)`——**只能走 innerHTML，textContent 塞不進去**。
  測試有孤兒圖示掃描，引用未定義的名字會轉紅。

## 3. 怪物 SVG 繪圖規範（等有怪物內容時適用）

- 用**貝茲曲線剪影**畫法，**禁止幾何圖形拼貼**（已被否決為醜）。
- 蟹類：三對六隻步足＋兩螯，數量不得錯。
- 四足獸必須畫出**遠側腳**，不可只畫近側兩腳。
- 棲息類（如獵鷹）腳必須接觸棲木，不可懸空。
- 兔類注意身形比例，避免呆板方塊感。

## 4. 開發流程

```bash
cd wasteland-ol
# 1) 改完先過語法
for f in assets/js/*.js; do node --check "$f" || echo "FAIL $f"; done
python3 -c "s=open('assets/css/main.css').read(); assert s.count('{')==s.count('}')"
# 2) 跑回歸測試（改功能請補一條對應斷言）
node test/run.js
# 3) 寫 CHANGES.md → 進版打包
python3 bump.py debug|minor|major
# 4) 驗證成品
python3 ~/.claude/skills/ting-projects/scripts/verify_zip.py wasteland wasteland-ol-vX.X.zip
```

- 懷疑測試無效時用**故障注入**驗證：故意把程式改壞，確認對應斷言會轉紅。
- 臨時 smoke test 檔**打包前必須刪除**（`test_*.js`、`*_test.js` 已列入打包排除，但仍別留）。
- 版本號：小修字母遞增（v0.1 → v0.1a）；功能版次版號遞增（v0.1 → v0.2）；
  大版本 `major` 需 Ting 確認。
- **穩定版打 tag**：`git tag -a wasteland-vX.Yz <該版本的 commit> -m "…"`。
  ⚠️ **AI 工作階段推不上去**：`git push origin <tag>` 會被 GitHub 憑證層擋下（403，
  `refs/heads/*` 可寫、`refs/tags/*` 不可寫；egress proxy 的 `recentRelayFailures` 是空的，
  證明不是網路政策）。MCP 的 GitHub 工具也只有唯讀的 `get_tag`／`list_tags`。
  **別再重試或想繞路——打好本機 tag，把 tag 名與完整 SHA 交給 Ting 推。**

## 5. 部署（雙管道）

1. **GitHub Pages**：推 `wasteland-ol` 分支 → PR 改 ready → **自動合併進 `main`**，
   線上版隨即更新（Ting 2026-08-10 指示，**僅限廢土**；雙葉仍由 Ting 親自按）。
   仍走 PR 不直推 main，為的是留下可回溯的 diff。
   **沒有人再逐次把關 diff 了，推之前務必跑完測試與差異檢查。**
   分支樹裡的 `futaba-bookshelf/` 一行都不要動——刪掉它，合併後雙葉會從線上站台消失。
   完整規則見 repo 根目錄 `BRANCHES.md`，推送前必驗見 `AI-CONTEXT.md` §4。
   （zip 被 `.gitignore` 排除不入庫。）
2. **shttps**：解壓 zip 覆蓋部署目錄 → 開頁面走一次 `/#update`。

存檔存在使用者瀏覽器；shttps 只是手動備份的去處（`<base>/save/save.json`），
`save/` 目錄不入庫。
