import { CreatePayoutTransactionSchema } from "@pulgueta/wompi/schemas";
import { describe, expect, it } from "vitest";

import { buildPayoutTransaction } from "./build-transaction";
import type { PayoutBankAccount } from "./build-transaction";

const account: PayoutBankAccount = {
  bankId: "1007",
  accountType: "CORRIENTE",
  accountNumber: "123456789",
  holderName: "CDA Barrancabermeja SAS",
  holderLegalIdType: "NIT",
  holderLegalId: "900123456",
};

describe(buildPayoutTransaction, () => {
  it("builds a bank transaction for the account holder", () => {
    expect(
      buildPayoutTransaction(account, {
        email: "pagos@cda.example.com",
        amountInCents: 125_000_000,
      })
    ).toStrictEqual({
      personType: "JURIDICA",
      legalIdType: "NIT",
      legalId: "900123456",
      bankId: "1007",
      accountType: "CORRIENTE",
      accountNumber: "123456789",
      name: "CDA Barrancabermeja SAS",
      email: "pagos@cda.example.com",
      amount: 125_000_000,
    });
  });

  it("uses a natural person type for a personal legal id", () => {
    expect(
      buildPayoutTransaction(
        { ...account, holderLegalIdType: "CC", holderLegalId: "1096000000" },
        { email: "titular@example.com", amountInCents: 100 }
      ).personType
    ).toBe("NATURAL");
  });

  it("matches the Wompi payout transaction schema", () => {
    const result = CreatePayoutTransactionSchema.safeParse(
      buildPayoutTransaction(account, {
        email: "pagos@cda.example.com",
        amountInCents: 100,
      })
    );

    expect(result.success).toBeTruthy();
  });
});
