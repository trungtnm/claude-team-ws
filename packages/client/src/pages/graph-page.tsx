export default function GraphPage() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Dependency Graph</h1>

      <div className="flex flex-1 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50">
        <p className="text-sm text-zinc-500">
          Đồ thị phụ thuộc sẽ hiển thị ở đây (React Flow)
        </p>
      </div>
    </div>
  )
}
