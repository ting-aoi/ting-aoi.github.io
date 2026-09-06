# 雙葉書庫 Android 版

把整個網頁應用與一個迷你檔案伺服器打包成獨立 APK，不需要另外執行 shttps。

## 架構

```
MainActivity          WebView 外殼：直式鎖定、檔案選擇（匯入）、存檔橋接（匯出）
  └─ FileApiServer    只監聽 127.0.0.1，提供與 shttps 相同的 /api/file/* 介面
       ├─ 網頁資產    讀自 APK 內的 assets/www/（建置時由專案根目錄組裝）
       └─ data/       讀寫 App 專屬目錄，網頁端程式碼完全不必修改
```

**資料位置**：`Android/data/tw.ting.futaba.bookshelf/files/data/`
可用檔案管理器直接取出每日備份；**解除安裝會一併刪除，請定期匯出**。

與網頁版的差異僅三處，皆由建置流程自動處理：字體改為內建、停用 Service Worker、
匯出改走原生存檔。同一份網頁原始碼同時支援兩種環境。

## 首次設定（只需一次）

APK 必須簽章才能安裝，且**日後升級必須用同一把金鑰**，否則只能先解除安裝
（資料會消失）。金鑰放在 GitHub Secrets，不進版本庫。

在 GitHub repo 的 **Settings → Secrets and variables → Actions → New repository secret**
新增四項：

| 名稱 | 值 |
|---|---|
| `KEYSTORE_BASE64` | 見專案根目錄 `keystore.base64.txt` 的整行內容 |
| `KEYSTORE_PASSWORD` | `futaba-bookshelf` |
| `KEY_ALIAS` | `futaba` |
| `KEY_PASSWORD` | `futaba-bookshelf` |

設定完成後**請刪除 `keystore.base64.txt`**（該檔已列入 .gitignore，不會被推送，
但留在本機仍有外流風險）。金鑰有效期 30 年。

## 取得 APK

推送到 `main` 後，GitHub Actions 會自動建置：
**Actions → 最新一次執行 → Artifacts → `futaba-apk`** 下載後解壓即可安裝。
也可在 Actions 頁面用 **Run workflow** 手動觸發。

首次安裝需在系統設定允許「安裝未知來源應用程式」。

## 資料搬遷（自舊有 shttps 版）

1. 在原本的網頁版：功能 → 備份 → 匯出全部，取得 zip
2. 安裝 APK 並開啟
3. 功能 → 備份 → 匯入全部，選擇該 zip

匯入會重建索引，不需要手動處理 `index.json`。

## 本機建置（選用）

需 Android SDK 與 JDK 17：

```bash
# 先組裝網頁資產（同 CI 流程）
DEST=android/app/src/main/assets/www
mkdir -p "$DEST" && tar cf - --exclude=./android --exclude=./.git --exclude=./.github \
  --exclude=./test --exclude=./data --exclude='*.zip' --exclude='*.md' \
  --exclude=./bump.py --exclude=./LICENSE . | (cd "$DEST" && tar xf -)
cp android/fonts/fonts-local.css "$DEST/assets/css/fonts.css"
mkdir -p "$DEST/assets/fonts" && cp -r android/fonts/files "$DEST/assets/fonts/"
rm -f "$DEST/sw.js"

cd android && gradle assembleDebug
```

## 伺服器測試

`FileApiServer` 為純 Java 標準函式庫實作，可脫離 Android 直接測試：

```bash
cd android/server-test
javac -d out ../app/src/main/java/tw/ting/futaba/bookshelf/FileApiServer.java ServerTest.java
java -cp out ServerTest      # 25 項：上傳/下載/列表/刪除/建目錄/路徑逸出防護/資產代管
```
