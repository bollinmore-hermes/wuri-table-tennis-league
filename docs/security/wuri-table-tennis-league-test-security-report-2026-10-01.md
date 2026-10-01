# 烏日桌球聯賽網站資安複查報告（第三版）

- **檢測目標**：`https://bollinmore-hermes.github.io/wuri-table-tennis-league-test/`
- **管理後台**：`https://bollinmore-hermes.github.io/wuri-table-tennis-league-test/admin/`
- **原始碼儲存庫**：`bollinmore-hermes/wuri-table-tennis-league`
- **原始碼檢測基準**：`5accb6e93222f4ffff40d2d233997a7b06343608`
- **基準提交日期**：2026-09-30
- **複查日期**：2026-10-01
- **Supabase Test project ref**：`vppjcjfbcoxzofcuxmzz`
- **檢測性質**：原始碼複查、自動化安全回歸測試、Test 環境唯讀 API／Auth 權限驗證

> 部署頁面本身沒有公開 Git commit metadata；因此可確認其 Test project identity、路由及實際載入資產，但無法只由 Pages 回應證明它與上述 commit 完全相同。正式驗收應另外保存 GitHub Actions workflow run ID 與部署 artifact digest。

---

## 一、總體結論

### 風險評級

**中度殘餘風險（Medium Residual Risk）**。

前次已知的高風險 DOM-based XSS、公開前台客戶端鑑權旁路、Mock Login 誤部署及直接資料表存取問題，在本次檢測範圍內皆有實質修復，並已有自動化回歸測試。

目前尚未降為低風險，主要原因如下：

1. 管理後台仍位於不支援自訂安全標頭的 GitHub Pages，缺少可由 HTTP response header 強制執行的 `frame-ancestors`。
2. Scorer 與 unprofiled 使用者已完成實際登入／拒絕驗證，inactive 身分也已確認為 profile inactive 加 Auth banned；但尚未測試「先取得 JWT、再停用帳號」的既有 token 情境。
3. 邀請 Email 送達、Test admin redirect、scorer 首次登入、角色限制及 unprofiled 拒絕均已驗證；密碼重設與完整寫入型 RPC mutation 測試仍未完成。
4. 已保存 `v0.4.1` commit、GitHub Actions run 與 GitHub deployment record；但 live artifact 本身仍沒有可供頁面自我識別 commit 的 deployment manifest。

### 已確認的主要安全成果

- 公開前端不包含比分寫入介面及可偽造的前端管理 session。
- 公開 renderer 不使用 `innerHTML`、`outerHTML`、`insertAdjacentHTML` 等 HTML 字串 sink。
- `seasons`、`matches`、`profiles`、`audit_logs` 等實體資料表禁止 anon 及 authenticated 瀏覽器直接讀取。
- 公開資料僅由 `get_public_league` RPC 提供。
- 管理 RPC 使用資料庫內 `profiles.role` 與 `active` 狀態再次授權，不信任瀏覽器 UI 狀態。
- invitation／user-management 的高權限完成 RPC 僅授權 `service_role`，一般瀏覽器 admin JWT 亦無法呼叫。
- Edge Functions 先驗證 Origin，再驗證 JWT 與 active admin profile。
- Test／Production 建置腳本會檢查 project ref，並拒絕把 `service_role` 或秘密材料寫入前端 artifact。

---

## 二、檢測範圍與限制

### 本次已檢測

1. 公開前端 DOM renderer 及部署 artifact allowlist。
2. 管理後台 Supabase Auth 初始化與角色控制。
3. migrations `004` 至 `007` 的函式授權、角色判斷、rate limit 及 audit 設計。
4. `invite-league-user` 與 `manage-league-user` Edge Functions：
   - Origin allowlist
   - Anonymous denial
   - JWT 驗證
   - active admin profile 驗證
   - service-role RPC 隔離
5. Test Supabase 實際 API：
   - anon 直接資料表存取
   - authenticated admin 直接資料表存取
   - public RPC
   - admin read-only RPC
   - service-only RPC browser denial
6. Test Edge Functions 的 CORS preflight、惡意 Origin 與匿名拒絕。

### 本次未執行

- inactive 帳號在停用前取得 JWT、停用後繼續呼叫 RPC 的既有 token 情境。
- 寫入型 RPC 的完整 mutation 測試。
- 密碼重設 Email 與 reset redirect 完整流程。
- 暴力登入、SMTP 配額及 CAPTCHA 實測。
- OWASP ZAP 或其他完整 DAST。
- 第三方雲端設定面的完整審查，例如 Supabase Auth password policy、MFA policy、redirect allowlist 實際值及 SMTP 設定。

未執行的項目不得視為已通過。

---

## 三、前次報告文字修正

### 1. DOM-based XSS

前次報告的「已完全修復」改為：

> 在本次檢測的公開 renderer、管理介面及既有惡意輸入回歸案例中，未發現可利用的 DOM-based XSS；原漏洞已修復並加入自動化回歸測試。

理由：不存在 `innerHTML` 並不等同永久不存在所有 XSS；仍需持續檢查動態 URL、屬性、SVG、Data URL、第三方套件及未來程式修改。

### 2. 公開前端檔名

實際公開程式為：

```text
assets/js/app.js
```

不是 `test_app.js`。

### 3. 管理後台來源檔

原始碼仍保留 `admin.html`。部署建置會：

1. 將 `admin.html` 複製至 artifact 的 `/admin/`；
2. 重新命名為 `/admin/index.html`；
3. 移除 artifact 中的 `/admin/admin.html`。

因此正確描述是「部署 artifact 不提供根目錄 `/admin.html`」，而不是「原始碼已移除 `admin.html`」。

### 4. 權限測試結論

匿名測試只能證明 anon 被拒絕，不能單獨證明 scorer、inactive、unprofiled 等 authenticated 狀態都被拒絕。本版報告將靜態合約、自動化測試及遠端實測分開記錄。

---

## 四、實際部署驗證結果

### 1. 路由及安全標頭

- `/`：HTTP `200`
- `/admin/`：HTTP `200`
- `/admin.html`：HTTP `404`
- HSTS：有
- CSP response header：無
- `X-Frame-Options`：無
- HTML CSP meta：無

GitHub Pages 回應中的 `Access-Control-Allow-Origin: *` 是靜態資產服務行為；它不會繞過 Supabase API 自身的資料庫授權，但仍不應被誤認為應用 API 的 CORS 設定。

### 2. 公開 RPC

匿名呼叫 `get_public_league`：HTTP `200`。

回傳摘要：

- 球隊：12
- 賽程：60
- 賽果：26
- 未發現 `id`、`user_id`、`updated_by` 等內部識別欄位

### 3. 直接資料表存取

anon 直接查詢以下資料表均回傳 HTTP `401`／PostgreSQL `42501`：

- `seasons`
- `matches`
- `profiles`
- `audit_logs`

Test admin 登入後，直接查詢以下資料表均回傳 HTTP `403`／PostgreSQL `42501`：

- `seasons`
- `profiles`
- `audit_logs`

這證明瀏覽器即使已登入為 admin，也必須透過受控 RPC，不可直接繞過函式介面讀取實體資料表。

### 4. 管理 RPC

anon 呼叫以下 RPC 均被拒絕：

- `get_admin_dataset`
- `get_my_profile`
- `get_admin_users`
- `import_league_data`
- `consume_user_invite_quota`
- `consume_user_management_quota`

Test admin 實際驗證：

- password sign-in：成功
- `get_my_profile`：成功，角色為 active admin
- `get_admin_dataset`：成功
- `get_admin_users`：成功
- 使用 admin browser JWT 呼叫 service-only quota RPC：HTTP `403`／`42501`

### 5. Edge Functions

對 `invite-league-user` 與 `manage-league-user` 的實際結果：

- 允許來源的 CORS preflight：HTTP `204`
- lookalike 惡意來源：HTTP `403`、`origin_not_allowed`
- 無 Authorization 的允許來源請求：HTTP `401`、`authentication_required`

### 6. Test identities 與邀請流程

本次透過既有 Edge Functions 建立三個去識別化用途的專用 Test identities，並完成資料庫 readback 與人工操作驗證：

- 三封 invitation 均由 Auth 接受，且操作者確認三封信均實際送達不同的 `+` recipient alias。
- Invitation redirect 正確回到 Test `/admin/`；scorer 後續重複開啟已使用連結時收到 `otp_expired`，但其 Auth 狀態已是 confirmed 且有成功登入紀錄，故判定原始邀請流程已成功完成。
- Scorer：confirmed、已登入、profile 存在、`role=scorer`、`active=true`，操作者確認權限表現正確。
- Inactive：profile 存在、`role=scorer`、`active=false`，且 Auth banned；尚未測試停用前取得的 JWT。
- Unprofiled：confirmed、已登入、Auth user 存在但無 application profile，管理存取已被拒絕。
- Audit readback：`invite_user` 3 筆、`update_user` 1 筆。

Password-reset Email 尚未執行。

---

## 五、授權矩陣

符號：

- **允許**：應成功
- **拒絕**：應回傳授權錯誤
- **限制**：只允許特定資料或條件
- **未遠端實測**：已有程式合約或單元測試，但尚未以該角色對 Test API 實際驗證

| 功能 | anon | 無 profile／inactive | scorer | admin | service role |
|---|---|---|---|---|---|
| `get_public_league` | 允許 | 允許 | 允許 | 允許 | 允許 |
| 直接讀取 base tables | 拒絕（已實測） | 拒絕 | 拒絕 | 拒絕（已實測） | 後端維運用途 |
| `get_my_profile` | 拒絕（已實測） | unprofiled 拒絕（已實測）；inactive 舊 JWT 未測 | scorer 允許（已實測） | 允許（已實測） | 非瀏覽器用途 |
| `get_admin_dataset` | 拒絕（已實測） | unprofiled 拒絕（已實測）；inactive 舊 JWT 未測 | 角色限制已人工確認 | 允許（已實測） | 非瀏覽器用途 |
| 儲存未鎖定合法比分 | 拒絕 | 拒絕 | 角色行為已人工確認；RPC mutation 未獨立測試 | 允許／未執行寫入 | 非瀏覽器用途 |
| 覆寫鎖定比分 | 拒絕 | 拒絕 | 角色行為已人工確認；RPC mutation 未獨立測試 | 允許／未執行寫入 | 非瀏覽器用途 |
| 球隊／球員／賽程／匯入 | 拒絕 | 拒絕 | 管理功能限制已人工確認 | 允許／未執行寫入 | 非瀏覽器用途 |
| `get_admin_users` | 拒絕（已實測） | 拒絕 | 管理功能限制已人工確認 | 允許（已實測） | 非瀏覽器用途 |
| 邀請／使用者管理 Edge Function | 拒絕（已實測） | unprofiled 拒絕（已實測） | 管理功能限制已人工確認 | 成功路徑已實測 | 內部使用 |
| completion／quota RPC | 拒絕（已實測） | 拒絕 | 拒絕 | 拒絕（已實測） | 允許 |

---

## 六、主要發現

### F-01：管理後台缺少可強制執行的 Clickjacking 防護

- **等級**：中
- **狀態**：未修復

GitHub Pages 無法自由設定自訂 response headers。CSP meta 不支援可靠的 `frame-ancestors`，JavaScript frame busting 亦不能取代瀏覽器層安全標頭。

#### 建議

將管理後台部署於支援安全標頭的獨立 origin，例如 Cloudflare Pages／Workers，並設定：

```text
Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

若繼續使用 GitHub Pages，必須在風險文件中接受此限制，不得宣稱已完成 Clickjacking 防護。

### F-02：已保存部署紀錄，但 artifact 尚無自我識別 manifest

- **等級**：低至中
- **狀態**：部分完成

已保存 `v0.4.1` tag、commit、GitHub Actions run、GitHub deployment ID 與部署後 Production runtime identity；但仍不能只由 live 頁面內容反推出其部署 commit。

#### 建議

CI 產生不含秘密的 deployment manifest：

```json
{
  "commit": "<git sha>",
  "environment": "test",
  "projectRef": "vppjcjfbcoxzofcuxmzz",
  "builtAt": "<ISO timestamp>"
}
```

並保存 artifact digest 與 workflow run ID。

### F-03：遠端角色矩陣尚未完整

- **等級**：中
- **狀態**：部分完成

已有 fail-closed SQL guards、自動化測試及專用 Test identities。Scorer 已完成登入與角色行為驗證；unprofiled 使用者已完成登入並確認管理存取遭拒；inactive 使用者已確認為 profile inactive 與 Auth banned。

#### 建議

尚待補測 inactive 使用者在停用前取得 JWT、停用後以既有 token 呼叫 RPC 的情境，以及寫入型 RPC 的逐項 mutation matrix。測試資料僅存在 Test project，不得推廣至 Production。

### F-04：邀請已完成驗收，密碼重設尚未完成端到端驗收

- **等級**：中
- **狀態**：部分完成

邀請流程已確認 CORS、anonymous denial、admin authorization、service-role 隔離、三封 Email 實際送達、Test admin redirect、profile／audit 寫入、scorer 首次登入及 unprofiled 拒絕。

尚未確認：

- 密碼重設 Email 實際送達與 reset redirect
- 密碼重設後登入
- downstream Email quota 錯誤處理

### F-05：CSP 尚未實作

- **等級**：低至中
- **狀態**：未修復

建議先移除 inline CSS／style attributes，再實作不含 `script-src 'unsafe-inline'` 的 CSP。`connect-src` 應鎖定明確 Test 或 Production project host，不應使用全域 `https://*.supabase.co`。

### F-06：Excel 解析仍在管理員瀏覽器主執行緒

- **等級**：低（現行受信任管理員情境）
- **狀態**：接受並待加固

目前已有 `.xlsx` 副檔名、5 MB 大小限制與資料格式驗證。後續應增加 sheet、row、column、cell 數量限制及 Web Worker／timeout。若未來開放非受信任使用者上傳，必須移到隔離後端解析。

---

## 七、自動化驗證

本次新增：

- `tests/security-authorization-matrix.test.cjs`
- `scripts/verify-test-security.cjs`
- npm script：`verify:security:test`
- 唯讀 Test 驗證證據：`docs/security/evidence/test-security-verification-2026-10-01.json`
- Test identity 與 Production deployment 證據：`docs/security/evidence/test-identity-and-production-validation-2026-10-01.json`

本次完整測試結果：

- `npm test`：**67 項通過、0 項失敗**
- 新增權限矩陣測試：**8 項通過、0 項失敗**
- `npm audit --omit=dev`：**0 項已知漏洞**
- `node --check`：新增 verifier 與測試檔均通過
- `git diff --check`：通過

`npm audit` 不等同 vendored JavaScript 的完整安全保證；`assets/vendor/` 仍應另外保存來源與 checksum。

本機權限矩陣測試涵蓋：

1. base table 對 anon／authenticated 的撤權。
2. anon 僅能執行 curated public RPC。
3. browser management RPC 的 fail-closed role guard。
4. inactive／unprofiled profile lookup 的拒絕合約。
5. service-only completion／quota RPC。
6. Edge Function Origin-before-Auth 順序。
7. Test verifier 固定 project ref 且不使用 service-role secret。

唯讀 Test 驗證執行方式：

```bash
set -a
source .env.test.local
set +a
npm run verify:security:test
```

此驗證器不列印密碼、access token 或 publishable key，也不呼叫會修改聯賽資料的 RPC。

---

## 八、後續修復順序

### P0

1. 補測 inactive 使用者在停用前取得 JWT、停用後使用既有 token 的情境。
2. 補完寫入型 RPC mutation matrix。
3. 完成 password reset、reset redirect 與 downstream Email quota 的端到端 Test 驗收。

### P1

1. 決定管理後台是否移至獨立 origin。
2. 實作真正的 CSP response header 與 `frame-ancestors 'none'`。
3. 建立 deployment manifest、artifact digest 與 workflow run 證據。

### P2

1. Excel parser Web Worker 與資源上限。
2. CI 加入 deployment header probe、秘密掃描與被動式 DAST。
3. 定期檢查 npm dependency 及 vendored JavaScript 來源與 checksum。

---

## 九、最終判定

現有系統已修復前次報告中的核心高風險問題，資料庫 RPC 隔離、Test／Production build guard、Edge Function admin authorization 與 service-role 隔離皆具備良好基礎。

Scorer、unprofiled 與 invitation 流程的主要端到端情境已通過；但管理後台 Clickjacking 防護、inactive 舊 JWT、寫入型 RPC matrix 與 password-reset 流程仍未完成驗證。因此本版將風險維持為：

> **中度殘餘風險；核心高風險漏洞已修復，但尚未達成完整低風險驗收。**
