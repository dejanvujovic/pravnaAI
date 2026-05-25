import { useEffect, useState } from "react";
import {
  Check,
  CircleAlert,
  CircleDashed,
  Loader2,
  ScanSearch,
} from "lucide-react";
import {
  INGEST_STAGE_ORDER,
  IngestStage,
  type IngestStatus,
} from "@rtcg/shared";
import { DocumentsApiError, getIngestStatus } from "../lib/api.js";

const STAGE_LABELS: Record<IngestStage, string> = {
  PARSIRANJE: "Parsiranje",
  CHUNKING: "Segmentacija",
  EMBEDDING: "Vektorizacija",
  INDEKSIRANJE: "Indeksiranje",
  ZAVRSENO: "Završeno",
  GRESKA: "Greška",
};

const POLLING_MS = 2500;

interface Props {
  documentId: string;
  initial?: IngestStatus | null;
  onZavrseno?: (status: IngestStatus) => void;
  onGreska?: (status: IngestStatus) => void;
  onUkloni?: (id: string) => void;
}

/**
 * Polling-bazirana pipeline kartica za aktivan ingest. Stane sa polling-om
 * kad status pređe u ZAVRSENO ili GRESKA.
 */
export function Pipeline({
  documentId,
  initial,
  onZavrseno,
  onGreska,
  onUkloni,
}: Props) {
  const [status, setStatus] = useState<IngestStatus | null>(initial ?? null);
  const [polling, setPolling] = useState(true);
  const [greskaApi, setGreskaApi] = useState<string | null>(null);

  useEffect(() => {
    let zivo = true;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const s = await getIngestStatus(documentId);
        if (!zivo) return;
        setStatus(s);
        setGreskaApi(null);
        if (s.faza === IngestStage.ZAVRSENO) {
          setPolling(false);
          onZavrseno?.(s);
          return;
        }
        if (s.faza === IngestStage.GRESKA) {
          setPolling(false);
          onGreska?.(s);
          return;
        }
        timer = window.setTimeout(tick, POLLING_MS);
      } catch (e) {
        if (!zivo) return;
        setGreskaApi(
          e instanceof DocumentsApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Greška u komunikaciji sa serverom.",
        );
        // I dalje pokušavamo — možda je server kratko nedostupan.
        timer = window.setTimeout(tick, POLLING_MS * 2);
      }
    };

    tick();
    return () => {
      zivo = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [documentId, onZavrseno, onGreska]);

  if (!status) {
    return (
      <div style={cardStyle}>
        <div
          className="ui-sans"
          style={{ color: "var(--muted)", fontSize: 13, display: "flex", gap: 10, alignItems: "center" }}
        >
          <Loader2 size={14} className="spin" />
          Učitavam status…
        </div>
      </div>
    );
  }

  const trenutnaFaza = status.faza;
  const greska = trenutnaFaza === IngestStage.GRESKA;
  const zavrseno = trenutnaFaza === IngestStage.ZAVRSENO;

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {status.naziv}
          </div>
          <div
            className="ui-sans"
            style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}
          >
            {status.velicinaBajtova
              ? `${(status.velicinaBajtova / 1024 / 1024).toFixed(2)} MB · `
              : ""}
            {status.brojSegmenata > 0 && `${status.brojSegmenata} segmenata · `}
            {status.ocr && (
              <span style={{ color: "var(--praksa)" }}>
                <ScanSearch size={11} style={{ verticalAlign: "-2px", marginRight: 3 }} />
                OCR
              </span>
            )}
          </div>
        </div>
        {(zavrseno || greska) && onUkloni && (
          <button
            type="button"
            onClick={() => onUkloni(documentId)}
            className="ui-sans"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--muted)",
              borderRadius: "var(--r-button)",
              padding: "5px 10px",
              fontSize: 11.5,
              cursor: "pointer",
            }}
          >
            Sakrij
          </button>
        )}
      </div>

      {/* Pipeline koraci. */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {INGEST_STAGE_ORDER.map((faza, i) => {
          const idx = INGEST_STAGE_ORDER.indexOf(faza);
          const trenIdx = greska
            ? trenutnaFazaIdxIliMax(status)
            : zavrseno
              ? INGEST_STAGE_ORDER.length
              : INGEST_STAGE_ORDER.indexOf(trenutnaFaza as IngestStage);
          const done = idx < trenIdx;
          const active = idx === trenIdx && !zavrseno && !greska;
          const isError = greska && idx === trenIdx;
          return (
            <Korak
              key={faza}
              labela={STAGE_LABELS[faza]}
              done={done}
              active={active}
              greska={isError}
              prvi={i === 0}
            />
          );
        })}
      </div>

      {greska && status.greska && (
        <div
          className="ui-sans"
          style={{
            marginTop: 14,
            padding: "10px 14px",
            background: "color-mix(in srgb, var(--error) 12%, var(--panel))",
            border:
              "1px solid color-mix(in srgb, var(--error) 40%, var(--border))",
            borderRadius: "var(--r-button)",
            fontSize: 12.5,
            color: "var(--text)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <CircleAlert size={14} color="var(--error)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{status.greska}</span>
        </div>
      )}

      {greskaApi && polling && (
        <div
          className="ui-sans"
          style={{
            marginTop: 10,
            fontSize: 11.5,
            color: "var(--muted)",
            fontStyle: "italic",
          }}
        >
          Polling problem: {greskaApi} — pokušavam ponovo…
        </div>
      )}
    </div>
  );
}

function trenutnaFazaIdxIliMax(s: IngestStatus): number {
  // Kad je GRESKA — pokušamo da izvučemo iz brojSegmenata približnu fazu.
  // brojSegmenata > 0 znači da je CHUNKING bar djelimično završio.
  if (s.brojSegmenata > 0) return INGEST_STAGE_ORDER.indexOf(IngestStage.EMBEDDING);
  return 0;
}

interface KorakProps {
  labela: string;
  done: boolean;
  active: boolean;
  greska: boolean;
  prvi: boolean;
}

function Korak({ labela, done, active, greska, prvi }: KorakProps) {
  const boja = greska
    ? "var(--error)"
    : done
      ? "var(--ok)"
      : active
        ? "var(--accent)"
        : "var(--border)";
  const tekstBoja = greska
    ? "var(--error)"
    : done
      ? "var(--ok)"
      : active
        ? "var(--text)"
        : "var(--muted)";

  return (
    <>
      {!prvi && (
        <div
          style={{
            flex: 1,
            height: 1,
            background: done ? "var(--ok)" : "var(--border)",
            margin: "0 6px",
            transition: "background var(--t-mid)",
          }}
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: `1.5px solid ${boja}`,
            background: done ? "var(--ok)" : "var(--panel-2)",
            display: "grid",
            placeItems: "center",
            transition: "all var(--t-mid)",
          }}
        >
          {done ? (
            <Check size={13} color="var(--bg)" strokeWidth={3} />
          ) : greska ? (
            <CircleAlert size={13} color={boja} />
          ) : active ? (
            <Loader2 size={13} color={boja} className="spin" />
          ) : (
            <CircleDashed size={13} color={boja} />
          )}
        </div>
        <span
          className="ui-sans"
          style={{
            fontSize: 10.5,
            color: tekstBoja,
            fontWeight: active || done ? 500 : 400,
            letterSpacing: ".02em",
            whiteSpace: "nowrap",
          }}
        >
          {labela}
        </span>
      </div>
    </>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-card)",
  padding: "16px 20px",
};
