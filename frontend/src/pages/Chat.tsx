import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { Citat } from "@rtcg/shared";
import { Composer } from "../components/Composer.js";
import { EmptyState } from "../components/EmptyState.js";
import { AiMessage, UserMessage } from "../components/Message.js";
import { Sidebar } from "../components/Sidebar.js";
import { SourceDrawer } from "../components/SourceDrawer.js";
import {
  EMPTY as PRAZAN_STATE,
  ensureLoaded,
  getState,
  startStream,
  subscribe,
  type ConversationState,
  type Poruka,
} from "../lib/chatStreams.js";

export function Chat() {
  const { id: razgovorIdFromUrl } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [otvoreniCitat, setOtvoreniCitat] = useState<Citat | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Privremeni ključ za novi razgovor (URL još ne sadrži `id`). Postaje stvarni
  // razgovorId nakon `razgovor` SSE event-a (kroz re-key u chatStreams), i tad
  // se URL ažurira na `/razgovor/:id` preko `navigate(..., { replace })`.
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  // Reset na nov pending svaki put kad korisnik navigira ka "/". Ovo pokriva
  // i slučaj kad je već na "/" pa klikne "Novi razgovor" — bez ovoga bi
  // ostao zaglavljen na trenutnom (pending) stream-u jer se URL nije
  // promijenio. `location.key` se mijenja na svaku navigaciju.
  useEffect(() => {
    if (!razgovorIdFromUrl) setPendingKey(null);
  }, [location.key, razgovorIdFromUrl]);

  const currentKey = razgovorIdFromUrl ?? pendingKey;

  // Pretplati se na chatStreams stanje za trenutni razgovor.
  const [stanje, setStanje] = useState<ConversationState>(() =>
    currentKey ? getState(currentKey) : PRAZAN_STATE,
  );
  useEffect(() => {
    if (!currentKey) {
      setStanje(PRAZAN_STATE);
      return;
    }
    setStanje(getState(currentKey));
    return subscribe(currentKey, setStanje);
  }, [currentKey]);

  // Učitaj istoriju iz DB-a kad URL ima razgovor. ensureLoaded je idempotentno
  // pa ponovni mount ne refetch-uje ako je već keš-irano.
  useEffect(() => {
    if (razgovorIdFromUrl) ensureLoaded(razgovorIdFromUrl);
  }, [razgovorIdFromUrl]);

  // Ako stream u novom razgovoru dobije razgovorId, postavi URL bez gubitka
  // konteksta. `navigate` umjesto `history.replaceState` da React Router ostane
  // sinhron — inače Sidebar-ovo `navigate("/")` ne radi.
  useEffect(() => {
    if (!razgovorIdFromUrl && stanje.razgovorId) {
      navigate(`/razgovor/${stanje.razgovorId}`, { replace: true });
    }
  }, [stanje.razgovorId, razgovorIdFromUrl, navigate]);

  // Auto-scroll na dno kad poruke rastu.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [stanje.istorijaDB, stanje.liveDodate]);

  const posaljiPitanje = useCallback(
    (pitanje: string) => {
      if (stanje.obrada) return;
      // Ako je razgovor već dobio id (URL ili promovisani pending), nastavi u njemu.
      // Inače kreiraj nov pending entry.
      const aktivniRazgovorId = razgovorIdFromUrl ?? stanje.razgovorId;
      if (aktivniRazgovorId) {
        startStream({ pitanje, razgovorId: aktivniRazgovorId });
      } else {
        const key = startStream({ pitanje });
        setPendingKey(key);
      }
    },
    [stanje.obrada, stanje.razgovorId, razgovorIdFromUrl],
  );

  // istorijaDB se učitava samo jednom (i ne refetch-uje dok je live cache aktivan),
  // pa je obično konkatenacija dovoljna bez dedup-a.
  const sve: Poruka[] = useMemo(
    () => [...stanje.istorijaDB, ...stanje.liveDodate],
    [stanje.istorijaDB, stanje.liveDodate],
  );

  const prazno = sve.length === 0 && !stanje.ucitavanje;

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <Sidebar />

      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
          {prazno ? (
            <EmptyState onPredlog={posaljiPitanje} />
          ) : (
            <div style={{ maxWidth: 760, margin: "0 auto", padding: "26px 24px 40px" }}>
              {stanje.greskaUcitavanja && (
                <AiMessage
                  tekst=""
                  citati={[]}
                  status="greska"
                  greska={stanje.greskaUcitavanja}
                />
              )}
              {sve.map((p, i) =>
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
          <Composer onSend={posaljiPitanje} disabled={stanje.obrada} />
        </div>
      </div>

      <SourceDrawer citat={otvoreniCitat} onZatvori={() => setOtvoreniCitat(null)} />
    </div>
  );
}
