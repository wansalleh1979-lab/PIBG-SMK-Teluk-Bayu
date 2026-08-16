/* ============================================================
   Principal page logic — read-only, aggregates one year's classes
   ============================================================ */
let YEARS = [];
let SELECTED_YEAR_ID = null;

requireRole('principal', async (user, profile)=>{
  document.getElementById('whoami').innerHTML = `Signed in as <b>${esc(profile.displayName || profile.email)}</b>`;
  await loadYears();
  document.getElementById('yearSelect').addEventListener('change', async (e)=>{
    SELECTED_YEAR_ID = e.target.value;
    await loadAndRender();
  });
  await loadAndRender();
});

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

async function loadAndRender(){
  if(!SELECTED_YEAR_ID){
    document.getElementById('statsRow').innerHTML = '';
    document.getElementById('classCards').innerHTML = `<div class="empty-note">No years have been created yet.</div>`;
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

  const cards = classes.map(c=>{
    const paid = c.students.filter(s=>s.paid);
    const total = c.students.length;
    const collected = paid.reduce((sum,s)=>sum+(Number(s.amount)||c.fee),0);
    const expected = total * c.fee;
    grandCollected += collected; grandExpected += expected; grandPaid += paid.length; grandTotal += total;
    const pct = expected ? Math.round((collected/expected)*100) : 0;
    return `
      <div class="card">
        <div class="class-card-top">
          <div>
            <div style="font-weight:700; font-size:15px;">${esc(c.name)}</div>
            ${c.teacherLabel ? `<div class="tiny muted">${esc(c.teacherLabel)}</div>` : ''}
          </div>
          <div style="text-align:right;">
            <div class="tiny muted">${paid.length}/${total} paid</div>
            <div class="mono" style="font-weight:600;">${fmtMoney(collected)} <span class="tiny muted">/ ${fmtMoney(expected)}</span></div>
          </div>
        </div>
        <div class="progress"><div class="progress-fill" style="width:${pct}%;"></div></div>
      </div>
    `;
  }).join('') || `<div class="empty-note">No classes have been created for this year yet.</div>`;

  document.getElementById('statsRow').innerHTML = `
    <div class="stat"><div class="num">${grandPaid}/${grandTotal}</div><div class="lbl">Students paid, school-wide</div></div>
    <div class="stat"><div class="num">${fmtMoney(grandCollected)}</div><div class="lbl">Total collected</div></div>
    <div class="stat"><div class="num">${fmtMoney(grandExpected)}</div><div class="lbl">Total expected</div></div>
  `;
  document.getElementById('classCards').innerHTML = cards;
}
