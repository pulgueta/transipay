import type { CreatePayoutTransaction } from "@pulgueta/wompi/schemas";

import type {
  BankAccountType,
  HolderLegalIdType,
} from "@/server/db/schema/entities";

export interface PayoutBankAccount {
  bankId: string;
  accountType: BankAccountType;
  accountNumber: string;
  holderName: string;
  holderLegalIdType: HolderLegalIdType;
  holderLegalId: string;
}

/** Makes the Wompi payout transaction that pays an entity bank account. Amounts are in cents. */
export const buildPayoutTransaction = (
  account: PayoutBankAccount,
  { email, amountInCents }: { email: string; amountInCents: number }
): CreatePayoutTransaction => ({
  // A NIT identifies a company (persona juridica). The other id types identify a person.
  personType: account.holderLegalIdType === "NIT" ? "JURIDICA" : "NATURAL",
  legalIdType: account.holderLegalIdType,
  legalId: account.holderLegalId,
  bankId: account.bankId,
  accountType: account.accountType,
  accountNumber: account.accountNumber,
  name: account.holderName,
  email,
  amount: amountInCents,
});
