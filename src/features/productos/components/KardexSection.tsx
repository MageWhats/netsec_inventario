import { Link } from 'react-router-dom'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { MenuExportar } from '@/components/ui/MenuExportar'
import { TipoMovimientoBadge } from '@/features/movimientos/components/MovimientosTabla'
import { formatearNumero, tiposMovimiento } from '@/features/movimientos/tipos'
import { tablaDesdeColumnas, type ColumnaExportable } from '@/lib/exportar'
import { formatearFecha } from '@/lib/format'
import { useKardex } from '../api'

type FilaKardex = NonNullable<ReturnType<typeof useKardex>['data']>[number]

const tercero = (f: FilaKardex) => f.proveedor?.nombre ?? f.cliente?.nombre ?? f.notas ?? f.referencia ?? '—'

const columnasExportacion: ColumnaExportable<FilaKardex>[] = [
  { titulo: 'Fecha', valor: (f) => formatearFecha(f.fecha) },
  { titulo: 'Movimiento', valor: (f) => formatearNumero(f.numero) },
  { titulo: 'Tipo', valor: (f) => tiposMovimiento[f.tipo].label },
  { titulo: 'Tercero / motivo', valor: tercero },
  { titulo: 'Referencia', valor: (f) => f.referencia },
  { titulo: 'Entra', valor: (f) => f.entra || null, numerica: true },
  { titulo: 'Sale', valor: (f) => f.sale || null, numerica: true },
  { titulo: 'Saldo', valor: (f) => f.saldo, numerica: true },
]

interface KardexSectionProps {
  producto: { id: string; sku: string; nombre: string }
}

export function KardexSection({ producto }: KardexSectionProps) {
  const { data: filas = [], isLoading, error } = useKardex(producto.id)

  return (
    <section className="mb-6 rounded-2xl border border-brand-border bg-brand-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border p-6">
        <div>
          <h2 className="font-semibold">Kardex</h2>
          <p className="mt-1 text-sm text-slate-400">Todos los movimientos del producto con el saldo después de cada uno.</p>
        </div>
        <MenuExportar
          disabled={filas.length === 0}
          documento={() => ({
            archivo: `kardex_${producto.sku}`,
            titulo: `Kardex · ${producto.nombre}`,
            subtitulo: `SKU ${producto.sku} · más recientes primero`,
            ...tablaDesdeColumnas(columnasExportacion, filas),
          })}
        />
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <p className="p-6 text-sm text-red-400">No se pudo cargar el kardex: {error.message}</p>
      ) : filas.length === 0 ? (
        <p className="p-10 text-center text-sm text-slate-500">Este producto todavía no tiene movimientos.</p>
      ) : (
        <div className="max-h-[32rem] overflow-auto rounded-b-2xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-brand-border bg-brand-card text-left text-xs tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Movimiento</th>
                <th className="px-4 py-3 font-medium">Tercero / motivo</th>
                <th className="px-4 py-3 text-right font-medium">Entra</th>
                <th className="px-4 py-3 text-right font-medium">Sale</th>
                <th className="px-4 py-3 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {filas.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-300">{formatearFecha(f.fecha)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link to={`/movimientos/${f.id}`} className="mr-2 font-mono hover:text-brand-cyan">
                      {formatearNumero(f.numero)}
                    </Link>
                    <TipoMovimientoBadge tipo={f.tipo} />
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-400">
                    {tercero(f)}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-400">{f.entra || ''}</td>
                  <td className="px-4 py-3 text-right text-red-400">{f.sale || ''}</td>
                  <td className="px-4 py-3 text-right font-semibold">{f.saldo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
