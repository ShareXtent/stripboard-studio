import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const HOST = '127.0.0.1'
const PORT = 5173
const EXTRA_ARGS = process.argv.slice(2)

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const pidFilePath = path.join(projectRoot, '.vite-dev-server.pid')

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function readTrackedPid() {
  if (!existsSync(pidFilePath)) {
    return null
  }

  const rawPid = readFileSync(pidFilePath, 'utf8').trim()
  const pid = Number.parseInt(rawPid, 10)

  if (!Number.isInteger(pid) || pid <= 0) {
    rmSync(pidFilePath, { force: true })
    return null
  }

  return pid
}

function writeTrackedPid(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error('Failed to start the Vite dev server process.')
  }

  writeFileSync(pidFilePath, `${pid}\n`)
}

function removeTrackedPid(expectedPid) {
  if (!existsSync(pidFilePath)) {
    return
  }

  if (expectedPid == null) {
    rmSync(pidFilePath, { force: true })
    return
  }

  const currentPid = readTrackedPid()

  if (currentPid === expectedPid) {
    rmSync(pidFilePath, { force: true })
  }
}

function isPortListening(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })

    socket.setTimeout(500)

    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })

    socket.once('error', () => {
      resolve(false)
    })

    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      return true
    }

    await delay(100)
  }

  return !isProcessRunning(pid)
}

async function reclaimPreviousDevServer() {
  const trackedPid = readTrackedPid()

  if (trackedPid == null) {
    return
  }

  if (!isProcessRunning(trackedPid)) {
    removeTrackedPid(trackedPid)
    return
  }

  console.log(`Stopping previous dev server (${trackedPid}) on port ${PORT}...`)

  try {
    process.kill(trackedPid, 'SIGTERM')
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      throw error
    }
  }

  const stoppedCleanly = await waitForProcessExit(trackedPid, 3000)

  if (!stoppedCleanly) {
    process.kill(trackedPid, 'SIGKILL')
    await waitForProcessExit(trackedPid, 2000)
  }

  removeTrackedPid(trackedPid)
}

async function main() {
  await reclaimPreviousDevServer()

  if (await isPortListening(PORT, HOST)) {
    throw new Error(
      `Port ${PORT} is already in use by another process. Stop it manually, then run npm run dev again.`,
    )
  }

  const vitePackagePath = require.resolve('vite/package.json')
  const viteBinPath = path.join(path.dirname(vitePackagePath), 'bin', 'vite.js')
  const viteProcess = spawn(
    process.execPath,
    [viteBinPath, '--host', HOST, '--port', String(PORT), '--strictPort', ...EXTRA_ARGS],
    {
      cwd: projectRoot,
      stdio: 'inherit',
    },
  )

  writeTrackedPid(viteProcess.pid)

  const forwardSignal = (signal) => {
    if (!viteProcess.killed) {
      viteProcess.kill(signal)
    }
  }

  process.on('SIGINT', () => forwardSignal('SIGINT'))
  process.on('SIGTERM', () => forwardSignal('SIGTERM'))

  viteProcess.on('error', (error) => {
    removeTrackedPid(viteProcess.pid)
    console.error(error)
    process.exit(1)
  })

  viteProcess.on('exit', (code, signal) => {
    removeTrackedPid(viteProcess.pid)

    if (signal) {
      process.exit(1)
    }

    process.exit(code ?? 0)
  })
}

main().catch((error) => {
  removeTrackedPid()
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
