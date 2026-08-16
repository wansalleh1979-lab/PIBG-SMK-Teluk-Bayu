/* ============================================================
   Principal page logic — read-only, aggregates one year's classes
   ============================================================ */
let YEARS = [];
let SELECTED_YEAR_ID = null;
let LATEST = null; // last computed dataset, reused when building the print report

const SCHOOL_NAME = 'PIBG SMK Teluk Bayu';
const SCHOOL_FULL = 'Sekolah Menengah Kebangsaan Teluk Bayu';

requireRole('principal', async (user, profile)=>{
  document.getElementById('whoami').innerHTML = `Signed in as <b>${esc(profile.displayName || profile.email)}</b>`;
  renderDateEyebrow();
  await loadYears();
  document.getElementById('yearSelect').addEventListener('change', async (e)=>{
    SELECTED_YEAR_ID = e.target.value;
    await loadAndRender();
  });
  document.getElementById('printReportBtn').addEventListener('click', printReport);
  await loadAndRender();
});

function renderDateEyebrow(){
  const today = new Date();
  const label = today.toLocaleDateString('en-MY', { day:'numeric', month:'long', year:'numeric' });
  document.getElementById('dashDate').textContent = `Principal view · ${label}`;
}

async function loadYears(){
  const snap = await db.collection('years').orderBy('createdAt').get();
  YEARS = snap.docs.map(d=>({id:d.id, ...d.data()}));
  const active = YEARS.find(y=>y.isActive);
  SELECTED_YEAR_ID = active ? active.id : (YEARS[0] ? YEARS[0].id : null);
  const sel = document.getElementById('yearSelect');
  sel.innerHTML = YEARS.length
    ? YEARS.map(y=>`<option value="${y.id}" ${y.id===SELECTED_YEAR_ID?'selected':''}>${esc(y.label)}${y.isActive?' (active)':''}</option>`).join('')
    : '<option value="">No years yet</option>';
}

function statusFor(pct){
  if(pct >= 90) return { key:'on-track', label:'On track', color:'var(--green)' };
  if(pct >= 60) return { key:'in-progress', label:'In progress', color:'var(--gold)' };
  return { key:'attention', label:'Needs attention', color:'var(--clay)' };
}

async function loadAndRender(){
  if(!SELECTED_YEAR_ID){
    document.getElementById('statsRow').innerHTML = '';
    document.getElementById('barChart').innerHTML = '';
    document.getElementById('donutChart').innerHTML = '';
    document.getElementById('classCount').textContent = '';
    document.getElementById('classTable').innerHTML = `<div class="empty-note">No years have been created yet.</div>`;
    document.getElementById('moneyboxChart').innerHTML = '';
    LATEST = null;
    return;
  }

  const classesSnap = await db.collection('years').doc(SELECTED_YEAR_ID).collection('classes').orderBy('name').get();
  const classes = [];
  for(const doc of classesSnap.docs){
    const cls = { id: doc.id, ...doc.data() };
    const studentsSnap = await db.collection('years').doc(SELECTED_YEAR_ID).collection('classes').doc(cls.id).collection('students').get();
    cls.students = studentsSnap.docs.map(d=>d.data());
    classes.push(cls);
  }

  let grandCollected = 0, grandExpected = 0, grandPaid = 0, grandTotal = 0;
  const perBoxCollected = {}; // boxId -> RM collected via class allocations, this year

  const rows = classes.map(c=>{
    const paid = c.students.filter(s=>s.paid);
    const total = c.students.length;
    const collected = paid.reduce((sum,s)=>sum+(Number(s.amount)||c.fee),0);
    const expected = total * c.fee;
    grandCollected += collected; grandExpected += expected; grandPaid += paid.length; grandTotal += total;
    const pct = expected ? Math.round((collected/expected)*100) : 0;

    const alloc = c.boxAllocations || {};
    Object.keys(alloc).forEach(boxId=>{
      perBoxCollected[boxId] = (perBoxCollected[boxId]||0) + paid.length * (alloc[boxId]||0);
    });

    return { id:c.id, name:c.name, teacherLabel:c.teacherLabel||'', paidCount:paid.length, total, collected, expected, pct };
  });

  rows.sort((a,b)=> b.pct - a.pct);

  const overallPct = grandExpected ? Math.round((grandCollected/grandExpected)*100) : 0;
  const yearLabel = (YEARS.find(y=>y.id===SELECTED_YEAR_ID) || {}).label || '';

  const [moneyboxDoc, ledgerSnap] = await Promise.all([
    db.collection('config').doc('moneyboxes').get(),
    db.collection('years').doc(SELECTED_YEAR_ID).collection('boxLedger').get()
  ]);
  const moneyboxes = (moneyboxDoc.exists && Array.isArray(moneyboxDoc.data().boxes)) ? moneyboxDoc.data().boxes : [];
  const ledgerMap = {};
  ledgerSnap.docs.forEach(d=> ledgerMap[d.id] = { withdrawn:0, credited:0, ...d.data() });

  const boxRows = moneyboxes.map(b=>{
    const collected = perBoxCollected[b.id] || 0;
    const ledger = ledgerMap[b.id] || { withdrawn:0, credited:0 };
    const remaining = collected + ledger.credited - ledger.withdrawn;
    return { id:b.id, label:b.label, collected, remaining };
  });
  boxRows.sort((a,b)=> b.remaining - a.remaining);

  LATEST = { rows, grandCollected, grandExpected, grandPaid, grandTotal, overallPct, yearLabel };

  renderKPIs(LATEST);
  renderBarChart(rows);
  renderDonut(grandCollected, grandExpected);
  renderTable(rows);
  renderMoneyboxChart(boxRows);
}

function renderKPIs({ overallPct, grandCollected, grandExpected, grandPaid, grandTotal }){
  const st = statusFor(overallPct);
  const colorClass = st.key === 'on-track' ? 'c-green' : st.key === 'in-progress' ? 'c-gold' : 'c-clay';
  const paidPct = grandTotal ? Math.round((grandPaid/grandTotal)*100) : 0;

  document.getElementById('statsRow').innerHTML = `
    <div class="kpi-card ${st.key}">
      <div class="kpi-num ${colorClass}">${overallPct}%</div>
      <div class="kpi-lbl">Collection rate, school-wide</div>
      <div class="kpi-bar"><div class="kpi-bar-fill" style="width:${overallPct}%; background:${st.color};"></div></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num">${fmtMoney(grandCollected)}</div>
      <div class="kpi-lbl">Total collected</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num">${fmtMoney(grandExpected)}</div>
      <div class="kpi-lbl">Total expected</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num">${grandPaid}<span class="tiny muted">/${grandTotal}</span></div>
      <div class="kpi-lbl">Students paid</div>
      <div class="kpi-bar"><div class="kpi-bar-fill" style="width:${paidPct}%; background:var(--green);"></div></div>
    </div>
  `;
}

function renderBarChart(rows){
  const el = document.getElementById('barChart');
  if(!rows.length){
    el.innerHTML = `<div class="empty-note">No classes have been created for this year yet.</div>`;
    return;
  }
  el.innerHTML = rows.map(r=>{
    const st = statusFor(r.pct);
    return `
      <div class="bar-row">
        <div class="bar-row-top">
          <span><span class="bar-row-name">${esc(r.name)}</span>${r.teacherLabel ? `<span class="bar-row-teacher">${esc(r.teacherLabel)}</span>` : ''}</span>
          <span class="bar-row-pct" style="color:${st.color};">${r.pct}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${r.pct}%; background:${st.color};"></div></div>
      </div>
    `;
  }).join('');
}

function renderDonut(collected, expected){
  const el = document.getElementById('donutChart');
  const outstanding = Math.max(expected - collected, 0);
  const pct = expected ? Math.round((collected/expected)*100) : 0;
  const r = 52, stroke = 15, c = 2*Math.PI*r;
  const collectedLen = expected ? (collected/expected)*c : 0;

  el.innerHTML = `
    <svg viewBox="0 0 130 130" width="180" height="180">
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${stroke}"/>
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="var(--green)" stroke-width="${stroke}"
        stroke-dasharray="${collectedLen} ${c-collectedLen}" stroke-linecap="round"
        transform="rotate(-90 65 65)"/>
      <text x="65" y="61" text-anchor="middle" class="donut-center-label">${pct}%</text>
      <text x="65" y="76" text-anchor="middle" class="donut-center-sub">collected</text>
    </svg>
    <div class="donut-legend">
      <span class="donut-legend-item"><span class="legend-dot" style="background:var(--green);"></span>Collected · ${fmtMoney(collected)}</span>
      <span class="donut-legend-item"><span class="legend-dot" style="background:var(--line);"></span>Outstanding · ${fmtMoney(outstanding)}</span>
    </div>
  `;
}

function renderTable(rows){
  document.getElementById('classCount').textContent = rows.length ? `${rows.length} class${rows.length===1?'':'es'}` : '';
  const el = document.getElementById('classTable');
  if(!rows.length){
    el.innerHTML = `<div class="empty-note">No classes have been created for this year yet.</div>`;
    return;
  }
  el.innerHTML = `
    <table class="dash-table">
      <thead>
        <tr>
          <th>Class</th>
          <th>Teacher</th>
          <th class="num">Paid</th>
          <th class="num">Collected</th>
          <th class="num">Expected</th>
          <th class="num rate-col">Rate</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r=>{
          const st = statusFor(r.pct);
          return `
            <tr>
              <td style="font-weight:600;">${esc(r.name)}</td>
              <td class="muted">${esc(r.teacherLabel || '—')}</td>
              <td class="num">${r.paidCount}/${r.total}</td>
              <td class="num">${fmtMoney(r.collected)}</td>
              <td class="num">${fmtMoney(r.expected)}</td>
              <td class="num rate-col"><span class="rate-cell"><span>${r.pct}%</span><span class="dash-mini-bar"><span class="dash-mini-bar-fill" style="width:${r.pct}%; background:${st.color};"></span></span></span></td>
              <td><span class="status-badge ${st.key}">${st.label}</span></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderMoneyboxChart(boxRows){
  const el = document.getElementById('moneyboxChart');
  if(!boxRows.length){
    el.innerHTML = `<div class="empty-note">No moneyboxes have been set up yet — this is configured under the admin's Moneyboxes tab.</div>`;
    return;
  }
  const maxAbs = Math.max(1, ...boxRows.map(b=>Math.abs(b.remaining)));
  el.innerHTML = boxRows.map(b=>{
    const positive = b.remaining >= 0;
    const color = positive ? 'var(--green)' : 'var(--clay)';
    const width = Math.min(100, (Math.abs(b.remaining)/maxAbs)*100);
    return `
      <div class="bar-row">
        <div class="bar-row-top">
          <span class="bar-row-name">${esc(b.label)}</span>
          <span class="bar-row-pct" style="color:${color};">${fmtMoney(b.remaining)}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%; background:${color};"></div></div>
        <div class="bar-row-sub">${fmtMoney(b.collected)} collected via class fees this year</div>
      </div>
    `;
  }).join('');
}

/* ---------- printable letterhead report ---------- */
function printReport(){
  if(!LATEST){ return; }
  const { rows, grandCollected, grandExpected, grandPaid, grandTotal, overallPct, yearLabel } = LATEST;
  const today = new Date().toLocaleDateString('en-MY', { day:'numeric', month:'long', year:'numeric' });

  const tableRows = rows.map(r=>`
    <tr>
      <td>${esc(r.name)}</td>
      <td>${esc(r.teacherLabel || '—')}</td>
      <td class="num">${r.paidCount}/${r.total}</td>
      <td class="num">${fmtMoney(r.collected)}</td>
      <td class="num">${fmtMoney(r.expected)}</td>
      <td class="num">${r.pct}%</td>
    </tr>
  `).join('');

  document.getElementById('reportArea').innerHTML = `
    <div class="report-letterhead">
      <div class="report-head">
        <img class="report-crest-school" src="img/lencana-sekolah.png" alt="Lencana SMK Teluk Bayu">
        <div class="report-head-text">
          <div class="report-org">${esc(SCHOOL_NAME)}</div>
          <div class="report-school">${esc(SCHOOL_FULL)}</div>
          <div class="report-title">Fund Collection Report${yearLabel ? ' — ' + esc(yearLabel) : ''}</div>
        </div>
        <img class="report-crest-pibg" src="img/pibg-logo.png" alt="Logo PIBG SMK Teluk Bayu">
      </div>
      <div class="report-meta">
        <span>Prepared for: Board of Governors / School Officials</span>
        <span>Date issued: ${today}</span>
      </div>
      <div class="report-kpis">
        <div class="report-kpi"><div class="rk-num">${overallPct}%</div><div class="rk-lbl">Collection rate</div></div>
        <div class="report-kpi"><div class="rk-num">${fmtMoney(grandCollected)}</div><div class="rk-lbl">Collected</div></div>
        <div class="report-kpi"><div class="rk-num">${fmtMoney(grandExpected)}</div><div class="rk-lbl">Expected</div></div>
        <div class="report-kpi"><div class="rk-num">${grandPaid}/${grandTotal}</div><div class="rk-lbl">Students paid</div></div>
      </div>
      <table class="report-table">
        <thead>
          <tr><th>Class</th><th>Teacher</th><th class="num">Paid</th><th class="num">Collected</th><th class="num">Expected</th><th class="num">Rate</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="2">Total</td>
            <td class="num">${grandPaid}/${grandTotal}</td>
            <td class="num">${fmtMoney(grandCollected)}</td>
            <td class="num">${fmtMoney(grandExpected)}</td>
            <td class="num">${overallPct}%</td>
          </tr>
        </tfoot>
      </table>
      <div class="report-sign">
        <div class="report-sign-block">
          <div class="report-sign-line"></div>
          Principal, ${esc(SCHOOL_FULL)}
        </div>
      </div>
      <div class="report-foot">Generated by Sistem Kutipan Yuran PIBG SMK Teluk Bayu on ${today}</div>
    </div>
  `;

  document.body.classList.add('printing');
  window.print();
  setTimeout(()=> document.body.classList.remove('printing'), 300);
}