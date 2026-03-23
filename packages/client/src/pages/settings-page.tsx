import { useState } from 'react'
import { cn } from '@/lib/utils'

const tabs = [
  { id: 'repos', label: 'Kho mã nguồn' },
  { id: 'users', label: 'Người dùng' },
  { id: 'rules', label: 'Quy tắc' },
  { id: 'webhooks', label: 'Webhooks' },
] as const

type TabId = (typeof tabs)[number]['id']

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('repos')

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Cài đặt</h1>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'border-b-2 border-violet-500 text-zinc-50'
                : 'text-zinc-400 hover:text-zinc-200',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex flex-1 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50">
        <p className="text-sm text-zinc-500">
          Nội dung cho tab "{tabs.find((t) => t.id === activeTab)?.label}" sẽ hiển thị ở đây
        </p>
      </div>
    </div>
  )
}
