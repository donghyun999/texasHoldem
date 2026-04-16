import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { HomePage } from "@/pages/HomePage";

const TablePage = lazy(() => import("@/pages/TablePage").then((module) => ({ default: module.TablePage })));

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
          <Suspense fallback={null}>
            <TablePage />
          </Suspense>
        ),
      },
    ],
  },
]);
