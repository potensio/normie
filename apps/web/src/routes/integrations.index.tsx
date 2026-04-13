/**
 * Integrations Route - /integrations
 * 
 * Shows the integrations management page.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/contexts/AuthContext'
import { IntegrationsPage } from '@/pages/IntegrationsPage'

export const Route = createFileRoute('/integrations/')({
  component: IntegrationsComponent,
})

function IntegrationsComponent() {
  const { currentWorkspace } = useAuth()

  return (
    <IntegrationsPage
      workspaceId={currentWorkspace?.id || ''}
      workspaceName={currentWorkspace?.name || 'Unknown'}
      onBack={() => {}}
    />
  )
}
