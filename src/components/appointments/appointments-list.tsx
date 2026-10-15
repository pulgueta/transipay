import { Badge } from "@/components/ui/badge";
import { formatBogotaDateTime } from "@/lib/dates";
import type { AppointmentView } from "@/server/appointments/appointments";

import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_VARIANTS,
} from "./appointment-labels";
import { CancelAppointmentDialog } from "./cancel-appointment-dialog";

/** One appointment per row, with the cancel action when the citizen can still cancel it. */
export const AppointmentsList = ({ items }: { items: AppointmentView[] }) => (
  <ul className="divide-y">
    {items.map((item) => (
      <li
        className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
        key={item.id}
      >
        <div className="flex flex-col gap-1">
          <p className="font-medium">
            {formatBogotaDateTime(item.scheduledAt)}
          </p>
          <p className="text-sm">{item.procedureTypeName}</p>
          <p className="text-muted-foreground text-sm">
            {item.entityName} · {item.branchName}, {item.branchAddress}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={APPOINTMENT_STATUS_VARIANTS[item.status]}>
            {APPOINTMENT_STATUS_LABELS[item.status]}
          </Badge>
          {item.canCancel ? (
            <CancelAppointmentDialog
              appointmentId={item.id}
              procedureTypeName={item.procedureTypeName}
              scheduledAt={item.scheduledAt}
            />
          ) : null}
        </div>
      </li>
    ))}
  </ul>
);
