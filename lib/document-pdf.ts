/**
 * Le PDF d'un document : une seule page, l'image du document (JPEG) à pleine page. Roll20
 * accepte les PDF dans son Journal ; l'application les ouvre dans le lecteur du système.
 * Écrit à la main (quelques objets PDF) : pas de bibliothèque à embarquer pour une image.
 */

/** Largeur et hauteur d'un JPEG, lues dans son en-tête (marqueur SOF), et ses composantes. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number; components: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue }
    const marker = bytes[offset + 1]
    // Marqueurs sans longueur (remplissage, RST).
    if (marker === 0xff || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) { offset += 2; continue }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    // SOF0 à SOF15, sauf DHT (C4), JPG (C8) et DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6]
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8]
      const components = bytes[offset + 9]
      return width && height ? { width, height, components } : null
    }
    offset += 2 + length
  }
  return null
}

/** Un texte de métadonnées PDF en UTF-16 (accents compris), écrit en hexadécimal. */
function pdfText(value: string) {
  let hex = "FEFF"
  for (const char of value.slice(0, 200)) {
    const code = char.codePointAt(0) ?? 63
    if (code > 0xffff) {
      const high = Math.floor((code - 0x10000) / 0x400) + 0xd800
      const low = ((code - 0x10000) % 0x400) + 0xdc00
      hex += high.toString(16).padStart(4, "0") + low.toString(16).padStart(4, "0")
    } else hex += code.toString(16).padStart(4, "0")
  }
  return `<${hex.toUpperCase()}>`
}

/** Le PDF d'une page dont l'image est ce JPEG ; la page garde ses proportions (largeur A4). */
export function pdfFromJpeg(jpeg: Uint8Array, title: string): Uint8Array {
  const size = jpegSize(jpeg)
  if (!size) throw new Error("INVALID_JPEG")
  const pageWidth = 595.28
  const pageHeight = Math.round((pageWidth * size.height / size.width) * 100) / 100
  const colorSpace = size.components === 1 ? "/DeviceGray" : size.components === 4 ? "/DeviceCMYK" : "/DeviceRGB"
  const encoder = new TextEncoder()
  const drawing = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part
    parts.push(bytes)
    length += bytes.length
  }
  const object = (number: number, body: string | Array<string | Uint8Array>) => {
    offsets[number] = length
    push(`${number} 0 obj\n`)
    for (const piece of Array.isArray(body) ? body : [body]) push(piece)
    push("\nendobj\n")
  }
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")
  object(1, "<< /Type /Catalog /Pages 2 0 R >>")
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  object(4, [`<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode${size.components === 4 ? " /Decode [1 0 1 0 1 0 1 0]" : ""} /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream"])
  object(5, `<< /Length ${encoder.encode(drawing).length} >>\nstream\n${drawing}\nendstream`)
  object(6, `<< /Title ${pdfText(title || "Document")} /Producer ${pdfText("Eraser")} /Creator ${pdfText("Eraser")} >>`)
  const xref = length
  push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`)
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const output = new Uint8Array(length)
  let position = 0
  for (const part of parts) { output.set(part, position); position += part.length }
  return output
}
