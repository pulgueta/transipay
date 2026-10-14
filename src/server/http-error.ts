import { notFound } from "@tanstack/react-router";
import { setResponseStatus } from "@tanstack/react-start/server";

/** Sets the response status and returns an error to throw from a server function. */
export const httpError = (status: number, message: string) => {
  setResponseStatus(status);
  return new Error(message);
};

/** Sets HTTP 404 and throws the router not-found error, so the route shows its not-found page. */
export const throwNotFound = (): never => {
  setResponseStatus(404);
  notFound({ throw: true });
  // Not reached: `notFound({ throw: true })` throws.
  throw new Error("Not found.");
};
