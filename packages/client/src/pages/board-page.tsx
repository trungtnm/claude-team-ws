const columns = [
  { id: 'blocked', label: 'Blocked' },
  { id: 'ready', label: 'Sẵn sàng' },
  { id: 'in_progress', label: 'Đang thực hiện' },
  { id: 'in_review', label: 'Đang xem xét' },
  { id: 'done', label: 'Hoàn thành' },
] as const

export default function BoardPage() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Epic Board</h1>

      <div className="grid flex-1 auto-cols-fr grid-flow-col gap-4">
        {columns.map((col) => (
          <div
            key={col.id}
            className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
          >
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">
              {col.label}
            </h2>
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center justify-center rounded-lg border border-dashed border-zinc-700 p-8 text-xs text-zinc-500">
                Kéo epic vào đây
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
