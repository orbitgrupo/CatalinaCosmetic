# Despliegue en servidor SSH

Esta version puede correr en un VPS con Node.js 20 o superior.

## 1. Entrar al servidor

```bash
ssh usuario@IP_DEL_SERVIDOR
```

## 2. Instalar Node.js, Git y PM2

En Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y git nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 3. Clonar el proyecto

```bash
cd /var/www
sudo git clone https://github.com/orbitgrupo/CatalinaCosmetic.git catalina
sudo chown -R $USER:$USER /var/www/catalina
cd /var/www/catalina
```

Si ya existe:

```bash
cd /var/www/catalina
git pull origin main
```

## 4. Crear variables de entorno

```bash
cp .env.example .env
nano .env
```

Completa:

```env
PORT=3010
BASE_PATH=/catalina-cosmetic
CATALINA_SUPABASE_URL=https://TU-PROYECTO.supabase.co
CATALINA_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
CATALINA_SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY=sk_test_o_live...
STRIPE_WEBHOOK_SECRET=whsec_...
```

No subas `.env` a GitHub.

## 5. Construir e iniciar

```bash
npm install
npm run check
npm run build
pm2 start npm --name catalina -- start
pm2 save
pm2 startup
```

Prueba local en el servidor:

```bash
curl http://127.0.0.1:3010/catalina-cosmetic/
```

Si vas a usar la URL de Tailscale:

```text
https://wawawa.tail874953.ts.net/catalina-cosmetic/
```

deja `BASE_PATH=/catalina-cosmetic` en `.env`.

## 6. Configurar Nginx

Crea el archivo:

```bash
sudo nano /etc/nginx/sites-available/catalina
```

Contenido:

```nginx
server {
    server_name tudominio.com www.tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Para mantenerlo en la ruta que ya usabas, `https://wawawa.tail874953.ts.net/catalina-cosmetic/`, usa este bloque en el `server` que ya tenga ese dominio:

```nginx
location = /catalina-cosmetic {
    return 308 /catalina-cosmetic/;
}

location /catalina-cosmetic/ {
    proxy_pass http://127.0.0.1:3010/catalina-cosmetic/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location = /api/catalog {
    proxy_pass http://127.0.0.1:3010/api/catalog;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location = /api/create-checkout-session {
    proxy_pass http://127.0.0.1:3010/api/create-checkout-session;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location = /api/confirm-checkout-session {
    proxy_pass http://127.0.0.1:3010/api/confirm-checkout-session;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location = /api/stripe-webhook {
    proxy_pass http://127.0.0.1:3010/api/stripe-webhook;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /api/admin/ {
    proxy_pass http://127.0.0.1:3010/api/admin/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location ~ ^/(supabase-.*\.sql|SUPABASE_SETUP\.md)$ {
    proxy_pass http://127.0.0.1:3010;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Activa el sitio:

```bash
sudo ln -s /etc/nginx/sites-available/catalina /etc/nginx/sites-enabled/catalina
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Activar SSL

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tudominio.com -d www.tudominio.com
```

## 8. Stripe webhook

En Stripe, cambia el endpoint webhook a:

```text
https://tudominio.com/api/stripe-webhook
```

Copia el nuevo `whsec_...` en `.env` y reinicia:

```bash
pm2 restart catalina --update-env
```

## Media de inicio

Las imagenes y videos que subas desde el admin para la pagina de inicio se guardan en:

```text
/var/www/catalina/public/uploads/home-media/
```

El admin genera automaticamente la URL publica bajo `/catalina-cosmetic/uploads/home-media/...`. Mantén esa carpeta con permisos de escritura para el usuario que ejecuta PM2.

## Actualizar despues de cambios

```bash
cd /var/www/catalina
git pull origin main
npm install
npm run check
npm run build
pm2 restart catalina --update-env
```
