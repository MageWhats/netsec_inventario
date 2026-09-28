import { animate, AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EVENTO_SPLASH } from './splash'

// Fluidez: solo se animan `transform` y `opacity` (como `transform` completo, no x/scale sueltos). Así framer-motion
// usa animaciones nativas del navegador que corren en la GPU, sin depender del hilo principal, que en ese momento
// está ocupado cargando la app.

/** Se muestra al abrir la app (una vez por pestaña: al recargar no se repite) y al iniciar sesión */
const CLAVE_VISTA = 'netsec:splash-visto'
/** Tiempo que la animación queda en pantalla antes de desvanecerse (ms) */
const DURACION = 3000
const DURACION_REDUCIDA = 600
/** En modo continuación, cuánto se queda el símbolo quieto en el centro antes de subir (s) */
const PAUSA_CONTINUACION = 0.45
/** Los retardos del texto están pensados para el modo completo (esperan al giro del símbolo) */
const DESFASE_CONTINUACION = -0.3

/** Curva con un pequeño rebote al final (sustituye al resorte, que no puede correr en la GPU) */
const REBOTE = [0.34, 1.45, 0.64, 1] as const
const SUAVE = [0.22, 1, 0.36, 1] as const

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
          className="fixed inset-0 z-[100] cursor-pointer overflow-hidden bg-brand-bg print:hidden"
          // Salida en dos pasos: primero se va el logo (abajo) y luego el fondo, para que el logo y su
          // resplandor nunca queden superpuestos a medias sobre la pantalla que aparece debajo
          exit={{ opacity: 0, transition: { duration: 0.4, delay: reducido ? 0 : 0.25, ease: 'easeInOut' } }}
        >
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center"
            exit={{
              opacity: 0,
              transform: reducido ? 'none' : 'scale(0.96)',
              transition: { duration: 0.3, ease: 'easeIn' },
            }}
          >
            <Animacion modo={modo} reducido={reducido ?? false} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Animacion({ modo, reducido }: { modo: Modo; reducido: boolean }) {
  const continuacion = modo === 'continuacion' && !reducido
  const simbolo = useRef<HTMLDivElement>(null)

  // Modo continuación: el símbolo empieza centrado en la pantalla (donde estaba el icono del sistema) y sube
  // a su sitio. Se mide antes de pintar para que el primer fotograma ya esté en el centro.
  useLayoutEffect(() => {
    const el = simbolo.current
    if (!continuacion || !el) return
    const r = el.getBoundingClientRect()
    const desplazamiento = window.innerHeight / 2 - (r.top + r.height / 2)
    el.style.transform = `translateY(${desplazamiento}px)`
    const animacion = animate(
      el,
      { transform: [`translateY(${desplazamiento}px)`, 'translateY(0px)'] },
      { duration: 0.7, delay: PAUSA_CONTINUACION, ease: SUAVE },
    )
    return () => animacion.stop()
  }, [continuacion])

  /** Retardo de cada elemento según el modo */
  const retardo = (s: number) => (reducido ? 0 : continuacion ? Math.max(s + DESFASE_CONTINUACION, 0) : s)
  const aparecer = (s: number, duracion = 0.5) => ({ duration: reducido ? 0.3 : duracion, delay: retardo(s), ease: SUAVE })

  return (
    <>
      {/* Resplandor azul detrás del símbolo: degradado radial en vez de desenfoque, mucho más ligero */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute size-[36rem] rounded-full will-change-transform"
        style={{ background: 'radial-gradient(circle, rgb(7 114 199 / 0.28) 0%, rgb(7 114 199 / 0.1) 40%, transparent 70%)' }}
        initial={{ opacity: 0, transform: 'scale(0.5)' }}
        animate={{ opacity: 1, transform: 'scale(1)' }}
        transition={{ duration: reducido ? 0 : 1.4, ease: SUAVE }}
      />

      <div ref={simbolo} className="relative will-change-transform">
        {/* Onda que se expande desde el símbolo */}
        {!reducido && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-brand-cyan will-change-transform"
            initial={{ opacity: 0, transform: 'scale(1)' }}
            animate={{ opacity: [0, 0.8, 0], transform: ['scale(1)', 'scale(1)', 'scale(1.9)'] }}
            transition={{ duration: 1.1, delay: continuacion ? 0.1 : 0.75, ease: 'easeOut', times: [0, 0.1, 1] }}
          />
        )}
        {/* Mismo tamaño y resplandor que el símbolo de index.html, que se ve mientras carga la app */}
        <motion.img
          src="/brand/simbolo.svg"
          alt="Net&Sec Suministros"
          className="relative size-32 drop-shadow-[0_0_30px_rgba(0,180,240,0.45)] will-change-transform sm:size-40"
          initial={
            continuacion ? false : reducido ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.3) rotate(-180deg)' }
          }
          animate={{ opacity: 1, transform: 'scale(1) rotate(0deg)' }}
          transition={reducido ? { duration: 0.3 } : { duration: 0.95, ease: REBOTE }}
        />
      </div>

      <div className="relative mt-8 text-center font-display">
        <motion.p
          className="text-4xl font-bold tracking-[-0.04em] text-white will-change-transform sm:text-5xl"
          initial={{ opacity: 0, transform: reducido ? 'none' : 'translateY(16px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          transition={aparecer(0.9)}
        >
          Net<span className="text-brand-cyan">&amp;</span>Sec
        </motion.p>

        {/* Letra a letra (antes se animaba el espaciado, que obliga a recalcular el texto en cada fotograma) */}
        <p className="mt-2 text-sm font-semibold tracking-[0.45em] text-slate-300 sm:text-base" aria-label="Suministros">
          {'SUMINISTROS'.split('').map((letra, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="inline-block will-change-transform"
              initial={{ opacity: 0, transform: reducido ? 'none' : 'translateY(8px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              transition={aparecer(1.1 + i * 0.035, 0.4)}
            >
              {letra}
            </motion.span>
          ))}
        </p>

        {/* Eslogan: se descubre de izquierda a derecha como escrito a mano. Dos desplazamientos opuestos
            (el marco entra desde la izquierda y el contenido en sentido contrario) en vez de recortar */}
        <div className="mx-auto mt-5 w-fit overflow-hidden">
          <motion.div
            className="will-change-transform"
            initial={reducido ? { opacity: 0 } : { transform: 'translateX(-100%)' }}
            animate={{ opacity: 1, transform: 'translateX(0%)' }}
            transition={aparecer(1.6, 0.9)}
          >
            <motion.img
              src="/brand/eslogan-blanco.svg"
              alt="Más que productos, soluciones para ti"
              className="h-14 w-auto will-change-transform sm:h-16"
              initial={reducido ? false : { transform: 'translateX(100%)' }}
              animate={{ transform: 'translateX(0%)' }}
              transition={aparecer(1.6, 0.9)}
            />
          </motion.div>
        </div>
      </div>

      {/* Barra de carga: se escala en vez de cambiar el ancho */}
      <div className="relative mt-10 h-0.5 w-40 overflow-hidden rounded-full bg-brand-border">
        <motion.div
          className="h-full origin-left bg-gradient-to-r from-brand-accent to-brand-cyan will-change-transform"
          initial={{ transform: 'scaleX(0)' }}
          animate={{ transform: 'scaleX(1)' }}
          transition={{ duration: (reducido ? DURACION_REDUCIDA : DURACION) / 1000, ease: 'easeInOut' }}
        />
      </div>
    </>
  )
}
