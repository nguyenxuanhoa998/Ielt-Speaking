'use strict';


/* ── Init page ────────────────────────────────────── */
async function init() {
  const ok = await Auth.requireRole('admin');
  if (!ok) return;

  const user = await Auth.getCurrentUser();
  if (user) {
    document.getElementById('nav-name').textContent = user.full_name;
    const av = document.getElementById('nav-avatar');
    av.textContent = initials(user.full_name);
    av.style.background = avatarColor(user.full_name);
  }

  await Promise.all([
    loadStats(),
    loadActivity(),
  ]);
}

/* ── Load stats ───────────────────────────────────── */
async function loadStats() {
  try {
    const res = await fetch(`${Auth.API_BASE}/v1/admin/stats`, { headers: Auth.getHeaders() });
    if (!res.ok) throw new Error();
    const d = await res.json();

    setText('val-total-users', d.total_users ?? '-');
    setText('val-total-submissions', d.total_submissions ?? '-');
    setText('val-pending-reviews', d.pending_reviews ?? '-');
    setText('val-avg-band', d.avg_band ? d.avg_band.toFixed(1) : '-');
    setText('val-students', d.students ?? '-');
    setText('val-teachers', d.teachers ?? '-');
    setText('val-admins', d.admins ?? '-');

    if (d.users_this_week)
      setText('val-users-week', `↑ ${d.users_this_week} this week`);
    if (d.submissions_this_month)
      setText('val-submissions-month', `↑ ${d.submissions_this_month} this month`);
    if (d.band_trend)
      setText('val-band-trend', `↑ ${d.band_trend} vs last month`);

    // breakdown pending
    if (d.teachers_pending) {
      setText('val-teachers-pending', `${d.teachers_pending} pending approval`);
      document.getElementById('val-teachers-pending').classList.add('danger');
    }
    if (d.admins_pending) {
      setText('val-admins-pending', `${d.admins_pending} pending approval`);
      document.getElementById('val-admins-pending').classList.add('danger');
    }
    if (d.students_this_week) {
      setText('val-students-week', `↑ ${d.students_this_week} this week`);
    }

    // Pending banner
    const totalPending = (d.teachers_pending || 0) + (d.admins_pending || 0);
    if (totalPending > 0) {
      const banner = document.getElementById('pending-banner');
      if (banner) {
        banner.classList.remove('hidden');
        setText('pending-banner-text', `${totalPending} accounts pending approval — awaiting review.`);
      }

      const nb = document.getElementById('nav-pending-badge');
      if (nb) {
        nb.textContent = totalPending;
        nb.classList.remove('hidden');
      }

      const sb = document.getElementById('sidebar-pending-count');
      if (sb) {
        sb.textContent = totalPending;
        sb.classList.remove('hidden');
      }

      setText('qa-pending-count', totalPending);
    } else {
      document.getElementById('pending-banner')?.classList.add('hidden');
    }

    // Health (mock — replace with real endpoints if available)
    setHealth('storage-bar', 'storage-val', d.storage_pct ?? 68, '#F59E0B');
    setHealth('api-bar', 'api-val', d.api_quota_pct ?? 42, '#3B82F6');

    const now = new Date();
    setText('health-updated', `Last updated: ${now.toLocaleDateString('vi-VN')} ${now.toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit'})}`);

  } catch (e) {
    console.warn('Stats load failed:', e);
  }
}

function setHealth(barId, valId, pct, color) {
  const bar = document.getElementById(barId);
  const val = document.getElementById(valId);
  if (bar) { bar.style.width = pct + '%'; bar.style.background = color; }
  if (val) { val.textContent = pct + '%'; val.style.color = color; }
}



/* ── Load activity ────────────────────────────────── */
async function loadActivity() {
  const list = document.getElementById('activity-list');

  // Try real endpoint first
  let activities = null;
  try {
    const res = await fetch(`${Auth.API_BASE}/v1/admin/activity`, { headers: Auth.getHeaders() });
    if (res.ok) activities = await res.json();
  } catch {}

  if (!activities) {
    activities = [];
  }

  list.innerHTML = activities.map(a => `
    <div class="activity-item">
      <div class="activity-dot dot-${a.type}"></div>
      <div class="activity-content">
        <div class="activity-text">${a.text}</div>
        <div class="activity-time">${timeAgo(a.time)}</div>
      </div>
    </div>
  `).join('');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

init();
