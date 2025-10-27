# Despliegue en AWS Lightsail (Fase 5)

Este documento describe cómo desplegar el sitio con Docker + Caddy en una instancia de AWS Lightsail.

## Requisitos
- Instancia Lightsail (Ubuntu) con IP estática asignada.
- Puertos 80 y 443 abiertos en el panel de red de Lightsail.

## 1) Instalar Docker y Compose plugin
```bash
sudo apt-get update -y
sudo apt-get install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

## 2) Traer el repo
```bash
git clone https://github.com/tu-usuario/tu-repo.git
cd tu-repo
```

Coloca aquí el repo que contiene `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `.env.example` y la carpeta `server/` del proyecto (ya están en este repo).

## 3) Variables de entorno (unificadas)
```bash
cp .env.example .env
nano .env
```
- Define credenciales de administración: `ADMIN_USER`, `ADMIN_PASS`, `ADMIN_JWT_SECRET`.
- Mantén `NODE_ENV=production` en producción.
- Configura credenciales de Mercado Pago (producción): `MP_PUBLIC_KEY`, `MP_ACCESS_TOKEN`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`.

En `Caddyfile`, reemplaza `tu@correo.com` por tu email real.

## 4) Build & Up
```bash
sudo docker compose up -d --build
```

## 5) Logs (opcional)
```bash
sudo docker compose logs -f
```

## 6) Red y DNS en Lightsail
- En el panel de la instancia, habilita puertos 80 (HTTP) y 443 (HTTPS).
- Asigna una IP estática a la instancia.

## 7) Verificación
- Abre `https://tu-dominio` y verifica respuesta 200.
- También puedes ejecutar:
```bash
curl -I https://tu-dominio
```

Si todo está correcto, Caddy habrá emitido certificados TLS automáticamente y actuará como reverse proxy hacia `web:8080`. Las imágenes subidas persistirán en el volumen `uploads`.
