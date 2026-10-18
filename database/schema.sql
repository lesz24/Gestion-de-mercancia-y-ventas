-- ============================================================
-- ESQUEMA V4 — Abonos libres (sin cuotas fijas)
-- ------------------------------------------------------------
-- Cambios respecto a V3:
--   * Las ventas YA NO tienen número fijo de cuotas.
--   * La tabla Pagos ahora guarda ABONOS: cada fila es un pago
--     real que hizo el cliente, por cualquier monto.
--   * El estado de la venta se calcula según lo abonado:
--       0                 -> pendiente
--       mayor a 0 y <total -> parcial
--       >= total           -> pagado
-- ============================================================

CREATE TABLE IF NOT EXISTS Productos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre         TEXT    NOT NULL,
    descripcion    TEXT    DEFAULT '',
    precio_usd     REAL    NOT NULL,
    -- cuotas del producto: solo REFERENCIA informativa, ya no genera cuotas
    cuotas         INTEGER NOT NULL DEFAULT 1 CHECK (cuotas >= 1),
    cantidad_total INTEGER NOT NULL DEFAULT 0,
    stock_actual   INTEGER NOT NULL DEFAULT 0,
    creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS Ventas (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha               TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    cliente_nombre      TEXT    NOT NULL,
    cliente_telefono    TEXT    DEFAULT '',
    vendedor            TEXT    DEFAULT '',
    producto_id         INTEGER NOT NULL REFERENCES Productos(id) ON DELETE RESTRICT,
    cantidad            INTEGER NOT NULL DEFAULT 1,
    precio_unitario_usd REAL    NOT NULL,
    total_usd           REAL    NOT NULL,
    estado_pago         TEXT    NOT NULL DEFAULT 'pendiente'
                        CHECK (estado_pago IN ('pendiente', 'parcial', 'pagado'))
);

-- ABONOS: cada pago que hace el cliente (monto libre)
CREATE TABLE IF NOT EXISTS Pagos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id    INTEGER NOT NULL REFERENCES Ventas(id) ON DELETE CASCADE,
    monto_usd   REAL    NOT NULL,                 -- monto en USD (se guarda en USD)
    monto_bs    REAL,                             -- equivalente en Bs al momento de abonar
    monto_usdt  REAL,                             -- monto en USDT (carga manual, no se calcula)
    tasa_bcv    REAL,                             -- tasa BCV usada en ese abono
    fecha_pago  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    metodo_pago TEXT    DEFAULT '',
    nota        TEXT    DEFAULT ''
);

CREATE TABLE IF NOT EXISTS Comprobantes_Pago (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pago_id         INTEGER NOT NULL REFERENCES Pagos(id) ON DELETE CASCADE,
    nombre          TEXT    NOT NULL,   -- obligatorio
    descripcion     TEXT    DEFAULT '', -- opcional
    ruta_imagen_url TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pagos_venta  ON Pagos(venta_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes ON Comprobantes_Pago(pago_id);
