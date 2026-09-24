import { ArrowLeftRight, Boxes, Receipt, type LucideIcon } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { ReporteInventario } from './components/ReporteInventario'
import { ReporteMovimientos } from './components/ReporteMovimientos'
import { ReporteVentas } from './components/ReporteVentas'

interface InfoReporte {
  label: string
  descripcion: string
  icono: LucideIcon
  componente: () => React.JSX.Element
}

const reportes = {
  inventario: {
    label: 'Inventario valorizado',
    descripcion: 'Existencias actuales por producto, a costo y a precio de venta',
    icono: Boxes,
    componente: ReporteInventario,
  },
  ventas: {
    label: 'Ventas',
    descripcion: 'Salidas de un período agrupadas por producto o por cliente, con margen estimado',
    icono: Receipt,
    componente: ReporteVentas,
  },
  movimientos: {
    label: 'Movimientos',
    descripcion: 'Detalle línea por línea de entradas, salidas y ajustes de un período',
    icono: ArrowLeftRight,
    componente: ReporteMovimientos,
  },
} satisfies Record<string, InfoReporte>

type ClaveReporte = keyof typeof reportes

const esClaveReporte = (valor: string | null): valor is ClaveReporte => valor !== null && valor in reportes

export function ReportesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const actual = searchParams.get('r')
  const clave: ClaveReporte = esClaveReporte(actual) ? actual : 'inventario'
  const { descripcion, componente: Componente } = reportes[clave]

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Reportes" description={descripcion} />

        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-brand-border" role="tablist">
          {Object.entries(reportes).map(([id, { label, icono: Icono }]) => (
            <button
              key={id}
              role="tab"
              aria-selected={id === clave}
              onClick={() => setSearchParams({ r: id }, { replace: true })}
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
      </div>

      {/* key: cada reporte arranca con sus filtros por defecto */}
      <Componente key={clave} />
    </>
  )
}
