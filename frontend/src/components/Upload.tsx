import { useCallback, useRef, useState } from "react";
import { FileUp, Upload as UploadIcon, X } from "lucide-react";
import {
  DocumentStatus,
  DocumentType,
  LegalArea,
  type DocumentMeta,
} from "@rtcg/shared";
import { TIP_META } from "../lib/docTypes.js";
import { DocumentsApiError, uploadDokument } from "../lib/api.js";

const MAX_FILE_MB = 50;
const ALLOWED_MIMETYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

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

interface Props {
  onUploadGotov: (meta: DocumentMeta) => void;
}

interface FormState {
  naslov: string;
  tip: DocumentType;
  oblast: LegalArea;
  status: DocumentStatus;
  datum: string;
  organSud: string;
  brojSluzbenogLista: string;
  jezik: "sr-Cyrl" | "sr-Latn" | "mixed";
}

const PRAZNA_FORMA: FormState = {
  naslov: "",
  tip: DocumentType.ZAKON,
  oblast: LegalArea.RADNO_PRAVO,
  status: DocumentStatus.VAZECI,
  datum: "",
  organSud: "",
  brojSluzbenogLista: "",
  jezik: "mixed",
};

/**
 * Skida ekstenziju iz naziva fajla (".pdf", ".docx") da pretpostavimo naslov.
 */
function predloziNaslov(filename: string): string {
  return filename
    .replace(/\.(pdf|docx)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

export function Upload({ onUploadGotov }: Props) {
  const [fajl, setFajl] = useState<File | null>(null);
  const [forma, setForma] = useState<FormState>(PRAZNA_FORMA);
  const [salje, setSalje] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const odaberi = useCallback((f: File) => {
    setGreska(null);
    if (!ALLOWED_MIMETYPES.has(f.type)) {
      setGreska(`Nepodržan format: ${f.type || "nepoznat"}. Dozvoljeno: PDF, DOCX.`);
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setGreska(`Fajl je veći od ${MAX_FILE_MB} MB.`);
      return;
    }
    setFajl(f);
    setForma((s) => ({ ...s, naslov: s.naslov || predloziNaslov(f.name) }));
  }, []);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) odaberi(f);
  };

  const obrisi = () => {
    setFajl(null);
    setForma(PRAZNA_FORMA);
    setGreska(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const posalji = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fajl || salje) return;
    if (!forma.naslov.trim()) {
      setGreska("Naslov je obavezan.");
      return;
    }
    setSalje(true);
    setGreska(null);
    try {
      const meta = await uploadDokument(fajl, {
        naslov: forma.naslov.trim(),
        tip: forma.tip,
        oblast: forma.oblast,
        status: forma.status,
        ...(forma.datum && { datum: forma.datum }),
        ...(forma.organSud.trim() && { organSud: forma.organSud.trim() }),
        ...(forma.brojSluzbenogLista.trim() && {
          brojSluzbenogLista: forma.brojSluzbenogLista.trim(),
        }),
        jezik: forma.jezik,
      });
      onUploadGotov(meta);
      obrisi();
    } catch (e) {
      if (e instanceof DocumentsApiError) {
        setGreska(e.message);
      } else {
        setGreska(e instanceof Error ? e.message : "Nepoznata greška.");
      }
    } finally {
      setSalje(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-card)",
        padding: 20,
      }}
    >
      {/* Drop zone — vidljiv samo dok nije izabran fajl. */}
      {!fajl && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          style={{
            border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
            borderRadius: "var(--r-card)",
            padding: "44px 24px",
            textAlign: "center",
            cursor: "pointer",
            transition: "border-color var(--t-fast), background var(--t-fast)",
            background: dragOver
              ? "color-mix(in srgb, var(--accent) 8%, var(--panel))"
              : "transparent",
          }}
        >
          <UploadIcon
            size={28}
            color={dragOver ? "var(--accent)" : "var(--muted)"}
            style={{ margin: "0 auto 12px", display: "block" }}
          />
          <div style={{ fontSize: 15, marginBottom: 6 }}>
            Prevuci PDF ili DOCX ovdje
          </div>
          <div className="ui-sans" style={{ fontSize: 12, color: "var(--muted)" }}>
            ili klikni da izabereš · max {MAX_FILE_MB} MB
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) odaberi(f);
            }}
            style={{ display: "none" }}
          />
        </div>
      )}

      {/* Pregled izabranog fajla + forma metapodataka. */}
      {fajl && (
        <form onSubmit={posalji}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-button)",
              marginBottom: 20,
            }}
          >
            <FileUp size={18} color="var(--accent)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {fajl.name}
              </div>
              <div
                className="ui-sans"
                style={{ fontSize: 11, color: "var(--muted)" }}
              >
                {(fajl.size / 1024 / 1024).toFixed(2)} MB · {fajl.type || "—"}
              </div>
            </div>
            <button
              type="button"
              onClick={obrisi}
              disabled={salje}
              aria-label="Ukloni fajl"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--muted)",
                cursor: salje ? "default" : "pointer",
                padding: 4,
                display: "grid",
                placeItems: "center",
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <Polje label="Naslov" obavezno span={2}>
              <input
                type="text"
                value={forma.naslov}
                onChange={(e) => setForma({ ...forma, naslov: e.target.value })}
                disabled={salje}
                maxLength={500}
                style={inputStyle}
                required
              />
            </Polje>

            <Polje label="Tip dokumenta" obavezno>
              <select
                value={forma.tip}
                onChange={(e) =>
                  setForma({ ...forma, tip: e.target.value as DocumentType })
                }
                disabled={salje}
                style={inputStyle}
              >
                {Object.entries(TIP_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.labela}
                  </option>
                ))}
              </select>
            </Polje>

            <Polje label="Pravna oblast" obavezno>
              <select
                value={forma.oblast}
                onChange={(e) =>
                  setForma({ ...forma, oblast: e.target.value as LegalArea })
                }
                disabled={salje}
                style={inputStyle}
              >
                {Object.entries(OBLAST_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Polje>

            <Polje label="Status">
              <select
                value={forma.status}
                onChange={(e) =>
                  setForma({ ...forma, status: e.target.value as DocumentStatus })
                }
                disabled={salje}
                style={inputStyle}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Polje>

            <Polje label="Datum donošenja">
              <input
                type="date"
                value={forma.datum}
                onChange={(e) => setForma({ ...forma, datum: e.target.value })}
                disabled={salje}
                style={inputStyle}
              />
            </Polje>

            <Polje label="Organ / sud">
              <input
                type="text"
                value={forma.organSud}
                onChange={(e) => setForma({ ...forma, organSud: e.target.value })}
                disabled={salje}
                maxLength={255}
                placeholder="npr. Vrhovni sud Crne Gore"
                style={inputStyle}
              />
            </Polje>

            <Polje label="Broj službenog lista">
              <input
                type="text"
                value={forma.brojSluzbenogLista}
                onChange={(e) =>
                  setForma({ ...forma, brojSluzbenogLista: e.target.value })
                }
                disabled={salje}
                maxLength={100}
                placeholder="npr. 74/2010, 40/2011"
                style={inputStyle}
              />
            </Polje>

            <Polje label="Pismo">
              <select
                value={forma.jezik}
                onChange={(e) =>
                  setForma({ ...forma, jezik: e.target.value as FormState["jezik"] })
                }
                disabled={salje}
                style={inputStyle}
              >
                <option value="mixed">Mješovito</option>
                <option value="sr-Latn">Latinica</option>
                <option value="sr-Cyrl">Ćirilica</option>
              </select>
            </Polje>
          </div>

          {greska && (
            <div
              className="ui-sans"
              style={{
                marginTop: 16,
                padding: "10px 14px",
                background: "color-mix(in srgb, var(--error) 12%, var(--panel))",
                border:
                  "1px solid color-mix(in srgb, var(--error) 40%, var(--border))",
                borderRadius: "var(--r-button)",
                fontSize: 13,
                color: "var(--text)",
              }}
            >
              {greska}
            </div>
          )}

          <div
            style={{
              marginTop: 20,
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={obrisi}
              disabled={salje}
              className="ui-sans"
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--muted)",
                borderRadius: "var(--r-button)",
                padding: "9px 16px",
                fontSize: 13,
                cursor: salje ? "default" : "pointer",
              }}
            >
              Otkaži
            </button>
            <button
              type="submit"
              disabled={salje}
              className="ui-sans"
              style={{
                background: salje ? "var(--panel-2)" : "var(--accent-grad)",
                color: salje ? "var(--muted)" : "var(--bg)",
                border: "none",
                borderRadius: "var(--r-button)",
                padding: "9px 18px",
                fontSize: 13,
                fontWeight: 600,
                cursor: salje ? "default" : "pointer",
              }}
            >
              {salje ? "Šaljem..." : "Pošalji"}
            </button>
          </div>
        </form>
      )}

      {greska && !fajl && (
        <div
          className="ui-sans"
          style={{
            marginTop: 14,
            fontSize: 12.5,
            color: "var(--error)",
            textAlign: "center",
          }}
        >
          {greska}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-button)",
  padding: "8px 11px",
  color: "var(--text)",
  fontSize: 13.5,
  fontFamily: "var(--font-sans)",
  outline: "none",
};

interface PoljeProps {
  label: string;
  obavezno?: boolean;
  span?: 1 | 2;
  children: React.ReactNode;
}

function Polje({ label, obavezno, span = 1, children }: PoljeProps) {
  return (
    <label style={{ display: "block", gridColumn: span === 2 ? "1 / -1" : undefined }}>
      <div
        className="ui-sans"
        style={{
          fontSize: 11,
          color: "var(--muted)",
          letterSpacing: ".08em",
          fontWeight: 600,
          marginBottom: 6,
          textTransform: "uppercase",
        }}
      >
        {label}
        {obavezno && <span style={{ color: "var(--accent)" }}> *</span>}
      </div>
      {children}
    </label>
  );
}
