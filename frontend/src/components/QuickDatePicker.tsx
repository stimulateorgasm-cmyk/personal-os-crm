import { useState, useMemo, useCallback } from "react"
import { cn } from "@/lib/utils"
import { CalendarDays, Clock, X } from "lucide-react"
import { Popover } from "@/components/ui/popover"

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"]

function formatHuman(date: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000)

  if (diffDays === 0) return "сегодня"
  if (diffDays === 1) return "завтра"
  if (diffDays === 2) return "послезавтра"
  if (diffDays < 7) return WEEKDAYS[target.getDay()] + " " + target.getDate()
  if (diffDays < 14) return "след. " + WEEKDAYS[target.getDay()]
  return `${target.getDate()} ${target.toLocaleString("ru", { month: "short" })}`
}

function formatHumanWithTime(date: Date): string {
  const h = date.getHours()
  const m = String(date.getMinutes()).padStart(2, "0")
  const time = `${h}:${m}`
  return `${formatHuman(date)} в ${time}`
}

function getEndOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? 6 : 6 - day // воскресенье = последний день
  const eow = new Date(d)
  eow.setDate(d.getDate() + diff)
  eow.setHours(18, 0, 0, 0)
  return eow
}

function getNextWeekStart(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? 1 : 8 - day
  const nw = new Date(d)
  nw.setDate(d.getDate() + diff)
  nw.setHours(10, 0, 0, 0)
  return nw
}

interface QuickDatePickerProps {
  value: string   // ISO "2026-05-22 14:00" или пустая строка
  onChange: (iso: string) => void
  children?: React.ReactNode // кастомный триггер (по умолчанию кнопка)
}

const TIME_PRESETS = [
  { label: "10:00", value: 10 },
  { label: "12:00", value: 12 },
  { label: "14:00", value: 14 },
  { label: "16:00", value: 16 },
  { label: "18:00", value: 18 },
]

export function QuickDatePicker({ value, onChange, children }: QuickDatePickerProps) {
  const [showPopover, setShowPopover] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [selectingTime, setSelectingTime] = useState(false)
  const [pendingDate, setPendingDate] = useState<Date | null>(null)

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Пресеты
  const presets = useMemo(() => {
    const t = new Date(today)
    const tomorrow = new Date(t)
    tomorrow.setDate(t.getDate() + 1)
    const thu = new Date(t)
    // Ищем следующий четверг
    const day = t.getDay()
    const daysToThu = (4 - day + 7) % 7 || 7
    thu.setDate(t.getDate() + daysToThu)
    const eow = getEndOfWeek(t)
    const nw = getNextWeekStart(t)

    return [
      { label: "Сегодня", date: new Date(t) },
      { label: "Завтра", date: tomorrow },
      { label: formatHuman(thu), date: thu },
      { label: "На неделе", date: eow },
    ]
  }, [today])

  // Выбранная дата для отображения
  const selectedHuman = value
    ? (() => {
        const parts = value.split(" ")
        const d = parts[0]
        const t = parts[1]
        const date = new Date(d + "T" + (t || "00:00") + ":00")
        return t ? formatHumanWithTime(date) : formatHuman(date)
      })()
    : ""

  const handlePreset = (date: Date) => {
    setPendingDate(date)
    setSelectingTime(true)
    setShowCustom(false)
  }

  const handleTimeSelect = (hour: number) => {
    if (!pendingDate) return
    const d = new Date(pendingDate)
    d.setHours(hour, 0, 0, 0)
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(hour).padStart(2, "0")}:00`)
    setSelectingTime(false)
    setPendingDate(null)
  }

  const handleCustomDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (!val) return
    const d = new Date(val + "T12:00:00")
    setPendingDate(d)
    setSelectingTime(true)
  }

  const handleCustomTime = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!pendingDate) return
    const [h, m] = e.target.value.split(":")
    const d = new Date(pendingDate)
    d.setHours(parseInt(h || "12"), parseInt(m || "0"), 0, 0)
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`)
    setSelectingTime(false)
    setPendingDate(null)
  }

  const handleClear = () => {
    onChange("")
    setSelectingTime(false)
    setPendingDate(null)
    setShowCustom(false)
  }

  const closePopover = useCallback(() => {
    setShowPopover(false)
    // Reset internal state after a delay so the animation/transition doesn't glitch
    setTimeout(() => {
      setSelectingTime(false)
      setPendingDate(null)
      setShowCustom(false)
    }, 100)
  }, [])

  const handleChangeAndClose = (iso: string) => {
    onChange(iso)
    closePopover()
  }

  const trigger = children ? (
    <span>{children}</span>
  ) : (
    <button className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors min-h-[32px] touch-manipulation">
      <CalendarDays size={14} />
      {value ? selectedHuman : "Срок"}
    </button>
  )

  return (
    <Popover open={showPopover} onOpenChange={setShowPopover} trigger={trigger}>
      <div className="w-72 max-w-[90vw] p-3 rounded-xl bg-zinc-900 border border-zinc-700 shadow-xl space-y-2 max-h-[80vh] overflow-y-auto">
        {/* Header with close */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Выбрать дату</span>
          <button onClick={closePopover} className="text-zinc-600 hover:text-zinc-400 min-h-[28px] min-w-[28px] flex items-center justify-center">
            <X size={14} />
          </button>
        </div>

        {/* Human-readable summary */}
        {value && (
          <div className="text-[11px] text-zinc-400">
            Дедлайн: <span className="text-zinc-200 font-medium">{selectedHuman}</span>
            <button onClick={() => handleChangeAndClose("")} className="ml-2 text-zinc-600 hover:text-zinc-400">✕</button>
          </div>
        )}

        {/* Date presets */}
        {!selectingTime && (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => handlePreset(p.date)}
                className={cn(
                  "text-[11px] px-2.5 py-1.5 rounded-md font-medium transition-colors min-h-[32px] touch-manipulation",
                  value && new Date(value).toDateString() === p.date.toDateString()
                    ? "bg-zinc-700 text-zinc-200"
                    : "bg-zinc-800/60 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
                )}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setShowCustom(!showCustom)}
              className={cn(
                "text-[11px] px-2.5 py-1.5 rounded-md font-medium transition-colors min-h-[32px] touch-manipulation flex items-center gap-1",
                showCustom ? "bg-zinc-700 text-zinc-200" : "bg-zinc-800/60 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
              )}
            >
              <CalendarDays size={12} />
              Выбрать
            </button>
          </div>
        )}

        {/* Time selection */}
        {selectingTime && pendingDate && (
          <div className="space-y-2 p-2 rounded-lg bg-zinc-950/50 border border-zinc-800">
            <p className="text-[10px] text-zinc-500">
              {formatHuman(pendingDate)} — выбери время
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TIME_PRESETS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => handleChangeAndClose(`${pendingDate.getFullYear()}-${String(pendingDate.getMonth() + 1).padStart(2, "0")}-${String(pendingDate.getDate()).padStart(2, "0")} ${String(t.value).padStart(2, "0")}:00`)}
                  className="text-[11px] px-2.5 py-1.5 rounded-md bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 font-medium min-h-[32px] touch-manipulation"
                >
                  {t.label}
                </button>
              ))}
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Clock size={11} className="text-zinc-600" />
                <input
                  type="time"
                  onChange={handleCustomTime}
                  className="h-8 w-[80px] text-[11px] bg-zinc-950 border border-zinc-800 rounded px-1.5 text-zinc-300 focus:outline-none focus:border-zinc-600"
                />
              </div>
            </div>
            <button
              onClick={() => { setSelectingTime(false); setPendingDate(null) }}
              className="text-[10px] text-zinc-600 hover:text-zinc-400"
            >
              Назад
            </button>
          </div>
        )}

        {/* Calendar */}
        {showCustom && !selectingTime && (
          <CalendarGrid
            onSelect={(d) => { handlePreset(d) }}
            onClose={() => setShowCustom(false)}
          />
        )}
      </div>
    </Popover>
  )
}

// ─── Calendar grid ─────────────────────────────────────────────────────────────
const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]

function CalendarGrid({ onSelect, onClose }: { onSelect: (d: Date) => void; onClose: () => void }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay() // 0=вс
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1 // понедельник = 0

  const todayStr = now.toDateString()

  const handleDay = (day: number) => {
    const d = new Date(year, month, day)
    onSelect(d)
  }

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const days = []
  for (let i = 0; i < startOffset; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)

  return (
    <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800">
      {/* Month/year header */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prevMonth}
          className="text-zinc-500 hover:text-zinc-300 min-h-[32px] min-w-[32px] flex items-center justify-center touch-manipulation text-sm"
        >
          ◀
        </button>
        <span className="text-xs font-medium text-zinc-300">
          {MONTHS[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          className="text-zinc-500 hover:text-zinc-300 min-h-[32px] min-w-[32px] flex items-center justify-center touch-manipulation text-sm"
        >
          ▶
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((wd) => (
          <div key={wd} className="text-center text-[10px] text-zinc-600 py-1">{wd}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d, i) =>
          d === null ? (
            <div key={`e-${i}`} />
          ) : (
            <button
              key={d}
              onClick={() => handleDay(d)}
              className={cn(
                "text-center text-xs py-1.5 rounded-md transition-colors min-h-[32px] touch-manipulation",
                new Date(year, month, d).toDateString() === todayStr
                  ? "bg-yellow-900/30 text-yellow-400 font-bold"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              )}
            >
              {d}
            </button>
          )
        )}
      </div>

      <button
        onClick={onClose}
        className="w-full text-center text-[10px] text-zinc-600 hover:text-zinc-400 mt-2 py-1 transition-colors"
      >
        Закрыть
      </button>
    </div>
  )
}

export { formatHuman, formatHumanWithTime }
