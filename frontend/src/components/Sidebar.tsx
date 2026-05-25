import { useState, useCallback } from "react"
import { Users, KanbanSquare, FileBadge, BarChart3, CheckSquare, LayoutDashboard, ClipboardList, ListTodo, Search, X, Bot } from "lucide-react"

export type Page = "dashboard" | "clients" | "funnel" | "deals" | "stats" | "tasks" | "antons-tasks" | "assistant-tasks" | "quiz" | "search"

const NAV_ITEMS: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Сводка", icon: <LayoutDashboard size={18} /> },
  { id: "clients", label: "Контакты", icon: <Users size={18} /> },
  { id: "funnel", label: "Воронка", icon: <KanbanSquare size={18} /> },
  { id: "deals", label: "Сделки", icon: <FileBadge size={18} /> },
  { id: "tasks", label: "Задачи", icon: <CheckSquare size={18} /> },
  { id: "antons-tasks", label: "Задачи Антона", icon: <ListTodo size={18} /> },
  { id: "assistant-tasks", label: "Задачи ассистента", icon: <Bot size={18} /> },
  { id: "stats", label: "Статистика", icon: <BarChart3 size={18} /> },
  { id: "quiz", label: "Тесты", icon: <ClipboardList size={18} /> },
]

interface SidebarProps {
  active: Page
  onNavigate: (page: Page) => void
  isMobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ active, onNavigate, isMobileOpen, onMobileClose }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && searchQuery.trim().length >= 2) {
        // Store query in sessionStorage so SearchResults page can read it
        sessionStorage.setItem("funnel_search_query", searchQuery.trim())
        onNavigate("search")
        onMobileClose?.()
      }
    },
    [searchQuery, onNavigate, onMobileClose],
  )
  const content = (
    <aside className="flex h-full w-56 flex-col bg-black border-r border-zinc-800/50">
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

      <div className="px-3 pt-3 pb-1">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Поиск..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full pl-8 pr-2 py-1.5 text-xs rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-0"
          />
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => { onNavigate(item.id); onMobileClose?.() }}
            className={`flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md transition-colors ${
              active === item.id
                ? "bg-zinc-800 text-white font-medium"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  )

  return (
    <>
      <div className="hidden md:block fixed left-0 top-0 z-40 h-full">{content}</div>
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={onMobileClose} />
          <div className="absolute left-0 top-0 h-full w-56 animate-in slide-in-from-left">{content}</div>
        </div>
      )}
    </>
  )
}
