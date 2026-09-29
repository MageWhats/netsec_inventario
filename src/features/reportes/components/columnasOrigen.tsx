import { Link } from 'react-router-dom'
import { formatearNumero } from '@/features/movimientos/tipos'
import type { Origen } from '../origen'
import type { Columna } from './TablaReporte'

/** undefined = aún cargando; [] = no se encontró la entrada; null = no aplica (la línea es una entrada) */
type OrigenFila = Origen[] | undefined | null

/** "NetE-000003" o, si salió de varias entradas, "NetE-000003 (2), NetA-000005 (1)" */
const describirEntradas = (origen: Origen[]) =>
  origen.map((o) => (origen.length > 1 ? `${formatearNumero(o)} (${o.cantidad})` : formatearNumero(o))).join(', ')

const unicos = (valores: (string | null)[]) => [...new Set(valores.filter(Boolean))].join(', ')

function textoOrigen(origen: OrigenFila, dato: (origen: Origen[]) => string) {
  if (origen === null) return ''
  if (origen === undefined) return '…'
  if (origen.length === 0) return 'Sin registro'
  return dato(origen) || '—'
}

/** Entrada de la que salió la mercancía, con su factura y proveedor */
export function columnasOrigen<T>(origenDe: (fila: T) => OrigenFila): Columna<T>[] {
  return [
    {
      titulo: 'Entrada (compra)',
      valor: (f) => textoOrigen(origenDe(f), describirEntradas),
      mostrar: (f) => {
        const origen = origenDe(f)
        if (!origen?.length) return <span className="text-slate-500">{textoOrigen(origen, describirEntradas)}</span>
        return (
          <span className="whitespace-nowrap">
            {origen.map((o, i) => (
              <span key={o.movimientoId}>
                {i > 0 && ', '}
                <Link to={`/movimientos/${o.movimientoId}`} className="font-mono hover:text-brand-cyan">
                  {formatearNumero(o)}
                </Link>
                {origen.length > 1 && <span className="text-slate-500"> ({o.cantidad})</span>}
              </span>
            ))}
          </span>
        )
      },
    },
    { titulo: 'Factura / referencia', valor: (f) => textoOrigen(origenDe(f), (o) => unicos(o.map((x) => x.referencia))) },
    { titulo: 'Proveedor', valor: (f) => textoOrigen(origenDe(f), (o) => unicos(o.map((x) => x.proveedor))) },
  ]
}
