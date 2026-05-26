import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import {
  DocumentStatus,
  DocumentType,
  IngestStage,
  LegalArea,
  type DocumentListResponse,
  type DocumentMeta,
} from "@rtcg/shared";
import {
  DocumentsApiError,
  deleteDokument,
  listDokumenata,
} from "../lib/api.js";
import { TIP_META } from "../lib/docTypes.js";
import { EditDocumentModal } from "./EditDocumentModal.js";
import { TypeBadge } from "./TypeBadge.js";

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
  STAVLJEN_VAN_SNAGE: "Van snage",
  ARHIVA: "Arhiva",
};

const STRANICA = 25;

interface Filteri {
  tip: DocumentType | "";
  oblast: LegalArea | "";
  status: DocumentStatus | "";
  traziNaslov: string;
}

const PRAZNI_FILTERI: Filteri = {
  tip: "",
  oblast: "",
  status: "",
  traziNaslov: "",
};

type Doc = DocumentListResponse["dokumenti"][number];

interface Props {
  /** Inkrementira se kad se završi nov ingest — okida refetch liste. */
  osvezenje?: number;
}

export function DocTable({ osvezenje = 0 }: Props) {
  const [filteri, setFilteri] = useState<Filteri>(PRAZNI_FILTERI);
  const [traziDebounced, setTraziDebounced] = useState("");
  const [stranica, setStranica] = useState(0);

  const [podaci, setPodaci] = useState<DocumentListResponse | null>(null);
  const [ucitavanje, setUcitavanje] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [brisuId, setBrisuId] = useState<string | null>(null);
  const [editujem, setEditujem] = useState<DocumentMeta | null>(null);

  // Debounce traziNaslov da ne hammeramo backend pri svakom slovu.
  useEffect(() => {
    const t = window.setTimeout(() => setTraziDebounced(filteri.traziNaslov), 300);
    return () => window.clearTimeout(t);
  }, [filteri.traziNaslov]);

  // Reset paginacije pri promjeni filtera.
  useEffect(() => {
    setStranica(0);
  }, [filteri.tip, filteri.oblast, filteri.status, traziDebounced]);

  const query = useMemo(
    () => ({
      ...(filteri.tip && { tip: filteri.tip }),
      ...(filteri.oblast && { oblast: filteri.oblast }),
      ...(filteri.status && { status: filteri.status }),
      ...(traziDebounced.trim() && { traziNaslov: traziDebounced.trim() }),
      limit: STRANICA,
      offset: stranica * STRANICA,
    }),
    [filteri.tip, filteri.oblast, filteri.status, traziDebounced, stranica],
  );

  const ucitaj = useCallback(async () => {
    setUcitavanje(true);
    setGreska(null);
    try {
      const r = await listDokumenata(query);
      setPodaci(r);
    } catch (e) {
      setGreska(
        e instanceof DocumentsApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Nepoznata greška.",
      );
    } finally {
      setUcitavanje(false);
    }
  }, [query]);

  useEffect(() => {
    ucitaj();
  }, [ucitaj, osvezenje]);

  const obrisi = async (doc: Doc) => {
    if (!window.confirm(`Sigurno želite da obrišete "${doc.naslov}"?`)) return;
    setBrisuId(doc.id);
    try {
      await deleteDokument(doc.id);
      await ucitaj();
    } catch (e) {
      setGreska(
        e instanceof DocumentsApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Brisanje nije uspjelo.",
      );
    } finally {
      setBrisuId(null);
    }
  };

  const ukupnoStrana = podaci ? Math.ceil(podaci.ukupno / STRANICA) : 0;

  return (
    <div>
      {/* Filteri */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
          <Search
            size={14}
            color="var(--muted)"
            style={{
              position: "absolute",
              left: 11,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          />
          <input
            type="search"
            value={filteri.traziNaslov}
            onChange={(e) => setFilteri({ ...filteri, traziNaslov: e.target.value })}
            placeholder="Pretraga po naslovu..."
            style={{ ...selectStyle, paddingLeft: 32, width: "100%" }}
          />
        </div>
        <select
          value={filteri.tip}
          onChange={(e) =>
            setFilteri({ ...filteri, tip: e.target.value as DocumentType | "" })
          }
          style={selectStyle}
        >
          <option value="">Svi tipovi</option>
          {Object.entries(TIP_META).map(([k, v]) => (
            <option key={k} value={k}>
              {v.labela}
            </option>
          ))}
        </select>
        <select
          value={filteri.oblast}
          onChange={(e) =>
            setFilteri({ ...filteri, oblast: e.target.value as LegalArea | "" })
          }
          style={selectStyle}
        >
          <option value="">Sve oblasti</option>
          {Object.entries(OBLAST_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={filteri.status}
          onChange={(e) =>
            setFilteri({ ...filteri, status: e.target.value as DocumentStatus | "" })
          }
          style={selectStyle}
        >
          <option value="">Svi statusi</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {ucitavanje && <Loader2 size={14} color="var(--muted)" className="spin" />}
      </div>

      {greska && (
        <div
          className="ui-sans"
          style={{
            marginBottom: 14,
            padding: "10px 14px",
            background: "color-mix(in srgb, var(--error) 12%, var(--panel))",
            border:
              "1px solid color-mix(in srgb, var(--error) 40%, var(--border))",
            borderRadius: "var(--r-button)",
            fontSize: 12.5,
            color: "var(--text)",
          }}
        >
          {greska}
        </div>
      )}

      {/* Tabela */}
      <div
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-card)",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Naslov</Th>
              <Th>Tip</Th>
              <Th>Oblast</Th>
              <Th>Datum</Th>
              <Th align="right">Segmenti</Th>
              <Th>Faza</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {podaci?.dokumenti.length === 0 && !ucitavanje && (
              <tr>
                <td colSpan={7} style={{ padding: "32px 16px", textAlign: "center" }}>
                  <span className="ui-sans" style={{ color: "var(--muted)", fontSize: 13 }}>
                    Nema dokumenata za zadate filtere.
                  </span>
                </td>
              </tr>
            )}
            {podaci?.dokumenti.map((d) => (
              <tr key={d.id} style={{ borderTop: "1px solid var(--border)" }}>
                <Td>
                  <Link
                    to={`/document/${d.id}`}
                    style={{
                      fontWeight: 500,
                      color: "var(--text)",
                      textDecoration: "none",
                      transition: "color var(--t-fast)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--accent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--text)";
                    }}
                  >
                    {d.naslov}
                  </Link>
                  {d.organSud && (
                    <div
                      className="ui-sans"
                      style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}
                    >
                      {d.organSud}
                      {d.brojSluzbenogLista && ` · ${d.brojSluzbenogLista}`}
                    </div>
                  )}
                </Td>
                <Td>
                  <TypeBadge tip={d.tip} velicina="sm" />
                </Td>
                <Td>
                  <span className="ui-sans" style={{ fontSize: 12.5 }}>
                    {OBLAST_LABELS[d.oblast]}
                  </span>
                </Td>
                <Td>
                  <span
                    className="ui-sans"
                    style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}
                  >
                    {d.datum ?? "—"}
                  </span>
                </Td>
                <Td align="right">
                  <span
                    className="ui-sans"
                    style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}
                  >
                    {d.brojSegmenata}
                  </span>
                </Td>
                <Td>
                  <FazaBadge faza={d.faza} />
                </Td>
                <Td align="right">
                  <div style={{ display: "inline-flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setEditujem(d)}
                      aria-label={`Izmijeni ${d.naslov}`}
                      style={akcijaBtnStyle}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor =
                          "color-mix(in srgb, var(--accent) 50%, var(--border))";
                        e.currentTarget.style.color = "var(--accent)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.color = "var(--muted)";
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => obrisi(d)}
                      disabled={brisuId === d.id}
                      aria-label={`Obriši ${d.naslov}`}
                      style={{
                        ...akcijaBtnStyle,
                        cursor: brisuId === d.id ? "default" : "pointer",
                      }}
                      onMouseEnter={(e) => {
                        if (brisuId !== d.id) {
                          e.currentTarget.style.borderColor =
                            "color-mix(in srgb, var(--error) 50%, var(--border))";
                          e.currentTarget.style.color = "var(--error)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.color = "var(--muted)";
                      }}
                    >
                      {brisuId === d.id ? (
                        <Loader2 size={12} className="spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editujem && (
        <EditDocumentModal
          dokument={editujem}
          onZatvori={() => setEditujem(null)}
          onSacuvano={(azuriran) => {
            setEditujem(null);
            setPodaci((p) =>
              p
                ? {
                    ...p,
                    dokumenti: p.dokumenti.map((d) =>
                      d.id === azuriran.id ? { ...d, ...azuriran } : d,
                    ),
                  }
                : p,
            );
          }}
        />
      )}

      {/* Paginacija */}
      {podaci && podaci.ukupno > STRANICA && (
        <div
          className="ui-sans"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 14,
            fontSize: 12,
            color: "var(--muted)",
          }}
        >
          <span>
            Stranica {stranica + 1} od {ukupnoStrana} · {podaci.ukupno} ukupno
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => setStranica((s) => Math.max(0, s - 1))}
              disabled={stranica === 0}
              style={pageBtnStyle}
              aria-label="Prethodna stranica"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => setStranica((s) => s + 1)}
              disabled={stranica + 1 >= ukupnoStrana}
              style={pageBtnStyle}
              aria-label="Sljedeća stranica"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className="ui-sans"
      style={{
        textAlign: align,
        padding: "12px 14px",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: "var(--muted)",
        background: "var(--panel-2)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        padding: "12px 14px",
        textAlign: align,
        verticalAlign: "middle",
        fontSize: 13.5,
      }}
    >
      {children}
    </td>
  );
}

function FazaBadge({ faza }: { faza: IngestStage }) {
  let boja = "var(--muted)";
  let labela = "—";
  if (faza === IngestStage.ZAVRSENO) {
    boja = "var(--ok)";
    labela = "Završeno";
  } else if (faza === IngestStage.GRESKA) {
    boja = "var(--error)";
    labela = "Greška";
  } else if (faza === IngestStage.PARSIRANJE) labela = "Parsiranje";
  else if (faza === IngestStage.CHUNKING) labela = "Segmentacija";
  else if (faza === IngestStage.EMBEDDING) labela = "Vektorizacija";
  else if (faza === IngestStage.INDEKSIRANJE) labela = "Indeksiranje";

  const aktivno =
    faza !== IngestStage.ZAVRSENO && faza !== IngestStage.GRESKA;

  return (
    <span
      className="ui-sans"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: "var(--r-pill)",
        fontSize: 11,
        color: boja,
        border: `1px solid color-mix(in srgb, ${boja} 40%, var(--border))`,
        background: `color-mix(in srgb, ${boja} 8%, var(--panel))`,
      }}
    >
      {aktivno && <Loader2 size={10} className="spin" />}
      {labela}
    </span>
  );
}

const selectStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-button)",
  padding: "7px 11px",
  color: "var(--text)",
  fontSize: 12.5,
  fontFamily: "var(--font-sans)",
  outline: "none",
  minWidth: 130,
};

const akcijaBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-button)",
  padding: "5px 9px",
  color: "var(--muted)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 11.5,
};

const pageBtnStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-button)",
  padding: "5px 9px",
  color: "var(--text)",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
};
