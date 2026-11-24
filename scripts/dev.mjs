import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const localPython = resolve(
  root,
  process.platform === 'win32'
    ? '.venv/Scripts/python.exe'
    : '.venv/bin/python',
)
const python =
  process.env.PYTHON ||
  (existsSync(localPython)
    ? localPython
    : process.platform === 'win32'
      ? 'python'
      : 'python3')
const port = process.env.SKILLPROOF_API_PORT || '8000'
const children = []
let stopping = false
function stop(code) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill()
  process.exitCode = code
}
function run(executable, args) {
  const child = spawn(executable, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  })
  children.push(child)
  child.on('error', (error) => {
    console.error(error.message)
    stop(1)
  })
  child.on('exit', (code) => stop(code ?? 0))
}
const loop =
  process.platform === 'win32' ? ['--loop', 'asyncio:SelectorEventLoop'] : []
run(python, [
  '-m',
  'uvicorn',
  'backend.main:app',
  '--host',
  '127.0.0.1',
  '--port',
  port,
  ...loop,
])
run(process.execPath, [
  resolve(root, 'node_modules/vite/bin/vite.js'),
  ...process.argv.slice(2),
])
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
