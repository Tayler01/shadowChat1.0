import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ignoredDirectories = new Set([
  '.git',
  '.netlify',
  'dist',
  'node_modules',
  'output',
])
const mojibakeMarkers = ['â€™', 'â€œ', 'â€', 'â€”', 'â€“', 'Â ', 'Â ', 'ï¿½']

const collectMarkdownFiles = directory => readdirSync(directory, { withFileTypes: true })
  .flatMap(entry => {
    if (entry.name.startsWith('.') && entry.name !== '.agents') return []
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : collectMarkdownFiles(absolute)
    }
    return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [absolute] : []
  })

const lineNumberAt = (source, index) => source.slice(0, index).split('\n').length

const normalizeTarget = rawTarget => {
  let target = rawTarget.trim()
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
  target = target.split(/\s+["']/)[0]
  target = target.split('#', 1)[0].split('?', 1)[0]
  try {
    target = decodeURIComponent(target)
  } catch {
    // The existence check below will report malformed encoded paths.
  }
  return target.replace(/:(\d+)$/, '')
}

const resolveLocalTarget = (sourceFile, rawTarget) => {
  const target = normalizeTarget(rawTarget)
  if (!target) return null
  if (/^(?:https?:|mailto:|tel:|app:|notion:|discussion:|#)/i.test(target)) return null
  const windowsTarget = /^\/[A-Z]:[\\/]/i.test(target) ? target.slice(1) : target
  if (/^[A-Z]:[\\/]/i.test(windowsTarget)) {
    const normalized = windowsTarget.replace(/\\/g, '/')
    const workspacePrefix = root.replace(/\\/g, '/')
    if (!normalized.toLowerCase().startsWith(workspacePrefix.toLowerCase())) return null
    return path.normalize(normalized)
  }
  return path.resolve(path.dirname(sourceFile), target)
}

const failures = []
const files = collectMarkdownFiles(root)

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const relativeFile = path.relative(root, file).replace(/\\/g, '/')

  for (const marker of mojibakeMarkers) {
    let index = source.indexOf(marker)
    while (index >= 0) {
      failures.push(`${relativeFile}:${lineNumberAt(source, index)} mojibake marker ${JSON.stringify(marker)}`)
      index = source.indexOf(marker, index + marker.length)
    }
  }

  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g
  for (const match of source.matchAll(linkPattern)) {
    const resolved = resolveLocalTarget(file, match[1])
    if (!resolved) continue
    if (!existsSync(resolved)) {
      failures.push(
        `${relativeFile}:${lineNumberAt(source, match.index ?? 0)} broken link ${match[1]}`
      )
      continue
    }
  }
}

if (failures.length > 0) {
  console.error(`Documentation integrity failed with ${failures.length} issue(s):`)
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Documentation integrity passed for ${files.length} Markdown files.`)
