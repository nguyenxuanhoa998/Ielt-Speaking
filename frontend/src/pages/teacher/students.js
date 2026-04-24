/**
 * teacher-students.js
 * Logic for the My Students page.
 */

'use strict';

if (!Auth.requireAuth()) { /* redirects */ }

/* ── State ─────────────────────────────────────────────────────── */
let allSubmissions = [];
let studentMap = {};    // studentName -> { submissions, avgBand, pending, ... }
let allStudents = [];
let filteredStudents = [];
let visibleCount = 6;
let currentStudentFilter = 'all';


/* ── Init ───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await Auth.getCurrentUser();
  if (!user || user.role !== 'teacher') {
    window.location.href = '/login.html';
    return;
  }

  document.getElementById('nav-name').textContent = user.full_name || 'Teacher';
  document.getElementById('nav-avatar').textContent = initials(user.full_name);

  await loadStudents();
});

/* ── Load data ──────────────────────────────────────────────────── */
async function loadStudents() {
  try {
    const res = await fetch(`${Auth.API_BASE}/v1/submissions`, { headers: Auth.getHeaders() });
    if (!res.ok) throw new Error('Failed');

    allSubmissions = await res.json();

    // Pending count for nav badge
    const pendingCount = allSubmissions.filter(s => !s.teacher_overall_score && s.status !== 'completed').length;
    const navBadge = document.getElementById('nav-pending-count');
    if (navBadge) navBadge.textContent = pendingCount || '';

    // Build student map
    studentMap = {};
    allSubmissions.forEach(sub => {
      const key = sub.student_name || 'Unknown';
      if (!studentMap[key]) {
        studentMap[key] = {
          name: key,
          submissions: [],
          pending: 0,
          scores: []
        };
      }
      studentMap[key].submissions.push(sub);

      const isEvaluated = sub.teacher_overall_score || sub.status === 'completed';
      if (!isEvaluated) studentMap[key].pending++;

      const sc = parseFloat(sub.teacher_overall_score || sub.score);
      if (!isNaN(sc)) studentMap[key].scores.push(sc);
    });

    // Convert to array and compute averages
    allStudents = Object.values(studentMap).map(s => {
      const avg = s.scores.length
        ? (s.scores.reduce((a, b) => a + b, 0) / s.scores.length)
        : null;

      // Trend: compare last 3 vs previous 3
      const sorted = [...s.submissions].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      const recentScores = sorted.slice(0, 3).map(sub => parseFloat(sub.score)).filter(n => !isNaN(n));
      const olderScores = sorted.slice(3, 6).map(sub => parseFloat(sub.score)).filter(n => !isNaN(n));
      const recentAvg = recentScores.length ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length : null;
      const olderAvg = olderScores.length ? olderScores.reduce((a, b) => a + b, 0) / olderScores.length : null;

      let trend = 'stable';
      if (recentAvg !== null && olderAvg !== null) {
        if (recentAvg > olderAvg + 0.2) trend = 'improving';
        else if (recentAvg < olderAvg - 0.2) trend = 'declining';
      }

      const lastSubmission = sorted[0];
      return {
        ...s,
        avgBand: avg,
        lastDate: lastSubmission ? new Date(lastSubmission.submitted_at).toLocaleDateString('en-GB') : 'N/A',
        trend
      };
    });

    // Sort by most recent submission
    allStudents.sort((a, b) => {
      const aDate = Math.max(...a.submissions.map(s => new Date(s.submitted_at).getTime()));
      const bDate = Math.max(...b.submissions.map(s => new Date(s.submitted_at).getTime()));
      return bDate - aDate;
    });

    computeSummary();
    applyStudentFilter();
  } catch (err) {
    console.error(err);
    document.getElementById('students-grid').innerHTML =
      '<div style="grid-column:span 2;text-align:center;color:var(--text-3);padding:40px;">Failed to load students.</div>';
  }
}

/* ── Summary ────────────────────────────────────────────────────── */
function computeSummary() {
  const total = allStudents.length;
  const allScores = allStudents.flatMap(s => s.scores);
  const classAvg = allScores.length
    ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1)
    : '—';
  const onTarget = allStudents.filter(s => s.avgBand !== null && s.avgBand >= 7.0).length;
  const needAttention = allStudents.filter(s => s.avgBand !== null && s.avgBand < 6.0).length;

  document.getElementById('val-total-students').textContent = total;
  document.getElementById('val-class-avg').textContent = classAvg;
  document.getElementById('val-on-target').textContent = onTarget;
  document.getElementById('val-need-attention').textContent = needAttention;
  document.getElementById('students-sub').textContent = `${total} active students assigned to you.`;
}

/* ── Filters ────────────────────────────────────────────────────── */
function setStudentFilter(filter, btn) {
  currentStudentFilter = filter;
  visibleCount = 6;
  document.querySelectorAll('.filter-tabs .ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyStudentFilter();
}

function filterStudents() {
  visibleCount = 6;
  applyStudentFilter();
}

function applyStudentFilter() {
  const query = (document.getElementById('search-students').value || '').toLowerCase();

  filteredStudents = allStudents.filter(s => {
    const matchSearch = !query || s.name.toLowerCase().includes(query);
    const matchFilter =
      currentStudentFilter === 'all' ||
      (currentStudentFilter === 'on-target' && s.avgBand !== null && s.avgBand >= 7.0) ||
      (currentStudentFilter === 'attention' && s.avgBand !== null && s.avgBand < 6.0);

    return matchSearch && matchFilter;
  });

  renderStudentGrid();
}

/* ── Render grid ────────────────────────────────────────────────── */
function renderStudentGrid() {
  const grid = document.getElementById('students-grid');
  const visible = filteredStudents.slice(0, visibleCount);
  const loadMoreBtn = document.getElementById('load-more-btn');
  const showingLabel = document.getElementById('showing-label');

  if (visible.length === 0) {
    grid.innerHTML = '<div style="grid-column:span 2;text-align:center;color:var(--text-3);padding:40px;">No students found.</div>';
    loadMoreBtn.style.display = 'none';
    showingLabel.textContent = '';
    return;
  }

  grid.innerHTML = visible.map(student => {
    const color = avatarColor(student.name);
    const avg = student.avgBand !== null ? student.avgBand.toFixed(1) : null;
    const barPct = avg !== null ? Math.min((parseFloat(avg) / 9.0) * 100, 100).toFixed(0) : 0;

    let barClass = 'progress-good';
    let statusLabel = '';
    let statusClass = '';

    if (avg !== null) {
      const score = parseFloat(avg);
      if (score >= 7.0) { barClass = 'progress-good'; }
      else if (score >= 6.0) { barClass = 'progress-warning'; }
      else { barClass = 'progress-danger'; }
    }

    if (student.avgBand !== null && student.avgBand >= 7.0) {
      statusLabel = 'On target ✓';
      statusClass = 'status-on-target';
    } else if (student.avgBand !== null && student.avgBand < 6.0) {
      statusLabel = 'Needs attention';
      statusClass = 'status-declining';
    }

    const trendLabel =
      student.trend === 'improving' ? '↑ Improving' :
      student.trend === 'declining' ? '↓ Declining' : '→ Stable';

    const trendClass =
      student.trend === 'improving' ? 'status-improving' :
      student.trend === 'declining' ? 'status-declining' : 'status-stable';

    const pendingBadge = student.pending > 0
      ? `<span class="badge badge-pending" style="font-size:11px;">${student.pending} pending</span>`
      : '';

    const actionBtn = student.pending > 0
      ? `<a href="/teacher-submissions.html" class="btn btn-primary btn-sm">Review</a>`
      : `<button class="btn btn-outline btn-sm" onclick="openStudentModal('${encodeURIComponent(student.name)}')">History</button>`;

    return `
      <div class="student-card">
        <div class="student-card-top">
          <div class="student-card-info">
            <div class="student-avatar" style="background:${color};width:36px;height:36px;font-size:13px;">${initials(student.name)}</div>
            <div>
              <div class="student-card-name">${student.name}</div>
              <div class="student-card-meta">${student.submissions.length} submissions · Last: ${student.lastDate}</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
            ${pendingBadge}
            ${actionBtn}
          </div>
        </div>

        <div class="student-progress-bar">
          <div class="student-progress-fill ${barClass}" style="width:${barPct}%"></div>
        </div>

        <div class="student-card-bottom">
          <div>
            ${avg !== null ? `<span style="font-size:16px;font-weight:700;color:var(--text-1);margin-right:8px;">${avg}</span>` : ''}
            ${statusLabel ? `<span class="student-status-label ${statusClass}">${statusLabel}</span>` : ''}
          </div>
          <span class="student-status-label ${trendClass}" style="font-size:12px;">
            Target: 7 · <span>${trendLabel}</span>
          </span>
        </div>
      </div>
    `;
  }).join('');

  showingLabel.textContent = `Showing ${visible.length} of ${filteredStudents.length} students`;

  if (filteredStudents.length > visibleCount) {
    loadMoreBtn.style.display = 'inline-flex';
  } else {
    loadMoreBtn.style.display = 'none';
  }
}

/* ── Load more ──────────────────────────────────────────────────── */
function loadMore() {
  visibleCount += 6;
  renderStudentGrid();
}

/* ── Student detail modal ───────────────────────────────────────── */
function openStudentModal(encodedName) {
  const name = decodeURIComponent(encodedName);
  const student = allStudents.find(s => s.name === name);
  if (!student) return;

  document.getElementById('modal-student-name').textContent = student.name;
  document.getElementById('modal-student-email').textContent = `${student.submissions.length} total submissions`;
  document.getElementById('modal-submissions').textContent = student.submissions.length;
  document.getElementById('modal-avg').textContent = student.avgBand !== null ? student.avgBand.toFixed(1) : '—';
  document.getElementById('modal-pending').textContent = student.pending;
  document.getElementById('modal-review-link').href = `/teacher-submissions.html`;

  // Recent submissions mini-list
  const sorted = [...student.submissions].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  const recentHtml = sorted.slice(0, 3).map(sub => {
    const partDisplay = sub.part ? sub.part.replace('part', 'Part ') : '—';
    const dateStr = new Date(sub.submitted_at).toLocaleDateString('en-GB');
    const score = sub.score || '—';
    const isEvaluated = sub.teacher_overall_score || sub.status === 'completed';

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-border);">
        <div>
          <div style="font-size:13px;font-weight:500;color:var(--text-1);">#${sub.id} <span class="part-badge" style="font-size:10px;">${partDisplay}</span></div>
          <div style="font-size:11px;color:var(--text-3);">${dateStr}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;font-weight:600;">${score}</span>
          ${isEvaluated
            ? `<span class="badge badge-done" style="font-size:10px;">Done</span>`
            : `<span class="badge badge-pending" style="font-size:10px;">Pending</span>`}
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('modal-recent-submissions').innerHTML =
    `<div style="font-size:12px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Recent submissions</div>${recentHtml}`;

  document.getElementById('student-modal').classList.remove('hidden');
}

function closeStudentModal() {
  document.getElementById('student-modal').classList.add('hidden');
}

// Close modal on overlay click
document.getElementById('student-modal').addEventListener('click', function(e) {
  if (e.target === this) closeStudentModal();
});

/* ── Export CSV ─────────────────────────────────────────────────── */
function exportStudentsCSV() {
  const headers = ['Student', 'Submissions', 'Avg Band', 'Pending', 'Last Submission', 'Trend'];
  const rows = filteredStudents.map(s => [
    `"${s.name}"`,
    s.submissions.length,
    s.avgBand !== null ? s.avgBand.toFixed(1) : '',
    s.pending,
    s.lastDate,
    s.trend
  ]);

  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `students_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

