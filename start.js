const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 檢查是否為生產環境
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  console.log('生產環境啟動中...');
  
  // 確保資料庫目錄存在
  const dataDir = '/opt/render/project/src/data';
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('已創建資料庫目錄:', dataDir);
  }
  
  // 檢查資料庫是否存在，如果不存在則初始化
  const dbPath = path.join(dataDir, 'app.db');
  if (!fs.existsSync(dbPath)) {
    console.log('資料庫不存在，開始初始化...');
    
    // 運行資料庫初始化
    const initProcess = spawn('node', ['database/init.js'], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' }
    });
    
    initProcess.on('close', (code) => {
      if (code === 0) {
        console.log('資料庫初始化完成，啟動服務器...');
        startServer();
      } else {
        console.error('資料庫初始化失敗，退出碼:', code);
        process.exit(1);
      }
    });
  } else {
    console.log('資料庫已存在，直接啟動服務器...');
    startServer();
  }
} else {
  console.log('開發環境啟動中...');
  startServer();
}

function startServer() {
  const serverProcess = spawn('node', ['server.js'], {
    stdio: 'inherit',
    env: process.env
  });
  
  serverProcess.on('close', (code) => {
    console.log('服務器進程結束，退出碼:', code);
    process.exit(code);
  });
  
  // 處理進程終止信號
  process.on('SIGTERM', () => {
    console.log('收到 SIGTERM 信號，正在關閉服務器...');
    serverProcess.kill('SIGTERM');
  });
  
  process.on('SIGINT', () => {
    console.log('收到 SIGINT 信號，正在關閉服務器...');
    serverProcess.kill('SIGINT');
  });
}