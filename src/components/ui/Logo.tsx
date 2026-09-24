// Logo vectorial de Net&Sec (originales en branding/, copias servidas desde public/brand)

/** Símbolo + "Net&Sec SUMINISTROS" en blanco, para el tema oscuro (menú lateral y barra móvil) */
export function LogoHorizontal({ className = '' }: { className?: string }) {
  return <img src="/brand/logo-horizontal-blanco.svg" alt="Net&Sec Suministros" className={`h-10 w-auto ${className}`} />
}

/** Logo completo con el eslogan, en blanco, para el tema oscuro (inicio de sesión) */
export function LogoCompleto({ className = '' }: { className?: string }) {
  return <img src="/brand/logo-blanco.svg" alt="Net&Sec Suministros" className={`w-auto ${className}`} />
}

/** Logo a color: solo aparece al imprimir comprobantes y reportes */
export function LogoImpresion({ className = '' }: { className?: string }) {
  return <img src="/brand/logo-color.svg" alt="Net&Sec Suministros" className={`hidden h-24 w-auto print:block ${className}`} />
}
