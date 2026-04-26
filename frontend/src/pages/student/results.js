/**
 * results.js
 * Logic for the "My results" page (full list of submissions)
 */

'use strict';

if (!Auth.requireAuth()) { /* redirects if no token */ }

let _resultsPage = 1;
const PAGE_LIMIT = 10;

document.addEventListener('DOMContentLoaded', async () => {
    const user = await Auth.getCurrentUser();
    if (user) {
        const nameEl = document.getElementById('nav-name');
        if (nameEl) nameEl.textContent = user.full_name || 'User';
        const initials = (user.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const avatarEl = document.getElementById('nav-avatar');
        if (avatarEl) avatarEl.textContent = initials;
    }

    await fetchAllResults(1);
});

async function goToResultsPage(page) {
    _resultsPage = page;
    await fetchAllResults(page);
}

async function fetchAllResults(page = 1) {
    const tbody = document.getElementById('results-tbody');
    try {
        const res = await fetch(`${Auth.API_BASE}/v1/submissions?page=${page}&limit=${PAGE_LIMIT}`, {
            headers: Auth.getHeaders(),
            cache: 'no-store'
        });

        if (!res.ok) throw new Error('Failed to fetch results');

        const data = await res.json();
        renderResultsTable(data.items);
        renderPagination(data.total, page, PAGE_LIMIT, 'results-pagination', goToResultsPage);
    } catch (err) {
        console.error('Error fetching submissions:', err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:red">Error loading results. Please try again later.</td></tr>`;
        }
    }
}

function renderResultsTable(data) {
    const tbody = document.getElementById('results-tbody');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No submissions found. Go make some recordings!</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(sub => {
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
            <tr onclick="window.location.href='/result.html?id=${sub.id}'" style="cursor: pointer;" title="View detailed results">
                <td class="td-id">${sub.id}</td>
                <td class="td-question">${sub.question || 'Custom Question'}</td>
                <td><span class="part-badge">${partDisplay}</span></td>
                <td>${dateStr}</td>
                <td class="td-band" style="font-weight: 600; color: var(--text-1);">${scoreDisplay}</td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join('');
}
