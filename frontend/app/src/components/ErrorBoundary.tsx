import React from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw } from "lucide-react"

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-zinc-950">
          <div className="flex flex-col items-center gap-4 max-w-sm text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/10">
              <AlertTriangle size={28} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">Что-то пошло не так</h2>
              <p className="text-sm text-zinc-400">
                {this.state.error?.message || "Неизвестная ошибка"}
              </p>
            </div>
            <Button variant="outline" onClick={this.handleReset} className="gap-2">
              <RefreshCw size={14} />
              Попробовать снова
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
