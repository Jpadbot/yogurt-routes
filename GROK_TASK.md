# GROK_TASK：yogurt-routes v1 路徑 A

只准改 `/workspace/yogurt-routes` 這個資料夾。不准讀 `/workspace/notes/`。不准改其他專案。

## 目標
香港自製乳酪材料採購推薦手機網頁（繁中）：
- 輸入位置＋可編輯材料清單
- 輸出四路線：高價／中價／低價／方便；各含估計總價、門市或組合、距離、覆蓋；主方案不可行時給次優替代
- 價格：已抽消委會 OPW 子集於 `data/opw-subset.json`（勿發明價格；缺口標「暫無公開參考價」）
- 距離：用 `data/opw-subset.json` 內人手門市座標＋可選地政 ALS `https://www.als.gov.hk/lookup`（若 CORS 擋則僅用預設地區）
- 署名消委會／DATA.GOV.HK；標參考價、時效、非庫存保證
- Phone-first；**禁止** viewport `maximum-scale=1` / `user-scalable=no`
- 不准爬超市、不准代註冊、不准保證有貨

## 交付
- `index.html`（可加 `data/`、CSS/JS 同夾）；Pages 可放
- `evidence/DECISIONS.md`：對應邏輯、OPW 資料日期
- verify-phone-html PASS（不加 `--game`）
- 可選 `.nojekyll`

現有：`PRODUCT.md` `TICKET.md` `data/opw-subset.json`
