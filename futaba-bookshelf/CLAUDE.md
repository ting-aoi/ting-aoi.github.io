# CLAUDE.md — 給 Claude Code 的專案指引

繁體中文溝通。動工前先讀 `AI-CONTEXT.md`（完整架構、設計系統、逐頁要點）；本檔只寫
**在本機／CI 環境實際操作時需要知道的事**。

## 專案是什麼

雙葉書庫 Futaba — 個人書評 PWA。vanilla JS、無框架、無建置流程、零相依套件。
兩種部署形態，共用同一份網頁原始碼：

| 形態 | 說明 |
|---|---|
| 網頁版 | 放進 shttps 服務目錄，瀏覽器開 `localhost:8080` |
| APK 版 | `android/` 內的 WebView 殼 + 內建迷你檔案伺服器，獨立運作 |

## 鐵律（違反＝事故）

1. **書櫃功能永久放棄** — `shelfDict`、`book.shelves`、書櫃 chips 一律不得重新引入。
   注意「書庫」(library，整版書單頁) 與「書櫃」無關，勿混淆。
2. **扁平兩層導航** — `LAYER = { home:1, 其餘全部:2 }`，任何頁返回即回主頁。
3. **更新機制不得退化** — index.html 永遠走網路 + 全資產 `?v=BUILD` 戳；`/#update` 強制更新。
4. **側欄與頂欄永遠深色**（`--leather`），不隨日夜翻轉。
5. **APK 簽章金鑰不可更換** — 換了使用者只能解除安裝，資料全失。
6. **網頁端不得為 APK 分岔** — 環境差異一律由建置流程或 `window.FutabaNative` 判斷處理。

## 必跑的驗證

```bash
node test/run.js          # 網頁回歸測試（124 條，涵蓋歷次修過的 bug）
```

改動 `android/app/src/main/java/.../FileApiServer.java` 後**務必**加跑：

```bash
cd android/server-test
javac -d out ../app/src/main/java/tw/ting/futaba/bookshelf/FileApiServer.java ServerTest.java
java -cp out ServerTest   # 25 項：上傳/下載/列表/刪除/建目錄/路徑逸出防護/資產代管
```

修好功能後**要在 `test/run.js` 補一條對應斷言**。懷疑測試無效時用故障注入驗證：
故意把修好的東西改回壞的，確認測試會失敗。

## 版本與打包

```bash
python3 bump.py show                 # 查看版本
python3 bump.py debug|minor|major    # 進版並打包（debug=v3.3→v3.3a）
```

`bump.py` 會自動改 index.html 版號、`sw.js` 的 BUILD、8 處 `?v=` 資產戳、
`assets/changelog.json`（內容取自 `CHANGES.md`，用完清空），並輸出網頁部署 zip
（排除 `android/`、`.github/`、`data/`）。版本偵測錨定 `>vX.X<`，其他地方勿出現同格式字串。

## 這份原始碼住在哪（v3.8 起）

併入 `ting-aoi/ting-aoi.github.io` 這個一站多專案 repo 的 `futaba-bookshelf/` 子資料夾
（另一個專案是廢土 `wasteland-ol/`）。動 git 前先讀 repo 根目錄的 `BRANCHES.md`。

- 開發於分支 `futaba-bookshelf`，進版後自動 `--no-ff` 合併進 `main`。
- **CI workflow 在 repo 根目錄** `.github/workflows/build-apk.yml`（GitHub 只認那裡），
  路徑都帶 `futaba-bookshelf/` 前綴，且只在本專案檔案變動時觸發。
- 只碰自己的資料夾，一行都不要動 `wasteland-ol/`。

## 目錄

```
index.html sw.js manifest.json    網頁本體
assets/css/main.css               全部樣式（變數層日夜雙主題）
assets/css/fonts.css              字體來源抽換層（APK 建置時被替換為內建字體）
assets/js/                        storage / ui / pages / editor / settings / search / app
test/                             回歸測試（run.js + dom-stub.js）
android/                          Android 專案（見下）
.github/workflows/build-apk.yml   CI：跑測試 → 組裝資產 → 簽章 → 上傳 APK
```

## Android 部分

- `MainActivity.java` — WebView 殼：直式鎖定、`onShowFileChooser`（匯入選檔）、
  `FutabaNative.saveBase64`（匯出存檔，因 WebView 不支援 blob: 下載）。
- `FileApiServer.java` — 零第三方相依。傳輸層是同套件的 `MiniHttp.java`（`java.net.ServerSocket`）。
  **不要改回 `com.sun.net.httpserver`**：那是 JDK 模組，Android 執行期沒有，桌面測試會過但 APK 編譯必炸（v3.8 踩過）。
  只綁 `127.0.0.1`，同時代管 APK 內網頁資產（`assets/www/`）與 App 專屬目錄的 `data/`。
  介面與 shttps 完全一致，因此網頁端 `storage.js` 一行都不必改。
- 網頁端判斷 APK 環境：`window.FutabaNative` 存在即是。
- 建置時的三處差異（都在 workflow 裡）：字體換 `android/fonts/fonts-local.css`、
  刪 `sw.js`、資產複製到 `android/app/src/main/assets/www/`。
- 資料位置：`Android/data/tw.ting.futaba.bookshelf/files/data/`。

**尚未實機驗證**：Android 那層（Gradle 設定、Manifest、WebView 行為）從未編譯過，
CI 首次執行可能有錯。修時請優先懷疑：AGP/Gradle 版本相容、`compileSdk`/相依版本、
資源檔缺漏。`FileApiServer` 已用真實 HTTP 請求測過，優先不動它。

## 環境需求

- Node.js（測試）、Python 3（bump.py）、JDK 17（伺服器測試；完整 APK 建置另需 Android SDK）

## 溝通慣例

使用者 Ting 以編號列需求。模糊處先問再做，重大設計先提案、確認後才實作。
每次交付附「根因說明 + 驗證結果」。出錯直接認錯並說明根因，不要辯解。
諮詢類問題給選項 + 推薦，而不是直接動手。
