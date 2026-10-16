import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";

const FOOTER_LINKS: { to: LinkProps["to"]; label: string }[] = [
  { to: "/", label: "Inicio" },
  { to: "/obligations", label: "Obligaciones" },
  { to: "/appointments", label: "Citas" },
  { to: "/courses", label: "Cursos" },
  { to: "/account", label: "Mi cuenta" },
];

export const AppFooter = () => (
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
