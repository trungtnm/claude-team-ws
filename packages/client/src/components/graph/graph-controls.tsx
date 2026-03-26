import { useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { Maximize2, ZoomIn, ZoomOut, Route } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface GraphControlsProps {
  onToggleCriticalPath: (enabled: boolean) => void
}

export function GraphControls({ onToggleCriticalPath }: GraphControlsProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow()
  const [criticalPathHighlighted, setCriticalPathHighlighted] = useState(true)

  const handleToggleCriticalPath = () => {
    const next = !criticalPathHighlighted
    setCriticalPathHighlighted(next)
    onToggleCriticalPath(next)
  }

  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
      <Button
        variant="secondary"
        size="icon"
        onClick={() => fitView({ padding: 0.2, duration: 300 })}
        aria-label="Fit View"
        title="Fit View"
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        onClick={() => zoomIn({ duration: 200 })}
        aria-label="Zoom In"
        title="Zoom In"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        onClick={() => zoomOut({ duration: 200 })}
        aria-label="Zoom Out"
        title="Zoom Out"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        onClick={handleToggleCriticalPath}
        aria-label="Toggle Critical Path"
        title="Toggle Critical Path"
        className={cn(criticalPathHighlighted && 'ring-2 ring-accent')}
      >
        <Route className="h-4 w-4" />
      </Button>
    </div>
  )
}
