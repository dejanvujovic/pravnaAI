import { Scale } from "lucide-react";

interface Props {
  podnaslov?: string;
  velicina?: "sm" | "md" | "lg";
}

const VELICINE = {
  sm: { box: 28, icon: 14, naziv: 13, sub: 9 },
  md: { box: 34, icon: 18, naziv: 15, sub: 10 },
  lg: { box: 56, icon: 28, naziv: 22, sub: 11 },
};

/**
 * Brend marker — kombinacija ikone (vaga) i imena u zlatnom gradijentu.
 * UI-SPEC §1.1: jedini akcent je RTCG zlatna preko gradijenta.
 */
export function Logo({ podnaslov = "Pravna služba RTCG", velicina = "md" }: Props) {
  const v = VELICINE[velicina];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: v.box,
          height: v.box,
          borderRadius: "var(--r-icon)",
          background: "var(--accent-grad)",
          display: "grid",
          placeItems: "center",
          boxShadow:
            "0 0 0 1px var(--border), 0 6px 18px rgba(200,162,75,.18)",
        }}
      >
        <Scale size={v.icon} color="var(--bg)" strokeWidth={2.4} />
      </div>
      <div style={{ lineHeight: 1 }}>
        <div
          className="ui-sans"
          style={{ fontWeight: 700, letterSpacing: ".02em", fontSize: v.naziv }}
        >
          Pravna<span style={{ color: "var(--accent)" }}>AI</span>
        </div>
        <div
          className="ui-sans"
          style={{
            fontSize: v.sub,
            color: "var(--muted)",
            marginTop: 3,
            letterSpacing: ".07em",
            textTransform: "uppercase",
          }}
        >
          {podnaslov}
        </div>
      </div>
    </div>
  );
}
