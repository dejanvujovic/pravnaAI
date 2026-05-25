import type { DocumentType } from "@rtcg/shared";
import { TIP_META } from "../lib/docTypes.js";

interface Props {
  tip: DocumentType;
  velicina?: "sm" | "md";
}

/**
 * Badge tipa dokumenta — prikazuje tačan DocumentType kao tekst,
 * boju i ikonu uzima iz DocumentGroup mape (UI-SPEC §1.4).
 */
export function TypeBadge({ tip, velicina = "md" }: Props) {
  const meta = TIP_META[tip];
  const Icon = meta.ikonica;
  const small = velicina === "sm";

  return (
    <span
      className="ui-sans"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: small ? 9.5 : 10.5,
        fontWeight: 700,
        color: meta.cssBoja,
        border: `1px solid color-mix(in srgb, ${meta.cssBoja} 35%, transparent)`,
        borderRadius: 6,
        padding: small ? "2px 7px" : "3px 9px",
        letterSpacing: ".03em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={small ? 11 : 12} />
      {meta.labela}
    </span>
  );
}
