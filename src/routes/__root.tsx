import { TanStackDevtools } from "@tanstack/react-devtools";
import { formDevtoolsPlugin } from "@tanstack/react-form-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { tableDevtoolsPlugin } from "@tanstack/react-table-devtools";
import type { ReactNode } from "react";

import { AppFooter } from "@/components/shell/app-footer";
import { AppHeader } from "@/components/shell/app-header";
import { THEME_SCRIPT } from "@/components/shell/theme";
import { getSessionFn } from "@/server/session";

import appCss from "../styles.css?url";

interface RouterContext {
  queryClient: QueryClient;
}

const RootDocument = ({ children }: { children: ReactNode }) => (
  // The head script sets the `dark` class before React hydrates, so the class differs from the server HTML.
  <html lang="es-CO" suppressHydrationWarning>
    <head>
      <HeadContent />
    </head>
    <body>
      {children}
      {/* The devtools Vite plugin removes this element from production builds. */}
      <TanStackDevtools
        config={{ position: "bottom-right" }}
        plugins={[
          { name: "TanStack Router", render: <TanStackRouterDevtoolsPanel /> },
          { name: "TanStack Query", render: <ReactQueryDevtoolsPanel /> },
          formDevtoolsPlugin(),
          tableDevtoolsPlugin(),
        ]}
      />
      <Scripts />
    </body>
  </html>
);

/** Header, page content, and footer. The not-found and error pages render inside it too. */
const RootLayout = () => {
  const { session } = Route.useRouteContext();

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader session={session} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <AppFooter />
    </div>
  );
};

export const Route = createRootRouteWithContext<RouterContext>()({
  // Every route reads `context.session`. It is null when the user is signed out.
  // Guards use it for navigation only. A server function checks the session again.
  beforeLoad: async () => ({ session: await getSessionFn() }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Transipay" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
    ],
    scripts: [{ children: THEME_SCRIPT }],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
});
