import { useState } from "react"
import { Sidebar, type Page } from "./Sidebar"
import { Menu } from "lucide-react"

interface LayoutProps {
  active: Page
  onNavigate: (page: Page) => void
  children: React.ReactNode
}

export function Layout({ active, onNavigate, children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center h-12 px-4 border-b border-zinc-800/50 bg-zinc-950 md:hidden">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="text-zinc-400 hover:text-white"
        >
          <Menu size={20} />
        </button>
        <span className="ml-3 text-sm font-semibold text-white/90">Personal OS</span>
      </div>

      <Sidebar
        active={active}
        onNavigate={onNavigate}
        isMobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <main className="flex-1 md:ml-56 mt-12 md:mt-0 overflow-auto">
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
