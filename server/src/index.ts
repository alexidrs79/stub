import { createApp } from "./app.js"
import { appConfig } from "./config.js"
import { prisma } from "./db.js"

const app = await createApp(appConfig)

const server = app.listen(appConfig.port, () => {
  console.log(`Stub listening on port ${appConfig.port}`)
})

async function shutdown(signal: string) {
  console.log(`${signal} received; shutting down`)
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  // A connection that will not drain must not hold the deploy open forever.
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.once("SIGTERM", () => void shutdown("SIGTERM"))
process.once("SIGINT", () => void shutdown("SIGINT"))
