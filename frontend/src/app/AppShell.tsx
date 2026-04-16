import { NavLink, Outlet } from "react-router-dom";

export function AppShell() {
  return (
    <div className="social-shell min-h-screen text-zinc-100">
      <div className="absolute inset-x-0 top-0 h-56 bg-[linear-gradient(180deg,_rgba(103,232,249,0.08),_transparent)]" />
      <header className="relative z-10 border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="social-chip flex h-12 w-12 items-center justify-center border-white/15 bg-[linear-gradient(135deg,_rgba(103,232,249,0.24),_rgba(250,204,21,0.18))] text-sm font-black text-white shadow-lg shadow-black/20">
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
