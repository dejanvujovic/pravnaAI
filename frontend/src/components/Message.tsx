import type { Citat } from "@rtcg/shared";
import { BookOpen, Scale, ShieldAlert } from "lucide-react";
import { SourcePill } from "./SourcePill.js";

interface UserMsgProps {
  tekst: string;
}

export function UserMessage({ tekst }: UserMsgProps) {
  return (
    <div className="fadeup" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 22 }}>
      <div
        style={{
          maxWidth: "78%",
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
          padding: "12px 16px",
          borderRadius: "14px 14px 4px 14px",
          fontSize: 15,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
        }}
      >
        {tekst}
      </div>
    </div>
  );
}

interface AiMsgProps {
  tekst: string;
  citati: Citat[];
  status: "streaming" | "kraj" | "greska";
  greska?: string;
  trajanjeMs?: number;
  onClickCitat?: (citat: Citat) => void;
}

export function AiMessage({ tekst, citati, status, greska, onClickCitat }: AiMsgProps) {
  const ucitavanje = status === "streaming" && tekst.length === 0;
  const imaCitate = citati.length > 0;

  return (
    <div className="fadeup" style={{ display: "flex", gap: 13, marginBottom: 30 }}>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: "var(--r-icon)",
          flexShrink: 0,
          marginTop: 2,
          background: "var(--accent-grad)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <Scale size={15} color="var(--bg)" strokeWidth={2.4} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Izvori — emituju se prvi, prije teksta odgovora. */}
        {imaCitate && (
          <div style={{ marginBottom: 16 }}>
            <div
              className="ui-sans"
              style={{
                fontSize: 11,
                color: "var(--muted)",
                letterSpacing: ".12em",
                fontWeight: 600,
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <BookOpen size={12} />
              IZVORI ({citati.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {citati.map((c, i) => (
                <SourcePill
                  key={c.chunkId}
                  citat={c}
                  redni_broj={i + 1}
                  {...(onClickCitat && { onClick: onClickCitat })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Učitavanje — vidljivo dok ne stigne prvi token. */}
        {ucitavanje && (
          <div
            className="ui-sans"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "var(--muted)",
              fontSize: 13.5,
            }}
          >
            <BouncingDots />
            <span>Pretražujem pravnu bazu i sastavljam odgovor…</span>
          </div>
        )}

        {/* Tekst odgovora (streaming ili završen). */}
        {tekst.length > 0 && (
          <div
            style={{
              fontSize: 15.5,
              lineHeight: 1.62,
              whiteSpace: "pre-wrap",
            }}
          >
            {tekst}
          </div>
        )}

        {/* Greška — npr. nema relevantnih dokumenata u bazi. */}
        {status === "greska" && (
          <div
            className="ui-sans"
            style={{
              marginTop: tekst.length > 0 ? 12 : 0,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 14px",
              background:
                "color-mix(in srgb, var(--error) 12%, var(--panel))",
              border:
                "1px solid color-mix(in srgb, var(--error) 40%, var(--border))",
              borderRadius: "var(--r-button)",
              color: "var(--text)",
              fontSize: 13.5,
            }}
          >
            <ShieldAlert size={16} color="var(--error)" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{greska ?? "Došlo je do greške."}</span>
          </div>
        )}

        {/* Disclaimer ispod završenog odgovora — UI-SPEC §3.4. */}
        {status === "kraj" && tekst.length > 0 && (
          <p
            className="ui-sans"
            style={{
              marginTop: 14,
              fontSize: 11.5,
              color: "var(--muted)",
              fontStyle: "italic",
            }}
          >
            Provjeri izvore prije upotrebe — urednički nadzor pravnika ostaje obavezan.
          </p>
        )}
      </div>
    </div>
  );
}

function BouncingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--accent)",
            animation: `bounce-dot 1.2s ${i * 0.15}s infinite ease-in-out`,
          }}
        />
      ))}
    </span>
  );
}
