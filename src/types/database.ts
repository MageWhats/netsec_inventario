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
          rol: Database['public']['Enums']['rol_usuario']
          created_at: string
        }
        Insert: {
          id: string
          nombre?: string | null
          rol?: Database['public']['Enums']['rol_usuario']
          created_at?: string
        }
        Update: {
          id?: string
          nombre?: string | null
          rol?: Database['public']['Enums']['rol_usuario']
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
      categorias: {
        Row: {
          id: string
          nombre: string
          created_at: string
        }
        Insert: {
          id?: string
          nombre: string
          created_at?: string
        }
        Update: {
          id?: string
          nombre?: string
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
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
        }
        Insert: {
          id?: string
          sku: string
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
        }
        Relationships: [
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
    }
    Views: {
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
        }
        Relationships: []
      }
    }
    Functions: {
      es_admin: {
        Args: never
        Returns: boolean
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
        }
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
    }
    Enums: {
      rol_usuario: 'admin' | 'bodega' | 'lectura'
      tipo_movimiento: 'entrada' | 'salida' | 'ajuste_entrada' | 'ajuste_salida'
      estado_unidad: 'disponible' | 'vendida' | 'en_garantia' | 'danada' | 'baja'
      tipo_documento: 'CC' | 'NIT' | 'CE' | 'PAS' | 'TI' | 'OTRO'
      estado_toma: 'en_curso' | 'finalizada' | 'cancelada'
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
