import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '@/lib/resources'
import { queryKeys } from '@/lib/query-keys'
import type { Project } from '@/types'

interface ProjectState {
  project: Project | null
  projectId: string
  setProjectId: (id: string) => void
  projects: Project[]
  isLoading: boolean
}

const ProjectContext = createContext<ProjectState | null>(null)

const PROJECT_ID_KEY = 'ctw_active_project'

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectIdState] = useState<string>(
    () => localStorage.getItem(PROJECT_ID_KEY) ?? '',
  )

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: async () => {
      const { projects } = await projectsApi.list()
      return projects
    },
  })

  const projects = data ?? []
  const project = projects.find((p) => p.id === projectId) ?? projects[0] ?? null

  // Auto-select first project if none selected
  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectIdState(projects[0].id)
    }
  }, [projectId, projects])

  const setProjectId = (id: string) => {
    localStorage.setItem(PROJECT_ID_KEY, id)
    setProjectIdState(id)
  }

  return (
    <ProjectContext.Provider
      value={{
        project,
        projectId: project?.id ?? '',
        setProjectId,
        projects,
        isLoading,
      }}
    >
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject(): ProjectState {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error('useProject must be used within ProjectProvider')
  }
  return context
}
