import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { API } from "@/hooks/use-api"
import { Loader2, AlertTriangle } from "lucide-react"

const STAGES = [
  "Контакт", "Выдать контент", "Квалифицировать",
  "Довести до решения", "Проработать", "Работа завершена (Архив)",
]

function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("crm_token")
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (token) headers["Authorization"] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

interface AddContactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectClient: (id: number) => void
}

export function AddContactDialog({ open, onOpenChange, onSelectClient }: AddContactDialogProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [telegram, setTelegram] = useState("")
  const [phone, setPhone] = useState("")
  const [status, setStatus] = useState("Контакт")
  const [source, setSource] = useState("")
  const [responsible, setResponsible] = useState("Антон")
  const [duplicateAlert, setDuplicateAlert] = useState<{ id: number; name: string; by: string } | null>(null)

  const createClient = useMutation({
    mutationFn: (body: object) =>
      authFetch(`${API}/api/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: (data: any) => {
      if (data.duplicate) {
        setDuplicateAlert({ id: data.existing_id, name: data.existing_name, by: data.match_by })
        return
      }
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      queryClient.invalidateQueries({ queryKey: ["stats"] })
      resetForm()
      onOpenChange(false)
      onSelectClient(data.id)
    },
  })

  const resetForm = () => {
    setName("")
    setTelegram("")
    setPhone("")
    setStatus("Контакт")
    setSource("")
    setResponsible("Антон")
    setDuplicateAlert(null)
  }

  const handleSubmit = () => {
    if (!name.trim()) return
    const nick = telegram.trim()
    createClient.mutate({
      name: name.trim(),
      telegram_nick: nick.startsWith("@") ? nick : nick ? `@${nick}` : "",
      phone: phone.trim(),
      status,
      source: source.trim() || "Ручной ввод",
      responsible_person: responsible === "Ассистент" ? "assistant" : "personal",
    })
  }

  const handleOpenDuplicate = () => {
    if (duplicateAlert) {
      onOpenChange(false)
      setDuplicateAlert(null)
      onSelectClient(duplicateAlert.id)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { resetForm() } }}>
      <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-white">Новый контакт</DialogTitle>
        </DialogHeader>

        {duplicateAlert ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-950/20 border border-amber-800/30">
              <AlertTriangle size={20} className="shrink-0 text-amber-400 mt-0.5" />
              <div>
                <p className="text-sm text-amber-200 font-medium">Найден дубликат</p>
                <p className="text-sm text-zinc-400 mt-1">
                  Контакт <span className="text-zinc-200">{duplicateAlert.name}</span> уже существует
                  {duplicateAlert.by === "phone" ? " с таким телефоном" : " с таким Telegram"}
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDuplicateAlert(null)}>
                Назад
              </Button>
              <Button onClick={handleOpenDuplicate}>
                Открыть карточку
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-500 font-medium">Имя *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Имя клиента"
                className="h-9 text-sm bg-zinc-900 border-zinc-800"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-500 font-medium">Telegram</label>
              <Input
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="@username или username"
                className="h-9 text-sm bg-zinc-900 border-zinc-800"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-500 font-medium">Телефон</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7..."
                className="h-9 text-sm bg-zinc-900 border-zinc-800"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-500 font-medium">Этап воронки</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9 text-sm bg-zinc-900 border-zinc-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-500 font-medium">Ответственный</label>
                <Select value={responsible} onValueChange={setResponsible}>
                  <SelectTrigger className="h-9 text-sm bg-zinc-900 border-zinc-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Антон">Антон</SelectItem>
                    <SelectItem value="Ассистент">Ассистент</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-500 font-medium">UTM Источник</label>
              <Input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Ручной ввод"
                className="h-9 text-sm bg-zinc-900 border-zinc-800"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button onClick={handleSubmit} disabled={!name.trim() || createClient.isPending}>
                {createClient.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                Создать
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
