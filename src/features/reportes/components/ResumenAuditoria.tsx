import { useMemo } from 'react'
import { History, Pencil, Plus, Trash2 } from 'lucide-react'
import type { RegistroAuditoria } from '../api'
import { num } from '../cifras'
import { describirRango, type Rango } from '../rangos'
import { GraficoActividad, Ranking, Variacion, type ItemRanking } from './resumen'
import { Cifra } from './TablaReporte'

type Accion = RegistroAuditoria['accion']

const ORDEN_ACCIONES: Accion[] = ['crear', 'modificar', 'eliminar']

const SERIES_ACCIONES = [
  { label: 'Creados', color: 'bg-emerald-600' },
  { label: 'Modificados', color: 'bg-blue-500' },
  { label: 'Eliminados', color: 'bg-red-500' },
]

function totales(registros: RegistroAuditoria[]) {
  const porAccion: Record<Accion, number> = { crear: 0, modificar: 0, eliminar: 0 }
  for (const r of registros) porAccion[r.accion]++
  return { cambios: registros.length, ...porAccion }
}

/** Los tres primeros de un conteo */
function top(conteo: Map<string, number>, singular: string, plural: string): ItemRanking[] {
  return [...conteo.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([nombre, n]) => ({ clave: nombre, nombre, valor: n, texto: num(n), title: `${nombre}: ${num(n)} ${n === 1 ? singular : plural}` }))
}

interface ResumenAuditoriaProps {
  registros: RegistroAuditoria[]
  /** Registros del período anterior (para comparar); undefined mientras cargan */
  anteriores?: RegistroAuditoria[]
  rango: Rango
  rangoPrevio: Rango
  /** Nombre visible de cada sección (tabla) */
  secciones: Record<string, string>
  nombreCampo: (campo: string) => string
  tabla: string
  onTabla: (tabla: string) => void
}

/** Tarjetas de resumen del historial de cambios */
export function ResumenAuditoria({
  registros,
  anteriores,
  rango,
  rangoPrevio,
  secciones,
  nombreCampo,
  tabla,
  onTabla,
}: ResumenAuditoriaProps) {
  const r = useMemo(() => totales(registros), [registros])
  const previo = useMemo(() => anteriores && totales(anteriores), [anteriores])
  const periodoPrevio = describirRango(rangoPrevio)

  const extra = useMemo(() => {
    const porTabla = new Map<string, number>()
    const porUsuario = new Map<string, number>()
    const porCampo = new Map<string, number>()
    const registrosDistintos = new Set<string>()
    for (const reg of registros) {
      porTabla.set(reg.tabla, (porTabla.get(reg.tabla) ?? 0) + 1)
      const usuario = reg.usuario_email ?? 'Sistema'
      porUsuario.set(usuario, (porUsuario.get(usuario) ?? 0) + 1)
      registrosDistintos.add(`${reg.tabla}:${reg.registro_id}`)
      if (reg.accion === 'modificar' && reg.cambios && typeof reg.cambios === 'object' && !Array.isArray(reg.cambios)) {
        for (const campo of Object.keys(reg.cambios)) {
          const nombre = nombreCampo(campo)
          porCampo.set(nombre, (porCampo.get(nombre) ?? 0) + 1)
        }
      }
    }
    return {
      porTabla,
      registros: registrosDistintos.size,
      usuarios: porUsuario.size,
      topUsuarios: top(porUsuario, 'cambio', 'cambios'),
      topCampos: top(porCampo, 'vez', 'veces'),
    }
  }, [registros, nombreCampo])

  const puntos = useMemo(
    () => registros.map((reg) => ({ fecha: reg.fecha, valores: ORDEN_ACCIONES.map((a) => (a === reg.accion ? 1 : 0)) })),
    [registros],
  )

  // Si hay una sección filtrada se sigue mostrando su chip, para poder quitar el filtro
  const chips = Object.keys(secciones).filter((t) => extra.porTabla.has(t) || t === tabla)

  return (
    <>
      <Cifra
        label="Cambios"
        valor={num(r.cambios)}
        detalle={`${num(extra.registros)} ${extra.registros === 1 ? 'registro' : 'registros'} · ${num(extra.usuarios)} ${extra.usuarios === 1 ? 'usuario' : 'usuarios'}`}
        icono={History}
        tono="bg-brand-cyan/15 text-brand-cyan"
      >
        <div className="flex flex-wrap gap-1.5">
          {chips.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTabla(tabla === t ? '' : t)}
              title={tabla === t ? 'Quitar filtro' : `Ver solo ${(secciones[t] ?? t).toLowerCase()}`}
              className={`inline-flex items-center gap-1 rounded-md bg-slate-500/15 px-1.5 py-0.5 text-xs font-medium text-slate-300 transition hover:brightness-125 ${tabla === t ? 'ring-1 ring-current' : ''}`}
            >
              {num(extra.porTabla.get(t) ?? 0)} {secciones[t]}
            </button>
          ))}
        </div>
        <Variacion actual={r.cambios} anterior={previo?.cambios} periodo={periodoPrevio} />
      </Cifra>
      <Cifra
        label="Creados"
        valor={num(r.crear)}
        detalle="Registros nuevos"
        icono={Plus}
        tono="bg-emerald-600/15 text-emerald-400"
      >
        <Variacion actual={r.crear} anterior={previo?.crear} periodo={periodoPrevio} />
      </Cifra>
      <Cifra
        label="Modificados"
        valor={num(r.modificar)}
        detalle="Ediciones de datos o precios"
        icono={Pencil}
        tono="bg-blue-500/15 text-blue-400"
      >
        <Variacion actual={r.modificar} anterior={previo?.modificar} periodo={periodoPrevio} />
      </Cifra>
      <Cifra
        label="Eliminados"
        valor={<span className={r.eliminar > 0 ? 'text-red-400' : ''}>{num(r.eliminar)}</span>}
        detalle={r.eliminar > 0 ? 'Revisa que hayan sido intencionales' : 'Nada se eliminó en el período'}
        icono={Trash2}
        tono="bg-red-500/15 text-red-400"
      >
        <Variacion actual={r.eliminar} anterior={previo?.eliminar} periodo={periodoPrevio} />
      </Cifra>

      <Ranking titulo="Usuarios más activos" items={extra.topUsuarios} color="bg-brand-cyan" />
      <Ranking titulo="Campos más modificados" items={extra.topCampos} color="bg-blue-500" />
      <GraficoActividad titulo="Cambios" rango={rango} series={SERIES_ACCIONES} modo="apilado" puntos={puntos} />
    </>
  )
}
