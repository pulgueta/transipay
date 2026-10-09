import { z } from "zod";

const messageErrorSchema = z.object({ message: z.string() });

export const normalizeFieldErrors = (
  errors: readonly unknown[]
): { message: string }[] => {
  const normalized: { message: string }[] = [];

  for (const error of errors) {
    const stringError = z.string().safeParse(error);
    if (stringError.success) {
      normalized.push({ message: stringError.data });
      continue;
    }

    const messageError = messageErrorSchema.safeParse(error);
    if (messageError.success) {
      normalized.push({ message: messageError.data.message });
    }
  }

  return normalized;
};
