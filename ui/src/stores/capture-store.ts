import { create } from 'zustand'
import { captures as initialCaptures, type Capture, type CaptureStatus } from '@/data/captures'

interface CaptureState {
  captures: Capture[]
  composerOpen: boolean
  selectedIds: Set<string>
  addCapture: (text: string, meta?: { priority?: number; type?: string }) => void
  updateStatus: (id: string, status: CaptureStatus) => void
  dismissCapture: (id: string) => void
  openComposer: () => void
  closeComposer: () => void
  toggleComposer: () => void
  toggleSelected: (id: string) => void
  selectAll: (ids: string[]) => void
  clearSelection: () => void
  getPendingCaptures: () => Capture[]
  getDeferredCaptures: () => Capture[]
  getNextPendingCapture: (afterId?: string) => Capture | undefined
}

export const useCaptureStore = create<CaptureState>((set, get) => ({
  captures: initialCaptures.filter((c) => c.status !== 'triaged'),
  composerOpen: false,
  selectedIds: new Set<string>(),

  addCapture: (text, _meta) => {
    const newCapture: Capture = {
      id: `cap-${Date.now()}`,
      text,
      userId: 'u-1',
      status: 'pending',
      createdAt: Math.floor(Date.now() / 1000),
    }
    set((state) => ({ captures: [newCapture, ...state.captures] }))
  },

  updateStatus: (id, status) => {
    set((state) => ({
      captures: state.captures.map((c) =>
        c.id === id ? { ...c, status } : c,
      ),
    }))
  },

  dismissCapture: (id) => {
    set((state) => ({
      captures: state.captures.map((c) =>
        c.id === id ? { ...c, status: 'dismissed' as const } : c,
      ),
      selectedIds: (() => {
        const next = new Set(state.selectedIds)
        next.delete(id)
        return next
      })(),
    }))
  },

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

  getPendingCaptures: () => {
    return get().captures.filter((c) => c.status === 'pending')
  },

  getDeferredCaptures: () => {
    return get().captures.filter((c) => c.status === 'deferred')
  },

  getNextPendingCapture: (afterId) => {
    const pending = get().captures.filter((c) => c.status === 'pending')
    if (!afterId) return pending[0]
    const currentIndex = pending.findIndex((c) => c.id === afterId)
    if (currentIndex === -1 || currentIndex >= pending.length - 1) return undefined
    return pending[currentIndex + 1]
  },
}))
