// === CONFIG APPWRITE ===
const { Client, Account, ID } = Appwrite;
const client = new Client().setEndpoint('https://sfo.cloud.appwrite.io/v1').setProject('69f8cfe400124a170d43');
const account = new Account(client);

let currentUser = null, db, entries = {}, currentMonth = new Date().getMonth(), currentYear = new Date().getFullYear();
let activeId = null;

// === LANDING SCRIPTS ===
function switchTab(tab) {
    document.getElementById('auth-modal').style.display = 'flex';
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    if(tab === 'login') { document.getElementById('tab-login').classList.add('active'); document.getElementById('form-login').classList.add('active'); }
    else { document.getElementById('tab-register').classList.add('active'); document.getElementById('form-register').classList.add('active'); }
}

function updateMapSim() {
    const val = document.getElementById('map-slider').value;
    document.getElementById('map-val').innerText = val;
    const es = 12 - val;
    document.getElementById('bar-es').innerText = `España: ${es}m`; document.getElementById('bar-es').style.width = `${(es/12)*100}%`;
    document.getElementById('bar-out').innerText = `Fuera: ${val}m`; document.getElementById('bar-out').style.width = `${(val/12)*100}%`;
    const msg = document.getElementById('map-msg');
    if(es >= 6) { msg.className = "sim-msg text-risk"; msg.innerText = "ALTO RIESGO: Más de 183 días en España determina residencia fiscal automática."; }
    else { msg.className = "sim-msg text-safe"; msg.innerText = "SEGURO: Estancia inferior a 183 días. Construye evidencia para proteger este estatus."; }
}

// === AUTHENTICATION ===
async function checkSession() {
    try { 
        currentUser = await account.get(); 
        document.getElementById('landing-screen').style.display = 'none'; 
        document.getElementById('app-layout').style.display = 'flex'; 
        document.getElementById('dash-username').innerText = `Panel de ${currentUser.name.split(' ')[0]}`;
        initDB(currentUser.$id); 
    } catch (e) { document.getElementById('landing-screen').style.display = 'block'; }
}

async function login() { try { await account.createEmailPasswordSession(document.getElementById('login-email').value, document.getElementById('login-pass').value); checkSession(); document.getElementById('auth-modal').style.display='none'; } catch (e) { alert("Credenciales incorrectas"); } }
async function register() { try { await account.create(ID.unique(), document.getElementById('reg-email').value, document.getElementById('reg-pass').value, document.getElementById('reg-name').value); await login(); } catch (e) { alert(e.message); } }
function logout() { account.deleteSession('current').then(() => location.reload()); }

window.onload = checkSession;

// === DATABASE & LOGIC ===
function initDB(uid) { 
    const req = indexedDB.open("BRIGHT_Vault_" + uid, 1); 
    req.onupgradeneeded = e => { e.target.result.createObjectStore("days", {keyPath:"id"}); };
    req.onsuccess = e => { db = e.target.result; loadData(); };
}

function loadData() {
    db.transaction("days").objectStore("days").getAll().onsuccess = e => {
        entries = {}; e.target.result.forEach(d => entries[d.id] = d);
        renderCal(); updateStats(); syncAuditTable();
    };
}

// === UI UPDATES ===
function nav(id) { document.querySelectorAll('.app-section').forEach(s=>s.classList.remove('active')); document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active')); document.getElementById('sect-'+id).classList.add('active'); event.target.closest('.nav-btn').classList.add('active'); }
function closeAppModal(id) { document.getElementById(id).style.display = 'none'; }

function updateStats() {
    const es = Object.values(entries).filter(e=>e.loc==='es').length;
    document.getElementById('st-es').innerText = es; 
    document.getElementById('st-intl').innerText = Object.values(entries).filter(e=>e.loc==='intl').length;
    document.getElementById('semaforo-count').innerText = `${es} / 183`;
    document.getElementById('semaforo-bar').style.width = Math.min((es/183)*100, 100) + '%';
    
    let g=0, p=0; Object.values(entries).forEach(e => { if(e.gps) g++; if(e.notes) p++; });
    document.getElementById('leg-gps').innerText = g; document.getElementById('leg-notes').innerText = p;
}

function renderCal() {
    const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    document.getElementById('cal-month-title').innerText = `${names[currentMonth]} ${currentYear}`;
    const grid = document.getElementById('cal-render'); grid.innerHTML = '';
    const first = (new Date(currentYear, currentMonth, 1).getDay() || 7) - 1;
    for(let i=0; i<first; i++) grid.innerHTML += '<div></div>';
    
    for(let d=1; d<=new Date(currentYear, currentMonth+1, 0).getDate(); d++) {
        const id = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const e = entries[id];
        grid.innerHTML += `<div class="day" style="background:${e ? (e.loc==='es'?'var(--risk)':'var(--safe)') : 'var(--bg)'}; color:${e?'#000':'var(--text)'}" onclick="openSingleModal('${id}')">${d}</div>`;
    }
}
function changeMonth(d) { currentMonth+=d; if(currentMonth>11){currentMonth=0;currentYear++} if(currentMonth<0){currentMonth=11;currentYear--} renderCal(); }

function syncAuditTable() {
    const tbody = document.getElementById('audit-body'); tbody.innerHTML = '';
    Object.values(entries).sort((a,b) => b.unix - a.unix).forEach(e => {
        tbody.innerHTML += `<tr><td>${e.id}</td><td>${e.country} <span style="font-size:10px;color:var(--text-dim)">${e.notes}</span></td><td>${e.gps?'📍 GPS':''}</td><td style="font-family:monospace; color:var(--accent)">${e.hash.substring(0,15)}...</td></tr>`;
    });
}

// === WIZARD PAPER TRAIL ===
let wStep = 0, wA = [];
const wQ = ["¿Mantienes vivienda en España?", "¿Cónyuge o hijos residen en España?", "¿Principal fuente de ingresos es SL española?"];
function wizardNext(ans) {
    wA.push(ans); wStep++;
    if(wStep < wQ.length) { document.getElementById('q-text').innerText = wQ[wStep]; } 
    else { 
        document.getElementById('paper-wizard').style.display = 'none'; document.getElementById('paper-results').style.display = 'grid';
        let html = "<li>✅ Sube certificado de residencia fiscal.</li>";
        if(wA[0] || wA[1]) html += "<li style='color:var(--risk)'>⚠️ <b>Alerta 9.1.b:</b> Mantienes vínculos fuertes. Genera BrightProofs con GPS semanalmente.</li>";
        if(wA[2]) html += "<li>💡 <b>Blindaje:</b> Sella registros indicando 'Gestión Remota SL'.</li>";
        document.getElementById('checklist-items').innerHTML = html;
    }
}

// === ACTIONS ===
function openSingleModal(id) {
    activeId = id || `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
    const e = entries[activeId] || {};
    document.getElementById('m-date-natural').innerText = activeId;
    document.getElementById('f-loc').value = e.loc || 'intl'; document.getElementById('f-country').value = e.country || '';
    document.getElementById('f-notes').value = e.notes || ''; document.getElementById('f-gps-val').value = e.gps || '';
    document.getElementById('modal-single').style.display = 'flex';
}

function openBulkModal() { document.getElementById('modal-bulk').style.display = 'flex'; }

async function saveDay() {
    const loc = document.getElementById('f-loc').value, country = document.getElementById('f-country').value, gps = document.getElementById('f-gps-val').value, notes = document.getElementById('f-notes').value;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(activeId+loc+currentUser.$id));
    const entry = { id: activeId, loc, country, gps, notes, ts: new Date().toLocaleString(), unix: Date.now(), hash: Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('') };
    db.transaction("days","readwrite").objectStore("days").put(entry).onsuccess = () => { entries[activeId]=entry; closeAppModal('modal-single'); loadData(); };
}

async function saveBulk() {
    const start = document.getElementById('b-start').value, end = document.getElementById('b-end').value, loc = document.getElementById('b-loc').value, country = document.getElementById('b-country').value;
    let curr = new Date(start+'T00:00:00'), endD = new Date(end+'T00:00:00'), store = db.transaction("days","readwrite").objectStore("days");
    while(curr <= endD) {
        const id = `${curr.getFullYear()}-${String(curr.getMonth()+1).padStart(2,'0')}-${String(curr.getDate()).padStart(2,'0')}`;
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id+loc+currentUser.$id));
        store.put({ id, loc, country, gps: "Bulk", notes: "Viaje", ts: new Date().toLocaleString(), unix: Date.now(), hash: Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('') });
        curr.setDate(curr.getDate() + 1);
    }
    closeAppModal('modal-bulk'); setTimeout(loadData, 500);
}

function requestLocation() {
    navigator.geolocation.getCurrentPosition(p => { 
        document.getElementById('f-gps-val').value = `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`;
        document.getElementById('btn-gps').innerText = "✅ GPS Sellado"; 
    });
}
</script>
