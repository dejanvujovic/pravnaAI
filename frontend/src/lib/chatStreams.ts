/**
 * Singleton store za aktivne Q&A stream-ove. Postoji izvan React komponentne
 * hijerarhije da bi stream mogao da preživi unmount-ovanje `Chat`-a (kad
 * korisnik klikne "Novi razgovor" dok prethodni odgovor još stiže).
 *
 * Model:
 *   - Svaki razgovor ima ulaz u `entries` map-i ključem `razgovorId`.
 *   - Novi razgovor (kad URL nema `id`) startuje pod privremenim ključem
 *     `pending-<uuid>`, koji se re-keyuje u stvarni `razgovorId` kad backend
 *     emituje `razgovor` SSE event.
 *   - Ulaz sadrži: poruke iz DB-a (istorija) + poruke koje je trenutni stream
 *     dodao. Stream zapisuje direktno u zajedničku listu.
 *   - Komponente se pretplaćuju pod ključem koji prate; pretplata je vezana
 *     za sam `ConversationEntry` objekat, pa re-keyovanje ne prekida vezu.
 *
 * Backend već snima user poruku ranije i AI poruku na `kraj`, pa ako se
 * korisnik vrati na razgovor tokom stream-a, dedup po posljednjoj user
 * poruci se radi u Chat-u pri spajanju `istorijaDB + liveState`.
 */

import type { Citat, QnaPoruka } from "@rtcg/shared";
import { getRazgovor, QnaApiError, streamQna } from "./api.js";
import { dobaviSesijaId } from "./session.js";

export interface UserMsg {
  uloga: "user";
  tekst: string;
}

export interface AiMsg {
  uloga: "ai";
  tekst: string;
  citati: Citat[];
  status: "streaming" | "kraj" | "greska";
  greska?: string;
  trajanjeMs?: number;
}

export type Poruka = UserMsg | AiMsg;

export interface ConversationState {
  /** Poruke iz DB-a, učitane kroz `ensureLoaded`. */
  istorijaDB: Poruka[];
  /** Poruke koje je trenutni (ili posljednji) stream dodao u ovoj sesiji. */
  liveDodate: Poruka[];
  /** True dok je stream aktivan. */
  obrada: boolean;
  /** True dok se istorija iz DB-a fetch-uje. */
  ucitavanje: boolean;
  /** Greška pri učitavanju istorije iz DB-a. */
  greskaUcitavanja: string | null;
  /** Naslov razgovora — postavlja se na `razgovor` SSE event-u za nove razgovore. */
  naslov: string | null;
  /**
   * Pravi razgovorId kad ga znamo (uvijek za postojeće razgovore; za nove
   * tek nakon `razgovor` SSE event-a). Chat ga koristi za URL replace.
   */
  razgovorId: string | null;
}

type Listener = (state: ConversationState) => void;

interface ConversationEntry {
  state: ConversationState;
  controller: AbortController | null;
  listeners: Set<Listener>;
}

export const EMPTY: ConversationState = {
  istorijaDB: [],
  liveDodate: [],
  obrada: false,
  ucitavanje: false,
  greskaUcitavanja: null,
  naslov: null,
  razgovorId: null,
};

const entries = new Map<string, ConversationEntry>();

const globalListeners = new Set<() => void>();
const fireGlobal = () => {
  for (const cb of globalListeners) cb();
};

/** Pretplati se na bilo kakvu globalnu promjenu (nov razgovor, kraj stream-a). */
export function subscribeGlobal(cb: () => void): () => void {
  globalListeners.add(cb);
  return () => {
    globalListeners.delete(cb);
  };
}

function getOrCreate(key: string): ConversationEntry {
  let entry = entries.get(key);
  if (!entry) {
    entry = { state: { ...EMPTY }, controller: null, listeners: new Set() };
    entries.set(key, entry);
  }
  return entry;
}

function patch(entry: ConversationEntry, p: Partial<ConversationState>): void {
  entry.state = { ...entry.state, ...p };
  for (const l of entry.listeners) l(entry.state);
}

/** Snapshot trenutnog stanja za ključ (ili EMPTY ako ne postoji). */
export function getState(key: string): ConversationState {
  return entries.get(key)?.state ?? EMPTY;
}

/** Pretplata na promjene jednog razgovora. Vraća unsubscribe. */
export function subscribe(key: string, listener: Listener): () => void {
  const entry = getOrCreate(key);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

/**
 * Učitaj istoriju razgovora iz DB-a (jednom po sesiji). Idempotentno —
 * ne radi ništa ako je već učitano ili u toku.
 */
export async function ensureLoaded(razgovorId: string): Promise<void> {
  const entry = getOrCreate(razgovorId);
  if (entry.state.ucitavanje) return;
  if (entry.state.istorijaDB.length > 0) return;
  // Ako je razgovor već u live cache-u (npr. započet u ovoj sesiji), nemoj
  // refetch-ovati — drugačije bi došlo do duplikata sa liveDodate.
  if (entry.state.liveDodate.length > 0) return;

  patch(entry, { ucitavanje: true, greskaUcitavanja: null });
  try {
    const rg = await getRazgovor(razgovorId);
    const istorijaDB: Poruka[] = rg.poruke.map((p) =>
      p.uloga === "user"
        ? { uloga: "user", tekst: p.tekst }
        : {
            uloga: "ai",
            tekst: p.tekst,
            citati: p.citati ?? [],
            status: "kraj",
          },
    );
    patch(entry, {
      istorijaDB,
      naslov: rg.naslov,
      razgovorId,
      ucitavanje: false,
    });
  } catch (e) {
    const poruka =
      e instanceof Error ? e.message : "Razgovor nije moguće učitati.";
    patch(entry, { ucitavanje: false, greskaUcitavanja: poruka });
  }
}

export interface StartParams {
  pitanje: string;
  /** Postojeći razgovor — ako se postavi, backend reloaduje istoriju iz DB-a. */
  razgovorId?: string;
  /**
   * Poziva se kad backend lijeno kreira razgovor i emituje prvi SSE event
   * sa `razgovorId`-jem. Chat ovo koristi da postavi URL — nije useEffect
   * jer bi useEffect-ovo praćenje `stanje.razgovorId` pogrešno okidalo
   * navigaciju nazad kad korisnik ručno ode sa razgovora.
   */
  onRazgovorKreiran?: (razgovorId: string) => void;
}

/**
 * Pokrene novi Q&A stream. Vraća ključ pod kojim je stream registrovan u
 * store-u; za nove razgovore to je `pending-<uuid>` koji će biti re-keyovan
 * u stvarni `razgovorId` po prvom SSE event-u.
 */
export function startStream(params: StartParams): string {
  const isNew = !params.razgovorId;
  let key = isNew ? `pending-${crypto.randomUUID()}` : params.razgovorId!;

  const entry = getOrCreate(key);
  if (entry.state.obrada) return key; // već u toku, ignoriši duplikat

  const controller = new AbortController();
  entry.controller = controller;

  // Optimistički dodaj user pitanje + placeholder za AI odgovor.
  const noveDodate: Poruka[] = [
    ...entry.state.liveDodate,
    { uloga: "user", tekst: params.pitanje },
    { uloga: "ai", tekst: "", citati: [], status: "streaming" },
  ];
  patch(entry, { liveDodate: noveDodate, obrada: true });
  fireGlobal();

  // Za novi razgovor backend dobija samo `sesijaId` (kreira lijeno). Istoriju
  // ne šaljemo jer je novi razgovor — nema prethodnih razmjena.
  const req = params.razgovorId
    ? { pitanje: params.pitanje, razgovorId: params.razgovorId }
    : { pitanje: params.pitanje, sesijaId: dobaviSesijaId() };

  const azurirajAi = (mut: (m: AiMsg) => AiMsg) => {
    const kopija = [...entry.state.liveDodate];
    for (let i = kopija.length - 1; i >= 0; i--) {
      if (kopija[i]!.uloga === "ai") {
        kopija[i] = mut(kopija[i] as AiMsg);
        break;
      }
    }
    patch(entry, { liveDodate: kopija });
  };

  (async () => {
    try {
      for await (const ev of streamQna(req, controller.signal)) {
        if (ev.tip === "razgovor") {
          // Re-key sa pending → stvarni razgovorId. Isti entry objekat, samo
          // se preselio u Map. Pretplate ostaju vezane jer su na entry.
          if (key !== ev.id) {
            entries.delete(key);
            entries.set(ev.id, entry);
            key = ev.id;
          }
          patch(entry, { razgovorId: ev.id, naslov: ev.naslov });
          params.onRazgovorKreiran?.(ev.id);
          fireGlobal();
        } else if (ev.tip === "citati") {
          azurirajAi((m) => ({ ...m, citati: ev.citati }));
        } else if (ev.tip === "token") {
          azurirajAi((m) => ({ ...m, tekst: m.tekst + ev.tekst }));
        } else if (ev.tip === "kraj") {
          azurirajAi((m) => ({
            ...m,
            status: "kraj",
            trajanjeMs: ev.trajanjeMs,
          }));
        } else if (ev.tip === "greska") {
          azurirajAi((m) => ({ ...m, status: "greska", greska: ev.poruka }));
        }
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      const poruka =
        e instanceof QnaApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Nepoznata greška u komunikaciji sa serverom.";
      azurirajAi((m) => ({ ...m, status: "greska", greska: poruka }));
    } finally {
      patch(entry, { obrada: false });
      entry.controller = null;
      fireGlobal();
    }
  })();

  return key;
}

/**
 * Zaboravi keš-iranu istoriju razgovora (sljedeći `ensureLoaded` će refetch-ovati).
 * Bezbjedno samo ako stream nije aktivan — inače bismo izgubili live poruke.
 */
export function invalidate(razgovorId: string): void {
  const entry = entries.get(razgovorId);
  if (!entry) return;
  if (entry.state.obrada) return;
  entries.delete(razgovorId);
}

/** Eksplicitno otkaži stream (rijetko — koristi se npr. pri logout-u). */
export function abortStream(key: string): void {
  const entry = entries.get(key);
  if (entry?.controller) entry.controller.abort();
}
