import { Users, KanbanSquare, FileBadge, BarChart3, CheckSquare, Settings, Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"

export type Page = "clients" | "funnel" | "deals" | "stats" | "tasks"

const NAV_ITEMS: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "clients", label: "Контакты", icon: <Users size={18} /> },
  { id: "funnel", label: "Воронка", icon: <KanbanSquare size={18} /> },
  { id: "deals", label: "Сделки", icon: <FileBadge size={18} /> },
  { id: "tasks", label: "Задачи", icon: <CheckSquare size={18} /> },
  { id: "stats", label: "Статистика", icon: <BarChart3 size={18} /> },
]

interface SidebarProps {
  active: Page
  onNavigate: (page: Page) => void
  isMobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ active, onNavigate, isMobileOpen, onMobileClose }: SidebarProps) {
  const content = (
    <aside className={cn(
      "flex h-full w-56 flex-col bg-black border-r border-zinc-800/50",
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-14 border-b border-zinc-800/50">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10">
          <span className="text-xs font-bold text-white">OS</span>
        </div>
        <span className="text-sm font-semibold text-white/90">Personal OS</span>
        {onMobileClose && (
          <button onClick={onMobileClose} className="ml-auto text-zinc-500 hover:text-white md:hidden">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => { onNavigate(item.id); onMobileClose?.() }}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md transition-colors",
              active === item.id
                ? "bg-zinc-800 text-white font-medium"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/50",
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-zinc-800/50">
        <button className="flex items-center gap-3 w-full px-3 py-2 text-sm text-zinc-400 rounded-md hover:text-white hover:bg-zinc-800/50 transition-colors">
          <Settings size={18} />
          Настройки
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden md:block fixed left-0 top-0 z-40 h-full">{content}</div>

      {/* Mobile: Sheet overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={onMobileClose} />
          <div className="absolute left-0 top-0 h-full w-56 animate-in slide-in-from-left">{content}</div>
        </div>
      )}
    </>
  )
}
