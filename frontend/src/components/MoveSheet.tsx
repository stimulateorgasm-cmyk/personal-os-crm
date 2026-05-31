import { useState, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { X, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { authFetch, API } from "@/hooks/use-api"

const STAGES = [
  "Контакт",
  "Выдать контент",
  "Квалифицировать",
  "Довести до решения",
  "Проработать",
  "Работа завершена (Архив)",
]

function saveOrder(stage: string, ids: string[]) {
  localStorage.setItem(`funnel-order-${stage}`, JSON.stringify(ids))
}

function loadOrder(stage: string): string[] {
  try {
    const raw = localStorage.getItem(`funnel-order-${stage}`)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

interface MoveSheetProps {
  clientId: number
  onClose: () => void
}

export function MoveSheet({ clientId, onClose }: MoveSheetProps) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  // Animacja wjazdu
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 200)
  }

  const moveMutation = useMutation({
    mutationFn: (status: string) =>
      authFetch(`${API}/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    onSuccess: (_, status) => {
      // Ставим карточку первой в колонке
      const key = `client-${clientId}`
      const existing = loadOrder(status).filter((id) => id !== key)
      saveOrder(status, [key, ...existing])
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      queryClient.invalidateQueries({ queryKey: ["stats"] })
    },
  })

  const handleSelect = (status: string) => {
    setSelected(status)
    moveMutation.mutate(status, {
      onSettled: () => {
        setVisible(false)
        setTimeout(onClose, 200)
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden" onClick={handleClose}>
      {/* Overlay */}
      <div className={`absolute inset-0 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
        style={{ backgroundColor: "rgba(0,0,0,0.4)" }} />

      {/* Sheet */}
      <div
        className={`relative bg-zinc-900 rounded-t-2xl border-t border-zinc-700 shadow-2xl pb-8 transition-transform duration-200 ${visible ? "translate-y-0" : "translate-y-full"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex items-center justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3">
          <h2 className="text-base font-semibold text-white">Переместить в...</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
          >
            <X size={20} />
          </button>
        </div>

        {/* Stage list */}
        <div className="px-4 space-y-1 max-h-[50vh] overflow-y-auto">
          {STAGES.map((stage) => {
            const loading = selected === stage && moveMutation.isPending
            return (
              <button
                key={stage}
                onClick={() => handleSelect(stage)}
                disabled={moveMutation.isPending}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all min-h-[52px] touch-manipulation",
                  "hover:bg-zinc-800/80",
                  selected === stage ? "bg-zinc-800 text-white" : "text-zinc-300",
                )}
              >
                <span>{stage}</span>
                {loading && <span className="text-xs text-zinc-500">...</span>}
                {selected === stage && !loading && (
                  <Check size={18} className="text-emerald-400" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
