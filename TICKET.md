# 工作單：011 yogurt-routes v1（路徑 A）

路徑：只准改 `/workspace/yogurt-routes`  
分支：`feat/v1-opw-routes`

## 做什麼
香港自製乳酪材料採購推薦手機網頁：位置＋材料清單 → 高／中／低／方便四條路線＋替代；價格以消委會格價資訊通（OPW）開放 JSON／CSV 為主；門市距離用 OSM 及／或人手門市名單＋地政地理位置 API；缺口材料標「暫無公開參考價」。清楚標示來源、時效、非庫存保證。實用完整對照 UI，非極簡殼。

## 怎樣算做完
- [ ] 手機可開：輸入／定位位置、編輯材料清單
- [ ] 至少四路線：高價、中價、低價、方便；各顯示估計總價、門市（或組合）、距離、覆蓋
- [ ] 主方案不可行時有次優替代
- [ ] 署名消委會／DATA.GOV.HK；標參考價與限制
- [ ] Phone-first（單檔或可 Pages）；verify-phone-html（非遊戲，勿鎖縮放）
- [ ] evidence/DECISIONS.md（對應邏輯、資料日期）

## 不要做
不准讀 notes 當抄碼（可讀本專案）；不准改其他專案；不准爬超市／代註冊；`--cwd /workspace/yogurt-routes`；新分支。

## 交回
Pages 或可玩連結、verify、截圖、commit、DECISIONS。
