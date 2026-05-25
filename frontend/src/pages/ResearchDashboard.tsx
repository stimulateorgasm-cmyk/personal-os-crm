import React, { useState, useEffect, useMemo, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Users, TrendingUp, BarChart3, Globe, Search, Trash2, Pencil, ExternalLink, UserCircle } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts"

const API = ""

interface MensResult {
  id: string
  client_id: number | null
  created_at: string
  name: string | null
  telegram_id: string | null
  telegram_username: string | null
  contact: string | null
  score: number | null
  total_score: number | null
  level: string | null
  diagnosis: string | null
  utm_source: string | null
  answers: Record<string, number> | null
  intent: string | null
  phone: string | null
  test_type: string
}

type EditableField = "name" | "telegram_username" | "contact" | "phone" | "utm_source"

const CHART_COLORS = ["hsl(var(--primary))", "#d4af37", "hsl(220, 70%, 55%)", "hsl(340, 65%, 50%)", "hsl(160, 55%, 45%)", "hsl(40, 80%, 55%)", "hsl(270, 55%, 55%)"]

const STACKED_COLORS = ["#dc2626", "#f97316", "#86efac", "#22c55e"]

const LEVEL_COLORS: Record<string, string> = {
  "Мастер": "#d4af37",
  "Продвинутый": "#60a5fa",
  "Развивающийся": "#fbbf24",
  "Начинающий": "#ef4444",
}

const MENS_QUESTIONS = [
  "У тебя бывало, что ты кончал раньше, чем хотел?",
  "Можешь ли ты быть полностью расслабленным во время секса?",
  "Понимаешь ли ты, когда девушка действительно возбуждена?",
  "Чувствуешь ли ты контроль над своим телом и состоянием?",
  "Ты замечал, что твои слова или голос влияют на её возбуждение?",
]

function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("crm_token")
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (token) headers["Authorization"] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

function pct(value: number, total: number): string {
  if (!total) return "0%"
  return `${Math.round((value / total) * 100)}%`
}

// ─── EditableCell ──────────────────────────────────────────────────
function EditableCell({
  value, field, rowId, type = "text", onSave, renderDisplay,
}: {
  value: string | number | null
  field: EditableField
  rowId: string
  type?: "text" | "number"
  onSave: (id: string, field: EditableField, value: string) => Promise<void>
  renderDisplay?: (val: string | number | null) => React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(String(value ?? ""))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setEditValue(String(value ?? ""))
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [editing, value])

  const handleSave = async () => {
    setSaving(true)
    await onSave(rowId, field, editValue)
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type={type}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false) }}
          className="h-7 text-sm px-2 py-0 w-full min-w-[60px] rounded border border-input bg-background"
          disabled={saving}
        />
        <button onClick={handleSave} disabled={saving} className="text-primary hover:text-primary/80 shrink-0">✓</button>
        <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground shrink-0">✕</button>
      </div>
    )
  }

  return (
    <div
      className="group flex items-center gap-1 cursor-pointer min-h-[24px] rounded px-1 -mx-1 hover:bg-muted/50 transition-colors"
      onClick={() => setEditing(true)}
      title="Нажмите для редактирования"
    >
      <span className="truncate">
        {renderDisplay ? renderDisplay(value) : (value != null && value !== "" ? String(value) : "—")}
      </span>
      <Pencil size={12} className="opacity-0 group-hover:opacity-50 shrink-0 transition-opacity" />
    </div>
  )
}

// ─── Level Distribution Pie ───────────────────────────────────────────
function LevelPieChart({ levels }: { levels: { name: string; count: number }[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const total = levels.reduce((s, l) => s + l.count, 0)

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null
    const d = payload[0].payload
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-md text-sm">
        <p className="font-medium text-white">{d.name}</p>
        <p className="text-zinc-400">{d.value} чел. ({Math.round((d.value / total) * 100)}%)</p>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-400">Распределение по уровням</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col lg:flex-row items-center gap-6">
          <div className="w-full max-w-[300px] h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={levels} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={120} innerRadius={60}
                  activeIndex={activeIndex ?? undefined} activeShape={{ outerRadius: 105, innerRadius: 50 }}
                  onMouseEnter={(_, i) => setActiveIndex(i)} onMouseLeave={() => setActiveIndex(null)}
                >
                  {levels.map((d) => (
                    <Cell key={d.name} fill={LEVEL_COLORS[d.name] || "#666"} opacity={activeIndex !== null && levels[activeIndex]?.name !== d.name ? 0.4 : 1} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2 w-full">
            {levels.map(d => (
              <div key={d.name} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: LEVEL_COLORS[d.name] || "#666" }} />
                <span className="truncate flex-1 text-white">{d.name}</span>
                <span className="font-semibold text-white shrink-0">{d.count}</span>
                <span className="text-zinc-400 shrink-0">({pct(d.count, total)})</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Question Breakdown Chart ─────────────────────────────────────────
function QuestionBreakdownChart({ results }: { results: MensResult[] }) {
  const [activeCell, setActiveCell] = useState<{ key: string; index: number } | null>(null)
  const withAnswers = results.filter(r => r.answers && typeof r.answers === 'object')
  const total = withAnswers.length

  if (total === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-400">Разбивка ответов по вопросам</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-zinc-500 text-sm py-8 text-center">Данных с ответами пока нет</p>
        </CardContent>
      </Card>
    )
  }

  const questionStats = MENS_QUESTIONS.map((text, qi) => {
    const qId = `q${qi + 1}`
    const counts = { v0: 0, v1: 0, v2: 0 }
    withAnswers.forEach(r => {
      const val = r.answers?.[qId]
      if (val === 0) counts.v0++
      else if (val === 1) counts.v1++
      else if (val === 2) counts.v2++
    })
    const shortText = text.length > 40 ? text.slice(0, 37) + "..." : text
    return {
      id: qId, text, shortText,
      pct0: Math.round((counts.v0 / total) * 100),
      pct1: Math.round((counts.v1 / total) * 100),
      pct2: Math.round((counts.v2 / total) * 100),
      cnt0: counts.v0, cnt1: counts.v1, cnt2: counts.v2, total, problemPct: Math.round(((counts.v0 + counts.v1) / total) * 100),
    }
  })

  questionStats.sort((a, b) => b.problemPct - a.problemPct)

  const segments = [
    { key: "pct0", cnt: "cnt0", color: STACKED_COLORS[0], label: "Нет (0)" },
    { key: "pct1", cnt: "cnt1", color: STACKED_COLORS[1], label: "Иногда (1)" },
    { key: "pct2", cnt: "cnt2", color: STACKED_COLORS[3], label: "Да (2)" },
  ]

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-md text-sm max-w-[380px]">
        <p className="font-medium text-white mb-2">{d.text}</p>
        <div className="space-y-1">
          {segments.map(s => {
            const count = d[s.cnt] as number
            const pct = d[s.key] as number
            return (
              <div key={s.key} className="flex items-center gap-2 text-zinc-400">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="truncate">{s.label}</span>
                <span className="ml-auto whitespace-nowrap">{count} из {d.total} ({pct}%)</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-400">
          Разбивка ответов по вопросам
          <span className="ml-2 text-xs text-zinc-600">(из {total} анкет)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: Math.max(250, questionStats.length * 55) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={questionStats} layout="vertical" margin={{ left: 10, right: 70 }} barSize={20}>
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="#52525b" tick={{ fill: "#a1a1aa" }} />
              <YAxis type="category" dataKey="shortText" width={230} tick={{ fontSize: 11, fill: "#d4d4d8" }} interval={0} />
              <Tooltip content={<CustomTooltip />} />
              {segments.map(s => (
                <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} name={s.label}
                  onMouseEnter={(_, index) => setActiveCell({ key: s.key, index })}
                  onMouseLeave={() => setActiveCell(null)}
                >
                  {questionStats.map((_, qi) => {
                    const isActive = activeCell?.key === s.key && activeCell?.index === qi
                    const anyActive = activeCell !== null
                    return (
                      <Cell key={qi} fill={s.color} opacity={anyActive ? (isActive ? 1 : 0.25) : 1}
                        stroke={isActive ? "#fff" : "transparent"} strokeWidth={isActive ? 1 : 0}
                        style={{ transition: "opacity 0.2s ease" }}
                      />
                    )
                  })}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
          {segments.map(s => (
            <div key={s.key} className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />{s.label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const PAGE_SIZE = 50

export default function MensResearchDashboard() {
  const [results, setResults] = useState<MensResult[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [utmFilter, setUtmFilter] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  // Под-таб из URL — синхронизируется при монтировании и изменениях
  const [tab, setTabState] = useState(() => new URLSearchParams(window.location.search).get("sub") || "analytics")
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("sub")
    if (s) setTabState(s)
  }, [window.location.search])
  const setTab = (val: string) => {
    const p = new URLSearchParams(window.location.search)
    p.set("sub", val)
    window.history.replaceState({}, "", "?" + p.toString())
    setTabState(val)
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const [res, statsRes] = await Promise.all([
        authFetch(`${API}/api/quiz/results?test_type=mens`),
        authFetch(`${API}/api/quiz/mens-stats`),
      ])
      if (res.ok) {
        const data = await res.json()
        setResults(data.items || [])
      }
      if (statsRes.ok) {
        const data = await statsRes.json()
        setStats(data)
      }
    } catch (e) {
      console.error("Fetch error:", e)
    } finally {
      setLoading(false)
      setVisibleCount(PAGE_SIZE)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleDelete = async (id: string) => {
    if (!window.confirm("Удалить эту запись?")) return
    const res = await authFetch(`${API}/api/quiz/results/${id}`, { method: "DELETE" })
    if (res.ok) setResults(prev => prev.filter(r => r.id !== id))
  }

  const handleInlineUpdate = async (id: string, field: EditableField, value: string) => {
    const res = await authFetch(`${API}/api/quiz/results/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    })
    if (res.ok) {
      setResults(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
    }
  }

  const uniqueResults = useMemo(() => {
    const map = new Map<number, MensResult>()
    const noClient: MensResult[] = []
    for (const r of results) {
      if (r.client_id) {
        const existing = map.get(r.client_id)
        if (!existing || new Date(r.created_at) > new Date(existing.created_at)) map.set(r.client_id, r)
      } else { noClient.push(r) }
    }
    return [...map.values(), ...noClient]
  }, [results])

  const metrics = useMemo(() => {
    if (uniqueResults.length === 0) return { total: 0, avgScore: 0, topLevel: "—", topUtm: "—" }
    const total = uniqueResults.length
    const withScore = uniqueResults.filter(r => r.score != null || r.total_score != null)
    const scores = withScore.map(r => r.score ?? r.total_score ?? 0)
    const avgScore = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0
    const levelCounts: Record<string, number> = {}
    uniqueResults.forEach(r => { const l = r.level || r.diagnosis; if (l) levelCounts[l] = (levelCounts[l] || 0) + 1 })
    const topLevel = Object.entries(levelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"
    const utmCounts: Record<string, number> = {}
    uniqueResults.forEach(r => { const src = r.utm_source || "direct"; utmCounts[src] = (utmCounts[src] || 0) + 1 })
    const topUtm = Object.entries(utmCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"
    return { total, avgScore, topLevel, topUtm }
  }, [uniqueResults])

  // Level data for pie chart
  const levelData = useMemo(() => {
    const counts: Record<string, number> = {}
    uniqueResults.forEach(r => { const l = r.level || r.diagnosis; if (l) counts[l] = (counts[l] || 0) + 1 })
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  }, [uniqueResults])

  const utmOptions = useMemo(() => {
    const set = new Set<string>()
    results.forEach(r => { if (r.utm_source) set.add(r.utm_source) })
    return Array.from(set).sort()
  }, [results])

  const handleFilterChange = () => {
    setVisibleCount(PAGE_SIZE)
  }

  const filtered = useMemo(() => {
    return results.filter(r => {
      const matchSearch = !search ||
        (r.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.telegram_username || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.telegram_id || "").toLowerCase().includes(search.toLowerCase())
      const matchUtm = utmFilter === "all" || r.utm_source === utmFilter
      let matchDate = true
      if (dateFrom) matchDate = matchDate && new Date(r.created_at) >= new Date(dateFrom)
      if (dateTo) {
        const end = new Date(dateTo)
        end.setHours(23, 59, 59, 999)
        matchDate = matchDate && new Date(r.created_at) <= end
      }
      return matchSearch && matchUtm && matchDate
    })
  }, [results, search, utmFilter, dateFrom, dateTo])

  const utmBreakdown = useMemo(() => {
    const map = new Map<string, { total: number; completed: number; assistant: number }>()
    results.forEach(r => {
      const src = r.utm_source || "direct"
      const cur = map.get(src) || { total: 0, completed: 0, assistant: 0 }
      cur.total++
      if (r.score != null) cur.completed++
      if (r.contact || r.phone) cur.assistant++
      map.set(src, cur)
    })
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total)
  }, [results])

  const totalSafe = Math.max(stats?.total || metrics.total, 1)
  const completedSafe = Math.max(stats?.completed || metrics.total, 1)

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="analytics">Аналитика</TabsTrigger>
          <TabsTrigger value="marketing">Маркетинг</TabsTrigger>
          <TabsTrigger value="table">Таблица результатов</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-6">
          {!loading && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-400">Всего участников</CardTitle>
                  <Users className="h-4 w-4 text-zinc-500" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-white">{metrics.total}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-400">Средний балл</CardTitle>
                  <TrendingUp className="h-4 w-4 text-zinc-500" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-white">{stats?.avg_score ?? metrics.avgScore}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-400">Прошли тест</CardTitle>
                  <BarChart3 className="h-4 w-4 text-zinc-500" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-blue-400">{stats?.completed ?? metrics.total}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-400">Топ уровень</CardTitle>
                  <Globe className="h-4 w-4 text-zinc-500" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-white truncate">{metrics.topLevel}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {!loading && levelData.length > 0 && <LevelPieChart levels={levelData} />}
          {!loading && <QuestionBreakdownChart results={uniqueResults} />}

          {!loading && results.length === 0 && (
            <div className="text-center py-12 text-zinc-500">Данных пока нет</div>
          )}
        </TabsContent>

        <TabsContent value="marketing" className="space-y-4">
          {/* Funnel cards — воронка */}
          {!loading && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">Всего пользователей</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className="text-3xl font-bold" style={{ color: "#D4AF37" }}>{stats?.total ?? metrics.total}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">Прошли тест</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className="text-3xl font-bold text-blue-400">{stats?.completed ?? metrics.total} <span className="text-sm text-zinc-500">{pct(stats?.completed ?? metrics.total, totalSafe)}</span></p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">🎥 Видео #1</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className="text-3xl font-bold" style={{ color: "#c084fc" }}>{stats?.video1 ?? 0} <span className="text-sm text-zinc-500">({stats?.video1_pct ?? 0}%)</span></p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">🎥 Видео #2</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className="text-3xl font-bold" style={{ color: "#f472b6" }}>{stats?.video2 ?? 0} <span className="text-sm text-zinc-500">({stats?.video2_pct ?? 0}%)</span></p>
                  </CardContent>
                </Card>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">💰 Покупка Чит-кода</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className="text-3xl font-bold" style={{ color: "#D4AF37" }}>{stats?.purchase_intent ?? 0} <span className="text-sm text-zinc-500">({stats?.purchase_pct ?? 0}%)</span></p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">📞 Заявка на созвон</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className="text-3xl font-bold text-blue-400">{stats?.call_intent ?? 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">Расширенные результаты</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className="text-3xl font-bold text-purple-400">{stats?.expanded ?? 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">Записались</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className="text-3xl font-bold" style={{ color: "#8B0000" }}>{stats?.booked ?? 0} <span className="text-sm text-zinc-500">({stats?.conversion_pct ?? 0}%)</span></p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* UTM-таблица */}
          {!loading && utmBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-medium text-zinc-500 flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-zinc-500" /> Топ источников трафика
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: "#D4AF37" }}>Источник</th>
                        <th className="px-3 py-2 text-center text-xs font-medium" style={{ color: "#D4AF37" }}>Всего</th>
                        <th className="px-3 py-2 text-center text-xs font-medium" style={{ color: "#D4AF37" }}>Прошли</th>
                        <th className="px-3 py-2 text-center text-xs font-medium" style={{ color: "#D4AF37" }}>🎥 Видео 1</th>
                        <th className="px-3 py-2 text-center text-xs font-medium" style={{ color: "#D4AF37" }}>🎥 Видео 2</th>
                        <th className="px-3 py-2 text-center text-xs font-medium" style={{ color: "#D4AF37" }}>💰 Покупка</th>
                        <th className="px-3 py-2 text-center text-xs font-medium" style={{ color: "#D4AF37" }}>📞 Созвон</th>
                        <th className="px-3 py-2 text-center text-xs font-medium" style={{ color: "#D4AF37" }}>Конверсия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {utmBreakdown.map(([source, st]) => {
                        const conv = st.total > 0 ? ((stats?.purchase_intent ?? 0) + (stats?.call_intent ?? 0)) / st.total * 100 : 0
                        const convColor = conv >= 10 ? "text-green-400" : conv >= 5 ? "text-yellow-400" : "text-red-400"
                        const bgColor = conv >= 10 ? "bg-green-600/20" : conv >= 5 ? "bg-yellow-600/20" : "bg-red-600/20"
                        return (
                          <tr
                            key={source}
                            onClick={() => { setUtmFilter(source); setTab("table"); setVisibleCount(PAGE_SIZE) }}
                            className="border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                          >
                            <td className="px-3 py-2 font-semibold" style={{ color: "#D4AF37" }}>{source === "direct" ? "Прямой заход" : source}</td>
                            <td className="px-3 py-2 text-center text-white">{st.total}</td>
                            <td className="px-3 py-2 text-center">
                              <span className="text-blue-400">{st.completed}</span>
                              <span className="text-zinc-500 text-xs ml-1">({st.total > 0 ? Math.round(st.completed / st.total * 100) : 0}%)</span>
                            </td>
                            <td className="px-3 py-2 text-center" style={{ color: "#c084fc" }}>{stats?.video1 ?? 0}</td>
                            <td className="px-3 py-2 text-center" style={{ color: "#f472b6" }}>{stats?.video2 ?? 0}</td>
                            <td className="px-3 py-2 text-center font-semibold" style={{ color: "#D4AF37" }}>{stats?.purchase_intent ?? 0}</td>
                            <td className="px-3 py-2 text-center text-blue-400">{stats?.call_intent ?? 0}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${bgColor} ${convColor}`}>
                                {conv.toFixed(0)}%
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="table" className="space-y-4">
          {/* Фильтры */}
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input placeholder="Поиск по имени, нику или ID..." value={search} onChange={e => { setSearch(e.target.value); handleFilterChange() }} className="pl-9 h-10 text-sm" />
            </div>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); handleFilterChange() }}
              className="h-10 px-3 rounded-md border border-zinc-800 bg-zinc-900 text-sm text-zinc-300 w-[150px]" />
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); handleFilterChange() }}
              className="h-10 px-3 rounded-md border border-zinc-800 bg-zinc-900 text-sm text-zinc-300 w-[150px]" />
            <Select value={utmFilter} onValueChange={v => { setUtmFilter(v); handleFilterChange() }}>
              <SelectTrigger className="w-[160px] h-10 text-xs">
                <SelectValue placeholder="UTM Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все источники</SelectItem>
                {utmOptions.map(utm => <SelectItem key={utm} value={utm}>{utm}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="text-[10px] text-zinc-500 flex items-center gap-1">
            <Search className="h-3 w-3" />
            Показано {Math.min(visibleCount, filtered.length)} из {filtered.length} записей
          </div>

          {/* Таблица результатов */}
          <div className="bg-card rounded-xl border border-zinc-800 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-zinc-400 text-xs">Дата</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Имя</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Telegram</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Контакт</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Баллы</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Уровень</TableHead>
                  <TableHead className="text-zinc-400 text-xs">UTM</TableHead>
                  <TableHead className="text-right text-zinc-400 text-xs">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-zinc-500 py-8 text-sm">Нет данных</TableCell>
                  </TableRow>
                ) : (
                  filtered.slice(0, visibleCount).map(r => {
                    const tgLink = r.telegram_username ? `https://t.me/${r.telegram_username}` : null
                    const score = r.score ?? r.total_score
                    return (
                      <TableRow key={r.id} className="text-sm">
                        <TableCell className="whitespace-nowrap text-zinc-400 py-2.5 px-3">
                          {new Date(r.created_at).toLocaleDateString("ru-RU")}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 min-w-[80px]">
                          <EditableCell value={r.name} field="name" rowId={r.id} onSave={handleInlineUpdate} />
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            {tgLink ? (
                              <a href={tgLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline shrink-0" title="Открыть чат">
                                <ExternalLink size={13} />
                              </a>
                            ) : null}
                            <EditableCell
                              value={r.telegram_username || r.telegram_id}
                              field="telegram_username"
                              rowId={r.id}
                              onSave={handleInlineUpdate}
                              renderDisplay={(v) => v ? <span className="text-primary text-sm truncate max-w-[120px]">@{v}</span> : <span className="text-zinc-600">—</span>}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          <EditableCell value={r.contact || r.phone} field="contact" rowId={r.id} onSave={handleInlineUpdate} />
                        </TableCell>
                        <TableCell className="py-2.5 px-3 font-semibold text-white">{score != null ? `${score}/10` : "—"}</TableCell>
                        <TableCell className="py-2.5 px-3">
                          <span className="text-zinc-300">{r.level || r.diagnosis || "—"}</span>
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          <EditableCell value={r.utm_source} field="utm_source" rowId={r.id} onSave={handleInlineUpdate} />
                        </TableCell>
                        <TableCell className="text-right py-2.5 px-3">
                          <div className="flex items-center justify-end gap-1">
                            {r.client_id ? (
                              <button onClick={() => window.dispatchEvent(new CustomEvent('open-client', { detail: r.client_id }))}
                                className="p-1.5 rounded hover:bg-purple-500/20 text-zinc-500 hover:text-purple-400 transition-colors" title="Карточка клиента">
                                <UserCircle size={14} />
                              </button>
                            ) : null}
                            <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded hover:bg-destructive/10 text-zinc-500 hover:text-red-400 transition-colors" title="Удалить">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {filtered.length > visibleCount && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setVisibleCount(p => p + PAGE_SIZE)}
                className="px-6 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Показать ещё ({filtered.length - visibleCount} записей)
              </button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
