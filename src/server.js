// ============================================================
// SERVIDOR — Hono + Bun
// Hono: framework web ultrarrápido. Bun: runtime que lo ejecuta.
// SQLite via bun:sqlite (nativo de Bun, sin dependencias extra).
// ------------------------------------------------------------
// Modelo: las ventas NO tienen cuotas fijas. Cada venta tiene un
// total (USD) que se va llenando con ABONOS libres hasta el 100%.
// ============================================================
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { join, extname, basename } from 'path';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { randomBytes } from 'crypto';
import db from './db.js';

const app = new Hono();
const PORT = Number(process.env.PORT) || 3000;

const PUBLIC_DIR = join(import.meta.dir, '..', 'public');
// Imágenes de comprobantes: por defecto ../uploads (local).
// En Render se sobreescribe con UPLOADS_DIR apuntando al disco persistente.
const UPLOADS_DIR = process.env.UPLOADS_DIR || join(import.meta.dir, '..', 'uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

// --- Utilidades -------------------------------------------------
const EPS = 0.005;

function estadoDeVenta(total, abonado) {
  if (abonado >= total - EPS) return 'pagado';
  if (abonado > EPS) return 'parcial';
  return 'pendiente';
}

function recalcularEstado(ventaId) {
  const v = db.query('SELECT total_usd FROM Ventas WHERE id=?').get(ventaId);
  if (!v) return null;
  const abonado = db.query('SELECT COALESCE(SUM(monto_usd),0) a FROM Pagos WHERE venta_id=?').get(ventaId).a;
  const estado = estadoDeVenta(v.total_usd, abonado);
  db.query('UPDATE Ventas SET estado_pago=? WHERE id=?').run(estado, ventaId);
  return estado;
}

// ============================================================
// 1) RUTAS DE API (siempre PRIMERO, antes del catch-all)
// ============================================================

// --- Tasa BCV desde DolarApi.com (oficial, con límite de tiempo) ---
app.get('/api/tasa', async (c) => {
  try {
    const r = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error('respuesta ' + r.status);
    const data = await r.json();
    // El oficial trae "promedio" (compra/venta pueden venir null)
    const tasa = data.promedio ?? data.venta ?? data.compra ?? null;
    const compra = data.compra ?? null;
    return c.json({ tasa, compra, fecha: data.fechaActualizacion, fuente: data.fuente || 'oficial' });
  } catch {
    // Si DolarApi no responde, devolvemos tasa null (la app sigue funcionando)
    return c.json({ tasa: null, compra: null, fecha: null });
  }
});

// --- Productos --------------------------------------------------
app.get('/api/productos', (c) => {
  const q = (c.req.query('q') || '').trim();
  const rows = q
    ? db.query('SELECT * FROM Productos WHERE nombre LIKE ? OR descripcion LIKE ? ORDER BY nombre').all(`%${q}%`, `%${q}%`)
    : db.query('SELECT * FROM Productos ORDER BY nombre').all();
  return c.json(rows);
});

app.post('/api/productos', async (c) => {
  const b = await c.req.json();
  const { nombre, descripcion = '', precio_usd, cuotas = 1, cantidad_total = 0, stock_actual = 0 } = b;
  if (!nombre || precio_usd == null) return c.json({ error: 'Nombre y precio USD obligatorios' }, 400);
  const r = db.query('INSERT INTO Productos (nombre,descripcion,precio_usd,cuotas,cantidad_total,stock_actual) VALUES (?,?,?,?,?,?)')
    .run(nombre, descripcion, Number(precio_usd), Math.max(1, Number(cuotas)), Number(cantidad_total), Number(stock_actual));
  return c.json(db.query('SELECT * FROM Productos WHERE id=?').get(r.lastInsertRowid), 201);
});

app.put('/api/productos/:id', async (c) => {
  const b = await c.req.json();
  const { nombre, descripcion = '', precio_usd, cuotas = 1, cantidad_total = 0, stock_actual = 0 } = b;
  const r = db.query('UPDATE Productos SET nombre=?,descripcion=?,precio_usd=?,cuotas=?,cantidad_total=?,stock_actual=? WHERE id=?')
    .run(nombre, descripcion, Number(precio_usd), Math.max(1, Number(cuotas)), Number(cantidad_total), Number(stock_actual), c.req.param('id'));
  if (r.changes === 0) return c.json({ error: 'Producto no encontrado' }, 404);
  return c.json(db.query('SELECT * FROM Productos WHERE id=?').get(c.req.param('id')));
});

app.delete('/api/productos/:id', (c) => {
  try {
    const r = db.query('DELETE FROM Productos WHERE id=?').run(c.req.param('id'));
    if (r.changes === 0) return c.json({ error: 'No encontrado' }, 404);
    return c.json({ ok: true });
  } catch {
    return c.json({ error: 'Tiene ventas registradas' }, 409);
  }
});

// --- Ventas -----------------------------------------------------
// Lista con total abonado, saldo y progreso
app.get('/api/ventas', (c) => {
  const rows = db.query(`
    SELECT v.*, pr.nombre AS producto_nombre,
      COALESCE((SELECT SUM(p.monto_usd) FROM Pagos p WHERE p.venta_id=v.id),0) AS abonado_usd,
      COALESCE((SELECT SUM(p.monto_bs)  FROM Pagos p WHERE p.venta_id=v.id),0) AS abonado_bs,
      (SELECT COUNT(*) FROM Pagos p WHERE p.venta_id=v.id) AS num_abonos
    FROM Ventas v JOIN Productos pr ON pr.id=v.producto_id
    ORDER BY v.id DESC
  `).all();
  for (const v of rows) {
    v.saldo_usd = Math.max(0, v.total_usd - v.abonado_usd);
    v.progreso = v.total_usd > 0 ? Math.min(100, (v.abonado_usd / v.total_usd) * 100) : 0;
  }
  return c.json(rows);
});

// Detalle de una venta con sus abonos y comprobantes
app.get('/api/ventas/:id', (c) => {
  const venta = db.query('SELECT v.*, pr.nombre AS producto_nombre FROM Ventas v JOIN Productos pr ON pr.id=v.producto_id WHERE v.id=?').get(c.req.param('id'));
  if (!venta) return c.json({ error: 'No encontrada' }, 404);

  const pagos = db.query('SELECT * FROM Pagos WHERE venta_id=? ORDER BY fecha_pago, id').all(c.req.param('id'));
  for (const p of pagos) {
    p.comprobantes = db.query('SELECT * FROM Comprobantes_Pago WHERE pago_id=?').all(p.id);
  }
  const abonado = pagos.reduce((s, p) => s + p.monto_usd, 0);
  return c.json({
    ...venta,
    pagos,
    abonado_usd: abonado,
    saldo_usd: Math.max(0, venta.total_usd - abonado),
    progreso: venta.total_usd > 0 ? Math.min(100, (abonado / venta.total_usd) * 100) : 0,
  });
});

// Crear venta (sin cuotas fijas)
app.post('/api/ventas', async (c) => {
  const b = await c.req.json();
  const { cliente_nombre, cliente_telefono = '', vendedor = '', producto_id, cantidad = 1 } = b;
  if (!cliente_nombre || !producto_id) return c.json({ error: 'Falta cliente o producto' }, 400);
  try {
    db.exec('BEGIN');
    const prod = db.query('SELECT * FROM Productos WHERE id=?').get(producto_id);
    if (!prod) throw new Error('Producto no encontrado');
    const cant = Number(cantidad);
    if (!Number.isInteger(cant) || cant <= 0) throw new Error('Cantidad inválida');
    if (prod.stock_actual < cant) throw new Error(`Stock insuficiente (quedan ${prod.stock_actual})`);
    const total = prod.precio_usd * cant;
    const vr = db.query(`INSERT INTO Ventas (cliente_nombre,cliente_telefono,vendedor,producto_id,cantidad,precio_unitario_usd,total_usd,estado_pago)
                         VALUES (?,?,?,?,?,?,?, 'pendiente')`)
      .run(cliente_nombre.trim(), cliente_telefono.trim(), vendedor.trim(), prod.id, cant, prod.precio_usd, total);
    db.query('UPDATE Productos SET stock_actual = stock_actual - ? WHERE id=?').run(cant, prod.id);
    db.exec('COMMIT');
    return c.json(db.query('SELECT * FROM Ventas WHERE id=?').get(vr.lastInsertRowid), 201);
  } catch (e) {
    db.exec('ROLLBACK');
    return c.json({ error: e.message }, 400);
  }
});

// --- ABONOS -----------------------------------------------------
// Guarda los archivos de comprobantes subidos en un FormData.
// Devuelve [{nombre, descripcion, ruta}] o lanza Error si falta un nombre.
async function guardarComprobantesNuevos(formData) {
  const comprobantes = [];
  const files = formData.getAll('comprobantes').filter((f) => typeof f === 'object' && f && f.size > 0);
  const nombres = formData.getAll('comprobante_nombre');
  const descripciones = formData.getAll('comprobante_descripcion');
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const nombre = String(nombres[i] || file.name || '').trim();
    if (!nombre) throw new Error('Cada comprobante necesita un nombre');
    const descripcion = String(descripciones[i] || '');
    const ext = (file.name || 'png').split('.').pop();
    const filename = `${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
    writeFileSync(join(UPLOADS_DIR, filename), Buffer.from(await file.arrayBuffer()));
    comprobantes.push({ nombre, descripcion, ruta: `/uploads/${filename}` });
  }
  return comprobantes;
}

// Registrar un abono (con nota opcional y comprobantes con nombre)
app.post('/api/ventas/:id/abonos', async (c) => {
  const ventaId = c.req.param('id');
  const venta = db.query('SELECT * FROM Ventas WHERE id=?').get(ventaId);
  if (!venta) return c.json({ error: 'Venta no encontrada' }, 404);

  const formData = await c.req.formData();
  const montoUsd = Number(formData.get('monto_usd'));
  const montoBs = formData.get('monto_bs') ? Number(formData.get('monto_bs')) : null;
  const montoUsdt = formData.get('monto_usdt') ? Number(formData.get('monto_usdt')) : null;
  const tasaBcv = formData.get('tasa_bcv') ? Number(formData.get('tasa_bcv')) : null;
  const metodoPago = formData.get('metodo_pago') || '';
  const nota = formData.get('nota') || '';

  if (!Number.isFinite(montoUsd) || montoUsd <= 0) {
    return c.json({ error: 'El monto del abono debe ser mayor a 0' }, 400);
  }

  const abonadoPrevio = db.query('SELECT COALESCE(SUM(monto_usd),0) a FROM Pagos WHERE venta_id=?').get(ventaId).a;
  const saldo = venta.total_usd - abonadoPrevio;
  if (saldo <= EPS) return c.json({ error: 'Esta venta ya está pagada por completo' }, 400);
  if (montoUsd - saldo > EPS) {
    return c.json({ error: `El abono ($${montoUsd.toFixed(2)}) supera el saldo pendiente ($${saldo.toFixed(2)})` }, 400);
  }

  // Guardar imágenes
  let comprobantes = [];
  try { comprobantes = await guardarComprobantesNuevos(formData); }
  catch (e) { return c.json({ error: e.message }, 400); }

  db.exec('BEGIN');
  const usdtLimpio = Number.isFinite(montoUsdt) && montoUsdt > 0 ? montoUsdt : null;
  const vr = db.query('INSERT INTO Pagos (venta_id, monto_usd, monto_bs, monto_usdt, tasa_bcv, metodo_pago, nota) VALUES (?,?,?,?,?,?,?)')
    .run(ventaId, Number(montoUsd.toFixed(4)), montoBs, usdtLimpio, tasaBcv, metodoPago, nota);
  for (const comp of comprobantes) {
    db.query('INSERT INTO Comprobantes_Pago (pago_id, nombre, descripcion, ruta_imagen_url) VALUES (?,?,?,?)')
      .run(vr.lastInsertRowid, comp.nombre, comp.descripcion, comp.ruta);
  }
  const nuevoAbonado = abonadoPrevio + montoUsd;
  const estado = estadoDeVenta(venta.total_usd, nuevoAbonado);
  db.query('UPDATE Ventas SET estado_pago=? WHERE id=?').run(estado, ventaId);
  db.exec('COMMIT');

  return c.json({ ok: true, id: vr.lastInsertRowid, estado_venta: estado, abonado_usd: nuevoAbonado, saldo_usd: Math.max(0, venta.total_usd - nuevoAbonado) });
});

// Editar un abono (monto, método, nota; los comprobantes nuevos se agregan)
app.put('/api/abonos/:id', async (c) => {
  const pago = db.query('SELECT * FROM Pagos WHERE id=?').get(c.req.param('id'));
  if (!pago) return c.json({ error: 'Abono no encontrado' }, 404);
  const venta = db.query('SELECT * FROM Ventas WHERE id=?').get(pago.venta_id);
  if (!venta) return c.json({ error: 'Venta no encontrada' }, 404);

  const formData = await c.req.formData();
  const montoUsd = Number(formData.get('monto_usd'));
  const montoBs = formData.get('monto_bs') ? Number(formData.get('monto_bs')) : null;
  const montoUsdt = formData.get('monto_usdt') ? Number(formData.get('monto_usdt')) : null;
  const tasaBcv = formData.get('tasa_bcv') ? Number(formData.get('tasa_bcv')) : null;
  const metodoPago = formData.get('metodo_pago') || '';
  const nota = formData.get('nota') || '';

  if (!Number.isFinite(montoUsd) || montoUsd <= 0) {
    return c.json({ error: 'El monto del abono debe ser mayor a 0' }, 400);
  }

  // El nuevo monto no puede superar el total menos los OTROS abonos de la venta
  const abonadoOtros = db.query('SELECT COALESCE(SUM(monto_usd),0) a FROM Pagos WHERE venta_id=? AND id!=?').get(pago.venta_id, pago.id).a;
  const disponible = venta.total_usd - abonadoOtros;
  if (montoUsd - disponible > EPS) {
    return c.json({ error: `El abono ($${montoUsd.toFixed(2)}) supera el saldo disponible ($${disponible.toFixed(2)})` }, 400);
  }

  // Nuevos comprobantes (los ya registrados se conservan)
  let comprobantes = [];
  try { comprobantes = await guardarComprobantesNuevos(formData); }
  catch (e) { return c.json({ error: e.message }, 400); }

  // Comprobantes marcados para quitar (ids) y datos de los que se conservan
  const quitarIds = formData.getAll('comprobante_quitar').map(Number).filter(Number.isFinite);
  let metaComprobantes = [];
  const metaRaw = formData.get('comprobante_meta');
  if (metaRaw) {
    try { metaComprobantes = JSON.parse(metaRaw); } catch { return c.json({ error: 'Datos de comprobantes inválidos' }, 400); }
  }
  for (const m of metaComprobantes) {
    if (!m || !String(m.nombre || '').trim()) return c.json({ error: 'Cada comprobante necesita un nombre' }, 400);
  }

  const archivosABorrar = [];
  let estado = null;
  try {
    db.exec('BEGIN');
    const usdtLimpio = Number.isFinite(montoUsdt) && montoUsdt > 0 ? montoUsdt : null;
    db.query('UPDATE Pagos SET monto_usd=?, monto_bs=?, monto_usdt=?, tasa_bcv=?, metodo_pago=?, nota=? WHERE id=?')
      .run(Number(montoUsd.toFixed(4)), montoBs, usdtLimpio, tasaBcv, metodoPago, nota, pago.id);
    for (const comp of comprobantes) {
      db.query('INSERT INTO Comprobantes_Pago (pago_id, nombre, descripcion, ruta_imagen_url) VALUES (?,?,?,?)')
        .run(pago.id, comp.nombre, comp.descripcion, comp.ruta);
    }
    // Quitar los comprobantes marcados (solo de ESTE abono)
    if (quitarIds.length) {
      const existentes = db.query('SELECT * FROM Comprobantes_Pago WHERE pago_id=?').all(pago.id);
      for (const f of existentes) {
        if (!quitarIds.includes(f.id)) continue;
        db.query('DELETE FROM Comprobantes_Pago WHERE id=?').run(f.id);
        const archivo = basename(String(f.ruta_imagen_url || '').replace('/uploads/', ''));
        if (archivo) archivosABorrar.push(archivo);
      }
    }
    // Actualizar nombre / descripción de los comprobantes que se conservan
    for (const m of metaComprobantes) {
      if (quitarIds.includes(Number(m.id))) continue;
      db.query('UPDATE Comprobantes_Pago SET nombre=?, descripcion=? WHERE id=? AND pago_id=?')
        .run(String(m.nombre).trim(), String(m.descripcion || '').trim(), Number(m.id), pago.id);
    }
    estado = recalcularEstado(pago.venta_id);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    return c.json({ error: 'No se pudo editar: ' + e.message }, 500);
  }

  // Borra las imágenes quitadas del disco (recién tras el COMMIT)
  for (const archivo of archivosABorrar) { try { unlinkSync(join(UPLOADS_DIR, archivo)); } catch {} }

  const abonado = db.query('SELECT COALESCE(SUM(monto_usd),0) a FROM Pagos WHERE venta_id=?').get(pago.venta_id).a;
  return c.json({ ok: true, estado_venta: estado, abonado_usd: abonado, saldo_usd: Math.max(0, venta.total_usd - abonado) });
});

// Borrar un abono (deshacer)
app.delete('/api/abonos/:id', (c) => {
  const pago = db.query('SELECT * FROM Pagos WHERE id=?').get(c.req.param('id'));
  if (!pago) return c.json({ error: 'Abono no encontrado' }, 404);
  db.query('DELETE FROM Comprobantes_Pago WHERE pago_id=?').run(pago.id);
  db.query('DELETE FROM Pagos WHERE id=?').run(pago.id);
  const estado = recalcularEstado(pago.venta_id);
  return c.json({ ok: true, estado_venta: estado });
});

app.get('/api/abonos/:id/comprobantes', (c) => {
  return c.json(db.query('SELECT * FROM Comprobantes_Pago WHERE pago_id=?').all(c.req.param('id')));
});

// --- Dashboard ---------------------------------------------------
// Devuelve el inicio del período en formato 'YYYY-MM-DD HH:MM:SS'
// (local, igual que lo que guarda SQLite con datetime('now','localtime')).
function inicioDePeriodo(periodo) {
  if (!periodo || periodo === 'todo') return null;
  const d = new Date();
  if (periodo === 'hoy') {
    d.setHours(0, 0, 0, 0);
  } else if (periodo === 'semana') {
    // Semana desde el lunes
    const diasDesdeLunes = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - diasDesdeLunes);
    d.setHours(0, 0, 0, 0);
  } else if (periodo === 'mes') {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  } else {
    return null; // período desconocido -> todo
  }
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

app.get('/api/dashboard', (c) => {
  const periodo = c.req.query('periodo') || 'todo';
  const desde = inicioDePeriodo(periodo);

  // Inventario = estado ACTUAL (no depende del período)
  const productos = db.query('SELECT COUNT(*) n, COALESCE(SUM(stock_actual),0) stock FROM Productos').get();
  const inventario = db.query('SELECT COALESCE(SUM(stock_actual * precio_usd),0) valor FROM Productos').get();

  // Ventas y abonos = MOVIEMIENTOS del período elegido
  const ventas = desde
    ? db.query('SELECT COUNT(*) n, COALESCE(SUM(total_usd),0) monto FROM Ventas WHERE fecha >= ?').get(desde)
    : db.query('SELECT COUNT(*) n, COALESCE(SUM(total_usd),0) monto FROM Ventas').get();
  const pagado = desde
    ? db.query('SELECT COALESCE(SUM(monto_usd),0) usd, COALESCE(SUM(monto_bs),0) bs, COALESCE(SUM(monto_usdt),0) usdt, COUNT(*) n FROM Pagos WHERE fecha_pago >= ?').get(desde)
    : db.query('SELECT COALESCE(SUM(monto_usd),0) usd, COALESCE(SUM(monto_bs),0) bs, COALESCE(SUM(monto_usdt),0) usdt, COUNT(*) n FROM Pagos').get();

  // Por cobrar = estado ACTUAL de las deudas (siempre total)
  const porCobrar = db.query(`
    SELECT COALESCE(SUM(v.total_usd - COALESCE((SELECT SUM(p.monto_usd) FROM Pagos p WHERE p.venta_id=v.id),0)),0) saldo
    FROM Ventas v WHERE v.estado_pago != 'pagado'
  `).get();

  return c.json({
    periodo,
    total_productos: productos.n,
    unidades_en_stock: productos.stock,
    valor_inventario: inventario.valor,
    total_ventas: ventas.n,
    monto_total_ventas: ventas.monto,
    pagado_usd: pagado.usd,
    pagado_bs: pagado.bs,
    pagado_usdt: pagado.usdt,
    num_abonos: pagado.n,
    total_por_cobrar: porCobrar.saldo,
  });
});

// --- Eliminar una venta (cliente registrado por error) ----------
// Borra abonos, comprobantes e imágenes, y DEVUELVE el stock.
app.delete('/api/ventas/:id', (c) => {
  const id = Number(c.req.param('id'));
  const venta = db.query('SELECT * FROM Ventas WHERE id=?').get(id);
  if (!venta) return c.json({ error: 'Venta no encontrada' }, 404);

  try {
    const rutas = db.query(`
      SELECT ruta_imagen_url FROM Comprobantes_Pago
      WHERE pago_id IN (SELECT id FROM Pagos WHERE venta_id=?)
    `).all(id);

    db.exec('BEGIN');
    db.query('DELETE FROM Comprobantes_Pago WHERE pago_id IN (SELECT id FROM Pagos WHERE venta_id=?)').run(id);
    db.query('DELETE FROM Pagos WHERE venta_id=?').run(id);
    db.query('DELETE FROM Ventas WHERE id=?').run(id);
    // Devolver la mercancía al inventario
    db.query('UPDATE Productos SET stock_actual = stock_actual + ? WHERE id=?').run(venta.cantidad, venta.producto_id);
    db.exec('COMMIT');

    // Borrar las imágenes de los comprobantes (solo el archivo de uploads)
    for (const r of rutas) {
      const archivo = basename(String(r.ruta_imagen_url || '').replace('/uploads/', ''));
      if (archivo) { try { unlinkSync(join(UPLOADS_DIR, archivo)); } catch {} }
    }

    return c.json({ ok: true });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    return c.json({ error: 'No se pudo eliminar: ' + e.message }, 500);
  }
});

// ============================================================
// RUTAS ESTÁTICAS (siempre DESPUÉS de la API)
// ============================================================
app.get('/uploads/*', (c) => {
  const file = c.req.path.replace('/uploads/', '');
  try {
    const data = readFileSync(join(UPLOADS_DIR, file));
    const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[extname(file).toLowerCase()] || 'application/octet-stream';
    return c.body(data, 200, { 'Content-Type': mime });
  } catch { return c.notFound(); }
});

app.get('/css/*', (c) => {
  try { return c.text(readFileSync(join(PUBLIC_DIR, 'css', c.req.path.replace('/css/', '')), 'utf-8'), 200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' }); } catch { return c.notFound(); }
});
app.get('/js/*', (c) => {
  try { return c.text(readFileSync(join(PUBLIC_DIR, 'js', c.req.path.replace('/js/', '')), 'utf-8'), 200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); } catch { return c.notFound(); }
});

app.get('/*', (c) => {
  if (c.req.path.startsWith('/api/')) return c.notFound();
  try { return c.html(readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf-8'), 200, { 'Cache-Control': 'no-cache' }); }
  catch { return c.text('index.html no encontrado', 500); }
});

// ============================================================
// ARRANCAR
// ============================================================
console.log(`\n  ✅ Sistema de Gestión (Hono + Bun) corriendo en http://localhost:${PORT}\n`);
serve({ fetch: app.fetch, port: PORT });
