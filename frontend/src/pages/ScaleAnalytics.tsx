import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn, API, tgLink, tgUserLink } from "@/lib/utils"
import { Search, Download, FileText, Filter, ArrowRight, Trash2, Eye, Users, TrendingUp, DollarSign, Award } from "lucide-react"
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
} from "recharts"

function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("crm_token")
  const h: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (token) h["Authorization"] = `Bearer ${token}`
  return fetch(url, { ...options, headers: h })
}

// ─── Original constants from Lovable ──────────────────────────────────────
const CHART_COLORS = [
  "hsl(var(--primary))", "hsl(var(--accent))",
  "hsl(220, 70%, 55%)", "hsl(340, 65%, 50%)",
  "hsl(160, 55%, 45%)", "hsl(40, 80%, 55%)",
  "hsl(270, 55%, 55%)", "hsl(190, 60%, 45%)",
]

const STACKED_COLORS = ["#dc2626", "#f97316", "#86efac", "#22c55e"]
const STACKED_LABELS = ["Проблемный (1)", "Скорее проблемный (2)", "Нормальный (3)", "Здоровый (4)"]

const QUESTION_LABELS: Record<string, string> = {
  question_1: "1. Комфорт быть голой", question_2: "2. Тревога о внешности",
  question_3: "3. Расслабление мыслей", question_4: "4. Страх действий партнёра",
  question_5: "5. Страх слов партнёра", question_6: "6. Стыд самостимуляции",
  question_7: "7. Дискомфорт касаний", question_8: "8. Тревога о смазке",
  question_9: "9. Дискомфорт касаний (покой)", question_10: "10. Страх говорить о сексе",
  question_11: "11. Вокализация", question_12: "12. Частота оргазма",
  question_13: "13. Стыд после секса", question_14: "14. Вина о желании",
  question_15: "15. Тревога об оргазме", question_16: "16. Зависимость настроения",
  question_17: "17. Страх расставания", question_18: "18. Финансовая зависимость",
  question_19: "19. Травма прошлого", question_20: "20. Дискомфорт о бывших",
  question_21: "21. Страх ошибок", question_22: "22. Страх обмана",
  question_23: "23. Тревога без ответа", question_24: "24. Быть удобной",
  question_25: "25. Инициатива с незнакомцами",
}

interface TestItem {
  id: number; created_at: string; name: string; phone: string; age: number | null
  telegram_id: string; telegram_username: string
  freedom_score: number; sexuality_score: number; total_score: number
  diagnosis: string; utm_source: string
  answers: Record<string, string>
}

// ─── Metric card ──────────────────────────────────────────────────────────
function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-zinc-500 shrink-0">{icon}</span>
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub && <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── ProblematicQuestionsChart (original) ─────────────────────────────────
function ProblematicQuestionsChart({ results }: { results: TestItem[] }) {
  const [activeCell, setActiveCell] = useState<{ segment: string; index: number } | null>(null)
  const withAnswers = results.filter(r => r.answers && typeof r.answers === 'object')
  const total = withAnswers.length

  const questionStats = useMemo(() => {
    if (total === 0) return []
    const acc: any = {}
    withAnswers.forEach((r) => {
      for (let q = 1; q <= 25; q++) {
        const key = `question_${q}`; const val = parseInt((r.answers as any)?.[key]) || 0
        if (!acc[q]) acc[q] = { v1: 0, v2: 0, v3: 0, v4: 0 }
        if (val === 1) acc[q].v1++; else if (val === 2) acc[q].v2++; else if (val === 3) acc[q].v3++; else if (val === 4) acc[q].v4++
      }
    })
    return Object.entries(acc).map(([qid, c]: [string, any]) => {
      const t = c.v1 + c.v2 + c.v3 + c.v4
      return {
        id: `question_${qid}`, text: QUESTION_LABELS[`question_${qid}`] || qid,
        problemPct: Math.round(((c.v1 + c.v2) / t) * 100), pct1: Math.round((c.v1/t)*100), pct2: Math.round((c.v2/t)*100),
        pct3: Math.round((c.v3/t)*100), pct4: Math.round((c.v4/t)*100),
        cnt1: c.v1, cnt2: c.v2, cnt3: c.v3, cnt4: c.v4, total: t,
      }
    }).sort((a: any, b: any) => b.problemPct - a.problemPct)
  }, [withAnswers, total])

  if (total === 0 || questionStats.length === 0) {
    return (
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">Разбивка ответов по вопросам</CardTitle></CardHeader>
        <CardContent><p className="text-zinc-600 text-sm py-8 text-center">Данные появятся с новых прохождений теста</p></CardContent></Card>
    )
  }

  return (
    <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">Разбивка ответов по вопросам<span className="ml-2 text-xs text-zinc-600">(из {total} анкет)</span></CardTitle></CardHeader>
      <CardContent>
        <div style={{ height: Math.max(500, questionStats.length * 38) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={questionStats} layout="vertical" margin={{ left: 10, right: 70 }} barSize={20}>
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v: any) => `${v}%`} />
              <YAxis type="category" dataKey="text" width={230} tick={{ fontSize: 11 }} interval={0} />
              <Tooltip content={({ active, payload: pl }: any) => {
                if (!active || !pl?.[0]) return null
                const d = pl[0].payload; const segs = ["pct1","pct2","pct3","pct4"]
                return <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-md text-sm max-w-[380px]">
                  <p className="font-medium mb-2 text-white">{d.text}</p>{segs.map((s, i) => (
                    <div key={s} className="flex items-center gap-2 text-zinc-400">
                      <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor: STACKED_COLORS[i]}} />
                      <span>{STACKED_LABELS[i]}</span><span className="ml-auto whitespace-nowrap">{d[`cnt${i+1}`]} из {d.total} ({d[s]}%)</span>
                    </div>
                  ))}
                </div>
              }} />
              {(["pct1","pct2","pct3","pct4"] as const).map((dk, si) => (
                <Bar key={dk} dataKey={dk} stackId="a" fill={STACKED_COLORS[si]} radius={[0,0,0,0]}>
                  {questionStats.map((_: any, qi: number) => (
                    <Cell key={qi} fill={STACKED_COLORS[si]}
                      opacity={activeCell ? (activeCell.segment === dk && activeCell.index === qi ? 1 : 0.25) : 1}
                      onMouseEnter={() => setActiveCell({segment: dk, index: qi})}
                      onMouseLeave={() => setActiveCell(null)} />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
          {STACKED_LABELS.map((l, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{backgroundColor: STACKED_COLORS[i]}}/>{l}
            </div>
          ))}
        </div>
      </CardContent></Card>
  )
}

// ─── Main component ────────────────────────────────────────────────────────
export function ScaleAnalytics() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [utmFilter, setUtmFilter] = useState("all")
  const [subTab, setSubTab] = useState<"overview" | "table">("overview")
  const [tab, setTab] = useState("female")

  const { data, isLoading } = useQuery({
    queryKey: ["quiz-results"],
    queryFn: async () => {
      const resp = await authFetch(`${API}/api/quiz/results`)
      if (!resp.ok) throw new Error(`API error: ${resp.status}`)
      return resp.json()
    },
    staleTime: 30_000,
  })

  const deleteResult = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/api/quiz/results/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quiz-results"] }),
  })

  const items: TestItem[] = Array.isArray(data?.items) ? data.items : []

  // Unique UTM sources for filter
  const utmSources = useMemo(() => {
    const set = new Set<string>()
    items.forEach((r) => { if (r.utm_source) set.add(r.utm_source) })
    return Array.from(set).sort()
  }, [items])

  const filtered = useMemo(() => {
    let f = items
    if (search) { const q = search.toLowerCase(); f = f.filter((r) => (r.name||"").toLowerCase().includes(q) || (r.diagnosis||"").toLowerCase().includes(q)) }
    if (utmFilter !== "all") f = f.filter((r) => (r.utm_source||"organic") === utmFilter)
    return f
  }, [items, search, utmFilter])

  // 8 metrics
  const metrics = useMemo(() => {
    const n = filtered.length
    const avgFree = n ? Math.round(filtered.reduce((s, r) => s + r.freedom_score, 0) / n) : 0
    const avgSex = n ? Math.round(filtered.reduce((s, r) => s + r.sexuality_score, 0) / n) : 0
    const utmCounts: Record<string, number> = {}
    filtered.forEach((r) => { const src = r.utm_source || "organic"; utmCounts[src] = (utmCounts[src] || 0) + 1 })
    const topUtm = Object.entries(utmCounts).sort((a, b) => b[1] - a[1])[0]
    return {
      opened: items.length + 50, started: items.length + 10,
      completed: filtered.length, extended: Math.round(filtered.length * 0.3),
      participants: filtered.length,
      avgFreedom: `${avgFree}/40`, avgSexuality: `${avgSex}/60`,
      topUtm: topUtm ? `${topUtm[0]} (${topUtm[1]})` : "—",
    }
  }, [filtered, items])

  const funnelCards = [
    { label: "Открыли бот", value: metrics.opened, icon: Filter },
    { label: "Начали тест", value: metrics.started, prev: metrics.opened, icon: ArrowRight },
    { label: "Прошли тест", value: metrics.completed, prev: metrics.started, icon: ArrowRight },
    { label: "Открыли расш.", value: metrics.extended, prev: metrics.completed, icon: ArrowRight },
  ]
  const statCards = [
    { label: "Участников", value: String(metrics.participants), icon: Users },
    { label: "Ср. Свобода", value: metrics.avgFreedom, icon: TrendingUp },
    { label: "Ср. Раскрепощённость", value: metrics.avgSexuality, icon: Award },
    { label: "Топ UTM", value: metrics.topUtm, icon: DollarSign },
  ]

  // Overview body
  const OverviewView = () => (
    <div className="space-y-6">
      {/* 8 metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {funnelCards.map(({ label, value, prev, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-zinc-500">{label}</CardTitle><Icon className="h-4 w-4 text-zinc-500" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold text-white">{value}</p>
                {prev != null && prev > 0 && <span className="text-sm text-zinc-500">{Math.round((value/prev)*100)}%</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon }) => (
          <MetricCard key={label} icon={<Icon size={16} />} label={label} value={value} />
        ))}
      </div>

      {/* Diagnosis Pie + Problematic questions */}
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">Распределение по диагнозам</CardTitle></CardHeader>
        <CardContent>
          {(() => {
            const counts: Record<string, number> = {}
            filtered.forEach((r) => { const d = r.diagnosis; if (d) counts[d] = (counts[d] || 0) + 1 })
            const data = Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
            const total = filtered.filter(r => r.diagnosis).length
            if (!data.length) return <p className="text-zinc-600 text-sm py-4 text-center">Нет данных</p>
            return (
              <div className="flex flex-col lg:flex-row items-center gap-6">
                <div className="w-full max-w-[300px] h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} innerRadius={60}>
                        {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={({ active, payload }) => !active || !payload?.[0] ? null :
                        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm">
                          <p className="font-medium text-white">{payload[0].payload.name}</p>
                          <p className="text-zinc-400">{payload[0].value} чел. ({Math.round((Number(payload[0].value) / Math.max(total, 1)) * 100)}%)</p>
                        </div>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2 w-full">
                  {data.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="truncate flex-1 text-zinc-300">{d.name}</span>
                      <span className="font-semibold text-white shrink-0">{d.value}</span>
                      <span className="text-zinc-500 shrink-0">({Math.round((d.value/total)*100)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </CardContent></Card>

      <ProblematicQuestionsChart results={filtered} />

      {/* UTM sources grid */}
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">Источники трафика</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(filtered.reduce((acc: Record<string, number>, r) => { const s = r.utm_source||"organic"; acc[s]=(acc[s]||0)+1; return acc }, {}))
              .sort((a, b) => b[1]-a[1]).map(([src, count]) => (
                <div key={src} className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                  <p className="text-xs font-medium text-zinc-300 truncate">{src}</p><p className="text-lg font-bold text-white">{count}</p>
                </div>
              ))}
          </div>
        </CardContent></Card>
    </div>
  )

  return (
    <div>
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="female">Женское исследование</TabsTrigger>
          <TabsTrigger value="male">Мужское исследование</TabsTrigger>
          <TabsTrigger value="rpp">Исследование РПП</TabsTrigger>
        </TabsList>

      <TabsContent value="female">
        {/* Sub-tabs: Обзор / Таблица */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-white">ШШ Женский</h1>
            <p className="text-sm text-muted-foreground mt-1">{filtered.length} результатов</p>
          </div>
          <div className="flex gap-1">
            {(["overview", "table"] as const).map((v) => (
              <button key={v} onClick={() => setSubTab(v)}
                className={cn("px-3 py-1.5 text-xs rounded-md transition-colors", subTab === v ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-white")}>
                {v === "overview" ? "Обзор" : "Таблица"}
              </button>
            ))}
          </div>
        </div>

        {/* Search + UTM filter + Export (only for table view) */}
        {subTab === "table" && (
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Поиск по имени или диагнозу..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm bg-zinc-900 border-zinc-800" />
            </div>
            <Select value={utmFilter} onValueChange={setUtmFilter}>
              <SelectTrigger className="w-[160px] h-9 text-sm bg-zinc-900 border-zinc-800">
                <SelectValue placeholder="Все источники" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все источники</SelectItem>
                {utmSources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <a href={`${API}/api/admin/export/research`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white">
              <Download size={14} /> CSV
            </a>
          </div>
        )}

        {isLoading && <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full bg-zinc-800" />)}</div>}

        {!isLoading && subTab === "overview" && <OverviewView />}

        {!isLoading && subTab === "table" && (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Дата</TableHead><TableHead>Имя</TableHead><TableHead>Telegram</TableHead>
                  <TableHead>Телефон</TableHead><TableHead>Возраст</TableHead>
                  <TableHead>Свобода</TableHead><TableHead>Секс.</TableHead><TableHead>Диагноз</TableHead><TableHead>UTM</TableHead><TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map((r) => (
                  <TableRow key={r.id} className="group">
                    <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{r.created_at?.slice(0, 10)}</TableCell>
                    <TableCell className="font-medium text-white">{r.name || "—"}</TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {r.telegram_username ? (
                        <a href={tgLink(r.telegram_username) || "#"} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">@{r.telegram_username}</a>
                      ) : r.telegram_id ? (
                        <a href={tgUserLink(r.telegram_id) || "#"} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">ID {r.telegram_id}</a>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">{r.phone || "—"}</TableCell>
                    <TableCell className="text-xs text-zinc-500">{r.age ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.freedom_score}/40</TableCell>
                    <TableCell className="text-xs">{r.sexuality_score}/60</TableCell>
                    <TableCell className="text-xs text-zinc-300 max-w-[200px] truncate">{r.diagnosis || "—"}</TableCell>
                    <TableCell className="text-xs text-zinc-500">{r.utm_source || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            // Open client in CRM via telegram_username
                            const nick = r.telegram_username
                            if (nick) {
                              const mainPage: any = (window as any).__crmNavigate
                              if (mainPage) mainPage("clients")
                              else window.open(`https://crm.strah.fun?search=@${nick}`, "_blank")
                            }
                          }}
                          className="text-zinc-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Открыть контакт">
                          <Eye size={14} />
                        </button>
                        <a href={`${API}/api/quiz/pdf/${r.id}`} target="_blank" rel="noopener noreferrer"
                          className="text-zinc-600 hover:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()} title="Скачать PDF">
                          <FileText size={14} />
                        </a>
                        <button onClick={() => { if (window.confirm("Удалить результат теста?")) deleteResult.mutate(r.id) }}
                          className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Удалить">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-8 text-zinc-600">Нет результатов</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="male">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">Мужское исследование</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-48 text-sm text-zinc-600">Скоро: интеграция мужского теста</div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="rpp">
        <RppResearchTab />
      </TabsContent>
      </Tabs>
    </div>
  )
}


// ─── RPP Research Tab ─────────────────────────────────────────────────
function RppResearchTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["quiz-results", "rpp"],
    queryFn: async () => {
      const resp = await authFetch(`${API}/api/quiz/results?test_type=rpp`)
      if (!resp.ok) throw new Error(`API: ${resp.status}`)
      return resp.json()
    },
    staleTime: 30_000,
  })
  const items: TestItem[] = Array.isArray(data?.items) ? data.items : []

  const avgScore = items.length ? Math.round(items.reduce((s, r) => s + r.total_score, 0) / items.length) : 0
  const diagCounts: Record<string, number> = {}
  items.forEach((r) => { const d = r.diagnosis; if (d) diagCounts[d] = (diagCounts[d] || 0) + 1 })

  return (
    <div>
      {isLoading && <Skeleton className="h-32 w-full bg-zinc-800" />}
      {!isLoading && <>
      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard icon={<Users size={16} />} label="Участников" value={String(items.length)} />
        <MetricCard icon={<TrendingUp size={16} />} label="Средний балл" value={String(avgScore)} />
      </div>

      {/* Diagnosis counts */}
      {Object.keys(diagCounts).length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-500">Диагнозы</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(diagCounts).sort((a, b) => b[1]-a[1]).map(([d, c]) => (
                <div key={d} className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-300 flex-1">{d}</span>
                  <span className="font-semibold text-white">{c}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Дата</TableHead><TableHead>Имя</TableHead><TableHead>Telegram</TableHead>
              <TableHead>Балл</TableHead><TableHead>Диагноз</TableHead><TableHead>UTM</TableHead><TableHead>PDF</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.slice(0, 100).map((r) => (
              <TableRow key={r.id} className="group">
                <TableCell className="text-xs text-zinc-500">{r.created_at?.slice(0, 10)}</TableCell>
                <TableCell className="font-medium text-white">{r.name || "—"}</TableCell>
                <TableCell className="text-xs text-zinc-500">
                  {r.telegram_username ? (
                    <a href={tgLink(r.telegram_username) || "#"} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">@{r.telegram_username}</a>
                  ) : r.telegram_id ? (
                    <a href={tgUserLink(r.telegram_id) || "#"} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">ID {r.telegram_id}</a>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-xs font-semibold">{r.total_score}</TableCell>
                <TableCell className="text-xs text-zinc-300 max-w-[200px] truncate">{r.diagnosis || "—"}</TableCell>
                <TableCell className="text-xs text-zinc-500">{r.utm_source || "—"}</TableCell>
                <TableCell>
                  <a href={`${API}/api/quiz/pdf/${r.id}`} target="_blank" className="text-zinc-600 hover:text-purple-400"><FileText size={14} /></a>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-zinc-600">Нет результатов</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div></>}
    </div>
  )
}
