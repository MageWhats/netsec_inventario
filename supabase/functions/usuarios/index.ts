// =====================================================================
// Edge Function "usuarios": acciones sobre cuentas que requieren la clave
// de servicio de Supabase (nunca debe llegar al navegador).
//
//   invitar     envía la invitación por correo y asigna nombre y rol
//   reenviar    reenvía la invitación, o un enlace para cambiar la
//               contraseña si la persona ya la había creado
//   desactivar  bloquea el ingreso (y el perfil deja de tener permisos)
//   reactivar   lo desbloquea
//
// Solo la puede usar un admin activo. Los cambios en perfiles se hacen con
// el token de quien llama, así el historial de cambios registra quién fue.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2'

const ROLES = ['admin', 'bodega', 'lectura']
const BLOQUEO_INDEFINIDO = '876000h' // ~100 años

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const falla = (mensaje: string, status = 400) => responder({ error: mensaje }, status)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return falla('Método no permitido', 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const clienteUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const clienteAdmin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { data: esAdmin, error: errorPermiso } = await clienteUsuario.rpc('es_admin')
  if (errorPermiso || !esAdmin) return falla('No tienes permisos para gestionar usuarios', 403)

  let cuerpo: Record<string, unknown>
  try {
    cuerpo = await req.json()
  } catch {
    return falla('Solicitud inválida')
  }

  // La invitación lleva a la página donde la persona crea su contraseña
  const origen = req.headers.get('origin')
  const redirectTo = origen ? `${origen}/bienvenida` : undefined

  switch (cuerpo.accion) {
    case 'invitar': {
      const email = String(cuerpo.email ?? '').trim().toLowerCase()
      const nombre = String(cuerpo.nombre ?? '').trim()
      const rol = String(cuerpo.rol ?? '')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return falla('Email inválido')
      if (nombre.length < 2 || nombre.length > 100) return falla('El nombre debe tener entre 2 y 100 caracteres')
      if (!ROLES.includes(rol)) return falla('Rol inválido')

      const { data, error } = await clienteAdmin.auth.admin.inviteUserByEmail(email, {
        data: { nombre },
        redirectTo,
      })
      if (error) {
        if (/already been registered|already registered|exists/i.test(error.message)) {
          return falla('Ya existe un usuario con ese correo')
        }
        return falla(`No se pudo enviar la invitación: ${error.message}`, 500)
      }

      // El perfil lo crea el trigger de Auth con rol "lectura": se le asigna el elegido
      const { error: errorPerfil } = await clienteUsuario
        .from('perfiles')
        .update({ nombre, rol })
        .eq('id', data.user.id)
      if (errorPerfil) {
        return falla(`La invitación se envió, pero no se pudo asignar el rol: ${errorPerfil.message}`, 500)
      }
      return responder({ id: data.user.id })
    }

    case 'reenviar': {
      const id = String(cuerpo.id ?? '')
      const { data, error } = await clienteAdmin.auth.admin.getUserById(id)
      if (error || !data.user?.email) return falla('Usuario no encontrado', 404)

      const invitacion = await clienteAdmin.auth.admin.inviteUserByEmail(data.user.email, { redirectTo })
      if (invitacion.error) {
        // Ya aceptó la invitación antes: se le envía un enlace para (re)crear la contraseña
        const recuperacion = await clienteAdmin.auth.resetPasswordForEmail(data.user.email, { redirectTo })
        if (recuperacion.error) return falla(`No se pudo enviar el correo: ${recuperacion.error.message}`, 500)
      }
      return responder({ ok: true })
    }

    case 'desactivar':
    case 'reactivar': {
      const id = String(cuerpo.id ?? '')
      const activo = cuerpo.accion === 'reactivar'

      // Primero el perfil: sus reglas (no a uno mismo, siempre un admin) pueden rechazarlo
      const { data: perfil, error: errorPerfil } = await clienteUsuario
        .from('perfiles')
        .update({ activo })
        .eq('id', id)
        .select('id')
        .maybeSingle()
      if (errorPerfil) return falla(errorPerfil.message)
      if (!perfil) return falla('Usuario no encontrado', 404)

      const { error } = await clienteAdmin.auth.admin.updateUserById(id, {
        ban_duration: activo ? 'none' : BLOQUEO_INDEFINIDO,
      })
      if (error) return falla(`No se pudo ${activo ? 'reactivar' : 'bloquear'} el ingreso: ${error.message}`, 500)
      return responder({ ok: true })
    }

    default:
      return falla('Acción desconocida')
  }
})
