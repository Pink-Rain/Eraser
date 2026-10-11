import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const { deepLinkFor, deepLinkInArgs, pathFromDeepLink, safeAppPath } = require("../desktop/deep-link.cjs")

test("un lien eraser:// mène à la page d'Eraser demandée", () => {
  assert.equal(pathFromDeepLink("eraser://open/regles/classes?onglet=sorts"), "/regles/classes?onglet=sorts")
  assert.equal(pathFromDeepLink("eraser://open"), "/")
  assert.equal(pathFromDeepLink("eraser:///campagne/12/journal"), "/campagne/12/journal")
  assert.equal(pathFromDeepLink("ERASER://open/index/objets#bague"), "/index/objets#bague")
  // Windows ajoute parfois une « / » finale.
  assert.equal(pathFromDeepLink("eraser://open/personnages/"), "/personnages")
  assert.equal(pathFromDeepLink("https://exemple.fr/"), null)
  assert.equal(pathFromDeepLink(undefined), null)
})

test("seule une adresse de page d'Eraser passe", () => {
  for (const unsafe of ["//exemple.fr", "/javascript:alert(1)", "/\\exemple", "/a\u0000b", "exemple.fr", "", "/" + "a".repeat(1001)]) {
    assert.equal(safeAppPath(unsafe), "/", unsafe)
  }
  assert.equal(pathFromDeepLink("eraser://open//exemple.fr"), "/")
  assert.equal(pathFromDeepLink("eraser://open/http://exemple.fr"), "/")
})

test("le lien d'une page et sa lecture se répondent", () => {
  for (const path of ["/", "/regles/classes?onglet=sorts", "/campagne/abc/journal#session-3"]) {
    assert.equal(pathFromDeepLink(deepLinkFor(path)), path)
  }
  assert.equal(deepLinkFor("//exemple.fr"), "eraser://open/")
})

test("le lien est retrouvé dans la ligne de commande de Windows", () => {
  assert.equal(deepLinkInArgs(["Eraser.exe", "--allow-file-access", "eraser://open/regles"]), "eraser://open/regles")
  assert.equal(deepLinkInArgs(["Eraser.exe"]), null)
  assert.equal(deepLinkInArgs(null), null)
})
