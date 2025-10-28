# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app

# Usuario y grupo
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Node deps
COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=1
RUN npm ci --only=production

# Python + pip + sqlite
RUN apk add --no-cache python3 py3-pip sqlite \
 && ln -sf /usr/bin/python3 /usr/bin/python

# App
COPY . .

# Venv + deps Python (usa requirements si existe)
RUN python3 -m venv /opt/venv \
 && . /opt/venv/bin/activate \
 && pip install --no-cache-dir -U pip \
 && if [ -f /app/microservices/integracion_mercadopago_app/requirements.txt ]; then \
      pip install --no-cache-dir -r /app/microservices/integracion_mercadopago_app/requirements.txt ; \
    else \
      pip install --no-cache-dir requests python-dotenv ; \
    fi

# Que el venv quede primero en PATH
ENV PATH="/opt/venv/bin:${PATH}"

# Permisos
RUN chown -R appuser:appgroup /opt/venv /app
USER appuser

# Entorno Node
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT||8080) + '/api/content').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"
