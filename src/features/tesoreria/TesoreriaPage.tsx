import { ArrowRightLeft, ChartLine, CircleDollarSign, FileCheck2, HandCoins, Hourglass, Landmark, Receipt, Repeat, type LucideIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { usePermisos } from '@/features/auth/permisos'
import { useConfiguracionContable } from '@/features/contabilidad/api'
import { TabAnticipos } from './components/TabAnticipos'
import { TabConciliacion } from './components/TabConciliacion'
import { TabFlujo } from './components/TabFlujo'
import { TabCuentas } from './components/TabCuentas'
import { TabEdades } from './components/TabEdades'
import { TabEgresos } from './components/TabEgresos'
import { TabGastos } from './components/TabGastos'
import { TabRecurrentes } from './components/TabRecurrentes'
import { TabTraslados } from './components/TabTraslados'

interface InfoTab {
  label: string
  descripcion: string
  icono: LucideIcon
  componente: () => React.JSX.Element
}

const tabs = {
  cuentas: {
    label: 'Cajas y bancos',
    descripcion: 'Cuánto dinero hay en cada caja y cuenta bancaria, según la contabilidad',
    icono: Landmark,
    componente: TabCuentas,
  },
  gastos: {
    label: 'Gastos',
    descripcion: 'Gastos del día a día por categoría: arriendo, servicios, transporte, papelería…',
    icono: CircleDollarSign,
    componente: TabGastos,
  },
  recurrentes: {
    label: 'Recurrentes',
    descripcion: 'Gastos que se repiten cada mes y las categorías de gasto',
    icono: Repeat,
    componente: TabRecurrentes,
  },
  egresos: {
    label: 'Egresos',
    descripcion: 'Pagos a proveedores y otros pagos: cada uno baja la caja o el banco del que sale',
    icono: Receipt,
    componente: TabEgresos,
  },
  traslados: {
    label: 'Traslados',
    descripcion: 'Dinero que pasa de una caja o banco a otro',
    icono: ArrowRightLeft,
    componente: TabTraslados,
  },
  anticipos: {
    label: 'Anticipos',
    descripcion: 'Pagos de clientes antes de la venta, que luego se aplican a sus ventas a crédito',
    icono: HandCoins,
    componente: TabAnticipos,
  },
  edades: {
    label: 'Edades',
    descripcion: 'Quién debe y a quién se le debe, por antigüedad',
    icono: Hourglass,
    componente: TabEdades,
  },
  conciliacion: {
    label: 'Conciliación',
    descripcion: 'El extracto de cada banco contra los libros, mes a mes',
    icono: FileCheck2,
    componente: TabConciliacion,
  },
  flujo: {
    label: 'Flujo de caja',
    descripcion: 'Lo que se espera cobrar y pagar en las próximas semanas, y de dónde vino el dinero',
    icono: ChartLine,
    componente: TabFlujo,
  },
} satisfies Record<string, InfoTab>

type ClaveTab = keyof typeof tabs
const esClaveTab = (valor: string | null): valor is ClaveTab => valor !== null && valor in tabs

export function TesoreriaPage() {
  const [params, setParams] = useSearchParams()
  const actual = params.get('t')
  const clave: ClaveTab = esClaveTab(actual) ? actual : 'cuentas'
  const { descripcion, componente: Componente } = tabs[clave]
  const { llevaContabilidad } = usePermisos()
  const config = useConfiguracionContable()

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Tesorería" description={descripcion} />
        {config.data && !config.data.fecha_inicio && (
          <p className="mb-4 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
            Los egresos, traslados y anticipos se registran desde la fecha de arranque de la contabilidad.{' '}
            {llevaContabilidad && (
              <Link to="/contabilidad?t=configuracion" className="underline">
                Defínela en Contabilidad → Configuración
              </Link>
            )}
          </p>
        )}
        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-brand-border" role="tablist">
          {Object.entries(tabs).map(([id, { label, icono: Icono }]) => (
            <button
              key={id}
              role="tab"
              aria-selected={id === clave}
              onClick={() => setParams({ t: id }, { replace: true })}
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
      <Componente key={clave} />
    </>
  )
}
