import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { HomePage } from "@/pages/HomePage";

const TablePage = lazy(() => import("@/pages/TablePage").then((module) => ({ default: module.TablePage })));

function TablePageFallback() {
  return (
    <section className="social-surface social-surface-strong rounded-[2rem] p-6 text-center text-zinc-100 shadow-2xl shadow-black/20">
      <p className="text-sm font-semibold tracking-[0.12em] text-cyan-100/70">테이블 입장 중</p>
      <p className="mt-3 text-base text-zinc-200">좌석 정보와 액션 상태를 불러오고 있습니다.</p>
    </section>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: "tournaments/:tournamentCode",
        element: (
          <Suspense fallback={<TablePageFallback />}>
            <TablePage />
          </Suspense>
        ),
      },
    ],
  },
]);
