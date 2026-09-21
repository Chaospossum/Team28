import type { Lang } from './i18n'
import { t } from './i18n'
import type { UserPrefs } from './types'

const PRESET_KEYS = ['bee', 'beautiful', 'kitchen', 'balanced'] as const

const PRESETS: Record<(typeof PRESET_KEYS)[number], UserPrefs> = {
  bee: { pollinators: 70, ornamental: 15, food: 15, effort: 'moderate' },
  beautiful: { pollinators: 15, ornamental: 70, food: 15, effort: 'moderate' },
  kitchen: { pollinators: 10, ornamental: 10, food: 80, effort: 'moderate' },
  balanced: { pollinators: 33, ornamental: 33, food: 34, effort: 'moderate' },
}

const PRESET_LABEL: Record<(typeof PRESET_KEYS)[number], string> = {
  bee: 'presetBee',
  beautiful: 'presetBeautiful',
  kitchen: 'presetKitchen',
  balanced: 'presetBalanced',
}

interface Props {
  prefs: UserPrefs
  onChange: (p: UserPrefs) => void
  lang: Lang
}

const GOAL_KEYS = ['pollinators', 'ornamental', 'food'] as const

export function UserGoals({ prefs, onChange, lang }: Props) {
  const setPreset = (key: (typeof PRESET_KEYS)[number]) => onChange({ ...PRESETS[key] })

  const setSlider = (key: (typeof GOAL_KEYS)[number], v: number) => {
    const clamped = Math.min(100, Math.max(0, v))
    const next = { ...prefs, [key]: clamped }
    const others = GOAL_KEYS.filter((k) => k !== key)
    const budget = 100 - clamped
    const otherSum = others.reduce((s, k) => s + next[k], 0)
    if (otherSum <= 0) {
      const half = Math.floor(budget / 2)
      next[others[0]] = half
      next[others[1]] = budget - half
    } else {
      let a = Math.round((next[others[0]] / otherSum) * budget)
      let b = budget - a
      if (a < 0) a = 0
      if (b < 0) b = 0
      next[others[0]] = a
      next[others[1]] = b
    }
    onChange(next)
  }

  return (
    <div className="card user-goals">
      <h2>
        {t(lang, 'goalsTitle')} <span className="estimate-tag">{t(lang, 'goalEstimate')}</span>
      </h2>
      <div className="toolbar goals-toolbar" role="toolbar" aria-label={t(lang, 'goalsTitle')}>
        {PRESET_KEYS.map((k) => (
          <button key={k} type="button" className="secondary" onClick={() => setPreset(k)}>
            {t(lang, PRESET_LABEL[k])}
          </button>
        ))}
      </div>
      <label className="status-row">
        {t(lang, 'pollinators')} {prefs.pollinators}%
        <input
          type="range"
          min={0}
          max={100}
          value={prefs.pollinators}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={prefs.pollinators}
          onChange={(e) => setSlider('pollinators', +e.target.value)}
        />
      </label>
      <label className="status-row">
        {t(lang, 'ornamental')} {prefs.ornamental}%
        <input
          type="range"
          min={0}
          max={100}
          value={prefs.ornamental}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={prefs.ornamental}
          onChange={(e) => setSlider('ornamental', +e.target.value)}
        />
      </label>
      <label className="status-row">
        {t(lang, 'food')} {prefs.food}%
        <input
          type="range"
          min={0}
          max={100}
          value={prefs.food}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={prefs.food}
          onChange={(e) => setSlider('food', +e.target.value)}
        />
      </label>
      <label className="toggle-row">
        {t(lang, 'effort')}
        <select
          value={prefs.effort}
          onChange={(e) => onChange({ ...prefs, effort: e.target.value as UserPrefs['effort'] })}
        >
          <option value="minimal">{t(lang, 'effortMinimal')}</option>
          <option value="moderate">{t(lang, 'effortModerate')}</option>
          <option value="hobby">{t(lang, 'effortHobby')}</option>
        </select>
      </label>
    </div>
  )
}
