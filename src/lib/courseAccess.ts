type CourseLike = {
  id: string;
  teacherId?: string;
  enrolledStudents?: unknown[];
};

type UserLike = {
  id: string;
  role?: string;
};

const normalizeEnrollmentUserId = (entry: unknown): string => {
  if (typeof entry === "string") return entry.trim();
  if (entry && typeof entry === "object" && "id" in entry) {
    const value = (entry as { id?: unknown }).id;
    return typeof value === "string" ? value.trim() : "";
  }
  return "";
};

export const getCourseEnrollmentIds = <TCourse extends CourseLike>(course: TCourse): string[] =>
  Array.from(
    new Set((course.enrolledStudents || []).map(normalizeEnrollmentUserId).filter(Boolean)),
  );

export const isUserEnrolledInCourse = <TCourse extends CourseLike>(
  course: TCourse,
  userId?: string | null,
): boolean => {
  const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
  if (!normalizedUserId) return false;

  return getCourseEnrollmentIds(course).includes(normalizedUserId);
};

export const dedupeCoursesById = <TCourse extends CourseLike>(courses: TCourse[]): TCourse[] =>
  Array.from(new Map(courses.map((course) => [course.id, course])).values());

export const getTeacherOwnedCourses = <TCourse extends CourseLike>(
  courses: TCourse[],
  teacherId?: string | null,
): TCourse[] => {
  const normalizedTeacherId = typeof teacherId === "string" ? teacherId.trim() : "";
  if (!normalizedTeacherId) return [];

  return dedupeCoursesById(
    courses.filter((course) => String(course.teacherId || "").trim() === normalizedTeacherId),
  );
};

export const getAccessibleCoursesForUser = <TCourse extends CourseLike>(
  courses: TCourse[],
  user?: UserLike | null,
  options?: {
    includeEnrolledForTeacher?: boolean;
    includeAllForAdmin?: boolean;
  },
): TCourse[] => {
  if (!user?.id) return [];

  const includeAllForAdmin = options?.includeAllForAdmin ?? true;
  const includeEnrolledForTeacher = options?.includeEnrolledForTeacher ?? false;

  if (includeAllForAdmin && user.role === "admin") {
    return dedupeCoursesById(courses);
  }

  if (user.role === "docente") {
    const owned = getTeacherOwnedCourses(courses, user.id);
    if (!includeEnrolledForTeacher) return owned;

    return dedupeCoursesById([
      ...owned,
      ...courses.filter((course) => isUserEnrolledInCourse(course, user.id)),
    ]);
  }

  return dedupeCoursesById(
    courses.filter((course) => isUserEnrolledInCourse(course, user.id)),
  );
};
