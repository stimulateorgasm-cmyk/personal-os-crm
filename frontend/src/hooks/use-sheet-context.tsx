import { createContext, useContext, useState, useCallback, ReactNode } from "react"

interface SheetContextType {
  isClientSheetOpen: boolean
  setClientSheetOpen: (open: boolean) => void
}

const SheetContext = createContext<SheetContextType>({
  isClientSheetOpen: false,
  setClientSheetOpen: () => {},
})

export function SheetProvider({ children }: { children: ReactNode }) {
  const [isClientSheetOpen, setClientSheetOpen] = useState(false)
  return (
    <SheetContext.Provider value={{ isClientSheetOpen, setClientSheetOpen }}>
      {children}
    </SheetContext.Provider>
  )
}

export function useSheetContext() {
  return useContext(SheetContext)
}
