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
  features/     un módulo por funcionalidad (auth, productos, movimientos, dashboard)
  types/        tipos (incluye los generados desde Supabase)
```
