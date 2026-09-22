import { NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";

const NAV = [
  {
    path: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    path: "/customers",
    label: "Customers",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M1 13c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M11 7.5c1.381 0 2.5 1.119 2.5 2.5v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="11" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    path: "/products",
    label: "Products",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 4.5h12M2 4.5l1.5 8h9L14 4.5M2 4.5L3.5 2h9L14 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M6 8v3M10 8v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    path: "/import",
    label: "Import",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1v9M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    path: "/campaigns",
    label: "Campaigns",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 5h12M2 8h8M2 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    path: "/settings",
    label: "Settings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const { user, canEditCampaigns, signOut } = useAuth();
  const nav = NAV.filter((item) => canEditCampaigns || (item.path !== "/import" && item.path !== "/campaigns"));

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--color-ground)", fontFamily: "var(--font-sans)" }}>
      {/* Sidebar */}
      <aside
        className="w-56 flex flex-col shrink-0 sticky top-0 h-screen"
        style={{
          backgroundColor: "var(--color-surface)",
          borderRight: "1px solid var(--color-rule)",
        }}
      >
        {/* Logo */}
        <div className="px-5 h-14 flex items-center gap-2.5" style={{ borderBottom: "1px solid var(--color-rule)" }}>
          <div
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
            style={{ backgroundColor: "var(--color-ink)" }}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="3.5" fill="white" />
              <circle cx="10" cy="10" r="7" stroke="white" strokeWidth="1.5" fill="none" opacity="0.4" />
              <circle cx="10" cy="10" r="9.5" stroke="white" strokeWidth="1" fill="none" opacity="0.2" />
            </svg>
          </div>
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-ink)" }}
          >
            CDP Platform
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-100"
              style={({ isActive }) => ({
                backgroundColor: isActive ? "var(--color-ground)" : "transparent",
                color: isActive ? "var(--color-ink)" : "var(--color-ink-2)",
              })}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLAnchorElement;
                if (!el.classList.contains("active")) {
                  el.style.backgroundColor = "var(--color-ground)";
                  el.style.color = "var(--color-ink)";
                }
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLAnchorElement;
                if (!el.getAttribute("aria-current")) {
                  el.style.backgroundColor = "";
                  el.style.color = "";
                }
              }}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer: signed-in user + Sign out */}
        <div className="px-3 py-4 space-y-2" style={{ borderTop: "1px solid var(--color-rule)" }}>
          {user && (
            <div className="flex items-center gap-2.5 px-1.5">
              {user.picture ? (
                <img src={user.picture} alt="" className="w-7 h-7 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
              ) : (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                  style={{ backgroundColor: "var(--color-ink)", color: "#fff" }}
                >
                  {user.name?.[0] ?? "U"}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: "var(--color-ink)" }}>{user.name}</p>
                <p className="text-xs truncate" style={{ color: "var(--color-ink-3)" }}>{user.email}</p>
              </div>
            </div>
          )}
          <button
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-100"
            style={{ color: "var(--color-ink-3)", cursor: "pointer", background: "none", border: "none" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink)";
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--color-ground)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-3)";
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
            }}
            onClick={() => { signOut(); navigate("/"); }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Page content */}
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
