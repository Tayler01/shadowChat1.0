import React from 'react'
import { RunnerDialog } from './components/RunnerDialog'

export interface ShadowRunnerScrollMenuAction {
  id: string
  label: string
  icon?: React.ReactNode
  onClick: () => void
  tone?: 'default' | 'danger'
}

interface ShadowRunnerScrollMenuProps {
  title: string
  subtitle?: string
  actions: ShadowRunnerScrollMenuAction[]
  onClose?: () => void
  children?: React.ReactNode
}

export function ShadowRunnerScrollMenu({ title, subtitle, actions, onClose, children }: ShadowRunnerScrollMenuProps) {
  return (
    <RunnerDialog title={title} eyebrow={subtitle} onClose={onClose}>
      <div className="runner-menu-actions">
        {actions.map(action => (
          <button key={action.id} type="button" onClick={action.onClick}
            className={`runner-command${action.tone === 'danger' ? ' runner-command-danger' : ' secondary'}`}>
            {action.icon && <span aria-hidden="true">{action.icon}</span>}
            {action.label}
          </button>
        ))}
      </div>
      {children}
    </RunnerDialog>
  )
}
