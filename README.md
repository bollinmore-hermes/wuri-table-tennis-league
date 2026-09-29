# 烏日桌球聯賽

烏日桌球聯賽的公開賽程、比賽結果與排名網站。

- 正式網站：<https://bollinmore-hermes.github.io/wuri-table-tennis-league/>
- 本 Repository 為公開原始碼；請勿提交個人資料、密碼、私密金鑰或正式環境憑證。

## 環境說明

本專案區分三種用途：

- **Production**：正式公開網站，只發布已有 Git Tag 的版本。
- **Test**：功能驗證環境，內容可能隨時更新或重設，不代表正式資料。
- **Local**：開發者本機展示模式，資料只保存在瀏覽器，不等同正式管理後台。

正式管理功能使用身分驗證與伺服器端權限控管；本機展示模式不需要帳密的行為不適用於正式網站。

## 本機開發

需求：Node.js 20 或相容版本。

```bash
npm install
npm run generate:excel
npm test
npm run serve
```

啟動後可在本機開啟：

- 公開頁面：<http://127.0.0.1:8765/>
- 本機管理展示：<http://127.0.0.1:8765/admin.html>

範例資料僅供開發與測試，不應用於正式賽務紀錄。

## 建置與發布

正式版本必須先建立 Git Tag，才能發布至 Production GitHub Pages。Test 環境可使用分支、Tag 或指定 Commit 進行驗證。

發布前應完成：

```bash
npm test
npm audit
git diff --check
```

## 安全與隱私

- Browser 端只允許使用可公開的設定，不得包含管理憑證或私密金鑰。
- 不應在 Issue、Pull Request、Commit 或測試資料中提交個人資料。
- 發現安全問題時，請使用 GitHub 的私密安全回報機制，不要公開揭露可被利用的細節。
