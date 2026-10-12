import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const files = []
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', '.verification', '.tmp'].includes(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (/\.(md|html|svg|ts|mjs|yml|yaml)$/.test(entry.name)) files.push(path)
  }
}
await walk(root)
const errors = []
let localLinks = 0
for (const path of files) {
  const body = await readFile(path, 'utf8')
  if (/\/Users\/[^/]+\/|\/var\/folders\/|\/tmp\/oh-my-tutorial-/.test(body)) {
    errors.push(`${relative(root, path)}: machine-specific path`)
  }
  if (!path.endsWith('.md')) continue
  const links = [
    ...Array.from(body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g), match => match[1]),
    ...Array.from(body.matchAll(/(?:src|href)="([^"]+)"/g), match => match[1]),
  ]
  for (const link of links) {
    if (/^(?:[a-z]+:|#|\/\/)/i.test(link)) continue
    const target = link.split('#')[0]
    if (!target) continue
    localLinks++
    try { await stat(resolve(dirname(path), decodeURIComponent(target))) }
    catch { errors.push(`${relative(root, path)}: missing ${link}`) }
  }
}
const skill = await readFile(resolve(root, 'skills/oh-my-tutorial/SKILL.md'), 'utf8')
if (!/^---\r?\nname: oh-my-tutorial\r?\ndescription: .+\r?\n---/m.test(skill)) {
  errors.push('Skill frontmatter must include its name and description')
}
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`Docs: ${localLinks} local references resolve; portable paths and skill metadata checked.`)
