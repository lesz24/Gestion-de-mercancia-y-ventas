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

// --- Tasa BCV global ---
let tasaBCV = null;
async function cargarTasa() {
  try {
    const d = await api.get('/api/tasa');
    tasaBCV = d.tasa;
    $('#tasa-bcv-display').textContent = tasaBCV ? `Bs ${tasaBCV.toLocaleString()}` : 'N/D';
  } catch { $('#tasa-bcv-display').textContent = 'Error'; }
}

// --- Navegación ---
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    $('#view-' + btn.dataset.view).classList.remove('hidden');
    const v = btn.dataset.view;
    if (v === 'dashboard') cargarDashboard();
    if (v === 'inventario') cargarProductos();
    if (v === 'venta') cargarFormularioVenta();
    if (v === 'cobros') cargarCobros();
  });
});

// ============================================================
// DASHBOARD
// ============================================================
async function cargarDashboard() {
  const d = await api.get('/api/dashboard');
  $('#tarjetas-dashboard').innerHTML = `
    <div class="tarjeta"><p class="titulo">Productos</p><p class="valor">${d.total_productos}</p></div>
    <div class="tarjeta"><p class="titulo">Unidades en stock</p><p class="valor">${d.unidades_en_stock}</p></div>
    <div class="tarjeta"><p class="titulo">Valor inventario (USD)</p><p class="valor">$ ${money(d.valor_inventario)}</p></div>
    <div class="tarjeta"><p class="titulo">Por cobrar (USD)</p><p class="valor" style="color:#e11d48">$ ${money(d.total_por_cobrar)}</p></div>
    <div class="tarjeta"><p class="titulo">Total ventas</p><p class="valor">${d.total_ventas}</p><p class="titulo">$ ${money(d.monto_total_ventas)}</p></div>
    <div class="tarjeta"><p class="titulo">Abonado USD</p><p class="valor" style="color:#059669">$ ${money(d.pagado_usd)}</p><p class="titulo">${d.num_abonos} abonos</p></div>
    <div class="tarjeta"><p class="titulo">Abonado Bs</p><p class="valor" style="color:#0369a1">${money(d.pagado_bs)}</p></div>
    <div class="tarjeta"><p class="titulo">Tasa BCV actual</p><p class="valor" style="color:#4f46e5">${tasaBCV ? tasaBCV.toLocaleString() : '—'}</p></div>`;
}

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

function renderCobros() {
  const pendientes = cobrosTodas.filter((v) => v.estado_pago !== 'pagado');
  const pagadas = cobrosTodas.filter((v) => v.estado_pago === 'pagado');
  const lista = filtroEstado === 'todos' ? cobrosTodas : cobrosTodas.filter((v) => v.estado_pago === filtroEstado);

  // Contadores de cada botón de filtro
  $('#filtro-contador-todos').textContent = cobrosTodas.length;
  $('#filtro-contador-pendiente').textContent = cobrosTodas.filter((v) => v.estado_pago === 'pendiente').length;
  $('#filtro-contador-parcial').textContent = cobrosTodas.filter((v) => v.estado_pago === 'parcial').length;
  $('#filtro-contador-pagado').textContent = pagadas.length;

  $('#cobros-resumen').innerHTML = `<b>${pendientes.length}</b> por cobrar · <b>${pagadas.length}</b> pagadas`;

  const vacio = {
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
        <td class="space-x-1">
          <button class="btn-small btn-view" data-ver="${v.id}">🧾 Ver / Abonar</button>
        </td>
      </tr>`;
    }).join('')
    : `<tr><td colspan="10" class="text-center text-slate-400 py-8">${vacio}</td></tr>`;

  document.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => verVenta(b.dataset.ver)));
}

// Botones de filtro por estado
document.querySelectorAll('.filtro-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filtro-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    filtroEstado = btn.dataset.filtro;
    renderCobros();
  });
});

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
        <td class="text-xs">${p.tasa_bcv != null ? Number(p.tasa_bcv).toFixed(2) : '—'}</td>
        <td>${esc(p.metodo_pago) || '—'}</td>
        <td class="text-xs text-slate-500">${esc(p.nota) || '—'}</td>
        <td class="space-x-1 whitespace-nowrap">
          ${p.comprobantes.length ? `<button class="btn-small btn-view" data-comp='${esc(JSON.stringify(p.comprobantes))}'>🧾 ${p.comprobantes.length}</button>` : ''}
          <button class="btn-small btn-pay" data-borrar-abono="${p.id}">🗑️</button>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="8" class="text-center text-slate-400 py-4">Todavía no hay abonos</td></tr>`;

  $('#contenedor-comprobantes').innerHTML = '';

  document.querySelectorAll('[data-comp]').forEach((b) => b.addEventListener('click', () => {
    const comps = JSON.parse(b.dataset.comp);
    $('#contenedor-comprobantes').innerHTML = comps.map((c) => `<div class="text-center">
      <a href="${c.ruta_imagen_url}" target="_blank"><img src="${c.ruta_imagen_url}" class="w-full h-32 object-cover rounded-lg border" /></a>
      <p class="text-xs font-semibold mt-1">${esc(c.nombre)}</p>
      <p class="text-xs text-slate-400">${esc(c.descripcion)}</p>
    </div>`).join('');
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
$('#btn-nuevo-abono').addEventListener('click', () => abrirModalAbono(ventaActual.saldo_usd));

// ============================================================
// MODAL DE ABONO
// ============================================================
let archivosSeleccionados = [];

function abrirModalAbono(saldo) {
  archivosSeleccionados = [];
  $('#abono-saldo').textContent = '$ ' + money(saldo);
  $('#abono-tasa-label').textContent = tasaBCV ? `Bs ${tasaBCV.toLocaleString()}` : 'sin tasa';
  $('#abono-usd').value = saldo.toFixed(2);
  $('#abono-bs').value = tasaBCV ? (saldo * tasaBCV).toFixed(2) : '';
  $('#abono-nota').value = '';
  $('#lista-archivos').innerHTML = '';
  $('#modal-abono').classList.remove('hidden');
}
$('#cerrar-modal-abono').addEventListener('click', () => $('#modal-abono').classList.add('hidden'));

// Conversión bidireccional USD <-> Bs
$('#abono-usd').addEventListener('input', () => {
  if (!tasaBCV) return;
  $('#abono-bs').value = (Number($('#abono-usd').value || 0) * tasaBCV).toFixed(2);
});
$('#abono-bs').addEventListener('input', () => {
  if (!tasaBCV) return;
  $('#abono-usd').value = (Number($('#abono-bs').value || 0) / tasaBCV).toFixed(2);
});

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
      <img src="${URL.createObjectURL(a.file)}" class="w-16 h-16 object-cover rounded-lg border shrink-0" />
      <div class="flex-1 space-y-2">
        <input class="input comp-nombre" data-i="${i}" placeholder="Nombre del comprobante *" value="${esc(a.nombre)}" />
        <input class="input comp-desc" data-i="${i}" placeholder="Descripción (opcional)" value="${esc(a.descripcion)}" />
      </div>
      <button type="button" class="text-rose-500 text-lg" data-sacar="${i}">✕</button>
    </div>
  </div>`).join('');
  document.querySelectorAll('.comp-nombre').forEach((el) => el.addEventListener('input', (e) => { archivosSeleccionados[+e.target.dataset.i].nombre = e.target.value; }));
  document.querySelectorAll('.comp-desc').forEach((el) => el.addEventListener('input', (e) => { archivosSeleccionados[+e.target.dataset.i].descripcion = e.target.value; }));
  document.querySelectorAll('[data-sacar]').forEach((b) => b.addEventListener('click', () => { archivosSeleccionados.splice(+b.dataset.sacar, 1); pintarArchivos(); }));
}

$('#form-abono').addEventListener('submit', async (e) => {
  e.preventDefault();
  const montoUsd = Number($('#abono-usd').value);
  if (!montoUsd || montoUsd <= 0) return toast('Ingresá un monto mayor a 0', 'error');
  const sinNombre = archivosSeleccionados.find((a) => !a.nombre.trim());
  if (sinNombre) return toast('Cada comprobante necesita un nombre', 'error');

  const fd = new FormData();
  fd.append('monto_usd', montoUsd);
  fd.append('monto_bs', $('#abono-bs').value || '');
  fd.append('tasa_bcv', tasaBCV || '');
  fd.append('metodo_pago', $('#abono-metodo').value);
  fd.append('nota', $('#abono-nota').value.trim());
  archivosSeleccionados.forEach((a) => {
    fd.append('comprobantes', a.file);
    fd.append('comprobante_nombre', a.nombre.trim());
    fd.append('comprobante_descripcion', a.descripcion.trim());
  });
  try {
    const r = await fetch(`/api/ventas/${ventaActual.id}/abonos`, { method: 'POST', body: fd });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error');
    toast(`Abono registrado — venta ${d.estado_venta}`);
    $('#modal-abono').classList.add('hidden');
    verVenta(ventaActual.id); cargarCobros(); cargarDashboard();
  } catch (err) { toast(err.message, 'error'); }
});

// --- Arranque ---
cargarTasa().then(actualizarResumenVenta);
cargarDashboard();
cargarProductos();
api.get('/api/dashboard').then(() => { $('#estado-servidor').textContent = 'conectado ✔'; $('#estado-servidor').className = 'text-emerald-400'; });
