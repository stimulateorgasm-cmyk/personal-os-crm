import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Users, TrendingUp, BarChart3, Globe, Search, Pencil, Trash2, FileDown, ExternalLink, UserCircle } from "lucide-react"
import { cn, formatDateTime, displayNick } from "@/lib/utils"
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts"
import { downloadFemalePdf } from "@/lib/pdfGenerator"

const API = ""

interface FemaleResult {
  id: string
  client_id: number | null
  created_at: string
  name: string | null
  telegram_id: string | null
  telegram_username: string | null
  phone: string | null
  age: number | null
  freedom_score: number
  sexuality_score: number
  total_score: number
  diagnosis: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  answers: Record<string, string> | null
}

type EditableField = "name" | "telegram_username" | "phone" | "age" | "freedom_score" | "sexuality_score" | "utm_source"

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(220, 70%, 55%)",
  "hsl(340, 65%, 50%)",
  "hsl(160, 55%, 45%)",
  "hsl(40, 80%, 55%)",
  "hsl(270, 55%, 55%)",
  "hsl(190, 60%, 45%)",
]

const STACKED_COLORS = ["#dc2626", "#f97316", "#86efac", "#22c55e"]

// Уникальные подписи ответов для каждого из 25 вопросов (индекс = номер вопроса - 1)
// Каждый массив: [value="1", value="2", value="3", value="4"]
const QUESTION_OPTIONS: [string, string, string, string][] = [
  ["Да, не комфортно", "Скорее да", "Скорее нет", "Нет, комфортно"],
  ["Да, переживаю", "Часто переживаю", "Иногда", "Нет, не переживаю"],
  ["Нет, не получается", "Редко", "Часто", "Да, всегда"],
  ["Да, боюсь", "Скорее боюсь", "Скорее нет", "Нет, не боюсь"],
  ["Да, боюсь", "Скорее боюсь", "Скорее нет", "Нет, не боюсь"],
  ["Да, стыдно", "Скорее стыдно", "Скорее нет", "Нет, не стыдно"],
  ["Да, неприятны", "Скорее да", "Скорее нет", "Нет, приятны"],
  ["Да, переживаю", "Часто", "Иногда", "Нет"],
  ["Да, неприятны", "Скорее да", "Скорее нет", "Нет"],
  ["Да, боюсь", "Скорее боюсь", "Скорее нет", "Нет, не боюсь"],
  ["Да, тяжело", "Скорее да", "Скорее нет", "Нет, легко"],
  ["Никогда", "Редко", "Часто", "Всегда"],
  ["Да, стыжусь", "Часто", "Иногда", "Нет"],
  ["Да, виню", "Скорее да", "Скорее нет", "Нет"],
  ["Да, тревожусь", "Часто", "Иногда", "Нет"],
  ["Да, зависит", "Сильно зависит", "Иногда", "Нет"],
  ["Да, боюсь", "Часто", "Иногда", "Нет"],
  ["Да, зависима", "Скорее да", "Скорее нет", "Нет, независима"],
  ["Да, есть опыт", "Был давно", "Незначительный", "Нет"],
  ["Да, дискомфорт", "Часто", "Иногда", "Нет"],
  ["Да, боюсь", "Часто", "Иногда", "Нет"],
  ["Да, боюсь", "Часто", "Иногда", "Нет"],
  ["Да, тревожусь", "Часто", "Иногда", "Нет"],
  ["Да, стремлюсь", "Часто", "Иногда", "Нет"],
  ["Очень дискомфортно", "Дискомфортно", "Нормально", "Легко"],
]

const FEMALE_QUESTIONS = [
  "Мне не комфортно быть голой на глазах у мужчины в контексте секса",
  "Во время секса я переживаю, что мужчине не нравится что-то в моей внешности",
  "У меня получается расслабиться и «отключить голову» в сексе",
  "Во время секса я переживаю, что мужчина сделает что-то неприятное для меня",
  "Во время секса я переживаю, что мужчина скажет мне что-то неприятное",
  "Мне стыдно мастурбировать, ласкать себя при партнёре",
  "Мне неприятны прикосновения партнёра, когда я возбуждена",
  "Я переживаю, что я недостаточно возбуждена / недостаточно мокрая",
  "Мне неприятны прикосновения партнёра в моём спокойном состоянии",
  "Я переживаю, когда говорю о сексе, рассказываю о желаниях",
  "Во время секса мне тяжело стонать и издавать звуки",
  "Во время секса с мужчиной я получаю оргазм",
  "После секса я стесняюсь или осуждаю себя",
  "Я ругаю себя за желание секса с кем-то кроме своего партнёра",
  "Во время секса я переживаю, что у меня не получится прийти к оргазму",
  "Моё настроение сильно меняется от слов или действий партнёра",
  "Я переживаю о расставании / разводе / потере отношений",
  "Я финансово зависима от своего партнёра",
  "У меня есть опыт болезненного разрыва отношений",
  "Я чувствую дискомфорт, когда вспоминаю бывшего партнёра",
  "Я боюсь, что у меня что-то не получится. Боюсь ошибки",
  "Я переживаю, что мужчина обманет меня или изменит",
  "Когда партнёр не отвечает сразу, я переживаю",
  "Я стремлюсь быть хорошей, правильной, удобной для мужчины",
  "Для меня дискомфортно подойти к незнакомому парню",
]

function getFemaleDiagnosis(freedomScore: number, sexualityScore: number): string {
  let sexualityTitle: string
  if (sexualityScore <= 18) sexualityTitle = "Закрытая на сто замков"
  else if (sexualityScore <= 37) sexualityTitle = "Крепость из сомнений"
  else if (sexualityScore <= 55) sexualityTitle = "Соблазнительница с ручником"
  else sexualityTitle = "Львица-тигрица-анаконда"

  let freedomTitle: string
  if (freedomScore <= 11) freedomTitle = "Дёрганная жопа"
  else if (freedomScore <= 23) freedomTitle = "Профессиональная Мученица"
  else if (freedomScore <= 37) freedomTitle = "Мастер драмы"
  else freedomTitle = "Главная по спокойствию"

  return `${sexualityTitle} + ${freedomTitle}`
}

function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("crm_token")
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (token) headers["Authorization"] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

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

// ─── Pie Chart с кастомным темным тултипом ──────────────────────────
function DiagnosisPieChart({ data, total }: { data: { name: string; value: number }[]; total: number }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null
    const d = payload[0].payload
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-lg text-sm">
        <p className="font-medium text-white mb-1">{d.name}</p>
        <p className="text-zinc-400">{d.value} чел. ({Math.round((d.value / total) * 100)}%)</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row items-center gap-6">
      <div className="w-full max-w-[300px] h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%" cy="50%"
              outerRadius={120} innerRadius={60}
              activeIndex={activeIndex ?? undefined}
              activeShape={{ outerRadius: 125, innerRadius: 60 }}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}
                  opacity={activeIndex !== null && activeIndex !== i ? 0.4 : 1}
                  stroke="transparent"
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-2 w-full">
        {data.map((d, i) => {
          const isHighlighted = activeIndex === null || activeIndex === i
          return (
            <div
              key={d.name}
              className={`flex items-center gap-2 text-sm transition-opacity ${isHighlighted ? "opacity-100" : "opacity-40"}`}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="truncate flex-1 text-white">{d.name}</span>
              <span className="font-semibold shrink-0 text-white">{d.value}</span>
              <span className="text-zinc-400 shrink-0">({Math.round((d.value / total) * 100)}%)</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Stacked BarChart с реальными формулировками и интерактивностью ──
function QuestionsBreakdownChart({ results }: { results: FemaleResult[] }) {
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
          <p className="text-zinc-500 text-sm py-8 text-center">Данные появятся с новых прохождений теста</p>
        </CardContent>
      </Card>
    )
  }

  const questionStats = FEMALE_QUESTIONS.map((text, qi) => {
    const qId = `question_${qi + 1}`
    const counts = { v1: 0, v2: 0, v3: 0, v4: 0 }
    withAnswers.forEach(r => {
      const val = r.answers?.[qId]
      if (val === "1") counts.v1++
      else if (val === "2") counts.v2++
      else if (val === "3") counts.v3++
      else if (val === "4") counts.v4++
    })
    const pct1 = Math.round((counts.v1 / total) * 100)
    const pct2 = Math.round((counts.v2 / total) * 100)
    const pct3 = Math.round((counts.v3 / total) * 100)
    const pct4 = Math.round((counts.v4 / total) * 100)
    const options = QUESTION_OPTIONS[qi] || ["1", "2", "3", "4"]
    return {
      shortText: text.length > 45 ? text.slice(0, 42) + "..." : text,
      text, pct1, pct2, pct3, pct4,
      cnt1: counts.v1, cnt2: counts.v2, cnt3: counts.v3, cnt4: counts.v4,
      total, options,
    }
  })

  questionStats.sort((a, b) => (b.pct1 + b.pct2) - (a.pct1 + a.pct2))

  const renderLabels = (d: typeof questionStats[number]) => [
    { key: "pct1", cnt: "cnt1", val: "1", color: STACKED_COLORS[0], label: d.options[0] },
    { key: "pct2", cnt: "cnt2", val: "2", color: STACKED_COLORS[1], label: d.options[1] },
    { key: "pct3", cnt: "cnt3", val: "3", color: STACKED_COLORS[2], label: d.options[2] },
    { key: "pct4", cnt: "cnt4", val: "4", color: STACKED_COLORS[3], label: d.options[3] },
  ]

  const segments = renderLabels(questionStats[0] || questionStats[0])

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    const labels = renderLabels(d)
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-md text-sm max-w-[380px]">
        <p className="font-medium text-white mb-2">{d.text}</p>
        <div className="space-y-1">
          {labels.map(s => {
            const count = d[s.cnt] as number
            const pct = d[s.key] as number
            const isActive = activeCell?.key === s.key && activeCell?.index === payload[0].payloadIndex
            return (
              <div key={s.val} className={`flex items-center gap-2 ${isActive ? "text-white font-medium" : "text-zinc-400"}`}>
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
          <span className="ml-2 text-xs text-zinc-600">(из {total} анкет, сортировка по % проблемных)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: Math.max(500, questionStats.length * 38) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={questionStats} layout="vertical" margin={{ left: 10, right: 70 }} barSize={20}>
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="#52525b" tick={{ fill: "#a1a1aa" }} />
              <YAxis type="category" dataKey="shortText" width={230} tick={{ fontSize: 11, fill: "#d4d4d8" }} interval={0} />
              <Tooltip content={<CustomTooltip />} />
              {segments.map(s => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  stackId="a"
                  fill={s.color}
                  name={s.label}
                  onMouseEnter={(_, index) => setActiveCell({ key: s.key, index })}
                  onMouseLeave={() => setActiveCell(null)}
                >
                  {questionStats.map((_, qi) => {
                    const isActive = activeCell?.key === s.key && activeCell?.index === qi
                    const anyActive = activeCell !== null
                    return (
                      <Cell
                        key={qi}
                        fill={s.color}
                        opacity={anyActive ? (isActive ? 1 : 0.25) : 1}
                        stroke={isActive ? "#fff" : "transparent"}
                        strokeWidth={isActive ? 1 : 0}
                        style={{ transition: "opacity 0.2s ease" }}
                      />
                    )
                  })}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: STACKED_COLORS[0] }} />
            <span>проблемный →</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: STACKED_COLORS[3] }} />
            <span>→ здоровый</span>
          </div>
          <div className="ml-2 text-xs text-zinc-600 italic">наведите на вопрос или полоску</div>
        </div>
      </CardContent>
    </Card>
  )
}

const PAGE_SIZE = 50

export default function FemaleTestDashboard() {
  const [results, setResults] = useState<FemaleResult[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [stageFilter, setStageFilter] = useState<string>("all")
  const [utmFilter, setUtmFilter] = useState<string>("all")
  // Под-таб из URL — синхронизируется при монтировании и изменениях
  const [tab, setTabState] = useState(() => new URLSearchParams(window.location.search).get("sub") || "analytics")
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("sub")
    if (s && s !== tab) setTabState(s)
  }, [window.location.search])
  const setTab = (val: string) => {
    const p = new URLSearchParams(window.location.search)
    p.set("sub", val)
    window.history.replaceState({}, "", "?" + p.toString())
    setTabState(val)
  }
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [events, setEvents] = useState<{ event: string; metadata: any }[]>([])

  const fetchEvents = async () => {
    try {
      const res = await authFetch(`${API}/api/quiz/events?event_filter=CTA_QUICKSTART_CLICKED,CTA_ZHP_CLICKED`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data.items || [])
      }
    } catch {}
  }

  const fetchResults = async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API}/api/quiz/results?test_type=female&limit=10000`)
      if (res.ok) {
        const data = await res.json()
        setResults(data.items || [])
      }
    } catch (e) {
      console.error("Fetch error:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchResults(); fetchEvents() }, [])

  const handleInlineUpdate = useCallback(async (id: string, field: EditableField, value: string) => {
    const res = await authFetch(`${API}/api/quiz/results/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    })
    if (res.ok) {
      setResults(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
    }
  }, [])

  const handleDelete = async (id: string) => {
    if (!window.confirm("Удалить эту запись?")) return
    const res = await authFetch(`${API}/api/quiz/results/${id}`, { method: "DELETE" })
    if (res.ok) setResults(prev => prev.filter(r => r.id !== id))
  }

  const metrics = useMemo(() => {
    if (results.length === 0) return { total: 0, avgFreedom: 0, avgSexuality: 0, topDiag: "—", topDiagPct: 0 }
    const total = results.length
    const avgFreedom = Math.round(results.reduce((s, r) => s + r.freedom_score, 0) / total)
    const avgSexuality = Math.round(results.reduce((s, r) => s + r.sexuality_score, 0) / total)
    // Проблемы с оргазмом: question_12 = 1 (Никогда) или 2 (Редко/Иногда)
    let orgasmProblems = 0
    results.forEach(r => {
      if (r.answers) {
        const v = r.answers["question_12"] || r.answers["12"]
        if (v === "1" || v === "2") orgasmProblems++
      }
    })
    return { total, avgFreedom, avgSexuality, orgasmProblems }
  }, [results])

  const diagnosisData = useMemo(() => {
    const counts: Record<string, number> = {}
    results.forEach(r => { if (r.diagnosis) counts[r.diagnosis] = (counts[r.diagnosis] || 0) + 1 })
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [results])

  const totalWithDiagnosis = results.filter(r => r.diagnosis).length

  const assistantMap = useMemo(() => {
    const set = new Set<string>()
    events.forEach(e => {
      const meta = typeof e.metadata === "string" ? JSON.parse(e.metadata) : e.metadata
      if (meta.telegram_id) set.add(meta.telegram_id)
      if (meta.telegram_username) set.add(meta.telegram_username)
    })
    return set
  }, [events])

  const utmBreakdown = useMemo(() => {
    const map = new Map<string, { total: number; completed: number; assistant: number }>()
    results.forEach(r => {
      const src = r.utm_source || "direct"
      const cur = map.get(src) || { total: 0, completed: 0, assistant: 0 }
      cur.total++
      if (r.total_score > 0) cur.completed++
      if (assistantMap.has(r.telegram_id) || assistantMap.has(r.telegram_username)) cur.assistant++
      map.set(src, cur)
    })
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total)
  }, [results, assistantMap])

  // Use only last submission per client_id for stats (avoids double-counting)
  const uniqueResults = useMemo(() => {
    const map = new Map<number, FemaleResult>()
    // Also track entries without client_id
    const noClient: FemaleResult[] = []
    for (const r of results) {
      if (r.client_id) {
        const existing = map.get(r.client_id)
        if (!existing || new Date(r.created_at) > new Date(existing.created_at)) {
          map.set(r.client_id, r)
        }
      } else {
        noClient.push(r)
      }
    }
    return [...map.values(), ...noClient]
  }, [results])

  const utmOptions = useMemo(() => {
    const set = new Set<string>()
    results.forEach(r => { if (r.utm_source) set.add(r.utm_source) })
    return Array.from(set).sort()
  }, [results])

  // Stage counters for filter buttons
  const stageCounts = useMemo(() => {
    const total = uniqueResults.length
    const started = uniqueResults.filter(r => {
      const hasAns = r.answers && Object.keys(typeof r.answers === "string" ? JSON.parse(r.answers) : r.answers).length > 0
      return hasAns || (r.total_score > 0) || (r.diagnosis && r.diagnosis !== "")
    }).length
    const completed = uniqueResults.filter(r => (r.total_score > 0) || (r.diagnosis && r.diagnosis !== "")).length
    const booked = uniqueResults.filter(r => assistantMap.has(r.telegram_id) || assistantMap.has(r.telegram_username)).length
    const notStarted = total - started
    const opened = started - completed
    return { total, notStarted, started, opened, completed, booked }
  }, [uniqueResults, assistantMap])

  const filtered = useMemo(() => {
    let f = results
    // Stage filter
    if (stageFilter === "not_started") {
      f = f.filter(r => {
        const hasAns = r.answers && Object.keys(typeof r.answers === "string" ? JSON.parse(r.answers) : r.answers).length > 0
        return !(hasAns || (r.total_score > 0) || (r.diagnosis && r.diagnosis !== ""))
      })
    } else if (stageFilter === "opened") {
      f = f.filter(r => {
        const hasAns = r.answers && Object.keys(typeof r.answers === "string" ? JSON.parse(r.answers) : r.answers).length > 0
        return (hasAns || (r.total_score > 0) || (r.diagnosis && r.diagnosis !== ""))
          && !((r.total_score > 0) || (r.diagnosis && r.diagnosis !== ""))
      })
    } else if (stageFilter === "completed") {
      f = f.filter(r => (r.total_score > 0) || (r.diagnosis && r.diagnosis !== ""))
    } else if (stageFilter === "booked") {
      f = f.filter(r => assistantMap.has(r.telegram_id) || assistantMap.has(r.telegram_username))
    }
    // Date filter
    if (dateFrom) {
      f = f.filter(r => r.created_at && r.created_at >= dateFrom)
    }
    if (dateTo) {
      f = f.filter(r => r.created_at && r.created_at <= dateTo + "T23:59:59")
    }
    // Search + UTM
    f = f.filter(r => {
      const matchSearch = !search ||
        (r.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.telegram_username || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.telegram_id || "").toLowerCase().includes(search.toLowerCase())
      const matchUtm = utmFilter === "all" || r.utm_source === utmFilter
      return matchSearch && matchUtm
    })
    return f
  }, [results, search, utmFilter, dateFrom, dateTo])

  // Paginated slice
  const paginatedResults = useMemo(() => {
    return filtered.slice(0, visibleCount)
  }, [filtered, visibleCount])

  const hasMore = visibleCount < filtered.length

  // Funnel: use unique results to avoid double-counting
  const funnelMetrics = useMemo(() => {
    const total = uniqueResults.length  // Всего уникальных юзеров
    // Начали: те, у кого есть ответы ИЛИ есть финальный балл/диагноз (= все, кто дошёл хотя бы до 1 вопроса)
    const started = uniqueResults.filter(r => {
      const hasAns = r.answers && Object.keys(typeof r.answers === "string" ? JSON.parse(r.answers) : r.answers).length > 0
      return hasAns || (r.total_score > 0) || (r.diagnosis && r.diagnosis !== "")
    }).length
    // Прошли до конца: есть итоговый балл ИЛИ диагноз
    const completed = uniqueResults.filter(r => (r.total_score > 0) || (r.diagnosis && r.diagnosis !== "")).length
    const extended = uniqueResults.filter(r => {
      return r.freedom_score > 0 || r.sexuality_score > 0
    }).length
    const assistant = uniqueResults.filter(r => assistantMap.has(r.telegram_id) || assistantMap.has(r.telegram_username)).length
    return { total, started, completed, extended, assistant }
  }, [uniqueResults])

  return (
    <div className="space-y-6">
      {/* Табы: Аналитика / Таблица результатов */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="analytics">Аналитика</TabsTrigger>
          <TabsTrigger value="marketing">Маркетинг</TabsTrigger>
          <TabsTrigger value="table">Таблица результатов</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-6">
          {/* Score metrics — только для аналитики */}
          {!loading && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-400">Участников</CardTitle>
                  <Users className="h-4 w-4 text-zinc-500" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-white">{metrics.total}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-400">Ср. Свобода</CardTitle>
                  <TrendingUp className="h-4 w-4 text-zinc-500" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-white">{metrics.avgFreedom}/40</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-400">Ср. Раскрепощённость</CardTitle>
                  <BarChart3 className="h-4 w-4 text-zinc-500" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-white">{metrics.avgSexuality}/60</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-400">Проблемы с оргазмом</CardTitle>
                  <BarChart3 className="h-4 w-4 text-zinc-500" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-white">{metrics.orgasmProblems}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{metrics.total ? Math.round(metrics.orgasmProblems / metrics.total * 100) : 0}% участниц</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Pie chart */}
          {!loading && diagnosisData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Распределение по диагнозам</CardTitle>
              </CardHeader>
              <CardContent>
                <DiagnosisPieChart data={diagnosisData} total={totalWithDiagnosis} />
              </CardContent>
            </Card>
          )}

          {/* Bar chart — используем uniqueResults для точной статистики */}
          {!loading && <QuestionsBreakdownChart results={uniqueResults} />}

          {!loading && results.length === 0 && (
            <div className="text-center py-12 text-zinc-500">Данных пока нет</div>
          )}
        </TabsContent>

        <TabsContent value="marketing" className="space-y-4">
          {/* Воронка */}
          {!loading && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">Открыли бот</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className="text-3xl font-bold text-zinc-300">{funnelMetrics.total}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">Начали тест</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className="text-3xl font-bold text-blue-400">{funnelMetrics.started} <span className="text-sm text-zinc-500">{funnelMetrics.total > 0 ? `(${Math.round(funnelMetrics.started / funnelMetrics.total * 100)}%)` : ""}</span></p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">Прошли тест до конца</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className="text-3xl font-bold text-emerald-400">{funnelMetrics.completed} <span className="text-sm text-zinc-500">{funnelMetrics.total > 0 ? `(${Math.round(funnelMetrics.completed / funnelMetrics.total * 100)}%)` : ""}</span></p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">Открыли расширенные результаты</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className="text-3xl font-bold" style={{ color: "#c084fc" }}>{funnelMetrics.extended} <span className="text-sm text-zinc-500">{funnelMetrics.completed > 0 ? `(${Math.round(funnelMetrics.extended / funnelMetrics.completed * 100)}%)` : ""}</span></p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">Посмотрели Видео 1</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className="text-3xl font-bold" style={{ color: "#f472b6" }}>—</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">Посмотрели Видео 2</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className="text-3xl font-bold" style={{ color: "#f472b6" }}>—</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">Перешли к Ассистенту</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className="text-3xl font-bold" style={{ color: "#8B0000" }}>{funnelMetrics.assistant} <span className="text-sm text-zinc-500">{funnelMetrics.completed > 0 ? `(${Math.round(funnelMetrics.assistant / funnelMetrics.completed * 100)}%)` : ""}</span></p>
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
                        <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Источник</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-zinc-500">Всего</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-zinc-500">Прошли</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-zinc-500">Заявка</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-zinc-500">Конверсия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {utmBreakdown.map(([source, st]) => {
                        const conv = st.total > 0 ? (st.completed / st.total) * 100 : 0
                        const convColor = conv >= 80 ? "text-green-400" : conv >= 50 ? "text-yellow-400" : "text-red-400"
                        const bgColor = conv >= 80 ? "bg-green-600/20" : conv >= 50 ? "bg-yellow-600/20" : "bg-red-600/20"
                        return (
                          <tr
                            key={source}
                            onClick={() => { setUtmFilter(source); setTab("table") }}
                            className="border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                          >
                            <td className="px-3 py-2 font-medium text-zinc-300">{source === "direct" ? "Прямой заход" : source}</td>
                            <td className="px-3 py-2 text-center text-white">{st.total}</td>
                            <td className="px-3 py-2 text-center">
                              <span className="text-blue-400">{st.completed}</span>
                              <span className="text-zinc-500 text-xs ml-1">({st.total > 0 ? Math.round(st.completed / st.total * 100) : 0}%)</span>
                            </td>
                            <td className="px-3 py-2 text-center" style={{ color: "#8B0000" }}>{st.assistant}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${bgColor} ${convColor}`}>
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
          {/* Stage filter buttons */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: "all", label: "Все", count: stageCounts.total },
              { key: "not_started", label: "Не начали", count: stageCounts.notStarted },
              { key: "opened", label: "В процессе", count: stageCounts.opened },
              { key: "completed", label: "Прошли", count: stageCounts.completed },
              { key: "booked", label: "Записались", count: stageCounts.booked },
            ].map(st => (
              <button key={st.key} onClick={() => { setStageFilter(st.key); setVisibleCount(PAGE_SIZE) }}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full transition-colors",
                  stageFilter === st.key
                    ? "bg-zinc-200 text-zinc-900 font-medium"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                )}
              >
                {st.label} <span className="opacity-60">({st.count})</span>
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <Input placeholder="Поиск по имени или Telegram..." value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE) }} className="pl-9 h-9 text-sm" />
            </div>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setVisibleCount(PAGE_SIZE) }} className="h-9 px-3 rounded-md border border-zinc-800 bg-zinc-900 text-sm text-zinc-300 w-[150px]" />
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setVisibleCount(PAGE_SIZE) }} className="h-9 px-3 rounded-md border border-zinc-800 bg-zinc-900 text-sm text-zinc-300 w-[150px]" />
            <Select value={utmFilter} onValueChange={v => { setUtmFilter(v); setVisibleCount(PAGE_SIZE) }}>
              <SelectTrigger className="w-[160px] h-9 text-xs">
                <SelectValue placeholder="UTM Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все источники</SelectItem>
                {utmOptions.map(utm => <SelectItem key={utm} value={utm}>{utm}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <p className="text-[10px] text-zinc-500 flex items-center gap-1">
            <Pencil size={10} /> Показано {Math.min(visibleCount, filtered.length)} из {filtered.length} записей
          </p>

          <div className="bg-card rounded-xl border border-zinc-800 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                    <TableHead className="w-auto whitespace-nowrap text-zinc-400 text-xs">Дата</TableHead>
                    <TableHead className="w-auto text-zinc-400 text-xs">Имя</TableHead>
                    <TableHead className="w-auto text-zinc-400 text-xs">Telegram</TableHead>
                    <TableHead className="w-auto text-zinc-400 text-xs">Телефон</TableHead>
                    <TableHead className="w-auto text-right text-zinc-400 text-xs whitespace-nowrap">Возраст</TableHead>
                    <TableHead className="w-auto text-right text-zinc-400 text-xs">Своб.</TableHead>
                    <TableHead className="w-auto text-right text-zinc-400 text-xs">Раскр.</TableHead>
                    <TableHead className="w-auto text-zinc-400 text-xs max-w-[200px]">Диагноз</TableHead>
                    <TableHead className="w-auto text-zinc-400 text-xs">UTM</TableHead>
                    <TableHead className="w-auto text-right text-zinc-400 text-xs">Действия</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-zinc-500 py-8 text-sm">Нет данных</TableCell>
                  </TableRow>
                ) : (
                  paginatedResults.map(r => (
                    <TableRow key={r.id} className="text-sm">
                      <TableCell className="whitespace-nowrap text-zinc-400 py-2.5 px-3">
                        {formatDateTime(r.created_at)}
                      </TableCell>
                      <TableCell className="py-2.5 px-3">
                        <EditableCell value={r.name} field="name" rowId={r.id} onSave={handleInlineUpdate} />
                      </TableCell>
                      <TableCell className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          {r.telegram_username ? (
                            <a href={`https://t.me/${r.telegram_username}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline shrink-0" title="Открыть чат">
                              <ExternalLink size={13} />
                            </a>
                          ) : null}
                          <EditableCell
                            value={r.telegram_username}
                            field="telegram_username"
                            rowId={r.id}
                            onSave={handleInlineUpdate}
                            renderDisplay={(val) => val ? (
                              <span className="text-primary text-sm truncate max-w-[130px]">{displayNick(val)}</span>
                            ) : <span className="text-zinc-600">—</span>}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 px-3">
                        <EditableCell value={r.phone} field="phone" rowId={r.id} onSave={handleInlineUpdate} />
                      </TableCell>
                      <TableCell className="text-right py-2.5 px-3 whitespace-nowrap">
                        <EditableCell value={r.age} field="age" rowId={r.id} type="number" onSave={handleInlineUpdate} />
                      </TableCell>
                      <TableCell className="text-right py-2.5 px-3 text-white">{r.freedom_score}</TableCell>
                      <TableCell className="text-right py-2.5 px-3 text-white">{r.sexuality_score}</TableCell>
                      <TableCell className="py-2.5 px-3 text-sm whitespace-normal break-words text-zinc-400" title={r.diagnosis || ""}>{r.diagnosis || "—"}</TableCell>
                      <TableCell className="py-2.5 px-3">
                        <EditableCell value={r.utm_source} field="utm_source" rowId={r.id} onSave={handleInlineUpdate} />
                      </TableCell>
                      <TableCell className="text-right py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {r.client_id ? (
                            <button onClick={() => window.dispatchEvent(new CustomEvent('open-client', { detail: r.client_id }))} className="p-1.5 rounded hover:bg-purple-500/20 text-zinc-500 hover:text-purple-400 transition-colors" title="Карточка клиента">
                              <UserCircle size={14} />
                            </button>
                          ) : null}
                          <button onClick={() => downloadFemalePdf(r)} className="p-1.5 rounded hover:bg-primary/10 text-zinc-500 hover:text-primary transition-colors" title="PDF-отчёт"><FileDown size={14} /></button>
                          <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded hover:bg-destructive/10 text-zinc-500 hover:text-red-400 transition-colors" title="Удалить"><Trash2 size={14} /></button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {hasMore && (
              <div className="flex justify-center py-4">
                <button onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)} className="px-6 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
                  Показать ещё ({filtered.length - visibleCount} записей)
                </button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
