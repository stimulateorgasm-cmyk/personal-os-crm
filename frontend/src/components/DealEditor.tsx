import { useState, useCallback, useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, API } from "@/lib/utils"
import { DateInput } from "@/components/DateInput"
import { InlineSelect } from "@/components/InlineSelect"
import { Loader2, Plus, Circle, CheckCircle2, Trash2, ExternalLink, X, Pencil, CalendarClock } from "lucide-react"

function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("crm_token")
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (token) headers["Authorization"] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

interface Payment {
  id: number
  amount: number
  date: string
  status: "paid" | "pending"
}

function parsePayments(raw: string | null | undefined): Payment[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch { /* not json */ }
  return []
}

let _paymentIdCounter = Date.now()
function nextPayId() { return ++_paymentIdCounter }

interface DealEditorProps {
  dealId: number | null
  onClose: () => void
  onSelectClient?: (clientId: number) => void
}

export function DealEditor({ dealId, onClose, onSelectClient }: DealEditorProps) {
  const queryClient = useQueryClient()

  const [editingClient, setEditingClient] = useState(false)
  const [localSessionsTotal, setLocalSessionsTotal] = useState("0")
  const [localSessionsConducted, setLocalSessionsConducted] = useState("0")
  const totalRef = useRef<HTMLInputElement>(null)
  const conductedRef = useRef<HTMLInputElement>(null)
  const [clientSearchQuery, setClientSearchQuery] = useState("")
  const [pendingClientId, setPendingClientId] = useState<number | null>(null)

  const { data: clientSearchResults } = useQuery({
    queryKey: ["client-search", clientSearchQuery],
    queryFn: () => authFetch(`${API}/api/clients/search?q=${encodeURIComponent(clientSearchQuery)}`).then((r) => r.json()),
    enabled: clientSearchQuery.length >= 1,
  })

  const { data, isLoading } = useQuery({
    queryKey: ["deal", dealId],
    queryFn: async () => {
      const resp = await authFetch(`${API}/api/deals?limit=1&id=${dealId}`)
      const all = await resp.json()
      return all.deals?.[0] || null
    },
    enabled: !!dealId,
  })

  // Синхронизируем локальное состояние сессий при загрузке/обновлении данных
  useEffect(() => {
    setLocalSessionsTotal(String(data?.sessions_total || 0))
    setLocalSessionsConducted(String(data?.sessions_conducted || 0))
  }, [data?.sessions_total, data?.sessions_conducted])

  const patchDeal = useMutation({
    mutationFn: (body: Record<string, any>) =>
      authFetch(`${API}/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: (_data: any) => {
      queryClient.invalidateQueries({ queryKey: ["deal", dealId] })
      queryClient.invalidateQueries({ queryKey: ["deals"] })
      queryClient.refetchQueries({ queryKey: ["deals"], type: "active" })
    },
  })

  // Payments state
  const payments: Payment[] = parsePayments(data?.payment_info)
  const [paymentsOpen, setPaymentsOpen] = useState(false)
  const [newPayAmount, setNewPayAmount] = useState("")
  const [newPayDate, setNewPayDate] = useState("")
  const [newPayStatus, setNewPayStatus] = useState<"paid" | "pending">("paid")

  // Save payments + auto-recalculate paid amount
  const savePayments = useCallback((updated: Payment[]) => {
    const totalPaid = updated.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0)
    patchDeal.mutate({ payment_info: JSON.stringify(updated), paid: totalPaid })
  }, [patchDeal])

  const addPayment = useCallback(() => {
    const amount = parseFloat(newPayAmount)
    if (!amount) return
    const date = newPayDate || new Date().toISOString().slice(0, 10)
    const updated = [...payments, { id: nextPayId(), amount, date, status: newPayStatus }]
    savePayments(updated)
    setNewPayAmount("")
    setNewPayDate("")
  }, [newPayAmount, newPayDate, newPayStatus, payments, savePayments])

  const removePayment = useCallback((payId: number) => {
    const updated = payments.filter((p) => p.id !== payId)
    savePayments(updated)
  }, [payments, savePayments])

  if (!dealId) return null

  return (
    <Sheet open={!!dealId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent key={dealId} className="w-full sm:max-w-lg bg-zinc-950 overflow-y-auto">
        {/* Close button — top left */}
        <button
          onClick={onClose}
          className="fixed top-4 left-4 z-50 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all touch-manipulation"
          aria-label="Закрыть"
        >
          <X size={22} />
        </button>

        {isLoading && (
          <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-40 bg-zinc-800" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full bg-zinc-800/60" />
            ))}
          </div>
        )}

        {!isLoading && data && (
          <div key={dealId} className="flex flex-col h-full">
            <SheetHeader className="px-0 pt-6 pb-4 sm:pt-2">
              <SheetTitle className="text-base font-semibold text-white">Редактирование сделки</SheetTitle>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 sm:px-1">
              {/* Client — clickable link */}
              {/* ФИО */}
              <FieldRow label="ФИО">
                <div className="flex items-center gap-2">
                  <Input
                    defaultValue={data.client_name || ""}
                    className="min-h-[44px] text-sm bg-zinc-900 border-zinc-800 touch-manipulation flex-1"
                    onBlur={(e) => { patchDeal.mutate({ client_name: e.target.value }) }}
                    placeholder="Имя и фамилия"
                  />
                  {onSelectClient && data.client_id && (
                    <button onClick={() => onSelectClient(data.client_id)}
                      className="shrink-0 text-blue-400 hover:text-blue-300 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                      title="Открыть карточку клиента">
                      <ExternalLink size={16} />
                    </button>
                  )}
                </div>
              </FieldRow>

              <FieldRow label="Клиент">
                {editingClient ? (
                  <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={clientSearchQuery}
                      onChange={(e) => {
                        setClientSearchQuery(e.target.value)
                        setPendingClientId(null)
                      }}
                      placeholder="Имя или @username..."
                      className="w-full min-h-[44px] px-4 text-sm rounded-md bg-zinc-950 border border-zinc-700 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                    />
                    {clientSearchQuery && !pendingClientId && (
                      <div className="max-h-40 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded">
                        {(clientSearchResults?.clients || []).map((c: any) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setPendingClientId(c.id)
                              setClientSearchQuery(c.name)
                              patchDeal.mutate({ client_id: c.id })
                              setEditingClient(false)
                            }}
                            className="w-full text-left px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 flex items-center gap-2"
                          >
                            <span>{c.name}</span>
                            {c.telegram_nick && <span className="text-zinc-500">@{c.telegram_nick.replace(/^@+/, "")}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-h-[44px]">
                    {onSelectClient && data.client_id ? (
                      <button
                        onClick={() => onSelectClient(data.client_id)}
                        className="flex items-center gap-2 flex-1 h-full min-h-[44px] px-4 rounded-md bg-zinc-900 border border-zinc-800 text-sm text-blue-400 hover:text-blue-300 hover:bg-zinc-800 transition-colors text-left touch-manipulation"
                      >
                        <ExternalLink size={14} />
                        <span>{data.client_name || "—"}</span>
                        {data.telegram_nick && <span className="text-xs text-zinc-500">@{data.telegram_nick}</span>}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 flex-1 min-h-[44px] px-4 rounded-md bg-zinc-900 border border-zinc-800 text-sm text-zinc-400">
                        {data.client_name || "—"}
                        {data.telegram_nick && <span className="text-xs text-zinc-600">@{data.telegram_nick}</span>}
                      </div>
                    )}
                    <button
                      onClick={() => setEditingClient(true)}
                      className="shrink-0 text-zinc-600 hover:text-zinc-300 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                      title="Изменить клиента"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                )}
              </FieldRow>

              {/* Product */}
              <FieldRow label="Продукт">
                <InlineSelect value={data.product || ""} options={[
                  { value: "М-Быстрый старт", label: "М-Быстрый старт", color: "#6366f1" },
                  { value: "Ж-Быстрый старт", label: "Ж-Быстрый старт", color: "#ec4899" },
                  { value: "Терапия", label: "Терапия", color: "#22c55e" },
                  { value: "ЖП", label: "ЖП", color: "#a855f7" },
                  { value: "Диагностика", label: "Диагностика", color: "#f97316" },
                  { value: "Обуч. оргазмы", label: "Обуч. оргазмы", color: "#06b6d4" },
                ]} onSelect={(v) => patchDeal.mutate({ product: v })} />
              </FieldRow>

              {/* Status */}
              <FieldRow label="Статус">
                <InlineSelect value={data.status} options={[
                  { value: "Ожидает", label: "Ожидает", color: "#eab308" },
                  { value: "В процессе", label: "В процессе", color: "#6366f1" },
                  { value: "Оплачено", label: "Оплачено", color: "#22c55e" },
                  { value: "На паузе", label: "На паузе", color: "#a855f7" },
                  { value: "Возврат", label: "Возврат", color: "#ef4444" },
                ]} onSelect={(v) => patchDeal.mutate({ status: v })} />
              </FieldRow>

              {/* Reg number */}
              <FieldRow label="№ в реестре">
                <Input defaultValue={data.reg_number || ""} maxLength={10}
                  className="h-8 w-28 text-xs bg-zinc-900 border-zinc-800 touch-manipulation"
                  onBlur={(e) => { if (e.target.value !== (data.reg_number || "")) patchDeal.mutate({ reg_number: e.target.value }) }} />
              </FieldRow>

              {/* Comments — textarea, auto-grow до 10 строк */}
              <FieldRow label="Комментарий к сделке">
                <textarea
                  key={dealId}
                  defaultValue={data.sessions_count || ""}
                  rows={3}
                  onInput={(e) => {
                    const el = e.currentTarget
                    el.style.height = "auto"
                    el.style.height = Math.min(el.scrollHeight, 10 * 24) + "px"
                  }}
                  onBlur={(e) => { if (e.target.value !== (data.sessions_count || "")) patchDeal.mutate({ sessions_count: e.target.value }) }}
                  className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none touch-manipulation"
                  placeholder="Заметки о сделке..."
                />
              </FieldRow>

              {/* Amount + Paid + Remainder */}
              <div className="grid grid-cols-3 gap-2">
                <FieldRow label="Сумма">
                  <Input type="number" defaultValue={data.amount} className="min-h-[44px] text-sm bg-zinc-900 border-zinc-800 touch-manipulation"
                    onBlur={(e) => { const v = parseFloat(e.target.value); if (v !== data.amount) patchDeal.mutate({ amount: v }) }} />
                </FieldRow>
                <FieldRow label="Оплачено">
                  <Input type="number" defaultValue={data.paid || 0} className="min-h-[44px] text-sm bg-zinc-900 border-zinc-800 touch-manipulation"
                    onBlur={(e) => { const v = parseFloat(e.target.value); if (v !== (data.paid || 0)) patchDeal.mutate({ paid: v }) }} />
                </FieldRow>
                <FieldRow label="Остаток">
                  <div className="min-h-[44px] flex items-center px-3 text-sm font-medium rounded-md bg-zinc-900 border border-zinc-800 text-orange-400">
                    {((data.amount || 0) - (data.paid || 0)).toLocaleString()} руб.
                  </div>
                </FieldRow>
              </div>

              {/* Contract section */}
              <Separator className="bg-zinc-800/30" />
              <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Договор</p>
              <div className="grid grid-cols-2 gap-2">
                <FieldRow label="Статус">
                  <InlineSelect value={data.contract_status || "-"} options={[
                    { value: "-", label: "-", color: "#71717a" },
                    { value: "есть", label: "есть", color: "#22c55e" },
                    { value: "отправила", label: "отправила", color: "#eab308" },
                    { value: "расторгнут", label: "расторгнут", color: "#ef4444" },
                  ]} onSelect={(v) => patchDeal.mutate({ contract_status: v })} />
                </FieldRow>
                <FieldRow label="С кем">
                  <InlineSelect value={data.contract_with || ""} options={[
                    { value: "", label: "-", color: "#71717a" },
                    { value: "Шумкин ФЛ", label: "Шумкин ФЛ", color: "#6366f1" },
                    { value: "ИП Горовцов", label: "ИП Горовцов", color: "#22c55e" },
                    { value: "ИП Карика", label: "ИП Карика", color: "#f97316" },
                  ]} onSelect={(v) => patchDeal.mutate({ contract_with: v })} />
                </FieldRow>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FieldRow label="Дата договора">
                  <DateInput value={data.contract_date || ""} onChange={(iso) => patchDeal.mutate({ contract_date: iso })} placeholder="ДД.ММ.ГГГГ" className="w-full" />
                </FieldRow>
                <FieldRow label="Акт">
                  <InlineSelect value={data.act_status || "-"} options={[
                    { value: "-", label: "-", color: "#71717a" },
                    { value: "есть", label: "есть", color: "#22c55e" },
                    { value: "отправила", label: "отправила", color: "#eab308" },
                  ]} onSelect={(v) => patchDeal.mutate({ act_status: v })} />
                </FieldRow>
              </div>

              {/* Sessions — Total / Conducted / Remaining */}
              <Separator className="bg-zinc-800/30" />
              <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Сессии</p>
              <div className="grid grid-cols-3 gap-2">
                <FieldRow label="Всего">
                  <Input ref={totalRef} type="text" inputMode="numeric" pattern="[0-9]*" value={localSessionsTotal}
                    onChange={(e) => setLocalSessionsTotal(e.target.value)}
                    className="min-h-[44px] text-sm bg-zinc-900 border-zinc-800 touch-manipulation"
                    onBlur={() => {
                      const total = parseInt(totalRef.current?.value || "0") || 0
                      const conducted = parseInt(conductedRef.current?.value || "0") || 0
                      const patch: Record<string, number> = {}
                      if (total !== (data.sessions_total || 0)) patch.sessions_total = total
                      if (conducted !== (data.sessions_conducted || 0)) patch.sessions_conducted = conducted
                      if (Object.keys(patch).length > 0) patchDeal.mutate(patch)
                    }} />
                </FieldRow>
                <FieldRow label="Проведено">
                  <Input ref={conductedRef} type="text" inputMode="numeric" pattern="[0-9]*" value={localSessionsConducted}
                    onChange={(e) => setLocalSessionsConducted(e.target.value)}
                    className="min-h-[44px] text-sm bg-zinc-900 border-zinc-800 touch-manipulation"
                    onBlur={() => {
                      const total = parseInt(totalRef.current?.value || "0") || 0
                      const conducted = parseInt(conductedRef.current?.value || "0") || 0
                      const patch: Record<string, number> = {}
                      if (total !== (data.sessions_total || 0)) patch.sessions_total = total
                      if (conducted !== (data.sessions_conducted || 0)) patch.sessions_conducted = conducted
                      if (Object.keys(patch).length > 0) patchDeal.mutate(patch)
                    }} />
                </FieldRow>
                <FieldRow label="Осталось">
                  <div className="min-h-[44px] flex items-center px-3 text-sm font-medium rounded-md bg-zinc-900 border border-zinc-800 text-blue-400">
                    {Math.max(0, (parseInt(localSessionsTotal) || 0) - (parseInt(localSessionsConducted) || 0))}
                  </div>
                </FieldRow>
              </div>

              {/* Payments — с редактированием */}
              <FieldRow label={`Оплаты (${payments.length})`}>
                <div className="space-y-2">
                  {payments.map((p) => (
                    <PaymentRow
                      key={p.id}
                      payment={p}
                      onUpdate={(updated) => {
                        const all = parsePayments(data.payment_info).map((x) =>
                          x.id === p.id ? updated : x
                        )
                        savePayments(all)
                      }}
                      onRemove={() => removePayment(p.id)}
                    />
                  ))}
                  {paymentsOpen && (
                    <div className="flex flex-col gap-2 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          value={newPayAmount}
                          onChange={(e) => setNewPayAmount(e.target.value)}
                          placeholder="Сумма"
                          className="h-9 text-sm bg-zinc-950 border-zinc-800 flex-1"
                        />
                        <Input
                          type="date"
                          value={newPayDate}
                          onChange={(e) => setNewPayDate(e.target.value)}
                          className="h-9 text-sm bg-zinc-950 border-zinc-800 w-[140px]"
                        />
                      </div>
                      <div className="flex gap-2 items-center">
                        <Select value={newPayStatus} onValueChange={(v: any) => setNewPayStatus(v)}>
                          <SelectTrigger className="h-8 text-xs bg-zinc-950 border-zinc-800 w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="paid">Оплачено</SelectItem>
                            <SelectItem value="pending">Ожидает</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="xs" className="h-8" onClick={() => { addPayment(); setPaymentsOpen(false) }}>
                          Добавить
                        </Button>
                        <button
                          onClick={() => setPaymentsOpen(false)}
                          className="text-xs text-zinc-500 hover:text-zinc-300 ml-auto"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => setPaymentsOpen(!paymentsOpen)}
                    className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors min-h-[44px] touch-manipulation"
                  >
                    {paymentsOpen ? <X size={14} /> : <Plus size={14} />}
                    {paymentsOpen ? "Отмена" : "+ Добавить платёж"}
                  </button>
                </div>
              </FieldRow>

              {/* Date */}
              <FieldRow label="Дата покупки">
                <DateInput value={data.purchase_date || ""} onChange={(iso) => patchDeal.mutate({ purchase_date: iso })} placeholder="ДД.ММ.ГГГГ" className="w-full" />
              </FieldRow>
            </div>

            {/* Save/Close button */}
            <div className="sticky bottom-0 bg-zinc-950 pt-4 pb-2 px-5 sm:px-1">
              <Button onClick={onClose} className="w-full gap-2" size="sm">
                <CheckCircle2 size={16} />Готово
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] text-zinc-500 font-medium">{label}</label>
      {children}
    </div>
  )
}

// ─── Payment row with inline edit ────────────────────────────────────────────────
function PaymentRow({ payment, onUpdate, onRemove }: {
  payment: Payment; onUpdate: (p: Payment) => void; onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(payment.amount))
  const [date, setDate] = useState(payment.date || "")
  const [status, setStatus] = useState(payment.status)

  useEffect(() => { setAmount(String(payment.amount)); setDate(payment.date || ""); setStatus(payment.status); setEditing(false) }, [payment])

  const save = () => {
    onUpdate({ id: payment.id, amount: parseFloat(amount) || 0, date, status: status as "paid" | "pending" })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
        <div className="flex items-center gap-2">
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="h-8 w-24 px-2 text-sm rounded bg-zinc-950 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500" />
          <span className="text-xs text-zinc-500">₽</span>
          <DateInput value={date} onChange={(iso) => setDate(iso)} placeholder="ДД.ММ.ГГГГ" className="flex-1" />
        </div>
        <div className="flex items-center gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value as "paid" | "pending")}
            className="h-8 text-xs rounded bg-zinc-950 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500 px-2">
            <option value="paid">Оплачено</option>
            <option value="pending">Ожидает</option>
          </select>
          <button onClick={save} className="h-8 px-3 text-xs rounded bg-emerald-700 text-white hover:bg-emerald-600">OK</button>
          <button onClick={() => setEditing(false)} className="text-xs text-zinc-500 hover:text-zinc-300 ml-auto">Отмена</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 p-3 sm:p-2.5 rounded-lg bg-zinc-900 border border-zinc-800">
      <button onClick={() => setEditing(true)} className="flex-1 min-w-0 text-left">
        <span className={cn("text-sm font-medium", status === "paid" ? "text-emerald-400" : "text-amber-400")}>
          {payment.amount.toLocaleString()}₽
        </span>
        {date && <span className="text-xs text-zinc-500 ml-2">{date}</span>}
        <span className={cn(
          "text-[10px] ml-2 px-1.5 py-0.5 rounded",
          status === "paid" ? "bg-emerald-950/40 text-emerald-400" : "bg-amber-950/40 text-amber-400"
        )}>
          {status === "paid" ? "Оплачено" : "Ожидает"}
        </span>
      </button>
      <button onClick={onRemove}
        className="shrink-0 text-zinc-600 hover:text-red-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
        <Trash2 size={14} />
      </button>
    </div>
  )
}
