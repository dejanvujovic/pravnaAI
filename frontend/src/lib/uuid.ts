/**
 * UUID v4 generator koji radi i u ne-secure kontekstu (plain HTTP).
 *
 * `crypto.randomUUID()` je dostupan SAMO u secure context-u (HTTPS ili
 * localhost). Kad se aplikacija servira preko `http://<ip>/` u internoj
 * mreži (pilot bez TLS-a), `crypto.randomUUID` je undefined i baca
 * "crypto.randomUUID is not a function". `crypto.getRandomValues()` je
 * naprotiv dostupan i u ne-secure kontekstu, pa gradimo UUID ručno.
 */

export function generisiUUID(): string {
  // Brzi put — secure context (HTTPS/localhost).
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Fallback — UUID v4 iz 16 nasumičnih bajtova.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Verzija 4 (gornji nibble 7. bajta) i RFC 4122 varijanta (2 bita 9. bajta).
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i]!.toString(16).padStart(2, "0"));

  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}
