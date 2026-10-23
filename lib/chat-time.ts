const timeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" })
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })

/** L'heure et la date (« 23/10/26 ») d'un message du chat ou d'un jet ; vides si la date est illisible. */
export function chatMessageTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { time: "", date: "", title: "" }
  return { time: timeFormat.format(date), date: dateFormat.format(date), title: date.toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" }) }
}
