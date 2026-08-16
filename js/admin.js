/* ============================================================
   Admin page logic
   ============================================================ */
let YEARS = [];
let ACTIVE_YEAR_ID = null;
let SELECTED_YEAR_ID = null;
let CLASSES = [];
let STAFF = [];
let MONEYBOXES = []; // [{id, label}]
let SELECTED_LEDGER_CLASS_ID = 'all';

requireRole('admin', async (user, profile)=>{
  document.getElementById('whoami').innerHTML = `Signed in as <b>${esc(profile.displayName || profile.email)}</b>`;
  bindSidebar();
  await refreshAll();
  renderYears();
});

function bindSidebar(){
  document.querySelectorAll('.side-link').forEach(link=>{
    link.onclick = async ()=>{
      document.querySelectorAll('.side-link').forEach(l=>l.classList.remove('active'));
      link.classList.add('active');
      document.querySelectorAll('.section').forEach(s=>s.style.display='none');
      const key = link.dataset.section;
      document.getElementById('section-'+key).style.display = 'block';
      document.getElementById('pageTitle').textContent =
        key==='years' ? 'Years' : key==='classes' ? 'Classes' : key==='moneyboxes' ? 'Moneyboxes' : 'Staff accounts';
      if(key==='years') renderYears();
      if(key==='classes'){ await refreshClasses(); renderClasses(); }
      if(key==='moneyboxes') await renderMoneyboxes();
      if(key==='staff') await renderStaff();
    };
  });
}

async function refreshAll(){
  await refreshYears();
  await refreshMoneyboxes();
  await refreshClasses();
  await refreshStaff();
}

function yearOptions(selected){
  const sel = selected || SELECTED_YEAR_ID;
  return YEARS.map(y=>`<option value="${y.id}" ${y.id===sel?'selected':''}>${esc(y.label)}${y.isActive?' (active)':''}</option>`).join('');
}

async function loadClassesForYear(yearId){
  if(!yearId) return [];
  const snap = await db.collection('years').doc(yearId).collection('classes').orderBy('name').get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}

/* ================= YEARS ================= */
async function refreshYears(){
  const snap = await db.collection('years').orderBy('createdAt').get();
  YEARS = snap.docs.map(d=>({id:d.id, ...d.data()}));
  const active = YEARS.find(y=>y.isActive);
  ACTIVE_YEAR_ID = active ? active.id : (YEARS[0] ? YEARS[0].id : null);
  if(!SELECTED_YEAR_ID || !YEARS.find(y=>y.id===SELECTED_YEAR_ID)) SELECTED_YEAR_ID = ACTIVE_YEAR_ID;
}

function renderYears(){
  const el = document.getElementById('section-years');
  el.innerHTML = `
    <div class="card">
      <h3>Create a new year</h3>
      <p class="tiny muted" style="margin-top:6px;">Starting a new year gives every teacher a blank class list to fill in again — nothing carries over automatically.</p>
      <div class="row" style="margin-top:14px;">
        <div class="field"><label>Year label</label><input type="text" id="newYearLabel" placeholder="e.g. 2027/2028"></div>
      </div>
      <button class="btn btn-primary" id="addYearBtn">Create year</button>
    </div>
    <div class="card">
      <h3 style="margin-bottom:14px;">All years</h3>
      ${YEARS.length ? `
        <table class="admin-table">
          <thead><tr><th>Year</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${YEARS.map(y=>`
              <tr>
                <td>${esc(y.label)}</td>
                <td>${y.isActive ? '<span class="badge teacher">Active</span>' : '<span class="tiny muted">—</span>'}</td>
                <td style="text-align:right; white-space:nowrap;">
                  ${!y.isActive ? `<button class="btn btn-sm" data-action="setActive" data-id="${y.id}">Set active</button>` : ''}
                  <button class="btn-icon" data-action="deleteYear" data-id="${y.id}" title="Delete year">✕</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `<div class="empty-note">No years yet — create one above.</div>`}
    </div>
  `;
  document.getElementById('addYearBtn').onclick = createYear;
  el.querySelectorAll('[data-action="setActive"]').forEach(b=>b.onclick=()=>setActiveYear(b.dataset.id));
  el.querySelectorAll('[data-action="deleteYear"]').forEach(b=>b.onclick=()=>deleteYear(b.dataset.id));
}

async function createYear(){
  const label = document.getElementById('newYearLabel').value.trim();
  if(!label){ toast('Enter a year label.'); return; }
  try{
    const makeActive = YEARS.length === 0;
    await db.collection('years').add({ label, createdAt: Date.now(), isActive: makeActive });
    toast('Year created.');
    await refreshYears();
    renderYears();
  }catch(e){ console.error(e); toast('Could not create year.'); }
}

async function setActiveYear(yearId){
  try{
    const batch = db.batch();
    YEARS.forEach(y=> batch.update(db.collection('years').doc(y.id), { isActive: y.id === yearId }));
    await batch.commit();
    toast('Active year updated.');
    await refreshYears();
    renderYears();
  }catch(e){ console.error(e); toast('Could not set active year.'); }
}

async function deleteYear(yearId){
  if(!confirm('Delete this year and every class/student record inside it? This cannot be undone.')) return;
  try{
    const classesSnap = await db.collection('years').doc(yearId).collection('classes').get();
    for(const c of classesSnap.docs){
      const studentsSnap = await c.ref.collection('students').get();
      const batch = db.batch();
      studentsSnap.docs.forEach(s=>batch.delete(s.ref));
      batch.delete(c.ref);
      await batch.commit();
    }
    const ledgerSnap = await db.collection('years').doc(yearId).collection('boxLedger').get();
    const batch2 = db.batch();
    ledgerSnap.docs.forEach(d=>batch2.delete(d.ref));
    batch2.delete(db.collection('years').doc(yearId));
    await batch2.commit();
    toast('Year deleted.');
    await refreshYears();
    renderYears();
  }catch(e){ console.error(e); toast('Could not delete year.'); }
}

/* ================= CLASSES ================= */
async function refreshClasses(){
  CLASSES = await loadClassesForYear(SELECTED_YEAR_ID);
}

function renderClasses(){
  const el = document.getElementById('section-classes');
  const yearLabel = YEARS.find(y=>y.id===SELECTED_YEAR_ID);
  el.innerHTML = `
    <div class="card">
      <div class="card-head"><h3>Add a class</h3>${YEARS.length ? `<select id="classesYearSelect">${yearOptions()}</select>` : ''}</div>
      ${!SELECTED_YEAR_ID ? `<div class="empty-note">Create a year first, under the Years tab.</div>` : `
      <div class="row" style="margin-top:14px;">
        <div class="field"><label>Class name</label><input type="text" id="newClassName" placeholder="e.g. Grade 5A"></div>
        <div class="field"><label>Teacher label (optional)</label><input type="text" id="newClassTeacher" placeholder="e.g. Mrs. Tan"></div>
        <div class="field"><label>Yearly fee per student (RM)</label><input type="number" id="newClassFee" placeholder="e.g. 30" min="0" step="0.01"></div>
      </div>
      <button class="btn btn-primary" id="addClassBtn">Create class</button>
      `}
    </div>

    <div class="card">
      <h3 style="margin-bottom:14px;">Classes in ${yearLabel ? esc(yearLabel.label) : 'this year'}</h3>
      ${CLASSES.length ? `
        <table class="admin-table">
          <thead><tr><th>Class</th><th>Teacher</th><th>Fee</th><th></th></tr></thead>
          <tbody>
            ${CLASSES.map(c=>`
              <tr data-id="${c.id}">
                <td>${esc(c.name)}</td>
                <td>${esc(c.teacherLabel||'—')}</td>
                <td><input type="number" class="feeInput" data-id="${c.id}" value="${c.fee}" min="0" step="0.01" style="width:90px; padding:6px 8px;"></td>
                <td style="text-align:right; white-space:nowrap;">
                  <button class="btn btn-sm" data-action="allocBtn" data-id="${c.id}">Moneybox split</button>
                  <button class="btn-icon" data-action="deleteClass" data-id="${c.id}" title="Delete class">✕</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `<div class="empty-note">No classes yet in this year.</div>`}
    </div>
  `;

  const yearSel = document.getElementById('classesYearSelect');
  if(yearSel) yearSel.addEventListener('change', async (e)=>{
    SELECTED_YEAR_ID = e.target.value;
    await refreshClasses();
    renderClasses();
  });

  const addBtn = document.getElementById('addClassBtn');
  if(addBtn) addBtn.onclick = async ()=>{
    const name = document.getElementById('newClassName').value.trim();
    const teacherLabel = document.getElementById('newClassTeacher').value.trim();
    const fee = parseFloat(document.getElementById('newClassFee').value) || 0;
    if(!name){ toast('Please enter a class name.'); return; }
    try{
      await db.collection('years').doc(SELECTED_YEAR_ID).collection('classes').add({ name, teacherLabel, fee, boxAllocations:{}, createdAt: Date.now() });
      toast('Class created.');
      await refreshClasses();
      renderClasses();
    }catch(e){ console.error(e); toast('Could not create the class.'); }
  };

  el.querySelectorAll('.feeInput').forEach(inp=>{
    inp.addEventListener('change', async ()=>{
      try{
        await db.collection('years').doc(SELECTED_YEAR_ID).collection('classes').doc(inp.dataset.id).update({ fee: parseFloat(inp.value) || 0 });
        toast('Fee updated.');
      }catch(e){ console.error(e); toast('Could not update the fee.'); }
    });
  });

  el.querySelectorAll('[data-action="allocBtn"]').forEach(btn=>{
    btn.onclick = ()=> openBoxAllocationModal(CLASSES.find(c=>c.id===btn.dataset.id));
  });

  el.querySelectorAll('[data-action="deleteClass"]').forEach(btn=>{
    btn.onclick = async ()=>{
      if(!confirm('Delete this class and all its student records? This cannot be undone.')) return;
      const id = btn.dataset.id;
      try{
        const studentsSnap = await db.collection('years').doc(SELECTED_YEAR_ID).collection('classes').doc(id).collection('students').get();
        const batch = db.batch();
        studentsSnap.docs.forEach(d=>batch.delete(d.ref));
        batch.delete(db.collection('years').doc(SELECTED_YEAR_ID).collection('classes').doc(id));
        await batch.commit();
        toast('Class deleted.');
        await refreshClasses();
        renderClasses();
      }catch(e){ console.error(e); toast('Could not delete the class.'); }
    };
  });
}

function openBoxAllocationModal(cls){
  const alloc = cls.boxAllocations || {};
  const rows = MONEYBOXES.map(b=>{
    const val = alloc[b.id] ?? 0;
    return `<div class="field"><label>${esc(b.label)}</label><input type="number" class="allocInput" data-id="${b.id}" min="0" step="0.01" value="${val}"></div>`;
  }).join('') || `<div class="empty-note">No moneyboxes exist yet — add one under the Moneyboxes tab first.</div>`;

  openModal(`
    <span class="modal-close" onclick="closeModal()">✕</span>
    <h3>${esc(cls.name)} — moneybox split</h3>
    <p class="tiny muted" style="margin-top:6px;">Split this class's ${fmtMoney(cls.fee)} fee across moneyboxes. Every paid student contributes this same split.</p>
    <div style="margin-top:14px;">${rows}</div>
    <div class="tiny" id="allocSumLine" style="margin:10px 0;"></div>
    <button class="btn btn-primary" id="saveAllocBtn" ${MONEYBOXES.length ? '' : 'disabled'}>Save split</button>
  `);

  const updateSum = ()=>{
    const total = Array.from(document.querySelectorAll('.allocInput')).reduce((s,i)=>s+(parseFloat(i.value)||0),0);
    const over = total > cls.fee + 0.001;
    document.getElementById('allocSumLine').innerHTML = `Allocated: <b class="mono">${fmtMoney(total)}</b> of <span class="mono">${fmtMoney(cls.fee)}</span> fee ${over ? '<span style="color:var(--clay); font-weight:700;">— exceeds the fee!</span>' : ''}`;
    document.getElementById('saveAllocBtn').disabled = over || !MONEYBOXES.length;
  };
  document.querySelectorAll('.allocInput').forEach(i=>i.addEventListener('input', updateSum));
  updateSum();

  const saveBtn = document.getElementById('saveAllocBtn');
  if(saveBtn) saveBtn.onclick = async ()=>{
    const newAlloc = {};
    document.querySelectorAll('.allocInput').forEach(i=>{ newAlloc[i.dataset.id] = parseFloat(i.value)||0; });
    try{
      await db.collection('years').doc(SELECTED_YEAR_ID).collection('classes').doc(cls.id).update({ boxAllocations: newAlloc });
      toast('Moneybox split saved.');
      closeModal();
      await refreshClasses();
      renderClasses();
    }catch(e){ console.error(e); toast('Could not save the split.'); }
  };
}

/* ================= MONEYBOXES ================= */
async function refreshMoneyboxes(){
  try{
    const doc = await db.collection('config').doc('moneyboxes').get();
    if(doc.exists && Array.isArray(doc.data().boxes)){
      MONEYBOXES = doc.data().boxes;
    }else if(doc.exists && Array.isArray(doc.data().labels)){
      MONEYBOXES = doc.data().labels.map(l=>({id:uid(), label:l}));
      await db.collection('config').doc('moneyboxes').set({ boxes: MONEYBOXES });
    }else{
      MONEYBOXES = ['Box 1','Box 2','Box 3','Box 4','Box 5'].map(l=>({id:uid(), label:l}));
      await db.collection('config').doc('moneyboxes').set({ boxes: MONEYBOXES });
    }
  }catch(e){ console.error(e); }
}

async function renderMoneyboxes(){
  const el = document.getElementById('section-moneyboxes');
  el.innerHTML = `
    <div class="card">
      <div class="card-head"><h3>Moneybox labels</h3><button class="btn btn-sm" id="addBoxBtn">+ Add moneybox</button></div>
      <p class="tiny muted">Renaming or adding moneyboxes never changes any student's payment status.</p>
      <div class="row" style="margin-top:14px;">
        ${MONEYBOXES.map(b=>`
          <div class="field">
            <label>Label</label>
            <div style="display:flex; gap:6px;">
              <input type="text" class="boxLabelInput" data-id="${b.id}" value="${esc(b.label)}">
              <button class="btn-icon" data-action="deleteBox" data-id="${b.id}" title="Delete moneybox">✕</button>
            </div>
          </div>
        `).join('') || '<p class="tiny muted">No moneyboxes yet.</p>'}
      </div>
      <button class="btn btn-primary" id="saveBoxLabelsBtn" ${MONEYBOXES.length ? '' : 'disabled'}>Save labels</button>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Moneybox ledger</h3>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${YEARS.length ? `<select id="ledgerYearSelect" class="select-year">${yearOptions()}</select>` : ''}
          <select id="ledgerClassSelect" class="select-class"><option value="all">All classes</option></select>
        </div>
      </div>
      <div class="tiny muted" style="margin-bottom:14px; display:flex; gap:16px; flex-wrap:wrap;">
        <span><span class="legend-dot legend-year"></span> Year filter</span>
        <span><span class="legend-dot legend-class"></span> Class filter</span>
        <span><span class="legend-dot legend-debt"></span> Class has unpaid fees (debt)</span>
      </div>
      <div id="ledgerBody"><p class="tiny muted">Loading…</p></div>
    </div>
  `;

  const addBtn = document.getElementById('addBoxBtn');
  if(addBtn) addBtn.onclick = async ()=>{
    const label = prompt('Name for the new moneybox:');
    if(!label || !label.trim()) return;
    const newBoxes = [...MONEYBOXES, {id: uid(), label: label.trim()}];
    try{
      await db.collection('config').doc('moneyboxes').set({ boxes: newBoxes });
      MONEYBOXES = newBoxes;
      toast('Moneybox added.');
      renderMoneyboxes();
    }catch(e){ console.error(e); toast('Could not add moneybox.'); }
  };

  const saveLabelsBtn = document.getElementById('saveBoxLabelsBtn');
  if(saveLabelsBtn) saveLabelsBtn.onclick = async ()=>{
    const newBoxes = MONEYBOXES.map(b=>{
      const inp = document.querySelector(`.boxLabelInput[data-id="${b.id}"]`);
      return { id: b.id, label: (inp && inp.value.trim()) || b.label };
    });
    try{
      await db.collection('config').doc('moneyboxes').set({ boxes: newBoxes });
      MONEYBOXES = newBoxes;
      toast('Labels saved.');
    }catch(e){ console.error(e); toast('Could not save labels.'); }
  };

  el.querySelectorAll('[data-action="deleteBox"]').forEach(btn=>{
    btn.onclick = async ()=>{
      if(!confirm('Delete this moneybox? Amounts already allocated to it in classes will no longer be shown.')) return;
      const newBoxes = MONEYBOXES.filter(b=>b.id!==btn.dataset.id);
      try{
        await db.collection('config').doc('moneyboxes').set({ boxes: newBoxes });
        MONEYBOXES = newBoxes;
        toast('Moneybox deleted.');
        renderMoneyboxes();
      }catch(e){ console.error(e); toast('Could not delete moneybox.'); }
    };
  });

  const ledgerSel = document.getElementById('ledgerYearSelect');
  const classSel = document.getElementById('ledgerClassSelect');
  SELECTED_LEDGER_CLASS_ID = 'all';

  async function refreshClassFilterOptions(){
    const stats = await computeYearStats(SELECTED_YEAR_ID);
    const classes = Object.values(stats.perClass).sort((a,b)=>a.name.localeCompare(b.name));
    classSel.innerHTML = `<option value="all">All classes</option>` +
      classes.map(c=>`<option value="${c.id}" ${c.debt>0?'class="opt-debt"':''}>${c.debt>0?'⚠ ':''}${esc(c.name)}${c.debt>0?` — owes ${fmtMoney(c.debt)}`:''}</option>`).join('');
    return stats;
  }

  if(ledgerSel) ledgerSel.addEventListener('change', async (e)=>{
    SELECTED_YEAR_ID = e.target.value;
    SELECTED_LEDGER_CLASS_ID = 'all';
    const stats = await refreshClassFilterOptions();
    await renderLedger(SELECTED_YEAR_ID, 'all', stats);
  });

  classSel.addEventListener('change', async (e)=>{
    SELECTED_LEDGER_CLASS_ID = e.target.value;
    await renderLedger(SELECTED_YEAR_ID, SELECTED_LEDGER_CLASS_ID);
  });

  await refreshClassFilterOptions();
  await renderLedger(SELECTED_YEAR_ID, 'all');
}

/* Returns, for a year: per-class stats (incl. outstanding debt) plus box/grand totals
   rolled up across every class. "Debt" for a class = fee owed by students who haven't paid yet. */
async function computeYearStats(yearId){
  const perClass = {};
  const perBoxTotal = {};
  let grandCollected = 0;
  let grandDebt = 0;
  if(!yearId) return { perClass, perBoxTotal, grandCollected, grandDebt };
  const classesSnap = await db.collection('years').doc(yearId).collection('classes').get();
  for(const doc of classesSnap.docs){
    const cls = { id: doc.id, ...doc.data() };
    const studentsSnap = await db.collection('years').doc(yearId).collection('classes').doc(cls.id).collection('students').get();
    const students = studentsSnap.docs.map(d=>d.data());
    const paid = students.filter(s=>s.paid);
    const unpaidCount = students.length - paid.length;
    const collected = paid.reduce((s,st)=>s+(Number(st.amount)||cls.fee),0);
    const debt = unpaidCount * (cls.fee||0);
    const alloc = cls.boxAllocations || {};
    const perBox = {};
    Object.keys(alloc).forEach(boxId=>{
      const amt = paid.length * (alloc[boxId]||0);
      perBox[boxId] = amt;
      perBoxTotal[boxId] = (perBoxTotal[boxId]||0) + amt;
    });
    grandCollected += collected;
    grandDebt += debt;
    perClass[cls.id] = { id: cls.id, name: cls.name, fee: cls.fee||0, paidCount: paid.length, unpaidCount, collected, debt, perBox };
  }
  return { perClass, perBoxTotal, grandCollected, grandDebt };
}

async function renderLedger(yearId, classId, precomputedStats){
  classId = classId || SELECTED_LEDGER_CLASS_ID || 'all';
  const body = document.getElementById('ledgerBody');
  if(!yearId){ body.innerHTML = `<div class="empty-note">Create a year first, under the Years tab.</div>`; return; }
  body.innerHTML = `<p class="tiny muted">Loading…</p>`;

  const [stats, ledgerSnap] = await Promise.all([
    precomputedStats || computeYearStats(yearId),
    db.collection('years').doc(yearId).collection('boxLedger').get()
  ]);
  const ledgerMap = {}; // boxId -> {withdrawn, credited, history:[]}
  ledgerSnap.docs.forEach(d=> ledgerMap[d.id] = { withdrawn: 0, credited: 0, history: [], ...d.data() });

  const filteredToClass = classId && classId !== 'all';
  const cls = filteredToClass ? stats.perClass[classId] : null;
  const perBox = filteredToClass ? (cls ? cls.perBox : {}) : stats.perBoxTotal;
  const collectedTotal = filteredToClass ? (cls ? cls.collected : 0) : stats.grandCollected;
  const debtTotal = filteredToClass ? (cls ? cls.debt : 0) : stats.grandDebt;

  const debtBanner = debtTotal > 0 ? `
    <div class="card" style="margin-bottom:14px; border-color:var(--clay); background:var(--clay-bg);">
      <div style="font-weight:700; color:var(--clay);">${filteredToClass ? esc(cls.name)+' has' : 'Some classes have'} unpaid fees outstanding</div>
      <div class="tiny" style="margin-top:4px; color:var(--clay);">Outstanding: <span class="mono">${fmtMoney(debtTotal)}</span>${filteredToClass && cls ? ` (${cls.unpaidCount} student${cls.unpaidCount===1?'':'s'} unpaid)` : ''}</div>
    </div>
  ` : '';

  const boxesHtml = MONEYBOXES.map(b=>{
    const collected = perBox[b.id] || 0;
    const ledger = ledgerMap[b.id] || { withdrawn: 0, credited: 0, history: [] };
    const remaining = (filteredToClass ? collected : collected + ledger.credited) - (filteredToClass ? 0 : ledger.withdrawn);
    const canUndo = !filteredToClass && ledger.history.length > 0;
    const lastEntry = canUndo ? ledger.history[ledger.history.length-1] : null;

    return `
      <div class="card" style="margin-bottom:14px;">
        <div class="class-card-top">
          <div style="font-weight:700;">${esc(b.label)}</div>
          <div class="mono" style="font-weight:600;">${fmtMoney(collected)} collected${filteredToClass ? ' (this class)' : ''}</div>
        </div>
        ${filteredToClass ? `
          <div class="tiny muted" style="margin-top:10px;">This class's share of ${esc(b.label)}. Withdrawals and added funds apply box-wide, so switch to "All classes" to manage them.</div>
        ` : `
          <div class="row" style="margin-top:12px; align-items:flex-end;">
            <div class="field" style="margin-bottom:0;">
              <label>Record a withdrawal / expense (RM)</label>
              <input type="number" class="withdrawInput" data-id="${b.id}" min="0" step="0.01" placeholder="0.00">
            </div>
            <button class="btn btn-sm withdrawBtn" data-id="${b.id}" style="margin-bottom:1px;">Deduct</button>
          </div>
          <div class="row" style="margin-top:10px; align-items:flex-end;">
            <div class="field" style="margin-bottom:0;">
              <label>Add funds (RM) — e.g. to clear a debt</label>
              <input type="number" class="creditInput" data-id="${b.id}" min="0" step="0.01" placeholder="0.00">
            </div>
            <button class="btn btn-sm btn-green creditBtn" data-id="${b.id}" style="margin-bottom:1px;">Add funds</button>
          </div>
          <div class="tiny muted" style="margin-top:10px;">Withdrawn so far: <span class="mono">${fmtMoney(ledger.withdrawn)}</span> · Added funds: <span class="mono">${fmtMoney(ledger.credited)}</span></div>
          <div style="margin-top:4px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <div style="font-weight:700; ${remaining<0?'color:var(--clay);':''}">Remaining: <span class="mono">${fmtMoney(remaining)}</span></div>
            <button class="btn-icon undoBtn" data-id="${b.id}" title="${canUndo ? `Undo last change (${lastEntry.type==='deduct'?'−':'+'}${fmtMoney(lastEntry.amount)})` : 'Nothing to undo'}" ${canUndo?'':'disabled'}>↺ Undo</button>
          </div>
        `}
      </div>
    `;
  }).join('') || `<div class="empty-note">No moneyboxes yet — add one above.</div>`;

  body.innerHTML = debtBanner + boxesHtml + `
    <div class="stat" style="max-width:280px;">
      <div class="num">${fmtMoney(collectedTotal)}</div>
      <div class="lbl">${filteredToClass ? 'Fees collected (this class)' : 'Current total fees collected'}</div>
    </div>
  `;

  if(filteredToClass) return;

  body.querySelectorAll('.withdrawBtn').forEach(btn=>{
    btn.onclick = async ()=>{
      const boxId = btn.dataset.id;
      const input = body.querySelector(`.withdrawInput[data-id="${boxId}"]`);
      const amt = parseFloat(input.value);
      if(!amt || amt<=0){ toast('Enter an amount to deduct.'); return; }
      const ledger = ledgerMap[boxId] || { withdrawn: 0, credited: 0, history: [] };
      const history = [...ledger.history, { type:'deduct', amount: amt, ts: Date.now() }];
      try{
        await db.collection('years').doc(yearId).collection('boxLedger').doc(boxId)
          .set({ withdrawn: ledger.withdrawn + amt, credited: ledger.credited, history });
        toast('Withdrawal recorded.');
        renderLedger(yearId, 'all');
      }catch(e){ console.error(e); toast('Could not record withdrawal.'); }
    };
  });

  body.querySelectorAll('.creditBtn').forEach(btn=>{
    btn.onclick = async ()=>{
      const boxId = btn.dataset.id;
      const input = body.querySelector(`.creditInput[data-id="${boxId}"]`);
      const amt = parseFloat(input.value);
      if(!amt || amt<=0){ toast('Enter an amount to add.'); return; }
      const ledger = ledgerMap[boxId] || { withdrawn: 0, credited: 0, history: [] };
      const history = [...ledger.history, { type:'credit', amount: amt, ts: Date.now() }];
      try{
        await db.collection('years').doc(yearId).collection('boxLedger').doc(boxId)
          .set({ withdrawn: ledger.withdrawn, credited: ledger.credited + amt, history });
        toast('Funds added.');
        renderLedger(yearId, 'all');
      }catch(e){ console.error(e); toast('Could not add funds.'); }
    };
  });

  body.querySelectorAll('.undoBtn').forEach(btn=>{
    btn.onclick = async ()=>{
      if(btn.disabled) return;
      const boxId = btn.dataset.id;
      const ledger = ledgerMap[boxId] || { withdrawn: 0, credited: 0, history: [] };
      if(!ledger.history.length) return;
      const last = ledger.history[ledger.history.length-1];
      if(!confirm(`Undo this change: ${last.type==='deduct'?'−':'+'}${fmtMoney(last.amount)}?`)) return;
      const history = ledger.history.slice(0, -1);
      const withdrawn = ledger.withdrawn - (last.type==='deduct' ? last.amount : 0);
      const credited = ledger.credited - (last.type==='credit' ? last.amount : 0);
      try{
        await db.collection('years').doc(yearId).collection('boxLedger').doc(boxId)
          .set({ withdrawn, credited, history });
        toast('Change undone.');
        renderLedger(yearId, 'all');
      }catch(e){ console.error(e); toast('Could not undo that change.'); }
    };
  });
}

/* ================= STAFF ================= */
async function refreshStaff(){
  const snap = await db.collection('users').orderBy('email').get();
  STAFF = snap.docs.map(d=>({id:d.id, ...d.data()}));
}

async function renderStaff(){
  const el = document.getElementById('section-staff');

  // Gather every year any staff member is assigned in (not just the active year),
  // so we can show "Class · Year" for each of them.
  const assignedYearIds = new Set();
  STAFF.forEach(s=> Object.keys(s.assignments||{}).forEach(yid=> assignedYearIds.add(yid)));
  if(ACTIVE_YEAR_ID) assignedYearIds.add(ACTIVE_YEAR_ID);

  const classesByYear = {};
  await Promise.all(Array.from(assignedYearIds).map(async yid=>{
    classesByYear[yid] = await loadClassesForYear(yid);
  }));

  function assignmentLines(staff){
    const assignments = staff.assignments || {};
    const lines = Object.keys(assignments)
      .map(yid=>({ yid, year: YEARS.find(y=>y.id===yid) }))
      .filter(x=>x.year) // drop assignments pointing at a deleted year
      .sort((a,b)=> (b.year.createdAt||0) - (a.year.createdAt||0)) // most recent year first
      .map(x=>{
        const cls = (classesByYear[x.yid]||[]).find(c=>c.id===assignments[x.yid]);
        const isActive = x.yid === ACTIVE_YEAR_ID;
        return `<div class="${isActive?'':'muted'}" style="${isActive?'font-weight:600;':''}">${cls ? esc(cls.name) : '<span class="muted">unassigned class</span>'} <span class="tiny muted">· ${esc(x.year.label)}${isActive?' (active)':''}</span></div>`;
      });
    return lines.length ? lines.join('') : '<span class="muted">unassigned</span>';
  }

  el.innerHTML = `
    <div class="card">
      <h3>Create a staff account</h3>
      <p class="tiny muted" style="margin-top:6px;">Give the email and temporary password to them yourself — this app has no way to email it automatically.</p>
      <div class="row" style="margin-top:14px;">
        <div class="field"><label>Full name</label><input type="text" id="newStaffName" placeholder="e.g. Siti Aminah"></div>
        <div class="field"><label>Email</label><input type="email" id="newStaffEmail" placeholder="teacher@school.edu"></div>
        <div class="field"><label>Temporary password</label><input type="text" id="newStaffPass" placeholder="min. 6 characters"></div>
      </div>
      <div class="row">
        <div class="field">
          <label>Role</label>
          <select id="newStaffRole">
            <option value="teacher">Teacher</option>
            <option value="principal">Principal</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary" id="addStaffBtn">Create account</button>
    </div>

    <div class="card">
      <h3 style="margin-bottom:14px;">All accounts</h3>
      <p class="tiny muted" style="margin-top:-8px; margin-bottom:14px;">Assign a year and class to each teacher using the 📋 icon below.</p>
      ${STAFF.length ? `
        <table class="admin-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Class &amp; year</th><th></th></tr></thead>
          <tbody>
            ${STAFF.map(s=>{
              return `
                <tr data-id="${s.id}">
                  <td>${esc(s.displayName || '—')}</td>
                  <td>${esc(s.email)}</td>
                  <td><span class="badge ${s.role}">${esc(s.role)}</span></td>
                  <td class="tiny">${assignmentLines(s)}</td>
                  <td style="text-align:right; white-space:nowrap;">
                    ${s.role==='teacher' ? `<button class="btn-icon" data-action="assign" data-id="${s.id}" title="Assign class for a year">📋</button>` : ''}
                    <button class="btn-icon" data-action="resetPw" data-email="${esc(s.email)}" title="Send password reset email">✉</button>
                    <button class="btn-icon" data-action="removeStaff" data-id="${s.id}" title="Remove access">✕</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      ` : `<div class="empty-note">No staff accounts yet.</div>`}
    </div>
  `;

  const roleSelect = document.getElementById('newStaffRole');

  document.getElementById('addStaffBtn').onclick = async ()=>{
    const displayName = document.getElementById('newStaffName').value.trim();
    const email = document.getElementById('newStaffEmail').value.trim();
    const password = document.getElementById('newStaffPass').value;
    const role = roleSelect.value;

    if(!email || !password){ toast('Email and password are required.'); return; }
    if(password.length < 6){ toast('Password must be at least 6 characters.'); return; }

    const btn = document.getElementById('addStaffBtn');
    btn.disabled = true; btn.textContent = 'Creating…';
    try{
      await createStaffAccount({ email, password, displayName, role, assignments: {} });
      toast(role==='teacher' ? 'Account created. Assign a class for them below.' : 'Account created. Share the email and password with them directly.');
      await refreshStaff();
      renderStaff();
    }catch(e){
      console.error(e);
      toast(e.code === 'auth/email-already-in-use' ? 'That email is already registered.' : 'Could not create the account.');
    }
    btn.disabled = false; btn.textContent = 'Create account';
  };

  el.querySelectorAll('[data-action="resetPw"]').forEach(btn=>{
    btn.onclick = async ()=>{
      try{ await auth.sendPasswordResetEmail(btn.dataset.email); toast('Password reset email sent.'); }
      catch(e){ console.error(e); toast('Could not send reset email.'); }
    };
  });

  el.querySelectorAll('[data-action="removeStaff"]').forEach(btn=>{
    btn.onclick = async ()=>{
      if(!confirm("Remove this person's access? Their login will stop working.")) return;
      try{ await db.collection('users').doc(btn.dataset.id).delete(); toast('Access removed.'); await refreshStaff(); renderStaff(); }
      catch(e){ console.error(e); toast('Could not remove access.'); }
    };
  });

  el.querySelectorAll('[data-action="assign"]').forEach(btn=>{
    btn.onclick = ()=> openAssignModal(STAFF.find(s=>s.id===btn.dataset.id));
  });
}

function openAssignModal(staff){
  openModal(`
    <span class="modal-close" onclick="closeModal()">✕</span>
    <h3>Assign ${esc(staff.displayName || staff.email)}</h3>
    <div class="field" style="margin-top:14px;"><label>Year</label><select id="assignYear">${yearOptions(ACTIVE_YEAR_ID)}</select></div>
    <div class="field"><label>Class</label><select id="assignClass"></select></div>
    <button class="btn btn-primary" id="assignSaveBtn">Save assignment</button>
  `);
  const yearSel = document.getElementById('assignYear');
  const classSel = document.getElementById('assignClass');
  async function refresh(){
    const list = await loadClassesForYear(yearSel.value);
    const current = staff.assignments && staff.assignments[yearSel.value];
    classSel.innerHTML = list.length ? list.map(c=>`<option value="${c.id}" ${c.id===current?'selected':''}>${esc(c.name)}</option>`).join('') : '<option value="">No classes in this year</option>';
  }
  yearSel.addEventListener('change', refresh);
  refresh();
  document.getElementById('assignSaveBtn').onclick = async ()=>{
    const yearId = yearSel.value;
    const classId = classSel.value;
    if(!classId){ toast('No class to assign in that year.'); return; }
    try{
      await db.collection('users').doc(staff.id).update({ [`assignments.${yearId}`]: classId });
      toast('Assignment saved.');
      closeModal();
      await refreshStaff();
      renderStaff();
    }catch(e){ console.error(e); toast('Could not save assignment.'); }
  };
}

/* Creates a new Firebase Auth user without signing the admin out, using a
   temporary secondary app instance — the standard client-side workaround for
   apps with no backend server. */
async function createStaffAccount({ email, password, displayName, role, assignments }){
  const secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary-' + Date.now());
  const secondaryAuth = secondaryApp.auth();
  try{
    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
    await db.collection('users').doc(cred.user.uid).set({
      email, displayName: displayName || email, role, assignments: assignments || {}
    });
    await secondaryAuth.signOut();
  } finally {
    await secondaryApp.delete();
  }
}