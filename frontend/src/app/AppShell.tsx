import { useLayoutEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

export function AppShell() {
  const location = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  return (
    <div className="social-shell min-h-screen text-zinc-100">
      <div className="absolute inset-x-0 top-0 h-64 bg-[linear-gradient(180deg,_rgba(93,228,209,0.1),_rgba(243,194,77,0.04)_45%,_transparent)]" />
      <header className="relative z-10 border-b border-white/10 bg-[linear-gradient(180deg,_rgba(7,12,10,0.82),_rgba(7,12,10,0.58))] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="social-chip flex h-12 w-12 items-center justify-center border-white/15 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_rgba(93,228,209,0.18)_42%,_rgba(14,34,28,0.96))] text-sm font-black text-white shadow-lg shadow-black/20">
              W
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">텍사스 홀덤 MVP</h1>
            </div>
          </div>

          <nav className="flex flex-wrap gap-2 text-sm">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${
                  isActive ? "social-cta" : "social-chip text-zinc-100 hover:bg-white/10"
                }`
              }
            >
              로비
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
