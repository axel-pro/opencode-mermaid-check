// After every edit of a .md or .mmd file, checks the mermaid diagrams in the changed file and appends
// the errors to the edit tool's output. In GitLab a broken diagram shows up only as an error box instead
// of a picture; this way the agent learns about it right away, without a "remember to run the check" rule.
// The check itself is bin/mermaid-check, which also documents the mermaid version it targets.
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT = fileURLToPath(new URL("../bin/mermaid-check", import.meta.url))

// Quick filter: the check process starts only if the .md file has a mermaid block.
const MERMAID_FENCE = /^\s{0,3}(`{3,}|~{3,})\s*mermaid/m

export const MermaidCheck = async ({ directory, worktree }) => {
  // Files changed by the tool. apply_patch (which OpenCode gives some models instead of edit and write)
  // lists them in metadata.
  function changedFiles(tool, args, metadata) {
    if (tool === "edit" || tool === "write") return args?.filePath ? [args.filePath] : []
    if (tool === "apply_patch") {
      return (metadata?.files ?? []).filter((f) => f.type !== "delete").map((f) => f.movePath ?? f.filePath)
    }
    return []
  }

  function hasDiagrams(file) {
    const ext = path.extname(file)
    if (ext === ".mmd") return fs.existsSync(file)
    if (ext !== ".md") return false
    try {
      return MERMAID_FENCE.test(fs.readFileSync(file, "utf8"))
    } catch {
      return false
    }
  }

  function run(files) {
    return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      const child = spawn("node", [SCRIPT, ...files], { cwd: worktree, stdio: ["ignore", "pipe", "pipe"] })
      let stdout = ""
      let stderr = ""
      child.stdout.on("data", (chunk) => (stdout += chunk))
      child.stderr.on("data", (chunk) => (stderr += chunk))
      const timer = setTimeout(() => child.kill("SIGTERM"), 60_000)
      child.on("error", (error) => (stderr += `${error.message}\n`))
      child.on("close", (code) => {
        clearTimeout(timer)
        resolve({ code: code ?? 1, stdout, stderr })
      })
    })
  }

  return {
    "tool.execute.after": async (input, output) => {
      try {
        const files = changedFiles(input.tool, input.args, output.metadata)
          .map((file) => path.resolve(directory, file))
          .filter(hasDiagrams)
          .map((file) => (file.startsWith(worktree + path.sep) ? path.relative(worktree, file) : file))
        if (!files.length) return
        const result = await run(files)
        if (result.code === 0) return
        const note =
          result.code === 1
            ? `Mermaid check: GitLab will not render these diagrams, fix them.\n${result.stdout.trim()}`
            : `Mermaid check failed to run, tell the user: ${(result.stderr || result.stdout).trim()}`
        output.output = `${output.output ?? ""}\n\n${note}`
      } catch (error) {
        // A failure of the check must not break the edit itself.
        output.output = `${output.output ?? ""}\n\nMermaid check failed to run, tell the user: ${error?.message ?? error}`
      }
    },
  }
}
