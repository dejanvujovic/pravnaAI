/**
 * Browser session identifier — UUID koji se čuva u localStorage.
 * Koristi se da backend grupiše razgovore po pretraživaču bez auth-a.
 * Mijenja se kad korisnik obriše storage ili pređe na drugi browser.
 */

const KLJUC = "rtcg.sesijaId";

/** Vrati postojeći UUID iz storage-a ili generiši novi i sačuvaj. */
export function dobaviSesijaId(): string {
  let id = localStorage.getItem(KLJUC);
  if (!id || !UUID_RE.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(KLJUC, id);
  }
  return id;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
