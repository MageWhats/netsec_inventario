import { ArrowLeftRight, ClipboardCheck, FileBarChart, LayoutDashboard, LogOut, Menu, Package, Settings, Truck, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigation } from 'react-router-dom'
import { LogoHorizontal } from '@/components/ui/Logo'
import { useAuth } from '@/features/auth/auth-context'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/productos', label: 'Productos', icon: Package, end: false },
  { to: '/movimientos', label: 'Movimientos', icon: ArrowLeftRight, end: false },
  { to: '/clientes', label: 'Clientes', icon: Users, end: false },
  { to: '/proveedores', label: 'Proveedores', icon: Truck, end: false },
  { to: '/inventario', label: 'Toma de inventario', icon: ClipboardCheck, end: false },
  { to: '/reportes', label: 'Reportes', icon: FileBarChart, end: false },
  { to: '/configuracion', label: 'Configuración', icon: Settings, end: false },
]

export function AppLayout() {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  // Cargando el código de otra página (rutas con carga diferida)
  const cargando = useNavigation().state === 'loading'

  return (
    <div className="flex min-h-screen">
      {cargando && (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-brand-accent print:hidden" role="progressbar" aria-label="Cargando" />
      )}
      {/* Fondo oscuro al abrir el menú en móvil */}
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col print:hidden border-r border-brand-border bg-brand-card transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link to="/" onClick={() => setOpen(false)} aria-label="Ir al dashboard">
            <LogoHorizontal />
          </Link>
          <button className="text-slate-400 lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menú">
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-brand-accent/15 text-brand-accent'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-brand-border p-4">
          <p className="truncate text-xs text-slate-500" title={user?.email}>
            {user?.email}
          </p>
          <button
            onClick={signOut}
            className="mt-2 flex items-center gap-2 text-sm text-slate-400 transition hover:text-red-400"
          >
            <LogOut className="size-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center border-b border-brand-border px-4 lg:hidden print:hidden">
          <button onClick={() => setOpen(true)} className="text-slate-300" aria-label="Abrir menú">
            <Menu className="size-6" />
          </button>
          <Link to="/" className="ml-4" aria-label="Ir al dashboard">
            <LogoHorizontal />
          </Link>
        </header>
        <main className="flex-1 p-4 lg:p-8 print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
