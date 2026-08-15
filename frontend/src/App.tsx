import { useState, useEffect, lazy, Suspense } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AuthProvider, useAuth } from "@/components/AuthProvider"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { Layout } from "@/components/Layout"
import { ClientsList } from "@/pages/ClientsList"
import { LoginPage } from "@/pages/LoginPage"
import { Funnel } from "@/pages/Funnel"
import { DealsList } from "@/pages/DealsList"
import { StatsDashboard } from "@/pages/StatsDashboard"
import TasksDashboard from "@/pages/TasksDashboard"
import QuizDashboard from "@/pages/QuizDashboard"
import { GlobalDashboard } from "@/pages/GlobalDashboard"
import { SearchResults } from "@/pages/SearchResults"
const AntonsTasks = lazy(() => import("@/pages/AntonsTasks"))
const AssistantTasks = lazy(() => import("@/pages/AssistantTasks"))
import { TaskSheet } from "@/components/TaskSheet"
import { AssistantTaskSheet } from "@/components/AssistantTaskSheet"
import { Loader2 } from "lucide-react"
import { MiraGlobalChat } from "@/components/MiraGlobalChat"
import { ClientSheet } from "@/components/ClientSheet"
import { SheetProvider } from "@/hooks/use-sheet-context"
import type { Page } from "@/components/Sidebar"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: false },
  },
})

function CRMApp() {
  const { token, isLoading } = useAuth()
  const [page, setPage] = useState<Page>(() => {
    return (localStorage.getItem("crm_page") as Page) || "clients"
  })
  const [selectedClientId, setSelectedClientId] = useState<number | null>(() => {
    const saved = localStorage.getItem("crm_selected_client_id")
    return saved ? parseInt(saved, 10) : null
  })
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [selectedAssistantTaskId, setSelectedAssistantTaskId] = useState<number | null>(null)
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null)
  const [highlightTestId, setHighlightTestId] = useState<number | null>(null)

  useEffect(() => {
    localStorage.setItem("crm_page", page)
  }, [page])

  // Save selected client card for reload persistence
  useEffect(() => {
    if (selectedClientId !== null) {
      localStorage.setItem("crm_selected_client_id", String(selectedClientId))
    } else {
      localStorage.removeItem("crm_selected_client_id")
    }
  }, [selectedClientId])

  // Listen for open-client events from dashboards — set clientId without changing page
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<number>
      if (ce.detail) {
        setSelectedClientId(ce.detail)
      }
    }
    window.addEventListener("open-client", handler)
    return () => window.removeEventListener("open-client", handler)
  }, [])

  // Listen for open-deal events — navigate to deals page and highlight
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<number>
      if (ce.detail) {
        localStorage.setItem("crm_page", "deals")
        setPage("deals")
        setSelectedDealId(ce.detail)
        setSelectedClientId(null)
        setSelectedTaskId(null)
        setSelectedAssistantTaskId(null)
      }
    }
    window.addEventListener("open-deal", handler)
    return () => window.removeEventListener("open-deal", handler)
  }, [])

  // Listen for open-test events — navigate to quiz page and highlight
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{clientId: number; testId: number}>
      if (ce.detail) {
        localStorage.setItem("crm_page", "quiz")
        setPage("quiz")
        setHighlightTestId(ce.detail.testId)
        setSelectedClientId(null)
        setSelectedTaskId(null)
        setSelectedAssistantTaskId(null)
        setSelectedDealId(null)
      }
    }
    window.addEventListener("open-test", handler)
    return () => window.removeEventListener("open-test", handler)
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (!token) {
    return <LoginPage />
  }

  return (
    <Layout active={page} onNavigate={(p) => { setPage(p); setSelectedClientId(null); setSelectedTaskId(null); setSelectedAssistantTaskId(null); setSelectedDealId(null) }}>
      <ErrorBoundary key={page}>
        {page === "clients" && <ClientsList onSelect={setSelectedClientId} selectedId={selectedClientId} />}
        {page === "funnel" && <Funnel onSelect={setSelectedClientId} />}
        {page === "deals" && <DealsList onSelect={setSelectedClientId} highlightDealId={selectedDealId} onDealHighlighted={() => setSelectedDealId(null)} />}
        {page === "stats" && <StatsDashboard onSelectClient={setSelectedClientId} />}
        {page === "quiz" && <QuizDashboard highlightTestId={highlightTestId} onTestHighlighted={() => setHighlightTestId(null)} />}
        {page === "tasks" && <TasksDashboard onSelectClient={setSelectedClientId} />}
            <Suspense fallback={<div className="p-4 text-zinc-500">Загрузка...</div>}>
        {page === "antons-tasks" && <AntonsTasks onSelect={setSelectedTaskId} />}
        {page === "assistant-tasks" && <AssistantTasks onSelect={setSelectedAssistantTaskId} />}
            </Suspense>
        {page === "dashboard" && <GlobalDashboard />}
        {page === "search" && <SearchResults onSelect={setSelectedClientId} />}

        <SheetProvider>
          <ClientSheet clientId={selectedClientId} onClose={() => setSelectedClientId(null)} />
          <TaskSheet taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
          <AssistantTaskSheet taskId={selectedAssistantTaskId} onClose={() => setSelectedAssistantTaskId(null)} />
          <MiraGlobalChat />
        </SheetProvider>
      </ErrorBoundary>
    </Layout>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CRMApp />
      </AuthProvider>
    </QueryClientProvider>
  )
}
