import { useCallback, useEffect, useRef, useState } from "react";
import type { Citat } from "@rtcg/shared";
import { Composer } from "../components/Composer.js";
import { EmptyState } from "../components/EmptyState.js";
import { AiMessage, UserMessage } from "../components/Message.js";
import { QnaApiError, streamQna } from "../lib/api.js";

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
  const [poruke, setPoruke] = useState<Poruka[]>([]);
  const [obrada, setObrada] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
        for await (const ev of streamQna({ pitanje }, ctrl.signal)) {
          if (ev.tip === "citati") {
            azuriraj((m) => ({ ...m, citati: ev.citati }));
          } else if (ev.tip === "token") {
            azuriraj((m) => ({ ...m, tekst: m.tekst + ev.tekst }));
          } else if (ev.tip === "kraj") {
            azuriraj((m) => ({
              ...m,
              status: "kraj",
              trajanjeMs: ev.trajanjeMs,
            }));
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
    [obrada],
  );

  const prazno = poruke.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
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
  );
}
