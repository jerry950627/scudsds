# 東吳大學資料科學系系學生會管理系統

這是一個基於 Node.js 和 Express 的學生會管理系統，包含活動管理、設計稿管理、財務管理等功能。

## 功能特色

- 🔐 用戶認證與權限管理
- 📁 活動檔案上傳與管理
- 🎨 設計稿展示與分類
- 💰 財務記錄與統計
- 📝 會議記錄管理
- 🔗 秘書處連結管理
- 📊 操作日誌追蹤

## 技術棧

- **後端**: Node.js, Express.js
- **資料庫**: SQLite3
- **檔案上傳**: Multer
- **認證**: bcrypt, express-session
- **前端**: HTML, CSS, JavaScript

## 本地開發

### 環境要求

- Node.js >= 18.0.0
- npm

### 安裝與運行

1. 克隆專案
```bash
git clone https://github.com/jerry950627/scuds.git
cd scuds
```

2. 安裝依賴
```bash
npm install
```

3. 初始化資料庫
```bash
npm run db:init
```

4. 啟動應用
```bash
npm start
```

5. 訪問應用
打開瀏覽器訪問 `http://localhost:3000`

### 管理員帳號

請聯繫系統管理員取得登入資訊。

## 部署到 Render

### 方法一：使用 render.yaml（推薦）

1. 確保你的代碼已推送到 GitHub
2. 在 Render 控制台中選擇 "New" > "Blueprint"
3. 連接你的 GitHub 倉庫
4. Render 會自動讀取 `render.yaml` 配置文件進行部署

### 方法二：手動配置

1. 在 Render 控制台中選擇 "New" > "Web Service"
2. 連接你的 GitHub 倉庫
3. 配置以下設置：
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: `Node`
   - **Node Version**: 18 或更高

### 環境變數配置

在 Render 控制台中設置以下環境變數：

- `NODE_ENV`: `production`
- `SESSION_SECRET`: 隨機生成的安全密鑰
- `PORT`: 由 Render 自動提供

### 持久化存儲

為了保持資料庫文件，需要添加持久化磁盤：

1. 在 Render 控制台中進入你的服務
2. 點擊 "Disks" 標籤
3. 添加新磁盤：
   - **Name**: `scuds-disk`
   - **Mount Path**: `/opt/render/project/src/data`
   - **Size**: 1GB（免費方案）


### 常見問題

1. **npm install 失敗**
   - 確保 Node.js 版本 >= 18.0.0
   - 檢查 package.json 是否存在於根目錄
   - 嘗試刪除 node_modules 和 package-lock.json 後重新安裝

2. **資料庫連接錯誤**
   - 確保 data 目錄有寫入權限
   - 運行 `npm run db:init` 初始化資料庫

3. **檔案上傳失敗**
   - 檢查 uploads 目錄權限
   - 確認檔案大小未超過限制（50MB）

4. **Session 問題**
   - 確保設置了 SESSION_SECRET 環境變數
   - 檢查 cookie 設置是否適合你的部署環境

### Render 特定問題

1. **部署失敗**
   - 檢查構建日誌中的錯誤信息
   - 確保所有依賴都在 package.json 中正確列出
   - 驗證 Node.js 版本兼容性

2. **應用無法啟動**
   - 確保使用了 `process.env.PORT`
   - 檢查啟動命令是否正確
   - 查看應用日誌獲取詳細錯誤信息

3. **資料丟失**
   - 確保已配置持久化磁盤
   - 檢查磁盤掛載路徑是否正確

## 項目結構

```
scuds/
├── data/                 # SQLite 資料庫文件
├── database/            # 資料庫初始化腳本
├── image/               # 靜態圖片資源
├── page/                # HTML 頁面文件
├── uploads/             # 用戶上傳的文件
│   ├── activity/        # 活動相關文件
│   ├── design/          # 設計稿文件
│   └── finance/         # 財務相關文件
├── server.js            # 主應用文件
├── package.json         # 項目配置
├── render.yaml          # Render 部署配置
└── README.md           # 項目說明
```

## 貢獻

歡迎提交 Issue 和 Pull Request 來改進這個項目。

## 授權

本項目採用 ISC 授權條款。