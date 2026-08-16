import React, { useState } from "react"
import {
  TrendingUp,
  Users,
  DollarSign,
  UserCheck,
  Percent,
  Plus,
  RefreshCw,
  ExternalLink,
  Send,
  Instagram,
  Eye,
  MousePointer,
  Search,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn, formatMoney, formatNumber, getAdStatusStyle } from "@/lib/utils"

// --- Мок-данные ---
const initialOverview = {
  totals: {
    spent: 73009,
    growth: 351,
    leads: 136,
    clients: 57,
    sales: 1998397,
    roi: 1850,
  },
  by_platform: [
    { platform: "telegram", label: "Telegram", spent: 58000, leads: 110, clients: 45, sales: 1600000 },
    { platform: "instagram", label: "Instagram", spent: 15009, leads: 26, clients: 12, sales: 398397 },
  ],
  top_channels: [
    { name: "Записки Марики", spent: 5000, sales: 160000, roi: 3200 },
    { name: "Аморальная штучка", spent: 6500, sales: 120000, roi: 1846 },
    { name: "Suter вещает", spent: 10000, sales: 90000, roi: 900 },
  ],
}

const initialChannels = [
  { id: 1, name: "Секс-афиша Краснодар", category: "Секс", link: "t.me/sexafisha_krd", admin: "@pr_sexafisha", price: 2500, status: "рассматриваю", comment: "Посты без удаления" },
  { id: 2, name: "Записки Марики", category: "Секс", link: "t.me/m_hlopushka", admin: "@m_hlopushka", price: 4500, status: "опубликовано", comment: "Хорошая отдача" },
  { id: 3, name: "Кулагина", category: "ЛОМ", link: "t.me/kulagina_channel", admin: "@kulagina", price: 0, status: "рассматриваю", comment: "Бартерные условия" },
  { id: 4, name: "Альфа прокачка", category: "Пикап", link: "t.me/alpha_prokachka", admin: "@alpha_manager", price: 4000, status: "закупил", comment: "Выход в пятницу" },
  { id: 5, name: "Event KRD", category: "Сообщества", link: "t.me/event_krd", admin: "@krd_events", price: 1800, status: "слив", comment: "Накрученные боты" },
  { id: 6, name: "Эзотерика Сочи", category: "Эзотерика", link: "t.me/ezoterika_sochi", admin: "@ezo_admin", price: 3200, status: "рассматриваю", comment: "Тест аудитории" },
]

const categories = [
  "Все категории",
  "Секс",
  "ЛОМ",
  "Пикап",
  "Бизнес и мужское",
  "Место",
  "Эзотерика",
  "Сообщества",
  "IT",
  "Психология",
]

const channelStatuses = ["Все статусы", "рассматриваю", "закупил", "опубликовано", "слив", "бартер"]

const initialPurchases = [
  { id: 1, date: "2025-12-02", channel: "Записки Марики", platform: "telegram", price: 5000, discount: 500, final_price: 4500, coverage: 604, err: 0.086, cpm: 7450, growth: 70, price_per_sub: 64, status: "оплачено" },
  { id: 2, date: "2025-11-27", channel: "Куда сходить 18+", platform: "telegram", price: 2500, discount: 0, final_price: 2500, coverage: 524, err: 0.102, cpm: 4771, growth: 53, price_per_sub: 47, status: "оплачено" },
  { id: 3, date: "2024-05-06", channel: "Активный Сочи", platform: "telegram", price: 5200, discount: 0, final_price: 5200, coverage: 0, err: 0, cpm: 0, growth: 120, price_per_sub: 43, status: "оплачено" },
  { id: 4, date: "2024-12-06", channel: "Откровения Элинки", platform: "telegram", price: 2500, discount: 0, final_price: 2500, coverage: 0, err: 0, cpm: 0, growth: 0, price_per_sub: 0, status: "забронировано" },
]

const initialTrackedPosts = [
  { id: 1, channel: "ludobreniya", link: "t.me/ludobreniya/4594", views: 47300, subs_gained: 70, clicks: 25, target: "тест", updated: "сегодня 09:00" },
  { id: 2, channel: "potok_ads", link: "t.me/potok_ads/668", views: 6517, subs_gained: 208, clicks: 12, target: "личка", updated: "вчера" },
]

const funnel = [
  { stage: "Показ", value: 100000, desc: "Охват рекламных креативов" },
  { stage: "Целевое действие", value: 2500, desc: "Переход / просмотр лид-магнита" },
  { stage: "Обращение", value: 350, desc: "Заявка / лид в боте или директе" },
  { stage: "Созвон", value: 180, desc: "Диагностическая сессия" },
  { stage: "Оплата", value: 57, desc: "Успешные клиенты с чеком" },
]

export function AdsDashboard() {
  // Tabs State
  const [activeTab, setActiveTab] = useState("overview")

  // Channels state and filters
  const [channelsList, setChannelsList] = useState(initialChannels)
  const [selectedCategory, setSelectedCategory] = useState("Все категории")
  const [selectedStatus, setSelectedStatus] = useState("Все статусы")
  const [searchChannel, setSearchChannel] = useState("")
  const [isAddChannelOpen, setIsAddChannelOpen] = useState(false)
  const [newChannel, setNewChannel] = useState({
    name: "",
    category: "Секс",
    link: "",
    admin: "",
    price: "",
    comment: "",
    status: "рассматриваю",
  })

  // Purchases state and filters
  const [purchasesList, setPurchasesList] = useState(initialPurchases)
  const [purchaseMonthFilter, setPurchaseMonthFilter] = useState("all")
  const [purchasePlatformFilter, setPurchasePlatformFilter] = useState("all")
  const [isAddPurchaseOpen, setIsAddPurchaseOpen] = useState(false)
  const [newPurchase, setNewPurchase] = useState({
    date: new Date().toISOString().split("T")[0],
    channel: "",
    platform: "telegram",
    price: "",
    coverage: "",
    growth: "",
    status: "оплачено",
  })

  // Tracking state
  const [trackedPosts, setTrackedPosts] = useState(initialTrackedPosts)
  const [newPostUrl, setNewPostUrl] = useState("")
  const [isUpdatingTracking, setIsUpdatingTracking] = useState<number | null>(null)

  // Filter channels
  const filteredChannels = channelsList.filter((ch) => {
    const matchesCat = selectedCategory === "Все категории" || ch.category === selectedCategory
    const matchesStatus = selectedStatus === "Все статусы" || ch.status === selectedStatus
    const matchesSearch =
      ch.name.toLowerCase().includes(searchChannel.toLowerCase()) ||
      (ch.admin && ch.admin.toLowerCase().includes(searchChannel.toLowerCase()))
    return matchesCat && matchesStatus && matchesSearch
  })

  // Filter purchases
  const filteredPurchases = purchasesList.filter((p) => {
    const matchesPlatform = purchasePlatformFilter === "all" || p.platform === purchasePlatformFilter
    const matchesMonth =
      purchaseMonthFilter === "all" ||
      (purchaseMonthFilter === "2025-12" && p.date.startsWith("2025-12")) ||
      (purchaseMonthFilter === "2025-11" && p.date.startsWith("2025-11")) ||
      (purchaseMonthFilter === "2024" && p.date.startsWith("2024"))
    return matchesPlatform && matchesMonth
  })

  // Handlers
  const handleAddChannel = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newChannel.name.trim()) return

    const added = {
      id: Date.now(),
      name: newChannel.name,
      category: newChannel.category,
      link: newChannel.link || `t.me/${newChannel.name.toLowerCase().replace(/\s+/g, "_")}`,
      admin: newChannel.admin || "@admin",
      price: Number(newChannel.price) || 0,
      status: newChannel.status,
      comment: newChannel.comment,
    }

    setChannelsList([added, ...channelsList])
    setNewChannel({
      name: "",
      category: "Секс",
      link: "",
      admin: "",
      price: "",
      comment: "",
      status: "рассматриваю",
    })
    setIsAddChannelOpen(false)
  }

  const handleAddPurchase = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPurchase.channel.trim()) return

    const priceNum = Number(newPurchase.price) || 0
    const growthNum = Number(newPurchase.growth) || 0
    const covNum = Number(newPurchase.coverage) || 0
    const pricePerSub = growthNum > 0 ? Math.round(priceNum / growthNum) : 0
    const cpm = covNum > 0 ? Math.round((priceNum / covNum) * 1000) : 0

    const added = {
      id: Date.now(),
      date: newPurchase.date,
      channel: newPurchase.channel,
      platform: newPurchase.platform,
      price: priceNum,
      discount: 0,
      final_price: priceNum,
      coverage: covNum,
      err: covNum > 0 ? 0.095 : 0,
      cpm,
      growth: growthNum,
      price_per_sub: pricePerSub,
      status: newPurchase.status,
    }

    setPurchasesList([added, ...purchasesList])
    setNewPurchase({
      date: new Date().toISOString().split("T")[0],
      channel: "",
      platform: "telegram",
      price: "",
      coverage: "",
      growth: "",
      status: "оплачено",
    })
    setIsAddPurchaseOpen(false)
  }

  const handleAddTrackedPost = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPostUrl.trim()) return

    const channelName = newPostUrl.split("/")[1] || "custom_post"
    const added = {
      id: Date.now(),
      channel: channelName,
      link: newPostUrl,
      views: 1200,
      subs_gained: 14,
      clicks: 8,
      target: "тест",
      updated: "только что",
    }

    setTrackedPosts([added, ...trackedPosts])
    setNewPostUrl("")
  }

  const handleRefreshPost = (id: number) => {
    setIsUpdatingTracking(id)
    setTimeout(() => {
      setTrackedPosts((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                views: item.views + Math.floor(Math.random() * 250) + 50,
                subs_gained: item.subs_gained + Math.floor(Math.random() * 6) + 1,
                clicks: item.clicks + Math.floor(Math.random() * 4),
                updated: "только что",
              }
            : item
        )
      );
      setIsUpdatingTracking(null)
    }, 600)
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">Реклама</h1>
        <p className="text-sm text-zinc-400">Анализ закупок рекламы в Telegram и Instagram</p>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">📊 Обзор</TabsTrigger>
          <TabsTrigger value="channels">📋 Каналы</TabsTrigger>
          <TabsTrigger value="purchases">🎯 Закупки</TabsTrigger>
          <TabsTrigger value="tracking">🔗 Отслеживание</TabsTrigger>
          <TabsTrigger value="funnel">📈 Воронка</TabsTrigger>
        </TabsList>

        {/* ================= TAB 1: ОБЗОР ================= */}
        <TabsContent value="overview" className="space-y-6">
          {/* 1. Six Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card className="p-4 border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Потрачено</span>
                <DollarSign className="w-4 h-4 text-orange-400" />
              </div>
              <div className="text-xl lg:text-2xl font-bold text-white">
                {formatMoney(initialOverview.totals.spent)}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Всего бюджет</div>
            </Card>

            <Card className="p-4 border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Прирост</span>
                <Users className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl lg:text-2xl font-bold text-emerald-400">
                +{formatNumber(initialOverview.totals.growth)}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Подписчиков</div>
            </Card>

            <Card className="p-4 border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Лиды</span>
                <TrendingUp className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-xl lg:text-2xl font-bold text-white">
                {formatNumber(initialOverview.totals.leads)}
              </div>
              <div className="text-xs text-zinc-500 mt-1">537 ₽ / лид</div>
            </Card>

            <Card className="p-4 border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Клиенты</span>
                <UserCheck className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-xl lg:text-2xl font-bold text-white">
                {formatNumber(initialOverview.totals.clients)}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Конверсия 41.9%</div>
            </Card>

            <Card className="p-4 border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Продажи</span>
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl lg:text-2xl font-bold text-white">
                {formatMoney(initialOverview.totals.sales)}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Выручка с рекламы</div>
            </Card>

            <Card className="p-4 border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Окупаемость</span>
                <Percent className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl lg:text-2xl font-bold text-emerald-400">
                {initialOverview.totals.roi}%
              </div>
              <div className="text-xs text-emerald-500/80 mt-1">ROI (х27.4)</div>
            </Card>
          </div>

          {/* 2. Platform Comparison + Top Channels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-5 border-zinc-800 bg-zinc-900/50">
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-base font-semibold text-white">Telegram vs Instagram</CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Сравнение эффективности по источникам рекламы
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 space-y-6">
                {initialOverview.by_platform.map((plat) => {
                  const isTg = plat.platform === "telegram"
                  const totalSpent = initialOverview.totals.spent
                  const spentPercent = Math.round((plat.spent / totalSpent) * 100)
                  const totalSales = initialOverview.totals.sales
                  const salesPercent = Math.round((plat.sales / totalSales) * 100)

                  return (
                    <div key={plat.platform} className="space-y-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          {isTg ? (
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
                              <Send className="w-4 h-4" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-400 border border-pink-500/20">
                              <Instagram className="w-4 h-4" />
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-white text-sm">{plat.label}</div>
                            <div className="text-xs text-zinc-400">
                              {plat.leads} лидов · {plat.clients} клиентов
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-white">{formatMoney(plat.sales)}</div>
                          <div className="text-xs text-zinc-500">продажи</div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-zinc-400">
                          <span>Потрачено: <strong className="text-zinc-200">{formatMoney(plat.spent)}</strong> ({spentPercent}%)</span>
                          <span>Доля продаж: <strong className="text-emerald-400">{salesPercent}%</strong></span>
                        </div>
                        <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", isTg ? "bg-blue-500" : "bg-gradient-to-r from-purple-500 to-pink-500")}
                            style={{ width: `${spentPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <Card className="p-5 border-zinc-800 bg-zinc-900/50">
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-base font-semibold text-white">Топ каналов по окупаемости</CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Лучшие размещения с максимальным показателем ROI
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Канал</TableHead>
                      <TableHead className="text-right">Потрачено</TableHead>
                      <TableHead className="text-right">Продажи</TableHead>
                      <TableHead className="text-right">ROI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {initialOverview.top_channels.map((ch, idx) => (
                      <TableRow key={ch.name}>
                        <TableCell className="font-medium text-white">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center text-xs">
                              {idx + 1}
                            </span>
                            {ch.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-zinc-300">{formatMoney(ch.spent)}</TableCell>
                        <TableCell className="text-right font-medium text-white">{formatMoney(ch.sales)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="success" className="font-bold">
                            +{formatNumber(ch.roi)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================= TAB 2: КАНАЛЫ ================= */}
        <TabsContent value="channels" className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 lg:pb-0 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer",
                    selectedCategory === cat
                      ? "bg-white text-zinc-950 font-semibold"
                      : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white border border-zinc-800"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2.5">
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                <Input
                  placeholder="Поиск канала..."
                  value={searchChannel}
                  onChange={(e) => setSearchChannel(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
              </div>

              <div className="w-40">
                <Select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                >
                  {channelStatuses.map((st) => (
                    <option key={st} value={st} className="bg-zinc-900 text-white">
                      {st}
                    </option>
                  ))}
                </Select>
              </div>

              <Button
                onClick={() => setIsAddChannelOpen(true)}
                className="gap-1.5 whitespace-nowrap h-9 text-xs"
              >
                <Plus className="w-4 h-4" /> Добавить канал
              </Button>
            </div>
          </div>

          <Card className="p-0 border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead>Ссылка</TableHead>
                  <TableHead>Админ</TableHead>
                  <TableHead className="text-right">Цена</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Комментарий</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredChannels.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-zinc-500">
                      Каналы не найдены
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredChannels.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-semibold text-white">{item.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {item.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.link ? (
                          <a
                            href={`https://${item.link}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline inline-flex items-center gap-1 text-xs"
                          >
                            {item.link} <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-zinc-300 text-xs">{item.admin || "—"}</TableCell>
                      <TableCell className="text-right font-medium text-white">
                        {item.price > 0 ? formatMoney(item.price) : <span className="text-zinc-500">0 ₽ (бартер)</span>}
                      </TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium", getAdStatusStyle(item.status))}>
                          {item.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400 max-w-xs truncate">
                        {item.comment || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Dialog: Добавить канал */}
          <Dialog open={isAddChannelOpen} onOpenChange={setIsAddChannelOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Добавить канал в базу</DialogTitle>
                <DialogDescription>
                  Внесите данные канала или блогера для планирования рекламных интеграций.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddChannel} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">Название канала *</label>
                  <Input
                    required
                    placeholder="Например: Секс-афиша Краснодар"
                    value={newChannel.name}
                    onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Категория</label>
                    <Select
                      value={newChannel.category}
                      onChange={(e) => setNewChannel({ ...newChannel, category: e.target.value })}
                    >
                      {categories.filter((c) => c !== "Все категории").map((cat) => (
                        <option key={cat} value={cat} className="bg-zinc-900 text-white">
                          {cat}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Статус</label>
                    <Select
                      value={newChannel.status}
                      onChange={(e) => setNewChannel({ ...newChannel, status: e.target.value })}
                    >
                      {channelStatuses.filter((s) => s !== "Все статусы").map((st) => (
                        <option key={st} value={st} className="bg-zinc-900 text-white">
                          {st}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Ссылка на канал</label>
                    <Input
                      placeholder="t.me/channel_name"
                      value={newChannel.link}
                      onChange={(e) => setNewChannel({ ...newChannel, link: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Админ (никнейм)</label>
                    <Input
                      placeholder="@admin_user"
                      value={newChannel.admin}
                      onChange={(e) => setNewChannel({ ...newChannel, admin: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">Стоимость интеграции (₽)</label>
                  <Input
                    type="number"
                    placeholder="Например: 4500"
                    value={newChannel.price}
                    onChange={(e) => setNewChannel({ ...newChannel, price: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">Комментарий / Условия</label>
                  <Input
                    placeholder="Посты без удаления, выход в прайм-тайм..."
                    value={newChannel.comment}
                    onChange={(e) => setNewChannel({ ...newChannel, comment: e.target.value })}
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddChannelOpen(false)}>
                    Отмена
                  </Button>
                  <Button type="submit">Сохранить канал</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ================= TAB 3: ЗАКУПКИ ================= */}
        <TabsContent value="purchases" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-44">
                <Select
                  value={purchaseMonthFilter}
                  onChange={(e) => setPurchaseMonthFilter(e.target.value)}
                >
                  <option value="all">Все месяцы</option>
                  <option value="2025-12">Декабрь 2025</option>
                  <option value="2025-11">Ноябрь 2025</option>
                  <option value="2024">2024 год</option>
                </Select>
              </div>

              <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-md border border-zinc-800">
                <button
                  onClick={() => setPurchasePlatformFilter("all")}
                  className={cn(
                    "px-3 py-1 text-xs rounded font-medium transition-colors cursor-pointer",
                    purchasePlatformFilter === "all" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
                  )}
                >
                  Все
                </button>
                <button
                  onClick={() => setPurchasePlatformFilter("telegram")}
                  className={cn(
                    "px-3 py-1 text-xs rounded font-medium transition-colors cursor-pointer flex items-center gap-1",
                    purchasePlatformFilter === "telegram" ? "bg-blue-600/30 text-blue-300 border border-blue-500/30" : "text-zinc-400 hover:text-white"
                  )}
                >
                  <Send className="w-3 h-3" /> Telegram
                </button>
                <button
                  onClick={() => setPurchasePlatformFilter("instagram")}
                  className={cn(
                    "px-3 py-1 text-xs rounded font-medium transition-colors cursor-pointer flex items-center gap-1",
                    purchasePlatformFilter === "instagram" ? "bg-pink-600/30 text-pink-300 border border-pink-500/30" : "text-zinc-400 hover:text-white"
                  )}
                >
                  <Instagram className="w-3 h-3" /> Instagram
                </button>
              </div>
            </div>

            <Button onClick={() => setIsAddPurchaseOpen(true)} className="gap-1.5 h-9 text-xs">
              <Plus className="w-4 h-4" /> Добавить закупку
            </Button>
          </div>

          <Card className="p-0 border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Канал</TableHead>
                  <TableHead>Платформа</TableHead>
                  <TableHead className="text-right">Цена</TableHead>
                  <TableHead className="text-right">Охват</TableHead>
                  <TableHead className="text-right">ERR%</TableHead>
                  <TableHead className="text-right">CPM</TableHead>
                  <TableHead className="text-right">Прирост</TableHead>
                  <TableHead className="text-right">Цена / подп.</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPurchases.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-zinc-400 font-mono text-xs">{item.date}</TableCell>
                    <TableCell className="font-semibold text-white">{item.channel}</TableCell>
                    <TableCell>
                      {item.platform === "telegram" ? (
                        <Badge variant="info" className="gap-1 text-xs">
                          <Send className="w-3 h-3" /> TG
                        </Badge>
                      ) : (
                        <Badge variant="purple" className="gap-1 text-xs">
                          <Instagram className="w-3 h-3" /> IG
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium text-white">
                      {formatMoney(item.final_price || item.price)}
                    </TableCell>
                    <TableCell className="text-right text-zinc-300">
                      {item.coverage > 0 ? formatNumber(item.coverage) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-zinc-400">
                      {item.err > 0 ? `${(item.err * 100).toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-zinc-400">
                      {item.cpm > 0 ? `${formatNumber(item.cpm)} ₽` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-emerald-400">
                      {item.growth > 0 ? `+${item.growth}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-zinc-200">
                      {item.price_per_sub > 0 ? `${item.price_per_sub} ₽` : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium", getAdStatusStyle(item.status))}>
                        {item.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Dialog: Добавить закупку */}
          <Dialog open={isAddPurchaseOpen} onOpenChange={setIsAddPurchaseOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Добавить закупку рекламы</DialogTitle>
                <DialogDescription>
                  Зафиксируйте размещение для подсчета стоимости подписчика и окупаемости.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddPurchase} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Дата размещения</label>
                    <Input
                      type="date"
                      required
                      value={newPurchase.date}
                      onChange={(e) => setNewPurchase({ ...newPurchase, date: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Платформа</label>
                    <Select
                      value={newPurchase.platform}
                      onChange={(e) => setNewPurchase({ ...newPurchase, platform: e.target.value })}
                    >
                      <option value="telegram">Telegram</option>
                      <option value="instagram">Instagram</option>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">Канал / Блогер *</label>
                  <Input
                    required
                    placeholder="Название канала"
                    value={newPurchase.channel}
                    onChange={(e) => setNewPurchase({ ...newPurchase, channel: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Цена (₽) *</label>
                    <Input
                      type="number"
                      required
                      placeholder="5000"
                      value={newPurchase.price}
                      onChange={(e) => setNewPurchase({ ...newPurchase, price: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Охват поста</label>
                    <Input
                      type="number"
                      placeholder="600"
                      value={newPurchase.coverage}
                      onChange={(e) => setNewPurchase({ ...newPurchase, coverage: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Прирост подписчиков</label>
                    <Input
                      type="number"
                      placeholder="70"
                      value={newPurchase.growth}
                      onChange={(e) => setNewPurchase({ ...newPurchase, growth: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Статус оплаты</label>
                    <Select
                      value={newPurchase.status}
                      onChange={(e) => setNewPurchase({ ...newPurchase, status: e.target.value })}
                    >
                      <option value="оплачено">оплачено</option>
                      <option value="забронировано">забронировано</option>
                      <option value="бартер">бартер</option>
                    </Select>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddPurchaseOpen(false)}>
                    Отмена
                  </Button>
                  <Button type="submit">Сохранить закупку</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ================= TAB 4: ОТСЛЕЖИВАНИЕ ================= */}
        <TabsContent value="tracking" className="space-y-6">
          <Card className="p-5 border-zinc-800 bg-zinc-900/50">
            <form onSubmit={handleAddTrackedPost} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Input
                  placeholder="Вставить ссылку на рекламный пост (например: t.me/channel/1234)"
                  value={newPostUrl}
                  onChange={(e) => setNewPostUrl(e.target.value)}
                  className="h-10 bg-zinc-950 border-zinc-800"
                />
              </div>
              <Button type="submit" className="h-10 px-6 font-semibold whitespace-nowrap">
                Отслеживать
              </Button>
            </form>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {trackedPosts.map((post) => (
              <Card key={post.id} className="p-5 border-zinc-800 bg-zinc-900/50 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Send className="w-4 h-4 text-blue-400" />
                        <h4 className="font-semibold text-white text-base">@{post.channel}</h4>
                      </div>
                      <a
                        href={`https://${post.link}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1 mt-1 font-mono"
                      >
                        {post.link} <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <Badge variant="purple" className="text-xs">
                      Цель: {post.target}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-zinc-950/60 p-3 border border-zinc-800/80">
                    <div>
                      <div className="flex items-center gap-1 text-xs text-zinc-500 mb-0.5">
                        <Eye className="w-3 h-3" /> Просмотры
                      </div>
                      <div className="text-base font-bold text-white">{formatNumber(post.views)}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs text-zinc-500 mb-0.5">
                        <Users className="w-3 h-3 text-emerald-400" /> Прирост
                      </div>
                      <div className="text-base font-bold text-emerald-400">+{post.subs_gained}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs text-zinc-500 mb-0.5">
                        <MousePointer className="w-3 h-3 text-purple-400" /> Переходы
                      </div>
                      <div className="text-base font-bold text-white">{post.clicks}</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 mt-4 border-t border-zinc-800/80 text-xs text-zinc-500">
                  <span>Обновлено: {post.updated}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRefreshPost(post.id)}
                    disabled={isUpdatingTracking === post.id}
                    className="h-7 text-xs gap-1.5"
                  >
                    <RefreshCw className={cn("w-3 h-3", isUpdatingTracking === post.id && "animate-spin text-blue-400")} />
                    {isUpdatingTracking === post.id ? "Обновление..." : "Обновить"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ================= TAB 5: ВОРОНКА ================= */}
        <TabsContent value="funnel" className="space-y-6">
          <Card className="p-6 border-zinc-800 bg-zinc-900/50">
            <CardHeader className="p-0 pb-6">
              <CardTitle className="text-lg font-semibold text-white">Воронка конверсии из рекламы в продажи</CardTitle>
              <CardDescription className="text-sm text-zinc-400">
                Сквозная аналитика: от показа креатива до подтвержденной оплаты
              </CardDescription>
            </CardHeader>

            <div className="space-y-4">
              {funnel.map((step, idx) => {
                const maxVal = funnel[0].value
                const widthPercent = Math.max(12, Math.round((step.value / maxVal) * 100))
                const prevVal = idx > 0 ? funnel[idx - 1].value : null
                const conversionFromPrev = prevVal ? ((step.value / prevVal) * 100).toFixed(1) : null
                const overallConversion = ((step.value / maxVal) * 100).toFixed(step.value === maxVal ? 0 : 3)

                const stageColors = [
                  "from-blue-600 to-blue-500",
                  "from-indigo-600 to-indigo-500",
                  "from-purple-600 to-purple-500",
                  "from-amber-600 to-amber-500",
                  "from-emerald-600 to-emerald-500",
                ]

                return (
                  <div key={step.stage} className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-1">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 text-xs font-semibold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-white">{step.stage}</span>
                        <span className="text-xs text-zinc-500 hidden md:inline">({step.desc})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {conversionFromPrev && (
                          <Badge variant="secondary" className="text-xs text-zinc-300 bg-zinc-800">
                            конверсия этапа: <strong className="text-emerald-400 ml-1">{conversionFromPrev}%</strong>
                          </Badge>
                        )}
                        <span className="font-bold text-white text-base">{formatNumber(step.value)}</span>
                      </div>
                    </div>

                    <div className="h-9 w-full bg-zinc-950/80 rounded-lg p-1 border border-zinc-800/80 flex items-center">
                      <div
                        className={cn(
                          "h-full rounded-md bg-gradient-to-r transition-all duration-500 flex items-center px-3 text-xs font-semibold text-white shadow-sm",
                          stageColors[idx % stageColors.length]
                        )}
                        style={{ width: `${widthPercent}%`, minWidth: "120px" }}
                      >
                        <span className="truncate">{overallConversion}% от охвата</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-8 pt-6 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="p-3 rounded-lg bg-zinc-950/40 border border-zinc-800/60">
                <div className="text-xs text-zinc-400 mb-1">Охват креативов</div>
                <div className="text-lg font-bold text-white">100 000</div>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950/40 border border-zinc-800/60">
                <div className="text-xs text-zinc-400 mb-1">Итоговых оплат</div>
                <div className="text-lg font-bold text-emerald-400">57 клиентов</div>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950/40 border border-zinc-800/60">
                <div className="text-xs text-zinc-400 mb-1">Сквозная конверсия (Показ → Оплата)</div>
                <div className="text-lg font-bold text-emerald-400">0.057%</div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
