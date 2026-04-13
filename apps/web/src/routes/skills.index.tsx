/**
 * Skills Route - /skills
 * 
 * Shows the skills management page.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/contexts/AuthContext'
import { SkillsPage } from '@/pages/SkillsPage'

export const Route = createFileRoute('/skills/')({
  component: SkillsComponent,
})

function SkillsComponent() {
  const { currentWorkspace } = useAuth()

  return (
    <SkillsPage
      workspaceId={currentWorkspace?.id || ''}
      workspaceName={currentWorkspace?.name || 'Unknown'}
    />
  )
}
