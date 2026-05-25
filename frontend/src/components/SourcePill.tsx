import type { Citat } from "@rtcg/shared";
import { TypeBadge } from "./TypeBadge.js";

interface Props {
  citat: Citat;
  redni_broj: number;
  onClick?: (citat: Citat) => void;
}

/**
 * Red izvora u listi citata ispod AI odgovora.
 * UI-SPEC §3.4: kompozicija TypeBadge + naslov + referenca + skor.
 */
export function SourcePill({ citat, redni_broj, onClick }: Props) {
  const skorProcenat = Math.round(citat.skor * 100);

  return (
    <button
      onClick={onClick ? () => onClick(citat) : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-button)",
        padding: "10px 12px",
        color: "var(--text)",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color var(--t-fast), transform var(--t-fast)",
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.borderColor =
            "color-mix(in srgb, var(--accent) 50%, var(--border))";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    >
      <span
        className="ui-sans"
        style={{
          minWidth: 22,
          height: 22,
          borderRadius: 6,
          background: "var(--panel-2)",
          display: "grid",
          placeItems: "center",
          fontSize: 11,
          color: "var(--muted)",
          flexShrink: 0,
        }}
      >
        {redni_broj}
      </span>
      <TypeBadge tip={citat.tip} velicina="sm" />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        <strong>{citat.naslov}</strong>
        {citat.referenca && (
          <span
            className="ui-sans"
            style={{ color: "var(--muted)", marginLeft: 8, fontSize: 12 }}
          >
            {citat.referenca}
          </span>
        )}
      </span>
      <span
        className="ui-sans"
        style={{
          fontSize: 11,
          color: "var(--muted)",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {skorProcenat}%
      </span>
    </button>
  );
}
