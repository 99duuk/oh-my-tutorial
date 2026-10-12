import { createServer } from 'node:http'
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { extname, resolve, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright-core'

const root = fileURLToPath(new URL('../', import.meta.url))
const render = process.argv.includes('--render')
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const path = resolve(root, `.${pathname}`)
    if (relative(root, path).startsWith('..')) { response.writeHead(403).end(); return }
    const mime = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.gif': 'image/gif' }
    response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream')
    response.end(await readFile(path))
  } catch { response.writeHead(404).end('Not found') }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const images = resolve(root, 'docs/images')
let browser
let frames
const screenshots = []
const checks = []
function assert(condition, message) { if (!condition) throw Error(message) }
try {
  browser = await chromium.launch({ headless: true, ...(process.env.TUTORIAL_BROWSER ? { executablePath: process.env.TUTORIAL_BROWSER } : {}) })
  const page = await browser.newPage({ viewport: { width: 1120, height: 740 }, reducedMotion: 'reduce' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  if (render) {
    await mkdir(images, { recursive: true })
    frames = await mkdtemp(resolve(tmpdir(), 'omt-visuals-'))
    await page.setViewportSize({ width: 1280, height: 680 })
    await page.goto(`${base}/docs/visuals/hero.html`)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: resolve(images, 'hero.png') })
    await page.setViewportSize({ width: 1120, height: 740 })
  }
  await page.goto(`${base}/docs/demo.html`)
  await page.evaluate(() => document.fonts.ready)
  async function capture() {
    if (!render) return
    const path = resolve(frames, `frame-${screenshots.length}.png`)
    await page.screenshot({ path })
    screenshots.push(path)
  }
  await capture()
  await page.locator('#start').click()
  assert(await page.locator('#practice').isVisible(), 'Start must open the practice view')
  checks.push('lesson start')
  await capture()
  await page.locator('#save').click()
  assert((await page.locator('#error').innerText()).includes('시간'), 'Missing time must block creation')
  assert(await page.locator('#result').isHidden(), 'No result before a valid save')
  checks.push('time validation')
  await page.locator('[data-time="10:00"]').click()
  assert((await page.locator('#progress').innerText()).includes('2 / 3'), 'Selecting a time advances only to input')
  await page.locator('#save').click()
  assert((await page.locator('#error').innerText()).includes('이름'), 'Empty name must stay in the exercise')
  assert((await page.locator('#progress').innerText()).includes('2 / 3'), 'Invalid save must not complete')
  checks.push('name validation and completion gate')
  await capture()
  await page.locator('#guest').fill('김연습')
  await capture()
  await page.locator('#save').click()
  assert((await page.locator('#result-text').innerText()) === '10:00 · 김연습', 'Saved result must match user input')
  assert(await page.locator('#complete').isHidden(), 'Saving must still leave result confirmation')
  checks.push('creation and result confirmation')
  await capture()
  if (render) await page.screenshot({ path: resolve(images, 'result.png') })
  await page.locator('#confirm').click()
  assert(await page.locator('#complete').isVisible(), 'Result confirmation completes the lesson')
  checks.push('lesson completion')
  await capture()
  await page.locator('#restart').click()
  assert((await page.locator('#guest').inputValue()) === '', 'Restart must clear practice input')
  assert(await page.locator('#result').isHidden(), 'Restart must reset prior result')
  assert((await page.locator('#progress').innerText()).includes('1 / 3'), 'Restart must reset current step')
  checks.push('restart with fresh practice state')
  await page.locator('#exit').click()
  assert(await page.locator('#menu').isVisible(), 'Exit must return to the learning menu')
  assert(await page.locator('#start').evaluate(el => el === document.activeElement), 'Exit must restore focus')
  checks.push('exit and focus restoration')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('#start').click()
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile layout must not overflow horizontally')
  await page.locator('[data-time="11:00"]').click()
  await page.locator('#guest').fill('모바일 연습')
  await page.locator('#guest').press('Enter')
  assert((await page.locator('#result-text').innerText()) === '11:00 · 모바일 연습', 'Narrow layout must support form submission')
  await page.locator('#confirm').click()
  await page.locator('#back').click()
  assert(await page.locator('#menu').isVisible(), 'Narrow layout must support completion and return')
  checks.push('390px layout and keyboard form submission')
  assert(errors.length === 0, errors.join('\n'))
  if (render) {
    const manifest = resolve(frames, 'frames.txt')
    const content = screenshots.map(path => `file '${path.replaceAll("'", "'\\''")}'\nduration 2.5`).join('\n')
    await writeFile(manifest, `${content}\nfile '${screenshots.at(-1).replaceAll("'", "'\\''")}'\n`)
    const gif = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', manifest,
      '-filter_complex', '[0:v]fps=5,scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
      '-loop', '0', resolve(images, 'walkthrough.gif')], { encoding: 'utf8' })
    if (gif.error) throw gif.error
    assert(gif.status === 0, gif.stderr)
  }
  console.log(JSON.stringify({ demoChecks: checks.length, checks, renderedImages: render }, null, 2))
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
  if (frames) await rm(frames, { recursive: true, force: true })
}
