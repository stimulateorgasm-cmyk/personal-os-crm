import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const API = ""

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—"
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return dateStr
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—"
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) {
      return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    }
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return dateStr
  }
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "Контакт": { bg: "bg-blue-500/10", text: "text-blue-400" },
  "Выдать контент": { bg: "bg-orange-500/10", text: "text-orange-400" },
  "Квалифицировать": { bg: "bg-purple-500/10", text: "text-purple-400" },
  "Довести до решения": { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  "Проработать": { bg: "bg-rose-500/10", text: "text-rose-400" },
  "Работа завершена (Архив)": { bg: "bg-zinc-500/10", text: "text-zinc-400" },
  "Ожидает": { bg: "bg-yellow-500/10", text: "text-yellow-400" },
  "В процессе": { bg: "bg-blue-500/10", text: "text-blue-400" },
  "Оплачено": { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  "Возврат": { bg: "bg-red-500/10", text: "text-red-400" },
}

export function getStatusStyle(status: string) {
  return STATUS_COLORS[status] || { bg: "bg-zinc-500/10", text: "text-zinc-400" }
}

export function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return ""
  try {
    const d = new Date(dateStr)
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
  } catch { return "" }
}

export function getAvatarUrl(nick: string | null | undefined): string | null {
  if (!nick) return null
  const clean = nick.replace("@", "")
  return `https://t.me/i/userpic/320/${clean}.jpg`
}

/** Normalize @username: strip leading @'s then add single @ */
export function displayNick(nick: string | null | undefined): string | null {
  if (!nick) return null
  const clean = nick.replace(/^@+/, "")
  return clean ? `@${clean}` : null
}

// Общие константы статусов/стадий
export const STAGES = [
  "Контакт",
  "Выдать контент",
  "Квалифицировать",
  "Довести до решения",
  "Проработать",
  "Работа завершена (Архив)",
] as const

export type Stage = (typeof STAGES)[number]

export const DEAL_STATUSES = ["Ожидает", "В процессе", "Оплачено", "Возврат"] as const

export function tgLink(nick: string | null | undefined): string | null {
  if (!nick) return null
  const clean = nick.replace("@", "")
  return `https://t.me/${clean}`
}

/** Ссылка на пользователя по telegram_id (tg://user?id=...) */
export function tgUserLink(tid: string | null | undefined): string | null {
  if (!tid) return null
  return `tg://user?id=${tid}`
}

export function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null) return "0"
  return value.toLocaleString("ru-RU")
}

export function formatMoney(value: number | undefined | null): string {
  if (value === undefined || value === null) return "0 ₽"
  return `${value.toLocaleString("ru-RU")} ₽`
}

export function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null) return "0%"
  return `${value > 0 ? "+" : ""}${value}%`
}

export function getAdStatusStyle(status: string): string {
  const s = status.toLowerCase()
  if (s === "рассматриваю") {
    return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
  }
  if (s === "закупил" || s === "в работе") {
    return "bg-blue-500/10 text-blue-400 border-blue-500/20"
  }
  if (s === "опубликовано" || s === "оплачено" || s === "успех" || s === "активен") {
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
  }
  if (s === "слив" || s === "отказ" || s === "не окуплен") {
    return "bg-red-500/10 text-red-400 border-red-500/20"
  }
  if (s === "бартер") {
    return "bg-purple-500/10 text-purple-400 border-purple-500/20"
  }
  if (s === "забронировано" || s === "ожидает") {
    return "bg-amber-500/10 text-amber-400 border-amber-500/20"
  }
  return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
}
