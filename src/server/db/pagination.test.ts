import { describe, expect, it } from "vitest";

import { pageInputSchema, toPage } from "./pagination";

const ids = [
  "019a1b2c-0000-7000-8000-000000000005",
  "019a1b2c-0000-7000-8000-000000000004",
  "019a1b2c-0000-7000-8000-000000000003",
  "019a1b2c-0000-7000-8000-000000000002",
];

const rows = ids.map((id) => ({ id }));

describe("page input validation", () => {
  it("uses a limit of 20 and no cursor by default", () => {
    expect(pageInputSchema.parse({})).toStrictEqual({ limit: 20 });
  });

  it("accepts a UUID cursor", () => {
    expect(pageInputSchema.parse({ cursor: ids[0], limit: 5 })).toStrictEqual({
      cursor: ids[0],
      limit: 5,
    });
  });

  it("rejects a cursor that is not a UUID", () => {
    expect(pageInputSchema.safeParse({ cursor: "abc" }).success).toBeFalsy();
  });

  it.each([0, 101, 1.5])("rejects the limit %s", (limit) => {
    expect(pageInputSchema.safeParse({ limit }).success).toBeFalsy();
  });
});

describe(toPage, () => {
  it("returns the last item id as the cursor when more rows exist", () => {
    // The query reads limit + 1 rows. The extra row shows that a next page exists.
    const page = toPage(rows.slice(0, 3), 2);

    expect(page.items).toStrictEqual(rows.slice(0, 2));
    expect(page.nextCursor).toBe(ids[1]);
  });

  it("returns a null cursor on the last page", () => {
    const page = toPage(rows.slice(0, 2), 2);

    expect(page.items).toStrictEqual(rows.slice(0, 2));
    expect(page.nextCursor).toBeNull();
  });

  it("returns an empty page when there are no rows", () => {
    expect(toPage([], 20)).toStrictEqual({ items: [], nextCursor: null });
  });
});
