'use strict';

/* ── Helpers ──────────────────────────────────────── */
const COLORS = ['#3B82F6','#8B5CF6','#EC4899','#10B981','#F59E0B','#EF4444','#6366F1','#14B8A6','#F97316','#84CC16'];
function avatarColor(str) {
  let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
}
function initials(name) {
  const p = (name||'').trim().split(/\s+/);
  return p.length>=2 ? (p[0][0]+p[p.length-1][0]).toUpperCase() : (name||'U').slice(0,2).toUpperCase();
}
function setText(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }
function showToast(msg, type='') {
  const t=document.getElementById('toast'); t.textContent=msg;
  t.className='toast'+(type?' '+type:''); setTimeout(()=>t.classList.add('hidden'),3000);
}

/* ── State ────────────────────────────────────────── */
let currentPeriod = 7;

/* ── Init ─────────────────────────────────────────── */
async function init() {
  const ok = await Auth.requireRole('admin');
  if (!ok) return;

  const user = await Auth.getCurrentUser();
  if (user) {
    setText('nav-name', user.full_name);
    const av = document.getElementById('nav-avatar');
    av.textContent = initials(user.full_name);
    av.style.background = avatarColor(user.full_name);
  }

  await loadAnalytics(currentPeriod);
}

/* ── Period Switcher ──────────────────────────────── */
async function setPeriod(days, btn) {
  currentPeriod = days;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  await loadAnalytics(days);
}

/* ── Load analytics ───────────────────────────────── */
async function loadAnalytics(days) {
  let data = null;
  try {
    const res = await fetch(`${Auth.API_BASE}/v1/admin/analytics?days=${days}`, { headers: Auth.getHeaders() });
    if (res.ok) data = await res.json();
  } catch {}

  if (!data) data = {};

  renderTopStats(data);
  renderSubmissionsChart(data.submissions_timeline || []);
  renderScoreDist(data.score_distribution || {});
  renderTopPerformers(data.top_performers || []);
  renderAgreeStats(data.evaluation_stats || {});
}

/* ── Top Stats ────────────────────────────────────── */
function renderTopStats(d) {
  setText('a-total-users', d.total_users ?? '-');
  setText('a-submissions', d.period_submissions ?? '-');
  setText('a-avg-band', d.avg_band ? d.avg_band.toFixed(1) : '-');
  setText('a-completion', d.completion_rate ? d.completion_rate + '%' : '-');
  if (d.users_trend)       setText('a-users-trend', `↑ ${d.users_trend} new users`);
  if (d.submissions_trend) setText('a-submissions-trend', `↑ ${d.submissions_trend} vs prev period`);
  if (d.band_trend)        setText('a-band-trend', `↑ ${d.band_trend} vs prev period`);
}

/* ── Submissions Chart ────────────────────────────── */
function renderSubmissionsChart(timeline) {
  const barsEl  = document.getElementById('chart-bars-submissions');
  const labelsEl= document.getElementById('chart-labels-submissions');
  if (!timeline.length) {
    barsEl.innerHTML = '<div class="empty-state" style="width:100%;">No data</div>';
    return;
  }

  const maxVal = Math.max(...timeline.map(t => t.count), 1);

  barsEl.innerHTML = timeline.map(t => {
    const pct = Math.round((t.count / maxVal) * 100);
    return `
      <div class="chart-bar-wrap">
        <div class="chart-bar-val">${t.count}</div>
        <div class="chart-bar" style="height:${Math.max(pct,4)}%;" data-tip="${t.label}: ${t.count} submissions"></div>
      </div>
    `;
  }).join('');

  labelsEl.innerHTML = timeline.map(t => `<div class="chart-label">${t.label}</div>`).join('');
}

/* ── Score Distribution ───────────────────────────── */
function renderScoreDist(dist) {
  const container = document.getElementById('score-dist');
  const bands = ['9','8','7','6','5','4','<4'];
  const bandColors = {
    '9':'#10B981','8':'#22C55E','7':'#3B82F6',
    '6':'#6366F1','5':'#F59E0B','4':'#F97316','<4':'#EF4444'
  };
  const total = Object.values(dist).reduce((a,b) => a+b, 0) || 1;

  container.innerHTML = bands.map(band => {
    const count = dist[band] || 0;
    const pct   = Math.round((count / total) * 100);
    return `
      <div class="dist-item">
        <div class="dist-label">Band ${band}</div>
        <div class="dist-bar-wrap">
          <div class="dist-bar" style="width:${pct}%;background:${bandColors[band] || '#3B82F6'};"></div>
        </div>
        <div class="dist-count">${count}</div>
      </div>
    `;
  }).join('');
}

/* ── Top Performers ───────────────────────────────── */
function renderTopPerformers(performers) {
  const container = document.getElementById('top-performers');
  if (!performers.length) {
    container.innerHTML = '<div class="empty-state">No data available.</div>';
    return;
  }
  container.innerHTML = performers.map((p, i) => {
    const color = avatarColor(p.name);
    const ini   = initials(p.name);
    const medals = ['🥇','🥈','🥉'];
    return `
      <div class="performer-item">
        <div class="performer-rank">${medals[i] || (i + 1)}</div>
        <div class="performer-avatar" style="background:${color};">${ini}</div>
        <div>
          <div class="performer-name">${p.name}</div>
          <div class="performer-sub">${p.submissions} submissions</div>
        </div>
        <div class="performer-score">${p.score.toFixed(1)}</div>
      </div>
    `;
  }).join('');
}

/* ── AI vs Teacher Stats ──────────────────────────── */
function renderAgreeStats(stats) {
  const total = (stats.ai_only || 0) + (stats.reviewed || 0) + (stats.pending_processing || 0) || 1;

  const setAgreeStat = (barId, valId, count, total) => {
    const pct = Math.round((count / total) * 100);
    const bar = document.getElementById(barId);
    const val = document.getElementById(valId);
    if (bar) bar.style.width = pct + '%';
    if (val) val.textContent = `${count} submissions (${pct}%)`;
  };

  setAgreeStat('bar-ai',      'val-ai',       stats.ai_only            || 0, total);
  setAgreeStat('bar-reviewed','val-reviewed',  stats.reviewed            || 0, total);
  setAgreeStat('bar-pending', 'val-pending',   stats.pending_processing  || 0, total);
}



init();
