import { Settings2, GitBranch, Users, BookOpen, Webhook, Shield } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ProjectTab } from '@/components/settings/project-tab'
import { ReposTab } from '@/components/settings/repos-tab'
import { UsersTab } from '@/components/settings/users-tab'
import { RulesTab } from '@/components/settings/rules-tab'
import { WebhooksTab } from '@/components/settings/webhooks-tab'
import { SafetyTab } from '@/components/settings/safety-tab'

const tabs = [
  { value: 'project', label: 'Project', icon: Settings2 },
  { value: 'repos', label: 'Repositories', icon: GitBranch },
  { value: 'users', label: 'Users', icon: Users },
  { value: 'rules', label: 'Rules', icon: BookOpen },
  { value: 'webhooks', label: 'Webhooks', icon: Webhook },
  { value: 'safety', label: 'Safety', icon: Shield },
] as const

export default function SettingsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden p-6">
      <h1 className="text-xl font-semibold text-ink">Settings</h1>

      <Tabs defaultValue="project" className="flex flex-1 flex-col overflow-hidden">
        <TabsList>
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
                <Icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            )
          })}
        </TabsList>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="project">
            <ProjectTab />
          </TabsContent>
          <TabsContent value="repos">
            <ReposTab />
          </TabsContent>
          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
          <TabsContent value="rules">
            <RulesTab />
          </TabsContent>
          <TabsContent value="webhooks">
            <WebhooksTab />
          </TabsContent>
          <TabsContent value="safety">
            <SafetyTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
