const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 配置
const config = {
  // 資料庫路徑
  dbPath: process.env.NODE_ENV === 'production' 
    ? '/opt/render/project/src/data/app.db'
    : path.join(__dirname, '../data/app.db'),
  
  // 上傳檔案目錄
  uploadsPath: path.join(__dirname, '../uploads'),
  
  // 備份目錄
  backupDir: path.join(__dirname, '../backups'),
  
  // 保留備份數量
  maxBackups: 7
};

// 確保備份目錄存在
function ensureBackupDir() {
  if (!fs.existsSync(config.backupDir)) {
    fs.mkdirSync(config.backupDir, { recursive: true });
    console.log('已創建備份目錄:', config.backupDir);
  }
}

// 生成備份檔案名稱
function generateBackupName(type) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${type}-backup-${timestamp}`;
}

// 備份資料庫
function backupDatabase() {
  try {
    if (!fs.existsSync(config.dbPath)) {
      console.log('資料庫檔案不存在:', config.dbPath);
      return null;
    }

    const backupName = generateBackupName('database');
    const backupPath = path.join(config.backupDir, `${backupName}.db`);
    
    // 複製資料庫檔案
    fs.copyFileSync(config.dbPath, backupPath);
    console.log('資料庫備份完成:', backupPath);
    
    return backupPath;
  } catch (error) {
    console.error('資料庫備份失敗:', error.message);
    return null;
  }
}

// 備份上傳檔案
function backupUploads() {
  try {
    if (!fs.existsSync(config.uploadsPath)) {
      console.log('上傳目錄不存在:', config.uploadsPath);
      return null;
    }

    const backupName = generateBackupName('uploads');
    const backupPath = path.join(config.backupDir, `${backupName}.tar.gz`);
    
    // 使用 tar 壓縮上傳目錄（Windows 需要安裝 tar 或使用其他壓縮工具）
    try {
      execSync(`tar -czf "${backupPath}" -C "${path.dirname(config.uploadsPath)}" "${path.basename(config.uploadsPath)}"`);
      console.log('檔案備份完成:', backupPath);
      return backupPath;
    } catch (tarError) {
      // 如果 tar 不可用，使用簡單的目錄複製
      const backupDir = path.join(config.backupDir, backupName);
      copyDirectory(config.uploadsPath, backupDir);
      console.log('檔案備份完成 (目錄複製):', backupDir);
      return backupDir;
    }
  } catch (error) {
    console.error('檔案備份失敗:', error.message);
    return null;
  }
}

// 遞歸複製目錄
function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const items = fs.readdirSync(src);
  
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 清理舊備份
function cleanOldBackups() {
  try {
    const files = fs.readdirSync(config.backupDir)
      .filter(file => file.includes('backup'))
      .map(file => ({
        name: file,
        path: path.join(config.backupDir, file),
        time: fs.statSync(path.join(config.backupDir, file)).mtime
      }))
      .sort((a, b) => b.time - a.time);
    
    // 保留最新的 maxBackups 個備份
    const filesToDelete = files.slice(config.maxBackups);
    
    for (const file of filesToDelete) {
      if (fs.statSync(file.path).isDirectory()) {
        fs.rmSync(file.path, { recursive: true, force: true });
      } else {
        fs.unlinkSync(file.path);
      }
      console.log('已刪除舊備份:', file.name);
    }
  } catch (error) {
    console.error('清理舊備份失敗:', error.message);
  }
}

// 主備份函數
function performBackup() {
  console.log('開始備份程序...');
  console.log('備份時間:', new Date().toLocaleString());
  
  ensureBackupDir();
  
  const dbBackup = backupDatabase();
  const uploadsBackup = backupUploads();
  
  // 清理舊備份
  cleanOldBackups();
  
  console.log('備份程序完成!');
  
  return {
    database: dbBackup,
    uploads: uploadsBackup,
    timestamp: new Date().toISOString()
  };
}

// 如果直接執行此腳本
if (require.main === module) {
  performBackup();
}

module.exports = {
  performBackup,
  backupDatabase,
  backupUploads,
  cleanOldBackups
};