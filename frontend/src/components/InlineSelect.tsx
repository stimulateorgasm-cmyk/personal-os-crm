import { useState, useRef, useEffect } from "react"

interface Option {
  value: string
  label: string
  color?: string
}

interface InlineSelectProps {
  value: string
  options: Option[]
  onSelect: (value: string) => void
  placeholder?: string
  className?: string
}

export function InlineSelect({ value, options, onSelect, placeholder = "—", className = "" }: InlineSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    setTimeout(() => document.addEventListener("click", handler), 0)
    return () => document.removeEventListener("click", handler)
  }, [open])

  const current = options.find((o) => o.value === value)

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium hover:bg-zinc-800/50 transition-colors min-h-[28px] touch-manipulation ${className}`}
        style={current?.color ? { backgroundColor: current.color + "22", color: current.color } : {}}
      >
        {current?.label || placeholder}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-0.5 z-50 min-w-[140px] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={(e) => { e.stopPropagation(); onSelect(opt.value); setOpen(false) }}
              className={`w-full text-left px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors flex items-center gap-2 ${value === opt.value ? "bg-zinc-700/50" : ""}`}
              style={opt.color ? { color: opt.color } : {}}
            >
              {opt.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
