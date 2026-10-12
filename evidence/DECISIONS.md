# DECISIONS — yogurt-routes v1（路徑 A）

## 產品定案
- 路徑 A：消委會 OPW 開放數據為主；缺口標「暫無公開參考價」；門市距離用手名人手示範點＋可選地政署 ALS 地理編碼。
- 不做超市網站爬蟲、不做帳號註冊、不做庫存／成交價保證。

## OPW 資料
- 來源 URL：`https://online-price-watch.consumer.org.hk/opw/opendata/pricewatch.json`
- HTTP `Last-Modified`：`Sun, 11 Oct 2026 05:00:01 GMT` → **資料時效標示：2026-10-11 13:00 HKT**
- 本機擷取：2026-10-12 HKT → `data/opw-subset.json`（乳酪相關角色子集，非整庫 2.7MB）
- 署名：消費者委員會格價資訊通（OPW）／DATA.GOV.HK

## 材料對應邏輯
1. 使用者清單項綁定 `role`（如 `milk_fresh`、`yogurt_plain`）或 `gap:*`。
2. `gap:*` 與 OPW 無命中角色 → UI 標「暫無公開參考價」，**不進入合計金額**。
3. 有價角色：自子集 `products[]` 用啟發式挑代表商品（鮮奶偏好約 1L；菌種偏好希臘／純／原味較大包裝；其餘取較低 `minPrice`）。
4. 各超市連鎖（百佳 PARKNSHOP、惠康 WELLCOME、Jason's、AEON）讀該商品在 OPW 的 `prices[]`；缺價則該連鎖「未覆蓋」。

## 四路線
- **低價**：在可行方案（必買皆有參考價）中估計總價最低；若無完全可行，改用覆蓋率最高再比價。
- **高價**：同上池中總價最高。
- **中價**：總價排序的中位方案。
- **方便**：最近示範門市距離優先（兩店組合加 0.8km 懲罰），同分比覆蓋再比價。
- **次優替代**：同排序下下一相異方案。
- **組合**：兩連鎖互補缺價 SKU，距離為兩間最近分店距離之和（示範用）。

## 距離
- 示範門市：`data/opw-subset.json` → `stores[]`（人手整理之公開地標近似座標，非官方門市 API）。
- 地區預設：`districts[]`。
- 可選：瀏覽器呼叫 `https://www.als.gov.hk/lookup`（地政總署）；若 CORS 失敗則僅用預設／手動經緯度。

## UI／發佈
- Phone-first；viewport **不**鎖縮放（`width=device-width, initial-scale=1, viewport-fit=cover`）。
- 靜態頁：`index.html` + `app.js` + `data/opw-subset.json` + `.nojekyll`。
