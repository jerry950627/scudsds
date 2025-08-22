const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// 確保 data 目錄存在
// 在生產環境中使用持久化磁盤路徑，本地開發使用相對路徑
const dataDir = process.env.NODE_ENV === 'production' 
  ? '/opt/render/project/src/data' 
  : path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 確保上傳目錄存在
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const activityDir = path.join(uploadsDir, 'activity');
if (!fs.existsSync(activityDir)) {
  fs.mkdirSync(activityDir, { recursive: true });
}

const designDir = path.join(uploadsDir, 'design');
if (!fs.existsSync(designDir)) {
  fs.mkdirSync(designDir, { recursive: true });
}

// 建立資料庫連接
const db = new sqlite3.Database(path.join(dataDir, 'app.db'));

// 初始化活動檔案資料表
db.run(`CREATE TABLE IF NOT EXISTS activity_files (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  uploaded_by INTEGER,
  category TEXT NOT NULL,
  FOREIGN KEY (uploaded_by) REFERENCES users (id)
)`, (err) => {
  if (err) {
    console.error('建立活動檔案資料表失敗:', err);
  } else {
    console.log('✅ 活動檔案資料表檢查完成');
  }
});

// 初始化美宣部設計資料表
db.run(`CREATE TABLE IF NOT EXISTS design_files (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  type TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  platform TEXT,
  schedule_date DATETIME,
  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  uploaded_by INTEGER,
  FOREIGN KEY (uploaded_by) REFERENCES users (id)
)`, (err) => {
  if (err) {
    console.error('建立美宣部設計資料表失敗:', err);
  } else {
    console.log('✅ 美宣部設計資料表檢查完成');
  }
});

// 初始化廠商資料表
db.run(`CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  FOREIGN KEY (created_by) REFERENCES users (id)
)`, (err) => {
  if (err) {
    console.error('建立廠商資料表失敗:', err);
  } else {
    console.log('✅ 廠商資料表檢查完成');
  }
});

// 初始化常用連結資料表
db.run(`CREATE TABLE IF NOT EXISTS secretary_links (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  FOREIGN KEY (created_by) REFERENCES users (id)
)`, (err) => {
  if (err) {
    console.error('建立常用連結資料表失敗:', err);
  } else {
    console.log('✅ 常用連結資料表檢查完成');
  }
});

// 初始化會議記錄資料表
db.run(`CREATE TABLE IF NOT EXISTS meeting_records (
  id TEXT PRIMARY KEY,
  meeting_date DATE NOT NULL,
  recorder_name TEXT NOT NULL,
  meeting_content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  FOREIGN KEY (created_by) REFERENCES users (id)
)`, (err) => {
  if (err) {
    console.error('建立會議記錄資料表失敗:', err);
  } else {
    console.log('✅ 會議記錄資料表檢查完成');
  }
});

// 啟動時檢查 users 資料表是否存在（不自動建立）
db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
  if (err) {
    console.error('檢查資料表失敗:', err);
  } else if (!row) {
    console.warn("⚠️  資料表 'users' 不存在，請先執行初始化：npm run db:init");
  } else {
    console.log('✅ 資料表檢查完成');
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // 暫時設為 false 以解決 Render HTTPS 問題
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// 靜態檔案
app.use('/page', express.static(path.join(__dirname, 'page')));
app.use('/image', express.static(path.join(__dirname, 'image')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 首頁導向登入頁
app.get('/', (req, res) => {
  res.redirect('/page/index.html');
});

// 登入 API
app.post('/auth/login', (req, res) => {
  console.log('登入請求:', { username: req.body.username, hasPassword: !!req.body.password });
  const { username, password } = req.body;
  if (!username || !password) {
    console.log('登入失敗: 缺少帳號或密碼');
    return res.status(400).json({ success: false, message: '請輸入帳號和密碼' });
  }

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) {
      console.error('資料庫查詢錯誤:', err);
      return res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
    if (!user) {
      console.log('登入失敗: 用戶不存在 -', username);
      return res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
    }

    console.log('找到用戶:', { id: user.id, username: user.username, role: user.role });
    bcrypt.compare(password, user.password_hash, (err, isMatch) => {
      if (err) {
        console.error('密碼比對錯誤:', err);
        return res.status(500).json({ success: false, message: '伺服器錯誤' });
      }
      if (!isMatch) {
        console.log('登入失敗: 密碼錯誤 -', username);
        return res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
      }

      req.session.user = {
        id: user.id,
        name: user.name,
        username: user.username,
        student_id: user.student_id,
        role: user.role
      };
      
      console.log('登入成功:', { username: user.username, sessionId: req.sessionID });
      
      // 記錄登入操作
      logOperation(
        user.id,
        user.username,
        'login',
        `用戶 ${user.username} 登入系統`,
        `角色: ${user.role}`,
        req
      );
      
      res.json({ success: true, user: req.session.user });
    });
  });
});

// 檢查登入狀態
app.get('/auth/check', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.status(401).json({ authenticated: false, message: '未登入' });
  }
});

// 登出
app.post('/auth/logout', (req, res) => {
  const user = req.session.user;
  
  req.session.destroy(err => {
    if (err) return res.status(500).json({ success: false, message: '登出失敗' });
    
    // 記錄登出操作
    if (user) {
      logOperation(
        user.id,
        user.username,
        'logout',
        `用戶 ${user.username} 登出系統`,
        null,
        req
      );
    }
    
    res.json({ success: true, message: '已登出' });
  });
});

// 受保護頁面
const requireAuth = (req, res, next) => {
  console.log('requireAuth 檢查:', {
    hasSession: !!req.session,
    hasUser: !!(req.session && req.session.user),
    sessionId: req.session ? req.session.id : 'none',
    url: req.url,
    method: req.method
  });
  if (req.session && req.session.user) {
    console.log('requireAuth 通過，調用 next()');
    return next();
  }
  
  console.log('requireAuth 失敗，用戶未登入');
  // 如果是API請求，返回JSON錯誤
  if (req.url.startsWith('/api/')) {
    return res.status(401).json({ success: false, message: '需要登入' });
  }
  
  // 如果是頁面請求，重定向到首頁
  return res.redirect('/');
};

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'page', 'dashboard.html'));
});

app.get('/finance', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'page', 'finance.html'));
});

app.get('/activity', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'page', 'activity.html'));
});

app.get('/design', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'page', 'design.html'));
});

app.get('/pr', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'page', 'pr.html'));
});

app.get('/secretary', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'page', 'secretary.html'));
});

app.get('/admin', requireAuth, (req, res) => {
  console.log('🔧 /admin 路由被訪問');
  res.sendFile(path.join(__dirname, 'page', 'admin.html'));
});

// 設置 multer 檔案上傳
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 根據請求路徑決定上傳目錄
    if (req.path.includes('/design/')) {
      cb(null, designDir);
    } else {
      cb(null, activityDir);
    }
  },
  filename: function (req, file, cb) {
    try {
      // 正確處理中文檔名編碼
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      file.originalname = originalName;
      
      const fileId = uuidv4();
      const ext = path.extname(originalName);
      cb(null, fileId + ext);
    } catch (error) {
      console.error('檔名處理錯誤:', error);
      cb(error);
    }
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB 限制
  },
  fileFilter: function (req, file, cb) {
    // 根據請求路徑決定允許的檔案類型
    let allowedTypes;
    if (req.path.includes('/design/')) {
      // 設計檔案：支援圖片、影片和文件格式
      allowedTypes = /\.(pdf|doc|docx|jpg|jpeg|png|gif|mp4|mov|avi)$/i;
    } else {
      // 活動檔案：只支援文件格式
      allowedTypes = /\.(pdf|doc|docx|xls|xlsx)$/i;
    }
    
    if (allowedTypes.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('不支援的檔案格式'));
    }
  }
});

// 活動部 API 路由

// 上傳檔案
app.post('/api/activity/upload', requireAuth, upload.array('files', 10), (req, res) => {
  try {
    console.log('開始處理檔案上傳請求');
    const { type } = req.body; // 'proposal' 或 'timeline'
    const files = req.files;
    
    console.log('上傳參數:', { type, fileCount: files ? files.length : 0 });
    
    if (!files || files.length === 0) {
      console.log('錯誤: 沒有檔案被上傳');
      return res.status(400).json({ message: '沒有檔案被上傳' });
    }
    
    if (!type || !['proposal', 'timeline'].includes(type)) {
      console.log('錯誤: 無效的檔案類型:', type);
      return res.status(400).json({ message: '無效的檔案類型' });
    }
    
    const uploadPromises = files.map((file, index) => {
      return new Promise((resolve, reject) => {
        const fileId = path.basename(file.filename, path.extname(file.filename));
        
        console.log(`處理檔案 ${index + 1}:`, {
          fileId,
          originalName: file.originalname,
          filename: file.filename,
          size: file.size,
          type: file.mimetype
        });
        
        db.run(
          `INSERT INTO activity_files (id, filename, original_name, file_type, file_size, uploaded_by, category) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [fileId, file.filename, file.originalname, file.mimetype, file.size, req.session.user.id, type],
          function(err) {
            if (err) {
              console.error(`檔案 ${index + 1} 資料庫儲存失敗:`, err);
              reject(err);
            } else {
              console.log(`檔案 ${index + 1} 成功儲存到資料庫`);
              resolve({
                id: fileId,
                name: file.originalname,
                size: file.size,
                type: type
              });
            }
          }
        );
      });
    });
    
    Promise.all(uploadPromises)
      .then(results => {
        console.log('所有檔案處理完成:', results.length);
        
        // 記錄操作日誌
        logOperation(
          req.session.user.id,
          req.session.user.username,
          'upload',
          `上傳活動檔案：${type === 'proposal' ? '企劃書' : '時程表'} - ${results.length}個檔案`,
          JSON.stringify({
            category: type,
            fileCount: results.length,
            files: results.map(f => ({ name: f.name, size: f.size }))
          }),
          req
        );
        
        res.json({ 
          success: true, 
          message: `成功上傳 ${results.length} 個檔案`,
          files: results 
        });
      })
      .catch(err => {
        console.error('檔案上傳處理失敗:', err);
        // 清理已上傳的檔案
        files.forEach(file => {
          const filePath = path.join(activityDir, file.filename);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
              console.log('已清理檔案:', file.filename);
            } catch (cleanupErr) {
              console.error('清理檔案失敗:', cleanupErr);
            }
          }
        });
        res.status(500).json({ message: '檔案資訊儲存失敗' });
      });
      
  } catch (error) {
    console.error('上傳錯誤:', error);
    res.status(500).json({ message: '上傳失敗' });
  }
});

// 獲取檔案列表
app.get('/api/activity/files', requireAuth, (req, res) => {
  db.all(
    `SELECT id, original_name as name, file_size as size, upload_date as uploadDate, category 
     FROM activity_files 
     ORDER BY upload_date DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error('獲取檔案列表錯誤:', err);
        return res.status(500).json({ message: '獲取檔案列表失敗' });
      }
      
      const proposals = rows.filter(file => file.category === 'proposal');
      const timelines = rows.filter(file => file.category === 'timeline');
      
      res.json({
        proposals: proposals,
        timelines: timelines
      });
    }
  );
});

// 下載檔案
app.get('/api/activity/download/:fileId', requireAuth, (req, res) => {
  const { fileId } = req.params;
  
  db.get(
    'SELECT * FROM activity_files WHERE id = ?',
    [fileId],
    (err, file) => {
      if (err) {
        console.error('查詢檔案錯誤:', err);
        return res.status(500).json({ message: '查詢檔案失敗' });
      }
      
      if (!file) {
        return res.status(404).json({ message: '檔案不存在' });
      }
      
      const filePath = path.join(activityDir, file.filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: '檔案不存在於伺服器' });
      }
      
      try {
        // 獲取檔案統計信息
        const stat = fs.statSync(filePath);
        
        // 設置正確的響應標頭
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
        res.setHeader('Content-Type', file.file_type || 'application/octet-stream');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'no-cache');
        
        // 創建文件流並處理錯誤
        const fileStream = fs.createReadStream(filePath);
        
        fileStream.on('error', (streamErr) => {
          console.error('文件流錯誤:', streamErr);
          if (!res.headersSent) {
            res.status(500).json({ message: '文件讀取失敗' });
          }
        });
        
        fileStream.on('end', () => {
          console.log(`文件下載完成: ${file.original_name}`);
        });
        
        // 將文件流傳送到響應
        fileStream.pipe(res);
        
      } catch (statErr) {
        console.error('獲取檔案信息錯誤:', statErr);
        return res.status(500).json({ message: '檔案讀取失敗' });
      }
    }
  );
});

// 刪除檔案
app.delete('/api/activity/delete/:fileId', requireAuth, (req, res) => {
  const { fileId } = req.params;
  
  // 先查詢檔案資訊
  db.get(
    'SELECT * FROM activity_files WHERE id = ?',
    [fileId],
    (err, file) => {
      if (err) {
        console.error('查詢檔案錯誤:', err);
        return res.status(500).json({ message: '查詢檔案失敗' });
      }
      
      if (!file) {
        return res.status(404).json({ message: '檔案不存在' });
      }
      
      // 檢查權限（只有上傳者或管理員可以刪除）
      if (file.uploaded_by !== req.session.user.id && req.session.user.role !== 'admin') {
        return res.status(403).json({ message: '沒有權限刪除此檔案' });
      }
      
      // 從資料庫刪除記錄
      db.run(
        'DELETE FROM activity_files WHERE id = ?',
        [fileId],
        function(err) {
          if (err) {
            console.error('刪除檔案記錄錯誤:', err);
            return res.status(500).json({ message: '刪除檔案記錄失敗' });
          }
          
          // 刪除實際檔案
          const filePath = path.join(activityDir, file.filename);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (deleteErr) {
              console.error('刪除實際檔案錯誤:', deleteErr);
              // 即使刪除實際檔案失敗，也返回成功（因為資料庫記錄已刪除）
            }
          }
          
          // 記錄操作日誌
          logOperation(
            req.session.user.id,
            req.session.user.username,
            'delete',
            `刪除活動檔案：${file.category === 'proposal' ? '企劃書' : '時程表'} - ${file.original_name}`,
            JSON.stringify({
              fileId: file.id,
              fileName: file.original_name,
              category: file.category,
              fileSize: file.file_size
            }),
            req
          );
          
          res.json({ success: true, message: '檔案已刪除' });
        }
      );
    }
  );
});

// 美宣部 API 端點

// 系服設計上傳
app.post('/api/design/uniform', requireAuth, upload.array('files', 10), (req, res) => {
  console.log('📤 開始處理系服設計上傳請求');
  console.log('上傳參數:', req.body);
  
  const { title, category } = req.body;
  const files = req.files;
  
  if (!files || files.length === 0) {
    console.log('❌ 沒有檔案被上傳');
    return res.status(400).json({ message: '請選擇要上傳的檔案' });
  }
  
  if (!title || !category) {
    console.log('❌ 缺少必要欄位');
    return res.status(400).json({ message: '請填寫標題和類別' });
  }
  
  const filePromises = files.map(file => {
    return new Promise((resolve, reject) => {
      const fileId = uuidv4();
      console.log(`📁 處理檔案: ${file.originalname}`);
      
      db.run(
        `INSERT INTO design_files (id, title, category, type, filename, original_name, file_type, file_size, uploaded_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [fileId, title, category, 'uniform', file.filename, file.originalname, file.mimetype, file.size, req.session.user.id],
        function(err) {
          if (err) {
            console.error(`❌ 資料庫儲存失敗 (${file.originalname}):`, err);
            reject(err);
          } else {
            console.log(`✅ 檔案儲存成功 (${file.originalname})`);
            resolve({ fileId, filename: file.originalname });
          }
        }
      );
    });
  });
  
  Promise.all(filePromises)
    .then(results => {
      console.log('✅ 所有檔案處理完成');
      
      // 記錄操作日誌
      const fileNames = files.map(f => f.originalname).join(', ');
      const fileSizes = files.map(f => `${f.originalname} (${(f.size / 1024).toFixed(1)}KB)`).join(', ');
      logOperation(
        req.session.user.id,
        req.session.user.username,
        'upload',
        `上傳設計檔案：${category} - ${title}（${files.length}個檔案）`,
        JSON.stringify({
          category: category,
          title: title,
          type: 'uniform',
          fileCount: files.length,
          files: fileSizes
        }),
        req
      );
      
      res.json({ 
        message: '系服設計上傳成功', 
        files: results 
      });
    })
    .catch(error => {
      console.error('❌ 上傳處理失敗:', error);
      res.status(500).json({ message: '上傳失敗，請稍後再試' });
    });
});

// 貼文設計上傳
app.post('/api/design/post', requireAuth, upload.array('files', 10), (req, res) => {
  console.log('📤 開始處理貼文設計上傳請求');
  console.log('上傳參數:', req.body);
  
  const { title } = req.body;
  const files = req.files;
  
  if (!files || files.length === 0) {
    console.log('❌ 沒有檔案被上傳');
    return res.status(400).json({ message: '請選擇要上傳的檔案' });
  }
  
  if (!title) {
    console.log('❌ 缺少必要欄位');
    return res.status(400).json({ message: '請填寫標題' });
  }
  
  const filePromises = files.map(file => {
    return new Promise((resolve, reject) => {
      const fileId = uuidv4();
      console.log(`📁 處理檔案: ${file.originalname}`);
      
      db.run(
        `INSERT INTO design_files (id, title, category, type, filename, original_name, file_type, file_size, uploaded_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [fileId, title, 'design', 'design', file.filename, file.originalname, file.mimetype, file.size, req.session.user.id],
        function(err) {
          if (err) {
            console.error(`❌ 資料庫儲存失敗 (${file.originalname}):`, err);
            reject(err);
          } else {
            console.log(`✅ 檔案儲存成功 (${file.originalname})`);
            resolve({ fileId, filename: file.originalname });
          }
        }
      );
    });
  });
  
  Promise.all(filePromises)
    .then(results => {
      console.log('✅ 所有檔案處理完成');
      
      // 記錄操作日誌
      const fileNames = files.map(f => f.originalname).join(', ');
      const fileSizes = files.map(f => `${f.originalname} (${(f.size / 1024).toFixed(1)}KB)`).join(', ');
      logOperation(
        req.session.user.id,
        req.session.user.username,
        'upload',
        `上傳設計檔案：貼文設計 - ${title}（${files.length}個檔案）`,
        JSON.stringify({
          category: 'design',
          title: title,
          type: 'design',
          fileCount: files.length,
          files: fileSizes
        }),
        req
      );
      
      res.json({ 
        message: '貼文設計上傳成功', 
        files: results 
      });
    })
    .catch(error => {
      console.error('❌ 上傳處理失敗:', error);
      res.status(500).json({ message: '上傳失敗，請稍後再試' });
    });
});

// 獲取設計作品列表
app.get('/api/design/gallery', requireAuth, (req, res) => {
  const { category } = req.query;
  
  let query = `
    SELECT d.*, u.username 
    FROM design_files d 
    LEFT JOIN users u ON d.uploaded_by = u.id 
    ORDER BY d.upload_date DESC
  `;
  
  let params = [];
  
  if (category && category !== 'all') {
    query = `
      SELECT d.*, u.username 
      FROM design_files d 
      LEFT JOIN users u ON d.uploaded_by = u.id 
      WHERE d.type = ?
      ORDER BY d.upload_date DESC
    `;
    params = [category];
  }
  
  console.log('🔍 查詢設計作品:', { category, query: query.replace(/\s+/g, ' ').trim() });
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('獲取設計作品失敗:', err);
      return res.status(500).json({ message: '獲取設計作品失敗' });
    }
    
    const designs = rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      type: row.type,
      filename: row.filename,
      originalName: row.original_name,
      fileType: row.file_type,
      fileSize: row.file_size,
      platform: row.platform,
      scheduleDate: row.schedule_date,
      uploadDate: row.upload_date,
      uploadedBy: row.username || '未知使用者',
      uploadedById: row.uploaded_by,
      thumbnail: `/uploads/design/${row.filename}`
    }));
    
    res.json(designs);
  });
});

// 刪除設計作品
app.delete('/api/design/delete/:fileId', requireAuth, (req, res) => {
  const { fileId } = req.params;
  console.log('收到刪除請求，檔案ID:', fileId);
  console.log('用戶資訊:', req.session.user);
  
  // 先查詢檔案資訊
  db.get(
    'SELECT * FROM design_files WHERE id = ?',
    [fileId],
    (err, file) => {
      if (err) {
        console.error('查詢設計作品錯誤:', err);
        return res.status(500).json({ message: '查詢設計作品失敗' });
      }
      
      if (!file) {
        console.log('設計作品不存在，ID:', fileId);
        return res.status(404).json({ message: '設計作品不存在' });
      }
      
      console.log('找到設計作品:', file);
      console.log('檔案上傳者ID:', file.uploaded_by, '當前用戶ID:', req.session.user.id);
      console.log('用戶角色:', req.session.user.role);
      
      // 檢查權限（只有上傳者或管理員可以刪除）
      if (file.uploaded_by !== req.session.user.id && req.session.user.role !== 'admin') {
        console.log('權限檢查失敗');
        return res.status(403).json({ message: '沒有權限刪除此設計作品' });
      }
      
      console.log('權限檢查通過，開始刪除');
      
      // 從資料庫刪除記錄
      db.run(
        'DELETE FROM design_files WHERE id = ?',
        [fileId],
        function(err) {
          if (err) {
            console.error('刪除設計作品記錄錯誤:', err);
            return res.status(500).json({ message: '刪除設計作品記錄失敗' });
          }
          
          console.log('資料庫記錄已刪除，影響行數:', this.changes);
          
          // 刪除實際檔案
          const filePath = path.join(designDir, file.filename);
          console.log('嘗試刪除檔案:', filePath);
          
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
              console.log('實際檔案已刪除');
            } catch (deleteErr) {
              console.error('刪除實際檔案錯誤:', deleteErr);
              // 即使刪除實際檔案失敗，也返回成功（因為資料庫記錄已刪除）
            }
          } else {
            console.log('實際檔案不存在於:', filePath);
          }
          
          // 記錄操作日誌
          logOperation(
            req.session.user.id,
            req.session.user.username,
            'delete',
            `刪除設計檔案：${file.category} - ${file.title}`,
            JSON.stringify({
              fileId: file.id,
              title: file.title,
              category: file.category,
              type: file.type,
              originalName: file.original_name,
              fileSize: `${(file.file_size / 1024).toFixed(1)}KB`
            }),
            req
          );
          
          console.log('刪除操作完成');
          res.json({ success: true, message: '設計作品已刪除' });
        }
      );
    }
  );
});

// 下載設計作品
app.get('/api/design/download/:fileId', requireAuth, (req, res) => {
  const { fileId } = req.params;
  
  db.get(
    'SELECT * FROM design_files WHERE id = ?',
    [fileId],
    (err, file) => {
      if (err) {
        console.error('查詢設計作品錯誤:', err);
        return res.status(500).json({ message: '查詢設計作品失敗' });
      }
      
      if (!file) {
        return res.status(404).json({ message: '設計作品不存在' });
      }
      
      const filePath = path.join(designDir, file.filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: '檔案不存在於伺服器' });
      }
      
      try {
        // 獲取檔案統計信息
        const stat = fs.statSync(filePath);
        
        // 設置正確的響應標頭
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
        res.setHeader('Content-Type', file.file_type || 'application/octet-stream');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'no-cache');
        
        // 創建文件流並處理錯誤
        const fileStream = fs.createReadStream(filePath);
        
        fileStream.on('error', (streamErr) => {
          console.error('文件流錯誤:', streamErr);
          if (!res.headersSent) {
            res.status(500).json({ message: '文件讀取失敗' });
          }
        });
        
        fileStream.on('end', () => {
          console.log(`設計作品下載完成: ${file.original_name}`);
        });
        
        // 將文件流傳送到響應
        fileStream.pipe(res);
        
      } catch (statErr) {
        console.error('獲取設計作品信息錯誤:', statErr);
        return res.status(500).json({ message: '檔案讀取失敗' });
      }
    }
  );
});

// ==================== 廠商資料 API ====================

// 獲取所有廠商資料
app.get('/api/vendors', requireAuth, (req, res) => {
  const { type, search } = req.query;
  
  let query = 'SELECT * FROM vendors';
  let params = [];
  let conditions = [];
  
  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }
  
  if (search) {
    conditions.push('(name LIKE ? OR email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY created_at DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('獲取廠商資料失敗:', err);
      return res.status(500).json({ message: '獲取廠商資料失敗' });
    }
    
    console.log(`獲取廠商資料成功，共 ${rows.length} 筆`);
    res.json({ vendors: rows });
  });
});

// 新增廠商資料
app.post('/api/vendors', requireAuth, (req, res) => {
  const { name, email, type, description } = req.body;
  
  if (!name || !email || !type) {
    return res.status(400).json({ message: '廠商名稱、Email 和商品種類為必填欄位' });
  }
  
  const vendorId = uuidv4();
  const userId = req.session.user.id;
  
  db.run(
    `INSERT INTO vendors (id, name, email, type, description, created_by) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [vendorId, name, email, type, description || null, userId],
    function(err) {
      if (err) {
        console.error('新增廠商資料失敗:', err);
        return res.status(500).json({ message: '新增廠商資料失敗' });
      }
      
      // 記錄操作日誌
      logOperation(
        req.session.user.id,
        req.session.user.username,
        'create',
        `新增廠商資料：${name}`,
        JSON.stringify({
          vendorId: vendorId,
          name: name,
          email: email,
          type: type,
          description: description || '無'
        }),
        req
      );
      
      console.log(`廠商資料新增成功: ${name}`);
      res.json({ 
        message: '廠商資料新增成功',
        vendor: {
          id: vendorId,
          name,
          email,
          type,
          description
        }
      });
    }
  );
});

// 更新廠商資料
app.put('/api/vendors/:id', requireAuth, (req, res) => {
  const vendorId = req.params.id;
  const { name, email, type, description } = req.body;
  
  if (!name || !email || !type) {
    return res.status(400).json({ message: '廠商名稱、Email 和商品種類為必填欄位' });
  }
  
  db.run(
    `UPDATE vendors 
     SET name = ?, email = ?, type = ?, description = ?, updated_at = CURRENT_TIMESTAMP 
     WHERE id = ?`,
    [name, email, type, description || null, vendorId],
    function(err) {
      if (err) {
        console.error('更新廠商資料失敗:', err);
        return res.status(500).json({ message: '更新廠商資料失敗' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ message: '找不到指定的廠商資料' });
      }
      
      // 記錄操作日誌
      logOperation(
        req.session.user.id,
        req.session.user.username,
        'update',
        `修改廠商資料：${name}`,
        JSON.stringify({
          vendorId: vendorId,
          name: name,
          email: email,
          type: type,
          description: description || '無'
        }),
        req
      );
      
      console.log(`廠商資料更新成功: ${name}`);
      res.json({ 
        message: '廠商資料更新成功',
        vendor: {
          id: vendorId,
          name,
          email,
          type,
          description
        }
      });
    }
  );
});

// 刪除所有廠商資料 (必須放在 :id 路由之前)
app.delete('/api/vendors/all', requireAuth, (req, res) => {
  console.log('收到刪除所有廠商的請求');
  
  // 先獲取廠商數量以便記錄日誌
  db.get('SELECT COUNT(*) as count FROM vendors', [], (err, countResult) => {
    if (err) {
      console.error('查詢廠商數量失敗:', err);
      return res.status(500).json({ message: '刪除所有廠商資料失敗' });
    }
    
    const totalVendors = countResult.count;
    
    db.run('DELETE FROM vendors', function(err) {
      if (err) {
        console.error('刪除所有廠商資料失敗:', err);
        return res.status(500).json({ message: '刪除所有廠商資料失敗' });
      }
      
      // 記錄操作日誌
      logOperation(
        req.session.user.id,
        req.session.user.username,
        'delete',
        '批量刪除所有廠商資料',
        JSON.stringify({
          deletedCount: this.changes,
          totalVendors: totalVendors
        }),
        req
      );
      
      console.log(`成功刪除 ${this.changes} 筆廠商資料`);
      res.json({ 
        message: '所有廠商資料刪除成功',
        deletedCount: this.changes
      });
    });
  });
});

// 刪除廠商資料
app.delete('/api/vendors/:id', requireAuth, (req, res) => {
  const vendorId = req.params.id;
  
  // 先獲取廠商資料以便記錄日誌
  db.get('SELECT * FROM vendors WHERE id = ?', [vendorId], (err, vendor) => {
    if (err) {
      console.error('查詢廠商資料失敗:', err);
      return res.status(500).json({ message: '刪除廠商資料失敗' });
    }
    
    if (!vendor) {
      return res.status(404).json({ message: '找不到指定的廠商資料' });
    }
    
    // 刪除廠商資料
    db.run('DELETE FROM vendors WHERE id = ?', [vendorId], function(err) {
      if (err) {
        console.error('刪除廠商資料失敗:', err);
        return res.status(500).json({ message: '刪除廠商資料失敗' });
      }
      
      // 記錄操作日誌
      logOperation(
        req.session.user.id,
        req.session.user.username,
        'delete',
        `刪除廠商資料：${vendor.name}`,
        JSON.stringify({
          vendorId: vendor.id,
          name: vendor.name,
          email: vendor.email,
          type: vendor.type,
          description: vendor.description || '無'
        }),
        req
      );
      
      console.log(`廠商資料刪除成功: ${vendorId}`);
      res.json({ message: '廠商資料刪除成功' });
    });
  });
});

// 常用連結 API 路由

// 獲取所有常用連結
app.get('/api/secretary/links', requireAuth, (req, res) => {
  db.all(
    'SELECT * FROM secretary_links ORDER BY created_at DESC',
    [],
    (err, rows) => {
      if (err) {
        console.error('獲取常用連結失敗:', err);
        return res.status(500).json({ message: '獲取常用連結失敗' });
      }
      
      console.log(`獲取常用連結成功，共 ${rows.length} 筆`);
      res.json({ links: rows });
    }
  );
});

// 新增常用連結
app.post('/api/secretary/links', requireAuth, (req, res) => {
  const { name, url, description } = req.body;
  
  if (!name || !url) {
    return res.status(400).json({ message: '連結名稱和網址為必填欄位' });
  }
  
  const linkId = uuidv4();
  const userId = req.session.user.id;
  
  db.run(
    `INSERT INTO secretary_links (id, name, url, description, created_by) 
     VALUES (?, ?, ?, ?, ?)`,
    [linkId, name, url, description || null, userId],
    function(err) {
      if (err) {
        console.error('新增常用連結失敗:', err);
        return res.status(500).json({ message: '新增常用連結失敗' });
      }
      
      // 記錄操作日誌
      logOperation(
        req.session.user.id,
        req.session.user.username,
        'create',
        `新增常用連結：${name}`,
        JSON.stringify({
          linkId: linkId,
          name: name,
          url: url,
          description: description || '無'
        }),
        req
      );
      
      console.log(`常用連結新增成功: ${name}`);
      res.json({ 
        message: '常用連結新增成功',
        link: {
          id: linkId,
          name,
          url,
          description
        }
      });
    }
  );
});

// 更新常用連結
app.put('/api/secretary/links/:id', requireAuth, (req, res) => {
  const linkId = req.params.id;
  const { name, url, description } = req.body;
  
  if (!name || !url) {
    return res.status(400).json({ message: '連結名稱和網址為必填欄位' });
  }
  
  db.run(
    `UPDATE secretary_links 
     SET name = ?, url = ?, description = ?, updated_at = CURRENT_TIMESTAMP 
     WHERE id = ?`,
    [name, url, description || null, linkId],
    function(err) {
      if (err) {
        console.error('更新常用連結失敗:', err);
        return res.status(500).json({ message: '更新常用連結失敗' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ message: '找不到指定的常用連結' });
      }
      
      // 記錄操作日誌
      logOperation(
        req.session.user.id,
        req.session.user.username,
        'update',
        `修改常用連結：${name}`,
        JSON.stringify({
          linkId: linkId,
          name: name,
          url: url,
          description: description || '無'
        }),
        req
      );
      
      console.log(`常用連結更新成功: ${name}`);
      res.json({ 
        message: '常用連結更新成功',
        link: {
          id: linkId,
          name,
          url,
          description
        }
      });
    }
  );
});

// 刪除常用連結
app.delete('/api/secretary/links/:id', requireAuth, (req, res) => {
  const linkId = req.params.id;
  
  // 先獲取連結資料以便記錄日誌
  db.get('SELECT * FROM secretary_links WHERE id = ?', [linkId], (err, link) => {
    if (err) {
      console.error('查詢常用連結失敗:', err);
      return res.status(500).json({ message: '刪除常用連結失敗' });
    }
    
    if (!link) {
      return res.status(404).json({ message: '找不到指定的常用連結' });
    }
    
    // 刪除常用連結
    db.run('DELETE FROM secretary_links WHERE id = ?', [linkId], function(err) {
      if (err) {
        console.error('刪除常用連結失敗:', err);
        return res.status(500).json({ message: '刪除常用連結失敗' });
      }
      
      // 記錄操作日誌
      logOperation(
        req.session.user.id,
        req.session.user.username,
        'delete',
        `刪除常用連結：${link.name}`,
        JSON.stringify({
          linkId: link.id,
          name: link.name,
          url: link.url,
          description: link.description || '無'
        }),
        req
      );
      
      console.log(`常用連結刪除成功: ${linkId}`);
      res.json({ message: '常用連結刪除成功' });
    });
  });
});

// ==================== 會議記錄 API ====================

// 獲取所有會議記錄
app.get('/api/secretary/meetings', requireAuth, (req, res) => {
  db.all('SELECT * FROM meeting_records ORDER BY meeting_date DESC, created_at DESC', (err, meetings) => {
    if (err) {
      console.error('獲取會議記錄失敗:', err);
      return res.status(500).json({ message: '獲取會議記錄失敗' });
    }
    res.json(meetings);
  });
});

// 新增會議記錄
app.post('/api/secretary/meetings', requireAuth, (req, res) => {
  const { meeting_date, recorder_name, meeting_content } = req.body;
  
  // 驗證必填欄位
  if (!meeting_date || !recorder_name || !meeting_content) {
    return res.status(400).json({ message: '請填寫所有必填欄位：日期、紀錄人、會議內容' });
  }
  
  const meetingId = 'meeting_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  db.run(
    'INSERT INTO meeting_records (id, meeting_date, recorder_name, meeting_content, created_by) VALUES (?, ?, ?, ?, ?)',
    [meetingId, meeting_date, recorder_name, meeting_content, req.session.user.id],
    function(err) {
      if (err) {
        console.error('新增會議記錄失敗:', err);
        return res.status(500).json({ message: '新增會議記錄失敗' });
      }
      
      // 記錄操作日誌
      logOperation(
        req.session.user.id,
        req.session.user.username,
        'create',
        `新增會議記錄：${meeting_date}`,
        JSON.stringify({
          meetingId,
          meeting_date,
          recorder_name,
          meeting_content: meeting_content.substring(0, 100) + (meeting_content.length > 100 ? '...' : '')
        }),
        req
      );
      
      console.log(`會議記錄新增成功: ${meetingId}`);
      res.status(201).json({ 
        message: '會議記錄新增成功',
        meetingId: meetingId
      });
    }
  );
});

// 更新會議記錄
app.put('/api/secretary/meetings/:id', requireAuth, (req, res) => {
  const meetingId = req.params.id;
  const { meeting_date, recorder_name, meeting_content } = req.body;
  
  // 驗證必填欄位
  if (!meeting_date || !recorder_name || !meeting_content) {
    return res.status(400).json({ message: '請填寫所有必填欄位：日期、紀錄人、會議內容' });
  }
  
  // 先獲取原始資料以便記錄日誌
  db.get('SELECT * FROM meeting_records WHERE id = ?', [meetingId], (err, originalMeeting) => {
    if (err) {
      console.error('查詢會議記錄失敗:', err);
      return res.status(500).json({ message: '更新會議記錄失敗' });
    }
    
    if (!originalMeeting) {
      return res.status(404).json({ message: '找不到指定的會議記錄' });
    }
    
    // 更新會議記錄
    db.run(
      'UPDATE meeting_records SET meeting_date = ?, recorder_name = ?, meeting_content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [meeting_date, recorder_name, meeting_content, meetingId],
      function(err) {
        if (err) {
          console.error('更新會議記錄失敗:', err);
          return res.status(500).json({ message: '更新會議記錄失敗' });
        }
        
        // 記錄操作日誌
        logOperation(
          req.session.user.id,
          req.session.user.username,
          'update',
          `更新會議記錄：${meeting_date}`,
          JSON.stringify({
            meetingId,
            original: {
              meeting_date: originalMeeting.meeting_date,
              recorder_name: originalMeeting.recorder_name,
              meeting_content: originalMeeting.meeting_content.substring(0, 100) + (originalMeeting.meeting_content.length > 100 ? '...' : '')
            },
            updated: {
              meeting_date,
              recorder_name,
              meeting_content: meeting_content.substring(0, 100) + (meeting_content.length > 100 ? '...' : '')
            }
          }),
          req
        );
        
        console.log(`會議記錄更新成功: ${meetingId}`);
        res.json({ message: '會議記錄更新成功' });
      }
    );
  });
});

// 刪除會議記錄
app.delete('/api/secretary/meetings/:id', requireAuth, (req, res) => {
  const meetingId = req.params.id;
  
  // 先獲取會議記錄資料以便記錄日誌
  db.get('SELECT * FROM meeting_records WHERE id = ?', [meetingId], (err, meeting) => {
    if (err) {
      console.error('查詢會議記錄失敗:', err);
      return res.status(500).json({ message: '刪除會議記錄失敗' });
    }
    
    if (!meeting) {
      return res.status(404).json({ message: '找不到指定的會議記錄' });
    }
    
    // 刪除會議記錄
    db.run('DELETE FROM meeting_records WHERE id = ?', [meetingId], function(err) {
      if (err) {
        console.error('刪除會議記錄失敗:', err);
        return res.status(500).json({ message: '刪除會議記錄失敗' });
      }
      
      // 記錄操作日誌
      logOperation(
        req.session.user.id,
        req.session.user.username,
        'delete',
        `刪除會議記錄：${meeting.meeting_date}`,
        JSON.stringify({
          meetingId: meeting.id,
          meeting_date: meeting.meeting_date,
          recorder_name: meeting.recorder_name,
          meeting_content: meeting.meeting_content.substring(0, 100) + (meeting.meeting_content.length > 100 ? '...' : '')
        }),
        req
      );
      
      console.log(`會議記錄刪除成功: ${meetingId}`);
      res.json({ message: '會議記錄刪除成功' });
    });
  });
});

// 創建財務記錄表
db.run(`CREATE TABLE IF NOT EXISTS finance_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount REAL NOT NULL,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  receipt_filename TEXT,
  receipt_original_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  FOREIGN KEY (created_by) REFERENCES users (id)
)`, (err) => {
  if (err) {
    console.error('創建財務記錄表失敗:', err);
  } else {
    console.log('✅ 財務記錄表已準備就緒');
  }
});

// 創建操作記錄表
db.run(`CREATE TABLE IF NOT EXISTS operation_logs (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users (id)
)`, (err) => {
  if (err) {
    console.error('創建操作記錄表失敗:', err);
  } else {
    console.log('✅ 操作記錄表已準備就緒');
  }
});

// 創建財務記錄上傳目錄
const financeDir = path.join(uploadsDir, 'finance');
if (!fs.existsSync(financeDir)) {
  fs.mkdirSync(financeDir, { recursive: true });
}

// 財務記錄檔案上傳配置
const financeStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, financeDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'receipt-' + uniqueSuffix + ext);
  }
});

const financeUpload = multer({
  storage: financeStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB 限制
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允許上傳圖片檔案'), false);
    }
  }
});

// 獲取財務記錄列表
app.get('/api/finance/records', requireAuth, (req, res) => {
  const query = `
    SELECT 
      id, type, amount, date, description, 
      receipt_filename, receipt_original_name,
      created_at, updated_at, created_by
    FROM finance_records 
    ORDER BY date DESC, created_at DESC
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('獲取財務記錄失敗:', err);
      return res.status(500).json({ message: '獲取財務記錄失敗' });
    }
    
    // 為有發票的記錄添加發票URL
    const records = rows.map(record => ({
      ...record,
      receipt_url: record.receipt_filename ? `/uploads/finance/${record.receipt_filename}` : null
    }));
    
    console.log(`獲取財務記錄成功，共 ${records.length} 筆記錄`);
    res.json({ records });
  });
});

// 新增財務記錄
app.post('/api/finance/records', requireAuth, financeUpload.single('receipt'), (req, res) => {
  const { type, amount, date, description } = req.body;
  const userId = req.session.user.id;
  
  if (!type || !amount || !date || !description) {
    return res.status(400).json({ message: '所有欄位都是必填的' });
  }
  
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ message: '類型必須是 income 或 expense' });
  }
  
  const recordId = uuidv4();
  const receiptFilename = req.file ? req.file.filename : null;
  const receiptOriginalName = req.file ? req.file.originalname : null;
  
  db.run(
    `INSERT INTO finance_records 
     (id, type, amount, date, description, receipt_filename, receipt_original_name, created_by) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [recordId, type, parseFloat(amount), date, description, receiptFilename, receiptOriginalName, userId],
    function(err) {
      if (err) {
        console.error('新增財務記錄失敗:', err);
        // 如果有上傳檔案但資料庫插入失敗，刪除檔案
        if (req.file) {
          fs.unlink(req.file.path, (unlinkErr) => {
            if (unlinkErr) console.error('刪除檔案失敗:', unlinkErr);
          });
        }
        return res.status(500).json({ message: '新增財務記錄失敗' });
      }
      
      // 記錄操作日誌
      logOperation(
        userId,
        req.session.user.username,
        'create',
        `新增財務記錄: ${type === 'income' ? '收入' : '支出'} $${amount} - ${description}`,
        `金額: $${amount}, 日期: ${date}, 發票: ${receiptOriginalName || '無'}`,
        req
      );
      
      console.log(`財務記錄新增成功: ${type} $${amount}`);
      res.json({ 
        message: '財務記錄新增成功',
        record: {
          id: recordId,
          type,
          amount: parseFloat(amount),
          date,
          description,
          receipt_url: receiptFilename ? `/uploads/finance/${receiptFilename}` : null
        }
      });
    }
  );
});

// 更新財務記錄
app.put('/api/finance/records/:id', requireAuth, financeUpload.single('receipt'), (req, res) => {
  const recordId = req.params.id;
  const { type, amount, date, description } = req.body;
  
  if (!type || !amount || !date || !description) {
    return res.status(400).json({ message: '所有欄位都是必填的' });
  }
  
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ message: '類型必須是 income 或 expense' });
  }
  
  // 先獲取原記錄以處理檔案
  db.get('SELECT receipt_filename FROM finance_records WHERE id = ?', [recordId], (err, row) => {
    if (err) {
      console.error('查詢原記錄失敗:', err);
      return res.status(500).json({ message: '更新財務記錄失敗' });
    }
    
    if (!row) {
      return res.status(404).json({ message: '找不到指定的財務記錄' });
    }
    
    const oldReceiptFilename = row.receipt_filename;
    const newReceiptFilename = req.file ? req.file.filename : oldReceiptFilename;
    const newReceiptOriginalName = req.file ? req.file.originalname : null;
    
    // 更新記錄
    const updateQuery = req.file ? 
      `UPDATE finance_records 
       SET type = ?, amount = ?, date = ?, description = ?, 
           receipt_filename = ?, receipt_original_name = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?` :
      `UPDATE finance_records 
       SET type = ?, amount = ?, date = ?, description = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`;
    
    const updateParams = req.file ? 
      [type, parseFloat(amount), date, description, newReceiptFilename, newReceiptOriginalName, recordId] :
      [type, parseFloat(amount), date, description, recordId];
    
    db.run(updateQuery, updateParams, function(err) {
      if (err) {
        console.error('更新財務記錄失敗:', err);
        // 如果有新上傳檔案但更新失敗，刪除新檔案
        if (req.file) {
          fs.unlink(req.file.path, (unlinkErr) => {
            if (unlinkErr) console.error('刪除檔案失敗:', unlinkErr);
          });
        }
        return res.status(500).json({ message: '更新財務記錄失敗' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ message: '找不到指定的財務記錄' });
      }
      
      // 如果有新檔案且原來有舊檔案，刪除舊檔案
      if (req.file && oldReceiptFilename && oldReceiptFilename !== newReceiptFilename) {
        const oldFilePath = path.join(financeDir, oldReceiptFilename);
        fs.unlink(oldFilePath, (unlinkErr) => {
          if (unlinkErr) console.error('刪除舊檔案失敗:', unlinkErr);
        });
      }
      
      console.log(`財務記錄更新成功: ${recordId}`);
      
      // 記錄操作日誌
      logOperation(
        req.session.user.id,
        req.session.user.username,
        'update',
        `修改財務記錄：${type === 'income' ? '收入' : '支出'} - ${description}`,
        JSON.stringify({
          recordId,
          type,
          amount: parseFloat(amount),
          date,
          description,
          hasReceipt: !!newReceiptFilename
        }),
        req
      );
      
      res.json({ 
        message: '財務記錄更新成功',
        record: {
          id: recordId,
          type,
          amount: parseFloat(amount),
          date,
          description,
          receipt_url: newReceiptFilename ? `/uploads/finance/${newReceiptFilename}` : null
        }
      });
    });
  });
});

// 刪除財務記錄
app.delete('/api/finance/records/:id', requireAuth, (req, res) => {
  const recordId = req.params.id;
  
  // 先獲取記錄以刪除相關檔案和記錄操作日誌
  db.get('SELECT * FROM finance_records WHERE id = ?', [recordId], (err, row) => {
    if (err) {
      console.error('查詢財務記錄失敗:', err);
      return res.status(500).json({ message: '刪除財務記錄失敗' });
    }
    
    if (!row) {
      return res.status(404).json({ message: '找不到指定的財務記錄' });
    }
    
    // 刪除記錄
    db.run('DELETE FROM finance_records WHERE id = ?', [recordId], function(err) {
      if (err) {
        console.error('刪除財務記錄失敗:', err);
        return res.status(500).json({ message: '刪除財務記錄失敗' });
      }
      
      // 刪除相關檔案
      if (row.receipt_filename) {
        const filePath = path.join(financeDir, row.receipt_filename);
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr) console.error('刪除發票檔案失敗:', unlinkErr);
        });
      }
      
      console.log(`財務記錄刪除成功: ${recordId}`);
      
      // 記錄操作日誌
      logOperation(
        req.session.user.id,
        req.session.user.username,
        'delete',
        `刪除財務記錄：${row.type === 'income' ? '收入' : '支出'} - ${row.description}`,
        JSON.stringify({
          recordId,
          type: row.type,
          amount: row.amount,
          date: row.date,
          description: row.description,
          hadReceipt: !!row.receipt_filename
        }),
        req
      );
      
      res.json({ message: '財務記錄刪除成功' });
    });
  });
});

// 獲取財務統計
app.get('/api/finance/statistics', requireAuth, (req, res) => {
  const query = `
    SELECT 
      type,
      SUM(amount) as total_amount,
      COUNT(*) as count
    FROM finance_records 
    GROUP BY type
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('獲取財務統計失敗:', err);
      return res.status(500).json({ message: '獲取財務統計失敗' });
    }
    
    const statistics = {
      total_income: 0,
      total_expense: 0,
      income_count: 0,
      expense_count: 0
    };
    
    rows.forEach(row => {
      if (row.type === 'income') {
        statistics.total_income = row.total_amount || 0;
        statistics.income_count = row.count || 0;
      } else if (row.type === 'expense') {
        statistics.total_expense = row.total_amount || 0;
        statistics.expense_count = row.count || 0;
      }
    });
    
    statistics.balance = statistics.total_income - statistics.total_expense;
    
    console.log('獲取財務統計成功');
    res.json({ statistics });
  });
});

// 操作記錄 API 路由

// 記錄操作日誌的輔助函數
function logOperation(userId, username, action, description, details = null, req = null) {
  const logId = uuidv4();
  const ipAddress = req ? (req.ip || req.connection.remoteAddress || req.socket.remoteAddress) : null;
  const userAgent = req ? req.get('User-Agent') : null;
  
  db.run(
    `INSERT INTO operation_logs (id, user_id, username, action, description, details, ip_address, user_agent) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [logId, userId, username, action, description, details, ipAddress, userAgent],
    function(err) {
      if (err) {
        console.error('記錄操作日誌失敗:', err);
      } else {
        console.log(`操作日誌記錄成功: ${username} - ${action}`);
      }
    }
  );
}

// 獲取操作記錄列表
app.get('/api/operation-logs', requireAuth, (req, res) => {
  const { page = 1, pageSize = 20, user, action, startDate, endDate, keyword } = req.query;
  const offset = (page - 1) * pageSize;
  
  let whereConditions = [];
  let params = [];
  
  if (user) {
    whereConditions.push('username LIKE ?');
    params.push(`%${user}%`);
  }
  
  if (action) {
    whereConditions.push('action = ?');
    params.push(action);
  }
  
  if (startDate) {
    whereConditions.push('DATE(created_at) >= ?');
    params.push(startDate);
  }
  
  if (endDate) {
    whereConditions.push('DATE(created_at) <= ?');
    params.push(endDate);
  }
  
  if (keyword) {
    whereConditions.push('(description LIKE ? OR details LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  
  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
  
  // 獲取總數
  const countQuery = `SELECT COUNT(*) as total FROM operation_logs ${whereClause}`;
  db.get(countQuery, params, (err, countResult) => {
    if (err) {
      console.error('獲取操作記錄總數失敗:', err);
      return res.status(500).json({ message: '獲取操作記錄失敗' });
    }
    
    // 獲取記錄列表
    const query = `
      SELECT * FROM operation_logs 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `;
    
    db.all(query, [...params, parseInt(pageSize), offset], (err, rows) => {
      if (err) {
        console.error('獲取操作記錄失敗:', err);
        return res.status(500).json({ message: '獲取操作記錄失敗' });
      }
      
      console.log(`獲取操作記錄成功，共 ${rows.length} 筆`);
      res.json({ 
        logs: rows,
        total: countResult.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      });
    });
  });
});

// 獲取用戶列表（用於篩選）
app.get('/api/users', requireAuth, (req, res) => {
  db.all(
    'SELECT id, username, role FROM users ORDER BY username',
    [],
    (err, rows) => {
      if (err) {
        console.error('獲取用戶列表失敗:', err);
        return res.status(500).json({ message: '獲取用戶列表失敗' });
      }
      
      console.log(`獲取用戶列表成功，共 ${rows.length} 筆`);
      res.json(rows);
    }
  );
});

// 新增用戶（僅管理員）
app.post('/api/users', requireAuth, (req, res) => {
  const { name, student_id, username, password, role } = req.body;
  
  // 檢查必填欄位
  if (!name || !student_id || !username || !password || !role) {
    return res.status(400).json({ error: '姓名、學號、使用者名稱、密碼和角色為必填欄位' });
  }
  
  // 檢查角色是否有效
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: '角色必須是 user 或 admin' });
  }
  
  // 檢查密碼長度
  if (password.length < 6) {
    return res.status(400).json({ error: '密碼長度至少6個字元' });
  }
  
  // 檢查當前用戶是否為管理員
  const currentUserId = req.session.user.id;
  
  db.get('SELECT role FROM users WHERE id = ?', [currentUserId], (err, currentUser) => {
    if (err) {
      console.error('檢查用戶權限失敗:', err);
      return res.status(500).json({ error: '檢查用戶權限失敗' });
    }
    
    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({ error: '只有管理員可以新增使用者' });
    }
    
    // 檢查使用者名稱是否已存在
    db.get('SELECT id FROM users WHERE username = ?', [username], (err, existingUser) => {
      if (err) {
        console.error('檢查使用者名稱失敗:', err);
        return res.status(500).json({ error: '檢查使用者名稱失敗' });
      }
      
      if (existingUser) {
        return res.status(400).json({ error: '使用者名稱已存在' });
      }
      
      // 加密密碼
      bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
          console.error('密碼加密失敗:', err);
          return res.status(500).json({ error: '密碼加密失敗' });
        }
        
        // 新增使用者（id會自動遞增）
        db.run(
          'INSERT INTO users (name, student_id, username, password_hash, role) VALUES (?, ?, ?, ?, ?)',
          [name, student_id, username, hashedPassword, role],
          function(err) {
            if (err) {
              console.error('新增使用者失敗:', err);
              return res.status(500).json({ error: '新增使用者失敗' });
            }
            
            const newUserId = this.lastID;
            
            // 記錄操作日誌
            logOperation(
              req.session.user.id,
              req.session.user.username,
              'create_user',
              `新增使用者：${username}`,
              JSON.stringify({
                newUserId: newUserId,
                newUsername: username,
                newUserRole: role
              }),
              req
            );
            
            console.log(`使用者新增成功: ${username} (${role})`);
            res.json({ 
              message: '使用者新增成功',
              user: {
                id: newUserId,
                username: username,
                role: role
              }
            });
          }
        );
      });
    });
  });
});

// 刪除用戶（僅管理員）
app.delete('/api/users/:id', requireAuth, (req, res) => {
  const userId = req.params.id;
  
  // 檢查當前用戶是否為管理員
  const currentUserId = req.session.user.id;
  
  db.get('SELECT role FROM users WHERE id = ?', [currentUserId], (err, currentUser) => {
    if (err) {
      console.error('檢查用戶權限失敗:', err);
      return res.status(500).json({ error: '檢查用戶權限失敗' });
    }
    
    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({ error: '只有管理員可以刪除使用者' });
    }
    
    // 防止刪除自己的帳號
    if (userId == currentUserId) {
      return res.status(400).json({ error: '不能刪除自己的帳號' });
    }
    
    // 先獲取要刪除的用戶信息（用於記錄）
    db.get('SELECT username, role FROM users WHERE id = ?', [userId], (err, userToDelete) => {
      if (err) {
        console.error('獲取用戶信息失敗:', err);
        return res.status(500).json({ error: '獲取用戶信息失敗' });
      }
      
      if (!userToDelete) {
        return res.status(404).json({ error: '用戶不存在' });
      }
      
      // 刪除用戶
      db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
        if (err) {
          console.error('刪除用戶失敗:', err);
          return res.status(500).json({ error: '刪除用戶失敗' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: '用戶不存在' });
        }
        
        // 記錄操作日誌
        logOperation(
          req.session.user.id,
          req.session.user.username,
          'delete_user',
          `刪除使用者：${userToDelete.username}`,
          JSON.stringify({
            deletedUserId: userId,
            deletedUsername: userToDelete.username,
            deletedUserRole: userToDelete.role
          }),
          req
        );
        
        console.log(`使用者刪除成功: ${userToDelete.username}`);
        res.json({ message: '使用者刪除成功' });
      });
    });
  });
});

// 一鍵刪除所有操作記錄（僅管理員）- 必須放在 :id 路由之前
app.delete('/api/operation-logs/delete-all', requireAuth, (req, res) => {
  console.log('=== 一鍵刪除API開始執行 ===');
  console.log('req.session:', req.session ? 'exists' : 'null');
  console.log('req.session.user:', req.session && req.session.user ? req.session.user : 'null');
  
  // 安全檢查 session 和 user 信息
  if (!req.session || !req.session.user) {
    console.error('一鍵刪除失敗: session 或 user 信息不存在');
    return res.status(401).json({ message: '用戶信息不存在，請重新登入' });
  }
  
  const userId = req.session.user.id;
  const username = req.session.user.username;
  
  console.log(`一鍵刪除請求 - 用戶: ${username}, ID: ${userId}`);
  console.log('準備檢查用戶權限...');
  
  // 額外檢查用戶信息的完整性
  if (!userId || !username) {
    console.error('一鍵刪除失敗: 用戶ID或用戶名為空');
    return res.status(401).json({ message: '用戶信息不完整，請重新登入' });
  }
  
  // 檢查是否為管理員
  db.get('SELECT role FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      console.error('檢查用戶權限失敗:', err);
      return res.status(500).json({ message: '檢查用戶權限失敗' });
    }
    
    console.log(`用戶權限檢查結果 - 用戶: ${username}, 角色: ${user ? user.role : 'null'}`);
    
    if (!user || user.role !== 'admin') {
      console.log(`非管理員用戶 ${username} 嘗試一鍵刪除所有操作記錄`);
      return res.status(403).json({ message: '只有管理員可以執行此操作' });
    }
    
    // 先獲取要刪除的記錄總數
    db.get('SELECT COUNT(*) as count FROM operation_logs', [], (err, countResult) => {
      if (err) {
        console.error('獲取操作記錄總數失敗:', err);
        return res.status(500).json({ message: '獲取操作記錄總數失敗' });
      }
      
      const totalRecords = countResult.count;
      
      if (totalRecords === 0) {
        return res.json({ message: '沒有操作記錄需要刪除' });
      }
      
      // 執行刪除所有記錄
      db.run('DELETE FROM operation_logs', [], function(err) {
        if (err) {
          console.error('一鍵刪除所有操作記錄失敗:', err);
          return res.status(500).json({ message: '一鍵刪除所有操作記錄失敗' });
        }
        
        // 記錄此刪除操作
        const deleteDetails = {
          deletedRecordsCount: totalRecords,
          operationType: 'bulk_delete_all',
          timestamp: new Date().toISOString()
        };
        
        logOperation(
          userId,
          username,
          'delete',
          `一鍵刪除所有操作記錄，共刪除 ${totalRecords} 筆記錄`,
          JSON.stringify(deleteDetails),
          req
        );
        
        console.log(`管理員 ${username} 一鍵刪除了所有操作記錄，共 ${totalRecords} 筆`);
        res.json({ 
          message: `成功刪除所有操作記錄，共 ${totalRecords} 筆`,
          deletedCount: totalRecords
        });
      });
    });
  });
});

// 刪除操作記錄（僅管理員）
app.delete('/api/operation-logs/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const username = req.session.user.username;
  
  // 檢查是否為管理員
  db.get('SELECT role FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      console.error('檢查用戶權限失敗:', err);
      return res.status(500).json({ message: '檢查用戶權限失敗' });
    }
    
    if (!user || user.role !== 'admin') {
      console.log(`非管理員用戶 ${username} 嘗試刪除操作記錄`);
      return res.status(403).json({ message: '只有管理員可以刪除操作記錄' });
    }
    
    // 先獲取要刪除的記錄資訊
    db.get('SELECT * FROM operation_logs WHERE id = ?', [id], (err, logRecord) => {
      if (err) {
        console.error('獲取操作記錄失敗:', err);
        return res.status(500).json({ message: '獲取操作記錄失敗' });
      }
      
      if (!logRecord) {
        return res.status(404).json({ message: '操作記錄不存在' });
      }
      
      // 執行刪除
      db.run('DELETE FROM operation_logs WHERE id = ?', [id], function(err) {
        if (err) {
          console.error('刪除操作記錄失敗:', err);
          return res.status(500).json({ message: '刪除操作記錄失敗' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ message: '操作記錄不存在' });
        }
        
        // 記錄刪除操作
        const deleteDetails = {
          deletedLogId: id,
          deletedLogUser: logRecord.username,
          deletedLogAction: logRecord.action,
          deletedLogDescription: logRecord.description,
          deletedLogTime: logRecord.created_at
        };
        
        logOperation(
          userId,
          username,
          'delete',
          `刪除操作記錄: ${logRecord.username} 的 ${logRecord.action} 操作`,
          JSON.stringify(deleteDetails),
          req
        );
        
        console.log(`管理員 ${username} 刪除了操作記錄 ${id}`);
        res.json({ message: '操作記錄已成功刪除' });
      });
    });
  });
});

// 添加歷史記錄頁面路由
app.get('/history', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'page', 'history.html'));
});

// Multer 錯誤處理中間件
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer 錯誤:', err);
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({ message: '檔案大小超過限制（最大 5MB）' });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({ message: '檔案數量超過限制（最多 1 個）' });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({ message: '意外的檔案欄位' });
      default:
        return res.status(400).json({ message: '檔案上傳錯誤: ' + err.message });
    }
  }
  next(err);
});

// 一般錯誤處理
app.use((err, req, res, next) => {
  console.error('伺服器錯誤:', err);
  res.status(500).json({ message: '伺服器內部錯誤' });
});

// 404 處理（必須放在最後）
app.use((req, res) => {
  res.status(404).json({ message: '頁面不存在' });
});

// 啟動
app.listen(PORT, () => {
  console.log(`🚀 伺服器已啟動: http://localhost:${PORT}`);
});

// 優雅關閉
process.on('SIGINT', () => {
  console.log('正在關閉伺服器...');
  db.close(() => process.exit(0));
});