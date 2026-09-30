const params = new URLSearchParams(location.search)
const editorMode = ['textarea', 'input', 'editable', 'plain'].includes(params.get('editor')) ? params.get('editor') : 'textarea'
const pickerMode = ['none', 'hidden', 'css', 'offscreen', 'untabbable'].includes(params.get('picker')) ? params.get('picker') : 'none'
const formMode = params.get('form') === 'yes' ? 'yes' : 'no'
const choices = (id, key, values, current) => {
  for (const [value, label] of values) {
    const link = document.createElement('a')
    const next = new URL(location.href)
    next.searchParams.set(key, value)
    link.href = next.href
    link.textContent = label
    if (value === current) link.setAttribute('aria-current', 'true')
    document.getElementById(id).append(link)
  }
}
choices('editors', 'editor', [['textarea', 'Textarea'], ['input', 'Text input'], ['editable', 'Contenteditable'], ['plain', 'Plain editable']], editorMode)
choices('pickers', 'picker', [['none', 'Absent'], ['hidden', 'Hidden attribute'], ['css', 'Display none'], ['offscreen', 'Offscreen'], ['untabbable', 'Offscreen, no tab']], pickerMode)
choices('forms', 'form', [['no', 'No form'], ['yes', 'Inside form']], formMode)
const entry = document.getElementById('entry')
const host = formMode === 'yes' ? document.createElement('form') : document.createElement('div')
host.addEventListener('submit', event => event.preventDefault())
entry.append(host)
const editor = document.createElement(editorMode === 'textarea' ? 'textarea' : editorMode === 'input' ? 'input' : 'div')
editor.id = 'editor'
editor.setAttribute('aria-label', 'Keyboard test entry')
if (editorMode === 'editable' || editorMode === 'plain') {
  editor.contentEditable = editorMode === 'plain' ? 'plaintext-only' : 'true'
  editor.setAttribute('role', 'textbox')
  editor.setAttribute('aria-multiline', 'true')
} else {
  editor.setAttribute('autocomplete', 'off')
  editor.setAttribute('autocapitalize', 'sentences')
  if (editorMode === 'input') editor.type = 'text'
}
host.append(editor)
if (pickerMode !== 'none') {
  const picker = document.createElement('input')
  picker.type = 'file'
  picker.setAttribute('aria-label', 'Test file picker')
  if (pickerMode === 'hidden') picker.hidden = true
  else if (pickerMode === 'css') picker.style.display = 'none'
  else { picker.style.position = 'absolute'; picker.style.left = '-10000px'; picker.style.opacity = '0' }
  if (pickerMode === 'untabbable') picker.tabIndex = -1
  host.append(picker)
}
const events = []
const updateContext = () => {
  document.getElementById('context').textContent = `Home-screen context: ${navigator.standalone === true}\nEditor: ${editorMode}; picker: ${pickerMode}; form: ${formMode}\nViewport: ${Math.round(window.visualViewport?.width || innerWidth)} x ${Math.round(window.visualViewport?.height || innerHeight)}\n${navigator.userAgent}`
}
for (const type of ['focus', 'blur', 'beforeinput', 'input', 'compositionstart', 'compositionend', 'paste']) {
  editor.addEventListener(type, event => {
    events.push(`${type}${event.inputType ? `: ${event.inputType}` : ''}`)
    document.getElementById('events').textContent = events.slice(-12).join('\n')
    updateContext()
  })
}
window.visualViewport?.addEventListener('resize', updateContext)
document.getElementById('send').addEventListener('click', () => {
  if ('value' in editor) editor.value = ''
  else editor.textContent = ''
  editor.focus()
})
document.getElementById('dismiss').addEventListener('click', () => editor.blur())
updateContext()
