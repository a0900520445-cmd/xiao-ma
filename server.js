import express from 'express'
import session from 'express-session'
import bodyParser from 'body-parser'
import path from 'path'
import pg from 'pg'

const { Pool } = pg

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json());

app.post('/nav_buttons', async (req, res) => {

  const { name, url, parent_id, sort_order, target } = req.body;

  try {
    await pool.query(
      `INSERT INTO nav_buttons (name, url, parent_id, sort_order, target)
       VALUES ($1, $2, $3, $4, $5)`,
      [name, url, parent_id, sort_order, target]
    );

    res.send('ok');

  } catch (err) {
    console.error(err);
    res.status(500).send('error');
  }
});
// ── 初始化資料庫 ──────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});


  await pool.query(`
  CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title TEXT,
    content TEXT,
    date DATE
  )
`)
// 預設帳號（admin/admin123）
import bcrypt from 'bcryptjs'

// 查使用者
const existingUser = await pool.query(
  'SELECT id FROM users WHERE username = $1',
  ['admin']
)

if (existingUser.rows.length === 0) {
  const hash = bcrypt.hashSync('admin123', 10)

  await pool.query(
    'INSERT INTO users (username, password) VALUES ($1, $2)',
    ['admin', hash]
  )
}

// 預設站台設定
const defaultSettings = [
  ['site_title', '御園國小'],
  ['site_subtitle', '學習、成長、創造未來'],
  ['site_address', '台中市○○區御園路1號'],
  ['site_phone', '(04) 1234-5678'],
  ['site_email', 'info@yuanpark.edu.tw'],
];
for (const [k, v] of defaultSettings) {
  await pool.query(
    `INSERT INTO site_settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO NOTHING`,
    [k, v]
  )
}

// 預設選單
const navCountResult = await pool.query(
  'SELECT COUNT(*) as cnt FROM nav_buttons'
);

if (parseInt(navCountResult.rows[0].cnt) === 0) {

  await pool.query(
    `INSERT INTO nav_buttons (name, url, parent_id, sort_order, target)
     VALUES ($1, $2, $3, $4, $5)`,
    ['首頁', '/', null, 0, '_self']
  );

  await pool.query(
    `INSERT INTO nav_buttons (name, url, parent_id, sort_order, target)
     VALUES ($1, $2, $3, $4, $5)`,
    ['認識校園', '/campus', null, 1, '_self']
  );

  await pool.query(
    `INSERT INTO nav_buttons (name, url, parent_id, sort_order, target)
     VALUES ($1, $2, $3, $4, $5)`,
    ['最新消息', '/news', null, 2, '_self']
  );

  await pool.query(
    `INSERT INTO nav_buttons (name, url, parent_id, sort_order, target)
     VALUES ($1, $2, $3, $4, $5)`,
    ['聯絡我們', '/contact', null, 3, '_self']
  );
}
  insertNav.run('首頁', '/', null, 0, '_self');
  insertNav.run('認識校園', '/campus', null, 1, '_self');
  insertNav.run('最新消息', '/news', null, 2, '_self');
  insertNav.run('聯絡我們', '/contact', null, 3, '_self');
}

// 預設公告
const annCountResult = await pool.query(
  'SELECT COUNT(*) as cnt FROM announcements'
);

const annCount = parseInt(annCountResult.rows[0].cnt);

if (annCount === 0) {
  await pool.query(
  'INSERT INTO announcements(title,content,date) VALUES ($1,$2,$3)',
  ['歡迎來到御園國小官方網站', '本校官方網站正式上線，歡迎各位家長及同學蒞臨參觀。', '2026-06-08']
);

await pool.query(
  'INSERT INTO announcements(title,content,date) VALUES ($1,$2,$3)',
  ['暑假營隊報名開始', '2026年暑期多元學習營隊即日起開放報名，名額有限請盡早報名。', '2026-06-05']
);

await pool.query(
  'INSERT INTO announcements(title,content,date) VALUES ($1,$2,$3)',
  ['期末成績查詢系統開放', '113學年度第二學期期末成績查詢系統即日起開放，請同學登入查詢。', '2026-06-01']
);

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
