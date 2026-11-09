import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import QRCode from 'https://esm.sh/qrcode@1.5.4';

const SUPABASE_URL = 'https://kvurwwliuckckyibppil.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_X6Ac2uLvgJ-mO7miKXsUMg_-kazchET';
const configured = SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('PASTE_') && !SUPABASE_ANON_KEY.includes('PASTE_');
const $ = id => document.getElementById(id);
let sb=null, user=null, election=null, candidates=[], votes=[], tokenStats=[], realtimeChannel=null, latestTokens=[];
let qrToken = new URLSearchParams(location.search).get('token') || '';
let organization = null;
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const msg = (s, bad=false) => { $('publicNotice').textContent=s; $('publicNotice').style.borderColor=bad?'#fb7185':'#19d3e655'; };
const fmt = d => d ? new Date(d).toLocaleString('id-ID') : '—';
if(configured){sb=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);await boot();}
else { $('candidateGrid').innerHTML='<div class="card">Aplikasi belum terhubung. Isi SUPABASE_URL dan SUPABASE_ANON_KEY pada file <b>app.js</b>, lalu jalankan SQL pada <b>supabase/schema.sql</b>.</div>'; }
function clock(){ $('clock').textContent=new Date().toLocaleDateString('id-ID',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})+' • '+new Date().toLocaleTimeString('id-ID');}
setInterval(clock,1000);clock();
$('theme').onclick=()=>{document.body.classList.toggle('light');localStorage.setItem('evpro-theme',document.body.classList.contains('light')?'light':'dark')};if(localStorage.getItem('evpro-theme')==='light')document.body.classList.add('light');
$('adminOpen').onclick=()=> $('loginModal').classList.remove('hidden');$('loginClose').onclick=()=> $('loginModal').classList.add('hidden');
$('loginForm').onsubmit=async e=>{e.preventDefault();if(!sb)return;const {error}=await sb.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(error){$('loginError').textContent=error.message;return}$('loginModal').classList.add('hidden');await checkAdmin();};
$('logout').onclick=async()=>{await sb.auth.signOut();user=null;$('adminArea').classList.add('hidden');};
async function boot(){const {data:{session}}=await sb.auth.getSession();if(session){user=session.user;await checkAdmin()}await loadPublic();sb.auth.onAuthStateChange(async(_event,session)=>{user=session?.user||null;if(user)await checkAdmin();else $('adminArea').classList.add('hidden')});}
async function checkAdmin(){if(!user)return;const {data,error}=await sb.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();if(error||!data){msg('Akun berhasil login tetapi belum diberi hak administrator oleh pemilik proyek.',true);await sb.auth.signOut();return;} $('adminArea').classList.remove('hidden');await loadAdmin();}
async function loadOrganization(){
 const {data,error}=await sb.from('organization_settings').select('*').eq('id',true).maybeSingle();
 if(error){console.warn(error.message);return;} organization=data;if(!data)return;
 $('brandName').textContent=data.institution_name||'E-VOTING ROBOTIC PRO';
 $('brandSub').textContent=data.unit_name||'SECURE DIGITAL DEMOCRACY';
 $('brandLogo').innerHTML=data.logo_url?`<img src="${esc(data.logo_url)}" style="width:100%;height:100%;object-fit:contain;border-radius:12px" alt="Logo">`:'◈';
 $('appFooter').textContent=(data.institution_name||'E-VOTING ROBOTIC PRO')+(data.watermark_visible?' • @Mr.Mey':'');
 document.documentElement.style.setProperty('--cyan',data.primary_color||'#19d3e6');
 document.documentElement.style.setProperty('--purple',data.secondary_color||'#a855f7');
 document.querySelectorAll('.rgb').forEach(x=>x.style.display=data.rgb_enabled?'block':'none');
 if(!localStorage.getItem('evpro-theme')&&data.default_theme==='light')document.body.classList.add('light');
}
async function loadPublic(){
await loadOrganization();
 const {data:el,error}=await sb.from('elections').select('*').eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(error){msg(error.message,true);return;} election=el;
 if(!election){$('eventTitle').textContent='BELUM ADA PEMILIHAN AKTIF';$('eventDesc').textContent='Panitia belum membuka pemilihan.';$('candidateGrid').innerHTML='<div class="card muted">Belum ada pemilihan aktif.</div>';$('nCandidates').textContent='0';$('nVotes').textContent='0';$('electionStatus').textContent='OFF';return;}
 $('eventTitle').textContent=election.title;$('eventDesc').textContent=election.description||'Gunakan token yang diberikan panitia untuk memberikan suara.';
 const {data:cs,error:ce}=await sb.from('candidates').select('*').eq('election_id',election.id).order('sort_order');if(ce){msg(ce.message,true);return;}candidates=cs||[];
 const {data:publicCount,error:countError}=await sb.rpc('public_election_vote_count',{p_election_id:election.id});if(countError){msg(countError.message,true);return;}const count=Number(publicCount||0);votes=Array.from({length:count});
 $('nCandidates').textContent=candidates.length;$('nVotes').textContent=count||0;$('electionStatus').textContent='AKTIF';
 $('candidateGrid').innerHTML=candidates.length?'':'<div class="card muted">Belum ada kandidat yang ditambahkan.</div>';
 candidates.forEach(c=>{const el=document.createElement('article');el.className='card candidate';el.innerHTML=`<div class="photo">${c.photo_url?`<img src="${esc(c.photo_url)}" alt="">`:'◉'}</div><span class="tag">KANDIDAT ${esc(c.number||'')}</span><h3>${esc(c.name)}</h3><p>${esc(c.bio||'')}</p><button class="vote" data-id="${c.id}" ${election.status!=='active'?'disabled':''}>PILIH KANDIDAT</button>`;$('candidateGrid').append(el);});

$('candidateGrid').onclick = function(e) {
    console.log('TES A: KLIK DITERIMA');

    const tombol = e.target.closest('button.vote');

    console.log('TES B: TOMBOL DITEMUKAN:', !!tombol);

    if (!tombol) {
        console.log('TES: BUKAN TOMBOL KANDIDAT');
        return;
    }

    console.log('TES C: STATUS DISABLED:', tombol.disabled);

    console.log('TES D: ID KANDIDAT:', tombol.dataset.id);

    if (tombol.disabled) {
        alert('Tombol kandidat sedang tidak aktif.');
        return;
    }

    alert('PEMERIKSAAN BERHASIL. MENUJU TOKEN.');

    console.log('TES E: MEMANGGIL VOTEFLOW');

    voteFlow(tombol.dataset.id);
};
 msg('Masukkan token voting Anda setelah menekan tombol PILIH KANDIDAT. Token hanya dapat digunakan sesuai hak voting yang ditentukan panitia.');
 subscribeRealtime();
}
async function voteFlow(candidateId){
    
    const token = qrToken || $('voterToken').value.trim();

if (!token) {
    alert('Silakan masukkan token voting terlebih dahulu.');
    $('voterToken').focus();
    return;
}
if(!confirm('Konfirmasi pilihan ini? Suara yang sudah masuk tidak dapat dibatalkan.'))return;

 const {data,error}=await sb.rpc('cast_vote',{p_token:token.trim(),p_candidate_id:candidateId});if(error){alert('Voting gagal: '+error.message);return;}if(!data?.ok){alert(data?.message||'Token tidak valid atau hak voting habis.');return;}qrToken='';history.replaceState({},'',location.pathname);alert('Suara berhasil direkam. Terima kasih telah berpartisipasi!');await loadPublic();if(user)await loadAdmin();}
function subscribeRealtime(){if(realtimeChannel)sb.removeChannel(realtimeChannel);realtimeChannel=sb.channel('public-vote-updates').on('postgres_changes',{event:'INSERT',schema:'public',table:'votes',filter:`election_id=eq.${election.id}`},async()=>{await loadPublic();if(user)await loadAdmin()}).subscribe();}
async function loadAdmin(){if(!user)return;await loadOrganization();await loadIdentityForm();const {data:els}=await sb.from('elections').select('*').order('created_at',{ascending:false}).limit(1);const current=els?.[0];if(current){election=current;$('elTitle').value=current.title;$('elDesc').value=current.description||'';$('elType').value=current.election_type||'';$('elPeriod').value=current.academic_period||'';$('elSlogan').value=current.slogan||'';$('elChair').value=current.committee_chair||'';$('elWitness').value=current.witness_name||'';$('elStatus').value=current.status;$('elStart').value=current.starts_at?new Date(current.starts_at).toISOString().slice(0,16):'';$('elEnd').value=current.ends_at?new Date(current.ends_at).toISOString().slice(0,16):'';await loadPublic();}await loadCandidatesAdmin();await loadStats();await loadReport();}
async function loadIdentityForm(){
 if(!organization)return;
 $('orgName').value=organization.institution_name||'';$('orgUnit').value=organization.unit_name||'';
 $('orgAddress').value=organization.address||'';$('orgContact').value=organization.contact||'';
 $('orgOrganizer').value=organization.organizer||'';$('orgPrimary').value=organization.primary_color||'#19d3e6';
 $('orgSecondary').value=organization.secondary_color||'#a855f7';$('orgRgb').value=String(organization.rgb_enabled);
 $('orgWatermark').value=String(organization.watermark_visible);$('orgTheme').value=organization.default_theme||'dark';
}
$('saveIdentity').onclick=async()=>{
 let logo_url=organization?.logo_url||null;const file=$('orgLogo').files[0];
 if(file){if(!['image/png','image/jpeg'].includes(file.type)||file.size>2*1024*1024){alert('Logo harus PNG/JPG maksimal 2 MB.');return;}
 const ext=file.type==='image/png'?'png':'jpg',path=`identity/${crypto.randomUUID()}.${ext}`;
 const {error:upErr}=await sb.storage.from('institution-branding').upload(path,file,{contentType:file.type,upsert:false});
 if(upErr){alert(upErr.message);return;}logo_url=sb.storage.from('institution-branding').getPublicUrl(path).data.publicUrl;}
 const payload={id:true,institution_name:$('orgName').value.trim()||'E-VOTING ROBOTIC PRO',unit_name:$('orgUnit').value.trim(),address:$('orgAddress').value.trim(),contact:$('orgContact').value.trim(),organizer:$('orgOrganizer').value.trim(),logo_url,primary_color:$('orgPrimary').value,secondary_color:$('orgSecondary').value,rgb_enabled:$('orgRgb').value==='true',watermark_visible:$('orgWatermark').value==='true',default_theme:$('orgTheme').value,updated_by:user.id,updated_at:new Date().toISOString()};
 const {error}=await sb.from('organization_settings').upsert(payload,{onConflict:'id'});if(error){alert(error.message);return;}organization=payload;await loadOrganization();alert('Identitas dan branding berhasil disimpan dan disinkronkan.');
};
async function loadCandidatesAdmin(){if(!election)return;const {data}=await sb.from('candidates').select('*').eq('election_id',election.id).order('sort_order');candidates=data||[];$('candidateAdminList').innerHTML=candidates.map(c=>`<div class="listrow">${c.photo_url?`<img src="${esc(c.photo_url)}">`:'<div class="photo" style="width:45px;height:45px;margin:0">◉</div>'}<div class="grow"><b>${esc(c.number||'')} ${esc(c.name)}</b><div class="muted">${esc(c.bio||'')}</div></div><button class="alt" data-edit="${c.id}">Edit</button><button class="red" data-del="${c.id}">Hapus</button></div>`).join('');document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const c=candidates.find(x=>x.id===b.dataset.edit);$('candidateId').value=c.id;$('candidateName').value=c.name;$('candidateNumber').value=c.number||'';$('candidateBio').value=c.bio||'';});document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('Hapus kandidat ini?'))return;const {error}=await sb.from('candidates').delete().eq('id',b.dataset.del);if(error)alert(error.message);else await loadAdmin();});}
$('candidateForm').onsubmit=async e=>{e.preventDefault();if(!election){alert('Buat pemilihan terlebih dahulu.');return;}let photo_url=null;const file=$('candidatePhoto').files[0];if(file){if(file.type!=='image/jpeg'||file.size>2*1024*1024){alert('Foto wajib JPG maksimal 2 MB.');return;}const path=`${election.id}/${crypto.randomUUID()}.jpg`;const {error:upErr}=await sb.storage.from('candidate-photos').upload(path,file,{contentType:'image/jpeg',upsert:false});if(upErr){alert(upErr.message);return;}const {data}=sb.storage.from('candidate-photos').getPublicUrl(path);photo_url=data.publicUrl;}
 const payload={election_id:election.id,name:$('candidateName').value.trim(),number:$('candidateNumber').value.trim(),bio:$('candidateBio').value.trim(),...(photo_url?{photo_url}:{})};const id=$('candidateId').value;const res=id?await sb.from('candidates').update(payload).eq('id',id):await sb.from('candidates').insert(payload);if(res.error){alert(res.error.message);return;}e.target.reset();$('candidateId').value='';await loadAdmin();};
$('cancelCandidate').onclick=()=>$('candidateForm').reset();
$('saveElection').onclick=async()=>{const payload={title:$('elTitle').value.trim(),description:$('elDesc').value.trim(),election_type:$('elType').value.trim(),academic_period:$('elPeriod').value.trim(),slogan:$('elSlogan').value.trim(),committee_chair:$('elChair').value.trim(),witness_name:$('elWitness').value.trim(),status:$('elStatus').value,starts_at:$('elStart').value?new Date($('elStart').value).toISOString():null,ends_at:$('elEnd').value?new Date($('elEnd').value).toISOString():null};let res;if(election)res=await sb.from('elections').update(payload).eq('id',election.id);else res=await sb.from('elections').insert(payload);if(res.error){alert(res.error.message);return;}alert('Pengaturan pemilihan tersimpan.');await loadAdmin();};
$('issueTokens').onclick=async()=>{if(!election){alert('Buat pemilihan terlebih dahulu.');return;}const qty=Number($('tokenQty').value),limit=Number($('tokenLimit').value);if(!Number.isInteger(qty)||qty<1||qty>500||!Number.isInteger(limit)||limit<1||limit>20){alert('Jumlah token 1–500 dan hak voting 1–20.');return;}const {data,error}=await sb.rpc('admin_issue_tokens',{p_election_id:election.id,p_quantity:qty,p_vote_limit:limit});if(error){alert(error.message);return;}latestTokens=data||[];renderTokenResults();await loadStats();};
async function renderTokenResults(){const box=$('tokenResults');box.innerHTML='<h4>Token berhasil dibuat — simpan sekarang</h4><div class="qrgrid" id="qrgrid"></div><button id="downloadTokens" style="margin-top:12px">Download daftar token CSV</button>';for(const t of latestTokens){const item=document.createElement('div');item.className='qritem';item.innerHTML=`<canvas></canvas><b style="display:block;word-break:break-all">${esc(t.token)}</b><small class="muted">Hak voting: ${t.vote_limit}</small>`;box.querySelector('#qrgrid').append(item);await QRCode.toCanvas(item.querySelector('canvas'),location.origin+location.pathname+'?token='+encodeURIComponent(t.token),{width:125,margin:1});}box.querySelector('#downloadTokens').onclick=()=>downloadCsv('token-peserta.csv',[['Token','Hak Voting'],...latestTokens.map(t=>[t.token,t.vote_limit])]);}
async function loadStats(){if(!election)return;const {count:vcount}=await sb.from('votes').select('*',{count:'exact',head:true}).eq('election_id',election.id);const {data:ts}=await sb.from('voter_tokens').select('vote_limit,used_count').eq('election_id',election.id);const {data:cs}=await sb.from('candidates').select('id,name').eq('election_id',election.id);const total=vcount||0;$('dashVotes').textContent=total;$('dashCandidates').textContent=cs?.length||0;$('dashTokens').textContent=ts?.length||0;$('dashUsed').textContent=(ts||[]).filter(t=>t.used_count>=t.vote_limit).length;
 const {data:counts}=await sb.rpc('admin_vote_totals',{p_election_id:election.id});const map=new Map((counts||[]).map(x=>[x.candidate_id,Number(x.vote_count)]));$('chart').innerHTML='<h4>Perolehan suara</h4>'+(cs||[]).map(c=>{const n=map.get(c.id)||0,p=total?Math.round(n/total*100):0;return `<div class="barrow"><b>${esc(c.name)}</b><div class="bar"><i style="width:${p}%"></i></div><span>${n} (${p}%)</span></div>`}).join('');}
async function loadReport(){if(!election)return;const {data:cs}=await sb.from('candidates').select('*').eq('election_id',election.id).order('sort_order');const {data:counts}=await sb.rpc('admin_vote_totals',{p_election_id:election.id});const map=new Map((counts||[]).map(x=>[x.candidate_id,Number(x.vote_count)]));const total=(counts||[]).reduce((a,x)=>a+Number(x.vote_count),0);$('reportContent').innerHTML=`<div style="text-align:center"><h2>${esc(organization?.institution_name||'')}</h2><b>${esc(organization?.unit_name||'')}</b><div>${esc(organization?.address||'')}</div><div>${esc(organization?.contact||'')}</div></div><h3>${esc(election.title)}</h3><p>${esc(election.election_type||'')} • ${esc(election.academic_period||'')} • ${esc(election.slogan||'')}</p><p class="muted">Status: ${esc(election.status)} • Dibuat: ${fmt(election.created_at)} • Ketua panitia: ${esc(election.committee_chair||'—')} • Saksi: ${esc(election.witness_name||'—')}</p><p>Total suara sah: <b>${total}</b></p><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:9px;border-bottom:1px solid var(--line)">Kandidat</th><th style="text-align:right;padding:9px;border-bottom:1px solid var(--line)">Suara</th><th style="text-align:right;padding:9px;border-bottom:1px solid var(--line)">Persentase</th></tr></thead><tbody>${(cs||[]).map(c=>{const n=map.get(c.id)||0;return `<tr><td style="padding:9px;border-bottom:1px solid var(--line)">${esc(c.number||'')} ${esc(c.name)}</td><td style="text-align:right;padding:9px;border-bottom:1px solid var(--line)">${n}</td><td style="text-align:right;padding:9px;border-bottom:1px solid var(--line)">${total?(n/total*100).toFixed(2):'0.00'}%</td></tr>`}).join('')}</tbody></table>`;window.reportRows=[['Kandidat','Jumlah Suara','Persentase'],...(cs||[]).map(c=>{const n=map.get(c.id)||0;return [c.name,n,total?(n/total*100).toFixed(2)+'%':'0%']})];}
function downloadCsv(name,rows){const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();URL.revokeObjectURL(a.href);}
$('csvReport').onclick=()=>downloadCsv('laporan-e-voting.csv',window.reportRows||[]);$('printReport').onclick=()=>window.print();
$('resetReport').onclick = async () => {
  if (!user) {
    alert('Silakan login sebagai Admin terlebih dahulu.');
    return;
  }

  if (!election || !election.id) {
    alert('Data pemilihan tidak ditemukan.');
    return;
  }

  if (!confirm('PERINGATAN!\n\nSemua suara pada pemilihan ini akan dihapus dan hak token dikembalikan.\n\nLanjutkan reset?')) {
    return;
  }

  const konfirmasi = prompt('Ketik RESET untuk melanjutkan:');

  if (konfirmasi !== 'RESET') {
    alert('Reset dibatalkan.');
    return;
  }

  const { data, error } = await sb.rpc(
    'admin_reset_election_votes',
    { p_election_id: election.id }
  );

  if (error) {
    alert('Reset gagal: ' + error.message);
    return;
  }

  alert(
    'RESET BERHASIL!\n' +
    'Suara dihapus: ' + data.deleted_votes +
    '\nToken dikembalikan: ' + data.reset_tokens
  );

  await loadPublic();

  if (user) {
    await loadAdmin();
  }
};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.adminTab').forEach(x=>x.classList.add('hidden'));$('tab-'+b.dataset.tab).classList.remove('hidden');});
if(qrToken){msg('Token QR terdeteksi. Pilih kandidat untuk melanjutkan voting. Token akan digunakan otomatis.');}
