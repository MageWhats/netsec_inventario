# Net&Sec Inventario

App web de inventario de Net&Sec Suministros.

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

Reglas clave:

- El stock **no se edita a mano**: se calcula a partir de los movimientos (vista `stock_actual`).
- Los movimientos solo se crean con `registrar_movimiento()`, que valida el stock, los seriales y los estados en una
  sola transacción. Son **inmutables**: no se editan ni se borran, y las correcciones se hacen con ajustes.
- Clientes, proveedores y productos no se borran: se desactivan, para conservar el historial.

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
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
