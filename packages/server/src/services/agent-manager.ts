import { spawn, type ChildProcess } from 'child_process'

interface SpawnOptions {
  sessionId: string
  prompt: string
  model: string
  repoPaths: string[]
  onEvent: (event: any) => void
  onExit: (code: number | null) => void
}

class AgentManager {
  private readonly processes = new Map<number, ChildProcess>()

  spawn(options: SpawnOptions): number {
    const { sessionId, prompt, model, repoPaths, onEvent, onExit } = options

    const args = [
      '-p',
      '--output-format=stream-json',
      '--session-id', sessionId,
      '--model', model,
    ]

    for (const repoPath of repoPaths) {
      args.push('--add-dir', repoPath)
    }

    args.push(prompt)

    const child = spawn('claude', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const pid = child.pid!
    this.processes.set(pid, child)

    // Parse NDJSON from stdout
    let buffer = ''
    child.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          onEvent(parsed)
        } catch {
          // Skip non-JSON lines
        }
      }
    })

    child.on('close', (code) => {
      this.processes.delete(pid)
      onExit(code)
    })

    return pid
  }

  kill(pid: number): void {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Process already dead
      return
    }

    // Force kill after 5 seconds
    setTimeout(() => {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // Process already dead
      }
    }, 5000)
  }

  isRunning(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
}

export default AgentManager
