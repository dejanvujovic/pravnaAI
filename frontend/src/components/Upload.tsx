import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Loader2, Sparkles, Upload as UploadIcon, X } from "lucide-react";
import {
  DocumentStatus,
  DocumentType,
  LegalArea,
  type DocumentMeta,
} from "@rtcg/shared";
import { TIP_META } from "../lib/docTypes.js";
import { DocumentsApiError, analyzeDokument, uploadDokument } from "../lib/api.js";

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
  jezik: "sr-Latn",
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
  const [analiza, setAnaliza] = useState<"idle" | "uTeku" | "gotovo" | "greska">("idle");
  const [autoPopunjenaPolja, setAutoPopunjenaPolja] = useState<Set<keyof FormState>>(
    new Set(),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const analyzeAbortRef = useRef<AbortController | null>(null);

  // Otkaži aktivnu analizu pri unmount-u ili promjeni fajla.
  useEffect(() => {
    return () => analyzeAbortRef.current?.abort();
  }, []);

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
    setAutoPopunjenaPolja(new Set());

    // Pokreni heurističku analizu u pozadini — prefiluj polja koja korisnik
    // još nije promijenio. Otkazi prethodnu ako je u toku.
    analyzeAbortRef.current?.abort();
    const ctrl = new AbortController();
    analyzeAbortRef.current = ctrl;
    setAnaliza("uTeku");
    analyzeDokument(f, ctrl.signal)
      .then((predlog) => {
        if (ctrl.signal.aborted) return;
        const auto = new Set<keyof FormState>();
        setForma((s) => {
          const novo: FormState = { ...s };
          // Naslov pregazi predlogom iz filename-a (predloziNaslov), ali samo
          // ako sam predlog izgleda kao stvarni naslov dokumenta (počinje sa
          // tipom dokumenta — "Zakon", "Uredba", itd.).
          if (predlog.naslov && /^(Zakon|Uredba|Pravilnik|Odluka|Naredba|Uputstvo|Presuda|Rješenje|Mišljenje)\s/i.test(predlog.naslov)) {
            novo.naslov = predlog.naslov;
            auto.add("naslov");
          }
          if (predlog.tip) {
            novo.tip = predlog.tip;
            auto.add("tip");
          }
          if (predlog.oblast) {
            novo.oblast = predlog.oblast;
            auto.add("oblast");
          }
          if (predlog.datum && !s.datum) {
            novo.datum = predlog.datum;
            auto.add("datum");
          }
          if (predlog.organSud && !s.organSud) {
            novo.organSud = predlog.organSud;
            auto.add("organSud");
          }
          if (predlog.brojSluzbenogLista && !s.brojSluzbenogLista) {
            novo.brojSluzbenogLista = predlog.brojSluzbenogLista;
            auto.add("brojSluzbenogLista");
          }
          if (predlog.jezik) {
            novo.jezik = predlog.jezik;
            auto.add("jezik");
          }
          return novo;
        });
        setAutoPopunjenaPolja(auto);
        setAnaliza("gotovo");
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        console.warn("[analyze] neuspjelo:", e);
        setAnaliza("greska");
      });
  }, []);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) odaberi(f);
  };

  const obrisi = () => {
    analyzeAbortRef.current?.abort();
    setFajl(null);
    setForma(PRAZNA_FORMA);
    setGreska(null);
    setAnaliza("idle");
    setAutoPopunjenaPolja(new Set());
    if (inputRef.current) inputRef.current.value = "";
  };

  /**
   * Kad korisnik ručno promijeni polje, skidamo "auto" oznaku — nije više
   * heuristička sugestija nego unos korisnika.
   */
  const izmijeniPolje = <K extends keyof FormState>(kljuc: K, vrijednost: FormState[K]) => {
    setForma((s) => ({ ...s, [kljuc]: vrijednost }));
    if (autoPopunjenaPolja.has(kljuc)) {
      setAutoPopunjenaPolja((prev) => {
        const next = new Set(prev);
        next.delete(kljuc);
        return next;
      });
    }
  };

  const inputStyleZa = (polje: keyof FormState): React.CSSProperties =>
    autoPopunjenaPolja.has(polje)
      ? {
          ...inputStyle,
          borderColor: "color-mix(in srgb, var(--accent) 60%, var(--border))",
          background: "color-mix(in srgb, var(--accent) 4%, var(--bg))",
        }
      : inputStyle;

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

          {/* Indikator analize. */}
          {analiza !== "idle" && (
            <div
              className="ui-sans"
              style={{
                marginBottom: 16,
                padding: "9px 14px",
                background:
                  analiza === "gotovo" && autoPopunjenaPolja.size > 0
                    ? "color-mix(in srgb, var(--accent) 8%, var(--panel-2))"
                    : "var(--panel-2)",
                border:
                  analiza === "gotovo" && autoPopunjenaPolja.size > 0
                    ? "1px solid color-mix(in srgb, var(--accent) 40%, var(--border))"
                    : "1px solid var(--border)",
                borderRadius: "var(--r-button)",
                fontSize: 12.5,
                color: "var(--muted)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {analiza === "uTeku" && (
                <>
                  <Loader2 size={13} className="spin" />
                  <span>Analiziram dokument…</span>
                </>
              )}
              {analiza === "gotovo" && autoPopunjenaPolja.size > 0 && (
                <>
                  <Sparkles size={13} color="var(--accent)" />
                  <span>
                    Automatski popunjeno {autoPopunjenaPolja.size}{" "}
                    {autoPopunjenaPolja.size === 1 ? "polje" : "polja"} — pregledaj prije slanja.
                  </span>
                </>
              )}
              {analiza === "gotovo" && autoPopunjenaPolja.size === 0 && (
                <span>Heuristika nije našla pouzdane metapodatke — popuni ručno.</span>
              )}
              {analiza === "greska" && (
                <span>Analiza nije uspjela — možeš nastaviti i ručno popuniti formu.</span>
              )}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <Polje label="Naslov" obavezno span={2} autoPopunjen={autoPopunjenaPolja.has("naslov")}>
              <input
                type="text"
                value={forma.naslov}
                onChange={(e) => izmijeniPolje("naslov", e.target.value)}
                disabled={salje}
                maxLength={500}
                style={inputStyleZa("naslov")}
                required
              />
            </Polje>

            <Polje label="Tip dokumenta" obavezno autoPopunjen={autoPopunjenaPolja.has("tip")}>
              <select
                value={forma.tip}
                onChange={(e) => izmijeniPolje("tip", e.target.value as DocumentType)}
                disabled={salje}
                style={inputStyleZa("tip")}
              >
                {Object.entries(TIP_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.labela}
                  </option>
                ))}
              </select>
            </Polje>

            <Polje label="Pravna oblast" obavezno autoPopunjen={autoPopunjenaPolja.has("oblast")}>
              <select
                value={forma.oblast}
                onChange={(e) => izmijeniPolje("oblast", e.target.value as LegalArea)}
                disabled={salje}
                style={inputStyleZa("oblast")}
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
                onChange={(e) => izmijeniPolje("status", e.target.value as DocumentStatus)}
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

            <Polje label="Datum donošenja" autoPopunjen={autoPopunjenaPolja.has("datum")}>
              <input
                type="date"
                value={forma.datum}
                onChange={(e) => izmijeniPolje("datum", e.target.value)}
                disabled={salje}
                style={inputStyleZa("datum")}
              />
            </Polje>

            <Polje label="Organ / sud" autoPopunjen={autoPopunjenaPolja.has("organSud")}>
              <input
                type="text"
                value={forma.organSud}
                onChange={(e) => izmijeniPolje("organSud", e.target.value)}
                disabled={salje}
                maxLength={255}
                placeholder="npr. Vrhovni sud Crne Gore"
                style={inputStyleZa("organSud")}
              />
            </Polje>

            <Polje label="Broj službenog lista" autoPopunjen={autoPopunjenaPolja.has("brojSluzbenogLista")}>
              <input
                type="text"
                value={forma.brojSluzbenogLista}
                onChange={(e) => izmijeniPolje("brojSluzbenogLista", e.target.value)}
                disabled={salje}
                maxLength={100}
                placeholder="npr. 74/2010, 40/2011"
                style={inputStyleZa("brojSluzbenogLista")}
              />
            </Polje>

            <Polje label="Pismo" autoPopunjen={autoPopunjenaPolja.has("jezik")}>
              <select
                value={forma.jezik}
                onChange={(e) => izmijeniPolje("jezik", e.target.value as FormState["jezik"])}
                disabled={salje}
                style={inputStyleZa("jezik")}
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
  autoPopunjen?: boolean;
  children: React.ReactNode;
}

function Polje({ label, obavezno, span = 1, autoPopunjen, children }: PoljeProps) {
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
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>
          {label}
          {obavezno && <span style={{ color: "var(--accent)" }}> *</span>}
        </span>
        {autoPopunjen && (
          <Sparkles
            size={10}
            color="var(--accent)"
            aria-label="Automatski popunjeno"
          />
        )}
      </div>
      {children}
    </label>
  );
}
