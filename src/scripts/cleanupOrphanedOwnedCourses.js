import { execFileSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";

const FIREBASE_PROJECT_ID = "historiassinnombre";
const COURSE_COLLECTIONS = ["cursos", "courses"];
const COURSE_SCOPED_COLLECTIONS = [
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

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
  };
}

function requireFirebaseToolsModule(moduleName) {
  const firebaseBinary = execFileSync("which", ["firebase"], { encoding: "utf8" }).trim();
  const firebaseToolsLibDir = path.resolve(
    path.dirname(firebaseBinary),
    "..",
    "lib",
    "node_modules",
    "firebase-tools",
    "lib",
  );
  const require = createRequire(import.meta.url);
  return require(path.join(firebaseToolsLibDir, moduleName));
}

const auth = requireFirebaseToolsModule("auth.js");
const apiv2 = requireFirebaseToolsModule("apiv2.js");

function getClient() {
  const account = auth.getGlobalDefaultAccount();
  if (!account) {
    throw new Error("No firebase CLI account found.");
  }

  auth.setRefreshToken(account.tokens.refresh_token);

  return new apiv2.Client({
    urlPrefix: "https://firestore.googleapis.com/v1",
    auth: true,
  });
}

function getBaseDocumentPath(projectId) {
  return `/projects/${projectId}/databases/(default)/documents`;
}

function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => encodeValue(item)) } };
  }
  if (typeof value === "object") {
    const fields = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      fields[key] = encodeValue(nestedValue);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function decodeValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return String(value.stringValue || "");
  if ("integerValue" in value) return Number(value.integerValue || 0);
  if ("doubleValue" in value) return Number(value.doubleValue || 0);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return String(value.timestampValue || "");
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    const values = Array.isArray(value.arrayValue?.values) ? value.arrayValue.values : [];
    return values.map((entry) => decodeValue(entry));
  }
  if ("mapValue" in value) {
    const fields = value.mapValue?.fields || {};
    const output = {};
    for (const [key, nestedValue] of Object.entries(fields)) {
      output[key] = decodeValue(nestedValue);
    }
    return output;
  }
  return null;
}

function getStringField(doc, fieldName) {
  const raw = doc?.fields?.[fieldName];
  const value = decodeValue(raw);
  return typeof value === "string" ? value.trim() : "";
}

function getDocumentId(documentName) {
  const segments = String(documentName || "").split("/");
  return segments[segments.length - 1] || "";
}

async function getDocument(client, collectionName, docId) {
  if (!docId) return null;
  const basePath = getBaseDocumentPath(FIREBASE_PROJECT_ID);

  try {
    const response = await client.get(`${basePath}/${collectionName}/${encodeURIComponent(docId)}`);
    return response.body || null;
  } catch (error) {
    const status = Number(error?.context?.response?.statusCode || error?.status || 0);
    if (status === 404) return null;
    throw error;
  }
}

async function listCollection(client, collectionName) {
  const basePath = getBaseDocumentPath(FIREBASE_PROJECT_ID);
  const documents = [];
  let pageToken = "";

  do {
    const query = pageToken
      ? `${basePath}/${collectionName}?pageSize=1000&pageToken=${encodeURIComponent(pageToken)}`
      : `${basePath}/${collectionName}?pageSize=1000`;
    const response = await client.get(query);
    const body = response.body || {};
    documents.push(...(body.documents || []));
    pageToken = body.nextPageToken || "";
  } while (pageToken);

  return documents;
}

async function runQuery(client, collectionName, fieldPath, value) {
  if (!value) return [];

  const basePath = getBaseDocumentPath(FIREBASE_PROJECT_ID);
  const response = await client.post(`${basePath}:runQuery`, {
    structuredQuery: {
      from: [{ collectionId: collectionName }],
      where: {
        fieldFilter: {
          field: { fieldPath },
          op: "EQUAL",
          value: encodeValue(value),
        },
      },
      limit: 1000,
    },
  });

  return (response.body || [])
    .map((entry) => entry.document)
    .filter(Boolean);
}

async function deleteDocumentByName(client, documentName) {
  await client.delete(`/${documentName}`);
}

async function deleteCourseScopedData(client, courseId) {
  for (const collectionName of COURSE_SCOPED_COLLECTIONS) {
    const docs = await runQuery(client, collectionName, "courseId", courseId);
    for (const doc of docs) {
      await deleteDocumentByName(client, doc.name);
    }
  }
}

function getInstitutionOwnerId(courseDoc) {
  return getStringField(courseDoc, "createdByInstitutionId") || getStringField(courseDoc, "institutionId");
}

function getTeacherOwnerId(courseDoc) {
  return getStringField(courseDoc, "teacherId");
}

function describeCourse(courseDoc, collectionName) {
  return {
    id: getDocumentId(courseDoc.name),
    collectionName,
    code: getStringField(courseDoc, "code"),
    name: getStringField(courseDoc, "name"),
    teacherId: getTeacherOwnerId(courseDoc),
    institutionId: getInstitutionOwnerId(courseDoc),
  };
}

async function buildOwnerResolvers(client) {
  const userExistsCache = new Map();
  const institutionExistsCache = new Map();

  const hasUserProfile = async (userId) => {
    if (!userId) return false;
    if (userExistsCache.has(userId)) return userExistsCache.get(userId);

    const [userDoc, studentDoc] = await Promise.all([
      getDocument(client, "usuarios", userId),
      getDocument(client, "estudiantes", userId),
    ]);
    const exists = Boolean(userDoc || studentDoc);
    userExistsCache.set(userId, exists);
    return exists;
  };

  const hasInstitutionOwner = async (institutionId) => {
    if (!institutionId) return false;
    if (institutionExistsCache.has(institutionId)) return institutionExistsCache.get(institutionId);

    const [institutionDoc, userProfileExists] = await Promise.all([
      getDocument(client, "instituciones", institutionId),
      hasUserProfile(institutionId),
    ]);
    const exists = Boolean(userProfileExists);
    institutionExistsCache.set(institutionId, exists);
    return exists;
  };

  return {
    hasUserProfile,
    hasInstitutionOwner,
  };
}

async function findOrphanedCourses(client) {
  const ownerResolvers = await buildOwnerResolvers(client);
  const orphanedCourses = [];

  for (const collectionName of COURSE_COLLECTIONS) {
    const courseDocs = await listCollection(client, collectionName);

    for (const courseDoc of courseDocs) {
      const institutionId = getInstitutionOwnerId(courseDoc);
      const teacherId = getTeacherOwnerId(courseDoc);
      const summary = describeCourse(courseDoc, collectionName);

      if (institutionId) {
        const institutionExists = await ownerResolvers.hasInstitutionOwner(institutionId);
        if (!institutionExists) {
          orphanedCourses.push({
            ...summary,
            reason: "missing-institution-owner",
          });
        }
        continue;
      }

      if (teacherId) {
        const teacherExists = await ownerResolvers.hasUserProfile(teacherId);
        if (!teacherExists) {
          orphanedCourses.push({
            ...summary,
            reason: "missing-teacher-owner",
          });
        }
      }
    }
  }

  return orphanedCourses;
}

async function deleteOrphanedCourse(client, course) {
  const basePath = getBaseDocumentPath(FIREBASE_PROJECT_ID);
  await deleteCourseScopedData(client, course.id);
  await client.delete(`${basePath}/${course.collectionName}/${encodeURIComponent(course.id)}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = getClient();
  const orphanedCourses = await findOrphanedCourses(client);

  if (orphanedCourses.length === 0) {
    console.log("No orphaned courses found.");
    return;
  }

  console.log(
    `${options.apply ? "Deleting" : "Found"} ${orphanedCourses.length} orphaned course(s):`,
  );
  orphanedCourses.forEach((course) => {
    console.log(
      [
        `- [${course.collectionName}]`,
        course.id,
        course.code ? `code=${course.code}` : "",
        course.name ? `name=${course.name}` : "",
        course.teacherId ? `teacherId=${course.teacherId}` : "",
        course.institutionId ? `institutionId=${course.institutionId}` : "",
        `reason=${course.reason}`,
      ]
        .filter(Boolean)
        .join(" "),
    );
  });

  if (!options.apply) {
    console.log("");
    console.log("Dry run only. Re-run with --apply to delete these courses and their course-scoped data.");
    return;
  }

  for (const course of orphanedCourses) {
    await deleteOrphanedCourse(client, course);
  }

  console.log("");
  console.log(`Deleted ${orphanedCourses.length} orphaned course(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
