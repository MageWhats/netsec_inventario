# Net&Sec Inventario

App web de inventario de Net&Sec Suministros.

**Producción:** https://netsec-inventario.vercel.app

## Despliegue

- **Vercel** publica automáticamente cada push a `main` del repositorio (privado) en GitHub. `vercel.json` hace que
  todas las rutas sirvan la app.
- Las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` se configuran en Vercel → Project Settings →
  Environment Variables. Si cambian, hay que volver a desplegar (*Redeploy*).
- En Supabase → Authentication → URL Configuration, la *Site URL* es la dirección de producción.
- Las **migraciones SQL no se aplican solas**: cuando haya una nueva en `supabase/migrations/`, ejecútala en el
  SQL Editor de Supabase **antes** de subir el código que la usa.

## Stack

- **Vite + React 19 + TypeScript**
- **Tailwind CSS v4** (tema en `src/index.css`)
- **Supabase** (Postgres, Auth, RLS)
- **TanStack Query** (datos del servidor) y **TanStack Table** (tablas)
- **React Hook Form + Zod** (formularios y validación)
- **React Router 7**, **Recharts**, **lucide-react**

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # rellena las claves de Supabase
npm run dev
```

## Base de datos

Las migraciones están en `supabase/migrations/` y se ejecutan **en orden** en Supabase → SQL Editor:

1. `0001_esquema_inicial.sql`: perfiles, catálogos, productos, unidades, movimientos y RLS.
2. `0002_clientes_y_movimientos.sql`: clientes, datos de proveedores, consecutivo de movimientos y la función
   `registrar_movimiento()`.
3. `0003_toma_inventario.sql`: tomas de inventario físico y las funciones para contar, escanear seriales y
   finalizar (genera los ajustes con `registrar_movimiento()`).
4. `0004_costo_en_salidas.sql`: las salidas y ajustes − guardan el costo del momento, para calcular el margen exacto.
5. `0005_auditoria.sql`: historial de cambios (quién, cuándo, qué) en productos, clientes, proveedores, categorías,
   bodegas, usuarios y MAC/notas de unidades. Se consulta en Reportes → Historial de cambios.
6. `0006_validaciones.sql`: reglas de formato y largo en la base de datos (las mismas de los formularios).
7. `0007_fotos_productos.sql`: espacio de fotos de productos en Supabase Storage (solo *admin* sube;
   máximo 2 MB; JPG, PNG o WebP).
8. `0008_consecutivo_por_tipo.sql`: cada serie de movimientos lleva su propio consecutivo: E (entradas),
   S (salidas) y A (ajustes + y −). Renumera los movimientos existentes.
9. `0009_costo_promedio.sql`: costo promedio ponderado. El precio de costo lo calcula la base de datos con cada
   entrada (ya no se edita a mano) y las salidas y ajustes − salen a ese promedio. Recalcula el costo actual de cada
   producto con su historial, sin tocar los movimientos ya registrados.

Reglas clave:

- El stock **no se edita a mano**: se calcula a partir de los movimientos (vista `stock_actual`).
- Los movimientos solo se crean con `registrar_movimiento()`, que valida el stock, los seriales y los estados en una
  sola transacción. Son **inmutables**: no se editan ni se borran, y las correcciones se hacen con ajustes.
- Clientes, proveedores y productos no se borran: se desactivan, para conservar el historial.

## Seguridad

| Medida | Cómo |
|---|---|
| Claves fuera del código y de Git | `.env.local` (ignorado) y variables de Vercel. Solo se usa la clave pública `anon` |
| Autorización en el servidor | RLS en todas las tablas: solo el rol *admin* lee y escribe. Los usuarios nuevos nacen como *lectura* (sin acceso) |
| Validación de entradas | En los formularios (Zod) **y** en la base de datos (migración 0006: largos y formatos de SKU, documento, email, teléfono, MAC, serial) |
| Datos que no se pueden manipular | Movimientos inmutables, stock calculado, tomas y ajustes solo mediante funciones que validan |
| Contenido del usuario | React escapa todo lo que muestra; el CSV neutraliza fórmulas de Excel (`=`, `+`, `-`, `@`) |
| Subida de archivos | Solo fotos de productos: la app las valida, reduce y limpia de metadatos (GPS); el servidor solo acepta JPG/PNG/WebP de hasta 2 MB subidos por *admin* (migración 0007) |
| Tamaño de las respuestas | Máximo 1000 filas por consulta (Supabase); la app pagina y los reportes avisan si llegan al tope |
| Historial de cambios | Migración 0005: quién cambió qué y cuándo (Reportes → Historial de cambios) |
| Cabeceras HTTP | `vercel.json`: CSP estricta, anti-iframe, `nosniff`, HSTS, permisos (solo cámara) |
| HTTPS | Vercel redirige `http://` a `https://` y HSTS obliga al navegador a usar siempre HTTPS |
| Contraseñas | Las gestiona Supabase Auth (bcrypt); la app nunca las guarda |
| Intentos de inicio y bots | Límites de Supabase Auth + CAPTCHA opcional con Cloudflare Turnstile |
| Dependencias | Dependabot (actualizaciones semanales) y `npm audit` en cada push (`.github/workflows/ci.yml`) |

### Ajustes en el panel de Supabase

- **Authentication → Sign In / Providers:** desactivar *Allow new users to sign up* (los usuarios se crean desde
  el panel, en Authentication → Users).
- **Authentication → Rate Limits:** revisar los límites de inicio de sesión.
- **Advisors → Security Advisor:** revisarlo después de cada migración.
- **Logs:** consultas a la base de datos (Postgres), a la API y a Auth (inicios de sesión y fallos).
- **Settings → API → Max rows:** dejarlo en 1000 (la app ya pide los datos por páginas).

### Activar el CAPTCHA (Cloudflare Turnstile, gratis)

Respeta el orden: si se activa en Supabase antes de que la app envíe la verificación, nadie podrá entrar.

1. En [dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile → Add widget**: dominios
   `netsec-inventario.vercel.app` y `localhost`, modo *Managed*. Copia la **Site Key** y la **Secret Key**.
2. En Vercel → Environment Variables, agrega `TURNSTILE_SITE_KEY` (o `VITE_TURNSTILE_SITE_KEY`) con la
   **Site Key**, marcada para *Production*, y haz *Redeploy* (en local, ponla también en `.env.local`).
   La Site Key es pública; la Secret Key nunca va en Vercel ni en la app.
3. Abre la app: debe aparecer la verificación de Cloudflare bajo la contraseña y el login debe funcionar.
4. Solo entonces, en Supabase → **Authentication → Attack Protection** → activa *CAPTCHA protection*, elige
   **Turnstile** y pega la **Secret Key**.

Si algo falla, desactiva el CAPTCHA en ese mismo panel de Supabase y el login vuelve a funcionar sin él.

## Copias de seguridad

Cada noche a las 2:00 a. m. (Colombia) la tarea `.github/workflows/respaldo.yml` exporta la base de datos de
Supabase (roles, estructura y datos, incluidos los usuarios), verifica que esté completa, la cifra con AES-256 y la
guarda **30 días** en GitHub → Actions → *Respaldo de la base de datos* → cada ejecución → *Artifacts*.
Si falla, GitHub envía un correo.

### Configuración (una sola vez)

En GitHub → Settings → Secrets and variables → **Actions** → *New repository secret*, crea dos secretos:

1. **`SUPABASE_DB_URL`**: en Supabase pulsa **Connect** (arriba) → **Session pooler** → copia la URI y reemplaza
   `[YOUR-PASSWORD]` por la contraseña de la base de datos. Queda así:
   `postgresql://postgres.<id>:<contraseña>@aws-0-<región>.pooler.supabase.com:5432/postgres`.
   Si no recuerdas la contraseña: Database → Settings → *Reset database password* (usa solo letras y números, así
   no hay que codificar caracteres especiales). Se usa el *Session pooler* porque GitHub no tiene IPv6.
2. **`BACKUP_PASSPHRASE`**: una contraseña larga (16 caracteres o más) para cifrar las copias.
   **Guárdala en un gestor de contraseñas: sin ella las copias no se pueden abrir.**

Luego, en Actions → *Respaldo de la base de datos* → **Run workflow**, para hacer la primera copia y comprobar que
todo funciona.

### Restaurar

Hazlo sobre un **proyecto nuevo de Supabase** (o uno de prueba), nunca directamente sobre producción sin tener
antes una copia reciente.

1. Descarga el artefacto de la fecha que necesitas (un `.zip` con el archivo `.tar.gz.gpg`) y descomprime el zip.
2. Descifra y extrae (en Git Bash, que ya trae `gpg`):
   ```bash
   gpg -d netsec-respaldo-AAAA-MM-DD_HHMM.tar.gz.gpg > respaldo.tar.gz   # pide la BACKUP_PASSPHRASE
   tar -xzf respaldo.tar.gz                                              # crea la carpeta respaldo/
   ```
3. Restaura con `psql` (viene con PostgreSQL) usando la URI del proyecto destino:
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file respaldo/roles.sql \
     --file respaldo/esquema.sql \
     --command 'SET session_replication_role = replica' \
     --file respaldo/datos.sql \
     --dbname "postgresql://postgres.<id>:<contraseña>@aws-0-<región>.pooler.supabase.com:5432/postgres"
   ```
   `--single-transaction` hace que, si algo falla, no quede nada a medias.
4. Si restauraste en un proyecto nuevo, cambia `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Vercel y vuelve a
   desplegar, y configura de nuevo en ese proyecto el CAPTCHA y la desactivación del registro público.

## Alertas de stock por correo

De lunes a sábado a las 7:00 a. m. (Colombia), `.github/workflows/alerta-stock.yml` ejecuta
`scripts/alerta_stock.py`: consulta en **solo lectura** los productos activos sin stock o en/por debajo del
mínimo y, **solo si hay alguno**, envía un correo con la lista y enlaces a la app. Usa el mismo secreto
`SUPABASE_DB_URL` de las copias de seguridad.

### Configuración (una sola vez)

1. **Contraseña de aplicación de Google** (la cuenta de Gmail que envía):
   myaccount.google.com → **Seguridad** → activa la *Verificación en 2 pasos* si no lo está → busca
   **Contraseñas de aplicaciones** → crea una llamada `Net&Sec Inventario` → copia el código de 16 letras.
   Se puede revocar en ese mismo lugar sin afectar la cuenta.
2. En GitHub → Settings → Secrets and variables → **Actions**, crea:
   - `SMTP_USUARIO`: el correo de Gmail que envía.
   - `SMTP_CLAVE`: la contraseña de aplicación (las 16 letras, sin espacios).
   - `ALERTA_DESTINATARIOS` *(opcional)*: correos que reciben, separados por coma. Si no se crea, llega al
     mismo `SMTP_USUARIO`, pero Gmail guarda los correos enviados a uno mismo en **Enviados**, no en la
     bandeja de entrada. Para recibirlos como correo nuevo, pon aquí otra dirección.
3. Actions → *Alerta de stock bajo* → **Run workflow** (con "Enviar aunque no haya productos por reponer"
   marcado) para recibir un correo de prueba.

Vista previa del correo sin base de datos ni envío: `python scripts/alerta_stock.py --prueba > alerta.html`.

## Escáner con el teléfono

Los botones con el ícono de código de barras abren la cámara (librería `barcode-detector`, motor ZXing en WebAssembly
servido desde la propia app). El navegador **solo permite la cámara en HTTPS**:

1. Ejecuta `npm run dev:movil` y abre en el teléfono la dirección `https://192.168.x.x:5173` que muestra la consola
   (el teléfono debe estar en la misma red Wi-Fi).
2. El certificado es local, así que el navegador mostrará una advertencia: toca *Configuración avanzada → Continuar*.
3. Acepta el permiso de cámara.

En producción el hosting ya sirve la app con HTTPS.

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run dev:movil` | Servidor HTTPS en la red local, para probar el escáner desde el teléfono |
| `npm run build` | Chequeo de tipos + build de producción |
| `npm run typecheck` | Solo chequeo de tipos |
| `npm run lint` | ESLint |

## Estructura

```
src/
  app/          router, providers, páginas globales
  lib/          cliente Supabase y utilidades
  components/ui componentes reutilizables
  features/     un módulo por funcionalidad (auth, productos, movimientos, clientes, proveedores, dashboard)
  types/        tipos (incluye los generados desde Supabase)
```
