import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  onSend: (pitanje: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Input za pitanje. Enter šalje, Shift+Enter novi red. Tekst-area auto-raste
 * do ~160px pa onda scroll. UI-SPEC §3.5.
 */
export function Composer({
  onSend,
  disabled = false,
  placeholder = "Postavi pravno pitanje...",
}: Props) {
  const [vrijednost, setVrijednost] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [vrijednost]);

  const posalji = () => {
    const t = vrijednost.trim();
    if (!t || disabled) return;
    onSend(t);
    setVrijednost("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      posalji();
    }
  };

  const moze = vrijednost.trim().length > 0 && !disabled;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px 16px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 10,
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-card)",
          padding: "10px 10px 10px 14px",
          boxShadow: "0 6px 24px rgba(0,0,0,.25)",
        }}
      >
        <textarea
          ref={ref}
          value={vrijednost}
          onChange={(e) => setVrijednost(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          style={{
            flex: 1,
            resize: "none",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text)",
            fontSize: 15,
            lineHeight: 1.5,
            fontFamily: "var(--font-sans)",
            padding: "6px 0",
            maxHeight: 160,
            overflowY: "auto",
          }}
        />
        <button
          onClick={posalji}
          disabled={!moze}
          aria-label="Pošalji pitanje"
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            borderRadius: "var(--r-button)",
            border: "none",
            background: moze ? "var(--accent-grad)" : "var(--panel-2)",
            color: moze ? "var(--bg)" : "var(--muted)",
            display: "grid",
            placeItems: "center",
            transition: "background var(--t-fast), opacity var(--t-fast)",
            opacity: disabled ? 0.5 : 1,
            cursor: moze ? "pointer" : "default",
          }}
        >
          <Send size={16} strokeWidth={2.4} />
        </button>
      </div>
      <p
        className="ui-sans"
        style={{
          fontSize: 11,
          color: "var(--muted)",
          textAlign: "center",
          marginTop: 10,
          marginBottom: 0,
        }}
      >
        PravnaAI može pogriješiti. Odgovori nisu pravni savjet — provjeri navedene izvore.
      </p>
    </div>
  );
}
