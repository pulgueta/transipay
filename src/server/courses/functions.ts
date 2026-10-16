import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db } from "@/server/db/client";
import { httpError, throwNotFound } from "@/server/http-error";
import { requirePermission } from "@/server/middleware/auth";

import { cancelEnrollment, enrollInCourse, listCourses } from "./courses";
import type { EnrollOutcome } from "./courses";

/** The citizen reads these messages, so each one says what to do next. */
const ENROLL_MESSAGES: Record<
  Extract<EnrollOutcome, { ok: false }>["reason"],
  string
> = {
  no_citizen: "Vincule su documento en su cuenta antes de inscribirse.",
  session_not_found:
    "Esta sesión del curso no está disponible. Seleccione otra.",
  session_started: "Esta sesión del curso ya empezó. Seleccione otra.",
  session_full: "Esta sesión del curso no tiene cupos. Seleccione otra.",
  already_enrolled: "Usted ya está inscrito en esta sesión del curso.",
  obligation_not_eligible:
    "El descuento aplica a un comparendo pendiente suyo. Seleccione uno de sus comparendos.",
  fine_already_enrolled:
    "Este comparendo ya tiene una inscripción a un curso. Seleccione otro comparendo o cancele esa inscripción.",
};

/** The open course sessions, the enrollments of the signed-in citizen, and the fines that can get a discount. */
export const listCoursesFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ course: ["read"] })])
  .handler(
    async ({ context }) => await listCourses(db, { userId: context.user.id })
  );

/** Enrolls the signed-in citizen and returns the enrollment as it is stored. */
export const enrollInCourseFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ course: ["enroll"] })])
  .validator(z.object({ courseSessionId: z.uuid(), obligationId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const outcome = await enrollInCourse(db, {
      userId: context.user.id,
      actorId: context.actorId,
      ...data,
    });
    if (!outcome.ok) {
      throw httpError(
        outcome.reason === "session_not_found" ? 404 : 409,
        ENROLL_MESSAGES[outcome.reason]
      );
    }
    return outcome.enrollment;
  });

/** Cancels an enrollment of the signed-in citizen and returns it as it is stored. */
export const cancelEnrollmentFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ course: ["enroll"] })])
  .validator(z.object({ enrollmentId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const outcome = await cancelEnrollment(db, {
      userId: context.user.id,
      actorId: context.actorId,
      enrollmentId: data.enrollmentId,
    });
    if (!outcome.ok) {
      if (outcome.reason === "not_found") {
        return throwNotFound();
      }
      throw httpError(
        409,
        "No puede cancelar esta inscripción: la sesión ya empezó o usted no asistió."
      );
    }
    return outcome.enrollment;
  });
