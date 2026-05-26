import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
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
  type Poruka,
} from "../lib/chatStreams.js";

export function Chat() {
  const { id: razgovorIdFromUrl } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [otvoreniCitat, setOtvoreniCitat] = useState<Citat | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Privremeni ključ za novi razgovor (URL još ne sadrži `id`). Postaje stvarni
  // razgovorId kroz `chatStreams` re-key kad backend emituje `razgovor` SSE
  // event, i tad se URL ažurira preko `navigate(..., { replace })`.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  // Ref prati zadnji pendingKey da bismo iz `onRazgovorKreiran` callback-a
  // mogli da provjerimo da li je korisnik u međuvremenu napustio razgovor.
  const pendingKeyRef = useRef<string | null>(null);
  useEffect(() => {
    pendingKeyRef.current = pendingKey;
  }, [pendingKey]);

  // Reset pendingKey-a na svaku navigaciju — pokriva i "Novi razgovor" iz
  // "/" u "/" (URL isti, ali `location.key` nov) i prelaz sa razgovora.
  useEffect(() => {
    setPendingKey(null);
  }, [location.key]);

  const currentKey = razgovorIdFromUrl ?? pendingKey;

  // Stanje se čita direktno iz chatStreams na svakom render-u — useReducer je
  // samo trigger za re-render kad subscription javi promjenu. Ovo izbjegava
  // "stale snapshot" problem koji nastaje kad useState zadrži poruke iz
  // prethodnog razgovora dok cleanup ne otkači pretplatu.
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!currentKey) return;
    return subscribe(currentKey, () => forceRender());
  }, [currentKey]);
  const stanje = currentKey ? getState(currentKey) : PRAZAN_STATE;

  // Učitaj istoriju iz DB-a kad URL ima razgovor. ensureLoaded je idempotentno
  // pa ponovni mount ne refetch-uje ako je već keš-irano.
  useEffect(() => {
    if (razgovorIdFromUrl) ensureLoaded(razgovorIdFromUrl);
  }, [razgovorIdFromUrl]);

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
      // Inače kreiraj nov pending entry i postavi URL kad backend lijeno
      // kreira razgovor (kroz `onRazgovorKreiran` callback — ne useEffect, da
      // navigacija ne okida slučajno kad korisnik ode na drugi razgovor).
      const aktivniRazgovorId = razgovorIdFromUrl ?? stanje.razgovorId;
      if (aktivniRazgovorId) {
        startStream({ pitanje, razgovorId: aktivniRazgovorId });
        return;
      }
      let tempKey: string | null = null;
      tempKey = startStream({
        pitanje,
        onRazgovorKreiran: (id) => {
          // Navigiraj samo ako je korisnik još uvijek u istom (pending)
          // razgovoru. Ako je u međuvremenu kliknuo "Novi razgovor" ili
          // otvorio drugi, pendingKey ref je već prazan ili drugi.
          if (pendingKeyRef.current === tempKey) {
            navigate(`/razgovor/${id}`, { replace: true });
          }
        },
      });
      setPendingKey(tempKey);
    },
    [stanje.obrada, stanje.razgovorId, razgovorIdFromUrl, navigate],
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
