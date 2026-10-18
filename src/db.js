// ============================================================
// CONEXIÓN A LA BASE DE DATOS — usando bun:sqlite (nativo de Bun)
// Bun ya trae SQLite integrado, no hay que instalar nada extra.
// ============================================================
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import { join } from 'path';

// Carpeta de datos: por defecto ../data (local).
// En Render se sobreescribe con DATA_DIR apuntando al disco persistente.
const DATA_DIR = process.env.DATA_DIR || join(import.meta.dir, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'gestion.db'), { create: true });

// Activar claves foráneas y modo WAL (más rápido y seguro)
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Crear tablas si no existen
import { readFileSync } from 'fs';
const schema = readFileSync(join(import.meta.dir, '..', 'database', 'schema.sql'), 'utf-8');
db.exec(schema);

// ------------------------------------------------------------
// MIGRACIONES para bases existentes (CREATE TABLE IF NOT EXISTS
// no agrega columnas nuevas a tablas ya creadas).
// ------------------------------------------------------------
const columnasPagos = db.query('PRAGMA table_info(Pagos)').all().map((c) => c.name);
if (!columnasPagos.includes('monto_usdt')) {
  db.exec('ALTER TABLE Pagos ADD COLUMN monto_usdt REAL');
  console.log('  🔧 Migración: Pagos.monto_usdt agregada.');
}

// ------------------------------------------------------------
// INVENTARIO INICIAL (seed)
// Si la base está vacía (primer arranque, disco nuevo en Render),
// se cargan los 4 productos. Solo corre si no hay NINGÚN producto.
// ------------------------------------------------------------
const totalProductos = db.query('SELECT COUNT(*) n FROM Productos').get().n;
if (totalProductos === 0) {
  const insert = db.query(
    'INSERT INTO Productos (nombre, descripcion, precio_usd, cuotas, cantidad_total, stock_actual) VALUES (?,?,?,?,?,?)'
  );
  db.exec('BEGIN');
  insert.run('UPS', '', 70, 3, 50, 39);
  insert.run('Power Bank', '', 70, 3, 35, 34);
  insert.run('Mochila 1', '', 20, 2, 12, 12);
  insert.run('Mochila 2', '', 20, 2, 5, 5);
  db.exec('COMMIT');
  console.log('  🌱 Inventario inicial cargado (4 productos).');
}

export default db;
