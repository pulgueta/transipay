import { IconAlertCircle } from "@tabler/icons-react";

import { Alert, AlertTitle } from "@/components/ui/alert";

/** The error of a whole form, for example a wrong password. Field errors show under their field. */
export const FormError = ({ message }: { message: string | null }) =>
  message === null ? null : (
    <Alert role="alert" variant="destructive">
      <IconAlertCircle strokeWidth={1.75} />
      <AlertTitle>{message}</AlertTitle>
    </Alert>
  );
