import { useQuery } from "@tanstack/react-query"

const API = ""

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem("crm_token")
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`
  return headers
}

function authFetch(url: string, options: RequestInit = {}) {
  const headers = { ...getHeaders(), ...(options.headers as Record<string, string>) }
  return fetch(url, { ...options, headers })
}

export interface Client {
  id: number
  notion_page_id: string | null
  name: string
  telegram_nick: string
  telegram_id: string
  phone: string
  status: string
  source: string
  last_account: string
  last_contact: string | null
  next_step: string
  summary: string
  created_at: string
  updated_at: string
}

export interface Deal {
  id: number
  client_id: number | null
  client_name: string | null
  telegram_nick: string | null
  title: string
  status: string
  amount: number
  paid: number
  purchase_date: string | null
  created_at: string
}

export interface Stats {
  total_clients: number
  total_deals: number
  deals_sum: number
  by_status: { status: string; count: number }[]
}

export interface Note {
  id: number
  client_id: number
  text: string
  created_at: string
}

export interface ClientDetail {
  client: Client
  deals: Deal[]
  test_results: {
    id: number
    test_type: string
    diagnosis: string
    freedom_score: number
    sexuality_score: number
    created_at: string
  }[]
}

export { authFetch, API }

export function useClients(params: {
  search?: string
  status?: string
  limit?: number
  offset?: number
}) {
  const searchParams = new URLSearchParams()
  if (params.search) searchParams.set("search", params.search)
  if (params.status) searchParams.set("status", params.status)
  searchParams.set("limit", String(params.limit ?? 50))
  searchParams.set("offset", String(params.offset ?? 0))

  return useQuery<{ clients: Client[]; total: number }>({
    queryKey: ["clients", params],
    queryFn: () => authFetch(`${API}/api/clients?${searchParams}`).then((r) => r.json()),
  })
}

export function useClient(id: number | null) {
  return useQuery<ClientDetail>({
    queryKey: ["client", id],
    queryFn: () => authFetch(`${API}/api/clients/${id}`).then((r) => r.json()),
    enabled: !!id,
  })
}

export function useDeals(params: { limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams()
  searchParams.set("limit", String(params.limit ?? 50))
  searchParams.set("offset", String(params.offset ?? 0))

  return useQuery<{ deals: Deal[]; total: number }>({
    queryKey: ["deals", params],
    queryFn: () => authFetch(`${API}/api/deals?${searchParams}`).then((r) => r.json()),
  })
}

export function useStats() {
  return useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: () => authFetch(`${API}/api/stats`).then((r) => r.json()),
  })
}

export function useNotes(clientId: number | null) {
  return useQuery<{ notes: Note[] }>({
    queryKey: ["notes", clientId],
    queryFn: () => authFetch(`${API}/api/clients/${clientId}/notes`).then((r) => r.json()),
    enabled: !!clientId,
  })
}
