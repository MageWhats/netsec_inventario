// Variantes del logo generadas con branding/procesar_logo.py (servidas desde public/brand)

/** Símbolo + "Net&Sec SUMINISTROS" en blanco, para el tema oscuro (menú lateral) */
export function LogoHorizontal({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <img src="/brand/simbolo.png" alt="" className="size-9 shrink-0" />
      <img src="/brand/wordmark-blanco.png" alt="Net&Sec Suministros" className="h-8 w-auto" />
    </span>
  )
}

/** Logo completo con el eslogan, en blanco, para el tema oscuro (inicio de sesión) */
export function LogoCompleto({ className = '' }: { className?: string }) {
  return <img src="/brand/logo-blanco.png" alt="Net&Sec Suministros" className={`w-auto ${className}`} />
}

/** Logo a color sobre blanco: solo aparece al imprimir comprobantes y reportes */
export function LogoImpresion({ className = '' }: { className?: string }) {
  return <img src="/brand/logo-color.png" alt="Net&Sec Suministros" className={`hidden h-20 w-auto print:block ${className}`} />
}
