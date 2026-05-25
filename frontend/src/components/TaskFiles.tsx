import { useState, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Paperclip, Download, Trash2, Loader2, FileText } from "lucide-react"
import { authFetch, API } from "@/hooks/use-api"

interface TaskFile {
  id: number
  task_type: string
  task_id: number
  original_name: string
  file_path: string
  mime_type: string
  file_size: number
  download_url: string
}

interface TaskFilesProps {
  taskType: "assistant" | "anton"
  taskId: number | null
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase()
  if (ext === "pdf") return "📄"
  if (["doc", "docx"].includes(ext || "")) return "📝"
  if (["mp3", "wav", "ogg", "opus"].includes(ext || "")) return "🎵"
  if (["mp4", "mov", "avi", "webm"].includes(ext || "")) return "🎬"
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) return "🖼️"
  if (["xls", "xlsx", "csv"].includes(ext || "")) return "📊"
  return "📎"
}

export function TaskFiles({ taskType, taskId }: TaskFilesProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["task-files", taskType, taskId],
    queryFn: () => authFetch(`${API}/api/tasks/${taskType}/${taskId}/files`).then((r) => r.json()),
    enabled: !!taskId,
  })

  const deleteFile = useMutation({
    mutationFn: (fileId: number) =>
      authFetch(`${API}/api/files/${fileId}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-files", taskType, taskId] })
    },
  })

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !taskId) return
    setUploading(true)
    const formData = new FormData()
    formData.append("task_type", taskType)
    formData.append("task_id", String(taskId))
    formData.append("file", file)
    try {
      const token = localStorage.getItem("crm_token")
      const headers: Record<string, string> = {}
      if (token) headers["Authorization"] = `Bearer ${token}`
      await fetch(`${API}/api/upload`, { method: "POST", body: formData, headers })
      queryClient.invalidateQueries({ queryKey: ["task-files", taskType, taskId] })
    } catch (err) {
      console.error("Upload failed", err)
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const files: TaskFile[] = data?.files || []

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-zinc-400">
          Файлы ({files.length})
        </h3>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !taskId}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-30"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
          {uploading ? "Загрузка..." : "Прикрепить"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <Loader2 size={12} className="animate-spin" />
          Загрузка...
        </div>
      )}

      {!isLoading && files.length === 0 && (
        <p className="text-xs text-zinc-600 italic">Нет файлов</p>
      )}

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800/50 rounded-lg px-3 py-2 hover:bg-zinc-900/70 transition-colors group"
            >
              <span className="text-sm">{getFileIcon(f.original_name)}</span>
              <a
                href={f.download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-xs text-zinc-300 hover:text-blue-400 truncate transition-colors"
                title={f.original_name}
              >
                {f.original_name}
              </a>
              <span className="text-[10px] text-zinc-600 shrink-0">{formatSize(f.file_size)}</span>
              <button
                onClick={() => {
                  if (confirm("Удалить файл?")) deleteFile.mutate(f.id)
                }}
                className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all shrink-0"
                title="Удалить файл"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
