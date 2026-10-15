import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { ObligationView } from "@/server/obligations/read";

import { ObligationsList } from "./obligations-list";

/** The list links to the detail page, so it renders inside a router with a memory history. */
const renderInRouter = async (element: ReactElement) => {
  const Page = () => element;
  const router = createRouter({
    routeTree: createRootRoute({ component: Page }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  // The router renders the route after it loads.
  await screen.findByRole("list");
};

const fine: ObligationView = {
  id: "0199c0a4-0000-7000-8000-000000000001",
  kind: "fine",
  number: "F-1",
  status: "pending",
  amountInCents: 1_000_000,
  discountInCents: 0,
  issuedAt: new Date("2026-10-01T15:00:00Z"),
  dueOn: "2026-09-30",
  entityName: "ITTB",
  description: "C02 Parked in a no-parking zone",
  amountDueInCents: 1_000_000,
  state: "overdue",
  agreement: null,
};

describe(ObligationsList, () => {
  afterEach(cleanup);

  it("shows the description, the amount due, and the state of each obligation", async () => {
    await renderInRouter(<ObligationsList items={[fine]} />);

    expect(
      screen.getAllByText("C02 Parked in a no-parking zone").length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/10\.000/u).length).toBeGreaterThan(0);
  });

  it("shows the installments summary of an agreement", async () => {
    await renderInRouter(
      <ObligationsList
        items={[
          {
            ...fine,
            status: "in_agreement",
            state: "in_agreement",
            agreement: { installmentCount: 3, paidCount: 1 },
          },
        ]}
      />
    );

    expect(
      screen.getAllByText("1 of 3 installments paid").length
    ).toBeGreaterThan(0);
  });
});
