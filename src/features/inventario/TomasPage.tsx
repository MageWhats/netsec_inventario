import { ClipboardCheck, Loader2, Play } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { usePermisos } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import { formatearFecha } from '@/lib/format'
import { useCategorias } from '@/features/productos/api'
import { useIniciarToma, useTomas } from './api'
import { EstadoTomaBadge } from './components/EstadoTomaBadge'

export function TomasPage() {
  const navigate = useNavigate()
  const { data: tomas = [], isLoading, error } = useTomas()
  const [nueva, setNueva] = useState(false)
  const { puedeOperar } = usePermisos()
  const enCurso = tomas.find((t) => t.estado === 'en_curso')

  return (
    <>
      <PageHeader
        title="Toma de inventario"
        description="Cuenta lo que hay físicamente en bodega y ajusta el sistema con las diferencias"
        actions={
          enCurso ? (
            <Link to={`/inventario/${enCurso.id}`} className="btn btn-primary">
              <ClipboardCheck className="size-4" />
              {puedeOperar ? 'Continuar' : 'Ver'} toma #{enCurso.numero}
            </Link>
          ) : (
            puedeOperar && (
              <button onClick={() => setNueva(true)} className="btn btn-primary">
                <Play className="size-4" />
                Nueva toma
              </button>
            )
          )
        }
      />

      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <p className="p-6 text-sm text-red-400">{mensajeError(error)}</p>
        ) : tomas.length === 0 ? (
          <EstadoVacio
            icono={ClipboardCheck}
            titulo="Aún no hay tomas de inventario"
            descripcion="Inicia una, cuenta los productos (a mano o escaneando) y al finalizar se generan los ajustes."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla-tarjetas w-full text-sm">
              <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Número</th>
                  <th className="px-4 py-3 font-medium">Iniciada</th>
                  <th className="px-4 py-3 font-medium">Alcance</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Contados</th>
                  <th className="px-4 py-3 font-medium">Cerrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {tomas.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/inventario/${t.id}`)}
                    className="cursor-pointer transition hover:bg-tinte/[0.03]"
                  >
                    <td data-principal className="px-4 py-3">
                      <Link
                        to={`/inventario/${t.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono font-medium hover:text-brand-cyan"
                      >
                        #{t.numero}
                      </Link>
                    </td>
                    <td data-label="Iniciada" className="px-4 py-3 whitespace-nowrap text-slate-300">
                      {formatearFecha(t.created_at)}
                    </td>
                    <td data-label="Alcance" className="px-4 py-3 text-slate-300">
                      {t.categoria_nombre ?? 'Todo el inventario'}
                    </td>
                    <td data-label="Estado" className="px-4 py-3">
                      <EstadoTomaBadge estado={t.estado} />
                    </td>
                    <td data-label="Contados" className="px-4 py-3 text-right text-slate-300 tabular-nums">
                      {t.contados} / {t.productos}
                    </td>
                    <td data-label="Cerrada" className="px-4 py-3 whitespace-nowrap text-slate-400">
                      {t.cerrada_at ? formatearFecha(t.cerrada_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NuevaTomaModal open={nueva} onClose={() => setNueva(false)} />
    </>
  )
}

function NuevaTomaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: categorias = [] } = useCategorias()
  const { mutate: iniciar, isPending, error, reset } = useIniciarToma()
  const [categoriaId, setCategoriaId] = useState('')
  const [notas, setNotas] = useState('')

  function cerrar() {
    reset()
    onClose()
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    iniciar(
      { categoriaId: categoriaId || null, notas },
      { onSuccess: (id) => navigate(`/inventario/${id}`) },
    )
  }

  return (
    <Modal open={open} onClose={cerrar} title="Nueva toma de inventario">
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Qué vas a contar">
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="input">
            <option value="">Todo el inventario</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                Solo {c.nombre}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Notas (opcional)">
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="input"
            placeholder="Ej.: Inventario de cierre de mes"
          />
        </FormField>

        <ul className="list-disc space-y-1 rounded-lg bg-tinte/[0.03] py-3 pr-3 pl-7 text-xs text-slate-400">
          <li>Se incluyen los productos activos del alcance elegido.</li>
          <li>Puedes contar en varias sesiones y desde varios teléfonos a la vez.</li>
          <li>
            Mientras dure el conteo, <strong className="text-slate-300">evita registrar entradas o salidas</strong>: las
            diferencias se calculan contra el stock del momento de finalizar.
          </li>
          <li>Los productos que no cuentes no se ajustan.</li>
        </ul>

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{mensajeError(error)}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={cerrar} className="btn btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={isPending} className="btn btn-primary">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Iniciar toma
          </button>
        </div>
      </form>
    </Modal>
  )
}
