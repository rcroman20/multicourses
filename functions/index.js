const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

const OWNER_ADMIN_EMAIL = "rcroman20@gmail.com";
const MAX_STUDENTS_PER_COURSE = 35;
const ADMIN_ACCESS_DOC_PATH = ["adminConfig", "access"];
const ADMIN_PERMISSIONS_DOC_PATH = ["adminConfig", "delegatedPermissions"];

const LEGACY_DEFAULT_PLAN = {
  id: "scale",
  name: "Scale Annual",
  courseLimit: 70,
  studentLimit: 70 * MAX_STUDENTS_PER_COURSE,
};

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRole(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "docente" ||
    normalized === "teacher" ||
    normalized === "profesor" ||
    normalized === "professor" ||
    normalized === "instructor"
  ) {
    return "docente";
  }
  if (
    normalized === "estudiante" ||
    normalized === "student" ||
    normalized === "alumno" ||
    normalized === "learner"
  ) {
    return "estudiante";
  }
  if (normalized === "admin" || normalized === "administrator") {
    return "admin";
  }
  if (
    normalized === "institucion" ||
    normalized === "institution" ||
    normalized === "organization" ||
    normalized === "organizacion"
  ) {
    return "institucion";
  }
  return "";
}

function normalizeApprovalStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "approved" || normalized === "pending" || normalized === "rejected") {
    return normalized;
  }
  return "";
}

function toPositiveNumber(value, fallback) {
  const numberValue = Number(value);
  if (Number.isFinite(numberValue) && numberValue > 0) return numberValue;
  return fallback;
}

function toDateOrNull(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof value.toDate === "function") {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeSchedule(rawSchedule) {
  if (!Array.isArray(rawSchedule)) return [];
  return rawSchedule
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const dayOfWeek = Number(entry.dayOfWeek);
      const startTime = String(entry.startTime || "").trim();
      const endTime = String(entry.endTime || "").trim();
      const location = String(entry.location || "").trim();

      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return null;
      if (!startTime || !endTime || startTime >= endTime) return null;

      return {
        dayOfWeek,
        startTime,
        endTime,
        location,
      };
    })
    .filter(Boolean);
}

function stripBackupServerFields(input) {
  const next = { ...(input || {}) };
  delete next.id;
  delete next.createdAt;
  delete next.updatedAt;
  return next;
}

async function fetchBackupCollectionByCourse(db, collectionName, courseId) {
  const snapshot = await db
    .collection(collectionName)
    .where("courseId", "==", courseId)
    .get();

  return snapshot.docs.map((item) => ({
    id: item.id,
    data: stripBackupServerFields(item.data() || {}),
  }));
}

async function buildCourseBackupPayload(db, courseId) {
  const courseSnap = await db.collection("cursos").doc(courseId).get();
  if (!courseSnap.exists) {
    throw new Error("Course not found");
  }

  const courseData = courseSnap.data() || {};
  const [
    assessments,
    gradeSheets,
    periods,
    weeks,
    files,
    exerciseQuestions,
    exerciseThemeLinks,
    units,
    legacyAssessments,
  ] = await Promise.all([
    fetchBackupCollectionByCourse(db, "assessments", courseId),
    fetchBackupCollectionByCourse(db, "gradeSheets", courseId),
    fetchBackupCollectionByCourse(db, "periods", courseId),
    fetchBackupCollectionByCourse(db, "weeks", courseId),
    fetchBackupCollectionByCourse(db, "course_files", courseId),
    fetchBackupCollectionByCourse(db, "exerciseQuestions", courseId),
    fetchBackupCollectionByCourse(db, "exerciseThemeLinks", courseId),
    fetchBackupCollectionByCourse(db, "unidades", courseId),
    fetchBackupCollectionByCourse(db, "evaluaciones", courseId),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: {
      courseId,
      courseCode: String(courseData.code || ""),
      courseName: String(courseData.name || ""),
      teacherId: typeof courseData.teacherId === "string" ? courseData.teacherId : undefined,
    },
    data: {
      course: { id: courseSnap.id, data: stripBackupServerFields(courseData) },
      assessments,
      gradeSheets,
      periods,
      weeks,
      files,
      exerciseQuestions,
      exerciseThemeLinks,
      units,
      legacyAssessments,
    },
  };
}

async function cleanupExpiredCourseBackups(db, retentionDays = 7) {
  const cutoff = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000),
  );
  const snapshot = await db
    .collection("courseBackups")
    .where("createdAt", "<", cutoff)
    .get();

  if (snapshot.empty) return 0;

  for (let index = 0; index < snapshot.docs.length; index += 450) {
    const batch = db.batch();
    snapshot.docs.slice(index, index + 450).forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
  }
  return snapshot.size;
}

async function createAutomaticCourseBackups(db, intervalHours = 24) {
  const intervalMs = Math.max(1, intervalHours) * 60 * 60 * 1000;
  const now = Date.now();
  const coursesSnap = await db.collection("cursos").get();
  const latestBackupByCourseId = new Map();
  const teacherContextById = new Map();
  const backupsSnap = await db.collection("courseBackups").get();

  backupsSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const courseId = String(data.courseId || "").trim();
    const createdAt = toDateOrNull(data.createdAt);
    if (!courseId || !createdAt) return;
    const current = latestBackupByCourseId.get(courseId) || 0;
    const createdAtMs = createdAt.getTime();
    if (createdAtMs > current) {
      latestBackupByCourseId.set(courseId, createdAtMs);
    }
  });

  let created = 0;
  let skipped = 0;

  for (const courseDoc of coursesSnap.docs) {
    const courseData = courseDoc.data() || {};
    const courseId = courseDoc.id;
    const teacherId = String(courseData.teacherId || "").trim();
    if (!teacherId) {
      skipped += 1;
      continue;
    }

    let teacherData = teacherContextById.get(teacherId);
    if (!teacherData) {
      const teacherSnap = await db.collection("usuarios").doc(teacherId).get();
      teacherData = teacherSnap.exists ? teacherSnap.data() || {} : {};
      teacherContextById.set(teacherId, teacherData);
    }
    const teacherRole = normalizeRole(teacherData.role || teacherData.requestedRole);
    const teacherApproval = normalizeApprovalStatus(teacherData.teacherApprovalStatus);
    const teacherPlanStatus = String(teacherData.teacherPlanStatus || "active").trim().toLowerCase();

    if (teacherRole !== "docente") {
      skipped += 1;
      continue;
    }
    if (teacherApproval && teacherApproval !== "approved") {
      skipped += 1;
      continue;
    }
    if (teacherPlanStatus === "expired") {
      skipped += 1;
      continue;
    }

    const lastBackupMs = latestBackupByCourseId.get(courseId) || 0;
    if (lastBackupMs > 0 && now - lastBackupMs < intervalMs) {
      skipped += 1;
      continue;
    }

    const payload = await buildCourseBackupPayload(db, courseId);
    await db.collection("courseBackups").add({
      teacherId,
      teacherName: String(courseData.teacherName || teacherData.name || "Teacher"),
      courseId: payload.source.courseId,
      courseCode: payload.source.courseCode,
      courseName: payload.source.courseName,
      exportedAt: payload.exportedAt,
      payload,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "scheduled_daily_backup",
    });
    created += 1;
  }

  return { created, skipped };
}

function getTeacherPlanContext(userData, studentData) {
  const primary = userData || {};
  const secondary = studentData || {};
  const merged = { ...secondary, ...primary };

  return {
    id: String(merged.teacherPlanId || LEGACY_DEFAULT_PLAN.id),
    name: String(merged.teacherPlanName || LEGACY_DEFAULT_PLAN.name),
    courseLimit: toPositiveNumber(
      merged.teacherPlanCourseLimit,
      LEGACY_DEFAULT_PLAN.courseLimit,
    ),
    studentLimit: toPositiveNumber(
      merged.teacherPlanStudentLimit,
      LEGACY_DEFAULT_PLAN.studentLimit,
    ),
    expiresAt: toDateOrNull(merged.teacherPlanExpiresAt),
    status: String(merged.teacherPlanStatus || "active").trim().toLowerCase(),
  };
}

function assertTeacherApproved(userData, studentData) {
  const role = normalizeRole(userData?.role || studentData?.role);
  const approval = normalizeApprovalStatus(
    userData?.teacherApprovalStatus || studentData?.teacherApprovalStatus,
  );

  if (role !== "docente") {
    throw new HttpsError(
      "permission-denied",
      "Only approved teachers can perform this action.",
    );
  }

  if (approval && approval !== "approved") {
    throw new HttpsError(
      "failed-precondition",
      "Teacher account is not approved yet.",
    );
  }
}

function assertTeacherPlanActive(planContext) {
  if (planContext.status === "expired") {
    throw new HttpsError(
      "failed-precondition",
      "Teacher plan is expired. Renew the plan to continue.",
    );
  }

  if (planContext.expiresAt && planContext.expiresAt.getTime() < Date.now()) {
    throw new HttpsError(
      "failed-precondition",
      "Teacher plan is expired. Renew the plan to continue.",
    );
  }
}

function getCourseManagerIds(courseData) {
  return new Set(
    [
      courseData?.teacherId,
      courseData?.createdBy,
      courseData?.createdById,
      courseData?.createdByUserId,
      courseData?.ownerId,
      courseData?.adminId,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
}

async function deleteSubcollectionDocs(db, parentRef, subcollectionName) {
  const subRef = parentRef.collection(subcollectionName);
  const snap = await subRef.get();
  if (snap.empty) return;

  const batch = db.batch();
  snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
  await batch.commit();
}

async function deleteDocsInChunks(db, docs, batchSize = 300) {
  if (!Array.isArray(docs) || docs.length === 0) return 0;

  let deleted = 0;
  for (let index = 0; index < docs.length; index += batchSize) {
    const batch = db.batch();
    docs.slice(index, index + batchSize).forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += Math.min(batchSize, docs.length - index);
  }

  return deleted;
}

async function deleteByField(db, collectionName, field, value) {
  if (!value) return 0;

  try {
    const snap = await db.collection(collectionName).where(field, "==", value).get();
    return await deleteDocsInChunks(db, snap.docs);
  } catch {
    return 0;
  }
}

function getInstitutionOwnerId(courseData) {
  return String(courseData?.createdByInstitutionId || courseData?.institutionId || "").trim();
}

function isInstitutionOwnedCourse(courseData) {
  return Boolean(getInstitutionOwnerId(courseData));
}

async function deleteCourseScopedData(db, courseId) {
  const courseScopedCollections = [
    "assessments",
    "evaluaciones",
    "gradeSheets",
    "submissions",
    "notas",
    "course_files",
    "periods",
    "weeks",
    "semanas",
    "unidades",
    "diapositivas",
    "exerciseQuestions",
    "exerciseThemeLinks",
    "quizAttempts",
    "assessmentForumComments",
    "slides",
    "units",
    "courseBackups",
  ];

  await Promise.all(
    courseScopedCollections.map((collectionName) =>
      deleteByField(db, collectionName, "courseId", courseId),
    ),
  );
}

async function deleteTeacherOwnedCourses(db, collectionName, teacherId) {
  if (!teacherId) return;

  try {
    const snap = await db.collection(collectionName).where("teacherId", "==", teacherId).get();
    for (const courseSnap of snap.docs) {
      const courseData = courseSnap.data() || {};
      if (isInstitutionOwnedCourse(courseData)) {
        continue;
      }
      await deleteCourseScopedData(db, courseSnap.id);
      await courseSnap.ref.delete().catch(() => undefined);
    }
  } catch {
    // ignore optional cleanup failures
  }
}

async function deleteInstitutionOwnedCourses(db, collectionName, institutionId) {
  if (!institutionId) return;

  try {
    const [byInstitutionSnap, byCreatorSnap] = await Promise.all([
      db.collection(collectionName).where("institutionId", "==", institutionId).get(),
      db.collection(collectionName).where("createdByInstitutionId", "==", institutionId).get(),
    ]);

    const deduped = new Map();
    [...byInstitutionSnap.docs, ...byCreatorSnap.docs].forEach((courseSnap) => {
      deduped.set(courseSnap.id, courseSnap);
    });

    for (const courseSnap of deduped.values()) {
      await deleteCourseScopedData(db, courseSnap.id);
      await courseSnap.ref.delete().catch(() => undefined);
    }
  } catch {
    // ignore optional cleanup failures
  }
}

async function removeFromCourseEnrollment(db, collectionName, userId) {
  if (!userId) return;

  try {
    const snap = await db
      .collection(collectionName)
      .where("enrolledStudents", "array-contains", userId)
      .get();

    for (let index = 0; index < snap.docs.length; index += 300) {
      const batch = db.batch();
      snap.docs.slice(index, index + 300).forEach((courseSnap) => {
        const data = courseSnap.data() || {};
        const enrolledStudents = Array.isArray(data.enrolledStudents) ? data.enrolledStudents : [];
        batch.update(courseSnap.ref, {
          enrolledStudents: enrolledStudents.filter((entry) => String(entry || "").trim() !== userId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }
  } catch {
    // ignore optional cleanup failures
  }
}

async function deleteUserNotifications(db, userId) {
  if (!userId) return;
  const userRef = db.collection("usuarios").doc(userId);
  await deleteSubcollectionDocs(db, userRef, "notifications").catch(() => undefined);
}

function isInstitutionAccount(userId, userData, studentData) {
  const candidateRoles = [
    normalizeRole(userData?.role),
    normalizeRole(studentData?.role),
    normalizeRole(userData?.requestedRole),
    normalizeRole(studentData?.requestedRole),
  ];
  if (candidateRoles.includes("institucion")) return true;

  const institutionRoles = [userData?.institutionRole, studentData?.institutionRole]
    .map((value) => String(value || "").trim().toLowerCase());
  if (institutionRoles.includes("owner") || institutionRoles.includes("coordinator")) {
    return true;
  }

  const institutionId = String(userData?.institutionId || studentData?.institutionId || "").trim();
  const institutionPlanStatus = String(
    userData?.institutionPlanStatus ||
      studentData?.institutionPlanStatus ||
      userData?.planStatus ||
      studentData?.planStatus ||
      "",
  )
    .trim()
    .toLowerCase();

  return Boolean(institutionId && institutionId === userId && institutionPlanStatus);
}

async function purgeUserData(db, userId, email) {
  const normalizedEmail = normalizeEmail(email);

  await deleteUserNotifications(db, userId);
  await Promise.all([
    removeFromCourseEnrollment(db, "cursos", userId),
    removeFromCourseEnrollment(db, "courses", userId),
  ]);

  await Promise.all([
    deleteTeacherOwnedCourses(db, "cursos", userId),
    deleteTeacherOwnedCourses(db, "courses", userId),
    deleteInstitutionOwnedCourses(db, "cursos", userId),
    deleteInstitutionOwnedCourses(db, "courses", userId),
  ]);

  const userScopedCleanup = [
    ["assessments", "createdBy"],
    ["evaluaciones", "createdBy"],
    ["gradeSheets", "teacherId"],
    ["gradeSheets", "createdBy"],
    ["submissions", "studentId"],
    ["submissions", "gradedBy"],
    ["notas", "studentId"],
    ["notas", "gradedBy"],
    ["quizAttempts", "studentId"],
    ["assessmentForumComments", "authorId"],
    ["assessmentForumComments", "userId"],
    ["exerciseQuestions", "createdBy"],
    ["exerciseQuestions", "teacherId"],
    ["exerciseThemeLinks", "createdBy"],
    ["courseBackups", "teacherId"],
  ];

  await Promise.all(
    userScopedCleanup.map(([collectionName, field]) =>
      deleteByField(db, collectionName, field, userId),
    ),
  );

  if (normalizedEmail) {
    await Promise.all([
      deleteByField(db, "usuarios", "email", normalizedEmail),
      deleteByField(db, "estudiantes", "email", normalizedEmail),
    ]);
  }

  await Promise.all([
    db.collection("usuarios").doc(userId).delete().catch(() => undefined),
    db.collection("estudiantes").doc(userId).delete().catch(() => undefined),
    db.collection("instituciones").doc(userId).delete().catch(() => undefined),
  ]);
}

async function getDelegatedAdminContext(auth, db) {
  const callerEmail = normalizeEmail(auth?.token?.email);
  if (callerEmail === OWNER_ADMIN_EMAIL) {
    return {
      isOwner: true,
      isDelegatedAdmin: false,
      permissions: {},
    };
  }

  const [accessSnap, permissionsSnap] = await Promise.all([
    db.doc(ADMIN_ACCESS_DOC_PATH.join("/")).get(),
    db.doc(ADMIN_PERMISSIONS_DOC_PATH.join("/")).get(),
  ]);

  const accessData = accessSnap.exists ? accessSnap.data() || {} : {};
  const permissionsData = permissionsSnap.exists ? permissionsSnap.data() || {} : {};
  const delegatedAdminUserIds = Array.isArray(accessData.delegatedAdminUserIds)
    ? accessData.delegatedAdminUserIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  return {
    isOwner: false,
    isDelegatedAdmin: delegatedAdminUserIds.includes(String(auth?.uid || "").trim()),
    permissions: permissionsData,
  };
}

async function assertCallerCanManageDeletions(auth, db) {
  const context = await getDelegatedAdminContext(auth, db);
  if (context.isOwner) return;
  if (context.isDelegatedAdmin && context.permissions.manageDeletions === true) return;

  throw new HttpsError(
    "permission-denied",
    "You do not have permission to process account deletions.",
  );
}

function getStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

async function assertTeacherCanDeleteStudent(auth, db, targetUserId, userData, studentData) {
  const actorUserId = String(auth?.uid || "").trim();
  if (!actorUserId) {
    throw new HttpsError("permission-denied", "Authentication is required.");
  }

  const [actorUserSnap, actorStudentSnap, directEnrollmentCoursesSnap] = await Promise.all([
    db.collection("usuarios").doc(actorUserId).get(),
    db.collection("estudiantes").doc(actorUserId).get(),
    db.collection("cursos").where("enrolledStudents", "array-contains", targetUserId).get(),
  ]);

  const actorUserData = actorUserSnap.exists ? actorUserSnap.data() || {} : {};
  const actorStudentData = actorStudentSnap.exists ? actorStudentSnap.data() || {} : {};
  const actorRole = normalizeRole(
    actorUserData.role ||
      actorStudentData.role ||
      actorUserData.requestedRole ||
      actorStudentData.requestedRole,
  );

  if (actorRole !== "docente") {
    throw new HttpsError(
      "permission-denied",
      "You do not have permission to process account deletions.",
    );
  }

  assertTeacherApproved(actorUserData, actorStudentData);

  const targetRole = normalizeRole(userData.role || studentData.role);
  const targetRequestedRole = normalizeRole(
    userData.requestedRole || studentData.requestedRole,
  );

  if (targetRole !== "estudiante" || targetRequestedRole === "docente") {
    throw new HttpsError(
      "failed-precondition",
      "Only student accounts can be deleted from the teacher panel.",
    );
  }

  const directEnrollmentCourses = directEnrollmentCoursesSnap.docs;
  if (directEnrollmentCourses.length > 0) {
    const teacherManagesAllCourses = directEnrollmentCourses.every((courseSnap) =>
      getCourseManagerIds(courseSnap.data() || {}).has(actorUserId),
    );

    if (!teacherManagesAllCourses) {
      throw new HttpsError(
        "permission-denied",
        "Teachers can only delete students assigned exclusively to their own courses.",
      );
    }

    return;
  }

  const fallbackCourseIds = getStringArray(studentData.courses);
  if (!fallbackCourseIds.length) {
    throw new HttpsError(
      "permission-denied",
      "Teachers can only delete students who belong to their own courses.",
    );
  }

  const fallbackCourseSnaps = await Promise.all(
    fallbackCourseIds.map((courseId) => db.collection("cursos").doc(courseId).get()),
  );
  const existingFallbackCourses = fallbackCourseSnaps.filter((courseSnap) => courseSnap.exists);

  if (!existingFallbackCourses.length) {
    throw new HttpsError(
      "permission-denied",
      "Teachers can only delete students who belong to their own courses.",
    );
  }

  const teacherManagesAllFallbackCourses = existingFallbackCourses.every((courseSnap) =>
    getCourseManagerIds(courseSnap.data() || {}).has(actorUserId),
  );

  if (!teacherManagesAllFallbackCourses) {
    throw new HttpsError(
      "permission-denied",
      "Teachers can only delete students assigned exclusively to their own courses.",
    );
  }
}

async function assertCallerCanDeleteUser(auth, db, targetUserId, userData, studentData) {
  const actorUserId = String(auth?.uid || "").trim();
  if (actorUserId && actorUserId === targetUserId) {
    const effectiveRole = normalizeRole(
      userData.role ||
        studentData.role ||
        userData.requestedRole ||
        studentData.requestedRole,
    );
    if (effectiveRole === "docente" || isInstitutionAccount(targetUserId, userData, studentData)) {
      return;
    }
  }

  try {
    await assertCallerCanManageDeletions(auth, db);
    return;
  } catch (error) {
    const code = String(error?.code || "");
    if (!code.includes("permission-denied")) {
      throw error;
    }
  }

  await assertTeacherCanDeleteStudent(auth, db, targetUserId, userData, studentData);
}

exports.deleteUserByAdmin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const userId = String(request.data?.userId || "").trim();
  const allowTeacherDeletion = Boolean(request.data?.allowTeacherDeletion);
  if (!userId) {
    throw new HttpsError("invalid-argument", "userId is required.");
  }

  const db = admin.firestore();
  const userDocRef = db.collection("usuarios").doc(userId);
  const studentDocRef = db.collection("estudiantes").doc(userId);

  const [userSnap, studentSnap] = await Promise.all([
    userDocRef.get(),
    studentDocRef.get(),
  ]);

  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const studentData = studentSnap.exists ? studentSnap.data() || {} : {};

  await assertCallerCanDeleteUser(request.auth, db, userId, userData, studentData);

  const targetEmail = normalizeEmail(userData.email || studentData.email);
  if (targetEmail === OWNER_ADMIN_EMAIL) {
    throw new HttpsError(
      "failed-precondition",
      "Owner admin account cannot be deleted.",
    );
  }

  const effectiveRole = normalizeRole(
    userData.role ||
      studentData.role ||
      userData.requestedRole ||
      studentData.requestedRole,
  );
  if (!allowTeacherDeletion && effectiveRole === "docente") {
    throw new HttpsError(
      "failed-precondition",
      "Teacher accounts require manual review before deletion.",
    );
  }

  try {
    await admin.auth().deleteUser(userId);
  } catch (error) {
    const code = String(error?.code || "");
    if (!code.includes("auth/user-not-found")) {
      throw new HttpsError("internal", "Could not delete auth user.");
    }
  }

  await Promise.all([
    db.collection("accountDeletionRequests").doc(userId).delete().catch(() => undefined),
    db.collection("deletedAccounts").doc(userId).delete().catch(() => undefined),
  ]);

  await purgeUserData(db, userId, targetEmail);

  return { ok: true, userId };
});

exports.runAutomaticCourseBackups = onSchedule(
  {
    schedule: "every 24 hours",
    timeZone: "America/Bogota",
  },
  async () => {
    const db = admin.firestore();
    const deleted = await cleanupExpiredCourseBackups(db, 7);
    const result = await createAutomaticCourseBackups(db, 24);

    console.log("Automatic course backups run completed.", {
      created: result.created,
      skipped: result.skipped,
      deleted,
    });
  },
);

exports.createCourseWithPlan = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const userId = request.auth.uid;
  const db = admin.firestore();
  const userRef = db.collection("usuarios").doc(userId);
  const studentRef = db.collection("estudiantes").doc(userId);
  const [userSnap, studentSnap] = await Promise.all([userRef.get(), studentRef.get()]);
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const studentData = studentSnap.exists ? studentSnap.data() || {} : {};

  const isInstitutionManagedTeacher =
    normalizeRole(userData.role || studentData.role || userData.requestedRole || studentData.requestedRole) === "docente" &&
    (Boolean(userData.institutionManaged) ||
      Boolean(studentData.institutionManaged) ||
      String(userData.institutionId || studentData.institutionId || "").trim().length > 0);

  if (isInstitutionManagedTeacher) {
    throw new HttpsError(
      "failed-precondition",
      "Institution-managed teachers cannot create courses. Your institution must create and assign them.",
    );
  }

  assertTeacherApproved(userData, studentData);
  const planContext = getTeacherPlanContext(userData, studentData);
  assertTeacherPlanActive(planContext);

  const name = String(request.data?.name || "").trim();
  const code = String(request.data?.code || "").trim().toUpperCase();
  const semester = String(request.data?.semester || "").trim();
  const group = String(request.data?.group || "").trim();
  const credits = Number(request.data?.credits || 0);
  const description = String(request.data?.description || "").trim();
  const classSchedule = normalizeSchedule(request.data?.classSchedule);

  if (!name || name.length < 3) {
    throw new HttpsError("invalid-argument", "Course name is required.");
  }
  if (!code || code.length < 3) {
    throw new HttpsError("invalid-argument", "Course code is required.");
  }
  if (!semester) {
    throw new HttpsError("invalid-argument", "Semester is required.");
  }
  if (!group) {
    throw new HttpsError("invalid-argument", "Group is required.");
  }
  if (!Number.isFinite(credits) || credits < 0) {
    throw new HttpsError("invalid-argument", "Credits cannot be negative.");
  }
  if (!description || description.length < 10) {
    throw new HttpsError("invalid-argument", "Description must be at least 10 characters.");
  }
  const [existingCodeSnap, teacherCoursesSnap] = await Promise.all([
    db.collection("cursos").where("code", "==", code).limit(1).get(),
    db.collection("cursos").where("teacherId", "==", userId).get(),
  ]);

  if (!existingCodeSnap.empty) {
    throw new HttpsError(
      "already-exists",
      `Course code "${code}" already exists. Please use a unique code.`,
    );
  }

  if (teacherCoursesSnap.size >= planContext.courseLimit) {
    throw new HttpsError(
      "resource-exhausted",
      `Plan limit reached: ${planContext.name} allows up to ${planContext.courseLimit} courses.`,
    );
  }

  const teacherName = String(userData.name || studentData.name || "Teacher").trim() || "Teacher";
  const courseRef = db.collection("cursos").doc();
  await courseRef.set({
    name,
    code,
    semester,
    group,
    credits,
    description,
    classSchedule,
    teacherId: userId,
    teacherName,
    status: "active",
    enrolledStudents: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    courseId: courseRef.id,
    planName: planContext.name,
    courseLimit: planContext.courseLimit,
  };
});

exports.changeCourseEnrollmentWithPlan = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const actorUserId = request.auth.uid;
  const courseId = String(request.data?.courseId || "").trim();
  const studentId = String(request.data?.studentId || "").trim();
  const action = String(request.data?.action || "").trim().toLowerCase();

  if (!courseId || !studentId) {
    throw new HttpsError("invalid-argument", "courseId and studentId are required.");
  }
  if (action !== "enroll" && action !== "unenroll") {
    throw new HttpsError("invalid-argument", "action must be enroll or unenroll.");
  }

  const db = admin.firestore();
  const courseRef = db.collection("cursos").doc(courseId);
  const courseSnap = await courseRef.get();
  if (!courseSnap.exists) {
    throw new HttpsError("not-found", "Course not found.");
  }

  const courseData = courseSnap.data() || {};
  const teacherId = String(courseData.teacherId || "").trim();
  const [actorUserSnap, actorStudentSnap, adminContext] = await Promise.all([
    db.collection("usuarios").doc(actorUserId).get(),
    db.collection("estudiantes").doc(actorUserId).get(),
    getDelegatedAdminContext(request.auth, db),
  ]);
  const actorUserData = actorUserSnap.exists ? actorUserSnap.data() || {} : {};
  const actorStudentData = actorStudentSnap.exists ? actorStudentSnap.data() || {} : {};
  const actorRole = normalizeRole(
    actorUserData.role ||
      actorStudentData.role ||
      actorUserData.requestedRole ||
      actorStudentData.requestedRole,
  );
  const actorInstitutionId =
    actorRole === "institucion"
      ? String(actorUserData.institutionId || actorStudentData.institutionId || actorUserId).trim()
      : "";
  const courseInstitutionId = getInstitutionOwnerId(courseData);
  const canManageAsTeacher = Boolean(teacherId) && actorUserId === teacherId;
  const canManageAsSelf = actorUserId === studentId;
  const canManageAsAdminOwner =
    (actorRole === "admin" || adminContext.isOwner || adminContext.isDelegatedAdmin) &&
    getCourseManagerIds(courseData).has(actorUserId);
  const canManageAsInstitutionOwner =
    actorRole === "institucion" &&
    Boolean(actorInstitutionId) &&
    actorInstitutionId === courseInstitutionId;
  if (
    !canManageAsTeacher &&
    !canManageAsSelf &&
    !canManageAsAdminOwner &&
    !canManageAsInstitutionOwner
  ) {
    throw new HttpsError(
      "permission-denied",
      "You are not allowed to change this enrollment.",
    );
  }

  if (!teacherId) {
    if (canManageAsSelf || canManageAsAdminOwner || canManageAsInstitutionOwner) {
      const studentRef = db.collection("estudiantes").doc(studentId);
      await db.runTransaction(async (transaction) => {
        const [freshCourseSnap, studentSnap] = await Promise.all([
          transaction.get(courseRef),
          transaction.get(studentRef),
        ]);

        if (!freshCourseSnap.exists) {
          throw new HttpsError("not-found", "Course not found.");
        }

        const freshCourseData = freshCourseSnap.data() || {};
        const currentStudents = Array.isArray(freshCourseData.enrolledStudents)
          ? freshCourseData.enrolledStudents
          : [];
        const isCurrentlyEnrolled = currentStudents.includes(studentId);

        if (action === "enroll" && !isCurrentlyEnrolled) {
          transaction.update(courseRef, {
            enrolledStudents: [...currentStudents, studentId],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        if (action === "unenroll" && isCurrentlyEnrolled) {
          transaction.update(courseRef, {
            enrolledStudents: currentStudents.filter((id) => id !== studentId),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        if (studentSnap.exists) {
          const studentData = studentSnap.data() || {};
          const currentCourses = Array.isArray(studentData.courses) ? studentData.courses : [];
          if (action === "enroll" && !currentCourses.includes(courseId)) {
            transaction.update(studentRef, {
              courses: [...currentCourses, courseId],
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          if (action === "unenroll" && currentCourses.includes(courseId)) {
            transaction.update(studentRef, {
              courses: currentCourses.filter((id) => id !== courseId),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        } else if (action === "enroll") {
          transaction.set(
            studentRef,
            {
              id: studentId,
              role: "estudiante",
              courses: [courseId],
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
      });

      return {
        ok: true,
        courseId,
        studentId,
        action,
        planName: canManageAsSelf ? "Self enrollment" : "Admin managed",
        studentLimit: 0,
      };
    }

    throw new HttpsError("failed-precondition", "Course has no teacher assigned.");
  }

  const teacherUserRef = db.collection("usuarios").doc(teacherId);
  const teacherStudentRef = db.collection("estudiantes").doc(teacherId);
  const [teacherUserSnap, teacherStudentSnap, teacherCoursesSnap] = await Promise.all([
    teacherUserRef.get(),
    teacherStudentRef.get(),
    db.collection("cursos").where("teacherId", "==", teacherId).get(),
  ]);

  const teacherUserData = teacherUserSnap.exists ? teacherUserSnap.data() || {} : {};
  const teacherStudentData = teacherStudentSnap.exists ? teacherStudentSnap.data() || {} : {};
  assertTeacherApproved(teacherUserData, teacherStudentData);

  const planContext = getTeacherPlanContext(teacherUserData, teacherStudentData);
  assertTeacherPlanActive(planContext);

  if (action === "enroll") {
    const uniqueStudentIds = new Set();
    for (const teacherCourse of teacherCoursesSnap.docs) {
      const enrolledStudents = Array.isArray(teacherCourse.data()?.enrolledStudents)
        ? teacherCourse.data().enrolledStudents
        : [];
      for (const enrolledId of enrolledStudents) {
        if (typeof enrolledId === "string" && enrolledId.trim().length > 0) {
          uniqueStudentIds.add(enrolledId);
        }
      }
    }

    const courseStudents = Array.isArray(courseData.enrolledStudents)
      ? courseData.enrolledStudents
      : [];
    const alreadyInCourse = courseStudents.includes(studentId);
    const alreadyManaged = uniqueStudentIds.has(studentId);
    const projectedTotal = alreadyManaged ? uniqueStudentIds.size : uniqueStudentIds.size + 1;

    if (!alreadyInCourse && projectedTotal > planContext.studentLimit) {
      throw new HttpsError(
        "resource-exhausted",
        `Plan limit reached: ${planContext.name} allows up to ${planContext.studentLimit} unique students.`,
      );
    }
  }

  const studentRef = db.collection("estudiantes").doc(studentId);
  await db.runTransaction(async (transaction) => {
    const [freshCourseSnap, studentSnap] = await Promise.all([
      transaction.get(courseRef),
      transaction.get(studentRef),
    ]);

    if (!freshCourseSnap.exists) {
      throw new HttpsError("not-found", "Course not found.");
    }

    const freshCourseData = freshCourseSnap.data() || {};
    const currentStudents = Array.isArray(freshCourseData.enrolledStudents)
      ? freshCourseData.enrolledStudents
      : [];
    const isCurrentlyEnrolled = currentStudents.includes(studentId);

    if (action === "enroll") {
      if (!isCurrentlyEnrolled) {
        transaction.update(courseRef, {
          enrolledStudents: [...currentStudents, studentId],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      if (studentSnap.exists) {
        const studentData = studentSnap.data() || {};
        const currentCourses = Array.isArray(studentData.courses) ? studentData.courses : [];
        if (!currentCourses.includes(courseId)) {
          transaction.update(studentRef, {
            courses: [...currentCourses, courseId],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      } else {
        transaction.set(
          studentRef,
          {
            id: studentId,
            role: "estudiante",
            courses: [courseId],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    } else {
      if (isCurrentlyEnrolled) {
        transaction.update(courseRef, {
          enrolledStudents: currentStudents.filter((id) => id !== studentId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      if (studentSnap.exists) {
        const studentData = studentSnap.data() || {};
        const currentCourses = Array.isArray(studentData.courses) ? studentData.courses : [];
        if (currentCourses.includes(courseId)) {
          transaction.update(studentRef, {
            courses: currentCourses.filter((id) => id !== courseId),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    }
  });

  return {
    ok: true,
    courseId,
    studentId,
    action,
    planName: planContext.name,
    studentLimit: planContext.studentLimit,
  };
});
