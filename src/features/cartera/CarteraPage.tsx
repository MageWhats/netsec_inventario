import { AlertTriangle, CalendarClock, HandCoins, Search, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { PageHeader } from '@/components/ui/PageHeader'
import { usePermisos } from '@/features/auth/permisos'
import { formatearNumero } from '@/features/movimientos/tipos'
import { num } from '@/features/reportes/cifras'
import { BarraProporcion, Ranking } from '@/features/reportes/components/resumen'
import { Cifra } from '@/features/reportes/components/TablaReporte'
import { mensajeError } from '@/lib/errores'
import { fechaIso } from '@/lib/exportar'
import { formatearPrecio } from '@/lib/format'
import { formatearFechaCorta } from '@/lib/garantia'
import { DIAS_AVISO, estadoCobro, useCartera, useRecaudo, type EstadoCobro, type VentaCredito } from './api'
import { EstadoCobroBadge } from './components/EstadoCobroBadge'
import { PagoModal } from './components/PagoModal'

type Filtro = 'pendientes' | 'vencidas' | 'pagadas' | 'todas'

const FILTROS: { valor: Filtro; label: string; incluye: (e: EstadoCobro) => boolean }[] = [
  { valor: 'pendientes', label: 'Pendientes', incluye: (e) => e !== 'pagada' },
  { valor: 'vencidas', label: 'Vencidas', incluye: (e) => e === 'vencida' },
  { valor: 'pagadas', label: 'Pagadas', incluye: (e) => e === 'pagada' },
  { valor: 'todas', label: 'Todas', incluye: () => true },
]

/** Tramos de antigüedad de lo vencido */
const TRAMOS = [
  { label: 'Al día', color: 'bg-blue-500', incluye: (d: number) => d === 0 },
  { label: '1–30 días', color: 'bg-amber-400', incluye: (d: number) => d >= 1 && d <= 30 },
  { label: '31–60 días', color: 'bg-orange-500', incluye: (d: number) => d >= 31 && d <= 60 },
  { label: '61–90 días', color: 'bg-red-500', incluye: (d: number) => d >= 61 && d <= 90 },
  { label: 'Más de 90', color: 'bg-red-700', incluye: (d: number) => d > 90 },
]

const inicioMes = () => {
  const d = new Date()
  return fechaIso(new Date(d.getFullYear(), d.getMonth(), 1))
}

export function CarteraPage() {
  const { data: ventas = [], isLoading, error } = useCartera()
  const recaudo = useRecaudo(inicioMes())
  const { esAdmin } = usePermisos()
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState<Filtro>('pendientes')
  const [busqueda, setBusqueda] = useState('')
  const [abonando, setAbonando] = useState<VentaCredito | null>(null)

  const conEstado = useMemo(() => ventas.map((v) => ({ ...v, estado: estadoCobro(v) })), [ventas])
  const pendientes = conEstado.filter((v) => v.saldo > 0)

  const r = useMemo(() => {
    const suma = (lista: typeof pendientes) => lista.reduce((s, v) => s + v.saldo, 0)
    const vencidas = pendientes.filter((v) => v.estado === 'vencida')
    const porVencer = pendientes.filter((v) => v.estado === 'por_vencer')
    const porCliente = new Map<string, { nombre: string; saldo: number; ventas: number; vencido: number }>()
    for (const v of pendientes) {
      const c = porCliente.get(v.cliente_id) ?? { nombre: v.cliente_nombre, saldo: 0, ventas: 0, vencido: 0 }
      c.saldo += v.saldo
      c.ventas++
      if (v.estado === 'vencida') c.vencido += v.saldo
      porCliente.set(v.cliente_id, c)
    }
    return {
      total: suma(pendientes),
      vencido: suma(vencidas),
      vencidas: vencidas.length,
      porVencer: suma(porVencer),
      nPorVencer: porVencer.length,
      clientes: porCliente.size,
      tramos: TRAMOS.map((t) => ({ ...t, valor: suma(pendientes.filter((v) => t.incluye(v.dias_vencida))) })),
      topClientes: [...porCliente.entries()]
        .sort((a, b) => b[1].saldo - a[1].saldo)
        .slice(0, 5)
        .map(([id, c]) => ({
          clave: id,
          nombre: c.nombre,
          valor: c.saldo,
          texto: formatearPrecio(c.saldo),
          title: `${c.nombre}: ${formatearPrecio(c.saldo)} en ${c.ventas} ${c.ventas === 1 ? 'venta' : 'ventas'}${c.vencido > 0 ? ` (${formatearPrecio(c.vencido)} vencido)` : ''}`,
          ruta: `/clientes/${id}`,
        })),
    }
  }, [pendientes])

  const texto = busqueda.trim().toLowerCase()
  const incluye = FILTROS.find((f) => f.valor === filtro)!.incluye
  const filas = conEstado.filter(
    (v) =>
      incluye(v.estado) &&
      (!texto ||
        v.cliente_nombre.toLowerCase().includes(texto) ||
        formatearNumero({ numero: v.numero, tipo: 'salida' }).toLowerCase().includes(texto) ||
        v.referencia?.toLowerCase().includes(texto)),
  )
  // Pendientes: primero lo más vencido; el resto, lo más reciente primero
  if (filtro !== 'pendientes' && filtro !== 'vencidas') filas.reverse()

  return (
    <>
      <PageHeader title="Cartera" description="Lo que los clientes deben por ventas a crédito, y sus abonos" />

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {mensajeError(error)}
        </p>
      ) : ventas.length === 0 ? (
        <div className="rounded-2xl border border-brand-border bg-brand-card">
          <EstadoVacio
            icono={Wallet}
            titulo="No hay ventas a crédito"
            descripcion={
              <>
                Al registrar una salida, elige <strong>Crédito</strong> en la forma de pago y la venta aparecerá aquí
                hasta que el cliente la pague. Las ventas a crédito anteriores se pueden pasar a crédito desde su
                detalle.
              </>
            }
          />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cifra
              label="Por cobrar"
              valor={formatearPrecio(r.total)}
              detalle={`${num(pendientes.length)} ${pendientes.length === 1 ? 'venta' : 'ventas'} · ${num(r.clientes)} ${r.clientes === 1 ? 'cliente' : 'clientes'}`}
              icono={Wallet}
              tono="bg-brand-cyan/15 text-brand-cyan"
            />
            <Cifra
              label="Vencido"
              valor={<span className={r.vencido > 0 ? 'text-red-400' : ''}>{formatearPrecio(r.vencido)}</span>}
              detalle={
                r.vencidas > 0
                  ? `${num(r.vencidas)} ${r.vencidas === 1 ? 'venta vencida' : 'ventas vencidas'}`
                  : 'Nada vencido'
              }
              icono={AlertTriangle}
              tono="bg-red-500/15 text-red-400"
            >
              <BarraProporcion
                a={r.vencido}
                b={r.total - r.vencido}
                colorA="bg-red-500"
                colorB="bg-blue-500"
                title={`Vencido ${formatearPrecio(r.vencido)} · Al día ${formatearPrecio(r.total - r.vencido)}`}
              />
            </Cifra>
            <Cifra
              label="Por vencer"
              valor={formatearPrecio(r.porVencer)}
              detalle={`${num(r.nPorVencer)} ${r.nPorVencer === 1 ? 'venta' : 'ventas'} en los próximos ${DIAS_AVISO} días`}
              icono={CalendarClock}
              tono="bg-amber-500/15 text-amber-400"
            />
            <Cifra
              label="Recaudado este mes"
              valor={recaudo.data ? formatearPrecio(recaudo.data.total) : '…'}
              detalle={recaudo.data && `${num(recaudo.data.abonos)} ${recaudo.data.abonos === 1 ? 'abono' : 'abonos'}`}
              icono={HandCoins}
              tono="bg-emerald-600/15 text-emerald-400"
            />

            <Antiguedad tramos={r.tramos} total={r.total} />
            <div className="col-span-2 [&>div]:h-full">
              <Ranking titulo="Clientes que más deben" items={r.topClientes} color="bg-brand-cyan" />
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 overflow-x-auto" role="tablist">
              {FILTROS.map((f) => (
                <button
                  key={f.valor}
                  role="tab"
                  aria-selected={filtro === f.valor}
                  onClick={() => setFiltro(f.valor)}
                  className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition ${
                    filtro === f.valor
                      ? 'bg-brand-accent/15 text-brand-accent'
                      : 'text-slate-400 hover:bg-tinte/5 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <label className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cliente, venta o factura…"
                className="input pl-9"
                aria-label="Buscar en la cartera"
              />
            </label>
          </div>

          <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
            {filas.length === 0 ? (
              <p className="p-10 text-center text-sm text-slate-500">Ninguna venta coincide.</p>
            ) : (
              <table className="tabla-tarjetas w-full text-sm">
                <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Venta</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Vence</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-4 py-3 text-right font-medium">Abonado</th>
                    <th className="px-4 py-3 text-right font-medium">Saldo</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    {esAdmin && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {filas.map((v) => (
                    <tr
                      key={v.id}
                      onClick={() => navigate(`/movimientos/${v.id}`)}
                      className="cursor-pointer transition hover:bg-tinte/[0.03]"
                    >
                      <td data-principal className="px-4 py-3">
                        <Link
                          to={`/movimientos/${v.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono font-medium hover:text-brand-cyan"
                        >
                          {formatearNumero({ numero: v.numero, tipo: 'salida' })}
                        </Link>
                        {v.referencia && <div className="text-xs text-slate-500">Factura {v.referencia}</div>}
                      </td>
                      <td data-label="Cliente" className="max-w-xs truncate px-4 py-3">
                        <Link
                          to={`/clientes/${v.cliente_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-300 hover:text-brand-cyan"
                        >
                          {v.cliente_nombre}
                        </Link>
                      </td>
                      <td data-label="Fecha" className="px-4 py-3 whitespace-nowrap text-slate-400">
                        {formatearFechaCorta(v.fecha)}
                      </td>
                      <td data-label="Vence" className="px-4 py-3 whitespace-nowrap text-slate-400">
                        {formatearFechaCorta(`${v.vence}T12:00:00`)}
                        {v.saldo > 0 && v.dias_vencida > 0 && (
                          <span className="ml-2 text-xs font-medium text-red-400">+{v.dias_vencida} d</span>
                        )}
                      </td>
                      <td data-label="Total" className="px-4 py-3 text-right whitespace-nowrap text-slate-300">
                        {formatearPrecio(v.total - v.devuelto)}
                      </td>
                      <td data-label="Abonado" className="px-4 py-3 text-right whitespace-nowrap text-slate-400">
                        {formatearPrecio(v.pagado)}
                      </td>
                      <td data-label="Saldo" className="px-4 py-3 text-right font-medium whitespace-nowrap">
                        {formatearPrecio(v.saldo)}
                      </td>
                      <td data-label="Estado" className="px-4 py-3">
                        <EstadoCobroBadge estado={v.estado} />
                      </td>
                      {esAdmin && (
                        <td className="px-4 py-3 text-right">
                          {v.saldo > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setAbonando(v)
                              }}
                              className="btn btn-secondary py-1.5 text-xs"
                            >
                              <Wallet className="size-3.5" />
                              Abonar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <PagoModal venta={abonando} onClose={() => setAbonando(null)} />
    </>
  )
}

/** Saldo pendiente repartido por días de mora */
function Antiguedad({ tramos, total }: { tramos: { label: string; color: string; valor: number }[]; total: number }) {
  const maximo = Math.max(0, ...tramos.map((t) => t.valor)) || 1
  return (
    <div className="col-span-2 rounded-2xl border border-brand-border bg-brand-card px-4 py-3">
      <p className="text-xs tracking-wide text-slate-400 uppercase">Antigüedad del saldo</p>
      {total === 0 ? (
        <p className="py-6 text-center text-sm text-emerald-400">No hay saldos pendientes</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {tramos.map((t) => (
            <li key={t.label} className="grid grid-cols-[6rem_1fr_7rem] items-center gap-3 text-xs">
              <span className="text-slate-400">{t.label}</span>
              <div className="h-2 rounded-full bg-slate-500/15">
                <div
                  className={`h-full rounded-full ${t.color}`}
                  style={{ width: t.valor > 0 ? `max(4px, ${(t.valor / maximo) * 100}%)` : 0 }}
                />
              </div>
              <span className="text-right font-medium text-slate-200 tabular-nums">{formatearPrecio(t.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
