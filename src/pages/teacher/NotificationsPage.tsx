import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAcademic } from "@/contexts/AcademicContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  notificationService,
  type NotificationType,
} from "@/lib/services/notificationService";
import {
  defaultNotificationAutomations,
  type NotificationAutomationSettings,
} from "@/lib/services/notificationAutomation";
import {
  defaultNotificationHubPreferences,
  isMutedType,
  isWithinQuietHours,
  type NotificationHubPreferences,
} from "@/lib/services/notificationPreferences";
import { doc, getDoc } from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  BellRing,
  BellOff,
  BookOpen,
  Calendar,
  CheckCircle,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  Filter,
  GraduationCap,
  History,
  Loader2,
  Megaphone,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  Search,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Users,
  X,
  Check,
  Plus,
  Minus,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Edit3,
  Save,
  Upload,
  Download as DownloadIcon,
  Printer,
  Mail,
  MailCheck,
  MailX,
  Inbox,
  Archive,
  Star,
  Zap,
  Rocket,
  Award,
  Trophy,
  TrendingUp,
  BarChart3,
  PieChart,
  LineChart,
  Activity,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Globe,
  Lock,
  Shield,
  Key,
  UserPlus,
  UserMinus,
  UserCheck,
  UserX,
  Briefcase,
  CalendarDays,
  Clock3,
  AlarmClock,
  Timer,
  Hourglass,
  Infinity,
  Target,
  Compass,
  MapPin,
  Link as LinkIcon,
  Image as ImageIcon,
  FileText,
  Paperclip,
  Info,
  Share2,
  ThumbsUp,
  ThumbsDown,
  Heart,
  Star as StarIcon,
  Flag,
  FlagOff,
  Ban,
  Circle,
  CircleDot,
  CircleOff,
  Square,
  SquareDot,
} from "lucide-react";

interface CourseStudent {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  avatarEmoji?: string;
}

interface QuickTemplate {
  id: string;
  label: string;
  title: string;
  message: string;
  type: NotificationType;
  link: string;
  icon: React.ReactNode;
  color: string;
}

type SendMode = "now" | "scheduled";
type HistoryStatus = "sent" | "scheduled" | "cancelled";
type HubTab =
  | "compose"
  | "history"
  | "scheduled"
  | "automations"
  | "preferences";

interface NotificationHistoryItem {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  title: string;
  message: string;
  type: NotificationType;
  link?: string;
  targetMode: "course" | "student";
  recipientIds: string[];
  recipientCount: number;
  status: HistoryStatus;
  createdAt: number;
  scheduledFor?: number;
  sentAt?: number;
}

type AutomationSettings = NotificationAutomationSettings;
type AutomationToggleKey = Exclude<
  keyof AutomationSettings,
  "deadlineReminderHours"
>;

type HubPreferences = NotificationHubPreferences;

const defaultAutomations: AutomationSettings = defaultNotificationAutomations;
const defaultHubPreferences: HubPreferences = defaultNotificationHubPreferences;

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toCsvValue(value: string | number): string {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const { courses, selectedCourseId, setSelectedCourseId } = useAcademic();

  const [students, setStudents] = useState<CourseStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    templates: true,
    form: true,
    preview: false,
  });

  const [tab, setTab] = useState<HubTab>("compose");
  const [targetMode, setTargetMode] = useState<"course" | "student">("course");
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>([]);
  const [sendToMe, setSendToMe] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<NotificationType>("info");
  const [link, setLink] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  const [sendMode, setSendMode] = useState<SendMode>("now");
  const [scheduledAt, setScheduledAt] = useState("");

  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyTypeFilter, setHistoryTypeFilter] = useState<
    "all" | NotificationType
  >("all");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<
    "all" | HistoryStatus
  >("all");
  const [historyCourseFilter, setHistoryCourseFilter] = useState<string>("all");

  const [automations, setAutomations] =
    useState<AutomationSettings>(defaultAutomations);
  const [hubPreferences, setHubPreferences] = useState<HubPreferences>(
    defaultHubPreferences,
  );

  const processingScheduledRef = useRef(false);

  const historyKey = user?.id
    ? `notifications:history:${user.id}`
    : "notifications:history";
  const automationsKey = user?.id
    ? `notifications:automations:${user.id}`
    : "notifications:automations";
  const prefsKey = user?.id
    ? `notifications:hubprefs:${user.id}`
    : "notifications:hubprefs";

  const teacherCourses = useMemo(() => {
    if (!user?.id) return [];
    return courses.filter((course) => course.teacherId === user.id);
  }, [courses, user?.id]);

  const selectedCourse = useMemo(
    () =>
      teacherCourses.find((course) => course.id === selectedCourseId) || null,
    [selectedCourseId, teacherCourses],
  );

  const quickTemplates = useMemo<QuickTemplate[]>(
    () => [
      {
        id: "deadline",
        label: "Deadline reminder",
        title: "⏰ Reminder: Upcoming deadline",
        message:
          "Hi {studentName}, please submit pending work for {courseName} before the deadline.",
        type: "warning",
        link: selectedCourse
          ? `/courses/${selectedCourse.code}/assessments`
          : "",
        icon: <Clock className="h-3 w-3" />,
        color: "blue",
      },
      {
        id: "schedule",
        label: "Schedule change",
        title: "📅 Class schedule updated",
        message:
          "Schedule for {courseName} has been updated. Please review the new time for {date}.",
        type: "info",
        link: selectedCourse ? `/courses/view/${selectedCourse.code}` : "",
        icon: <Calendar className="h-3 w-3" />,
        color: "blue",
      },
      {
        id: "cancelled",
        label: "Class cancelled",
        title: "❌ Class cancelled",
        message:
          "Today's class for {courseName} is cancelled. New details will be shared soon.",
        type: "warning",
        link: selectedCourse ? `/courses/view/${selectedCourse.code}` : "",
        icon: <AlertTriangle className="h-3 w-3" />,
        color: "gray",
      },
      {
        id: "materials",
        label: "New material",
        title: "📚 New material available",
        message:
          "New files were uploaded for {courseName}. Please review them before next class.",
        type: "success",
        link: selectedCourse ? `/courses/${selectedCourse.code}/files` : "",
        icon: <BookOpen className="h-3 w-3" />,
        color: "blue",
      },
      {
        id: "feedback",
        label: "Grades published",
        title: "📊 Grades and feedback published",
        message:
          "Your latest grades are now available. Open your grade section to review feedback.",
        type: "success",
        link: "/grades",
        icon: <Award className="h-3 w-3" />,
        color: "blue",
      },
      {
        id: "welcome",
        label: "Welcome message",
        title: "👋 Welcome to the course!",
        message:
          "Welcome to {courseName}! We're excited to have you. Check out the course materials to get started.",
        type: "success",
        link: selectedCourse ? `/courses/view/${selectedCourse.code}` : "",
        icon: <Heart className="h-3 w-3" />,
        color: "gray",
      },
      {
        id: "reminder",
        label: "General reminder",
        title: "📌 Important reminder",
        message:
          "This is a friendly reminder about your upcoming commitments in {courseName}.",
        type: "info",
        link: "",
        icon: <Bell className="h-3 w-3" />,
        color: "blue",
      },
    ],
    [selectedCourse],
  );

  const filteredStudents = useMemo(() => {
    const term = studentSearch.trim().toLowerCase();
    if (!term) return students;
    return students.filter(
      (student) =>
        student.name.toLowerCase().includes(term) ||
        student.email.toLowerCase().includes(term),
    );
  }, [students, studentSearch]);

  const recipientCount = useMemo(() => {
    const base =
      targetMode === "course"
        ? filteredStudents.length
        : targetStudentIds.length;
    return base + (sendToMe ? 1 : 0);
  }, [filteredStudents.length, sendToMe, targetMode, targetStudentIds.length]);

  const scheduledItems = useMemo(
    () => history.filter((item) => item.status === "scheduled"),
    [history],
  );

  const historyCourseOptions = useMemo(() => {
    const map = new Map<string, string>();
    history.forEach((item) => map.set(item.courseId, item.courseName));
    return Array.from(map.entries());
  }, [history]);

  const filteredHistory = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    return [...history]
      .filter((item) => {
        if (historyTypeFilter !== "all" && item.type !== historyTypeFilter)
          return false;
        if (
          historyStatusFilter !== "all" &&
          item.status !== historyStatusFilter
        )
          return false;
        if (
          historyCourseFilter !== "all" &&
          item.courseId !== historyCourseFilter
        )
          return false;
        if (!term) return true;
        return (
          item.title.toLowerCase().includes(term) ||
          item.message.toLowerCase().includes(term) ||
          item.courseName.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [
    history,
    historySearch,
    historyTypeFilter,
    historyStatusFilter,
    historyCourseFilter,
  ]);

  const quietHoursActiveNow = useMemo(
    () => isWithinQuietHours(hubPreferences),
    [hubPreferences],
  );

  const getTypeIcon = (type: NotificationType) => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-blue-500" />;
      case "info":
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getTypeColor = (type: NotificationType) => {
    switch (type) {
      case "success":
        return "blue";
      case "warning":
        return "gray";
      case "info":
      default:
        return "blue";
    }
  };

  useEffect(() => {
    if (teacherCourses.length === 0) return;
    if (
      selectedCourseId &&
      teacherCourses.some((course) => course.id === selectedCourseId)
    )
      return;
    setSelectedCourseId(teacherCourses[0]?.id || "");
  }, [selectedCourseId, setSelectedCourseId, teacherCourses]);

  useEffect(() => {
    if (!user?.id) return;
    setHistory(
      safeJsonParse<NotificationHistoryItem[]>(
        localStorage.getItem(historyKey),
        [],
      ),
    );
    setAutomations(
      safeJsonParse<AutomationSettings>(
        localStorage.getItem(automationsKey),
        defaultAutomations,
      ),
    );
    setHubPreferences(
      safeJsonParse<HubPreferences>(
        localStorage.getItem(prefsKey),
        defaultHubPreferences,
      ),
    );
  }, [automationsKey, historyKey, prefsKey, user?.id]);

  useEffect(() => {
    localStorage.setItem(historyKey, JSON.stringify(history));
  }, [history, historyKey]);

  useEffect(() => {
    localStorage.setItem(automationsKey, JSON.stringify(automations));
  }, [automations, automationsKey]);

  useEffect(() => {
    localStorage.setItem(prefsKey, JSON.stringify(hubPreferences));
  }, [hubPreferences, prefsKey]);

  useEffect(() => {
    const loadStudents = async () => {
      if (!selectedCourse) {
        setStudents([]);
        return;
      }

      const enrolledStudentIds = (selectedCourse.enrolledStudents || []).filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0,
      );

      if (enrolledStudentIds.length === 0) {
        setStudents([]);
        return;
      }

      setLoadingStudents(true);
      try {
        const results = await Promise.all(
          enrolledStudentIds.map(async (studentId) => {
            const [userDoc, studentDoc] = await Promise.all([
              getDoc(doc(firebaseDB, "usuarios", studentId)),
              getDoc(doc(firebaseDB, "estudiantes", studentId)),
            ]);

            const userData = userDoc.exists() ? userDoc.data() : {};
            const studentData = studentDoc.exists() ? studentDoc.data() : {};

            return {
              id: studentId,
              name: String(userData.name || studentData.name || "Student"),
              email: String(userData.email || studentData.email || ""),
              avatarUrl: String(
                userData.avatarUrl || studentData.avatarUrl || "",
              ),
              avatarEmoji: String(
                userData.avatarEmoji || studentData.avatarEmoji || "👤",
              ),
            } as CourseStudent;
          }),
        );

        results.sort((a, b) => a.name.localeCompare(b.name));
        setStudents(results);
      } catch {
        toast.error("Could not load enrolled students");
      } finally {
        setLoadingStudents(false);
      }
    };

    void loadStudents();
  }, [selectedCourse]);

  useEffect(() => {
    if (targetMode === "course") return;
    const validIds = targetStudentIds.filter((id) =>
      students.some((student) => student.id === id),
    );
    if (validIds.length > 0 && validIds.length === targetStudentIds.length) return;
    if (validIds.length > 0) {
      setTargetStudentIds(validIds);
      return;
    }
    setTargetStudentIds(students[0]?.id ? [students[0].id] : []);
  }, [students, targetMode, targetStudentIds]);

  const interpolateTemplate = useCallback(
    (raw: string) => {
      const studentName =
        targetMode === "student"
          ? students.find((student) => student.id === targetStudentIds[0])?.name ||
            "Student"
          : "Student";
      const studentCountValue =
        targetMode === "student"
          ? targetStudentIds.length
          : filteredStudents.length;

      return raw
        .replace(/\{courseName\}/g, selectedCourse?.name || "this course")
        .replace(/\{courseCode\}/g, selectedCourse?.code || "")
        .replace(/\{studentName\}/g, studentName)
        .replace(/\{studentCount\}/g, String(studentCountValue))
        .replace(/\{date\}/g, new Date().toLocaleDateString("en-US"));
    },
    [
      filteredStudents.length,
      selectedCourse?.code,
      selectedCourse?.name,
      students,
      targetMode,
      targetStudentIds,
    ],
  );

  const applyTemplate = (template: QuickTemplate) => {
    setTitle(interpolateTemplate(template.title));
    setMessage(interpolateTemplate(template.message));
    setType(template.type);
    setLink(template.link);
    toast.success(
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-blue-500" />
        <span>Template "{template.label}" applied</span>
      </div>
    );
  };

  const computeRecipients = useCallback(() => {
    const recipientIds = new Set<string>();

    if (targetMode === "course") {
      filteredStudents.forEach((student) => recipientIds.add(student.id));
    } else if (targetStudentIds.length > 0) {
      targetStudentIds.forEach((id) => recipientIds.add(id));
    }

    if (sendToMe && user?.id) recipientIds.add(user.id);
    return Array.from(recipientIds);
  }, [filteredStudents, sendToMe, targetMode, targetStudentIds, user?.id]);

  const deliverNotification = useCallback(
    async (
      recipientIds: string[],
      payload: {
        title: string;
        message: string;
        type: NotificationType;
        link?: string;
      },
    ) => {
      await Promise.all(
        recipientIds.map((recipientId) =>
          notificationService.createNotification(recipientId, {
            title: payload.title,
            message: payload.message,
            type: payload.type,
            link: payload.link,
          }),
        ),
      );
    },
    [],
  );

  const addHistoryItem = useCallback((item: NotificationHistoryItem) => {
    setHistory((prev) => [item, ...prev]);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;
    if (!selectedCourse) {
      toast.error("Select a course first");
      return;
    }

    const cleanTitle = interpolateTemplate(title.trim());
    const cleanMessage = interpolateTemplate(message.trim());
    const cleanLink = link.trim();

    if (!cleanTitle || !cleanMessage) {
      toast.error("Title and message are required");
      return;
    }
    if (isMutedType(hubPreferences, type)) {
      toast.error(`"${type}" notifications are muted in Preferences.`);
      return;
    }

    const recipientIds = computeRecipients();
    if (recipientIds.length === 0) {
      toast.error("There are no recipients for this notification");
      return;
    }

    const now = Date.now();
    const baseHistory: NotificationHistoryItem = {
      id: `log_${now}_${Math.random().toString(36).slice(2, 8)}`,
      courseId: selectedCourse.id,
      courseCode: selectedCourse.code,
      courseName: selectedCourse.name,
      title: cleanTitle,
      message: cleanMessage,
      type,
      link: cleanLink || undefined,
      targetMode,
      recipientIds,
      recipientCount: recipientIds.length,
      status: "sent",
      createdAt: now,
      sentAt: now,
    };

    if (sendMode === "scheduled") {
      const targetTs = scheduledAt ? new Date(scheduledAt).getTime() : NaN;
      if (Number.isNaN(targetTs) || targetTs <= now) {
        toast.error("Pick a valid future date/time for scheduled send");
        return;
      }

      addHistoryItem({
        ...baseHistory,
        status: "scheduled",
        scheduledFor: targetTs,
        sentAt: undefined,
      });
      toast.success(
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-500" />
          <span>Notification scheduled successfully</span>
        </div>
      );
      setScheduledAt("");
      return;
    }

    setSending(true);
    try {
      await deliverNotification(recipientIds, {
        title: cleanTitle,
        message: cleanMessage,
        type,
        link: cleanLink || undefined,
      });

      addHistoryItem(baseHistory);
      toast.success(
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-blue-500" />
          <span>Notification sent to {recipientIds.length} user(s)</span>
        </div>
      );
      setTitle("");
      setMessage("");
      setLink("");
    } catch {
      toast.error("Could not send notification");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;

    const interval = window.setInterval(() => {
      if (processingScheduledRef.current) return;
      if (isWithinQuietHours(hubPreferences)) return;

      const dueItems = history.filter(
        (item) =>
          item.status === "scheduled" && (item.scheduledFor || 0) <= Date.now(),
      );
      if (dueItems.length === 0) return;

      processingScheduledRef.current = true;
      void (async () => {
        try {
          let mutedSkippedCount = 0;
          let deliveredCount = 0;
          for (const item of dueItems) {
            if (isMutedType(hubPreferences, item.type)) {
              mutedSkippedCount += 1;
              setHistory((prev) =>
                prev.map((entry) =>
                  entry.id === item.id
                    ? { ...entry, status: "cancelled" }
                    : entry,
                ),
              );
              continue;
            }

            await deliverNotification(item.recipientIds, {
              title: item.title,
              message: item.message,
              type: item.type,
              link: item.link,
            });
            deliveredCount += 1;

            setHistory((prev) =>
              prev.map((entry) =>
                entry.id === item.id
                  ? { ...entry, status: "sent", sentAt: Date.now() }
                  : entry,
              ),
            );
          }
          if (deliveredCount > 0) {
            toast.success(
              `${deliveredCount} scheduled notification(s) delivered`,
            );
          }
          if (mutedSkippedCount > 0) {
            toast.message(
              `${mutedSkippedCount} scheduled notification(s) were cancelled due to mute preferences.`,
            );
          }
        } catch {
          toast.error("Failed to deliver some scheduled notifications");
        } finally {
          processingScheduledRef.current = false;
        }
      })();
    }, 25000);

    return () => {
      window.clearInterval(interval);
    };
  }, [deliverNotification, history, hubPreferences, user?.id]);

  const cancelScheduled = (id: string) => {
    setHistory((prev) =>
      prev.map((item) =>
        item.id === id && item.status === "scheduled"
          ? { ...item, status: "cancelled" }
          : item,
      ),
    );
    toast.success("Scheduled notification cancelled");
  };

  const sendScheduledNow = async (id: string) => {
    const item = history.find((entry) => entry.id === id);
    if (!item || item.status !== "scheduled") return;
    if (isMutedType(hubPreferences, item.type)) {
      toast.error(`"${item.type}" notifications are muted in Preferences.`);
      return;
    }

    setSending(true);
    try {
      await deliverNotification(item.recipientIds, {
        title: item.title,
        message: item.message,
        type: item.type,
        link: item.link,
      });

      setHistory((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? { ...entry, status: "sent", sentAt: Date.now() }
            : entry,
        ),
      );
      toast.success("Scheduled notification sent now");
    } catch {
      toast.error("Could not send scheduled notification");
    } finally {
      setSending(false);
    }
  };

  const deleteHistoryItem = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    toast.success("Item removed from history");
  };

  const exportHistoryCsv = () => {
    if (filteredHistory.length === 0) {
      toast.error("No history data to export");
      return;
    }

    const headers = [
      "Date",
      "Status",
      "Course",
      "Type",
      "Title",
      "Message",
      "Recipients",
      "Link",
    ];

    const rows = filteredHistory.map((item) => [
      formatDateTime(item.sentAt || item.createdAt),
      item.status,
      `${item.courseName} (${item.courseCode})`,
      item.type,
      item.title,
      item.message,
      item.recipientCount,
      item.link || "",
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => toCsvValue(cell)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notifications-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewItems = useMemo(() => {
    const now = Date.now();
    return [
      {
        id: "preview-current",
        title: title.trim() || "📢 Class schedule updated",
        message:
          message.trim() ||
          "Today's class schedule was updated. Please review the latest instructions and adjusted times.",
        type: type,
        createdAt: formatDateTime(now),
      },

    ];
  }, [message, title, type]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  return (
    <DashboardLayout
      title="Notifications Center"
      subtitle="Communication hub for courses and students"  contentClassName="pt-0 lg:pt-1"
    >
      <div className="space-y-2">
   

    

        {/* Tabs de navegación */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setTab("compose")}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              tab === "compose"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Megaphone className="h-4 w-4" />
            Compose
          </button>
          <button
            onClick={() => setTab("history")}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              tab === "history"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <History className="h-4 w-4" />
            History
          </button>
          <button
            onClick={() => setTab("scheduled")}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              tab === "scheduled"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Clock className="h-4 w-4" />
            Scheduled
          </button>
          <button
            onClick={() => setTab("automations")}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              tab === "automations"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Settings2 className="h-4 w-4" />
            Automations
          </button>
          <button
            onClick={() => setTab("preferences")}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              tab === "preferences"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Filter className="h-4 w-4" />
            Preferences
          </button>
        </div>

        {/* Alerta de horas de silencio */}
        {quietHoursActiveNow && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 mb-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Moon className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-800">
                  Quiet hours are active ({hubPreferences.quietHourStart} - {hubPreferences.quietHourEnd})
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Automatic notifications are paused. Scheduled items will be delivered after this window.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Vista previa */}
        {showPreview && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-start gap-2">
                <Eye className="h-4 w-4 text-gray-500 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900">Preview</h3>
                  <p className="text-xs text-gray-600">Live notification preview</p>
                </div>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-blue-500" />
                  Notifications
                </p>
                <span className="text-xs text-blue-600 hover:underline cursor-pointer">
                  Mark all read
                </span>
              </div>
              
              {previewItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {item.type === "success" ? (
                        <CheckCircle className="h-4 w-4 text-blue-500" />
                      ) : item.type === "warning" ? (
                        <AlertTriangle className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Info className="h-4 w-4 text-blue-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">
                          {item.title}
                        </p>
                        {idx === 0 && (
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-medium">
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {item.message}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-2">
                        {item.createdAt}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contenido según pestaña */}
        {tab === "compose" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna izquierda - Formulario */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                      <MessageSquare className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        Create Notification
                      </h2>
                      <p className="text-sm text-gray-600">
                        Compose and send announcements
                      </p>
                    </div>
                  </div>
                </div>

                {teacherCourses.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                      <BookOpen className="h-8 w-8 text-blue-400" />
                    </div>
                    <p className="text-gray-900 font-semibold text-lg">No courses found</p>
                    <p className="text-sm text-gray-600 mt-2">
                      You need at least one course as teacher to send notifications.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Quick Templates */}
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 flex items-center gap-2">
                        <Copy className="h-4 w-4 text-gray-500" />
                        Quick Templates
                      </label>
                      <select
                        defaultValue=""
                        onChange={(event) => {
                          const selectedId = event.target.value;
                          const template = quickTemplates.find((item) => item.id === selectedId);
                          if (template) applyTemplate(template);
                          event.target.value = "";
                        }}
                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select a template</option>
                        {quickTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Choosing a template auto-fills title and message.
                      </p>
                    </div>

                    {/* Course and Send Mode */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Course
                        </label>
                        <select
                          value={selectedCourseId || ""}
                          onChange={(event) =>
                            setSelectedCourseId(event.target.value)
                          }
                          className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          {teacherCourses.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.name} ({course.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Send Mode
                        </label>
                        <select
                          value={sendMode}
                          onChange={(event) =>
                            setSendMode(event.target.value as SendMode)
                          }
                          className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="now">📨 Send now</option>
                          <option value="scheduled">⏰ Schedule send</option>
                        </select>
                      </div>
                    </div>

                    {/* Schedule datetime */}
                    {sendMode === "scheduled" && (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Schedule date & time
                        </label>
                        <input
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(event) => setScheduledAt(event.target.value)}
                          className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    )}

                    {/* Target and Type */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Target
                        </label>
                        <select
                          value={targetMode}
                          onChange={(event) =>
                            setTargetMode(
                              event.target.value as "course" | "student",
                            )
                          }
                          className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="course">📢 All students</option>
                          <option value="student">👤 Selected students</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Type
                        </label>
                        <select
                          value={type}
                          onChange={(event) =>
                            setType(event.target.value as NotificationType)
                          }
                          className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="info">ℹ️ Info</option>
                          <option value="success">✅ Success</option>
                          <option value="warning">⚠️ Warning</option>
                        </select>
                      </div>
                    </div>

                    {/* Student selection */}
                    {targetMode === "student" && (
                      <div className="space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                          <input
                            type="text"
                            value={studentSearch}
                            onChange={(event) =>
                              setStudentSearch(event.target.value)
                            }
                            placeholder="Search student by name or email"
                            className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <select
                          multiple
                          value={targetStudentIds}
                          onChange={(event) =>
                            setTargetStudentIds(
                              Array.from(event.target.selectedOptions).map(
                                (option) => option.value,
                              ),
                            )
                          }
                          disabled={
                            loadingStudents || filteredStudents.length === 0
                          }
                          className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 min-h-[180px]"
                        >
                          {loadingStudents ? (
                            <option value="">Loading students...</option>
                          ) : filteredStudents.length === 0 ? (
                            <option value="">No students found</option>
                          ) : (
                            filteredStudents.map((student) => (
                              <option key={student.id} value={student.id}>
                                {student.name} ({student.email || "no email"})
                              </option>
                            ))
                          )}
                        </select>
                        {filteredStudents.length > 0 && (
                          <p className="text-xs text-gray-500">
                            Hold Ctrl/Cmd to select multiple students.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Title */}
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Title
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="e.g., Class moved to 10:00 AM"
                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    {/* Message */}
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Message
                      </label>
                      <textarea
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        rows={4}
                        placeholder="Write your message here..."
                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      />
                    </div>

                    {/* Link */}
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Link (optional)
                      </label>
                      <div className="relative">
                        <LinkIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={link}
                          onChange={(event) => setLink(event.target.value)}
                          placeholder="/courses/ENG-A1/assessments"
                          className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    {/* Options */}
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sendToMe}
                          onChange={(event) => setSendToMe(event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Send a copy to me
                      </label>

                      {recipientCount > 0 && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {recipientCount} recipient(s)
                        </span>
                      )}
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={sending || recipientCount === 0}
                      className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                    >
                      {sending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : sendMode === "scheduled" ? (
                        <>
                          <Clock className="h-4 w-4" />
                          Schedule Notification
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Send Notification
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Columna derecha - Summary and Student List */}
            <div className="space-y-4">
              {/* Delivery Summary */}
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Bell className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Delivery Summary</h3>
                    <p className="text-xs text-gray-600">Current selection</p>
                  </div>
                </div>

                <div className="text-center mb-4">
                  <span className="text-4xl font-bold text-blue-600">{recipientCount}</span>
                  <p className="text-sm text-gray-600 mt-1">recipient(s)</p>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="text-gray-600">Course:</span>
                    <span className="font-medium text-gray-900">{selectedCourse?.name || "-"}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="text-gray-600">Type:</span>
                    <span className={`font-medium text-${getTypeColor(type)}-600 capitalize`}>
                      {type}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="text-gray-600">Mode:</span>
                    <span className="font-medium text-gray-900">
                      {sendMode === "scheduled" ? "Scheduled" : "Send now"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Student List */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Users className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Enrolled Students</h3>
                    <p className="text-xs text-gray-500">{students.length} total</p>
                  </div>
                </div>
 
                {loadingStudents ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {students.map((student) => (
                      <div key={student.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          {student.avatarUrl ? (
                            <img
                              src={student.avatarUrl}
                              alt={student.name}
                              className="h-4 w-4 rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-4 w-4 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-xs font-medium text-blue-700">
                                {student.avatarEmoji || student.name.charAt(0)}
                              </span>
                            </div>
                          )}
                          <span className="text-sm text-gray-700 truncate max-w-[120px]">
                            {student.name}
                          </span>
                        </div>
                      
                      </div>
                    ))}
                    {students.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No students enrolled yet
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "history" && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                  <History className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Notification History
                  </h2>
                  <p className="text-sm text-gray-600">
                    Track all sent and scheduled notifications
                  </p>
                </div>
              </div>
              <Sparkles className="h-4 w-4 text-blue-400 hidden md:block" />
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  placeholder="Search history..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={historyTypeFilter}
                  onChange={(event) =>
                    setHistoryTypeFilter(
                      event.target.value as "all" | NotificationType,
                    )
                  }
                  className="px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All types</option>
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                </select>
                <select
                  value={historyStatusFilter}
                  onChange={(event) =>
                    setHistoryStatusFilter(
                      event.target.value as "all" | HistoryStatus,
                    )
                  }
                  className="px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All status</option>
                  <option value="sent">Sent</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select
                  value={historyCourseFilter}
                  onChange={(event) =>
                    setHistoryCourseFilter(event.target.value)
                  }
                  className="px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All courses</option>
                  {historyCourseOptions.map(([courseId, courseName]) => (
                    <option key={courseId} value={courseId}>
                      {courseName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={exportHistoryCsv}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Course</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Recipients</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatDateTime(item.sentAt || item.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${
                            item.status === "sent"
                              ? "bg-blue-100 text-blue-700"
                              : item.status === "scheduled"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {item.status === "sent" && <CheckCircle className="h-3 w-3" />}
                          {item.status === "scheduled" && <Clock className="h-3 w-3" />}
                          {item.status === "cancelled" && <X className="h-3 w-3" />}
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                          {item.courseCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 capitalize text-gray-700">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium bg-${getTypeColor(item.type)}-100 text-${getTypeColor(item.type)}-700`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900 max-w-[200px] truncate">
                        {item.title}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-gray-500" />
                          {item.recipientCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {item.status === "scheduled" && (
                            <>
                              <button
                                type="button"
                                onClick={() => sendScheduledNow(item.id)}
                                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                                title="Send now"
                              >
                                <PlayCircle className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => cancelScheduled(item.id)}
                                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                                title="Cancel schedule"
                              >
                                <PauseCircle className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteHistoryItem(item.id)}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete history item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredHistory.length === 0 && (
                <div className="text-center py-8">
                  <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
                    <History className="h-4 w-4 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500">No notification history matches the filters</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "scheduled" && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Scheduled Notifications
                  </h2>
                  <p className="text-sm text-gray-600">
                    {scheduledItems.length} notification(s) waiting to be sent
                  </p>
                </div>
              </div>
              <Sparkles className="h-4 w-4 text-blue-400 hidden md:block" />
            </div>

            {scheduledItems.length === 0 ? (
              <div className="text-center py-8">
                <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                  <Clock className="h-8 w-8 text-blue-400" />
                </div>
                <p className="text-gray-900 font-semibold text-lg">No scheduled notifications</p>
                <p className="text-sm text-gray-600 mt-2">
                  Schedule a notification from the Compose tab
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {scheduledItems
                  .sort((a, b) => (a.scheduledFor || 0) - (b.scheduledFor || 0))
                  .map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white transition-all"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${getTypeColor(item.type)}-100 text-${getTypeColor(item.type)}-700`}>
                              {item.type}
                            </span>
                            <span className="text-xs text-gray-500">
                              {item.courseCode}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-gray-900 mb-1">
                            {item.title}
                          </p>
                          <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                            {item.message}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {item.recipientCount} recipients
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Scheduled for {formatDateTime(item.scheduledFor || 0)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 md:self-center">
                          <button
                            onClick={() => sendScheduledNow(item.id)}
                            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1"
                          >
                            <PlayCircle className="h-3 w-3" />
                            Send now
                          </button>
                          <button
                            onClick={() => cancelScheduled(item.id)}
                            className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-1"
                          >
                            <X className="h-3 w-3" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {tab === "automations" && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Settings2 className="h-4 w-4 text-gray-700" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Automation Rules
                  </h2>
                  <p className="text-sm text-gray-600">
                    Configure automatic notifications for course events
                  </p>
                </div>
              </div>
              <Sparkles className="h-4 w-4 text-blue-400 hidden md:block" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {(
                [
                  ["assessmentCreated", "Assessment created", "When new assessments are created"],
                  ["assessmentUpdated", "Assessment updated", "When assessments are modified"],
                  ["assessmentCancelled", "Assessment cancelled", "When assessments are cancelled"],
                  ["newMaterial", "New material uploaded", "When files or resources are added"],
                  ["gradePublished", "Grade published", "When grades are released"],
                  ["deadlineReminder", "Deadline reminder", "Automatic reminders before deadlines"],
                ] as Array<[AutomationToggleKey, string, string]>
              ).map(([key, label, description]) => (
                <div
                  key={key}
                  className="p-4 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-gray-900 mb-1">
                        {label}
                      </h4>
                      <p className="text-xs text-gray-600 mb-2">
                        {description}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={automations[key]}
                        onChange={(event) =>
                          setAutomations((prev) => ({
                            ...prev,
                            [key]: event.target.checked,
                          }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
              <label className="mb-2 block text-sm font-medium text-gray-700 flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-700" />
                Deadline reminder window
              </label>
              <select
                value={automations.deadlineReminderHours}
                onChange={(event) =>
                  setAutomations((prev) => ({
                    ...prev,
                    deadlineReminderHours: Number(event.target.value),
                  }))
                }
                className="w-full md:w-64 rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={1}>1 hour before</option>
                <option value={6}>6 hours before</option>
                <option value={12}>12 hours before</option>
                <option value={24}>24 hours before</option>
                <option value={48}>48 hours before</option>
                <option value={72}>72 hours before</option>
              </select>
              <p className="text-xs text-gray-500 mt-2">
                Students will receive reminders before assessment deadlines
              </p>
            </div>
          </div>
        )}

        {tab === "preferences" && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Filter className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Notification Preferences
                  </h2>
                  <p className="text-sm text-gray-600">
                    Control how and when you receive notifications
                  </p>
                </div>
              </div>
              <Sparkles className="h-4 w-4 text-blue-400 hidden md:block" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Quiet Hours */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Moon className="h-4 w-4 text-blue-500" />
                    Quiet Hours
                  </h3>
                  <p className="text-xs text-gray-600 mt-1">Pause notifications during selected hours</p>
                </div>
                
                <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <BellOff className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">Enable quiet hours</span>
                  </div>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={hubPreferences.quietHoursEnabled}
                      onChange={(event) =>
                        setHubPreferences((prev) => ({
                          ...prev,
                          quietHoursEnabled: event.target.checked,
                        }))
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                  </div>
                </label>

                {hubPreferences.quietHoursEnabled && (
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-500 mb-2">Quiet hours range</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={hubPreferences.quietHourStart}
                        onChange={(event) =>
                          setHubPreferences((prev) => ({
                            ...prev,
                            quietHourStart: event.target.value,
                          }))
                        }
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <span className="text-gray-500">to</span>
                      <input
                        type="time"
                        value={hubPreferences.quietHourEnd}
                        onChange={(event) =>
                          setHubPreferences((prev) => ({
                            ...prev,
                            quietHourEnd: event.target.value,
                          }))
                        }
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Mute Types */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <VolumeX className="h-4 w-4 text-blue-500" />
                    Mute by Type
                  </h3>
                  <p className="text-xs text-gray-600 mt-1">Control which notification categories are silent</p>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <Info className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium text-gray-700">Mute info notifications</span>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={hubPreferences.muteInfo}
                        onChange={(event) =>
                          setHubPreferences((prev) => ({
                            ...prev,
                            muteInfo: event.target.checked,
                          }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </div>
                  </label>

                  <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium text-gray-700">Mute success notifications</span>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={hubPreferences.muteSuccess}
                        onChange={(event) =>
                          setHubPreferences((prev) => ({
                            ...prev,
                            muteSuccess: event.target.checked,
                          }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </div>
                  </label>

                  <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium text-gray-700">Mute warning notifications</span>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={hubPreferences.muteWarning}
                        onChange={(event) =>
                          setHubPreferences((prev) => ({
                            ...prev,
                            muteWarning: event.target.checked,
                          }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                Preferences are saved automatically and synced across devices
              </p>
            </div>
          </div>
        )}

        {/* Botón flotante para móvil */}
        <div className="fixed bottom-4 right-4 md:hidden">
          <button
            type="button"
            onClick={() => {
              if (tab === "compose") {
                const form = document.querySelector('form');
                if (form) form.requestSubmit();
              } else {
                setTab("compose");
              }
            }}
            className="h-14 w-14 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center hover:shadow-xl transition-all"
          >
            {tab === "compose" ? (
              sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
