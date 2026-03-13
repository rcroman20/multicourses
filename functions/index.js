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

async function deleteSubcollectionDocs(db, parentRef, subcollectionName) {
  const subRef = parentRef.collection(subcollectionName);
  const snap = await subRef.get();
  if (snap.empty) return;

  const batch = db.batch();
  snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
  await batch.commit();
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
  await assertCallerCanManageDeletions(request.auth, db);
  const userDocRef = db.collection("usuarios").doc(userId);
  const studentDocRef = db.collection("estudiantes").doc(userId);

  const [userSnap, studentSnap] = await Promise.all([
    userDocRef.get(),
    studentDocRef.get(),
  ]);

  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const studentData = studentSnap.exists ? studentSnap.data() || {} : {};

  const targetEmail = normalizeEmail(userData.email || studentData.email);
  if (targetEmail === OWNER_ADMIN_EMAIL) {
    throw new HttpsError(
      "failed-precondition",
      "Owner admin account cannot be deleted.",
    );
  }

  const roleRaw = String(userData.role || studentData.role || "")
    .trim()
    .toLowerCase();
  if (!allowTeacherDeletion && (roleRaw === "docente" || roleRaw === "teacher")) {
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
    deleteSubcollectionDocs(db, userDocRef, "notifications").catch(() => undefined),
    db
      .collection("accountDeletionRequests")
      .doc(userId)
      .delete()
      .catch(() => undefined),
    db.collection("deletedAccounts").doc(userId).delete().catch(() => undefined),
  ]);

  await Promise.all([
    userDocRef.delete().catch(() => undefined),
    studentDocRef.delete().catch(() => undefined),
  ]);

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
  if (!teacherId) {
    throw new HttpsError("failed-precondition", "Course has no teacher assigned.");
  }

  const canManageAsTeacher = actorUserId === teacherId;
  const canManageAsSelf = actorUserId === studentId;
  if (!canManageAsTeacher && !canManageAsSelf) {
    throw new HttpsError(
      "permission-denied",
      "You are not allowed to change this enrollment.",
    );
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
