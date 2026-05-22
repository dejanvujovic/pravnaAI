import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Scale, Send, Plus, Search, FileText, BookOpen, GitCompare, FileSearch,
  Clock, ChevronRight, Sparkles, Paperclip, ShieldCheck, Quote, X,
  PanelLeftClose, PanelLeft, Gavel, MessageSquare, UploadCloud, Database,
  ScanLine, Layers, Check, Loader2, Trash2, Filter, FileSignature, Building2,
} from "lucide-react";

/*  RTCG · PRAVNA AI — objedinjeni interaktivni preview
    Dva ekrana: Chat (Q&A sa citiranjem) + Unos dokumenata.
    Usklađeno sa shared/types.ts: 9 DocumentType → 4 DocumentGroup. */

const ACCENT = "#C8A24B", BG = "#0E1116", PANEL = "#161B22", PANEL2 = "#1C232D";
const BORDER = "#262E3A", TEXT = "#E6EAF0", MUTED = "#8A94A6";
const BLUE = "#7FB3FF", GREEN = "#5FBF8A", RED = "#E07A6B", VIOLET = "#C792E0";

// DocumentType → grupa (boja/ikonica) — odraz docTypes.ts
const TYPE_MAP = {
  ZAKON:                { grupa: "PROPIS",  labela: "Zakon",            color: ACCENT,  icon: BookOpen },
  PODZAKONSKI_AKT:      { grupa: "PROPIS",  labela: "Podzakonski akt",  color: ACCENT,  icon: BookOpen },
  PRESUDA:              { grupa: "PRAKSA",  labela: "Presuda",          color: BLUE,    icon: Gavel },
  SUDSKA_PRAKSA:        { grupa: "PRAKSA",  labela: "Sudska praksa",    color: BLUE,    icon: Gavel },
  MISLJENJE:            { grupa: "PRAKSA",  labela: "Mišljenje",        color: BLUE,    icon: Gavel },
  UGOVOR_O_RADU:        { grupa: "UGOVOR",  labela: "Ugovor o radu",    color: GREEN,   icon: FileSignature },
  UGOVOR_JAVNA_NABAVKA: { grupa: "UGOVOR",  labela: "Ugovor (nabavka)", color: GREEN,   icon: FileSignature },
  INTERNI_AKT:          { grupa: "INTERNI", labela: "Interni akt",      color: VIOLET,  icon: Building2 },
  OSTALO:               { grupa: "INTERNI", labela: "Ostalo",           color: VIOLET,  icon: Building2 },
};
const GROUPS = [
  { key: "PROPIS", labela: "Propisi", color: ACCENT, icon: BookOpen },
  { key: "PRAKSA", labela: "Praksa", color: BLUE, icon: Gavel },
  { key: "UGOVOR", labela: "Ugovori", color: GREEN, icon: FileSignature },
  { key: "INTERNI", labela: "Interni", color: VIOLET, icon: Building2 },
];
const STAGES = ["Parsiranje", "Chunking", "Embedding", "Indeksiranje"];

const QUICK = [
  { icon: Search, label: "Pretraga prakse", hint: "Semantička pretraga zakona i presuda" },
  { icon: GitCompare, label: "Uporedi dokumente", hint: "Dvije verzije ugovora ili zakona" },
  { icon: FileSearch, label: "Sažmi presudu", hint: "Ključni stavovi i dispozitiv" },
  { icon: Gavel, label: "Rokovi i postupak", hint: "Procesna pitanja po ZPP/ZUP" },
];
const SUGGESTIONS = [
  "Koji su rokovi za odgovor na tužbu prema ZPP-u?",
  "Uporedi član 12 ugovora o hostingu sa ispravljenom verzijom v1.3",
  "Sažmi presudu Upravnog suda U. 1247/2025",
  "Koje su obaveze RTCG kao javnog emitera po Zakonu o medijima?",
];
const HISTORY = [
  { t: "Tužba — radni spor 2026", d: "danas" },
  { t: "Ugovor o hostingu — analiza", d: "danas" },
  { t: "Zakon o RTV — član 9", d: "juče" },
  { t: "Presuda U. 1247/2025", d: "juče" },
  { t: "Autorska prava — arhiva", d: "pon" },
];
const ANSWER = {
  text: [
    "Prema Zakonu o parničnom postupku Crne Gore, tuženi je dužan da odgovori na tužbu u roku koji odredi sud, a koji ne može biti kraći od 15 ni duži od 30 dana od dostavljanja.",
    "Ako tuženi u tom roku ne dostavi odgovor, sud može donijeti presudu zbog izostanka — pod uslovom da su ispunjeni zakonski uslovi (uredna dostava, osnovanost tužbenog zahtjeva).",
    "U praksi pravne službe RTCG, preporučuje se evidentiranje datuma prijema u djelovodnik istog dana radi tačnog računanja roka.",
  ],
  citati: [
    { tip: "ZAKON", naslov: "Zakon o parničnom postupku", ref: "čl. 281, st. 1", skor: 0.96 },
    { tip: "ZAKON", naslov: "Zakon o parničnom postupku", ref: "čl. 291 (presuda zbog izostanka)", skor: 0.88 },
    { tip: "PRESUDA", naslov: "Vrhovni sud CG", ref: "Rev. 412/2024", skor: 0.71 },
  ],
};
const INITIAL_DOCS = [
  { id: 1, name: "Zakon o parničnom postupku.pdf", tip: "ZAKON", size: "2.4 MB", chunks: 412, date: "danas 09:14", status: "VAZECI" },
  { id: 2, name: "Presuda U. 1247-2025.pdf", tip: "PRESUDA", size: "318 KB", chunks: 47, date: "juče 16:02", status: "VAZECI" },
  { id: 3, name: "Ugovor o hostingu v1.3.docx", tip: "UGOVOR_JAVNA_NABAVKA", size: "184 KB", chunks: 31, date: "juče 11:40", status: "NACRT" },
  { id: 4, name: "Zakon o medijima.pdf", tip: "ZAKON", size: "1.1 MB", chunks: 208, date: "26. apr", status: "VAZECI" },
  { id: 5, name: "Statut RTCG.pdf", tip: "INTERNI_AKT", size: "640 KB", chunks: 96, date: "24. apr", status: "VAZECI" },
];
let UID = 1000;

function Logo({ sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg, ${ACCENT}, #8c6f2e)`, display: "grid", placeItems: "center", boxShadow: `0 0 0 1px ${BORDER}, 0 6px 18px rgba(200,162,75,.18)` }}>
        <Scale size={18} color="#0E1116" strokeWidth={2.4} />
      </div>
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontWeight: 700, letterSpacing: ".02em", fontSize: 15 }}>Pravna<span style={{ color: ACCENT }}>AI</span></div>
        <div style={{ fontSize: 10, color: MUTED, marginTop: 3, letterSpacing: ".07em" }}>{sub}</div>
      </div>
    </div>
  );
}
function TypeBadge({ tip, size = "md" }) {
  const m = TYPE_MAP[tip] || TYPE_MAP.OSTALO;
  const Icon = m.icon;
  const fs = size === "sm" ? 9.5 : 10.5;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: fs, fontWeight: 700, color: m.color, border: `1px solid ${m.color}55`, borderRadius: 6, padding: size === "sm" ? "2px 7px" : "3px 9px", letterSpacing: ".03em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      <Icon size={size === "sm" ? 11 : 12} /> {m.labela}
    </span>
  );
}
function Pipeline({ stage }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {STAGES.map((s, i) => {
        const done = stage === -1 || i < stage, active = i === stage;
        const color = done ? GREEN : active ? ACCENT : MUTED;
        return (
          <React.Fragment key={s}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%", display: "grid", placeItems: "center", border: `1.5px solid ${color}`, background: done ? GREEN : "transparent" }}>
                {done ? <Check size={10} color="#0E1116" strokeWidth={3} /> : active ? <Loader2 size={10} color={ACCENT} className="spin" /> : <span style={{ width: 4, height: 4, borderRadius: "50%", background: MUTED }} />}
              </span>
              <span style={{ fontSize: 10.5, color, fontWeight: active ? 600 : 500 }}>{s}</span>
            </div>
            {i < STAGES.length - 1 && <span style={{ width: 14, height: 1.5, background: done ? GREEN : BORDER, borderRadius: 2 }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── CHAT ─────────────────────────── */
function ChatScreen({ sidebar }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const scrollRef = useRef(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [messages, thinking]);
  const send = (t) => {
    const q = (t ?? input).trim(); if (!q) return;
    setMessages((m) => [...m, { role: "user", text: q }]); setInput(""); setThinking(true);
    setTimeout(() => { setThinking(false); setMessages((m) => [...m, { role: "ai", ...ANSWER }]); }, 1300);
  };
  const empty = messages.length === 0;
  return (
    <>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        {empty ? (
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "7vh 24px 40px" }}>
            <div style={{ animation: "fadeUp .5s ease both" }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, margin: "0 auto 22px", background: `linear-gradient(135deg, ${ACCENT}, #8c6f2e)`, display: "grid", placeItems: "center", boxShadow: "0 12px 40px rgba(200,162,75,.22)" }}>
                <Scale size={28} color="#0E1116" strokeWidth={2.2} />
              </div>
              <h1 style={{ textAlign: "center", fontSize: 30, fontWeight: 600, margin: "0 0 10px", letterSpacing: "-.01em" }}>Kako mogu pomoći pravnoj službi?</h1>
              <p className="ui-sans" style={{ textAlign: "center", color: MUTED, fontSize: 14, margin: "0 0 34px" }}>Pretraga crnogorskih zakona, presuda i internih akata RTCG — uz navođenje izvora.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 30 }}>
              {QUICK.map((a, i) => (
                <button key={i} className="ui-sans" style={{ display: "flex", alignItems: "center", gap: 13, textAlign: "left", background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "15px 16px", cursor: "pointer", color: TEXT, transition: "all .15s", animation: `fadeUp .5s ${0.05 * i + 0.1}s ease both` }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.transform = "none"; }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: PANEL2, display: "grid", placeItems: "center", flexShrink: 0 }}><a.icon size={18} color={ACCENT} /></div>
                  <div><div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.label}</div><div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{a.hint}</div></div>
                </button>
              ))}
            </div>
            <div className="ui-sans" style={{ fontSize: 11, color: MUTED, letterSpacing: ".1em", fontWeight: 600, marginBottom: 12 }}>PRIMJERI UPITA</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => send(s)} style={{ display: "flex", alignItems: "center", gap: 11, textAlign: "left", background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 11, padding: "12px 14px", cursor: "pointer", color: TEXT, fontSize: 13.5, fontFamily: "'Newsreader', serif", transition: "background .12s" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = PANEL}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <Quote size={14} color={ACCENT} style={{ flexShrink: 0, opacity: .7 }} /><span style={{ flex: 1 }}>{s}</span><ChevronRight size={15} color={MUTED} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "26px 24px 40px" }}>
            {messages.map((m, i) => m.role === "user" ? (
              <div key={i} className="msg" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 22 }}>
                <div style={{ maxWidth: "78%", background: PANEL2, border: `1px solid ${BORDER}`, padding: "12px 16px", borderRadius: "14px 14px 4px 14px", fontSize: 15, lineHeight: 1.5 }}>{m.text}</div>
              </div>
            ) : (
              <div key={i} className="msg" style={{ display: "flex", gap: 13, marginBottom: 30 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, marginTop: 2, background: `linear-gradient(135deg, ${ACCENT}, #8c6f2e)`, display: "grid", placeItems: "center" }}><Scale size={15} color="#0E1116" strokeWidth={2.4} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {m.text.map((p, j) => <p key={j} style={{ margin: "0 0 13px", fontSize: 15.5, lineHeight: 1.62 }}>{p}</p>)}
                  <div style={{ marginTop: 16 }}>
                    <div className="ui-sans" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: MUTED, letterSpacing: ".08em", fontWeight: 600, marginBottom: 9 }}><BookOpen size={13} color={ACCENT} /> IZVORI ({m.citati.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {m.citati.map((c, k) => {
                        const col = TYPE_MAP[c.tip].color;
                        return (
                          <button key={k} onClick={() => setDrawer(c)} style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", background: PANEL2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 11px", cursor: "pointer", width: "100%", transition: "border-color .15s" }}
                            onMouseEnter={(e) => e.currentTarget.style.borderColor = col}
                            onMouseLeave={(e) => e.currentTarget.style.borderColor = BORDER}>
                            <span style={{ fontSize: 9.5, fontWeight: 700, color: col, letterSpacing: ".05em", border: `1px solid ${col}55`, borderRadius: 5, padding: "2px 6px", textTransform: "uppercase" }}>{TYPE_MAP[c.tip].labela}</span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.naslov}</span>
                              <span style={{ display: "block", fontSize: 11, color: MUTED }}>{c.ref}</span>
                            </span>
                            <span style={{ fontSize: 10.5, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{Math.round(c.skor * 100)}%</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="ui-sans" style={{ marginTop: 14, fontSize: 11, color: MUTED, display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={12} color={ACCENT} /> Provjeri izvore prije upotrebe — urednički nadzor ostaje obavezan.</div>
                </div>
              </div>
            ))}
            {thinking && (
              <div className="msg" style={{ display: "flex", gap: 13 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: `linear-gradient(135deg, ${ACCENT}, #8c6f2e)`, display: "grid", placeItems: "center" }}><Scale size={15} color="#0E1116" strokeWidth={2.4} /></div>
                <div style={{ paddingTop: 6 }}>
                  <div style={{ display: "flex", gap: 5 }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: MUTED, animation: `bp 1.2s ${i * 0.18}s infinite ease-in-out` }} />)}</div>
                  <span className="ui-sans" style={{ fontSize: 12, color: MUTED }}>Pretražujem pravnu bazu…</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ padding: "0 24px 22px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 8, display: "flex", alignItems: "flex-end", gap: 8, boxShadow: "0 8px 30px rgba(0,0,0,.3)" }}>
            <button className="ui-sans" style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", padding: 9, borderRadius: 9 }} title="Priloži"><Paperclip size={18} /></button>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Postavi pravno pitanje ili zalijepi tekst dokumenta…" rows={1} style={{ flex: 1, resize: "none", background: "transparent", border: "none", outline: "none", color: TEXT, fontSize: 15, lineHeight: 1.5, fontFamily: "'Newsreader', serif", padding: "9px 4px", maxHeight: 160 }} />
            <button onClick={() => send()} disabled={!input.trim()} style={{ background: input.trim() ? `linear-gradient(135deg, ${ACCENT}, #b08c38)` : PANEL2, border: "none", borderRadius: 11, width: 40, height: 40, cursor: input.trim() ? "pointer" : "default", display: "grid", placeItems: "center", flexShrink: 0 }}><Send size={17} color={input.trim() ? "#0E1116" : MUTED} strokeWidth={2.3} /></button>
          </div>
          <div className="ui-sans" style={{ textAlign: "center", fontSize: 10.5, color: MUTED, marginTop: 9 }}>PravnaAI može pogriješiti. Odgovori nisu pravni savjet — provjeri navedene izvore.</div>
        </div>
      </div>
      {drawer && (
        <div onClick={() => setDrawer(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} className="ui-sans" style={{ width: 420, maxWidth: "92%", height: "100%", background: PANEL, borderLeft: `1px solid ${BORDER}`, padding: 24, display: "flex", flexDirection: "column", animation: "slideIn .25s ease both" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <TypeBadge tip={drawer.tip} />
                <h3 style={{ fontSize: 17, margin: "12px 0 4px", fontFamily: "'Newsreader', serif" }}>{drawer.naslov}</h3>
                <div style={{ fontSize: 13, color: MUTED }}>{drawer.ref}</div>
              </div>
              <button onClick={() => setDrawer(null)} style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ marginTop: 20, padding: 16, background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, fontFamily: "'Newsreader', serif", fontSize: 14.5, lineHeight: 1.7, flex: 1, overflowY: "auto" }}>
              <p style={{ margin: 0, color: MUTED, fontSize: 12, fontFamily: "'Geist', sans-serif", marginBottom: 10 }}>Relevantnost: {Math.round(drawer.skor * 100)}% · izvod iz baze</p>
              <p style={{ margin: "0 0 12px" }}>„Tuženom se dostavlja tužba na odgovor. U rješenju kojim se tužba dostavlja na odgovor sud će odrediti rok za podnošenje odgovora na tužbu…"</p>
              <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>— Puni tekst odredbe učitava se iz pgvector baze. Prikaz prototipa.</p>
            </div>
            <button style={{ marginTop: 16, background: PANEL2, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 11, padding: 12, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><FileText size={15} color={ACCENT} /> Otvori cijeli dokument</button>
          </div>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────── INGEST ─────────────────────────── */
function IngestScreen() {
  const [queue, setQueue] = useState([]);
  const [docs, setDocs] = useState(INITIAL_DOCS);
  const [dragging, setDragging] = useState(false);
  const [group, setGroup] = useState("all");
  const [search, setSearch] = useState("");
  const fileRef = useRef(null);
  const addFiles = useCallback((files) => {
    const items = Array.from(files).map((f) => {
      const n = f.name.toLowerCase();
      let tip = "INTERNI_AKT";
      if (n.includes("zakon")) tip = "ZAKON"; else if (n.includes("presuda") || n.startsWith("u.") || n.includes("rev")) tip = "PRESUDA"; else if (n.includes("ugovor")) tip = "UGOVOR_JAVNA_NABAVKA";
      return { id: ++UID, name: f.name, size: f.size ? `${(f.size / 1048576).toFixed(1)} MB` : "—", tip, stage: 0, chunks: 0, status: "processing" };
    });
    setQueue((q) => [...items, ...q]);
  }, []);
  useEffect(() => {
    const r = queue.find((q) => q.status === "processing"); if (!r) return;
    const t = setTimeout(() => setQueue((q) => q.map((it) => it.id !== r.id ? it : it.stage < STAGES.length - 1 ? { ...it, stage: it.stage + 1, chunks: Math.round((it.stage + 1) * (20 + Math.random() * 60)) } : { ...it, status: "done", stage: -1 })), 800);
    return () => clearTimeout(t);
  }, [queue]);
  useEffect(() => {
    const fin = queue.filter((q) => q.status === "done"); if (!fin.length) return;
    const t = setTimeout(() => { setDocs((d) => [...fin.map((f) => ({ ...f, date: "upravo", status: "VAZECI" })), ...d]); setQueue((q) => q.filter((x) => x.status !== "done")); }, 650);
    return () => clearTimeout(t);
  }, [queue]);
  const filtered = docs.filter((d) => (group === "all" || TYPE_MAP[d.tip].grupa === group) && d.name.toLowerCase().includes(search.toLowerCase()));
  const totalChunks = docs.reduce((s, d) => s + d.chunks, 0);
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "26px 24px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: MUTED, marginBottom: 18 }}><Database size={14} color={ACCENT} /> {docs.length} dok. · {totalChunks.toLocaleString("sr")} segmenata u pgvector</div>
        <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }} onClick={() => fileRef.current?.click()}
          style={{ border: `1.5px dashed ${dragging ? ACCENT : BORDER}`, background: dragging ? "rgba(200,162,75,.06)" : PANEL, borderRadius: 18, padding: "40px 24px", textAlign: "center", cursor: "pointer", transition: "all .18s" }}>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <div style={{ width: 58, height: 58, borderRadius: 16, margin: "0 auto 16px", background: dragging ? `linear-gradient(135deg, ${ACCENT}, #8c6f2e)` : PANEL2, display: "grid", placeItems: "center", transition: "background .18s" }}><UploadCloud size={29} color={dragging ? "#0E1116" : ACCENT} strokeWidth={2} /></div>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Prevuci dokumente ovdje</div>
          <p className="ui-sans" style={{ color: MUTED, fontSize: 13, margin: "0 0 4px" }}>ili klikni za odabir — zakoni, presude, ugovori, interni akti</p>
          <p className="ui-sans" style={{ color: MUTED, fontSize: 11.5, margin: 0, opacity: .7 }}>PDF · DOCX · TXT · RTF — automatska klasifikacija i OCR za skenirane</p>
        </div>

        {queue.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <div className="ui-sans" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: MUTED, letterSpacing: ".1em", fontWeight: 600, marginBottom: 12 }}><Layers size={13} color={ACCENT} /> U OBRADI ({queue.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {queue.map((it) => (
                <div key={it.id} className="row" style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: PANEL2, display: "grid", placeItems: "center", flexShrink: 0 }}>{it.status === "done" ? <Check size={18} color={GREEN} strokeWidth={2.6} /> : <ScanLine size={18} color={ACCENT} />}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ui-sans" style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                      <div className="ui-sans" style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{it.size}{it.chunks > 0 && ` · ${it.chunks} segmenata`}</div>
                    </div>
                    <select value={it.tip} onChange={(e) => setQueue((q) => q.map((x) => x.id === it.id ? { ...x, tip: e.target.value } : x))} onClick={(e) => e.stopPropagation()} className="ui-sans"
                      style={{ background: PANEL2, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 9px", fontSize: 12, cursor: "pointer", outline: "none" }}>
                      {Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.labela}</option>)}
                    </select>
                    <button onClick={(e) => { e.stopPropagation(); setQueue((q) => q.filter((x) => x.id !== it.id)); }} style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", padding: 6 }}><X size={17} /></button>
                  </div>
                  <div style={{ marginTop: 13, paddingTop: 12, borderTop: `1px solid ${BORDER}` }} className="ui-sans"><Pipeline stage={it.stage} /></div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <div className="ui-sans" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: MUTED, letterSpacing: ".1em", fontWeight: 600 }}><Database size={13} color={ACCENT} /> INDEKSIRANO U BAZI</div>
            <div className="ui-sans" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "7px 11px" }}>
              <Search size={14} color={MUTED} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pretraži…" style={{ background: "transparent", border: "none", outline: "none", color: TEXT, fontSize: 13, width: 130, fontFamily: "'Geist', sans-serif" }} />
            </div>
          </div>
          <div className="ui-sans" style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {[{ key: "all", labela: "Sve", color: ACCENT, icon: Filter }, ...GROUPS].map((g) => {
              const sel = group === g.key; const Icon = g.icon;
              return <button key={g.key} onClick={() => setGroup(g.key)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "7px 12px", borderRadius: 20, background: sel ? `${g.color}1f` : PANEL, color: sel ? g.color : MUTED, border: `1px solid ${sel ? g.color : BORDER}`, transition: "all .12s" }}><Icon size={13} /> {g.labela}</button>;
            })}
          </div>
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
            {filtered.length === 0 ? (
              <div className="ui-sans" style={{ padding: "40px 20px", textAlign: "center", color: MUTED, fontSize: 13 }}><FileSearch size={26} color={MUTED} style={{ marginBottom: 10, opacity: .6 }} /><div>Nema dokumenata za zadati filter.</div></div>
            ) : filtered.map((d, i) => (
              <div key={d.id} className="row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: i < filtered.length - 1 ? `1px solid ${BORDER}` : "none" }}
                onMouseEnter={(e) => e.currentTarget.style.background = PANEL2} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: PANEL2, display: "grid", placeItems: "center", flexShrink: 0 }}><FileText size={16} color={MUTED} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ui-sans" style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
                  <div className="ui-sans" style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{d.size} · {d.chunks} segmenata · {d.date}</div>
                </div>
                {d.status === "NACRT" && <span className="ui-sans" style={{ fontSize: 9.5, fontWeight: 700, color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 5, padding: "2px 6px" }}>NACRT</span>}
                <TypeBadge tip={d.tip} size="sm" />
                <span className="ui-sans" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: GREEN, fontWeight: 600 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: GREEN }} /> indeksirano</span>
                <button onClick={() => setDocs((dd) => dd.filter((x) => x.id !== d.id))} style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", padding: 6 }} onMouseEnter={(e) => e.currentTarget.style.color = RED} onMouseLeave={(e) => e.currentTarget.style.color = MUTED}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </section>
        <div className="ui-sans" style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 11, color: MUTED }}><Sparkles size={12} color={ACCENT} /> Embeddings se čuvaju u pgvector na infrastrukturi RTCG</div>
      </div>
    </div>
  );
}

/* ─────────────────────────── APP SHELL ─────────────────────────── */
export default function App() {
  const [sidebar, setSidebar] = useState(true);
  const [screen, setScreen] = useState("chat"); // chat | ingest
  return (
    <div style={{ height: "100vh", width: "100%", display: "flex", background: BG, color: TEXT, overflow: "hidden", fontFamily: "'Newsreader', Georgia, serif", WebkitFontSmoothing: "antialiased", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&family=Geist:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 9px; height: 9px; }
        ::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: 6px; }
        @keyframes bp { 0%,80%,100% { transform: scale(.5); opacity:.4 } 40% { transform: scale(1); opacity:1 } }
        @keyframes fadeUp { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform:none } }
        @keyframes slideIn { from { transform: translateX(30px); opacity:.6 } to { transform:none; opacity:1 } }
        @keyframes spin { to { transform: rotate(360deg) } }
        .spin { animation: spin 1s linear infinite; }
        .msg { animation: fadeUp .35s ease both; }
        .row { animation: fadeUp .3s ease both; }
        .ui-sans { font-family: 'Geist', system-ui, sans-serif; }
        select option { background: ${PANEL}; }
      `}</style>

      {/* SIDEBAR */}
      <aside className="ui-sans" style={{ width: sidebar ? 268 : 0, flexShrink: 0, background: PANEL, borderRight: `1px solid ${BORDER}`, transition: "width .22s ease", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 16px 14px" }}><Logo sub="RTCG · PRAVNA SLUŽBA" /></div>
        {/* nav */}
        <div style={{ padding: "0 10px 6px" }}>
          {[{ k: "chat", icon: MessageSquare, l: "Pravni upiti" }, { k: "ingest", icon: UploadCloud, l: "Unos dokumenata" }].map((n) => {
            const sel = screen === n.k;
            return (
              <button key={n.k} onClick={() => setScreen(n.k)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: sel ? PANEL2 : "transparent", border: `1px solid ${sel ? BORDER : "transparent"}`, color: sel ? TEXT : MUTED, padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 4, transition: "all .12s" }}>
                <n.icon size={16} color={sel ? ACCENT : MUTED} /> {n.l}
              </button>
            );
          })}
        </div>
        <div style={{ height: 1, background: BORDER, margin: "8px 14px 12px" }} />
        {screen === "chat" && (
          <>
            <div style={{ padding: "0 14px 12px" }}>
              <button style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, background: PANEL2, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 11, padding: "11px 13px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}><Plus size={16} color={ACCENT} /> Novi upit</button>
            </div>
            <div style={{ padding: "0 18px", fontSize: 10.5, color: MUTED, letterSpacing: ".1em", fontWeight: 600, marginBottom: 8 }}>ISTORIJA</div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 10px" }}>
              {HISTORY.map((h, i) => (
                <button key={i} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, background: "transparent", border: "none", color: TEXT, padding: "9px 8px", borderRadius: 9, cursor: "pointer", textAlign: "left", fontSize: 12.5, transition: "background .12s" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = PANEL2} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <Clock size={13} color={MUTED} style={{ flexShrink: 0 }} /><span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.t}</span><span style={{ fontSize: 10.5, color: MUTED }}>{h.d}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {screen === "ingest" && <div style={{ flex: 1 }} />}
        <div style={{ padding: 14, borderTop: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", background: PANEL2, borderRadius: 10, fontSize: 11.5, color: MUTED }}><ShieldCheck size={15} color={ACCENT} /><span>Podaci ostaju na infrastrukturi RTCG</span></div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header className="ui-sans" style={{ height: 56, flexShrink: 0, borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 12, padding: "0 16px" }}>
          <button onClick={() => setSidebar((s) => !s)} style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", display: "grid", placeItems: "center", padding: 6, borderRadius: 8 }}>{sidebar ? <PanelLeftClose size={19} /> : <PanelLeft size={19} />}</button>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{screen === "chat" ? "Pravni upiti" : "Unos dokumenata"}</div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: MUTED, background: PANEL, border: `1px solid ${BORDER}`, padding: "5px 10px", borderRadius: 20 }}><Sparkles size={13} color={ACCENT} /> Claude Sonnet · CG pravna baza</div>
        </header>
        {screen === "chat" ? <ChatScreen sidebar={sidebar} /> : <IngestScreen />}
      </main>
    </div>
  );
}
