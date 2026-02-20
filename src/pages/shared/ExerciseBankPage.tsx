import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAcademic } from "@/contexts/AcademicContext";
import { useAuth } from "@/contexts/AuthContext";
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
  GraduationCap,
  ChevronRight,
  FileText,
  Sparkles,
  Zap,
  Rocket,
  Brain,
  HelpCircle,
  Award,
  Target,
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
  Users,
  UserPlus,
  School,
  ChevronDown,
  ExternalLink,
  Menu,
  X,
  PenTool,
  ClipboardList,
  BarChart3,
  Filter,
  Search,
  ArrowLeft,
  ArrowRight,
  Settings,
  Grid,
  List,
  Star,
  Clock3,
  CheckSquare,
  AlertTriangle,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

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
type EditableQuestionFields = Pick<
  ExerciseQuestion,
  "theme" | "question" | "options" | "correctOptionIndex" | "isPublished"
>;
type ViewMode = "grid" | "list";
type QuestionFilter = "all" | "published" | "draft";

// ============================================================================
// UTILS
// ============================================================================

function toDate(value: unknown): Date {
  if (value && typeof value === "object" && "toDate" in value) {
    const timestamp = value as { toDate: () => Date };
    return timestamp.toDate();
  }
  if (value instanceof Date) return value;
  return new Date();
}

function buildAttemptResult(
  quizQuestions: ExerciseQuestion[],
  answers: Record<string, number>,
): {
  total: number;
  correct: number;
  percentage: number;
  answerDetails: QuizAttemptAnswer[];
} {
  const total = quizQuestions.length;
  let correct = 0;

  const answerDetails: QuizAttemptAnswer[] = quizQuestions.map((question) => {
    const selectedOptionIndex = answers[question.id] ?? -1;
    const isCorrect = selectedOptionIndex === question.correctOptionIndex;
    if (isCorrect) correct += 1;

    return {
      questionId: question.id,
      selectedOptionIndex,
      correctOptionIndex: question.correctOptionIndex,
      isCorrect,
    };
  });

  const percentage = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { total, correct, percentage, answerDetails };
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

// ============================================================================
// MODALS
// ============================================================================

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="p-6 max-h-[70vh] overflow-y-auto">{children}</div>
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
      bg: "bg-red-50",
      text: "text-red-600",
      border: "border-red-200",
      button: "bg-red-600 hover:bg-red-700",
      icon: <AlertCircle className="h-4 w-4 text-red-600" />,
    },
    warning: {
      bg: "bg-yellow-50",
      text: "text-yellow-600",
      border: "border-yellow-200",
      button: "bg-yellow-600 hover:bg-yellow-700",
      icon: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
    },
    info: {
      bg: "bg-blue-50",
      text: "text-blue-600",
      border: "border-blue-200",
      button: "bg-blue-600 hover:bg-blue-700",
      icon: <HelpCircle className="h-4 w-4 text-blue-600" />,
    },
  };

  const style = colors[type];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div
              className={`h-8 w-8 rounded-full ${style.bg} flex items-center justify-center`}
            >
              {style.icon}
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-600">{message}</p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors ${style.button}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// COMPONENTS
// ============================================================================

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: number;
}

const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  trend,
}) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5 hover:shadow-md transition-all duration-300">
      <div className="flex items-start justify-center sm:justify-between text-center sm:text-left">
        <div>
          <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">{label}</p>
          <p className="text-lg sm:text-2xl font-bold text-gray-900">{value}</p>
          {trend !== undefined && (
            <p className="text-xs text-gray-500 mt-1">
              <span className={trend >= 0 ? "text-green-600" : "text-red-600"}>
                {trend > 0 ? "+" : ""}
                {trend}%
              </span>{" "}
              vs last month
            </p>
          )}
        </div>
        <div className="hidden sm:flex h-10 w-10 rounded-lg bg-blue-50 items-center justify-center text-blue-600">
          {icon}
        </div>
      </div>
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
  onSelect,
  onStart,
}) => {
  return (
    <div
      className={`group cursor-pointer rounded-xl border transition-all ${
        isSelected
          ? "border-blue-300 bg-blue-50 shadow-md"
          : "border-gray-200 hover:border-blue-200 hover:bg-gray-50"
      }`}
      onClick={onSelect}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookMarked
              className={`h-4 w-4 ${isSelected ? "text-blue-600" : "text-gray-400"}`}
            />
            <h4 className="font-semibold text-gray-900">{theme}</h4>
          </div>
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full ${
              isLinked
                ? "bg-blue-100 text-blue-700"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {isLinked ? "Linked" : "Practice"}
          </span>
        </div>

        <div className="flex items-center gap-3 mb-3 text-sm">
          <span className="flex items-center gap-1 text-gray-600">
            <HelpCircle className="h-4 w-4" />
            {questionCount} questions
          </span>
          <span className="flex items-center gap-1 text-gray-600">
            <Clock3 className="h-4 w-4" />
            {Math.ceil((questionCount * 90) / 60)} min
          </span>
        </div>

        {attempt && (
          <div className="mb-3 p-2 bg-white rounded-lg border border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Last score</span>
              <span className="text-sm font-semibold text-blue-600">
                {attempt.percentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all"
                style={{ width: `${attempt.percentage}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {!isLinked && (
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
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              {attempt && !isLinked ? "Retake Quiz" : "Start Quiz"}
            </button>
          ) : (
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Completed</span>
            </div>
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
  onEditingChange: (field: string, value: any) => void;
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
    <div className="bg-white border border-gray-200 rounded-xl hover:shadow-md transition-all duration-300 overflow-hidden">
      {isEditing ? (
        <div className="p-4">
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Theme</label>
              <input
                value={editingValues.theme}
                onChange={(e) => onEditingChange("theme", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Theme"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Question</label>
              <textarea
                value={editingValues.question}
                onChange={(e) => onEditingChange("question", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={2}
                placeholder="Question"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Options</label>
              {editingValues.options.map((option, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-1.5">
                  <input
                    type="radio"
                    checked={editingValues.correctOptionIndex === idx}
                    onChange={() => onEditingChange("correctOptionIndex", idx)}
                    className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500"
                  />
                  <input
                    value={option}
                    onChange={(e) => {
                      const newOptions = [...editingValues.options];
                      newOptions[idx] = e.target.value;
                      onEditingChange("options", newOptions);
                    }}
                    className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={`Option ${idx + 1}`}
                  />
                </div>
              ))}
            </div>
            
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={onCancelEdit}
                className="px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onSaveEdit}
                className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
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
                <span className="text-xs font-semibold px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                  {question.theme}
                </span>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1 ${
                    question.isPublished
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {question.isPublished ? (
                    <Eye className="h-3 w-3" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                  {question.isPublished ? "Published" : "Draft"}
                </span>
                <span className="text-xs text-gray-500">
                  {formatDate(question.createdAt)}
                </span>
                {hasUnsavedChanges && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                    Unsaved
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-900 mb-2.5 font-medium leading-5">
              {question.question}
            </p>

            <div className="space-y-1">
              {question.options.map((option, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-xs">
                  {idx === question.correctOptionIndex ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                  )}
                  <span
                    className={
                      idx === question.correctOptionIndex
                        ? "text-green-700 font-medium leading-5"
                        : "text-gray-600 leading-5"
                    }
                  >
                    {option}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 bg-gray-50 px-3 py-1.5 flex items-center justify-end gap-1">
            <button
              onClick={onEdit}
              className="p-1 text-gray-600 hover:bg-white hover:text-blue-600 rounded-lg transition-colors"
              title="Edit"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onTogglePublish}
              className={`p-1 rounded-lg transition-colors ${
                question.isPublished
                  ? "text-gray-600 hover:bg-white hover:text-yellow-600"
                  : "text-gray-600 hover:bg-white hover:text-green-600"
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
              className="p-1 text-red-600 hover:bg-white rounded-lg transition-colors disabled:opacity-50"
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
          <span className="font-medium text-gray-700">
            Question {currentIndex + 1} of {totalQuestions}
          </span>
          <div className="flex items-center gap-2">
            <Clock
              className={`h-4 w-4 ${timeLeft <= 60 ? "text-red-500" : "text-gray-400"}`}
            />
            <span
              className={`font-mono font-medium ${timeLeft <= 60 ? "text-red-500" : "text-gray-600"}`}
            >
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="mb-4">
          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
            {question.theme}
          </span>
        </div>

        <p className="text-lg font-semibold text-gray-900 mb-6">
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
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-6 w-6 rounded-full border-2 flex items-center justify-center text-sm font-medium ${
                      isSelected
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-gray-300 text-gray-500"
                    }`}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="text-gray-800">{option}</span>
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
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </button>

        {currentIndex === totalQuestions - 1 ? (
          <button
            onClick={onFinish}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <CheckCircle className="h-4 w-4" />
            Finish Quiz
          </button>
        ) : (
          <button
            onClick={onNext}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
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
    if (percentage >= 90) return "text-green-600";
    if (percentage >= 70) return "text-blue-600";
    if (percentage >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getGradeMessage = (percentage: number) => {
    if (percentage >= 90) return "Excellent!";
    if (percentage >= 70) return "Good job!";
    if (percentage >= 50) return "Keep practicing!";
    return "Need more practice";
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="text-center mb-6">
        <div className="inline-flex h-20 w-20 rounded-full bg-yellow-50 items-center justify-center mb-4">
          <Trophy className="h-8 w-8 text-yellow-600" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-1">
          {getGradeMessage(result.percentage)}
        </h3>
        <p className="text-gray-600">Quiz completed successfully</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-4 bg-gray-50 rounded-xl">
          <p className="text-sm text-gray-600 mb-1">Score</p>
          <p
            className={`text-2xl font-bold ${getGradeColor(result.percentage)}`}
          >
            {result.percentage}%
          </p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-xl">
          <p className="text-sm text-gray-600 mb-1">Correct</p>
          <p className="text-2xl font-bold text-green-600">{result.correct}</p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-xl">
          <p className="text-sm text-gray-600 mb-1">Total</p>
          <p className="text-2xl font-bold text-gray-900">{result.total}</p>
        </div>
      </div>

      {gradingMessage && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <p className="flex items-center gap-2 text-sm text-blue-700">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            {gradingMessage}
          </p>
        </div>
      )}

      <button
        onClick={onClose}
        className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
      >
        Continue to Themes
      </button>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ExerciseBankPage() {
  const QUIZ_SECONDS_PER_QUESTION = 90;
  const MAX_HISTORY_ATTEMPTS = 3;
  const MAX_UNLINKED_ATTEMPTS = 3;

  const { courseCode } = useParams<{ courseCode?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { courses, selectedCourseId, setSelectedCourseId } = useAcademic();

  const isTeacher = user?.role === "docente";

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

  const finishInFlightRef = useRef(false);
  const quizStartSectionRef = useRef<HTMLDivElement | null>(null);
  const finishingByTimerRef = useRef(false);
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
    if (isTeacher) {
      return courses.filter((course) => course.teacherId === user.id);
    }
    return courses.filter(
      (course) =>
        course.enrolledStudents?.includes(user.id) ||
        course.enrolledStudents?.some((student: unknown) => {
          if (typeof student === "string") return student === user.id;
          if (student && typeof student === "object" && "id" in student) {
            return (student as { id: string }).id === user.id;
          }
          return false;
        }),
    );
  }, [courses, isTeacher, user]);

  const selectedCourse = useMemo(
    () => availableCourses.find((course) => course.id === selectedCourseId),
    [availableCourses, selectedCourseId],
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

  useEffect(() => {
    setExpandedThemes((prev) => {
      const next: Record<string, boolean> = {};

      groupedFilteredQuestions.forEach(([theme]) => {
        next[theme] = prev[theme] ?? true;
      });

      return next;
    });
  }, [groupedFilteredQuestions]);

  const stats = useMemo(() => {
    const totalQuestions = questions.length;
    const totalThemes = isTeacher
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
      pendingThemes: isTeacher ? 0 : totalThemes - completedQuizzes,
      publishedCount: publishedQuestions.length,
      draftCount: questions.length - publishedQuestions.length,
    };
  }, [
    availableThemes.length,
    attemptsByTheme,
    isTeacher,
    publishedQuestions.length,
    questions.length,
    studentAvailableThemes.length,
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

  const isLinkedTheme = (theme: string) => Boolean(themeLinksByTheme[theme]);
  const getThemeAttemptCount = useCallback(
    (theme: string) => attemptsCountByTheme[theme] || 0,
    [attemptsCountByTheme],
  );
  const canTakeTheme = (theme: string) => {
    if (isLinkedTheme(theme)) return !attemptsByTheme[theme];
    return getThemeAttemptCount(theme) < MAX_UNLINKED_ATTEMPTS;
  };
  const selectedThemeIsLinked = selectedTheme
    ? isLinkedTheme(selectedTheme)
    : false;
  const pendingThemeIsLinked = pendingStartTheme
    ? isLinkedTheme(pendingStartTheme)
    : false;
  const pendingThemeQuestionCount = useMemo(() => {
    if (!pendingStartTheme) return 0;
    const source = isTeacher ? questions : publishedQuestions;
    return source.filter((question) => question.theme === pendingStartTheme)
      .length;
  }, [isTeacher, pendingStartTheme, publishedQuestions, questions]);

  const pendingThemeTimeLimitSeconds =
    pendingThemeQuestionCount * QUIZ_SECONDS_PER_QUESTION;

  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

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
      setQuestions(loaded);
    } finally {
      setLoading(false);
    }
  };

  const loadStudentAttempts = useCallback(
    async (courseId: string, studentId: string) => {
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

        setAttemptsByTheme(latestByTheme);
        setAttemptsCountByTheme(countByTheme);
        setAttemptHistory(dedupedLoaded.slice(0, MAX_HISTORY_ATTEMPTS));
      } finally {
        setLoadingAttempts(false);
      }
    },
    [MAX_HISTORY_ATTEMPTS, dedupeAttempts],
  );

  const loadThemeLinks = async (courseId: string) => {
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
    setThemeLinksByTheme(map);
  };

  const loadCourseGradeSheets = useCallback(
    async (courseId: string) => {
      if (!user?.id || !isTeacher) {
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
        return {
          id: item.id,
          title: String(data.title || "Untitled grade sheet"),
        };
      });

      loaded.sort((a, b) => a.title.localeCompare(b.title));
      setCourseGradeSheets(loaded);
    },
    [isTeacher, user?.id],
  );

  useEffect(() => {
    if (availableCourses.length === 0) {
      if (selectedCourseId) setSelectedCourseId("");
      return;
    }

    const urlCourse = courseCode
      ? availableCourses.find((course) => course.code === courseCode)
      : null;

    if (urlCourse) {
      if (urlCourse.id !== selectedCourseId) {
        setSelectedCourseId(urlCourse.id);
      }
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

    loadQuestions(selectedCourseId);
    loadThemeLinks(selectedCourseId);

    if (!isTeacher && user?.id) {
      loadStudentAttempts(selectedCourseId, user.id);
    } else {
      setAttemptsByTheme({});
      setAttemptsCountByTheme({});
      setAttemptHistory([]);
      loadCourseGradeSheets(selectedCourseId);
    }
  }, [
    isTeacher,
    loadCourseGradeSheets,
    loadStudentAttempts,
    selectedCourseId,
    user?.id,
  ]);

  useEffect(() => {
    if (!selectedTheme || isTeacher) return;

    const attempt = attemptsByTheme[selectedTheme];
    if (attempt && Boolean(themeLinksByTheme[selectedTheme])) {
      setResult({
        total: attempt.total,
        correct: attempt.correct,
        percentage: attempt.percentage,
      });
      setQuizStarted(false);
    }
  }, [attemptsByTheme, isTeacher, selectedTheme, themeLinksByTheme]);

  useEffect(() => {
    if (!quizStarted || isTeacher) return;

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
  }, [isTeacher, quizStarted]);

  useEffect(() => {
    if (!quizStarted || isTeacher) return;

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
  }, [isTeacher, quizStarted]);

  const handleCourseChange = (courseId: string) => {
    if (quizStarted && !isTeacher) {
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
      if (!isLinkedTheme(theme)) {
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
      !isTeacher &&
      isLinkedTheme(themeToStart) &&
      attemptsByTheme[themeToStart]
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
    if (
      !isTeacher &&
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
      setGradingMessage(
        `Attempt limit reached (${MAX_UNLINKED_ATTEMPTS}/${MAX_UNLINKED_ATTEMPTS}) for this theme.`,
      );
      setQuizStarted(false);
      return;
    }

    const source = isTeacher ? questions : publishedQuestions;
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

        if (!isTeacher && user?.id) {
          const linkedTheme = Boolean(themeLinksByTheme[targetTheme]);
          const currentThemeAttempts = getThemeAttemptCount(targetTheme);
          const allowAttemptSave = linkedTheme
            ? !attemptsByTheme[targetTheme]
            : currentThemeAttempts < MAX_UNLINKED_ATTEMPTS;

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
          } else if (!linkedTheme) {
            const nextAttemptsCount = allowAttemptSave
              ? currentThemeAttempts + 1
              : currentThemeAttempts;
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
      MAX_UNLINKED_ATTEMPTS,
      answers,
      attemptsByTheme,
      dedupeAttempts,
      finishInFlightRef,
      getThemeAttemptCount,
      isFinishingQuiz,
      isTeacher,
      quizQuestions,
      selectedCourseId,
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
      isTeacher,
      selectedTheme,
      quizQuestions,
      answers,
    };
  }, [answers, isTeacher, quizQuestions, quizStarted, selectedTheme]);

  useEffect(() => {
    if (!activeQuizStorageKey) return;

    try {
      if (!isTeacher && quizStarted && selectedTheme && quizQuestions.length > 0) {
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
    } catch {
      // Best effort local persistence.
    }
  }, [
    activeQuizStorageKey,
    answers,
    isTeacher,
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
        !isTeacher &&
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
    [finishQuiz, isTeacher, quizStarted, selectedTheme],
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
        !isTeacher &&
        quizStarted &&
        selectedTheme &&
        selectedTheme !== theme
      ) {
        await finishQuiz("abandoned");
      }

      requestStartQuiz(theme);
    },
    [finishQuiz, isTeacher, quizStarted, requestStartQuiz, selectedTheme],
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
    if (!selectedCourseId || !user?.id || !isTeacher) return;

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
    if (!selectedCourseId || !user) return;

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

  const handleEditingChange = (field: string, value: any) => {
    switch (field) {
      case "theme":
        setEditingTheme(value);
        break;
      case "question":
        setEditingQuestionText(value);
        break;
      case "options":
        setEditingOptions(value);
        break;
      case "correctOptionIndex":
        setEditingCorrectOptionIndex(value);
        break;
    }
  };

  const handleCloseResult = () => {
    setResult(null);
    setGradingMessage("");
    setSelectedTheme("");
  };

  return (
    <DashboardLayout
      title="Exercise Bank"
      subtitle={
        selectedCourse
          ? `${selectedCourse.name} • ${selectedCourse.code}`
          : "Select a course"
      }
      contentClassName="pt-0 lg:pt-1"
    >
      <div className="space-y-2">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-white">
                    Exercise Bank
                  </h1>
                  {selectedCourse && (
                    <Link
                      to={`/courses/${selectedCourse.code}/exercise-bank/stats`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
                      title={
                        isTeacher ? "View quiz statistics" : "View my attempts"
                      }
                    >
                      <BarChart3 className="h-4 w-4" />
                    </Link>
                  )}
                </div>
                <p className="text-blue-100 text-sm max-w-2xl">
                  {isTeacher
                    ? "Create and manage multiple-choice questions by theme. Organize content, track student progress, and link quizzes to grade sheets."
                    : "Practice with interactive quizzes by theme. Track your progress and improve your knowledge step by step."}
                </p>
              </div>
            </div>
            <div className="relative min-w-[260px]">
              <div className="relative">
                <School className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/80" />
                <select
                  className="w-full pl-10 pr-10 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/50 appearance-none cursor-pointer"
                  value={selectedCourseId}
                  onChange={(e) => handleCourseChange(e.target.value)}
                >
                  {availableCourses.map((course) => (
                    <option
                      key={course.id}
                      value={course.id}
                      className="text-gray-900"
                    >
                      {course.code} - {course.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {!selectedCourseId ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] bg-white border border-gray-200 rounded-2xl p-8">
            <div className="h-20 w-20 rounded-full bg-blue-100 flex items-center justify-center mb-4">
              <BookOpen className="h-8 w-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              No course selected
            </h3>
            <p className="text-gray-600 text-center max-w-md">
              Select a course from the dropdown above to access its exercise
              bank.
            </p>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-2 sm:gap-4">
              <StatCard
                icon={<HelpCircle className="h-5 w-5" />}
                label="Total Questions"
                value={stats.totalQuestions}
              />
              <StatCard
                icon={<Layers className="h-5 w-5" />}
                label="Themes"
                value={stats.totalThemes}
              />
              <StatCard
                icon={
                  isTeacher ? (
                    <BarChart3 className="h-5 w-5" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5" />
                  )
                }
                label={isTeacher ? "Avg per Theme" : "Completed"}
                value={
                  isTeacher ? stats.questionsPerTheme : stats.completedQuizzes
                }
              />
              <StatCard
                icon={
                  isTeacher ? (
                    <Users className="h-5 w-5" />
                  ) : (
                    <Zap className="h-5 w-5" />
                  )
                }
                label={isTeacher ? "Students" : "Available"}
                value={
                  isTeacher
                    ? selectedCourse?.enrolledStudents?.length || 0
                    : stats.pendingThemes
                }
              />
            </div>

            {/* Teacher Section */}
            {isTeacher && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Question Management */}
                <div className="lg:col-span-2 space-y-2">
                  {/* Create Question Card */}
                  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-white">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <PenTool className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-gray-900">
                              Create Questions
                            </h2>
                            <p className="text-sm text-gray-600">
                              Add new questions to the bank
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowCreatorForm(!showCreatorForm)}
                          className={`p-2 rounded-lg transition-colors ${
                            showCreatorForm
                              ? "bg-gray-200 text-gray-700"
                              : "hover:bg-gray-200 text-gray-600"
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
                      <div className="p-6 space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => setQuestionCreationMode("single")}
                            className={`px-4 py-2.5 rounded-xl border font-medium transition-all ${
                              questionCreationMode === "single"
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            Single Question
                          </button>
                          <button
                            onClick={() => setQuestionCreationMode("bulk")}
                            className={`px-4 py-2.5 rounded-xl border font-medium transition-all ${
                              questionCreationMode === "bulk"
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            Bulk Import
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => setThemeMode("existing")}
                            className={`px-4 py-2.5 rounded-xl border font-medium transition-all ${
                              themeMode === "existing"
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            Existing Theme
                          </button>
                          <button
                            onClick={() => setThemeMode("new")}
                            className={`px-4 py-2.5 rounded-xl border font-medium transition-all ${
                              themeMode === "new"
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
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
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        )}

                        {questionCreationMode === "single" ? (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Question
                              </label>
                              <textarea
                                value={questionInput}
                                onChange={(e) => setQuestionInput(e.target.value)}
                                placeholder="Enter your question here..."
                                rows={3}
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="block text-sm font-medium text-gray-700">
                                Answer Options
                              </label>
                              {optionsInput.map((option, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-3"
                                >
                                  <input
                                    type="radio"
                                    checked={correctOptionIndex === index}
                                    onChange={() =>
                                      setCorrectOptionIndex(index)
                                    }
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
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
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  />
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">
                              Bulk Import Format
                            </label>
                            <textarea
                              value={bulkQuestionsInput}
                              onChange={(e) =>
                                setBulkQuestionsInput(e.target.value)
                              }
                              rows={8}
                              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                            <p className="text-xs text-gray-500">
                              Use --- to separate questions. Format: Q: for
                              question, A)/B)/C)/D) for options, Correct: for
                              answer.
                            </p>
                          </div>
                        )}

                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                          <div>
                            <p className="font-medium text-gray-700">
                              Initial Visibility
                            </p>
                            <p className="text-xs text-gray-500">
                              Choose if students can see these questions
                            </p>
                          </div>
                          <select
                            value={publishOnCreate ? "published" : "draft"}
                            onChange={(e) =>
                              setPublishOnCreate(e.target.value === "published")
                            }
                            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white"
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
                          className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

                  {/* Question Bank */}
                  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <BookOpen className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-gray-900">
                              Question Bank
                            </h2>
                            <p className="text-sm text-gray-600">
                              {filteredQuestions.length} questions
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {Object.keys(pendingQuestionUpdates).length} unsaved
                          </span>
                          <button
                            onClick={saveAllQuestionChanges}
                            disabled={
                              savingAllQuestionChanges ||
                              Object.keys(pendingQuestionUpdates).length === 0
                            }
                            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {savingAllQuestionChanges
                              ? "Saving..."
                              : "Save All"}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 mt-4">
                        <div className="flex-1 relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search questions..."
                            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                            className="px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="all">All</option>
                            <option value="published">Published</option>
                            <option value="draft">Draft</option>
                          </select>
                          <button
                            onClick={() =>
                              setViewMode(viewMode === "grid" ? "list" : "grid")
                            }
                            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                          >
                            {viewMode === "grid" ? (
                              <List className="h-4 w-4" />
                            ) : (
                              <Grid className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 p-2 bg-gray-50 rounded-xl text-[14px]">
                        <p className="text-xs font-semibold tracking-wide text-gray-600 mb-3">
                          Bulk Actions
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <select
                            value={bulkVisibilityAction}
                            onChange={(e) =>
                              setBulkVisibilityAction(
                                e.target.value as "publish" | "draft",
                              )
                            }
                            className="flex-1 min-w-[160px] px-2 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="publish">Publish drafts</option>
                            <option value="draft">Unpublish</option>
                          </select>
                          <select
                            value={bulkPublishTheme}
                            onChange={(e) =>
                              setBulkPublishTheme(e.target.value)
                            }
                            className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500"
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
                              bulkPublishing || bulkVisibilityTargetCount === 0
                            }
                            className={`px-4 py-2 rounded-lg text-white font-semibold transition-colors ${
                              bulkVisibilityAction === "publish"
                                ? "bg-blue-600 hover:bg-blue-700"
                                : "bg-gray-600 hover:bg-gray-700"
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {bulkPublishing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              `${bulkVisibilityAction === "publish" ? "Publish" : "Unpublish"} (${bulkVisibilityTargetCount})`
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 max-h-[600px] overflow-y-auto">
                      {loading ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                        </div>
                      ) : filteredQuestions.length === 0 ? (
                        <div className="text-center py-12">
                          <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                            <HelpCircle className="h-8 w-8 text-gray-400" />
                          </div>
                          <p className="text-gray-600">No questions found</p>
                          <p className="text-sm text-gray-500">
                            Try adjusting your filters or create a new question
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {groupedFilteredQuestions.map(
                            ([theme, themeQuestions]) => {
                              const isExpanded = expandedThemes[theme] ?? true;

                              return (
                                <div
                                  key={theme}
                                  className="rounded-xl border border-gray-200"
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedThemes((prev) => ({
                                        ...prev,
                                        [theme]: !isExpanded,
                                      }))
                                    }
                                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors rounded-xl"
                                  >
                                    <div className="text-left">
                                      <p className="font-semibold text-gray-900">
                                        {theme}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {themeQuestions.length} questions
                                      </p>
                                    </div>
                                    <ChevronDown
                                      className={`h-4 w-4 text-gray-500 transition-transform ${
                                        isExpanded ? "rotate-180" : ""
                                      }`}
                                    />
                                  </button>

                                  {isExpanded && (
                                    <div className="p-4">
                                      <div
                                        className={
                                          viewMode === "grid"
                                            ? "grid grid-cols-1 gap-4"
                                            : "space-y-2"
                                        }
                                      >
                                        {themeQuestions.map((question) => (
                                          <QuestionCard
                                            key={question.id}
                                            question={question}
                                            isEditing={
                                              editingQuestionId === question.id
                                            }
                                            hasUnsavedChanges={
                                              !!pendingQuestionUpdates[
                                                question.id
                                              ]
                                            }
                                            onEdit={() =>
                                              startEditingQuestion(question)
                                            }
                                            onCancelEdit={cancelEditingQuestion}
                                            onSaveEdit={queueEditedQuestion}
                                            onTogglePublish={() =>
                                              handleToggleQuestionPublish(
                                                question,
                                              )
                                            }
                                            onDelete={() =>
                                              setShowDeleteConfirm(question.id)
                                            }
                                            isDeleting={deletingId === question.id}
                                            editingValues={{
                                              theme: editingTheme,
                                              question: editingQuestionText,
                                              options: editingOptions,
                                              correctOptionIndex:
                                                editingCorrectOptionIndex,
                                            }}
                                            onEditingChange={handleEditingChange}
                                          />
                                        ))}
                                      </div>
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
                </div>

                {/* Right Column - Teacher Tools */}
                <div className="space-y-2">
                  {/* Student Preview */}
                  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
                    <div className="px-6 py-4 border-b border-gray-200 bg-white">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                          <Eye className="h-5 w-5 text-gray-600" />
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-gray-900">
                            Student Preview
                          </h2>
                          <p className="text-sm text-gray-600">
                            How students see available themes
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="space-y-2">
                        {studentAvailableThemes.slice(0, 5).map((theme) => (
                          <div
                            key={theme}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                          >
                            <div className="flex items-center gap-3">
                              <BookMarked className="h-4 w-4 text-gray-400" />
                              <span className="text-sm font-medium text-gray-700">
                                {theme}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">
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
                          <p className="text-sm text-gray-500 text-center py-4">
                            Publish questions to see the student view
                          </p>
                        )}
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <p className="text-xs text-gray-500">
                            <span className="font-medium text-blue-600">Linked themes:</span> 1 attempt •{" "}
                            <span className="font-medium text-blue-600">Practice themes:</span>{" "}
                            {MAX_UNLINKED_ATTEMPTS} attempts
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                     {/* Link to Grade Sheets */}
                  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-gray-900">
                            Link to Grade Sheets
                          </h2>
                          <p className="text-sm text-gray-600">
                            Connect themes to grade books
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="p-6 max-h-[300px] overflow-y-auto">
                      <div className="space-y-2">
                        {availableThemes.map((theme) => (
                          <div
                            key={theme}
                            className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl"
                          >
                            <p className="flex-1 text-sm font-medium text-gray-700 whitespace-normal break-words leading-5">
                              {theme}
                            </p>
                            <select
                              value={themeLinksByTheme[theme] || ""}
                              onChange={(e) =>
                                handleThemeLinkChange(theme, e.target.value)
                              }
                              disabled={savingThemeLink === theme}
                              className="w-[180px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">No sheet</option>
                              {courseGradeSheets.map((sheet) => (
                                <option key={sheet.id} value={sheet.id}>
                                  {sheet.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                        {availableThemes.length === 0 && (
                          <p className="text-sm text-gray-500 text-center py-4">
                            Create themes first to link them to grade sheets
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Course Statistics */}
                  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <BarChart3 className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-gray-900">
                            Course Statistics
                          </h2>
                          <p className="text-sm text-gray-600">
                            Overview of {selectedCourse?.name}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 rounded-xl">
                          <p className="text-xs text-gray-500 mb-1">Students</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {selectedCourse?.enrolledStudents?.length || 0}
                          </p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl">
                          <p className="text-xs text-gray-500 mb-1">
                            Published
                          </p>
                          <p className="text-2xl font-bold text-green-600">
                            {stats.publishedCount}
                          </p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl">
                          <p className="text-xs text-gray-500 mb-1">Drafts</p>
                          <p className="text-2xl font-bold text-gray-600">
                            {stats.draftCount}
                          </p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl">
                          <p className="text-xs text-gray-500 mb-1">Themes</p>
                          <p className="text-2xl font-bold text-blue-600">
                            {stats.totalThemes}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

               
                </div>
              </div>
            )}

            {/* Student Section */}
            {!isTeacher && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-2">
                  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Layers className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-gray-900">
                              Available Themes
                            </h2>
                            <p className="text-sm text-gray-600">
                              {studentAvailableThemes.length} themes •{" "}
                              {stats.completedQuizzes} completed
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6">
                      {studentAvailableThemes.length === 0 ? (
                        <div className="text-center py-12">
                          <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                            <BookOpen className="h-8 w-8 text-gray-400" />
                          </div>
                          <p className="text-gray-600">
                            No themes available yet
                          </p>
                          <p className="text-sm text-gray-500">
                            Check back later for new exercises
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {studentAvailableThemes.map((theme) => {
                            const attempt = attemptsByTheme[theme];
                            const attemptCount = getThemeAttemptCount(theme);
                            const linkedTheme = isLinkedTheme(theme);
                            const canTake = canTakeTheme(theme);
                            const questionCount = publishedQuestions.filter(
                              (q) => q.theme === theme,
                            ).length;

                            return (
                              <ThemeCard
                                key={theme}
                                theme={theme}
                                questionCount={questionCount}
                                isLinked={linkedTheme}
                                maxAttempts={MAX_UNLINKED_ATTEMPTS}
                                attempt={attempt}
                                attemptCount={attemptCount}
                                isSelected={selectedTheme === theme}
                                canTake={canTake}
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
                      className="bg-white border border-gray-200 rounded-2xl shadow-sm"
                    >
                      <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-bold text-gray-900">
                          Selected Theme: {selectedTheme}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Quiz workspace and current progress
                        </p>
                      </div>
                      <div className="p-6">
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
                        ) : selectedThemeAttempt && selectedThemeIsLinked ? (
                          <div className="text-center py-8">
                            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                              <CheckCircle className="h-8 w-8 text-green-600" />
                            </div>
                            <h4 className="text-lg font-semibold text-gray-900 mb-2">
                              Quiz Already Completed
                            </h4>
                            <p className="text-gray-600 mb-4">
                              Your score: {selectedThemeAttempt.correct} /{" "}
                              {selectedThemeAttempt.total} (
                              {selectedThemeAttempt.percentage}%)
                            </p>
                            <button
                              onClick={() => setSelectedTheme("")}
                              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              Choose Another Theme
                            </button>
                          </div>
                        ) : (
                          <div className="text-center py-12">
                            <p className="text-gray-600">
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
                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
                      <div className="px-6 py-4 border-b border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                            <TrendingUp className="h-5 w-5 text-green-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">
                              Progress Overview
                            </h3>
                            <p className="text-sm text-gray-600">
                              Completion status by theme
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="p-6">
                        <div className="space-y-2">
                          <div>
                            <div className="flex justify-between text-sm mb-2">
                              <span className="text-gray-600">
                                Themes Completed
                              </span>
                              <span className="font-semibold text-gray-900">
                                {stats.completedQuizzes}/{stats.totalThemes}
                              </span>
                            </div>
                            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full transition-all"
                                style={{
                                  width:
                                    stats.totalThemes > 0
                                      ? `${(stats.completedQuizzes / stats.totalThemes) * 100}%`
                                      : "0%",
                                }}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2">
                            <div className="p-4 bg-gray-50 rounded-xl text-center">
                              <p className="text-2xl font-bold text-gray-900">
                                {stats.completedQuizzes}
                              </p>
                              <p className="text-xs text-gray-600">Completed</p>
                            </div>
                            <div className="p-4 bg-gray-50 rounded-xl text-center">
                              <p className="text-2xl font-bold text-gray-900">
                                {stats.pendingThemes}
                              </p>
                              <p className="text-xs text-gray-600">Pending</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {attemptHistory.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
                      <div className="px-6 py-4 border-b border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Clock className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">
                              Recent Attempts
                            </h3>
                            <p className="text-sm text-gray-600">
                              Latest quiz results and scores
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="p-6">
                        <div className="space-y-2">
                          {attemptHistory.map((attempt, index) => (
                            <div
                              key={`${attempt.id}-${index}`}
                              className="p-3 bg-gray-50 rounded-xl"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-gray-700">
                                  {attempt.theme}
                                </span>
                                <span
                                  className={`text-xs font-semibold px-2 py-1 rounded-full ${
                                    attempt.percentage >= 70
                                      ? "bg-green-100 text-green-700"
                                      : attempt.percentage >= 50
                                        ? "bg-yellow-100 text-yellow-700"
                                        : "bg-red-100 text-red-700"
                                  }`}
                                >
                                  {attempt.percentage}%
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">
                                  {formatDateTime(attempt.createdAt)}
                                </span>
                                <span className="text-gray-600">
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

        <Modal
          isOpen={showStartWarning}
          onClose={() => {
            setShowStartWarning(false);
            setPendingStartTheme(null);
          }}
          title="Before you start"
        >
          <div className="space-y-2">
            <div className="p-4 bg-blue-50 rounded-xl">
              <p className="font-medium text-blue-800">
                Theme: <span className="font-bold">{pendingStartTheme}</span>
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Clock className="h-3 w-3 text-gray-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Time Limit</p>
                  <p className="text-sm text-gray-600">
                    {formatDuration(pendingThemeTimeLimitSeconds)} (
                    {QUIZ_SECONDS_PER_QUESTION} seconds per question)
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <HelpCircle className="h-3 w-3 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Attempts</p>
                  <p className="text-sm text-gray-600">
                    {pendingThemeIsLinked
                      ? "This quiz is linked to a grade sheet - only one attempt allowed"
                      : `This is a practice quiz - ${MAX_UNLINKED_ATTEMPTS} attempts allowed`}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="h-3 w-3 text-yellow-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Auto-submit</p>
                  <p className="text-sm text-gray-600">
                    When time runs out, your quiz will be submitted
                    automatically
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowStartWarning(false);
                  setPendingStartTheme(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmStartQuiz}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
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
    </DashboardLayout>
  );
}
