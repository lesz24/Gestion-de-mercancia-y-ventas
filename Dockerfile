# ============================================================
# Dockerfile — imagen del sistema con Bun
# Bun es el runtime (reemplaza a Node.js) y es mucho más rápido.
# ============================================================
FROM oven/bun:1-alpine

WORKDIR /app

# Copiar dependencias primero (para cachear capas)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Copiar el resto del código
COPY . .

# Puerto del servidor
EXPOSE 3000

# Comando de arranque
CMD ["bun", "run", "src/server.js"]
