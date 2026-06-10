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
// DB CONNECT（一定要最前面）
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
// API（保留你的 nav insert）
// =====================
app.post('/nav_buttons', async (req, res) => {
  const { name, url, parent_id, sort_order, target } = req.body

  try {
    await pool.query(
      `INSERT INTO nav_buttons (name, url, parent_id, sort_order, target)
       VALUES ($1, $2, $3, $4, $5)`,
      [name, url, parent_id, sort_order, target]
    )

    res.send('ok')
  } catch (err) {
    console.error(err)
    res.status(500).send('error')
  }
})

// =====================
// 初始化（改成 function，不阻塞 server）
// =====================
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title TEXT,
        content TEXT,
        date DATE
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS nav_buttons (
        id SERIAL PRIMARY KEY,
        name TEXT,
        url TEXT,
        parent_id BIGINT,
        sort_order INT,
        target TEXT
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT,
        password TEXT
      )
    `)

  } catch (err) {
    console.error('initDB error:', err)
  }
}

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
// START SERVER（重點修正）
// =====================
app.listen(PORT, async () => {
  console.log(`\n🏫 御園國小網站已啟動！`)
  console.log(`🌐 前台：http://localhost:${PORT}`)
  console.log(`🔐 後台：http://localhost:${PORT}/admin/dashboard.html`)
  console.log(`👤 預設帳號：admin / admin123\n`)

  await initDB() // ⭐避免卡 render startup
})
