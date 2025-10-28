# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

# Usuario no-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Node deps
COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=1
RUN npm ci --only=production

# Python + pip + sqlite (CLI para inspecciones)
RUN apk add --no-cache python3 py3-pip sqlite \
 && ln -sf /usr/bin/python3 /usr/bin/python

# Copiar la app
COPY . .

# --- Crear venv e instalar deps Python ---
# (si hay requirements.txt lo usamos; si no, instalamos básicas)
RUN python3 -m venv /opt/venv \
 && . /opt/venv/bin/activate \
 && pip install --no-cache-dir -U pip \
 && if [ -f /app/microservices/integracion_mercadopago_app/requirements.txt ]; then \
      pip install --no-cache-dir -r /app/microservices/integracion_mercadopago_app/requirements.txt ; \
    else \
      pip install --no-cache-dir requests python-dotenv ; \
    fi \
 && chown -R appuser:appuser /opt/venv

# Que el venv quede primero en PATH
ENV PATH="/opt/venv/bin:${PATH}"

# Permisos app
RUN chown -R appuser:appgroup /app
USER appuser

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT||8080) + '/api/content').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"
