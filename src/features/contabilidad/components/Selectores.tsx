import { useMemo } from 'react'
import { Combobox } from '@/components/ui/Combobox'
import { CLASES_TERCERO, codigosConHijas, type Cuenta, type OpcionTercero } from '../api'

interface SelectorCuentaProps {
  cuentas: Cuenta[]
  value: string
  onChange: (codigo: string) => void
  /** Solo cuentas de último nivel y activas (las que reciben movimientos) */
  soloMovimiento?: boolean
  placeholder?: string
  autoFocus?: boolean
  id?: string
}

/** Busca por código o nombre: «1435», «inventario» */
export function SelectorCuenta({
  cuentas,
  value,
  onChange,
  soloMovimiento,
  placeholder = 'Código o nombre de la cuenta',
  autoFocus,
  id,
}: SelectorCuentaProps) {
  const opciones = useMemo(() => {
    if (!soloMovimiento) return cuentas
    const conHijas = codigosConHijas(cuentas)
    return cuentas.filter((c) => c.activa && !conHijas.has(c.codigo))
  }, [cuentas, soloMovimiento])
  const seleccionada = cuentas.find((c) => c.codigo === value) ?? null

  return (
    <Combobox
      id={id}
      items={opciones}
      getKey={(c) => c.codigo}
      getLabel={(c) => `${c.codigo} · ${c.nombre}`}
      matches={(c, t) => c.codigo.startsWith(t) || c.nombre.toLowerCase().includes(t)}
      // Con un código exacto, Enter elige la cuenta
      exactMatch={(items, texto) => items.find((c) => c.codigo === texto.trim())}
      renderItem={(c) => (
        <span className="flex gap-2">
          <span className="font-mono text-slate-400">{c.codigo}</span>
          <span>{c.nombre}</span>
        </span>
      )}
      value={seleccionada}
      onChange={(c) => onChange(c?.codigo ?? '')}
      placeholder={placeholder}
      autoFocus={autoFocus}
      maxResults={50}
    />
  )
}

interface SelectorTerceroProps {
  opciones: OpcionTercero[]
  value: { clase: OpcionTercero['clase']; id: string } | null
  onChange: (tercero: OpcionTercero | null) => void
  id?: string
}

/** Clientes, proveedores y otros terceros en una sola lista */
export function SelectorTercero({ opciones, value, onChange, id }: SelectorTerceroProps) {
  const seleccionado = value ? (opciones.find((o) => o.clase === value.clase && o.id === value.id) ?? null) : null
  return (
    <Combobox
      id={id}
      items={opciones}
      getKey={(o) => `${o.clase}:${o.id}`}
      getLabel={(o) => o.nombre}
      matches={(o, t) => o.nombre.toLowerCase().includes(t) || (o.documento ?? '').toLowerCase().includes(t)}
      isDisabled={(o) => !o.activo && o.id !== value?.id}
      renderItem={(o) => (
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">
            {o.nombre}
            {o.documento && <span className="ml-2 text-xs text-slate-500">{o.documento}</span>}
          </span>
          <span className="shrink-0 text-xs text-slate-500">{CLASES_TERCERO[o.clase]}</span>
        </span>
      )}
      value={seleccionado}
      onChange={onChange}
      placeholder="Nombre o documento"
    />
  )
}
