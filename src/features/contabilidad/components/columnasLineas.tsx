import type { Columna } from '@/features/reportes/components/TablaReporte'
import { formatearValor, type ComprobanteConLineas } from '../api'

export type LineaAsiento = ComprobanteConLineas['asientos'][number]

export const nombreTercero = (l: LineaAsiento) => l.cliente?.nombre ?? l.proveedor?.nombre ?? l.tercero?.nombre ?? null
export const documentoTercero = (l: LineaAsiento) =>
  l.cliente?.documento ?? l.proveedor?.nit ?? l.tercero?.documento ?? null

export const columnasLineas: Columna<LineaAsiento>[] = [
  {
    titulo: 'Cuenta',
    valor: (l) => l.cuenta,
    mostrar: (l) => <span className="font-mono">{l.cuenta}</span>,
    className: 'whitespace-nowrap text-slate-200',
  },
  { titulo: 'Nombre de la cuenta', valor: (l) => l.cuenta_info?.nombre ?? '', className: 'text-slate-300' },
  {
    titulo: 'Tercero',
    valor: (l) => nombreTercero(l),
    mostrar: (l) =>
      nombreTercero(l) ? (
        <>
          {nombreTercero(l)}
          {documentoTercero(l) && <span className="block text-xs text-slate-500">{documentoTercero(l)}</span>}
        </>
      ) : (
        '—'
      ),
    className: 'text-slate-300',
  },
  { titulo: 'Detalle', valor: (l) => l.descripcion, className: 'text-slate-400' },
  {
    titulo: 'Débito',
    valor: (l) => l.debito || null,
    mostrar: (l) => (l.debito ? formatearValor(l.debito) : ''),
    numerica: true,
    total: formatearValor,
  },
  {
    titulo: 'Crédito',
    valor: (l) => l.credito || null,
    mostrar: (l) => (l.credito ? formatearValor(l.credito) : ''),
    numerica: true,
    total: formatearValor,
  },
]
