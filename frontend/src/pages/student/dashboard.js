/**
 * dashboard.js
 * Logic for the student dashboard
 */

'use strict';

/* ── Auth guard ────────────────────────────────────────────────── */
if (!Auth.requireAuth()) { /* redirects if no token */ }

let _dashPollTimer = null;
let _currentPage = 1;
const PAGE_LIMIT = 10;

function stopDashPolling() {
    if (_dashPollTimer) { clearInterval(_dashPollTimer); _dashPollTimer = null; }
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = await Auth.getCurrentUser();
    if (user) {
        document.getElementById('nav-name').textContent = user.full_name || 'User';
        const initials = (user.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        document.getElementById('nav-avatar').textContent = initials;
    }

    await loadDashboardSummary();
    await loadRecentSubmissions(1);
});

async function loadDashboardSummary() {
    try {
        const res = await fetch(`${Auth.API_BASE}/v1/dashboard/summary`, {
            headers: Auth.getHeaders(),
            cache: 'no-store'
        });

        if (res.ok) {
            const data = await res.json();
            document.getElementById('val-total').textContent = data.total_submissions;
            document.getElementById('val-avg').textContent = data.avg_overall_band || '-';
            document.getElementById('val-pending').textContent = data.pending_review;
            document.getElementById('val-reviewed').textContent = data.reviewed;
        } else {
            console.error('Failed to load dashboard summary', await res.text());
        }
    } catch (err) {
        console.error('Error fetching dashboard summary:', err);
    }
}

async function goToPage(page) {
    _currentPage = page;
    await loadRecentSubmissions(page);
}

async function loadRecentSubmissions(page = 1) {
    try {
        const res = await fetch(`${Auth.API_BASE}/v1/submissions?page=${page}&limit=${PAGE_LIMIT}`, {
            headers: Auth.getHeaders(),
            cache: 'no-store'
        });

        if (!res.ok) {
            console.error('Failed to load recent submissions', await res.text());
            return;
        }

        const data = await res.json();
        const items = data.items;
        const tbody = document.getElementById('submissions-tbody');

        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No recent submissions found.</td></tr>`;
            renderPagination(0, 1, PAGE_LIMIT, 'dash-pagination', goToPage);
            stopDashPolling();
            return;
        }

        tbody.innerHTML = items.map(sub => {
            const dateStr = new Date(sub.submitted_at).toLocaleDateString('en-GB');
            let statusBadge = '';

            if (sub.status === 'ai_evaluated' && sub.teacher_overall_score === null) {
                statusBadge = '<span class="badge badge-ai">AI evaluated</span>';
            } else if (sub.score !== null || sub.status === 'completed' || sub.teacher_overall_score !== null) {
                statusBadge = '<span class="badge badge-reviewed">Reviewed</span>';
            } else {
                statusBadge = '<span class="badge badge-pending">Pending</span>';
            }

            const partDisplay = sub.part ? sub.part.replace('part', 'Part ') : 'Part ?';
            const scoreDisplay = sub.score !== null ? sub.score : '—';

            return `
                <tr onclick="window.location.href='/result.html?id=${sub.id}'" style="cursor: pointer;" title="View details">
                    <td class="td-id">${sub.id}</td>
                    <td class="td-question">${sub.question || 'Custom Question'}</td>
                    <td><span class="part-badge">${partDisplay}</span></td>
                    <td>${dateStr}</td>
                    <td class="td-band">${scoreDisplay}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');

        renderPagination(data.total, page, PAGE_LIMIT, 'dash-pagination', goToPage);

        const hasPending = items.some(sub =>
            sub.status === 'pending' || sub.status === 'transcribed'
        );

        if (hasPending) {
            if (!_dashPollTimer) {
                _dashPollTimer = setInterval(() => loadRecentSubmissions(_currentPage), 5000);
            }
        } else {
            if (_dashPollTimer) {
                stopDashPolling();
                await loadDashboardSummary();
            }
        }
    } catch (err) {
        console.error('Error fetching recent submissions:', err);
    }
}
