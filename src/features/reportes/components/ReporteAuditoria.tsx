import { useMemo, useState } from 'react'
import { formatearFecha } from '@/lib/format'
import type { Json } from '@/types/database'
import { LIMITE_LINEAS, useAuditoria, type RegistroAuditoria } from '../api'
import { tablaDesdeColumnas } from '@/lib/exportar'
import { describirRango, rangoAnterior, rangoEsteMes, type Rango } from '../rangos'
import { RangoFechas } from './RangoFechas'
import { ResumenAuditoria } from './ResumenAuditoria'
import { Reporte, TablaReporte, type Columna } from './TablaReporte'

const TABLAS: Record<string, string> = {
  productos: 'Productos',
  clientes: 'Clientes',
  proveedores: 'Proveedores',
  categorias: 'Categorías',
  bodegas: 'Bodegas',
  perfiles: 'Usuarios',
  unidades: 'Unidades (serial)',
}

const ACCIONES: Record<RegistroAuditoria['accion'], { label: string; clase: string }> = {
  crear: { label: 'Creado', clase: 'bg-emerald-500/15 text-emerald-400' },
  modificar: { label: 'Modificado', clase: 'bg-blue-500/15 text-blue-400' },
  eliminar: { label: 'Eliminado', clase: 'bg-red-500/15 text-red-400' },
}

const CAMPOS: Record<string, string> = {
  precio_costo: 'Precio de costo',
  precio_venta: 'Precio de venta',
  stock_minimo: 'Stock mínimo',
  es_serializado: 'Con serial',
  codigo_barras: 'Código de barras',
  categoria_id: 'Categoría',
  tipo_documento: 'Tipo de documento',
  activo: 'Activo',
  activa: 'Activa',
  rol: 'Rol',
}

const nombreCampo = (campo: string) => CAMPOS[campo] ?? campo.replaceAll('_', ' ')

function valor(v: Json | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

/** "Precio de venta: 100000 → 120000; Activo: sí → no" */
function resumenCambios(r: RegistroAuditoria): string {
  if (r.accion !== 'modificar') return ''
  const cambios = r.cambios as Record<string, { antes?: Json; despues?: Json }>
  return Object.entries(cambios)
    .map(([campo, c]) => `${nombreCampo(campo)}: ${valor(c.antes)} → ${valor(c.despues)}`)
    .join('; ')
}

const columnas: Columna<RegistroAuditoria>[] = [
  { titulo: 'Fecha', valor: (r) => formatearFecha(r.fecha), className: 'whitespace-nowrap text-slate-300' },
  { titulo: 'Usuario', valor: (r) => r.usuario_email ?? 'Sistema', className: 'text-slate-400' },
  { titulo: 'Sección', valor: (r) => TABLAS[r.tabla] ?? r.tabla },
  { titulo: 'Registro', valor: (r) => r.descripcion ?? r.registro_id, className: 'font-medium text-slate-100' },
  {
    titulo: 'Acción',
    valor: (r) => ACCIONES[r.accion].label,
    mostrar: (r) => (
      <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${ACCIONES[r.accion].clase}`}>
        {ACCIONES[r.accion].label}
      </span>
    ),
  },
  { titulo: 'Cambios', valor: resumenCambios, className: 'max-w-md text-xs text-slate-300' },
]

/** Quién cambió qué y cuándo en catálogos, precios, clientes, proveedores y roles */
export function ReporteAuditoria() {
  const [rango, setRango] = useState<Rango>(rangoEsteMes)
  const [tabla, setTabla] = useState('')
  const auditoria = useAuditoria({ ...rango, tabla })
  // Misma sección en el período anterior, para las comparaciones del resumen
  const previo = useMemo(() => rangoAnterior(rango), [rango])
  const previos = useAuditoria({ ...previo, tabla })
  const filas = useMemo(() => auditoria.data ?? [], [auditoria.data])

  return (
    <Reporte
      titulo="Historial de cambios"
      subtitulo={`${describirRango(rango)}${tabla ? ` · ${TABLAS[tabla]}` : ''}`}
      cargando={auditoria.isLoading}
      error={auditoria.error}
      puedeExportar={filas.length > 0}
      exportar={() => ({ archivo: `historial_cambios_${rango.desde}_a_${rango.hasta}`, ...tablaDesdeColumnas(columnas, filas) })}
      aviso={
        filas.length >= LIMITE_LINEAS &&
        `Se alcanzó el máximo de ${LIMITE_LINEAS.toLocaleString('es-CO')} registros: acorta el período.`
      }
      filtros={
        <>
          <RangoFechas valor={rango} onChange={setRango} />
          <label className="text-xs text-slate-400">
            Sección
            <select value={tabla} onChange={(e) => setTabla(e.target.value)} className="input mt-1 w-44">
              <option value="">Todas</option>
              {Object.entries(TABLAS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </>
      }
      resumen={
        <ResumenAuditoria
          registros={filas}
          anteriores={previos.isPlaceholderData ? undefined : previos.data}
          rango={rango}
          rangoPrevio={previo}
          secciones={TABLAS}
          nombreCampo={nombreCampo}
          tabla={tabla}
          onTabla={setTabla}
        />
      }
    >
      <TablaReporte
        columnas={columnas}
        filas={filas}
        clave={(r) => String(r.id)}
        vacio="No hay cambios registrados en este período."
      />
    </Reporte>
  )
}
