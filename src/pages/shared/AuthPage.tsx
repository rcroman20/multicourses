// src/pages/AuthPage.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  GraduationCap,
  Mail,
  Lock,
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
} from "lucide-react";
import { z } from "zod";
import { firebaseAuth, firebaseDB } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
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
});

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
  }, [isOpen]);

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
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        setError("No account found with this email address");
      } else if (err.code === "auth/invalid-email") {
        setError("Invalid email address");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.");
      } else {
        setError(err.message || "Error sending reset email. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setResetEmail("");
    setError("");
    setSuccessMessage("");
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={handleOverlayClick}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 border border-gray-200"
        onClick={(e) => e.stopPropagation()} // Prevenir clics dentro del modal
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                <Target className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">
                  Reset Password
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Enter your email to reset
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Close modal"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>

          <p className="text-gray-600 mb-6 text-sm">
            Enter your email address and we'll send you instructions to reset
            your password.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-4 rounded-xl bg-gradient-to-br from-red-50 to-red-100 border border-red-200 text-red-700 text-sm animate-in fade-in">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {successMessage && (
              <div className="flex items-center gap-2 p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-100 border border-green-200 text-green-700 text-sm animate-in fade-in">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p>{successMessage}</p>
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="resetEmail"
                className="block text-sm font-medium text-gray-700"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  ref={inputRef}
                  id="resetEmail"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="your-email@example.com"
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  required
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg font-medium transition-all duration-300 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 text-center">
              Remember your password?{" "}
              <button
                onClick={handleClose}
                className="text-blue-600 hover:underline font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
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
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [whatsApp, setWhatsApp] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  // Simple redirection: teacher goes to /teacher, student to /student
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(user.role === "docente" ? "/docente" : "/estudiante");
    }
  }, [isAuthenticated, user, navigate]);

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
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    } catch (err: any) {
      if (err.code === "auth/invalid-credential") {
        setError("Incorrect email or password");
      } else if (err.code === "auth/user-not-found") {
        setError("User not found");
      } else if (err.code === "auth/wrong-password") {
        setError("Incorrect password");
      } else {
        setError(err.message || "Error signing in");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    // First check if email is rcroman20@gmail.com
    if (email === "rcroman20@gmail.com") {
      setError(
        "This email is already registered as a teacher. Please sign in instead of registering.",
      );
      return;
    }

    const result = registerSchema.safeParse({
      email,
      password,
      name,
      idNumber,
      whatsApp,
    });

    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setIsLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        firebaseAuth,
        email,
        password,
      );
      const user = userCredential.user;

      // All new registrations will be students
      const role = "estudiante";

      // 1. Save to /users
      await setDoc(doc(firebaseDB, "usuarios", user.uid), {
        id: user.uid,
        email,
        name,
        idNumber,
        role,
        whatsApp,
        createdAt: new Date(),
      });

      // 2. Also save to /students
      await setDoc(doc(firebaseDB, "estudiantes", user.uid), {
        id: user.uid,
        idNumber,
        email,
        name,
        role,
        whatsApp,
        createdAt: new Date(),
      });

      setSuccessMessage("Account created successfully! You can now sign in.");
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") {
        setError("This email is already registered. Please sign in instead.");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Use at least 6 characters.");
      } else {
        setError(err.message || "Error registering user");
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50/50 to-cyan-50/50 flex">
        {/* Left side - Branding */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-cyan-500 to-purple-500" />
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-20 left-20 w-72 h-72 rounded-full border-2 border-white/20" />
            <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full border-2 border-white/20" />
            <div className="absolute top-1/2 left-1/3 w-48 h-48 rounded-full border-2 border-white/20" />
          </div>

          <div className="relative z-10 flex flex-col justify-center p-12 text-white">
            <div className="flex items-center gap-4 mb-8">
              <div className="h-16 w-16 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                <GraduationCap className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-4xl font-bold tracking-tight">
                  MultiCourses
                </h1>
                <p className="text-white/80">
                  Designed by Roberto Román
                </p>
              </div>
            </div>

            <h2 className="text-4xl font-bold tracking-tight mb-6">
              Digital Academic Platform
              <span className="block text-2xl font-semibold mt-2 text-white/90">
                Modern • Vibrant • Professional
              </span>
            </h2>

            <p className="text-lg text-white/90 mb-8 max-w-md">
              Manage your courses, track your progress, and access learning
              materials all in one place.
            </p>

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-white/90">
                <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center">
                  <BookOpen className="h-5 w-5" />
                </div>
                <span>Access to class materials</span>
              </div>
              <div className="flex items-center gap-3 text-white/90">
                <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5" />
                </div>
                <span>Real-time grade tracking</span>
              </div>
              <div className="flex items-center gap-3 text-white/90">
                <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center">
                  <Zap className="h-5 w-5" />
                </div>
                <span>Modern interface experience</span>
              </div>
            </div>

           
          </div>
        </div>

        {/* Right side - Login form */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            {/* Mobile branding */}
            <div className="lg:hidden text-center mb-8">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 text-white mb-4">
                <GraduationCap className="h-8 w-8" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                MultiCourses
              </h1>
              <p className="text-gray-500 text-sm">
                Designed by Roberto Román
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-lg">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {isLogin ? "Welcome Back!" : "Create Account"}
                </h2>
                <p className="text-gray-500">
                  {isLogin ? "Sign in to continue" : "Join our academic community"}
                </p>
              </div>

              <form
                onSubmit={isLogin ? handleLoginSubmit : handleRegisterSubmit}
                className="space-y-5"
              >
                {error && (
                  <div className="flex items-center gap-2 p-4 rounded-xl bg-gradient-to-br from-red-50 to-red-100 border border-red-200 text-red-700 text-sm">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                {successMessage && (
                  <div className="flex items-center gap-2 p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-100 border border-green-200 text-green-700 text-sm">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <p>{successMessage}</p>
                  </div>
                )}

                {!isLogin && (
                  <>
                    <div className="space-y-2">
                      <label
                        htmlFor="name"
                        className="block text-sm font-medium text-gray-700"
                      >
                        Full Name
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                          id="name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Juan Pérez"
                          className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="idNumber"
                        className="block text-sm font-medium text-gray-700"
                      >
                        ID Number / Document
                      </label>
                      <div className="relative">
                        <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                          id="idNumber"
                          type="text"
                          value={idNumber}
                          onChange={(e) => setIdNumber(e.target.value)}
                          placeholder="Ej: 1234567890"
                          className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                          required
                        />
                      </div>
                    
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="correo@universidad.edu.co"
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      required
                    />
                  </div>
                </div>

                {!isLogin && (
                  <div className="space-y-2">
                    <label
                      htmlFor="whatsApp"
                      className="block text-sm font-medium text-gray-700"
                    >
                      WhatsApp Number
                    </label>
                    <div className="relative">
                      <Smartphone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        id="whatsApp"
                        type="text"
                        value={whatsApp}
                        onChange={(e) => setWhatsApp(e.target.value)}
                        placeholder="Ej: 1234567890"
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Password
                    </label>
                    {isLogin && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowForgotPassword(true);
                        }}
                        className="text-sm text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      required
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Minimum 6 characters
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-4 inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold tracking-wide shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {isLogin ? "Signing in..." : "Creating account..."}
                    </>
                  ) : isLogin ? (
                    <>
                      <Zap className="h-5 w-5" />
                      Sign In
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5" />
                      Create Account
                    </>
                  )}
                </button>
              </form>

              {/* Switch between login and register */}
              <div className="text-center mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setError("");
                    setSuccessMessage("");
                    // Clear fields when switching between login/register
                    if (isLogin) {
                      setName("");
                      setIdNumber("");
                      setWhatsApp("");
                    }
                  }}
                  className="text-sm text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                >
                  {isLogin
                    ? "Don't have an account? Create one"
                    : "Already have an account? Sign in"}
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500">
                By signing in, you agree to our Terms and Privacy Policy
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal como componente separado */}
      <ForgotPasswordModal
        isOpen={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
        onReset={handlePasswordReset}
      />
    </>
  );
}