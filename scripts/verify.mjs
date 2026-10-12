import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const browser = process.env.TUTORIAL_BROWSER ? [process.env.TUTORIAL_BROWSER] : []
const tasks = [
  ['scripts/check-docs.mjs'],
  ['skills/oh-my-tutorial/scripts/verify-browser-target.mjs', root, ...browser],
  ['scripts/demo.mjs'],
]
for (const args of tasks) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
