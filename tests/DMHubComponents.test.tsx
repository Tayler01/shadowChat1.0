import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DMHubInboxControls } from '../src/components/dms/hub/DMHubInboxControls'
import { DMHubConversationRow } from '../src/components/dms/hub/DMHubConversationRow'
import { DMHubConversationDetailsSheet } from '../src/components/dms/hub/DMHubConversationDetailsSheet'

jest.mock('../src/components/ui/Avatar', () => ({
  Avatar: ({ alt }: { alt: string }) => <span data-testid="avatar">{alt}</span>,
}))

describe('DM Hub presentational components', () => {
  test('inbox controls expose a labelled search, clear action, and pressed modes', () => {
    const onQueryChange = jest.fn()
    const onModeChange = jest.fn()

    render(
      <DMHubInboxControls
        query="tay"
        onQueryChange={onQueryChange}
        mode="unread"
        onModeChange={onModeChange}
        counts={{ inbox: 12, unread: 3, archived: 2 }}
      />
    )

    expect(screen.getByRole('searchbox', { name: 'Search conversations' })).toHaveValue('tay')
    expect(screen.getByRole('button', { name: 'Unread, 3' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Inbox, 12' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Inbox, 12' })).toHaveClass('min-h-12')

    fireEvent.click(screen.getByRole('button', { name: 'Archived, 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear conversation search' }))

    expect(onModeChange).toHaveBeenCalledWith('archived')
    expect(onQueryChange).toHaveBeenCalledWith('')
  })

  test('conversation row exposes rich state and routes row actions through an accessible sheet', async () => {
    const onOpen = jest.fn()
    const onTogglePin = jest.fn()
    const onToggleArchive = jest.fn()
    const onToggleRead = jest.fn()
    const onToggleMute = jest.fn()

    render(
      <DMHubConversationRow
        conversation={{
          id: 'conversation-1',
          displayName: 'Tayler',
          username: 'tayler',
          preview: 'Latest message',
          timestamp: '2026-07-11T16:00:00.000Z',
          timestampLabel: '4:00 PM',
          unreadCount: 3,
          pinned: false,
          muted: true,
          draftPreview: 'Finish this thought',
          lastMessageKind: 'text',
        }}
        selected
        onOpen={onOpen}
        onTogglePin={onTogglePin}
        onToggleArchive={onToggleArchive}
        onToggleRead={onToggleRead}
        onToggleMute={onToggleMute}
      />
    )

    const row = screen.getByRole('button', {
      name: /Tayler, @tayler\. Finish this thought\. 3 unread, draft, muted, 4:00 PM/i,
    })
    expect(row).toHaveAttribute('aria-current', 'true')
    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledWith('conversation-1')

    const actionsTrigger = screen.getByRole('button', { name: 'Conversation actions for Tayler' })
    expect(actionsTrigger).toHaveClass('h-12', 'w-12')
    fireEvent.click(actionsTrigger)

    expect(await screen.findByRole('dialog', { name: 'Tayler' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mark as read/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Resume notifications/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Pin conversation/i }))
    expect(onTogglePin).toHaveBeenCalledWith('conversation-1', true)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tayler' })).not.toBeInTheDocument())
  })

  test('conversation details provide the locked high-value destinations and restore focus on close', async () => {
    const onClose = jest.fn()
    const onSearch = jest.fn()
    const onOpenShared = jest.fn()
    const onToggleNotifications = jest.fn()
    const onOpenProfile = jest.fn()
    const onToggleBlock = jest.fn()

    const { rerender } = render(
      <DMHubConversationDetailsSheet
        open
        onClose={onClose}
        conversationId="conversation-2"
        displayName="Francis"
        username="francis"
        muted
        blockedByMe={false}
        onSearch={onSearch}
        onOpenShared={onOpenShared}
        onToggleNotifications={onToggleNotifications}
        onOpenProfile={onOpenProfile}
        onToggleBlock={onToggleBlock}
      />
    )

    expect(screen.getByRole('dialog', { name: 'Conversation details' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Search conversation/i })).toHaveClass('min-h-12')
    expect(screen.getByRole('button', { name: /Shared media, files & links/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Resume notifications/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /View profile/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Block Francis/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Resume notifications/i }))
    expect(onToggleNotifications).toHaveBeenCalledWith('conversation-2', false)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Search conversation/i }))
    expect(onClose).not.toHaveBeenCalled()
    expect(onSearch).toHaveBeenCalledWith('conversation-2')

    fireEvent.click(screen.getByRole('button', { name: /Block Francis/i }))
    expect(screen.getByRole('alertdialog', { name: 'Confirm blocking Francis' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus())
    expect(onToggleBlock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Block Francis/i })).toHaveFocus())

    fireEvent.click(screen.getByRole('button', { name: /Block Francis/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm block' }))
    expect(onToggleBlock).toHaveBeenCalledWith('conversation-2', true)

    rerender(
      <DMHubConversationDetailsSheet
        open={false}
        onClose={onClose}
        conversationId="conversation-2"
        displayName="Francis"
        onSearch={onSearch}
        onOpenShared={onOpenShared}
        onToggleNotifications={onToggleNotifications}
        onOpenProfile={onOpenProfile}
        onToggleBlock={onToggleBlock}
      />
    )
    expect(screen.queryByRole('dialog', { name: 'Conversation details' })).not.toBeInTheDocument()
  })

  test('bottom sheets close with Escape and return focus to their trigger', async () => {
    render(
      <DMHubConversationRow
        conversation={{ id: 'conversation-3', displayName: 'Shado', preview: 'Hello' }}
        onOpen={jest.fn()}
      />
    )

    const trigger = screen.getByRole('button', { name: 'Conversation actions for Shado' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(await screen.findByRole('dialog', { name: 'Shado' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Shado' })).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  test('conversation row restores focus when a read action removes it from the active view', async () => {
    const onRowRemovedFocusFallback = jest.fn()
    const onToggleRead = jest.fn(() => {
      const removedRowControl = document.createElement('button')
      document.body.appendChild(removedRowControl)
      removedRowControl.focus()
      removedRowControl.remove()
    })

    render(
      <DMHubConversationRow
        conversation={{ id: 'conversation-4', displayName: 'Francis', preview: 'Unread message', unreadCount: 1 }}
        onOpen={jest.fn()}
        onToggleRead={onToggleRead}
        onRowRemovedFocusFallback={onRowRemovedFocusFallback}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Conversation actions for Francis' }))
    fireEvent.click(await screen.findByRole('button', { name: /Mark as read/i }))

    await waitFor(() => expect(onRowRemovedFocusFallback).toHaveBeenCalledTimes(1))
  })
})
