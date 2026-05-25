import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  DocumentStatus,
  DocumentType,
  LegalArea,
  type DocumentMeta,
  type DocumentPatchRequest,
} from "@rtcg/shared";
import { TIP_META } from "../lib/docTypes.js";
import { DocumentsApiError, patchDokument } from "../lib/api.js";

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

function metaUForm(d: DocumentMeta): FormState {
  return {
    naslov: d.naslov,
    tip: d.tip,
    oblast: d.oblast,
    status: d.status,
    datum: d.datum ?? "",
    organSud: d.organSud ?? "",
    brojSluzbenogLista: d.brojSluzbenogLista ?? "",
    jezik: d.jezik,
  };
}

function razlika(prije: FormState, sad: FormState): DocumentPatchRequest {
  const izmjene: DocumentPatchRequest = {};
  if (sad.naslov.trim() !== prije.naslov) izmjene.naslov = sad.naslov.trim();
  if (sad.tip !== prije.tip) izmjene.tip = sad.tip;
  if (sad.oblast !== prije.oblast) izmjene.oblast = sad.oblast;
  if (sad.status !== prije.status) izmjene.status = sad.status;
  if (sad.datum !== prije.datum) izmjene.datum = sad.datum || null;
  if (sad.organSud.trim() !== prije.organSud) {
    izmjene.organSud = sad.organSud.trim() || null;
  }
  if (sad.brojSluzbenogLista.trim() !== prije.brojSluzbenogLista) {
    izmjene.brojSluzbenogLista = sad.brojSluzbenogLista.trim() || null;
  }
  if (sad.jezik !== prije.jezik) izmjene.jezik = sad.jezik;
  return izmjene;
}

interface Props {
  dokument: DocumentMeta;
  onZatvori: () => void;
  onSacuvano: (azuriran: DocumentMeta) => void;
}

export function EditDocumentModal({ dokument, onZatvori, onSacuvano }: Props) {
  const pocetna = metaUForm(dokument);
  const [forma, setForma] = useState<FormState>(pocetna);
  const [salje, setSalje] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !salje) onZatvori();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onZatvori, salje]);

  const izmjene = razlika(pocetna, forma);
  const imaIzmjena = Object.keys(izmjene).length > 0;

  const posalji = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salje || !imaIzmjena) return;
    if (!forma.naslov.trim()) {
      setGreska("Naslov je obavezan.");
      return;
    }
    setSalje(true);
    setGreska(null);
    try {
      const azuriran = await patchDokument(dokument.id, izmjene);
      onSacuvano(azuriran);
    } catch (e) {
      setGreska(
        e instanceof DocumentsApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Nepoznata greška.",
      );
    } finally {
      setSalje(false);
    }
  };

  return (
    <div
      onClick={() => {
        if (!salje) onZatvori();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in srgb, #000 60%, transparent)",
        display: "grid",
        placeItems: "center",
        padding: 20,
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Izmjena metapodataka"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-card)",
          width: "min(720px, 100%)",
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Izmjena metapodataka</div>
            <div
              className="ui-sans"
              style={{
                fontSize: 11,
                color: "var(--muted)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 600,
              }}
            >
              {dokument.naslov}
            </div>
          </div>
          <button
            type="button"
            onClick={onZatvori}
            disabled={salje}
            aria-label="Zatvori"
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
            <X size={18} />
          </button>
        </div>

        <form onSubmit={posalji} style={{ padding: 20 }}>
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
                autoFocus
              />
            </Polje>

            <Polje label="Tip dokumenta" obavezno>
              <select
                value={forma.tip}
                onChange={(e) => setForma({ ...forma, tip: e.target.value as DocumentType })}
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
                onChange={(e) => setForma({ ...forma, oblast: e.target.value as LegalArea })}
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
                onChange={(e) => setForma({ ...forma, brojSluzbenogLista: e.target.value })}
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
                <option value="sr-Latn">Latinica</option>
                <option value="sr-Cyrl">Ćirilica</option>
                <option value="mixed">Mješovito</option>
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
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              className="ui-sans"
              style={{ fontSize: 11.5, color: "var(--muted)" }}
            >
              {imaIzmjena
                ? `${Object.keys(izmjene).length} ${Object.keys(izmjene).length === 1 ? "izmjena" : "izmjena"}`
                : "Nema izmjena."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={onZatvori}
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
                disabled={salje || !imaIzmjena}
                className="ui-sans"
                style={{
                  background:
                    salje || !imaIzmjena ? "var(--panel-2)" : "var(--accent-grad)",
                  color: salje || !imaIzmjena ? "var(--muted)" : "var(--bg)",
                  border: "none",
                  borderRadius: "var(--r-button)",
                  padding: "9px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: salje || !imaIzmjena ? "default" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {salje && <Loader2 size={13} className="spin" />}
                {salje ? "Čuvam…" : "Sačuvaj"}
              </button>
            </div>
          </div>
        </form>
      </div>
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
