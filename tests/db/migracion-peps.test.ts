import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  aplicarMigracionesDesde,
  como,
  costoPromedio,
  crearBase,
  crearProducto,
  crearProveedor,
  registrar,
  stock,
  unaComo,
} from './base'

// Migración 0023 sobre una base con historial (registrado con el costo promedio de antes)
const CLAVE = '4821'
let db: PGlite
let cable: string
let router: string
let costosAntes: { id: string; costo_unitario: string }[]

const anular = async (id: string) => {
  const { r } = await unaComo<{ r: { ok: boolean; error?: string } }>(
    db,
    'admin',
    "select public.anular_movimiento($1, 'Registrado por error', $2) as r",
    [id, CLAVE],
  )
  if (!r.ok) throw new Error(r.error)
}

const costos = () =>
  db
    .query<{ id: string; costo_unitario: string }>('select id, costo_unitario from public.movimiento_items order by id')
    .then((r) => r.rows)

beforeAll(async () => {
  db = await crearBase({ hasta: '0022' })
  const proveedor = await crearProveedor(db)
  await como(db, 'admin', 'select public.definir_clave_anulacion($1)', [CLAVE])
  cable = await crearProducto(db, { nombre: 'Cable histórico' })
  router = await crearProducto(db, { nombre: 'Router histórico', serializado: true })
  const extra = { proveedorId: proveedor }

  await registrar(db, 'admin', 'entrada', [{ producto_id: cable, cantidad: 10, costo_unitario: 100 }], extra)
  await registrar(db, 'admin', 'entrada', [{ producto_id: cable, cantidad: 10, costo_unitario: 300 }], extra)
  const ventaAnulada = await registrar(db, 'admin', 'salida', [{ producto_id: cable, cantidad: 5, precio_unitario: 900 }])
  await anular(ventaAnulada)
  const venta = await registrar(db, 'admin', 'salida', [{ producto_id: cable, cantidad: 3, precio_unitario: 900 }])
  await unaComo(
    db,
    'admin',
    `select public.registrar_movimiento(p_tipo => 'ajuste_entrada', p_items => $1::jsonb,
       p_motivo => 'devolucion_cliente', p_movimiento_origen_id => $2) as id`,
    [JSON.stringify([{ producto_id: cable, cantidad: 1 }]), venta],
  )
  const entradaAnulada = await registrar(
    db,
    'admin',
    'entrada',
    [{ producto_id: cable, cantidad: 2, costo_unitario: 500 }],
    extra,
  )
  await anular(entradaAnulada)
  await registrar(db, 'admin', 'ajuste_salida', [{ producto_id: cable, cantidad: 1 }], { motivo: 'faltante_conteo' })

  await registrar(
    db,
    'admin',
    'entrada',
    [{ producto_id: router, costo_unitario: 1000, series: [{ numero_serie: 'H-1' }, { numero_serie: 'H-2' }] }],
    extra,
  )
  const { id: unidad } = (await db.query<{ id: string }>("select id from public.unidades where numero_serie = 'H-1'"))
    .rows[0]!
  await registrar(db, 'admin', 'salida', [{ producto_id: router, unidad_ids: [unidad], precio_unitario: 2000 }])

  costosAntes = await costos()
  await aplicarMigracionesDesde(db, '0022')
})

describe('reconstrucción de las capas', () => {
  it('no cambia el costo de ninguna línea registrada', async () => {
    expect(await costos()).toEqual(costosAntes)
  })

  it('las capas cuadran con el stock', async () => {
    const capas = await db.query<{ producto_id: string; restante: number }>(
      'select producto_id, sum(cantidad_restante)::int restante from public.capas_costo group by producto_id',
    )
    for (const fila of capas.rows) expect(fila.restante).toBe(await stock(db, fila.producto_id))
    expect(await stock(db, cable)).toBe(17)
    expect(await stock(db, router)).toBe(1)
  })

  it('el costo queda en PEPS y las operaciones siguen funcionando', async () => {
    // El costo del producto es el medio de lo que queda en sus capas
    const restantes = await db.query<{ restante: number; costo: string }>(
      `select cantidad_restante restante, costo_unitario costo from public.capas_costo
       where producto_id = $1 and cantidad_restante > 0 order by fecha, created_at`,
      [cable],
    )
    const valor = restantes.rows.reduce((s, c) => s + c.restante * Number(c.costo), 0)
    expect(await costoPromedio(db, cable)).toBe(Math.round((valor / 17) * 100) / 100)

    const venta = await registrar(db, 'admin', 'salida', [{ producto_id: cable, cantidad: 2, precio_unitario: 900 }])
    const [linea] = await como<{ costo_unitario: string }>(
      db,
      'admin',
      'select * from public.costos_lineas(p_movimiento_id => $1)',
      [venta],
    )
    expect(Number(linea!.costo_unitario)).toBe(100)
    expect(await costoPromedio(db, router)).toBe(1000)
  })
})
