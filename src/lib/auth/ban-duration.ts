const SECONDS_IN_A_DAY = 24 * 60 * 60;

/**
 * Changes a ban duration in days to seconds. better-auth `banExpiresIn` is in seconds.
 * An empty, zero, negative, or decimal value gives no duration (the ban has no end).
 */
export const banDaysToSeconds = (days: string): number | undefined => {
  const count = Number(days);
  return Number.isInteger(count) && count > 0
    ? count * SECONDS_IN_A_DAY
    : undefined;
};
