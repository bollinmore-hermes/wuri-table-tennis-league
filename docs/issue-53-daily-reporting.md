# Issue 53：裁判回報與賽果核對

## 範圍與界線

- 一個賽季／日期共用一個匿名能力連結，`/referee/#token=…`；fragment 不加入 HTTP 路徑，並設定 no-referrer。
- 裁判回報只寫入獨立的回報／請求表；不寫正式結果，不發布，不辨識裁判身分。
- 有效 admin/scorer 在登入後的「賽果核對」卡片確認、補登或更正；scorer 可改他人未鎖定結果。連結管理及鎖定只允許 admin。
- 場次卡片只有一個比分儲存入口；候選是 radio，單筆預選、衝突不預選，手改下拉切換為自行調整。舊比分 popup 已移除，賽程管理不再提供比分編輯。
- `014_daily_score_reporting.sql` 已在 Test 套用；Production 未套用，PR 維持 Draft，Issue 保持 Open。
- 本次不修改出場序原表。實際原檔／產生器未提供，僅交付可下載／列印的日期 QR 區塊。

## 儲存與交易

`confirm_reported_result` 以同一交易執行既有正式比分寫入、回報處理狀態、請求收據及稽核；關閉回報由正式結果存在與否決定，不改動同日其他場次。保留原始回報、採用來源與正式更正前後資料。

匿名提交依當日連結與場次 row locks 序列化，合法比分、版本、角色／鎖定、原請求識別都由伺服器檢查。相同比分保留單一回報，不同比分保留候選。每個日連結每 10 分鐘最多 120 次新提交（原請求重送不增加次數）。這是 capability 級別限流，持有連結的人仍可能消耗共享額度；不是已驗證裁判身份或 IP 級反濫用系統。

所有正式儲存先讀回原請求收據，再回報已確認儲存；載入失敗不撤銷成功寫入。未確認的 transport failure 凍結原場次、比分及請求，先查證才能重送。匿名返回清單也受凍結限制。連結換發結果不確定時亦禁止再次 mutation，先重新查核。

儲存、鎖定及公開發布為獨立操作。沿用既有 snapshot／發布工作流，不因匿名回報自動公開。草稿只保存於目前頁面記憶體，重新整理不保證保留；不將私人資料或憑證存為草稿。

## 驗證與證據

- `npm test`：完整回歸，包括正式 artifact allowlist、卡片 handler、裁判 handler、連結 handler 與網路例外。
- `node scripts/verify-reporting-mutations.cjs`：隔離複本恢復四種錯誤行為，確認新測試會失敗，原始碼不被修改。
- `node scripts/verify-reporting-authorization-mutation.cjs`：僅對 Test，在可回滾交易中將 queue guard 替換為 NULL-unsafe predicate，確認權限回歸測試抓到，再驗證正常 guards；不是 Production 操作。
- `npx --no-install supabase db query --linked --project-ref vppjcjfbcoxzofcuxmzz --file scripts/verify-daily-reporting.sql`：真實 PostgreSQL 角色 context、admin/scorer／無角色、跨日／跨季、去重／衝突、限流、來源與版本、鎖定與交易／Audit；全部 fixture changes 回滾。這不等於真實 scorer JWT 驗證。
- `node scripts/verify-daily-reporting-api.cjs`：真實 Test admin Auth、匿名 PostgREST、直接表存取拒絕、正式公開 projection hash 不變。每次執行留下一個獨立合成賽季、4 隊、4 場及回報資料。
- `node scripts/verify-daily-reporting-browser.cjs [artifact-base]`：真實 Chrome、Auth/RPC、卡片操作／讀回、360/390/768/1280 寬度、QR canvas 解碼及實際剪貼簿讀回。
- `docs/evidence/issue-53/` 是 pre-commit 本機 artifact 的功能證據，並非部署 commit 證明。確切來源 SHA、Test Actions run 與 live byte comparison 記錄在 PR 的部署留言。
- Browser verifier 僅將 `seasonCode` 指向獨立合成賽季；介面、Auth、網路與 DB 均真實。截圖顯示合成队伍與遮罩管理者名稱，不保存 token／帳密。
- Hosted 再驗證可用 `REPORTING_EVIDENCE_DIR=.private/hosted-evidence`，避免將未清理的遠端／憑證檔納入提交。日連結 token 只在 gitignored `.private/issue53-fixture.json`；不可分享或提交該檔。
- API/browser 驗證資料與稽核保留在 Test，不自動刪除；browser 完成後停用合成日期連結。既有賽季資料不得拿來自動試寫。

### 仍需人工驗收

- 真實受邀 scorer 在 hosted Test 的登入／操作；目前 SQL role context 與 UI handler 已驗證，未宣稱 scorer JWT／瀏覽器全流程完成。Test 目前沒有停用 profile，因此停用後保留舊 JWT 的拒絕路徑只有既有授權契約覆蓋，尚未做真實帳號操作；不為測試停用既有使用者。
- 手機實機掃描下載的 QR、實際列印與紙張可讀性；Chrome 解碼成功不能代替實物驗收。
- 出場序原檔整合，等待原檔及另外批准。
- Production migration、merge、tag 與發布，都未在本次批准範圍。

## Test 人工操作清單

入口：`https://bollinmore-hermes.github.io/wuri-table-tennis-league-test/admin/`。

1. admin 登入後開「賽果核對」；日期／組別／搜尋取交集，直接在卡片操作，數字不得被箭頭遮住。
2. 開「回報連結管理」，選一個 Test 比賽日期；產生、複製及下載 QR，重複取用應保持相同連結。用手機掃碼確認免登入選場；不要對已確認場次要求一般回報。
3. 若送一筆測試回報，應顯示待核對、尚非正式結果；管理者可看到候選，選擇／手改下拉不應立即存成正式結果。此動作會留下 Test 回報，不可把它當作正式賽事資料。
4. 若要人工驗證儲存，可選一場已有正式结果且未鎖定的 Test 場次，先記下原比分與備註；改成另一個合法比分並按「儲存更正」，應看到場次與比分的持續回饋。立刻還原原比分與備註，再按「儲存更正」。不按鎖定；無須手動發布。兩次更正均留下稽核，且既有自動發布可能暫時將更動公開在 Test 網站，與 Production 無關。
5. scorer 登入應只可核對／更正未鎖定結果，不可管理帳號／球隊／賽程／連結；已鎖定場次不可更正。

回覆格式：`手機型號／瀏覽器；掃碼：通過或問題；卡片操作：通過或問題；scorer：通過或未測；如有更正：已還原／未操作`。

## 相依套件與回復

新增 `qrcode@1.5.4`（本機 QR，無外部 QR service）；開發驗證使用 `esbuild@0.25.12`、`jsqr@1.4.0`、`linkedom@0.18.12`。QR browser bundle 與 MIT license 一併保存；`node scripts/build-report-qr.cjs` 可重建。既有套件未因本功能任意升級。

Test frontend 可重新 dispatch 先前已驗證、與目前 schema 相容的 source SHA 回復；新增表可保留，不在回復時破壞稽核。Production 只能走另行批准的 migration／tag-only 正式發布流程。
