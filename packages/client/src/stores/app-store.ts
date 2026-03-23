import { create } from 'zustand'

// ---------------------------------------------------------------------------
// App UI state — sidebar, active project, capture inbox
// ---------------------------------------------------------------------------

interface AppState {
  sidebarOpen: boolean
  activeProjectId: string | null
  captureInboxOpen: boolean

  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setActiveProjectId: (id: string | null) => void
  toggleCaptureInbox: () => void
  setCaptureInboxOpen: (open: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  activeProjectId: null,
  captureInboxOpen: false,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
  toggleCaptureInbox: () => set((s) => ({ captureInboxOpen: !s.captureInboxOpen })),
  setCaptureInboxOpen: (open) => set({ captureInboxOpen: open }),
}))
