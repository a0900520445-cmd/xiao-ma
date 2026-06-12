import express from 'express'
const router = express.Router()

// ── 公告（前台公開）────────────────────────────────────────
router.get('/announcements', async (req, res) => {
  const pool = req.app.locals.pool
  const { department } = req.query
  try {
    let q = 'SELECT * FROM announcements'
    const params = []
    if (department) {
      q += ' WHERE department=$1'
      params.push(department)
    }
    q += ' ORDER BY date DESC, id DESC'
    const r = await pool.query(q, params)
    res.json({ success: true, data: r.rows })
  } catch (err) {
    console.error('api/announcements error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── 導覽按鈕（前台公開）───────────────────────────────────
router.get('/nav-buttons', async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM nav_buttons ORDER BY parent_id ASC NULLS FIRST, sort_order ASC')
    res.json({ success: true, data: r.rows })
  } catch (err) {
    console.error('api/nav-buttons error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── 網站設定（前台公開）───────────────────────────────────
router.get('/settings', async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM site_settings')
    const s = {}; r.rows.forEach(row => s[row.key] = row.value)
    res.json({ success: true, data: s })
  } catch (err) {
    console.error('api/settings error:', err)
    res.status(500).json({ success: false })
  }
})

// ── Campus 區塊（前台公開）───────────────────────────────
router.get('/campus-blocks', async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM campus_blocks ORDER BY sort_order ASC')
    res.json({ success: true, data: r.rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Campus 按鈕（前台公開）───────────────────────────────
router.get('/campus-buttons', async (req, res) => {
  const pool = req.app.locals.pool
  try {
    const r = await pool.query('SELECT * FROM campus_buttons ORDER BY sort_order ASC')
    res.json({ success: true, data: r.rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router

// ── 差勤：提交請假（公開）────────────────────────────────
router.post('/leaves', async (req, res) => {
  const pool = req.app.locals.pool
  const { student_id, name, class: cls, leave_type, start_date, end_date, reason } = req.body
  if (!student_id || !name || !cls || !leave_type || !start_date || !end_date || !reason)
    return res.json({ success: false, message: '請填寫所有欄位' })
  try {
    const r = await pool.query(
      `INSERT INTO leave_requests (student_id,name,class,leave_type,start_date,end_date,reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [student_id, name, cls, leave_type, start_date, end_date, reason]
    )
    res.json({ success: true, id: r.rows[0].id })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 差勤：查詢請假狀態（公開，依學號）───────────────────
router.get('/leaves/query', async (req, res) => {
  const pool = req.app.locals.pool
  const { student_id } = req.query
  if (!student_id) return res.json({ success: false, message: '請輸入學號' })
  try {
    const r = await pool.query(
      `SELECT id,name,class,leave_type,start_date,end_date,reason,status,created_at,review_time
       FROM leave_requests WHERE student_id=$1 ORDER BY created_at DESC`,
      [student_id]
    )
    res.json({ success: true, data: r.rows })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── 巡堂：送出記錄（公開）────────────────────────────────
router.post('/inspections', async (req, res) => {
  const pool = req.app.locals.pool
  const { class_name, teacher_name, score, comment, inspection_date,
          period, subject, subject_teacher, inspector_position } = req.body
  if (!class_name || !teacher_name || score === undefined || !inspection_date)
    return res.json({ success: false, message: '請填寫所有必填欄位' })
  if (score < 0 || score > 100)
    return res.json({ success: false, message: '分數需介於 0～100' })
  try {
    const r = await pool.query(
      `INSERT INTO class_inspections
        (class_name,teacher_name,score,comment,inspection_date,period,subject,subject_teacher,inspector_position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [class_name, teacher_name, score, comment||null, inspection_date,
       period||null, subject||null, subject_teacher||null, inspector_position||null]
    )
    res.json({ success: true, id: r.rows[0].id })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})
