import { STAGES, stageLabel } from '../money.js'

export function StageBadge({ stage }) {
  return <span className={`stage stage-${stage}`}>{stageLabel(stage)}</span>
}

export const OverdueBadge = () => <span className="stage stage-overdue">Overdue</span>

// Compact select for changing a deal's stage from a table row
export function StageSelect({ value, onChange, disabled, label }) {
  return (
    <select
      className={`stage-select stage-${value}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={label}
    >
      {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
    </select>
  )
}
