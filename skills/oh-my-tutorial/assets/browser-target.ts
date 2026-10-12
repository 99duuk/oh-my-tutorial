/**
 * Optional DOM target helper for oh-my-tutorial. No product success detection.
 * Visibility approach adapted from Tanwyhang/embedded-uiux-walkthrough (MIT),
 * revision 15086255d0c5dfa52fcc8c6f6ca6b177a1154423.
 * New implementation. Retain this notice when copying this file.
 *
 * MIT License
 * Copyright (c) 2026 Tanwyhang
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
export type TutorialTargetRoot = Document | Element | ShadowRoot

export type TargetInspection =
  | { status: 'ready'; element: Element; matches: number; rendered: 1 }
  | {
      status: 'missing' | 'hidden' | 'ambiguous' | 'invalid-selector'
      matches: number
      rendered: number
    }

function ownerDocument(root: TutorialTargetRoot): Document {
  return root.nodeType === 9 ? (root as Document) : root.ownerDocument!
}

function composedParent(element: Element): Element | null {
  if (element.assignedSlot) return element.assignedSlot
  if (element.parentElement) return element.parentElement
  const root = element.getRootNode()
  return 'host' in root ? (root as ShadowRoot).host : null
}

// Offscreen is allowed: scrolling and hit testing belong to the presentation layer.
function isRendered(element: Element): boolean {
  const view = element.ownerDocument.defaultView
  if (!view || !element.isConnected) return false
  if (!Array.from(element.getClientRects()).some(rect => rect.width > 0 && rect.height > 0)) {
    return false
  }
  const visibility = view.getComputedStyle(element).visibility
  if (visibility === 'hidden' || visibility === 'collapse') return false
  for (let current: Element | null = element; current; current = composedParent(current)) {
    const style = view.getComputedStyle(current)
    if (style.display === 'none' || style.opacity === '0' || style.contentVisibility === 'hidden') {
      return false
    }
  }
  return true
}

export function inspectTutorialTarget(
  selector: string,
  root: TutorialTargetRoot = document,
): TargetInspection {
  let candidates: Element[]
  try {
    // Like querySelectorAll, root scopes the search but is not itself a candidate.
    candidates = Array.from(root.querySelectorAll(selector))
  } catch {
    return { status: 'invalid-selector', matches: 0, rendered: 0 }
  }
  if (candidates.length === 0) return { status: 'missing', matches: 0, rendered: 0 }
  const rendered = candidates.filter(isRendered)
  if (rendered.length === 1) {
    return { status: 'ready', element: rendered[0]!, matches: candidates.length, rendered: 1 }
  }
  return {
    status: rendered.length === 0 ? 'hidden' : 'ambiguous',
    matches: candidates.length,
    rendered: rendered.length,
  }
}

export class TutorialTargetError extends Error {
  constructor(
    public readonly code: 'timeout' | 'invalid-selector',
    public readonly inspection: TargetInspection,
  ) {
    super(`Tutorial target ${code}: ${inspection.status}`)
    this.name = 'TutorialTargetError'
  }
}

export function waitForTutorialTarget(options: {
  selector: string
  signal: AbortSignal
  root?: TutorialTargetRoot
  timeoutMs?: number
}): Promise<Element> {
  const { selector, signal, root = document, timeoutMs = 5000 } = options
  return new Promise((resolve, reject) => {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
      reject(new RangeError('timeoutMs must be between 1 and 2147483647'))
      return
    }
    if (signal.aborted) {
      reject(new DOMException('Tutorial step ended', 'AbortError'))
      return
    }
    const view = ownerDocument(root).defaultView
    if (!view) {
      reject(new Error('Tutorial target requires a live document'))
      return
    }
    let settled = false
    let frame: number | undefined
    let timer: number | undefined
    let inspection: TargetInspection = { status: 'missing', matches: 0, rendered: 0 }

    function cleanup() {
      if (frame !== undefined) view!.cancelAnimationFrame(frame)
      if (timer !== undefined) view!.clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    }
    function fail(error: unknown) {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    function onAbort() {
      fail(new DOMException('Tutorial step ended', 'AbortError'))
    }
    function check() {
      if (settled) return
      try {
        inspection = inspectTutorialTarget(selector, root)
        if (inspection.status === 'invalid-selector') {
          fail(new TutorialTargetError('invalid-selector', inspection))
        } else if (inspection.status === 'ready') {
          settled = true
          cleanup()
          resolve(inspection.element)
        } else {
          frame = view!.requestAnimationFrame(check)
        }
      } catch (error) {
        fail(error)
      }
    }
    signal.addEventListener('abort', onAbort, { once: true })
    // Independent timer also settles the wait when animation frames are throttled.
    timer = view.setTimeout(() => fail(new TutorialTargetError('timeout', inspection)), timeoutMs)
    check()
  })
}
