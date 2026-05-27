import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Sparkles,
  Upload as UploadIcon,
  X,
  XCircle,
} from "lucide-react";
import {
  DocumentStatus,
  DocumentType,
  LegalArea,
  type DocumentMeta,
} from "@rtcg/shared";
import { TIP_META } from "../lib/docTypes.js";
import { DocumentsApiError, analyzeDokument, uploadDokument } from "../lib/api.js";
import { generisiUUID } from "../lib/uuid.js";

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

interface RedForma {
  naslov: string;
  tip: DocumentType;
  oblast: LegalArea;
  status: DocumentStatus;
  datum: string;
  organSud: string;
  brojSluzbenogLista: string;
  jezik: "sr-Cyrl" | "sr-Latn" | "mixed";
}

type RedStatus =
  | "analiziranje"
  | "spreman"
  | "salje"
  | "gotovo"
  | "greska";

interface Red {
  /** Stabilan key za React listu — ne mijenja se kad se izmijeni forma. */
  rid: string;
  fajl: File;
  forma: RedForma;
  /** Polja koja je analyze() automatski popunio — za prikaz "auto" oznake. */
  autoPolja: Set<keyof RedForma>;
  status: RedStatus;
  greska?: string;
}

interface Props {
  pocetniFajlovi: File[];
  /** Poziva se nakon svakog uspješno uploadovanog dokumenta. */
  onUploadGotov: (meta: DocumentMeta) => void;
  /** Zatvori batch (vrati na drop zone u Upload-u). */
  onZatvori: () => void;
}

function predloziNaslov(filename: string): string {
  return filename
    .replace(/\.(pdf|docx)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function pocetnaForma(f: File): RedForma {
  return {
    naslov: predloziNaslov(f.name),
    tip: DocumentType.ZAKON,
    oblast: LegalArea.RADNO_PRAVO,
    status: DocumentStatus.VAZECI,
    datum: "",
    organSud: "",
    brojSluzbenogLista: "",
    jezik: "sr-Latn",
  };
}

/**
 * Tabela za istovremeni unos više fajlova. Aktivira se kad korisnik baci
 * 2+ fajla u drop zonu u Upload komponenti. Svaki fajl prolazi kroz
 * `analyze()` paralelno (heuristika za prefill metapodataka), pa "Upload
 * sve" radi sekvencijalan POST jedan po jedan (paralelni POST-ovi bi
 * preopteretili Tesseract/embedding sidecar-e).
 */
export function BatchUploadTable({ pocetniFajlovi, onUploadGotov, onZatvori }: Props) {
  const [redovi, setRedovi] = useState<Red[]>(() =>
    pocetniFajlovi.map((f) => ({
      rid: generisiUUID(),
      fajl: f,
      forma: pocetnaForma(f),
      autoPolja: new Set(),
      status: "analiziranje" as const,
    })),
  );
  const [saljemSve, setSaljemSve] = useState(false);
  // Ref drži najnovije stanje redova za asinhroni uploadSve loop, da
  // korisničke izmjene u toku slanja budu pokupljene.
  const redoviRef = useRef(redovi);
  useEffect(() => {
    redoviRef.current = redovi;
  }, [redovi]);

  // Paralelan analyze() za sve redove na mount-u. Otkazi pri unmount-u.
  useEffect(() => {
    const ctrls = new Map<string, AbortController>();
    for (const r of redovi) {
      const ctrl = new AbortController();
      ctrls.set(r.rid, ctrl);
      analyzeDokument(r.fajl, ctrl.signal)
        .then((predlog) => {
          if (ctrl.signal.aborted) return;
          setRedovi((prev) =>
            prev.map((red) =>
              red.rid !== r.rid
                ? red
                : primijeniPredlog(red, predlog),
            ),
          );
        })
        .catch(() => {
          if (ctrl.signal.aborted) return;
          // Analiza nije uspjela — red je i dalje spreman, samo bez prefill-a.
          setRedovi((prev) =>
            prev.map((red) =>
              red.rid !== r.rid ? red : { ...red, status: "spreman" },
            ),
          );
        });
    }
    return () => {
      for (const c of ctrls.values()) c.abort();
    };
    // Intentionally empty deps — analyze se pokreće jednom za inicijalne fajlove.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ukloniRed = (rid: string) => {
    if (saljemSve) return;
    setRedovi((prev) => {
      const novo = prev.filter((r) => r.rid !== rid);
      if (novo.length === 0) {
        // Sve uklonjeno → vrati se na drop zone.
        setTimeout(onZatvori, 0);
      }
      return novo;
    });
  };

  const izmijeniPolje = <K extends keyof RedForma>(
    rid: string,
    polje: K,
    vrijednost: RedForma[K],
  ) => {
    setRedovi((prev) =>
      prev.map((r) => {
        if (r.rid !== rid) return r;
        const novaForma = { ...r.forma, [polje]: vrijednost };
        const novaAuto = new Set(r.autoPolja);
        novaAuto.delete(polje);
        return { ...r, forma: novaForma, autoPolja: novaAuto };
      }),
    );
  };

  const uploadSve = async () => {
    if (saljemSve) return;
    setSaljemSve(true);
    // Snapshot rid-jeva spremnih za slanje. Forma se uvijek čita iz
    // redoviRef.current u toku petlje da bi izmjene tokom slanja prošle.
    const redoviZaSlanje = redoviRef.current
      .filter((r) => r.status === "spreman")
      .map((r) => r.rid);

    for (const rid of redoviZaSlanje) {
      const r = redoviRef.current.find((y) => y.rid === rid);
      if (!r) continue;
      // Validacija minimuma — naslov je obavezan.
      if (!r.forma.naslov.trim()) {
        setRedovi((prev) =>
          prev.map((x) =>
            x.rid !== rid
              ? x
              : { ...x, status: "greska", greska: "Naslov je obavezan." },
          ),
        );
        continue;
      }
      setRedovi((prev) =>
        prev.map((x) => (x.rid !== rid ? x : { ...x, status: "salje" })),
      );

      try {
        const meta = await uploadDokument(r.fajl, {
          naslov: r.forma.naslov.trim(),
          tip: r.forma.tip,
          oblast: r.forma.oblast,
          status: r.forma.status,
          ...(r.forma.datum && { datum: r.forma.datum }),
          ...(r.forma.organSud.trim() && { organSud: r.forma.organSud.trim() }),
          ...(r.forma.brojSluzbenogLista.trim() && {
            brojSluzbenogLista: r.forma.brojSluzbenogLista.trim(),
          }),
          jezik: r.forma.jezik,
        });
        setRedovi((prev) =>
          prev.map((x) => (x.rid !== rid ? x : { ...x, status: "gotovo" })),
        );
        onUploadGotov(meta);
      } catch (e) {
        const poruka =
          e instanceof DocumentsApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Nepoznata greška.";
        setRedovi((prev) =>
          prev.map((x) =>
            x.rid !== rid ? x : { ...x, status: "greska", greska: poruka },
          ),
        );
      }
    }
    setSaljemSve(false);
  };

  const imaSpremnih = redovi.some((r) => r.status === "spreman");
  const sveGotovo =
    redovi.length > 0 && redovi.every((r) => r.status === "gotovo");

  return (
    <div>
      <div
        className="ui-sans"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          Batch unos — {redovi.length}{" "}
          {redovi.length === 1 ? "fajl" : redovi.length < 5 ? "fajla" : "fajlova"}.
          Pregledaj metapodatke pa klikni "Upload sve".
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onZatvori}
            disabled={saljemSve}
            className="ui-sans"
            style={otkaziBtnStyle(saljemSve)}
          >
            {sveGotovo ? "Zatvori" : "Odustani"}
          </button>
          <button
            type="button"
            onClick={uploadSve}
            disabled={saljemSve || !imaSpremnih}
            className="ui-sans"
            style={uploadBtnStyle(saljemSve || !imaSpremnih)}
          >
            {saljemSve ? (
              <>
                <Loader2 size={13} className="spin" /> Šaljem…
              </>
            ) : (
              <>
                <UploadIcon size={13} /> Upload sve
              </>
            )}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {redovi.map((r) => (
          <RedKartica
            key={r.rid}
            red={r}
            zakljucano={saljemSve}
            onIzmijeni={izmijeniPolje}
            onUkloni={ukloniRed}
          />
        ))}
      </div>
    </div>
  );
}

function primijeniPredlog(
  r: Red,
  predlog: import("@rtcg/shared").AnalyzeResponse,
): Red {
  const novaForma: RedForma = { ...r.forma };
  const auto = new Set<keyof RedForma>();
  if (
    predlog.naslov &&
    /^(Zakon|Uredba|Pravilnik|Odluka|Naredba|Uputstvo|Presuda|Rješenje|Mišljenje)\s/i.test(
      predlog.naslov,
    )
  ) {
    novaForma.naslov = predlog.naslov;
    auto.add("naslov");
  }
  if (predlog.tip) {
    novaForma.tip = predlog.tip;
    auto.add("tip");
  }
  if (predlog.oblast) {
    novaForma.oblast = predlog.oblast;
    auto.add("oblast");
  }
  if (predlog.datum) {
    novaForma.datum = predlog.datum;
    auto.add("datum");
  }
  if (predlog.organSud) {
    novaForma.organSud = predlog.organSud;
    auto.add("organSud");
  }
  if (predlog.brojSluzbenogLista) {
    novaForma.brojSluzbenogLista = predlog.brojSluzbenogLista;
    auto.add("brojSluzbenogLista");
  }
  if (predlog.jezik) {
    novaForma.jezik = predlog.jezik;
    auto.add("jezik");
  }
  return { ...r, forma: novaForma, autoPolja: auto, status: "spreman" };
}

interface RedKarticaProps {
  red: Red;
  zakljucano: boolean;
  onIzmijeni: <K extends keyof RedForma>(
    rid: string,
    polje: K,
    vrijednost: RedForma[K],
  ) => void;
  onUkloni: (rid: string) => void;
}

function RedKartica({ red, zakljucano, onIzmijeni, onUkloni }: RedKarticaProps) {
  const disabled =
    zakljucano ||
    red.status === "salje" ||
    red.status === "gotovo" ||
    red.status === "analiziranje";

  const inputStyleZa = (polje: keyof RedForma): React.CSSProperties =>
    red.autoPolja.has(polje)
      ? {
          ...inputStyle,
          borderColor: "color-mix(in srgb, var(--accent) 60%, var(--border))",
          background: "color-mix(in srgb, var(--accent) 4%, var(--bg))",
        }
      : inputStyle;

  return (
    <div
      style={{
        background: "var(--panel)",
        border:
          red.status === "gotovo"
            ? "1px solid color-mix(in srgb, var(--ok) 40%, var(--border))"
            : red.status === "greska"
              ? "1px solid color-mix(in srgb, var(--error) 40%, var(--border))"
              : "1px solid var(--border)",
        borderRadius: "var(--r-card)",
        padding: "12px 14px",
        opacity: red.status === "gotovo" ? 0.75 : 1,
      }}
    >
      {/* Header: fajl + status + ukloni */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontWeight: 500,
            }}
          >
            {red.fajl.name}
          </div>
          <div
            className="ui-sans"
            style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}
          >
            {(red.fajl.size / 1024 / 1024).toFixed(2)} MB
          </div>
        </div>
        <StatusBadge status={red.status} greska={red.greska} />
        {red.status !== "salje" && red.status !== "gotovo" && (
          <button
            type="button"
            onClick={() => onUkloni(red.rid)}
            disabled={zakljucano}
            aria-label="Ukloni iz batch-a"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted)",
              cursor: zakljucano ? "default" : "pointer",
              padding: 4,
              display: "grid",
              placeItems: "center",
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Naslov — pun red */}
      <input
        type="text"
        value={red.forma.naslov}
        onChange={(e) => onIzmijeni(red.rid, "naslov", e.target.value)}
        disabled={disabled}
        maxLength={500}
        placeholder="Naslov dokumenta"
        style={{
          ...inputStyleZa("naslov"),
          fontSize: 13.5,
          marginBottom: 8,
        }}
      />

      {/* Tip, Oblast, Datum, Status — kompaktan red */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1.2fr 1fr 1fr",
          gap: 8,
        }}
      >
        <select
          value={red.forma.tip}
          onChange={(e) =>
            onIzmijeni(red.rid, "tip", e.target.value as DocumentType)
          }
          disabled={disabled}
          style={inputStyleZa("tip")}
        >
          {Object.entries(TIP_META).map(([k, v]) => (
            <option key={k} value={k}>
              {v.labela}
            </option>
          ))}
        </select>
        <select
          value={red.forma.oblast}
          onChange={(e) =>
            onIzmijeni(red.rid, "oblast", e.target.value as LegalArea)
          }
          disabled={disabled}
          style={inputStyleZa("oblast")}
        >
          {Object.entries(OBLAST_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={red.forma.datum}
          onChange={(e) => onIzmijeni(red.rid, "datum", e.target.value)}
          disabled={disabled}
          style={inputStyleZa("datum")}
        />
        <select
          value={red.forma.status}
          onChange={(e) =>
            onIzmijeni(red.rid, "status", e.target.value as DocumentStatus)
          }
          disabled={disabled}
          style={inputStyle}
        >
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {red.autoPolja.size > 0 && red.status === "spreman" && (
        <div
          className="ui-sans"
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "var(--accent)",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Sparkles size={11} />
          Automatski popunjeno {red.autoPolja.size}{" "}
          {red.autoPolja.size === 1 ? "polje" : "polja"} — pregledaj.
        </div>
      )}
      {red.status === "greska" && red.greska && (
        <div
          className="ui-sans"
          style={{
            marginTop: 8,
            fontSize: 11.5,
            color: "var(--error)",
          }}
        >
          {red.greska}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, greska }: { status: RedStatus; greska?: string }) {
  if (status === "analiziranje") {
    return (
      <Badge boja="var(--muted)" ikona={<Loader2 size={11} className="spin" />}>
        Analiziram
      </Badge>
    );
  }
  if (status === "spreman") {
    return (
      <Badge boja="var(--accent)">Spreman</Badge>
    );
  }
  if (status === "salje") {
    return (
      <Badge boja="var(--accent)" ikona={<Loader2 size={11} className="spin" />}>
        Šaljem
      </Badge>
    );
  }
  if (status === "gotovo") {
    return (
      <Badge boja="var(--ok)" ikona={<CheckCircle2 size={11} />}>
        Gotovo
      </Badge>
    );
  }
  return (
    <Badge boja="var(--error)" ikona={<XCircle size={11} />} title={greska}>
      Greška
    </Badge>
  );
}

function Badge({
  boja,
  ikona,
  children,
  title,
}: {
  boja: string;
  ikona?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      className="ui-sans"
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: "var(--r-pill)",
        fontSize: 10.5,
        color: boja,
        fontWeight: 600,
        border: `1px solid color-mix(in srgb, ${boja} 40%, var(--border))`,
        background: `color-mix(in srgb, ${boja} 8%, var(--panel))`,
        whiteSpace: "nowrap",
      }}
    >
      {ikona}
      {children}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-button)",
  padding: "7px 10px",
  color: "var(--text)",
  fontSize: 12.5,
  fontFamily: "var(--font-sans)",
  outline: "none",
};

function otkaziBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: "transparent",
    border: "1px solid var(--border)",
    color: "var(--muted)",
    borderRadius: "var(--r-button)",
    padding: "8px 14px",
    fontSize: 12.5,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

function uploadBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: disabled ? "var(--panel-2)" : "var(--accent-grad)",
    color: disabled ? "var(--muted)" : "var(--bg)",
    border: "none",
    borderRadius: "var(--r-button)",
    padding: "8px 16px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
  };
}
