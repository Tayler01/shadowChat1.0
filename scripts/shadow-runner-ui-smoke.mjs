import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, webkit } from 'playwright'
import sharp from 'sharp'

const baseUrl = 'http://127.0.0.1:4176'
const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')))
const name = args['run-name'] ?? 'shadow-runner-ui-rebuild'
assert.match(name, /^[a-z0-9][a-z0-9._-]*$/i)
const output = path.resolve('output/playwright', name)
await mkdir(output, { recursive: true })
const profiles = [
  { name: 'android', engine: chromium, viewport: { width: 932, height: 430 } },
  { name: 'iphone', engine: webkit, viewport: { width: 740, height: 390 } },
  { name: 'compact', engine: chromium, viewport: { width: 568, height: 320 } },
  { name: 'portrait', engine: webkit, viewport: { width: 390, height: 844 } },
  { name: 'comfort', engine: webkit, viewport: { width: 740, height: 390 }, comfort: true },
].filter(profile => !args.profile || args.profile === profile.name)
const report = { baseUrl, scope: 'UI, portrait, comfort, input and recovery integration; not campaign route completion.', results: [] }

for (const profile of profiles) {
  const browser = await profile.engine.launch({ headless: true })
  const context = await browser.newContext({ viewport: profile.viewport, hasTouch: true, isMobile: true, serviceWorkers: 'block' })
  const page = await context.newPage()
  const result = { profile: profile.name, errors: [], checks: [] }
  page.on('pageerror', error => result.errors.push(error.message))
  try {
    await context.route('**/*', route => new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort())
    await context.routeWebSocket('**/*', socket => socket.close())
    await page.addInitScript(comfort => {
      localStorage.setItem('shadow-runner-music-enabled-v1', 'false')
      localStorage.setItem('shadow-runner-sfx-enabled-v1', 'false')
      localStorage.setItem('shadow-runner-campaign-progress-v1', JSON.stringify({ completedLevels: ['tutorial', ...Array.from({ length: 10 }, (_, i) => `level-${i + 1}`)] }))
      if (comfort) localStorage.setItem('shadowchat:comfort-preferences:v1', JSON.stringify({ version: 1, preset: 'custom', motion: 'none', transparency: 'solid', contrast: 'high', textScale: 130, touchTarget: 'large', gameMusic: false, gameSfx: false }))
    }, profile.comfort ?? false)
    const capture = async stage => {
      await page.waitForFunction(() => [...document.images].filter(image => {
        const box = image.getBoundingClientRect()
        return box.width && box.height && box.right > 0 && box.left < innerWidth && box.bottom > 0 && box.top < innerHeight
          && !image.closest('[aria-hidden="true"]')
      }).every(image => image.complete && image.naturalWidth > 0))
      const failures = await page.evaluate(() => {
        const problems = []
        if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('document horizontal overflow')
        for (const element of document.querySelectorAll('button,h1,h2,p,.runner-chapter-copy')) {
          const box = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          if (!box.width || !box.height || style.visibility === 'hidden' || box.bottom < 0 || box.top > innerHeight || element.closest('[aria-hidden="true"]')) continue
          if (element.scrollWidth > element.clientWidth + 2 && style.overflowX !== 'auto') problems.push(`text overflow: ${element.textContent?.trim().slice(0, 60)}`)
        }
        return problems
      })
      assert.deepEqual(failures, [], `${stage}: ${failures.join(', ')}`)
      if (stage === 'title') {
        const overlaps = await page.evaluate(() => {
          const art = document.querySelector('.runner-title-courier')?.getBoundingClientRect()
          const exit = document.querySelector('.runner-title-exit')?.getBoundingClientRect()
          const hits = (a, b) => a && b && a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom
          const elements = [...document.querySelectorAll('.runner-title-actions button,.runner-title h1,.runner-title-content p')]
            .filter(element => element.getBoundingClientRect().width && element.getBoundingClientRect().height)
          return elements.filter(element => hits(art, element.getBoundingClientRect()) || hits(exit, element.getBoundingClientRect())).map(element => element.textContent)
        })
        assert.deepEqual(overlaps, [], 'Title art and exit must not cover any title copy or menu commands')
      }
      await page.screenshot({ path: path.join(output, `${profile.name}-${stage}.png`) })
      result.checks.push(stage)
    }
    await page.goto(`${baseUrl}/?view=games&localPreview=shadow-runner`, { waitUntil: 'domcontentloaded' })
    if (profile.name === 'portrait') {
      await page.getByRole('dialog', { name: 'Rotate Phone' }).waitFor()
      await capture('title-rotate')
      await page.setViewportSize({ width: 740, height: 390 })
    }
    await page.getByRole('button', { name: 'Select Level', exact: true }).waitFor()
    await capture('title')
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.getByRole('dialog', { name: 'Options' }).waitFor()
    if (profile.name === 'portrait') {
      await page.setViewportSize(profile.viewport)
      const rotate = page.getByRole('dialog', { name: 'Rotate Phone' })
      await rotate.waitFor()
      await page.keyboard.press('Tab')
      assert.ok(await rotate.evaluate(element => element.contains(document.activeElement)), 'Rotation prompt owns keyboard focus')
      await page.keyboard.press('Escape')
      await capture('options-rotate')
      await page.setViewportSize({ width: 740, height: 390 })
      await page.getByRole('dialog', { name: 'Options' }).waitFor()
    }
    if (profile.comfort) assert.equal(await page.getByRole('checkbox', { name: /Sound effects/ }).isDisabled(), true)
    await capture('options')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Select Level', exact: true }).click()
    await capture('routes')
    for (const [title, stage] of [['Courier Catacombs', 'catacomb-chapter'], ['Captain Gate', 'captain-chapter'], ['Dawn Relay Spire', 'chapter']]) {
      await page.getByRole('button', { name: new RegExp(`${title} details`) }).click()
      if (title === 'Captain Gate') {
        assert.match(await page.getByRole('dialog', { name: title, exact: true }).innerText(), /Other couriers still defend/)
      }
      await capture(stage)
      const dialog = page.getByRole('dialog', { name: title, exact: true })
      const back = dialog.getByRole('button', { name: 'Return', exact: true })
      await back.scrollIntoViewIfNeeded()
      const commands = await dialog.evaluate(element => [...element.querySelectorAll('button')]
        .filter(button => /^(Replay|Return)$/.test(button.textContent.trim()))
        .map(button => {
          const box = button.getBoundingClientRect()
          const parent = element.getBoundingClientRect()
          return { label: button.textContent.trim(), box: box.toJSON(), parent: parent.toJSON(),
            visible: box.top >= Math.max(0, parent.top) - 1 && box.bottom <= Math.min(innerHeight, parent.bottom) + 1
              && box.left >= Math.max(0, parent.left) - 1 && box.right <= Math.min(innerWidth, parent.right) + 1
              && !button.disabled }
        }))
      assert.equal(commands.length, 2, `${title}: expected both chapter commands`)
      assert.deepEqual(commands.filter(command => !command.visible), [], `${title}: chapter commands must scroll fully into view`)
      await capture(`${stage}-actions`)
      await back.click()
      await dialog.waitFor({ state: 'hidden' })
    }
    await page.getByRole('tab', { name: 'Map', exact: true }).click()
    await capture('atlas')
    await page.getByRole('button', { name: 'Courier journal' }).click()
    if (profile.name === 'portrait') {
      await page.setViewportSize(profile.viewport)
      await page.getByRole('dialog', { name: 'Rotate Phone' }).waitFor()
      await page.keyboard.press('Escape')
      await capture('journal-rotate')
      await page.setViewportSize({ width: 740, height: 390 })
      await page.getByRole('dialog', { name: 'Courier journal' }).waitFor()
    }
    await capture('journal')
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await page.getByRole('button', { name: 'Back to Shadow Runner menu' }).click()
    await page.getByRole('button', { name: 'Save details' }).click()
    await capture('save')
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await page.getByRole('button', { name: 'Start Tutorial', exact: true }).click()
    if (profile.name === 'portrait') {
      await page.setViewportSize(profile.viewport)
      await page.getByRole('dialog', { name: 'Rotate Phone' }).waitFor()
      await capture('rotate')
      await page.setViewportSize({ width: 740, height: 390 })
    }
    await page.getByRole('button', { name: 'Begin delivery' }).waitFor({ timeout: 45000 })
    await capture('briefing')
    await page.getByRole('button', { name: 'Begin delivery' }).click()
    await page.getByRole('button', { name: 'Crouch', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Crouch', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: 'Jump', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Crouch', exact: true }).getAttribute('aria-pressed'), 'false')
    await page.waitForTimeout(500)
    await capture('play')
    const canvas = await page.locator('canvas').screenshot()
    const pixels = await sharp(canvas).stats()
    assert.ok(pixels.channels.slice(0, 3).some(channel => channel.stdev > 12), 'Canvas must contain visible scene pixels')
    await page.getByRole('button', { name: 'Open pause menu' }).click()
    await capture('pause')
    const before = await page.evaluate(() => window.__shadowRunnerDebug?.())
    await page.waitForTimeout(600)
    const after = await page.evaluate(() => window.__shadowRunnerDebug?.())
    assert.deepEqual(after, before, 'Pause must freeze game state')
    await page.getByRole('button', { name: 'Resume', exact: true }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: 'Pause', exact: true }).waitFor()
    if (['android', 'iphone', 'compact'].includes(profile.name)) {
      for (const [title, asset] of [['East Gate Run', 'act-one.webp'], ['Bell Tower Archives', 'act-two.webp'], ['Courier Catacombs', 'act-three.webp']]) {
        await page.getByRole('button', { name: 'Quit Level', exact: true }).click()
        await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
        await page.getByRole('button', { name: 'Select Level', exact: true }).click()
        await page.getByRole('button', { name: new RegExp(`${title} details`) }).click()
        await page.getByRole('dialog', { name: title, exact: true }).getByRole('button', { name: 'Replay', exact: true }).click()
        await page.getByRole('button', { name: 'Begin delivery' }).waitFor({ timeout: 45000 })
        assert.ok(await page.locator(`.runner-dialog-scene[src$="${asset}"]`).count(), `${title}: correct cinematic art`)
        await capture(`cinematic-${asset.replace('.webp', '')}`)
        await page.getByRole('button', { name: 'Begin delivery' }).click()
        const depthBefore = await page.evaluate(() => window.__shadowRunnerDebug?.().districtDepth)
        assert.ok(depthBefore?.length > 0, `${title}: separate depth props exist`)
        await page.keyboard.down('ArrowRight')
        await page.waitForTimeout(700)
        await page.keyboard.up('ArrowRight')
        const depthAfter = await page.evaluate(() => window.__shadowRunnerDebug?.().districtDepth)
        assert.ok(depthAfter?.every(prop => Number.isFinite(prop.x) && prop.height <= 300), `${title}: restrained rendered depth geometry`)
        await capture(`depth-${asset.replace('.webp', '')}`)
        await page.getByRole('button', { name: 'Open pause menu' }).click()
      }
    }
    assert.deepEqual(result.errors, [])
    result.status = 'passed'
  } catch (error) {
    result.status = 'failed'
    result.errors.push(error.message)
    await page.screenshot({ path: path.join(output, `${profile.name}-error.png`) }).catch(() => {})
  } finally {
    await context.close()
    await browser.close()
    report.results.push(result)
    await writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2))
    console.log(`${profile.name}: ${result.status}; ${result.checks.length} surfaces; ${result.errors.join('; ')}`)
  }
}
if (report.results.some(result => result.status === 'failed')) process.exitCode = 1
