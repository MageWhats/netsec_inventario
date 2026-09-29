// Logo vectorial de Net&Sec (originales en branding/, copias servidas desde public/brand)
import { useTema } from '@/lib/tema'

/** Símbolo + "Net&Sec SUMINISTROS" (menú lateral y barra móvil): texto blanco en el tema oscuro, azul en el claro */
export function LogoHorizontal({ className = '' }: { className?: string }) {
  const tema = useTema()
  return (
    <img
      src={tema === 'claro' ? '/brand/logo-horizontal-color.svg' : '/brand/logo-horizontal-blanco.svg'}
      alt="Net&Sec Suministros"
      className={`h-10 w-auto ${className}`}
    />
  )
}

/** Logo completo con el eslogan (inicio de sesión): en blanco en el tema oscuro, a color en el claro */
export function LogoCompleto({ className = '' }: { className?: string }) {
  const tema = useTema()
  return (
    <img
      src={tema === 'claro' ? '/brand/logo-color.svg' : '/brand/logo-blanco.svg'}
      alt="Net&Sec Suministros"
      className={`w-auto ${className}`}
    />
  )
}

/** Logo a color: solo aparece al imprimir comprobantes y reportes */
export function LogoImpresion({ className = '' }: { className?: string }) {
  return <img src="/brand/logo-color.svg" alt="Net&Sec Suministros" className={`hidden h-24 w-auto print:block ${className}`} />
}
