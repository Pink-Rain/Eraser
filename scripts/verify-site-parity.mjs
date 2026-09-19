import { execFileSync } from "node:child_process"

const base = process.env.ERASER_SITE_BASE_REF || "origin/main"

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim()
}

const baseFiles = git("ls-tree", "-r", "--name-only", base).split("\n").filter(Boolean)
const appFiles = new Set(git("ls-tree", "-r", "--name-only", "HEAD").split("\n").filter(Boolean))
const missing = baseFiles.filter((path) => !appFiles.has(path))
const changes = git("diff", "--name-status", "--find-renames", `${base}...HEAD`)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [status, ...paths] = line.split("\t")
    return { status, paths }
  })
const removedOrRenamed = changes.filter(({ status }) => status.startsWith("D") || status.startsWith("R"))
const stylePattern = /(^|\/)(tailwind|postcss)|\.(css|scss|sass|less)$/i
const changedStyles = changes.filter(({ paths }) => paths.some((path) => stylePattern.test(path)))
const routePattern = /^app\/.*\/(page|route)\.(ts|tsx|js|jsx)$/
const baseRoutes = baseFiles.filter((path) => routePattern.test(path))
const appRoutes = [...appFiles].filter((path) => routePattern.test(path))

console.log(JSON.stringify({
  base,
  siteFiles: baseFiles.length,
  applicationFiles: appFiles.size,
  missingFiles: missing.length,
  removedOrRenamed: removedOrRenamed.length,
  changedStyles: changedStyles.length,
  siteRoutes: baseRoutes.length,
  applicationRoutes: appRoutes.length,
}, null, 2))

if (missing.length || removedOrRenamed.length || changedStyles.length) {
  console.error("La copie Windows n’est plus fidèle à la source du site.")
  if (missing.length) console.error("Fichiers manquants :", missing)
  if (removedOrRenamed.length) console.error("Suppressions ou renommages :", removedOrRenamed)
  if (changedStyles.length) console.error("Styles modifiés :", changedStyles)
  process.exit(1)
}
