// ── 共用：日期格式化（去除 T00:00:00.000Z）────────────────
function formatDate(dateStr) {
  if (!dateStr) return ''
  return String(dateStr).slice(0, 10)
}

// ── 載入網站設定 & 選單 & 公告 ───────────────────────────
async function loadSiteData() {
  try {
    const [settRes, navRes, annRes] = await Promise.all([
      fetch('/api/settings'),
      fetch('/api/nav-buttons'),
      fetch('/api/announcements')
    ])
    const settings = (await settRes.json()).data || {}
    const navData  = (await navRes.json()).data  || []
    const annData  = (await annRes.json()).data  || []

    if (settings.site_title) {
      document.title = settings.site_title + ' - 官方網站'
      const el = document.getElementById('site-title')
      if (el) el.textContent = settings.site_title
    }
    if (settings.site_subtitle) {
      const el = document.getElementById('site-subtitle')
      if (el) el.textContent = settings.site_subtitle
    }
    document.querySelectorAll('.site-address').forEach(el => el.textContent = settings.site_address || '')
    document.querySelectorAll('.site-phone').forEach(el => el.textContent = settings.site_phone || '')
    document.querySelectorAll('.site-email').forEach(el => el.textContent = settings.site_email || '')

    buildNav(navData)
    buildAnnouncements(annData)
  } catch (e) {
    console.error('載入資料失敗', e)
  }
}

// ── 訪客計數 ──────────────────────────────────────────────
async function initVisitorCounter() {
  const el = document.getElementById('visitor-num')
  if (!el) return
  try {
    // 用 sessionStorage 避免同一次瀏覽重複計算
    const counted = sessionStorage.getItem('visit_counted')
    let count
    if (!counted) {
      const res = await fetch('/api/visitor', { method: 'POST' })
      const data = await res.json()
      count = data.count
      sessionStorage.setItem('visit_counted', '1')
    } else {
      const res = await fetch('/api/visitor')
      const data = await res.json()
      count = data.count
    }
    // 數字滾動動畫
    animateCount(el, 0, count, 1200)
  } catch(e) {
    if (el) el.textContent = '—'
  }
}

function animateCount(el, from, to, duration) {
  const start = performance.now()
  const update = (now) => {
    const elapsed = now - start
    const progress = Math.min(elapsed / duration, 1)
    // easeOutQuart
    const ease = 1 - Math.pow(1 - progress, 4)
    el.textContent = Math.floor(from + (to - from) * ease).toLocaleString()
    if (progress < 1) requestAnimationFrame(update)
    else el.textContent = to.toLocaleString()
  }
  requestAnimationFrame(update)
}

function buildNav(navItems) {
  const nav = document.getElementById('main-nav')
  if (!nav) return
  nav.innerHTML = ''
  const parents = navItems.filter(n => !n.parent_id)
  const children = navItems.filter(n => n.parent_id)
  parents.forEach(item => {
    const li = document.createElement('li')
    li.className = 'nav-item'
    const subs = children.filter(c => String(c.parent_id) === String(item.id))
    if (subs.length > 0) {
      li.innerHTML = `
        <a href="${item.url}" class="nav-link" target="${item.target}">${item.name} ▾</a>
        <div class="sub-menu">
          ${subs.map(s => `<a href="${s.url}" target="${s.target}">${s.name}</a>`).join('')}
        </div>`
    } else {
      li.innerHTML = `<a href="${item.url}" class="nav-link" target="${item.target}">${item.name}</a>`
    }
    nav.appendChild(li)
  })
}

// ── 公告：全域資料 & 狀態 ──────────────────────────────────
let _allAnns = []       // 全部公告
let _annShowing = 5    // 目前顯示幾筆
const ANN_PAGE = 5     // 每次多顯示幾筆

function buildAnnouncements(anns) {
  _allAnns = anns
  _annShowing = ANN_PAGE
  renderAnnouncements(_allAnns, _annShowing)
}

function renderAnnouncements(anns, limit) {
  const container = document.getElementById('announcement-list')
  const moreWrap  = document.getElementById('ann-more-wrap')
  const moreBtn   = document.getElementById('ann-more-btn')
  if (!container) return

  if (!anns || anns.length === 0) {
    container.innerHTML = '<div class="no-announcements">目前沒有公告</div>'
    if (moreWrap) moreWrap.style.display = 'none'
    return
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const visible = anns.slice(0, limit)

  container.innerHTML = visible.map(ann => {
    const dateStr = formatDate(ann.date)
    const isNew = dateStr >= sevenDaysAgo
    const imgHtml = ann.image_url
      ? `<div class="ann-img"><img src="${ann.image_url}" alt="公告圖片" loading="lazy"></div>`
      : ''
    return `
      <div class="announcement-item">
        <div class="ann-date">${dateStr}</div>
        <div class="ann-content">
          <div class="ann-title">${escapeHtml(ann.title)}${isNew ? '<span class="ann-new">NEW</span>' : ''}</div>
          <div class="ann-text">${escapeHtml(ann.content)}</div>
          ${imgHtml}
        </div>
      </div>`
  }).join('')

  // 更多按鈕
  if (moreWrap) {
    if (anns.length > limit) {
      moreWrap.style.display = 'block'
      if (moreBtn) moreBtn.textContent = `查看更多公告（還有 ${anns.length - limit} 則）↓`
    } else {
      moreWrap.style.display = 'none'
    }
  }
}

function showMoreAnn() {
  _annShowing += ANN_PAGE
  const keyword = document.getElementById('ann-search')?.value?.trim() || ''
  const filtered = keyword ? filterAnns(keyword) : _allAnns
  renderAnnouncements(filtered, _annShowing)
}

// ── 搜尋功能 ──────────────────────────────────────────────
function filterAnns(keyword) {
  const kw = keyword.toLowerCase()
  return _allAnns.filter(a =>
    a.title.toLowerCase().includes(kw) ||
    a.content.toLowerCase().includes(kw)
  )
}

function searchAnnouncements(keyword) {
  const clearBtn = document.getElementById('ann-search-clear')
  const hint     = document.getElementById('ann-search-hint')
  if (clearBtn) clearBtn.style.display = keyword ? 'block' : 'none'
  _annShowing = ANN_PAGE
  if (!keyword.trim()) {
    renderAnnouncements(_allAnns, _annShowing)
    if (hint) hint.style.display = 'none'
    return
  }
  const result = filterAnns(keyword)
  renderAnnouncements(result, _annShowing)
  if (hint) {
    hint.style.display = 'block'
    hint.textContent = result.length > 0
      ? `找到 ${result.length} 筆符合「${keyword}」的公告`
      : `找不到符合「${keyword}」的公告`
  }
}

function clearSearch() {
  const input = document.getElementById('ann-search')
  if (input) input.value = ''
  searchAnnouncements('')
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── 頁面離開平滑轉場 ────────────────────────────────────────
document.addEventListener('click', e => {
  const a = e.target.closest('a[href]')
  if (!a) return
  const href = a.getAttribute('href')
  if (!href || href.startsWith('#') || href.startsWith('javascript') ||
      a.target === '_blank' || e.ctrlKey || e.metaKey) return
  e.preventDefault()
  // 用 style 直接設定，不用 class，避免 pageshow 時殘留
  document.body.style.transition = 'opacity .25s ease, transform .25s ease'
  document.body.style.opacity = '0'
  document.body.style.transform = 'translateY(-8px)'
  setTimeout(() => { window.location.href = href }, 260)
})

// 瀏覽器返回/前進時重設（pageshow 會觸發，包含 bfcache）
window.addEventListener('pageshow', () => {
  document.body.style.transition = ''
  document.body.style.opacity = ''
  document.body.style.transform = ''
})

// ── 登入 Modal ────────────────────────────────────────────
function openLoginModal() {
  const m = document.getElementById('login-modal')
  m.style.display = 'flex'
  // 鎖定頁面捲動
  document.body.classList.add('modal-open')
}
function closeLoginModal() {
  document.getElementById('login-modal').style.display = 'none'
  // 解鎖頁面捲動
  document.body.classList.remove('modal-open')
  const err = document.getElementById('login-error')
  if (err) err.classList.remove('show')
}

async function doLogin() {
  const username = document.getElementById('username').value.trim()
  const password = document.getElementById('password').value
  const errEl = document.getElementById('login-error')
  if (!username || !password) {
    errEl.textContent = '請輸入帳號與密碼'
    errEl.classList.add('show')
    return
  }
  const res = await fetch('/admin-api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const data = await res.json()
  if (data.success) {
    window.location.href = '/admin/dashboard.html'
  } else {
    errEl.textContent = data.message || '登入失敗'
    errEl.classList.add('show')
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSiteData()
  initVisitorCounter()

  // 手機版子選單：點擊父連結展開/收合
  document.addEventListener('click', e => {
    const link = e.target.closest('.nav-link')
    if (!link) return
    const item = link.closest('.nav-item')
    if (!item) return
    const sub = item.querySelector('.sub-menu')
    if (!sub) return
    if (window.innerWidth <= 768) {
      e.preventDefault()
      item.classList.toggle('open')
    }
  })
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.getElementById('login-modal').classList.contains('active')) doLogin()
    if (e.key === 'Escape') closeLoginModal()
  })
  document.getElementById('login-modal')?.addEventListener('click', function(e) {
    if (e.target === this) closeLoginModal()
  })
})
