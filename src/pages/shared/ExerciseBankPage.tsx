import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAcademic } from "@/contexts/AcademicContext";
import { useAuth } from "@/contexts/AuthContext";
import { getAccessibleCoursesForUser } from "@/lib/courseAccess";
import { getAdminUserIds, isAdminEmail } from "@/lib/services/adminAccessService";
import { notificationService } from "@/lib/services/notificationService";
import { TEACHER_ONBOARDING_COURSE_CODE } from "@/lib/services/teacherOnboardingService";
import { firebaseDB } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  where,
} from "firebase/firestore";
import {
  CheckCircle2,
  Trophy,
  Loader2,
  Plus,
  Trash2,
  BookOpen,
  ChevronRight,
  FileText,
  Sparkles,
  Zap,
  HelpCircle,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Edit3,
  Eye,
  EyeOff,
  BookMarked,
  Layers,
  TrendingUp,
  ChevronDown,
  ExternalLink,
  X,
  PenTool,
  BarChart3,
  Search,
  ArrowLeft,
  ArrowRight,
  Grid,
  List,
  Clock3,
  AlertTriangle,
} from "lucide-react";

interface ExerciseQuestion {
  id: string;
  courseId: string;
  theme: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  isPublished: boolean;
  createdBy: string;
  createdAt: Date;
}

interface BulkQuestionDraft {
  theme: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
}

interface SharedQuizQuestionDraft {
  question: string;
  options: string[];
  correctOptionIndex: number;
}

interface SharedQuizTemplate {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  sourceCourseId: string;
  sourceCourseCode: string;
  sourceCourseName: string;
  theme: string;
  normalizedTheme: string;
  questionCount: number;
  questions: SharedQuizQuestionDraft[];
  templateKind?: "exercise";
  createdAt: Date;
  updatedAt: Date;
}

interface QuizResult {
  total: number;
  correct: number;
  percentage: number;
}

interface QuizAttemptAnswer {
  questionId: string;
  selectedOptionIndex: number;
  correctOptionIndex: number;
  isCorrect: boolean;
}

interface QuizAttempt {
  id: string;
  courseId: string;
  theme: string;
  studentId: string;
  total: number;
  correct: number;
  percentage: number;
  answers: QuizAttemptAnswer[];
  createdAt: Date;
}

interface CourseGradeSheet {
  id: string;
  title: string;
  unitLabel: string;
}

interface GradeSheetActivity {
  id: string;
  name: string;
  maxScore: number;
  type: string;
  description?: string;
}

interface GradeSheetStudentRow {
  studentId: string;
  name: string;
  grades: Record<
    string,
    {
      value?: number | null;
      comment?: string;
      submittedAt?: unknown;
    }
  >;
  total?: number;
  status?: "pending" | "completed" | "incomplete";
}

type FinishReason = "manual" | "timeout" | "abandoned";
type EditingField = "theme" | "question" | "options" | "correctOptionIndex";
type AuthoringWorkspacePanel =
  | "create"
  | "questionBank"
  | "sharedQuizBank"
  | "mandatoryTeacherQuizzes";
type EditableQuestionFields = Pick<
  ExerciseQuestion,
  "theme" | "question" | "options" | "correctOptionIndex" | "isPublished"
>;
type ViewMode = "grid" | "list";
type QuestionFilter = "all" | "published" | "draft";

function toDate(value: unknown): Date {
  if (value && typeof value === "object" && "toDate" in value) {
    const timestamp = value as { toDate: () => Date };
    return timestamp.toDate();
  }
  if (value instanceof Date) return value;
  return new Date();
}

const formatDate = (date: Date) => {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateTime = (date: Date) =>
  date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const normalizeThemeKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "theme";

const normalizeQuestionText = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const buildQuestionSignature = (
  theme: string,
  question: string,
  options: string[],
  correctOptionIndex: number,
) =>
  [
    normalizeThemeKey(theme),
    normalizeQuestionText(question),
    options.map((option) => normalizeQuestionText(option)).join("|"),
    correctOptionIndex,
  ].join("::");

const getSharedTemplateVisibilityKey = (
  template: Pick<
    SharedQuizTemplate,
    "sourceCourseId" | "normalizedTheme" | "templateKind"
  >,
) =>
  `${template.sourceCourseId}::${template.templateKind || "exercise"}::${template.normalizedTheme}`;

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
        <div className="flex items-center justify-between border-b border-slate-200/60 bg-gradient-to-r from-sky-50 via-indigo-50/70 to-violet-50 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/60 bg-white/80 text-slate-600 transition hover:bg-white hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">{children}</div>
      </div>
    </div>
  );
};

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  type = "danger",
}) => {
  if (!isOpen) return null;

  const colors = {
    danger: {
      bg: "bg-rose-50",
      text: "text-rose-700",
      border: "border-rose-200",
      button: "bg-rose-600 hover:bg-rose-700",
      icon: <AlertCircle className="h-4 w-4 text-rose-600" />,
    },
    warning: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
      button: "bg-amber-600 hover:bg-amber-700",
      icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    },
    info: {
      bg: "bg-sky-50",
      text: "text-sky-700",
      border: "border-sky-200",
      button: "bg-sky-600 hover:bg-sky-700",
      icon: <HelpCircle className="h-4 w-4 text-sky-600" />,
    },
  };

  const style = colors[type];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
        <div className="p-5">
          <div className="flex items-center gap-4 mb-4">
            <div
              className={`h-8 w-8 rounded-full border ${style.border} ${style.bg} flex items-center justify-center`}
            >
              {style.icon}
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500">{message}</p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300/60 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${style.button}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: number;
  tone?: "sky" | "indigo" | "emerald" | "amber" | "violet" | "rose";
}

const STAT_TONE_CLASSES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  sky: "bg-sky-100 text-sky-700",
  indigo: "bg-indigo-100 text-indigo-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  violet: "bg-violet-100 text-violet-700",
  rose: "bg-rose-100 text-rose-700",
};

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, trend, tone = "sky" }) => {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white p-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${STAT_TONE_CLASSES[tone]}`}>
          {icon}
        </div>
        <p className="text-lg font-extrabold leading-5 text-slate-900">{value}</p>
      </div>
      <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">{label}</p>
      {trend !== undefined && (
        <p className="mt-0.5 text-[10px] text-slate-500">
          <span className={trend >= 0 ? "text-emerald-600" : "text-rose-600"}>
            {trend > 0 ? "+" : ""}
            {trend}%
          </span>{" "}
          vs last month
        </p>
      )}
    </div>
  );
};

interface ThemeCardProps {
  theme: string;
  questionCount: number;
  isLinked: boolean;
  maxAttempts: number;
  attempt?: QuizAttempt;
  attemptCount?: number;
  isSelected: boolean;
  canTake: boolean;
  mandatoryApprovalEnabled?: boolean;
  approvalThreshold?: number;
  approved?: boolean;
  onSelect: () => void;
  onStart: () => void;
}

const ThemeCard: React.FC<ThemeCardProps> = ({
  theme,
  questionCount,
  isLinked,
  maxAttempts,
  attempt,
  attemptCount = 0,
  isSelected,
  canTake,
  mandatoryApprovalEnabled = false,
  approvalThreshold = 80,
  approved = false,
  onSelect,
  onStart,
}) => {
  const startButtonLabel = mandatoryApprovalEnabled
    ? attempt
      ? "Retry Quiz"
      : "Start Quiz"
    : attempt && !isLinked
      ? "Retake Quiz"
      : "Start Quiz";

  return (
    <div
      className={`group cursor-pointer rounded-xl border transition-all ${
        isSelected
          ? "border-sky-300 bg-sky-50 shadow-sm"
          : "border-slate-200/60 bg-white hover:border-sky-200 hover:bg-sky-50/40"
      }`}
      onClick={onSelect}
    >
      <div className="p-4">
        <div className="mb-2.5 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <BookMarked
              className={`h-4 w-4 ${isSelected ? "text-sky-700" : "text-slate-400"}`}
            />
            <h4 className="text-sm font-semibold text-slate-900">{theme}</h4>
          </div>
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
              isLinked
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-slate-200/60 bg-slate-50 text-slate-700"
            }`}
          >
            {isLinked ? "Linked" : "Practice"}
          </span>
        </div>

        <div className="mb-2.5 flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 text-slate-600">
            <HelpCircle className="h-3.5 w-3.5" />
            {questionCount} questions
          </span>
          <span className="inline-flex items-center gap-1 text-slate-600">
            <Clock3 className="h-3.5 w-3.5" />
            {Math.ceil((questionCount * 90) / 60)} min
          </span>
        </div>

        {attempt && (
          <div className="mb-3 rounded-lg border border-slate-200/60 bg-white p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Last score</span>
              <span className="text-sm font-semibold text-sky-700">
                {attempt.percentage}%
              </span>
            </div>
            <progress
              max={100}
              value={Math.max(0, Math.min(100, attempt.percentage))}
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-sky-500 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-sky-500"
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {(!isLinked || mandatoryApprovalEnabled) && (
              <span>
                Attempts: {attemptCount}/{maxAttempts}
              </span>
            )}
          </div>
          {canTake ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStart();
              }}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700"
            >
              {startButtonLabel}
            </button>
          ) : (
            <>
              {mandatoryApprovalEnabled ? (
                <div
                  className={`flex items-center gap-1 ${
                    approved ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {approved ? (
                    <CheckCircle className="h-3.5 w-3.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                  <span className="text-xs font-semibold">
                    {approved
                      ? "Approved"
                      : `Not approved (< ${approvalThreshold}%)`}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-emerald-700">
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold">Completed</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface QuestionCardProps {
  question: ExerciseQuestion;
  isEditing: boolean;
  hasUnsavedChanges: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  editingValues: {
    theme: string;
    question: string;
    options: string[];
    correctOptionIndex: number;
  };
  onEditingChange: (field: EditingField, value: unknown) => void;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  isEditing,
  hasUnsavedChanges,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onTogglePublish,
  onDelete,
  isDeleting,
  editingValues,
  onEditingChange,
}) => {
  return (
    <div className="bg-white border border-slate-200/60 rounded-xl hover:shadow-md transition-all duration-300 overflow-hidden">
      {isEditing ? (
        <div className="p-4">
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Theme
              </label>
              <input
                value={editingValues.theme}
                onChange={(e) => onEditingChange("theme", e.target.value)}
                className="w-full rounded-lg border border-slate-300/60 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="Theme"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Question
              </label>
              <textarea
                value={editingValues.question}
                onChange={(e) => onEditingChange("question", e.target.value)}
                className="w-full rounded-lg border border-slate-300/60 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                rows={2}
                placeholder="Question"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">
                Options
              </label>
              {editingValues.options.map((option, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-1.5">
                  <input
                    type="radio"
                    checked={editingValues.correctOptionIndex === idx}
                    onChange={() => onEditingChange("correctOptionIndex", idx)}
                    className="h-3.5 w-3.5 text-sky-600 focus:ring-sky-500"
                  />
                  <input
                    value={option}
                    onChange={(e) => {
                      const newOptions = [...editingValues.options];
                      newOptions[idx] = e.target.value;
                      onEditingChange("options", newOptions);
                    }}
                    className="flex-1 rounded-lg border border-slate-300/60 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder={`Option ${idx + 1}`}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={onCancelEdit}
                className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onSaveEdit}
                className="px-2.5 py-1 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold px-2 py-1 bg-sky-100 text-sky-700 rounded-full">
                  {question.theme}
                </span>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1 ${
                    question.isPublished
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {question.isPublished ? (
                    <Eye className="h-3 w-3" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                  {question.isPublished ? "Published" : "Draft"}
                </span>
                <span className="text-xs text-slate-500">
                  {formatDate(question.createdAt)}
                </span>
                {hasUnsavedChanges && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                    Unsaved
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-900 mb-2.5 font-medium leading-5">
              {question.question}
            </p>

            <div className="space-y-1">
              {question.options.map((option, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-xs">
                  {idx === question.correctOptionIndex ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
                  )}
                  <span
                    className={
                      idx === question.correctOptionIndex
                        ? "text-emerald-700 font-medium leading-5"
                        : "text-slate-600 leading-5"
                    }
                  >
                    {option}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 flex items-center justify-end gap-1">
            <button
              onClick={onEdit}
              className="p-1 text-slate-600 hover:bg-white hover:text-sky-600 rounded-lg transition-colors"
              title="Edit"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onTogglePublish}
              className={`p-1 rounded-lg transition-colors ${
                question.isPublished
                  ? "text-slate-600 hover:bg-white hover:text-amber-600"
                  : "text-slate-600 hover:bg-white hover:text-emerald-600"
              }`}
              title={question.isPublished ? "Unpublish" : "Publish"}
            >
              {question.isPublished ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="p-1 text-rose-600 hover:bg-white rounded-lg transition-colors disabled:opacity-50"
              title="Delete"
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

interface QuizQuestionViewProps {
  question: ExerciseQuestion;
  currentIndex: number;
  totalQuestions: number;
  selectedAnswer?: number;
  timeLeft: number;
  onAnswer: (questionId: string, optionIndex: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onFinish: () => void;
}

const QuizQuestionView: React.FC<QuizQuestionViewProps> = ({
  question,
  currentIndex,
  totalQuestions,
  selectedAnswer,
  timeLeft,
  onAnswer,
  onNext,
  onPrevious,
  onFinish,
}) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = ((currentIndex + 1) / totalQuestions) * 100;

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">
            Question {currentIndex + 1} of {totalQuestions}
          </span>
          <div className="flex items-center gap-2">
            <Clock
              className={`h-4 w-4 ${timeLeft <= 60 ? "text-rose-500" : "text-slate-400"}`}
            />
            <span
              className={`font-mono font-medium ${timeLeft <= 60 ? "text-rose-500" : "text-slate-600"}`}
            >
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>
        <progress
          max={100}
          value={Math.max(0, Math.min(100, progress))}
          className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-sky-500 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-sky-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200/60 p-4 shadow-sm">
        <div className="mb-4">
          <span className="inline-block px-3 py-1 bg-sky-100 text-sky-700 text-xs font-semibold rounded-full">
            {question.theme}
          </span>
        </div>

        <p className="text-lg font-semibold text-slate-900 mb-6">
          {question.question}
        </p>

        <div className="space-y-2">
          {question.options.map((option, index) => {
            const isSelected = selectedAnswer === index;
            return (
              <button
                key={index}
                onClick={() => onAnswer(question.id, index)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  isSelected
                    ? "border-sky-500 bg-sky-50"
                    : "border-slate-200/60 hover:border-sky-300 hover:bg-sky-50/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-6 w-6 rounded-full border-2 flex items-center justify-center text-sm font-medium ${
                      isSelected
                        ? "border-sky-500 bg-sky-500 text-white"
                        : "border-slate-300/60 text-slate-500"
                    }`}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="text-slate-800">{option}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onPrevious}
          disabled={currentIndex === 0}
          className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </button>

        {currentIndex === totalQuestions - 1 ? (
          <button
            onClick={onFinish}
            className="flex items-center gap-2 px-6 py-2 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 transition-colors"
          >
            <CheckCircle className="h-4 w-4" />
            Finish Quiz
          </button>
        ) : (
          <button
            onClick={onNext}
            className="flex items-center gap-2 px-6 py-2 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 transition-colors"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

interface QuizResultViewProps {
  result: QuizResult;
  gradingMessage?: string;
  onClose: () => void;
}

const QuizResultView: React.FC<QuizResultViewProps> = ({
  result,
  gradingMessage,
  onClose,
}) => {
  const getGradeColor = (percentage: number) => {
    if (percentage >= 90) return "text-emerald-600";
    if (percentage >= 70) return "text-sky-600";
    if (percentage >= 50) return "text-amber-600";
    return "text-rose-600";
  };

  const getGradeMessage = (percentage: number) => {
    if (percentage >= 90) return "Excellent!";
    if (percentage >= 70) return "Good job!";
    if (percentage >= 50) return "Keep practicing!";
    return "Need more practice";
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 p-4 shadow-sm">
      <div className="text-center mb-6">
        <div className="inline-flex h-20 w-20 rounded-full bg-amber-50 items-center justify-center mb-4">
          <Trophy className="h-8 w-8 text-amber-600" />
        </div>
        <h3 className="text-lg font-extrabold leading-5 text-slate-900 mb-1">
          {getGradeMessage(result.percentage)}
        </h3>
        <p className="text-slate-600">Quiz completed successfully</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-4 bg-slate-50 rounded-xl">
          <p className="text-xs text-slate-500 mb-1">Score</p>
          <p
            className={`text-lg font-extrabold leading-5 ${getGradeColor(result.percentage)}`}
          >
            {result.percentage}%
          </p>
        </div>
        <div className="text-center p-4 bg-slate-50 rounded-xl">
          <p className="text-xs text-slate-500 mb-1">Correct</p>
          <p className="text-lg font-extrabold leading-5 text-emerald-600">{result.correct}</p>
        </div>
        <div className="text-center p-4 bg-slate-50 rounded-xl">
          <p className="text-xs text-slate-500 mb-1">Total</p>
          <p className="text-lg font-extrabold leading-5 text-slate-900">{result.total}</p>
        </div>
      </div>

      {gradingMessage && (
        <div className="mb-6 p-4 bg-sky-50 border border-sky-200 rounded-xl">
          <p className="flex items-center gap-2 text-sm text-sky-700">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            {gradingMessage}
          </p>
        </div>
      )}

      <button
        onClick={onClose}
        className="w-full py-3 bg-sky-600 text-white font-semibold rounded-xl hover:bg-sky-700 transition-colors"
      >
        Continue to Themes
      </button>
    </div>
  );
};

export default function ExerciseBankPage() {
  const QUIZ_SECONDS_PER_QUESTION = 90;
  const MAX_HISTORY_ATTEMPTS = 3;
  const MAX_UNLINKED_ATTEMPTS = 3;
  const MAX_MANDATORY_ATTEMPTS = 3;
  const MANDATORY_APPROVAL_PERCENTAGE = 80;
  const SHARED_TEMPLATE_COLLECTION = "quizBankTemplates";

  const { courseCode } = useParams<{ courseCode?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { courses, selectedCourseId, setSelectedCourseId } = useAcademic();

  const isAdmin = user?.role === "admin";
  const isTeacherRole = user?.role === "docente";
  const isTeacher = isTeacherRole || isAdmin;

  const [loading, setLoading] = useState(false);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [questions, setQuestions] = useState<ExerciseQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [questionFilter, setQuestionFilter] = useState<QuestionFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreatorForm, setShowCreatorForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null,
  );

  const [themeMode, setThemeMode] = useState<"existing" | "new">("existing");
  const [questionCreationMode, setQuestionCreationMode] = useState<
    "single" | "bulk"
  >("single");
  const [selectedExistingTheme, setSelectedExistingTheme] = useState("");
  const [themeInput, setThemeInput] = useState("");
  const [questionInput, setQuestionInput] = useState("");
  const [optionsInput, setOptionsInput] = useState(["", "", "", ""]);
  const [correctOptionIndex, setCorrectOptionIndex] = useState(0);
  const [bulkQuestionsInput, setBulkQuestionsInput] = useState("");
  const [publishOnCreate, setPublishOnCreate] = useState(false);

  const [selectedTheme, setSelectedTheme] = useState("");
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<ExerciseQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(
    QUIZ_SECONDS_PER_QUESTION,
  );
  const [showStartWarning, setShowStartWarning] = useState(false);
  const [pendingStartTheme, setPendingStartTheme] = useState<string | null>(
    null,
  );
  const [isFinishingQuiz, setIsFinishingQuiz] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [gradingMessage, setGradingMessage] = useState("");

  const [attemptsByTheme, setAttemptsByTheme] = useState<
    Record<string, QuizAttempt>
  >({});
  const [attemptsCountByTheme, setAttemptsCountByTheme] = useState<
    Record<string, number>
  >({});
  const [attemptHistory, setAttemptHistory] = useState<QuizAttempt[]>([]);
  const [themeLinksByTheme, setThemeLinksByTheme] = useState<
    Record<string, string>
  >({});
  const [courseGradeSheets, setCourseGradeSheets] = useState<
    CourseGradeSheet[]
  >([]);

  const [savingThemeLink, setSavingThemeLink] = useState<string | null>(null);
  const [savingAllQuestionChanges, setSavingAllQuestionChanges] =
    useState(false);
  const [bulkPublishTheme, setBulkPublishTheme] = useState("all");
  const [bulkVisibilityAction, setBulkVisibilityAction] = useState<
    "publish" | "draft"
  >("publish");
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [pendingQuestionUpdates, setPendingQuestionUpdates] = useState<
    Record<string, EditableQuestionFields>
  >({});
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
    null,
  );
  const [editingTheme, setEditingTheme] = useState("");
  const [editingQuestionText, setEditingQuestionText] = useState("");
  const [editingOptions, setEditingOptions] = useState(["", "", "", ""]);
  const [editingCorrectOptionIndex, setEditingCorrectOptionIndex] = useState(0);
  const [expandedThemes, setExpandedThemes] = useState<Record<string, boolean>>(
    {},
  );
  const [selectedQuestionBankTheme, setSelectedQuestionBankTheme] = useState("all");
  const [activeAuthoringPanel, setActiveAuthoringPanel] =
    useState<AuthoringWorkspacePanel>("create");
  const [mandatoryCourseQuizThemes, setMandatoryCourseQuizThemes] = useState<
    Array<{ theme: string; questionCount: number }>
  >([]);
  const [loadingMandatoryCourseQuizThemes, setLoadingMandatoryCourseQuizThemes] =
    useState(false);
  const [sharedTemplates, setSharedTemplates] = useState<SharedQuizTemplate[]>(
    [],
  );
  const [adminOwnerIds, setAdminOwnerIds] = useState<string[]>([]);
  const [loadingSharedTemplates, setLoadingSharedTemplates] = useState(false);
  const [sharedSearchQuery, setSharedSearchQuery] = useState("");
  const [selectedThemeToPublish, setSelectedThemeToPublish] = useState("");
  const [publishingTheme, setPublishingTheme] = useState<string | null>(null);
  const [importingTemplateId, setImportingTemplateId] = useState<string | null>(
    null,
  );
  const [deletingImportedTemplateId, setDeletingImportedTemplateId] = useState<
    string | null
  >(null);
  const [deletingSharedTemplateId, setDeletingSharedTemplateId] = useState<
    string | null
  >(null);
  const [hiddenSharedTemplateKeys, setHiddenSharedTemplateKeys] = useState<
    string[]
  >([]);
  const finishInFlightRef = useRef(false);
  const quizStartSectionRef = useRef<HTMLDivElement | null>(null);
  const finishingByTimerRef = useRef(false);
  const latestQuestionsRequestRef = useRef(0);
  const latestThemeLinksRequestRef = useRef(0);
  const latestAttemptsRequestRef = useRef(0);
  const latestGradeSheetsRequestRef = useRef(0);
  const finishQuizRef = useRef<
    | ((
        reason?: FinishReason,
        override?: {
          theme: string;
          quizQuestions: ExerciseQuestion[];
          answers: Record<string, number>;
        },
      ) => Promise<void>)
    | null
  >(null);
  const quizSessionRef = useRef<{
    quizStarted: boolean;
    isTeacher: boolean;
    selectedTheme: string;
    quizQuestions: ExerciseQuestion[];
    answers: Record<string, number>;
  }>({
    quizStarted: false,
    isTeacher,
    selectedTheme: "",
    quizQuestions: [],
    answers: {},
  });

  const quizGuardStorageKey = user
    ? `exerciseBank:quizInProgress:${user.id}`
    : "exerciseBank:quizInProgress";
  const activeQuizStorageKey =
    user?.id && selectedCourseId
      ? `exerciseBank:activeQuiz:${user.id}:${selectedCourseId}`
      : null;

  const availableCourses = useMemo(() => {
    if (!user) return [];
    return getAccessibleCoursesForUser(courses, user, {
      includeAllForAdmin: user.role === "admin",
      includeEnrolledForTeacher: true,
    });
  }, [courses, user]);

  const selectedCourse = useMemo(
    () => availableCourses.find((course) => course.id === selectedCourseId),
    [availableCourses, selectedCourseId],
  );

  const selectedCourseRecord = selectedCourse
    ? (selectedCourse as unknown as Record<string, unknown>)
    : null;
  const mandatoryTeacherCourse = useMemo(
    () =>
      availableCourses.find((course) => {
        const courseRecord = course as unknown as Record<string, unknown>;
        return Boolean(
          courseRecord?.isMandatory ||
            courseRecord?.mandatory ||
            courseRecord?.isMandatoryForTeachers ||
            courseRecord?.mandatoryForTeachers ||
            courseRecord?.mandatoryTeacherCourse ||
            String(course.code || "").trim().toUpperCase() ===
              TEACHER_ONBOARDING_COURSE_CODE,
        );
      }) || null,
    [availableCourses],
  );
  const isMandatorySelectedCourse = useMemo(() => {
    if (!selectedCourse) return false;
    return Boolean(
      selectedCourseRecord?.isMandatory ||
        selectedCourseRecord?.mandatory ||
        selectedCourseRecord?.isMandatoryForTeachers ||
        selectedCourseRecord?.mandatoryForTeachers ||
        selectedCourseRecord?.mandatoryTeacherCourse ||
        String(selectedCourse.code || "").trim().toUpperCase() ===
          TEACHER_ONBOARDING_COURSE_CODE,
    );
  }, [selectedCourse, selectedCourseRecord]);

  const teacherOwnsSelectedCourse = Boolean(
    isTeacherRole &&
      selectedCourse &&
      String(selectedCourse.teacherId || "").trim() === String(user?.id || "").trim(),
  );
  const teacherMandatoryLearnerMode = isTeacherRole && isMandatorySelectedCourse;
  const teacherCanAuthorSelectedCourse =
    teacherOwnsSelectedCourse && !teacherMandatoryLearnerMode;
  const isAuthoringMode = isAdmin || teacherCanAuthorSelectedCourse;
  const isLearnerMode = !isAdmin && !teacherCanAuthorSelectedCourse;
  const showMandatoryTeacherQuizzesCard = Boolean(
    isAdmin &&
      mandatoryTeacherCourse &&
      mandatoryTeacherCourse.id === selectedCourseId,
  );

  const availableThemes = useMemo(
    () =>
      Array.from(new Set(questions.map((question) => question.theme.trim())))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [questions],
  );

  const publishedQuestions = useMemo(
    () => questions.filter((question) => question.isPublished),
    [questions],
  );

  const studentAvailableThemes = useMemo(
    () =>
      Array.from(
        new Set(publishedQuestions.map((question) => question.theme.trim())),
      )
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [publishedQuestions],
  );

  const currentQuizQuestion = quizQuestions[currentQuestionIndex] || null;
  const selectedThemeAttempt = selectedTheme
    ? attemptsByTheme[selectedTheme]
    : null;

  const filteredQuestions = useMemo(() => {
    let filtered = questions;

    if (questionFilter === "published") {
      filtered = filtered.filter((q) => q.isPublished);
    } else if (questionFilter === "draft") {
      filtered = filtered.filter((q) => !q.isPublished);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (q) =>
          q.question.toLowerCase().includes(query) ||
          q.theme.toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [questions, questionFilter, searchQuery]);

  const groupedFilteredQuestions = useMemo(() => {
    const grouped: Record<string, ExerciseQuestion[]> = {};

    filteredQuestions.forEach((question) => {
      const theme = question.theme.trim() || "Untitled Theme";
      if (!grouped[theme]) grouped[theme] = [];
      grouped[theme].push(question);
    });

    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredQuestions]);

  const currentCourseQuestionSignatureSet = useMemo(
    () =>
      new Set(
        questions.map((question) =>
          buildQuestionSignature(
            question.theme,
            question.question,
            question.options,
            question.correctOptionIndex,
          ),
        ),
      ),
    [questions],
  );

  const visibleGroupedQuestions = useMemo(() => {
    if (selectedQuestionBankTheme === "all") return groupedFilteredQuestions;
    return groupedFilteredQuestions.filter(
      ([theme]) => theme === selectedQuestionBankTheme,
    );
  }, [groupedFilteredQuestions, selectedQuestionBankTheme]);

  const groupedCourseGradeSheets = useMemo(() => {
    const grouped = new Map<string, CourseGradeSheet[]>();

    courseGradeSheets.forEach((sheet) => {
      const unitLabel = String(sheet.unitLabel || "Without unit").trim() || "Without unit";
      if (!grouped.has(unitLabel)) grouped.set(unitLabel, []);
      grouped.get(unitLabel)?.push(sheet);
    });

    return Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([unitLabel, sheets]) => ({
        unitLabel,
        sheets: [...sheets].sort((a, b) => a.title.localeCompare(b.title)),
      }));
  }, [courseGradeSheets]);

  const sharedThemeKeysForCurrentCourse = useMemo(() => {
    const currentCourseId = String(selectedCourseId || "").trim();
    const ownerId = String(user?.id || "").trim();
    if (!currentCourseId || !ownerId) return new Set<string>();

    const keys = sharedTemplates
      .filter((template) => {
        if (template.templateKind && template.templateKind !== "exercise") return false;
        return (
          String(template.ownerId || "").trim() === ownerId &&
          String(template.sourceCourseId || "").trim() === currentCourseId
        );
      })
      .map((template) => String(template.normalizedTheme || "").trim())
      .filter(Boolean);

    return new Set(keys);
  }, [selectedCourseId, sharedTemplates, user?.id]);

  useEffect(() => {
    let active = true;

    const loadAdminOwnerIds = async () => {
      try {
        const ids = await getAdminUserIds();
        if (!active) return;
        setAdminOwnerIds(ids);
      } catch {
        if (!active) return;
        setAdminOwnerIds([]);
      }
    };

    void loadAdminOwnerIds();

    return () => {
      active = false;
    };
  }, []);

  const reusableSharedTemplates = useMemo(() => {
    const adminOwnerIdSet = new Set(
      adminOwnerIds
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0),
    );

    return sharedTemplates.filter((template) => {
      const ownerId = String(template.ownerId || "").trim();
      const ownerEmail = String(template.ownerEmail || "").trim();

      return !isAdminEmail(ownerEmail) && !adminOwnerIdSet.has(ownerId);
    });
  }, [adminOwnerIds, sharedTemplates]);

  const visibleSharedTemplates = useMemo(() => {
    if (reusableSharedTemplates.length > 0) return reusableSharedTemplates;

    return sharedTemplates.filter((template) => {
      const ownerEmail = String(template.ownerEmail || "").trim();
      return !isAdminEmail(ownerEmail);
    });
  }, [reusableSharedTemplates, sharedTemplates]);

  const filteredSharedTemplates = useMemo(() => {
    const visibleTemplates = isAdmin
      ? visibleSharedTemplates.filter((template) => template.ownerId === user?.id)
      : visibleSharedTemplates;
    const normalizedQuery = sharedSearchQuery.trim().toLowerCase();
    const hiddenKeys = new Set(hiddenSharedTemplateKeys);
    const sorted = [...visibleTemplates]
      .filter(
        (template) => !hiddenKeys.has(getSharedTemplateVisibilityKey(template)),
      )
      .sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );

    if (!normalizedQuery) {
      return sorted;
    }

    return sorted.filter((template) => {
      return (
        template.theme.toLowerCase().includes(normalizedQuery) ||
        template.ownerName.toLowerCase().includes(normalizedQuery) ||
        template.sourceCourseCode.toLowerCase().includes(normalizedQuery) ||
        template.sourceCourseName.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [
    hiddenSharedTemplateKeys,
    isAdmin,
    visibleSharedTemplates,
    sharedSearchQuery,
    user?.id,
  ]);

  const sharedTemplatesFromOtherTeachersCount = useMemo(
    () =>
      isAdmin
        ? 0
        :
      visibleSharedTemplates.filter((template) => template.ownerId !== user?.id)
        .length,
    [isAdmin, user?.id, visibleSharedTemplates],
  );

  useEffect(() => {
    if (!isAuthoringMode) return;
    if (availableThemes.length === 0) {
      setSelectedThemeToPublish("");
      return;
    }
    setSelectedThemeToPublish((current) => {
      if (current && availableThemes.includes(current)) return current;
      return availableThemes[0];
    });
  }, [availableThemes, isAuthoringMode]);

  useEffect(() => {
    setExpandedThemes((prev) => {
      const next: Record<string, boolean> = {};

      groupedFilteredQuestions.forEach(([theme]) => {
        next[theme] = prev[theme] ?? false;
      });

      return next;
    });
  }, [groupedFilteredQuestions]);

  useEffect(() => {
    if (selectedQuestionBankTheme === "all") return;
    const stillExists = groupedFilteredQuestions.some(
      ([theme]) => theme === selectedQuestionBankTheme,
    );
    if (!stillExists) {
      setSelectedQuestionBankTheme("all");
    }
  }, [groupedFilteredQuestions, selectedQuestionBankTheme]);

  useEffect(() => {
    if (isAdmin && activeAuthoringPanel === "sharedQuizBank") {
      setActiveAuthoringPanel("create");
      return;
    }
    if (
      activeAuthoringPanel === "mandatoryTeacherQuizzes" &&
      !showMandatoryTeacherQuizzesCard
    ) {
      setActiveAuthoringPanel("create");
    }
  }, [activeAuthoringPanel, isAdmin, showMandatoryTeacherQuizzesCard]);

  useEffect(() => {
    if (!showMandatoryTeacherQuizzesCard || !mandatoryTeacherCourse?.id) {
      setMandatoryCourseQuizThemes([]);
      return;
    }

    let active = true;
    const loadMandatoryCourseQuizThemes = async () => {
      setLoadingMandatoryCourseQuizThemes(true);
      try {
        const snapshot = await getDocs(
          query(
            collection(firebaseDB, "exerciseQuestions"),
            where("courseId", "==", mandatoryTeacherCourse.id),
          ),
        );
        if (!active) return;

        const byTheme = new Map<string, number>();
        snapshot.forEach((item) => {
          const data = item.data() as Record<string, unknown>;
          const theme = String(data.theme || "").trim();
          const isPublished =
            typeof data.isPublished === "boolean" ? data.isPublished : true;
          if (!theme || !isPublished) return;
          byTheme.set(theme, (byTheme.get(theme) || 0) + 1);
        });

        const ordered = Array.from(byTheme.entries())
          .map(([theme, questionCount]) => ({ theme, questionCount }))
          .sort((a, b) => a.theme.localeCompare(b.theme));

        setMandatoryCourseQuizThemes(ordered);
      } catch {
        if (!active) return;
        setMandatoryCourseQuizThemes([]);
      } finally {
        if (active) {
          setLoadingMandatoryCourseQuizThemes(false);
        }
      }
    };

    void loadMandatoryCourseQuizThemes();

    return () => {
      active = false;
    };
  }, [showMandatoryTeacherQuizzesCard, mandatoryTeacherCourse?.id]);

  const stats = useMemo(() => {
    const totalQuestions = questions.length;
    const totalThemes = isAuthoringMode
      ? availableThemes.length
      : studentAvailableThemes.length;
    const questionsPerTheme =
      totalThemes > 0 ? (totalQuestions / totalThemes).toFixed(1) : "0";
    const completedQuizzes = Object.keys(attemptsByTheme).length;

    return {
      totalQuestions,
      totalThemes,
      questionsPerTheme,
      completedQuizzes,
      pendingThemes: isAuthoringMode ? 0 : totalThemes - completedQuizzes,
      publishedCount: publishedQuestions.length,
      draftCount: questions.length - publishedQuestions.length,
    };
  }, [
    availableThemes.length,
    attemptsByTheme,
    isAuthoringMode,
    publishedQuestions.length,
    questions.length,
    studentAvailableThemes.length,
  ]);

  const mandatoryThemeApprovalStats = useMemo(() => {
    if (!teacherMandatoryLearnerMode) {
      return null;
    }

    const totalThemes = studentAvailableThemes.length;
    const approvedThemes = studentAvailableThemes.filter((theme) => {
      const attempt = attemptsByTheme[theme];
      return Boolean(
        attempt && attempt.percentage >= MANDATORY_APPROVAL_PERCENTAGE,
      );
    }).length;
    const notApprovedThemes = Math.max(0, totalThemes - approvedThemes);
    const isApproved = totalThemes > 0 && approvedThemes === totalThemes;

    return {
      totalThemes,
      approvedThemes,
      notApprovedThemes,
      isApproved,
    };
  }, [
    attemptsByTheme,
    teacherMandatoryLearnerMode,
    studentAvailableThemes,
    MANDATORY_APPROVAL_PERCENTAGE,
  ]);

  const bulkVisibilityTargetCount = useMemo(() => {
    const themesToPublish =
      bulkPublishTheme === "all" ? availableThemes : [bulkPublishTheme];

    return questions.filter(
      (question) =>
        (bulkVisibilityAction === "publish"
          ? !question.isPublished
          : question.isPublished) && themesToPublish.includes(question.theme),
    ).length;
  }, [availableThemes, bulkPublishTheme, bulkVisibilityAction, questions]);

  const authoringWorkspaceTabs = useMemo(() => {
    const tabs: Array<{
      id: AuthoringWorkspacePanel;
      label: string;
      description: string;
      badge?: string;
    }> = [
      {
        id: "create",
        label: "Create Questions",
        description: "Single questions or bulk import",
      },
      {
        id: "questionBank",
        label: "Question Bank",
        description: "Review, edit, and publish by theme",
        badge: `${filteredQuestions.length}`,
      },
    ];

    if (!isAdmin) {
      tabs.push({
        id: "sharedQuizBank",
        label: "Shared Quiz Bank",
        description: "Import and publish reusable quizzes",
      });
    }

    if (showMandatoryTeacherQuizzesCard) {
      tabs.push({
        id: "mandatoryTeacherQuizzes",
        label: "Mandatory Course Quizzes",
        description: "Review the required teacher quizzes",
      });
    }

    return tabs;
  }, [filteredQuestions.length, isAdmin, showMandatoryTeacherQuizzesCard]);

  const activeAuthoringWorkspaceCopy = useMemo(() => {
    switch (activeAuthoringPanel) {
      case "questionBank":
        return {
          eyebrow: "Workspace",
          title: "Question Bank",
          description:
            "Filter by publication status, focus on one theme, and keep edits organized before saving.",
        };
      case "sharedQuizBank":
        return {
          eyebrow: "Workspace",
          title: "Shared Quiz Bank",
          description:
            "Bring proven quizzes into this course or publish your own themes for other teachers.",
        };
      case "mandatoryTeacherQuizzes":
        return {
          eyebrow: "Workspace",
          title: "Mandatory Course Quizzes",
          description:
            "Monitor the onboarding quizzes teachers must complete in the mandatory course.",
        };
      case "create":
      default:
        return {
          eyebrow: "Workspace",
          title: "Create Questions",
          description:
            "Build new questions, assign them to a theme, and decide whether they start as draft or published.",
        };
    }
  }, [activeAuthoringPanel]);

  const isLinkedTheme = (theme: string) => Boolean(themeLinksByTheme[theme]);
  const getThemeAttemptCount = useCallback(
    (theme: string) => attemptsCountByTheme[theme] || 0,
    [attemptsCountByTheme],
  );
  const canTakeTheme = (theme: string) => {
    if (teacherMandatoryLearnerMode) {
      const latestAttempt = attemptsByTheme[theme];
      if (latestAttempt && latestAttempt.percentage >= MANDATORY_APPROVAL_PERCENTAGE) {
        return false;
      }
      return getThemeAttemptCount(theme) < MAX_MANDATORY_ATTEMPTS;
    }
    if (isLinkedTheme(theme)) return !attemptsByTheme[theme];
    return getThemeAttemptCount(theme) < MAX_UNLINKED_ATTEMPTS;
  };
  const getMandatoryBlockedMessage = (
    theme: string,
    latestAttempt?: QuizAttempt,
  ) => {
    if (latestAttempt && latestAttempt.percentage >= MANDATORY_APPROVAL_PERCENTAGE) {
      return `Approved. You reached ${latestAttempt.percentage}% (minimum ${MANDATORY_APPROVAL_PERCENTAGE}%).`;
    }
    const attemptsUsed = getThemeAttemptCount(theme);
    if (attemptsUsed >= MAX_MANDATORY_ATTEMPTS) {
      return `Not approved after ${MAX_MANDATORY_ATTEMPTS} attempts. You need at least ${MANDATORY_APPROVAL_PERCENTAGE}%.`;
    }
    return `Not approved yet. You need at least ${MANDATORY_APPROVAL_PERCENTAGE}%.`;
  };
  const selectedThemeIsLinked = selectedTheme
    ? isLinkedTheme(selectedTheme)
    : false;
  const pendingThemeIsLinked = pendingStartTheme
    ? isLinkedTheme(pendingStartTheme)
    : false;
  const pendingThemeQuestionCount = useMemo(() => {
    if (!pendingStartTheme) return 0;
    const source = isAuthoringMode ? questions : publishedQuestions;
    return source.filter((question) => question.theme === pendingStartTheme)
      .length;
  }, [isAuthoringMode, pendingStartTheme, publishedQuestions, questions]);

  const pendingThemeTimeLimitSeconds =
    pendingThemeQuestionCount * QUIZ_SECONDS_PER_QUESTION;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (secs === 0) return `${mins} min`;
    return `${mins}m ${secs}s`;
  };

  const getThemeLinkDocId = (courseId: string, theme: string) =>
    `link_${courseId}_${normalizeThemeKey(theme)}`;

  const dedupeAttempts = useCallback((items: QuizAttempt[]) => {
    const seen = new Set<string>();
    const seenIds = new Set<string>();
    const deduped: QuizAttempt[] = [];
    const sorted = [...items].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    sorted.forEach((attempt) => {
      if (seenIds.has(attempt.id)) return;
      seenIds.add(attempt.id);

      const answerSignature = [...attempt.answers]
        .sort((a, b) => a.questionId.localeCompare(b.questionId))
        .map((answer) => `${answer.questionId}:${answer.selectedOptionIndex}`)
        .join("|");
      const minuteBucket = Math.floor(attempt.createdAt.getTime() / 60000);
      const fingerprint = [
        attempt.theme,
        attempt.total,
        attempt.correct,
        attempt.percentage,
        answerSignature,
        minuteBucket,
      ].join("|");

      if (seen.has(fingerprint)) return;
      seen.add(fingerprint);
      deduped.push(attempt);
    });

    return deduped;
  }, []);

  const calculateStudentTotal = (
    grades: GradeSheetStudentRow["grades"],
    activities: GradeSheetActivity[],
  ): number => {
    let total = 0;
    let gradedActivities = 0;

    activities.forEach((activity) => {
      const grade = grades[activity.id];
      if (grade?.value !== undefined && grade.value !== null) {
        const normalized = (Number(grade.value) / activity.maxScore) * 5;
        total += normalized;
        gradedActivities += 1;
      }
    });

    return gradedActivities > 0 ? total / gradedActivities : 0;
  };

  const determineStatus = (
    grades: GradeSheetStudentRow["grades"],
    activities: GradeSheetActivity[],
  ): "pending" | "completed" | "incomplete" => {
    const gradedActivities = activities.filter((activity) => {
      const value = grades[activity.id]?.value;
      return value !== undefined && value !== null;
    }).length;

    if (gradedActivities === 0) return "pending";
    if (gradedActivities === activities.length) return "completed";
    return "incomplete";
  };

  const loadQuestions = async (courseId: string) => {
    const requestId = latestQuestionsRequestRef.current + 1;
    latestQuestionsRequestRef.current = requestId;
    setLoading(true);
    try {
      const questionsQuery = query(
        collection(firebaseDB, "exerciseQuestions"),
        where("courseId", "==", courseId),
      );
      const snapshot = await getDocs(questionsQuery);
      const loaded: ExerciseQuestion[] = snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          courseId: String(data.courseId || ""),
          theme: String(data.theme || ""),
          question: String(data.question || ""),
          options: Array.isArray(data.options)
            ? data.options.map((option: unknown) => String(option))
            : [],
          correctOptionIndex: Number(data.correctOptionIndex || 0),
          isPublished:
            typeof data.isPublished === "boolean" ? data.isPublished : true,
          createdBy: String(data.createdBy || ""),
          createdAt: toDate(data.createdAt),
        };
      });

      loaded.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (requestId !== latestQuestionsRequestRef.current) return;
      setQuestions(loaded);
    } finally {
      if (requestId !== latestQuestionsRequestRef.current) return;
      setLoading(false);
    }
  };

  const loadStudentAttempts = useCallback(
    async (courseId: string, studentId: string) => {
      const requestId = latestAttemptsRequestRef.current + 1;
      latestAttemptsRequestRef.current = requestId;
      setLoadingAttempts(true);
      try {
        const attemptsQuery = query(
          collection(firebaseDB, "quizAttempts"),
          where("courseId", "==", courseId),
          where("studentId", "==", studentId),
        );
        const snapshot = await getDocs(attemptsQuery);
        const loaded: QuizAttempt[] = snapshot.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            courseId: String(data.courseId || ""),
            theme: String(data.theme || ""),
            studentId: String(data.studentId || ""),
            total: Number(data.total || 0),
            correct: Number(data.correct || 0),
            percentage: Number(data.percentage || 0),
            answers: Array.isArray(data.answers)
              ? data.answers.map((answer: unknown) => {
                  const parsed = answer as Record<string, unknown>;
                  return {
                    questionId: String(parsed.questionId || ""),
                    selectedOptionIndex: Number(
                      parsed.selectedOptionIndex ?? -1,
                    ),
                    correctOptionIndex: Number(parsed.correctOptionIndex ?? -1),
                    isCorrect: Boolean(parsed.isCorrect),
                  };
                })
              : [],
            createdAt: toDate(data.createdAt),
          };
        });

        const dedupedLoaded = dedupeAttempts(loaded);
        const latestByTheme: Record<string, QuizAttempt> = {};
        const countByTheme: Record<string, number> = {};
        dedupedLoaded.forEach((attempt) => {
          const current = latestByTheme[attempt.theme];
          if (
            !current ||
            attempt.createdAt.getTime() > current.createdAt.getTime()
          ) {
            latestByTheme[attempt.theme] = attempt;
          }
          countByTheme[attempt.theme] = (countByTheme[attempt.theme] || 0) + 1;
        });

        if (requestId !== latestAttemptsRequestRef.current) return;
        setAttemptsByTheme(latestByTheme);
        setAttemptsCountByTheme(countByTheme);
        setAttemptHistory(dedupedLoaded.slice(0, MAX_HISTORY_ATTEMPTS));
      } finally {
        if (requestId !== latestAttemptsRequestRef.current) return;
        setLoadingAttempts(false);
      }
    },
    [MAX_HISTORY_ATTEMPTS, dedupeAttempts],
  );

  const loadThemeLinks = async (courseId: string) => {
    const requestId = latestThemeLinksRequestRef.current + 1;
    latestThemeLinksRequestRef.current = requestId;
    const linksQuery = query(
      collection(firebaseDB, "exerciseThemeLinks"),
      where("courseId", "==", courseId),
    );
    const snapshot = await getDocs(linksQuery);
    const map: Record<string, string> = {};
    snapshot.forEach((item) => {
      const data = item.data();
      const theme = String(data.theme || "").trim();
      const gradeSheetId = String(data.gradeSheetId || "").trim();
      if (theme && gradeSheetId) {
        map[theme] = gradeSheetId;
      }
    });
    if (requestId !== latestThemeLinksRequestRef.current) return;
    setThemeLinksByTheme(map);
  };

  const loadCourseGradeSheets = useCallback(
    async (courseId: string) => {
      const requestId = latestGradeSheetsRequestRef.current + 1;
      latestGradeSheetsRequestRef.current = requestId;
      if (!user?.id || !isAuthoringMode) {
        if (requestId !== latestGradeSheetsRequestRef.current) return;
        setCourseGradeSheets([]);
        return;
      }

      const sheetsQuery = query(
        collection(firebaseDB, "gradeSheets"),
        where("courseId", "==", courseId),
        where("teacherId", "==", user.id),
      );

      const snapshot = await getDocs(sheetsQuery);
      const loaded: CourseGradeSheet[] = snapshot.docs.map((item) => {
        const data = item.data();
        const rawUnit = String(
          (data as Record<string, unknown>).unitName ||
            (data as Record<string, unknown>).unit ||
            data.gradingPeriod ||
            "Without unit",
        )
          .trim();
        return {
          id: item.id,
          title: String(data.title || "Untitled grade sheet"),
          unitLabel: rawUnit || "Without unit",
        };
      });

      loaded.sort((a, b) => a.title.localeCompare(b.title));
      if (requestId !== latestGradeSheetsRequestRef.current) return;
      setCourseGradeSheets(loaded);
    },
    [isAuthoringMode, user?.id],
  );

  const loadSharedQuizTemplates = useCallback(async () => {
    if (!isTeacher || isAdmin) {
      setSharedTemplates([]);
      return;
    }

    setLoadingSharedTemplates(true);
    try {
      const [sharedSnapshot, allCoursesSnapshot] =
        await Promise.all([
          getDocs(collection(firebaseDB, SHARED_TEMPLATE_COLLECTION)).catch(
            () => null,
          ),
          getDocs(collection(firebaseDB, "cursos")).catch(() => null),
        ]);

      const courseMetaById: Record<
        string,
        { code: string; name: string; teacherId: string; teacherName: string }
      > = {};

      allCoursesSnapshot?.forEach((item) => {
        const data = item.data() as Record<string, unknown>;
        courseMetaById[item.id] = {
          code: String(data.code || ""),
          name: String(data.name || ""),
          teacherId: String(data.teacherId || ""),
          teacherName: String(data.teacherName || "Teacher"),
        };
      });

      const allCourseIds = Object.keys(courseMetaById);
      const allQuestionsSnapshots = await Promise.all(
        allCourseIds.map((courseId) =>
          getDocs(
            query(
              collection(firebaseDB, "exerciseQuestions"),
              where("courseId", "==", courseId),
            ),
          ).catch(() => null),
        ),
      );

      const resolveCorrectOptionIndex = (
        rawValue: unknown,
        options: string[],
      ): number => {
        if (typeof rawValue === "number" && rawValue >= 0 && rawValue <= 3) {
          return rawValue;
        }

        if (typeof rawValue === "string") {
          const normalized = rawValue.trim().toLowerCase();
          if (["a", "b", "c", "d"].includes(normalized)) {
            return ["a", "b", "c", "d"].indexOf(normalized);
          }
          if (["1", "2", "3", "4"].includes(normalized)) {
            return Number(normalized) - 1;
          }
          const byText = options.findIndex(
            (option) =>
              normalizeQuestionText(option) ===
              normalizeQuestionText(normalized),
          );
          if (byText >= 0) {
            return byText;
          }
        }

        return -1;
      };

      const inferQuestionDraft = (
        value: unknown,
      ): SharedQuizQuestionDraft | null => {
        const parsed = value as Record<string, unknown>;
        const question = String(
          parsed.question ||
            parsed.prompt ||
            parsed.enunciado ||
            parsed.title ||
            "",
        ).trim();

        const directOptions = Array.isArray(parsed.options)
          ? parsed.options
          : Array.isArray(parsed.choices)
            ? parsed.choices
            : Array.isArray(parsed.alternatives)
              ? parsed.alternatives
              : null;

        let options = directOptions
          ? directOptions.map((option: unknown) => String(option).trim())
          : [];

        if (
          options.length === 0 &&
          parsed.options &&
          typeof parsed.options === "object"
        ) {
          const map = parsed.options as Record<string, unknown>;
          options = ["A", "B", "C", "D"].map((key, index) =>
            String(
              map[key] ||
                map[key.toLowerCase()] ||
                map[String(index + 1)] ||
                "",
            ).trim(),
          );
        }

        const correctOptionIndex = resolveCorrectOptionIndex(
          parsed.correctOptionIndex ??
            parsed.correctAnswerIndex ??
            parsed.correctAnswer ??
            parsed.correct ??
            parsed.answer,
          options,
        );

        if (!question || options.length !== 4) return null;
        if (correctOptionIndex < 0 || correctOptionIndex > 3) return null;

        return {
          question,
          options,
          correctOptionIndex,
        };
      };

      const loadedSharedTemplates: SharedQuizTemplate[] =
        sharedSnapshot?.docs
          .map((item) => {
            const data = item.data();
            const rawTemplateKind = String(data.templateKind || "exercise")
              .trim()
              .toLowerCase();
            if (rawTemplateKind && rawTemplateKind !== "exercise") return null;
            const parsedQuestions = Array.isArray(data.questions)
              ? data.questions
                  .map((question: unknown) => inferQuestionDraft(question))
                  .filter((question): question is SharedQuizQuestionDraft =>
                    Boolean(question),
                  )
              : [];
            const theme = String(data.theme || "").trim();

            return {
              id: item.id,
              ownerId: String(data.ownerId || ""),
              ownerName: String(data.ownerName || "Teacher"),
              ownerEmail: String(data.ownerEmail || ""),
              sourceCourseId: String(data.sourceCourseId || ""),
              sourceCourseCode: String(data.sourceCourseCode || ""),
              sourceCourseName: String(data.sourceCourseName || ""),
              theme,
              normalizedTheme:
                String(data.normalizedTheme || "").trim() ||
                normalizeThemeKey(theme),
              questionCount: Number(
                data.questionCount || parsedQuestions.length,
              ),
              questions: parsedQuestions,
              templateKind: "exercise",
              createdAt: toDate(data.createdAt),
              updatedAt: toDate(data.updatedAt),
            } satisfies SharedQuizTemplate;
          })
          .filter(
            (template) =>
              Boolean(template) &&
              template.theme &&
              (template.questions.length > 0 || template.questionCount > 0),
          )
          .map((template) => template as SharedQuizTemplate) || [];

      type InferredTemplateBucket = SharedQuizTemplate & {
        signatures: Set<string>;
      };

      const inferredByKey: Record<string, InferredTemplateBucket> = {};

      allQuestionsSnapshots.forEach((snapshot) => {
        snapshot?.forEach((item) => {
          const data = item.data();
          const courseId = String(data.courseId || "").trim();
          const theme = String(data.theme || "").trim();
          if (!courseId || !theme) return;

          const draft = inferQuestionDraft(data);
          if (!draft) return;

          const normalizedTheme = normalizeThemeKey(theme);
          const mapKey = `${courseId}::${normalizedTheme}`;
          const courseMeta = courseMetaById[courseId];
          const ownerId = String(courseMeta?.teacherId || data.createdBy || "").trim();
          if (!ownerId) return;
          const ownerName =
            String(courseMeta?.teacherName || "").trim() ||
            (ownerId === user?.id
              ? user.name || user.email || "Teacher"
              : "Teacher");
          const ownerEmail = ownerId === user?.id ? user.email || "" : "";
          const createdAt = toDate(data.createdAt);

          if (!inferredByKey[mapKey]) {
            inferredByKey[mapKey] = {
              id: `global_${mapKey}`,
              ownerId,
              ownerName,
              ownerEmail,
              sourceCourseId: courseId,
              sourceCourseCode: String(courseMeta?.code || ""),
              sourceCourseName: String(courseMeta?.name || ""),
              theme,
              normalizedTheme,
              questionCount: 0,
              questions: [],
              createdAt,
              updatedAt: createdAt,
              signatures: new Set<string>(),
            };
          }

          const signature = buildQuestionSignature(
            theme,
            draft.question,
            draft.options,
            draft.correctOptionIndex,
          );
          if (inferredByKey[mapKey].signatures.has(signature)) return;

          inferredByKey[mapKey].signatures.add(signature);
          inferredByKey[mapKey].questions.push(draft);
          inferredByKey[mapKey].questionCount =
            inferredByKey[mapKey].questions.length;
          if (createdAt.getTime() > inferredByKey[mapKey].updatedAt.getTime()) {
            inferredByKey[mapKey].updatedAt = createdAt;
          }
        });
      });

      const mergedByKey = new Map<string, SharedQuizTemplate>();

      Object.values(inferredByKey).forEach((template) => {
        const { signatures: _signatures, ...cleanTemplate } = template;
        const key = `${template.sourceCourseId}::${template.normalizedTheme}`;
        mergedByKey.set(key, cleanTemplate);
      });

      loadedSharedTemplates.forEach((template) => {
        const templateKey = `${template.sourceCourseId}::${template.normalizedTheme}`;
        const inferred = mergedByKey.get(templateKey);

        if (!inferred) {
          mergedByKey.set(templateKey, template);
          return;
        }

        mergedByKey.set(templateKey, {
          ...inferred,
          ...template,
          questionCount: Math.max(
            template.questionCount || template.questions.length,
            inferred.questionCount || inferred.questions.length,
          ),
          questions:
            template.questions.length > 0
              ? template.questions
              : inferred.questions,
          sourceCourseCode:
            template.sourceCourseCode || inferred.sourceCourseCode,
          sourceCourseName:
            template.sourceCourseName || inferred.sourceCourseName,
          ownerName: template.ownerName || inferred.ownerName,
          ownerId: template.ownerId || inferred.ownerId,
          updatedAt:
            template.updatedAt.getTime() >= inferred.updatedAt.getTime()
              ? template.updatedAt
              : inferred.updatedAt,
        });
      });

      setSharedTemplates(
        Array.from(mergedByKey.values()).filter(
          (template) =>
            template.theme &&
            (template.questions.length > 0 || template.questionCount > 0),
        ),
      );
    } catch (error) {
      console.error("Could not load shared quiz templates:", error);
      setSharedTemplates([]);
    } finally {
      setLoadingSharedTemplates(false);
    }
  }, [
    SHARED_TEMPLATE_COLLECTION,
    isAdmin,
    isTeacher,
    user?.email,
    user?.id,
    user?.name,
  ]);

  useEffect(() => {
    if (availableCourses.length === 0) {
      if (selectedCourseId) setSelectedCourseId("");
      return;
    }

    const globalCourse = availableCourses.find(
      (course) => course.id === selectedCourseId,
    );

    if (globalCourse) {
      if (courseCode !== globalCourse.code) {
        navigate(`/courses/${globalCourse.code}/exercise-bank`, {
          replace: true,
        });
      }
      return;
    }

    const urlCourse = courseCode
      ? availableCourses.find((course) => course.code === courseCode)
      : null;

    if (urlCourse) {
      setSelectedCourseId(urlCourse.id);
      return;
    }

    const fallback = availableCourses[0];
    setSelectedCourseId(fallback.id);
    if (courseCode !== fallback.code) {
      navigate(`/courses/${fallback.code}/exercise-bank`, { replace: true });
    }
  }, [
    availableCourses,
    courseCode,
    navigate,
    selectedCourseId,
    setSelectedCourseId,
  ]);

  useEffect(() => {
    if (!selectedCourseId) return;

    setQuestions([]);
    setThemeLinksByTheme({});
    setCourseGradeSheets([]);
    latestQuestionsRequestRef.current += 1;
    latestThemeLinksRequestRef.current += 1;
    latestGradeSheetsRequestRef.current += 1;

    if (isLearnerMode) {
      setAttemptsByTheme({});
      setAttemptsCountByTheme({});
      setAttemptHistory([]);
      latestAttemptsRequestRef.current += 1;
    }

    loadQuestions(selectedCourseId);
    loadThemeLinks(selectedCourseId);

    if (isLearnerMode && user?.id) {
      loadStudentAttempts(selectedCourseId, user.id);
    } else {
      setAttemptsByTheme({});
      setAttemptsCountByTheme({});
      setAttemptHistory([]);
      loadCourseGradeSheets(selectedCourseId);
    }
  }, [
    isLearnerMode,
    loadCourseGradeSheets,
    loadStudentAttempts,
    selectedCourseId,
    user?.id,
  ]);

  useEffect(() => {
    if (!isTeacher) {
      setSharedTemplates([]);
      return;
    }

    void loadSharedQuizTemplates();
  }, [isTeacher, loadSharedQuizTemplates, selectedCourseId]);

  useEffect(() => {
    if (!selectedTheme || !isLearnerMode) return;

    const attempt = attemptsByTheme[selectedTheme];
    if (attempt && Boolean(themeLinksByTheme[selectedTheme])) {
      setResult({
        total: attempt.total,
        correct: attempt.correct,
        percentage: attempt.percentage,
      });
      setQuizStarted(false);
    }
  }, [attemptsByTheme, isLearnerMode, selectedTheme, themeLinksByTheme]);

  useEffect(() => {
    if (!quizStarted || !isLearnerMode) return;

    const timer = window.setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isLearnerMode, quizStarted]);

  useEffect(() => {
    if (!quizStarted || !isLearnerMode) return;

    const scrollToQuiz = () => {
      const target = quizStartSectionRef.current;
      if (!target) return;

      const top = target.getBoundingClientRect().top + window.scrollY - 88;
      window.scrollTo({
        top: Math.max(0, top),
        behavior: "smooth",
      });
    };

    const frameId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollToQuiz);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isLearnerMode, quizStarted]);

  const handleCourseChange = (courseId: string) => {
    if (quizStarted && isLearnerMode) {
      const confirmLeave = window.confirm(
        "If you leave now, your progress will be saved and unanswered questions will count as incorrect. Continue?",
      );
      if (!confirmLeave) return;
    }

    const nextCourse = availableCourses.find(
      (course) => course.id === courseId,
    );
    if (!nextCourse) return;

    setSelectedCourseId(nextCourse.id);
    navigate(`/courses/${nextCourse.code}/exercise-bank`);

    setSelectedTheme("");
    setQuizStarted(false);
    setResult(null);
    setShowStartWarning(false);
    setPendingStartTheme(null);
    setTimeLeftSeconds(QUIZ_SECONDS_PER_QUESTION);
    setGradingMessage("");
    setAnswers({});
    setCurrentQuestionIndex(0);
    setQuizQuestions([]);
    setShowCreatorForm(false);
    setPendingQuestionUpdates({});
    setEditingQuestionId(null);
  };

  const requestStartQuiz = (theme: string) => {
    setSelectedTheme(theme);
    setResult(null);
    setGradingMessage("");

    if (!canTakeTheme(theme)) {
      const previous = attemptsByTheme[theme];
      if (previous) {
        setResult({
          total: previous.total,
          correct: previous.correct,
          percentage: previous.percentage,
        });
      }
      if (teacherMandatoryLearnerMode) {
        setGradingMessage(getMandatoryBlockedMessage(theme, previous));
      } else if (!isLinkedTheme(theme)) {
        setGradingMessage(
          `Attempt limit reached (${MAX_UNLINKED_ATTEMPTS}/${MAX_UNLINKED_ATTEMPTS}) for this theme.`,
        );
      }
      setQuizStarted(false);
      return;
    }

    setPendingStartTheme(theme);
    setShowStartWarning(true);
  };

  const confirmStartQuiz = () => {
    if (!pendingStartTheme) return;
    startQuiz(pendingStartTheme);
  };

  const startQuiz = (themeOverride?: string) => {
    const themeToStart = themeOverride ?? selectedTheme;
    if (!themeToStart) return;
    if (themeOverride) {
      setSelectedTheme(themeOverride);
    }

    if (
      isLearnerMode &&
      isLinkedTheme(themeToStart) &&
      attemptsByTheme[themeToStart] &&
      !teacherMandatoryLearnerMode
    ) {
      const previous = attemptsByTheme[themeToStart];
      setResult({
        total: previous.total,
        correct: previous.correct,
        percentage: previous.percentage,
      });
      setQuizStarted(false);
      return;
    }
    if (isLearnerMode && teacherMandatoryLearnerMode && !canTakeTheme(themeToStart)) {
      const previous = attemptsByTheme[themeToStart];
      if (previous) {
        setResult({
          total: previous.total,
          correct: previous.correct,
          percentage: previous.percentage,
        });
      }
      setGradingMessage(getMandatoryBlockedMessage(themeToStart, previous));
      setQuizStarted(false);
      return;
    }
    if (
      isLearnerMode &&
      !isLinkedTheme(themeToStart) &&
      !canTakeTheme(themeToStart)
    ) {
      const previous = attemptsByTheme[themeToStart];
      if (previous) {
        setResult({
          total: previous.total,
          correct: previous.correct,
          percentage: previous.percentage,
        });
      }
      if (teacherMandatoryLearnerMode) {
        setGradingMessage(getMandatoryBlockedMessage(themeToStart, previous));
      } else {
        setGradingMessage(
          `Attempt limit reached (${MAX_UNLINKED_ATTEMPTS}/${MAX_UNLINKED_ATTEMPTS}) for this theme.`,
        );
      }
      setQuizStarted(false);
      return;
    }

    const source = isAuthoringMode ? questions : publishedQuestions;
    const pool = source.filter((question) => question.theme === themeToStart);
    if (pool.length === 0) return;
    const timeLimitSeconds = pool.length * QUIZ_SECONDS_PER_QUESTION;

    setQuizQuestions(pool);
    setAnswers({});
    setCurrentQuestionIndex(0);
    setResult(null);
    setTimeLeftSeconds(timeLimitSeconds);
    setShowStartWarning(false);
    setPendingStartTheme(null);
    setGradingMessage("");
    setQuizStarted(true);
  };

  const finishQuiz = useCallback(
    async (
      reason: FinishReason = "manual",
      override?: {
        theme: string;
        quizQuestions: ExerciseQuestion[];
        answers: Record<string, number>;
      },
    ) => {
      if (finishInFlightRef.current || isFinishingQuiz) return;
      finishInFlightRef.current = true;
      setIsFinishingQuiz(true);
      try {
        const targetTheme = override?.theme ?? selectedTheme;
        const sourceQuestions = override?.quizQuestions ?? quizQuestions;
        const sourceAnswers = override?.answers ?? answers;
        if (!targetTheme || sourceQuestions.length === 0) return;

        const total = sourceQuestions.length;
        let correct = 0;

        const answerDetails: QuizAttemptAnswer[] = sourceQuestions.map(
          (question) => {
            const selectedOptionIndex = sourceAnswers[question.id] ?? -1;
            const isCorrect =
              selectedOptionIndex === question.correctOptionIndex;
            if (isCorrect) correct += 1;

            return {
              questionId: question.id,
              selectedOptionIndex,
              correctOptionIndex: question.correctOptionIndex,
              isCorrect,
            };
          },
        );

        const percentage =
          total === 0 ? 0 : Math.round((correct / total) * 100);
        const quizResult = { total, correct, percentage };

        if (isLearnerMode && user?.id) {
          const linkedTheme = Boolean(themeLinksByTheme[targetTheme]);
          const currentThemeAttempts = getThemeAttemptCount(targetTheme);
          const allowAttemptSave = teacherMandatoryLearnerMode
            ? currentThemeAttempts < MAX_MANDATORY_ATTEMPTS
            : linkedTheme
              ? !attemptsByTheme[targetTheme]
              : currentThemeAttempts < MAX_UNLINKED_ATTEMPTS;
          const nextAttemptsCount = allowAttemptSave
            ? currentThemeAttempts + 1
            : currentThemeAttempts;
          const mandatoryApproved =
            quizResult.percentage >= MANDATORY_APPROVAL_PERCENTAGE;
          const shouldTriggerMandatoryFailureAlert = Boolean(
            teacherMandatoryLearnerMode &&
              allowAttemptSave &&
              !mandatoryApproved &&
              nextAttemptsCount >= MAX_MANDATORY_ATTEMPTS,
          );

          if (allowAttemptSave) {
            const createdAt = new Date();
            const docRef = await addDoc(
              collection(firebaseDB, "quizAttempts"),
              {
                courseId: selectedCourseId,
                theme: targetTheme,
                studentId: user.id,
                total,
                correct,
                percentage,
                answers: answerDetails,
                createdAt,
              },
            );

            setAttemptsByTheme((prev) => ({
              ...prev,
              [targetTheme]: {
                id: docRef.id,
                courseId: selectedCourseId,
                theme: targetTheme,
                studentId: user.id,
                total,
                correct,
                percentage,
                answers: answerDetails,
                createdAt,
              },
            }));
            setAttemptsCountByTheme((prev) => ({
              ...prev,
              [targetTheme]: (prev[targetTheme] || 0) + 1,
            }));

            setAttemptHistory((prev) => {
              const newAttempt: QuizAttempt = {
                id: docRef.id,
                courseId: selectedCourseId,
                theme: targetTheme,
                studentId: user.id,
                total,
                correct,
                percentage,
                answers: answerDetails,
                createdAt,
              };
              return dedupeAttempts([newAttempt, ...prev]).slice(
                0,
                MAX_HISTORY_ATTEMPTS,
              );
            });
          }

          if (shouldTriggerMandatoryFailureAlert) {
            try {
              const alertDocId = `mandatory_fail_${selectedCourseId}_${user.id}_${normalizeThemeKey(targetTheme)}`;
              const historyRef = doc(
                firebaseDB,
                "usuarios",
                user.id,
                "mandatoryQuizAlerts",
                alertDocId,
              );
              await setDoc(
                historyRef,
                {
                  userId: user.id,
                  courseId: selectedCourseId,
                  courseCode: String(selectedCourse?.code || "").trim(),
                  courseName: String(selectedCourse?.name || "").trim(),
                  theme: targetTheme,
                  attemptsUsed: nextAttemptsCount,
                  requiredPercentage: MANDATORY_APPROVAL_PERCENTAGE,
                  lastPercentage: quizResult.percentage,
                  status: "not_approved",
                  triggeredAt: new Date(),
                },
                { merge: true },
              );

              const courseCode = String(selectedCourse?.code || "").trim();
              const notificationLink = courseCode
                ? `/courses/${courseCode}/exercise-bank`
                : "/courses";
              await notificationService.createNotification(user.id, {
                title: "Mandatory quiz not approved",
                message: `You reached ${MAX_MANDATORY_ATTEMPTS}/${MAX_MANDATORY_ATTEMPTS} attempts in "${targetTheme}" without reaching ${MANDATORY_APPROVAL_PERCENTAGE}%.`,
                type: "warning",
                link: notificationLink,
                courseCode,
                dedupeKey: alertDocId,
              });
            } catch {
              // Keep quiz submission flow resilient even if alert persistence fails.
            }
          }

          if (linkedTheme && allowAttemptSave) {
            try {
              const gradeSyncMessage = await syncQuizScoreToLinkedGradeSheet(
                targetTheme,
                quizResult,
              );
              setGradingMessage(
                gradeSyncMessage ||
                  "Quiz completed. This theme has no linked grade sheet.",
              );
            } catch {
              setGradingMessage(
                "Quiz completed, but grade could not be synced to a grade sheet.",
              );
            }
          } else if (!linkedTheme && !teacherMandatoryLearnerMode) {
            const attemptsLeft = Math.max(
              0,
              MAX_UNLINKED_ATTEMPTS - nextAttemptsCount,
            );
            if (attemptsLeft > 0) {
              setGradingMessage(
                `This quiz is not linked to a grade sheet. Attempts left: ${attemptsLeft}/${MAX_UNLINKED_ATTEMPTS}.`,
              );
            } else {
              setGradingMessage(
                `This quiz is not linked to a grade sheet. You reached the limit (${MAX_UNLINKED_ATTEMPTS}/${MAX_UNLINKED_ATTEMPTS}).`,
              );
            }
          } else if (!allowAttemptSave) {
            setGradingMessage(
              "Attempt not saved because the attempt limit was reached.",
            );
          }

          if (teacherMandatoryLearnerMode) {
            setGradingMessage((prev) => {
              const attemptsLeft = Math.max(
                0,
                MAX_MANDATORY_ATTEMPTS - nextAttemptsCount,
              );
              const approvalMessage = mandatoryApproved
                ? `Approved (${quizResult.percentage}%). Minimum required: ${MANDATORY_APPROVAL_PERCENTAGE}%.`
                : attemptsLeft > 0
                  ? `Not approved (${quizResult.percentage}%). You need at least ${MANDATORY_APPROVAL_PERCENTAGE}% to pass. Attempts left: ${attemptsLeft}/${MAX_MANDATORY_ATTEMPTS}.`
                  : `Not approved (${quizResult.percentage}%). You reached ${MAX_MANDATORY_ATTEMPTS}/${MAX_MANDATORY_ATTEMPTS} attempts.`;
              return prev ? `${prev} ${approvalMessage}` : approvalMessage;
            });
          }
        }

        if (reason === "timeout") {
          setGradingMessage((prev) =>
            prev
              ? `${prev} Time is over.`
              : "Time is over. Quiz submitted automatically.",
          );
        }
        if (reason === "abandoned") {
          setGradingMessage((prev) =>
            prev
              ? `${prev} Quiz auto-saved after leaving the page. Unanswered questions were counted as incorrect.`
              : "Quiz auto-saved after leaving the page. Unanswered questions were counted as incorrect.",
          );
        }

        setResult(quizResult);
        setQuizStarted(false);
        if (activeQuizStorageKey) {
          localStorage.removeItem(activeQuizStorageKey);
        }
      } finally {
        setIsFinishingQuiz(false);
        finishInFlightRef.current = false;
      }
    },
    [
      MAX_MANDATORY_ATTEMPTS,
      MAX_UNLINKED_ATTEMPTS,
      MANDATORY_APPROVAL_PERCENTAGE,
      answers,
      attemptsByTheme,
      dedupeAttempts,
      finishInFlightRef,
      getThemeAttemptCount,
      isFinishingQuiz,
      isLearnerMode,
      teacherMandatoryLearnerMode,
      isAuthoringMode,
      quizQuestions,
      selectedCourseId,
      selectedCourse?.code,
      selectedCourse?.name,
      selectedTheme,
      activeQuizStorageKey,
      themeLinksByTheme,
      user?.id,
    ],
  );

  useEffect(() => {
    finishQuizRef.current = finishQuiz;
  }, [finishQuiz]);

  useEffect(() => {
    quizSessionRef.current = {
      quizStarted,
      isTeacher: isAuthoringMode,
      selectedTheme,
      quizQuestions,
      answers,
    };
  }, [answers, isAuthoringMode, quizQuestions, quizStarted, selectedTheme]);

  useEffect(() => {
    if (!activeQuizStorageKey) return;

      try {
        if (
        isLearnerMode &&
        quizStarted &&
        selectedTheme &&
        quizQuestions.length > 0
      ) {
        localStorage.setItem(quizGuardStorageKey, "1");
        localStorage.setItem(
          activeQuizStorageKey,
          JSON.stringify({
            theme: selectedTheme,
            answers,
            quizQuestions: quizQuestions.map((question) => ({
              id: question.id,
              correctOptionIndex: question.correctOptionIndex,
            })),
            updatedAt: Date.now(),
          }),
        );
      } else {
        localStorage.removeItem(activeQuizStorageKey);
        if (!quizStarted) {
          localStorage.removeItem(quizGuardStorageKey);
        }
      }
    } catch {}
  }, [
    activeQuizStorageKey,
    answers,
    isLearnerMode,
    quizGuardStorageKey,
    quizQuestions,
    quizStarted,
    selectedTheme,
  ]);

  useEffect(() => {
    return () => {
      const session = quizSessionRef.current;
      if (
        !session.isTeacher &&
        session.quizStarted &&
        session.selectedTheme &&
        session.quizQuestions.length > 0 &&
        finishQuizRef.current
      ) {
        void finishQuizRef.current("abandoned", {
          theme: session.selectedTheme,
          quizQuestions: session.quizQuestions,
          answers: session.answers,
        });
      }
    };
  }, []);

  const handleSelectTheme = useCallback(
    async (theme: string) => {
      if (quizStarted && selectedTheme === theme) {
        quizStartSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      }

      if (
        isLearnerMode &&
        quizStarted &&
        selectedTheme &&
        selectedTheme !== theme
      ) {
        await finishQuiz("abandoned");
        setResult(null);
        setGradingMessage("");
      }

      setSelectedTheme(theme);
      setQuizStarted(false);
    },
    [finishQuiz, isLearnerMode, quizStarted, selectedTheme],
  );

  const handleStartTheme = useCallback(
    async (theme: string) => {
      if (quizStarted && selectedTheme === theme) {
        quizStartSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      }

      if (
        isLearnerMode &&
        quizStarted &&
        selectedTheme &&
        selectedTheme !== theme
      ) {
        await finishQuiz("abandoned");
      }

      requestStartQuiz(theme);
    },
    [finishQuiz, isLearnerMode, quizStarted, requestStartQuiz, selectedTheme],
  );

  const syncQuizScoreToLinkedGradeSheet = useCallback(
    async (theme: string, quizResult: QuizResult): Promise<string> => {
      if (!selectedCourseId || !user?.id) return "";

      const linkedSheetId = themeLinksByTheme[theme];
      if (!linkedSheetId) return "";

      const sheetRef = doc(firebaseDB, "gradeSheets", linkedSheetId);
      const sheetSnapshot = await getDoc(sheetRef);
      if (!sheetSnapshot.exists()) {
        return "Quiz saved, but linked grade sheet was not found.";
      }

      const data = sheetSnapshot.data();
      const existingActivitiesRaw = Array.isArray(data.activities)
        ? data.activities
        : [];
      const existingStudentsRaw = Array.isArray(data.students)
        ? data.students
        : [];

      const activityId = `exercise_quiz_${normalizeThemeKey(theme)}`;
      const activityName = `Exercise Quiz - ${theme}`;
      const maxScore = 5;

      const activityAlreadyExists = existingActivitiesRaw.some(
        (activity: Record<string, unknown>) =>
          String(activity.id || "") === activityId,
      );

      const nextActivities: GradeSheetActivity[] = activityAlreadyExists
        ? existingActivitiesRaw.map((activity: Record<string, unknown>) => ({
            id: String(activity.id || ""),
            name: String(activity.name || ""),
            maxScore: Number(activity.maxScore || 5),
            type: String(activity.type || "quiz"),
            description: String(activity.description || ""),
          }))
        : [
            ...existingActivitiesRaw.map(
              (activity: Record<string, unknown>) => ({
                id: String(activity.id || ""),
                name: String(activity.name || ""),
                maxScore: Number(activity.maxScore || 5),
                type: String(activity.type || "quiz"),
                description: String(activity.description || ""),
              }),
            ),
            {
              id: activityId,
              name: activityName,
              maxScore,
              type: "quiz",
              description: `Exercise Bank theme: ${theme}`,
            },
          ];

      let studentExists = false;

      const normalizedStudents: GradeSheetStudentRow[] =
        existingStudentsRaw.map((student: Record<string, unknown>) => {
          const studentId = String(student.studentId || "");
          const studentName = String(student.name || "Student");
          const currentGrades = student.grades as
            | Record<string, unknown>
            | undefined;

          const normalizedGrades: GradeSheetStudentRow["grades"] = {};
          nextActivities.forEach((activity) => {
            const rawValue =
              currentGrades && typeof currentGrades === "object"
                ? (currentGrades[activity.id] as
                    | Record<string, unknown>
                    | undefined)
                : undefined;

            normalizedGrades[activity.id] = {
              value:
                rawValue &&
                rawValue.value !== undefined &&
                rawValue.value !== null
                  ? Number(rawValue.value)
                  : null,
              comment:
                rawValue && typeof rawValue.comment === "string"
                  ? rawValue.comment
                  : "",
              submittedAt: rawValue ? rawValue.submittedAt : null,
            };
          });

          if (studentId === user.id) {
            studentExists = true;
            const gradeValue = Number(
              ((quizResult.percentage / 100) * 5).toFixed(2),
            );
            normalizedGrades[activityId] = {
              value: gradeValue,
              comment: `${quizResult.correct}/${quizResult.total} (${quizResult.percentage}%)`,
              submittedAt: Timestamp.now(),
            };
          }

          return {
            studentId,
            name: studentName,
            grades: normalizedGrades,
            total: calculateStudentTotal(normalizedGrades, nextActivities),
            status: determineStatus(normalizedGrades, nextActivities),
          };
        });

      if (!studentExists) {
        const grades: GradeSheetStudentRow["grades"] = {};
        nextActivities.forEach((activity) => {
          grades[activity.id] = {
            value: null,
            comment: "",
            submittedAt: null,
          };
        });

        const gradeValue = Number(
          ((quizResult.percentage / 100) * 5).toFixed(2),
        );
        grades[activityId] = {
          value: gradeValue,
          comment: `${quizResult.correct}/${quizResult.total} (${quizResult.percentage}%)`,
          submittedAt: Timestamp.now(),
        };

        normalizedStudents.push({
          studentId: user.id,
          name: user.name || user.email || "Student",
          grades,
          total: calculateStudentTotal(grades, nextActivities),
          status: determineStatus(grades, nextActivities),
        });
      }

      normalizedStudents.sort((a, b) => a.name.localeCompare(b.name));

      await updateDoc(sheetRef, {
        activities: nextActivities,
        students: normalizedStudents,
        updatedAt: Timestamp.now(),
      });

      return `Grade saved in linked sheet: ${activityName}.`;
    },
    [selectedCourseId, themeLinksByTheme, user?.email, user?.id, user?.name],
  );

  const handleThemeLinkChange = async (theme: string, gradeSheetId: string) => {
    if (!selectedCourseId || !user?.id || !isAuthoringMode) return;

    setSavingThemeLink(theme);
    try {
      const linkDocId = getThemeLinkDocId(selectedCourseId, theme);
      await setDoc(
        doc(firebaseDB, "exerciseThemeLinks", linkDocId),
        {
          courseId: selectedCourseId,
          theme,
          gradeSheetId,
          updatedBy: user.id,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );

      setThemeLinksByTheme((prev) => ({
        ...prev,
        [theme]: gradeSheetId,
      }));
    } finally {
      setSavingThemeLink(null);
    }
  };

  const resetCreatorForm = () => {
    setThemeMode("existing");
    setQuestionCreationMode("single");
    setSelectedExistingTheme("");
    setThemeInput("");
    setQuestionInput("");
    setOptionsInput(["", "", "", ""]);
    setCorrectOptionIndex(0);
    setBulkQuestionsInput("");
    setPublishOnCreate(false);
  };

  const parseBulkQuestions = (
    rawInput: string,
    fallbackTheme: string,
  ): { questions: BulkQuestionDraft[]; errors: string[] } => {
    const blocks = rawInput
      .split(/\n\s*---+\s*\n/g)
      .map((block) => block.trim())
      .filter(Boolean);

    if (blocks.length === 0) {
      return { questions: [], errors: ["Paste at least one question block."] };
    }

    const parsed: BulkQuestionDraft[] = [];
    const errors: string[] = [];

    blocks.forEach((block, blockIndex) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      let theme = fallbackTheme;
      let question = "";
      const optionsMap: Record<string, string> = {};
      let correctLabel = "";

      lines.forEach((line) => {
        const themeMatch = line.match(/^theme\s*:\s*(.+)$/i);
        if (themeMatch) {
          theme = themeMatch[1].trim();
          return;
        }

        const questionMatch = line.match(/^(q|question)\s*:\s*(.+)$/i);
        if (questionMatch) {
          question = questionMatch[2].trim();
          return;
        }

        const optionMatch = line.match(/^([a-d])[).:-]\s*(.+)$/i);
        if (optionMatch) {
          optionsMap[optionMatch[1].toUpperCase()] = optionMatch[2].trim();
          return;
        }

        const correctMatch = line.match(/^correct\s*:\s*([a-d1-4])$/i);
        if (correctMatch) {
          correctLabel = correctMatch[1].toUpperCase();
        }
      });

      if (!theme) errors.push(`Block ${blockIndex + 1}: missing theme.`);
      if (!question)
        errors.push(`Block ${blockIndex + 1}: missing question (Q:).`);

      const orderedOptions = ["A", "B", "C", "D"].map(
        (key) => optionsMap[key] || "",
      );
      if (orderedOptions.some((option) => !option)) {
        errors.push(`Block ${blockIndex + 1}: provide 4 options (A-D).`);
      }

      const normalizedCorrect = ["1", "2", "3", "4"].includes(correctLabel)
        ? String.fromCharCode("A".charCodeAt(0) + Number(correctLabel) - 1)
        : correctLabel;
      const correctOptionIndex = ["A", "B", "C", "D"].indexOf(
        normalizedCorrect,
      );
      if (correctOptionIndex < 0) {
        errors.push(
          `Block ${blockIndex + 1}: invalid Correct value (use A-D or 1-4).`,
        );
      }

      if (
        errors.length === 0 ||
        errors.every((error) => !error.startsWith(`Block ${blockIndex + 1}:`))
      ) {
        parsed.push({
          theme,
          question,
          options: orderedOptions,
          correctOptionIndex,
        });
      }
    });

    return { questions: parsed, errors };
  };

  const toEditableQuestionFields = (
    question: ExerciseQuestion,
  ): EditableQuestionFields => ({
    theme: question.theme,
    question: question.question,
    options: question.options,
    correctOptionIndex: question.correctOptionIndex,
    isPublished: question.isPublished,
  });

  const queueQuestionUpdate = (
    questionId: string,
    nextValues: EditableQuestionFields,
  ) => {
    setQuestions((prev) =>
      prev.map((question) =>
        question.id === questionId ? { ...question, ...nextValues } : question,
      ),
    );
    setPendingQuestionUpdates((prev) => ({
      ...prev,
      [questionId]: nextValues,
    }));
  };

  const handleCreateQuestion = async () => {
    if (!selectedCourseId || !user || !isAuthoringMode) return;

    const normalizedTheme =
      themeMode === "existing"
        ? selectedExistingTheme.trim()
        : themeInput.trim();
    if (!normalizedTheme) return;

    setSaving(true);
    try {
      if (questionCreationMode === "bulk") {
        const { questions: parsedQuestions, errors } = parseBulkQuestions(
          bulkQuestionsInput,
          normalizedTheme,
        );
        if (errors.length > 0) {
          alert(
            `Could not import questions:\n\n${errors.slice(0, 6).join("\n")}`,
          );
          return;
        }

        const chunkSize = 400;
        for (let i = 0; i < parsedQuestions.length; i += chunkSize) {
          const chunk = parsedQuestions.slice(i, i + chunkSize);
          const batch = writeBatch(firebaseDB);
          chunk.forEach((item) => {
            const docRef = doc(collection(firebaseDB, "exerciseQuestions"));
            batch.set(docRef, {
              courseId: selectedCourseId,
              theme: item.theme,
              question: item.question,
              options: item.options,
              correctOptionIndex: item.correctOptionIndex,
              isPublished: publishOnCreate,
              createdBy: user.id,
              createdAt: new Date(),
            });
          });
          await batch.commit();
        }
      } else {
        const normalizedQuestion = questionInput.trim();
        const normalizedOptions = optionsInput.map((option) => option.trim());
        if (!normalizedQuestion) return;
        if (normalizedOptions.some((option) => option.length === 0)) return;
        if (correctOptionIndex < 0 || correctOptionIndex > 3) return;

        await addDoc(collection(firebaseDB, "exerciseQuestions"), {
          courseId: selectedCourseId,
          theme: normalizedTheme,
          question: normalizedQuestion,
          options: normalizedOptions,
          correctOptionIndex,
          isPublished: publishOnCreate,
          createdBy: user.id,
          createdAt: new Date(),
        });
      }

      resetCreatorForm();
      setShowCreatorForm(false);
      await loadQuestions(selectedCourseId);
    } finally {
      setSaving(false);
    }
  };

  const publishThemeToSharedBank = async (theme: string) => {
    if (!isAuthoringMode || !user?.id || !selectedCourseId) return;

    const normalizedTheme = theme.trim();
    if (!normalizedTheme) return;

    const themeQuestions = questions.filter(
      (question) => question.theme.trim() === normalizedTheme,
    );
    if (themeQuestions.length === 0) return;

    setPublishingTheme(normalizedTheme);
    try {
      const templateId = `template_${user.id}_${selectedCourseId}_${normalizeThemeKey(normalizedTheme)}`;
      const templateRef = doc(
        firebaseDB,
        SHARED_TEMPLATE_COLLECTION,
        templateId,
      );
      const existingTemplate = await getDoc(templateRef);
      const createdAt = existingTemplate.exists()
        ? existingTemplate.data().createdAt
        : Timestamp.now();

      await setDoc(
        templateRef,
        {
          ownerId: user.id,
          ownerName: user.name || user.email || "Teacher",
          ownerEmail: user.email || "",
          sourceCourseId: selectedCourseId,
          sourceCourseCode: selectedCourse?.code || "",
          sourceCourseName: selectedCourse?.name || "",
          theme: normalizedTheme,
          normalizedTheme: normalizeThemeKey(normalizedTheme),
          questionCount: themeQuestions.length,
          questions: themeQuestions.map((question) => ({
            question: question.question.trim(),
            options: question.options.map((option) => option.trim()),
            correctOptionIndex: question.correctOptionIndex,
          })),
          createdAt,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );

      const publishedTemplateKey = getSharedTemplateVisibilityKey({
        sourceCourseId: selectedCourseId,
        normalizedTheme: normalizeThemeKey(normalizedTheme),
        templateKind: "exercise",
      });
      setHiddenSharedTemplateKeys((prev) =>
        prev.filter((key) => key !== publishedTemplateKey),
      );

      await loadSharedQuizTemplates();
      alert(
        `Theme "${normalizedTheme}" is now available in the shared quiz bank.`,
      );
    } catch (error) {
      console.error("Could not publish shared quiz template:", error);
      alert("Could not publish this theme to the shared bank.");
    } finally {
      setPublishingTheme(null);
    }
  };

  const importSharedTemplateToCourse = async (template: SharedQuizTemplate) => {
    if (
      !isAuthoringMode ||
      !user?.id ||
      !selectedCourseId ||
      importingTemplateId ||
      deletingImportedTemplateId ||
      deletingSharedTemplateId
    )
      return;

    setImportingTemplateId(template.id);
    try {
      if (!template.questions.length) return;

      const existingSignatures = new Set(
        questions.map((question) =>
          buildQuestionSignature(
            question.theme,
            question.question,
            question.options,
            question.correctOptionIndex,
          ),
        ),
      );

      const templateSignatures = new Set<string>();
      const questionsToImport = template.questions.filter((question) => {
        const signature = buildQuestionSignature(
          template.theme,
          question.question,
          question.options,
          question.correctOptionIndex,
        );
        if (
          existingSignatures.has(signature) ||
          templateSignatures.has(signature)
        ) {
          return false;
        }
        templateSignatures.add(signature);
        return true;
      });

      if (questionsToImport.length === 0) {
        alert("All questions in this template already exist in your course.");
        return;
      }

      const chunkSize = 350;
      for (
        let index = 0;
        index < questionsToImport.length;
        index += chunkSize
      ) {
        const chunk = questionsToImport.slice(index, index + chunkSize);
        const batch = writeBatch(firebaseDB);
        chunk.forEach((item) => {
          const docRef = doc(collection(firebaseDB, "exerciseQuestions"));
          batch.set(docRef, {
            courseId: selectedCourseId,
            theme: template.theme,
            question: item.question.trim(),
            options: item.options.map((option) => option.trim()),
            correctOptionIndex: item.correctOptionIndex,
            isPublished: false,
            createdBy: user.id,
            createdAt: new Date(),
          });
        });
        await batch.commit();
      }

      await loadQuestions(selectedCourseId);
      alert(
        `Imported ${questionsToImport.length} question${questionsToImport.length === 1 ? "" : "s"} from "${template.theme}" as draft.`,
      );
    } catch (error) {
      console.error("Could not import shared quiz template:", error);
      alert("Could not import this shared template.");
    } finally {
      setImportingTemplateId(null);
    }
  };

  const handleDeleteImportedTemplateFromCourse = async (
    template: SharedQuizTemplate,
  ) => {
    if (
      !isAuthoringMode ||
      !user?.id ||
      !selectedCourseId ||
      deletingImportedTemplateId ||
      importingTemplateId
    ) {
      return;
    }

    const currentCourseId = String(selectedCourseId || "").trim();
    const templateSourceCourseId = String(template.sourceCourseId || "").trim();
    const currentCourseCode = String(selectedCourse?.code || "")
      .trim()
      .toLowerCase();
    const templateSourceCourseCode = String(template.sourceCourseCode || "")
      .trim()
      .toLowerCase();
    const asSourceQuiz = Boolean(
      currentCourseId &&
        ((templateSourceCourseId &&
          templateSourceCourseId === currentCourseId) ||
          (templateSourceCourseCode &&
            currentCourseCode &&
            templateSourceCourseCode === currentCourseCode)),
    );

    const confirmed = window.confirm(
      asSourceQuiz
        ? `Delete quiz "${template.theme}" from the current course? This action cannot be undone.`
        : `Delete imported content from "${template.theme}" in the current course? This action cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingImportedTemplateId(template.id);
    try {
      let deletedQuestions = 0;
      let importedQuestionIds = questions
        .filter((question) => {
          const data = question as unknown as Record<string, unknown>;
          return (
            String(data.importedFromTemplateId || "") === template.id &&
            String(data.importedByUserId || "") === user.id
          );
        })
        .map((question) => question.id);

      if (importedQuestionIds.length === 0 && template.questions.length > 0) {
        const templateSignatures = new Set(
          template.questions.map((item) =>
            buildQuestionSignature(
              template.theme,
              item.question,
              item.options,
              item.correctOptionIndex,
            ),
          ),
        );

        importedQuestionIds = questions
          .filter(
            (question) =>
              question.createdBy === user.id &&
              templateSignatures.has(
                buildQuestionSignature(
                  question.theme,
                  question.question,
                  question.options,
                  question.correctOptionIndex,
                ),
              ),
          )
          .map((question) => question.id);
      }

      if (importedQuestionIds.length > 0) {
        const chunkSize = 350;
        for (
          let index = 0;
          index < importedQuestionIds.length;
          index += chunkSize
        ) {
          const chunk = importedQuestionIds.slice(index, index + chunkSize);
          const batch = writeBatch(firebaseDB);
          chunk.forEach((questionId) => {
            batch.delete(doc(firebaseDB, "exerciseQuestions", questionId));
          });
          await batch.commit();
        }

        const importedSet = new Set(importedQuestionIds);
        deletedQuestions = importedQuestionIds.length;

        setQuestions((prev) =>
          prev.filter((question) => !importedSet.has(question.id)),
        );
        setPendingQuestionUpdates((prev) => {
          const next = { ...prev };
          importedQuestionIds.forEach((questionId) => {
            delete next[questionId];
          });
          return next;
        });
        if (editingQuestionId && importedSet.has(editingQuestionId)) {
          setEditingQuestionId(null);
        }
      }

      if (deletedQuestions === 0) {
        alert(
          asSourceQuiz
            ? "No matching quiz items were found for this template in the current course."
            : "No imported items were found for this template in the course.",
        );
        return;
      }

      const messageParts: string[] = [];
      if (deletedQuestions > 0) {
        messageParts.push(
          `${deletedQuestions} question${deletedQuestions === 1 ? "" : "s"}`,
        );
      }
      alert(
        asSourceQuiz
          ? `Deleted quiz ${messageParts.join(" and ")}.`
          : `Deleted imported ${messageParts.join(" and ")}.`,
      );
    } catch (error) {
      console.error("Could not delete imported template content:", error);
      alert("Could not delete imported content for this template.");
    } finally {
      setDeletingImportedTemplateId(null);
    }
  };

  const handleDeleteSharedTemplate = async (template: SharedQuizTemplate) => {
    const canDeleteSharedTemplate =
      template.ownerId === user?.id && template.id.startsWith("template_");
    if (!canDeleteSharedTemplate || deletingSharedTemplateId) return;

    const confirmed = window.confirm(
      `Delete "${template.theme}" from the shared quiz bank?`,
    );
    if (!confirmed) return;

    setDeletingSharedTemplateId(template.id);
    try {
      await deleteDoc(doc(firebaseDB, SHARED_TEMPLATE_COLLECTION, template.id));
      const hiddenTemplateKey = getSharedTemplateVisibilityKey(template);
      setHiddenSharedTemplateKeys((prev) =>
        prev.includes(hiddenTemplateKey) ? prev : [...prev, hiddenTemplateKey],
      );
      setSharedTemplates((prev) =>
        prev.filter(
          (candidate) =>
            getSharedTemplateVisibilityKey(candidate) !== hiddenTemplateKey,
        ),
      );
      alert(`"${template.theme}" was removed from shared quizzes.`);
    } catch (error) {
      console.error("Could not delete shared template:", error);
      alert("Could not delete this shared quiz.");
    } finally {
      setDeletingSharedTemplateId(null);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    setDeletingId(questionId);
    try {
      await deleteDoc(doc(firebaseDB, "exerciseQuestions", questionId));
      setQuestions((prev) =>
        prev.filter((question) => question.id !== questionId),
      );
      setPendingQuestionUpdates((prev) => {
        const { [questionId]: _, ...rest } = prev;
        return rest;
      });
      if (editingQuestionId === questionId) {
        setEditingQuestionId(null);
      }
    } finally {
      setDeletingId(null);
      setShowDeleteConfirm(null);
    }
  };

  const handleToggleQuestionPublish = (question: ExerciseQuestion) => {
    queueQuestionUpdate(question.id, {
      ...toEditableQuestionFields(question),
      isPublished: !question.isPublished,
    });
  };

  const startEditingQuestion = (question: ExerciseQuestion) => {
    setEditingQuestionId(question.id);
    setEditingTheme(question.theme);
    setEditingQuestionText(question.question);
    setEditingOptions(
      question.options.length === 4 ? [...question.options] : ["", "", "", ""],
    );
    setEditingCorrectOptionIndex(question.correctOptionIndex);
  };

  const cancelEditingQuestion = () => {
    setEditingQuestionId(null);
  };

  const queueEditedQuestion = () => {
    if (!editingQuestionId) return;

    const normalizedTheme = editingTheme.trim();
    const normalizedQuestion = editingQuestionText.trim();
    const normalizedOptions = editingOptions.map((option) => option.trim());

    if (!normalizedTheme || !normalizedQuestion) return;
    if (normalizedOptions.some((option) => !option)) return;
    if (editingCorrectOptionIndex < 0 || editingCorrectOptionIndex > 3) return;

    const baseQuestion = questions.find(
      (question) => question.id === editingQuestionId,
    );
    if (!baseQuestion) return;

    queueQuestionUpdate(editingQuestionId, {
      ...toEditableQuestionFields(baseQuestion),
      theme: normalizedTheme,
      question: normalizedQuestion,
      options: normalizedOptions,
      correctOptionIndex: editingCorrectOptionIndex,
    });
    setEditingQuestionId(null);
  };

  const saveAllQuestionChanges = async () => {
    const entries = Object.entries(pendingQuestionUpdates);
    if (entries.length === 0) return;

    setSavingAllQuestionChanges(true);
    try {
      const batch = writeBatch(firebaseDB);
      entries.forEach(([questionId, values]) => {
        batch.update(doc(firebaseDB, "exerciseQuestions", questionId), values);
      });
      await batch.commit();
      setPendingQuestionUpdates({});
    } finally {
      setSavingAllQuestionChanges(false);
    }
  };

  const applyBulkVisibilityByTheme = async () => {
    const themesToPublish =
      bulkPublishTheme === "all" ? availableThemes : [bulkPublishTheme];

    const targetQuestions = questions.filter(
      (question) =>
        (bulkVisibilityAction === "publish"
          ? !question.isPublished
          : question.isPublished) && themesToPublish.includes(question.theme),
    );

    if (targetQuestions.length === 0) return;

    setBulkPublishing(true);
    try {
      const batch = writeBatch(firebaseDB);
      targetQuestions.forEach((question) => {
        batch.update(doc(firebaseDB, "exerciseQuestions", question.id), {
          isPublished: bulkVisibilityAction === "publish",
        });
      });
      await batch.commit();

      const targetIds = new Set(targetQuestions.map((question) => question.id));

      setQuestions((prev) =>
        prev.map((question) =>
          targetIds.has(question.id)
            ? { ...question, isPublished: bulkVisibilityAction === "publish" }
            : question,
        ),
      );

      setPendingQuestionUpdates((prev) => {
        const next = { ...prev };
        targetQuestions.forEach((question) => {
          if (next[question.id]) {
            next[question.id] = {
              ...next[question.id],
              isPublished: bulkVisibilityAction === "publish",
            };
          }
        });
        return next;
      });
    } finally {
      setBulkPublishing(false);
    }
  };

  const handleEditingChange = (field: EditingField, value: unknown) => {
    switch (field) {
      case "theme":
        if (typeof value === "string") {
          setEditingTheme(value);
        }
        break;
      case "question":
        if (typeof value === "string") {
          setEditingQuestionText(value);
        }
        break;
      case "options":
        if (
          Array.isArray(value) &&
          value.every((item) => typeof item === "string")
        ) {
          setEditingOptions(value);
        }
        break;
      case "correctOptionIndex":
        if (typeof value === "number") {
          setEditingCorrectOptionIndex(value);
        }
        break;
    }
  };

  const handleCloseResult = () => {
    setResult(null);
    setGradingMessage("");
    setSelectedTheme("");
  };

  const renderSharedQuizBankPanel = () => (
    isAdmin ? null : (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm"
    >
      <div className="px-4 py-3 border-b border-slate-200/60 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-sky-100 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-sky-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">
              Shared Quiz Bank
            </h2>
            <p className="text-xs text-slate-500">
              Reuse, import, and publish quizzes across courses
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 bg-gradient-to-b from-slate-50/50 to-white">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 lg:col-span-2">
            <p className="text-xs font-semibold tracking-wide text-sky-700 mb-2">
              Publish one of your themes
            </p>
            <div className="flex items-center gap-2">
              <select
                value={selectedThemeToPublish}
                onChange={(event) =>
                  setSelectedThemeToPublish(event.target.value)
                }
                className="flex-1 min-w-0 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500"
              >
                {availableThemes.length === 0 && (
                  <option value="">No themes available</option>
                )}
                {availableThemes.map((theme) => (
                  <option key={theme} value={theme}>
                    {theme}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  void publishThemeToSharedBank(selectedThemeToPublish);
                }}
                disabled={
                  !selectedThemeToPublish ||
                  publishingTheme === selectedThemeToPublish
                }
                className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {publishingTheme === selectedThemeToPublish ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                Publish
              </button>
            </div>
            {!selectedCourseId && (
              <p className="mt-2 text-[11px] text-sky-700">
                Select a course to publish or import quizzes.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-100/80 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Shared templates
              </p>
              <p className="text-lg font-semibold text-slate-900">
                {visibleSharedTemplates.length}
              </p>
            </div>
            <div className="rounded-xl bg-slate-100/80 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                From others
              </p>
              <p className="text-lg font-semibold text-slate-900">
                {sharedTemplatesFromOtherTeachersCount}
              </p>
            </div>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={sharedSearchQuery}
            onChange={(event) => setSharedSearchQuery(event.target.value)}
            placeholder="Search shared quizzes..."
            className="w-full rounded-lg border border-slate-200/60 py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          />
        </div>

        <div className="max-h-[62vh] overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {loadingSharedTemplates ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
            </div>
          ) : filteredSharedTemplates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200/60 px-3 py-6 text-center text-sm text-slate-500">
              No shared templates found yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredSharedTemplates.map((template) => {
                const isOwnTemplate = template.ownerId === user?.id;
                const canImportTemplate =
                  isAuthoringMode &&
                  Boolean(selectedCourseId) &&
                  template.questions.length > 0;
                const isTemplatePresentInCurrentCourse = Boolean(
                  canImportTemplate &&
                    template.questions.length > 0 &&
                    template.questions.every((item) =>
                      currentCourseQuestionSignatureSet.has(
                        buildQuestionSignature(
                          template.theme,
                          item.question,
                          item.options,
                          item.correctOptionIndex,
                        ),
                      ),
                    ),
                );
                const currentCourseId = String(selectedCourseId || "").trim();
                const templateSourceCourseId = String(
                  template.sourceCourseId || "",
                ).trim();
                const currentCourseCode = String(selectedCourse?.code || "")
                  .trim()
                  .toLowerCase();
                const templateSourceCourseCode = String(
                  template.sourceCourseCode || "",
                )
                  .trim()
                  .toLowerCase();
                const isTemplateFromCurrentCourse = Boolean(
                  currentCourseId &&
                    ((templateSourceCourseId &&
                      templateSourceCourseId === currentCourseId) ||
                      (templateSourceCourseCode &&
                        currentCourseCode &&
                        templateSourceCourseCode === currentCourseCode)),
                );
                const canDeleteTemplateContentInCurrentCourse =
                  isAuthoringMode &&
                  Boolean(selectedCourseId) &&
                  isTemplatePresentInCurrentCourse;
                const canDeleteSharedTemplate =
                  isOwnTemplate && template.id.startsWith("template_");
                const isImportingTemplate = importingTemplateId === template.id;
                const isDeletingImportedTemplate =
                  deletingImportedTemplateId === template.id;
                const isDeletingSharedTemplate =
                  deletingSharedTemplateId === template.id;
                const hasActiveAction =
                  isImportingTemplate ||
                  isDeletingImportedTemplate ||
                  isDeletingSharedTemplate;
                const hasAnotherTemplateAction =
                  (!!importingTemplateId && importingTemplateId !== template.id) ||
                  (!!deletingImportedTemplateId &&
                    deletingImportedTemplateId !== template.id) ||
                  (!!deletingSharedTemplateId &&
                    deletingSharedTemplateId !== template.id);

                return (
                  <article
                    key={template.id}
                    className="rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm transition hover:border-sky-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 break-words">
                          {template.theme}
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          {template.questionCount} questions
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                          isOwnTemplate
                            ? "bg-sky-100 text-sky-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {isOwnTemplate ? "Your quiz" : "Community"}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-700">
                        {template.sourceCourseCode || "No code"}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-700">
                        {template.ownerName || "Teacher"}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-700">
                        Updated {formatDate(template.updatedAt)}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {isTemplatePresentInCurrentCourse ? (
                        <button
                          type="button"
                          onClick={() => {
                            void handleDeleteImportedTemplateFromCourse(template);
                          }}
                          disabled={
                            !canDeleteTemplateContentInCurrentCourse ||
                            hasActiveAction ||
                            hasAnotherTemplateAction
                          }
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isDeletingImportedTemplate ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          {isTemplateFromCurrentCourse
                            ? "Delete Quiz"
                            : "Delete Imported"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            void importSharedTemplateToCourse(template);
                          }}
                          disabled={
                            !canImportTemplate ||
                            hasActiveAction ||
                            hasAnotherTemplateAction
                          }
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isImportingTemplate ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          {isAuthoringMode
                            ? "Import to current course"
                            : "View only"}
                        </button>
                      )}

                      {canDeleteSharedTemplate && (
                        <button
                          type="button"
                          onClick={() => {
                            void handleDeleteSharedTemplate(template);
                          }}
                          disabled={hasActiveAction || hasAnotherTemplateAction}
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/60 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isDeletingSharedTemplate ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete Shared
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
    )
  );

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-4">
          <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
            <div className="pointer-events-none absolute -left-[70px] -top-[90px] h-[180px] w-[180px] rounded-full bg-sky-300/25" />
            <div className="pointer-events-none absolute -right-[90px] -bottom-[90px] h-[200px] w-[200px] rounded-full bg-violet-300/20" />
            <div className="relative z-10 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Exercise Workspace
                </div>
                <h2 className="mt-3 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                  Quiz Bank Studio
                </h2>
                <p className="mt-1.5 text-xs text-slate-500">
                  Build question sets, publish themes, and track quiz progress by course.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/60 bg-white/90 p-3">
                <label
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  htmlFor="exercise-bank-course-select"
                >
                  Course Scope
                </label>
                <div className="relative">
                  <BookOpen className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    id="exercise-bank-course-select"
                    className="h-10 w-full rounded-xl border border-slate-300/60 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    value={selectedCourseId}
                    onChange={(e) => handleCourseChange(e.target.value)}
                  >
                    {availableCourses.length === 0 && (
                      <option value="">No courses available</option>
                    )}
                    {availableCourses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.code} - {course.name}
                      </option>
                    ))}
                  </select>
                </div>
                {isAuthoringMode && (
                  selectedCourse?.code ? (
                    <Link
                      to={`/courses/${selectedCourse.code}/exercise-bank/stats`}
                      className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      View Quiz Stats
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200/60 bg-slate-50 px-3 text-xs font-semibold text-slate-400"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      View Quiz Stats
                    </button>
                  )
                )}
              </div>
            </div>
          </section>

          <div className="mt-4 space-y-4">
            {!selectedCourseId ? (
              isTeacher ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center min-h-[320px] bg-white border border-slate-200/60 rounded-2xl p-8">
                    <div className="h-20 w-20 rounded-full bg-sky-100 flex items-center justify-center mb-4">
                      <BookOpen className="h-8 w-8 text-sky-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">
                      No course selected
                    </h3>
                    <p className="text-slate-600 text-center max-w-md">
                      Select a course to create or import questions. The shared
                      bank remains visible for all teachers.
                    </p>
                  </div>
                  {renderSharedQuizBankPanel()}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[400px] bg-white border border-slate-200/60 rounded-2xl p-8">
                  <div className="h-20 w-20 rounded-full bg-sky-100 flex items-center justify-center mb-4">
                    <BookOpen className="h-8 w-8 text-sky-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    No course selected
                  </h3>
                  <p className="text-slate-600 text-center max-w-md">
                    Select a course from the dropdown above to access its
                    exercise bank.
                  </p>
                </div>
              )
            ) : (
              <>
                {isLearnerMode && (
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-4">
                    <StatCard
                      icon={<HelpCircle className="h-5 w-5" />}
                      label="Total Questions"
                      value={stats.totalQuestions}
                      tone="sky"
                    />
                    <StatCard
                      icon={<Layers className="h-5 w-5" />}
                      label="Themes"
                      value={stats.totalThemes}
                      tone="indigo"
                    />
                    <StatCard
                      icon={<CheckCircle2 className="h-5 w-5" />}
                      label="Completed"
                      value={stats.completedQuizzes}
                      tone="emerald"
                    />
                    <StatCard
                      icon={<Zap className="h-5 w-5" />}
                      label="Available"
                      value={stats.pendingThemes}
                      tone="violet"
                    />
                  </div>
                )}

                {isAuthoringMode && (
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
                      <div className="border-b border-slate-200/60 bg-gradient-to-r from-slate-50 via-white to-sky-50/60 px-4 py-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="max-w-2xl">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                              Teacher Studio
                            </p>
                            <h2 className="mt-1 text-xl font-bold text-slate-900">
                              {activeAuthoringWorkspaceCopy.title}
                            </h2>
                            <p className="mt-1 text-sm text-slate-600">
                              {activeAuthoringWorkspaceCopy.description}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Course
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {selectedCourse?.code || "--"}
                              </p>
                            </div>
                            <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Themes
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {stats.totalThemes}
                              </p>
                            </div>
                            <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Published
                              </p>
                              <p className="mt-1 text-sm font-semibold text-emerald-700">
                                {stats.publishedCount}
                              </p>
                            </div>
                            <div className="rounded-xl border border-slate-200/60 bg-white px-3 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Drafts
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {stats.draftCount}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="border-b border-slate-200/60 bg-slate-50/70 px-3 py-3">
                        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                          {authoringWorkspaceTabs.map((panel) => {
                            const isActive = activeAuthoringPanel === panel.id;

                            return (
                              <button
                                key={panel.id}
                                type="button"
                                onClick={() => {
                                  setActiveAuthoringPanel(panel.id);
                                  if (panel.id === "create") {
                                    setShowCreatorForm(true);
                                  }
                                }}
                                className={`min-w-[220px] flex-1 rounded-xl border px-4 py-3 text-left transition ${
                                  isActive
                                    ? "border-sky-300 bg-sky-50 shadow-sm"
                                    : "border-slate-200/60 bg-white hover:border-slate-300/60 hover:bg-slate-50"
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div
                                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                      isActive
                                        ? "bg-white text-sky-700"
                                        : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {panel.id === "create" && (
                                      <PenTool className="h-4 w-4" />
                                    )}
                                    {panel.id === "questionBank" && (
                                      <BookOpen className="h-4 w-4" />
                                    )}
                                    {panel.id === "sharedQuizBank" && (
                                      <Sparkles className="h-4 w-4" />
                                    )}
                                    {panel.id === "mandatoryTeacherQuizzes" && (
                                      <CheckCircle2 className="h-4 w-4" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-semibold text-slate-900">
                                        {panel.label}
                                      </p>
                                      {panel.badge && (
                                        <span className="rounded-full border border-slate-200/60 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                          {panel.badge}
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {panel.description}
                                    </p>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {activeAuthoringPanel === "create" && (
                        <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-200/60 bg-white">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-sky-100 flex items-center justify-center">
                                <PenTool className="h-4 w-4 text-sky-600" />
                              </div>
                              <div>
                                <h2 className="text-base font-bold text-slate-900">
                                  Create Questions
                                </h2>
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                setShowCreatorForm(!showCreatorForm)
                              }
                              className={`p-2 rounded-lg transition-colors ${
                                showCreatorForm
                                  ? "bg-slate-200 text-slate-700"
                                  : "hover:bg-slate-200 text-slate-600"
                              }`}
                            >
                              {showCreatorForm ? (
                                <X className="h-5 w-5" />
                              ) : (
                                <Plus className="h-5 w-5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {showCreatorForm && (
                          <div className="space-y-3 p-3">
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() =>
                                  setQuestionCreationMode("single")
                                }
                                className={`h-9 rounded-lg border px-3 text-sm font-semibold transition ${
                                  questionCreationMode === "single"
                                    ? "border-sky-500 bg-sky-50 text-sky-700"
                                    : "border-slate-200/60 hover:border-slate-300/60 hover:bg-slate-50"
                                }`}
                              >
                                Single Question
                              </button>
                              <button
                                onClick={() => setQuestionCreationMode("bulk")}
                                className={`h-9 rounded-lg border px-3 text-sm font-semibold transition ${
                                  questionCreationMode === "bulk"
                                    ? "border-sky-500 bg-sky-50 text-sky-700"
                                    : "border-slate-200/60 hover:border-slate-300/60 hover:bg-slate-50"
                                }`}
                              >
                                Bulk Import
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => setThemeMode("existing")}
                                className={`h-9 rounded-lg border px-3 text-sm font-semibold transition ${
                                  themeMode === "existing"
                                    ? "border-sky-500 bg-sky-50 text-sky-700"
                                    : "border-slate-200/60 hover:border-slate-300/60 hover:bg-slate-50"
                                }`}
                              >
                                Existing Theme
                              </button>
                              <button
                                onClick={() => setThemeMode("new")}
                                className={`h-9 rounded-lg border px-3 text-sm font-semibold transition ${
                                  themeMode === "new"
                                    ? "border-sky-500 bg-sky-50 text-sky-700"
                                    : "border-slate-200/60 hover:border-slate-300/60 hover:bg-slate-50"
                                }`}
                              >
                                New Theme
                              </button>
                            </div>

                            {themeMode === "existing" ? (
                              <select
                                value={selectedExistingTheme}
                                onChange={(e) =>
                                  setSelectedExistingTheme(e.target.value)
                                }
                                className="h-10 w-full rounded-lg border border-slate-200/60 px-3 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                              >
                                <option value="">Select a theme</option>
                                {availableThemes.map((theme) => (
                                  <option key={theme} value={theme}>
                                    {theme}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                value={themeInput}
                                onChange={(e) => setThemeInput(e.target.value)}
                                placeholder="Enter new theme name"
                                className="h-10 w-full rounded-lg border border-slate-200/60 px-3 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                              />
                            )}

                            {questionCreationMode === "single" ? (
                              <>
                                <div>
                                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                                    Question
                                  </label>
                                  <textarea
                                    value={questionInput}
                                    onChange={(e) =>
                                      setQuestionInput(e.target.value)
                                    }
                                    placeholder="Enter your question here..."
                                    rows={2}
                                    className="w-full resize-none rounded-lg border border-slate-200/60 px-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                  />
                                </div>

                                <div className="space-y-1.5">
                                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                                    Answer Options
                                  </label>
                                  {optionsInput.map((option, index) => (
                                    <div
                                      key={index}
                                      className="flex items-center gap-2"
                                    >
                                      <input
                                        type="radio"
                                        checked={correctOptionIndex === index}
                                        onChange={() =>
                                          setCorrectOptionIndex(index)
                                        }
                                        className="h-3.5 w-3.5 text-sky-600 focus:ring-sky-500"
                                      />
                                      <input
                                        value={option}
                                        onChange={(e) => {
                                        setOptionsInput((prev) =>
                                          prev.map((v, i) =>
                                            i === index ? e.target.value : v,
                                          ),
                                        );
                                      }}
                                        placeholder={`Option ${index + 1}`}
                                        className="h-10 flex-1 rounded-lg border border-slate-200/60 px-3 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <div className="space-y-1.5">
                                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                                  Bulk Import Format
                                </label>
                                <textarea
                                  value={bulkQuestionsInput}
                                  onChange={(e) =>
                                    setBulkQuestionsInput(e.target.value)
                                  }
                                  rows={6}
                                  className="w-full rounded-lg border border-slate-200/60 px-3 py-2 font-mono text-xs focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                  placeholder={`Q: What is the correct form of "to be" for I?
A) am
B) is
C) are
D) be
Correct: A
---
Theme: Past Simple
Q: Choose the correct past form of "go".
A) goed
B) went
C) gone
D) goes
                                  Correct: B`}
                                />
                                <p className="text-[11px] text-slate-500">
                                  Use --- to separate questions. Format: Q: for
                                  question, A)/B)/C)/D) for options, Correct:
                                  for answer.
                                </p>
                              </div>
                            )}

                            <div className="flex items-center justify-between rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-2.5">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Initial Visibility
                              </p>
                              <select
                                value={publishOnCreate ? "published" : "draft"}
                                onChange={(e) =>
                                  setPublishOnCreate(
                                    e.target.value === "published",
                                  )
                                }
                                className="h-8 rounded-lg border border-slate-200/60 bg-white px-2.5 text-xs font-medium text-slate-700"
                              >
                                <option value="draft">Draft</option>
                                <option value="published">Published</option>
                              </select>
                            </div>

                            <button
                              onClick={handleCreateQuestion}
                              disabled={
                                saving ||
                                (themeMode === "existing" &&
                                  !selectedExistingTheme) ||
                                (themeMode === "new" && !themeInput.trim())
                              }
                              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {saving ? (
                                <span className="flex items-center justify-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Creating...
                                </span>
                              ) : (
                                <span className="flex items-center justify-center gap-2">
                                  <Plus className="h-4 w-4" />
                                  {questionCreationMode === "single"
                                    ? "Add Question"
                                    : `Import ${bulkQuestionsInput.split("---").length} Questions`}
                                </span>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                      )}

                      {activeAuthoringPanel === "questionBank" && (
                      <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm">
                        <div className="border-b border-slate-200/60 px-4 py-4">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg bg-sky-100 flex items-center justify-center">
                                <BookOpen className="h-5 w-5 text-sky-600" />
                              </div>
                              <div>
                                <h2 className="text-base font-bold text-slate-900">
                                  Question Bank
                                </h2>
                                <p className="text-xs text-slate-500">
                                  Review everything by theme before publishing changes to students.
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                              <div className="rounded-xl border border-slate-200/60 bg-slate-50/70 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  Questions
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {filteredQuestions.length}
                                </p>
                              </div>
                              <div className="rounded-xl border border-slate-200/60 bg-slate-50/70 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  Themes in view
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {visibleGroupedQuestions.length}
                                </p>
                              </div>
                              <div className="rounded-xl border border-slate-200/60 bg-slate-50/70 px-3 py-2 sm:col-span-1 col-span-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  Unsaved edits
                                </p>
                                <div className="mt-1 flex items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-slate-900">
                                    {Object.keys(pendingQuestionUpdates).length}
                                  </p>
                                  <button
                                    onClick={saveAllQuestionChanges}
                                    disabled={
                                      savingAllQuestionChanges ||
                                      Object.keys(pendingQuestionUpdates).length ===
                                        0
                                    }
                                    className="inline-flex h-8 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {savingAllQuestionChanges
                                      ? "Saving..."
                                      : "Save all"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 border-b border-slate-200/60 bg-slate-50/50 px-4 py-4">
                          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]">
                            <div className="rounded-xl border border-slate-200/60 bg-white p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                Find Questions
                              </p>
                              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                                <div className="relative flex-1">
                                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                  <input
                                    value={searchQuery}
                                    onChange={(e) =>
                                      setSearchQuery(e.target.value)
                                    }
                                    placeholder="Search questions or themes..."
                                    className="w-full rounded-lg border border-slate-200/60 py-2 pl-9 pr-4 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <select
                                    value={questionFilter}
                                    onChange={(e) =>
                                      setQuestionFilter(
                                        e.target.value as QuestionFilter,
                                      )
                                    }
                                    className="rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500"
                                  >
                                    <option value="all">All</option>
                                    <option value="published">Published</option>
                                    <option value="draft">Draft</option>
                                  </select>
                                  <button
                                    onClick={() =>
                                      setViewMode(
                                        viewMode === "grid" ? "list" : "grid",
                                      )
                                    }
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200/60 bg-white transition-colors hover:bg-slate-50"
                                    title={
                                      viewMode === "grid"
                                        ? "Switch to list view"
                                        : "Switch to card view"
                                    }
                                  >
                                    {viewMode === "grid" ? (
                                      <List className="h-4 w-4" />
                                    ) : (
                                      <Grid className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-xl border border-slate-200/60 bg-white p-3">
                              <label
                                htmlFor="question-bank-theme-dropdown"
                                className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500"
                              >
                                Focus By Theme
                              </label>
                              <select
                                id="question-bank-theme-dropdown"
                                value={selectedQuestionBankTheme}
                                onChange={(e) =>
                                  setSelectedQuestionBankTheme(e.target.value)
                                }
                                className="mt-3 h-10 w-full rounded-lg border border-slate-200/60 bg-white px-3 text-sm focus:ring-2 focus:ring-sky-500"
                              >
                                <option value="all">
                                  All themes ({groupedFilteredQuestions.length})
                                </option>
                                {groupedFilteredQuestions.map(
                                  ([theme, themeQuestions]) => (
                                    <option key={theme} value={theme}>
                                      {theme} ({themeQuestions.length})
                                    </option>
                                  ),
                                )}
                              </select>
                              <p className="mt-2 text-xs text-slate-500">
                                Narrow the workspace to one theme when you need
                                to edit, link, or publish faster.
                              </p>
                            </div>
                          </div>

                          <div className="rounded-xl border border-slate-200/60 bg-white p-3">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                  Bulk Visibility
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Apply a publish or unpublish action to an
                                  entire theme at once.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-3">
                                <select
                                  value={bulkVisibilityAction}
                                  onChange={(e) =>
                                    setBulkVisibilityAction(
                                      e.target.value as "publish" | "draft",
                                    )
                                  }
                                  className="min-w-[160px] rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500"
                                >
                                  <option value="publish">Publish drafts</option>
                                  <option value="draft">Unpublish</option>
                                </select>
                                <select
                                  value={bulkPublishTheme}
                                  onChange={(e) =>
                                    setBulkPublishTheme(e.target.value)
                                  }
                                  className="min-w-[180px] rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500"
                                >
                                  <option value="all">All themes</option>
                                  {availableThemes.map((theme) => (
                                    <option key={theme} value={theme}>
                                      {theme}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={applyBulkVisibilityByTheme}
                                  disabled={
                                    bulkPublishing ||
                                    bulkVisibilityTargetCount === 0
                                  }
                                  className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition ${
                                    bulkVisibilityAction === "publish"
                                      ? "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                                      : "border border-slate-300/60 bg-slate-100 text-slate-700 hover:bg-slate-200"
                                  } disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                  {bulkPublishing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    `${bulkVisibilityAction === "publish" ? "Publish" : "Unpublish"} ${bulkVisibilityTargetCount}`
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 max-h-[65vh] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                          {loading ? (
                            <div className="flex items-center justify-center py-12">
                              <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                            </div>
                          ) : filteredQuestions.length === 0 ? (
                            <div className="text-center py-12">
                              <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                                <HelpCircle className="h-8 w-8 text-slate-400" />
                              </div>
                              <p className="text-slate-600">
                                No questions found
                              </p>
                              <p className="text-sm text-slate-500">
                                Try adjusting your filters or create a new
                                question
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {visibleGroupedQuestions.map(
                                ([theme, themeQuestions]) => {
                                  const isExpanded =
                                    expandedThemes[theme] ?? true;

                                  return (
                                    <div
                                      key={theme}
                                      className="rounded-xl border border-slate-200/60"
                                    >
                                      <div
                                        className={`flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3 transition-colors hover:bg-slate-100 ${
                                          isExpanded ? "rounded-t-xl" : "rounded-xl"
                                        }`}
                                      >
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedThemes((prev) => ({
                                              ...prev,
                                              [theme]: !isExpanded,
                                            }))
                                          }
                                          className="flex min-w-[180px] flex-1 items-center justify-between gap-2 text-left"
                                        >
                                          <div>
                                            <p className="font-semibold text-slate-900">
                                              {theme}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                              {themeQuestions.length} questions
                                            </p>
                                          </div>
                                          <ChevronDown
                                            className={`h-4 w-4 text-slate-500 transition-transform ${
                                              isExpanded ? "rotate-180" : ""
                                            }`}
                                          />
                                        </button>

                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className="flex items-center gap-1 rounded-lg border border-slate-200/60 bg-white px-2 py-1.5">
                                            <FileText className="h-3.5 w-3.5 text-slate-500" />
                                            <select
                                              value={themeLinksByTheme[theme] || ""}
                                              onChange={(event) => {
                                                event.stopPropagation();
                                                void handleThemeLinkChange(
                                                  theme,
                                                  event.target.value,
                                                );
                                              }}
                                              onClick={(event) =>
                                                event.stopPropagation()
                                              }
                                              disabled={savingThemeLink === theme}
                                              className="h-6 min-w-[140px] border-0 bg-transparent px-1 text-[11px] font-medium text-slate-700 outline-none focus:ring-0"
                                            >
                                              <option value="">No sheet</option>
                                              {groupedCourseGradeSheets.map((group) => (
                                                <optgroup
                                                  key={group.unitLabel}
                                                  label={group.unitLabel}
                                                >
                                                  {group.sheets.map((sheet) => (
                                                    <option
                                                      key={sheet.id}
                                                      value={sheet.id}
                                                    >
                                                      {sheet.title}
                                                    </option>
                                                  ))}
                                                </optgroup>
                                              ))}
                                            </select>
                                          </div>

                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              void publishThemeToSharedBank(
                                                theme,
                                              );
                                            }}
                                            disabled={publishingTheme === theme}
                                            title={
                                              sharedThemeKeysForCurrentCourse.has(
                                                normalizeThemeKey(theme),
                                              )
                                                ? "Already shared. Click to update shared quiz with latest questions."
                                                : "Share this theme in the shared quiz bank."
                                            }
                                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
                                              sharedThemeKeysForCurrentCourse.has(
                                                normalizeThemeKey(theme),
                                              )
                                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                                : "border-sky-200 bg-white text-sky-700 hover:bg-sky-50"
                                            }`}
                                          >
                                            {publishingTheme === theme ? (
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : sharedThemeKeysForCurrentCourse.has(
                                                normalizeThemeKey(theme),
                                              ) ? (
                                              <CheckCircle2 className="h-3 w-3" />
                                            ) : (
                                              <ExternalLink className="h-3 w-3" />
                                            )}
                                            {sharedThemeKeysForCurrentCourse.has(
                                              normalizeThemeKey(theme),
                                            )
                                              ? "Update Shared"
                                              : "Share"}
                                          </button>
                                        </div>
                                      </div>

                                      {isExpanded && (
                                        <div className="p-4">
                                          {viewMode === "grid" ? (
                                            <div className="space-y-2">
                                              <div className="overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                                                <div className="flex snap-x snap-mandatory gap-3 pr-1">
                                                  {themeQuestions.map((question) => (
                                                    <div
                                                      key={question.id}
                                                      className="w-[320px] shrink-0 snap-start sm:w-[360px] lg:w-[420px]"
                                                    >
                                                      <QuestionCard
                                                        question={question}
                                                        isEditing={
                                                          editingQuestionId ===
                                                          question.id
                                                        }
                                                        hasUnsavedChanges={
                                                          !!pendingQuestionUpdates[
                                                            question.id
                                                          ]
                                                        }
                                                        onEdit={() =>
                                                          startEditingQuestion(question)
                                                        }
                                                        onCancelEdit={
                                                          cancelEditingQuestion
                                                        }
                                                        onSaveEdit={queueEditedQuestion}
                                                        onTogglePublish={() =>
                                                          handleToggleQuestionPublish(
                                                            question,
                                                          )
                                                        }
                                                        onDelete={() =>
                                                          setShowDeleteConfirm(
                                                            question.id,
                                                          )
                                                        }
                                                        isDeleting={
                                                          deletingId === question.id
                                                        }
                                                        editingValues={{
                                                          theme: editingTheme,
                                                          question: editingQuestionText,
                                                          options: editingOptions,
                                                          correctOptionIndex:
                                                            editingCorrectOptionIndex,
                                                        }}
                                                        onEditingChange={
                                                          handleEditingChange
                                                        }
                                                      />
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                              <p className="text-[11px] text-slate-500">
                                                Scroll horizontally to view all cards.
                                              </p>
                                            </div>
                                          ) : (
                                            <div className="space-y-2">
                                              {themeQuestions.map((question) => (
                                                <QuestionCard
                                                  key={question.id}
                                                  question={question}
                                                  isEditing={
                                                    editingQuestionId ===
                                                    question.id
                                                  }
                                                  hasUnsavedChanges={
                                                    !!pendingQuestionUpdates[
                                                      question.id
                                                    ]
                                                  }
                                                  onEdit={() =>
                                                    startEditingQuestion(question)
                                                  }
                                                  onCancelEdit={
                                                    cancelEditingQuestion
                                                  }
                                                  onSaveEdit={queueEditedQuestion}
                                                  onTogglePublish={() =>
                                                    handleToggleQuestionPublish(
                                                      question,
                                                    )
                                                  }
                                                  onDelete={() =>
                                                    setShowDeleteConfirm(
                                                      question.id,
                                                    )
                                                  }
                                                  isDeleting={
                                                    deletingId === question.id
                                                  }
                                                  editingValues={{
                                                    theme: editingTheme,
                                                    question: editingQuestionText,
                                                    options: editingOptions,
                                                    correctOptionIndex:
                                                      editingCorrectOptionIndex,
                                                  }}
                                                  onEditingChange={
                                                    handleEditingChange
                                                  }
                                                />
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      )}

                      {activeAuthoringPanel === "sharedQuizBank" && (
                        renderSharedQuizBankPanel()
                      )}

                      {activeAuthoringPanel === "mandatoryTeacherQuizzes" && (
                        <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
                          <div className="border-b border-slate-200/60 px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <h2 className="text-base font-bold text-slate-900">
                                  Mandatory Course Quizzes
                                </h2>
                                <p className="text-xs text-slate-500">
                                  {mandatoryTeacherCourse?.code} -{" "}
                                  {mandatoryTeacherCourse?.name}
                                </p>
                              </div>
                              {mandatoryTeacherCourse &&
                                mandatoryTeacherCourse.id !== selectedCourseId && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCourseChange(mandatoryTeacherCourse.id)
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                                >
                                  <ChevronRight className="h-3.5 w-3.5" />
                                  Open mandatory course
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="p-4">
                            {loadingMandatoryCourseQuizThemes ? (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
                              </div>
                            ) : mandatoryCourseQuizThemes.length === 0 ? (
                              <p className="text-sm text-slate-500">
                                No published quizzes found in the mandatory
                                course yet.
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                {mandatoryCourseQuizThemes.map((item) => (
                                  <div
                                    key={item.theme}
                                    className="rounded-xl border border-slate-200/60 bg-slate-50 px-3 py-2"
                                  >
                                    <p className="text-sm font-semibold text-slate-900">
                                      {item.theme}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {item.questionCount} questions
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                    </div>

                      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-4">
                        <StatCard
                          icon={<HelpCircle className="h-5 w-5" />}
                          label="Total Questions"
                          value={stats.totalQuestions}
                          tone="sky"
                        />
                        <StatCard
                          icon={<Layers className="h-5 w-5" />}
                          label="Themes"
                          value={stats.totalThemes}
                          tone="indigo"
                        />
                        <StatCard
                          icon={<BarChart3 className="h-5 w-5" />}
                          label="Avg per Theme"
                          value={stats.questionsPerTheme}
                          tone="emerald"
                        />
                        <StatCard
                          icon={<Sparkles className="h-5 w-5" />}
                          label="Shared Quizzes"
                          value={sharedTemplatesFromOtherTeachersCount}
                          tone="violet"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm">
                        <div className="px-4 py-3 border-b border-slate-200/60 bg-white">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center">
                              <Eye className="h-5 w-5 text-slate-600" />
                            </div>
                            <div>
                              <h2 className="text-base font-bold text-slate-900">
                                Student Preview
                              </h2>
                              <p className="text-xs text-slate-500">
                                How students see available themes
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="p-4">
                          <div className="space-y-2">
                            {studentAvailableThemes.slice(0, 5).map((theme) => (
                              <div
                                key={theme}
                                className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
                              >
                                <div className="flex items-center gap-3">
                                  <BookMarked className="h-4 w-4 text-slate-400" />
                                  <span className="text-sm font-medium text-slate-700">
                                    {theme}
                                  </span>
                                </div>
                                <span className="text-xs text-slate-500">
                                  {
                                    publishedQuestions.filter(
                                      (q) => q.theme === theme,
                                    ).length
                                  }{" "}
                                  questions
                                </span>
                              </div>
                            ))}
                            {studentAvailableThemes.length === 0 && (
                              <p className="text-sm text-slate-500 text-center py-4">
                                Publish questions to see the student view
                              </p>
                            )}
                            <div className="mt-4 pt-4 border-t border-slate-200/60">
                              <p className="text-xs text-slate-500">
                                <span className="font-medium text-sky-600">
                                  Linked themes:
                                </span>{" "}
                                1 attempt •{" "}
                                <span className="font-medium text-sky-600">
                                  Practice themes:
                                </span>{" "}
                                {MAX_UNLINKED_ATTEMPTS} attempts
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm">
                        <div className="px-4 py-3 border-b border-slate-200/60">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-sky-100 flex items-center justify-center">
                              <BarChart3 className="h-5 w-5 text-sky-600" />
                            </div>
                            <div>
                              <h2 className="text-base font-bold text-slate-900">
                                Course Statistics
                              </h2>
                              <p className="text-xs text-slate-500">
                                Overview of {selectedCourse?.name}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="p-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-50 rounded-xl">
                              <p className="text-xs text-slate-500 mb-1">
                                Students
                              </p>
                              <p className="text-lg font-extrabold leading-5 text-slate-900">
                                {selectedCourse?.enrolledStudents?.length || 0}
                              </p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-xl">
                              <p className="text-xs text-slate-500 mb-1">
                                Published
                              </p>
                              <p className="text-lg font-extrabold leading-5 text-emerald-600">
                                {stats.publishedCount}
                              </p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-xl">
                              <p className="text-xs text-slate-500 mb-1">
                                Drafts
                              </p>
                              <p className="text-lg font-extrabold leading-5 text-slate-600">
                                {stats.draftCount}
                              </p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-xl">
                              <p className="text-xs text-slate-500 mb-1">
                                Themes
                              </p>
                              <p className="text-lg font-extrabold leading-5 text-sky-600">
                                {stats.totalThemes}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      </div>
                    </div>
                )}

                {isLearnerMode && (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-2 space-y-2">
                      <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm">
                        <div className="px-4 py-3 border-b border-slate-200/60">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg bg-sky-100 flex items-center justify-center">
                                <Layers className="h-5 w-5 text-sky-600" />
                              </div>
                              <div>
                                <h2 className="text-base font-bold text-slate-900">
                                  Available Themes
                                </h2>
                                <p className="text-xs text-slate-500">
                                  {teacherMandatoryLearnerMode
                                    ? mandatoryThemeApprovalStats?.isApproved
                                      ? "Approved"
                                      : "Not approved"
                                    : `${studentAvailableThemes.length} themes • ${stats.completedQuizzes} completed`}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="p-4">
                          {studentAvailableThemes.length === 0 ? (
                            <div className="text-center py-12">
                              <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                                <BookOpen className="h-8 w-8 text-slate-400" />
                              </div>
                              <p className="text-slate-600">
                                No themes available yet
                              </p>
                              <p className="text-sm text-slate-500">
                                Check back later for new exercises
                              </p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {studentAvailableThemes.map((theme) => {
                                const attempt = attemptsByTheme[theme];
                                const attemptCount =
                                  getThemeAttemptCount(theme);
                                const linkedTheme = isLinkedTheme(theme);
                                const canTake = canTakeTheme(theme);
                                const questionCount = publishedQuestions.filter(
                                  (q) => q.theme === theme,
                                ).length;
                                const isApprovedForMandatory = Boolean(
                                  teacherMandatoryLearnerMode &&
                                    attempt &&
                                    attempt.percentage >=
                                      MANDATORY_APPROVAL_PERCENTAGE,
                                );

                                return (
                                  <ThemeCard
                                    key={theme}
                                    theme={theme}
                                    questionCount={questionCount}
                                    isLinked={linkedTheme}
                                    maxAttempts={
                                      teacherMandatoryLearnerMode
                                        ? MAX_MANDATORY_ATTEMPTS
                                        : MAX_UNLINKED_ATTEMPTS
                                    }
                                    attempt={attempt}
                                    attemptCount={attemptCount}
                                    isSelected={selectedTheme === theme}
                                    canTake={canTake}
                                    mandatoryApprovalEnabled={
                                      teacherMandatoryLearnerMode
                                    }
                                    approvalThreshold={
                                      MANDATORY_APPROVAL_PERCENTAGE
                                    }
                                    approved={isApprovedForMandatory}
                                    onSelect={() => {
                                      void handleSelectTheme(theme);
                                    }}
                                    onStart={() => {
                                      void handleStartTheme(theme);
                                    }}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {selectedTheme && (
                        <div
                          ref={quizStartSectionRef}
                          className="bg-white border border-slate-200/60 rounded-2xl shadow-sm"
                        >
                          <div className="px-4 py-3 border-b border-slate-200/60">
                            <h3 className="text-base font-bold text-slate-900">
                              Selected Theme: {selectedTheme}
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">
                              Quiz workspace and current progress
                            </p>
                          </div>
                          <div className="p-4">
                            {quizStarted && currentQuizQuestion ? (
                              <QuizQuestionView
                                question={currentQuizQuestion}
                                currentIndex={currentQuestionIndex}
                                totalQuestions={quizQuestions.length}
                                selectedAnswer={answers[currentQuizQuestion.id]}
                                timeLeft={timeLeftSeconds}
                                onAnswer={(questionId, optionIndex) =>
                                  setAnswers((prev) => ({
                                    ...prev,
                                    [questionId]: optionIndex,
                                  }))
                                } 
                                onNext={() =>
                                  setCurrentQuestionIndex((prev) => prev + 1)
                                }
                                onPrevious={() =>
                                  setCurrentQuestionIndex((prev) =>
                                    Math.max(0, prev - 1),
                                  )
                                }
                                onFinish={() => finishQuiz("manual")}
                              />
                            ) : result ? (
                              <QuizResultView
                                result={result}
                                gradingMessage={gradingMessage}
                                onClose={handleCloseResult}
                              />
                            ) : selectedThemeAttempt &&
                              selectedThemeIsLinked &&
                              (!teacherMandatoryLearnerMode ||
                                selectedThemeAttempt.percentage >=
                                  MANDATORY_APPROVAL_PERCENTAGE) ? (
                              <div className="text-center py-8">
                                <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                                  <CheckCircle className="h-8 w-8 text-emerald-600" />
                                </div>
                                <h4 className="text-lg font-semibold text-slate-900 mb-2">
                                  {teacherMandatoryLearnerMode
                                    ? "Quiz Approved"
                                    : "Quiz Already Completed"}
                                </h4>
                                <p className="text-slate-600 mb-4">
                                  Your score: {selectedThemeAttempt.correct} /{" "}
                                  {selectedThemeAttempt.total} (
                                  {selectedThemeAttempt.percentage}%)
                                </p>
                                <button
                                  onClick={() => setSelectedTheme("")}
                                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                                >
                                  Choose Another Theme
                                </button>
                              </div>
                            ) : (
                              <div className="text-center py-12">
                                <p className="text-slate-600">
                                  Click "Start Quiz" to begin
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      {Object.keys(attemptsByTheme).length > 0 && (
                        <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm">
                          <div className="px-4 py-3 border-b border-slate-200/60">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                                <TrendingUp className="h-5 w-5 text-emerald-600" />
                              </div>
                              <div>
                                <h3 className="text-base font-bold text-slate-900">
                                  Progress Overview
                                </h3>
                                <p className="text-xs text-slate-500">
                                  {teacherMandatoryLearnerMode
                                    ? `Approval status by theme (minimum ${MANDATORY_APPROVAL_PERCENTAGE}%)`
                                    : "Completion status by theme"}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="p-4">
                            <div className="space-y-2">
                              <div>
                                <div className="flex justify-between text-sm mb-2">
                                  <span className="text-slate-600">
                                    {teacherMandatoryLearnerMode
                                      ? "Themes Approved"
                                      : "Themes Completed"}
                                  </span>
                                  <span className="font-semibold text-slate-900">
                                    {teacherMandatoryLearnerMode
                                      ? `${mandatoryThemeApprovalStats?.approvedThemes || 0}/${mandatoryThemeApprovalStats?.totalThemes || 0}`
                                      : `${stats.completedQuizzes}/${stats.totalThemes}`}
                                  </span>
                                </div>
                                <progress
                                  max={100}
                                  value={
                                    (teacherMandatoryLearnerMode
                                      ? (mandatoryThemeApprovalStats?.totalThemes || 0)
                                      : stats.totalThemes) > 0
                                      ? Math.max(
                                          0,
                                          Math.min(
                                            100,
                                            teacherMandatoryLearnerMode
                                              ? (((mandatoryThemeApprovalStats?.approvedThemes || 0) /
                                                  (mandatoryThemeApprovalStats?.totalThemes || 1)) *
                                                100)
                                              : ((stats.completedQuizzes / stats.totalThemes) * 100),
                                          ),
                                        )
                                      : 0
                                  }
                                  className="h-3 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-emerald-500 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-emerald-500"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-3 pt-2">
                                <div className="p-4 bg-slate-50 rounded-xl text-center">
                                  <p className="text-lg font-extrabold leading-5 text-slate-900">
                                    {teacherMandatoryLearnerMode
                                      ? mandatoryThemeApprovalStats?.approvedThemes || 0
                                      : stats.completedQuizzes}
                                  </p>
                                  <p className="text-xs text-slate-600">
                                    {teacherMandatoryLearnerMode
                                      ? "Approved"
                                      : "Completed"}
                                  </p>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-xl text-center">
                                  <p className="text-lg font-extrabold leading-5 text-slate-900">
                                    {teacherMandatoryLearnerMode
                                      ? mandatoryThemeApprovalStats?.notApprovedThemes || 0
                                      : stats.pendingThemes}
                                  </p>
                                  <p className="text-xs text-slate-600">
                                    {teacherMandatoryLearnerMode
                                      ? "Not approved"
                                      : "Pending"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {attemptHistory.length > 0 && (
                        <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm">
                          <div className="px-4 py-3 border-b border-slate-200/60">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg bg-sky-100 flex items-center justify-center">
                                <Clock className="h-5 w-5 text-sky-600" />
                              </div>
                              <div>
                                <h3 className="text-base font-bold text-slate-900">
                                  Recent Attempts
                                </h3>
                                <p className="text-xs text-slate-500">
                                  Latest quiz results and scores
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="p-4">
                            <div className="space-y-2">
                              {attemptHistory.map((attempt, index) => (
                                <div
                                  key={`${attempt.id}-${index}`}
                                  className="p-3 bg-slate-50 rounded-xl"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-slate-700">
                                      {attempt.theme}
                                    </span>
                                    <span
                                      className={`text-xs font-semibold px-2 py-1 rounded-full ${
                                        attempt.percentage >=
                                        (teacherMandatoryLearnerMode
                                          ? MANDATORY_APPROVAL_PERCENTAGE
                                          : 70)
                                          ? "bg-emerald-100 text-emerald-700"
                                        : attempt.percentage >= 50
                                          ? "bg-amber-100 text-amber-700"
                                          : "bg-rose-100 text-rose-700"
                                      }`}
                                    >
                                      {attempt.percentage}%
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500">
                                      {formatDateTime(attempt.createdAt)}
                                    </span>
                                    <span className="text-slate-600">
                                      {attempt.correct}/{attempt.total} correct
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <Modal
            isOpen={showStartWarning}
            onClose={() => {
              setShowStartWarning(false);
              setPendingStartTheme(null);
            }}
            title="Before you start"
          >
            <div className="space-y-2">
              <div className="p-4 bg-sky-50 rounded-xl">
                <p className="font-medium text-sky-800">
                  Theme: <span className="font-bold">{pendingStartTheme}</span>
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-3 w-3 text-slate-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Time Limit</p>
                    <p className="text-xs text-slate-500">
                      {formatDuration(pendingThemeTimeLimitSeconds)} (
                      {QUIZ_SECONDS_PER_QUESTION} seconds per question)
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
                    <HelpCircle className="h-3 w-3 text-sky-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Attempts</p>
                    <p className="text-xs text-slate-500">
                      {teacherMandatoryLearnerMode
                        ? `Mandatory quiz: up to ${MAX_MANDATORY_ATTEMPTS} attempts. Minimum ${MANDATORY_APPROVAL_PERCENTAGE}% to be approved.`
                        : pendingThemeIsLinked
                        ? "This quiz is linked to a grade sheet - only one attempt allowed"
                        : `This is a practice quiz - ${MAX_UNLINKED_ATTEMPTS} attempts allowed`}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-3 w-3 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Auto-submit</p>
                    <p className="text-xs text-slate-500">
                      When time runs out, your quiz will be submitted
                      automatically
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200/60">
                <button
                  onClick={() => {
                    setShowStartWarning(false);
                    setPendingStartTheme(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmStartQuiz}
                  className="px-4 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors"
                >
                  Start Quiz
                </button>
              </div>
            </div>
          </Modal>

          <ConfirmModal
            isOpen={!!showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(null)}
            onConfirm={() =>
              showDeleteConfirm && handleDeleteQuestion(showDeleteConfirm)
            }
            title="Delete Question"
            message="Are you sure you want to delete this question? This action cannot be undone."
            confirmText="Delete"
            cancelText="Cancel"
            type="danger"
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
