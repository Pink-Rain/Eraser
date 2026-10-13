/**
 * Les calendriers du monde (Index des calendriers) : leurs mois, saisons et jours de la
 * semaine, lus dans les onglets de l'index ; et les dates écrites dans un index
 * (« 12 Brumaire 1023 », « 1023-3-12 ») placées dans un de ces calendriers. Sans import
 * serveur : la vue Calendrier du moteur des index s'en sert dans la page.
 */

export const CALENDARS_TAB = "Calendriers"
export const CALENDAR_MONTHS_TAB = "Mois"
export const CALENDAR_SEASONS_TAB = "Saisons"
export const CALENDAR_WEEKDAYS_TAB = "Jours de la semaine"
export const CALENDAR_HEADER = "Calendrier"
export const CALENDAR_ORDER_HEADER = "Ordre"
export const CALENDAR_DAYS_HEADER = "Nombre de jours"
export const CALENDAR_SEASON_HEADER = "Saison"
export const CALENDAR_COLOR_HEADER = "Couleur"
export const CALENDAR_ERA_HEADER = "Ère"
export const CALENDAR_DESCRIPTION_HEADER = "Description"
export const CALENDAR_IMAGE_HEADER = "Image"

/** « Calendrier réel » : le calendrier grégorien, toujours proposé. */
export const REAL_CALENDAR = "Calendrier réel"

/** Un mois ou une saison peut porter une image (colonne « Image » de son onglet) : la bannière du calendrier la montre. */
export type CalendarMonth = { name: string; days: number; season: string; image?: string }
export type CalendarSeason = { name: string; color: string; months: number; image?: string }
export type CalendarDefinition = { name: string; era: string; description: string; months: CalendarMonth[]; seasons: CalendarSeason[]; weekdays: string[] }

type Table = { tabName: string; headers: string[]; rows: Array<{ values: string[] }> }

function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").replace(/<[^>]+>/g, " ").replace(/[^a-z0-9]+/g, " ").trim()
}
function plain(value: string | undefined) {
  return (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

const frenchMonths = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
const frenchWeekdays = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

/** Le calendrier grégorien, en français (février compte 28 jours ; la vue tient compte des bissextiles). */
export const realCalendar: CalendarDefinition = {
  name: REAL_CALENDAR,
  era: "",
  description: "",
  months: frenchMonths.map((name, index) => ({ name, days: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][index], season: "" })),
  seasons: [],
  weekdays: frenchWeekdays,
}

/** Les calendriers d'un Index des calendriers chargé ; un mois sans nombre de jours en compte 30. */
export function calendarsFromTables(tables: Table[]): CalendarDefinition[] {
  const tab = (name: string) => tables.find((table) => fold(table.tabName) === fold(name))
  // Une case lue en texte simple ; `raw` : telle quelle (l'adresse d'une image tient dans sa balise).
  const rowsOf = (table: Table | undefined) => (table?.rows ?? []).map((row) => Object.assign((header: string) => {
    const column = table!.headers.findIndex((candidate) => fold(candidate) === fold(header))
    return column >= 0 ? plain(row.values[column]) : ""
  }, { raw: (header: string) => { const column = table!.headers.findIndex((candidate) => fold(candidate) === fold(header)); return column >= 0 ? row.values[column] ?? "" : "" } }))
  const ordered = <T extends { order: number; position: number }>(items: T[]) => [...items].sort((left, right) => (left.order - right.order) || (left.position - right.position))
  const order = (value: string, position: number) => { const number = Number.parseFloat(value.replace(",", ".")); return Number.isFinite(number) ? number : position + 1000 }
  const image = (value: string) => value.match(/(https:\/\/[^\s"'<>]+|\/api\/[^\s"'<>]+)/)?.[0] ?? ""
  const months = rowsOf(tab(CALENDAR_MONTHS_TAB)).map((cell, position) => ({ calendar: fold(cell(CALENDAR_HEADER)), name: cell("Nom"), days: Math.max(1, Math.min(400, Number.parseInt(cell(CALENDAR_DAYS_HEADER), 10) || 30)), season: cell(CALENDAR_SEASON_HEADER), image: image(cell.raw(CALENDAR_IMAGE_HEADER)), order: order(cell(CALENDAR_ORDER_HEADER), position), position })).filter((month) => month.name)
  const seasons = rowsOf(tab(CALENDAR_SEASONS_TAB)).map((cell, position) => ({ calendar: fold(cell(CALENDAR_HEADER)), name: cell("Nom"), color: /^#[0-9a-f]{6}$/i.test(cell(CALENDAR_COLOR_HEADER)) ? cell(CALENDAR_COLOR_HEADER) : "", image: image(cell.raw(CALENDAR_IMAGE_HEADER)), order: order(cell(CALENDAR_ORDER_HEADER), position), position })).filter((season) => season.name)
  const weekdays = rowsOf(tab(CALENDAR_WEEKDAYS_TAB)).map((cell, position) => ({ calendar: fold(cell(CALENDAR_HEADER)), name: cell("Nom"), order: order(cell(CALENDAR_ORDER_HEADER), position), position })).filter((day) => day.name)
  return rowsOf(tab(CALENDARS_TAB)).flatMap((cell) => {
    const name = cell("Nom")
    if (!name) return []
    const key = fold(name)
    const ownMonths = ordered(months.filter((month) => month.calendar === key)).map(({ name: monthName, days, season, image: monthImage }) => ({ name: monthName, days, season, ...(monthImage ? { image: monthImage } : {}) }))
    const ownSeasons = ordered(seasons.filter((season) => season.calendar === key))
    return [{
      name,
      era: cell(CALENDAR_ERA_HEADER),
      description: cell(CALENDAR_DESCRIPTION_HEADER),
      months: ownMonths,
      // Combien de mois dans chaque saison : ceux qui la citent.
      seasons: ownSeasons.map((season) => ({ name: season.name, color: season.color, months: ownMonths.filter((month) => fold(month.season) === fold(season.name)).length, ...(season.image ? { image: season.image } : {}) })),
      weekdays: ordered(weekdays.filter((day) => day.calendar === key)).map((day) => day.name),
    }]
  })
}

export type CalendarDate = { year: number; month: number; day: number }

function isLeap(year: number) { return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 }

/** Le nombre de jours d'un mois (février bissextile dans le calendrier réel). */
export function monthLength(calendar: CalendarDefinition, year: number, month: number) {
  const base = calendar.months[month]?.days ?? 30
  return calendar.name === REAL_CALENDAR && month === 1 && isLeap(year) ? 29 : base
}

/**
 * Une date écrite dans une case, dans ce calendrier : « 12 Brumaire 1023 », « Brumaire 12,
 * 1023 », « 1023-3-12 » (année-mois-jour, le mois compté depuis 1), ou « 12/03/1023 ».
 * `null` si rien n'y ressemble.
 */
export function parseCalendarDate(text: string, calendar: CalendarDefinition): CalendarDate | null {
  const value = plain(text)
  if (!value) return null
  const iso = value.match(/^(-?\d{1,6})-(\d{1,3})-(\d{1,3})/)
  if (iso) return checked({ year: Number(iso[1]), month: Number(iso[2]) - 1, day: Number(iso[3]) }, calendar)
  const slashes = value.match(/^(\d{1,3})\/(\d{1,3})\/(-?\d{1,6})/)
  if (slashes) return checked({ year: Number(slashes[3]), month: Number(slashes[2]) - 1, day: Number(slashes[1]) }, calendar)
  const folded = ` ${fold(value)} `
  // Le nom de mois le plus long d'abord : « Petit Brumaire » avant « Brumaire ».
  const months = calendar.months.map((month, index) => ({ index, name: fold(month.name) })).filter((month) => month.name).sort((left, right) => right.name.length - left.name.length)
  const found = months.find((month) => folded.includes(` ${month.name} `))
  if (!found) return null
  const [beforePart, afterPart = ""] = folded.split(` ${found.name} `)
  const numbersIn = (part: string) => part.match(/-?\d+/g)?.map(Number) ?? []
  const before = numbersIn(beforePart)
  const after = numbersIn(afterPart)
  // « 12 Brumaire 1023 » : le jour avant le mois, l'année après ; « Brumaire 12, 1023 » : les deux après.
  const day = before.length ? before[before.length - 1] : after[0]
  const year = before.length ? after[0] ?? (before.length > 1 ? before[0] : undefined) : after[1]
  return checked({ year: year ?? 1, month: found.index, day: day ?? 1 }, calendar)
}

function checked(date: CalendarDate, calendar: CalendarDefinition): CalendarDate | null {
  if (!Number.isInteger(date.year) || date.month < 0 || date.month >= calendar.months.length) return null
  if (date.day < 1 || date.day > monthLength(calendar, date.year, date.month)) return null
  return date
}

/** Le jour de la semaine du 1er du mois (0 = premier jour de la semaine du calendrier). */
export function firstWeekdayOf(calendar: CalendarDefinition, year: number, month: number) {
  if (calendar.name === REAL_CALENDAR) {
    const day = new Date(Date.UTC(0, 0, 1))
    day.setUTCFullYear(year, month, 1)
    return (day.getUTCDay() + 6) % 7
  }
  const week = calendar.weekdays.length || 7
  const yearDays = calendar.months.reduce((sum, item) => sum + item.days, 0) || 360
  // Les jours écoulés depuis l'an 1 : un monde n'a pas d'année bissextile.
  const before = (year - 1) * yearDays + calendar.months.slice(0, month).reduce((sum, item) => sum + item.days, 0)
  return ((before % week) + week) % week
}

/** « 12 Brumaire 1023 AR ». */
export function formatCalendarDate(date: CalendarDate, calendar: CalendarDefinition) {
  return `${date.day} ${calendar.months[date.month]?.name ?? ""} ${date.year}${calendar.era ? ` ${calendar.era}` : ""}`.trim()
}

/** La saison d'un mois, avec sa couleur. */
export function seasonOf(calendar: CalendarDefinition, month: number) {
  const name = calendar.months[month]?.season ?? ""
  return calendar.seasons.find((season) => fold(season.name) === fold(name)) ?? (name ? { name, color: "", months: 0 } : null)
}

/** Le nombre de jours d'une année (bissextile dans le calendrier réel). */
export function yearLength(calendar: CalendarDefinition, year: number) {
  return calendar.months.reduce((sum, _month, index) => sum + monthLength(calendar, year, index), 0) || 360
}

/**
 * Le rang d'un jour depuis le 1er du premier mois de l'an 1 (0 pour ce jour-là) : il compare
 * deux dates, fait avancer ou reculer une date, trouve le début d'une semaine. Le calendrier
 * réel compte ses bissextiles ; un monde n'en a pas.
 */
export function dayNumber(calendar: CalendarDefinition, date: CalendarDate) {
  if (calendar.name === REAL_CALENDAR) {
    const at = new Date(Date.UTC(2000, 0, 1))
    at.setUTCFullYear(date.year, date.month, date.day)
    const origin = new Date(Date.UTC(2000, 0, 1))
    origin.setUTCFullYear(1, 0, 1)
    return Math.round((at.getTime() - origin.getTime()) / 86_400_000)
  }
  const yearDays = yearLength(calendar, date.year)
  return (date.year - 1) * yearDays + calendar.months.slice(0, date.month).reduce((sum, month) => sum + month.days, 0) + date.day - 1
}

/** La date d'un rang de jour (l'inverse de `dayNumber`). */
export function dateFromDayNumber(calendar: CalendarDefinition, number: number): CalendarDate {
  if (calendar.name === REAL_CALENDAR) {
    const origin = new Date(Date.UTC(2000, 0, 1))
    origin.setUTCFullYear(1, 0, 1)
    const at = new Date(origin.getTime() + number * 86_400_000)
    return { year: at.getUTCFullYear(), month: at.getUTCMonth(), day: at.getUTCDate() }
  }
  const yearDays = yearLength(calendar, 1)
  let year = Math.floor(number / yearDays) + 1
  let rest = number - (year - 1) * yearDays
  if (rest < 0) { year -= 1; rest += yearDays }
  let month = 0
  while (month < calendar.months.length - 1 && rest >= calendar.months[month].days) { rest -= calendar.months[month].days; month += 1 }
  return { year, month, day: rest + 1 }
}

/** Une date décalée de tant de jours (négatif : en arrière). */
export function addDays(calendar: CalendarDefinition, date: CalendarDate, delta: number): CalendarDate {
  return dateFromDayNumber(calendar, dayNumber(calendar, date) + delta)
}

/** Le jour de la semaine d'une date (0 = premier jour de la semaine du calendrier). */
export function weekdayOf(calendar: CalendarDefinition, date: CalendarDate) {
  const week = calendar.weekdays.length || 7
  return (firstWeekdayOf(calendar, date.year, date.month) + date.day - 1) % week
}

/** Le premier jour de la semaine qui contient la date. */
export function weekStartOf(calendar: CalendarDefinition, date: CalendarDate) {
  return addDays(calendar, date, -weekdayOf(calendar, date))
}

/** Deux dates comparées dans le temps (négatif : la première est avant). */
export function compareCalendarDates(left: CalendarDate, right: CalendarDate) {
  return left.year - right.year || left.month - right.month || left.day - right.day
}

/** Un mois décalé (négatif : en arrière), d'une année à l'autre. */
export function addMonths(calendar: CalendarDefinition, year: number, month: number, delta: number) {
  const count = calendar.months.length || 12
  const total = year * count + month + delta
  return { year: Math.floor(total / count), month: ((total % count) + count) % count }
}
