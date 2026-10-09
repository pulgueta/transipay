import "@tanstack/react-start/server-only";
import { WompiClient, WompiPayoutsClient } from "@pulgueta/wompi";

import { serverEnv } from "@/env/server";

let wompi: WompiClient | undefined;
let wompiPayouts: WompiPayoutsClient | undefined;

/** Payments client. Every method returns `[error, data]` and does not throw. */
export const getWompi = () => {
  wompi ??= new WompiClient({
    publicKey: serverEnv.WOMPI_PUBLIC_KEY,
    privateKey: serverEnv.WOMPI_PRIVATE_KEY,
    sandbox: serverEnv.WOMPI_SANDBOX,
  });
  return wompi;
};

/** Payouts (dispersions) client. It uses a different API host and different keys. */
export const getWompiPayouts = () => {
  wompiPayouts ??= new WompiPayoutsClient({
    apiKey: serverEnv.WOMPI_PAYOUTS_API_KEY,
    userPrincipalId: serverEnv.WOMPI_PAYOUTS_USER_PRINCIPAL_ID,
    sandbox: serverEnv.WOMPI_SANDBOX,
  });
  return wompiPayouts;
};
