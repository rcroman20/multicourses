// src/pages/AuthPage.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  BookOpen,
  User,
  Smartphone,
  Hash,
  X,
  Sparkles,
  Zap,
  Target,
  GraduationCap,
  BriefcaseBusiness,
} from "lucide-react";
import { z } from "zod";
import { firebaseAuth, firebaseDB } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { isTeacherPlanExpired } from "@/lib/services/teacherPlanAccessService";
import { isAccountMarkedDeleted } from "@/lib/services/accountDeletionService";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  idNumber: z.string().min(5, "ID must be at least 5 characters"),
  whatsApp: z.string().min(10, "Please enter a valid WhatsApp number"),
  selectedRole: z.enum(["estudiante", "docente"]),
});

const parseAuthError = (error: unknown): { code?: string; message?: string } => {
  if (!error || typeof error !== "object") return {};
  const maybeError = error as { code?: unknown; message?: unknown };
  return {
    code: typeof maybeError.code === "string" ? maybeError.code : undefined,
    message: typeof maybeError.message === "string" ? maybeError.message : undefined,
  };
};

// Componente separado para el Modal
const ForgotPasswordModal = ({
  isOpen,
  onClose,
  onReset,
}: {
  isOpen: boolean;
  onClose: () => void;
  onReset: (email: string) => Promise<void>;
}) => {
  const [resetEmail, setResetEmail] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setResetEmail("");
    setError("");
    setSuccessMessage("");
    onClose();
  }, [onClose]);

  // Enfocar el input cuando se abre el modal
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Cerrar modal con Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, handleClose]);

  // Prevenir scroll del body cuando el modal está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Importante: prevenir propagación

    setError("");
    setSuccessMessage("");

    if (!resetEmail.trim()) {
      setError("Please enter your email address");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resetEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    setIsLoading(true);

    try {
      await onReset(resetEmail);
      setSuccessMessage(
        "Password reset email sent! Check your inbox for instructions.",
      );
      setResetEmail("");

      setTimeout(() => {
        handleClose();
      }, 3000);
    } catch (err: unknown) {
      const authError = parseAuthError(err);
      if (authError.code === "auth/user-not-found") {
        setError("No account found with this email address");
      } else if (authError.code === "auth/invalid-email") {
        setError("Invalid email address");
      } else if (authError.code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.");
      } else {
        setError(authError.message || "Error sending reset email. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      handleClose();
    }
  };
 
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_28px_70px_-35px_rgba(15,23,42,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Reset password</h3>
                <p className="text-xs text-slate-500">Enter your email to continue</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-3 text-sm text-slate-600">
            Enter your email address and we'll send you instructions to reset
            your password.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {successMessage && (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{successMessage}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="resetEmail" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Email Address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={inputRef}
                  id="resetEmail"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="your-email@example.com"
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  required
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-sky-500 bg-gradient-to-b from-sky-500 to-sky-600 px-4 text-sm font-semibold text-white shadow-[0_14px_26px_-16px_rgba(2,132,199,0.9)] transition hover:from-sky-600 hover:to-sky-700 disabled:opacity-70"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </button>
            </div>
          </form>

          <div className="mt-4 border-t border-slate-200 pt-3">
            <p className="text-xs text-slate-500">
              Remember your password?{" "}
              <button
                onClick={handleClose}
                className="font-semibold text-sky-700 transition hover:text-sky-800"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [whatsApp, setWhatsApp] = useState("");
  const [selectedRole, setSelectedRole] = useState<"estudiante" | "docente">("estudiante");
  const [isLogin, setIsLogin] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const resolveHomePath = (role?: string) => {
    if (role === "docente") return "/teacher";
    if (role === "admin") return "/admin/dashboard";
    return "/student";
  };

  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === "admin") {
        navigate("/admin/dashboard");
        return;
      }
      const teacherPlanStatus = String(user.teacherPlanStatus || "").trim().toLowerCase();
      if (
        user.requestedRole === "docente" &&
        teacherPlanStatus === "pending_payment"
      ) {
        navigate("/teacher-approval-waiting?reason=payment-pending");
        return;
      }
      if (
        isTeacherPlanExpired({
          role: user.role,
          teacherPlanStatus: user.teacherPlanStatus,
          teacherPlanExpiresAt: user.teacherPlanExpiresAt,
        })
      ) {
        navigate("/teacher-approval-waiting?reason=plan-expired");
        return;
      }
      if (user.requestedRole === "docente" && user.teacherApprovalStatus === "pending") {
        navigate("/teacher-approval-waiting");
        return;
      }
      if (
        user.requestedRole === "docente" &&
        user.teacherApprovalStatus === "rejected" &&
        user.role !== "docente"
      ) {
        navigate("/teacher-approval-rejected");
        return;
      }
      navigate(resolveHomePath(user.role));
    }
  }, [isAuthenticated, navigate, user]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setIsLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
      const uid = credential.user.uid;

      // Guard against orphan Auth accounts (Auth exists, but profile docs were deleted).
      const [deletedMarker, userSnap, studentSnap] = await Promise.all([
        isAccountMarkedDeleted(uid),
        getDoc(doc(firebaseDB, "usuarios", uid)),
        getDoc(doc(firebaseDB, "estudiantes", uid)),
      ]);

      const profileMissing = !userSnap.exists() && !studentSnap.exists();
      if (deletedMarker || profileMissing) {
        // Best effort cleanup so the same credentials stop logging in as "ghost" user.
        await deleteUser(credential.user).catch(() => undefined);
        await signOut(firebaseAuth).catch(() => undefined);
        setError("Email not registered. Please create a new account.");
        return;
      }
    } catch (err: unknown) {
      const authError = parseAuthError(err);
      if (authError.code === "auth/invalid-credential") {
        setError("Incorrect email or password");
      } else if (authError.code === "auth/invalid-login-credentials") {
        setError("Incorrect email or password");
      } else if (authError.code === "auth/user-not-found") {
        setError("Email not registered");
      } else if (authError.code === "auth/wrong-password") {
        setError("Incorrect password");
      } else if (authError.code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.");
      } else if (authError.code === "auth/network-request-failed") {
        setError("Network error. Check your connection and try again.");
      } else {
        setError(authError.message || "Error signing in");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    // Protect owner admin account from being re-registered.
    if (email.trim().toLowerCase() === "rcroman20@gmail.com") {
      setError(
        "This email is reserved as owner admin. Please sign in instead of registering.",
      );
      return;
    }

    const result = registerSchema.safeParse({
      email,
      password,
      name,
      idNumber,
      whatsApp,
      selectedRole,
    });

    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setIsLoading(true);

    try {
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(
          firebaseAuth,
          email,
          password,
        );
      } catch (createError: unknown) {
        const createAuthError = parseAuthError(createError);
        if (createAuthError.code !== "auth/email-already-in-use") {
          throw createError;
        }

        // Spark-compatible recovery:
        // if an Auth account remains after admin data deletion, allow the same
        // person to sign in once, detect deleted state, remove Auth user and retry sign-up.
        try {
          const existingCredential = await signInWithEmailAndPassword(
            firebaseAuth,
            email,
            password,
          );
          const existingUid = existingCredential.user.uid;
          const [deletedMarker, userSnap, studentSnap] = await Promise.all([
            isAccountMarkedDeleted(existingUid),
            getDoc(doc(firebaseDB, "usuarios", existingUid)),
            getDoc(doc(firebaseDB, "estudiantes", existingUid)),
          ]);

          const accountLooksDeleted =
            deletedMarker || (!userSnap.exists() && !studentSnap.exists());

          if (!accountLooksDeleted) {
            await signOut(firebaseAuth).catch(() => undefined);
            throw createError;
          }

          await deleteUser(existingCredential.user);
          await signOut(firebaseAuth).catch(() => undefined);

          userCredential = await createUserWithEmailAndPassword(
            firebaseAuth,
            email,
            password,
          );
        } catch (recoveryError: unknown) {
          const recoveryAuthError = parseAuthError(recoveryError);
          if (
            recoveryAuthError.code === "auth/invalid-credential" ||
            recoveryAuthError.code === "auth/wrong-password" ||
            recoveryAuthError.code === "auth/invalid-login-credentials"
          ) {
            setError(
              "This email is already in use. If this was a deleted account, sign in with the previous password (or reset it) once to complete cleanup, then register again.",
            );
            return;
          }
          throw createError;
        }
      }

      if (!userCredential) {
        throw new Error("Could not create user account.");
      }

      const user = userCredential.user;
      const wantsTeacherRole = selectedRole === "docente";
      const role = "estudiante";
      const teacherApprovalStatus = wantsTeacherRole ? "pending" : "approved";
      const now = new Date();

      // 1. Save to /users
      await setDoc(doc(firebaseDB, "usuarios", user.uid), {
        id: user.uid,
        email,
        name,
        idNumber,
        role,
        whatsApp,
        createdAt: now,
        requestedRole: selectedRole,
        teacherApprovalStatus,
        ...(wantsTeacherRole ? { teacherRequestedAt: now } : {}),
        ...(wantsTeacherRole ? { teacherRequestCount: 1 } : {}),
      });

      // 2. Also save to /students
      await setDoc(doc(firebaseDB, "estudiantes", user.uid), {
        id: user.uid,
        idNumber,
        email,
        name,
        role,
        whatsApp,
        createdAt: now,
        requestedRole: selectedRole,
        teacherApprovalStatus,
        ...(wantsTeacherRole ? { teacherRequestedAt: now } : {}),
        ...(wantsTeacherRole ? { teacherRequestCount: 1 } : {}),
      });

      setSuccessMessage(
        wantsTeacherRole
          ? "Teacher account request created. An admin must approve it before teacher features are enabled."
          : "Student account created successfully! You can now sign in.",
      );
    } catch (err: unknown) {
      const authError = parseAuthError(err);
      if (authError.code === "auth/email-already-in-use") {
        setError("This email is already registered. Please sign in instead.");
      } else if (authError.code === "auth/weak-password") {
        setError("Password is too weak. Use at least 6 characters.");
      } else if (authError.code === "auth/operation-not-allowed") {
        setError("Email/password sign up is not enabled in Firebase Auth.");
      } else if (authError.code === "auth/network-request-failed") {
        setError("Network error. Check your connection and try again.");
      } else if (authError.code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.");
      } else {
        setError(authError.message || "Error registering user");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (email: string) => {
    await sendPasswordResetEmail(firebaseAuth, email);
  };

  return (
    <>
      <div className="relative min-h-screen overflow-x-hidden bg-slate-100 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="pointer-events-none absolute -left-16 top-6 h-44 w-44 rounded-full bg-white/80 blur-[40px]" />
        <div className="pointer-events-none absolute -right-14 bottom-8 h-52 w-52 rounded-full bg-slate-300/60 blur-[44px]" />

        <div className="relative mx-auto w-full max-w-[1320px]">
          <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="grid grid-cols-1 gap-4 xl:items-start xl:grid-cols-[minmax(0,1.05fr)_460px]">
              <section className="relative self-start overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-5 shadow-sm lg:p-6">
                <div className="pointer-events-none absolute -left-[70px] -top-[90px] h-[180px] w-[180px] rounded-full bg-sky-300/25" />
                <div className="pointer-events-none absolute -right-[90px] -bottom-[90px] h-[200px] w-[200px] rounded-full bg-indigo-300/20" />

                <div className="relative z-10 flex h-full flex-col justify-between">
                  <div className="space-y-5">
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                      <Sparkles className="h-3.5 w-3.5" />
                      Academic Workspace
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                        <img src="/logo.png" alt="MultiCourses logo" className="h-full w-full object-contain" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold text-slate-900">MultiCourses</h1>
                        <p className="mt-0.5 text-xs text-slate-500">Designed by Roberto Román</p>
                      </div>
                    </div>

                    <div>
                      <h2 className="max-w-2xl text-3xl font-bold leading-tight text-slate-900">
                        Learn, track, and manage your courses in one platform.
                      </h2>
                      <p className="mt-2.5 max-w-2xl text-sm text-slate-600">
                        Access materials, monitor grades, and keep your academic workflow organized for students and teachers.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 bg-white/90 p-3 backdrop-blur">
                        <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                          <BookOpen className="h-4 w-4" />
                        </div>
                        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Learning</p>
                        <p className="text-sm font-semibold text-slate-900">Always available content</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white/90 p-3 backdrop-blur">
                        <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                          <Target className="h-4 w-4" />
                        </div>
                        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Progress</p>
                        <p className="text-sm font-semibold text-slate-900">Real-time grade visibility</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white/90 p-3 backdrop-blur">
                        <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                          <Zap className="h-4 w-4" />
                        </div>
                        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Experience</p>
                        <p className="text-sm font-semibold text-slate-900">Fast and professional workflow</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-2.5 rounded-2xl border border-slate-200 bg-white/85 p-3 shadow-sm sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Step 1</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">Create account</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Step 2</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">Choose your role</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Step 3</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">Start your workspace</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isLogin) {
                        setIsLogin(true);
                        setError("");
                        setSuccessMessage("");
                      }
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      isLogin
                        ? "bg-sky-100 text-sky-800"
                        : "text-slate-600 hover:text-slate-800"
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isLogin) {
                        setIsLogin(false);
                        setError("");
                        setSuccessMessage("");
                      }
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      !isLogin
                        ? "bg-emerald-100 text-emerald-800"
                        : "text-slate-600 hover:text-slate-800"
                    }`}
                  >
                    Create account
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
                  <div className="mb-4 space-y-1">
                    <h2 className="text-2xl font-bold text-slate-900">
                      {isLogin ? "Welcome Back" : "Create Your Account"}
                    </h2>
                    <p className="text-sm text-slate-600">
                      {isLogin
                        ? "Sign in to securely access your academic workspace."
                        : "Select your role and complete your registration details."}
                    </p>
                  </div>

                  <form
                    onSubmit={isLogin ? handleLoginSubmit : handleRegisterSubmit}
                    className="space-y-3"
                  >
                    {error && (
                      <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>{error}</p>
                      </div>
                    )}

                    {successMessage && (
                      <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>{successMessage}</p>
                      </div>
                    )}

                    {!isLogin && (
                      <>
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Register as
                          </p>
                          <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-1">
                            <button
                              type="button"
                              onClick={() => setSelectedRole("estudiante")}
                              className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition ${
                                selectedRole === "estudiante"
                                  ? "border-sky-200 bg-sky-50 text-sky-800"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              <GraduationCap className="h-4 w-4" />
                              Student
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedRole("docente")}
                              className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition ${
                                selectedRole === "docente"
                                  ? "border-amber-200 bg-amber-50 text-amber-800"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              <BriefcaseBusiness className="h-4 w-4" />
                              Teacher
                            </button>
                          </div>
                          {selectedRole === "docente" && (
                            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                              Teacher access requires administrator approval before teacher features are enabled.
                            </p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <label htmlFor="name" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Full Name
                          </label>
                          <div className="relative">
                            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                              id="name"
                              type="text"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder="Juan Pérez"
                              className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label htmlFor="idNumber" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            ID Number / Document
                          </label>
                          <div className="relative">
                            <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                              id="idNumber"
                              type="text"
                              value={idNumber}
                              onChange={(e) => setIdNumber(e.target.value)}
                              placeholder="1234567890"
                              className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                              required
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div className="space-y-1.5">
                      <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Email
                      </label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="correo@universidad.edu.co"
                          className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                          required
                        />
                      </div>
                    </div>

                    {!isLogin && (
                      <div className="space-y-1.5">
                        <label htmlFor="whatsApp" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          WhatsApp Number
                        </label>
                        <div className="relative">
                          <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            id="whatsApp"
                            type="text"
                            value={whatsApp}
                            onChange={(e) => setWhatsApp(e.target.value)}
                            placeholder="3001234567"
                            className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                            required
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Password
                        </label>
                        {isLogin && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowForgotPassword(true);
                            }}
                            className="text-xs font-semibold text-sky-700 transition hover:text-sky-800"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-11 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-slate-500">Minimum 6 characters</p>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-sky-500 bg-gradient-to-b from-sky-500 to-sky-600 px-4 text-sm font-semibold text-white shadow-[0_18px_30px_-18px_rgba(2,132,199,0.95)] transition hover:from-sky-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {isLogin ? "Signing in..." : "Creating account..."}
                        </>
                      ) : isLogin ? (
                        <>
                          <Zap className="h-4 w-4" />
                          Sign In
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Create Account
                        </>
                      )}
                    </button>
                  </form>

                  <div className="mt-4 border-t border-slate-200 pt-3">
                    <button
                      onClick={() => {
                        setIsLogin(!isLogin);
                        setError("");
                        setSuccessMessage("");
                        if (isLogin) {
                          setName("");
                          setIdNumber("");
                          setWhatsApp("");
                          setSelectedRole("estudiante");
                        }
                      }}
                      className="w-full rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      {isLogin
                        ? "Need access? Create an account"
                        : "Already registered? Sign in"}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      <ForgotPasswordModal
        isOpen={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
        onReset={handlePasswordReset}
      />
    </>
  );
}
