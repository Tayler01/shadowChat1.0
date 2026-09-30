import { captureMessageScrollAnchor, restoreMessageScrollAnchor, saveMessageScrollAnchor, getSavedMessageScrollAnchor, scrollMessageWithinContainer } from '../src/lib/messageScrollAnchor'

function rect(top: number, height = 80) { return { top, bottom: top + height, height, left: 0, right: 400, width: 400, x: 0, y: top, toJSON: () => ({}) } as DOMRect }

test('restores the same ID and offset after a capped prepend or media growth changes total height', () => {
  const container = document.createElement('div')
  container.getBoundingClientRect = () => rect(100, 400)
  let rowTop = 120
  const row = document.createElement('div')
  row.dataset.messageId = 'anchor'
  row.getBoundingClientRect = () => rect(rowTop)
  container.append(row)
  container.scrollTop = 500
  const anchor = captureMessageScrollAnchor(container)
  expect(anchor).toEqual({ id: 'anchor', offset: 20 })
  rowTop = 370
  expect(restoreMessageScrollAnchor(container, anchor)).toBe(true)
  expect(container.scrollTop).toBe(750)
})

test('saved anchors are scoped by account and surface and can be explicitly cleared', () => {
  saveMessageScrollAnchor('reader-a', 'dm:one', { id: 'row', offset: -12 })
  expect(getSavedMessageScrollAnchor('reader-b', 'dm:one')).toBeNull()
  expect(getSavedMessageScrollAnchor('reader-a', 'dm:two')).toBeNull()
  expect(getSavedMessageScrollAnchor('reader-a', 'dm:one')).toEqual({ id: 'row', offset: -12 })
  saveMessageScrollAnchor('reader-a', 'dm:one', null)
  expect(getSavedMessageScrollAnchor('reader-a', 'dm:one')).toBeNull()
})

test('exact target positioning changes only the owning container', () => {
  const outer = document.createElement('div')
  const container = document.createElement('div')
  const target = document.createElement('div')
  outer.append(container); container.append(target)
  outer.scrollTop = 55
  container.scrollTop = 120
  Object.defineProperty(container, 'clientHeight', { value: 400 })
  container.getBoundingClientRect = () => rect(100, 400)
  target.getBoundingClientRect = () => rect(260)
  target.scrollIntoView = jest.fn()
  scrollMessageWithinContainer(container, target, 'center')
  expect(container.scrollTop).toBe(120)
  expect(outer.scrollTop).toBe(55)
  expect(target.scrollIntoView).not.toHaveBeenCalled()
})

test('start alignment honors the scrollport padding above a floating DM header', () => {
  const container = document.createElement('div')
  const target = document.createElement('div')
  container.append(target)
  container.style.scrollPaddingTop = '64px'
  container.scrollTop = 120
  container.getBoundingClientRect = () => rect(100, 400)
  target.getBoundingClientRect = () => rect(260)

  scrollMessageWithinContainer(container, target, 'start')

  expect(container.scrollTop).toBe(216)
})

test('exact target centers inside the area between mobile header and composer', () => {
  const surface = document.createElement('div')
  const container = document.createElement('div')
  const footer = document.createElement('div')
  const target = document.createElement('div')
  surface.append(container, footer)
  container.append(target)
  footer.dataset.mobileChatFooter = 'true'
  container.style.scrollPaddingTop = '64px'
  container.scrollTop = 120
  container.getBoundingClientRect = () => rect(100, 400)
  footer.getBoundingClientRect = () => rect(400, 100)
  target.getBoundingClientRect = () => rect(350)

  scrollMessageWithinContainer(container, target, 'center')

  expect(container.scrollTop).toBe(228)
})
