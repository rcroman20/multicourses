import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";

const OWNER_ADMIN_EMAIL = "rcroman20@gmail.com";
const ADMIN_EMAILS_STORAGE_KEY = "multicourses:extra-admin-emails";

export function normalizeAdminEmail(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readExtraAdminEmails(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(ADMIN_EMAILS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return Array.from(
      new Set(
        parsed
          .map((value) => normalizeAdminEmail(String(value)))
          .filter((email) => email.length > 0 && email !== OWNER_ADMIN_EMAIL),
      ),
    );
  } catch {
    return [];
  }
}

function writeExtraAdminEmails(emails: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ADMIN_EMAILS_STORAGE_KEY, JSON.stringify(emails));
}

export function getOwnerAdminEmail(): string {
  return OWNER_ADMIN_EMAIL;
}

export function isOwnerAdminEmail(email?: string | null): boolean {
  return normalizeAdminEmail(email) === OWNER_ADMIN_EMAIL;
}

export function getAdminEmails(): string[] {
  const unique = new Set<string>([OWNER_ADMIN_EMAIL, ...readExtraAdminEmails()]);
  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

export function isAdminEmail(email?: string | null): boolean {
  const normalized = normalizeAdminEmail(email);
  if (!normalized) return false;
  return getAdminEmails().includes(normalized);
}

export function addAdminEmail(email: string): { ok: boolean; message: string } {
  const normalized = normalizeAdminEmail(email);
  if (!normalized) return { ok: false, message: "Email is required." };
  if (!isValidEmail(normalized)) return { ok: false, message: "Enter a valid email address." };

  const currentAdmins = getAdminEmails();
  if (currentAdmins.includes(normalized)) {
    return { ok: false, message: "This email already has admin access." };
  }

  const extras = readExtraAdminEmails();
  writeExtraAdminEmails(Array.from(new Set([...extras, normalized])));
  return { ok: true, message: "Admin email added successfully." };
}

export function removeAdminEmail(email: string): { ok: boolean; message: string } {
  const normalized = normalizeAdminEmail(email);
  if (!normalized) return { ok: false, message: "Email is required." };
  if (normalized === OWNER_ADMIN_EMAIL) {
    return { ok: false, message: "Owner admin cannot be removed." };
  }

  const extras = readExtraAdminEmails();
  if (!extras.includes(normalized)) {
    return { ok: false, message: "Admin email not found." };
  }

  writeExtraAdminEmails(extras.filter((entry) => entry !== normalized));
  return { ok: true, message: "Admin email removed successfully." };
}

export async function getAdminUserIds(): Promise<string[]> {
  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) return [];

  const foundIds = new Set<string>();

  for (const email of adminEmails) {
    try {
      const [usersSnap, studentsSnap] = await Promise.all([
        getDocs(
          query(
            collection(firebaseDB, "usuarios"),
            where("email", "==", email),
            limit(1),
          ),
        ),
        getDocs(
          query(
            collection(firebaseDB, "estudiantes"),
            where("email", "==", email),
            limit(1),
          ),
        ),
      ]);

      usersSnap.docs.forEach((docSnap) => foundIds.add(docSnap.id));
      studentsSnap.docs.forEach((docSnap) => foundIds.add(docSnap.id));
    } catch {
      // Ignore lookup issues for specific emails.
    }
  }

  return Array.from(foundIds);
}
