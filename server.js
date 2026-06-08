const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = 3000;

// ── 初始化資料庫 ──────────────────────────────────────────
const db = new Database(path.join(__dirname, 'database.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin'
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS nav_buttons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    parent_id INTEGER DEFAULT NULL,
    sort_order INTEGER DEFAULT 0,
    target TEXT DEFAULT '_self'
  );

  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// 預設帳號（admin/admin123）
const bcrypt = require('bcryptjs');
const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!existingUser) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('admin', hash);
}

// 預設站台設定
const defaultSettings = [
  ['site_title', '御園國小'],
  ['site_subtitle', '學習、成長、創造未來'],
  ['site_address', '台中市○○區御園路1號'],
  ['site_phone', '(04) 1234-5678'],
  ['site_email', 'info@yuanpark.edu.tw'],
];
const insertSetting = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
defaultSettings.forEach(([k, v]) => insertSetting.run(k, v));

// 預設選單
const navCount = db.prepare('SELECT COUNT(*) as cnt FROM nav_buttons').get();
if (navCount.cnt === 0) {
  const insertNav = db.prepare('INSERT INTO nav_buttons (name, url, parent_id, sort_order, target) VALUES (?, ?, ?, ?, ?)');
  insertNav.run('首頁', '/', null, 0, '_self');
  insertNav.run('認識校園', '/campus', null, 1, '_self');
  insertNav.run('最新消息', '/news', null, 2, '_self');
  insertNav.run('聯絡我們', '/contact', null, 3, '_self');
}

// 預設公告
const annCount = db.prepare('SELECT COUNT(*) as cnt FROM announcements').get();
if (annCount.cnt === 0) {
  const insertAnn = db.prepare('INSERT INTO announcements (title, content, date) VALUES (?, ?, ?)');
  insertAnn.run('歡迎來到御園國小官方網站', '本校官方網站正式上線，歡迎各位家長及同學蒞臨參觀。', '2026-06-08');
  insertAnn.run('暑假營隊報名開始', '2026年暑期多元學習營隊即日起開放報名，名額有限請盡早報名。', '2026-06-05');
  insertAnn.run('期末成績查詢系統開放', '113學年度第二學期期末成績查詢系統即日起開放，請同學登入查詢。', '2026-06-01');
}

// 將 db 掛在 app 上，讓 routes 使用
app.locals.db = db;

// ── Middleware ─────────────────────────────────────────────
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'yuanpark-school-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8小時
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// ── Routes ────────────────────────────────────────────────
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');
app.use('/admin-api', adminRoutes);
app.use('/api', apiRoutes);

// SPA fallback for admin
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏫 御園國小網站已啟動！`);
  console.log(`🌐 前台：http://localhost:${PORT}`);
  console.log(`🔐 後台：http://localhost:${PORT}/admin/dashboard.html`);
  console.log(`👤 預設帳號：admin / admin123\n`);
});
