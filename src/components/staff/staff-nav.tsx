import { Link } from "@tanstack/react-router";

import type { StaffSection } from "./sections";

/** The sections of the staff area: a sidebar on desktop, a row of tabs on a small screen. */
export const StaffNav = ({ sections }: { sections: StaffSection[] }) => (
  <>
    <nav
      aria-label="Staff sections"
      className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 md:hidden"
    >
      {sections.map((section) => (
        <Link
          className="text-muted-foreground hover:text-foreground data-[status=active]:border-foreground data-[status=active]:text-foreground -mb-px flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2 py-2 text-sm font-medium transition-colors"
          key={section.to}
          to={section.to}
        >
          <section.icon aria-hidden className="size-4" strokeWidth={1.75} />
          {section.label}
        </Link>
      ))}
    </nav>
    <nav
      aria-label="Staff sections"
      className="hidden w-48 shrink-0 flex-col gap-0.5 md:flex"
    >
      {sections.map((section) => (
        <Link
          className="text-muted-foreground hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors"
          key={section.to}
          to={section.to}
        >
          <section.icon aria-hidden className="size-4" strokeWidth={1.75} />
          {section.label}
        </Link>
      ))}
    </nav>
  </>
);
