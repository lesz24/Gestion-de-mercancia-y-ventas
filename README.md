# 📦 Sistema de Gestión — Inventario, Ventas y Cobros

Backoffice web con **Hono + Bun + SQLite**, pagos en **USD con tasa BCV**,
**abonos libres** (sin cuotas fijas) con **barra de progreso**, comprobantes
con nombre y notas opcionales.

## 🚀 Cómo abrir

### Opción 1: Directo con Bun
```bash
bun run src/server.js
```
→ Abrir **http://localhost:3000**

### Opción 2: Con Docker
```bash
docker compose up --build
```
→ Abrir **http://localhost:3000**

### Opción 3: Desarrollo (recarga automática)
```bash
bun run dev
```

## 🧭 Guía rápida

1. **Inventario** → productos con precio USD, cantidad y stock.
2. **Nueva Venta** → cliente + vendedor + producto + cantidad. Se crea la venta
   con el **total a pagar** (se descuenta el stock).
3. **Cuentas por Cobrar** → cada venta muestra una **barra de progreso**.
   - **➕ Registrar abono** → el coordinador escribe cuánto abona el cliente.
   - El monto se puede escribir **en USD o en Bs**: el otro se calcula solo con
     la tasa BCV. Se puede agregar **nota** y **comprobantes**.
   - Cuando lo abonado llega al total, la barra se completa y la venta queda
     **pagada**.

## 💵 Cómo se manejan los montos

- La **tasa BCV** se obtiene de **[DolarApi.com](https://dolarapi.com)** en vivo
  (se ve en el menú lateral).
- Los montos se **guardan en USD** en la base de datos.
- Se muestra el equivalente en **Bs** usando la tasa del momento del abono.
- Cada abono guarda su `tasa_bcv`.

## 💳 El modelo de abonos (sin cuotas fijas)

- Cada venta tiene un **total** (USD).
- Los pagos son **abonos libres**: cualquier monto, en cualquier momento.
- El **estado** se calcula solo:
  - `pendiente` → todavía no abonó nada
  - `parcial` → abonó algo pero falta
  - `pagado` → abonó el total
- No se puede abonar **más que el saldo pendiente**.

## 🧾 Comprobantes y notas

- Cada abono puede tener **una o varias imágenes**.
- Al agregar un comprobante, el **nombre es obligatorio** y la descripción es
  opcional.
- Cada abono puede llevar una **nota** opcional.

## 📁 Estructura

| Archivo / carpeta | Para qué sirve |
|---|---|
| `src/server.js` | Backend Hono (API REST + subida de imágenes) |
| `src/db.js` | Conexión a SQLite con `bun:sqlite` |
| `database/schema.sql` | Esquema de las tablas |
| `scripts/migrar-abonos.js` | Migración de cuotas fijas → abonos (una vez) |
| `public/` | Interfaz (HTML + Tailwind + JS) |
| `uploads/` | Imágenes de los comprobantes |
| `data/gestion.db` | Base de datos SQLite |
| `Dockerfile` / `docker-compose.yml` | Para correr con Docker |

## 🐳 Docker

```bash
docker compose up --build
```

Persiste `./data` (base de datos) y `./uploads` (comprobantes) fuera del contenedor.
