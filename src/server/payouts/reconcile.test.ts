import type {
  PayoutPage,
  PayoutTransaction,
  Result,
  WompiErrorResult,
} from "@pulgueta/wompi/schemas";
import {
  WompiNotFoundError,
  WompiPayoutApiError,
  WompiRequestError,
} from "@pulgueta/wompi/schemas";
import { describe, expect, it } from "vitest";

import { decideReconcile, readLookup } from "./reconcile";

const page = (
  records: PayoutTransaction[]
): Result<PayoutPage<PayoutTransaction>> => [null, { records }];

const failure = (
  error: WompiErrorResult
): Result<PayoutPage<PayoutTransaction>> => [error, null];

describe(readLookup, () => {
  it("is not found for an empty answer", () => {
    expect(readLookup(page([]))).toStrictEqual({ kind: "not_found" });
  });

  it.each([
    [
      "a payouts API 404",
      new WompiPayoutApiError(404, { code: "X", message: "X" }),
    ],
    [
      "a not-found error",
      new WompiNotFoundError({
        error: { type: "NOT_FOUND_ERROR", reason: "x" },
      }),
    ],
  ])("is not found for %s", (_name, error) => {
    expect(readLookup(failure(error))).toStrictEqual({ kind: "not_found" });
  });

  it.each([
    ["a timeout", new WompiRequestError(408, {})],
    ["a server error", new WompiRequestError(500, {})],
    ["a network error", new WompiRequestError(0, "Network error")],
  ])("is unavailable for %s", (_name, error) => {
    expect(readLookup(failure(error))).toStrictEqual({ kind: "unavailable" });
  });

  it("gives the status and the payout id of the transaction", () => {
    expect(
      readLookup(
        page([
          {
            id: "tx_1",
            status: "APPROVED",
            payout: { id: "po_1", status: "TOTAL_PAYMENT" },
          },
        ])
      )
    ).toStrictEqual({
      kind: "found",
      status: "paid",
      providerPayoutId: "po_1",
    });
  });

  it("prefers paid, then submitted, when more than one transaction has the reference", () => {
    expect(
      readLookup(
        page([
          { id: "tx_1", status: "FAILED" },
          { id: "tx_2", status: "PROCESSING" },
        ])
      )
    ).toStrictEqual({
      kind: "found",
      status: "submitted",
      providerPayoutId: null,
    });
  });

  it("is unavailable when no status is documented", () => {
    expect(
      readLookup(page([{ id: "tx_1", status: "SOMETHING_NEW" }]))
    ).toStrictEqual({ kind: "unavailable" });
  });
});

const now = new Date("2026-10-09T12:00:00Z");
const before = new Date("2026-10-09T13:00:00Z");
const after = new Date("2026-10-09T11:00:00Z");

describe(decideReconcile, () => {
  it("applies the status that Wompi has", () => {
    expect(
      decideReconcile({
        status: "uncertain",
        lookup: { kind: "found", status: "paid", providerPayoutId: "po_1" },
        now,
        retryDeadline: after,
      })
    ).toStrictEqual({ kind: "apply", status: "paid" });
  });

  it("keeps a payout when the found status is the same", () => {
    expect(
      decideReconcile({
        status: "submitted",
        lookup: { kind: "found", status: "submitted", providerPayoutId: null },
        now,
        retryDeadline: after,
      })
    ).toStrictEqual({ kind: "keep" });
  });

  it("lets an uncertain payout go again before the retry deadline when Wompi has no transaction", () => {
    expect(
      decideReconcile({
        status: "uncertain",
        lookup: { kind: "not_found" },
        now,
        retryDeadline: before,
      })
    ).toStrictEqual({ kind: "requeue" });
  });

  it("flags an uncertain payout for staff after the retry deadline when Wompi has no transaction", () => {
    expect(
      decideReconcile({
        status: "uncertain",
        lookup: { kind: "not_found" },
        now,
        retryDeadline: after,
      })
    ).toStrictEqual({ kind: "review" });
  });

  it("flags a payout without a retry deadline for staff", () => {
    expect(
      decideReconcile({
        status: "uncertain",
        lookup: { kind: "not_found" },
        now,
        retryDeadline: null,
      })
    ).toStrictEqual({ kind: "review" });
  });

  it("keeps a submitted payout when Wompi has no transaction, because Wompi accepted it", () => {
    expect(
      decideReconcile({
        status: "submitted",
        lookup: { kind: "not_found" },
        now,
        retryDeadline: before,
      })
    ).toStrictEqual({ kind: "keep" });
  });

  it("keeps the payout when the lookup fails", () => {
    expect(
      decideReconcile({
        status: "uncertain",
        lookup: { kind: "unavailable" },
        now,
        retryDeadline: before,
      })
    ).toStrictEqual({ kind: "keep" });
  });
});
