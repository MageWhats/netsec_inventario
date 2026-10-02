// Tipos de la base de datos (reflejan supabase/migrations). Tienen el mismo formato que los generados con:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts
// Si se regeneran, este archivo puede sustituirse completo.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '13.0.5'
  }
  public: {
    Tables: {
      perfiles: {
        Row: {
          id: string
          nombre: string | null
          email: string | null
          rol: Database['public']['Enums']['rol_usuario']
          activo: boolean
          created_at: string
        }
        Insert: {
          id: string
          nombre?: string | null
          email?: string | null
          rol?: Database['public']['Enums']['rol_usuario']
          activo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          nombre?: string | null
          email?: string | null
          rol?: Database['public']['Enums']['rol_usuario']
          activo?: boolean
          created_at?: string
        }
        Relationships: []
      }
      bodegas: {
        Row: {
          id: string
          nombre: string
          direccion: string | null
          activa: boolean
          created_at: string
        }
        Insert: {
          id?: string
          nombre: string
          direccion?: string | null
          activa?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          direccion?: string | null
          activa?: boolean
          created_at?: string
        }
        Relationships: []
      }
      empresa: {
        Row: {
          id: boolean
          nombre: string
          nit: string | null
          direccion: string | null
          ciudad: string | null
          telefono: string | null
          email: string | null
          sitio_web: string | null
          pie_documentos: string | null
          updated_at: string
        }
        Insert: never
        Update: {
          nombre?: string
          nit?: string | null
          direccion?: string | null
          ciudad?: string | null
          telefono?: string | null
          email?: string | null
          sitio_web?: string | null
          pie_documentos?: string | null
        }
        Relationships: []
      }
      cotizaciones: {
        Row: {
          id: string
          numero: number
          cliente_id: string | null
          cliente_nombre: string | null
          estado: Database['public']['Enums']['estado_cotizacion']
          valida_hasta: string
          notas: string | null
          usuario_id: string | null
          created_at: string
          updated_at: string
          cerrada_at: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'cotizaciones_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'clientes'
            referencedColumns: ['id']
          },
        ]
      }
      cotizacion_items: {
        Row: {
          id: string
          cotizacion_id: string
          producto_id: string
          cantidad: number
          precio_unitario: number
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'cotizacion_items_cotizacion_id_fkey'
            columns: ['cotizacion_id']
            isOneToOne: false
            referencedRelation: 'cotizaciones'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cotizacion_items_producto_id_fkey'
            columns: ['producto_id']
            isOneToOne: false
            referencedRelation: 'productos'
            referencedColumns: ['id']
          },
        ]
      }
      pagos: {
        Row: {
          id: string
          movimiento_id: string
          fecha: string
          valor: number
          metodo: Database['public']['Enums']['metodo_pago']
          referencia: string | null
          notas: string | null
          usuario_id: string | null
          created_at: string
          anulado_at: string | null
          anulado_por: string | null
          motivo_anulacion: string | null
          retencion: number
          cuenta_tesoreria_id: string | null
          anticipo_id: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'pagos_movimiento_id_fkey'
            columns: ['movimiento_id']
            isOneToOne: false
            referencedRelation: 'movimientos'
            referencedColumns: ['id']
          },
        ]
      }
      ordenes_compra: {
        Row: {
          id: string
          numero: number
          proveedor_id: string
          estado: Database['public']['Enums']['estado_orden_compra']
          fecha_esperada: string | null
          notas: string | null
          usuario_id: string | null
          created_at: string
          updated_at: string
          cerrada_at: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'ordenes_compra_proveedor_id_fkey'
            columns: ['proveedor_id']
            isOneToOne: false
            referencedRelation: 'proveedores'
            referencedColumns: ['id']
          },
        ]
      }
      orden_compra_items: {
        Row: {
          id: string
          orden_id: string
          producto_id: string
          cantidad: number
          costo_unitario: number
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'orden_compra_items_orden_id_fkey'
            columns: ['orden_id']
            isOneToOne: false
            referencedRelation: 'ordenes_compra'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'orden_compra_items_producto_id_fkey'
            columns: ['producto_id']
            isOneToOne: false
            referencedRelation: 'productos'
            referencedColumns: ['id']
          },
        ]
      }
      categorias: {
        Row: {
          id: string
          nombre: string
          prefijo: string
          ultimo_sku: number
          garantia_meses: number
          created_at: string
        }
        Insert: {
          id?: string
          nombre: string
          prefijo: string
          ultimo_sku?: number
          garantia_meses?: number
          created_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          prefijo?: string
          ultimo_sku?: number
          garantia_meses?: number
          created_at?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          id: string
          tipo_documento: Database['public']['Enums']['tipo_documento']
          documento: string
          nombre: string
          telefono: string | null
          email: string | null
          direccion: string | null
          ciudad: string | null
          notas: string | null
          activo: boolean
          dias_credito: number | null
          agente_retencion: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tipo_documento?: Database['public']['Enums']['tipo_documento']
          documento: string
          nombre: string
          telefono?: string | null
          email?: string | null
          direccion?: string | null
          ciudad?: string | null
          notas?: string | null
          activo?: boolean
          dias_credito?: number | null
          agente_retencion?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tipo_documento?: Database['public']['Enums']['tipo_documento']
          documento?: string
          nombre?: string
          telefono?: string | null
          email?: string | null
          direccion?: string | null
          ciudad?: string | null
          notas?: string | null
          activo?: boolean
          dias_credito?: number | null
          agente_retencion?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      proveedores: {
        Row: {
          id: string
          nombre: string
          nit: string | null
          contacto: string | null
          telefono: string | null
          email: string | null
          direccion: string | null
          notas: string | null
          activo: boolean
          dias_credito: number | null
          responsable_iva: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nombre: string
          nit?: string | null
          contacto?: string | null
          telefono?: string | null
          email?: string | null
          direccion?: string | null
          notas?: string | null
          activo?: boolean
          dias_credito?: number | null
          responsable_iva?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          nit?: string | null
          contacto?: string | null
          telefono?: string | null
          email?: string | null
          direccion?: string | null
          notas?: string | null
          activo?: boolean
          dias_credito?: number | null
          responsable_iva?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      familias: {
        Row: {
          id: string
          nombre: string
          sku_base: string
          categoria_id: string | null
          marca: string | null
          modelo: string | null
          descripcion: string | null
          es_serializado: boolean
          precio_venta: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nombre: string
          sku_base?: string
          categoria_id?: string | null
          marca?: string | null
          modelo?: string | null
          descripcion?: string | null
          es_serializado?: boolean
          precio_venta?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          sku_base?: string
          categoria_id?: string | null
          marca?: string | null
          modelo?: string | null
          descripcion?: string | null
          es_serializado?: boolean
          precio_venta?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'familias_categoria_id_fkey'
            columns: ['categoria_id']
            isOneToOne: false
            referencedRelation: 'categorias'
            referencedColumns: ['id']
          },
        ]
      }
      productos: {
        Row: {
          id: string
          sku: string
          nombre: string
          descripcion: string | null
          categoria_id: string | null
          marca: string | null
          modelo: string | null
          codigo_barras: string | null
          es_serializado: boolean
          precio_costo: number
          precio_venta: number
          stock_minimo: number
          activo: boolean
          imagen_url: string | null
          created_at: string
          updated_at: string
          familia_id: string | null
          color: string | null
        }
        Insert: {
          id?: string
          sku?: string
          nombre: string
          descripcion?: string | null
          categoria_id?: string | null
          marca?: string | null
          modelo?: string | null
          codigo_barras?: string | null
          es_serializado?: boolean
          precio_costo?: number
          precio_venta?: number
          stock_minimo?: number
          activo?: boolean
          imagen_url?: string | null
          created_at?: string
          updated_at?: string
          familia_id?: string | null
          color?: string | null
        }
        Update: {
          id?: string
          sku?: string
          nombre?: string
          descripcion?: string | null
          categoria_id?: string | null
          marca?: string | null
          modelo?: string | null
          codigo_barras?: string | null
          es_serializado?: boolean
          precio_costo?: number
          precio_venta?: number
          stock_minimo?: number
          activo?: boolean
          imagen_url?: string | null
          created_at?: string
          updated_at?: string
          familia_id?: string | null
          color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'productos_familia_id_fkey'
            columns: ['familia_id']
            isOneToOne: false
            referencedRelation: 'familias'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'productos_categoria_id_fkey'
            columns: ['categoria_id']
            isOneToOne: false
            referencedRelation: 'categorias'
            referencedColumns: ['id']
          },
        ]
      }
      unidades: {
        Row: {
          id: string
          producto_id: string
          bodega_id: string
          numero_serie: string
          mac: string | null
          estado: Database['public']['Enums']['estado_unidad']
          notas: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          producto_id: string
          bodega_id: string
          numero_serie: string
          mac?: string | null
          estado?: Database['public']['Enums']['estado_unidad']
          notas?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          producto_id?: string
          bodega_id?: string
          numero_serie?: string
          mac?: string | null
          estado?: Database['public']['Enums']['estado_unidad']
          notas?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'unidades_producto_id_fkey'
            columns: ['producto_id']
            isOneToOne: false
            referencedRelation: 'productos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'unidades_bodega_id_fkey'
            columns: ['bodega_id']
            isOneToOne: false
            referencedRelation: 'bodegas'
            referencedColumns: ['id']
          },
        ]
      }
      movimientos: {
        Row: {
          id: string
          numero: number
          cliente_id: string | null
          tipo: Database['public']['Enums']['tipo_movimiento']
          bodega_id: string
          proveedor_id: string | null
          referencia: string | null
          notas: string | null
          fecha: string
          usuario_id: string | null
          created_at: string
          motivo: Database['public']['Enums']['motivo_ajuste'] | null
          movimiento_origen_id: string | null
          orden_compra_id: string | null
          credito: boolean
          vence: string | null
          cotizacion_id: string | null
          anulado_at: string | null
          anulado_por: string | null
          motivo_anulacion: string | null
          anula_id: string | null
          cufe: string | null
        }
        Insert: {
          id?: string
          numero: number
          cliente_id?: string | null
          tipo: Database['public']['Enums']['tipo_movimiento']
          bodega_id: string
          proveedor_id?: string | null
          referencia?: string | null
          notas?: string | null
          fecha?: string
          usuario_id?: string | null
          created_at?: string
          motivo?: Database['public']['Enums']['motivo_ajuste'] | null
          movimiento_origen_id?: string | null
        }
        Update: {
          id?: string
          numero?: number
          cliente_id?: string | null
          tipo?: Database['public']['Enums']['tipo_movimiento']
          bodega_id?: string
          proveedor_id?: string | null
          referencia?: string | null
          notas?: string | null
          fecha?: string
          usuario_id?: string | null
          created_at?: string
          motivo?: Database['public']['Enums']['motivo_ajuste'] | null
          movimiento_origen_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'movimientos_bodega_id_fkey'
            columns: ['bodega_id']
            isOneToOne: false
            referencedRelation: 'bodegas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'movimientos_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'clientes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'movimientos_movimiento_origen_id_fkey'
            columns: ['movimiento_origen_id']
            isOneToOne: false
            referencedRelation: 'movimientos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'movimientos_proveedor_id_fkey'
            columns: ['proveedor_id']
            isOneToOne: false
            referencedRelation: 'proveedores'
            referencedColumns: ['id']
          },
        ]
      }
      movimiento_items: {
        Row: {
          id: string
          movimiento_id: string
          producto_id: string
          unidad_id: string | null
          cantidad: number
          costo_unitario: number | null
          precio_unitario: number | null
        }
        Insert: {
          id?: string
          movimiento_id: string
          producto_id: string
          unidad_id?: string | null
          cantidad: number
          costo_unitario?: number | null
          precio_unitario?: number | null
        }
        Update: {
          id?: string
          movimiento_id?: string
          producto_id?: string
          unidad_id?: string | null
          cantidad?: number
          costo_unitario?: number | null
          precio_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'movimiento_items_movimiento_id_fkey'
            columns: ['movimiento_id']
            isOneToOne: false
            referencedRelation: 'movimientos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'movimiento_items_producto_id_fkey'
            columns: ['producto_id']
            isOneToOne: false
            referencedRelation: 'productos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'movimiento_items_unidad_id_fkey'
            columns: ['unidad_id']
            isOneToOne: false
            referencedRelation: 'unidades'
            referencedColumns: ['id']
          },
        ]
      }
      tomas_inventario: {
        Row: {
          id: string
          numero: number
          estado: Database['public']['Enums']['estado_toma']
          bodega_id: string
          categoria_id: string | null
          notas: string | null
          usuario_id: string | null
          created_at: string
          cerrada_at: string | null
          ajuste_entrada_id: string | null
          ajuste_salida_id: string | null
        }
        // Solo se escribe mediante las funciones iniciar_toma(), finalizar_toma()...
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'tomas_inventario_categoria_id_fkey'
            columns: ['categoria_id']
            isOneToOne: false
            referencedRelation: 'categorias'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tomas_inventario_ajuste_entrada_id_fkey'
            columns: ['ajuste_entrada_id']
            isOneToOne: false
            referencedRelation: 'movimientos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tomas_inventario_ajuste_salida_id_fkey'
            columns: ['ajuste_salida_id']
            isOneToOne: false
            referencedRelation: 'movimientos'
            referencedColumns: ['id']
          },
        ]
      }
      toma_productos: {
        Row: {
          toma_id: string
          producto_id: string
          stock_inicial: number
          contado: number | null
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'toma_productos_toma_id_fkey'
            columns: ['toma_id']
            isOneToOne: false
            referencedRelation: 'tomas_inventario'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'toma_productos_producto_id_fkey'
            columns: ['producto_id']
            isOneToOne: false
            referencedRelation: 'productos'
            referencedColumns: ['id']
          },
        ]
      }
      auditoria: {
        Row: {
          id: number
          tabla: string
          registro_id: string
          descripcion: string | null
          accion: 'crear' | 'modificar' | 'eliminar'
          cambios: Json
          usuario_id: string | null
          usuario_email: string | null
          fecha: string
        }
        // Solo la escriben los triggers de la base de datos
        Insert: never
        Update: never
        Relationships: []
      }
      toma_seriales: {
        Row: {
          id: string
          toma_id: string
          producto_id: string
          unidad_id: string
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'toma_seriales_unidad_id_fkey'
            columns: ['unidad_id']
            isOneToOne: false
            referencedRelation: 'unidades'
            referencedColumns: ['id']
          },
        ]
      }
      extractos: {
        Row: {
          id: string
          cuenta_tesoreria_id: string
          anio: number
          mes: number
          saldo_inicial: number
          saldo_final: number
          cerrado: boolean
          cerrado_por: string | null
          cerrado_at: string | null
          usuario_id: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      extracto_lineas: {
        Row: {
          id: string
          extracto_id: string
          orden: number
          fecha: string
          descripcion: string
          referencia: string | null
          valor: number
          asiento_id: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'extracto_lineas_extracto_id_fkey'
            columns: ['extracto_id']
            isOneToOne: false
            referencedRelation: 'extractos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'extracto_lineas_asiento_id_fkey'
            columns: ['asiento_id']
            isOneToOne: true
            referencedRelation: 'asientos'
            referencedColumns: ['id']
          },
        ]
      }
      categorias_gasto: {
        Row: { id: string; nombre: string; cuenta: string; activa: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; nombre: string; cuenta: string; activa?: boolean }
        Update: { nombre?: string; cuenta?: string; activa?: boolean }
        Relationships: []
      }
      gastos_recurrentes: {
        Row: {
          id: string
          nombre: string
          categoria_id: string
          proveedor_id: string | null
          tercero_id: string | null
          valor: number
          dia: number
          cuenta_tesoreria_id: string | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nombre: string
          categoria_id: string
          proveedor_id?: string | null
          tercero_id?: string | null
          valor: number
          dia?: number
          cuenta_tesoreria_id?: string | null
          activo?: boolean
        }
        Update: {
          nombre?: string
          categoria_id?: string
          proveedor_id?: string | null
          tercero_id?: string | null
          valor?: number
          dia?: number
          cuenta_tesoreria_id?: string | null
          activo?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'gastos_recurrentes_categoria_id_fkey'
            columns: ['categoria_id']
            isOneToOne: false
            referencedRelation: 'categorias_gasto'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'gastos_recurrentes_proveedor_id_fkey'
            columns: ['proveedor_id']
            isOneToOne: false
            referencedRelation: 'proveedores'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'gastos_recurrentes_tercero_id_fkey'
            columns: ['tercero_id']
            isOneToOne: false
            referencedRelation: 'terceros'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'gastos_recurrentes_cuenta_tesoreria_id_fkey'
            columns: ['cuenta_tesoreria_id']
            isOneToOne: false
            referencedRelation: 'cuentas_tesoreria'
            referencedColumns: ['id']
          },
        ]
      }
      gastos: {
        Row: {
          id: string
          numero: number
          fecha: string
          categoria_id: string
          cuenta: string
          proveedor_id: string | null
          tercero_id: string | null
          descripcion: string
          valor: number
          cuenta_tesoreria_id: string | null
          egreso_id: string | null
          recurrente_id: string | null
          mes_recurrente: string | null
          referencia: string | null
          usuario_id: string | null
          created_at: string
          anulado_at: string | null
          anulado_por: string | null
          motivo_anulacion: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'gastos_categoria_id_fkey'
            columns: ['categoria_id']
            isOneToOne: false
            referencedRelation: 'categorias_gasto'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'gastos_proveedor_id_fkey'
            columns: ['proveedor_id']
            isOneToOne: false
            referencedRelation: 'proveedores'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'gastos_tercero_id_fkey'
            columns: ['tercero_id']
            isOneToOne: false
            referencedRelation: 'terceros'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'gastos_cuenta_tesoreria_id_fkey'
            columns: ['cuenta_tesoreria_id']
            isOneToOne: false
            referencedRelation: 'cuentas_tesoreria'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'gastos_egreso_id_fkey'
            columns: ['egreso_id']
            isOneToOne: true
            referencedRelation: 'egresos'
            referencedColumns: ['id']
          },
        ]
      }
      activos_fijos: {
        Row: {
          id: string
          nombre: string
          cuenta: string
          fecha_compra: string
          costo: number
          valor_residual: number
          vida_util_meses: number
          depreciacion_inicial: number
          serial: string | null
          notas: string | null
          fecha_baja: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nombre: string
          cuenta: string
          fecha_compra: string
          costo: number
          valor_residual?: number
          vida_util_meses: number
          depreciacion_inicial?: number
          serial?: string | null
          notas?: string | null
          fecha_baja?: string | null
        }
        Update: {
          nombre?: string
          cuenta?: string
          fecha_compra?: string
          costo?: number
          valor_residual?: number
          vida_util_meses?: number
          depreciacion_inicial?: number
          serial?: string | null
          notas?: string | null
          fecha_baja?: string | null
        }
        Relationships: []
      }
      depreciaciones: {
        Row: { id: string; activo_id: string; anio: number; mes: number; valor: number; comprobante_id: string }
        Insert: never
        Update: never
        Relationships: []
      }
      cuentas_tesoreria: {
        Row: {
          id: string
          nombre: string
          tipo: 'caja' | 'banco'
          cuenta: string
          banco: string | null
          numero_cuenta: string | null
          activa: boolean
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: { nombre?: string; banco?: string | null; numero_cuenta?: string | null; activa?: boolean }
        Relationships: []
      }
      egresos: {
        Row: {
          id: string
          numero: number
          fecha: string
          clase: 'proveedor' | 'otro'
          cuenta_tesoreria_id: string
          cuenta_contrapartida: string | null
          proveedor_id: string | null
          cliente_id: string | null
          tercero_id: string | null
          valor: number
          metodo: Database['public']['Enums']['metodo_pago']
          concepto: string
          referencia: string | null
          usuario_id: string | null
          created_at: string
          anulado_at: string | null
          anulado_por: string | null
          motivo_anulacion: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'egresos_cuenta_tesoreria_id_fkey'
            columns: ['cuenta_tesoreria_id']
            isOneToOne: false
            referencedRelation: 'cuentas_tesoreria'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'egresos_proveedor_id_fkey'
            columns: ['proveedor_id']
            isOneToOne: false
            referencedRelation: 'proveedores'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'egresos_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'clientes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'egresos_tercero_id_fkey'
            columns: ['tercero_id']
            isOneToOne: false
            referencedRelation: 'terceros'
            referencedColumns: ['id']
          },
        ]
      }
      traslados: {
        Row: {
          id: string
          numero: number
          fecha: string
          origen_id: string
          destino_id: string
          valor: number
          notas: string | null
          usuario_id: string | null
          created_at: string
          anulado_at: string | null
          anulado_por: string | null
          motivo_anulacion: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'traslados_origen_id_fkey'
            columns: ['origen_id']
            isOneToOne: false
            referencedRelation: 'cuentas_tesoreria'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'traslados_destino_id_fkey'
            columns: ['destino_id']
            isOneToOne: false
            referencedRelation: 'cuentas_tesoreria'
            referencedColumns: ['id']
          },
        ]
      }
      anticipos: {
        Row: {
          id: string
          numero: number
          fecha: string
          cliente_id: string
          cuenta_tesoreria_id: string
          valor: number
          metodo: Database['public']['Enums']['metodo_pago']
          referencia: string | null
          notas: string | null
          usuario_id: string | null
          created_at: string
          anulado_at: string | null
          anulado_por: string | null
          motivo_anulacion: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'anticipos_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'clientes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'anticipos_cuenta_tesoreria_id_fkey'
            columns: ['cuenta_tesoreria_id']
            isOneToOne: false
            referencedRelation: 'cuentas_tesoreria'
            referencedColumns: ['id']
          },
        ]
      }
      notas_venta: {
        Row: {
          id: string
          tipo: 'credito' | 'debito'
          numero: number
          movimiento_id: string
          fecha: string
          valor: number
          motivo: string
          cufe: string | null
          usuario_id: string | null
          created_at: string
          anulado_at: string | null
          anulado_por: string | null
          motivo_anulacion: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'notas_venta_movimiento_id_fkey'
            columns: ['movimiento_id']
            isOneToOne: false
            referencedRelation: 'movimientos'
            referencedColumns: ['id']
          },
        ]
      }
      configuracion_contable: {
        Row: {
          id: boolean
          fecha_inicio: string | null
          marco: string
          regimen: string
          responsable_iva: boolean
          agente_retencion: boolean
          tarifa_iva: number
          municipio_ica: string | null
          periodicidad_ica: string | null
          actividad_ciiu: string | null
          tarifa_ica: number | null
          updated_at: string
        }
        Insert: never
        Update: {
          fecha_inicio?: string | null
          marco?: string
          regimen?: string
          responsable_iva?: boolean
          agente_retencion?: boolean
          tarifa_iva?: number
          municipio_ica?: string | null
          periodicidad_ica?: string | null
          actividad_ciiu?: string | null
          tarifa_ica?: number | null
        }
        Relationships: []
      }
      cuentas: {
        Row: {
          id: string
          codigo: string
          nombre: string
          naturaleza: Database['public']['Enums']['naturaleza_cuenta']
          nivel: number
          padre: string | null
          exige_tercero: boolean
          activa: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          codigo: string
          nombre: string
          naturaleza: Database['public']['Enums']['naturaleza_cuenta']
          exige_tercero?: boolean
          activa?: boolean
        }
        Update: {
          nombre?: string
          naturaleza?: Database['public']['Enums']['naturaleza_cuenta']
          exige_tercero?: boolean
          activa?: boolean
        }
        Relationships: []
      }
      terceros: {
        Row: {
          id: string
          tipo_documento: Database['public']['Enums']['tipo_documento']
          documento: string
          nombre: string
          notas: string | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tipo_documento?: Database['public']['Enums']['tipo_documento']
          documento: string
          nombre: string
          notas?: string | null
          activo?: boolean
        }
        Update: {
          tipo_documento?: Database['public']['Enums']['tipo_documento']
          documento?: string
          nombre?: string
          notas?: string | null
          activo?: boolean
        }
        Relationships: []
      }
      parametros_contables: {
        Row: {
          id: string
          clave: string
          nombre: string
          cuenta: string
          updated_at: string
        }
        Insert: never
        Update: { cuenta?: string }
        Relationships: []
      }
      periodos: {
        Row: {
          id: string
          anio: number
          mes: number
          cerrado: boolean
          cerrado_por: string | null
          cerrado_at: string | null
          motivo_reapertura: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      tipos_comprobante: {
        Row: { codigo: string; nombre: string; manual: boolean }
        Insert: never
        Update: never
        Relationships: []
      }
      comprobantes: {
        Row: {
          id: string
          tipo: string
          numero: number
          fecha: string
          descripcion: string
          anula_id: string | null
          anulado_at: string | null
          anulado_por: string | null
          motivo_anulacion: string | null
          usuario_id: string | null
          movimiento_id: string | null
          pago_id: string | null
          nota_id: string | null
          egreso_id: string | null
          traslado_id: string | null
          anticipo_id: string | null
          gasto_id: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'comprobantes_movimiento_id_fkey'
            columns: ['movimiento_id']
            isOneToOne: false
            referencedRelation: 'movimientos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'comprobantes_usuario_id_fkey'
            columns: ['usuario_id']
            isOneToOne: false
            referencedRelation: 'perfiles'
            referencedColumns: ['id']
          },
        ]
      }
      asientos: {
        Row: {
          id: string
          comprobante_id: string
          linea: number
          cuenta: string
          cliente_id: string | null
          proveedor_id: string | null
          tercero_id: string | null
          descripcion: string | null
          debito: number
          credito: number
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'asientos_comprobante_id_fkey'
            columns: ['comprobante_id']
            isOneToOne: false
            referencedRelation: 'comprobantes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'asientos_cuenta_fkey'
            columns: ['cuenta']
            isOneToOne: false
            referencedRelation: 'cuentas'
            referencedColumns: ['codigo']
          },
          {
            foreignKeyName: 'asientos_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'clientes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'asientos_proveedor_id_fkey'
            columns: ['proveedor_id']
            isOneToOne: false
            referencedRelation: 'proveedores'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'asientos_tercero_id_fkey'
            columns: ['tercero_id']
            isOneToOne: false
            referencedRelation: 'terceros'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      cotizaciones_resumen: {
        Row: {
          id: string
          numero: number
          cliente_id: string | null
          cliente_nombre: string
          estado: Database['public']['Enums']['estado_cotizacion']
          valida_hasta: string
          vencida: boolean
          notas: string | null
          usuario_id: string | null
          created_at: string
          cerrada_at: string | null
          venta_id: string | null
          lineas: number
          unidades: number
          total: number
        }
        Relationships: []
      }
      cartera: {
        Row: {
          id: string
          numero: number
          fecha: string
          vence: string
          cliente_id: string
          cliente_nombre: string
          referencia: string | null
          total: number
          devuelto: number
          pagado: number
          saldo: number
          dias_vencida: number
          retenido: number
          notas_credito: number
          notas_debito: number
        }
        Relationships: []
      }
      ordenes_compra_resumen: {
        Row: {
          id: string
          numero: number
          proveedor_id: string
          proveedor_nombre: string
          estado: Database['public']['Enums']['estado_orden_compra']
          fecha_esperada: string | null
          notas: string | null
          usuario_id: string | null
          created_at: string
          cerrada_at: string | null
          lineas: number
          unidades: number
          recibidas: number
          total: number
        }
        Relationships: []
      }
      orden_compra_items_estado: {
        Row: {
          id: string
          orden_id: string
          producto_id: string
          cantidad: number
          costo_unitario: number
          recibido: number
        }
        Relationships: [
          {
            foreignKeyName: 'orden_compra_items_producto_id_fkey'
            columns: ['producto_id']
            isOneToOne: false
            referencedRelation: 'productos'
            referencedColumns: ['id']
          },
        ]
      }
      tomas_resumen: {
        Row: {
          id: string
          numero: number
          estado: Database['public']['Enums']['estado_toma']
          bodega_id: string
          categoria_id: string | null
          categoria_nombre: string | null
          notas: string | null
          usuario_id: string | null
          created_at: string
          cerrada_at: string | null
          ajuste_entrada_id: string | null
          ajuste_salida_id: string | null
          productos: number
          contados: number
        }
        Relationships: []
      }
      stock_actual: {
        Row: {
          producto_id: string | null
          bodega_id: string | null
          cantidad: number | null
        }
        Relationships: []
      }
      movimientos_resumen: {
        Row: {
          id: string
          numero: number
          tipo: Database['public']['Enums']['tipo_movimiento']
          fecha: string
          bodega_id: string
          proveedor_id: string | null
          proveedor_nombre: string | null
          cliente_id: string | null
          cliente_nombre: string | null
          referencia: string | null
          notas: string | null
          usuario_id: string | null
          created_at: string
          lineas: number
          unidades: number
          total_costo: number
          total_venta: number
          motivo: Database['public']['Enums']['motivo_ajuste'] | null
          movimiento_origen_id: string | null
          anulado_at: string | null
          anula_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      es_admin: {
        Args: never
        Returns: boolean
      }
      puede_operar: {
        Args: never
        Returns: boolean
      }
      puede_ver: {
        Args: never
        Returns: boolean
      }
      rol_actual: {
        Args: never
        Returns: Database['public']['Enums']['rol_usuario'] | null
      }
      usuarios_admin: {
        Args: never
        Returns: {
          id: string
          nombre: string | null
          email: string
          rol: Database['public']['Enums']['rol_usuario']
          activo: boolean
          pendiente: boolean
          ultimo_ingreso: string | null
          created_at: string
        }[]
      }
      registrar_movimiento: {
        Args: {
          p_tipo: Database['public']['Enums']['tipo_movimiento']
          p_items: Json
          p_bodega_id?: string | null
          p_proveedor_id?: string | null
          p_cliente_id?: string | null
          p_referencia?: string | null
          p_notas?: string | null
          p_fecha?: string | null
          p_motivo?: Database['public']['Enums']['motivo_ajuste'] | null
          p_movimiento_origen_id?: string | null
        }
        Returns: string
      }
      crear_familia: {
        Args: { p_familia: Json; p_colores: string[]; p_costo_inicial?: number; p_stock_minimo?: number }
        Returns: string
      }
      agregar_color: {
        Args: { p_familia_id: string; p_color: string; p_costo_inicial?: number; p_stock_minimo?: number }
        Returns: string
      }
      iniciar_toma: {
        Args: { p_categoria_id?: string | null; p_notas?: string | null }
        Returns: string
      }
      contar_producto: {
        Args: { p_toma_id: string; p_producto_id: string; p_contado: number | null }
        Returns: undefined
      }
      sumar_conteo: {
        Args: { p_toma_id: string; p_producto_id: string; p_cantidad?: number }
        Returns: number
      }
      escanear_serial: {
        Args: { p_toma_id: string; p_numero_serie: string }
        Returns: Json
      }
      quitar_serial: {
        Args: { p_toma_id: string; p_unidad_id: string }
        Returns: undefined
      }
      finalizar_toma: {
        Args: { p_toma_id: string }
        Returns: Json
      }
      cancelar_toma: {
        Args: { p_toma_id: string }
        Returns: undefined
      }
      ver_costos: {
        Args: never
        Returns: boolean
      }
      costos_productos: {
        Args: never
        Returns: { producto_id: string; precio_costo: number }[]
      }
      hay_clave_anulacion: {
        Args: never
        Returns: boolean
      }
      definir_clave_anulacion: {
        Args: { p_nueva: string; p_actual?: string | null }
        Returns: Json
      }
      anular_movimiento: {
        Args: { p_id: string; p_motivo: string; p_clave: string }
        Returns: Json
      }
      guardar_cotizacion: {
        Args: {
          p_items: Json
          p_valida_hasta: string
          p_id?: string | null
          p_cliente_id?: string | null
          p_cliente_nombre?: string | null
          p_notas?: string | null
        }
        Returns: string
      }
      rechazar_cotizacion: {
        Args: { p_id: string }
        Returns: undefined
      }
      registrar_venta: {
        Args: {
          p_items: Json
          p_cliente_id?: string | null
          p_referencia?: string | null
          p_notas?: string | null
          p_fecha?: string | null
          p_bodega_id?: string | null
          p_credito?: boolean
          p_vence?: string | null
          p_cotizacion_id?: string | null
        }
        Returns: string
      }
      cambiar_forma_pago: {
        Args: { p_movimiento_id: string; p_credito: boolean; p_vence?: string | null }
        Returns: undefined
      }
      registrar_pago: {
        Args: {
          p_movimiento_id: string
          p_valor: number
          p_metodo: Database['public']['Enums']['metodo_pago']
          p_fecha?: string | null
          p_referencia?: string | null
          p_notas?: string | null
          p_retencion?: number | null
          p_cuenta_tesoreria_id?: string | null
        }
        Returns: string
      }
      crear_cuenta_tesoreria: {
        Args: {
          p_nombre: string
          p_tipo: 'caja' | 'banco'
          p_banco?: string | null
          p_numero_cuenta?: string | null
          p_cuenta?: string | null
        }
        Returns: string
      }
      saldos_tesoreria: {
        Args: { p_hasta?: string | null }
        Returns: {
          id: string
          nombre: string
          tipo: 'caja' | 'banco'
          cuenta: string
          banco: string | null
          numero_cuenta: string | null
          activa: boolean
          saldo: number
        }[]
      }
      registrar_egreso: {
        Args: {
          p_fecha: string
          p_clase: 'proveedor' | 'otro'
          p_cuenta_tesoreria_id: string
          p_valor: number
          p_metodo: Database['public']['Enums']['metodo_pago']
          p_concepto: string
          p_proveedor_id?: string | null
          p_cuenta?: string | null
          p_cliente_id?: string | null
          p_tercero_id?: string | null
          p_referencia?: string | null
        }
        Returns: string
      }
      registrar_traslado: {
        Args: { p_fecha: string; p_origen_id: string; p_destino_id: string; p_valor: number; p_notas?: string | null }
        Returns: string
      }
      registrar_anticipo: {
        Args: {
          p_fecha: string
          p_cliente_id: string
          p_cuenta_tesoreria_id: string
          p_valor: number
          p_metodo: Database['public']['Enums']['metodo_pago']
          p_referencia?: string | null
          p_notas?: string | null
        }
        Returns: string
      }
      aplicar_anticipo: {
        Args: { p_anticipo_id: string; p_movimiento_id: string; p_valor: number }
        Returns: string
      }
      anular_tesoreria: {
        Args: { p_tabla: 'egresos' | 'traslados' | 'anticipos'; p_id: string; p_motivo: string }
        Returns: undefined
      }
      edades_por_tercero: {
        Args: { p_cuenta: string; p_hasta?: string | null }
        Returns: {
          clase: string
          tercero_id: string
          nombre: string
          documento: string | null
          al_dia: number | null
          d1_30: number | null
          d31_60: number | null
          d61_90: number | null
          mas_90: number | null
          total: number
        }[]
      }
      registrar_nota_venta: {
        Args: {
          p_movimiento_id: string
          p_tipo: 'credito' | 'debito'
          p_valor: number
          p_motivo: string
          p_fecha?: string | null
          p_cufe?: string | null
        }
        Returns: string
      }
      anular_nota_venta: {
        Args: { p_id: string; p_motivo: string }
        Returns: undefined
      }
      definir_cufe: {
        Args: { p_movimiento_id: string; p_cufe: string | null }
        Returns: undefined
      }
      saldos_por_tercero: {
        Args: { p_cuenta: string; p_hasta: string }
        Returns: {
          clase: string
          tercero_id: string | null
          nombre: string
          documento: string | null
          debitos: number
          creditos: number
          saldo: number
        }[]
      }
      anular_pago: {
        Args: { p_id: string; p_motivo: string }
        Returns: undefined
      }
      guardar_orden_compra: {
        Args: {
          p_proveedor_id: string
          p_items: Json
          p_id?: string | null
          p_fecha_esperada?: string | null
          p_notas?: string | null
        }
        Returns: string
      }
      cancelar_orden_compra: {
        Args: { p_id: string }
        Returns: undefined
      }
      recibir_orden_compra: {
        Args: {
          p_orden_id: string
          p_items: Json
          p_referencia?: string | null
          p_notas?: string | null
          p_fecha?: string | null
          p_bodega_id?: string | null
        }
        Returns: string
      }
      importar_productos: {
        Args: { p_productos: Json }
        Returns: Json
      }
      costos_lineas: {
        Args: { p_movimiento_id?: string | null; p_desde?: string | null; p_hasta?: string | null }
        Returns: { id: string; costo_unitario: number | null }[]
      }
      ver_contabilidad: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      lleva_contabilidad: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      registrar_comprobante: {
        Args: { p_tipo: string; p_fecha: string; p_descripcion: string; p_lineas: Json }
        Returns: string
      }
      anular_comprobante: {
        Args: { p_id: string; p_motivo: string }
        Returns: string
      }
      cerrar_periodo: {
        Args: { p_anio: number; p_mes: number; p_forzar?: boolean }
        Returns: undefined
      }
      registrar_gasto: {
        Args: {
          p_fecha: string
          p_categoria_id: string
          p_valor: number
          p_descripcion: string
          p_cuenta_tesoreria_id?: string | null
          p_proveedor_id?: string | null
          p_tercero_id?: string | null
          p_referencia?: string | null
          p_recurrente_id?: string | null
        }
        Returns: string
      }
      pagar_gasto: {
        Args: {
          p_gasto_id: string
          p_cuenta_tesoreria_id: string
          p_fecha: string
          p_metodo: Database['public']['Enums']['metodo_pago']
          p_referencia?: string | null
        }
        Returns: string
      }
      anular_gasto: {
        Args: { p_id: string; p_motivo: string }
        Returns: undefined
      }
      recurrentes_pendientes: {
        Args: { p_anio: number; p_mes: number }
        Returns: { id: string; nombre: string; categoria: string; valor: number; dia: number; fecha: string }[]
      }
      confirmar_recurrente: {
        Args: { p_id: string; p_anio: number; p_mes: number; p_valor?: number | null }
        Returns: string
      }
      depreciar_mes: {
        Args: { p_anio: number; p_mes: number }
        Returns: number
      }
      estado_resultados: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          codigo: string
          nombre: string
          nivel: number
          naturaleza: Database['public']['Enums']['naturaleza_cuenta']
          valor: number
        }[]
      }
      situacion_financiera: {
        Args: { p_hasta: string }
        Returns: {
          codigo: string
          nombre: string
          nivel: number
          naturaleza: Database['public']['Enums']['naturaleza_cuenta']
          valor: number
        }[]
      }
      cierre_anual: {
        Args: { p_anio: number }
        Returns: string
      }
      anular_cierre_anual: {
        Args: { p_anio: number; p_motivo: string }
        Returns: undefined
      }
      base_ica: {
        Args: { p_anio: number }
        Returns: {
          bimestre: number
          desde: string
          hasta: string
          ingresos: number
          devoluciones: number
          base: number
          tarifa: number | null
          impuesto: number | null
        }[]
      }
      retenciones_a_favor: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          cliente_id: string
          nombre: string
          documento: string
          base: number
          retencion: number
          abonos: number
        }[]
      }
      importar_extracto: {
        Args: {
          p_cuenta_tesoreria_id: string
          p_anio: number
          p_mes: number
          p_saldo_inicial: number
          p_saldo_final: number
          p_lineas: Json
        }
        Returns: string
      }
      conciliar_automatico: {
        Args: { p_extracto_id: string }
        Returns: number
      }
      conciliar_linea: {
        Args: { p_linea_id: string; p_asiento_id: string | null }
        Returns: undefined
      }
      estado_conciliacion: {
        Args: { p_extracto_id: string }
        Returns: {
          saldo_libros: number
          saldo_extracto: number
          banco_no_libros: number
          libros_no_banco: number
          diferencia: number
          lineas_pendientes: number
          asientos_pendientes: number
        }[]
      }
      asientos_sin_conciliar: {
        Args: { p_extracto_id: string }
        Returns: {
          asiento_id: string
          comprobante_id: string
          tipo: string
          numero: number
          fecha: string
          descripcion: string
          valor: number
        }[]
      }
      cerrar_conciliacion: {
        Args: { p_extracto_id: string; p_cerrar?: boolean }
        Returns: undefined
      }
      flujo_efectivo: {
        Args: { p_desde: string; p_hasta: string }
        Returns: { concepto: string; entradas: number; salidas: number }[]
      }
      flujo_proyectado: {
        Args: { p_semanas?: number }
        Returns: { semana: number; desde: string; hasta: string; cobros: number; pagos: number }[]
      }
      checklist_cierre: {
        Args: { p_anio: number; p_mes: number }
        Returns: { item: string; titulo: string; ok: boolean; detalle: string | null }[]
      }
      reabrir_periodo: {
        Args: { p_anio: number; p_mes: number; p_motivo: string }
        Returns: undefined
      }
      balance_prueba: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          codigo: string
          nombre: string
          nivel: number
          naturaleza: Database['public']['Enums']['naturaleza_cuenta']
          saldo_inicial: number
          debitos: number
          creditos: number
          saldo_final: number
        }[]
      }
      contabilizar_movimientos_pendientes: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      conciliacion_inventario: {
        Args: Record<PropertyKey, never>
        Returns: {
          saldo_contable: number
          valor_inventario: number
          diferencia: number
          movimientos_pendientes: number
        }[]
      }
      auxiliar_cuenta: {
        Args: { p_cuenta: string; p_desde: string; p_hasta: string }
        Returns: {
          comprobante_id: string | null
          fecha: string
          tipo: string | null
          numero: number | null
          linea: number | null
          cuenta: string | null
          descripcion: string
          tercero: string | null
          debito: number | null
          credito: number | null
          saldo: number
        }[]
      }
    }
    Enums: {
      rol_usuario: 'admin' | 'bodega' | 'lectura' | 'contador'
      naturaleza_cuenta: 'debito' | 'credito'
      tipo_movimiento: 'entrada' | 'salida' | 'ajuste_entrada' | 'ajuste_salida'
      estado_unidad: 'disponible' | 'vendida' | 'en_garantia' | 'danada' | 'baja'
      tipo_documento: 'CC' | 'NIT' | 'CE' | 'PAS' | 'TI' | 'OTRO'
      estado_toma: 'en_curso' | 'finalizada' | 'cancelada'
      estado_orden_compra: 'abierta' | 'recibida' | 'cancelada'
      estado_cotizacion: 'abierta' | 'aceptada' | 'rechazada'
      metodo_pago: 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'otro'
      motivo_ajuste:
        | 'inventario_inicial'
        | 'sobrante_conteo'
        | 'devolucion_cliente'
        | 'regreso_garantia'
        | 'faltante_conteo'
        | 'producto_danado'
        | 'envio_garantia'
        | 'uso_interno'
        | 'obsequio'
        | 'perdida'
        | 'otro'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']
export type Views<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row']
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]
