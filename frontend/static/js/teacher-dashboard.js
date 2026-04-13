/**
 * teacher-dashboard.js
 * Logic for the teacher dashboard page.
 * Depends on: auth.js
 */

'use strict';

if (!Auth.requireAuth()) { /* redirects */ }

/* ── State ────────────────────────────────────────────────────── */
let allSubmissions = [];
let currentFilter = 'pending';
const OVERDUE_HOURS = 48;

const AVATAR_COLORS = ['#3B82F6','#8B5CF6','#EC4899','#F59E0B','#10B981','#EF4444','#06B6D4','#6366F1'];

function getAvatarColor(name) {
  let hash = 0;
  for (let c of (name || '')) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name) {
  return (name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/* ── Init ──────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await Auth.getCurrentUser();
  if (!user || user.role !== 'teacher') {
    window.location.href = '/login.html';
    return;
  }

  document.getElementById('nav-name').textContent = user.full_name || 'Teacher';
  document.getElementById('nav-avatar').textContent = initials(user.full_name);
  document.getElementById('welcome-sub').textContent = `Welcome back, ${user.full_name || 'Teacher'}`;

  await loadAllSubmissions();
});

/* ── API ───────────────────────────────────────────────────────── */
async function loadAllSubmissions() {
  try {
    const res = await fetch(`${Auth.API_BASE}/v1/submissions`, { headers: Auth.getHeaders() });
    if (!res.ok) throw new Error('Failed to load');

    allSubmissions = await res.json();

    computeSummary();
    renderQueue();
    renderCompleted();
    renderDistribution();
  } catch (err) {
    console.error('Error loading submissions:', err);
    showToast('Failed to load submissions', 'error');
  }
}

/* ── Summary ───────────────────────────────────────────────────── */
function computeSummary() {
  const now = Date.now();

  const pending = allSubmissions.filter(s => !s.teacher_overall_score && s.status !== 'completed');
  const overdueList = pending.filter(s => {
    const age = (now - new Date(s.submitted_at).getTime()) / 3600000;
    return age > OVERDUE_HOURS;
  });
  const reviewed = allSubmissions.filter(s => s.teacher_overall_score || s.status === 'completed');

  // Unique students
  const studentSet = new Set(allSubmissions.map(s => s.student_name || 'Unknown'));

  // Avg band
  const scores = allSubmissions
    .map(s => parseFloat(s.teacher_overall_score || s.score))
    .filter(s => !isNaN(s));
  const avgBand = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';

  document.getElementById('val-pending').textContent = pending.length;
  document.getElementById('val-reviewed').textContent = reviewed.length;
  document.getElementById('val-students').textContent = studentSet.size;
  document.getElementById('val-avg-band').textContent = avgBand;

  document.getElementById('nav-pending-count').textContent = pending.length || '';
  document.getElementById('sidebar-pending-count').textContent = pending.length || '';

  if (overdueList.length > 0) {
    const banner = document.getElementById('overdue-banner');
    banner.classList.remove('hidden');
    document.getElementById('overdue-text').textContent =
      `${overdueList.length} submission${overdueList.length > 1 ? 's are' : ' is'} overdue (submitted more than 48 hours ago). Please review them as soon as possible.`;
    document.getElementById('val-overdue-sub').textContent = `${overdueList.length} overdue (>48h)`;
  }

  document.getElementById('trend-text').textContent =
    scores.length > 0
      ? `Class average band is ${avgBand}. ${overdueList.length > 0 ? `${overdueList.length} submissions need urgent attention.` : 'Great job staying on top of reviews!'}`
      : 'No scored submissions yet.';
}

/* ── Queue Table ───────────────────────────────────────────────── */
function filterQueue(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-tabs .ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderQueue();
}

function renderQueue() {
  const now = Date.now();
  let list = allSubmissions;

  if (currentFilter === 'pending') {
    list = list.filter(s => !s.teacher_overall_score && s.status !== 'completed');
  } else if (currentFilter === 'done') {
    list = list.filter(s => s.teacher_overall_score || s.status === 'completed');
  }

  const tbody = document.getElementById('queue-tbody');

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No submissions found.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.slice(0, 8).map(sub => {
    const age = (now - new Date(sub.submitted_at).getTime()) / 3600000;
    const isOverdue = age > OVERDUE_HOURS && !sub.teacher_overall_score;
    const isDone = sub.teacher_overall_score || sub.status === 'completed';

    let statusBadge = isDone
      ? `<span class="badge badge-done">Done</span>`
      : isOverdue
        ? `<span class="badge badge-overdue">⚠ Overdue</span>`
        : `<span class="badge badge-pending">Pending</span>`;

    const partDisplay = sub.part ? sub.part.replace('part', 'Part ') : '—';
    const dateStr = new Date(sub.submitted_at).toLocaleDateString('en-GB');
    const score = sub.ai_overall_score ? `${sub.ai_overall_score} (AI)` : '—';
    const color = getAvatarColor(sub.student_name);

    const actionBtn = isDone
      ? `<a href="/teacher-review.html?id=${sub.id}" class="btn btn-outline btn-sm">View</a>`
      : `<a href="/teacher-review.html?id=${sub.id}" class="btn btn-primary btn-sm">Review</a>`;

    return `
      <tr>
        <td>
          <div class="td-student">
            <div class="student-avatar" style="background:${color};">${initials(sub.student_name)}</div>
            <div>
              <div class="student-name">${sub.student_name || 'Student'}</div>
              <div class="student-id" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sub.question || 'Question'}</div>
            </div>
          </div>
        </td>
        <td><span class="part-badge">${partDisplay}</span></td>
        <td style="color:var(--text-3);">${dateStr}</td>
        <td class="td-score">${score}</td>
        <td>${statusBadge}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

/* ── Completed Table ────────────────────────────────────────────── */
function renderCompleted() {
  const done = allSubmissions
    .filter(s => s.teacher_overall_score || s.status === 'completed')
    .slice(0, 5);

  const tbody = document.getElementById('completed-tbody');

  if (done.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No completed reviews yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = done.map(sub => {
    const partDisplay = sub.part ? sub.part.replace('part', 'Part ') : '—';
    const dateStr = new Date(sub.submitted_at).toLocaleDateString('en-GB');
    const color = getAvatarColor(sub.student_name);

    return `
      <tr>
        <td>
          <div class="td-student">
            <div class="student-avatar" style="background:${color};">${initials(sub.student_name)}</div>
            <div>
              <div class="student-name">${sub.student_name || 'Student'}</div>
              <div class="student-id" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sub.question || 'Question'}</div>
            </div>
          </div>
        </td>
        <td><span class="part-badge">${partDisplay}</span></td>
        <td style="color:var(--text-3);">${dateStr}</td>
        <td class="td-score">${sub.ai_overall_score || '—'}</td>
        <td class="td-score" style="color:var(--success);">${sub.teacher_overall_score || '—'}</td>
        <td><span class="badge badge-done">Done</span></td>
      </tr>
    `;
  }).join('');
}

/* ── Band Distribution ──────────────────────────────────────────── */
function renderDistribution() {
  const bands = { '8.0+': 0, '7.0': 0, '6.5': 0, '6.0': 0, '5.5': 0, '<5.5': 0 };
  const max = { '8.0+': 8.0, '7.0': 7.0, '6.5': 6.5, '6.0': 6.0, '5.5': 5.5 };

  allSubmissions.forEach(s => {
    const sc = parseFloat(s.teacher_overall_score || s.score);
    if (isNaN(sc)) return;
    if (sc >= 8.0) bands['8.0+']++;
    else if (sc >= 7.0) bands['7.0']++;
    else if (sc >= 6.5) bands['6.5']++;
    else if (sc >= 6.0) bands['6.0']++;
    else if (sc >= 5.5) bands['5.5']++;
    else bands['<5.5']++;
  });

  const total = Object.values(bands).reduce((a, b) => a + b, 0);
  const maxCount = Math.max(...Object.values(bands), 1);

  const html = Object.entries(bands).map(([label, count]) => `
    <div class="dist-row">
      <span class="dist-label">${label}</span>
      <div class="dist-bar-wrap">
        <div class="dist-bar" style="width:${(count / maxCount * 100).toFixed(0)}%"></div>
      </div>
      <span class="dist-count">${count}</span>
    </div>
  `).join('');

  document.getElementById('dist-chart').innerHTML = html || '<div class="empty-state" style="padding:12px 0;">No data yet.</div>';
}

/* ── Toast ──────────────────────────────────────────────────────── */
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add('hidden'), 3000);
}