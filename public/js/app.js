/* ============================================================
   LÓGICA DEL FRONTEND — v4
   Modelo: abonos libres + barra de progreso + tasa BCV.
   ============================================================ */

const api = {
  get: (u) => fetch(u).then((r) => r.json()),
  send: (u, m, b) => fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Error'); return d; }),
};

const $ = (s) => document.querySelector(s);
const money = (n) => Number(n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let toastTimer;
function toast(msg, tipo = 'ok') {
  const t = $('#toast'); t.textContent = msg; t.className = `toast ${tipo}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 4000);
}

// ============================================================
// VISOR DE IMÁGENES — los comprobantes se abren en la MISMA pestaña
// ============================================================
let visorItems = [];
let visorPos = 0;

function abrirVisor(items, pos = 0) {
  if (!items || !items.length) return;
  visorItems = items;
  visorPos = Math.min(Math.max(0, pos), items.length - 1);
  pintarVisor();
  $('#visor-imagen').classList.remove('hidden');
}
function cerrarVisor() { $('#visor-imagen').classList.add('hidden'); visorItems = []; }
function pintarVisor() {
  const it = visorItems[visorPos];
  if (!it) return;
  $('#visor-img').src = it.src;
  $('#visor-nombre').textContent = it.nombre || 'Comprobante';
  $('#visor-desc').textContent = it.descripcion || '';
  $('#visor-indice').textContent = visorItems.length > 1 ? `${visorPos + 1} de ${visorItems.length}` : '';
  const varios = visorItems.length > 1;
  $('#visor-anterior').classList.toggle('hidden', !varios);
  $('#visor-siguiente').classList.toggle('hidden', !varios);
}
function moverVisor(paso) {
  if (!visorItems.length) return;
  visorPos = (visorPos + paso + visorItems.length) % visorItems.length;
  pintarVisor();
}
$('#visor-cerrar').addEventListener('click', cerrarVisor);
$('#visor-anterior').addEventListener('click', () => moverVisor(-1));
$('#visor-siguiente').addEventListener('click', () => moverVisor(1));
// Clic en el fondo oscuro = cerrar (el clic dentro de la caja no burbujea)
$('#visor-imagen').addEventListener('click', (e) => { if (e.target.id === 'visor-imagen') cerrarVisor(); });
$('#visor-caja').addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('keydown', (e) => {
  if ($('#visor-imagen').classList.contains('hidden')) return;
  if (e.key === 'Escape') cerrarVisor();
  else if (e.key === 'ArrowLeft') moverVisor(-1);
  else if (e.key === 'ArrowRight') moverVisor(1);
});

// --- Tasa BCV global ---
let tasaBCV = null;
async function cargarTasa() {
  try {
    const d = await api.get('/api/tasa');
    tasaBCV = d.tasa;
    $('#tasa-bcv-display').textContent = tasaBCV ? `Bs ${tasaBCV.toLocaleString()}` : 'N/D';
  } catch { $('#tasa-bcv-display').textContent = 'Error'; }
}

// --- Tema claro / oscuro ---
function aplicarTema(tema) {
  const oscuro = tema === 'oscuro';
  document.documentElement.classList.toggle('dark', oscuro);
  try { localStorage.setItem('tema', oscuro ? 'oscuro' : 'claro'); } catch (e) {}
  const btn = $('#btn-tema');
  if (btn) btn.textContent = oscuro ? '☀️ Modo claro' : '🌙 Modo oscuro';
}
$('#btn-tema').addEventListener('click', () =>
  aplicarTema(document.documentElement.classList.contains('dark') ? 'claro' : 'oscuro'));
// Sincronizar la etiqueta con el tema ya aplicado desde el <head>
aplicarTema(document.documentElement.classList.contains('dark') ? 'oscuro' : 'claro');

// --- Navegación (con hash en la URL para sobrevivir recargas) ---
const VISTAS = ['dashboard', 'inventario', 'venta', 'cobros'];

function irA(vista, { guardar = true } = {}) {
  if (!VISTAS.includes(vista)) vista = 'dashboard';
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === vista));
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $('#view-' + vista).classList.remove('hidden');
  // Guardar la vista actual en la URL (sin crear historial nuevo)
  if (guardar) history.replaceState(null, '', '#' + vista);
  if (vista === 'dashboard') cargarDashboard();
  if (vista === 'inventario') cargarProductos();
  if (vista === 'venta') cargarFormularioVenta();
  if (vista === 'cobros') cargarCobros();
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  // Los botones sin data-view (como el de tema) no navegan
  if (!btn.dataset.view) return;
  btn.addEventListener('click', () => irA(btn.dataset.view));
});

// Al recargar o abrir un link con #, volver a la sección guardada
window.addEventListener('hashchange', () => irA(location.hash.slice(1), { guardar: false }));

// ============================================================
// DASHBOARD
// ============================================================
let periodoDashboard = 'todo';

async function cargarDashboard() {
  const d = await api.get('/api/dashboard?periodo=' + encodeURIComponent(periodoDashboard));
  $('#tarjetas-dashboard').innerHTML = `
    <div class="tarjeta"><p class="titulo">Productos</p><p class="valor">${d.total_productos}</p></div>
    <div class="tarjeta"><p class="titulo">Unidades en stock</p><p class="valor">${d.unidades_en_stock}</p></div>
    <div class="tarjeta"><p class="titulo">Valor inventario (USD)</p><p class="valor">$ ${money(d.valor_inventario)}</p></div>
    <div class="tarjeta"><p class="titulo">Por cobrar (USD)</p><p class="valor" style="color:#e11d48">$ ${money(d.total_por_cobrar)}</p></div>
    <div class="tarjeta"><p class="titulo">Total ventas</p><p class="valor">${d.total_ventas}</p><p class="titulo">$ ${money(d.monto_total_ventas)}</p></div>
    <div class="tarjeta"><p class="titulo">Abonado USD</p><p class="valor" style="color:#059669">$ ${money(d.pagado_usd)}</p><p class="titulo">${d.num_abonos} abonos</p></div>
    <div class="tarjeta"><p class="titulo">Abonado Bs</p><p class="valor" style="color:#0369a1">${money(d.pagado_bs)}</p></div>
    <div class="tarjeta"><p class="titulo">Abonado USDT</p><p class="valor" style="color:#0d9488">${money(d.pagado_usdt)}</p></div>`;
}

// Filtro de período del dashboard
document.querySelectorAll('#filtros-periodo .filtro-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#filtros-periodo .filtro-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    periodoDashboard = btn.dataset.periodo;
    cargarDashboard();
  });
});

// ============================================================
// INVENTARIO
// ============================================================
async function cargarProductos(q = '') {
  const productos = await api.get('/api/productos' + (q ? `?q=${encodeURIComponent(q)}` : ''));
  $('#tabla-productos').innerHTML = productos.length
    ? productos.map((p) => `<tr>
        <td>${p.id}</td><td class="font-semibold">${esc(p.nombre)}</td>
        <td>$ ${money(p.precio_usd)}</td><td class="text-slate-400">${p.cuotas}</td>
        <td>${p.cantidad_total}</td>
        <td>${p.stock_actual <= 3 ? `<span class="estado estado-pendiente">⚠️ ${p.stock_actual}</span>` : p.stock_actual}</td>
        <td class="space-x-1">
          <button class="btn-small btn-view" data-editar='${esc(JSON.stringify(p))}'>✏️</button>
          <button class="btn-small btn-pay" data-borrar="${p.id}">🗑️</button>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="7" class="text-center text-slate-400 py-6">No hay productos</td></tr>`;
  document.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => llenarFormulario(JSON.parse(b.dataset.editar))));
  document.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('¿Borrar este producto?')) return;
    try { await api.send('/api/productos/' + b.dataset.borrar, 'DELETE'); toast('Borrado'); cargarProductos(); }
    catch (e) { toast(e.message, 'error'); }
  }));
}

$('#form-producto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#producto-id').value;
  const body = { nombre: $('#producto-nombre').value.trim(), precio_usd: Number($('#producto-precio').value), cuotas: Number($('#producto-cuotas').value), cantidad_total: Number($('#producto-cantidad').value), stock_actual: Number($('#producto-stock').value) };
  try {
    if (id) await api.send('/api/productos/' + id, 'PUT', body);
    else await api.send('/api/productos', 'POST', body);
    toast(id ? 'Actualizado' : 'Creado'); limpiarFormulario(); cargarProductos();
  } catch (err) { toast(err.message, 'error'); }
});

function llenarFormulario(p) {
  $('#form-producto-titulo').textContent = `Editar #${p.id}`;
  $('#producto-id').value = p.id; $('#producto-nombre').value = p.nombre;
  $('#producto-precio').value = p.precio_usd; $('#producto-cuotas').value = p.cuotas;
  $('#producto-cantidad').value = p.cantidad_total; $('#producto-stock').value = p.stock_actual;
  $('#btn-cancelar-edicion').classList.remove('hidden');
}
function limpiarFormulario() { $('#form-producto').reset(); $('#producto-id').value = ''; $('#form-producto-titulo').textContent = 'Nuevo producto'; $('#btn-cancelar-edicion').classList.add('hidden'); }
$('#btn-cancelar-edicion').addEventListener('click', limpiarFormulario);
$('#buscar-producto').addEventListener('input', (e) => cargarProductos(e.target.value));

// ============================================================
// NUEVA VENTA
// ============================================================
let productosCache = [];
async function cargarFormularioVenta() {
  productosCache = await api.get('/api/productos');
  $('#venta-producto').innerHTML = productosCache.filter((p) => p.stock_actual > 0)
    .map((p) => `<option value="${p.id}">${esc(p.nombre)} — $${money(p.precio_usd)}</option>`).join('') || '<option>Sin stock</option>';
  const ventas = await api.get('/api/ventas');
  const vends = [...new Set(ventas.map((v) => v.vendedor).filter(Boolean))];
  $('#lista-vendedores').innerHTML = vends.map((v) => `<option value="${esc(v)}">`).join('');
  actualizarResumenVenta();
}
function actualizarResumenVenta() {
  const p = productosCache.find((x) => x.id === Number($('#venta-producto').value));
  const cant = Number($('#venta-cantidad').value) || 1;
  if (!p) return;
  const total = p.precio_usd * cant;
  $('#venta-total').textContent = money(total);
  $('#venta-total-bs').textContent = tasaBCV ? money(total * tasaBCV) : '—';
}
$('#venta-producto').addEventListener('change', actualizarResumenVenta);
$('#venta-cantidad').addEventListener('input', actualizarResumenVenta);
$('#btn-guardar-venta').addEventListener('click', async () => {
  const cliente = $('#venta-cliente').value.trim();
  const pid = Number($('#venta-producto').value);
  if (!cliente || !pid) return toast('Falta cliente o producto', 'error');
  try {
    const v = await api.send('/api/ventas', 'POST', {
      cliente_nombre: cliente,
      cliente_telefono: $('#venta-telefono').value.trim(),
      vendedor: $('#venta-vendedor').value.trim(),
      producto_id: pid,
      cantidad: Number($('#venta-cantidad').value),
    });
    toast(`Venta #${v.id} registrada ✔`); $('#form-venta').reset(); cargarFormularioVenta();
  } catch (e) { toast(e.message, 'error'); }
});

// ============================================================
// CUENTAS POR COBRAR
// ============================================================
async function cargarCobros() {
  cobrosTodas = await api.get('/api/ventas');
  renderCobros();
}

let cobrosTodas = [];
let filtroEstado = 'todos';
let terminoCobros = '';   // texto del buscador por cliente / vendedor
let paginaCobros = 1;     // página actual de la lista de clientes
const COBROS_POR_PAGINA = 10;

// Quita acentos y pasa a minúsculas para que "jose" encuentre "José"
const normalizar = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function renderCobros() {
  const pendientes = cobrosTodas.filter((v) => v.estado_pago !== 'pagado');
  const pagadas = cobrosTodas.filter((v) => v.estado_pago === 'pagado');
  const porEstado = filtroEstado === 'todos' ? cobrosTodas : cobrosTodas.filter((v) => v.estado_pago === filtroEstado);

  // Buscador por nombre de cliente o de vendedor
  const q = normalizar(terminoCobros.trim());
  const listaCompleta = porEstado.filter((v) => !q || normalizar(v.cliente_nombre).includes(q) || normalizar(v.vendedor).includes(q));

  // Paginación de la lista de clientes
  const totalPaginas = Math.max(1, Math.ceil(listaCompleta.length / COBROS_POR_PAGINA));
  if (paginaCobros > totalPaginas) paginaCobros = totalPaginas;
  const inicio = (paginaCobros - 1) * COBROS_POR_PAGINA;
  const lista = listaCompleta.slice(inicio, inicio + COBROS_POR_PAGINA);

  // Contadores de cada botón de filtro
  $('#filtro-contador-todos').textContent = cobrosTodas.length;
  $('#filtro-contador-pendiente').textContent = cobrosTodas.filter((v) => v.estado_pago === 'pendiente').length;
  $('#filtro-contador-parcial').textContent = cobrosTodas.filter((v) => v.estado_pago === 'parcial').length;
  $('#filtro-contador-pagado').textContent = pagadas.length;

  $('#cobros-resumen').innerHTML = `<b>${pendientes.length}</b> por cobrar · <b>${pagadas.length}</b> pagadas`
    + (q ? ` · <b>${listaCompleta.length}</b> coinciden con “${esc(terminoCobros.trim())}”` : '');

  // Controles de paginación
  $('#pag-actual').textContent = `${paginaCobros} / ${totalPaginas}`;
  $('#paginacion-info').textContent = listaCompleta.length
    ? `Mostrando ${inicio + 1}–${inicio + lista.length} de ${listaCompleta.length} cliente(s)`
    : '';
  $('#pag-anterior').disabled = paginaCobros <= 1;
  $('#pag-siguiente').disabled = paginaCobros >= totalPaginas;

  const vacio = q
    ? '🔍 No se encontraron clientes con ese nombre'
    : {
      todos: cobrosTodas.length ? '' : '🎉 No hay ventas registradas',
      pendiente: '🎉 No hay ventas pendientes',
      parcial: '🎉 No hay ventas con abono parcial',
      pagado: '🎉 No hay ventas pagadas todavía',
    }[filtroEstado];

  $('#tabla-cobros').innerHTML = lista.length
    ? lista.map((v) => {
      const completa = v.estado_pago === 'pagado';
      return `<tr>
        <td class="font-semibold">#${v.id}</td>
        <td>${esc(v.cliente_nombre)}</td>
        <td>${esc(v.vendedor) || '—'}</td>
        <td>${esc(v.producto_nombre)}</td>
        <td>$ ${money(v.total_usd)}</td>
        <td class="text-emerald-600 font-semibold">$ ${money(v.abonado_usd)}</td>
        <td class="text-rose-500">$ ${money(v.saldo_usd)}</td>
        <td style="min-width:140px">
          <div class="progreso ${completa ? 'progreso-completa' : ''}"><span style="width:${v.progreso.toFixed(1)}%"></span></div>
          <div class="text-xs text-slate-400 mt-1">${v.progreso.toFixed(0)}% · ${v.num_abonos} abono(s)</div>
        </td>
        <td><span class="estado estado-${v.estado_pago}">${v.estado_pago}</span></td>
        <td class="space-x-1 whitespace-nowrap">
          <button class="btn-small btn-view" data-ver="${v.id}">🧾 Ver / Abonar</button>
          <button class="btn-small btn-delete" data-eliminar="${v.id}" title="Eliminar venta">🗑️</button>
        </td>
      </tr>`;
    }).join('')
    : `<tr><td colspan="10" class="text-center text-slate-400 py-8">${vacio}</td></tr>`;

  document.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => verVenta(b.dataset.ver)));
  document.querySelectorAll('[data-eliminar]').forEach((b) => b.addEventListener('click', () => eliminarVenta(b.dataset.eliminar)));
}

// Eliminar una venta registrada por error (devuelve el stock)
async function eliminarVenta(id) {
  const v = cobrosTodas.find((x) => String(x.id) === String(id));
  const nombre = v ? `${v.cliente_nombre} — ${v.producto_nombre}` : `#${id}`;
  if (!confirm(`¿Eliminar la venta de ${nombre}?\n\nSe borrarán sus abonos y comprobantes, y la mercancía volverá al inventario. Esta acción no se puede deshacer.`)) return;
  try {
    await api.send('/api/ventas/' + id, 'DELETE');
    toast('Venta eliminada — stock devuelto ✔');
    cargarCobros(); cargarDashboard();
  } catch (e) { toast(e.message, 'error'); }
}

// Botones de filtro por estado
document.querySelectorAll('.filtro-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filtro-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    filtroEstado = btn.dataset.filtro;
    paginaCobros = 1;
    renderCobros();
  });
});

// Buscador por nombre de cliente o vendedor
$('#buscar-cobros').addEventListener('input', (e) => {
  terminoCobros = e.target.value;
  paginaCobros = 1;
  renderCobros();
});

// Paginación de la lista de clientes
$('#pag-anterior').addEventListener('click', () => { if (paginaCobros > 1) { paginaCobros--; renderCobros(); } });
$('#pag-siguiente').addEventListener('click', () => { paginaCobros++; renderCobros(); });

let ventaActual = null;
async function verVenta(id) {
  const v = await api.get('/api/ventas/' + id);
  ventaActual = v;
  $('#detalle-venta-id').textContent = v.id;
  $('#detalle-venta-info').textContent = `${v.cliente_nombre} — ${v.producto_nombre} — vendedor: ${v.vendedor || '—'}`;

  // Barra de progreso
  $('#detalle-abonado').textContent = '$ ' + money(v.abonado_usd);
  $('#detalle-total').textContent = '$ ' + money(v.total_usd);
  $('#detalle-saldo').textContent = '$ ' + money(v.saldo_usd);
  $('#detalle-barra').style.width = v.progreso.toFixed(1) + '%';
  $('#detalle-barra').parentElement.classList.toggle('progreso-completa', v.estado_pago === 'pagado');
  $('#detalle-porcentaje').textContent = v.progreso.toFixed(0) + '% pagado';

  // Botón de abono
  $('#btn-nuevo-abono').disabled = v.estado_pago === 'pagado';
  $('#btn-nuevo-abono').classList.toggle('opacity-50', v.estado_pago === 'pagado');
  $('#btn-nuevo-abono').textContent = v.estado_pago === 'pagado' ? '✔ Pagada' : '➕ Registrar abono';

  // Tabla de abonos
  $('#tabla-abonos').innerHTML = v.pagos.length
    ? v.pagos.map((p, i) => `<tr>
        <td class="font-semibold">${i + 1}</td>
        <td class="text-xs text-slate-500">${esc(p.fecha_pago)}</td>
        <td class="text-emerald-600 font-semibold">$ ${money(p.monto_usd)}</td>
        <td>${p.monto_bs != null ? money(p.monto_bs) : '—'}</td>
        <td>${p.monto_usdt != null ? money(p.monto_usdt) : '—'}</td>
        <td class="text-xs">${p.tasa_bcv != null ? Number(p.tasa_bcv).toFixed(2) : '—'}</td>
        <td>${esc(p.metodo_pago) || '—'}</td>
        <td class="text-xs text-slate-500">${esc(p.nota) || '—'}</td>
        <td class="space-x-1 whitespace-nowrap">
          ${p.comprobantes.length ? `<button class="btn-small btn-view" data-comp='${esc(JSON.stringify(p.comprobantes))}'>🧾 ${p.comprobantes.length}</button>` : ''}
          <button class="btn-small btn-view" data-editar-abono="${p.id}" title="Editar abono">✏️</button>
          <button class="btn-small btn-pay" data-borrar-abono="${p.id}" title="Eliminar abono">🗑️</button>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="9" class="text-center text-slate-400 py-4">Todavía no hay abonos</td></tr>`;

  // Galería con TODOS los comprobantes de la venta (clic → visor en la misma pestaña)
  const todosComprobantes = [];
  v.pagos.forEach((p, i) => (p.comprobantes || []).forEach((c) => todosComprobantes.push({
    src: c.ruta_imagen_url,
    nombre: c.nombre,
    sub: `Abono #${i + 1} — $ ${money(p.monto_usd)}`,
    descripcion: `${c.descripcion ? c.descripcion + ' · ' : ''}Abono #${i + 1} — $ ${money(p.monto_usd)}`,
  })));
  $('#contenedor-comprobantes-wrap').classList.toggle('hidden', !todosComprobantes.length);
  $('#contenedor-comprobantes').innerHTML = todosComprobantes.map((c, i) => `<div class="text-center comp-thumb" data-ver-comp="${i}">
      <img src="${c.src}" class="w-full h-32 object-cover rounded-lg border" />
      <p class="text-xs font-semibold mt-1 truncate">${esc(c.nombre)}</p>
      <p class="text-xs text-slate-400 truncate">${esc(c.sub)}</p>
    </div>`).join('');
  document.querySelectorAll('[data-ver-comp]').forEach((b) =>
    b.addEventListener('click', () => abrirVisor(todosComprobantes, +b.dataset.verComp)));

  // El botón 🧾 de cada abono abre el visor con los comprobantes de ESE abono
  document.querySelectorAll('[data-comp]').forEach((b) => b.addEventListener('click', () => {
    const comps = JSON.parse(b.dataset.comp);
    abrirVisor(comps.map((c) => ({ src: c.ruta_imagen_url, nombre: c.nombre, descripcion: c.descripcion })), 0);
  }));

  document.querySelectorAll('[data-editar-abono]').forEach((b) => b.addEventListener('click', () => {
    const pago = v.pagos.find((x) => String(x.id) === String(b.dataset.editarAbono));
    // Al editar, el monto de ESTE abono vuelve a estar disponible
    if (pago) abrirModalAbono(v.saldo_usd + pago.monto_usd, pago);
  }));

  document.querySelectorAll('[data-borrar-abono]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('¿Borrar este abono?')) return;
    try {
      await fetch('/api/abonos/' + b.dataset.borrarAbono, { method: 'DELETE' });
      toast('Abono eliminado'); verVenta(v.id); cargarCobros();
    } catch { toast('No se pudo borrar', 'error'); }
  }));

  $('#modal-venta').classList.remove('hidden');
}
$('#cerrar-modal-venta').addEventListener('click', () => $('#modal-venta').classList.add('hidden'));
$('#btn-eliminar-venta').addEventListener('click', async () => {
  if (!ventaActual) return;
  $('#modal-venta').classList.add('hidden');
  await eliminarVenta(ventaActual.id);
});
$('#btn-nuevo-abono').addEventListener('click', () => abrirModalAbono(ventaActual.saldo_usd));

// ============================================================
// MODAL DE ABONO (registra nuevo o edita uno existente)
// ============================================================
let archivosSeleccionados = [];
let abonoEditandoId = null; // id del abono que se está editando (null = nuevo)
let comprobantesExistentes = []; // comprobantes ya guardados del abono en edición
let comprobantesQuitar = [];     // ids de comprobantes marcados para borrar

function abrirModalAbono(saldo, pago = null) {
  archivosSeleccionados = [];
  abonoEditandoId = pago ? pago.id : null;
  // Al editar: arrastramos los comprobantes ya registrados para poder quitarlos o renombrarlos
  comprobantesExistentes = pago ? (pago.comprobantes || []).map((c) => ({ ...c, nombre: c.nombre || '', descripcion: c.descripcion || '' })) : [];
  comprobantesQuitar = [];
  $('#abono-titulo').textContent = pago ? '✏️ Editar abono' : '💳 Registrar abono';
  $('#btn-guardar-abono').textContent = pago ? '💾 Guardar cambios' : '💾 Guardar abono';
  $('#abono-saldo-texto').textContent = pago ? 'Saldo disponible:' : 'Saldo pendiente:';
  $('#abono-saldo').textContent = '$ ' + money(saldo);
  $('#abono-tasa-label').textContent = tasaBCV ? `Bs ${tasaBCV.toLocaleString()}` : 'sin tasa';
  if (pago) {
    // Editar: cargamos los datos tal como se registraron
    $('#abono-usd').value = Number(pago.monto_usd).toFixed(2);
    $('#abono-bs').value = pago.monto_bs != null ? Number(pago.monto_bs).toFixed(2) : '';
    $('#abono-usdt').value = pago.monto_usdt != null ? Number(pago.monto_usdt).toFixed(2) : '';
    $('#abono-metodo').value = pago.metodo_pago || 'transferencia';
    $('#abono-nota').value = pago.nota || '';
  } else {
    $('#abono-usd').value = saldo.toFixed(2);
    $('#abono-bs').value = tasaBCV ? (saldo * tasaBCV).toFixed(2) : '';
    $('#abono-usdt').value = ''; // USDT: carga manual, no se calcula
    $('#abono-metodo').value = 'transferencia';
    $('#abono-nota').value = '';
  }
  $('#lista-archivos').innerHTML = '';
  pintarComprobantesExistentes();
  $('#modal-abono').classList.remove('hidden');
}
$('#cerrar-modal-abono').addEventListener('click', () => { abonoEditandoId = null; comprobantesExistentes = []; comprobantesQuitar = []; $('#modal-abono').classList.add('hidden'); });

// Conversión entre USD y Bs con la tasa BCV.
// El campo USDT es totalmente independiente: se carga manualmente
// y no modifica (ni es modificado por) los otros dos.
function sincronizarDesde(campo) {
  const usdEl = $('#abono-usd'), bsEl = $('#abono-bs');
  if (campo === 'usd') {
    const usd = Number(usdEl.value || 0);
    bsEl.value = tasaBCV ? (usd * tasaBCV).toFixed(2) : '';
  } else if (campo === 'bs') {
    if (!tasaBCV) return;
    usdEl.value = (Number(bsEl.value || 0) / tasaBCV).toFixed(2);
  }
}
$('#abono-usd').addEventListener('input', () => sincronizarDesde('usd'));
$('#abono-bs').addEventListener('input', () => sincronizarDesde('bs'));

// Comprobantes (nombre obligatorio)
const zona = $('#zona-archivo');
const inputArchivos = $('#input-archivos');
zona.addEventListener('click', () => inputArchivos.click());
inputArchivos.addEventListener('change', () => agregarArchivos(inputArchivos.files));
zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('zona-arrastre-activa'); });
zona.addEventListener('dragleave', () => zona.classList.remove('zona-arrastre-activa'));
zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('zona-arrastre-activa'); agregarArchivos(e.dataTransfer.files); });

function agregarArchivos(files) {
  for (const f of files) if (f.type.startsWith('image/')) archivosSeleccionados.push({ file: f, nombre: '', descripcion: '' });
  pintarArchivos();
}
function pintarArchivos() {
  $('#lista-archivos').innerHTML = archivosSeleccionados.map((a, i) => `<div class="border rounded-lg p-3">
    <div class="flex gap-3">
      <img src="${URL.createObjectURL(a.file)}" class="w-16 h-16 object-cover rounded-lg border shrink-0 comp-thumb" data-ver-nuevo="${i}" title="Ver imagen" />
      <div class="flex-1 space-y-2">
        <input class="input comp-nombre" data-i="${i}" placeholder="Nombre del comprobante *" value="${esc(a.nombre)}" />
        <input class="input comp-desc" data-i="${i}" placeholder="Descripción (opcional)" value="${esc(a.descripcion)}" />
      </div>
      <button type="button" class="text-rose-500 text-lg" data-sacar="${i}" title="Quitar comprobante">✕</button>
    </div>
  </div>`).join('');
  document.querySelectorAll('.comp-nombre').forEach((el) => el.addEventListener('input', (e) => { archivosSeleccionados[+e.target.dataset.i].nombre = e.target.value; }));
  document.querySelectorAll('.comp-desc').forEach((el) => el.addEventListener('input', (e) => { archivosSeleccionados[+e.target.dataset.i].descripcion = e.target.value; }));
  document.querySelectorAll('[data-sacar]').forEach((b) => b.addEventListener('click', () => { archivosSeleccionados.splice(+b.dataset.sacar, 1); pintarArchivos(); }));
  document.querySelectorAll('[data-ver-nuevo]').forEach((b) => b.addEventListener('click', () =>
    abrirVisor(archivosSeleccionados.map((x) => ({ src: URL.createObjectURL(x.file), nombre: x.nombre || 'Comprobante', descripcion: x.descripcion })), +b.dataset.verNuevo)));
}

// Comprobantes YA guardados del abono que se está editando:
// se pueden ver, renombrar y quitar antes de guardar los cambios.
function pintarComprobantesExistentes() {
  const cont = $('#lista-comprobantes-existentes');
  cont.classList.toggle('hidden', !comprobantesExistentes.length);
  cont.innerHTML = comprobantesExistentes.map((c, i) => `<div class="border rounded-lg p-3 bg-slate-50">
    <div class="flex gap-3">
      <img src="${c.ruta_imagen_url}" class="w-16 h-16 object-cover rounded-lg border shrink-0 comp-thumb" data-ver-existente="${i}" title="Ver imagen" />
      <div class="flex-1 space-y-2">
        <input class="input comp-ex-nombre" data-i="${i}" placeholder="Nombre del comprobante *" value="${esc(c.nombre)}" />
        <input class="input comp-ex-desc" data-i="${i}" placeholder="Descripción (opcional)" value="${esc(c.descripcion)}" />
      </div>
      <button type="button" class="text-rose-500 text-lg" data-quitar-existente="${i}" title="Quitar este comprobante">✕</button>
    </div>
  </div>`).join('');
  cont.querySelectorAll('.comp-ex-nombre').forEach((el) => el.addEventListener('input', (e) => { comprobantesExistentes[+e.target.dataset.i].nombre = e.target.value; }));
  cont.querySelectorAll('.comp-ex-desc').forEach((el) => el.addEventListener('input', (e) => { comprobantesExistentes[+e.target.dataset.i].descripcion = e.target.value; }));
  cont.querySelectorAll('[data-quitar-existente]').forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.quitarExistente;
    const comp = comprobantesExistentes[i];
    if (comp && comp.id != null) comprobantesQuitar.push(comp.id);
    comprobantesExistentes.splice(i, 1);
    pintarComprobantesExistentes();
  }));
  cont.querySelectorAll('[data-ver-existente]').forEach((b) => b.addEventListener('click', () =>
    abrirVisor(comprobantesExistentes.map((x) => ({ src: x.ruta_imagen_url, nombre: x.nombre || 'Comprobante', descripcion: x.descripcion })), +b.dataset.verExistente)));
}

$('#form-abono').addEventListener('submit', async (e) => {
  e.preventDefault();
  const montoUsd = Number($('#abono-usd').value);
  if (!montoUsd || montoUsd <= 0) return toast('Ingresá un monto mayor a 0', 'error');
  const sinNombre = [...archivosSeleccionados, ...comprobantesExistentes].find((a) => !a.nombre.trim());
  if (sinNombre) return toast('Cada comprobante necesita un nombre', 'error');

  const fd = new FormData();
  fd.append('monto_usd', montoUsd);
  fd.append('monto_bs', $('#abono-bs').value || '');
  fd.append('monto_usdt', $('#abono-usdt').value || '');
  fd.append('tasa_bcv', tasaBCV || '');
  fd.append('metodo_pago', $('#abono-metodo').value);
  fd.append('nota', $('#abono-nota').value.trim());
  archivosSeleccionados.forEach((a) => {
    fd.append('comprobantes', a.file);
    fd.append('comprobante_nombre', a.nombre.trim());
    fd.append('comprobante_descripcion', a.descripcion.trim());
  });
  // Al editar: comprobantes a quitar y datos actualizados de los que se conservan
  comprobantesQuitar.forEach((id) => fd.append('comprobante_quitar', id));
  if (abonoEditandoId && comprobantesExistentes.length) {
    fd.append('comprobante_meta', JSON.stringify(comprobantesExistentes.map((c) => ({
      id: c.id, nombre: c.nombre.trim(), descripcion: (c.descripcion || '').trim(),
    }))));
  }
  try {
    const url = abonoEditandoId ? `/api/abonos/${abonoEditandoId}` : `/api/ventas/${ventaActual.id}/abonos`;
    const r = await fetch(url, { method: abonoEditandoId ? 'PUT' : 'POST', body: fd });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error');
    toast(abonoEditandoId ? 'Abono actualizado ✔' : `Abono registrado — venta ${d.estado_venta}`);
    abonoEditandoId = null;
    $('#modal-abono').classList.add('hidden');
    verVenta(ventaActual.id); cargarCobros(); cargarDashboard();
  } catch (err) { toast(err.message, 'error'); }
});

// --- Arranque ---
const vistaInicial = VISTAS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
irA(vistaInicial, { guardar: false });
cargarTasa().then(() => {
  actualizarResumenVenta();
  // La tasa llega después del primer render: refrescar el dashboard si está visible
  if (!$('#view-dashboard').classList.contains('hidden')) cargarDashboard();
});
api.get('/api/dashboard').then(() => { $('#estado-servidor').textContent = 'conectado ✔'; $('#estado-servidor').className = 'text-emerald-400'; });
