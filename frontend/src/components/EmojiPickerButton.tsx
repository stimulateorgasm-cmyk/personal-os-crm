import { useState, useRef, useEffect } from "react"
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react"
import { Smile } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: string) => void
  className?: string
}

export function EmojiPickerButton({ onEmojiSelect, className }: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn("text-zinc-500 hover:text-zinc-300 transition-colors", className)}
        title="Вставить эмодзи"
      >
        <Smile size={16} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-50">
          <EmojiPicker
            onEmojiClick={(emojiData: EmojiClickData) => {
              onEmojiSelect(emojiData.emoji)
              setOpen(false)
            }}
            theme="dark"
            width={280}
            height={350}
          />
        </div>
      )}
    </div>
  )
}
