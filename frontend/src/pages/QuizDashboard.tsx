import React, { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import FemaleTestDashboard from "./FemaleTestDashboard"
import QuizMensDashboard from "./QuizMensDashboard"
import { ClientSheet } from "@/components/ClientSheet"

function scrollAndHighlight(testId: number) {
  try {
    const el = document.querySelector(`[data-test-id="${testId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      el.classList.add("ring-2", "ring-emerald-500", "bg-emerald-900/20", "rounded-lg")
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-emerald-500", "bg-emerald-900/20")
      }, 3000)
    }
  } catch {}
}

function useURLTab(key: string, fallback: string): [string, (v: string) => void] {
  const get = () => {
    const p = new URLSearchParams(window.location.search)
    return p.get(key) || fallback
  }
  const [tab, setTabState] = useState(get)
  const setTab = (val: string) => {
    const p = new URLSearchParams(window.location.search)
    p.set(key, val)
    window.history.replaceState({}, "", "?" + p.toString())
    setTabState(val)
  }
  useEffect(() => {
    const h = () => setTabState(get())
    window.addEventListener("popstate", h)
    return () => window.removeEventListener("popstate", h)
  }, [])
  return [tab, setTab]
}

interface QuizDashboardProps {
  highlightTestId?: number | null
  onTestHighlighted?: () => void
}

export default function QuizDashboard({ highlightTestId, onTestHighlighted }: QuizDashboardProps) {
  const [tab, setTab] = useURLTab("test", "female")
  const [sheetClientId, setSheetClientId] = useState<number | null>(null)
  const [highlightId, setHighlightId] = useState<number | null>(null)

  // Tab sync: если пришёл highlightTestId, переключаем таб и ждём рендера
  useEffect(() => {
    if (highlightTestId) {
      setHighlightId(highlightTestId)
      // По данным из бэка определим таб: female test has female prefix, mens has male prefix
      // Пока просто скроллим через 500ms после рендера
      const timer = setTimeout(() => {
        scrollAndHighlight(highlightTestId)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [highlightTestId])

  // Реальный скролл к data-test-id
  useEffect(() => {
    if (!highlightId) return
    const timer = setTimeout(() => {
      scrollAndHighlight(highlightId)
    }, 300)
    return () => clearTimeout(timer)
  }, [highlightId, tab])

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Тесты</h1>
          <p className="text-sm text-muted-foreground mt-1">Управление результатами тестов</p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="female">ШШ Женский</TabsTrigger>
            <TabsTrigger value="mens">Лучший любовник</TabsTrigger>
          </TabsList>

          <TabsContent value="female">
            <FemaleTestDashboard />
          </TabsContent>

          <TabsContent value="mens">
            <QuizMensDashboard onOpenClient={(id) => setSheetClientId(id)} />
          </TabsContent>
        </Tabs>
      </div>

      {sheetClientId && (
        <ClientSheet clientId={sheetClientId} onClose={() => setSheetClientId(null)} />
      )}
    </div>
  )
}
