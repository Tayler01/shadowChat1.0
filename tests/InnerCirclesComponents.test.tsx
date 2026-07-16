import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import {
  InnerCircleDeleteDialog,
  InnerCircleDetail,
  InnerCircleEditorSheet,
  InnerCircleList,
  InnerCircleMemberPickerSheet,
  InnerCirclesHubTabs,
  ShadowPinCircleFilterSheet,
  type InnerCirclePerson,
  type InnerCircleSummary,
} from '../src/features/inner-circles/components'

const people: InnerCirclePerson[] = [
  { id: 'person-1', username: 'jj', display_name: 'JJ' },
  { id: 'person-2', username: 'francis', display_name: 'Francis' },
  { id: 'person-3', username: 'river', display_name: 'River' },
]

const circle: InnerCircleSummary = { id: 'circle-1', name: 'Night Watch', memberCount: 2 }

describe('Inner Circles controlled UI primitives', () => {
  test('People and Circles use an accessible roving tablist', async () => {
    function Harness() {
      const [selected, setSelected] = useState<'people' | 'circles'>('people')
      return <InnerCirclesHubTabs selected={selected} onChange={setSelected} peopleCount={8} circleCount={2} />
    }

    render(<Harness />)
    const peopleTab = screen.getByRole('tab', { name: /People/ })
    const circlesTab = screen.getByRole('tab', { name: /Circles/ })

    expect(screen.getByRole('tablist', { name: 'Connections hub sections' })).toBeInTheDocument()
    expect(peopleTab).toHaveAttribute('aria-selected', 'true')
    expect(circlesTab).toHaveAttribute('tabindex', '-1')

    peopleTab.focus()
    fireEvent.keyDown(peopleTab, { key: 'ArrowRight' })

    await waitFor(() => expect(circlesTab).toHaveFocus())
    expect(circlesTab).toHaveAttribute('aria-selected', 'true')
    expect(circlesTab).toHaveAttribute('aria-controls', 'connections-hub-panel-circles')
    expect(peopleTab).not.toHaveAttribute('aria-controls')
  })

  test('circle list explains privacy, enforces the passed limit, and emits card actions', () => {
    const onCreate = jest.fn()
    const onOpen = jest.fn()
    const onRename = jest.fn()
    const onDelete = jest.fn()
    const circles = Array.from({ length: 10 }, (_, index) => ({
      id: `circle-${index}`,
      name: `Circle ${index}`,
      memberCount: index,
    }))

    render(<InnerCircleList circles={circles} onCreate={onCreate} onOpen={onOpen} onRename={onRename} onDelete={onDelete} />)

    expect(screen.getByText(/Only you can see your circles/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /New Circle/ })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('10-circle limit')

    fireEvent.click(screen.getByRole('button', { name: 'Open Circle 1, 1 member' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rename Circle 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Circle 1' }))

    expect(onOpen).toHaveBeenCalledWith(circles[1])
    expect(onRename).toHaveBeenCalledWith(circles[1])
    expect(onDelete).toHaveBeenCalledWith(circles[1])
    expect(onCreate).not.toHaveBeenCalled()
  })

  test('create and rename editor traps focus, restores it, and stays controlled', async () => {
    const onSubmit = jest.fn()

    function Harness() {
      const [open, setOpen] = useState(false)
      const [name, setName] = useState('Night Watch')
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open editor</button>
          <InnerCircleEditorSheet
            open={open}
            mode="create"
            name={name}
            onNameChange={setName}
            onSubmit={() => { onSubmit(); setOpen(false) }}
            onClose={() => setOpen(false)}
          />
        </>
      )
    }

    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open editor' })
    trigger.focus()
    fireEvent.click(trigger)

    const input = screen.getByRole('textbox', { name: 'Circle name' })
    await waitFor(() => expect(input).toHaveFocus())
    expect(screen.getByTestId('inner-circle-editor-sheet')).toHaveClass('min-w-0')

    fireEvent.change(input, { target: { value: 'Close Friends' } })
    expect(input).toHaveValue('Close Friends')
    fireEvent.click(screen.getByRole('button', { name: 'Create Circle' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  test('delete confirmation describes its narrow effect and requires confirmation', () => {
    const onConfirm = jest.fn()
    const onClose = jest.fn()
    render(<InnerCircleDeleteDialog open circleName="Night Watch" onConfirm={onConfirm} onClose={onClose} />)

    expect(screen.getByRole('dialog', { name: 'Delete Night Watch?' })).toBeInTheDocument()
    expect(screen.getByText(/does not remove anyone from your Connections/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test('circle detail exposes member count, add, Message, and Remove actions', () => {
    const onAdd = jest.fn()
    const onMessage = jest.fn()
    const onRemove = jest.fn()
    render(
      <InnerCircleDetail
        circle={circle}
        members={people.slice(0, 2)}
        onBack={jest.fn()}
        onAddConnections={onAdd}
        onMessage={onMessage}
        onRemove={onRemove}
      />
    )

    expect(screen.getByText('2 members · private to you')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add Connections' }))
    fireEvent.click(screen.getByRole('button', { name: 'Message JJ' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove JJ from Night Watch' }))

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith(people[0])
    expect(onRemove).toHaveBeenCalledWith(people[0])
  })

  test('member picker only renders passed Connections and enforces the member cap', () => {
    const onSave = jest.fn()

    function Harness() {
      const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(['person-1', 'person-2']))
      const [query, setQuery] = useState('')
      return (
        <InnerCircleMemberPickerSheet
          open
          circleName="Night Watch"
          connections={people}
          selectedMemberIds={selected}
          query={query}
          onQueryChange={setQuery}
          onToggleMember={person => setSelected(current => {
            const next = new Set(current)
            if (next.has(person.id)) next.delete(person.id)
            else next.add(person.id)
            return next
          })}
          onSave={onSave}
          onClose={jest.fn()}
          memberLimit={2}
        />
      )
    }

    render(<Harness />)
    const jj = screen.getByRole('checkbox', { name: /JJ/ })
    const francis = screen.getByRole('checkbox', { name: /Francis/ })
    const river = screen.getByRole('checkbox', { name: /River/ })

    expect(jj).toHaveAttribute('aria-checked', 'true')
    expect(river).toBeDisabled()
    expect(screen.getAllByRole('status').some(status => status.textContent?.includes('2 of 2 members selected'))).toBe(true)
    expect(screen.getByText(/reached its 2-member limit/)).toBeInTheDocument()
    expect(screen.getByTestId('inner-circle-member-picker-footer')).toBeInTheDocument()

    fireEvent.click(francis)
    expect(river).not.toBeDisabled()
    fireEvent.click(river)
    expect(river).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Save Members' }))
    expect(onSave).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search accepted Connections' }), { target: { value: 'JJ' } })
    expect(screen.getByRole('checkbox', { name: /JJ/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /River/ })).not.toBeInTheDocument()
  })

  test('ShadowPin filter offers All Connections and controlled circle choices', () => {
    function Harness() {
      const [selected, setSelected] = useState<string | null>(null)
      return <ShadowPinCircleFilterSheet open circles={[circle]} selectedCircleId={selected} onSelect={setSelected} onClose={jest.fn()} />
    }

    render(<Harness />)
    const all = screen.getByRole('radio', { name: /All Connections/ })
    const nightWatch = screen.getByRole('radio', { name: /Night Watch/ })

    expect(all).toHaveAttribute('aria-checked', 'true')
    all.focus()
    fireEvent.keyDown(all, { key: 'ArrowRight' })
    expect(nightWatch).toHaveFocus()
    expect(nightWatch).toHaveAttribute('aria-checked', 'true')
    expect(all).toHaveAttribute('aria-checked', 'false')
    fireEvent.keyDown(nightWatch, { key: 'Home' })
    expect(all).toHaveFocus()
    expect(all).toHaveAttribute('aria-checked', 'true')
  })

  test('ShadowPin filter distinguishes refresh, failure, and the no-circle setup path', () => {
    const onRetry = jest.fn()
    const onManage = jest.fn()
    const { rerender } = render(
      <ShadowPinCircleFilterSheet
        open
        circles={[]}
        loading
        selectedCircleId={null}
        onSelect={jest.fn()}
        onRetry={onRetry}
        onManage={onManage}
        onClose={jest.fn()}
      />
    )

    expect(screen.getByRole('status')).toHaveTextContent('Refreshing Inner Circles')
    expect(screen.queryByRole('button', { name: 'Create an Inner Circle' })).not.toBeInTheDocument()

    rerender(
      <ShadowPinCircleFilterSheet
        open
        circles={[]}
        error="Inner Circles are unavailable right now."
        selectedCircleId={null}
        onSelect={jest.fn()}
        onRetry={onRetry}
        onManage={onManage}
        onClose={jest.fn()}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Inner Circles are unavailable right now.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)

    rerender(
      <ShadowPinCircleFilterSheet
        open
        circles={[]}
        selectedCircleId={null}
        onSelect={jest.fn()}
        onRetry={onRetry}
        onManage={onManage}
        onClose={jest.fn()}
      />
    )

    expect(screen.getByText('Create an Inner Circle from Connections to add another filter.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create an Inner Circle' }))
    expect(onManage).toHaveBeenCalledTimes(1)
  })
})
