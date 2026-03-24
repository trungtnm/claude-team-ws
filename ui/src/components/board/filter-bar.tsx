import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBoardStore } from '@/stores/board-store'
import { epics } from '@/data/epics'

const uniqueLabels = Array.from(
  new Set(epics.flatMap((e) => e.labels)),
).sort()

export function FilterBar() {
  const { filterType, filterLabel, searchQuery, setFilterType, setFilterLabel, setSearchQuery } =
    useBoardStore()

  return (
    <div className="flex items-center gap-3">
      <Select value={filterType} onValueChange={setFilterType}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="All Types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="feature">Feature</SelectItem>
          <SelectItem value="bug">Bug</SelectItem>
          <SelectItem value="task">Task</SelectItem>
          <SelectItem value="docs">Docs</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filterLabel} onValueChange={setFilterLabel}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="All Labels" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Labels</SelectItem>
          {uniqueLabels.map((label) => (
            <SelectItem key={label} value={label}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <Input
          placeholder="Search epics..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-[220px] pl-9"
        />
      </div>
    </div>
  )
}
