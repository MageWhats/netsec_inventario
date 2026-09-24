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
| Subida de archivos | La app no acepta archivos (no usa Supabase Storage) |
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
