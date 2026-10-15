import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description: string;
  /** Buttons on the right of the title. */
  actions?: ReactNode;
}

export const PageHeader = ({
  title,
  description,
  actions,
}: PageHeaderProps) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
    {actions === undefined ? null : (
      <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
    )}
  </div>
);
