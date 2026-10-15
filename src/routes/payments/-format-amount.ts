/** Formats an amount in cents. It shows cents only when the amount has cents, so no value is rounded. */
export const formatAmount = (amountInCents: number, currency: string) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: amountInCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountInCents / 100);
