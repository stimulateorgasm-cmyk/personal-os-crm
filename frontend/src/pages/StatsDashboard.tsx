import React, { useQuery } from "@tanstack/react-query"
import { Users, FileBadge, TrendingUp, Clock, DollarSign, Activity } from "lucide-react"
import { cn, getStatusStyle, STAGES, API } from "@/lib/utils"
import { Loader2 } from "lucide-react"

function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("crm_token")
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (token) headers["Authorization"] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

interface StatsDashboardProps {
  onSelectClient?: (id: number) => void
}

export function StatsDashboard({ onSelectClient }: StatsDashboardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: () => authFetch(`${API}/api/stats`).then((r) => r.json()),
    staleTime: 30_000,
  })

  const { data: dealsData } = useQuery({
    queryKey: ["deals", "all"],
    queryFn: () => authFetch(`${API}/api/deals?limit=1000`).then((r) => r.json()),
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Calculate expected payments
  const deals = dealsData?.deals || []
  let expectedSum = 0
  let expectedCount = 0
  for (const d of deals) {
    const remainder = (d.amount || 0) - (d.paid || 0)
    if (remainder > 0) {
      expectedSum += remainder
      expectedCount++
    }
  }

  const sortedStatuses = [...STAGES]
  const maxCount = Math.max(...(data?.by_status?.map((s: any) => s.count) || [0]), 1)
  const totalClients = data?.total_clients || 0
  const totalDeals = data?.total_deals || 0
  const dealsSum = data?.deals_sum || 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Аналитика</h1>
        <p className="text-sm text-muted-foreground mt-1">Общая картина CRM</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard icon={<Users size={18} />} label="Контакты" value={totalClients.toLocaleString()} />
        <MetricCard icon={<FileBadge size={18} />} label="Сделки" value={totalDeals.toLocaleString()} />
        <MetricCard icon={<TrendingUp size={18} />} label="Общая выручка" value={`${dealsSum.toLocaleString()}₽`} />
        <MetricCard icon={<DollarSign size={18} />} label="Ожидаемые оплаты" value={`${expectedSum.toLocaleString()}₽`} sub={`${expectedCount} сделок с долгом`} accent />
      </div>

      {/* Two column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Distribution by status */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Воронка продаж</h2>
          <div className="space-y-3">
            {sortedStatuses.map((status) => {
              const item = data?.by_status?.find((s: any) => s.status === status)
              const count = item?.count || 0
              const pct = Math.round((count / maxCount) * 100)
              const { bg, text } = getStatusStyle(status)
              return (
                <div key={status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-zinc-300">{status}</span>
                    <span className={cn("text-sm font-semibold", text)}>{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", bg.replace("/10", "/40"))} style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Expected payments */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Ожидаемые оплаты</h2>
          {expectedCount === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-zinc-600">Нет ожидаемых платежей</div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {deals.filter((d: any) => (d.amount || 0) - (d.paid || 0) > 0).map((d: any) => {
                const remainder = (d.amount || 0) - (d.paid || 0)
                const canOpen = !!d.client_id
                return (
                  <div
                    key={d.id}
                    onClick={() => canOpen && onSelectClient?.(d.client_id)}
                    className={cn(
                      "flex items-center justify-between w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 transition-colors text-left",
                      canOpen ? "hover:bg-zinc-800 cursor-pointer min-h-[48px] touch-manipulation" : "cursor-default"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-zinc-200 truncate">{d.title}</p>
                      {d.client_name && <p className="text-[10px] text-zinc-500 truncate">{d.client_name}</p>}
                    </div>
                    <span className="text-xs font-semibold text-orange-400 ml-3 shrink-0">
                      {remainder.toLocaleString()}₽
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-4", accent ? "border-orange-800/50 bg-orange-950/10" : "border-zinc-800 bg-zinc-900/50")}>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("shrink-0", accent ? "text-orange-400" : "text-zinc-500")}>{icon}</span>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <p className={cn("text-lg font-bold", accent ? "text-orange-300" : "text-white")}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}
