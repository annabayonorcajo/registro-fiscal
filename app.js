// === CONFIG APPWRITE ===
const { Client, Account, ID } = Appwrite;
const client = new Client().setEndpoint('https://sfo.cloud.appwrite.io/v1').setProject('69f8cfe400124a170d43');
const account = new Account(client);

let currentUser = null, db, entries = {}, currentMonth = new Date().getMonth(), currentYear = 2026;
let activeId = null, currentFileB64 = null, isProUser = false, accentColor = '#00f2ea';

// === WIZARD PAPER TRAIL ===
let wizardStep = 0;
const questions = [
    "¿Mantienes vivienda a tu disposición en España?",
    "¿Tu cónyuge o hijos menores residen en España?",
    "¿Tu principal fuente de ingresos es una SL española?",
    "¿Realizas ponencias o eventos presenciales en España?"
];
let answers = [];

function wizardNext(ans) {
    answers.push(ans);
    wizardStep++;
    if(wizardStep < questions.length) {
        document.getElementById('q-text').innerText = questions[wizardStep];
    } else {
        showWizardResults();
    }
}

function showWizardResults() {
    document.getElementById('paper-wizard').style.display = 'none';
    const res = document.getElementById('paper-results');
    res.style.display = 'grid';
    const list = document.getElementById('checklist-items');
    list.innerHTML = "";
    if(answers[0]) list.innerHTML += "<li>Sube facturas de suministros del extranjero mensualmente para demostrar desvinculación.</li>";
    if(answers[2]) list.innerHTML += "<li>Sella registros BrightProof™ de 'Gestión Remota' cada semana.</li>";
    list.innerHTML += "<li>Sube tu certificado de residencia fiscal en Tailandia en cuanto lo tengas.</li>";
}

// === LOGICA APP ===
async function checkSession() {
    try { currentUser = await account.get(); document.getElementById('auth-screen').style.display = 'none'; document.getElementById('app-layout').style.display = 'flex'; initDB(currentUser.$id); }
    catch (e) { document.getElementById('auth-screen').style.display = 'block'; }
}

function initDB(uid) { 
    const req = indexedDB.open("BRIGHT_Vault_" + uid, 2); 
    req.onupgradeneeded = e => { e.target.result.createObjectStore("days", {keyPath:"id"}); e.target.result.createObjectStore("meta", {keyPath:"id"}); };
    req.onsuccess = e => { db = e.target.result; loadData(); };
}

function loadData() {
    db.transaction(["days", "meta"], "readonly").objectStore("days").getAll().onsuccess = e => {
        entries = {}; e.target.result.forEach(d => entries[d.id] = d);
        if(Object.keys(entries).length === 0 && new Date().getMonth() > 0) document.getElementById('catchup-modal').style.display = 'flex';
        renderCal(); updateAll();
    };
}

function updateAll() {
    const table = document.getElementById('audit-body'); table.innerHTML = '';
    const filterCountry = document.getElementById('filter-country').value.toLowerCase();
    const filterType = document.getElementById('filter-type').value;

    Object.values(entries).sort((a,b) => (b.unix || 0) - (a.unix || 0)).forEach(e => {
        // Lógica de filtrado
        if(filterCountry && !e.country.toLowerCase().includes(filterCountry)) return;
        if(filterType === 'doc' && !e.photo) return;
        if(filterType === 'gps' && !e.gps) return;

        table.innerHTML += `<tr>
            <td><b>${e.id}</b></td>
            <td>${e.country}</td>
            <td>${e.photo ? '📄' : ''} ${e.gps ? '📍' : ''}</td>
            <td><button class="btn" style="padding:5px 10px; font-size:10px" onclick="openDay('${e.id}')">Editar</button></td>
        </tr>`;
    });
    updateStats();
}

async function saveDay() {
    const id = activeId, loc = document.getElementById('f-loc').value, country = document.getElementById('f-country').value;
    const gps = document.getElementById('f-gps-val').value, notes = document.getElementById('f-notes').value;
    const ts = new Date().toLocaleString();
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id+loc+gps+currentUser.$id));
    const entry = { id, loc, country, gps, notes, ts, photo: currentFileB64, unix: Date.now(), hash: Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('') };
    db.transaction("days","readwrite").objectStore("days").put(entry).onsuccess = () => { entries[id]=entry; closeModal('modal-single'); renderCal(); updateAll(); };
}

function requestLocation() {
    navigator.geolocation.getCurrentPosition(p => { 
        document.getElementById('f-gps-val').value = `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`;
        document.getElementById('btn-gps').innerText = "✅ GPS BrightProof™ Generado";
    });
}

// --- UTILIDADES ---
function nav(id) { document.querySelectorAll('.section').forEach(s=>s.classList.remove('active')); document.getElementById('sect-'+id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).style.display='none'; }
function renderCal() { /* Lógica de renderizado mensual ya conocida */ }
function changeMonth(d) { currentMonth += d; if(currentMonth>11){currentMonth=0;currentYear++} if(currentMonth<0){currentMonth=11;currentYear--} renderCal(); }
function processFile(input, pId) { const r = new FileReader(); r.onload = e => { currentFileB64 = e.target.result; const p=document.getElementById(pId); p.src=currentFileB64; p.style.display='block'; }; r.readAsDataURL(input.files[0]); }
// ... Resto de funciones auxiliares (login, register, switchAuthTab)
