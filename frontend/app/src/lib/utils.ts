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
