import { createBrowserRouter } from "react-router";
import { globTree } from "virtual:afilmory-routes";

import App from "./App";
import { ErrorElement } from "./components/common/ErrorElement";
import { NotFound } from "./components/common/NotFound";
import { buildGlobRoutes } from "./lib/route-builder";
import type { AppRuntime } from "./runtime/app-runtime";

const tree = buildGlobRoutes(globTree);

// Vite injects the configured `base` here; strip the trailing slash for React Router.
const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export const createAppRouter = (runtime: AppRuntime) => {
  const router = createBrowserRouter(
    [
      {
        path: "/",
        element: <App runtime={runtime} />,
        children: tree,
        errorElement: <ErrorElement />,
        hydrateFallbackElement: <></>,
      },
      {
        path: "*",
        element: <NotFound />,
      },
    ],
    { basename },
  );

  runtime.navigation.bind(router);
  return router;
};
