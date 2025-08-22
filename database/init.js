const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

// 確保 data 目錄存在
// 在生產環境中使用持久化磁盤路徑，本地開發使用相對路徑
const dataDir = process.env.NODE_ENV === 'production' 
  ? '/opt/render/project/src/data' 
  : path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'app.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log('開始初始化資料庫...');

  // 建立使用者資料表
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    student_id TEXT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('建立使用者資料表失敗:', err);
      return;
    }
    console.log('使用者資料表已確認/建立');

    // （可選）建立預設管理員
    db.get("SELECT id FROM users WHERE username = 'admin'", (err, row) => {
      if (err) {
        console.error('檢查管理員帳號錯誤:', err);
        return;
      }
      if (!row) {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        db.run(
          "INSERT INTO users (name, student_id, username, password_hash, role) VALUES (?, ?, ?, ?, ?)",
          ['管理員', 'ADMIN001', 'admin', hashedPassword, 'admin'],
          (err) => {
            if (err) console.error('建立管理員帳號錯誤:', err);
            else console.log('已建立預設管理員: admin / admin123');
            
            // 完成後關閉資料庫
            db.close((err) => {
              if (err) console.error('關閉資料庫錯誤:', err);
              else console.log('資料庫初始化完成！');
            });
          }
        );
      } else {
        console.log('已存在管理員帳號，略過建立。');
        db.close((err) => {
          if (err) console.error('關閉資料庫錯誤:', err);
          else console.log('資料庫初始化完成！');
        });
      }
    });
  });
});