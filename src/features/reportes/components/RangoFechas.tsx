import { PRESETS, type Rango } from '../rangos'

export function RangoFechas({ valor, onChange }: { valor: Rango; onChange: (rango: Rango) => void }) {
  const presetActual = PRESETS.find((p) => {
    const r = p.rango()
    return r.desde === valor.desde && r.hasta === valor.hasta
  })

  return (
    <>
      <label className="text-xs text-slate-400">
        Período
        <select
          value={presetActual?.label ?? ''}
          onChange={(e) => {
            const preset = PRESETS.find((p) => p.label === e.target.value)
            if (preset) onChange(preset.rango())
          }}
          className="input mt-1 w-40"
        >
          {!presetActual && <option value="">Personalizado</option>}
          {PRESETS.map((p) => (
            <option key={p.label}>{p.label}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-400">
        Desde
        <input
          type="date"
          value={valor.desde}
          max={valor.hasta}
          required
          onChange={(e) => e.target.value && onChange({ ...valor, desde: e.target.value })}
          className="input mt-1 w-40"
        />
      </label>
      <label className="text-xs text-slate-400">
        Hasta
        <input
          type="date"
          value={valor.hasta}
          min={valor.desde}
          required
          onChange={(e) => e.target.value && onChange({ ...valor, hasta: e.target.value })}
          className="input mt-1 w-40"
        />
      </label>
    </>
  )
}
