import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { como, crearBase, crearProducto, crearProveedor, error, unaComo } from './base'

// Migración 0025: cuentas de tesorería, egresos, traslados, anticipos y edades
let db: PGlite
let proveedor: string
let cliente: string
let producto: string
let caja: string
let banco: string

const saldos = () =>
  como<{ nombre: string; cuenta: string; saldo: string }>(db, 'contador', 'select * from public.saldos_tesoreria()').then(
    (f) => Object.fromEntries(f.map((c) => [c.nombre, Number(c.saldo)])),
  )

const lineas = (columna: string, id: string) =>
  como<{ cuenta: string; debito: string; credito: string }>(
    db,
    'contador',
    `select a.cuenta, a.debito, a.credito from public.asientos a join public.comprobantes c on c.id = a.comprobante_id
     where c.${columna} = $1 order by c.created_at, a.linea`,
    [id],
  ).then((f) => f.map((l) => [l.cuenta, Number(l.debito), Number(l.credito)]))

const venderCredito = (precio: number) =>
  unaComo<{ id: string }>(
    db,
    'admin',
    `select public.registrar_venta(p_items => $1::jsonb, p_cliente_id => $2, p_credito => true, p_vence => current_date + 30) as id`,
    [JSON.stringify([{ producto_id: producto, cantidad: 1, precio_unitario: precio }]), cliente],
  ).then((r) => r.id)

beforeAll(async () => {
  db = await crearBase()
  proveedor = await crearProveedor(db)
  cliente = (
    await unaComo<{ id: string }>(
      db,
      'admin',
      "insert into public.clientes (nombre, tipo_documento, documento) values ('Cliente tesorería', 'NIT', '800100200') returning id",
    )
  ).id
  producto = await crearProducto(db, { nombre: 'Switch tesorería' })
})

describe('cuentas de tesorería', () => {
  it('sin arranque no hay documentos de tesorería', async () => {
    caja = (await unaComo<{ id: string }>(db, 'contador', "select id from public.cuentas_tesoreria where cuenta = '110505'")).id
    expect(
      await error(
        como(db, 'contador', "select public.registrar_traslado(current_date, $1, $1, 10)", [caja]),
      ),
    ).toMatch(/distintos/)
  })

  it('crear un banco crea su auxiliar bajo 111005 y los abonos pasan a usarlo', async () => {
    banco = (
      await unaComo<{ id: string }>(
        db,
        'contador',
        "select public.crear_cuenta_tesoreria('Bancolombia ahorros', 'banco', 'Bancolombia', '123-456789-01') as id",
      )
    ).id
    const cuentaDe = async (sql: string) => {
      const { id } = await unaComo<{ id: string }>(db, 'contador', `select ${sql} as id`)
      return (await unaComo<{ cuenta: string }>(db, 'contador', 'select cuenta from public.cuentas_tesoreria where id = $1', [id]))
        .cuenta
    }
    expect(await cuentaDe("public.crear_cuenta_tesoreria('Davivienda corriente', 'banco', 'Davivienda')")).toBe('11100502')
    const [{ cuenta }] = await como<{ cuenta: string }>(db, 'contador', 'select cuenta from public.cuentas_tesoreria where id = $1', [banco])
    expect(cuenta).toBe('11100501')
    expect(
      await como(db, 'contador', "select cuenta from public.parametros_contables where clave = 'bancos'"),
    ).toEqual([{ cuenta: '11100501' }])
    expect(await cuentaDe("public.crear_cuenta_tesoreria('Caja menor', 'caja')")).toBe('110510')
    expect(await error(como(db, 'lectura', "select public.crear_cuenta_tesoreria('X banco', 'banco')"))).toMatch(/contadora/)
  })

  it('arranque, saldos iniciales y la entrada de la mercancía', async () => {
    await como(
      db,
      'contador',
      "update public.configuracion_contable set fecha_inicio = date_trunc('month', public.hoy_colombia())",
    )
    await como(
      db,
      'contador',
      "select public.registrar_comprobante('SI', (select fecha_inicio from public.configuracion_contable), 'Apertura', $1::jsonb)",
      [
        JSON.stringify([
          { cuenta: '110505', debito: 500_000 },
          { cuenta: '11100501', debito: 2_000_000 },
          { cuenta: '3105', credito: 2_500_000 },
        ]),
      ],
    )
    await unaComo(
      db,
      'admin',
      "select public.registrar_movimiento(p_tipo => 'entrada', p_proveedor_id => $1, p_items => $2::jsonb) as id",
      [proveedor, JSON.stringify([{ producto_id: producto, cantidad: 10, costo_unitario: 100_000 }])],
    )
    expect(await saldos()).toMatchObject({ 'Caja general': 500_000, 'Bancolombia ahorros': 2_000_000 })
  })
})

describe('egresos', () => {
  it('pago a proveedor: baja lo que se le debe y el banco', async () => {
    const egreso = await unaComo<{ id: string }>(
      db,
      'contador',
      `select public.registrar_egreso(public.hoy_colombia(), 'proveedor', $1, 400000, 'transferencia',
         'Pago factura 123', p_proveedor_id => $2) as id`,
      [banco, proveedor],
    )
    expect(await lineas('egreso_id', egreso.id)).toEqual([
      ['2205', 400_000, 0],
      ['11100501', 0, 400_000],
    ])
    expect((await saldos())['Bancolombia ahorros']).toBe(1_600_000)
    expect(
      await error(
        como(
          db,
          'contador',
          `select public.registrar_egreso(public.hoy_colombia(), 'proveedor', $1, 900000, 'transferencia', 'Pago de más', p_proveedor_id => $2)`,
          [banco, proveedor],
        ),
      ),
    ).toMatch(/supera lo que se le debe/)
  })

  it('otro pago contra la cuenta elegida; anularlo lo reversa', async () => {
    const egreso = await unaComo<{ id: string }>(
      db,
      'contador',
      `select public.registrar_egreso(public.hoy_colombia(), 'otro', $1, 15000, 'otro', 'Cuota de manejo', p_cuenta => '5305') as id`,
      [banco],
    )
    expect(await lineas('egreso_id', egreso.id)).toEqual([
      ['5305', 15_000, 0],
      ['11100501', 0, 15_000],
    ])
    await como(db, 'contador', "select public.anular_tesoreria('egresos', $1, 'Cobro reversado por el banco')", [egreso.id])
    expect((await saldos())['Bancolombia ahorros']).toBe(1_600_000)
    expect(
      await error(como(db, 'contador', "select public.anular_tesoreria('egresos', $1, 'Otra vez')", [egreso.id])),
    ).toMatch(/ya está anulado/)
  })
})

describe('traslados y abonos', () => {
  it('consignar el efectivo de la caja en el banco', async () => {
    const tr = await unaComo<{ id: string }>(
      db,
      'contador',
      'select public.registrar_traslado(public.hoy_colombia(), $1, $2, 300000) as id',
      [caja, banco],
    )
    expect(await lineas('traslado_id', tr.id)).toEqual([
      ['11100501', 300_000, 0],
      ['110505', 0, 300_000],
    ])
    expect(await saldos()).toMatchObject({ 'Caja general': 200_000, 'Bancolombia ahorros': 1_900_000 })
  })

  it('el abono entra a la caja o banco elegido', async () => {
    const venta = await venderCredito(300_000)
    const davivienda = (
      await unaComo<{ id: string }>(db, 'contador', "select id from public.cuentas_tesoreria where nombre = 'Davivienda corriente'")
    ).id
    const pago = await unaComo<{ id: string }>(
      db,
      'admin',
      "select public.registrar_pago(p_movimiento_id => $1, p_valor => 100000, p_metodo => 'transferencia', p_cuenta_tesoreria_id => $2) as id",
      [venta, davivienda],
    )
    expect((await lineas('pago_id', pago.id))[0]).toEqual(['11100502', 100_000, 0])
  })
})

describe('anticipos', () => {
  it('se reciben en 2805 y se aplican a una venta como abono', async () => {
    const anticipo = await unaComo<{ id: string }>(
      db,
      'contador',
      "select public.registrar_anticipo(public.hoy_colombia(), $1, $2, 200000, 'transferencia') as id",
      [cliente, banco],
    )
    expect(await lineas('anticipo_id', anticipo.id)).toEqual([
      ['11100501', 200_000, 0],
      ['2805', 0, 200_000],
    ])
    const venta = await venderCredito(500_000)
    const pago = await unaComo<{ id: string }>(db, 'contador', 'select public.aplicar_anticipo($1, $2, 150000) as id', [
      anticipo.id,
      venta,
    ])
    expect(await lineas('pago_id', pago.id)).toEqual([
      ['2805', 150_000, 0],
      ['130505', 0, 150_000],
    ])
    const [{ saldo }] = await como<{ saldo: string }>(db, 'admin', 'select saldo from public.cartera where id = $1', [venta])
    expect(Number(saldo)).toBe(350_000)
    expect(await error(como(db, 'contador', 'select public.aplicar_anticipo($1, $2, 60000)', [anticipo.id, venta]))).toMatch(
      /queda del anticipo/,
    )
    expect(
      await error(como(db, 'contador', "select public.anular_tesoreria('anticipos', $1, 'Error de digitación')", [anticipo.id])),
    ).toMatch(/ya se aplicó/)
  })
})

describe('edades', () => {
  it('lo pendiente de clientes y proveedores, con los pagos aplicados a lo más antiguo', async () => {
    const proveedores = await como<{ nombre: string; al_dia: string; total: string }>(
      db,
      'contador',
      "select * from public.edades_por_tercero('2205')",
    )
    // Entrada de 1.000.000 menos el pago de 400.000
    expect(proveedores.map((p) => Number(p.total))).toEqual([600_000])

    const clientes = await como<{ total: string; al_dia: string }>(
      db,
      'contador',
      "select * from public.edades_por_tercero('1305')",
    )
    const [{ total: cartera }] = await como<{ total: string }>(db, 'admin', 'select sum(saldo) total from public.cartera')
    expect(Number(clientes[0]!.total)).toBe(Number(cartera))
    expect(Number(clientes[0]!.al_dia)).toBe(Number(cartera))
  })
})
