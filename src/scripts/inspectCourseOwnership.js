import { execFileSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";

const FIREBASE_PROJECT_ID = "historiassinnombre";

function parseArgs(argv) {
  const result = {
    code: "",
    courseId: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--code") {
      result.code = String(argv[index + 1] || "").trim().toUpperCase();
      index += 1;
      continue;
    }
    if (token === "--course-id") {
      result.courseId = String(argv[index + 1] || "").trim();
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

async function runQuery(client, collectionName, fieldPath, value) {
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
      limit: 20,
    },
  });

  return (response.body || [])
    .map((entry) => entry.document)
    .filter(Boolean);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.code && !options.courseId) {
    throw new Error("Use --code CODE or --course-id ID.");
  }

  const client = getClient();
  const courseDocs = options.courseId
    ? [await getDocument(client, "cursos", options.courseId)].filter(Boolean)
    : await runQuery(client, "cursos", "code", options.code);

  if (courseDocs.length === 0) {
    console.log("No matching course found.");
    return;
  }

  for (const courseDoc of courseDocs) {
    const teacherId = getStringField(courseDoc, "teacherId");
    const institutionId =
      getStringField(courseDoc, "createdByInstitutionId") || getStringField(courseDoc, "institutionId");
    const payload = {
      id: getDocumentId(courseDoc.name),
      code: getStringField(courseDoc, "code"),
      name: getStringField(courseDoc, "name"),
      teacherId,
      teacherName: getStringField(courseDoc, "teacherName"),
      institutionId,
      institutionName:
        getStringField(courseDoc, "createdByInstitutionName") || getStringField(courseDoc, "institutionName"),
      teacherUserExists: Boolean(teacherId && (await getDocument(client, "usuarios", teacherId))),
      teacherStudentExists: Boolean(teacherId && (await getDocument(client, "estudiantes", teacherId))),
      institutionDocExists: Boolean(institutionId && (await getDocument(client, "instituciones", institutionId))),
      institutionUserExists: Boolean(institutionId && (await getDocument(client, "usuarios", institutionId))),
      institutionStudentExists: Boolean(institutionId && (await getDocument(client, "estudiantes", institutionId))),
    };

    console.log(JSON.stringify(payload, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
