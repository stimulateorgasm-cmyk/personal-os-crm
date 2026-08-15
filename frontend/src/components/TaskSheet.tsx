import { useState, useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { authFetch, API } from "@/hooks/use-api"
import { Loader2, Send, Archive, RotateCcw, Trash2, CheckSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { EmojiPickerButton } from "@/components/EmojiPickerButton"
import { TaskFiles } from "@/components/TaskFiles"
import { TaskChecklist } from "@/components/TaskChecklist"

const STATUSES = ["Идеи", "Очередь", "15 задач на неделю", "Делаю сейчас", "Рефлексия", "Готово"]

const PRIORITY_OPTIONS = [
  { value: "Срочно, важно", label: "Срочно, важно", color: "bg-emerald-500" },
  { value: "Срочно, не важно", label: "Срочно, не важно", color: "bg-amber-500" },
  { value: "Не срочно, важно", label: "Не срочно, важно", color: "bg-blue-500" },
]

interface TaskComment {
  id: number
  task_id: number
  text: string
  author: string
  created_at: string
}

interface AntonTask {
  id: number
  kaiten_id: number | null
  title: string
  description: string
  status: string
  order_index: number
  comments_count: number
  is_archived: number
  created_at: string
  updated_at: string
}

interface TaskSheetProps {
  taskId: number | null
  onClose: () => void
}

export function TaskSheet({ taskId, onClose }: TaskSheetProps) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState("")
  const [priority, setPriority] = useState("")
  const [commentText, setCommentText] = useState("")
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)

  const { data: tasksData } = useQuery({
    queryKey: ["antons-tasks"],
    queryFn: () => authFetch(`${API}/api/antons-tasks`).then((r) => r.json()),
  })

  const task: AntonTask | undefined = tasksData?.tasks?.find((t: AntonTask) => t.id === taskId)

  const { data: commentsData } = useQuery({
    queryKey: ["antons-task-comments", taskId],
    queryFn: () => authFetch(`${API}/api/antons-tasks/${taskId}/comments`).then((r) => r.json()),
    enabled: !!taskId,
  })

  const updateTask = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      authFetch(`${API}/api/antons-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["antons-tasks"] })
    },
  })

  const addComment = useMutation({
    mutationFn: (text: string) =>
      authFetch(`${API}/api/antons-tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, author: "" }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["antons-task-comments", taskId] })
      queryClient.invalidateQueries({ queryKey: ["antons-tasks"] })
    },
  })

  const deleteTask = useMutation({
    mutationFn: () =>
      authFetch(`${API}/api/antons-tasks/${taskId}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["antons-tasks"] })
      onClose()
    },
  })

  const deleteComment = useMutation({
    mutationFn: (commentId: number) =>
      authFetch(`${API}/api/antons-tasks/${taskId}/comments/${commentId}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["antons-task-comments", taskId] })
      queryClient.invalidateQueries({ queryKey: ["antons-tasks"] })
    },
  })

  // Sync local state when task loads
  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description || "")
      setStatus(task.status)
      setPriority(task.priority || "")
    }
  }, [task])

  // Auto-resize title
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = "auto"
      titleRef.current.style.height = `${titleRef.current.scrollHeight}px`
    }
  }, [title])

  const handleSubmitComment = () => {
    const text = commentText.trim()
    if (!text) return
    addComment.mutate(text, {
      onSuccess: () => setCommentText(""),
    })
  }

  const handleArchive = () => {
    const wasArchived = task?.is_archived
    updateTask.mutate({ is_archived: !wasArchived })
    onClose()
  }

  const comments: TaskComment[] = commentsData?.comments || []
  const isArchived = !!task?.is_archived

  return (
    <Sheet open={!!taskId} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="sm:max-w-3xl w-full bg-zinc-950 border-zinc-800 text-white flex flex-col p-0">
        {task ? (
          <>
            {/* Header */}
            <div className="px-8 pt-6 pb-4 border-b border-zinc-800/50 space-y-4">
              <div className="relative">
                <textarea
                  ref={titleRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => { if (title !== task.title) updateTask.mutate({ title }) }}
                  className="w-full text-2xl font-bold text-white bg-transparent border-none outline-none resize-none placeholder-zinc-600 leading-tight pr-8"
                  rows={1}
                />
                <div className="absolute bottom-2 right-0">
                  <EmojiPickerButton
                    onEmojiSelect={(emoji) => setTitle((prev) => prev + emoji)}
                    className="text-zinc-700 hover:text-zinc-400"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Select
                  value={status}
                  onValueChange={(v) => {
                    setStatus(v)
                    updateTask.mutate({ status: v })
                  }}
                >
                  <SelectTrigger className="h-9 text-sm w-48 bg-zinc-900 border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={priority}
                  onValueChange={(v) => {
                    setPriority(v)
                    updateTask.mutate({ priority: v })
                  }}
                >
                  <SelectTrigger className="h-9 text-sm w-44 bg-zinc-900 border-zinc-700 text-white">
                    <SelectValue placeholder="Приоритет" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value} className="text-sm">
                        <span className="flex items-center gap-2">
                          {p.color && <span className={cn("w-2 h-2 rounded-full", p.color)} />}
                          {p.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleArchive}
                  className="text-xs text-zinc-500 hover:text-zinc-300 gap-1.5"
                >
                  {isArchived ? <RotateCcw size={14} /> : <Archive size={14} />}
                  {isArchived ? "Вернуть из архива" : "В архив"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm("Удалить задачу? Это действие нельзя отменить.")) {
                      deleteTask.mutate()
                    }
                  }}
                  className="text-xs text-red-500 hover:text-red-400 gap-1.5"
                >
                  <Trash2 size={14} />
                  Удалить
                </Button>
              </div>
            </div>

            {/* Body — full width vertical layout */}
            <ScrollArea className="flex-1 px-8 py-5">
              {/* Description */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-zinc-400">Описание</h3>
                  <button
                    type="button"
                    onClick={() => setDescription((prev) => prev + "\n- [ ] \n- [ ] \n- [ ] ")}
                    className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Добавить чеклист"
                  >
                    <CheckSquare size={14} />
                    Чеклист
                  </button>
                </div>
                <div className="relative">
                  <textarea
                    ref={descRef}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={() => { if (description !== (task.description || "")) updateTask.mutate({ description }) }}
                    className="w-full min-h-[120px] bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none resize-none placeholder-zinc-600 focus:border-zinc-600 transition-colors leading-relaxed"
                    placeholder="Добавьте описание..."
                  />
                  <div className="absolute bottom-3 right-3">
                    <EmojiPickerButton
                      onEmojiSelect={(emoji) => setDescription((prev) => prev + emoji)}
                    />
                  </div>
                </div>
              </div>

              {/* Checklist */}
              <TaskChecklist taskType="anton" taskId={taskId} />

              {/* Files */}
              <TaskFiles taskType="anton" taskId={taskId} />

              {/* Comments */}
              <div>
                <h3 className="text-sm font-medium text-zinc-400 mb-3">
                  Комментарии ({comments.length})
                </h3>
                {comments.length === 0 && (
                  <p className="text-sm text-zinc-600 italic mb-4">Нет комментариев</p>
                )}
                <div className="space-y-4 mb-4">
                  {comments.map((cm) => (
                    <div key={cm.id} className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-zinc-500">
                          {cm.author || "Антон"}
                        </span>
                        <span className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (confirm("Удалить комментарий?")) {
                                deleteComment.mutate(cm.id)
                              }
                            }}
                            className="text-zinc-600 hover:text-red-400 transition-colors"
                            title="Удалить комментарий"
                          >
                            <Trash2 size={12} />
                          </button>
                          <span className="text-[11px] text-zinc-600">
                            {cm.created_at ? cm.created_at.slice(0, 16).replace("T", " ") : ""}
                          </span>
                        </span>
                      </div>
                      <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{cm.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Spacer for comment input */}
              <div className="h-4" />
            </ScrollArea>

            {/* Comment input */}
            <div className="px-8 py-4 border-t border-zinc-800/50 bg-zinc-950">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        handleSubmitComment()
                      }
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none resize-none placeholder-zinc-600 focus:border-zinc-600 transition-colors"
                    placeholder="Новый комментарий... (Enter — отправить, Shift+Enter — новая строка)"
                    rows={2}
                  />
                  <div className="absolute bottom-2 right-2">
                    <EmojiPickerButton
                      onEmojiSelect={(emoji) => setCommentText((prev) => prev + emoji)}
                    />
                  </div>
                </div>
                <Button
                  size="icon"
                  onClick={handleSubmitComment}
                  disabled={!commentText.trim() || addComment.isPending}
                  className="h-full min-h-[72px] aspect-square bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl"
                >
                  {addComment.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
