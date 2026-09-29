import { describe, expect, it } from 'vitest'
import { rangoAnterior } from './rangos'

describe('rangoAnterior', () => {
  it('mes en curso: los mismos días del mes anterior', () => {
    expect(rangoAnterior({ desde: '2026-09-01', hasta: '2026-09-28' })).toEqual({ desde: '2026-08-01', hasta: '2026-08-28' })
  })

  it('recorta al último día si el mes anterior es más corto', () => {
    expect(rangoAnterior({ desde: '2026-03-01', hasta: '2026-03-31' })).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
  })

  it('enero se compara con diciembre del año anterior', () => {
    expect(rangoAnterior({ desde: '2026-01-01', hasta: '2026-01-15' })).toEqual({ desde: '2025-12-01', hasta: '2025-12-15' })
  })

  it('año en curso: las mismas fechas del año anterior', () => {
    expect(rangoAnterior({ desde: '2026-01-01', hasta: '2026-09-28' })).toEqual({ desde: '2025-01-01', hasta: '2025-09-28' })
  })

  it('otro rango: los mismos días justo antes', () => {
    expect(rangoAnterior({ desde: '2026-08-30', hasta: '2026-09-28' })).toEqual({ desde: '2026-07-31', hasta: '2026-08-29' })
  })
})
