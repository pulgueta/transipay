import { setResponseStatus } from "@tanstack/react-start/server";

/** Sets the response status and returns an error to throw from a server function. */
export const httpError = (status: number, message: string) => {
  setResponseStatus(status);
  return new Error(message);
};
