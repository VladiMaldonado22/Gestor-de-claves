const BD_NOMBRE = 'CajaFuerteBD';
const BD_VERSION = 1;
let db;

// Variables de control de bloqueo
let intentosFallidos = 0;
let tiempoBloqueoActivo = false;
let nivelBloqueo = 1; // 1 = 30seg, 2 = 5min

// Variables de Interfaz
const pantallaRegistro = document.getElementById('pantalla-registro');
const pantallaPrincipal = document.getElementById('pantalla-principal');
const pantallaLogin = document.getElementById('pantalla-login');
const modalCuenta = document.getElementById('modal-cuenta');
const modalTitulo = document.getElementById('modal-titulo');
const contenedorCampos = document.getElementById('contenedor-campos-dinamicos');
const formCredencial = document.getElementById('formulario-credencial');

document.addEventListener('DOMContentLoaded', () => {
    initBaseDatos(); // Primero levantamos la base de datos de manera ordenada
    initModoOscuroClaro(); // Inicializamos el botón de cambio de tema
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
    const transaccion = db.transaction(['configuracion'], 'readonly');
    const almacen = transaccion.objectStore('configuracion');
    const solicitud = almacen.get('hash_maestro');

    solicitud.onsuccess = () => {
        if (solicitud.result) {
            pantallaRegistro.style.display = 'none';
            pantallaPrincipal.style.display = 'none';
            pantallaLogin.style.display = 'block';
            configurarFormularioLogin(solicitud.result.valor);
        } else {
            pantallaRegistro.style.display = 'block';
            pantallaLogin.style.display = 'none';
            pantallaPrincipal.style.display = 'none';
        }
    };
}

function configurarFormularioInicial() {
    document.getElementById('formulario-inicial').addEventListener('submit', (e) => {
        e.preventDefault();
        const claveInput = document.getElementById('clave-maestra').value;
        const confirmarInput = document.getElementById('confirmar-clave').value;
        const pistaInput = document.getElementById('pista-clave').value;

        if (claveInput !== confirmarInput) { alert('Las contraseñas no coinciden.'); return; }

        const transaccion = db.transaction(['configuracion'], 'readwrite');
        const almacen = transaccion.objectStore('configuracion');
        almacen.put({ clave: 'hash_maestro', valor: claveInput });
        almacen.put({ clave: 'pista_maestra', valor: pistaInput });

        transaccion.oncomplete = () => { verificarUsuarioExistente(); };
    });
}

function configurarFormularioLogin(claveCorrecta) {
    const formLogin = document.getElementById('formulario-login');
    const btnEntrar = document.getElementById('btn-entrar');
    const avisoBloqueo = document.getElementById('aviso-bloqueo');
    const segundosBloqueo = document.getElementById('segundos-bloqueo');
    const btnReestablecer = document.getElementById('btn-reestablecer');

    formLogin.onsubmit = (e) => {
        e.preventDefault();
        if (tiempoBloqueoActivo) return;

        const claveIntroducida = document.getElementById('clave-login').value;

        if (claveIntroducida === claveCorrecta) {
            intentosFallidos = 0;
            nivelBloqueo = 1;
            pantallaLogin.style.display = 'none';
            pantallaPrincipal.style.display = 'block';
            cargarContrasenasOoffline();
        } else {
            intentosFallidos++;
            
            let maxIntentos = nivelBloqueo === 1 ? 5 : 3;
            alert(`Contraseña incorrecta. Intento ${intentosFallidos} de ${maxIntentos}.`);
            
            const transaccion = db.transaction(['configuracion'], 'readonly');
            const solicitudPista = transaccion.objectStore('configuracion').get('pista_maestra');
            solicitudPista.onsuccess = () => {
                if (solicitudPista.result && solicitudPista.result.valor) {
                    document.getElementById('texto-pista-guardada').innerText = solicitudPista.result.valor;
                    document.getElementById('contenedor-pista').style.display = 'block';
                }
            };

            if (intentosFallidos >= maxIntentos) {
                tiempoBloqueoActivo = true;
                btnEntrar.disabled = true;
                avisoBloqueo.style.display = 'block';
                btnReestablecer.style.display = 'block';

                let tiempoRestante = nivelBloqueo === 1 ? 30 : 300; 
                segundosBloqueo.innerText = tiempoRestante;

                const intervalo = setInterval(() => {
                    tiempoRestante--;
                    segundosBloqueo.innerText = tiempoRestante;
                    if (tiempoRestante <= 0) {
                        clearInterval(intervalo);
                        tiempoBloqueoActivo = false;
                        btnEntrar.disabled = false;
                        avisoBloqueo.style.display = 'none';
                        intentosFallidos = 0;
                        nivelBloqueo = 2; 
                    }
                }, 1000);
            }
        }
    };

    btnReestablecer.onclick = () => {
        if (confirm("⚠️ ¿Estás seguro? Se BORRARÁN todas tus contraseñas guardadas de forma permanente.")) {
            indexedDB.deleteDatabase(BD_NOMBRE);
            location.reload();
        }
    };
}

function configurarEventosPrincipales() {
    document.getElementById('btn-abrir-modal').addEventListener('click', () => {
        modalTitulo.innerText = "Añadir Nueva Cuenta";
        document.getElementById('cuenta-id-edicion').value = "";
        formCredencial.reset();
        contenedorCampos.innerHTML = '';
        modalCuenta.style.display = 'flex';
    });
    document.getElementById('btn-cerrar-modal').addEventListener('click', () => modalCuenta.style.display = 'none');

    document.getElementById('btn-agregar-campo').addEventListener('click', () => {
        const nuevaFila = document.createElement('div');
        nuevaFila.className = 'bloque-campo-dinamico';
        nuevaFila.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                <input type="text" placeholder="Nombre del dato (Ej: PIN)" required class="input-etiqueta" style="width:75%; padding:5px;">
                <button type="button" class="btn-eliminar-fila" onclick="this.parentElement.parentElement.remove()" style="margin:0; width:auto; padding:0 5px;">❌</button>
            </div>
            <input type="text" placeholder="Valor secreto" required class="input-valor">
        `;
        contenedorCampos.appendChild(nuevaFila);
    });

    formCredencial.addEventListener('submit', (e) => {
        e.preventDefault();
        const idEdicion = document.getElementById('cuenta-id-edicion').value;
        const titulo = document.getElementById('cuenta-titulo').value;
        const usuarioBase = document.getElementById('cuenta-usuario-base').value;
        const claveBase = document.getElementById('cuenta-clave-base').value;

        let camposExtras = [];
        document.querySelectorAll('.bloque-campo-dinamico').forEach(bloque => {
            const inputEtiq = block = bloque.querySelector('.input-etiqueta');
            const inputVal = bloque.querySelector('.input-valor');
            if (inputEtiq && inputVal) {
                camposExtras.push({ etiqueta: inputEtiq.value, valor: inputVal.value });
            }
        });

        const transaccion = db.transaction(['credenciales'], 'readwrite');
        const almacen = transaccion.objectStore('credenciales');

        const datosCuenta = {
            sitio: titulo,
            usuario: usuarioBase,
            clave: claveBase,
            extras: camposExtras,
            fecha: new Date().toLocaleDateString()
        };

        if (idEdicion) {
            datosCuenta.id = Number(idEdicion);
            almacen.put(datosCuenta);
        } else {
            almacen.add(datosCuenta);
        }

        transaccion.oncomplete = () => {
            modalCuenta.style.display = 'none';
            formCredencial.reset();
            contenedorCampos.innerHTML = '';
            alert('¡Cuenta guardada con éxito!');
            cargarContrasenasOoffline();
        };
    });

    document.getElementById('buscador-claves').addEventListener('input', (e) => {
        const texto = e.target.value.toLowerCase();
        document.querySelectorAll('.tarjeta-cuenta').forEach(tarjeta => {
            const titulo = tarjeta.querySelector('h4').innerText.toLowerCase();
            tarjeta.style.display = titulo.includes(texto) ? 'block' : 'none';
        });
    });
}

// CARGA DE TARJETAS: Incluye botón de Editar y de Eliminar
function cargarContrasenasOoffline() {
    const lista = document.getElementById('lista-credenciales');
    lista.innerHTML = '';

    const transaccion = db.transaction(['credenciales'], 'readonly');
    transaccion.objectStore('credenciales').openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const cuenta = cursor.value;
            const tarjeta = document.createElement('div');
            tarjeta.className = 'tarjeta-cuenta';

            let extrasHTML = '';
            cuenta.extras.forEach(ext => {
                extrasHTML += `<p><strong>${ext.etiqueta}:</strong> ${ext.valor}</p>`;
            });

            // CORREGIDO: Comillas invertidas añadidas para envolver el diseño de la tarjeta
            tarjeta.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;"> 
                    <h4>🌐 ${cuenta.sitio}</h4> 
                    <div style="display:flex; gap:5px;"> 
                        <button class="btn-secundario" style="width:auto; padding:5px 10px; margin:0;" onclick="abrirEditorCuenta(${cuenta.id})">✏️</button> 
                        <button class="btn-cancelar" style="width:auto; padding:5px 10px; margin:0; background-color:#c0392b;" onclick="eliminarCuentaCredencial(${cuenta.id})">🗑️</button> 
                    </div> 
                </div> 
                <div class="detalles-cuenta" style="margin-top:10px;"> 
                    <p><strong>Usuario:</strong> ${cuenta.usuario}</p> 
                    <p><strong>Contraseña:</strong> ${cuenta.clave}</p> 
                    ${extrasHTML} 
                </div>
            `;
            lista.appendChild(tarjeta);
            cursor.continue();
        }
    };
}

function abrirEditorCuenta(id) {
    const transaccion = db.transaction(['credenciales'], 'readonly');
    transaccion.objectStore('credenciales').get(id).onsuccess = (e) => {
        const cuenta = e.target.result;
        modalTitulo.innerText = "Editar Cuenta";
        document.getElementById('cuenta-id-edicion').value = cuenta.id;
        document.getElementById('cuenta-titulo').value = cuenta.sitio;
        document.getElementById('cuenta-usuario-base').value = cuenta.usuario;
        document.getElementById('cuenta-clave-base').value = cuenta.clave;

        contenedorCampos.innerHTML = '';
        cuenta.extras.forEach(ext => {
            const nuevaFila = document.createElement('div');
            nuevaFila.className = 'bloque-campo-dinamico';
            // CORREGIDO: Comillas invertidas añadidas para envolver los inputs dinámicos en el editor
            nuevaFila.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;"> 
                    <input type="text" value="${ext.etiqueta}" required class="input-etiqueta" style="width:75%; padding:5px;"> 
                    <button type="button" class="btn-eliminar-fila" onclick="this.parentElement.parentElement.remove()" style="margin:0; width:auto; padding:0 5px;">❌</button> 
                </div> 
                <input type="text" value="${ext.valor}" required class="input-valor">
            `;
            contenedorCampos.appendChild(nuevaFila);
        });
        modalCuenta.style.display = 'flex';
    };
}

// ELIMINAR INDIVIDUALMENTE DE INDEXEDDB
function eliminarCuentaCredencial(id) {
    if (confirm("⚠️ ¿Estás seguro de que quieres eliminar esta cuenta? Esta acción no se puede deshacer.")) {
        const transaccion = db.transaction(['credenciales'], 'readwrite');
        const almacen = transaccion.objectStore('credenciales');
        const solicitud = almacen.delete(id);
        
        solicitud.onsuccess = () => {
            alert("Cuenta eliminada con éxito.");
            cargarContrasenasOoffline(); // Redibuja la pantalla sin la tarjeta
        };
    }
}

// INICIALIZACIÓN MODO OSCURO / CLARO LOCAL STORAGE
// INICIALIZACIÓN MODO OSCURO / CLARO LOCAL STORAGE
function initModoOscuroClaro() {
    const btnTema = document.getElementById('btn-tema');
    if (btnTema) {
        const temaGuardado = localStorage.getItem('tema');
        if (temaGuardado === 'claro') {
            document.body.classList.add('modo-claro');
        }
        btnTema.addEventListener('click', () => {
            document.body.classList.toggle('modo-claro');
            if (document.body.classList.contains('modo-claro')) {
                localStorage.setItem('tema', 'claro');
            } else {
                localStorage.setItem('tema', 'oscuro');
            }
        });
    }
}
