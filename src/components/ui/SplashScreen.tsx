import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { EVENTO_SPLASH } from './splash'

/** Se muestra al abrir la app (una vez por pestaña: al recargar no se repite) y al iniciar sesión */
const CLAVE_VISTA = 'netsec:splash-visto'
/** Tiempo que la animación queda en pantalla antes de desvanecerse (ms) */
const DURACION = 3000
const DURACION_REDUCIDA = 600
/** En modo continuación, cuánto se queda el símbolo quieto antes de que aparezca el texto (s) */
const PAUSA_CONTINUACION = 0.45
/** Diferencia entre los retardos del modo completo (esperan al giro del símbolo) y los del modo continuación */
const DESFASE_CONTINUACION = 0.75

/**
 * - completa: el símbolo entra girando (navegador de escritorio y al iniciar sesión)
 * - continuacion: la app instalada se abre tras la pantalla de inicio del sistema (icono quieto en el centro);
 *   la animación arranca desde ese mismo punto para que no se note el salto
 */
type Modo = 'completa' | 'continuacion'

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

function esAppInstalada(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Animación de bienvenida con el logo. Se cierra sola o con un toque. */
export function SplashScreen() {
  const [visible, setVisible] = useState(() => !yaVisto())
  const [modo, setModo] = useState<Modo>(() => (esAppInstalada() ? 'continuacion' : 'completa'))
  // Cambia en cada aparición para que la animación empiece de cero
  const [vez, setVez] = useState(0)
  const reducido = useReducedMotion()

  useEffect(() => {
    const mostrar = () => {
      setModo('completa')
      setVez((n) => n + 1)
      setVisible(true)
    }
    window.addEventListener(EVENTO_SPLASH, mostrar)
    return () => window.removeEventListener(EVENTO_SPLASH, mostrar)
  }, [])

  useEffect(() => {
    if (!visible) return
    marcarVisto()
    const t = setTimeout(() => setVisible(false), reducido ? DURACION_REDUCIDA : DURACION)
    return () => clearTimeout(t)
  }, [visible, vez, reducido])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`splash-${vez}`}
          role="presentation"
          onClick={() => setVisible(false)}
          className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-brand-bg print:hidden"
          exit={{ opacity: 0, scale: reducido ? 1 : 1.04 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        >
          <Animacion modo={modo} reducido={reducido ?? false} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Animacion({ modo, reducido }: { modo: Modo; reducido: boolean }) {
  const continuacion = modo === 'continuacion'
  // En modo continuación el texto entra después y el símbolo sube para hacerle sitio
  const [mostrarTexto, setMostrarTexto] = useState(!continuacion)

  useEffect(() => {
    if (mostrarTexto) return
    const t = setTimeout(() => setMostrarTexto(true), PAUSA_CONTINUACION * 1000)
    return () => clearTimeout(t)
  }, [mostrarTexto])

  /** Retardo de cada elemento: en continuación se cuenta desde que aparece el texto */
  const retardo = (s: number) => (reducido ? 0 : continuacion ? Math.max(s - DESFASE_CONTINUACION, 0) : s)
  const duracionBarra = (reducido ? DURACION_REDUCIDA : DURACION) / 1000 - (continuacion ? PAUSA_CONTINUACION : 0)

  return (
    <>
      {/* Resplandor azul detrás del símbolo */}
      <motion.div
        aria-hidden
        className="absolute size-[28rem] rounded-full bg-brand-accent/25 blur-3xl"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reducido ? 0 : 1.2, ease: 'easeOut' }}
      />

      <motion.div layout={!reducido} transition={{ duration: 0.6, ease: 'easeInOut' }} className="relative">
        {/* Onda que se expande desde el símbolo */}
        {!reducido && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-brand-cyan"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0, 0.8, 0], scale: [1, 1, 1.9] }}
            transition={{ duration: 1.1, delay: continuacion ? 0.1 : 0.75, ease: 'easeOut', times: [0, 0.1, 1] }}
          />
        )}
        {/* Mismo tamaño y resplandor que el símbolo de index.html, que se ve mientras carga la app */}
        <motion.img
          src="/brand/simbolo.svg"
          alt="Net&Sec Suministros"
          className="relative size-32 drop-shadow-[0_0_30px_rgba(0,180,240,0.45)] sm:size-40"
          initial={
            continuacion ? false : reducido ? { opacity: 0 } : { opacity: 0, scale: 0.3, rotate: -180 }
          }
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={reducido ? { duration: 0.3 } : { type: 'spring', stiffness: 120, damping: 14 }}
        />
      </motion.div>

      {mostrarTexto && (
        <>
          <motion.div
            className="relative mt-8 text-center font-display"
            initial={{ opacity: 0, y: reducido ? 0 : 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: retardo(0.9), ease: 'easeOut' }}
          >
            <p className="text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
              Net<span className="text-brand-cyan">&amp;</span>Sec
            </p>
            <motion.p
              className="mt-2 text-sm font-semibold text-slate-300 sm:text-base"
              initial={{ opacity: 0, letterSpacing: reducido ? '0.45em' : '0.1em' }}
              animate={{ opacity: 1, letterSpacing: '0.45em' }}
              transition={{ duration: 0.8, delay: retardo(1.15), ease: 'easeOut' }}
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
              transition={{ duration: reducido ? 0.3 : 0.9, delay: retardo(1.6), ease: 'easeInOut' }}
            />
          </motion.div>

          {/* Barra de carga */}
          <motion.div
            className="relative mt-10 h-0.5 w-40 overflow-hidden rounded-full bg-brand-border"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="h-full bg-gradient-to-r from-brand-accent to-brand-cyan"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: duracionBarra, ease: 'easeInOut' }}
            />
          </motion.div>
        </>
      )}
    </>
  )
}
