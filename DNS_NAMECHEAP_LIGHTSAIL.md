# DNS con Namecheap + Lightsail (Fase 6)

Objetivo: que `elpelasorteos.shop` y `www.elpelasorteos.shop` apunten a tu instancia de Lightsail donde corre Caddy.

## Opción A: Usar DNS de Namecheap (recomendado)
1) En Namecheap > Domain List > Manage > Advanced DNS:
- A (@) → IP estática de tu instancia Lightsail
  - Host: `@`
  - Value: `X.X.X.X` (IP estática de Lightsail)
  - TTL: `Automatic` o `30 min`
- CNAME (www) → `elpelasorteos.shop`
  - Host: `www`
  - Value: `elpelasorteos.shop`
  - TTL: `Automatic`

2) Esperar propagación DNS (puede tardar minutos a horas).

3) Verificar resolución:
```bash
nslookup elpelasorteos.shop
nslookup www.elpelasorteos.shop
```
- Debe devolver la IP de Lightsail para el root (`A`) y un CNAME para `www` que finalmente resuelve a la misma IP.

## Opción B: Usar zona DNS de Lightsail
1) En Lightsail > Networking > Create DNS zone y añade tu dominio.
2) Copia los nameservers que te da Lightsail.
3) En Namecheap > Domain List > Manage > Nameservers: selecciona “Custom DNS” y pega los 4 nameservers de Lightsail.
4) En la zona de Lightsail crea:
- A (@) → IP estática de tu instancia
- CNAME (www) → `elpelasorteos.shop`

5) Espera propagación y verifica con `nslookup` como arriba.

## Caddy y certificados
- El `Caddyfile` ya incluye:
```
elpelasorteos.shop, www.elpelasorteos.shop {
  encode zstd gzip
  tls tu@correo.com
  reverse_proxy web:8080
}
```
- Cuando DNS resuelva correctamente hacia tu instancia, Caddy emitirá certificados TLS automáticamente para ambos hosts.

## Comprobaciones útiles
- HTTP/2 OK:
```bash
curl -I https://elpelasorteos.shop
curl -I https://www.elpelasorteos.shop
```
- Logs de Caddy (renovación/emitir cert):
```bash
sudo docker compose logs -f caddy
```

## Notas
- Si usas Cloudflare proxy (nube naranja), puede interferir. Para emitir cert primero, usa “DNS only” (nube gris) temporalmente.
- No dupliques DNS entre Namecheap y Lightsail a la vez: elige una sola autoridad (Namecheap o la zona de Lightsail) para evitar resultados inconsistentes.
- No necesitas `AAAA` (IPv6) a menos que tu instancia lo soporte y quieras habilitarlo.

