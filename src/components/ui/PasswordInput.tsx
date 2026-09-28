import { Eye, EyeOff } from 'lucide-react'
import { useState, type ComponentProps } from 'react'

/** Campo de contraseña con un botón (ojito) para mostrar u ocultar lo escrito */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false)
  const Icono = visible ? EyeOff : Eye

  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={`${className ?? ''} pr-10`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-slate-500 transition hover:text-slate-300"
      >
        <Icono className="size-4" />
      </button>
    </div>
  )
}
