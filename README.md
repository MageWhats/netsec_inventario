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

Reglas clave:

- El stock **no se edita a mano**: se calcula a partir de los movimientos (vista `stock_actual`).
- Los movimientos solo se crean con `registrar_movimiento()`, que valida el stock, los seriales y los estados en una
  sola transacción. Son **inmutables**: no se editan ni se borran, y las correcciones se hacen con ajustes.
- Clientes, proveedores y productos no se borran: se desactivan, para conservar el historial.

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
