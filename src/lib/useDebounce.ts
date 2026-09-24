import { useEffect, useState } from 'react'

/** Devuelve el valor solo cuando deja de cambiar durante `ms` milisegundos */
export function useDebounce<T>(valor: T, ms = 300): T {
  const [debounced, setDebounced] = useState(valor)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(valor), ms)
    return () => clearTimeout(id)
  }, [valor, ms])
  return debounced
}
