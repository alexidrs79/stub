import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function runPrisma(args) {
  return spawnSync("npx", ["prisma", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

function logOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
}

const deploy = runPrisma(["migrate", "deploy"])
logOutput(deploy)
if (deploy.status === 0) process.exit(0)

const output = `${deploy.stdout ?? ""}${deploy.stderr ?? ""}`
if (!output.includes("P3005")) {
  process.exit(deploy.status === null ? 1 : deploy.status)
}

console.warn(
  "Prisma P3005: production schema exists without a migration history. Baselining existing migrations.",
)

const migrations = readdirSync(join(root, "prisma/migrations"))
  .filter((name) => /^\d+_/.test(name))
  .sort()

for (const name of migrations) {
  const resolved = runPrisma(["migrate", "resolve", "--applied", name])
  logOutput(resolved)
  if (resolved.status !== 0) {
    process.exit(resolved.status === null ? 1 : resolved.status)
  }
}

const retry = runPrisma(["migrate", "deploy"])
logOutput(retry)
process.exit(retry.status === null ? 1 : retry.status)
