import { Link } from "@tanstack/react-router";

import type { AppSession } from "@/lib/auth/guards";

import { footerLinksFor } from "./nav-links";

export const AppFooter = ({ session }: { session: AppSession | null }) => (
  <footer className="border-t">
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-start md:justify-between">
      <div className="flex max-w-md flex-col gap-1">
        <p className="font-semibold tracking-tight">Transipay</p>
        <p className="text-muted-foreground text-sm">
          Inspección de Tránsito y Transporte de Barrancabermeja (ITTB)
        </p>
        <p className="text-muted-foreground text-sm">
          Transipay no reemplaza al RUNT ni al SIMIT. Wompi procesa los pagos.
        </p>
      </div>
      <nav
        aria-label="Pie de página"
        className="flex flex-wrap gap-x-6 gap-y-2"
      >
        {footerLinksFor(session).map((link) => (
          <Link
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            key={link.to}
            to={link.to}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  </footer>
);
