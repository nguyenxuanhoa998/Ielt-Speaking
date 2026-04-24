/**
 * teacher-submissions.js
 * Logic for the teacher submissions list page.
 */

'use strict';

if (!Auth.requireAuth()) { /* redirects */ }

/* ── State ─────────────────────────────────────────────────────── */
let allSubmissions = [];
let filteredSubmissions = [];
let currentStatusFilter = 'all';
let currentPage = 1;
const PAGE_SIZE = 8;
let sortDesc = true;


/* ── Init ───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await Auth.getCurrentUser();
  if (!user || user.role !== 'teacher') {
    window.location.href = '/login.html';
    return;
  }

  document.getElementById('nav-name').textContent = user.full_name || 'Teacher';
  document.getElementById('nav-avatar').textContent = initials(user.full_name);

  await loadSubmissions();
});

/* ── Load ───────────────────────────────────────────────────────── */
async function loadSubmissions() {
  try {
    const res = await fetch(`${Auth.API_BASE}/v1/submissions`, { headers: Auth.getHeaders() });
    if (!res.ok) throw new Error('Failed');

    allSubmissions = await res.json();

    // Pending count for nav badge
    const pendingCount = allSubmissions.filter(s => !s.teacher_overall_score && s.status !== 'completed').length;
    const navBadge = document.getElementById('nav-pending-count');
    if (navBadge) navBadge.textContent = pendingCount || '';

    // Stats
    const evaluated = allSubmissions.filter(s => s.teacher_overall_score || s.status === 'completed').length;
    const pending = allSubmissions.length - evaluated;

    document.getElementById('submissions-count').textContent = `${allSubmissions.length} total submissions from your students`;
    document.getElementById('stat-pending').textContent = `⏳ ${pending} pending`;
    document.getElementById('stat-done').textContent = `✓ ${evaluated} done`;

    applyFilters();
  } catch (err) {
    console.error(err);
    document.getElementById('submissions-tbody').innerHTML =
      `<tr><td colspan="7" class="empty-state">Failed to load submissions.</td></tr>`;
  }
}

/* ── Filters ────────────────────────────────────────────────────── */
function setStatusFilter(filter, btn) {
  currentStatusFilter = filter;
  currentPage = 1;
  document.querySelectorAll('.filter-tabs .ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}

function applyFilters() {
  const query = (document.getElementById('search-input').value || '').toLowerCase();

  filteredSubmissions = allSubmissions.filter(sub => {
    const matchSearch = !query ||
      (sub.student_name || '').toLowerCase().includes(query) ||
      (sub.question || '').toLowerCase().includes(query);

    const isEvaluated = sub.teacher_overall_score || sub.status === 'completed';
    const matchStatus =
      currentStatusFilter === 'all' ||
      (currentStatusFilter === 'pending' && !isEvaluated) ||
      (currentStatusFilter === 'evaluated' && isEvaluated);

    return matchSearch && matchStatus;
  });

  // Sort by date
  filteredSubmissions.sort((a, b) => {
    const diff = new Date(b.submitted_at) - new Date(a.submitted_at);
    return sortDesc ? diff : -diff;
  });

  currentPage = 1;
  renderTable();
}

function toggleSort() {
  sortDesc = !sortDesc;
  document.getElementById('sort-icon').textContent = sortDesc ? '↓' : '↑';
  applyFilters();
}

/* ── Render ─────────────────────────────────────────────────────── */
function renderTable() {
  const tbody = document.getElementById('submissions-tbody');
  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filteredSubmissions.slice(start, start + PAGE_SIZE);

  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No submissions found.</td></tr>`;
    renderPagination();
    return;
  }

  tbody.innerHTML = page.map(sub => {
    const isEvaluated = sub.teacher_overall_score || sub.status === 'completed';
    const partDisplay = sub.part ? sub.part.replace('part', 'Part ') : '—';
    const dateStr = new Date(sub.submitted_at).toLocaleDateString('en-GB');
    const score = sub.score !== null && sub.score !== undefined ? sub.score : '—';
    const color = avatarColor(sub.student_name);

    const statusBadge = isEvaluated
      ? `<span class="badge badge-done">✓ Evaluated</span>`
      : `<span class="badge badge-pending">Pending</span>`;

    const actionBtn = isEvaluated
      ? `<a href="/teacher-review.html?id=${sub.id}" class="btn btn-outline btn-sm">View</a>`
      : `<a href="/teacher-review.html?id=${sub.id}" class="btn btn-primary btn-sm">Evaluate</a>`;

    return `
      <tr>
        <td>
          <div class="td-student">
            <div class="student-avatar" style="background:${color};">${initials(sub.student_name)}</div>
            <div>
              <div class="student-name">${sub.student_name || 'Student'}</div>
              <div style="font-size:11px;color:var(--text-4);">ID #${sub.id}</div>
            </div>
          </div>
        </td>
        <td class="td-question"><span>${sub.question || 'Custom question'}</span></td>
        <td><span class="part-badge">${partDisplay}</span></td>
        <td style="color:var(--text-3);white-space:nowrap;">${dateStr}</td>
        <td class="td-score">${score}</td>
        <td>${statusBadge}</td>
        <td class="td-actions">${actionBtn}</td>
      </tr>
    `;
  }).join('');

  renderPagination();
}

/* ── Pagination ─────────────────────────────────────────────────── */
function renderPagination() {
  const total = filteredSubmissions.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, total);

  document.getElementById('pagination-info').textContent =
    total === 0 ? 'No results' : `Showing ${start}–${end} of ${total} results`;

  const btnsEl = document.getElementById('pagination-btns');

  let html = `<button class="page-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>← Prev</button>`;

  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
  }

  html += `<button class="page-btn" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages || totalPages === 0 ? 'disabled' : ''}>Next →</button>`;

  btnsEl.innerHTML = html;
}

function changePage(page) {
  const totalPages = Math.ceil(filteredSubmissions.length / PAGE_SIZE);
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Export ─────────────────────────────────────────────────────── */
function exportCSV() {
  const headers = ['ID', 'Student', 'Question', 'Part', 'Date', 'Score', 'Status'];
  const rows = filteredSubmissions.map(s => [
    s.id,
    `"${(s.student_name || '').replace(/"/g, '""')}"`,
    `"${(s.question || '').replace(/"/g, '""')}"`,
    s.part || '',
    new Date(s.submitted_at).toLocaleDateString('en-GB'),
    s.score || '',
    (s.teacher_overall_score || s.status === 'completed') ? 'Evaluated' : 'Pending'
  ]);

  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `submissions_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}