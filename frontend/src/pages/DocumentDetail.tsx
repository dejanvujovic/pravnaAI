import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  FileText,
  Hash,
  Landmark,
  Languages,
  Layers,
  List,
  Loader2,
  Pencil,
  ScanText,
} from "lucide-react";
import {
  DocumentStatus,
  IngestStage,
  LegalArea,
  type ChunkSummary,
  type DocumentDetail,
  type DocumentMeta,
} from "@rtcg/shared";
import { DocumentsApiError, getDokumentDetalj } from "../lib/api.js";
import { EditDocumentModal } from "../components/EditDocumentModal.js";
import { TypeBadge } from "../components/TypeBadge.js";

const OBLAST_LABELS: Record<LegalArea, string> = {
  RADNO_PRAVO: "Radno pravo",
  JAVNE_NABAVKE: "Javne nabavke",
  PARNICNI_POSTUPAK: "Parnični postupak",
  UPRAVNI_POSTUPAK: "Upravni postupak",
  MEDIJSKO_PRAVO: "Medijsko pravo",
  OBLIGACIONO: "Obligaciono",
  AUTORSKO: "Autorsko",
  KRIVICNO: "Krivično",
  OSTALO: "Ostalo",
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  NACRT: "Nacrt",
  VAZECI: "Važeći",
  STAVLJEN_VAN_SNAGE: "Stavljen van snage",
  ARHIVA: "Arhiva",
};

const JEZIK_LABELS: Record<"sr-Cyrl" | "sr-Latn" | "mixed", string> = {
  "sr-Cyrl": "Ćirilica",
  "sr-Latn": "Latinica",
  mixed: "Mješovito",
};

function formatBajtova(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** TOC se prikazuje samo ako ima dovoljno segmenata da se navigacija isplati. */
const MIN_SEGMENATA_ZA_TOC = 4;

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detalj, setDetalj] = useState<DocumentDetail | null>(null);
  const [ucitavanje, setUcitavanje] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [editujem, setEditujem] = useState(false);
  const [aktivanSegId, setAktivanSegId] = useState<string | null>(null);
  const glavniRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    setUcitavanje(true);
    setGreska(null);
    const ctrl = new AbortController();
    getDokumentDetalj(id, ctrl.signal)
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
              : "Dokument nije moguće učitati.",
        );
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setUcitavanje(false);
      });
    return () => ctrl.abort();
  }, [id]);

  // IntersectionObserver prati koji je segment trenutno najbliži vrhu viewport-a
  // glavne kolone i postavlja aktivan TOC item. `rootMargin -85%` znači da
  // segment postaje "aktivan" kad mu vrh prođe ~15% od vrha viewport-a.
  useEffect(() => {
    if (!detalj || !glavniRef.current) return;
    if (detalj.segmenti.length < MIN_SEGMENATA_ZA_TOC) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const vidljivi = entries.filter((e) => e.isIntersecting);
        if (vidljivi.length === 0) return;
        // Najviši (top najmanji) je trenutno najbliži vrhu.
        const top = vidljivi.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
        );
        const segId = top.target.id.replace("segment-", "");
        setAktivanSegId(segId);
      },
      {
        root: glavniRef.current,
        rootMargin: "0px 0px -85% 0px",
        threshold: 0,
      },
    );

    for (const seg of detalj.segmenti) {
      const el = document.getElementById(`segment-${seg.id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [detalj]);

  // URL hash → scroll na taj segment pri otvaranju (npr. deep-link iz citata).
  useEffect(() => {
    if (!detalj) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#segment-")) return;
    const segId = hash.slice("#segment-".length);
    const t = window.setTimeout(() => {
      const el = document.getElementById(`segment-${segId}`);
      if (el && glavniRef.current) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setAktivanSegId(segId);
      }
    }, 50);
    return () => window.clearTimeout(t);
  }, [detalj]);

  const obradaInProgress =
    detalj &&
    detalj.faza !== IngestStage.ZAVRSENO &&
    detalj.faza !== IngestStage.GRESKA;

  const prikazujTOC = useMemo(
    () => detalj !== null && detalj.segmenti.length >= MIN_SEGMENATA_ZA_TOC,
    [detalj],
  );

  const skrolNaSegment = (segId: string) => {
    const el = document.getElementById(`segment-${segId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setAktivanSegId(segId);
    // Ažuriraj URL hash bez navigacije, da bookmark/share radi.
    window.history.replaceState(null, "", `#segment-${segId}`);
  };

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {prikazujTOC && detalj && (
        <DocumentTOC
          segmenti={detalj.segmenti}
          aktivanId={aktivanSegId}
          onKliknut={skrolNaSegment}
        />
      )}

      <div ref={glavniRef} style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 28px 48px" }}>
          <Link
            to="/dokumenti"
            className="ui-sans"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12.5,
              color: "var(--muted)",
              textDecoration: "none",
              marginBottom: 18,
              transition: "color var(--t-fast)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--muted)";
            }}
          >
            <ArrowLeft size={14} />
            Dokumenti
          </Link>

          {ucitavanje && !detalj && (
            <div
              className="ui-sans"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: "var(--muted)",
                fontSize: 13,
                padding: "40px 0",
              }}
            >
              <Loader2 size={14} className="spin" />
              Učitavanje dokumenta…
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
              }}
            >
              {greska}
            </div>
          )}

          {detalj && (
            <>
              {/* Header */}
              <div
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-card)",
                  padding: "22px 24px",
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 14,
                    marginBottom: 14,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <TypeBadge tip={detalj.tip} />
                    <StatusBadge status={detalj.status} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditujem(true)}
                    className="ui-sans"
                    style={editBtnStyle}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor =
                        "color-mix(in srgb, var(--accent) 50%, var(--border))";
                      e.currentTarget.style.color = "var(--accent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.color = "var(--text)";
                    }}
                  >
                    <Pencil size={12} />
                    Izmijeni
                  </button>
                </div>

                <h1
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    lineHeight: 1.25,
                    margin: 0,
                    marginBottom: 14,
                    fontFamily: "var(--font-serif)",
                    wordBreak: "break-word",
                  }}
                >
                  {detalj.naslov}
                </h1>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                  {detalj.datum && (
                    <Pill ikona={<Calendar size={11} />}>{detalj.datum}</Pill>
                  )}
                  {detalj.organSud && (
                    <Pill ikona={<Landmark size={11} />}>{detalj.organSud}</Pill>
                  )}
                  {detalj.brojSluzbenogLista && (
                    <Pill ikona={<Hash size={11} />}>{detalj.brojSluzbenogLista}</Pill>
                  )}
                  <Pill>{OBLAST_LABELS[detalj.oblast]}</Pill>
                  <Pill ikona={<Languages size={11} />}>
                    {JEZIK_LABELS[detalj.jezik]}
                  </Pill>
                </div>

                <div
                  className="ui-sans"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 18,
                    paddingTop: 14,
                    borderTop: "1px solid var(--border)",
                    fontSize: 12,
                    color: "var(--muted)",
                  }}
                >
                  <Stat
                    ikona={<FileText size={12} />}
                    labela="Strane"
                    vrijednost={detalj.brojStrana?.toString() ?? "—"}
                  />
                  <Stat
                    ikona={<Layers size={12} />}
                    labela="Segmenti"
                    vrijednost={detalj.brojSegmenata.toString()}
                  />
                  <Stat
                    ikona={<Hash size={12} />}
                    labela="Veličina"
                    vrijednost={formatBajtova(detalj.velicinaBajtova)}
                  />
                  {detalj.ocrObavljen && (
                    <Stat
                      ikona={<ScanText size={12} />}
                      labela="OCR"
                      vrijednost="Da"
                    />
                  )}
                </div>
              </div>

              {/* Ingest status (samo dok nije završeno ili je greška) */}
              {obradaInProgress && (
                <div
                  className="ui-sans"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 16px",
                    marginBottom: 18,
                    background: "color-mix(in srgb, var(--accent) 10%, var(--panel))",
                    border: "1px solid color-mix(in srgb, var(--accent) 35%, var(--border))",
                    borderRadius: "var(--r-button)",
                    fontSize: 12.5,
                    color: "var(--text)",
                  }}
                >
                  <Loader2 size={13} className="spin" color="var(--accent)" />
                  <span>
                    Obrada u toku — faza:{" "}
                    <strong style={{ color: "var(--accent)" }}>
                      {fazaLabela(detalj.faza)}
                    </strong>
                    . Segmenti će se pojaviti kad se završi vektorizacija.
                  </span>
                </div>
              )}

              {detalj.faza === IngestStage.GRESKA && detalj.ingestGreska && (
                <div
                  className="ui-sans"
                  style={{
                    padding: "12px 14px",
                    marginBottom: 18,
                    background: "color-mix(in srgb, var(--error) 12%, var(--panel))",
                    border: "1px solid color-mix(in srgb, var(--error) 40%, var(--border))",
                    borderRadius: "var(--r-button)",
                    fontSize: 13,
                    color: "var(--text)",
                  }}
                >
                  <strong>Greška u obradi:</strong> {detalj.ingestGreska}
                </div>
              )}

              {/* Segmenti */}
              <h2
                className="ui-sans"
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  letterSpacing: ".12em",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  margin: "8px 0 12px",
                }}
              >
                Segmenti ({detalj.segmenti.length})
              </h2>

              {detalj.segmenti.length === 0 && !obradaInProgress && (
                <div
                  className="ui-sans"
                  style={{
                    padding: "20px 16px",
                    textAlign: "center",
                    color: "var(--muted)",
                    fontSize: 13,
                    fontStyle: "italic",
                    border: "1px dashed var(--border)",
                    borderRadius: "var(--r-card)",
                  }}
                >
                  Nema segmenata za prikaz.
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {detalj.segmenti.map((seg) => (
                  <SegmentCard
                    key={seg.id}
                    seg={seg}
                    aktivan={seg.id === aktivanSegId}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {editujem && detalj && (
        <EditDocumentModal
          dokument={dokumentMetaIzDetail(detalj)}
          onZatvori={() => setEditujem(false)}
          onSacuvano={(azuriran) => {
            setEditujem(false);
            // Sačuvane su samo meta polja — zadrži segmenti/faza iz prethodnog detalja.
            setDetalj((prev) => (prev ? { ...prev, ...azuriran } : prev));
          }}
        />
      )}
    </div>
  );
}

interface TOCProps {
  segmenti: ChunkSummary[];
  aktivanId: string | null;
  onKliknut: (segId: string) => void;
}

function DocumentTOC({ segmenti, aktivanId, onKliknut }: TOCProps) {
  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        background: "var(--panel)",
        borderRight: "1px solid var(--border)",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        className="ui-sans"
        style={{
          padding: "16px 16px 10px",
          fontSize: 10.5,
          color: "var(--muted)",
          letterSpacing: ".12em",
          fontWeight: 600,
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 6,
          position: "sticky",
          top: 0,
          background: "var(--panel)",
          borderBottom: "1px solid var(--border)",
          zIndex: 1,
        }}
      >
        <List size={12} />
        Sadržaj
      </div>
      <div style={{ padding: "8px 8px 16px" }}>
        {segmenti.map((seg) => {
          const aktivan = seg.id === aktivanId;
          const labela = seg.strukturaPutanja ?? `Segment #${seg.redniBroj + 1}`;
          return (
            <a
              key={seg.id}
              href={`#segment-${seg.id}`}
              onClick={(e) => {
                e.preventDefault();
                onKliknut(seg.id);
              }}
              className="ui-sans"
              style={{
                display: "block",
                padding: "7px 10px",
                fontSize: 12.5,
                color: aktivan ? "var(--accent)" : "var(--muted)",
                background: aktivan ? "var(--panel-2)" : "transparent",
                borderLeft: `2px solid ${aktivan ? "var(--accent)" : "transparent"}`,
                borderRadius: 4,
                textDecoration: "none",
                marginBottom: 1,
                fontWeight: aktivan ? 600 : 400,
                lineHeight: 1.35,
                transition: "color var(--t-fast), background var(--t-fast)",
                wordBreak: "break-word",
              }}
              onMouseEnter={(e) => {
                if (!aktivan) {
                  e.currentTarget.style.color = "var(--text)";
                  e.currentTarget.style.background = "var(--panel-2)";
                }
              }}
              onMouseLeave={(e) => {
                if (!aktivan) {
                  e.currentTarget.style.color = "var(--muted)";
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {labela}
            </a>
          );
        })}
      </div>
    </aside>
  );
}

function dokumentMetaIzDetail(d: DocumentDetail): DocumentMeta {
  return {
    id: d.id,
    naslov: d.naslov,
    tip: d.tip,
    oblast: d.oblast,
    status: d.status,
    datum: d.datum,
    organSud: d.organSud,
    brojSluzbenogLista: d.brojSluzbenogLista,
    jezik: d.jezik,
    brojStrana: d.brojStrana,
    velicinaBajtova: d.velicinaBajtova,
    brojSegmenata: d.brojSegmenata,
    kreirano: d.kreirano,
    azurirano: d.azurirano,
  };
}

function fazaLabela(faza: IngestStage): string {
  if (faza === IngestStage.PARSIRANJE) return "Parsiranje";
  if (faza === IngestStage.CHUNKING) return "Segmentacija";
  if (faza === IngestStage.EMBEDDING) return "Vektorizacija";
  if (faza === IngestStage.INDEKSIRANJE) return "Indeksiranje";
  if (faza === IngestStage.ZAVRSENO) return "Završeno";
  return "Greška";
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  const boja =
    status === DocumentStatus.VAZECI
      ? "var(--ok)"
      : status === DocumentStatus.NACRT
        ? "var(--accent)"
        : "var(--muted)";
  return (
    <span
      className="ui-sans"
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        color: boja,
        border: `1px solid color-mix(in srgb, ${boja} 40%, var(--border))`,
        background: `color-mix(in srgb, ${boja} 8%, var(--panel))`,
        borderRadius: 6,
        padding: "3px 9px",
        letterSpacing: ".03em",
        textTransform: "uppercase",
      }}
    >
      {STATUS_LABELS[status]}
    </span>
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

interface StatProps {
  ikona: React.ReactNode;
  labela: string;
  vrijednost: string;
}

function Stat({ ikona, labela, vrijednost }: StatProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {ikona}
      <span style={{ letterSpacing: ".06em", textTransform: "uppercase", fontSize: 10.5 }}>
        {labela}
      </span>
      <strong style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {vrijednost}
      </strong>
    </div>
  );
}

interface SegmentProps {
  seg: ChunkSummary;
  aktivan: boolean;
}

function SegmentCard({ seg, aktivan }: SegmentProps) {
  const stranice =
    seg.stranaOd === null
      ? null
      : seg.stranaOd === seg.stranaDo
        ? `str. ${seg.stranaOd}`
        : `str. ${seg.stranaOd}–${seg.stranaDo}`;

  return (
    <div
      id={`segment-${seg.id}`}
      style={{
        background: "var(--panel)",
        border: `1px solid ${
          aktivan
            ? "color-mix(in srgb, var(--accent) 50%, var(--border))"
            : "var(--border)"
        }`,
        borderRadius: "var(--r-card)",
        padding: "14px 18px",
        scrollMarginTop: 16,
        boxShadow: aktivan
          ? "0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)"
          : "none",
        transition: "border-color var(--t-fast), box-shadow var(--t-fast)",
      }}
    >
      <div
        className="ui-sans"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
          fontSize: 11,
          color: "var(--muted)",
        }}
      >
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          #{seg.redniBroj + 1}
        </span>
        {seg.strukturaPutanja && (
          <span
            style={{
              padding: "2px 8px",
              background: "color-mix(in srgb, var(--accent) 10%, transparent)",
              border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--border))",
              color: "var(--accent)",
              borderRadius: "var(--r-pill)",
              fontWeight: 600,
              fontSize: 11,
            }}
          >
            {seg.strukturaPutanja}
          </span>
        )}
        {stranice && <span>{stranice}</span>}
      </div>
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.62,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: "var(--font-serif)",
        }}
      >
        {seg.sadrzaj}
      </div>
    </div>
  );
}

const editBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-button)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 12.5,
  fontFamily: "var(--font-sans)",
  transition: "border-color var(--t-fast), color var(--t-fast)",
};
