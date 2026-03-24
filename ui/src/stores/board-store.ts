import { create } from 'zustand'

interface BoardState {
  selectedEpicId: string | null
  filterType: string
  filterLabel: string
  searchQuery: string
  setSelectedEpicId: (id: string | null) => void
  setFilterType: (type: string) => void
  setFilterLabel: (label: string) => void
  setSearchQuery: (query: string) => void
}

export const useBoardStore = create<BoardState>((set) => ({
  selectedEpicId: null,
  filterType: 'all',
  filterLabel: 'all',
  searchQuery: '',
  setSelectedEpicId: (id) => set({ selectedEpicId: id }),
  setFilterType: (type) => set({ filterType: type }),
  setFilterLabel: (label) => set({ filterLabel: label }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}))
