import express from 'express'
import session from 'express-session'
import bodyParser from 'body-parser'
import path from 'path'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const { Pool } = pg

const app = express()
const PORT = process.env.PORT || 3000

// =====================
// DB CONNECT
// =====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

// 讓 routes 可以用
app.locals.pool = pool

// =====================
// Middleware
// =====================
app.use(express.json())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.use(session({
  secret: 'yuanpark-school-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}))

app.use(express.static(path.join(__dirname, 'public')))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
app.use('/admin', express.static(path.join(__dirname, 'admin')))

// =====================
// Routes
// =====================
import adminRoutes from './routes/admin.js'
import apiRoutes from './routes/api.js'

app.use('/admin-api', adminRoutes)
app.use('/api', apiRoutes)

// SPA fallback
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'))
})

// =====================
// 初始化資料庫
// =====================
async function initDB() {
  try {
    // 建立資料表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'admin'
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        date DATE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS nav_buttons (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        parent_id BIGINT DEFAULT NULL,
        sort_order INT DEFAULT 0,
        target TEXT DEFAULT '_self'
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `)

    // 預設管理員帳號（只在不存在時建立）
    const userCheck = await pool.query(`SELECT id FROM users WHERE username='admin'`)
    if (userCheck.rows.length === 0) {
      const hash = bcrypt.hashSync('admin123', 10)
      await pool.query(
        `INSERT INTO users (username, password) VALUES ('admin', $1)`,
        [hash]
      )
      console.log('✅ 預設帳號已建立：admin / admin123')
    }

    // 預設網站設定
    const defaultSettings = [
      ['site_title', '御園國小'],
      ['site_subtitle', '學習、成長、創造未來'],
      ['site_address', '台中市○○區御園路1號'],
      ['site_phone', '(04) 1234-5678'],
      ['site_email', 'info@yuanpark.edu.tw'],
    ]
    for (const [k, v] of defaultSettings) {
      await pool.query(
        `INSERT INTO site_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [k, v]
      )
    }

    // 預設選單
    const navCheck = await pool.query(`SELECT COUNT(*) as cnt FROM nav_buttons`)
    if (parseInt(navCheck.rows[0].cnt) === 0) {
      const navItems = [
        ['首頁', '/', null, 0, '_self'],
        ['認識校園', '/campus', null, 1, '_self'],
        ['最新消息', '/news', null, 2, '_self'],
        ['聯絡我們', '/contact', null, 3, '_self'],
      ]
      for (const [name, url, parent_id, sort_order, target] of navItems) {
        await pool.query(
          `INSERT INTO nav_buttons (name, url, parent_id, sort_order, target) VALUES ($1,$2,$3,$4,$5)`,
          [name, url, parent_id, sort_order, target]
        )
      }
      console.log('✅ 預設選單已建立')
    }

    // 預設公告
    const annCheck = await pool.query(`SELECT COUNT(*) as cnt FROM announcements`)
    if (parseInt(annCheck.rows[0].cnt) === 0) {
      const anns = [
        ['歡迎來到御園國小官方網站', '本校官方網站正式上線，歡迎各位家長及同學蒞臨參觀。', '2026-06-08'],
        ['暑假營隊報名開始', '2026年暑期多元學習營隊即日起開放報名，名額有限請盡早報名。', '2026-06-05'],
        ['期末成績查詢系統開放', '113學年度第二學期期末成績查詢系統即日起開放，請同學登入查詢。', '2026-06-01'],
      ]
      for (const [title, content, date] of anns) {
        await pool.query(
          `INSERT INTO announcements (title, content, date) VALUES ($1,$2,$3)`,
          [title, content, date]
        )
      }
      console.log('✅ 預設公告已建立')
    }

    console.log('✅ 資料庫初始化完成')
  } catch (err) {
    console.error('❌ initDB error:', err)
  }
}

// =====================
// START SERVER
// =====================
app.listen(PORT, async () => {
  console.log(`\n🏫 御園國小網站已啟動！`)
  console.log(`🌐 前台：http://localhost:${PORT}`)
  console.log(`🔐 後台：http://localhost:${PORT}/admin/dashboard.html`)
  console.log(`👤 預設帳號：admin / admin123\n`)

  await initDB()
})
