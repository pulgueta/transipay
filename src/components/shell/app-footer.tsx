import { Link } from "@tanstack/react-router";

import { PATHS } from "@/lib/paths";

const FOOTER_LINKS: { to: string; label: string }[] = [
  { to: "/", label: "Home" },
  { to: PATHS.obligations, label: "Obligations" },
  { to: PATHS.appointments, label: "Appointments" },
  { to: PATHS.courses, label: "Courses" },
  { to: "/account", label: "Account" },
];

export const AppFooter = () => (
  <footer className="border-t">
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-start md:justify-between">
      <div className="flex max-w-md flex-col gap-1">
        <p className="font-semibold tracking-tight">Transipay</p>
        <p className="text-muted-foreground text-sm">
          Inspeccion de Transito y Transporte de Barrancabermeja (ITTB)
        </p>
        <p className="text-muted-foreground text-sm">
          Transipay does not replace RUNT or SIMIT. Wompi processes the
          payments.
        </p>
      </div>
      <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
        {FOOTER_LINKS.map((link) => (
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
