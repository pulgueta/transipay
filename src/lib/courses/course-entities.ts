import type { EntityKind } from "@/server/db/schema/entities";

/** The entity kinds that give courses: a CEA or the transit authority. */
export const COURSE_ENTITY_KINDS = [
  "cea",
  "transit_authority",
] as const satisfies readonly EntityKind[];

/** True when an entity of this kind can give courses. */
export const canGiveCourses = (kind: EntityKind) =>
  COURSE_ENTITY_KINDS.some((courseKind) => courseKind === kind);
