// ============================================================
// MIGRACIÓN V3 -> V4
// Convierte la tabla Pagos (cuotas fijas) en abonos libres.
//   * Conserva SOLO los pagos que ya fueron realizados.
//   * Borra las cuotas vacías (que se pre-generaban).
//   * Recalcula el estado de cada venta.
// Es seguro ejecutarlo varias veces (si ya migró, no hace nada).
// ============================================================
import db from '../src/db.js';

function tieneColumna(tabla, col) {
  return db.query(`PRAGMA table_info(${tabla})`).all().some((c) => c.name === col);
}

if (!tieneColumna('Pagos', 'numero_cuota')) {
  console.log('✔ La base ya está en el esquema V4 (abonos). Nada que migrar.');
} else {
  console.log('⏳ Migrando de cuotas fijas → abonos libres...');

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN');

  // 1) Crear la nueva tabla de abonos
  db.exec(`CREATE TABLE Pagos_nuevo (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id    INTEGER NOT NULL REFERENCES Ventas(id) ON DELETE CASCADE,
    monto_usd   REAL    NOT NULL,
    monto_bs    REAL,
    tasa_bcv    REAL,
    fecha_pago  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    metodo_pago TEXT    DEFAULT '',
    nota        TEXT    DEFAULT ''
  );`);

  // 2) Copiar SOLO los pagos realizados (los que tienen fecha_pago)
  db.exec(`INSERT INTO Pagos_nuevo (id, venta_id, monto_usd, monto_bs, tasa_bcv, fecha_pago, metodo_pago, nota)
    SELECT id, venta_id, monto_usd, monto_bs, tasa_bcv,
           IFNULL(fecha_pago, datetime('now','localtime')),
           IFNULL(metodo_pago, ''), IFNULL(nota, '')
    FROM Pagos WHERE fecha_pago IS NOT NULL;`);

  // 3) Reemplazar la tabla vieja
  db.exec('DROP TABLE Pagos;');
  db.exec('ALTER TABLE Pagos_nuevo RENAME TO Pagos;');
  db.exec('CREATE INDEX IF NOT EXISTS idx_pagos_venta ON Pagos(venta_id);');

  // 4) Recalcular el estado de cada venta según lo abonado
  for (const v of db.query('SELECT id, total_usd FROM Ventas').all()) {
    const abonado = db.query('SELECT COALESCE(SUM(monto_usd),0) a FROM Pagos WHERE venta_id = ?').get(v.id).a;
    const estado = abonado >= v.total_usd - 0.005 ? 'pagado' : abonado > 0.005 ? 'parcial' : 'pendiente';
    db.query('UPDATE Ventas SET estado_pago = ? WHERE id = ?').run(estado, v.id);
  }

  db.exec('COMMIT');
  db.exec('PRAGMA foreign_keys = ON;');

  const n = db.query('SELECT COUNT(*) n FROM Pagos').get().n;
  console.log(`✔ Migración completada. Abonos conservados: ${n}`);
}
