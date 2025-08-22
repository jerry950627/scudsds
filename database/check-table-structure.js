const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// 確保 data 目錄存在
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// 連接到 SQLite 資料庫
const dbPath = path.join(dataDir, 'app.db');
const db = new sqlite3.Database(dbPath);

console.log('檢查 users 資料表結構...');

// 檢查資料表結構
db.all("PRAGMA table_info(users)", (err, columns) => {
    if (err) {
        console.error('❌ 檢查資料表結構時發生錯誤:', err.message);
        db.close();
        process.exit(1);
    }
    
    console.log('\n📋 users 資料表欄位結構:');
    console.log('=' .repeat(50));
    
    columns.forEach((col, index) => {
        console.log(`${index + 1}. ${col.name}`);
        console.log(`   類型: ${col.type}`);
        console.log(`   允許 NULL: ${col.notnull === 0 ? '是' : '否'}`);
        console.log(`   預設值: ${col.dflt_value || '無'}`);
        console.log(`   主鍵: ${col.pk === 1 ? '是' : '否'}`);
        console.log('');
    });
    
    console.log(`總共 ${columns.length} 個欄位`);
    
    // 顯示所有使用者資料
    db.all('SELECT * FROM users', (err, users) => {
        if (err) {
            console.error('❌ 查詢使用者資料時發生錯誤:', err.message);
        } else {
            console.log('\n👥 目前使用者資料:');
            console.log('=' .repeat(50));
            
            if (users.length === 0) {
                console.log('目前沒有使用者資料');
            } else {
                users.forEach((user, index) => {
                    console.log(`使用者 ${index + 1}:`);
                    Object.keys(user).forEach(key => {
                        if (key === 'password_hash') {
                            console.log(`   ${key}: [已加密]`);
                        } else {
                            console.log(`   ${key}: ${user[key]}`);
                        }
                    });
                    console.log('');
                });
            }
        }
        
        db.close();
        console.log('資料庫連線已關閉');
    });
});