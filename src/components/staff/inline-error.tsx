/** The error of one action, under its button. Null hides it. */
export const InlineError = ({ error }: { error: Error | null }) =>
  error === null ? null : (
    <p className="text-destructive text-sm" role="alert">
      {error.message}
    </p>
  );
