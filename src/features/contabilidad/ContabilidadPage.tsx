import { BookOpen, CalendarCheck, ChartColumn, HandCoins, Landmark, Laptop, ListTree, Scale, Settings2, UserRound, Wallet, type LucideIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { usePermisos } from '@/features/auth/permisos'
import { useConfiguracionContable } from './api'
import { TabActivos } from './components/TabActivos'
import { TabAuxiliar } from './components/TabAuxiliar'
import { TabBalance } from './components/TabBalance'
import { TabConfiguracion } from './components/TabConfiguracion'
import { TabCuentas } from './components/TabCuentas'
import { TabDiario } from './components/TabDiario'
import { TabEstados } from './components/TabEstados'
import { TabImpuestos } from './components/TabImpuestos'
import { TabPeriodos } from './components/TabPeriodos'
import { TabSaldosTerceros } from './components/TabSaldosTerceros'
import { TabTerceros } from './components/TabTerceros'

interface InfoTab {
  label: string
  descripcion: string
  icono: LucideIcon
  componente: () => React.JSX.Element
}

const tabs = {
  diario: {
    label: 'Libro diario',
    descripcion: 'Todos los comprobantes en orden de fecha, con sus débitos y créditos',
    icono: BookOpen,
    componente: TabDiario,
  },
  balance: {
    label: 'Balance de prueba',
    descripcion: 'Saldo anterior, movimientos y saldo final de cada cuenta en el período',
    icono: Scale,
    componente: TabBalance,
  },
  estados: {
    label: 'Estados financieros',
    descripcion: 'Estado de resultados del período y estado de situación financiera a una fecha',
    icono: ChartColumn,
    componente: TabEstados,
  },
  auxiliar: {
    label: 'Auxiliar',
    descripcion: 'El detalle de una cuenta con el saldo línea a línea',
    icono: Wallet,
    componente: TabAuxiliar,
  },
  saldos: {
    label: 'Por cobrar y por pagar',
    descripcion: 'Lo que debe cada cliente y lo que se le debe a cada proveedor, según la contabilidad',
    icono: HandCoins,
    componente: TabSaldosTerceros,
  },
  cuentas: {
    label: 'Plan de cuentas',
    descripcion: 'PUC de Net&Sec: solo las cuentas de último nivel reciben movimientos',
    icono: ListTree,
    componente: TabCuentas,
  },
  terceros: {
    label: 'Terceros',
    descripcion: 'Comerciantes, DIAN, bancos y demás terceros que no son clientes ni proveedores',
    icono: UserRound,
    componente: TabTerceros,
  },
  impuestos: {
    label: 'Impuestos',
    descripcion: 'Base del ICA por bimestre y retenciones que practicaron los clientes',
    icono: Landmark,
    componente: TabImpuestos,
  },
  activos: {
    label: 'Activos fijos',
    descripcion: 'Computadores, muebles y equipos con su depreciación mensual',
    icono: Laptop,
    componente: TabActivos,
  },
  periodos: {
    label: 'Periodos',
    descripcion: 'Cierre mensual con su lista de chequeo, y cierre del ejercicio',
    icono: CalendarCheck,
    componente: TabPeriodos,
  },
  configuracion: {
    label: 'Configuración',
    descripcion: 'Fecha de arranque, régimen, impuestos y cuentas de los asientos automáticos',
    icono: Settings2,
    componente: TabConfiguracion,
  },
} satisfies Record<string, InfoTab>

type ClaveTab = keyof typeof tabs
const esClaveTab = (valor: string | null): valor is ClaveTab => valor !== null && valor in tabs

export function ContabilidadPage() {
  const [params, setParams] = useSearchParams()
  const actual = params.get('t')
  const clave: ClaveTab = esClaveTab(actual) ? actual : 'diario'
  const { descripcion, componente: Componente } = tabs[clave]
  const { llevaContabilidad } = usePermisos()
  const config = useConfiguracionContable()
  const sinArranque = config.data && !config.data.fecha_inicio

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Contabilidad" description={descripcion} />

        {sinArranque && clave !== 'configuracion' && (
          <p className="mb-4 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
            La contabilidad aún no tiene fecha de arranque.{' '}
            {llevaContabilidad ? (
              <Link to="/contabilidad?t=configuracion" className="underline">
                Defínela en Configuración
              </Link>
            ) : (
              'La define la contadora en Configuración'
            )}
            : el primer día de un mes, con inventario físico ese día.
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

      {/* key: cada pestaña arranca con sus filtros por defecto */}
      <Componente key={clave} />
    </>
  )
}
