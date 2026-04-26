'use strict';

const COLORS = [
  '#3B82F6','#8B5CF6','#EC4899','#10B981',
  '#F59E0B','#EF4444','#6366F1','#14B8A6',
  '#F97316','#84CC16'
];

function avatarColor(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (name || 'U').slice(0, 2).toUpperCase();
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '');
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} days ago`;
  return new Date(dateStr).toLocaleDateString('vi-VN');
}

function renderPagination(total, currentPage, limit, containerId, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  const start = (currentPage - 1) * limit + 1;
  const end = Math.min(currentPage * limit, total);

  let pages;
  if (totalPages <= 7) {
    pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  } else if (currentPage <= 4) {
    pages = [1, 2, 3, 4, 5, '…', totalPages];
  } else if (currentPage >= totalPages - 3) {
    pages = [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  } else {
    pages = [1, '…', currentPage - 1, currentPage, currentPage + 1, '…', totalPages];
  }

  const btns = pages.map(p =>
    p === '…'
      ? `<span class="page-ellipsis">…</span>`
      : `<button class="page-btn${p === currentPage ? ' active' : ''}" data-page="${p}" ${p === currentPage ? 'disabled' : ''}>${p}</button>`
  ).join('');

  container.innerHTML = `
    <div class="pagination">
      <span class="page-info">Showing ${start}–${end} of ${total}</span>
      <div class="page-controls">
        <button class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>←</button>
        ${btns}
        <button class="page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>→</button>
      </div>
    </div>
  `;

  container.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => onPageChange(Number(btn.dataset.page)));
  });
}
