/* ============================================================
   Shared helpers used across every page.
   ============================================================ */

function toast(msg){
  let t = document.getElementById('toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'toast'; t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(()=>t.classList.remove('show'), 2400);
}

function fmtMoney(n){
  return 'RM ' + (Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
}

function todayStr(){ return new Date().toISOString().slice(0,10); }

function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function openModal(html){
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modalBackdrop').style.display = 'flex';
}
function closeModal(){
  document.getElementById('modalBackdrop').style.display = 'none';
}

/* Guards a page to a specific role. Calls onReady(user, profile) once confirmed.
   If the signed-in user has a different role, redirects to that role's page.
   If not signed in at all, redirects to the login page. */
function requireRole(expectedRole, onReady){
  auth.onAuthStateChanged(async (user)=>{
    if(!user){ window.location.href = 'index.html'; return; }
    try{
      const doc = await db.collection('users').doc(user.uid).get();
      if(!doc.exists){
        toast('Your account has no role assigned. Ask your admin to set one up.');
        await auth.signOut();
        window.location.href = 'index.html';
        return;
      }
      const profile = doc.data();
      if(profile.role !== expectedRole){
        window.location.href = profile.role + '.html';
        return;
      }
      onReady(user, profile);
    }catch(e){
      console.error(e);
      toast('Could not verify your account. Please log in again.');
      window.location.href = 'index.html';
    }
  });
}

function logout(){
  auth.signOut().then(()=>{ window.location.href = 'index.html'; });
}

/* Fills and opens the print-only receipt, then triggers the browser print dialog. */
function printReceipt({ schoolName='[School Name]', className, studentName, amount, date, receiptNo }){
  const area = document.getElementById('printArea');
  area.innerHTML = `
    <div class="receipt">
      <div class="rc-school">${esc(schoolName)}</div>
      <div class="rc-sub">Parent-Teacher Organisation &middot; Fund Receipt</div>
      <table>
        <tr><td class="k">Receipt No.</td><td class="v">${esc(receiptNo)}</td></tr>
        <tr><td class="k">Student</td><td class="v">${esc(studentName)}</td></tr>
        <tr><td class="k">Class</td><td class="v">${esc(className)}</td></tr>
        <tr><td class="k">Date paid</td><td class="v">${esc(date)}</td></tr>
      </table>
      <div class="rc-amount">${fmtMoney(amount)}</div>
      <div class="rc-foot">Placeholder receipt &mdash; replace with your school's official template.<br>Received by: ______________________</div>
    </div>
  `;
  document.body.classList.add('printing');
  window.print();
}
window.addEventListener('afterprint', ()=> document.body.classList.remove('printing'));
