# 旅遊產品情報中心

這是一個不需要後端的靜態情報 Feed，資料來源為 Google Sheet。

## 已設定的資料來源

- Google Sheet ID：`1Cdaui6RBqBMKHbsisoEifEJ3J7lAvXnu15Q9ymj2FTU`
- 工作表名稱：`情報事件`
- 網站會自動讀取 Google Sheet
- 若 Google Sheet 尚未公開，網站會顯示內建的 W3 備援資料

## 上傳到 GitHub

1. 解壓縮 ZIP。
2. 進入 GitHub Repository：`leelihsun/travel-product-intelligence`
3. 點 **Add file → Upload files**
4. 將解壓縮後的所有檔案拖入，包含：
   - `index.html`
   - `styles.css`
   - `app.js`
   - `config.js`
   - `sample-data.json`
   - `README.md`
5. 點 **Commit changes**

> 請上傳「檔案本身」，不要把最外層資料夾一起上傳，否則首頁不會位於 Repository 根目錄。

## 開啟 GitHub Pages

1. Repository → **Settings**
2. 左側選 **Pages**
3. Build and deployment：
   - Source：`Deploy from a branch`
   - Branch：`main`
   - Folder：`/ (root)`
4. 點 **Save**
5. 等候約 1～3 分鐘

預期網址：

`https://leelihsun.github.io/travel-product-intelligence/`

## Google Sheet 權限

若網站顯示「目前顯示內建 W3 資料」，請確認：

1. Google Sheet 右上角「共用」
2. 一般存取權設為「知道連結的任何人」
3. 權限為「檢視者」
4. 工作表名稱必須保持為「情報事件」

## 日後更新

只需在 Google Sheet 的「情報事件」新增資料列。網站重新整理後會自動取得最新資料，不需要修改 GitHub 程式碼。

## 修改資料來源

編輯 `config.js`：

```js
window.APP_CONFIG = {
  sheetId: "你的試算表 ID",
  sheetName: "情報事件",
  fallbackDataUrl: "sample-data.json"
};
```
