/**
 * Waits until the database answers. A database with Railway Serverless (App Sleeping) wakes on the first
 * connection, and that connection can time out. The pre-deploy scripts run with plain `node`, so this file
 * imports only packages.
 */
import { setTimeout } from "node:timers/promises";

export interface WaitForDatabaseOptions {
  attempts: number;
  delayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Calls `ping` until it resolves. After the last attempt, it throws the last error. */
export const waitForDatabase = async (
  ping: () => Promise<void>,
  { attempts, delayMs, sleep = setTimeout }: WaitForDatabaseOptions
): Promise<void> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- Each attempt must wait for the one before it.
      await ping();
      return;
    } catch (error) {
      if (attempt >= attempts) {
        throw error;
      }
      console.log(
        `The database does not answer yet (attempt ${String(attempt)} of ${String(attempts)}). Trying again.`
      );
      // oxlint-disable-next-line no-await-in-loop -- The delay gives the database time to wake.
      await sleep(delayMs);
    }
  }
};
