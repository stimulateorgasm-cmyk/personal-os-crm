import React, { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import FemaleTestDashboard from "./FemaleTestDashboard"
import QuizMensDashboard from "./QuizMensDashboard"
import { ClientSheet } from "@/components/ClientSheet"

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

export default function QuizDashboard() {
  const [tab, setTab] = useURLTab("test", "female")
  const [sheetClientId, setSheetClientId] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Тесты</h1>
          <p className="text-sm text-muted-foreground mt-1">Управление результатами тестов</p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="female">Шкала Шумкина</TabsTrigger>
            <TabsTrigger value="mens">Тест на мастерство</TabsTrigger>
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
