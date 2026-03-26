import { create } from 'zustand'

interface AppState {
  captureInboxOpen: boolean
  activeProjectId: string
  toggleCaptureInbox: () => void
  setCaptureInboxOpen: (open: boolean) => void
  setActiveProjectId: (id: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  captureInboxOpen: true,
  activeProjectId: 'proj-1',
  toggleCaptureInbox: () => set((s) => ({ captureInboxOpen: !s.captureInboxOpen })),
  setCaptureInboxOpen: (open) => set({ captureInboxOpen: open }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
}))
