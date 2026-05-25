import { useState, useEffect, lazy, Suspense } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AuthProvider, useAuth } from "@/components/AuthProvider"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { Layout } from "@/components/Layout"
import { ClientsList } from "@/pages/ClientsList"
import { LoginPage } from "@/pages/LoginPage"
import { MiraGlobalChat } from "@/components/MiraGlobalChat"
import { ClientSheet } from "@/components/ClientSheet"
import { Loader2 } from "lucide-react"
import type { Page } from "@/components/Sidebar"

const Funnel = lazy(() => import("@/pages/Funnel").then((m) => ({ default: m.Funnel })))
const DealsList = lazy(() => import("@/pages/DealsList").then((m) => ({ default: m.DealsList })))
const StatsDashboard = lazy(() => import("@/pages/StatsDashboard").then((m) => ({ default: m.StatsDashboard })))
const TasksDashboard = lazy(() => import("@/pages/TasksDashboard").then((m) => ({ default: m.TasksDashboard })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: false },
  },
})

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
    </div>
  )
}

// Wrap fetches with auth token
function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("crm_token")
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  if (token) headers["Authorization"] = `Bearer ${token}`
  return fetch(path, { ...options, headers })
}

function CRMApp() {
  const { token, isLoading } = useAuth()
  const [page, setPage] = useState<Page>(() => {
    return (localStorage.getItem("crm_page") as Page) || "clients"
  })
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)

  useEffect(() => {
    localStorage.setItem("crm_page", page)
  }, [page])

  // Show loading while checking token
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  // If not authenticated, show login
  if (!token) {
    return <LoginPage />
  }

  return (
    <Layout active={page} onNavigate={(p) => { setPage(p); setSelectedClientId(null) }}>
      <ErrorBoundary key={`${page}-${selectedClientId}`}>
        <Suspense fallback={<PageLoader />}>
          {page === "clients" && <ClientsList onSelect={setSelectedClientId} selectedId={selectedClientId} />}
          {page === "funnel" && <Funnel onSelect={setSelectedClientId} />}
          {page === "deals" && <DealsList onSelect={setSelectedClientId} />}
          {page === "stats" && <StatsDashboard />}
          {page === "tasks" && <TasksDashboard onSelectClient={setSelectedClientId} />}
        </Suspense>
      </ErrorBoundary>

      <ClientSheet clientId={selectedClientId} onClose={() => setSelectedClientId(null)} />
      <MiraGlobalChat />
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
