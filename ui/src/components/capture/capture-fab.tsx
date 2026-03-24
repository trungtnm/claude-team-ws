import { useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCaptureStore } from '@/stores/capture-store'

export function CaptureFab() {
  const { composerOpen, toggleComposer, captures } = useCaptureStore()
  const pendingCount = captures.filter((c) => c.status === 'pending').length
  const shouldPulse = pendingCount === 0 && !composerOpen

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        toggleComposer()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleComposer])

  return (
    <button
      type="button"
      onClick={toggleComposer}
      aria-label={composerOpen ? 'Close capture composer' : 'Open capture composer'}
      className={cn(
        'fixed bottom-6 right-6 z-50',
        'flex h-14 w-14 items-center justify-center rounded-full',
        'bg-accent text-surface-base',
        'transition-all duration-200 ease-out',
        'hover:scale-105 cursor-pointer',
        composerOpen
          ? 'shadow-[0_4px_24px_rgba(245,158,11,0.4)] rotate-0'
          : 'shadow-[0_4px_20px_rgba(245,158,11,0.25)] hover:shadow-[0_4px_24px_rgba(245,158,11,0.4)]',
        shouldPulse && 'animate-[fab-pulse_2s_ease-in-out_infinite]',
      )}
    >
      <div
        className={cn(
          'transition-transform duration-200',
          composerOpen && 'rotate-45',
        )}
      >
        {composerOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </div>
    </button>
  )
}
