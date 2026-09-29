import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { como, crearBase, crearProducto, error, registrar, stock, unaComo, type Usuario } from './base'

// Migración 0019: cotizaciones y cartera
let db: PGlite
let cliente: string
let switchId: string
let cable: string

const manana = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
const hoy = () => new Date().toISOString().slice(0, 10)

beforeAll(async () => {
  db = await crearBase()
  cliente = (
    await unaComo<{ id: string }>(
      db,
      'admin',
      "insert into public.clientes (nombre, tipo_documento, documento) values ('Hotel Central', 'NIT', '900123456') returning id",
    )
  ).id
  switchId = await crearProducto(db, { nombre: 'Switch 24p', precioVenta: 300 })
  cable = await crearProducto(db, { nombre: 'Cable UTP', precioVenta: 10 })
  await registrar(db, 'admin', 'entrada', [
    { producto_id: switchId, cantidad: 20, costo_unitario: 200 },
    { producto_id: cable, cantidad: 100, costo_unitario: 5 },
  ])
})

function cotizar(items: unknown[], extra: { cliente?: string | null; nombre?: string; usuario?: Usuario } = {}) {
  return unaComo<{ id: string }>(
    db,
    extra.usuario ?? 'admin',
    `select public.guardar_cotizacion(
       p_items => $1::jsonb, p_valida_hasta => $2::date, p_cliente_id => $3, p_cliente_nombre => $4
     ) as id`,
    [JSON.stringify(items), manana(), extra.cliente === undefined ? cliente : extra.cliente, extra.nombre ?? null],
  )
}

function vender(
  items: unknown[],
  extra: {
    credito?: boolean
    vence?: string | null
    cotizacion?: string
    cliente?: string | null
    usuario?: Usuario
  } = {},
) {
  return unaComo<{ id: string }>(
    db,
    extra.usuario ?? 'admin',
    `select public.registrar_venta(
       p_items => $1::jsonb, p_cliente_id => $2, p_credito => $3, p_vence => $4::date, p_cotizacion_id => $5
     ) as id`,
    [
      JSON.stringify(items),
      extra.cliente === undefined ? cliente : extra.cliente,
      extra.credito ?? false,
      extra.vence ?? null,
      extra.cotizacion ?? null,
    ],
  )
}

function abonar(venta: string, valor: number, usuario: Usuario = 'admin') {
  return unaComo<{ id: string }>(
    db,
    usuario,
    "select public.registrar_pago(p_movimiento_id => $1, p_valor => $2, p_metodo => 'transferencia') as id",
    [venta, valor],
  )
}

const cartera = (venta: string, usuario: Usuario = 'admin') =>
  como<{ total: string; devuelto: string; pagado: string; saldo: string }>(
    db,
    usuario,
    'select total, devuelto, pagado, saldo from public.cartera where id = $1',
    [venta],
  )

const cotizacion = (id: string) =>
  unaComo<{ numero: number; estado: string; total: string; venta_id: string | null; cliente_nombre: string }>(
    db,
    'admin',
    'select * from public.cotizaciones_resumen where id = $1',
    [id],
  )

describe('cotizaciones', () => {
  it('numera, calcula el total y no mueve inventario', async () => {
    const antes = await stock(db, switchId)
    const { id } = await cotizar([
      { producto_id: switchId, cantidad: 2, precio_unitario: 350 },
      { producto_id: cable, cantidad: 30, precio_unitario: 12 },
    ])
    const r = await cotizacion(id)
    expect(r.numero).toBe(1)
    expect(r.estado).toBe('abierta')
    expect(Number(r.total)).toBe(1060)
    expect(r.cliente_nombre).toBe('Hotel Central')
    expect(await stock(db, switchId)).toBe(antes)
  })

  it('acepta un prospecto sin registrar, pero exige su nombre', async () => {
    const { id } = await cotizar([{ producto_id: cable, cantidad: 1, precio_unitario: 10 }], {
      cliente: null,
      nombre: 'Constructora Pérez',
      usuario: 'bodega',
    })
    expect((await cotizacion(id)).cliente_nombre).toBe('Constructora Pérez')
    expect(await error(cotizar([{ producto_id: cable, cantidad: 1 }], { cliente: null }))).toMatch(/nombre/)
  })

  it('solo lectura no crea cotizaciones', async () => {
    expect(await error(cotizar([{ producto_id: cable, cantidad: 1 }], { usuario: 'lectura' }))).toMatch(/permisos/)
  })

  it('al convertirse en venta queda aceptada y enlazada, y no se vende dos veces', async () => {
    const { id } = await cotizar([{ producto_id: switchId, cantidad: 1, precio_unitario: 350 }])
    const { id: venta } = await vender([{ producto_id: switchId, cantidad: 1, precio_unitario: 350 }], {
      cotizacion: id,
      usuario: 'bodega',
    })
    const r = await cotizacion(id)
    expect(r.estado).toBe('aceptada')
    expect(r.venta_id).toBe(venta)
    expect(
      await error(vender([{ producto_id: switchId, cantidad: 1, precio_unitario: 350 }], { cotizacion: id })),
    ).toMatch(/cerrada/)
    // Una cotización cerrada no se edita
    expect(
      await error(
        unaComo(
          db,
          'admin',
          'select public.guardar_cotizacion(p_items => $1::jsonb, p_valida_hasta => $2::date, p_id => $3, p_cliente_id => $4)',
          [JSON.stringify([{ producto_id: cable, cantidad: 1 }]), manana(), id, cliente],
        ),
      ),
    ).toMatch(/cerrada/)
  })

  it('se rechaza', async () => {
    const { id } = await cotizar([{ producto_id: cable, cantidad: 5, precio_unitario: 10 }])
    await como(db, 'bodega', 'select public.rechazar_cotizacion($1)', [id])
    expect((await cotizacion(id)).estado).toBe('rechazada')
  })

  it('si la venta falla (sin stock), la cotización sigue abierta', async () => {
    const { id } = await cotizar([{ producto_id: switchId, cantidad: 999, precio_unitario: 350 }])
    expect(
      await error(vender([{ producto_id: switchId, cantidad: 999, precio_unitario: 350 }], { cotizacion: id })),
    ).not.toBeNull()
    expect((await cotizacion(id)).estado).toBe('abierta')
  })
})

describe('cartera', () => {
  it('las ventas de contado no entran a la cartera', async () => {
    const { id } = await vender([{ producto_id: cable, cantidad: 1, precio_unitario: 10 }])
    expect(await cartera(id)).toEqual([])
  })

  it('una venta a crédito exige cliente y fecha límite', async () => {
    const items = [{ producto_id: cable, cantidad: 1, precio_unitario: 10 }]
    expect(await error(vender(items, { credito: true, vence: manana(), cliente: null }))).toMatch(/cliente/)
    expect(await error(vender(items, { credito: true }))).toMatch(/fecha límite/)
  })

  it('los abonos bajan el saldo y no pueden superarlo', async () => {
    const { id } = await vender([{ producto_id: switchId, cantidad: 2, precio_unitario: 300 }], {
      credito: true,
      vence: manana(),
    })
    expect(Number((await cartera(id))[0]!.saldo)).toBe(600)

    await abonar(id, 250)
    expect(Number((await cartera(id))[0]!.pagado)).toBe(250)
    expect(await error(abonar(id, 400))).toMatch(/supera el saldo/)
    await abonar(id, 350)
    expect(Number((await cartera(id))[0]!.saldo)).toBe(0)
  })

  it('solo admin abona; bodega no ve la cartera', async () => {
    const { id } = await vender([{ producto_id: cable, cantidad: 10, precio_unitario: 10 }], {
      credito: true,
      vence: manana(),
    })
    expect(await error(abonar(id, 10, 'bodega'))).toMatch(/administrador/)
    expect(await error(abonar(id, 10, 'lectura'))).toMatch(/administrador/)
    expect(await cartera(id, 'bodega')).toEqual([])
    expect(await como(db, 'bodega', 'select * from public.pagos')).toEqual([])
    expect(await cartera(id, 'lectura')).toHaveLength(1)
  })

  it('un abono anulado deja de contar', async () => {
    const { id } = await vender([{ producto_id: cable, cantidad: 10, precio_unitario: 10 }], {
      credito: true,
      vence: manana(),
    })
    const { id: pago } = await abonar(id, 60)
    expect(await error(como(db, 'admin', "select public.anular_pago($1, '')", [pago]))).toMatch(/motivo/)
    await como(db, 'admin', "select public.anular_pago($1, 'Transferencia rechazada')", [pago])
    expect(Number((await cartera(id))[0]!.saldo)).toBe(100)
  })

  it('lo devuelto descuenta del saldo, al precio de la venta', async () => {
    const { id } = await vender([{ producto_id: cable, cantidad: 10, precio_unitario: 12 }], {
      credito: true,
      vence: manana(),
    })
    await unaComo(
      db,
      'admin',
      `select public.registrar_movimiento(
         p_tipo => 'ajuste_entrada', p_items => $1::jsonb,
         p_motivo => 'devolucion_cliente', p_movimiento_origen_id => $2
       )`,
      [JSON.stringify([{ producto_id: cable, cantidad: 4 }]), id],
    )
    const [r] = await cartera(id)
    expect(Number(r!.devuelto)).toBe(48)
    expect(Number(r!.saldo)).toBe(72)
  })

  it('una venta de contado anterior se pasa a crédito, y vuelve a contado solo sin abonos', async () => {
    const { id } = await vender([{ producto_id: cable, cantidad: 5, precio_unitario: 10 }])
    expect(await error(abonar(id, 10))).toMatch(/contado/)

    await como(db, 'admin', 'select public.cambiar_forma_pago($1, true, $2::date)', [id, hoy()])
    expect(await cartera(id)).toHaveLength(1)
    await abonar(id, 20)
    expect(await error(como(db, 'admin', 'select public.cambiar_forma_pago($1, false)', [id]))).toMatch(/abonos/)
    expect(await error(como(db, 'bodega', 'select public.cambiar_forma_pago($1, false)', [id]))).toMatch(
      /administrador/,
    )
  })
})
