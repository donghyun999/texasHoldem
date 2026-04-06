import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { HomePage } from "@/pages/HomePage";
import { TablePage } from "@/pages/TablePage";

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
        element: <TablePage />,
      },
      {
        path: "table/:roomCode",
        element: <TablePage />,
      },
    ],
  },
]);
