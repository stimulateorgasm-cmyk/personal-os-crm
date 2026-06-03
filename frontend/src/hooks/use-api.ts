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
  responsible_person?: string
  birth_date?: string
  actual_last_contact?: string | null
  labels?: { id: number; name: string; color: string }[]
  tags?: { id: number; name: string; color: string }[]
  deal_count?: number
  tasks_pending?: number
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
  sessions: string | null
  payment_info: string | null
  created_at: string
  product?: string
  reg_number?: string
  sessions_count?: string
  contract_status?: string
  contract_with?: string
  contract_date?: string
  act_status?: string
  assistant_pct?: string
  referral_pct?: string
  referral_paid?: string
  source?: string
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

export interface FunnelSearchItem {
  client: {
    id: number
    name: string
    telegram_nick: string
    telegram_id: string
    phone: string
    status: string
    source: string
    summary: string
    created_at: string
  }
  funnel_stage: string
  deal_summary: {
    total: number
    total_amount: number
    last_deal: string
  } | null
  latest_test: {
    test_type: string
    diagnosis: string
    score: number
  } | null
  notes_count: number
  tasks_pending: number
  last_contact: string | null
}

export function useFunnelSearch(q: string, limit = 20, offset = 0, archived = false) {
  const params = new URLSearchParams()
  if (q) params.set("q", q)
  params.set("limit", String(limit))
  params.set("offset", String(offset))
  if (archived) params.set("archived", "true")

  return useQuery<{ items: FunnelSearchItem[]; total: number; query: string }>({
    queryKey: ["funnel-search", q, limit, offset, archived],
    queryFn: () => authFetch(`${API}/api/funnel/search?${params}`).then((r) => r.json()),
    enabled: q.length >= 2,
  })
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
    staleTime: 60_000,
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
    staleTime: 60_000,
  })
}

export function useStats() {
  return useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: () => authFetch(`${API}/api/stats`).then((r) => r.json()),
    staleTime: 30_000,
  })
}

export function useNotes(clientId: number | null) {
  return useQuery<{ notes: Note[] }>({
    queryKey: ["notes", clientId],
    queryFn: () => authFetch(`${API}/api/clients/${clientId}/notes`).then((r) => r.json()),
    enabled: !!clientId,
  })
}
