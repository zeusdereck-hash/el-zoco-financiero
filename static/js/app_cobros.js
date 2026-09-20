// --- CONTROL DE SESIÓN ---

// 1. Verificar si hay token almacenado al abrir la app
function verificarSesion() {
    const token = localStorage.getItem('auth_token');
    const modalLogin = document.getElementById('modal-login');

    if (!token) {
        if (modalLogin) {
            modalLogin.classList.remove('hidden');
            modalLogin.classList.add('flex');
        }
    } else {
        if (modalLogin) {
            modalLogin.classList.add('hidden');
            modalLogin.classList.remove('flex');
        }
        
        // Cargar nombre y puesto en el encabezado
        const gestorNombre = localStorage.getItem('user_nombre') || 'Cobrador';
        const gestorPuesto = localStorage.getItem('user_puesto') || 'Gestor';
        actualizarEncabezadoUsuario(gestorNombre, gestorPuesto);
    }
}

// 2. Función para procesar el Login
async function iniciarSesion() {
    const usernameInput = document.getElementById('login-username').value;
    const passwordInput = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error');

    if (errorMsg) errorMsg.classList.add('hidden');

    try {
        const response = await fetch('/api/login/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });

        const data = await response.json();

        if (response.ok) {
            // Guardar token y datos del cobrador localmente (para soporte Offline)
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('user_nombre', data.nombre);
            localStorage.setItem('user_puesto', data.puesto);
            
            verificarSesion();
            await descargarDatosServidor();
        } else {
            if (errorMsg) {
                errorMsg.textContent = data.error || "Credenciales incorrectas";
                errorMsg.classList.remove('hidden');
            }
        }
    } catch (e) {
        alert("Error de conexión. Se requiere internet para iniciar sesión la primera vez.");
    }
}

// 3. Función para Cerrar Sesión
function cerrarSesion() {
    if (confirm("¿Deseas cerrar sesión? Se requerirá internet para volver a ingresar.")) {
        localStorage.clear();
        verificarSesion();
    }
}

function actualizarEncabezadoUsuario(nombre, puesto) {
    const elemGestor = document.getElementById('header-nombre-gestor');
    if (elemGestor) {
        elemGestor.innerHTML = `Usuario: <span class="text-indigo-300 font-bold">${nombre} (${puesto})</span>`;
    }
}

// 4. Asegúrate de llamar a verificarSesion() dentro del listener DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    cargarFechaEncabezado();
    actualizarEstadoRed();
    verificarSesion(); // <-- Verifica login al arrancar
    if (localStorage.getItem('auth_token')) {
        if (navigator.onLine) {
            descargarDatosServidor();
        } else {
            renderizarTarjetas();
        }
    }
});
// 1. Inicializar la base de datos IndexedDB con Dexie.js
const db = new Dexie("QuobranzaOfflineDB");

db.version(2).stores({
    prestamos: 'id, cliente_nombre, orden_visita, saldo_pendiente',
    pagos_pendientes: '++id, prestamo, monto, fecha_pago, sincronizado',
    clientes_pendientes: '++id, nombre, telefono, direccion, referencia, sincronizado',
    prestamos_pendientes: '++id, cliente_temp_id, capital_prestado, porcentaje_interes, numero_cuotas, frecuencia, sincronizado'
});

let prestamoSeleccionadoId = null;

// 2. Controladores de estado de red (Online / Offline)
function actualizarEstadoRed() {
    const badge = document.getElementById('badge-estado');
    if (!badge) return;
    
    if (navigator.onLine) {
        badge.className = "px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
        badge.textContent = "ONLINE";
    } else {
        badge.className = "px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30";
        badge.textContent = "OFFLINE";
    }
}

window.addEventListener('online', actualizarEstadoRed);
window.addEventListener('offline', actualizarEstadoRed);

// Función para actualizar el Header con los datos de la Ruta y Gestor
function actualizarEncabezadoRuta(rutaNombre, gestorNombre) {
    const elemRuta = document.getElementById('header-nombre-ruta');
    const elemGestor = document.getElementById('header-nombre-gestor');

    if (elemRuta) {
        elemRuta.innerHTML = `<span class="text-indigo-500">📍</span> ${rutaNombre || 'Ruta Principal'}`;
    }

    if (elemGestor) {
        elemGestor.innerHTML = `Gestor: <span class="text-indigo-300">${gestorNombre || 'Sin gestor'}</span>`;
    }
}

// 3. Descargar datos desde Django e incluir Historial de Cuotas
async function descargarDatosServidor() {
    if (!navigator.onLine) {
        alert("Atención: Necesitas conexión a internet para descargar la ruta del día.");
        return;
    }

    try {
        const response = await fetch('/api/prestamos/');
        if (!response.ok) throw new Error("Error al consultar la API");
        
        const prestamos = await response.json();

        // Mapear préstamos incorporando el historial de pagos
        const prestamosMapeados = prestamos.map(p => {
            const capital = parseFloat(p.capital_prestado || 0);
            const totalPagar = parseFloat(p.monto_total_pagar || capital);
            const saldoCalculado = (p.saldo_pendiente !== undefined && p.saldo_pendiente !== null) 
                ? parseFloat(p.saldo_pendiente) 
                : totalPagar;

            return {
                id: p.id,
                cliente_nombre: p.cliente_nombre || (p.cliente ? p.cliente.nombre : 'Sin Nombre'),
                cliente_telefono: p.cliente_telefono || 'Sin teléfono',
                cliente_direccion: p.cliente_direccion || 'Sin dirección',
                capital_prestado: capital,
                monto_total_pagar: totalPagar,
                saldo_pendiente: saldoCalculado,
                monto_cuota: parseFloat(p.monto_cuota || 0),
                frecuencia: p.frecuencia || 'DIARIO',
                orden_visita: p.orden_visita || 999,
                ruta_nombre: p.ruta_nombre || 'Ruta Principal',
                gestor_nombre: p.gestor_nombre || 'Sin gestor',
                historial: p.historial || [] // <-- Persistir historial de pagos
            };
        });

        if (prestamosMapeados.length > 0) {
            actualizarEncabezadoRuta(prestamosMapeados[0].ruta_nombre, prestamosMapeados[0].gestor_nombre);
        }

        // Limpiar e insertar datos frescos en IndexedDB
        await db.transaction('rw', db.prestamos, async () => {
            await db.prestamos.clear();
            await db.prestamos.bulkPut(prestamosMapeados);
        });

        await renderizarTarjetas();
    } catch (error) {
        console.error("Error al descargar datos:", error);
        alert("Error al conectar con el servidor.");
    }
}

// 4. Renderizar tarjetas de cobro en la pantalla principal
async function renderizarTarjetas() {
    const contenedor = document.getElementById('lista-prestamos');
    if (!contenedor) return;

    const prestamos = await db.prestamos.orderBy('orden_visita').toArray();
    
    if (prestamos.length > 0) {
        actualizarEncabezadoRuta(prestamos[0].ruta_nombre, prestamos[0].gestor_nombre);
    }

    const contador = document.getElementById('contador-deudas');
    if (contador) contador.textContent = `${prestamos.length} préstamos en dispositivo`;
    
    await actualizarContadorPendientes();

    if (prestamos.length === 0) {
        contenedor.innerHTML = `<div class="text-center py-10 text-slate-500">No hay datos locales. Presiona "Cargar Ruta" con señal o el botón "+" para registrar.</div>`;
        return;
    }

    contenedor.innerHTML = prestamos.map(p => {
        const nombreLimpio = p.cliente_nombre.replace(/'/g, "\\'");
        const idFormateado = typeof p.id === 'string' ? `'${p.id}'` : p.id;

        return `
            <div class="bg-slate-800 border border-slate-700/80 rounded-2xl p-4 shadow-md space-y-3">
                <div class="flex justify-between items-start">
                    <div>
                        <span class="text-xs font-bold text-indigo-400 uppercase tracking-wider">#${p.orden_visita} • ${p.frecuencia}</span>
                        <h2 onclick="verDetalleCliente(${idFormateado})" class="text-base font-bold text-white cursor-pointer hover:text-indigo-300 underline decoration-indigo-500/50 underline-offset-4 flex items-center gap-1">
                            ${p.cliente_nombre} 🔍
                        </h2>
                        <p class="text-xs text-slate-400">📍 ${p.cliente_direccion || 'Sin dirección'}</p>
                    </div>
                    <div class="text-right">
                        <span class="text-xs text-slate-400 block">Saldo</span>
                        <span class="text-base font-black text-rose-400">$${parseFloat(p.saldo_pendiente).toFixed(2)}</span>
                    </div>
                </div>
                
                <div class="flex justify-between items-center pt-2 border-t border-slate-700/50">
                    <span class="text-xs text-slate-300">Cuota: <b class="text-white">$${parseFloat(p.monto_cuota).toFixed(2)}</b></span>
                    <button onclick="abrirModalCobro(${idFormateado}, '${nombreLimpio}', ${p.monto_cuota})" class="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-md transition">
                        Cobrar
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// 5. Gestión del Modal de Pago
function abrirModalCobro(id, cliente, cuota) {
    prestamoSeleccionadoId = id;
    document.getElementById('modal-cliente-nombre').textContent = cliente;
    document.getElementById('modal-cuota-sugerida').textContent = `$${parseFloat(cuota).toFixed(2)}`;
    document.getElementById('input-monto-cobro').value = cuota;
    document.getElementById('input-observacion').value = '';
    
    const modal = document.getElementById('modal-cobro');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cerrarModal() {
    const modal = document.getElementById('modal-cobro');
    modal.classList.remove('flex');
    modal.classList.add('hidden');
}

// 6. Guardar cobro localmente en IndexedDB
async function guardarCobroLocal() {
    const monto = parseFloat(document.getElementById('input-monto-cobro').value);
    const observacion = document.getElementById('input-observacion').value;

    if (!monto || monto <= 0) {
        alert("Ingresa un monto válido");
        return;
    }

    const fechaHoy = new Date().toISOString();

    // Registrar en pagos pendientes locales
    await db.pagos_pendientes.add({
        prestamo: prestamoSeleccionadoId,
        monto: monto,
        observacion: observacion,
        fecha_pago: fechaHoy,
        sincronizado: 0
    });

    // Actualizar saldo pendiente e historial en la base de datos local
    const prestamo = await db.prestamos.get(prestamoSeleccionadoId);
    if (prestamo) {
        prestamo.saldo_pendiente = parseFloat(prestamo.saldo_pendiente) - monto;
        
        // Agregar el cobro recién realizado al historial local
        if (!prestamo.historial) prestamo.historial = [];
        prestamo.historial.unshift({
            monto: monto,
            fecha_pago_formateada: 'Ahora (Pendiente de sincronizar)',
            observacion: observacion
        });

        await db.prestamos.put(prestamo);
    }

    cerrarModal();
    await renderizarTarjetas();
    
    if (navigator.onLine) {
        await sincronizarTodo();
    }
}

// 7. Contar elementos guardados pendientes de subir
async function actualizarContadorPendientes() {
    const pagos = await db.pagos_pendientes.count();
    const clientes = await db.clientes_pendientes.count();
    const total = pagos + clientes;

    const countElem = document.getElementById('count-pendientes');
    if (countElem) countElem.textContent = total;

    const btnSinc = document.getElementById('btn-sincronizar');
    if (btnSinc) btnSinc.innerText = `↑ Sincronizar ( ${total} )`;
}

// 8. Sincronización bi-direccional completa
async function sincronizarTodo() {
    if (!navigator.onLine) {
        alert("Necesitas conexión a internet para sincronizar con el servidor.");
        return;
    }

    try {
        // --- FASE 1: Subir Clientes y Préstamos creados offline ---
        const clientesPendientes = await db.clientes_pendientes.toArray();
        const prestamosPendientes = await db.prestamos_pendientes.toArray();

        if (clientesPendientes.length > 0) {
            const paqueteAltas = clientesPendientes.map(c => {
                const p = prestamosPendientes.find(pr => pr.cliente_temp_id === c.id) || {};
                return {
                    temp_id: `TEMP_${c.id}`,
                    nombre: c.nombre,
                    telefono: c.telefono,
                    direccion: c.direccion,
                    capital_prestado: p.capital_prestado || 0,
                    porcentaje_interes: p.porcentaje_interes || 20,
                    numero_cuotas: p.numero_cuotas || 24,
                    frecuencia: p.frecuencia || 'DIARIO'
                };
            });

            const resAltas = await fetch('/api/clientes/sincronizar_altas/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ altas: paqueteAltas })
            });

            if (resAltas.ok) {
                const dataAltas = await resAltas.json();
                
                for (let reg of dataAltas.registros) {
                    const pagosAsociados = await db.pagos_pendientes.where('prestamo').equals(reg.temp_id).toArray();
                    for (let pago of pagosAsociados) {
                        pago.prestamo = reg.real_id;
                        await db.pagos_pendientes.put(pago);
                    }
                }

                await db.clientes_pendientes.clear();
                await db.prestamos_pendientes.clear();
            } else {
                console.error("Error al sincronizar altas de clientes:", await resAltas.text());
            }
        }

        // --- FASE 2: Subir Pagos / Cuotas recolectadas ---
        const pagosPendientes = await db.pagos_pendientes.toArray();
        if (pagosPendientes.length > 0) {
            const paquetePagos = pagosPendientes.map(p => ({
                prestamo: p.prestamo,
                monto: p.monto,
                observacion: p.observacion || '',
                fecha_pago: p.fecha_pago
            }));

            const resPagos = await fetch('/api/pagos/sincronizar_lote/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pagos: paquetePagos })
            });

            if (resPagos.ok) {
                await db.pagos_pendientes.clear();
            } else {
                console.error("Error al sincronizar pagos:", await resPagos.text());
            }
        }

        // --- FASE 3: Re-descargar ruta limpia desde el servidor ---
        await descargarDatosServidor();

    } catch (error) {
        console.error("Error al sincronizar con Django:", error);
        alert("Ocurrió un error durante la sincronización.");
    }
}

// 9. Gestión del Modal de Nuevo Cliente
function abrirModalNuevoCliente() {
    document.getElementById('modal-nuevo-cliente').classList.remove('hidden');
    document.getElementById('modal-nuevo-cliente').classList.add('flex');
}

function cerrarModalNuevoCliente() {
    document.getElementById('modal-nuevo-cliente').classList.remove('flex');
    document.getElementById('modal-nuevo-cliente').classList.add('hidden');
}

async function guardarClienteLocal() {
    const nombre = document.getElementById('nuevo-nombre').value;
    const telefono = document.getElementById('nuevo-telefono').value;
    const direccion = document.getElementById('nueva-direccion').value;
    const monto = parseFloat(document.getElementById('nuevo-monto').value);
    const interes = parseFloat(document.getElementById('nuevo-interes').value);
    const cuotas = parseInt(document.getElementById('nuevas-cuotas').value);
    const frecuencia = document.getElementById('nueva-frecuencia').value;

    if (!nombre || isNaN(monto) || monto <= 0) {
        alert("Nombre y Monto son obligatorios.");
        return;
    }

    const clienteId = await db.clientes_pendientes.add({
        nombre: nombre,
        telefono: telefono,
        direccion: direccion,
        sincronizado: 0
    });

    const totalPagar = monto + (monto * (interes / 100));
    const montoCuota = totalPagar / cuotas;

    await db.prestamos.add({
        id: `TEMP_${clienteId}`,
        cliente_nombre: `[NUEVO] ${nombre}`,
        cliente_telefono: telefono,
        cliente_direccion: direccion,
        capital_prestado: monto,
        monto_total_pagar: totalPagar,
        saldo_pendiente: totalPagar,
        monto_cuota: montoCuota,
        frecuencia: frecuencia,
        orden_visita: 999,
        historial: []
    });

    await db.prestamos_pendientes.add({
        cliente_temp_id: clienteId,
        capital_prestado: monto,
        porcentaje_interes: interes,
        numero_cuotas: cuotas,
        frecuencia: frecuencia,
        sincronizado: 0
    });

    cerrarModalNuevoCliente();
    await renderizarTarjetas();
    alert("Cliente y préstamo registrados localmente.");
}

// 10. Modal de Detalle, Historial de Cuotas y Renovación
let clienteActualDetalleId = null;

async function verDetalleCliente(prestamoId) {
    const prestamo = await db.prestamos.get(prestamoId);
    if (!prestamo) return;

    clienteActualDetalleId = prestamoId;

    document.getElementById('det-cliente-nombre').textContent = prestamo.cliente_nombre;
    document.getElementById('det-cliente-direccion').textContent = `📍 ${prestamo.cliente_direccion || 'Sin dirección'}`;
    document.getElementById('det-cliente-telefono').textContent = `📞 ${prestamo.cliente_telefono || 'Sin teléfono'}`;

    document.getElementById('det-capital').textContent = `$${parseFloat(prestamo.capital_prestado || 0).toFixed(2)}`;
    document.getElementById('det-total').textContent = `$${parseFloat(prestamo.monto_total_pagar || prestamo.saldo_pendiente).toFixed(2)}`;
    document.getElementById('det-saldo').textContent = `$${parseFloat(prestamo.saldo_pendiente).toFixed(2)}`;
    document.getElementById('det-cuota').textContent = `${prestamo.frecuencia} - $${parseFloat(prestamo.monto_cuota).toFixed(2)}`;

    // Renderizar Historial de Pagos
    const historialContenedor = document.getElementById('det-historial-lista');
    if (prestamo.historial && prestamo.historial.length > 0) {
        historialContenedor.innerHTML = prestamo.historial.map(h => {
            const fecha = h.fecha_pago_formateada || (h.fecha_pago ? new Date(h.fecha_pago).toLocaleString('es-ES') : 'Sin fecha');
            const obs = h.observacion ? `<span class="text-[10px] text-slate-400 block">${h.observacion}</span>` : '';

            return `
                <div class="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex justify-between items-center text-xs space-x-2">
                    <div>
                        <span class="text-emerald-400 font-bold">$${parseFloat(h.monto || 0).toFixed(2)}</span>
                        <span class="text-[10px] text-slate-400 block">${fecha}</span>
                        ${obs}
                    </div>
                    <span class="px-2 py-0.5 text-[10px] rounded font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        COBRADO
                    </span>
                </div>
            `;
        }).join('');
    } else {
        historialContenedor.innerHTML = `<div class="text-xs text-slate-500 text-center py-4">Aún no hay pagos o cuotas registradas para este crédito.</div>`;
    }

    const modal = document.getElementById('modal-detalle-cliente');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cerrarModalDetalle() {
    const modal = document.getElementById('modal-detalle-cliente');
    modal.classList.remove('flex');
    modal.classList.add('hidden');
}

async function procesarRenovacion() {
    const monto = parseFloat(document.getElementById('renovacion-monto').value);
    const interes = parseFloat(document.getElementById('renovacion-interes').value);

    if (!monto || monto <= 0) {
        alert("Ingresa un monto válido para la renovación.");
        return;
    }

    const prestamoActual = await db.prestamos.get(clienteActualDetalleId);

    if (parseFloat(prestamoActual.saldo_pendiente) > 0) {
        if (!confirm(`El cliente aún tiene un saldo de $${parseFloat(prestamoActual.saldo_pendiente).toFixed(2)}. ¿Deseas refinanciar/renovar este crédito?`)) {
            return;
        }
    }

    await db.prestamos_pendientes.add({
        cliente_id: prestamoActual.cliente_id || clienteActualDetalleId,
        capital_prestado: monto,
        porcentaje_interes: interes,
        es_renovacion: true,
        sincronizado: 0
    });

    alert("Solicitud de renovación registrada localmente.");
    cerrarModalDetalle();
}

// 11. Formateo de fecha del encabezado
function cargarFechaEncabezado() {
    const badgeFecha = document.getElementById('badge-fecha');
    if (badgeFecha) {
        const hoy = new Date();
        const opciones = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' };
        badgeFecha.textContent = hoy.toLocaleDateString('es-ES', opciones).toUpperCase();
    }
}

// Inicialización de la App al cargar el documento DOM
document.addEventListener('DOMContentLoaded', () => {
    cargarFechaEncabezado();
    actualizarEstadoRed();
    if (navigator.onLine) {
        descargarDatosServidor();
    } else {
        renderizarTarjetas();
    }
});