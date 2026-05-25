/**
 * Mapiranje DocumentType -> DocumentGroup (boja + ikonica).
 *
 * UI-SPEC §1.4 i §7.5: taksonomija (DocumentType, 9 vrijednosti) živi
 * u @rtcg/shared i NE smije se redefinisati u UI-u. Ovaj fajl drži samo
 * vizuelnu interpretaciju — koji tip ide u koju grupu, koja je boja
 * grupe i koja ikonica.
 *
 * <TypeBadge> uvijek prikazuje TAČAN `DocumentType` kao tekst (npr.
 * "Ugovor o javnoj nabavci"), a boju/ikonicu uzima iz grupe.
 */

import type { DocumentGroup, DocumentType } from "@rtcg/shared";
import {
  BookOpen,
  Building2,
  FileSignature,
  Gavel,
  type LucideIcon,
} from "lucide-react";

export interface TipMeta {
  grupa: DocumentGroup;
  labela: string;        // "Ugovor o radu" — prikazni naziv tipa
  cssBoja: string;       // CSS varijabla, npr. "var(--propis)"
  ikonica: LucideIcon;
}

const PROPIS = {
  grupa: "PROPIS" as const,
  cssBoja: "var(--propis)",
  ikonica: BookOpen,
};

const PRAKSA = {
  grupa: "PRAKSA" as const,
  cssBoja: "var(--praksa)",
  ikonica: Gavel,
};

const UGOVOR = {
  grupa: "UGOVOR" as const,
  cssBoja: "var(--ugovor)",
  ikonica: FileSignature,
};

const INTERNI = {
  grupa: "INTERNI" as const,
  cssBoja: "var(--interni)",
  ikonica: Building2,
};

export const TIP_META: Record<DocumentType, TipMeta> = {
  ZAKON: { ...PROPIS, labela: "Zakon" },
  PODZAKONSKI_AKT: { ...PROPIS, labela: "Podzakonski akt" },
  PRESUDA: { ...PRAKSA, labela: "Presuda" },
  SUDSKA_PRAKSA: { ...PRAKSA, labela: "Sudska praksa" },
  MISLJENJE: { ...PRAKSA, labela: "Mišljenje" },
  UGOVOR_O_RADU: { ...UGOVOR, labela: "Ugovor o radu" },
  UGOVOR_JAVNA_NABAVKA: { ...UGOVOR, labela: "Ugovor (nabavka)" },
  INTERNI_AKT: { ...INTERNI, labela: "Interni akt" },
  OSTALO: { ...INTERNI, labela: "Ostalo" },
};
