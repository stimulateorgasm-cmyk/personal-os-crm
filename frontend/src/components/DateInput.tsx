import { useState, useRef, useEffect } from "react"
import { CalendarDays, Clock, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover } from "@/components/ui/popover"

interface DateInputProps {
  value: string   // ISO "2026-05-29" или "2026-05-29 14:00" (с временем если showTime) или ""
  onChange: (iso: string) => void
  placeholder?: string
  className?: string
  showTime?: boolean  // если true — маска ДД.ММ.ГГГГ ЧЧ:ММ + выбор времени в поповере
}

const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"]
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"]
const TIME_PRESETS = [
  { label: "10:00", hour: 10, min: 0 },
  { label: "12:00", hour: 12, min: 0 },
  { label: "14:00", hour: 14, min: 0 },
  { label: "16:00", hour: 16, min: 0 },
  { label: "18:00", hour: 18, min: 0 },
]

// ─── Helpers ────────────────────────────────────────────────────────────

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
  return `${formatHuman(date)} в ${h}:${m}`
}

/** Извлечь дату (ISO YYYY-MM-DD) из value */
function datePart(iso: string): string {
  return iso.split(" ")[0] || ""
}

/** Извлечь время (HH:mm) из value */
function timePart(iso: string): string {
  return iso.split(" ")[1] || ""
}

/** Преобразует ДД.ММ.ГГГГ [ЧЧ:ММ] в ISO */
function parseManual(s: string, showTime: boolean): string {
  const clean = s.replace(/[^\d]/g, "")
  if (clean.length < 8) return ""
  const dd = clean.slice(0, 2)
  const mm = clean.slice(2, 4)
  const yyyy = clean.slice(4, 8)
  const d = new Date(`${yyyy}-${mm}-${dd}T12:00:00`)
  if (isNaN(d.getTime())) return ""

  if (showTime && clean.length >= 12) {
    const hh = clean.slice(8, 10)
    const mi = clean.slice(10, 12)
    if (parseInt(hh) < 24 && parseInt(mi) < 60) {
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
    }
  }
  return `${yyyy}-${mm}-${dd}`
}

/** ISO → ДД.ММ.ГГГГ [ЧЧ:ММ] */
function isoToDisplay(iso: string, showTime: boolean): string {
  if (!iso) return ""
  const parts = iso.split(" ")
  const dateParts = parts[0].split("-")
  if (dateParts.length !== 3) return ""
  let result = `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`
  if (showTime && parts[1]) result += " " + parts[1]
  return result
}

function getEndOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? 6 : 6 - day
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

/** Разделить дату и время из формата Date */
function dateToIso(d: Date, withTime: boolean): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  if (withTime) {
    const hh = String(d.getHours()).padStart(2, "0")
    const mi = String(d.getMinutes()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
  }
  return `${yyyy}-${mm}-${dd}`
}

// ─── Component ──────────────────────────────────────────────────────────

export function DateInput({
  value,
  onChange,
  placeholder,
  className,
  showTime = false,
}: DateInputProps) {
  const [showPopover, setShowPopover] = useState(false)
  const [text, setText] = useState(() => isoToDisplay(value, showTime))
  const inputRef = useRef<HTMLInputElement>(null)

  const effectivePlaceholder = placeholder || (showTime ? "ДД.ММ.ГГГГ чч:мм" : "ДД.ММ.ГГГГ")

  // Sync external value -> text
  useEffect(() => {
    setText(isoToDisplay(value, showTime))
  }, [value, showTime])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d]/g, "").slice(0, showTime ? 12 : 8)
    let formatted = ""
    for (let i = 0; i < raw.length; i++) {
      if (i === 2 || i === 4) formatted += "."
      if (showTime && i === 8) formatted += " "
      formatted += raw[i]
    }
    setText(formatted)
    // Auto-apply on full input (8 digits for date, 12 for date+time)
    if ((showTime && raw.length === 12) || (!showTime && raw.length === 8)) {
      const iso = parseManual(formatted, showTime)
      if (iso) onChange(iso)
    }
  }

  const handleBlur = () => {
    const minLen = showTime ? 8 : 8
    if (text.length >= minLen) {
      const iso = parseManual(text, showTime)
      if (iso && iso !== value) onChange(iso)
    } else if (!text) {
      onChange("")
    } else {
      setText(isoToDisplay(value, showTime))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      inputRef.current?.blur()
    }
  }

  // ─── Calendar / Time popover state ─────────────────────

  const defDate = value ? new Date((datePart(value) || "2026") + "T12:00:00") : new Date()
  const [calYear, setCalYear] = useState(defDate.getFullYear())
  const [calMonth, setCalMonth] = useState(defDate.getMonth())
  const [selectingTime, setSelectingTime] = useState(false)
  const [pendingDate, setPendingDate] = useState<Date | null>(null)
  const [showCustom, setShowCustom] = useState(false)

  // Reset calendar when popover opens
  useEffect(() => {
    if (showPopover) {
      const d = value ? new Date((datePart(value) || "2026") + "T12:00:00") : new Date()
      setCalYear(d.getFullYear())
      setCalMonth(d.getMonth())
      setSelectingTime(false)
      setPendingDate(null)
      setShowCustom(false)
    }
  }, [showPopover, value])

  const handleCalendarSelect = (day: number) => {
    const d = new Date(calYear, calMonth, day, 12, 0, 0, 0)
    if (showTime) {
      // Check if value already has time — keep it
      const t = timePart(value)
      if (t) {
        const [h, m] = t.split(":")
        d.setHours(parseInt(h || "12"), parseInt(m || "0"), 0, 0)
      }
      setPendingDate(d)
      setSelectingTime(true)
    } else {
      onChange(dateToIso(d, false))
      setText(isoToDisplay(dateToIso(d, false), false))
      setShowPopover(false)
    }
  }

  const handlePreset = (d: Date) => {
    if (showTime) {
      setPendingDate(d)
      setSelectingTime(true)
    } else {
      onChange(dateToIso(d, false))
      setText(isoToDisplay(dateToIso(d, false), false))
      setShowPopover(false)
    }
  }

  const handleTimeSelect = (hour: number, min: number) => {
    if (!pendingDate) return
    const d = new Date(pendingDate)
    d.setHours(hour, min, 0, 0)
    const iso = dateToIso(d, true)
    onChange(iso)
    setText(isoToDisplay(iso, true))
    setShowPopover(false)
  }

  const handleCustomTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!pendingDate) return
    const [h, m] = e.target.value.split(":")
    const d = new Date(pendingDate)
    d.setHours(parseInt(h || "12"), parseInt(m || "0"), 0, 0)
    const iso = dateToIso(d, true)
    onChange(iso)
    setText(isoToDisplay(iso, true))
    setShowPopover(false)
  }

  const handleClear = () => {
    onChange("")
    setText("")
    setShowPopover(false)
  }

  // ─── Calendar grid ──────────────────────────────────────

  const now = new Date()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay()
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1
  const todayStr = now.toDateString()

  const days: (number | null)[] = Array(startOffset).fill(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)

  // ─── Presets (only in showTime mode) ────────────────────

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const presets = [
    { label: "Сегодня", date: new Date(today) },
    { label: "Завтра", date: (() => { const d = new Date(today); d.setDate(d.getDate() + 1); return d })() },
    { label: "На неделе", date: getEndOfWeek(new Date(today)) },
  ]

  // ─── Trigger ────────────────────────────────────────────

  const trigger = (
    <div className={cn("relative inline-flex items-center", className)}>
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={effectivePlaceholder}
        className={cn(
          "h-8 px-2 pr-7 text-xs rounded-md bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-full",
          value ? "text-zinc-200" : "text-zinc-500"
        )}
        inputMode="numeric"
      />
      {value ? (
        <button onClick={handleClear}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 min-h-[24px] min-w-[24px] flex items-center justify-center">
          <X size={12} />
        </button>
      ) : (
        <button type="button" onClick={() => setShowPopover(!showPopover)}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 min-h-[24px] min-w-[24px] flex items-center justify-center">
          <CalendarDays size={12} />
        </button>
      )}
    </div>
  )

  // ─── Selected display in popover ────────────────────────

  const selectedHuman = value && showTime
    ? (() => {
        const dp = datePart(value)
        const tp = timePart(value)
        const d = new Date(dp + "T" + (tp || "12:00") + ":00")
        return tp ? formatHumanWithTime(d) : formatHuman(d)
      })()
    : value
      ? formatHuman(new Date(datePart(value) + "T12:00:00"))
      : ""

  // ─── Render ─────────────────────────────────────────────

  return (
    <Popover open={showPopover} onOpenChange={setShowPopover} trigger={trigger}>
      <div className="w-72 max-w-[90vw] p-3 rounded-xl bg-zinc-900 border border-zinc-700 shadow-xl space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">
            {selectingTime ? "Выбрать время" : "Выбрать дату"}
          </span>
          <button onClick={() => setShowPopover(false)} className="text-zinc-600 hover:text-zinc-400 min-h-[28px] min-w-[28px] flex items-center justify-center">
            <X size={14} />
          </button>
        </div>

        {/* Selected summary */}
        {value && selectedHuman && !selectingTime && (
          <div className="text-[11px] text-zinc-400">
            {showTime ? "Дедлайн: " : "Дата: "}
            <span className="text-zinc-200 font-medium">{selectedHuman}</span>
          </div>
        )}

        {/* ─── Time selection screen ───────────────── */}
        {selectingTime && pendingDate && (
          <div className="space-y-2 p-2 rounded-lg bg-zinc-950/50 border border-zinc-800">
            <p className="text-[10px] text-zinc-500">
              {formatHuman(pendingDate)} — выбери время
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TIME_PRESETS.map((t) => (
                <button
                  key={t.label}
                  onClick={() => handleTimeSelect(t.hour, t.min)}
                  className="text-[11px] px-2.5 py-1.5 rounded-md bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 font-medium min-h-[32px] touch-manipulation"
                >
                  {t.label}
                </button>
              ))}
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Clock size={11} className="text-zinc-600" />
                <input
                  type="time"
                  onChange={handleCustomTimeChange}
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

        {/* ─── Presets (only in showTime mode, before calendar) ─── */}
        {showTime && !selectingTime && (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => {
              const pStr = dateToIso(p.date, false)
              const vStr = datePart(value)
              return (
                <button
                  key={p.label}
                  onClick={() => handlePreset(new Date(p.date))}
                  className={cn(
                    "text-[11px] px-2.5 py-1.5 rounded-md font-medium transition-colors min-h-[32px] touch-manipulation",
                    vStr === pStr
                      ? "bg-zinc-700 text-zinc-200"
                      : "bg-zinc-800/60 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
                  )}
                >
                  {p.label}
                </button>
              )
            })}
            <button
              onClick={() => setShowCustom(!showCustom)}
              className={cn(
                "text-[11px] px-2.5 py-1.5 rounded-md font-medium transition-colors min-h-[32px] touch-manipulation flex items-center gap-1",
                showCustom ? "bg-zinc-700 text-zinc-200" : "bg-zinc-800/60 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
              )}
            >
              <CalendarDays size={12} />
              Календарь
            </button>
          </div>
        )}

        {/* ─── Calendar grid (non-showTime always; showTime on demand) ─── */}
        {(!showTime || showCustom) && !selectingTime && (
          <>
            <div className="flex items-center justify-between mb-1">
              <button onClick={() => { const d = new Date(calYear, calMonth - 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()) }}
                className="text-zinc-500 hover:text-zinc-300 min-h-[28px] min-w-[28px] flex items-center justify-center text-xs">◀</button>
              <span className="text-xs font-medium text-zinc-300">{MONTHS[calMonth]} {calYear}</span>
              <button onClick={() => { const d = new Date(calYear, calMonth + 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()) }}
                className="text-zinc-500 hover:text-zinc-300 min-h-[28px] min-w-[28px] flex items-center justify-center text-xs">▶</button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {["пн","вт","ср","чт","пт","сб","вс"].map(wd => (
                <div key={wd} className="text-center text-[10px] text-zinc-600 py-1">{wd}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {days.map((d, i) =>
                d === null ? <div key={`e-${i}`} /> : (
                  <button key={d} onClick={() => handleCalendarSelect(d)}
                    className={cn(
                      "text-center text-xs py-1 rounded transition-colors min-h-[28px] touch-manipulation",
                      new Date(calYear, calMonth, d).toDateString() === todayStr ? "bg-yellow-900/30 text-yellow-400 font-bold" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                      value && datePart(value) === `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}` ? "bg-zinc-700 text-white" : ""
                    )}>
                    {d}
                  </button>
                )
              )}
            </div>
            <div className="flex gap-1 pt-1">
              <button onClick={() => {
                const d = new Date()
                const iso = dateToIso(d, showTime)
                if (showTime) {
                  setPendingDate(d)
                  setSelectingTime(true)
                } else {
                  onChange(iso)
                  setText(isoToDisplay(iso, false))
                  setShowPopover(false)
                }
              }} className="text-[10px] px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200">Сегодня</button>
              <button onClick={() => { setShowPopover(false) }}
                className="text-[10px] px-2 py-1 rounded text-zinc-600 hover:text-zinc-400 ml-auto">Закрыть</button>
            </div>
          </>
        )}
      </div>
    </Popover>
  )
}

export { formatHuman, formatHumanWithTime }
