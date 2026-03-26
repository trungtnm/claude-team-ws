import { create } from 'zustand'

interface CaptureState {
  composerOpen: boolean
  selectedIds: Set<string>
  openComposer: () => void
  closeComposer: () => void
  toggleComposer: () => void
  toggleSelected: (id: string) => void
  selectAll: (ids: string[]) => void
  clearSelection: () => void
}

export const useCaptureStore = create<CaptureState>((set) => ({
  composerOpen: false,
  selectedIds: new Set<string>(),

  openComposer: () => set({ composerOpen: true }),
  closeComposer: () => set({ composerOpen: false }),
  toggleComposer: () => set((state) => ({ composerOpen: !state.composerOpen })),

  toggleSelected: (id) => {
    set((state) => {
      const next = new Set(state.selectedIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { selectedIds: next }
    })
  },

  selectAll: (ids) => {
    set({ selectedIds: new Set(ids) })
  },

  clearSelection: () => {
    set({ selectedIds: new Set() })
  },
}))
