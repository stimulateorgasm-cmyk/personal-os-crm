import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, API } from "@/lib/utils"
import { Users, TrendingUp, MessageSquare, BarChart, ArrowRight } from "lucide-react"

function authFetch(url: string, options: RequestInit = {}) {
  const t = localStorage.getItem("crm_token")
  const h: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (t) h["Authorization"] = `Bearer ${t}`
  return fetch(url, { ...options, headers: h })
}

const FUNNEL_STEPS = ["opened_bot", "started_test", "completed_test", "clicked_extended"]

export function GlobalDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["stats-global"],
    queryFn: () => authFetch(`${API}/api/stats/global`).then((r) => r.json()),
    staleTime: 60_000,
  })

  if (isLoading) return <div className="p-6 space-y-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full bg-zinc-800" />)}</div>

  const leads = data?.leads || {}
  const topUtm = data?.utm?.[0]

  const FunnelView = ({ funnel, label, color }: { funnel: Record<string, number>; label: string; color: string }) => {
    const dotColor = color === "blue" ? "bg-blue-500" : color === "purple" ? "bg-purple-500" : "bg-amber-500"
    const steps = FUNNEL_STEPS.map((s, i) => {
      const val = funnel[s] || 0
      const prev = i === 0 ? null : (funnel[FUNNEL_STEPS[i - 1]] || 0)
      const pct = prev && prev > 0 ? Math.round((val / prev) * 100) : null
      return { label: s, value: val, pct }
    })

    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">{label}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {steps.map((s, i) => {
              const maxV = Math.max(...steps.map((x) => x.value), 1)
              const w = Math.max((s.value / maxV) * 100, 2)
              return (
                <div key={s.label} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 w-24 truncate shrink-0">
                    {s.label === "opened_bot" ? "Открыли" : s.label === "started_test" ? "Начали" : s.label === "completed_test" ? "Прошли" : "Контент"}
                  </span>
                  <div className="flex-1 h-5 rounded bg-zinc-800 overflow-hidden relative">
                    <div className={cn("h-full rounded", dotColor.replace("bg-", "bg-/50 "))} style={{ width: `${w}%`, backgroundColor: color === "blue" ? "rgba(59,130,246,0.3)" : color === "purple" ? "rgba(168,85,247,0.3)" : "rgba(245,158,11,0.3)" }} />
                    <span className="absolute inset-0 flex items-center px-2 text-[11px] text-zinc-300">{s.value}</span>
                  </div>
                  <span className="text-xs text-zinc-500 w-10 text-right">{s.pct != null ? `${s.pct}%` : "—"}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-white mb-6">Сводка</h1>

      {/* Big Numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Всего лидов</CardTitle>
            <Users size={16} className="text-zinc-500" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold text-white">{(leads.total || 0).toLocaleString()}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Новых за неделю</CardTitle>
            <TrendingUp size={16} className="text-zinc-500" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold text-emerald-400">{leads.new_week || 0}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Топ источник</CardTitle>
            <BarChart size={16} className="text-zinc-500" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-white truncate">{topUtm?.source || "—"}</p>
            <p className="text-xs text-zinc-500">{topUtm?.leads || 0} лидов</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Сообщений в ботах</CardTitle>
            <MessageSquare size={16} className="text-zinc-500" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold text-white">{(data?.messages_total || 0).toLocaleString()}</p></CardContent>
        </Card>
      </div>

      {/* Big Numbers RPP */}
      {data?.rpp && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">РПП: Участников</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-white">{data.rpp.total}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">РПП: Средний балл</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-white">{data.rpp.avg_score}</p></CardContent></Card>
        </div>
      )}

      {/* Funnels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <FunnelView funnel={data?.funnel_female || {}} label="Воронка женского теста" color="purple" />
        <FunnelView funnel={data?.funnel_male || {}} label="Воронка мужского теста" color="blue" />
      </div>

      {/* Source breakdown + UTM table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">Источники трафика</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(leads.by_source || []).slice(0, 8).map((s: any) => {
                const maxV = Math.max(...(leads.by_source || []).map((x: any) => x.count), 1)
                return (
                  <div key={s.source} className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 w-28 truncate">{s.source || "—"}</span>
                    <div className="flex-1 h-4 rounded bg-zinc-800 overflow-hidden">
                      <div className="h-full rounded bg-gradient-to-r from-purple-600/40 to-blue-600/40" style={{ width: `${(s.count / maxV) * 100}%` }} />
                    </div>
                    <span className="text-xs text-zinc-500 w-10 text-right">{s.count}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* UTM table */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">Эффективность UTM</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px]">Источник</TableHead>
                  <TableHead className="text-[10px] text-right">Лиды</TableHead>
                  <TableHead className="text-[10px] text-right">Тесты</TableHead>
                  <TableHead className="text-[10px] text-right">Сделки</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.utm || []).slice(0, 10).map((u: any) => (
                  <TableRow key={u.source}>
                    <TableCell className="text-xs text-zinc-300">{u.source}</TableCell>
                    <TableCell className="text-xs text-right">{u.leads}</TableCell>
                    <TableCell className="text-xs text-right">{u.tests}</TableCell>
                    <TableCell className="text-xs text-right">{u.deals}</TableCell>
                  </TableRow>
                ))}
                {(data?.utm || []).length === 0 && <TableRow><TableCell colSpan={4} className="text-xs text-zinc-600 text-center py-4">Нет UTM-данных</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
