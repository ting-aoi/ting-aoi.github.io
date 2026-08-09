# 雙葉書庫 Futaba

個人書評記錄 PWA — 記錄你讀過的每一頁，聽過的每一聲。

以 vanilla JavaScript 打造的單頁應用，資料存放於自架的本地檔案伺服器，無雲端、無帳號、無追蹤。專為手機（Android + Brave）的閱讀記錄習慣設計，涵蓋文字閱讀與有聲書兩種形式。

## 線上展示

<https://ting-aoi.github.io/futaba-bookshelf/>

線上版是**可玩沙盒**：內建數則範例書評，可自由新增、編輯、刪除、搜尋——所有變動只存在你自己的瀏覽器（localStorage），不會上傳到任何地方。實際使用（資料持久化到檔案伺服器）請依下方「安裝」自架。

## 特色

- **書評管理** — 書名、作者、五星評分、閱讀進度、劇情簡介、個人心得、重要角色、備註
- **有聲書支援** — 聽書平台、配音類型、AI 配音、換 CV、聲音體驗等獨立欄位
- **完成度追蹤** — 自動判定每則書評的完整程度（✓ 完成／◇ 待補／◆ 缺漏）
- **書庫與搜尋** — 整版書單支援排序與多重篩選；搜尋支援 `書名`／`作者`／`#標籤`／`@人名`／`~內文`（全文搜尋簡介、心得、備註與角色描述）
- **標籤字典** — 標籤集中管理，可分組、改名、合併，使用中的標籤禁止刪除
- **統計分析** — 評分分佈、平台分佈、熱門標籤、作者作品彙整
- **琥珀廳主題** — 日夜雙主題（羊皮紙／深咖啡），手寫字體排版，燙金質感
- **離線可用** — Service Worker 快取，含字型；回收桶、每日自動備份、匯出匯入

## 環境需求

- [shttps](https://github.com/pfelipe/shttps) 或任何提供相同檔案 API 的本地伺服器（預設 `localhost:8080`）
- 現代瀏覽器（開發與測試環境為 Android + Brave）
- Python 3（僅開發時的版本工具需要）、Node.js（僅測試需要）

伺服器需提供以下 API：`/api/file/list`、`/api/file/upload`、`/api/file/download`、`/api/file/delete`、`/api/file/new-folder`。

## 安裝

```bash
git clone https://github.com/<你的帳號>/futaba-booknotes.git
```

將整個資料夾放進 shttps 的服務目錄，啟動伺服器後於瀏覽器開啟；建議「加入主畫面」以 PWA 形式使用。首次開啟會自動建立 `data/` 與 `data/books/`。

資料一律存放在本機的 `data/` 目錄，不會離開你的裝置。

## 資料結構

```
data/
├─ books/<id>.json        每則書評一檔
├─ index.json             書評索引（衍生資料，匯入時自動重建）
├─ settings.json          設定
└─ data.bak.<日期>.json   每日自動備份（保留最近數份）
```

## 開發

```bash
node test/run.js                  # 回歸測試（交付前必跑）
python3 bump.py show              # 查看目前版本
python3 bump.py debug|minor|major # 進版並打包
```

`bump.py` 會自動更新版本號、Service Worker 建置戳、資產版本參數、更新日誌，並輸出帶版本號的 zip。

修改功能後請於 `test/run.js` 補上對應斷言 — 該檔的每一條斷言都對應一個實際修過的問題，用於防止回歸。

專案慣例與架構說明詳見 [`AI-CONTEXT.md`](AI-CONTEXT.md)。

## 技術

無框架、無建置流程、無相依套件。`FT` 全域命名空間下分為七個模組：資料層、UI、頁面、編輯器、設定、搜尋、啟動與事件。樣式集中於單一 CSS 檔，以變數層實現日夜雙主題。

## 授權

MIT
