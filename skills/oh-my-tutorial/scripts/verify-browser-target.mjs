// Optional regression runner. Dependencies stay in the supplied tooling directory.
// Usage: node scripts/verify-browser-target.mjs <tooling-directory> [chromium-executable]
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [toolingDirectory, executablePath] = process.argv.slice(2)
if (!toolingDirectory) {
  console.error('Usage: node scripts/verify-browser-target.mjs <tooling-directory> [chromium-executable]')
  process.exit(2)
}
const requireTool = createRequire(resolve(toolingDirectory, 'package.json'))
const { chromium } = requireTool('playwright-core')
const ts = requireTool('typescript')
const assetPath = fileURLToPath(new URL('../assets/browser-target.ts', import.meta.url))
const compilerOptions = {
  strict: true,
  noUncheckedIndexedAccess: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  types: [],
  noEmit: true,
}
const program = ts.createProgram([assetPath], compilerOptions)
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: value => value,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }))
  process.exit(1)
}
const source = ts.transpileModule(await readFile(assetPath, 'utf8'), {
  compilerOptions: { ...compilerOptions, noEmit: false },
}).outputText
const server = createServer((request, response) => {
  response.setHeader('Content-Type', request.url === '/helper.js' ? 'text/javascript' : 'text/html')
  response.end(request.url === '/helper.js' ? source : '<!doctype html><html><body><main id="fixture"></main></body></html>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  const checks = await page.evaluate(async () => {
    const api = await import('/helper.js')
    window.targetApi = api
    const { inspectTutorialTarget: inspect, waitForTutorialTarget: wait } = api
    const fixture = document.querySelector('#fixture')
    const checks = []
    const assert = (condition, message) => { if (!condition) throw Error(message) }
    const html = value => { fixture.innerHTML = value }
    const test = async (name, run) => { await run(); checks.push(name); html('') }
    const expectError = async (promise, check) => {
      let rejected = false
      try { await promise } catch (error) { rejected = true; check(error) }
      assert(rejected, 'Expected rejection')
    }
    const nativeRaf = window.requestAnimationFrame.bind(window)
    const nativeCancel = window.cancelAnimationFrame.bind(window)
    const nativeTimeout = window.setTimeout.bind(window)
    const nativeClear = window.clearTimeout.bind(window)
    // Track only resources owned by the helper, not the test's scheduling.
    const frames = new Set()
    const timers = new Set()
    window.requestAnimationFrame = callback => {
      const id = nativeRaf(time => { frames.delete(id); callback(time) })
      frames.add(id)
      return id
    }
    window.cancelAnimationFrame = id => { frames.delete(id); nativeCancel(id) }
    window.setTimeout = (callback, delay) => {
      const id = nativeTimeout(() => { timers.delete(id); callback() }, delay)
      timers.add(id)
      return id
    }
    window.clearTimeout = id => { timers.delete(id); nativeClear(id) }
    const idle = () => assert(frames.size === 0 && timers.size === 0, 'Leaked RAF or timer')
    const options = (overrides = {}) => ({ selector: '[data-target]', root: fixture, signal: new AbortController().signal, timeoutMs: 800, ...overrides })
    try {
      await test('missing and invalid selector are distinct', () => {
        assert(inspect('[data-target]', fixture).status === 'missing', 'Missing target')
        assert(inspect('[', fixture).status === 'invalid-selector', 'Invalid selector')
      })
      await test('hidden and transparent ancestors are excluded', () => {
        html('<div style="display:none"><button data-target>Hidden</button></div><div style="opacity:0"><button data-target>Transparent</button></div><button data-target id="visible">Visible</button>')
        const result = inspect('[data-target]', fixture)
        assert(result.status === 'ready' && result.element.id === 'visible' && result.matches === 3, 'Wrong candidate')
      })
      await test('zero size, visibility, and content-visibility are excluded', () => {
        html('<span data-target style="display:inline-block;width:0;height:0"></span><button data-target style="visibility:hidden">X</button><div style="content-visibility:hidden"><button data-target>X</button></div>')
        assert(inspect('[data-target]', fixture).status === 'hidden', 'Hidden target reported ready')
      })
      await test('multiple rendered candidates fail closed including offscreen duplicates', () => {
        html('<button data-target>A</button><button data-target style="position:absolute;top:5000px">B</button>')
        const result = inspect('[data-target]', fixture)
        assert(result.status === 'ambiguous' && result.rendered === 2, 'Arbitrary first candidate chosen')
      })
      await test('page scope isolates reused selectors', () => {
        html('<section id="first"><button data-target>A</button></section><section id="second"><button data-target id="expected">B</button></section>')
        assert(inspect('[data-target]', fixture.querySelector('#second')).element.id === 'expected', 'Scope ignored')
      })
      await test('unique offscreen target remains available for scrolling', () => {
        html('<button data-target style="position:absolute;top:5000px">A</button>')
        assert(inspect('[data-target]', fixture).status === 'ready', 'Offscreen excluded')
      })
      await test('detached nodes are never ready', () => {
        const detached = document.createElement('div')
        detached.innerHTML = '<button data-target>A</button>'
        assert(inspect('[data-target]', detached).status === 'hidden', 'Detached target accepted')
      })
      await test('late mount resolves and releases resources', async () => {
        const result = wait(options())
        nativeTimeout(() => html('<button data-target id="late">Late</button>'), 30)
        assert((await result).id === 'late', 'Late target not returned')
        idle()
      })
      await test('CSS opacity animation without DOM mutations becomes ready', async () => {
        html('<style>@keyframes reveal { from { opacity:0 } to { opacity:1 } }</style><div style="opacity:0;animation:reveal .05s .05s forwards"><button data-target id="animated">A</button></div>')
        const result = await wait(options())
        assert(result.id === 'animated', 'Animation visibility not detected')
        idle()
      })
      await test('temporary duplicate resolves after obsolete element leaves', async () => {
        html('<button data-target id="old">Old</button><button data-target id="new">New</button>')
        const result = wait(options())
        nativeTimeout(() => fixture.querySelector('#old').remove(), 30)
        assert((await result).id === 'new', 'Duplicate resolved incorrectly')
        idle()
      })
      await test('abort settles immediately and removes its listener', async () => {
        const controller = new AbortController()
        const signal = controller.signal
        const listeners = new Set()
        const add = signal.addEventListener.bind(signal)
        const remove = signal.removeEventListener.bind(signal)
        signal.addEventListener = (type, fn, opts) => { if (type === 'abort') listeners.add(fn); add(type, fn, opts) }
        signal.removeEventListener = (type, fn, opts) => { if (type === 'abort') listeners.delete(fn); remove(type, fn, opts) }
        const result = wait(options({ signal }))
        const checked = expectError(result, error => assert(error.name === 'AbortError', 'Wrong cancellation'))
        controller.abort()
        await checked
        idle()
        assert(listeners.size === 0, 'Leaked abort listener')
        html('<button data-target>Late after exit</button>')
        await new Promise(resolve => nativeTimeout(resolve, 40))
        idle()
      })
      await test('pre-aborted signal does not show an existing target', async () => {
        html('<button data-target>A</button>')
        const controller = new AbortController()
        controller.abort()
        await expectError(wait(options({ signal: controller.signal })), error => assert(error.name === 'AbortError', 'Ignored pre-abort'))
        idle()
      })
      for (const status of ['missing', 'hidden', 'ambiguous']) {
        await test(`timeout diagnoses ${status} and cleans up`, async () => {
          if (status === 'hidden') html('<button data-target style="display:none">A</button>')
          if (status === 'ambiguous') html('<button data-target>A</button><button data-target>B</button>')
          await expectError(wait(options({ timeoutMs: 80 })), error => {
            assert(error instanceof api.TutorialTargetError && error.code === 'timeout' && error.inspection.status === status, 'Wrong timeout diagnostics')
          })
          idle()
        })
      }
      await test('invalid selector rejects without background work', async () => {
        await expectError(wait(options({ selector: '[' })), error => assert(error.code === 'invalid-selector', 'Wrong selector failure'))
        idle()
      })
      await test('invalid timeout rejects without background work', async () => {
        for (const timeoutMs of [0, 0.5, -1, Infinity, NaN, 2_147_483_648]) {
          await expectError(wait(options({ timeoutMs })), error => assert(error instanceof RangeError, 'Invalid timeout accepted'))
        }
        idle()
      })
      await test('explicit shadow root uses host visibility', () => {
        html('<div id="host"></div>')
        const host = fixture.querySelector('#host')
        const root = host.attachShadow({ mode: 'open' })
        root.innerHTML = '<button data-target>A</button>'
        assert(inspect('[data-target]', root).status === 'ready', 'Shadow root target not found')
        host.style.opacity = '0'
        assert(inspect('[data-target]', root).status === 'hidden', 'Shadow host visibility ignored')
      })
      await test('transparent slot ancestry excludes light DOM targets', () => {
        html('<div id="host"><button data-target>Slotted</button></div>')
        const host = fixture.querySelector('#host')
        const root = host.attachShadow({ mode: 'open' })
        root.innerHTML = '<div style="opacity:0"><slot></slot></div>'
        assert(inspect('[data-target]', fixture).status === 'hidden', 'Transparent slot ancestry ignored')
        root.firstElementChild.style.opacity = '1'
        assert(inspect('[data-target]', fixture).status === 'ready', 'Visible slot rejected')
      })
      await test('nested slotted target waits for reveal and releases resources', async () => {
        html('<div id="host"><section slot="actions"><button data-target id="slotted">A</button></section></div>')
        const host = fixture.querySelector('#host')
        const root = host.attachShadow({ mode: 'open' })
        root.innerHTML = '<div style="opacity:0"><slot name="actions"></slot></div>'
        const result = wait(options())
        nativeTimeout(() => { root.firstElementChild.style.opacity = '1' }, 30)
        assert((await result).id === 'slotted', 'Slotted reveal not observed')
        idle()
      })
      await test('explicit iframe document uses its own DOM and styles', async () => {
        const frame = document.createElement('iframe')
        const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }))
        frame.srcdoc = '<button data-target id="framed">A</button>'
        fixture.append(frame)
        await loaded
        const element = await wait(options({ root: frame.contentDocument }))
        assert(element.id === 'framed' && element.ownerDocument === frame.contentDocument, 'Wrong document')
        idle()
      })
    } finally {
      window.requestAnimationFrame = nativeRaf
      window.cancelAnimationFrame = nativeCancel
      window.setTimeout = nativeTimeout
      window.clearTimeout = nativeClear
    }
    return checks
  })
  await page.evaluate(() => {
    document.querySelector('#fixture').innerHTML = '<style>.mobile{display:none}@media(max-width:600px){.desktop{display:none}.mobile{display:block}}</style><button class="desktop" data-target id="desktop">Desktop</button><button class="mobile" data-target id="mobile">Mobile</button>'
  })
  for (const [width, expected] of [[1280, 'desktop'], [390, 'mobile']]) {
    await page.setViewportSize({ width, height: 800 })
    const actual = await page.evaluate(() => window.targetApi.inspectTutorialTarget('[data-target]').element?.id)
    if (actual !== expected) throw Error(`Viewport ${width}: expected ${expected}, got ${actual}`)
    checks.push(`responsive targeting at ${width}px`)
  }
  console.log(JSON.stringify({ browser: await browser.version(), typescript: ts.version, typeCheck: "passed", passed: checks.length, checks }, null, 2))
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
