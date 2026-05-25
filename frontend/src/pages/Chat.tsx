import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { Citat, QnaPoruka } from "@rtcg/shared";
import { Composer } from "../components/Composer.js";
import { EmptyState } from "../components/EmptyState.js";
import { AiMessage, UserMessage } from "../components/Message.js";
import { Sidebar } from "../components/Sidebar.js";
import { SourceDrawer } from "../components/SourceDrawer.js";
import { DocumentsApiError, getRazgovor, QnaApiError, streamQna } from "../lib/api.js";
import { dobaviSesijaId } from "../lib/session.js";

interface UserMsg {
  uloga: "user";
  tekst: string;
}
interface AiMsg {
  uloga: "ai";
  tekst: string;
  citati: Citat[];
  status: "streaming" | "kraj" | "greska";
  greska?: string;
  trajanjeMs?: number;
}
type Poruka = UserMsg | AiMsg;

export function Chat() {
  const { id: razgovorIdFromUrl } = useParams<{ id: string }>();
  const [poruke, setPoruke] = useState<Poruka[]>([]);
  const [obrada, setObrada] = useState(false);
  const [otvoreniCitat, setOtvoreniCitat] = useState<Citat | null>(null);
  // Aktivni razgovor — postavljen iz URL-a ili iz "razgovor" SSE eventa
  // pri lijenom kreiranju u backend-u. null = novi (još nije perzistiran).
  const [razgovorId, setRazgovorId] = useState<string | null>(razgovorIdFromUrl ?? null);
  const [osvezenjeSidebar, setOsvezenjeSidebar] = useState(0);
  const [ucitavanjeRazgovora, setUcitavanjeRazgovora] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Učitaj razgovor kad se mijenja URL.
  useEffect(() => {
    abortRef.current?.abort();
    if (!razgovorIdFromUrl) {
      setRazgovorId(null);
      setPoruke([]);
      return;
    }
    setRazgovorId(razgovorIdFromUrl);
    const ctrl = new AbortController();
    setUcitavanjeRazgovora(true);
    getRazgovor(razgovorIdFromUrl, ctrl.signal)
      .then((rg) => {
        if (ctrl.signal.aborted) return;
        const ucitane: Poruka[] = rg.poruke.map((p) =>
          p.uloga === "user"
            ? { uloga: "user", tekst: p.tekst }
            : {
                uloga: "ai",
                tekst: p.tekst,
                citati: p.citati ?? [],
                status: "kraj",
              },
        );
        setPoruke(ucitane);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        const poruka =
          e instanceof DocumentsApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Razgovor nije moguće učitati.";
        setPoruke([
          { uloga: "user", tekst: "" },
          { uloga: "ai", tekst: "", citati: [], status: "greska", greska: poruka },
        ]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setUcitavanjeRazgovora(false);
      });
    return () => ctrl.abort();
  }, [razgovorIdFromUrl]);

  // Auto-scroll na dno kad poruke rastu.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [poruke]);

  // Otkaži aktivan stream pri unmount-u (npr. navigacija na /ingest).
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const posaljiPitanje = useCallback(
    async (pitanje: string) => {
      if (obrada) return;
      setObrada(true);

      // Snimi istoriju prije nego dodaš novu poruku. Backend će je
      // ignorisati ako šaljemo razgovorId (učitava iz DB-a), ali je
      // korisna za prvu poruku novog razgovora.
      const istorija: QnaPoruka[] = poruke
        .filter((p) => p.uloga === "user" || (p.uloga === "ai" && p.status === "kraj" && p.tekst.length > 0))
        .map((p) => ({ uloga: p.uloga, tekst: p.tekst }));

      setPoruke((p) => [
        ...p,
        { uloga: "user", tekst: pitanje },
        { uloga: "ai", tekst: "", citati: [], status: "streaming" },
      ]);

      const azuriraj = (mut: (m: AiMsg) => AiMsg) => {
        setPoruke((p) => {
          const kopija = [...p];
          for (let i = kopija.length - 1; i >= 0; i--) {
            if (kopija[i]!.uloga === "ai") {
              kopija[i] = mut(kopija[i] as AiMsg);
              break;
            }
          }
          return kopija;
        });
      };

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const req = {
          pitanje,
          ...(razgovorId ? { razgovorId } : { sesijaId: dobaviSesijaId() }),
          ...(istorija.length > 0 && !razgovorId ? { istorija } : {}),
        };
        for await (const ev of streamQna(req, ctrl.signal)) {
          if (ev.tip === "razgovor") {
            // Lijeno kreiran u backend-u — zapamti id i osveži sidebar.
            // URL ne mijenjamo automatski da ne prekinemo stream; korisnik
            // će vidjeti razgovor u sidebar-u i može da ga otvori.
            setRazgovorId(ev.id);
            setOsvezenjeSidebar((n) => n + 1);
            // Ažuriraj URL bez navigacije/reload-a da bookmark/share radi.
            window.history.replaceState(null, "", `/razgovor/${ev.id}`);
          } else if (ev.tip === "citati") {
            azuriraj((m) => ({ ...m, citati: ev.citati }));
          } else if (ev.tip === "token") {
            azuriraj((m) => ({ ...m, tekst: m.tekst + ev.tekst }));
          } else if (ev.tip === "kraj") {
            azuriraj((m) => ({
              ...m,
              status: "kraj",
              trajanjeMs: ev.trajanjeMs,
            }));
            // Osveži sidebar — azurirano timestamp se promijenio.
            setOsvezenjeSidebar((n) => n + 1);
          } else if (ev.tip === "greska") {
            azuriraj((m) => ({ ...m, status: "greska", greska: ev.poruka }));
          }
        }
      } catch (e) {
        if (ctrl.signal.aborted) return;
        const poruka =
          e instanceof QnaApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Nepoznata greška u komunikaciji sa serverom.";
        azuriraj((m) => ({ ...m, status: "greska", greska: poruka }));
      } finally {
        setObrada(false);
        abortRef.current = null;
      }
    },
    [obrada, poruke, razgovorId],
  );

  const prazno = poruke.length === 0 && !ucitavanjeRazgovora;

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <Sidebar osvezenje={osvezenjeSidebar} />

      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
          {prazno ? (
            <EmptyState onPredlog={posaljiPitanje} />
          ) : (
            <div style={{ maxWidth: 760, margin: "0 auto", padding: "26px 24px 40px" }}>
              {poruke.map((p, i) =>
                p.uloga === "user" ? (
                  <UserMessage key={i} tekst={p.tekst} />
                ) : (
                  <AiMessage
                    key={i}
                    tekst={p.tekst}
                    citati={p.citati}
                    status={p.status}
                    onClickCitat={setOtvoreniCitat}
                    {...(p.greska !== undefined && { greska: p.greska })}
                    {...(p.trajanjeMs !== undefined && {
                      trajanjeMs: p.trajanjeMs,
                    })}
                  />
                ),
              )}
            </div>
          )}
        </div>

        <div
          style={{
            paddingTop: 8,
            background: "linear-gradient(180deg, transparent, var(--bg) 30%)",
          }}
        >
          <Composer onSend={posaljiPitanje} disabled={obrada} />
        </div>
      </div>

      <SourceDrawer citat={otvoreniCitat} onZatvori={() => setOtvoreniCitat(null)} />
    </div>
  );
}
