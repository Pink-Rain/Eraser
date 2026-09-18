export function normalizeClassLabel(value: string) {
  return value
    .replace(/·(?:euses?|eaux|elles?|ères?|eurs?|rices?|trices?|nes?|es?|s)\b/giu, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLocaleLowerCase("fr")
}
