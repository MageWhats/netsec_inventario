import { Tags, UserCog, Warehouse, type LucideIcon } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { BodegasTab } from './components/BodegasTab'
import { CategoriasTab } from './components/CategoriasTab'
import { UsuariosTab } from './components/UsuariosTab'

interface InfoSeccion {
  label: string
  icono: LucideIcon
  componente: () => React.JSX.Element
}

const secciones = {
  categorias: { label: 'Categorías', icono: Tags, componente: CategoriasTab },
  bodegas: { label: 'Bodegas', icono: Warehouse, componente: BodegasTab },
  usuarios: { label: 'Usuarios', icono: UserCog, componente: UsuariosTab },
} satisfies Record<string, InfoSeccion>

type ClaveSeccion = keyof typeof secciones

const esClaveSeccion = (valor: string | null): valor is ClaveSeccion => valor !== null && valor in secciones

export function ConfiguracionPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const actual = searchParams.get('s')
  const clave: ClaveSeccion = esClaveSeccion(actual) ? actual : 'categorias'
  const { componente: Componente } = secciones[clave]

  return (
    <>
      <PageHeader title="Configuración" description="Catálogos generales de la aplicación" />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-brand-border" role="tablist">
        {Object.entries(secciones).map(([id, { label, icono: Icono }]) => (
          <button
            key={id}
            role="tab"
            aria-selected={id === clave}
            onClick={() => setSearchParams({ s: id }, { replace: true })}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm whitespace-nowrap transition ${
              id === clave
                ? 'border-brand-accent text-slate-100'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icono className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <Componente />
    </>
  )
}
