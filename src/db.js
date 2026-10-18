// ============================================================
// CONEXIÓN A LA BASE DE DATOS — usando bun:sqlite (nativo de Bun)
// Bun ya trae SQLite integrado, no hay que instalar nada extra.
// ============================================================
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(import.meta.dir, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'gestion.db'), { create: true });

// Activar claves foráneas y modo WAL (más rápido y seguro)
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Crear tablas si no existen
import { readFileSync } from 'fs';
const schema = readFileSync(join(import.meta.dir, '..', 'database', 'schema.sql'), 'utf-8');
db.exec(schema);

export default db;
