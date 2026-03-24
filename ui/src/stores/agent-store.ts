import { create } from 'zustand'

interface AgentState {
  selectedSessionId: string | null
  setSelectedSessionId: (id: string | null) => void
}

export const useAgentStore = create<AgentState>((set) => ({
  selectedSessionId: null,
  setSelectedSessionId: (id) => set({ selectedSessionId: id }),
}))
