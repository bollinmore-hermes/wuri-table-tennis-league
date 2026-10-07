# Google OAuth 登入（Issue #52）

## 核准規則與界線

- 受邀且啟用的帳號，可直接以相同且由 Google 驗證的 Email 首次登入，不必先開啟邀請信。
- 身分連結完全由 Supabase Auth 處理；程式不依 Email 搬移 profile、建立角色、或採信 Google user_metadata 的角色。
- 權限繼續依 auth.uid() 對應的 profiles、active 狀態、伺服器 RPC 與 RLS 決定。
- 保留 Email／密碼、邀請連結及密碼重設；不開放自行註冊取得管理權限，不提供不同 Email 手動綁定。
- Google 提供者未啟用或無法讀取設定時，Google 按鈕停用，密碼登入仍可使用。
- OAuth 採 PKCE，由 SDK 自動且僅一次交換 callback code。邀請／重設的 implicit link 仍交由同一 SDK 處理。
- 本次不新增 migration、不建立測試帳號、不寄邀請信、不更動 Production。Test frontend 部署不代表 Google 真實登入已驗收。

## 建立 Google OAuth Client（由帳號擁有人操作）

1. 在 Google Cloud Console 選擇要使用的專案，進入 Google Auth Platform。若沒有專案，先建立專案；專案／組織選擇由擁有人決定。
2. 設定 Branding、Audience 與聯絡信箱。個人 Gmail 通常需要 External Audience；若保持 Testing，將實際驗收的 Google 帳號加入 Test users。不要將 Google 的 Test users 當成應用程式授權名單。
3. Data Access 僅要求登入所需的 openid、email、profile，不要求 Gmail、Drive 或離線存取權限。
4. Clients → Create client → Web application，建議命名 Wuri TT Test。
5. Authorized JavaScript origins：`https://bollinmore-hermes.github.io`。
6. Authorized redirect URIs（這是 Google → Supabase，不是網站的 /admin/）：
   `https://vppjcjfbcoxzofcuxmzz.supabase.co/auth/v1/callback`
7. Client ID 與 Client Secret 只輸入 Supabase Test 的 Authentication → Sign In / Providers → Google，再啟用 Google。不要貼到 Telegram、提交至 Git、或放入 browser config。
8. 不要開啟 Skip nonce checks 或 Accept accounts without an email address。不啟用不同 Email 的手動身分連結。

## Supabase Test Redirect 設定

保留既有 Site URL、邀請與重設 redirect，額外允許精確的 OAuth callback：

`https://bollinmore-hermes.github.io/wuri-table-tennis-league-test/admin/?oauth=google`

保留禁止自由註冊。若尚未接受邀請的 Google 帳號被供應者拒絕，先核對邀請 Auth user、Google email verification 與 Supabase linking 行為；不要以開放註冊、寫入 profile 或變更角色作為修補。

Google Client 與 Supabase redirect 是不同設定：前者回 Supabase，後者由 Supabase 回網站。

## 驗收

完成供應者設定後，重新開啟 Test 後台：
`https://bollinmore-hermes.github.io/wuri-table-tennis-league-test/admin/`

1. 已受邀 Google 帳號：按「使用 Google 登入」，選擇邀請 Email，回到 Test 後台；角色與原 profile 一致。
2. 尚未接受邀請的帳號：可直接 OAuth 登入；驗證 Auth user ID、profile 及角色未重複／升級。此項須另外取得可用測試身分，不挪用真人帳號。
3. 未受邀 Google 帳號：應被 Auth 的 signup policy 拒絕，或於 get_my_profile 被拒絕並清除本地 session；不能執行管理 RPC。
4. 停用、撤銷授權：不能因 OAuth 恢復權限；含已發 JWT 的伺服器 RPC 拒絕。
5. Google 取消、callback 失效：顯示安全訊息，網址不殘留 code/token，密碼登入仍可使用。
6. 原有密碼登入、邀請與 recovery 連結：仍有效；recovery 顯示設定密碼畫面，不被自動恢復管理後台蓋掉。
7. 在邀請前後及 OAuth 前後核對 auth.users、auth.identities 與 profiles，不能單靠前端登入成功推論帳號連結安全。

自動測試使用 SDK/RPC 模擬驗證程式契約，不能取代 Google 真實驗收。供應者、信件送達、未接受邀請帳號連結及不同角色真實 OAuth 驗收未完成前，不關閉 #52、不合併或發布正式版本。

## 參考資料

- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/auth-identity-linking
- https://supabase.com/docs/guides/auth/redirect-urls

## 回復

Test frontend 可部署至前一個已驗證 source SHA；不回復／刪除真人 Auth 身分。若要停用 Google，僅停用 Test provider，不影響 Email／密碼。Production provider 與發布另外核准。
