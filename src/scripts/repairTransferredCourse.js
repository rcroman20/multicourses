import { execFileSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";

const FIREBASE_PROJECT_ID = "historiassinnombre";

function parseArgs(argv) {
  const result = {
    apply: false,
    teacherEmail: "",
    courseId: "",
    courseCode: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      result.apply = true;
      continue;
    }
    if (token === "--teacher-email") {
      result.teacherEmail = String(argv[index + 1] || "").trim().toLowerCase();
      index += 1;
      continue;
    }
    if (token === "--course-id") {
      result.courseId = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (token === "--course-code") {
      result.courseCode = String(argv[index + 1] || "").trim();
      index += 1;
    }
  }

  return result;
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

async function runQuery(client, collectionId, fieldPath, value) {
  const basePath = getBaseDocumentPath(FIREBASE_PROJECT_ID);
  const response = await client.post(`${basePath}:runQuery`, {
    structuredQuery: {
      from: [{ collectionId }],
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

async function patchDocument(client, document, fieldChanges) {
  const nextFields = {
    ...(document.fields || {}),
    updatedAt: encodeValue(new Date()),
  };

  for (const [key, value] of Object.entries(fieldChanges)) {
    nextFields[key] = encodeValue(value);
  }

  await client.patch(`/${document.name}`, {
    fields: nextFields,
  });
}

async function findTeacherByEmail(client, email) {
  const [userDocs, studentDocs] = await Promise.all([
    runQuery(client, "usuarios", "email", email),
    runQuery(client, "estudiantes", "email", email),
  ]);

  const doc = userDocs[0] || studentDocs[0];
  if (!doc) return null;

  return {
    id: getDocumentId(doc.name),
    name: getStringField(doc, "name") || email.split("@")[0] || "Teacher",
    source: doc.name.includes("/usuarios/") ? "usuarios" : "estudiantes",
  };
}

async function resolveCourses(client, options, teacherId) {
  if (options.courseId) {
    const docs = await runQuery(client, "cursos", "teacherId", teacherId);
    return docs.filter((doc) => getDocumentId(doc.name) === options.courseId);
  }

  if (options.courseCode) {
    const docs = await runQuery(client, "cursos", "code", options.courseCode);
    return docs.filter((doc) => getStringField(doc, "teacherId") === teacherId);
  }

  return runQuery(client, "cursos", "teacherId", teacherId);
}

function addMismatch(targetMap, document, fieldChanges) {
  const existing = targetMap.get(document.name) || {};
  targetMap.set(document.name, {
    document,
    fieldChanges: {
      ...existing.fieldChanges,
      ...fieldChanges,
    },
  });
}

async function inspectCourse(client, courseDoc) {
  const courseId = getDocumentId(courseDoc.name);
  const courseCode = getStringField(courseDoc, "code");
  const courseName = getStringField(courseDoc, "name");
  const teacherId = getStringField(courseDoc, "teacherId");
  const teacherName = getStringField(courseDoc, "teacherName");

  const mismatches = new Map();
  const touchedModernWeekIds = new Set();
  const touchedLegacyWeekIds = new Set();
  const touchedFileIds = new Set();

  const [periodDocs, unitDocs, gradeSheetDocs, evaluationDocs, assessmentDocs] = await Promise.all([
    runQuery(client, "periods", "courseId", courseId),
    runQuery(client, "unidades", "courseId", courseId),
    runQuery(client, "gradeSheets", "courseId", courseId),
    runQuery(client, "evaluaciones", "courseId", courseId),
    runQuery(client, "assessments", "courseId", courseId),
  ]);

  for (const doc of [...gradeSheetDocs, ...evaluationDocs, ...assessmentDocs]) {
    const nextChanges = {};
    if (getStringField(doc, "teacherId") !== teacherId) nextChanges.teacherId = teacherId;
    if (getStringField(doc, "teacherName") !== teacherName) nextChanges.teacherName = teacherName;
    if (Object.keys(nextChanges).length > 0) addMismatch(mismatches, doc, nextChanges);
  }

  for (const periodDoc of periodDocs) {
    const periodId = getDocumentId(periodDoc.name);
    if (getStringField(periodDoc, "courseId") !== courseId) {
      addMismatch(mismatches, periodDoc, { courseId });
    }

    const [filesByPeriod, weeksByPeriod] = await Promise.all([
      runQuery(client, "course_files", "periodId", periodId),
      runQuery(client, "weeks", "periodId", periodId),
    ]);

    for (const fileDoc of filesByPeriod) {
      touchedFileIds.add(fileDoc.name);
      if (getStringField(fileDoc, "courseId") !== courseId) {
        addMismatch(mismatches, fileDoc, { courseId });
      }
    }

    for (const weekDoc of weeksByPeriod) {
      touchedModernWeekIds.add(weekDoc.name);
      if (getStringField(weekDoc, "courseId") !== courseId) {
        addMismatch(mismatches, weekDoc, { courseId });
      }

      const filesByWeek = await runQuery(client, "course_files", "weekId", getDocumentId(weekDoc.name));
      for (const fileDoc of filesByWeek) {
        touchedFileIds.add(fileDoc.name);
        if (getStringField(fileDoc, "courseId") !== courseId) {
          addMismatch(mismatches, fileDoc, { courseId });
        }
      }
    }
  }

  const modernWeekDocs = await runQuery(client, "weeks", "courseId", courseId);
  for (const weekDoc of modernWeekDocs) {
    touchedModernWeekIds.add(weekDoc.name);
    const filesByWeek = await runQuery(client, "course_files", "weekId", getDocumentId(weekDoc.name));
    for (const fileDoc of filesByWeek) {
      touchedFileIds.add(fileDoc.name);
      if (getStringField(fileDoc, "courseId") !== courseId) {
        addMismatch(mismatches, fileDoc, { courseId });
      }
    }
  }

  const directFileDocs = await runQuery(client, "course_files", "courseId", courseId);
  for (const fileDoc of directFileDocs) {
    touchedFileIds.add(fileDoc.name);
  }

  for (const unitDoc of unitDocs) {
    const legacyWeekDocs = await runQuery(client, "semanas", "unitId", getDocumentId(unitDoc.name));

    for (const weekDoc of legacyWeekDocs) {
      touchedLegacyWeekIds.add(weekDoc.name);
      if (getStringField(weekDoc, "courseId") !== courseId) {
        addMismatch(mismatches, weekDoc, { courseId });
      }

      const [slideDocs, filesByWeek] = await Promise.all([
        runQuery(client, "diapositivas", "weekId", getDocumentId(weekDoc.name)),
        runQuery(client, "course_files", "weekId", getDocumentId(weekDoc.name)),
      ]);

      for (const slideDoc of slideDocs) {
        if (getStringField(slideDoc, "courseId") !== courseId) {
          addMismatch(mismatches, slideDoc, { courseId });
        }
      }

      for (const fileDoc of filesByWeek) {
        touchedFileIds.add(fileDoc.name);
        if (getStringField(fileDoc, "courseId") !== courseId) {
          addMismatch(mismatches, fileDoc, { courseId });
        }
      }
    }
  }

  return {
    id: courseId,
    code: courseCode,
    name: courseName,
    teacherId,
    teacherName,
    counts: {
      periods: periodDocs.length,
      modernWeeks: touchedModernWeekIds.size,
      legacyWeeks: touchedLegacyWeekIds.size,
      files: touchedFileIds.size,
      gradeSheets: gradeSheetDocs.length,
      evaluaciones: evaluationDocs.length,
      assessments: assessmentDocs.length,
    },
    fixes: Array.from(mismatches.values()),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.teacherEmail) {
    throw new Error("Use --teacher-email correo@dominio.com");
  }

  const client = getClient();
  const teacher = await findTeacherByEmail(client, options.teacherEmail);
  if (!teacher) {
    throw new Error(`No se encontro docente con email ${options.teacherEmail}`);
  }

  console.log(`Docente: ${teacher.name} (${teacher.id}) [${teacher.source}]`);

  const courseDocs = await resolveCourses(client, options, teacher.id);
  if (courseDocs.length === 0) {
    console.log("No se encontraron cursos para revisar.");
    return;
  }

  const reports = [];
  for (const courseDoc of courseDocs) {
    reports.push(await inspectCourse(client, courseDoc));
  }

  for (const report of reports) {
    console.log(`\nCurso: ${report.name} [${report.code}] (${report.id})`);
    console.log(
      `Conteos: periods=${report.counts.periods}, weeks=${report.counts.modernWeeks}, legacyWeeks=${report.counts.legacyWeeks}, files=${report.counts.files}, gradeSheets=${report.counts.gradeSheets}, evaluaciones=${report.counts.evaluaciones}, assessments=${report.counts.assessments}`,
    );
    console.log(`Registros por reparar: ${report.fixes.length}`);
  }

  const fixes = reports.flatMap((report) => report.fixes);
  if (fixes.length === 0) {
    console.log("\nNo hay reparaciones pendientes.");
    return;
  }

  if (!options.apply) {
    console.log("\nInspeccion completada. Ejecuta con --apply para reparar.");
    return;
  }

  for (const [index, item] of fixes.entries()) {
    await patchDocument(client, item.document, item.fieldChanges);
    if ((index + 1) % 25 === 0 || index + 1 === fixes.length) {
      console.log(`Aplicados ${index + 1} / ${fixes.length}`);
    }
  }

  console.log("\nReparacion completada.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
