import { execFileSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";

const FIREBASE_PROJECT_ID = "historiassinnombre";
const PLATFORM_SETTINGS_DOCUMENT = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/adminConfig/platformSettings`;

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
  const value = decodeValue(doc?.fields?.[fieldName]);
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function listCollection(client, collectionName) {
  const basePath = `/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
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

async function getDocument(client, documentPath) {
  try {
    const response = await client.get(`/${documentPath}`);
    return response.body || null;
  } catch (error) {
    const status = Number(error?.context?.response?.statusCode || error?.status || 0);
    if (status === 404) return null;
    throw error;
  }
}

async function patchDocument(client, documentPath, fieldChanges) {
  const currentDocument = await getDocument(client, documentPath);
  const nextFields = {
    ...(currentDocument?.fields || {}),
  };

  for (const [key, value] of Object.entries(fieldChanges)) {
    nextFields[key] = encodeValue(value);
  }

  await client.patch(`/${documentPath}`, {
    fields: nextFields,
  });
}

function normalizeRole(value) {
  if (
    value === "docente" ||
    value === "teacher" ||
    value === "profesor" ||
    value === "professor" ||
    value === "instructor"
  ) {
    return "teacher";
  }
  if (
    value === "estudiante" ||
    value === "student" ||
    value === "alumno" ||
    value === "learner"
  ) {
    return "student";
  }
  if (value === "admin" || value === "administrator") {
    return "admin";
  }
  if (
    value === "institucion" ||
    value === "institution" ||
    value === "organization" ||
    value === "organizacion"
  ) {
    return "institution";
  }
  return "other";
}

async function main() {
  const client = getClient();
  const userDocuments = await listCollection(client, "usuarios");

  let teacherCount = 0;
  let studentCount = 0;
  let adminCount = 0;
  let institutionCount = 0;
  let otherCount = 0;

  userDocuments.forEach((document) => {
    const role = normalizeRole(getStringField(document, "role"));
    if (role === "teacher") {
      teacherCount += 1;
      return;
    }
    if (role === "student") {
      studentCount += 1;
      return;
    }
    if (role === "admin") {
      adminCount += 1;
      return;
    }
    if (role === "institution") {
      institutionCount += 1;
      return;
    }
    otherCount += 1;
  });

  const publicActiveUsersCount = userDocuments.length;
  const updatedAt = new Date().toISOString();

  await patchDocument(client, PLATFORM_SETTINGS_DOCUMENT, {
    publicActiveUsersCount,
    publicTeacherUsersCount: teacherCount,
    publicStudentUsersCount: studentCount,
    publicAdminUsersCount: adminCount,
    publicInstitutionUsersCount: institutionCount,
    publicOtherUsersCount: otherCount,
    publicUsersCountUpdatedAt: updatedAt,
  });

  console.log(`Synced publicActiveUsersCount=${publicActiveUsersCount}`);
  console.log(
    JSON.stringify(
      {
        teacherCount,
        studentCount,
        adminCount,
        institutionCount,
        otherCount,
        updatedAt,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
