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

    // 建立預設帳號 - 重要：部署後請立即修改預設密碼！
    const defaultUsers = [
      {
        name: '管理員',
        student_id: 'ADMIN001',
        username: 'admin',
        password: 'admin123', // 請在部署後立即修改此密碼
        role: 'admin'
      },
      {
        name: '學會成員',
        student_id: '13173149',
        username: 'scuds13173149',
        password: '5028', // 請在部署後立即修改此密碼
        role: 'user'
      }
    ];

    let usersCreated = 0;
    let totalUsers = defaultUsers.length;

    function createUser(userIndex) {
      if (userIndex >= totalUsers) {
        // 所有用戶處理完成，關閉資料庫
        db.close((err) => {
          if (err) console.error('關閉資料庫錯誤:', err);
          else console.log('資料庫初始化完成！');
        });
        return;
      }

      const user = defaultUsers[userIndex];
      db.get("SELECT id FROM users WHERE username = ?", [user.username], (err, row) => {
        if (err) {
          console.error(`檢查用戶 ${user.username} 錯誤:`, err);
          createUser(userIndex + 1);
          return;
        }
        
        if (!row) {
          const hashedPassword = bcrypt.hashSync(user.password, 10);
          db.run(
            "INSERT INTO users (name, student_id, username, password_hash, role) VALUES (?, ?, ?, ?, ?)",
            [user.name, user.student_id, user.username, hashedPassword, user.role],
            (err) => {
              if (err) {
                console.error(`建立用戶 ${user.username} 錯誤:`, err);
              } else {
                console.log(`已建立用戶: ${user.username} / ${user.password}`);
                usersCreated++;
              }
              createUser(userIndex + 1);
            }
          );
        } else {
          console.log(`用戶 ${user.username} 已存在，略過建立。`);
          createUser(userIndex + 1);
        }
      });
    }

    // 開始建立用戶
    createUser(0);
  });
});