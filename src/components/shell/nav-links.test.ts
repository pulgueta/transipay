import { describe, expect, it } from "vitest";

import { navLinksFor } from "./nav-links";

const labels = (role: string | null) =>
  navLinksFor({ user: { role } }).map((link) => link.label);

describe(navLinksFor, () => {
  it("shows no links before sign-in", () => {
    expect(navLinksFor(null)).toStrictEqual([]);
  });

  it("shows the Staff link to a role that can open a staff section", () => {
    expect(labels("scheduler")).toStrictEqual([
      "Obligaciones",
      "Citas",
      "Cursos",
      "Funcionarios",
    ]);
  });

  it("does not show the Staff link to a role with no staff section", () => {
    expect(labels("cashier")).toStrictEqual([
      "Obligaciones",
      "Citas",
      "Cursos",
    ]);
    expect(labels("citizen")).not.toContain("Funcionarios");
  });
});
