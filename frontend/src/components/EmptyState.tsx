import { Briefcase, Gavel, Radio, Scale, ShoppingBag, type LucideIcon } from "lucide-react";

interface Props {
  onPredlog: (pitanje: string) => void;
}

interface BrzaAkcija {
  ikona: LucideIcon;
  kategorija: string;
  pitanje: string;
  cssBoja: string;
}

/**
 * 2×2 grid kategorija sa primjernim pitanjem. Klik šalje pitanje.
 * UI-SPEC §3.2 — kategorije pokrivaju 4 glavne oblasti za pravnu službu RTCG.
 */
const BRZE_AKCIJE: BrzaAkcija[] = [
  {
    ikona: Gavel,
    kategorija: "Parnični postupak",
    pitanje: "Koji su rokovi za odgovor na tužbu prema ZPP-u?",
    cssBoja: "var(--praksa)",
  },
  {
    ikona: Briefcase,
    kategorija: "Radno pravo",
    pitanje: "Koje su obaveze poslodavca pri otkazu ugovora o radu?",
    cssBoja: "var(--ugovor)",
  },
  {
    ikona: ShoppingBag,
    kategorija: "Javne nabavke",
    pitanje: "Šta je obaveza naručioca u postupku javne nabavke?",
    cssBoja: "var(--interni)",
  },
  {
    ikona: Radio,
    kategorija: "Medijsko pravo",
    pitanje: "Koje specifične obaveze ima RTCG kao javni servis po Zakonu o medijima?",
    cssBoja: "var(--propis)",
  },
];

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
          textTransform: "uppercase",
        }}
      >
        Brze teme
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 10,
        }}
      >
        {BRZE_AKCIJE.map((a) => (
          <Kartica key={a.kategorija} akcija={a} onClick={() => onPredlog(a.pitanje)} />
        ))}
      </div>
    </div>
  );
}

interface KarticaProps {
  akcija: BrzaAkcija;
  onClick: () => void;
}

function Kartica({ akcija, onClick }: KarticaProps) {
  const Icon = akcija.ikona;
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        textAlign: "left",
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-card)",
        padding: "16px 16px 14px",
        color: "var(--text)",
        fontFamily: "var(--font-sans)",
        cursor: "pointer",
        transition: "border-color var(--t-fast), background var(--t-fast), transform var(--t-fast)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `color-mix(in srgb, ${akcija.cssBoja} 55%, var(--border))`;
        e.currentTarget.style.background = `color-mix(in srgb, ${akcija.cssBoja} 5%, var(--panel))`;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.background = "var(--panel)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            display: "grid",
            placeItems: "center",
            background: `color-mix(in srgb, ${akcija.cssBoja} 14%, transparent)`,
            border: `1px solid color-mix(in srgb, ${akcija.cssBoja} 35%, transparent)`,
            flexShrink: 0,
          }}
        >
          <Icon size={15} color={akcija.cssBoja} strokeWidth={2.1} />
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: akcija.cssBoja,
            letterSpacing: ".01em",
          }}
        >
          {akcija.kategorija}
        </span>
      </div>
      <span
        style={{
          fontSize: 13.5,
          lineHeight: 1.4,
          color: "var(--text)",
          fontFamily: "var(--font-serif)",
        }}
      >
        {akcija.pitanje}
      </span>
    </button>
  );
}
