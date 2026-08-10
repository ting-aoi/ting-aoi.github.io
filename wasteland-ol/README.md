# 廢土 Online（wasteland-ol）

末日生存管理遊戲。瀏覽器回合制，vanilla JS，無建置步驟，靜態託管即可跑。

**線上版**：<https://ting-aoi.github.io/wasteland-ol/>

## 玩法概要

在避難所撐過一天又一天。時間分早（2 AP）／中（3 AP）／晚（1 AP），手動推進；
過夜會吃掉食物與水，斷糧斷水就掛飢餓與口渴，屬性直接被砍。
出門探索能撿補給，也會撞上怪物——戰鬥有攻擊／戒備／喘息／撤退四個選擇，
撤退成功率隨你和對方的速度差浮動。敗北不會死，但會被拖回避難所。

## 目前版本

**v0.1**：五個系統（屬性／時間／探索／戰鬥／背包）的引擎與介面都完成了，
但**怪物、道具、地點三張內容表還是空的**，所以還不能真的玩。
資料表填好就能直接開打，程式不用改——欄位說明見
[`AI-CONTEXT.md`](AI-CONTEXT.md) 第 2 節。

## 技術

- vanilla JS、全域 `WOL` 命名空間，無相依套件、無打包器
- **核心邏輯零 DOM**：`rules / state / time / explore / combat / content` 六個模組
  能在 Node 直接 `require`，UI 層才碰 DOM
- 遊戲數值全部外置到 `assets/data/rules.*.json`，調平衡不用改程式碼
- 可安裝 PWA：Service Worker 快取版本化，離線可玩
- 存檔在瀏覽器 localStorage（`wol_save_v1`），另可手動上傳／還原到自架 shttps，
  或匯出入 JSON 檔

## 開發

```bash
cd wasteland-ol
for f in assets/js/*.js; do node --check "$f"; done   # 語法
node test/run.js                                       # 回歸測試（89 條）
python3 bump.py show                                   # 版本
python3 bump.py debug                                  # 進版並打包
```

工程慣例與鎖定決策見 [`CONVENTIONS.md`](CONVENTIONS.md)。
