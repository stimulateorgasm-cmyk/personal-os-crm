import { useState, useRef, useEffect, useCallback } from "react"

interface InlineEditProps {
  value: string
  onSave: (value: string) => void
  placeholder?: string
  type?: "text" | "number"
  className?: string
  linkify?: boolean
}

export function InlineEdit({ value, onSave, placeholder = "—", type = "text", className = "", linkify }: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setEditValue(value)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing, value])

  const handleSave = useCallback(async () => {
    const trimmed = editValue.trim()
    if (trimmed === value) { setEditing(false); return }
    setStatus("saving")
    try {
      await Promise.resolve(onSave(trimmed))
      setStatus("saved")
      setTimeout(() => setStatus("idle"), 2000)
    } catch {
      setStatus("error")
      setTimeout(() => setStatus("idle"), 3000)
    }
    setEditing(false)
  }, [editValue, value, onSave])

  const statusIndicator = status === "saving" ? <span className="ml-0.5 text-[10px] text-yellow-500">⏳</span>
    : status === "saved" ? <span className="ml-0.5 text-[10px] text-emerald-500">✓</span>
    : status === "error" ? <span className="ml-0.5 text-[10px] text-red-500">✗</span>
    : null

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false) }}
        className={`bg-zinc-950 border border-emerald-600/50 rounded px-1.5 py-0.5 text-xs text-zinc-200 outline-none min-w-[60px] w-full touch-manipulation ${className}`}
        onClick={(e) => e.stopPropagation()}
      />
    )
  }

  return (
    <span className="inline-flex items-center">
      <span
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className={`cursor-pointer hover:bg-zinc-800/30 rounded px-1 -mx-1 py-0.5 transition-colors inline-block touch-manipulation ${className}`}
      >
        {linkify && value ? (
          <a href={`https://t.me/${value.replace(/^@+/, "")}`} target="_blank" rel="noopener noreferrer"
             onClick={(e) => e.stopPropagation()}
             className="text-blue-400 hover:text-blue-300">
            @{value.replace(/^@+/, "")}
          </a>
        ) : value || <span className="text-zinc-600">{placeholder}</span>}
      </span>
      {statusIndicator}
    </span>
  )
}
