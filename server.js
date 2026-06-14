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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})
app.locals.pool = pool

app.use(express.json({ limit: '20mb' }))
app.use(bodyParser.json({ limit: '20mb' }))
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }))
app.use(session({
  secret: 'yuanpark-school-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}))
app.use(express.static(path.join(__dirname, 'public')))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
app.use('/admin', express.static(path.join(__dirname, 'admin')))

import adminRoutes from './routes/admin.js'
import apiRoutes from './routes/api.js'
app.use('/admin-api', adminRoutes)
app.use('/api', apiRoutes)
app.get('/news', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'news.html'))
})
app.get('/campus', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'campus.html'))
})
app.get('/leave_query', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'leave_query.html'))
})
app.get('/class_inspections', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'class_inspections.html'))
})
app.get('/honor_board', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'honor_board.html'))
})
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'))
})

async function initDB() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL, role TEXT DEFAULT 'admin'
    )`)
    await pool.query(`CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
      date DATE NOT NULL, image_url TEXT DEFAULT NULL,
      department TEXT DEFAULT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
    )`)
    await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL`)
    await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS department TEXT DEFAULT NULL`)
    await pool.query(`CREATE TABLE IF NOT EXISTS nav_buttons (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL,
      parent_id BIGINT DEFAULT NULL, sort_order INT DEFAULT 0, target TEXT DEFAULT '_self'
    )`)
    await pool.query(`CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT)`)
    await pool.query(`CREATE TABLE IF NOT EXISTS campus_blocks (
      id SERIAL PRIMARY KEY, type TEXT NOT NULL,
      content TEXT, image_url TEXT, sort_order INT DEFAULT 0
    )`)
    await pool.query(`CREATE TABLE IF NOT EXISTS campus_buttons (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL,
      target TEXT DEFAULT '_self', sort_order INT DEFAULT 0
    )`)

    const uc = await pool.query(`SELECT id FROM users WHERE username='admin'`)
    if (uc.rows.length === 0) {
      const hash = bcrypt.hashSync('admin123', 10)
      await pool.query(`INSERT INTO users (username,password) VALUES ('admin',$1)`, [hash])
      console.log('✅ 預設帳號：admin / admin123')
    }
    for (const [k,v] of [
      ['site_title','御園國小'],['site_subtitle','學習、成長、創造未來'],
      ['site_address','台中市○○區御園路1號'],['site_phone','(04) 1234-5678'],
      ['site_email','info@yuanpark.edu.tw']
    ]) {
      await pool.query(`INSERT INTO site_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`,[k,v])
    }
    const nc = await pool.query(`SELECT COUNT(*) as cnt FROM nav_buttons`)
    if (parseInt(nc.rows[0].cnt) === 0) {
      for (const [name,url,pid,ord,tgt] of [
        ['首頁','/',null,0,'_self'],['認識校園','/campus.html',null,1,'_self'],
        ['最新消息','/news.html',null,2,'_self'],['聯絡我們','/contact',null,3,'_self'],
      ]) {
        await pool.query(`INSERT INTO nav_buttons (name,url,parent_id,sort_order,target) VALUES ($1,$2,$3,$4,$5)`,[name,url,pid,ord,tgt])
      }
    }
    const ac = await pool.query(`SELECT COUNT(*) as cnt FROM announcements`)
    if (parseInt(ac.rows[0].cnt) === 0) {
      for (const [t,c,d,dept] of [
        ['歡迎來到御園國小官方網站','本校官方網站正式上線，歡迎各位家長及同學蒞臨參觀。','2026-06-08',null],
        ['暑假營隊報名開始','2026年暑期多元學習營隊即日起開放報名，名額有限請盡早報名。','2026-06-05','student'],
        ['期末成績查詢系統開放','113學年度第二學期期末成績查詢系統即日起開放。','2026-06-01','academic'],
      ]) {
        await pool.query(`INSERT INTO announcements (title,content,date,department) VALUES ($1,$2,$3,$4)`,[t,c,d,dept])
      }
    }
    await pool.query(`CREATE TABLE IF NOT EXISTS leave_requests (
      id SERIAL PRIMARY KEY,
      student_id BIGINT NOT NULL,
      name TEXT NOT NULL,
      class TEXT NOT NULL,
      leave_type TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT '待審核',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      review_time TIMESTAMPTZ DEFAULT NULL
    )`)
    await pool.query(`CREATE TABLE IF NOT EXISTS class_inspections (
      id BIGSERIAL PRIMARY KEY,
      class_name TEXT NOT NULL,
      teacher_name TEXT NOT NULL,
      score INT NOT NULL,
      comment TEXT,
      inspection_date DATE NOT NULL,
      period TEXT,
      subject TEXT,
      subject_teacher TEXT,
      inspector_position TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`)
    await pool.query(`ALTER TABLE class_inspections ADD COLUMN IF NOT EXISTS period TEXT`)
    await pool.query(`ALTER TABLE class_inspections ADD COLUMN IF NOT EXISTS subject TEXT`)
    await pool.query(`ALTER TABLE class_inspections ADD COLUMN IF NOT EXISTS subject_teacher TEXT`)
    await pool.query(`ALTER TABLE class_inspections ADD COLUMN IF NOT EXISTS inspector_position TEXT`)
    await pool.query(`CREATE TABLE IF NOT EXISTS honor_board (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      student_name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      award TEXT NOT NULL,
      description TEXT,
      award_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`)
    await pool.query(`ALTER TABLE honor_board ADD COLUMN IF NOT EXISTS title TEXT`)
    await pool.query(`ALTER TABLE honor_board ADD COLUMN IF NOT EXISTS category TEXT`)
    await pool.query(`ALTER TABLE honor_board ADD COLUMN IF NOT EXISTS award TEXT`)
    await pool.query(`ALTER TABLE honor_board ADD COLUMN IF NOT EXISTS award_date DATE`)
    console.log('✅ 資料庫初始化完成')
  } catch (err) {
    console.error('❌ initDB error:', err)
  }
}

app.listen(PORT, async () => {
  console.log(`\n🏫 御園國小：http://localhost:${PORT}`)
  await initDB()
})
