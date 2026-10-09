import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** Public variables. Vite puts them in the browser bundle, so they must not contain secrets. */
export const clientEnv = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_WOMPI_PUBLIC_KEY: z.string().min(1),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
