const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

// 確保 data 目錄存在
const dataDir = process.env.NODE_ENV === 'production' 
  ? '/opt/render/project/src/data' 
  : path.join(__dirname, '..', 'data');

const dbPath = path.join(dataDir, 'app.db');
const db = new sqlite3.Database(dbPath);

// 更新用戶密碼 - 警告：此檔案包含明文密碼，請謹慎使用
// 建議：使用環境變數或命令行參數傳入密碼
const username = process.argv[2] || 'scuds13173149'; // 可通過命令行參數指定用戶名
const newPassword = process.argv[3] || '5028'; // 可通過命令行參數指定新密碼

// 使用方法: node update-password.js [username] [newPassword]
const hashedPassword = bcrypt.hashSync(newPassword, 10);

db.run(
  "UPDATE users SET password_hash = ? WHERE username = ?",
  [hashedPassword, username],
  function(err) {
    if (err) {
      console.error('更新密碼錯誤:', err);
    } else {
      console.log(`用戶 ${username} 的密碼已更新為: ${newPassword}`);
      console.log(`影響的行數: ${this.changes}`);
    }
    
    // 驗證更新
    db.get("SELECT username, password_hash FROM users WHERE username = ?", [username], (err, row) => {
      if (err) {
        console.error('查詢用戶錯誤:', err);
      } else if (row) {
        console.log(`找到用戶: ${row.username}`);
        const isValid = bcrypt.compareSync(newPassword, row.password_hash);
        console.log(`密碼驗證: ${isValid ? '成功' : '失敗'}`);
      } else {
        console.log('未找到用戶');
      }
      
      db.close((err) => {
        if (err) console.error('關閉資料庫錯誤:', err);
        else console.log('密碼更新完成！');
      });
    });
  }
);