// =====================================================================
//  EL ZOCO FINANCIERO - Motor de Cobranza Offline (PWA)
//  v2026-09-23 - Layout mobile + modal unificado + logo corporativo
// =====================================================================

// --- 0. UTILIDADES ---
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// --- 1. INDEXEDDB ---
const db = new Dexie("QuobranzaOfflineDB");

db.version(5).stores({
    prestamos: 'id, cliente_nombre, orden_visita, saldo_pendiente',
    pagos_pendientes: '++id, prestamo, monto, fecha_pago, sincronizado',
    clientes_pendientes: '++id, nombre, telefono, direccion, referencia, sincronizado',
    prestamos_pendientes: '++id, cliente_temp_id, capital_prestado, porcentaje_interes, numero_cuotas, frecuencia, sincronizado',
    eventos_dia: '++id, tipo, prestamo_id, fecha_key, timestamp'
});

let prestamoSeleccionadoId = null;
let clienteActualDetalleId = null;

// --- HELPERS ---
function _hoyKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function _registrarEvento(tipo, prestamoId, extra = {}) {
    try {
        await db.eventos_dia.add({
            tipo: tipo,
            prestamo_id: String(prestamoId),
            fecha_key: _hoyKey(),
            timestamp: new Date().toISOString(),
            ...extra
        });
    } catch (err) {
        console.warn('No se pudo registrar evento:', err);
    }
}

async function _existeEvento(tipo, prestamoId) {
    const hoy = _hoyKey();
    const n = await db.eventos_dia.filter(e =>
        e.tipo === tipo &&
        String(e.prestamo_id) === String(prestamoId) &&
        e.fecha_key === hoy
    ).count();
    return n > 0;
}

// =====================================================================
//  MENÚ HAMBURGUESA
// =====================================================================
function toggleMenu() {
    const menu = document.getElementById('menu-dropdown');
    if (!menu) return;
    menu.classList.toggle('hidden');
}

document.addEventListener('click', function(event) {
    const menu = document.getElementById('menu-dropdown');
    const header = document.querySelector('header');
    if (!menu || !header) return;
    if (!header.contains(event.target)) {
        menu.classList.add('hidden');
    }
});

// =====================================================================
//  ESTADO DEL BOTÓN SINCRONIZAR (3 estados)
// =====================================================================
async function actualizarBotonSync() {
    const btn = document.getElementById('btn-sincronizar');
    const badge = document.getElementById('badge-pendientes');
    if (!btn) return;

    const svg = btn.querySelector('svg');
    const online = navigator.onLine;

    let pendientes = 0;
    try {
        const pagos = await db.pagos_pendientes.count();
        const clientes = await db.clientes_pendientes.count();
        pendientes = pagos + clientes;
    } catch (e) { /* DB no lista aún */ }

    btn.classList.remove('text-emerald-400', 'text-rose-400', 'text-slate-500', 'animate-pulse');
    if (svg) svg.classList.remove('text-emerald-400', 'text-rose-400', 'text-slate-500');

    if (!online) {
        btn.classList.add('text-slate-500');
        if (svg) svg.classList.add('text-slate-500');
        if (badge) badge.classList.add('hidden');
    } else if (pendientes > 0) {
        btn.classList.add('text-rose-400');
        if (svg) svg.classList.add('text-rose-400');
        if (badge) {
            badge.textContent = pendientes > 99 ? '99+' : pendientes;
            badge.classList.remove('hidden');
        }
    } else {
        btn.classList.add('text-emerald-400');
        if (svg) svg.classList.add('text-emerald-400');
        if (badge) badge.classList.add('hidden');
    }
}

// =====================================================================
//  ENCABEZADOS Y RED
// =====================================================================
function cargarFechaEncabezado() {
    const badgeFecha = document.getElementById('badge-fecha');
    if (badgeFecha) {
        const hoy = new Date();
        const opciones = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' };
        badgeFecha.textContent = hoy.toLocaleDateString('es-ES', opciones).toUpperCase();
    }
}

function actualizarEncabezadoRuta(rutaNombre, gestorNombre) {
    const elemRuta = document.getElementById('header-nombre-ruta');
    const elemGestor = document.getElementById('gestor-nombre-text');

    if (elemRuta && elemRuta.dataset.fixed === 'true') {
        return;
    }

    if (elemRuta && rutaNombre) {
        elemRuta.innerHTML = `<span class="text-indigo-500 flex-shrink-0">📍</span><span class="truncate">${rutaNombre}</span>`;
    }
    if (elemGestor && gestorNombre) {
        elemGestor.textContent = gestorNombre;
    }
}

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

window.addEventListener('online', () => {
    actualizarEstadoRed();
    actualizarBotonSync();
});
window.addEventListener('offline', () => {
    actualizarEstadoRed();
    actualizarBotonSync();
});

// =====================================================================
//  CARGA Y RENDERIZADO
// =====================================================================
async function descargarDatosServidor() {
    if (!navigator.onLine) {
        alert("Atención: Necesitas conexión a internet para descargar la ruta del día.");
        return;
    }

    try {
        const response = await fetch('/api/prestamos/', {
            credentials: 'same-origin'
        });
        if (!response.ok) throw new Error("Error al consultar la API REST");
        const prestamos = await response.json();

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
                cliente_ref1_nombre: p.cliente_ref1_nombre || '',
                cliente_ref1_telefono: p.cliente_ref1_telefono || '',
                cliente_ref1_direccion: p.cliente_ref1_direccion || '',
                cliente_ref2_nombre: p.cliente_ref2_nombre || '',
                cliente_ref2_telefono: p.cliente_ref2_telefono || '',
                cliente_ref2_direccion: p.cliente_ref2_direccion || '',
                cliente_aval_nombre: p.cliente_aval_nombre || '',
                cliente_aval_telefono: p.cliente_aval_telefono || '',
                cliente_aval_direccion: p.cliente_aval_direccion || '',
                capital_prestado: capital,
                monto_total_pagar: totalPagar,
                saldo_pendiente: saldoCalculado,
                monto_cuota: parseFloat(p.monto_cuota || 0),
                numero_cuotas: p.numero_cuotas || 24,
                frecuencia: p.frecuencia || 'DIARIO',
                orden_visita: p.orden_visita || 999,
                ruta_nombre: p.ruta_nombre || 'Ruta Principal',
                gestor_nombre: p.gestor_nombre || 'Sin gestor',
                historial: p.historial || []
            };
        });

        const localesTEMP = await db.prestamos
            .filter(p => typeof p.id === 'string' && p.id.startsWith('TEMP_'))
            .toArray();

        if (prestamosMapeados.length > 0) {
            actualizarEncabezadoRuta(prestamosMapeados[0].ruta_nombre, prestamosMapeados[0].gestor_nombre);
        }

        await db.transaction('rw', db.prestamos, async () => {
            await db.prestamos.clear();
            if (prestamosMapeados.length > 0) await db.prestamos.bulkPut(prestamosMapeados);
            if (localesTEMP.length > 0) await db.prestamos.bulkPut(localesTEMP);
        });

        await renderizarTarjetas();
    } catch (error) {
        console.error("Error descargando datos del servidor:", error);
        alert("Error al conectar con el servidor para descargar la ruta.");
    }
}

async function renderizarTarjetas() {
    const contenedor = document.getElementById('lista-prestamos');
    if (!contenedor) return;

    const prestamos = await db.prestamos.orderBy('orden_visita').toArray();

    if (prestamos.length > 0) {
        actualizarEncabezadoRuta(prestamos[0].ruta_nombre, prestamos[0].gestor_nombre);
    }

    const contador = document.getElementById('contador-deudas');
    if (contador) contador.textContent = `${prestamos.length} préstamos cargados`;

    await actualizarBotonSync();

    const hoy = _hoyKey();
    const eventosHoy = await db.eventos_dia.where('fecha_key').equals(hoy).toArray();
    const pagadosHoy = new Set(eventosHoy.filter(e => e.tipo === 'cobro').map(e => String(e.prestamo_id)));
    const visitadosSinPagoHoy = new Set(
        eventosHoy.filter(e => e.tipo === 'visita')
            .map(e => String(e.prestamo_id))
            .filter(id => !pagadosHoy.has(id))
    );

    if (prestamos.length === 0) {
        contenedor.innerHTML = `<div class="text-center py-10 text-slate-500">No hay préstamos guardados en el dispositivo.</div>`;
        return;
    }

    contenedor.innerHTML = prestamos.map(p => {
        const nombreLimpio = (p.cliente_nombre || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const idFormateado = typeof p.id === 'string' ? `'${p.id}'` : p.id;
        const cuota = parseFloat(p.monto_cuota || 0);
        const yaPago = pagadosHoy.has(String(p.id));
        const yaVisitaSinPago = visitadosSinPagoHoy.has(String(p.id));

        let indicadorHTML = '';
        if (yaPago) {
            indicadorHTML = `<span class="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">✓ PAGÓ HOY</span>`;
        } else if (yaVisitaSinPago) {
            indicadorHTML = `<span class="text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-full">✕ SIN PAGO</span>`;
        }

        return `
            <div class="bg-slate-800 border border-slate-700/80 rounded-2xl p-4 shadow-md space-y-3">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 flex-wrap mb-1">
                            <span class="text-xs font-bold text-indigo-400 uppercase tracking-wider">#${p.orden_visita} • ${p.frecuencia}</span>
                            ${indicadorHTML}
                        </div>
                        <h2 onclick="verDetalleCliente(${idFormateado})" class="text-base font-bold text-white cursor-pointer hover:text-indigo-300 underline decoration-indigo-500/50 underline-offset-4 flex items-center gap-1">
                            ${p.cliente_nombre} 🔍
                        </h2>
                        <p class="text-xs text-slate-400">📍 ${p.cliente_direccion || 'Sin dirección'}</p>
                    </div>
                    <div class="text-right ml-2">
                        <span class="text-xs text-slate-400 block">Saldo</span>
                        <span class="text-base font-black text-rose-400">$${parseFloat(p.saldo_pendiente || 0).toFixed(2)}</span>
                    </div>
                </div>
                <div class="flex justify-between items-center pt-2 border-t border-slate-700/50 gap-2">
                    <span class="text-xs text-slate-300">Cuota: <b class="text-white">$${cuota.toFixed(2)}</b></span>
                    <div class="flex gap-2">
                        ${!yaPago && !yaVisitaSinPago ? `
                            <button onclick="registrarNoPago(${idFormateado}, '${nombreLimpio}')" class="bg-slate-700 hover:bg-rose-600/30 active:scale-95 text-slate-300 hover:text-rose-300 text-xs font-bold py-2 px-3 rounded-xl border border-slate-600 hover:border-rose-500/40 transition" title="Marcar visitado sin pago">
                                ✕ No pagó
                            </button>
                        ` : ''}
                        <button onclick="abrirModalCobro(${idFormateado}, '${nombreLimpio}', ${cuota})" class="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-md transition">
                            Cobrar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================================
//  MARCAR "NO PAGÓ"
// =====================================================================
async function registrarNoPago(prestamoId, clienteNombre) {
    try {
        const yaVisitado = await _existeEvento('visita', prestamoId);
        if (yaVisitado) {
            alert(`${clienteNombre} ya fue marcado como visitado hoy.`);
            return;
        }
        await _registrarEvento('visita', prestamoId, { cliente_nombre: clienteNombre });
        await renderizarTarjetas();
    } catch (err) {
        console.error('Error marcando no pago:', err);
        alert('No se pudo registrar la visita.');
    }
}

// =====================================================================
//  MODAL DE COBRO (ticket de abono)
// =====================================================================
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
    prestamoSeleccionadoId = null;
}

async function _registrarPagoLocal(monto, observacion) {
    if (!monto || monto <= 0) return null;
    if (prestamoSeleccionadoId === null || prestamoSeleccionadoId === undefined) return null;

    const fechaHoy = new Date().toISOString();
    const prestamoId = prestamoSeleccionadoId;

    await db.pagos_pendientes.add({
        prestamo: prestamoId,
        monto: monto,
        observacion: observacion,
        fecha_pago: fechaHoy,
        sincronizado: 0
    });

    const prestamo = await db.prestamos.get(prestamoId);
    if (!prestamo) return null;

    prestamo.saldo_pendiente = Math.max(0, parseFloat(prestamo.saldo_pendiente) - monto);
    if (!prestamo.historial) prestamo.historial = [];
    prestamo.historial.unshift({
        monto: monto,
        fecha_pago: fechaHoy,
        fecha_pago_formateada: 'Ahora (Pendiente)',
        observacion: observacion
    });
    await db.prestamos.put(prestamo);

    if (!(await _existeEvento('visita', prestamoId))) {
        await _registrarEvento('visita', prestamoId, { cliente_nombre: prestamo.cliente_nombre });
    }
    await _registrarEvento('cobro', prestamoId, {
        monto: monto,
        cliente_nombre: prestamo.cliente_nombre,
        observacion: observacion
    });

    return prestamo;
}

async function _despuesDeGuardarPago() {
    cerrarModal();
    await renderizarTarjetas();
    if (navigator.onLine) await sincronizarTodo();
}

// =====================================================================
//  BOTONES DE COBRO
// =====================================================================
async function cobrarYCompartirWhatsApp() {
    const monto = parseFloat(document.getElementById('input-monto-cobro').value);
    const observacion = document.getElementById('input-observacion').value.trim();

    if (!monto || monto <= 0) { alert("Ingresa un monto válido"); return; }

    const prestamoActualizado = await _registrarPagoLocal(monto, observacion);
    if (!prestamoActualizado) { alert("No se pudo registrar el pago."); return; }

    try {
        const datos = _generarDatosTicket(prestamoActualizado, monto, observacion, new Date().toISOString());
        const jpegUrl = await _generarTicketJpeg(datos);
        const textoFallback = _construirTextoWhatsApp(datos);
        const resultado = await _compartirJpegWhatsApp(jpegUrl, textoFallback, prestamoActualizado.cliente_telefono);

        if (resultado.modo === 'clipboard') {
            setTimeout(() => {
                alert("✅ Imagen del ticket copiada al portapapeles.\n\n📌 En WhatsApp Web:\n1. Clic en el chat del cliente\n2. Ctrl + V\n3. Envía");
            }, 1200);
        } else if (resultado.modo === 'descarga') {
            setTimeout(() => {
                alert("✅ Imagen del ticket descargada.\n\n📌 En WhatsApp Web:\n1. Clic en 📎\n2. Selecciona la imagen\n3. Envía");
            }, 1200);
        }
    } catch (err) {
        console.error('Error generando/compartiendo ticket:', err);
        alert('El pago fue registrado, pero no se pudo generar el ticket.');
    }

    await _despuesDeGuardarPago();
}

async function cobrarEImprimir() {
    const monto = parseFloat(document.getElementById('input-monto-cobro').value);
    const observacion = document.getElementById('input-observacion').value.trim();

    if (!monto || monto <= 0) { alert("Ingresa un monto válido"); return; }

    const prestamoActualizado = await _registrarPagoLocal(monto, observacion);
    if (!prestamoActualizado) { alert("No se pudo registrar el pago."); return; }

    try {
        const datos = _generarDatosTicket(prestamoActualizado, monto, observacion, new Date().toISOString());
        const jpegUrl = await _generarTicketJpeg(datos);
        await _imprimirJpeg(jpegUrl);
    } catch (err) {
        console.error('Error generando/imprimiendo ticket:', err);
        alert('El pago fue registrado, pero no se pudo imprimir el ticket.');
    }

    await _despuesDeGuardarPago();
}

// =====================================================================
//  SINCRONIZACIÓN
// =====================================================================
async function sincronizarTodo() {
    if (!navigator.onLine) {
        alert("Necesitas conexión a internet para sincronizar con el servidor.");
        return;
    }

    try {
        const csrfToken = getCookie('csrftoken');

        // FASE 1: Altas
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
                    referencia: c.referencia || '',
                    ref1_nombre: c.ref1_nombre || '',
                    ref1_telefono: c.ref1_telefono || '',
                    ref1_direccion: c.ref1_direccion || '',
                    ref2_nombre: c.ref2_nombre || '',
                    ref2_telefono: c.ref2_telefono || '',
                    ref2_direccion: c.ref2_direccion || '',
                    aval_nombre: c.aval_nombre || '',
                    aval_telefono: c.aval_telefono || '',
                    aval_direccion: c.aval_direccion || '',
                    capital_prestado: p.capital_prestado || 0,
                    porcentaje_interes: p.porcentaje_interes || 20,
                    numero_cuotas: p.numero_cuotas || 24,
                    frecuencia: p.frecuencia || 'DIARIO'
                };
            });

            const resAltas = await fetch('/api/clientes/sincronizar_altas/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify({ altas: paqueteAltas }),
                credentials: 'same-origin'
            });

            if (!resAltas.ok) {
                console.error("Error sincronizando altas:", await resAltas.text());
                alert("Falló la sincronización de altas. Se reintentará luego.");
                return;
            }

            const dataAltas = await resAltas.json();

            for (let reg of dataAltas.registros) {
                if (!reg.temp_id || !reg.real_id) continue;
                const pagosAsociados = await db.pagos_pendientes.where('prestamo').equals(reg.temp_id).toArray();
                for (let pago of pagosAsociados) {
                    pago.prestamo = reg.real_id;
                    await db.pagos_pendientes.put(pago);
                }
                await db.prestamos.delete(reg.temp_id);

                const eventosTEMP = await db.eventos_dia.where('prestamo_id').equals(reg.temp_id).toArray();
                for (let ev of eventosTEMP) {
                    ev.prestamo_id = String(reg.real_id);
                    await db.eventos_dia.put(ev);
                }
            }

            await db.clientes_pendientes.clear();
            await db.prestamos_pendientes.clear();
        }

        // FASE 2: Pagos
        const pagosPendientes = await db.pagos_pendientes.toArray();

        if (pagosPendientes.length > 0) {
            const pagosListos = pagosPendientes.filter(p =>
                typeof p.prestamo === 'number' ||
                (typeof p.prestamo === 'string' && !p.prestamo.startsWith('TEMP_'))
            );

            if (pagosListos.length > 0) {
                const paquetePagos = pagosListos.map(p => ({
                    prestamo: p.prestamo,
                    monto: p.monto,
                    observacion: p.observacion || '',
                    fecha_pago: p.fecha_pago
                }));

                const resPagos = await fetch('/api/pagos/sincronizar_lote/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                    body: JSON.stringify({ pagos: paquetePagos }),
                    credentials: 'same-origin'
                });

                if (resPagos.ok) {
                    for (let p of pagosListos) await db.pagos_pendientes.delete(p.id);
                } else {
                    console.error("Error sincronizando pagos:", await resPagos.text());
                }
            }
        }

        await descargarDatosServidor();
        await actualizarBotonSync();
    } catch (error) {
        console.error("Error en la sincronización:", error);
        alert("Ocurrió un error al intentar sincronizar.");
    }
}

// =====================================================================
//  NUEVO CLIENTE
// =====================================================================
function abrirModalNuevoCliente() {
    const modal = document.getElementById('modal-nuevo-cliente');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cerrarModalNuevoCliente() {
    const modal = document.getElementById('modal-nuevo-cliente');
    modal.classList.remove('flex');
    modal.classList.add('hidden');

    const idsLimpiar = [
        'nuevo-nombre', 'nuevo-telefono', 'nueva-direccion', 'nuevo-monto',
        'ref1-nombre', 'ref1-telefono', 'ref1-direccion',
        'ref2-nombre', 'ref2-telefono', 'ref2-direccion',
        'aval-nombre', 'aval-telefono', 'aval-direccion'
    ];
    idsLimpiar.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const interes = document.getElementById('nuevo-interes');
    if (interes) interes.value = '20';
    const cuotas = document.getElementById('nuevas-cuotas');
    if (cuotas) cuotas.value = '24';
}

async function guardarClienteLocal() {
    const nombre = document.getElementById('nuevo-nombre').value.trim();
    const telefono = document.getElementById('nuevo-telefono').value.trim();
    const direccion = document.getElementById('nueva-direccion').value.trim();
    const monto = parseFloat(document.getElementById('nuevo-monto').value);
    const interes = parseFloat(document.getElementById('nuevo-interes').value || 20);
    const cuotas = parseInt(document.getElementById('nuevas-cuotas').value || 24);
    const frecuencia = document.getElementById('nueva-frecuencia').value;

    const ref1_nombre = document.getElementById('ref1-nombre').value.trim();
    const ref1_telefono = document.getElementById('ref1-telefono').value.trim();
    const ref1_direccion = document.getElementById('ref1-direccion').value.trim();
    const ref2_nombre = document.getElementById('ref2-nombre').value.trim();
    const ref2_telefono = document.getElementById('ref2-telefono').value.trim();
    const ref2_direccion = document.getElementById('ref2-direccion').value.trim();
    const aval_nombre = document.getElementById('aval-nombre').value.trim();
    const aval_telefono = document.getElementById('aval-telefono').value.trim();
    const aval_direccion = document.getElementById('aval-direccion').value.trim();

    if (!nombre || isNaN(monto) || monto <= 0) {
        alert("Debes proporcionar al menos un Nombre y un Monto válido.");
        return;
    }

    const clienteId = await db.clientes_pendientes.add({
        nombre, telefono, direccion,
        ref1_nombre, ref1_telefono, ref1_direccion,
        ref2_nombre, ref2_telefono, ref2_direccion,
        aval_nombre, aval_telefono, aval_direccion,
        sincronizado: 0
    });

    const totalPagar = monto + (monto * (interes / 100));
    const montoCuota = totalPagar / cuotas;

    await db.prestamos.add({
        id: `TEMP_${clienteId}`,
        cliente_nombre: `[NUEVO] ${nombre}`,
        cliente_telefono: telefono,
        cliente_direccion: direccion,
        cliente_ref1_nombre: ref1_nombre,
        cliente_ref1_telefono: ref1_telefono,
        cliente_ref1_direccion: ref1_direccion,
        cliente_ref2_nombre: ref2_nombre,
        cliente_ref2_telefono: ref2_telefono,
        cliente_ref2_direccion: ref2_direccion,
        cliente_aval_nombre: aval_nombre,
        cliente_aval_telefono: aval_telefono,
        cliente_aval_direccion: aval_direccion,
        capital_prestado: monto,
        monto_total_pagar: totalPagar,
        saldo_pendiente: totalPagar,
        monto_cuota: montoCuota,
        numero_cuotas: cuotas,
        frecuencia,
        orden_visita: 999,
        historial: []
    });

    await db.prestamos_pendientes.add({
        cliente_temp_id: clienteId,
        capital_prestado: monto,
        porcentaje_interes: interes,
        numero_cuotas: cuotas,
        frecuencia,
        sincronizado: 0
    });

    await _registrarEvento('desembolso', `TEMP_${clienteId}`, {
        monto: monto,
        cliente_nombre: nombre
    });

    cerrarModalNuevoCliente();
    await renderizarTarjetas();
    alert("✅ Cliente y crédito guardados localmente.");

    if (navigator.onLine) await sincronizarTodo();
}

// =====================================================================
//  DETALLE DEL CLIENTE
// =====================================================================
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

    document.getElementById('det-ref1-nombre').textContent = prestamo.cliente_ref1_nombre || '—';
    document.getElementById('det-ref1-telefono').textContent = prestamo.cliente_ref1_telefono || '—';
    document.getElementById('det-ref1-direccion').textContent = prestamo.cliente_ref1_direccion || '—';

    document.getElementById('det-ref2-nombre').textContent = prestamo.cliente_ref2_nombre || '—';
    document.getElementById('det-ref2-telefono').textContent = prestamo.cliente_ref2_telefono || '—';
    document.getElementById('det-ref2-direccion').textContent = prestamo.cliente_ref2_direccion || '—';

    document.getElementById('det-aval-nombre').textContent = prestamo.cliente_aval_nombre || '—';
    document.getElementById('det-aval-telefono').textContent = prestamo.cliente_aval_telefono || '—';
    document.getElementById('det-aval-direccion').textContent = prestamo.cliente_aval_direccion || '—';

    const historialContenedor = document.getElementById('det-historial-lista');
    if (prestamo.historial && prestamo.historial.length > 0) {
        historialContenedor.innerHTML = prestamo.historial.map((h, idx) => {
            const fecha = h.fecha_pago_formateada
                || (h.fecha_pago ? new Date(h.fecha_pago).toLocaleString('es-ES') : 'Sin fecha');
            const obs = h.observacion
                ? `<span class="text-[10px] text-slate-400 block">${h.observacion}</span>`
                : '';
            return `
                <div class="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex justify-between items-center text-xs space-x-2">
                    <div class="flex-1 min-w-0">
                        <span class="text-emerald-400 font-bold">$${parseFloat(h.monto || 0).toFixed(2)}</span>
                        <span class="text-[10px] text-slate-400 block">${fecha}</span>
                        ${obs}
                    </div>
                    <button type="button" onclick="reimprimirTicket(${idx})"
                            class="px-2 py-1 text-[10px] rounded font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 transition whitespace-nowrap">
                        🖨️ Reimprimir
                    </button>
                </div>
            `;
        }).join('');
    } else {
        historialContenedor.innerHTML = `<div class="text-xs text-slate-500 text-center py-4">Aún no hay pagos o cuotas registradas.</div>`;
    }

    const modal = document.getElementById('modal-detalle-cliente');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cerrarModalDetalle() {
    const modal = document.getElementById('modal-detalle-cliente');
    modal.classList.remove('flex');
    modal.classList.add('hidden');
    clienteActualDetalleId = null;
    const montoInput = document.getElementById('renovacion-monto');
    if (montoInput) montoInput.value = '';
    const interesInput = document.getElementById('renovacion-interes');
    if (interesInput) interesInput.value = '20';
}

async function procesarRenovacion() {
    if (!clienteActualDetalleId) return;
    const monto = parseFloat(document.getElementById('renovacion-monto').value);
    const interes = parseFloat(document.getElementById('renovacion-interes').value);

    if (!monto || monto <= 0) { alert("Ingresa un monto válido para la renovación."); return; }

    const prestamoActual = await db.prestamos.get(clienteActualDetalleId);
    if (!prestamoActual) { alert("No se encontró el préstamo actual."); return; }

    if (parseFloat(prestamoActual.saldo_pendiente) > 0) {
        if (!confirm(`El cliente aún tiene un saldo de $${parseFloat(prestamoActual.saldo_pendiente).toFixed(2)}. ¿Deseas refinanciar/renovar este crédito?`)) return;
    }

    await db.prestamos_pendientes.add({
        prestamo_origen_id: prestamoActual.id,
        cliente_temp_id: prestamoActual.id,
        capital_prestado: monto,
        porcentaje_interes: interes,
        numero_cuotas: 24,
        frecuencia: prestamoActual.frecuencia || 'DIARIO',
        es_renovacion: true,
        sincronizado: 0
    });

    alert("✅ Solicitud de renovación registrada localmente.");
    cerrarModalDetalle();
}

// =====================================================================
//  MODAL DE CIERRE DEL DÍA (unificado)
// =====================================================================
async function _calcularCierreDelDia() {
    const hoy = _hoyKey();
    const eventos = await db.eventos_dia.where('fecha_key').equals(hoy).toArray();

    const visitas = eventos.filter(e => e.tipo === 'visita');
    const cobros = eventos.filter(e => e.tipo === 'cobro');
    const desembolsos = eventos.filter(e => e.tipo === 'desembolso');

    const prestamosVisitados = new Set(visitas.map(e => String(e.prestamo_id)));
    const prestamosCobrados = new Set(cobros.map(e => String(e.prestamo_id)));

    const visitados = prestamosVisitados.size;
    const conPago = prestamosCobrados.size;
    const sinPago = Math.max(0, visitados - conPago);
    const nuevos = desembolsos.length;

    const totalCobrado = cobros.reduce((s, e) => s + parseFloat(e.monto || 0), 0);
    const totalDesembolsado = desembolsos.reduce((s, e) => s + parseFloat(e.monto || 0), 0);
    const netoCaja = totalCobrado - totalDesembolsado;

    const todosPrestamos = await db.prestamos.toArray();
    const saldoTotal = todosPrestamos.reduce((s, p) => s + parseFloat(p.saldo_pendiente || 0), 0);

    return {
        visitados, conPago, sinPago, nuevos,
        totalCobrado, cantidadCobros: cobros.length,
        totalDesembolsado, cantidadDesembolsos: desembolsos.length,
        netoCaja,
        totalPrestamos: todosPrestamos.length,
        saldoTotal
    };
}

async function abrirModalCierre() {
    try {
        const cierre = await _calcularCierreDelDia();

        // Fecha
        const fechaElem = document.getElementById('cierre-fecha');
        if (fechaElem) {
            fechaElem.textContent = new Date().toLocaleDateString('es-MX', {
                weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
            });
        }

        // Gestor y ruta
        const gestorElem = document.getElementById('cierre-gestor');
        const rutaElem = document.getElementById('cierre-ruta');
        const gestorTexto = document.getElementById('gestor-nombre-text')?.textContent || 'Gestor';
        const rutaTexto = document.getElementById('header-nombre-ruta')?.textContent?.trim() || 'Sin ruta';
        if (gestorElem) gestorElem.textContent = gestorTexto;
        if (rutaElem) rutaElem.textContent = `Ruta: ${rutaTexto}`;

        // Corte de caja
        document.getElementById('cierre-total-cobrado').textContent = `$${cierre.totalCobrado.toFixed(2)}`;
        document.getElementById('cierre-count-pagos').textContent = cierre.cantidadCobros;
        document.getElementById('cierre-total-desembolsado').textContent = `$${cierre.totalDesembolsado.toFixed(2)}`;
        document.getElementById('cierre-count-desembolsos').textContent = cierre.cantidadDesembolsos;

        const netoElem = document.getElementById('cierre-neto');
        netoElem.textContent = `$${cierre.netoCaja.toFixed(2)}`;
        netoElem.className = cierre.netoCaja >= 0
            ? 'font-black text-emerald-400'
            : 'font-black text-rose-400';

        // Gestión de ruta
        document.getElementById('cierre-visitados').textContent = cierre.visitados;
        document.getElementById('cierre-con-pago').textContent = cierre.conPago;
        document.getElementById('cierre-sin-pago').textContent = cierre.sinPago;

        // Cartera
        document.getElementById('cierre-total-prestamos').textContent = cierre.totalPrestamos;
        document.getElementById('cierre-saldo-total').textContent = `$${cierre.saldoTotal.toFixed(2)}`;

        // Estado de sync
        const pendientes = await db.pagos_pendientes.count();
        const statusElem = document.getElementById('cierre-sync-status');
        if (pendientes === 0) {
            statusElem.innerHTML = `<div class="flex items-center gap-2 text-emerald-400"><span>✅</span><span class="font-semibold">Todos los pagos sincronizados</span></div>`;
            statusElem.className = 'bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3 text-xs';
        } else {
            statusElem.innerHTML = `<div class="flex items-center gap-2 text-amber-400"><span>⚠️</span><span>Quedan <b>${pendientes}</b> pagos sin sincronizar</span></div>`;
            statusElem.className = 'bg-amber-950/30 border border-amber-500/30 rounded-xl p-3 text-xs';
        }

        const modal = document.getElementById('modal-cierre');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } catch (err) {
        console.error('Error abriendo cierre:', err);
        alert('No se pudo abrir el cierre del día: ' + err.message);
    }
}

function cerrarModalCierre() {
    const modal = document.getElementById('modal-cierre');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function compartirCierreWhatsApp() {
    const card = document.getElementById('cierre-card');
    const botones = document.getElementById('cierre-botones');

    // Guardar estilos originales
    const estilosOriginales = {
        maxHeight: card.style.maxHeight,
        overflowY: card.style.overflowY,
        height: card.style.height
    };

    try {
        // 1. Ocultar botones
        if (botones) botones.style.visibility = 'hidden';

        // 2. ✅ NUEVO: quitar límite de altura temporalmente
        card.style.maxHeight = 'none';
        card.style.overflowY = 'visible';
        card.style.height = 'auto';

        await new Promise(r => setTimeout(r, 150));

        await _cargarHtmlToImage();

        // 3. ✅ NUEVO: medir dimensiones reales
        const alturaReal = card.scrollHeight;
        const anchoReal = card.scrollWidth;

        const jpegUrl = await htmlToImage.toJpeg(card, {
            quality: 0.95,
            backgroundColor: '#1e293b',
            pixelRatio: 2,
            width: anchoReal,
            height: alturaReal,
            style: {
                transform: 'none',
                margin: '0',
                maxHeight: 'none',
                overflow: 'visible'
            }
        });

        // 4. Restaurar estilos
        card.style.maxHeight = estilosOriginales.maxHeight;
        card.style.overflowY = estilosOriginales.overflowY;
        card.style.height = estilosOriginales.height;
        if (botones) botones.style.visibility = 'visible';
        
        const gestorTexto = document.getElementById('gestor-nombre-text')?.textContent || 'Gestor';
        const fecha = new Date().toLocaleString('es-MX', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const textoFallback =
            `*EL ZOCO FINANCIERO*\n` +
            `*CIERRE DEL DÍA*\n` +
            `Gestor: ${gestorTexto}\n` +
            `Fecha: ${fecha}\n`;

        const resultado = await _compartirJpegWhatsApp(jpegUrl, textoFallback, '');

        if (resultado.modo === 'clipboard') {
            setTimeout(() => {
                alert("✅ Imagen del cierre copiada al portapapeles.\n\n📌 En WhatsApp Web:\n1. Elige el chat\n2. Ctrl + V\n3. Envía");
            }, 1200);
        } else if (resultado.modo === 'descarga') {
            setTimeout(() => {
                alert("✅ Imagen del cierre descargada.\n\n📌 En WhatsApp Web:\n1. Clic en 📎\n2. Selecciona la imagen\n3. Envía");
            }, 1200);
        }
    } catch (err) {
        console.error('Error compartiendo cierre:', err);
        alert('No se pudo compartir el cierre: ' + err.message);
        const botones = document.getElementById('cierre-botones');
        if (botones) botones.style.visibility = 'visible';
    }
}

// =====================================================================
//  SISTEMA DE TICKETS DE ABONO (HTML → JPEG)
// =====================================================================
let _htmlToImagePromise = null;
function _cargarHtmlToImage() {
    if (_htmlToImagePromise) return _htmlToImagePromise;
    if (typeof htmlToImage !== 'undefined') {
        _htmlToImagePromise = Promise.resolve();
        return _htmlToImagePromise;
    }
    _htmlToImagePromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('No se pudo cargar html-to-image'));
        document.head.appendChild(script);
    });
    return _htmlToImagePromise;
}

function _estilosTicket() {
    return `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            width: 52mm;
            padding: 2mm;
            font-family: 'Courier New', Courier, monospace;
            font-size: 10px;
            line-height: 1.6;
            color: #000;
            background: #fff;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }
        td {
            padding: 2px 0;
            vertical-align: top;
            overflow: hidden;
            word-wrap: break-word;
        }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .right { text-align: right; }
        .logo { width: 26mm; margin-bottom: 4px; }
        .divider { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
        .small { font-size: 9px; }
        .big { font-size: 11px; }
        .nowrap { white-space: nowrap; }
        p { padding: 1px 0; }
    `;
}

function _headerTicket() {
    const logoUrl = `${window.location.origin}/static/icons/logo.png`;
    return `
        <div class="center">
            <img src="${logoUrl}" class="logo" alt="Logo" crossorigin="anonymous">
            <p class="bold" style="font-size: 11px; text-transform: uppercase;">El Zoco Financiero</p>
            <p>Sistema de Cobranza</p>
            <p>el.zoco.grup@gmail.com</p>
            <p style="font-size: 7px;">https://elzocofinanciero.pythonanywhere.com</p>
        </div>
    `;
}

function _generarDatosTicket(prestamo, monto, observacion, fechaPago) {
    const fecha = fechaPago ? new Date(fechaPago) : new Date();
    const folio = `T-${prestamo.id}-${fecha.getTime().toString().slice(-6)}`;

    const saldoDespues = parseFloat(prestamo.saldo_pendiente || 0);
    const saldoAntes = saldoDespues + parseFloat(monto);

    const totalPagado = (prestamo.historial || []).reduce((s, h) => s + parseFloat(h.monto || 0), 0);
    const numeroPago = (prestamo.historial || []).length;
    const totalPagos = prestamo.numero_cuotas || 24;

    return {
        folio,
        fecha: fecha.toLocaleString('es-MX', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }),
        cliente: (prestamo.cliente_nombre || '').replace('[NUEVO] ', ''),
        telefono: prestamo.cliente_telefono || '',
        direccion: prestamo.cliente_direccion || '',
        monto: parseFloat(monto).toFixed(2),
        saldoAntes: saldoAntes.toFixed(2),
        saldoDespues: saldoDespues.toFixed(2),
        montoTotalOriginal: parseFloat(prestamo.monto_total_pagar || 0).toFixed(2),
        totalPagado: totalPagado.toFixed(2),
        cuota: parseFloat(prestamo.monto_cuota || 0).toFixed(2),
        frecuencia: prestamo.frecuencia || 'DIARIO',
        numeroPago,
        totalPagos,
        observacion: observacion || '',
        gestor: document.getElementById('gestor-nombre-text')?.textContent || 'Gestor'
    };
}

function _construirTextoWhatsApp(d) {
    return (
        `*EL ZOCO FINANCIERO*\n` +
        `Comprobante de Pago\n` +
        `--------------------------------\n` +
        `Folio: ${d.folio}\n` +
        `Fecha: ${d.fecha}\n` +
        `--------------------------------\n` +
        `Cliente: ${d.cliente}\n` +
        (d.telefono ? `Tel: ${d.telefono}\n` : '') +
        `--------------------------------\n` +
        `Monto recibido: $${d.monto}\n` +
        `Saldo anterior: $${d.saldoAntes}\n` +
        `*Saldo actual: $${d.saldoDespues}*\n` +
        `Cuota: $${d.cuota} (${d.frecuencia})\n` +
        (d.observacion ? `Nota: ${d.observacion}\n` : '') +
        `--------------------------------\n` +
        `Cobrador: ${d.gestor}\n` +
        `¡Gracias por su pago puntual!`
    );
}

function _construirTicketHTML(d) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>${_estilosTicket()}</style>
</head>
<body>
    <div id="ticket-root">
        ${_headerTicket()}

        <hr class="divider">

        <p><span class="bold">CLIENTE:</span> ${d.cliente.toUpperCase()}</p>
        <p><span class="bold">FOLIO:</span> ${d.folio}</p>
        <p><span class="bold">FECHA:</span> ${d.fecha}</p>
        <p><span class="bold">ESQUEMA:</span> Pago ${d.numeroPago} de ${d.totalPagos}</p>
        <p><span class="bold">FORMA PAGO:</span> EFECTIVO</p>

        <hr class="divider">

        <table>
            <tr class="bold small">
                <td style="width: 20%;">CANT</td>
                <td style="width: 45%;">DESC</td>
                <td class="right" style="width: 35%;">SUBT</td>
            </tr>
            <tr>
                <td>1</td>
                <td>ABONO A DEUDA</td>
                <td class="right nowrap">$${d.monto}</td>
            </tr>
        </table>

        <hr class="divider">

        <table>
            <tr>
                <td class="nowrap" style="width: 60%;">Deuda Original:</td>
                <td class="right nowrap" style="width: 40%;">$${d.montoTotalOriginal}</td>
            </tr>
            <tr>
                <td class="nowrap">Total Abonado:</td>
                <td class="right nowrap">$${d.totalPagado}</td>
            </tr>
            <tr class="bold">
                <td class="nowrap">SU ABONO:</td>
                <td class="right nowrap">$${d.monto}</td>
            </tr>
        </table>

        <hr class="divider">

        <table>
            <tr class="bold big">
                <td class="nowrap" style="width: 68%;">SALDO RESTANTE:</td>
                <td class="right nowrap" style="width: 32%;">$${d.saldoDespues}</td>
            </tr> 
        </table>

        <hr class="divider">

        <div class="center" style="font-size: 8px; margin-top: 4px;">
            <p class="bold">Atendió: ${d.gestor.toUpperCase()}</p>
            <p style="font-style: italic;">Comprobante de movimiento interno administrativo.</p>
        </div>
    </div>
</body>
</html>`;
}

async function _renderHtmlToJpeg(htmlCompleto) {
    await _cargarHtmlToImage();

    const iframe = document.createElement('iframe');
iframe.style.cssText = 'position:fixed; left:-9999px; top:0; width:70mm; height:2000px; border:0;';
    document.body.appendChild(iframe);

    const idoc = iframe.contentDocument || iframe.contentWindow.document;
    idoc.open();
    idoc.write(htmlCompleto);
    idoc.close();

    // Esperar carga del logo
    await new Promise(resolve => {
        const img = idoc.querySelector('.logo');
        if (!img || img.complete) return resolve();
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 2500);
    });

    await new Promise(r => setTimeout(r, 300));

    const contenedor = idoc.getElementById('ticket-root');
    if (!contenedor) {
        document.body.removeChild(iframe);
        throw new Error('No se encontró #ticket-root en el HTML del ticket');
    }

    // ✅ NUEVO: medir la altura real del contenido
    const alturaReal = contenedor.scrollHeight;
    const anchoReal = contenedor.scrollWidth;

    // Ajustar el iframe para que no corte
    iframe.style.height = (alturaReal + 50) + 'px';

    await new Promise(r => setTimeout(r, 150));

    let jpegDataUrl;
    try {
        jpegDataUrl = await htmlToImage.toJpeg(contenedor, {
            quality: 0.95,
            backgroundColor: '#ffffff',
            pixelRatio: 2,
            skipFonts: false,
            // ✅ NUEVO: forzar las dimensiones reales
            width: anchoReal,
            height: alturaReal,
            style: {
                transform: 'none',
                margin: '0',
                padding: '0'
            }
        });
    } finally {
        if (iframe.parentNode) document.body.removeChild(iframe);
    }

    return jpegDataUrl;
}

async function _generarTicketJpeg(d) {
    return _renderHtmlToJpeg(_construirTicketHTML(d));
}

async function _imprimirJpeg(jpegDataUrl) {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed; left:-9999px; top:0; width:58mm; height:300mm; border:0;';
    document.body.appendChild(iframe);

    const idoc = iframe.contentDocument || iframe.contentWindow.document;
    idoc.open();
    idoc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #fff; width: 58mm; }
    img { width: 48mm; display: block; margin: 0 auto; }
    @page { size: 58mm auto; margin: 0; }
</style>
</head>
<body><img id="tk" src="${jpegDataUrl}"></body>
</html>`);
    idoc.close();

    await new Promise(resolve => {
        const img = idoc.getElementById('tk');
        if (img.complete) return resolve();
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 2000);
    });

    await new Promise(r => setTimeout(r, 400));

    try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    } catch (err) {
        console.error('Error al imprimir:', err);
    }

    setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe);
    }, 30000);
}

async function _jpegAPngBlob(jpegDataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(b => resolve(b), 'image/png');
        };
        img.onerror = reject;
        img.src = jpegDataUrl;
    });
}

async function _compartirJpegWhatsApp(jpegDataUrl, textoFallback, telefono) {
    const resp = await fetch(jpegDataUrl);
    const jpegBlob = await resp.blob();
    const file = new File([jpegBlob], `ticket-${Date.now()}.jpg`, { type: 'image/jpeg' });

    // 1) Web Share API (móvil)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: 'Comprobante - El Zoco',
                text: textoFallback
            });
            return { ok: true, modo: 'share-nativo' };
        } catch (err) {
            if (err.name === 'AbortError') return { ok: false, modo: 'cancelado' };
            console.warn('Web Share falló, probando clipboard:', err);
        }
    }

    // 2) Clipboard + WhatsApp Web
    try {
        const pngBlob = await _jpegAPngBlob(jpegDataUrl);
        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': pngBlob })
        ]);

        const telLimpio = (telefono || '').replace(/\D/g, '');
        const waUrl = telLimpio
            ? `https://wa.me/52${telLimpio}?text=${encodeURIComponent(textoFallback)}`
            : `https://web.whatsapp.com/`;
        setTimeout(() => window.open(waUrl, '_blank'), 400);
        return { ok: true, modo: 'clipboard' };
    } catch (err) {
        console.warn('Clipboard falló, usando descarga:', err);
    }

    // 3) Descarga + WhatsApp Web
    const url = URL.createObjectURL(jpegBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    const telLimpio = (telefono || '').replace(/\D/g, '');
    const waUrl = telLimpio
        ? `https://wa.me/52${telLimpio}?text=${encodeURIComponent(textoFallback)}`
        : `https://web.whatsapp.com/`;
    setTimeout(() => window.open(waUrl, '_blank'), 700);

    return { ok: true, modo: 'descarga' };
}

async function reimprimirTicket(indexHistorial) {
    if (!clienteActualDetalleId) return;

    const prestamo = await db.prestamos.get(clienteActualDetalleId);
    if (!prestamo || !prestamo.historial) return;

    const h = prestamo.historial[indexHistorial];
    if (!h) { alert("No se encontró el pago."); return; }

    const pagosPosteriores = (prestamo.historial || []).slice(0, indexHistorial);
    const montoPosterior = pagosPosteriores.reduce((s, x) => s + parseFloat(x.monto || 0), 0);

    const saldoDespues = parseFloat(prestamo.saldo_pendiente || 0) + montoPosterior;
    const saldoAntes = saldoDespues + parseFloat(h.monto || 0);

    const totalPagadoAlMomento = (prestamo.historial || [])
        .slice(indexHistorial)
        .reduce((s, x) => s + parseFloat(x.monto || 0), 0);

    const numeroPago = (prestamo.historial || []).length - indexHistorial;

    const fecha = new Date(h.fecha_pago || Date.now());
    const datos = {
        folio: `T-${prestamo.id}-${fecha.getTime().toString().slice(-6)}`,
        fecha: fecha.toLocaleString('es-MX', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }),
        cliente: (prestamo.cliente_nombre || '').replace('[NUEVO] ', ''),
        telefono: prestamo.cliente_telefono || '',
        direccion: prestamo.cliente_direccion || '',
        monto: parseFloat(h.monto || 0).toFixed(2),
        saldoAntes: saldoAntes.toFixed(2),
        saldoDespues: saldoDespues.toFixed(2),
        montoTotalOriginal: parseFloat(prestamo.monto_total_pagar || 0).toFixed(2),
        totalPagado: totalPagadoAlMomento.toFixed(2),
        cuota: parseFloat(prestamo.monto_cuota || 0).toFixed(2),
        frecuencia: prestamo.frecuencia || 'DIARIO',
        numeroPago,
        totalPagos: prestamo.numero_cuotas || 24,
        observacion: h.observacion || '',
        gestor: document.getElementById('gestor-nombre-text')?.textContent || 'Gestor'
    };

    try {
        const jpegUrl = await _generarTicketJpeg(datos);
        await _imprimirJpeg(jpegUrl);
    } catch (err) {
        console.error('Error al reimprimir:', err);
        alert('No se pudo generar el ticket para reimprimir.');
    }
}

// =====================================================================
//  INICIALIZACIÓN
// =====================================================================
document.addEventListener('DOMContentLoaded', async () => {
    cargarFechaEncabezado();
    actualizarEstadoRed();
    await actualizarBotonSync();

    if (navigator.onLine) {
        await descargarDatosServidor();
    } else {
        await renderizarTarjetas();
    }
});