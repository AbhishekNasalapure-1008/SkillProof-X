import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
assert.ok(existsSync(join(root, 'dist/index.html')), 'Run npm run build first.')
const tempRoot = resolve(tmpdir())
const data = await mkdtemp(join(tempRoot, 'skillproof-test-'))
const venv = join(
  root,
  process.platform === 'win32'
    ? '.venv/Scripts/python.exe'
    : '.venv/bin/python',
)
const python =
  process.env.PYTHON ||
  (existsSync(venv)
    ? venv
    : process.platform === 'win32'
      ? 'python'
      : 'python3')
const browserPath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && existsSync(p))
const shots = process.env.SKILLPROOF_SCREENSHOTS === '1'
const output = join(root, 'tests/output')
if (shots) await mkdir(output, { recursive: true })
let server, browser
async function startServer(port = 0) {
  const loop =
    process.platform === 'win32' ? ['--loop', 'asyncio:SelectorEventLoop'] : []
  server = spawn(
    python,
    [
      '-m',
      'uvicorn',
      'backend.main:app',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      ...loop,
    ],
    {
      cwd: root,
      windowsHide: true,
      env: { ...process.env, SKILLPROOF_DATA_DIR: data, GEMINI_API_KEY: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  return await new Promise((resolveUrl, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Local test server did not start.')),
      30000,
    )
    server.once('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    server.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error('Local test server exited: ' + code))
    })
    let messages = ''
    server.stderr.on('data', (chunk) => {
      messages += chunk.toString()
      const match = messages.match(
        /Uvicorn running on (http:\/\/127\.0\.0\.1:\d+)/,
      )
      if (match) {
        clearTimeout(timer)
        resolveUrl(match[1])
      }
      if (messages.includes('Traceback')) process.stderr.write(chunk)
    })
  })
}
async function stopServer() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit')
    server.kill()
    await exited
  }
}
async function capture(page, name) {
  if (shots)
    await page.screenshot({ path: join(output, name + '.png'), fullPage: true })
}
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    'Horizontal page overflow at ' + page.url(),
  )
}
try {
  const url = await startServer()
  browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
  })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(url)
  await page.getByText('Demo mode', { exact: true }).waitFor()
  await page.evaluate(() => document.fonts.ready)
  await capture(page, 'overview-desktop')
  await page.getByRole('link', { name: 'Get started', exact: true }).click()
  await page
    .getByRole('link', { name: 'Start assessment', exact: true })
    .click()
  const input = page.getByLabel('Upload demonstration video')
  await input.setInputFiles({
    name: 'invalid.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('invalid'),
  })
  await page
    .getByRole('alert')
    .filter({ hasText: 'Choose a non-empty' })
    .waitFor()
  await input.setInputFiles(join(root, 'public/media/workshop-sample.webm'))
  await page.getByRole('button', { name: 'Analyse video', exact: true }).click()
  await page.getByRole('heading', { name: 'Competency findings' }).waitFor()
  assert.equal(await page.locator('.finding').count(), 5)
  assert.ok(await page.getByText('Demo analysis.', { exact: true }).isVisible())
  const seek = page.getByRole('button', {
    name: /Play evidence for Wire preparation/,
  })
  await seek.click()
  await page.waitForFunction(
    () => Math.abs(document.querySelector('video').currentTime - 3.84) < 0.1,
  )
  await capture(page, 'evidence-desktop')
  console.log(
    'PASS upload validation, video preview, five findings and timestamp seeking',
  )
  await page.getByRole('button', { name: 'Submit for expert review' }).click()
  await page.getByRole('link', { name: 'Open assessor review' }).click()
  await page
    .getByLabel('Assessor feedback')
    .fill('Record the meter display clearly before submitting again.')
  await page.getByRole('button', { name: 'Request resubmission' }).click()
  await page
    .getByRole('heading', { name: 'Your review queue is clear' })
    .waitFor()
  await page.goto(url + '/#/worker')
  await page
    .getByRole('link')
    .filter({ hasText: 'Resubmission requested' })
    .click()
  await page
    .getByRole('button', { name: 'Try the illustrated sample clip' })
    .click()
  await page.getByRole('button', { name: 'Analyse video', exact: true }).click()
  await page.getByRole('button', { name: 'Submit for expert review' }).click()
  await page.getByRole('link', { name: 'Open assessor review' }).click()
  const skills = [
    'Tool identification',
    'Wire preparation',
    'Connection procedure',
    'Safety precautions',
    'Final testing',
  ]
  for (const [i, name] of skills.entries()) {
    const group = page.getByRole('group', {
      name: 'Decision for ' + name,
      exact: true,
    })
    await group
      .getByRole('button', { name: i < 2 ? 'Approve' : 'Reject', exact: true })
      .click()
  }
  await page
    .getByLabel('Assessor feedback')
    .fill('Two skills approved after reviewing the demonstration.')
  await page.reload()
  await page
    .getByRole('group', { name: 'Decision for Tool identification' })
    .waitFor()
  assert.equal(
    await page
      .getByRole('group', { name: 'Decision for Tool identification' })
      .getByRole('button', { name: 'Approve', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  )
  assert.ok(
    await page
      .getByRole('button', { name: 'Issue digital skill passport' })
      .isDisabled(),
  )
  await page.getByRole('checkbox').check()
  await page
    .getByRole('button', { name: 'Issue digital skill passport' })
    .click()
  await page.getByLabel('Verification link', { exact: true }).waitFor()
  const link = await page
    .getByLabel('Verification link', { exact: true })
    .inputValue()
  const id = link.split('/').at(-1)
  assert.match(id, /^SPX-[A-F0-9]{12}$/)
  assert.deepEqual(
    await page.locator('.verified-skills > div').allTextContents(),
    skills.slice(0, 2),
  )
  const qrImage = join(data, 'qr.png')
  await page.locator('.qr-block svg').screenshot({ path: qrImage })
  const decoded = spawnSync(
    python,
    [
      '-c',
      'import cv2, sys; im=cv2.imread(sys.argv[1]); print(cv2.QRCodeDetector().detectAndDecode(cv2.resize(im,None,fx=6,fy=6,interpolation=cv2.INTER_NEAREST))[0])',
      qrImage,
    ],
    { encoding: 'utf8', windowsHide: true },
  )
  assert.equal(
    decoded.stdout.trim(),
    link,
    'QR must encode the exact verification URL',
  )
  await capture(page, 'passport-desktop')
  await page.emulateMedia({ media: 'print' })
  assert.ok(await page.locator('.share-panel').isHidden())
  const pdf = await page.pdf({ format: 'A4' })
  assert.ok(pdf.length > 5000)
  await page.emulateMedia({ media: 'screen' })
  console.log(
    'PASS resubmission, replacement, persisted assessor decisions, approval-only issuance, QR decode and print PDF',
  )
  await stopServer()
  await startServer(new URL(url).port)
  const employer = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const mobile = await employer.newPage()
  mobile.on('pageerror', (e) => errors.push(e.message))
  await mobile.goto(link)
  await mobile.getByText('Valid in this prototype', { exact: true }).waitFor()
  assert.deepEqual(
    await mobile.locator('.verified-skills > div').allTextContents(),
    skills.slice(0, 2),
  )
  await noOverflow(mobile)
  await mobile.getByLabel('Credential ID', { exact: true }).fill('SPX-UNKNOWN')
  await mobile
    .getByRole('button', { name: 'Verify credential', exact: true })
    .click()
  await mobile.getByRole('alert').filter({ hasText: 'No credential' }).waitFor()
  await mobile
    .getByLabel('Credential ID', { exact: true })
    .fill(id.toLowerCase())
  await mobile
    .getByRole('button', { name: 'Verify credential', exact: true })
    .click()
  await mobile.getByText('Valid in this prototype', { exact: true }).waitFor()
  const state = await (await mobile.request.get(url + '/api/workspace')).json()
  assert.equal(state.assessments.length, 2)
  assert.equal(state.assessments[1].status, 'replaced')
  assert.equal(state.credentials.length, 1)
  assert.equal(state.assessments[0].mode, 'demo')
  for (const route of [
    '',
    'worker',
    'assessment',
    'analysis',
    'assessor',
    'passport',
    'verify',
  ]) {
    await mobile.goto(url + '/#/' + route)
    await mobile.locator('main h1').first().waitFor()
    await noOverflow(mobile)
    if (!route) await capture(mobile, 'overview-mobile')
  }
  await mobile.getByRole('button', { name: 'Toggle navigation' }).click()
  await mobile
    .getByRole('navigation')
    .getByRole('link', { name: 'Overview', exact: true })
    .click()
  await mobile.getByRole('heading', { name: 'Platform overview' }).waitFor()
  assert.deepEqual(errors, [])
  console.log(
    'PASS restart persistence, fresh-session verification, unknown-ID handling, seven mobile screens and mobile navigation',
  )
} finally {
  if (browser) await browser.close()
  await stopServer()
  if (
    dirname(data) === tempRoot &&
    data.startsWith(join(tempRoot, 'skillproof-test-'))
  )
    await rm(data, { recursive: true, force: true })
}
