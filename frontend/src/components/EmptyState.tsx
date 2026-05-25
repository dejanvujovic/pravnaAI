import { ChevronRight, Quote, Scale } from "lucide-react";

interface Props {
  onPredlog: (pitanje: string) => void;
}

const PREDLOZI = [
  "Koji su rokovi za odgovor na tužbu prema ZPP-u?",
  "Koje su obaveze poslodavca pri otkazu ugovora o radu?",
  "Šta je obaveza naručioca u postupku javne nabavke?",
  "Da li RTCG kao javni servis ima specifične obaveze po Zakonu o medijima?",
];

/**
 * Početni ekran prije prvog pitanja — brend, naslov, lista primjera.
 * UI-SPEC §3.2 — pojednostavljeno za prvi PR (bez 2x2 quick action grid-a).
 */
export function EmptyState({ onPredlog }: Props) {
  return (
    <div
      className="fadeup"
      style={{ maxWidth: 720, margin: "0 auto", padding: "9vh 24px 40px" }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          margin: "0 auto 24px",
          background: "var(--accent-grad)",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 12px 40px rgba(200,162,75,.22)",
        }}
      >
        <Scale size={32} color="var(--bg)" strokeWidth={2.2} />
      </div>

      <h1
        style={{
          textAlign: "center",
          fontSize: 32,
          fontWeight: 500,
          margin: "0 0 10px",
          letterSpacing: "-.015em",
        }}
      >
        Kako mogu pomoći pravnoj službi?
      </h1>
      <p
        className="ui-sans"
        style={{
          textAlign: "center",
          color: "var(--muted)",
          fontSize: 14,
          margin: "0 0 36px",
        }}
      >
        Pretraga crnogorskih zakona, presuda i internih akata RTCG — uz obavezno navođenje izvora.
      </p>

      <div
        className="ui-sans"
        style={{
          fontSize: 11,
          color: "var(--muted)",
          letterSpacing: ".12em",
          fontWeight: 600,
          marginBottom: 12,
        }}
      >
        PRIMJERI PITANJA
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PREDLOZI.map((p, i) => (
          <button
            key={i}
            onClick={() => onPredlog(p)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              textAlign: "left",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 11,
              padding: "12px 14px",
              color: "var(--text)",
              fontSize: 14,
              fontFamily: "var(--font-sans)",
              transition: "background var(--t-fast), border-color var(--t-fast)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--panel)";
              e.currentTarget.style.borderColor =
                "color-mix(in srgb, var(--accent) 30%, var(--border))";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            <Quote
              size={14}
              color="var(--accent)"
              style={{ flexShrink: 0, opacity: 0.7 }}
            />
            <span style={{ flex: 1 }}>{p}</span>
            <ChevronRight size={16} color="var(--muted)" />
          </button>
        ))}
      </div>
    </div>
  );
}
