import { NavLink, Outlet } from "react-router-dom";
import { MessageSquare, FolderOpen } from "lucide-react";
import { Logo } from "./Logo.js";

interface NavItem {
  to: string;
  ikona: typeof MessageSquare;
  oznaka: string;
}

const NAV: NavItem[] = [
  { to: "/", ikona: MessageSquare, oznaka: "Razgovor" },
  { to: "/dokumenti", ikona: FolderOpen, oznaka: "Dokumenti" },
];

/**
 * Glavni layout — header sa logom i nav-om, ispod njega `<Outlet />` za
 * sadržaj rute. Tekst u header-u nasljeđuje stari layout iz Chat ekrana.
 */
export function AppLayout() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg)",
      }}
    >
      <header
        style={{
          padding: "14px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 32,
          background: "var(--panel)",
        }}
      >
        <Logo />
        <nav style={{ display: "flex", gap: 4 }}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className="ui-sans"
              style={({ isActive }) => ({
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 13px",
                borderRadius: "var(--r-button)",
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
                color: isActive ? "var(--text)" : "var(--muted)",
                background: isActive ? "var(--panel-2)" : "transparent",
                border: `1px solid ${isActive ? "var(--border)" : "transparent"}`,
                transition:
                  "background var(--t-fast), color var(--t-fast), border-color var(--t-fast)",
              })}
            >
              <item.ikona size={14} />
              {item.oznaka}
            </NavLink>
          ))}
        </nav>
        <span
          className="ui-sans"
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "var(--muted)",
            letterSpacing: ".05em",
          }}
        >
          Infrastruktura RTCG · podaci ne napuštaju mrežu
        </span>
      </header>

      <Outlet />
    </div>
  );
}
