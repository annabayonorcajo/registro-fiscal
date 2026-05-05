// === APPWRITE Y VARIABLES GLOBALES ===
const { Client, Account, ID } = Appwrite;
const client = new Client().setEndpoint('https://sfo.cloud.appwrite.io/v1').setProject('69f8cfe400124a170d43');
const account = new Account(client);

let currentUser = null, db, entries = {};
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let activeId = null, currentFileB64 = null, savedTimestamp = null, isProUser = false;
let accentColor = '#00f2ea';

// === AUTH Y ONBOARDING ===
function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active')); 
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active')); 
    document.getElementById('auth-error').style.display = 'none';
    if(tab === 'login') { document.querySelectorAll('.auth-tab')[0].classList.add('active'); document.getElementById('form-login').classList.add('active'); } 
    else { document.querySelectorAll('.auth-tab')[1].classList.add('active'); document.getElementById('form-register').classList.add('active'); }
}

function togglePass(id) { const i = document.getElementById(id); i.type = i.type === "password" ? "text" : "password"; }

function nextStep(step) {
    const e = document.getElementById('reg-email').value, p = document.getElementById('reg-pass').value;
    if(step > 1 && (!e || p.length < 8)) return showError("Introduce un email y contraseña (mínimo 8 caracteres).");
    if(step > 2) { 
        const n = document.getElementById('reg-name').value, sn = document.getElementById('reg-surname').value; 
        if(!n || !sn) return showError("El nombre y los apellidos son obligatorios."); 
    }
    document.getElementById('auth-error').style.display = 'none'; 
    document.querySelectorAll('.reg-step').forEach(s => s.classList.remove('active')); 
    document.getElementById('step' + step).classList.add('active');
    for(let i=1; i<=3; i++) { document.getElementById('dot' + i).classList.toggle('active', i<=step); }
}

function showError(msg) { const err = document.getElementById('auth-error'); err.innerText = msg; err.style.display = 'block'; }

async function checkSession() {
    try { 
        currentUser = await account.get(); 
        document.getElementById('auth-screen').style.display = 'none'; 
        document.getElementById('app-layout').style.display = 'flex'; 
        document.getElementById('dash-username').innerText = `Hola, ${currentUser.name.split(' ')[0]} 👋`; 
        initDB(currentUser.$id); 
    } catch (err) { 
        document.getElementById('auth-screen').style.display = 'flex'; 
        document.getElementById('app-layout').style.display = 'none'; 
    }
}

async function register() {
    if(!document.getElementById('reg-terms').checked) return showError("Debes aceptar la Política de Privacidad.");
    try { 
        document.getElementById('auth-error').style.display = 'none'; 
        await account.create(ID.unique(), document.getElementById('reg-email').value, document.getElementById('reg-pass').value, `${document.getElementById('reg-name').value} ${document.getElementById('reg-surname').value}`); 
        await account.createEmailPasswordSession(document.getElementById('reg-email').value, document.getElementById('reg-pass').value); 
        checkSession(); 
    } catch (err) { showError(err.message); }
}

async function login() { 
    try { await account.createEmailPasswordSession(document.getElementById('login-email').value, document.getElementById('login-pass').value); checkSession(); } 
    catch (err) { showError("Correo o contraseña incorrectos."); } 
}

async function logout() { await account.deleteSession('current'); checkSession(); }

window.onload = () => { checkSession(); };

// === BASE DE DATOS LOCAL Y CATCH-UP ===
function initDB(uid) { 
    const req = indexedDB.open("BRIGHT_Vault_" + uid, 1); 
    req.onupgradeneeded = e => { const d = e.target.result; d.createObjectStore("days", {keyPath: "id"}); d.createObjectStore("meta", {keyPath: "id"}); }; 
    req.onsuccess = e => { db = e.target.result; loadApp(); }; 
}

function loadApp() {
    db.transaction(["days", "meta"], "readonly").objectStore("days").getAll().onsuccess = e => { 
        entries = {}; e.target.result.forEach(d => entries[d.id] = d); 
        
        if(Object.keys(entries).length === 0 && new Date().getMonth() > 0) {
            document.getElementById('catchup-modal').style.display = 'flex';
        }
        renderCal(); updateAll();
    };
    
    db.transaction("meta").objectStore("meta").getAll().onsuccess = e => {
        e.target.result.forEach(i => { 
            if(i.id === "profile") { 
                document.getElementById('p-id').value = i.nif || ''; 
                document.getElementById('theme-sel').value = i.theme || 'default'; 
                if(i.theme === 'light') document.body.classList.add('theme-light'); 
                isProUser = i.isPro || false;
                if(i.accent) { setAccent(i.accent, null); }
            } 
        });
        updateProUI();
    };
}

async function catchupFill(location) {
    const start = new Date(currentYear, 0, 1);
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const country = location === 'es' ? 'España' : 'Extranjero / Tailandia';
    const ts = new Date().toLocaleString(); const unix = Date.now();
    let store = db.transaction("days", "readwrite").objectStore("days");
    
    document.getElementById('catchup-modal').style.display = 'none';
    
    while(start <= yesterday) {
        const dateId = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
        const hash = await genHash(`${dateId}|${location}|${country}|CATCHUP||Onboarding Automático|NO|${ts}|${currentUser.$id}`);
        const entry = { id: dateId, loc: location, country, gps: "Catch-up", flight: "", notes: "Onboarding Automático (Catch-up)", photo: null, ts, unixTime: unix, hash };
        store.put(entry); entries[dateId] = entry;
        start.setDate(start.getDate() + 1);
    }
    renderCal(); updateAll(); alert("¡Listo! Hemos registrado tus días pasados. Ya puedes continuar normalmente.");
}

// === FUNCIONES SAAS (PRO, TEMAS, ENLACES) ===
function checkProFeature(feature, fileInputId) {
    if(isProUser) {
        if(feature === 'photo' && fileInputId) document.getElementById(fileInputId).click();
        if(feature === 'cloud') alert("🌐 Sincronizando con Appwrite Cloud... (Simulación Completada)");
        if(feature === 'csv') executeCSVExport();
    } else { document.getElementById('paywall-modal').style.display = 'flex'; }
}

function toggleProMode() { 
    isProUser = !isProUser; 
    saveProfileConfig(); updateProUI(); 
    alert(isProUser ? "✅ ¡Modo PRO Desbloqueado!" : "Modo Básico Activado."); 
}

function updateProUI() { 
    const b = document.getElementById('pro-status-badge'); const proBadges = document.querySelectorAll('.pro-badge');
    if(isProUser) { 
        b.innerText = "🌟 PLAN PRO"; b.style.background = "var(--accent-gold)"; b.style.color = "#000"; 
        proBadges.forEach(el => el.style.display = 'none'); 
    } else { 
        b.innerText = "Plan Básico"; b.style.background = "var(--border)"; b.style.color = "var(--text)"; 
        proBadges.forEach(el => el.style.display = 'inline-block'); 
    } 
}

function generateGestorLink() { 
    const link = `https://brightfiscal.io/gestor/${currentUser.$id.substring(0,8)}`;
    const btn = document.getElementById('btn-gestor');
    if(navigator.clipboard) { 
        navigator.clipboard.writeText(link).then(() => { 
            btn.innerText = "✅ ¡Enlace Copiado al Portapapeles!"; 
            setTimeout(()=> btn.innerText = "🔗 Copiar Link para mi Gestor", 3000); 
        }); 
    } else { alert(`Copia este enlace manualmente:\n\n${link}`); }
}

function setAccent(color, el) { 
    accentColor = color; document.documentElement.style.setProperty('--accent', color); 
    if(el){ 
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active')); 
        el.classList.add('active'); saveProfileConfig(); 
    } 
}

function saveProfileConfig() { 
    const t = document.getElementById('theme-sel').value; 
    db.transaction("meta", "readwrite").objectStore("meta").put({ id: "profile", nif: document.getElementById('p-id').value, theme: t, isPro: isProUser, accent: accentColor }); 
    document.body.className = t === 'light' ? 'theme-light' : ''; 
}

function sendFeedback() { 
    const t = document.getElementById('feedback-text').value; if(!t) return; 
    window.location.href = `mailto:anna@tudominio.com?subject=Sugerencia BRIGHT Fiscal&body=${encodeURIComponent(t)}`; 
    document.getElementById('feedback-text').value = ''; 
}

function nav(id) { 
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active')); 
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active')); 
    document.getElementById('sect-' + id).classList.add('active'); 
    event.target.closest('.nav-btn').classList.add('active'); 
}
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// === CALENDARIO MENSUAL E INTERACTIVO ===
const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function changeMonth(delta) {
    currentMonth += delta;
    if(currentMonth > 11) { currentMonth = 0; currentYear++; }
    if(currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCal();
}

function renderCal() {
    document.getElementById('cal-month-title').innerText = `${monthNames[currentMonth]} ${currentYear}`;
    const c = document.getElementById('cal-render'); c.innerHTML = '';
    let html = `<div class="days-header"><span>LU</span><span>MA</span><span>MI</span><span>JU</span><span>VI</span><span>SA</span><span>DO</span></div><div class="days-grid">`;
    const offset = (new Date(currentYear, currentMonth, 1).getDay() || 7) - 1;
    for(let i=0; i<offset; i++) html += `<div class="day"></div>`;
    
    const today = new Date();
    for(let d=1; d<=new Date(currentYear, currentMonth + 1, 0).getDate(); d++) {
        const id = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const e = entries[id]; 
        let isToday = (today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === d) ? 'today' : '';
        
        let inds = '<div class="indicator-container">'; 
        if(e) { 
            if(e.photo) inds += `<span style="font-size:10px">${e.photo.startsWith('data:application/pdf') ? '📄' : '📸'}</span>`; 
            if(e.notes && e.notes !== "Onboarding Automático (Catch-up)") inds += `<span style="font-size:10px">📝</span>`; 
            if(e.gps && e.gps !== "Registro Múltiple" && e.gps !== "Catch-up") inds += `<span style="font-size:10px">📍</span>`; 
        }
        inds += '</div>';
        html += `<div class="day ${e ? e.loc : ''} ${isToday}" onclick="openDay('${id}')">${d}${inds}</div>`;
    } 
    c.innerHTML = html + `</div>`;
}

// === GPS Y ARCHIVOS ===
function requestLocation() {
    const btn = document.getElementById('btn-gps'), val = document.getElementById('f-gps-val');
    btn.innerText = "⏳ Buscando satélites..."; btn.style.color = "var(--accent)";
    navigator.geolocation.getCurrentPosition(pos => { 
        val.value = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`; 
        btn.innerText = `✅ GPS Sellado`; btn.classList.add('active'); 
    }, err => { 
        btn.innerText = "❌ GPS Denegado en Ajustes."; btn.classList.remove('active'); alert("Debes permitir el acceso a la ubicación."); 
    }, { enableHighAccuracy: true, timeout: 8000 });
}

function processFile(input, previewId) {
    if(input.files && input.files[0]) {
        const file = input.files[0]; const preview = document.getElementById(previewId);
        if (file.type === "application/pdf") {
            if(file.size > 5000000) return alert("El PDF es demasiado grande. Sube uno de menos de 5MB.");
            const r = new FileReader(); r.onload = e => { currentFileB64 = e.target.result; preview.src = "https://upload.wikimedia.org/wikipedia/commons/8/87/PDF_file_icon.svg"; preview.style.display = 'block'; preview.style.width = '60px'; }; r.readAsDataURL(file);
        } else {
            const r = new FileReader(); r.onload = e => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); const MAX_W = 800; const scale = img.width > MAX_W ? MAX_W / img.width : 1; canvas.width = img.width * scale; canvas.height = img.height * scale; canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); currentFileB64 = canvas.toDataURL('image/jpeg', 0.6); preview.src = currentFileB64; preview.style.display = 'block'; preview.style.width = '100%'; }; img.src = e.target.result; }; r.readAsDataURL(file);
        }
    }
}

// === GESTIÓN DE MODALES ===
function openDay(id) {
    activeId = id; const e = entries[id] || {}; currentFileB64 = e.photo || null;
    document.getElementById('m-date-natural').innerText = new Date(id.replace(/-/g, '/')).toLocaleDateString('es-ES', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    savedTimestamp = e.ts || new Date().toLocaleString();
    
    document.getElementById('f-loc').value = e.loc || 'intl'; 
    document.getElementById('f-country').value = e.country || ''; 
    document.getElementById('f-flight').value = e.flight || ''; 
    document.getElementById('f-notes').value = e.notes || '';
    document.getElementById('f-gps-val').value = e.gps || ''; 
    
    const btnGPS = document.getElementById('btn-gps');
    btnGPS.innerText = e.gps ? "✅ Ubicación GPS Registrada" : "📍 Sellar Ubicación GPS";
    btnGPS.className = e.gps ? "gps-btn active" : "gps-btn";
    
    const preview = document.getElementById('preview-single'); 
    if(currentFileB64) { 
        preview.style.display = 'block'; 
        if(currentFileB64.startsWith('data:application/pdf')) { preview.src = "https://upload.wikimedia.org/wikipedia/commons/8/87/PDF_file_icon.svg"; preview.style.width = '60px'; } 
        else { preview.src = currentFileB64; preview.style.width = '100%'; } 
    } else { preview.style.display = 'none'; }
    
    document.getElementById('btn-delete-single').style.display = e.id ? 'inline-flex' : 'none';
    document.getElementById('modal-single').style.display = 'flex'; 
}

function openBulkModal() {
    currentFileB64 = null; 
    document.getElementById('b-start').value = ''; document.getElementById('b-end').value = ''; 
    document.getElementById('b-loc').value = 'intl'; document.getElementById('b-country').value = ''; 
    document.getElementById('b-flight').value = ''; document.getElementById('b-notes').value = ''; 
    document.getElementById('preview-bulk').style.display = 'none'; 
    document.getElementById('modal-bulk').style.display = 'flex';
}

// === GUARDADO, ANULADO & AUDITORÍA ===
async function genHash(payload) { const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload)); return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join(''); }

async function saveDay() {
    const loc = document.getElementById('f-loc').value, country = document.getElementById('f-country').value, gps = document.getElementById('f-gps-val').value, flight = document.getElementById('f-flight').value, notes = document.getElementById('f-notes').value;
    const payload = `${activeId}|${loc}|${country}|${gps}|${flight}|${notes}|${currentFileB64?'DOC':'NO'}|${savedTimestamp}|${currentUser.$id}`;
    const hash = await genHash(payload);
    const entry = { id: activeId, loc, country, gps, flight, notes, photo: currentFileB64, ts: savedTimestamp, unixTime: Date.now(), hash };
    
    db.transaction("days", "readwrite").objectStore("days").put(entry).onsuccess = () => { entries[activeId] = entry; closeModal('modal-single'); renderCal(); updateAll(); };
}

async function saveBulk() {
    const start = document.getElementById('b-start').value, end = document.getElementById('b-end').value;
    if(!start || !end || start > end) return alert("Rango de fechas inválido.");
    
    const loc = document.getElementById('b-loc').value, country = document.getElementById('b-country').value, flight = document.getElementById('b-flight').value, notes = document.getElementById('b-notes').value;
    const ts = new Date().toLocaleString(); const unix = Date.now();
    let curr = new Date(start + 'T00:00:00'); let endD = new Date(end + 'T00:00:00');
    let store = db.transaction("days", "readwrite").objectStore("days");

    while(curr <= endD) {
        const dateId = `${curr.getFullYear()}-${String(curr.getMonth()+1).padStart(2,'0')}-${String(curr.getDate()).padStart(2,'0')}`;
        const payload = `${dateId}|${loc}|${country}|BULK|${flight}|${notes}|${currentFileB64?'DOC':'NO'}|${ts}|${currentUser.$id}`;
        const hash = await genHash(payload);
        const entry = { id: dateId, loc, country, gps: "Registro Múltiple", flight, notes, photo: currentFileB64, ts, unixTime: unix, hash };
        store.put(entry); entries[dateId] = entry;
        curr.setDate(curr.getDate() + 1);
    }
    closeModal('modal-bulk'); renderCal(); updateAll();
}

function deleteDay() {
    if(confirm("¿Estás seguro de que quieres anular y eliminar esta evidencia? El sello Hash se destruirá irreversiblemente.")) {
        delete entries[activeId];
        db.transaction("days", "readwrite").objectStore("days").delete(activeId).onsuccess = () => { closeModal('modal-single'); renderCal(); updateAll(); };
    }
}

function updateAll() {
    const esDays = Object.values(entries).filter(e => e.loc === 'es').length;
    const intlDays = Object.values(entries).filter(e => e.loc === 'intl').length;
    document.getElementById('st-es').innerText = esDays; 
    document.getElementById('st-intl').innerText = intlDays;
    
    // Semáforo
    document.getElementById('semaforo-count').innerHTML = `${esDays} <span style="font-size:14px; font-weight:normal; color:var(--text-dim)">/ 183 DÍAS</span>`;
    const bar = document.getElementById('semaforo-bar'), txt = document.getElementById('semaforo-text');
    let p = (esDays / 183) * 100; if(p > 100) p = 100; bar.style.width = p + '%';
    if(esDays < 90) { bar.style.background = "var(--safe)"; txt.innerText = "Estado fiscal seguro. Sin riesgo de residencia en España."; txt.style.color = "var(--safe)"; } 
    else if (esDays < 160) { bar.style.background = "var(--warning)"; txt.innerText = "Precaución: Te acercas a la mitad del límite legal."; txt.style.color = "var(--warning)"; } 
    else if (esDays <= 183) { bar.style.background = "var(--risk)"; txt.innerText = `⚠️ RIESGO ALTO: Te quedan solo ${183 - esDays} días.`; txt.style.color = "var(--risk)"; } 
    else { bar.style.background = "#991b1b"; txt.innerText = "🚨 LÍMITE SUPERADO. Eres considerado residente fiscal en España."; txt.style.color = "#991b1b"; }
    
    // Tabla de Auditoría e Indicadores
    let imgs = 0, pdfs = 0, gpss = 0, notes = 0;
    const tbody = document.getElementById('audit-body'); tbody.innerHTML = '';
    
    Object.values(entries).sort((a,b) => (b.unixTime || 0) - (a.unixTime || 0) || b.id.localeCompare(a.id)).forEach(e => {
        if(e.gps && e.gps !== "Registro Múltiple" && e.gps !== "Catch-up") gpss++;
        if(e.notes && e.notes !== "Onboarding Automático (Catch-up)") notes++;
        let isPDF = false; 
        if(e.photo) { if(e.photo.startsWith('data:application/pdf')) { pdfs++; isPDF = true; } else { imgs++; } }

        const g = (e.gps && e.gps !== "Registro Múltiple" && e.gps !== "Catch-up") ? `<span class="badge active">GPS</span>` : `<span class="badge">No GPS</span>`; 
        const f = e.flight ? `<span class="badge active">✈️ Vuelo</span>` : `<span class="badge">No Vuelo</span>`; 
        const pf = e.photo ? `<span class="badge active">${isPDF ? '📄 PDF' : '📸 Foto'}</span>` : `<span class="badge">Sin Archivo</span>`;
        
        const safeCountry = e.country ? e.country.replace(/</g, "&lt;") : ''; const safeTs = e.ts ? e.ts.replace(/</g, "&lt;") : '';
        tbody.innerHTML += `<tr><td style="font-weight:bold;">${e.id}</td><td style="font-size:11px; color:var(--text-dim);">${safeTs}</td><td>${safeCountry}</td><td><div style="display:flex; gap:5px; flex-wrap:wrap;">${g}${f}${pf}</div></td><td class="hash-mono">${e.hash.substring(0,18)}...</td></tr>`;
    });

    document.getElementById('leg-img').innerText = `📸 Fotos: ${imgs}`; 
    document.getElementById('leg-pdf').innerText = `📄 PDFs: ${pdfs}`; 
    document.getElementById('leg-gps').innerText = `📍 GPS: ${gpss}`; 
    document.getElementById('leg-notes').innerText = `📝 Notas: ${notes}`;
}

// === EXPORTACIONES ===
function exportPDF() {
    const { jsPDF } = window.jspdf; const doc = new jsPDF('landscape'); 
    doc.setFontSize(20); doc.text("REPORTE PERICIAL BRIGHT FISCAL", 15, 20); doc.setFontSize(10); doc.text(`TITULAR: ${currentUser.name.toUpperCase()} | NIF: ${document.getElementById('p-id').value} | EMISIÓN: ${new Date().toLocaleString()}`, 15, 28); doc.line(15, 33, 280, 33);
    let y = 43; doc.setFontSize(8); doc.text("FECHA", 15, y); doc.text("PAÍS", 55, y); doc.text("TIMESTAMP", 95, y); doc.text("GPS", 135, y); doc.text("VUELO", 175, y); doc.text("EVIDENCIA", 195, y); doc.text("FIRMA HASH", 215, y); y += 4; doc.line(15, y, 280, y); y += 8;
    Object.values(entries).sort((a,b) => a.id.localeCompare(b.id)).forEach(e => {
        if(y > 190) { doc.addPage(); y = 20; } doc.text(e.id, 15, y); doc.text(e.country||"-", 55, y); doc.text(e.ts.substring(0,20), 95, y); doc.text(e.gps ? e.gps.substring(0,25) : "-", 135, y); doc.text(e.flight || "-", 175, y);
        const docType = e.photo ? (e.photo.startsWith('data:application/pdf') ? "SI (PDF)" : "SI (IMG)") : "NO"; doc.text(docType, 195, y); doc.setTextColor(100,100,100); doc.text(e.hash.substring(0,35), 215, y); doc.setTextColor(0,0,0); y += 8;
    }); doc.save(`Pericial_BRIGHT_${currentYear}.pdf`);
}

function executeCSVExport() {
    let csv = "Fecha,Hora,Pais,Estado,GPS,Vuelo,Doc,Firma_Hash\n";
    Object.values(entries).sort((a,b) => a.id.localeCompare(b.id)).forEach(e => { 
        const safeCountry = e.country ? e.country.replace(/"/g, '""') : ''; const safeGps = e.gps ? e.gps.replace(/"/g, '""') : ''; const safeFlight = e.flight ? e.flight.replace(/"/g, '""') : '';
        csv += `${e.id},${e.ts},"${safeCountry}",${e.loc},"${safeGps}","${safeFlight}",${e.photo?'SI':'NO'},${e.hash}\n`; 
    });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `Export_BRIGHT_${currentYear}.csv`; a.click();
}
