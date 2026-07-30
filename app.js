const BD_NOMBRE = 'CajaFuerteBD';
const BD_VERSION = 1;
let db, intentosFallidos = 0, tiempoBloqueoActivo = false, nivelBloqueo = 1, idCredencialAEliminar = null;

const pantallaRegistro = document.getElementById('pantalla-registro');
const pantallaPrincipal = document.getElementById('pantalla-principal');
const pantallaLogin = document.getElementById('pantalla-login');
const modalCuenta = document.getElementById('modal-cuenta');
const modalTitulo = document.getElementById('modal-titulo');
const formCredencial = document.getElementById('formulario-credencial');

document.addEventListener('DOMContentLoaded', () => {
    initBaseDatos(); 
    initModoOscuroClaro();
    initBotonesBorrarPersonalizado();
    initOjoPasswordLogin();
    initOjoPasswordCredencial();
    initPestanasConfiguracion();   
    initControlesGenerador();         
    ejecutarGeneradorCompleto(); 
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
    document.getElementById('btn-abrir-modal').onclick = () => { 
        modalTitulo.innerText = "Añadir Nueva Cuenta"; document.getElementById('cuenta-id-edicion').value = ""; formCredencial.reset(); 
        document.getElementById('cuenta-clave-base').type = 'password'; document.getElementById('btn-ojo-credencial').innerText = '👁️';
        modalCuenta.style.display = 'flex'; 
    };
    document.getElementById('btn-cerrar-modal').onclick = () => modalCuenta.style.display = 'none';
    
    document.getElementById('btn-abrir-config').onclick = () => { document.getElementById('modal-configuraciones').style.display = 'flex'; };
    document.getElementById('btn-cerrar-config').onclick = () => { document.getElementById('modal-configuraciones').style.display = 'none'; };

    formCredencial.onsubmit = (e) => {
        e.preventDefault();
        const id = document.getElementById('cuenta-id-edicion').value;
        const data = { sitio: document.getElementById('cuenta-titulo').value, usuario: document.getElementById('cuenta-usuario-base').value, clave: document.getElementById('cuenta-clave-base').value, fecha: new Date().toLocaleDateString() };
        const tx = db.transaction(['credenciales'], 'readwrite');
        if (id) { data.id = Number(id); tx.objectStore('credenciales').put(data); } else { tx.objectStore('credenciales').add(data); }
        tx.oncomplete = () => { modalCuenta.style.display = 'none'; formCredencial.reset(); alert('¡Guardado!'); cargarContrasenasOoffline(); };
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

            // Tarjeta ultra limpia: Mostramos solo el nombre del sitio sin ningún ícono ni emoji
            t.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--borde-inputs); padding-bottom:8px; margin-bottom:10px;">
                    <h4 style="margin:0; font-size:1.1rem;">${data.sitio}</h4>
                    <div style="display:flex; gap:8px;">
                        <button class="btn-secundario" style="width:35px; height:35px; padding:0; margin:0;" onclick="abrirEditorCuenta(${data.id})">✏️</button>
                        <button class="btn-cancelar" style="width:35px; height:35px; padding:0; margin:0; background-color:#c0392b;" onclick="eliminarCuentaCredencial(${data.id})">🗑️</button>
                    </div>
                </div>
                <div class="detalles-cuenta">
                    <p style="margin-bottom:6px;"><strong>Usuario:</strong> ${data.usuario}</p>
                    <p style="margin-bottom:6px;"><strong>Contraseña:</strong> ${data.clave}</p>
                </div>`;
            lista.appendChild(t); c.continue();
        }
    };
}

function abrirEditorCuenta(id) {
    db.transaction(['credenciales'], 'readonly').objectStore('credenciales').get(id).onsuccess = (e) => {
        const d = e.target.result; modalTitulo.innerText = "Editar Cuenta";
        document.getElementById('cuenta-id-edicion').value = d.id; document.getElementById('cuenta-titulo').value = d.sitio;
        document.getElementById('cuenta-usuario-base').value = d.usuario; document.getElementById('cuenta-clave-base').value = d.clave;
        document.getElementById('cuenta-clave-base').type = 'password'; document.getElementById('btn-ojo-credencial').innerText = '👁️';
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

function initOjoPasswordLogin() {
    const btnOjo = document.getElementById('btn-ojo-login'); const inputClave = document.getElementById('clave-login');
    if (btnOjo && inputClave) { btnOjo.onclick = () => { if (inputClave.type === 'password') { inputClave.type = 'text'; btnOjo.innerText = '🙈'; } else { inputClave.type = 'password'; btnOjo.innerText = '👁️'; } }; }
}

function initOjoPasswordCredencial() {
    const btnOjoCred = document.getElementById('btn-ojo-credencial'); const inputClaveCred = document.getElementById('cuenta-clave-base');
    if (btnOjoCred && inputClaveCred) { btnOjoCred.onclick = () => { if (inputClaveCred.type === 'password') { inputClaveCred.type = 'text'; btnOjoCred.innerText = '🙈'; } else { inputClaveCred.type = 'password'; btnOjoCred.innerText = '👁️'; } }; }
}

// ========================================================
// LOGICA DE PESTAÑAS (TABS) DEL MENÚ DE CONFIGURACIONES
// ========================================================
function initPestanasConfiguracion() {
    const botonesPestanas = document.querySelectorAll('.tab-btn');
    const contenidosPestanas = document.querySelectorAll('.tab-contenido');

    botonesPestanas.forEach(boton => {
        boton.onclick = () => {
            // Quitamos la clase activo de todos los botones y contenidos
            botonesPestanas.forEach(b => b.classList.remove('activo'));
            contenidosPestanas.forEach(c => c.classList.remove('activo'));

            // Activamos la pestaña seleccionada
            boton.classList.add('activo');
            const tabId = boton.getAttribute('data-tab');
            const contenidoActivo = document.getElementById(tabId);
            if (contenidoActivo) contenidoActivo.classList.add('activo');
        };
    });
}

// CONTROL VISUAL DE LA BARRA DE LONGITUD DEL GENERADOR
function initControlesGenerador() {
    const rangeLongitud = document.getElementById('range-longitud');
    const txtLongitudVal = document.getElementById('longitud-val');
    const btnRegen = document.getElementById('btn-regen-pass');

    if (rangeLongitud && txtLongitudVal) {
        // Actualiza el número de caracteres mientras deslizas el dedo
        rangeLongitud.oninput = (e) => {
            txtLongitudVal.innerText = e.target.value;
            ejecutarGeneradorCompleto(); // Regenera automáticamente al cambiar el tamaño
        };
    }

    if (btnRegen) {
        btnRegen.onclick = () => ejecutarGeneradorCompleto();
    }
}

function ejecutarGeneradorCompleto() {
    const longitud = parseInt(document.getElementById('range-longitud').value);
    const chkMayus = document.getElementById('chk-mayus').checked;
    const chkMinus = document.getElementById('chk-minus').checked;
    const chkNum = document.getElementById('chk-num').checked;
    const chkSim = document.getElementById('chk-sim').checked;

    const mayus = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const minus = "abcdefghijklmnopqrstuvwxyz";
    const nums = "0123456789";
    const sims = "!@#$%^&*()_+~`|}{[]:;?><,./-=";

    let caracteresDisponibles = "";
    if (chkMayus) caracteresDisponibles += mayus;
    if (chkMinus) caracteresDisponibles += minus;
    if (chkNum) caracteresDisponibles += nums;
    if (chkSim) caracteresDisponibles += sims;

    const inputResultado = document.getElementById('pass-generada');
    if (!inputResultado) return;

    // Si el usuario desmarcó todas las casillas, no generamos nada
    if (caracteresDisponibles === "") {
        inputResultado.value = "Selecciona opciones";
        actualizarBarraFuerza(0);
        return;
    }

    // Algoritmo matemático aleatorio
    let passwordFinal = "";
    for (let i = 0; i < longitud; i++) {
        const indiceAleatorio = Math.floor(Math.random() * caracteresDisponibles.length);
        passwordFinal += caracteresDisponibles.charAt(indiceAleatorio);
    }

    inputResultado.value = passwordFinal;

    // Calculamos los tipos seleccionados para medir la fuerza
    let tiposActivos = (chkMayus ? 1 : 0) + (chkMinus ? 1 : 0) + (chkNum ? 1 : 0) + (chkSim ? 1 : 0);
    medirFuerzaClave(longitud, tiposActivos);
}

// NUEVO ALGORITMO: Mide la seguridad de forma estricta según la longitud y los tipos de caracteres
function medirFuerzaClave(longitud, tipos) {
    let nivel = 1; // 1 = Débil/Inestable, 2 = Aceptable, 3 = Buena, 4 = Excelente

    // Escala real de seguridad por longitud y combinación
    if (longitud < 8) {
        nivel = 1; // Menos de 8 caracteres siempre es inestable/débil
    } else if (longitud >= 8 && longitud <= 11) {
        nivel = 2; // De 8 a 11 caracteres es aceptable
    } else if (longitud >= 12 && longitud <= 15) {
        nivel = tipos >= 2 ? 3 : 2; // De 12 a 15 es buena (si combina al menos 2 tipos)
    } else if (longitud >= 16) {
        nivel = tipos >= 3 ? 4 : 3; // Más de 16 caracteres es excelente (si combina al menos 3 tipos)
    }

    actualizarBarraFuerza(nivel);
}

// ACTUALIZA LOS COLORES Y TEXTOS DEL SEMÁFORO DINÁMICO EN LA PANTALLA
function actualizarBarraFuerza(nivel) {
    const indicador = document.getElementById('fuerza-indicador');
    const texto = document.getElementById('fuerza-texto');
    if (!indicador || !texto) return;

    if (nivel === 0) {
        indicador.style.width = "0%";
        texto.innerText = "Seguridad: Vacía";
    } else if (nivel === 1) {
        indicador.style.width = "25%"; indicador.style.background = "#e74c3c"; // Rojo
        texto.innerText = "Seguridad: Débil 🔴";
    } else if (nivel === 2) {
        indicador.style.width = "50%"; indicador.style.background = "#e67e22"; // Naranja
        texto.innerText = "Seguridad: Aceptable 🟠";
    } else if (nivel === 3) {
        indicador.style.width = "75%"; indicador.style.background = "#f1c40f"; // Amarillo
        texto.innerText = "Seguridad: Buena 🟡";
    } else if (nivel === 4) {
        indicador.style.width = "100%"; indicador.style.background = "#2ecc71"; // Verde
        texto.innerText = "Seguridad: Excelente 🟢";
    }
}



// Vinculamos todo al encendido de la app
// Busca el DOMContentLoaded de tu app.js y agrégale estas líneas adentro:
document.addEventListener('DOMContentLoaded', () => {
    // ... tus otras funciones init ...
    initPestanasConfiguracion();
    initControlesGenerador();
    ejecutarGeneradorCompleto(); // Genera una clave automática al abrir la ventana
});

// ========================================================
// FUNCIÓN DE COPIA PARA EL GENERADOR DE CONTRASEÑAS
// ========================================================
const btnCopiarGen = document.getElementById('btn-copiar-generada');
if (btnCopiarGen) {
    btnCopiarGen.onclick = () => {
        const inputPass = document.getElementById('pass-generada');
        if (inputPass && inputPass.value !== "Selecciona opciones") {
            // Copia el texto directo al portapapeles del celular o PC
            navigator.clipboard.writeText(inputPass.value).then(() => {
                alert("¡Contraseña generada copiada al portapapeles! 📋");
            });
        }
    };
}

// ========================================================
// SISTEMAS DE EXPORTACIÓN Y COPIAS DE RESPALDO (FUNCIÓN 2)
// ========================================================

// 1. Exportar la Base de Datos Completa (.json) para restaurar en otro teléfono
const btnExportarBD = document.getElementById('btn-exportar-bd');
if (btnExportarBD) {
    btnExportarBD.onclick = () => {
        const transaccion = db.transaction(['credenciales'], 'readonly');
        const almacen = transaccion.objectStore('credenciales');
        const todasLasCuentas = [];

        almacen.openCursor().onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                todasLasCuentas.push(cursor.value);
                cursor.continue();
            } else {
                if (todasLasCuentas.length === 0) { alert("No tienes contraseñas guardadas para exportar."); return; }
                
                // Convertimos el array de objetos a un texto JSON limpio
                const textoJSON = JSON.stringify(todasLasCuentas, null, 2);
                descargarArchivoDesdePWA(textoJSON, "respaldo_caja_fuerte.json", "application/json");
            }
        };
    };
}

// 2. Exportar a Planilla de Excel (.csv)
const btnExportarCSV = document.getElementById('btn-exportar-csv');
if (btnExportarCSV) {
    btnExportarCSV.onclick = () => {
        const transaccion = db.transaction(['credenciales'], 'readonly');
        const almacen = transaccion.objectStore('credenciales');
        let contenidoCSV = "Sitio/App,Usuario,Contrasena,Fecha Guardado\n"; // Encabezados de las columnas

        almacen.openCursor().onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                const cuenta = cursor.value;
                // Reemplazamos comas internas por espacios para no romper el formato CSV
                const sitio = cuenta.sitio.replace(/,/g, " ");
                const usuario = cuenta.usuario.replace(/,/g, " ");
                const clave = cuenta.clave.replace(/,/g, " ");
                
                contenidoCSV += `${sitio},${usuario},${clave},${cuenta.fecha}\n`;
                cursor.continue();
            } else {
                descargarArchivoDesdePWA(contenidoCSV, "claves_caja_fuerte.csv", "text/csv;charset=utf-8;");
            }
        };
    };
}

// 3. Exportar a PDF / Imprimir de forma nativa sin internet
const btnExportarPDF = document.getElementById('btn-exportar-pdf');
if (btnExportarPDF) {
    btnExportarPDF.onclick = () => {
        const transaccion = db.transaction(['credenciales'], 'readonly');
        const almacen = transaccion.objectStore('credenciales');
        
        // Creamos una ventana invisible temporal con el diseño prolijo para la hoja A4
        let htmlImpresion = `
            <html>
            <head>
                <title>Reporte de Contraseñas - Mi Caja Fuerte</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 30px; color: #333; }
                    h2 { border-bottom: 2px solid #2ecc71; padding-bottom: 10px; color: #2c3e50; }
                    .tarjeta { border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 8px; page-break-inside: avoid; }
                    .sitio { font-size: 1.2rem; font-weight: bold; margin-bottom: 8px; color: #27ae60; }
                    p { margin: 4px 0; font-size: 1rem; }
                    .footer { margin-top: 40px; font-size: 0.8rem; text-align: center; color: #7f8c8d; border-top: 1px solid #eee; padding-top: 10px; }
                </style>
            </head>
            <body>
                <h2>🔐 Respaldo de Contraseñas Guardadas</h2>
                <p>Generado el: ${new Date().toLocaleDateString()} - Conservar en un lugar seguro.</p>
                <div style="margin-top:20px;">
        `;

        almacen.openCursor().onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                const cuenta = cursor.value;
                htmlImpresion += `
                    <div class="tarjeta">
                        <div class="sitio">🌐 ${cuenta.sitio}</div>
                        <p><strong>Usuario / Correo:</strong> ${cuenta.usuario}</p>
                        <p><strong>Contraseña:</strong> ${cuenta.clave}</p>
                        <p style="font-size:0.8rem; color:#7f8c8d;">Fecha de registro: ${cuenta.fecha}</p>
                    </div>
                `;
                cursor.continue();
            } else {
                htmlImpresion += `
                    </div>
                    <div class="footer">Mi Caja Fuerte Premium Offline - Autor: Vladi Maldonado</div>
                    </body>
                    </html>
                `;

                // Creamos un marco flotante invisible en el navegador para disparar la impresión
                const iframe = document.createElement('iframe');
                iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0';
                iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = 'none';
                document.body.appendChild(iframe);
                
                const doc = iframe.contentWindow.document;
                doc.open(); doc.write(htmlImpresion); doc.close();

                // Esperamos un milisegundo a que cargue el HTML interno y levantamos el menú del celular
                setTimeout(() => {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                    document.body.removeChild(iframe); // Destruimos el marco invisible al terminar
                }, 500);
            }
        };
    };
}

// FUNCIÓN AUXILIAR AUTOMÁTICA PARA AGARRAR EL TEXTO Y DESCARGARLO COMO ARCHIVO EN ANDROID/IOS
function descargarArchivoDesdePWA(contenido, nombreArchivo, tipoMime) {
    const blob = new Blob([contenido], { type: tipoMime });
    const url = URL.createObjectURL(blob);
    const enlaceInvis = document.createElement('a');
    enlaceInvis.href = url;
    enlaceInvis.download = nombreArchivo;
    document.body.appendChild(enlaceInvis);
    enlaceInvis.click(); // Simula el click de descarga del archivo
    document.body.removeChild(enlaceInvis);
    URL.revokeObjectURL(url);
}

// ========================================================
// CAMBIAR CONTRASEÑA MAESTRA VALIDANDO LA ANTERIOR (FUNCIÓN 3)
// ========================================================
const formCambiarMaestra = document.getElementById('form-cambiar-maestra');

if (formCambiarMaestra) {
    formCambiarMaestra.onsubmit = (e) => {
        e.preventDefault(); // Evita que la página web se recargue sola

        const passViejaInput = document.getElementById('change-pass-vieja').value;
        const passNuevaInput = document.getElementById('change-pass-nueva').value;
        const passRepetirInput = document.getElementById('change-pass-repetir').value;

        // Validamos primero que la nueva contraseña tenga una longitud segura
        if (passNuevaInput.length < 6) {
            alert("⚠️ La nueva contraseña debe tener como mínimo 6 caracteres.");
            return;
        }

        // Validamos que el usuario no haya cometido errores al repetir la clave nueva
        if (passNuevaInput !== passRepetirInput) {
            alert("⚠️ Las nuevas contraseñas no coinciden. Por favor, verifícalas.");
            return;
        }

        // Abrimos la base de datos en modo lectura para traer la clave maestra original
        const transaccion = db.transaction(['configuracion'], 'readonly');
        const almacen = transaccion.objectStore('configuracion');
        const solicitudClave = almacen.get('hash_maestro');

        solicitudClave.onsuccess = () => {
            if (solicitudClave.result) {
                // Pasamos a la segunda parte: la comparación física de los datos
                procesarActualizacionClaveFisica(passViejaInput, passNuevaInput, solicitudClave.result.valor);
            } else {
                alert("Error crítico: No se encontró la contraseña original.");
            }
        };
    };
}

function procesarActualizacionClaveFisica(claveViejaEscrita, claveNuevaConfirmada, claveRealGuardada) {
    // Verificamos si conoce la clave actual. Si no coincide, frena el cambio por seguridad
    if (claveViejaEscrita !== claveRealGuardada) {
        alert("❌ La 'Contraseña Actual' es incorrecta. No tienes autorización para cambiar la llave.");
        return;
    }

    // Si pasó todas las pruebas, abrimos la base de datos en modo ESCRITURA
    const transaccionEscritura = db.transaction(['configuracion'], 'readwrite');
    const almacenEscritura = transaccionEscritura.objectStore('configuracion');

    // Sobrescribimos el registro viejo usando la misma clave identificadora 'hash_maestro'
    almacenEscritura.put({ clave: 'hash_maestro', valor: claveNuevaConfirmada });

    transaccionEscritura.oncomplete = () => {
        alert("🎉 ¡Contraseña Maestra actualizada con éxito en el teléfono!");
        
        // Limpiamos los casillas del formulario visual por prolijidad
        formCambiarMaestra.reset();
        
        // Cerramos el menú de configuraciones de forma automática
        document.getElementById('modal-configuraciones').style.display = 'none';
        
        // Forzamos a la app a recargarse para que el usuario tenga que iniciar sesión con su nueva clave
        location.reload();
    };

    transaccionEscritura.onerror = (e) => {
        console.error("Error al actualizar la clave en IndexedDB:", e.target.error);
        alert("Hubo un error físico al intentar guardar la nueva clave.");
    };
}
