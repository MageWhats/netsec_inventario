import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { EVENTO_SPLASH } from './splash'

/** Se muestra al abrir la app (una vez por pestaña: al recargar no se repite) y al iniciar sesión */
const CLAVE_VISTA = 'netsec:splash-visto'
/** Tiempo que la animación queda en pantalla antes de desvanecerse (ms) */
const DURACION = 3000
const DURACION_REDUCIDA = 600

function yaVisto(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_VISTA) === '1'
  } catch {
    return false
  }
}

function marcarVisto() {
  try {
    sessionStorage.setItem(CLAVE_VISTA, '1')
  } catch {
    // Sin almacenamiento (modo privado): simplemente se volverá a mostrar
  }
}

/** Animación de bienvenida con el logo. Se cierra sola o con un toque. */
export function SplashScreen() {
  const [visible, setVisible] = useState(() => !yaVisto())
  const reducido = useReducedMotion()

  useEffect(() => {
    const mostrar = () => setVisible(true)
    window.addEventListener(EVENTO_SPLASH, mostrar)
    return () => window.removeEventListener(EVENTO_SPLASH, mostrar)
  }, [])

  useEffect(() => {
    if (!visible) return
    marcarVisto()
    const t = setTimeout(() => setVisible(false), reducido ? DURACION_REDUCIDA : DURACION)
    return () => clearTimeout(t)
  }, [visible, reducido])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          role="presentation"
          onClick={() => setVisible(false)}
          className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-brand-bg print:hidden"
          exit={{ opacity: 0, scale: reducido ? 1 : 1.04 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        >
          {/* Resplandor azul detrás del símbolo */}
          <motion.div
            aria-hidden
            className="absolute size-[28rem] rounded-full bg-brand-accent/25 blur-3xl"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reducido ? 0 : 1.2, ease: 'easeOut' }}
          />

          <div className="relative">
            {/* Onda que se expande cuando el símbolo termina de entrar */}
            {!reducido && (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full border-2 border-brand-cyan"
                initial={{ opacity: 0, scale: 1 }}
                animate={{ opacity: [0, 0.8, 0], scale: [1, 1, 1.9] }}
                transition={{ duration: 1.1, delay: 0.75, ease: 'easeOut', times: [0, 0.1, 1] }}
              />
            )}
            <motion.img
              src="/brand/simbolo.svg"
              alt="Net&Sec Suministros"
              className="relative size-32 drop-shadow-[0_0_30px_rgba(0,180,240,0.45)] sm:size-40"
              initial={reducido ? { opacity: 0 } : { opacity: 0, scale: 0.3, rotate: -180 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={reducido ? { duration: 0.3 } : { type: 'spring', stiffness: 120, damping: 14 }}
            />
          </div>

          <motion.div
            className="relative mt-8 text-center font-display"
            initial={{ opacity: 0, y: reducido ? 0 : 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: reducido ? 0 : 0.9, ease: 'easeOut' }}
          >
            <p className="text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
              Net<span className="text-brand-cyan">&amp;</span>Sec
            </p>
            <motion.p
              className="mt-2 text-sm font-semibold text-slate-300 sm:text-base"
              initial={{ opacity: 0, letterSpacing: reducido ? '0.45em' : '0.1em' }}
              animate={{ opacity: 1, letterSpacing: '0.45em' }}
              transition={{ duration: 0.8, delay: reducido ? 0 : 1.15, ease: 'easeOut' }}
            >
              SUMINISTROS
            </motion.p>
            {/* Eslogan: se descubre de izquierda a derecha, como escrito a mano */}
            <motion.img
              src="/brand/eslogan-blanco.svg"
              alt="Más que productos, soluciones para ti"
              className="mx-auto mt-5 h-14 w-auto sm:h-16"
              initial={reducido ? { opacity: 0 } : { opacity: 1, clipPath: 'inset(0 100% 0 0)' }}
              animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0)' }}
              transition={{ duration: reducido ? 0.3 : 0.9, delay: reducido ? 0 : 1.6, ease: 'easeInOut' }}
            />
          </motion.div>

          {/* Barra de carga */}
          <div className="relative mt-10 h-0.5 w-40 overflow-hidden rounded-full bg-brand-border">
            <motion.div
              className="h-full bg-gradient-to-r from-brand-accent to-brand-cyan"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: (reducido ? DURACION_REDUCIDA : DURACION) / 1000, ease: 'easeInOut' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
