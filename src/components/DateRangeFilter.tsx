export type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

type DateRangeFilterProps = {
  preset: DatePreset
  startDate: string
  endDate: string
  onPresetChange: (preset: DatePreset) => void
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void
}

const presets: { value: DatePreset; label: string }[] = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'yesterday', label: 'Hier' },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'custom', label: 'Personnaliser' },
]

export function DateRangeFilter({
  preset,
  startDate,
  endDate,
  onPresetChange,
  onStartDateChange,
  onEndDateChange,
}: DateRangeFilterProps) {
  return (
    <div className="neon-surface rounded p-3">
      <div className="flex flex-wrap gap-2">
        {presets.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onPresetChange(option.value)}
            className={`h-9 rounded px-3 text-xs font-bold transition ${preset === option.value ? 'bg-slate-950 text-white dark:bg-cyan-400 dark:text-slate-950' : 'border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white'}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {preset === 'custom' ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Du</span>
            <input
              value={startDate}
              onChange={(event) => onStartDateChange(event.target.value)}
              type="date"
              className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Au</span>
            <input
              value={endDate}
              onChange={(event) => onEndDateChange(event.target.value)}
              type="date"
              className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400"
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}

export function matchesDatePreset(value: string | Date, preset: DatePreset, customStart = '', customEnd = '') {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false

  const { start, end } = getDateRange(preset, customStart, customEnd)
  return date >= start && date <= end
}

export function todayInputValue() {
  return toInputDate(new Date())
}

function getDateRange(preset: DatePreset, customStart: string, customEnd: string) {
  const now = new Date()
  const start = startOfDay(now)
  const end = endOfDay(now)

  if (preset === 'yesterday') {
    start.setDate(start.getDate() - 1)
    end.setDate(end.getDate() - 1)
  }

  if (preset === 'week') {
    const day = start.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    start.setDate(start.getDate() + mondayOffset)
  }

  if (preset === 'month') {
    start.setDate(1)
  }

  if (preset === 'custom') {
    const fallback = todayInputValue()
    return {
      start: startOfDay(parseInputDate(customStart || fallback)),
      end: endOfDay(parseInputDate(customEnd || customStart || fallback)),
    }
  }

  return { start, end }
}

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function endOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

function parseInputDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day)
}

function toInputDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
