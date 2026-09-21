import type { UserPrefs } from './types'

const PRESETS: Record<string, UserPrefs> = {
  bee: { pollinators: 70, ornamental: 15, food: 15, effort: 'moderate' },
  beautiful: { pollinators: 15, ornamental: 70, food: 15, effort: 'moderate' },
  kitchen: { pollinators: 10, ornamental: 10, food: 80, effort: 'moderate' },
  balanced: { pollinators: 33, ornamental: 33, food: 34, effort: 'moderate' },
}

interface Props {
  prefs: UserPrefs
  onChange: (p: UserPrefs) => void
}

export function UserGoals({ prefs, onChange }: Props) {
  const setPreset = (key: string) => onChange({ ...PRESETS[key] })

  const setSlider = (key: keyof Pick<UserPrefs, 'pollinators' | 'ornamental' | 'food'>, v: number) => {
    const next = { ...prefs, [key]: v }
    const sum = next.pollinators + next.ornamental + next.food
    if (sum !== 100) {
      const scale = 100 / sum
      next.pollinators = Math.round(next.pollinators * scale)
      next.ornamental = Math.round(next.ornamental * scale)
      next.food = 100 - next.pollinators - next.ornamental
    }
    onChange(next)
  }

  return (
    <div className="card">
      <h2>Your goals <span className="estimate-tag">Estimate scoring</span></h2>
      <div className="toolbar">
        {Object.keys(PRESETS).map((k) => (
          <button key={k} type="button" className="secondary" onClick={() => setPreset(k)}>
            {k}
          </button>
        ))}
      </div>
      <label className="status-row">
        Pollinators {prefs.pollinators}%
        <input
          type="range"
          min={0}
          max={100}
          value={prefs.pollinators}
          onChange={(e) => setSlider('pollinators', +e.target.value)}
        />
      </label>
      <label className="status-row">
        Ornamental {prefs.ornamental}%
        <input
          type="range"
          min={0}
          max={100}
          value={prefs.ornamental}
          onChange={(e) => setSlider('ornamental', +e.target.value)}
        />
      </label>
      <label className="status-row">
        Food {prefs.food}%
        <input
          type="range"
          min={0}
          max={100}
          value={prefs.food}
          onChange={(e) => setSlider('food', +e.target.value)}
        />
      </label>
      <label className="toggle-row">
        Effort
        <select
          value={prefs.effort}
          onChange={(e) => onChange({ ...prefs, effort: e.target.value as UserPrefs['effort'] })}
        >
          <option value="minimal">Minimal (&lt;1 h/week est.)</option>
          <option value="moderate">Moderate (1–3 h/week est.)</option>
          <option value="hobby">Hobby (3+ h/week est.)</option>
        </select>
      </label>
    </div>
  )
}
