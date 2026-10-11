/**
 * Les lignes d'un index envoyées à la page : chaque case porte sa valeur et sa version mise
 * en forme (`html`), presque toujours identiques. Avant d'envoyer, l'html identique à la
 * valeur est vidé ; la page le rétablit avant de s'en servir. La charge d'un index de
 * quelques centaines de lignes est ainsi presque divisée par deux, à l'envoi comme au
 * premier affichage. Rétablir une ligne déjà rétablie ne change rien.
 */
export type WireRow = { rowNumber: number; values: string[]; html: string[] }

export function packRowHtml<T extends WireRow>(row: T): T {
  if (!row.html.some((html, index) => html !== "" && html === row.values[index])) return row
  return { ...row, html: row.html.map((html, index) => html === row.values[index] ? "" : html) }
}

export function unpackRowHtml<T extends WireRow>(row: T): T {
  if (!row.html.some((html, index) => html === "" && (row.values[index] ?? "") !== "")) return row
  return { ...row, html: row.html.map((html, index) => html === "" ? row.values[index] ?? "" : html) }
}

export function packTableRows<T extends { rows: WireRow[] }>(table: T): T {
  return { ...table, rows: table.rows.map(packRowHtml) }
}

export function unpackTableRows<T extends { rows: WireRow[] }>(table: T): T {
  return { ...table, rows: table.rows.map(unpackRowHtml) }
}
