# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# Sharp en Alpine
RUN apk add --no-cache libc6-compat

# Instalar dependencias (producción)
COPY package*.json ./
RUN npm ci --only=production

# Copiar el proyecto
COPY . .

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]

