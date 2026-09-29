import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { como, costoPromedio, crearBase, error, stock, unaComo } from './base'

let db: PGlite
let categoria: string

beforeAll(async () => {
  db = await crearBase()
  categoria = (await db.query<{ nombre: string }>("select nombre from public.categorias where nombre = 'Switches'"))
    .rows[0]!.nombre
})

const importar = (productos: unknown[], usuario: 'admin' | 'bodega' = 'admin') =>
  unaComo<{ r: { creados: number; ajuste_id: string | null } }>(
    db,
    usuario,
    'select public.importar_productos($1::jsonb) as r',
    [JSON.stringify(productos)],
  )

describe('importar productos (0018)', () => {
  it('crea los productos con SKU automático y registra el stock inicial', async () => {
    const { r } = await importar([
      {
        fila: 2,
        nombre: 'Switch 8p',
        categoria: categoria.toUpperCase(),
        costo: 100,
        stock_inicial: 5,
        precio_venta: 150,
      },
      { fila: 3, nombre: 'Switch 16p', categoria, costo: 200, stock_inicial: 0 },
      { fila: 4, nombre: 'Switch gestionable', categoria, es_serializado: true, costo: 900 },
    ])
    expect(r.creados).toBe(3)
    expect(r.ajuste_id).not.toBeNull()

    const productos = await como<{ id: string; sku: string; nombre: string }>(
      db,
      'admin',
      "select id, sku, nombre from public.productos where nombre like 'Switch%' order by nombre",
    )
    expect(productos.map((p) => p.sku)).toEqual(expect.arrayContaining([expect.stringMatching(/^NS-[A-Z0-9]+-\d{4}$/)]))
    const ocho = productos.find((p) => p.nombre === 'Switch 8p')!
    expect(await stock(db, ocho.id)).toBe(5)
    expect(await costoPromedio(db, ocho.id)).toBe(100)

    const [ajuste] = await como<{ tipo: string; motivo: string }>(
      db,
      'admin',
      'select tipo, motivo from public.movimientos where id = $1',
      [r.ajuste_id],
    )
    expect(ajuste).toEqual({ tipo: 'ajuste_entrada', motivo: 'inventario_inicial' })
  })

  it('todo o nada: una fila con error no deja nada creado y dice cuál fue', async () => {
    const antes = (await db.query<{ n: number }>('select count(*)::int n from public.productos')).rows[0]!.n
    expect(
      await error(
        importar([
          { fila: 2, nombre: 'Bueno', categoria, stock_inicial: 1 },
          { fila: 3, nombre: 'Malo', categoria: 'No existe' },
        ]),
      ),
    ).toMatch(/Fila 3: la categoría "No existe" no existe/)
    expect(
      await error(importar([{ fila: 7, nombre: 'Con serial', categoria, es_serializado: true, stock_inicial: 2 }])),
    ).toMatch(/Fila 7: un producto con serial no lleva stock inicial/)
    expect(await error(importar([{ fila: 9, nombre: 'X', categoria }]))).toMatch(/Fila 9/) // nombre muy corto
    expect((await db.query<{ n: number }>('select count(*)::int n from public.productos')).rows[0]!.n).toBe(antes)
  })

  it('solo admin importa', async () => {
    expect(await error(importar([{ nombre: 'Algo', categoria }], 'bodega'))).toMatch(/Solo un administrador/)
  })
})

describe('empresa y garantías (0016)', () => {
  it('todos leen los datos de la empresa y solo admin los edita', async () => {
    await como(db, 'admin', "update public.empresa set nit = '900123456-7', telefono = '300 123 4567'")
    const [empresa] = await como<{ nombre: string; nit: string }>(
      db,
      'bodega',
      'select nombre, nit from public.empresa',
    )
    expect(empresa).toEqual({ nombre: 'Net&Sec Suministros', nit: '900123456-7' })

    await como(db, 'bodega', "update public.empresa set nit = 'hackeado'") // RLS: no afecta ninguna fila
    expect((await db.query<{ nit: string }>('select nit from public.empresa')).rows[0]!.nit).toBe('900123456-7')
    expect(await error(como(db, 'admin', 'insert into public.empresa (id) values (true)'))).toMatch(/permission denied/)
  })

  it('la garantía por categoría va de 0 a 120 meses', async () => {
    await como(db, 'admin', "update public.categorias set garantia_meses = 12 where nombre = 'Switches'")
    expect(
      await error(como(db, 'admin', "update public.categorias set garantia_meses = 500 where nombre = 'Switches'")),
    ).toMatch(/check constraint/)
  })
})
