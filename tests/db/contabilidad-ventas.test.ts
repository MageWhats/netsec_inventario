import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { como, crearBase, crearProducto, crearProveedor, error, unaComo } from './base'

// Migración 0024: ingresos de las ventas, abonos con retención, notas, CUFE y saldos por tercero
const CLAVE = '4821'
let db: PGlite
let proveedor: string
let cliente: string
let producto: string

const vender = (cantidad: number, precio: number, credito: boolean) =>
  unaComo<{ id: string }>(
    db,
    'admin',
    `select public.registrar_venta(p_items => $1::jsonb, p_cliente_id => $2, p_credito => $3,
       p_vence => current_date + 30) as id`,
    [JSON.stringify([{ producto_id: producto, cantidad, precio_unitario: precio }]), cliente, credito],
  ).then((r) => r.id)

/** Líneas de los comprobantes de un tipo ligados a un movimiento, a un abono o a una nota */
const lineas = (where: string, id: string) =>
  como<{ cuenta: string; debito: string; credito: string; cliente_id: string | null }>(
    db,
    'contador',
    `select a.cuenta, a.debito, a.credito, a.cliente_id
     from public.asientos a join public.comprobantes c on c.id = a.comprobante_id
     where ${where} = $1 order by c.created_at, a.linea`,
    [id],
  ).then((f) => f.map((l) => [l.cuenta, Number(l.debito), Number(l.credito)]))

const saldoCartera = (venta: string) =>
  unaComo<{ saldo: string }>(db, 'admin', 'select saldo from public.cartera where id = $1', [venta]).then((r) =>
    Number(r.saldo),
  )

const abonar = (venta: string, valor: number, extra: { metodo?: string; retencion?: number } = {}) =>
  unaComo<{ id: string }>(
    db,
    'admin',
    'select public.registrar_pago(p_movimiento_id => $1, p_valor => $2, p_metodo => $3::public.metodo_pago, p_retencion => $4) as id',
    [venta, valor, extra.metodo ?? 'transferencia', extra.retencion ?? 0],
  ).then((r) => r.id)

beforeAll(async () => {
  db = await crearBase()
  proveedor = await crearProveedor(db)
  cliente = (
    await unaComo<{ id: string }>(
      db,
      'admin',
      "insert into public.clientes (nombre, tipo_documento, documento, agente_retencion, dias_credito) values ('Gran cliente', 'NIT', '900123456', true, 30) returning id",
    )
  ).id
  producto = await crearProducto(db, { nombre: 'Cámara IP' })
  await como(db, 'admin', 'select public.definir_clave_anulacion($1)', [CLAVE])
  await como(
    db,
    'contador',
    "update public.configuracion_contable set fecha_inicio = date_trunc('month', public.hoy_colombia())",
  )
  await unaComo(
    db,
    'admin',
    `select public.registrar_movimiento(p_tipo => 'entrada', p_proveedor_id => $1, p_items => $2::jsonb) as id`,
    [proveedor, JSON.stringify([{ producto_id: producto, cantidad: 50, costo_unitario: 100_000 }])],
  )
})

describe('parámetros', () => {
  it('la primera subcuenta de una cuenta de los parámetros la reemplaza', async () => {
    await como(
      db,
      'contador',
      `insert into public.cuentas (codigo, nombre, naturaleza) values ('11100501', 'Bancolombia ahorros', 'debito')`,
    )
    const [{ cuenta }] = await como<{ cuenta: string }>(
      db,
      'contador',
      "select cuenta from public.parametros_contables where clave = 'bancos'",
    )
    expect(cuenta).toBe('11100501')
  })
})

describe('ventas', () => {
  it('a crédito: costo e ingreso contra el cliente, en un solo comprobante', async () => {
    const venta = await vender(2, 250_000, true)
    expect(await lineas('c.movimiento_id', venta)).toEqual([
      ['6135', 200_000, 0],
      ['1435', 0, 200_000],
      ['130505', 500_000, 0],
      ['4135', 0, 500_000],
    ])
  })

  it('de contado: el ingreso va a la caja', async () => {
    const venta = await vender(1, 250_000, false)
    expect((await lineas('c.movimiento_id', venta)).slice(2)).toEqual([
      ['110505', 250_000, 0],
      ['4135', 0, 250_000],
    ])
  })

  it('cambiar la forma de pago reclasifica entre caja y cliente', async () => {
    const venta = await vender(1, 300_000, false)
    await como(db, 'admin', 'select public.cambiar_forma_pago($1, true, current_date + 15)', [venta])
    const todas = await lineas('c.movimiento_id', venta)
    expect(todas.slice(4)).toEqual([
      ['130505', 300_000, 0],
      ['110505', 0, 300_000],
    ])
  })

  it('una devolución reversa el ingreso con la 4175', async () => {
    const venta = await vender(3, 200_000, true)
    const { id } = await unaComo<{ id: string }>(
      db,
      'admin',
      `select public.registrar_movimiento(p_tipo => 'ajuste_entrada', p_items => $1::jsonb,
         p_motivo => 'devolucion_cliente', p_movimiento_origen_id => $2) as id`,
      [JSON.stringify([{ producto_id: producto, cantidad: 1 }]), venta],
    )
    expect(await lineas('c.movimiento_id', id)).toEqual([
      ['1435', 100_000, 0],
      ['6135', 0, 100_000],
      ['4175', 200_000, 0],
      ['130505', 0, 200_000],
    ])
    expect(await saldoCartera(venta)).toBe(400_000)
  })

  it('anular una venta reversa costo e ingreso', async () => {
    const venta = await vender(1, 250_000, true)
    const { r } = await unaComo<{ r: { anulacion_id: string } }>(
      db,
      'admin',
      "select public.anular_movimiento($1, 'Registrada por error', $2) as r",
      [venta, CLAVE],
    )
    expect(await lineas('c.movimiento_id', r.anulacion_id)).toEqual([
      ['1435', 100_000, 0],
      ['6135', 0, 100_000],
      ['4135', 250_000, 0],
      ['130505', 0, 250_000],
    ])
  })
})

describe('abonos', () => {
  it('recibo de caja con la retención del cliente; la cartera la descuenta', async () => {
    const venta = await vender(4, 250_000, true)
    const pago = await abonar(venta, 975_000, { retencion: 25_000 })
    expect(await lineas('c.pago_id', pago)).toEqual([
      ['11100501', 975_000, 0],
      ['135515', 25_000, 0],
      ['130505', 0, 1_000_000],
    ])
    expect(await saldoCartera(venta)).toBe(0)
  })

  it('en efectivo va a la caja; anular el abono lo reversa', async () => {
    const venta = await vender(1, 250_000, true)
    const pago = await abonar(venta, 100_000, { metodo: 'efectivo' })
    await como(db, 'admin', "select public.anular_pago($1, 'Cheque devuelto')", [pago])
    expect(await lineas('c.pago_id', pago)).toEqual([
      ['110505', 100_000, 0],
      ['130505', 0, 100_000],
      ['110505', 0, 100_000],
      ['130505', 100_000, 0],
    ])
    expect(await saldoCartera(venta)).toBe(250_000)
  })

  it('el abono más la retención no puede superar el saldo', async () => {
    const venta = await vender(1, 100_000, true)
    expect(await error(abonar(venta, 90_000, { retencion: 20_000 }))).toMatch(/supera el saldo/)
  })
})

describe('notas', () => {
  it('nota crédito y débito por valor, con consecutivo propio', async () => {
    const venta = await vender(1, 500_000, true)
    const nota = (tipo: string, valor: number) =>
      unaComo<{ id: string }>(
        db,
        'contador',
        "select public.registrar_nota_venta($1, $2, $3, 'Descuento por pronto pago') as id",
        [venta, tipo, valor],
      ).then((r) => r.id)

    const nc = await nota('credito', 50_000)
    expect(await lineas('c.nota_id', nc)).toEqual([
      ['4175', 50_000, 0],
      ['130505', 0, 50_000],
    ])
    const nd = await nota('debito', 20_000)
    expect(await lineas('c.nota_id', nd)).toEqual([
      ['130505', 20_000, 0],
      ['4135', 0, 20_000],
    ])
    expect(await saldoCartera(venta)).toBe(470_000)
    expect(await error(nota('credito', 600_000))).toMatch(/supera el saldo/)
    expect(
      await error(como(db, 'bodega', "select public.registrar_nota_venta($1, 'credito', 1, 'Prueba de permisos')", [venta])),
    ).toMatch(/contadora/)

    expect(
      await error(
        como(db, 'admin', "select public.anular_movimiento($1, 'Registrada por error', $2)", [venta, CLAVE]),
      ),
    ).toMatch(/notas crédito o débito/)

    await como(db, 'contador', "select public.anular_nota_venta($1, 'Se aplicó por error')", [nc])
    expect(await saldoCartera(venta)).toBe(520_000)
    const [{ n }] = await como<{ n: number }>(
      db,
      'contador',
      "select numero n from public.notas_venta where tipo = 'credito' order by numero desc limit 1",
    )
    expect(n).toBe(1)
  })
})

describe('CUFE', () => {
  it('se valida y bodega no lo corrige una vez registrado', async () => {
    const venta = await vender(1, 250_000, false)
    const cufe = 'A'.repeat(96)
    expect(await error(como(db, 'bodega', 'select public.definir_cufe($1, $2)', [venta, 'abc']))).toMatch(/96/)
    await como(db, 'bodega', 'select public.definir_cufe($1, $2)', [venta, cufe])
    expect(await error(como(db, 'bodega', 'select public.definir_cufe($1, $2)', [venta, 'b'.repeat(96)]))).toMatch(
      /administrador/,
    )
    const [{ cufe: guardado }] = (
      await db.query<{ cufe: string }>('select cufe from public.movimientos where id = $1', [venta])
    ).rows
    expect(guardado).toBe('a'.repeat(96))
  })
})

describe('saldos por tercero', () => {
  it('lo que debe cada cliente y lo que se le debe a cada proveedor', async () => {
    const clientes = await como<{ nombre: string; saldo: string }>(
      db,
      'contador',
      'select nombre, saldo from public.saldos_por_tercero($1, current_date)',
      ['130505'],
    )
    expect(clientes).toHaveLength(1)
    expect(clientes[0]!.nombre).toBe('Gran cliente')
    // Coincide con la cartera de la app (ventas a crédito vigentes)
    const [{ total }] = await como<{ total: string }>(db, 'admin', 'select sum(saldo) total from public.cartera')
    expect(Number(clientes[0]!.saldo)).toBe(Number(total))

    const proveedores = await como<{ saldo: string }>(
      db,
      'contador',
      'select saldo from public.saldos_por_tercero($1, current_date)',
      ['2205'],
    )
    expect(proveedores.map((p) => Number(p.saldo))).toEqual([5_000_000])
  })
})
