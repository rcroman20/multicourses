// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, limit, serverTimestamp } from 'firebase/firestore';
import { firebaseAuth, firebaseDB } from '@/lib/firebase';
import { isAdminEmail } from '@/lib/services/adminAccessService';
import {
  isAccountMarkedDeleted,
  processDueAccountDeletionRequests,
} from '@/lib/services/accountDeletionService';
import {
  resolveTeacherPlanId,
  type TeacherPlanId,
} from "@/lib/services/teacherPlanService";
import {
  closeTeacherOnboardingIfExpired,
  ensureTeacherOnboardingEnrollment,
} from "@/lib/services/teacherOnboardingService";

export type UserRole = 'docente' | 'estudiante' | 'admin';
export type TeacherApprovalStatus = "pending" | "approved" | "rejected";

export interface UserPreferences {
  notifications: boolean;
  compactSidebar: boolean;
  darkMode: boolean;
  soundEffects: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  requestedRole?: UserRole;
  teacherApprovalStatus?: TeacherApprovalStatus;
  teacherRequestedAt?: Date;
  teacherApprovedAt?: Date;
  teacherRejectedAt?: Date;
  teacherRejectedBy?: string;
  teacherRejectionReason?: string;
  teacherPaymentInstructions?: string;
  teacherPaymentRequestedAt?: Date;
  teacherPaymentRequestedBy?: string;
  teacherPlanId?: TeacherPlanId;
  teacherPlanName?: string;
  teacherPlanPriceCop?: number;
  teacherPlanDurationMonths?: number;
  teacherPlanDurationLabel?: string;
  teacherPlanCourseLimit?: number;
  teacherPlanStudentLimit?: number;
  teacherPlanAnalyticsLabel?: string;
  teacherPlanSupportLabel?: string;
  teacherPlanAssignedAt?: Date;
  teacherPlanExpiresAt?: Date;
  teacherPlanStatus?: "active" | "expired" | "pending_payment";
  avatarUrl?: string;
  avatarEmoji?: string;
  avatarSetupCompleted?: boolean;
  bio?: string;
  phone?: string;
  location?: string;
  website?: string;
  instagram?: string;
  preferences?: UserPreferences;
  createdAt: Date;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (
    updates: Partial<
      Pick<
        User,
        "name" | "avatarUrl" | "avatarEmoji" | "avatarSetupCompleted" | "bio" | "phone" | "location" | "website" | "instagram" | "preferences"
      >
    >,
  ) => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const normalizeEmail = (value?: string | null): string =>
  (value || "").trim().toLowerCase();

const normalizeUserRole = (value: unknown): UserRole | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();

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

  if (
    normalized === "admin" ||
    normalized === "administrador" ||
    normalized === "administrator"
  ) {
    return "admin";
  }

  return null;
};

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return undefined;
    }
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Cargar información adicional del usuario desde Firestore
  const loadUserData = async (firebaseUser: FirebaseUser): Promise<User> => {
    try {
      const [userDoc, studentDoc] = await Promise.all([
        getDoc(doc(firebaseDB, 'usuarios', firebaseUser.uid)),
        getDoc(doc(firebaseDB, 'estudiantes', firebaseUser.uid)),
      ]);

      const userData = userDoc.exists() ? userDoc.data() : null;
      const studentData = studentDoc.exists() ? studentDoc.data() : null;
      const roleFromUserDoc =
        normalizeUserRole(userData?.role) ||
        normalizeUserRole((userData as { userRole?: unknown } | null)?.userRole);
      const roleFromStudentDoc =
        normalizeUserRole(studentData?.role) ||
        normalizeUserRole((studentData as { userRole?: unknown } | null)?.userRole);
      const requestedRoleFromUserDoc = normalizeUserRole(userData?.requestedRole);
      const requestedRoleFromStudentDoc = normalizeUserRole(studentData?.requestedRole);
      const requestedRole = requestedRoleFromUserDoc || requestedRoleFromStudentDoc || null;
      const rawApprovalStatus =
        (typeof userData?.teacherApprovalStatus === "string"
          ? userData.teacherApprovalStatus
          : typeof studentData?.teacherApprovalStatus === "string"
            ? studentData.teacherApprovalStatus
            : ""
        )
          .trim()
          .toLowerCase();

      let resolvedRole: UserRole | null = roleFromUserDoc || roleFromStudentDoc;
      const isKnownAdmin = isAdminEmail(firebaseUser.email);

      // Fallback: if the user owns at least one course, treat as teacher.
      if (!resolvedRole) {
        try {
          const teacherCoursesSnap = await getDocs(
            query(
              collection(firebaseDB, "courses"),
              where("teacherId", "==", firebaseUser.uid),
              limit(1),
            ),
          );
          resolvedRole = teacherCoursesSnap.empty ? "estudiante" : "docente";
        } catch {
          resolvedRole = "estudiante";
        }
      }

      if (isKnownAdmin) {
        resolvedRole = "admin";
      }
      let teacherApprovalStatus: TeacherApprovalStatus | undefined;
      if (resolvedRole !== "admin") {
        if (
          rawApprovalStatus === "pending" ||
          rawApprovalStatus === "approved" ||
          rawApprovalStatus === "rejected"
        ) {
          teacherApprovalStatus = rawApprovalStatus as TeacherApprovalStatus;
        } else if (requestedRole === "docente") {
          teacherApprovalStatus = resolvedRole === "docente" ? "approved" : "pending";
        }
      }

      // Safety: only auto-persist teacher role, never auto-downgrade to student.
      const userDocRole = normalizeUserRole(userData?.role);
      if (resolvedRole === "docente" && userDocRole !== "docente") {
        try {
          await setDoc(
            doc(firebaseDB, "usuarios", firebaseUser.uid),
            {
              id: firebaseUser.uid,
              email: firebaseUser.email || "",
              name:
                userData?.name ||
                studentData?.name ||
                firebaseUser.displayName ||
                "Usuario",
              role: "docente",
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        } catch {
          // Ignore persistence issues; runtime role resolution remains correct.
        }
      }

      if (resolvedRole === "admin" && userDocRole !== "admin") {
        try {
          const adminPayload = {
            id: firebaseUser.uid,
            email: firebaseUser.email || "",
            name:
              userData?.name ||
              studentData?.name ||
              firebaseUser.displayName ||
              "Usuario",
            role: "admin",
            updatedAt: serverTimestamp(),
          };

          await Promise.all([
            setDoc(doc(firebaseDB, "usuarios", firebaseUser.uid), adminPayload, { merge: true }),
            setDoc(doc(firebaseDB, "estudiantes", firebaseUser.uid), adminPayload, { merge: true }),
          ]);
        } catch {
          // Ignore persistence issues; runtime role resolution remains correct.
        }
      }

      if (userData || studentData) {
        const finalRole = resolvedRole || 'estudiante';
        const planIdRaw =
          typeof userData?.teacherPlanId === "string"
            ? userData.teacherPlanId
            : typeof studentData?.teacherPlanId === "string"
              ? studentData.teacherPlanId
              : "";
        const teacherPlanId = resolveTeacherPlanId(planIdRaw) || undefined;
        const planStatusRaw =
          typeof userData?.teacherPlanStatus === "string"
            ? userData.teacherPlanStatus
            : typeof studentData?.teacherPlanStatus === "string"
              ? studentData.teacherPlanStatus
              : "";
        const teacherPlanStatus =
          planStatusRaw === "active" ||
          planStatusRaw === "expired" ||
          planStatusRaw === "pending_payment"
            ? (planStatusRaw as "active" | "expired" | "pending_payment")
            : undefined;

        return {
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          name:
            userData?.name ||
            studentData?.name ||
            firebaseUser.displayName ||
            'Usuario',
          role: finalRole,
          requestedRole:
            finalRole === "admin"
              ? undefined
              : requestedRole || (finalRole === "docente" ? "docente" : "estudiante"),
          teacherApprovalStatus,
          teacherRequestedAt: toDate(userData?.teacherRequestedAt) || toDate(studentData?.teacherRequestedAt),
          teacherApprovedAt: toDate(userData?.teacherApprovedAt) || toDate(studentData?.teacherApprovedAt),
          teacherRejectedAt: toDate(userData?.teacherRejectedAt) || toDate(studentData?.teacherRejectedAt),
          teacherRejectedBy:
            typeof userData?.teacherRejectedBy === "string"
              ? userData.teacherRejectedBy
              : typeof studentData?.teacherRejectedBy === "string"
                ? studentData.teacherRejectedBy
                : undefined,
          teacherRejectionReason:
            typeof userData?.teacherRejectionReason === "string"
              ? userData.teacherRejectionReason
              : typeof userData?.teacherRejectedReason === "string"
                ? userData.teacherRejectedReason
              : typeof studentData?.teacherRejectionReason === "string"
                ? studentData.teacherRejectionReason
                : typeof studentData?.teacherRejectedReason === "string"
                ? studentData.teacherRejectedReason
                : undefined,
          teacherPaymentInstructions:
            typeof userData?.teacherPaymentInstructions === "string"
              ? userData.teacherPaymentInstructions
              : typeof studentData?.teacherPaymentInstructions === "string"
                ? studentData.teacherPaymentInstructions
                : undefined,
          teacherPaymentRequestedAt:
            toDate(userData?.teacherPaymentRequestedAt) ||
            toDate(studentData?.teacherPaymentRequestedAt),
          teacherPaymentRequestedBy:
            typeof userData?.teacherPaymentRequestedBy === "string"
              ? userData.teacherPaymentRequestedBy
              : typeof studentData?.teacherPaymentRequestedBy === "string"
                ? studentData.teacherPaymentRequestedBy
                : undefined,
          teacherPlanId,
          teacherPlanName:
            typeof userData?.teacherPlanName === "string"
              ? userData.teacherPlanName
              : typeof studentData?.teacherPlanName === "string"
                ? studentData.teacherPlanName
                : undefined,
          teacherPlanPriceCop:
            toNumber(userData?.teacherPlanPriceCop) ??
            toNumber(studentData?.teacherPlanPriceCop),
          teacherPlanDurationMonths:
            toNumber(userData?.teacherPlanDurationMonths) ??
            toNumber(studentData?.teacherPlanDurationMonths),
          teacherPlanDurationLabel:
            typeof userData?.teacherPlanDurationLabel === "string"
              ? userData.teacherPlanDurationLabel
              : typeof studentData?.teacherPlanDurationLabel === "string"
                ? studentData.teacherPlanDurationLabel
                : undefined,
          teacherPlanCourseLimit:
            toNumber(userData?.teacherPlanCourseLimit) ??
            toNumber(studentData?.teacherPlanCourseLimit),
          teacherPlanStudentLimit:
            toNumber(userData?.teacherPlanStudentLimit) ??
            toNumber(studentData?.teacherPlanStudentLimit),
          teacherPlanAnalyticsLabel:
            typeof userData?.teacherPlanAnalyticsLabel === "string"
              ? userData.teacherPlanAnalyticsLabel
              : typeof studentData?.teacherPlanAnalyticsLabel === "string"
                ? studentData.teacherPlanAnalyticsLabel
                : undefined,
          teacherPlanSupportLabel:
            typeof userData?.teacherPlanSupportLabel === "string"
              ? userData.teacherPlanSupportLabel
              : typeof studentData?.teacherPlanSupportLabel === "string"
                ? studentData.teacherPlanSupportLabel
                : undefined,
          teacherPlanAssignedAt:
            toDate(userData?.teacherPlanAssignedAt) ||
            toDate(studentData?.teacherPlanAssignedAt),
          teacherPlanExpiresAt:
            toDate(userData?.teacherPlanExpiresAt) ||
            toDate(studentData?.teacherPlanExpiresAt),
          teacherPlanStatus,
          avatarUrl: userData?.avatarUrl || studentData?.avatarUrl || '',
          avatarEmoji: userData?.avatarEmoji || studentData?.avatarEmoji || '',
          avatarSetupCompleted:
            Boolean(userData?.avatarSetupCompleted) ||
            Boolean(studentData?.avatarSetupCompleted) ||
            Boolean((userData?.avatarUrl || studentData?.avatarUrl || '').trim()) ||
            Boolean((userData?.avatarEmoji || studentData?.avatarEmoji || '').trim()),
          bio: userData?.bio || studentData?.bio || '',
          location: userData?.location || studentData?.location || '',
          website: userData?.website || studentData?.website || '',
          instagram: userData?.instagram || studentData?.instagram || '',
          phone:
            userData?.phone ||
            userData?.whatsApp ||
            userData?.whatsapp ||
            studentData?.phone ||
            studentData?.whatsApp ||
            studentData?.whatsapp ||
            '',
          preferences: {
            notifications:
              userData?.preferences?.notifications ??
              studentData?.preferences?.notifications ??
              true,
            compactSidebar:
              userData?.preferences?.compactSidebar ??
              studentData?.preferences?.compactSidebar ??
              false,
            darkMode:
              userData?.preferences?.darkMode ??
              studentData?.preferences?.darkMode ??
              false,
            soundEffects:
              userData?.preferences?.soundEffects ??
              studentData?.preferences?.soundEffects ??
              true,
          },
          createdAt:
            userData?.createdAt?.toDate() ||
            studentData?.createdAt?.toDate() ||
            new Date(),
        };
      }
      
      // Usuario por defecto (estudiante)
      return {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || 'Usuario',
        role: isAdminEmail(firebaseUser.email) ? "admin" : "estudiante",
        requestedRole: isAdminEmail(firebaseUser.email) ? undefined : "estudiante",
        preferences: {
          notifications: true,
          compactSidebar: false,
          darkMode: false,
          soundEffects: true,
        },
        createdAt: new Date(),
      };
    } catch (error) {
      return {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || 'Usuario',
        role: isAdminEmail(firebaseUser.email) ? "admin" : "estudiante",
        requestedRole: isAdminEmail(firebaseUser.email) ? undefined : "estudiante",
        preferences: {
          notifications: true,
          compactSidebar: false,
          darkMode: false,
          soundEffects: true,
        },
        createdAt: new Date(),
      };
    }
  };

  // Escuchar cambios en la autenticación
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      setIsLoading(true);
      
      if (firebaseUser) {
        try {
          const deleted = await isAccountMarkedDeleted(firebaseUser.uid);
          if (deleted) {
            await signOut(firebaseAuth);
            setUser(null);
            setIsLoading(false);
            return;
          }

          if (isAdminEmail(firebaseUser.email)) {
            try {
              await processDueAccountDeletionRequests(normalizeEmail(firebaseUser.email));
            } catch {
              // Ignore background cleanup failures.
            }
          }

          const userData = await loadUserData(firebaseUser);
          setUser(userData);

          if (userData.role === "docente") {
            void closeTeacherOnboardingIfExpired(userData.id).catch(() => undefined);

            const teacherIsApproved = userData.teacherApprovalStatus === "approved";
            const paymentIsReady =
              userData.teacherPlanStatus !== "pending_payment" &&
              userData.teacherPlanStatus !== "expired";

            if (teacherIsApproved && paymentIsReady) {
              void ensureTeacherOnboardingEnrollment(userData.id).catch(() => undefined);
            }
          }
        } catch (error) {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const isDarkModeEnabled = Boolean(user?.preferences?.darkMode);

    if (isDarkModeEnabled) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    root.style.colorScheme = isDarkModeEnabled ? "dark" : "light";
  }, [user?.preferences?.darkMode]);

  // Iniciar sesión
  const login = async (email: string, password: string): Promise<void> => {
    try {
      setIsLoading(true);
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Cerrar sesión
  const logout = async (): Promise<void> => {
    try {
      setIsLoading(true);
      await signOut(firebaseAuth);
      setUser(null);
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (
    updates: Partial<
      Pick<
        User,
        "name" | "avatarUrl" | "avatarEmoji" | "avatarSetupCompleted" | "bio" | "phone" | "location" | "website" | "instagram" | "preferences"
      >
    >,
  ): Promise<void> => {
    if (!user) {
      throw new Error("No authenticated user");
    }
    const nextName = updates.name?.trim();

    const userRef = doc(firebaseDB, 'usuarios', user.id);
    const studentRef = doc(firebaseDB, 'estudiantes', user.id);

    const [userDoc, studentDoc] = await Promise.all([
      getDoc(userRef),
      getDoc(studentRef),
    ]);
    const profilePayload: Record<string, unknown> = {
      role: user.role,
      email: user.email,
      updatedAt: serverTimestamp(),
    };

    if (nextName !== undefined && nextName.length > 0) profilePayload.name = nextName;
    if (updates.avatarUrl !== undefined) profilePayload.avatarUrl = updates.avatarUrl.trim();
    if (updates.avatarEmoji !== undefined) profilePayload.avatarEmoji = updates.avatarEmoji;
    if (updates.avatarSetupCompleted === true) profilePayload.avatarSetupCompleted = true;
    if (updates.bio !== undefined) profilePayload.bio = updates.bio.trim();
    if (updates.phone !== undefined) profilePayload.phone = updates.phone.trim();
    if (updates.location !== undefined) profilePayload.location = updates.location.trim();
    if (updates.website !== undefined) profilePayload.website = updates.website.trim();
    if (updates.instagram !== undefined) profilePayload.instagram = updates.instagram.trim();
    if (updates.preferences !== undefined) profilePayload.preferences = updates.preferences;

    if (userDoc.exists()) {
      await updateDoc(userRef, profilePayload);
    } else {
      await setDoc(
        userRef,
        {
          ...profilePayload,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    if (nextName && studentDoc.exists()) {
      await updateDoc(studentRef, {
        name: nextName,
        updatedAt: serverTimestamp(),
      });
    }

    setUser((prev) =>
      prev
        ? {
            ...prev,
            ...(nextName ? { name: nextName } : {}),
            ...(updates.avatarUrl !== undefined ? { avatarUrl: updates.avatarUrl.trim() } : {}),
            ...(updates.avatarEmoji !== undefined ? { avatarEmoji: updates.avatarEmoji } : {}),
            ...(updates.avatarSetupCompleted === true ? { avatarSetupCompleted: true } : {}),
            ...(updates.bio !== undefined ? { bio: updates.bio.trim() } : {}),
            ...(updates.phone !== undefined ? { phone: updates.phone.trim() } : {}),
            ...(updates.location !== undefined ? { location: updates.location.trim() } : {}),
            ...(updates.website !== undefined ? { website: updates.website.trim() } : {}),
            ...(updates.instagram !== undefined ? { instagram: updates.instagram.trim() } : {}),
            ...(updates.preferences !== undefined ? { preferences: updates.preferences } : {}),
          }
        : prev,
    );
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        updateProfile,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useRequireAuth(requiredRole?: UserRole) {
  const { user, isAuthenticated, isLoading } = useAuth();

  const hasAccess = isAuthenticated && (!requiredRole || user?.role === requiredRole);

  return {
    user,
    isAuthenticated,
    isLoading,
    hasAccess,
    isAdmin: user?.role === 'admin',
    isTeacher: user?.role === 'docente',
    isStudent: user?.role === 'estudiante',
  };
}
