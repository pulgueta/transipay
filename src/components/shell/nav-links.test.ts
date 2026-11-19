import { describe, expect, it } from "vitest";

import { footerLinksFor, navLinksFor } from "./nav-links";

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
    expect(labels("cashier")).not.toContain("Funcionarios");
    expect(labels("citizen")).not.toContain("Funcionarios");
  });

  it("shows the citizen pages to a citizen", () => {
    expect(labels("citizen")).toStrictEqual([
      "Obligaciones",
      "Citas",
      "Cursos",
    ]);
  });

  it("does not show a page that the role cannot read", () => {
    // A cashier can read appointments but has no course permission.
    expect(labels("cashier")).toStrictEqual(["Obligaciones", "Citas"]);
  });
});

const footerLabels = (session: { user: { role: string | null } } | null) =>
  footerLinksFor(session).map((link) => link.label);

describe(footerLinksFor, () => {
  it("shows every public page before sign-in", () => {
    expect(footerLabels(null)).toStrictEqual([
      "Inicio",
      "Obligaciones",
      "Citas",
      "Cursos",
      "Mi cuenta",
    ]);
  });

  it("does not show a page that the role cannot read", () => {
    expect(footerLabels({ user: { role: "cashier" } })).toStrictEqual([
      "Inicio",
      "Obligaciones",
      "Citas",
      "Mi cuenta",
    ]);
  });
});
