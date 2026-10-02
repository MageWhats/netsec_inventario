import { TablaReporte } from '@/features/reportes/components/TablaReporte'
import { columnasLineas, type LineaAsiento } from './columnasLineas'

export function TablaLineas({ lineas }: { lineas: LineaAsiento[] }) {
  return <TablaReporte columnas={columnasLineas} filas={lineas} clave={(l) => l.id} vacio="Sin líneas." />
}
