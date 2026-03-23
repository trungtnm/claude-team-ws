const sections = [
  { id: 'running', label: 'Đang chạy', emptyText: 'Không có phiên đang chạy' },
  { id: 'queued', label: 'Đang chờ', emptyText: 'Hàng đợi trống' },
  { id: 'completed', label: 'Hoàn thành', emptyText: 'Chưa có phiên hoàn thành' },
] as const

export default function AgentsPage() {
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Agent Sessions</h1>

      {sections.map((section) => (
        <div key={section.id}>
          <h2 className="mb-3 text-lg font-semibold text-zinc-300">
            {section.label}
          </h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center text-sm text-zinc-500">
            {section.emptyText}
          </div>
        </div>
      ))}
    </div>
  )
}
