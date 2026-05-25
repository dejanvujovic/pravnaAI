import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, MessageSquarePlus, Trash2 } from "lucide-react";
import type { RazgovorListItem } from "@rtcg/shared";
import { DocumentsApiError, deleteRazgovor, listRazgovora } from "../lib/api.js";
import { dobaviSesijaId } from "../lib/session.js";

interface Props {
  /** Inkrementira se kad novi razgovor bude kreiran — okida refetch. */
  osvezenje?: number;
}

/**
 * Sidebar sa istorijom razgovora. Bez auth-a — razgovori se grupišu po
 * browser sesiji (UUID iz localStorage). "Novi razgovor" navigira na "/",
 * klik na stavku na "/razgovor/:id".
 */
export function Sidebar({ osvezenje = 0 }: Props) {
  const navigate = useNavigate();
  const { id: aktivniId } = useParams<{ id: string }>();
  const [razgovori, setRazgovori] = useState<RazgovorListItem[]>([]);
  const [ucitavanje, setUcitavanje] = useState(false);
  const [brisuId, setBrisuId] = useState<string | null>(null);
  const [greska, setGreska] = useState<string | null>(null);

  const ucitaj = useCallback(async (signal?: AbortSignal) => {
    setUcitavanje(true);
    try {
      const lista = await listRazgovora(dobaviSesijaId(), signal);
      if (!signal?.aborted) setRazgovori(lista);
      if (!signal?.aborted) setGreska(null);
    } catch (e) {
      if (signal?.aborted) return;
      setGreska(
        e instanceof DocumentsApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Nepoznata greška.",
      );
    } finally {
      if (!signal?.aborted) setUcitavanje(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    ucitaj(ctrl.signal);
    return () => ctrl.abort();
  }, [ucitaj, osvezenje]);

  const obrisi = async (rg: RazgovorListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Obrisati razgovor "${rg.naslov}"?`)) return;
    setBrisuId(rg.id);
    try {
      await deleteRazgovor(rg.id);
      setRazgovori((prev) => prev.filter((x) => x.id !== rg.id));
      // Ako je aktivan razgovor obrisan, vrati se na novi.
      if (rg.id === aktivniId) navigate("/");
    } catch (err) {
      setGreska(
        err instanceof DocumentsApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Brisanje nije uspjelo.",
      );
    } finally {
      setBrisuId(null);
    }
  };

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        background: "var(--panel)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <button
        type="button"
        onClick={() => navigate("/")}
        className="ui-sans"
        style={{
          margin: 12,
          padding: "10px 14px",
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-button)",
          color: "var(--text)",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          transition: "border-color var(--t-fast), background var(--t-fast)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor =
            "color-mix(in srgb, var(--accent) 50%, var(--border))";
          e.currentTarget.style.background = "var(--panel-2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.background = "transparent";
        }}
      >
        <MessageSquarePlus size={14} color="var(--accent)" />
        Novi razgovor
      </button>

      <div
        className="ui-sans"
        style={{
          padding: "0 16px 8px",
          fontSize: 10.5,
          color: "var(--muted)",
          letterSpacing: ".12em",
          fontWeight: 600,
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>Istorija</span>
        {ucitavanje && <Loader2 size={11} className="spin" />}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
        {razgovori.length === 0 && !ucitavanje && (
          <div
            className="ui-sans"
            style={{
              padding: "12px 14px",
              fontSize: 12,
              color: "var(--muted)",
              fontStyle: "italic",
            }}
          >
            Nema razgovora — postavi pitanje.
          </div>
        )}
        {razgovori.map((rg) => (
          <Stavka
            key={rg.id}
            razgovor={rg}
            aktivan={rg.id === aktivniId}
            brisuSe={brisuId === rg.id}
            onClick={() => navigate(`/razgovor/${rg.id}`)}
            onDelete={(e) => obrisi(rg, e)}
          />
        ))}
        {greska && (
          <div
            className="ui-sans"
            style={{
              margin: "8px 6px 0",
              padding: "8px 10px",
              fontSize: 11.5,
              color: "var(--error)",
              border: "1px solid color-mix(in srgb, var(--error) 40%, var(--border))",
              borderRadius: "var(--r-button)",
              background: "color-mix(in srgb, var(--error) 10%, var(--panel))",
            }}
          >
            {greska}
          </div>
        )}
      </div>
    </aside>
  );
}

interface StavkaProps {
  razgovor: RazgovorListItem;
  aktivan: boolean;
  brisuSe: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

function Stavka({ razgovor, aktivan, brisuSe, onClick, onDelete }: StavkaProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        position: "relative",
        padding: "9px 32px 9px 12px",
        borderRadius: "var(--r-button)",
        cursor: brisuSe ? "default" : "pointer",
        background: aktivan ? "var(--panel-2)" : "transparent",
        border: `1px solid ${aktivan ? "var(--border)" : "transparent"}`,
        marginBottom: 2,
        transition: "background var(--t-fast)",
      }}
      onMouseEnter={(e) => {
        if (!aktivan && !brisuSe) e.currentTarget.style.background = "var(--panel-2)";
      }}
      onMouseLeave={(e) => {
        if (!aktivan) e.currentTarget.style.background = "transparent";
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: aktivan ? "var(--text)" : "color-mix(in srgb, var(--text) 85%, var(--muted))",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          lineHeight: 1.35,
        }}
      >
        {razgovor.naslov}
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={brisuSe}
        aria-label="Obriši razgovor"
        style={{
          position: "absolute",
          right: 6,
          top: "50%",
          transform: "translateY(-50%)",
          background: "transparent",
          border: "none",
          color: "var(--muted)",
          cursor: brisuSe ? "default" : "pointer",
          padding: 4,
          display: "grid",
          placeItems: "center",
          opacity: 0.55,
          transition: "color var(--t-fast), opacity var(--t-fast)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--error)";
          e.currentTarget.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--muted)";
          e.currentTarget.style.opacity = "0.55";
        }}
      >
        {brisuSe ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
      </button>
    </div>
  );
}
