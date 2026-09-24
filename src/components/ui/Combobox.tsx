import { ChevronDown, X } from 'lucide-react'
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

interface ComboboxProps<T> {
  items: T[]
  getKey: (item: T) => string
  /** Texto que se muestra en el campo cuando el elemento está seleccionado */
  getLabel: (item: T) => string
  /** ¿El elemento coincide con el texto buscado (en minúsculas)? */
  matches: (item: T, termino: string) => boolean
  renderItem?: (item: T) => ReactNode
  isDisabled?: (item: T) => boolean
  /**
   * Coincidencia exacta al pulsar Enter (p. ej. un código de barras leído con lector).
   * Si devuelve un elemento, se selecciona directamente.
   */
  exactMatch?: (items: T[], texto: string) => T | undefined
  value?: T | null
  onChange: (item: T | null) => void
  /** Modo "agregar": tras elegir, el campo se vacía y queda listo para el siguiente */
  clearOnSelect?: boolean
  placeholder?: string
  emptyText?: string
  maxResults?: number
  autoFocus?: boolean
  id?: string
}

export function Combobox<T>({
  items,
  getKey,
  getLabel,
  matches,
  renderItem,
  isDisabled,
  exactMatch,
  value,
  onChange,
  clearOnSelect,
  placeholder,
  emptyText = 'Sin resultados',
  maxResults = 30,
  autoFocus,
  id,
}: ComboboxProps<T>) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [resaltado, setResaltado] = useState(0)

  const termino = texto.trim().toLowerCase()
  const resultados = useMemo(
    () => (termino ? items.filter((item) => matches(item, termino)) : items).slice(0, maxResults),
    [items, matches, termino, maxResults],
  )

  function seleccionar(item: T) {
    if (isDisabled?.(item)) return
    onChange(item)
    setTexto('')
    setResaltado(0)
    if (clearOnSelect) {
      inputRef.current?.focus()
    } else {
      setAbierto(false)
      inputRef.current?.blur()
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAbierto(true)
      setResaltado((i) => Math.min(i + 1, resultados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltado((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const exacto = texto.trim() ? exactMatch?.(items, texto.trim()) : undefined
      const item = exacto ?? resultados[resaltado]
      if (item) seleccionar(item)
    } else if (e.key === 'Escape') {
      setAbierto(false)
    }
  }

  const mostrarSeleccion = !abierto && !clearOnSelect && value

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        className="input pr-16"
        placeholder={placeholder}
        value={mostrarSeleccion ? getLabel(value) : texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setResaltado(0)
          setAbierto(true)
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => {
          setAbierto(false)
          setTexto('')
        }}
        onKeyDown={onKeyDown}
      />
      <div className="absolute inset-y-0 right-2 flex items-center gap-1 text-slate-500">
        {value && !clearOnSelect && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(null)}
            className="rounded p-1 hover:text-slate-200"
            aria-label="Quitar selección"
          >
            <X className="size-4" />
          </button>
        )}
        <ChevronDown className="pointer-events-none size-4" />
      </div>

      {abierto && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-brand-border bg-brand-card py-1 shadow-xl"
        >
          {resultados.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">{emptyText}</li>
          ) : (
            resultados.map((item, i) => {
              const deshabilitado = isDisabled?.(item) ?? false
              return (
                <li
                  key={getKey(item)}
                  role="option"
                  aria-selected={i === resaltado}
                  aria-disabled={deshabilitado}
                  // onMouseDown en lugar de onClick: se ejecuta antes del blur del input
                  onMouseDown={(e) => {
                    e.preventDefault()
                    seleccionar(item)
                  }}
                  onMouseEnter={() => setResaltado(i)}
                  className={`px-3 py-2 text-sm ${
                    deshabilitado
                      ? 'cursor-not-allowed opacity-40'
                      : `cursor-pointer ${i === resaltado ? 'bg-brand-accent/15' : ''}`
                  }`}
                >
                  {renderItem ? renderItem(item) : getLabel(item)}
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
