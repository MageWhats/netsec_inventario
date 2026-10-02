import { CheckCircle2, FileUp, Link2, Link2Off, Loader2, Lock, LockOpen, Sparkles, TriangleAlert } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { usePermisos } from '@/features/auth/permisos'
import { etiquetaComprobante, formatearDia, formatearValor } from '@/features/contabilidad/api'
import { parsearCsv, type Celda } from '@/features/productos/importar'
import { Cifra } from '@/features/reportes/components/TablaReporte'
import { mensajeError } from '@/lib/errores'
import { useCuentasTesoreria } from '../api'
import {
  useCerrarConciliacion,
  useConciliarAutomatico,
  useConciliarLinea,
  useDetalleConciliacion,
  useExtracto,
  useImportarExtracto,
} from '../conciliacionApi'
import { leerExtracto, type ResultadoExtracto } from '../extracto'

async function leerArchivo(archivo: File): Promise<Celda[][]> {
  if (/\.xlsx$/i.test(archivo.name)) {
    const { readSheet } = await import('read-excel-file/browser')
    return (await readSheet(archivo)) as Celda[][]
  }
  if (/\.(csv|txt|tsv)$/i.test(archivo.name)) return parsearCsv(await archivo.text())
  throw new Error('Formato no soportado: usa el extracto en Excel (.xlsx) o CSV.')
}

/** Conciliación bancaria del mes: el extracto del banco contra los asientos de los libros */
export function TabConciliacion() {
  const { llevaContabilidad } = usePermisos()
  const { data: cuentas = [] } = useCuentasTesoreria()
  const bancos = cuentas.filter((c) => c.tipo === 'banco')
  const [cuentaId, setCuentaId] = useState('')
  const banco = bancos.find((b) => b.id === cuentaId) ?? bancos[0]
  const hoy = new Date()
  const [periodo, setPeriodo] = useState(() => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [anio, mes] = periodo.split('-').map(Number) as [number, number]
  const extracto = useExtracto(banco?.id ?? '', anio, mes)

  if (bancos.length === 0) {
    return (
      <EstadoVacio
        icono={FileUp}
        titulo="Aún no hay cuentas bancarias"
        descripcion="Créalas en la pestaña Cajas y bancos para conciliar sus extractos."
        compacto
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-400">
          Banco
          <select value={banco?.id ?? ''} onChange={(e) => setCuentaId(e.target.value)} className="input mt-1 w-64">
            {bancos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Mes
          <input type="month" value={periodo} onChange={(e) => e.target.value && setPeriodo(e.target.value)} className="input mt-1 w-44" />
        </label>
      </div>

      {extracto.isLoading ? (
        <LoadingBlock />
      ) : extracto.error ? (
        <p className="text-sm text-red-400">{mensajeError(extracto.error)}</p>
      ) : (
        <>
          {llevaContabilidad && !extracto.data?.cerrado && banco && (
            <Importar key={`${banco.id}-${periodo}`} cuentaId={banco.id} anio={anio} mes={mes} existe={Boolean(extracto.data)} />
          )}
          {extracto.data ? (
            <Detalle extracto={extracto.data} />
          ) : (
            !llevaContabilidad && <EstadoVacio icono={FileUp} titulo="Este mes aún no tiene extracto importado" compacto />
          )}
        </>
      )}
    </div>
  )
}

function Importar({ cuentaId, anio, mes, existe }: { cuentaId: string; anio: number; mes: number; existe: boolean }) {
  const importar = useImportarExtracto()
  const input = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<string | null>(null)
  const [lectura, setLectura] = useState<ResultadoExtracto | null>(null)
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)
  const [saldoInicial, setSaldoInicial] = useState(Number.NaN)
  const suma = lectura?.lineas.reduce((s, l) => s + l.valor, 0) ?? 0
  const saldoFinal = Number.isFinite(saldoInicial) ? Math.round((saldoInicial + suma) * 100) / 100 : Number.NaN
  const fuera = lectura?.lineas.filter((l) => !l.fecha.startsWith(`${anio}-${String(mes).padStart(2, '0')}`)).length ?? 0

  async function onArchivo(file: File | undefined) {
    if (!file) return
    setErrorArchivo(null)
    setLectura(null)
    setArchivo(file.name)
    try {
      setLectura(leerExtracto(await leerArchivo(file)))
    } catch (e) {
      setErrorArchivo(mensajeError(e))
    }
  }

  return (
    <section className="rounded-2xl border border-brand-border bg-brand-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">{existe ? 'Reemplazar el extracto del mes' : 'Importar el extracto del mes'}</h3>
          <p className="text-sm text-slate-400">
            Descarga el extracto del portal del banco en Excel o CSV. Se reconocen las columnas de fecha, descripción y
            valor (o débitos y créditos).
          </p>
        </div>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv,.txt,.tsv"
          className="hidden"
          onChange={(e) => {
            void onArchivo(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <button onClick={() => input.current?.click()} className="btn btn-secondary">
          <FileUp className="size-4" />
          {archivo ?? 'Elegir archivo'}
        </button>
      </div>

      {errorArchivo && <p className="mt-3 text-sm text-red-400">{errorArchivo}</p>}
      {lectura && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-300">
            {lectura.lineas.length} movimientos · entradas {formatearValor(lectura.lineas.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0))} ·
            salidas {formatearValor(-lectura.lineas.filter((l) => l.valor < 0).reduce((s, l) => s + l.valor, 0))}
          </p>
          {lectura.errores.length > 0 && (
            <ul className="list-inside list-disc text-sm text-amber-400">
              {lectura.errores.slice(0, 5).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {fuera > 0 && <p className="text-sm text-red-400">{fuera} movimientos no son de este mes: revisa el archivo o el mes elegido.</p>}
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="Saldo inicial del extracto *">
              <input
                type="number"
                step="any"
                value={Number.isFinite(saldoInicial) ? saldoInicial : ''}
                onChange={(e) => setSaldoInicial(e.target.valueAsNumber)}
                className="input w-48"
              />
            </FormField>
            <p className="pb-2 text-sm text-slate-400">
              Saldo final calculado: <strong className="text-slate-200">{Number.isFinite(saldoFinal) ? formatearValor(saldoFinal) : '—'}</strong>{' '}
              (compáralo con el del extracto)
            </p>
            <button
              onClick={() =>
                importar.mutate({ cuentaId, anio, mes, saldoInicial, saldoFinal, lineas: lectura.lineas }, {
                  onSuccess: () => {
                    setLectura(null)
                    setArchivo(null)
                  },
                })
              }
              disabled={importar.isPending || !Number.isFinite(saldoInicial) || lectura.lineas.length === 0 || fuera > 0}
              className="btn btn-primary"
            >
              {importar.isPending && <Loader2 className="size-4 animate-spin" />}
              Importar y conciliar
            </button>
          </div>
          {importar.error && <p className="text-sm text-red-400">{mensajeError(importar.error)}</p>}
        </div>
      )}
    </section>
  )
}

type Extracto = NonNullable<ReturnType<typeof useExtracto>['data']>

function Detalle({ extracto }: { extracto: Extracto }) {
  const { llevaContabilidad } = usePermisos()
  const { data, isLoading } = useDetalleConciliacion(extracto.id)
  const automatico = useConciliarAutomatico()
  const conciliar = useConciliarLinea()
  const cerrar = useCerrarConciliacion()
  const estado = data?.estado
  const asientos = useMemo(() => data?.asientos ?? [], [data])
  const editable = llevaContabilidad && !extracto.cerrado
  const cuadra = estado ? Math.round(Number(estado.diferencia) * 100) === 0 : false
  const error = automatico.error ?? conciliar.error ?? cerrar.error

  return (
    <div className="space-y-4">
      {estado && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Cifra label="Saldo en libros" valor={formatearValor(Number(estado.saldo_libros))} />
          <Cifra label="Saldo del extracto" valor={formatearValor(Number(estado.saldo_extracto))} />
          <Cifra
            label="En el banco, no en libros"
            valor={formatearValor(Number(estado.banco_no_libros))}
            detalle={`${estado.lineas_pendientes} líneas`}
          />
          <Cifra
            label="En libros, no en el banco"
            valor={formatearValor(Number(estado.libros_no_banco))}
            detalle={`${estado.asientos_pendientes} partidas en tránsito`}
          />
          <Cifra
            label="Diferencia"
            valor={cuadra ? 'Cuadra' : formatearValor(Number(estado.diferencia))}
            icono={cuadra ? CheckCircle2 : TriangleAlert}
            tono={cuadra ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {extracto.cerrado ? (
          <span className="flex items-center gap-1 text-sm text-emerald-400">
            <Lock className="size-4" />
            Conciliación cerrada
          </span>
        ) : (
          <span className="text-sm text-slate-400">
            Las líneas del banco que faltan en los libros (comisiones, consignaciones sin identificar) se registran con un
            egreso o un comprobante y luego se concilian.
          </span>
        )}
        {llevaContabilidad && (
          <div className="ml-auto flex gap-2">
            {editable && (
              <button onClick={() => automatico.mutate(extracto.id)} disabled={automatico.isPending} className="btn btn-secondary">
                <Sparkles className="size-4" />
                Conciliar automáticamente
              </button>
            )}
            <button
              onClick={() => cerrar.mutate({ p_extracto_id: extracto.id, p_cerrar: !extracto.cerrado })}
              disabled={cerrar.isPending || (!extracto.cerrado && !cuadra)}
              className={extracto.cerrado ? 'btn btn-secondary' : 'btn btn-primary'}
            >
              {extracto.cerrado ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
              {extracto.cerrado ? 'Reabrir' : 'Cerrar conciliación'}
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-400">{mensajeError(error)}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
          <h3 className="border-b border-brand-border px-4 py-3 text-sm font-medium">Extracto del banco</h3>
          <ul className="divide-y divide-brand-border">
            {extracto.lineas.map((l) => {
              const candidatos = asientos.filter((a) => Number(a.valor) === l.valor)
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="text-slate-400">{formatearDia(l.fecha)}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-300" title={l.descripcion}>
                    {l.descripcion}
                  </span>
                  <span className={`tabular-nums ${l.valor < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{formatearValor(l.valor)}</span>
                  {l.asiento_id ? (
                    <span className="flex basis-full items-center gap-1 text-xs text-emerald-400">
                      <Link2 className="size-3.5" />
                      Conciliada
                      {editable && (
                        <button
                          onClick={() => conciliar.mutate({ p_linea_id: l.id, p_asiento_id: null })}
                          className="ml-2 inline-flex items-center gap-1 text-slate-400 hover:text-red-400"
                        >
                          <Link2Off className="size-3.5" />
                          Soltar
                        </button>
                      )}
                    </span>
                  ) : editable && candidatos.length > 0 ? (
                    <select
                      defaultValue=""
                      onChange={(e) => e.target.value && conciliar.mutate({ p_linea_id: l.id, p_asiento_id: e.target.value })}
                      className="input basis-full text-xs"
                      aria-label="Conciliar con un asiento"
                    >
                      <option value="">Conciliar con…</option>
                      {candidatos.map((a) => (
                        <option key={a.asiento_id} value={a.asiento_id}>
                          {formatearDia(a.fecha)} · {etiquetaComprobante(a)} · {a.descripcion}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="basis-full text-xs text-amber-400">Sin asiento de este valor en los libros</span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        <section className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
          <h3 className="border-b border-brand-border px-4 py-3 text-sm font-medium">En libros sin conciliar (partidas en tránsito)</h3>
          {isLoading ? (
            <LoadingBlock />
          ) : asientos.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">Todo lo de los libros está en el extracto.</p>
          ) : (
            <ul className="divide-y divide-brand-border">
              {asientos.map((a) => (
                <li key={a.asiento_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="text-slate-400">{formatearDia(a.fecha)}</span>
                  <Link to={`/contabilidad/comprobantes/${a.comprobante_id}`} className="font-mono text-xs hover:text-brand-cyan">
                    {etiquetaComprobante(a)}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-slate-300" title={a.descripcion}>
                    {a.descripcion}
                  </span>
                  <span className={`tabular-nums ${Number(a.valor) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {formatearValor(Number(a.valor))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
