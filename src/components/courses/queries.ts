import { queryOptions } from "@tanstack/react-query";

import { listCoursesFn } from "@/server/courses/functions";

export const COURSES_KEY = ["courses"] as const;

export const coursesQueryOptions = queryOptions({
  queryKey: [...COURSES_KEY, "list"],
  queryFn: async () => await listCoursesFn(),
});
