import { useCallback, useState } from "react";
import { FolderOpen, Upload as UploadIcon } from "lucide-react";
import type { DocumentMeta } from "@rtcg/shared";
import { Upload } from "../components/Upload.js";
import { Pipeline } from "../components/Pipeline.js";
import { DocTable } from "../components/DocTable.js";

interface AktivanIngest {
  id: string;
  naslov: string;
}

/**
 * Ingest ekran (UI-SPEC §4):
 *   - Upload kartica (drag-drop + metapodaci)
 *   - Lista aktivnih ingest pipeline-ova (polling /status do ZAVRSENO/GRESKA)
 *   - Tabela svih dokumenata u sistemu sa filterima + delete
 */
export function Ingest() {
  const [aktivni, setAktivni] = useState<AktivanIngest[]>([]);
  const [osvezenjeTabele, setOsvezenjeTabele] = useState(0);

  const naUpload = useCallback((meta: DocumentMeta) => {
    setAktivni((p) => [{ id: meta.id, naslov: meta.naslov }, ...p]);
  }, []);

  const naZavrseno = useCallback(() => {
    // Pri završetku jednog pipeline-a osvježi tabelu da uđu u listu.
    setOsvezenjeTabele((n) => n + 1);
  }, []);

  const ukloniAktivan = useCallback((id: string) => {
    setAktivni((p) => p.filter((a) => a.id !== id));
  }, []);

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 24px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <FolderOpen size={22} color="var(--accent)" />
          <h2
            className="ui-sans"
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: "-.01em",
            }}
          >
            Dokumenti
          </h2>
        </div>

        {/* Upload kartica */}
        <SectionTitle ikona={UploadIcon} naslov="Novi unos" />
        <Upload onUploadGotov={naUpload} />

        {/* Aktivni pipeline-ovi */}
        {aktivni.length > 0 && (
          <>
            <SectionTitle naslov={`U obradi (${aktivni.length})`} marginTop={32} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {aktivni.map((a) => (
                <Pipeline
                  key={a.id}
                  documentId={a.id}
                  onZavrseno={naZavrseno}
                  onGreska={naZavrseno}
                  onUkloni={ukloniAktivan}
                />
              ))}
            </div>
          </>
        )}

        {/* Lista dokumenata */}
        <SectionTitle naslov="Svi dokumenti" marginTop={32} />
        <DocTable osvezenje={osvezenjeTabele} />
      </div>
    </div>
  );
}

interface SectionTitleProps {
  naslov: string;
  ikona?: typeof UploadIcon;
  marginTop?: number;
}

function SectionTitle({ naslov, ikona: Ikona, marginTop = 0 }: SectionTitleProps) {
  return (
    <div
      className="ui-sans"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop,
        marginBottom: 12,
        fontSize: 11,
        color: "var(--muted)",
        letterSpacing: ".12em",
        fontWeight: 600,
        textTransform: "uppercase",
      }}
    >
      {Ikona && <Ikona size={12} />}
      {naslov}
    </div>
  );
}
