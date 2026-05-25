import React, { useState, useRef, useEffect } from "react"

interface PopoverProps {
  trigger: React.ReactNode
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  align?: "start" | "center" | "end"
}

export function Popover({ trigger, children, open: controlledOpen, onOpenChange, propAlign }: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<"bottom" | "top">("bottom")
  const [hAlign, setHAlign] = useState<"start" | "end">("start")

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = onOpenChange || setInternalOpen

  useEffect(() => {
    if (!isOpen) return
    const el = ref.current
    if (el) {
      const rect = el.getBoundingClientRect()
      const popoverW = 288
      const popoverH = 360
      const spaceBottom = window.innerHeight - rect.bottom
      const spaceRight = window.innerWidth - rect.left

      setPosition(spaceBottom < popoverH && rect.top > popoverH ? "top" : "bottom")
      setHAlign(spaceRight < popoverW ? "end" : "start")
    }
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    setTimeout(() => document.addEventListener("click", handleClick), 0)
    return () => document.removeEventListener("click", handleClick)
  }, [isOpen, setOpen])

  return (
    <div className="relative inline-block" ref={ref}>
      <div onClick={() => setOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div
          className={`absolute z-50 ${position === "top" ? "bottom-full mb-1" : "top-full mt-1"} ${hAlign === "end" ? "right-0" : "left-0"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  )
}
