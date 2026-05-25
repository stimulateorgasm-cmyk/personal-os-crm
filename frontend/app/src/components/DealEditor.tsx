import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, formatDate, API } from "@/lib/utils"
import { Loader2 } from "lucide-react"

function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("crm_token")
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (token) headers["Authorization"] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

const STATUSES = ["Ожидает", "В процессе", "Оплачено", "Возврат"]

interface DealEditorProps {
  dealId: number | null
  onClose: () => void
}

export function DealEditor({ dealId, onClose }: DealEditorProps) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["deal", dealId],
    queryFn: async () => {
      const resp = await authFetch(`${API}/api/deals?limit=500`)
      const all = await resp.json()
      return all.deals.find((d: any) => d.id === dealId)
    },
    enabled: !!dealId,
  })

  const patchDeal = useMutation({
    mutationFn: (body: Record<string, any>) =>
      authFetch(`${API}/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] })
      queryClient.invalidateQueries({ queryKey: ["deal", dealId] })
    },
  })

  if (!dealId) return null

  return (
    <Sheet open={!!dealId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg bg-zinc-950">
        {isLoading && (
          <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-40 bg-zinc-800" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full bg-zinc-800/60" />
            ))}
          </div>
        )}

        {!isLoading && data && (
          <div className="flex flex-col h-full">
            <SheetHeader className="px-0 pt-2 pb-4">
              <SheetTitle className="text-base font-semibold text-white">Редактирование сделки</SheetTitle>
            </SheetHeader>

            <div className="flex-1 space-y-5">
              {/* Title */}
              <FieldRow label="Название">
                <Input
                  defaultValue={data.title}
                  className="h-9 text-sm bg-zinc-900 border-zinc-800"
                  onBlur={(e) => { if (e.target.value !== data.title) patchDeal.mutate({ title: e.target.value }) }}
                />
              </FieldRow>

              {/* Client */}
              <FieldRow label="Клиент">
                <div className="flex items-center gap-2 h-9 px-3 rounded-md bg-zinc-900 border border-zinc-800 text-sm text-zinc-400">
                  {data.client_name || "—"}
                  {data.telegram_nick && <span className="text-xs text-zinc-600">@{data.telegram_nick}</span>}
                </div>
              </FieldRow>

              {/* Status */}
              <FieldRow label="Статус">
                <Select value={data.status} onValueChange={(v) => patchDeal.mutate({ status: v })}>
                  <SelectTrigger className="h-9 text-sm bg-zinc-900 border-zinc-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldRow>

              {/* Amount */}
              <FieldRow label="Сумма">
                <Input
                  type="number"
                  defaultValue={data.amount}
                  className="h-9 text-sm bg-zinc-900 border-zinc-800"
                  onBlur={(e) => { const v = parseFloat(e.target.value); if (v !== data.amount) patchDeal.mutate({ amount: v }) }}
                />
              </FieldRow>

              {/* Paid */}
              <FieldRow label="Оплачено">
                <Input
                  type="number"
                  defaultValue={data.paid}
                  className="h-9 text-sm bg-zinc-900 border-zinc-800"
                  onBlur={(e) => { const v = parseFloat(e.target.value); if (v !== data.paid) patchDeal.mutate({ paid: v }) }}
                />
              </FieldRow>

              {/* Remainder (calculated) */}
              <FieldRow label="Остаток">
                <div className={cn("h-9 flex items-center px-3 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-medium",
                  (data.amount - data.paid) > 0 ? "text-orange-400" : "text-zinc-500"
                )}>
                  {(data.amount - data.paid).toLocaleString()}₽
                </div>
              </FieldRow>

              {/* Date */}
              <FieldRow label="Дата покупки">
                <Input
                  type="date"
                  defaultValue={data.purchase_date || ""}
                  className="h-9 text-sm bg-zinc-900 border-zinc-800"
                  onBlur={(e) => { if (e.target.value !== data.purchase_date) patchDeal.mutate({ purchase_date: e.target.value }) }}
                />
              </FieldRow>
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
