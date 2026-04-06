import { Outlet, NavLink } from "react-router-dom";

// Provides the shared shell and navigation for the tournament prototype.
export function AppShell() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#23513f,_#0a1712_55%)] text-zinc-100">
      <header className="border-b border-white/10 bg-black/15 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-emerald-300/70">
              Texas Holdem
            </p>
            <h1 className="text-xl font-semibold text-white">Single-Table Tournament MVP</h1>
          </div>
          <nav className="flex gap-2 text-sm">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${
                  isActive ? "bg-emerald-400 text-black" : "bg-white/5 text-zinc-200 hover:bg-white/10"
                }`
              }
            >
              Lobby
            </NavLink>
            <NavLink
              to="/tournaments/DEMO1"
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${
                  isActive ? "bg-emerald-400 text-black" : "bg-white/5 text-zinc-200 hover:bg-white/10"
                }`
              }
            >
              Tournament
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
