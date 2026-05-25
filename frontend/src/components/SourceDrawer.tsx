import { useEffect, useState } from "react";
import { Calendar, FileText, Hash, Landmark, Loader2, X } from "lucide-react";
import type { Citat, ChunkDetail } from "@rtcg/shared";
import { DocumentsApiError, getChunk } from "../lib/api.js";
import { TIP_META } from "../lib/docTypes.js";
import { TypeBadge } from "./TypeBadge.js";

interface Props {
  /** Citat koji je korisnik kliknuo. `null` zatvara drawer. */
  citat: Citat | null;
  onZatvori: () => void;
}

/**
 * Desno klizajući panel sa punim tekstom citiranog chunka + metapodaci
 * dokumenta. Otvara se klikom na <SourcePill>.
 *
 * Učitava ChunkDetail asinkrono — dok se ne učita, prikazuje skeleton
 * sa već poznatim podacima iz Citat-a (naslov, isjecak).
 */
export function SourceDrawer({ citat, onZatvori }: Props) {
  const [detalj, setDetalj] = useState<ChunkDetail | null>(null);
  const [ucitavanje, setUcitavanje] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  useEffect(() => {
    if (!citat) {
      setDetalj(null);
      setGreska(null);
      return;
    }
    setUcitavanje(true);
    setGreska(null);
    setDetalj(null);
    const ctrl = new AbortController();
    getChunk(citat.chunkId, ctrl.signal)
      .then((d) => {
        if (ctrl.signal.aborted) return;
        setDetalj(d);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setGreska(
          e instanceof DocumentsApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Nepoznata greška.",
        );
      })
      .finally(() => {
        if (ctrl.signal.aborted) return;
        setUcitavanje(false);
      });
    return () => ctrl.abort();
  }, [citat]);

  useEffect(() => {
    if (!citat) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onZatvori();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [citat, onZatvori]);

  const otvoren = citat !== null;
  const meta = detalj?.dokument;
  const tipMeta = citat ? TIP_META[citat.tip] : null;

  return (
    <>
      {/* Backdrop. Klik zatvara. */}
      <div
        onClick={onZatvori}
        aria-hidden={!otvoren}
        style={{
          position: "fixed",
          inset: 0,
          background: "color-mix(in srgb, #000 50%, transparent)",
          opacity: otvoren ? 1 : 0,
          pointerEvents: otvoren ? "auto" : "none",
          transition: "opacity var(--t-mid)",
          zIndex: 99,
        }}
      />

      {/* Drawer. Slide-in sa desne ivice. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Detalji izvora"
        aria-hidden={!otvoren}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(560px, 100%)",
          background: "var(--panel)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "-20px 0 60px rgba(0,0,0,.4)",
          transform: otvoren ? "translateX(0)" : "translateX(100%)",
          transition: "transform var(--t-mid)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="ui-sans"
              style={{
                fontSize: 10.5,
                color: "var(--muted)",
                letterSpacing: ".12em",
                fontWeight: 600,
                textTransform: "uppercase",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <FileText size={12} />
              Izvor citata
            </div>
            {citat && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <TypeBadge tip={citat.tip} velicina="sm" />
                  {citat.referenca && (
                    <span
                      className="ui-sans"
                      style={{
                        fontSize: 11.5,
                        color: tipMeta?.cssBoja ?? "var(--accent)",
                        fontWeight: 600,
                        padding: "2px 8px",
                        background: `color-mix(in srgb, ${tipMeta?.cssBoja ?? "var(--accent)"} 12%, transparent)`,
                        borderRadius: "var(--r-pill)",
                      }}
                    >
                      {citat.referenca}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    lineHeight: 1.35,
                    wordBreak: "break-word",
                  }}
                >
                  {citat.naslov}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onZatvori}
            aria-label="Zatvori"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted)",
              cursor: "pointer",
              padding: 4,
              display: "grid",
              placeItems: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Telo — scroll */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px 24px",
          }}
        >
          {/* Metapodaci dokumenta — pillovi */}
          {meta && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 18,
              }}
            >
              {meta.datum && (
                <Pill ikona={<Calendar size={11} />}>
                  {meta.datum}
                </Pill>
              )}
              {meta.organSud && (
                <Pill ikona={<Landmark size={11} />}>{meta.organSud}</Pill>
              )}
              {meta.brojSluzbenogLista && (
                <Pill ikona={<Hash size={11} />}>{meta.brojSluzbenogLista}</Pill>
              )}
              {detalj && detalj.strukturaPutanja && (
                <Pill>{detalj.strukturaPutanja}</Pill>
              )}
            </div>
          )}

          {greska && (
            <div
              className="ui-sans"
              style={{
                padding: "12px 14px",
                background: "color-mix(in srgb, var(--error) 12%, var(--panel))",
                border: "1px solid color-mix(in srgb, var(--error) 40%, var(--border))",
                borderRadius: "var(--r-button)",
                fontSize: 13,
                color: "var(--text)",
                marginBottom: 14,
              }}
            >
              {greska}
            </div>
          )}

          {/* Skor */}
          {citat && (
            <div
              className="ui-sans"
              style={{
                fontSize: 11,
                color: "var(--muted)",
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>Relevantnost</span>
              <div
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  background: "var(--panel-2)",
                  overflow: "hidden",
                  maxWidth: 120,
                }}
              >
                <div
                  style={{
                    width: `${Math.round(citat.skor * 100)}%`,
                    height: "100%",
                    background: "var(--accent)",
                  }}
                />
              </div>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {Math.round(citat.skor * 100)}%
              </span>
            </div>
          )}

          {/* Tekst chunka — puni dok se učitava, inače isjecak iz Citat-a kao fallback */}
          <div
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-card)",
              padding: 16,
              fontSize: 14,
              lineHeight: 1.65,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "var(--font-serif)",
            }}
          >
            {ucitavanje && !detalj && (
              <div
                className="ui-sans"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--muted)",
                  fontSize: 12.5,
                  marginBottom: 12,
                }}
              >
                <Loader2 size={13} className="spin" />
                <span>Učitavam puni sadržaj…</span>
              </div>
            )}
            {detalj?.sadrzaj ?? citat?.isjecak ?? ""}
          </div>

          {detalj && (
            <div
              className="ui-sans"
              style={{
                marginTop: 12,
                fontSize: 11,
                color: "var(--muted)",
                textAlign: "right",
              }}
            >
              Segment #{detalj.redniBroj + 1}
              {detalj.stranaOd !== null && (
                <>
                  {" · "}
                  {detalj.stranaOd === detalj.stranaDo
                    ? `str. ${detalj.stranaOd}`
                    : `str. ${detalj.stranaOd}–${detalj.stranaDo}`}
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

interface PillProps {
  ikona?: React.ReactNode;
  children: React.ReactNode;
}

function Pill({ ikona, children }: PillProps) {
  return (
    <span
      className="ui-sans"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-pill)",
        fontSize: 11.5,
        color: "var(--text)",
      }}
    >
      {ikona}
      {children}
    </span>
  );
}
