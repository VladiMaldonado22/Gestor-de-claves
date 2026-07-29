const BD_NOMBRE = 'CajaFuerteBD';
const BD_VERSION = 1;
let db, intentosFallidos = 0, tiempoBloqueoActivo = false, nivelBloqueo = 1, idCredencialAEliminar = null;

const pantallaRegistro = document.getElementById('pantalla-registro');
const pantallaPrincipal = document.getElementById('pantalla-principal');
const pantallaLogin = document.getElementById('pantalla-login');
const modalCuenta = document.getElementById('modal-cuenta');
const modalTitulo = document.getElementById('modal-titulo');
const contenedorCampos = document.getElementById('contenedor-campos-dinamicos');
const formCredencial = document.getElementById('formulario-credencial');

document.addEventListener('DOMContentLoaded', () => {
    initBaseDatos(); 
    initModoOscuroClaro();
    initBotonesBorrarPersonalizado();
});

function initBaseDatos() {
    const solicitud = indexedDB.open(BD_NOMBRE, BD_VERSION);
    solicitud.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains('configuracion')) db.createObjectStore('configuracion', { keyPath: 'clave' });
        if (!db.objectStoreNames.contains('credenciales')) db.createObjectStore('credenciales', { keyPath: 'id', autoIncrement: true });
    };
    solicitud.onsuccess = (e) => {
        db = e.target.result;
        configurarFormularioInicial();
        configurarEventosPrincipales();
        verificarUsuarioExistente();
    };
}

function verificarUsuarioExistente() {
    const solicitud = db.transaction(['configuracion'], 'readonly').objectStore('configuracion').get('hash_maestro');
    solicitud.onsuccess = () => {
        if (solicitud.result) {
            pantallaRegistro.style.display = 'none'; pantallaPrincipal.style.display = 'none'; pantallaLogin.style.display = 'block';
            configurarFormularioLogin(solicitud.result.valor);
        } else {
            pantallaRegistro.style.display = 'block'; pantallaLogin.style.display = 'none'; pantallaPrincipal.style.display = 'none';
        }
    };
}

function configurarFormularioInicial() {
    document.getElementById('formulario-inicial').addEventListener('submit', (e) => {
        e.preventDefault();
        const c = document.getElementById('clave-maestra').value;
        if (c !== document.getElementById('confirmar-clave').value) { alert('Las contraseñas no coinciden.'); return; }
        const tx = db.transaction(['configuracion'], 'readwrite');
        tx.objectStore('configuracion').put({ clave: 'hash_maestro', valor: c });
        tx.objectStore('configuracion').put({ clave: 'pista_maestra', valor: document.getElementById('pista-clave').value });
        tx.oncomplete = () => { verificarUsuarioExistente(); };
    });
}

function configurarFormularioLogin(claveCorrecta) {
    const formLogin = document.getElementById('formulario-login');
    formLogin.onsubmit = (e) => {
        e.preventDefault();
        if (tiempoBloqueoActivo) return;
        const input = document.getElementById('clave-login').value;
        if (input === claveCorrecta) {
            intentosFallidos = 0; nivelBloqueo = 1;
            pantallaLogin.style.display = 'none'; pantallaPrincipal.style.display = 'block';
            cargarContrasenasOoffline();
        } else {
            intentosFallidos++;
            let max = nivelBloqueo === 1 ? 5 : 3;
            alert(`Incorrecta. Intento ${intentosFallidos} de ${max}.`);
            db.transaction(['configuracion'], 'readonly').objectStore('configuracion').get('pista_maestra').onsuccess = (ev) => {
                if (ev.target.result && ev.target.result.valor) {
                    document.getElementById('texto-pista-guardada').innerText = ev.target.result.valor;
                    document.getElementById('contenedor-pista').style.display = 'block';
                }
            };
            if (intentosFallidos >= max) {
                tiempoBloqueoActivo = true; document.getElementById('btn-entrar').disabled = true;
                document.getElementById('aviso-bloqueo').style.display = 'block'; document.getElementById('btn-reestablecer').style.display = 'block';
                let t = nivelBloqueo === 1 ? 30 : 300;
                document.getElementById('segundos-bloqueo').innerText = t;
                const s = setInterval(() => {
                    t--; document.getElementById('segundos-bloqueo').innerText = t;
                    if (t <= 0) { clearInterval(s); tiempoBloqueoActivo = false; document.getElementById('btn-entrar').disabled = false; document.getElementById('aviso-bloqueo').style.display = 'none'; intentosFallidos = 0; nivelBloqueo = 2; }
                }, 1000);
            }
        }
    };
    document.getElementById('btn-reestablecer').onclick = () => { if (confirm("⚠️ ¿Borrar todo?")) { indexedDB.deleteDatabase(BD_NOMBRE); location.reload(); } };
}

function configurarEventosPrincipales() {
    document.getElementById('btn-abrir-modal').onclick = () => { modalTitulo.innerText = "Añadir Nueva Cuenta"; document.getElementById('cuenta-id-edicion').value = ""; formCredencial.reset(); contenedorCampos.innerHTML = ''; modalCuenta.style.display = 'flex'; };
    document.getElementById('btn-cerrar-modal').onclick = () => modalCuenta.style.display = 'none';
    document.getElementById('btn-agregar-campo').onclick = () => {
        const f = document.createElement('div'); f.className = 'bloque-campo-dinamico';
        f.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;"><input type="text" placeholder="PIN/Dato" required class="input-etiqueta" style="width:75%; padding:5px;"><button type="button" onclick="this.parentElement.parentElement.remove()" style="margin:0; width:auto; padding:0 5px;">❌</button></div><input type="text" placeholder="Valor" required class="input-valor">`;
        contenedorCampos.appendChild(f);
    };
    formCredencial.onsubmit = (e) => {
        e.preventDefault();
        const id = document.getElementById('cuenta-id-edicion').value;
        let ex = [];
        document.querySelectorAll('.bloque-campo-dinamico').forEach(b => { ex.push({ etiqueta: b.querySelector('.input-etiqueta').value, valor: b.querySelector('.input-valor').value }); });
        const data = { sitio: document.getElementById('cuenta-titulo').value, usuario: document.getElementById('cuenta-usuario-base').value, clave: document.getElementById('cuenta-clave-base').value, extras: ex, fecha: new Date().toLocaleDateString() };
        const tx = db.transaction(['credenciales'], 'readwrite');
        if (id) { data.id = Number(id); tx.objectStore('credenciales').put(data); } else { tx.objectStore('credenciales').add(data); }
        tx.oncomplete = () => { modalCuenta.style.display = 'none'; formCredencial.reset(); contenedorCampos.innerHTML = ''; alert('¡Guardado!'); cargarContrasenasOoffline(); };
    };
    document.getElementById('buscador-claves').oninput = (e) => {
        const val = e.target.value.toLowerCase();
        document.querySelectorAll('.tarjeta-cuenta').forEach(t => { t.style.display = t.querySelector('h4').innerText.toLowerCase().includes(val) ? 'block' : 'none'; });
    };
}

function cargarContrasenasOoffline() {
    const lista = document.getElementById('lista-credenciales'); lista.innerHTML = '';
    db.transaction(['credenciales'], 'readonly').objectStore('credenciales').openCursor().onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
            const data = c.value; const t = document.createElement('div'); t.className = 'tarjeta-cuenta';
            let exHtml = '';
            data.extras.forEach(ex => { exHtml += `<p style="margin-top:4px;"><strong>${ex.etiqueta}:</strong> ${ex.valor}</p>`; });
            t.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--borde-inputs); padding-bottom:8px; margin-bottom:10px;"><h4>🌐 ${data.sitio}</h4><div style="display:flex; gap:8px;"><button class="btn-secundario" style="width:35px; height:35px; padding:0; margin:0;" onclick="abrirEditorCuenta(${data.id})">✏️</button><button class="btn-cancelar" style="width:35px; height:35px; padding:0; margin:0; background-color:#c0392b;" onclick="eliminarCuentaCredencial(${data.id})">🗑️</button></div></div><div class="detalles-cuenta"><p style="margin-bottom:6px;"><strong>Usuario:</strong> ${data.usuario}</p><p style="margin-bottom:6px;"><strong>Contraseña:</strong> ${data.clave}</p>${exHtml}</div>`;
            lista.appendChild(t); c.continue();
        }
    };
}

function abrirEditorCuenta(id) {
    db.transaction(['credenciales'], 'readonly').objectStore('credenciales').get(id).onsuccess = (e) => {
        const d = e.target.result; modalTitulo.innerText = "Editar Cuenta";
        document.getElementById('cuenta-id-edicion').value = d.id; document.getElementById('cuenta-titulo').value = d.sitio;
        document.getElementById('cuenta-usuario-base').value = d.usuario; document.getElementById('cuenta-clave-base').value = d.clave;
        contenedorCampos.innerHTML = '';
        d.extras.forEach(ex => {
            const f = document.createElement('div'); f.className = 'bloque-campo-dinamico';
            f.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;"><input type="text" value="${ex.etiqueta}" required class="input-etiqueta" style="width:75%; padding:5px;"><button type="button" onclick="this.parentElement.parentElement.remove()" style="margin:0; width:auto; padding:0 5px;">❌</button></div><input type="text" value="${ex.valor}" required class="input-valor">`;
            contenedorCampos.appendChild(f);
        });
        modalCuenta.style.display = 'flex';
    };
}

function eliminarCuentaCredencial(id) { idCredencialAEliminar = id; const m = document.getElementById('modal-confirmar-borrar'); if (m) m.style.display = 'flex'; }

function initBotonesBorrarPersonalizado() {
    document.getElementById('btn-cancelar-borrar').onclick = () => { document.getElementById('modal-confirmar-borrar').style.display = 'none'; idCredencialAEliminar = null; };
    document.getElementById('btn-aceptar-borrar').onclick = () => {
        if (idCredencialAEliminar !== null) {
            const tx = db.transaction(['credenciales'], 'readwrite');
            tx.objectStore('credenciales').delete(idCredencialAEliminar);
            tx.oncomplete = () => { document.getElementById('modal-confirmar-borrar').style.display = 'none'; idCredencialAEliminar = null; cargarContrasenasOoffline(); };
        }
    };
}

function initModoOscuroClaro() {
    const b = document.getElementById('btn-tema');
    if (b) {
        if (localStorage.getItem('tema') === 'claro') document.body.classList.add('modo-claro');
        b.onclick = () => { document.body.classList.toggle('modo-claro'); localStorage.setItem('tema', document.body.classList.contains('modo-claro') ? 'claro' : 'oscuro'); };
    }
}
