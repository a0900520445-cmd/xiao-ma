// ── 載入網站設定 & 選單 ──────────────────────────────────
async function loadSiteData() {
  try {
    const [settRes, navRes, annRes] = await Promise.all([
      fetch('/api/settings'),
      fetch('/api/nav-buttons'),
      fetch('/api/announcements')
    ]);
    const settings = (await settRes.json()).data || {};
    const navData  = (await navRes.json()).data  || [];
    const annData  = (await annRes.json()).data  || [];

    // 設定標題
    if (settings.site_title) {
      document.title = settings.site_title + ' - 官方網站';
      const titleEl = document.getElementById('site-title');
      if (titleEl) titleEl.textContent = settings.site_title;
    }
    if (settings.site_subtitle) {
      const subEl = document.getElementById('site-subtitle');
      if (subEl) subEl.textContent = settings.site_subtitle;
    }
    if (settings.site_address) {
      document.querySelectorAll('.site-address').forEach(el => el.textContent = settings.site_address);
    }
    if (settings.site_phone) {
      document.querySelectorAll('.site-phone').forEach(el => el.textContent = settings.site_phone);
    }
    if (settings.site_email) {
      document.querySelectorAll('.site-email').forEach(el => el.textContent = settings.site_email);
    }

    // 建立選單
    buildNav(navData);

    // 建立公告
    buildAnnouncements(annData);

  } catch (e) {
    console.error('載入資料失敗', e);
  }
}

function buildNav(navItems) {
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  nav.innerHTML = '';

  const parents = navItems.filter(n => !n.parent_id);
  const children = navItems.filter(n => n.parent_id);

  parents.forEach(item => {
    const li = document.createElement('li');
    li.className = 'nav-item';

    const subs = children.filter(c => c.parent_id === item.id);
    if (subs.length > 0) {
      li.innerHTML = `
        <a href="${item.url}" class="nav-link" target="${item.target}">${item.name} ▾</a>
        <div class="sub-menu">
          ${subs.map(s => `<a href="${s.url}" target="${s.target}">${s.name}</a>`).join('')}
        </div>`;
    } else {
      li.innerHTML = `<a href="${item.url}" class="nav-link" target="${item.target}">${item.name}</a>`;
    }
    nav.appendChild(li);
  });
}

function buildAnnouncements(anns) {
  const container = document.getElementById('announcement-list');
  if (!container) return;

  if (anns.length === 0) {
    container.innerHTML = '<div class="no-announcements">目前沒有公告</div>';
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  container.innerHTML = anns.map(ann => {
    const isNew = ann.date >= sevenDaysAgo;
    return `
      <div class="announcement-item">
        <div class="ann-date">${ann.date}</div>
        <div class="ann-content">
          <div class="ann-title">${escapeHtml(ann.title)}${isNew ? '<span class="ann-new">NEW</span>' : ''}</div>
          <div class="ann-text">${escapeHtml(ann.content)}</div>
        </div>
      </div>`;
  }).join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── 登入 Modal ───────────────────────────────────────────
function openLoginModal() {
  document.getElementById('login-modal').classList.add('active');
}
function closeLoginModal() {
  document.getElementById('login-modal').classList.remove('active');
  document.getElementById('login-error').classList.remove('show');
}

async function doLogin() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errEl = document.getElementById('login-error');

  if (!username || !password) {
    errEl.textContent = '請輸入帳號與密碼';
    errEl.classList.add('show');
    return;
  }

  const res = await fetch('/admin-api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();

  if (data.success) {
    window.location.href = '/admin/dashboard.html';
  } else {
    errEl.textContent = data.message || '登入失敗';
    errEl.classList.add('show');
  }
}

// Enter 鍵送出
document.addEventListener('DOMContentLoaded', () => {
  loadSiteData();

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.getElementById('login-modal').classList.contains('active')) {
      doLogin();
    }
    if (e.key === 'Escape') closeLoginModal();
  });

  // 點外側關閉
  document.getElementById('login-modal')?.addEventListener('click', function(e) {
    if (e.target === this) closeLoginModal();
  });
});
