/**
 * Les modules d'Eraser : les morceaux des pages d'Eraser qui font plus qu'afficher un index
 * (un glossaire qu'on modifie sur place, le répertoire des index, les colonnes de l'accueil…).
 * Un bloc « Module d'Eraser » les pose dans une page du créateur de pages, comme n'importe
 * quel bloc : c'est ainsi qu'une page d'Eraser devient modifiable sans rien perdre.
 *
 * Ce qui n'est qu'une vue d'un index (les cartes des classes…) n'est pas un module : c'est un
 * bloc Vue d'index, avec ses presets (lib/index-view-layouts.ts).
 *
 * Règles pures (l'atelier, le serveur et les tests s'en servent) ; le rendu des modules est
 * dans components/eraser/eraser-modules.tsx, sur le serveur.
 */
import type { PageSection } from "@/lib/custom-pages"

export type EraserModuleKey =
  | "origine"
  | "pages-section"
  | "vocabulaire"
  | "repertoire-index"
  | "accueil-salutation"
  | "accueil-principal"
  | "accueil-cote"
  | "accueil-succes"
  | "accueil-a-faire"
  | "classe-presentation"
  | "classe-specificites"
  | "classes-accents"

export type EraserModule = { key: EraserModuleKey; label: string; hint: string }

export const eraserModules: EraserModule[] = [
  { key: "origine", label: "Contenu de la page d’origine", hint: "Page qui en remplace une d’Eraser : tout son contenu d’origine, à l’endroit choisi" },
  { key: "pages-section", label: "Pages d’une section", hint: "Les pages du créateur rangées dans une section du menu (Règles, Index…)" },
  { key: "vocabulaire", label: "Glossaire du vocabulaire", hint: "Les mots par lettre, modifiables sur place par les MJ et admins" },
  { key: "repertoire-index", label: "Répertoire des index", hint: "Les cartes des index, leurs étoiles et leurs dossiers, « Nouvel index »" },
  { key: "accueil-salutation", label: "Accueil : bonjour", hint: "« Bonjour, … » et la vue en cours" },
  { key: "accueil-principal", label: "Accueil : colonne principale", hint: "Mes personnages (joueur), mes campagnes (MJ) ou les choses à faire (admin)" },
  { key: "accueil-cote", label: "Accueil : colonne de côté", hint: "Règles, joueurs et MJ, index favoris, outils" },
  { key: "accueil-succes", label: "Accueil : succès", hint: "Les succès du compte" },
  { key: "accueil-a-faire", label: "Accueil : choses à faire", hint: "La liste des choses à faire des admins (admins seulement)" },
  { key: "classes-accents", label: "Classes : couleurs d’accent", hint: "Règles › Classes : calcule en arrière-plan la couleur d’accent des classes qui n’en ont pas (admins seulement, rien d’affiché)" },
  { key: "classe-presentation", label: "Classe : présentation", hint: "Page d’une classe : caractéristiques principales et secondaires, spécialités" },
  { key: "classe-specificites", label: "Classe : spécificités", hint: "Page d’une classe : ses tableaux propres (les cartes du Cartomancien…)" },
]

export const eraserModuleKeys = eraserModules.map((item) => item.key)
export const eraserModuleLabel = (key: string) => eraserModules.find((item) => item.key === key)?.label ?? "Module d’Eraser"

/** Les sections du menu dont un module « Pages d'une section » liste les pages. */
export const moduleSections: Array<{ value: PageSection; label: string }> = [
  { value: "regles", label: "Règles" },
  { value: "ressources", label: "Index" },
  { value: "bac-a-sable", label: "Bac à sable" },
  { value: "administration", label: "Administration" },
]
