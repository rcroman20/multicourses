import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getAccessibleCoursesForUser } from "@/lib/courseAccess";
import { assessmentService } from "@/lib/services/assessmentService";
import { notificationService } from "@/lib/services/notificationService";
import { isNotificationAutomationEnabled } from "@/lib/services/notificationAutomation";
import { gradeSheetService, GradeSheet } from "@/lib/services/gradeSheetService";
import { format, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  Plus,
  Calendar, 
  FileText,
  Edit,
  Trash2,
  Users,
  Search,
  Clock, 
  AlertCircle,
  FileCheck, 
  ClipboardCheck,
  Percent,
  TrendingUp,
  Eye,
  X,
  BookOpen,
  ArrowLeft,
  Filter,
  Loader2,
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Megaphone,
  Upload,
  MessageSquare,
  Zap,
  ChevronDown,
  Book,
  School,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  Code2,
  Braces,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TEACHER_ONBOARDING_COURSE_CODE } from "@/lib/services/teacherOnboardingService";

type ForumPresetKey = "basic" | "intermediate" | "advanced" | "custom";

const FORUM_PRESETS: Record<Exclude<ForumPresetKey, "custom">, {
  mainResponseMinWords: number;
  peerRepliesRequired: number;
  peerReplyCommentsRequired: number;
  mainResponsesRequired: number;
}> = {
  basic: {
    mainResponseMinWords: 80,
    peerRepliesRequired: 2,
    peerReplyCommentsRequired: 1,
    mainResponsesRequired: 1,
  },
  intermediate: {
    mainResponseMinWords: 120,
    peerRepliesRequired: 3,
    peerReplyCommentsRequired: 1,
    mainResponsesRequired: 1,
  },
  advanced: {
    mainResponseMinWords: 180,
    peerRepliesRequired: 4,
    peerReplyCommentsRequired: 2,
    mainResponsesRequired: 1,
  },
};

const modalInputClass =
  "w-full rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100";
const modalInputDisabledClass = `${modalInputClass} disabled:bg-slate-100 disabled:text-slate-500`;
const modalLabelClass = "mb-2 block text-sm font-semibold text-slate-700";
const modalSecondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";
const modalPrimaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 hover:shadow-md";

function detectForumPreset(requirements?: {
  mainResponseMinWords?: number;
  peerRepliesRequired?: number;
  peerReplyCommentsRequired?: number;
  mainResponsesRequired?: number;
}): ForumPresetKey {
  if (!requirements) return "basic";

  const values = {
    mainResponseMinWords: Number(requirements.mainResponseMinWords || 0),
    peerRepliesRequired: Number(requirements.peerRepliesRequired || 0),
    peerReplyCommentsRequired: Number(requirements.peerReplyCommentsRequired || 0),
    mainResponsesRequired: Number(requirements.mainResponsesRequired || 0),
  };

  for (const [key, preset] of Object.entries(FORUM_PRESETS)) {
    if (
      values.mainResponseMinWords === preset.mainResponseMinWords &&
      values.peerRepliesRequired === preset.peerRepliesRequired &&
      values.peerReplyCommentsRequired === preset.peerReplyCommentsRequired &&
      values.mainResponsesRequired === preset.mainResponsesRequired
    ) {
      return key as ForumPresetKey;
    }
  }

  return "custom";
}

function getPlainTextFromHtml(content: string): string {
  if (!content?.trim()) return "";

  const normalizeText = (value: string) =>
    value
      .replace(/<!DOCTYPE[^>]*>/gi, " ")
      .replace(/<\/?(html|head|body|meta|title|style|script|link)[^>]*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");
    const parsedText = doc.body.textContent || "";
    return normalizeText(parsedText);
  } catch {
    return normalizeText(content);
  }
}

function parseForumRequirementNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function resolveForumRequirementsFromAssessment(assessment: any) {
  const assessmentType = String(assessment?.assessmentType || "assessment");
  const activityType = String(assessment?.type || "");
  if (!(assessmentType === "assessment" && activityType === "forum")) {
    return null;
  }

  const raw =
    assessment?.forumRequirements && typeof assessment.forumRequirements === "object"
      ? assessment.forumRequirements
      : {};

  const pickNumber = (candidates: unknown[], fallback: number) => {
    for (const candidate of candidates) {
      const parsed = parseForumRequirementNumber(candidate);
      if (parsed !== null) return parsed;
    }
    return fallback;
  };

  return {
    preset: String(raw.preset || assessment?.forumPreset || "custom") as ForumPresetKey,
    mainResponseMinWords: Math.max(
      0,
      pickNumber(
        [raw.mainResponseMinWords, assessment?.forumMainResponseMinWords],
        FORUM_PRESETS.basic.mainResponseMinWords,
      ),
    ),
    peerRepliesRequired: Math.max(
      0,
      pickNumber(
        [raw.peerRepliesRequired, assessment?.forumPeerRepliesRequired],
        FORUM_PRESETS.basic.peerRepliesRequired,
      ),
    ),
    peerReplyCommentsRequired: Math.max(
      0,
      pickNumber(
        [raw.peerReplyCommentsRequired, assessment?.forumPeerReplyCommentsRequired],
        FORUM_PRESETS.basic.peerReplyCommentsRequired,
      ),
    ),
    mainResponsesRequired: Math.max(
      1,
      pickNumber(
        [raw.mainResponsesRequired, assessment?.forumMainResponsesRequired],
        FORUM_PRESETS.basic.mainResponsesRequired,
      ),
    ),
  };
}

function isMandatoryTeacherCourse(course: any): boolean {
  const courseRecord = course as Record<string, unknown> | null;
  const normalizedCode = String(course?.code || "")
    .trim()
    .toUpperCase();

  return (
    normalizedCode === TEACHER_ONBOARDING_COURSE_CODE ||
    Boolean(
      courseRecord?.isMandatory ||
        courseRecord?.mandatory ||
        courseRecord?.required ||
        courseRecord?.isRequired ||
        courseRecord?.isMandatoryForTeachers ||
        courseRecord?.mandatoryForTeachers ||
        courseRecord?.mandatoryTeacherCourse ||
        courseRecord?.requiredForTeachers ||
        courseRecord?.requiredForDocentes ||
        courseRecord?.obligatorio ||
        courseRecord?.obligatorioDocentes ||
        courseRecord?.obligatorioParaDocentes ||
        courseRecord?.onboarding ||
        courseRecord?.isOnboarding,
    )
  );
}

export default function AssessmentsPage() {
  const { courseCode } = useParams<{ courseCode: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { courses, selectedCourseId, setSelectedCourseId } = useAcademic();
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<any>(null);
  const [showCompletedAssessments, setShowCompletedAssessments] = useState(false);
  const latestAssessmentsRequestRef = useRef(0);
  const isTeacher = user?.role === "docente";
  const isAdmin = user?.role === "admin";
  const isTeacherView = isTeacher || isAdmin;

  const getEnrolledStudentIds = useCallback((course: any): string[] => {
    if (!course?.enrolledStudents || !Array.isArray(course.enrolledStudents)) return [];

    return course.enrolledStudents
      .map((entry: any) => (typeof entry === "string" ? entry : entry?.id))
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
  }, []);

  const notifyCourseStudents = useCallback(
    async (
      course: any,
      automationKey: "assessmentCreated" | "assessmentUpdated" | "assessmentCancelled" | "deadlineReminder",
      payload: { title: string; message: string; type?: "info" | "success" | "warning"; link?: string },
    ) => {
      if (!isNotificationAutomationEnabled(user?.id, automationKey)) return;

      const studentIds = getEnrolledStudentIds(course);
      if (studentIds.length === 0) return;

      await Promise.all(
        studentIds.map((studentId) =>
          notificationService.createNotification(studentId, {
            title: payload.title,
            message: payload.message,
            type: payload.type || "info",
            link: payload.link,
          }),
        ),
      );
    },
    [getEnrolledStudentIds, user?.id],
  );
  
  const availableCourses = useMemo(() => {
    if (!user) return [];
    return getAccessibleCoursesForUser(courses, user, {
      includeAllForAdmin: isAdmin,
      includeEnrolledForTeacher: isTeacher,
    });
  }, [courses, isAdmin, isTeacher, user]);

  const selectedCourse = useMemo(
    () => availableCourses.find((course) => course.id === selectedCourseId) || null,
    [availableCourses, selectedCourseId],
  );
  const selectedCourseRecord = selectedCourse as (Record<string, unknown> & { teacherId?: string }) | null;
  const isOnboardingCourse =
    String(selectedCourse?.code || "")
      .trim()
      .toUpperCase() === TEACHER_ONBOARDING_COURSE_CODE;
  const isMandatoryCourse = isMandatoryTeacherCourse(selectedCourse);
  const canManageAssessments =
    isAdmin || (isTeacher && selectedCourseRecord?.teacherId === user?.id && !isMandatoryCourse);

  useEffect(() => {
    if (availableCourses.length === 0) {
      if (selectedCourseId) setSelectedCourseId("");
      return;
    }

    if (selectedCourse) {
      if (courseCode !== selectedCourse.code) {
        navigate(`/courses/${selectedCourse.code}/assessments`, { replace: true });
      }
      return;
    }

    if (courseCode) {
      const courseFromUrl = availableCourses.find((course) => course.code === courseCode);

      if (courseFromUrl) {
        if (courseFromUrl.id !== selectedCourseId) {
          setSelectedCourseId(courseFromUrl.id);
        }
        return;
      }
    }

    const firstCourse = availableCourses[0];
    setSelectedCourseId(firstCourse.id);
    if (courseCode !== firstCourse.code) {
      navigate(`/courses/${firstCourse.code}/assessments`, { replace: true });
    }
  }, [availableCourses, courseCode, navigate, selectedCourse, selectedCourseId, setSelectedCourseId]);

  const loadAssessments = useCallback(async (courseIdOverride?: string) => {
    const targetCourseId = String(courseIdOverride || selectedCourseId || "").trim();
    if (!targetCourseId) {
      setAssessments([]);
      return;
    }

    const requestId = ++latestAssessmentsRequestRef.current;
    const targetCourse = availableCourses.find((course) => course.id === targetCourseId) || null;

    setLoading(true);
    try {
      const data = await assessmentService.getCourseAssessments(targetCourseId, {
        courseCode: targetCourse?.code,
        courseName: targetCourse?.name,
      });

      if (latestAssessmentsRequestRef.current !== requestId) return;

      setAssessments(
        data.map((assessment: any) => ({
          ...assessment,
          forumRequirements: resolveForumRequirementsFromAssessment(assessment),
        })),
      );
    } catch (error) {
      if (latestAssessmentsRequestRef.current !== requestId) return;
      setAssessments([]);
    } finally {
      if (latestAssessmentsRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [availableCourses, selectedCourseId]);

  useEffect(() => {
    latestAssessmentsRequestRef.current += 1;
    if (!selectedCourseId) {
      setAssessments([]);
      setLoading(false);
      return;
    }

    setAssessments([]);
    void loadAssessments(selectedCourseId);
  }, [loadAssessments, selectedCourseId]);

  const handleCourseChange = (course: any) => {
    latestAssessmentsRequestRef.current += 1;
    setAssessments([]);
    setLoading(true);
    setShowCompletedAssessments(false);
    setSelectedCourseId(course.id);
    navigate(`/courses/${course.code}/assessments`);
    setSearchTerm('');
    setFilterType('all');
  };

const categorizedAssessments = useMemo(() => {
  if (!selectedCourseId) return { today: [], upcoming: [], past: [], noDueDate: [] };
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const upcoming = [];
  const todayAssessments = [];
  const past = []; 
  const noDueDate = [];

  assessments.forEach(assessment => {
    if (!assessment.dueDate) {
      noDueDate.push(assessment);
      return;
    }

    const [year, month, day] = assessment.dueDate.split('-').map(Number);
    const dueDateLocal = new Date(year, month - 1, day);
    
    const diffTime = dueDateLocal.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      todayAssessments.push(assessment);
    } else if (diffDays > 0) {
      if (diffDays <= 30) {
        upcoming.push(assessment);
      }
    } else {
      past.push(assessment);
    }
  });

  const sortByDate = (a: any, b: any) => {
    if (!a.dueDate || !b.dueDate) return 0;
    const dateA = new Date(a.dueDate);
    const dateB = new Date(b.dueDate);
    return dateA.getTime() - dateB.getTime();
  };

  return {
    today: todayAssessments.sort(sortByDate),
    upcoming: upcoming.sort(sortByDate),
    past: past.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()),
    noDueDate: noDueDate.sort((a, b) => a.name.localeCompare(b.name))
  };
}, [assessments, selectedCourseId]);

  const filterAssessments = useCallback((assessmentsList: any[]) => {
    return assessmentsList.filter((assessment) => {
      const plainDescription = getPlainTextFromHtml(String(assessment.description || ""));
      const matchesSearch = assessment.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        plainDescription.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === "all" || assessment.type === filterType || assessment.assessmentType === filterType;
      return matchesSearch && matchesType;
    });
  }, [searchTerm, filterType]);

  const filteredToday = useMemo(() => filterAssessments(categorizedAssessments.today), 
    [categorizedAssessments.today, filterAssessments]);
  const filteredUpcoming = useMemo(() => filterAssessments(categorizedAssessments.upcoming), 
    [categorizedAssessments.upcoming, filterAssessments]);
  const filteredPast = useMemo(() => filterAssessments(categorizedAssessments.past), 
    [categorizedAssessments.past, filterAssessments]);
  const filteredNoDueDate = useMemo(() => filterAssessments(categorizedAssessments.noDueDate), 
    [categorizedAssessments.noDueDate, filterAssessments]);

  const stats = useMemo(() => {
    const todayCount = categorizedAssessments.today.length;
    const upcomingCount = categorizedAssessments.upcoming.length;
    const pastCount = categorizedAssessments.past.length;
    const noDueDateCount = categorizedAssessments.noDueDate.length;
    const totalPercentage = assessments.reduce((sum, a) => sum + (a.percentage || 0), 0);
    
    return { todayCount, upcomingCount, pastCount, noDueDateCount, totalPercentage };
  }, [categorizedAssessments, assessments]);

  const buildForumRequirements = (data: any) => {
    if (!(data.assessmentType === "assessment" && data.type === "forum")) return null;

    const toNonNegativeInt = (value: unknown, fallback: number) => {
      const parsed = parseInt(String(value ?? ""), 10);
      if (Number.isNaN(parsed)) return fallback;
      return Math.max(0, parsed);
    };

    return {
      preset: (data.forumPreset || "custom") as ForumPresetKey,
      mainResponseMinWords: toNonNegativeInt(data.forumMainResponseMinWords, 80),
      peerRepliesRequired: toNonNegativeInt(data.forumPeerRepliesRequired, 2),
      peerReplyCommentsRequired: toNonNegativeInt(data.forumPeerReplyCommentsRequired, 1),
      mainResponsesRequired: Math.max(1, toNonNegativeInt(data.forumMainResponsesRequired, 1)),
    };
  };

  const resolveGradeSheetActivity = (sheet: GradeSheet | null, assessmentData: any) => {
    if (!sheet) return null;
    const activities = Array.isArray(sheet.activities) ? sheet.activities : [];

    return (
      activities.find(
        (activity: any) =>
          activity?.assessmentId === assessmentData?.id ||
          activity?.id === assessmentData?.id,
      ) ||
      activities.find((activity: any) => activity?.name === assessmentData?.name) ||
      null
    );
  };

  const syncDirectGradesToLinkedGradeSheet = async (params: {
    assessmentId: string;
    assessmentName: string;
    assessmentDescription?: string;
    assessmentType: string;
    percentage: number;
    maxPoints: number;
    passingScore: number;
    gradeSheetId: string;
  }): Promise<number> => {
    const linkedSheet = await gradeSheetService.getById(params.gradeSheetId);
    if (!linkedSheet) {
      throw new Error("Linked grade sheet not found");
    }

    const existingActivity = resolveGradeSheetActivity(linkedSheet, {
      id: params.assessmentId,
      name: params.assessmentName,
    }) as any;

    let targetActivityId = String(existingActivity?.id || "").trim();
    const currentActivities = Array.isArray(linkedSheet.activities) ? linkedSheet.activities : [];

    if (!targetActivityId) {
      targetActivityId = `activity_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const newActivity = {
        id: targetActivityId,
        name: params.assessmentName,
        description: params.assessmentDescription || "",
        maxScore: Number.isFinite(params.maxPoints) && params.maxPoints > 0 ? params.maxPoints : 5,
        type: params.assessmentType || "quiz",
        percentage: Number.isFinite(params.percentage) ? params.percentage : 0,
        weight: Number.isFinite(params.percentage) ? params.percentage : 0,
        passingScore: Number.isFinite(params.passingScore) ? params.passingScore : 0,
        status: "graded",
        createdAt: new Date(),
        assessmentId: params.assessmentId,
      };

      await gradeSheetService.update(params.gradeSheetId, {
        activities: [...currentActivities, newActivity as any],
      });
    } else if (String(existingActivity?.assessmentId || "").trim() !== params.assessmentId) {
      const activitiesWithAssessmentId = currentActivities.map((activity: any) =>
        activity?.id === targetActivityId
          ? {
              ...activity,
              assessmentId: params.assessmentId,
            }
          : activity,
      );

      await gradeSheetService.update(params.gradeSheetId, {
        activities: activitiesWithAssessmentId as GradeSheet["activities"],
      });
    }

    const directGrades = await assessmentService.getAssessmentGrades(params.assessmentId);
    let transferredCount = 0;

    for (const grade of directGrades) {
      const studentId = String((grade as any)?.studentId || "").trim();
      const numericValue = Number((grade as any)?.value);
      if (!studentId || !Number.isFinite(numericValue)) continue;

      const currentStudentEntry = (linkedSheet.students || []).find(
        (student: any) => String(student?.studentId || "").trim() === studentId,
      );
      const currentValueRaw: unknown = currentStudentEntry?.grades?.[targetActivityId]?.value;
      const currentValue =
        typeof currentValueRaw === "string" ? currentValueRaw.trim() : currentValueRaw;
      const alreadyHasGrade =
        typeof currentValue === "number"
          ? Number.isFinite(currentValue)
          : typeof currentValue === "string"
            ? currentValue.length > 0 && Number.isFinite(Number(currentValue))
            : false;

      // Preserve grades already captured in the sheet; backfill only missing records.
      if (alreadyHasGrade) continue;

      const comment = String(
        (grade as any)?.comment || (grade as any)?.feedback || (grade as any)?.comments || "",
      );

      await gradeSheetService.updateStudentGrade(
        params.gradeSheetId,
        studentId,
        targetActivityId,
        numericValue,
        comment,
      );
      transferredCount += 1;
    }

    return transferredCount;
  };

  const handleCreateAssessment = async (data: any) => {
    try {
      if (!user) return;

      const rawTargetCourseIds: unknown[] = Array.isArray(data.targetCourseIds)
        ? data.targetCourseIds
        : [data.courseId || selectedCourseId];
      const targetCourseIds = Array.from(
        new Set<string>(
          rawTargetCourseIds
            .map((id) => String(id || ""))
            .filter((id) => id.length > 0),
        ),
      );

      if (targetCourseIds.length === 0) {
        alert("Please select a course");
        return;
      }

      const dueDateValue = data.dueDate;
      if (dueDateValue) {
        const date = new Date(dueDateValue);
        if (isNaN(date.getTime())) {
          alert("Invalid date");
          return;
        }
      }

      let startDateValue = null;
      if (data.assessmentType === "delivery" && data.startDate) {
        const date = new Date(data.startDate);
        if (isNaN(date.getTime())) {
          alert("Invalid start date");
          return;
        }
        startDateValue = data.startDate;
      }

      let forumCloseAtValue = null;
      if (data.assessmentType === "assessment" && data.type === "forum" && data.forumCloseAt) {
        const date = new Date(data.forumCloseAt);
        if (isNaN(date.getTime())) {
          alert("Invalid forum closing date/time");
          return;
        }
        forumCloseAtValue = date.toISOString();
      }

      const requiresGradeSheet = data.assessmentType !== "announcement";
      const shouldUseSingleGradeSheet = targetCourseIds.length === 1;
      const shouldMapGradeSheetsByName =
        requiresGradeSheet &&
        !shouldUseSingleGradeSheet &&
        Boolean(data.mapGradeSheetByTitle) &&
        Boolean(data.gradeSheetId);

      const normalized = (value: string) => value.trim().toLowerCase();
      const mappedGradeSheetByCourseId: Record<string, string | null> = {};

      if (shouldMapGradeSheetsByName) {
        const sourceSheet = await gradeSheetService.getById(String(data.gradeSheetId));
        const sourceTitle = sourceSheet?.title ? normalized(sourceSheet.title) : "";

        if (sourceTitle) {
          await Promise.all(
            targetCourseIds.map(async (targetCourseId) => {
              const sheets = await gradeSheetService.getByCourse(targetCourseId);
              const match = sheets.find((sheet) => normalized(String(sheet.title || "")) === sourceTitle);
              mappedGradeSheetByCourseId[targetCourseId] = match?.id || null;
            }),
          );
        }
      }

      const baseAssessmentData: any = {
        name: data.name,
        description: data.description,
        type: data.type,
        percentage: 0,
        maxPoints: parseFloat(data.maxPoints || 0),
        passingScore: parseFloat(data.passingScore || 0),
        dueDate: dueDateValue || null,
        status: "published",
        createdBy: user.id,
        gradeSheetId: null,
        assessmentType: data.assessmentType,
        deliveryType: data.deliveryType || 'text',
        startDate: startDateValue,
        forumCloseAt: forumCloseAtValue,
        forumRequirements: buildForumRequirements(data),
      };

      if (data.assessmentType === 'announcement') {
        baseAssessmentData.percentage = 0;
        baseAssessmentData.maxPoints = 0;
        baseAssessmentData.passingScore = 0;
        baseAssessmentData.gradeSheetId = null;
      }

      await Promise.all(
        targetCourseIds.map((targetCourseId) => {
          const resolvedGradeSheetId = requiresGradeSheet
            ? shouldUseSingleGradeSheet
              ? data.gradeSheetId || null
              : shouldMapGradeSheetsByName
                ? mappedGradeSheetByCourseId[targetCourseId] || null
                : null
            : null;

          return (
          assessmentService.createAssessment({
            ...baseAssessmentData,
            courseId: targetCourseId,
            gradeSheetId: resolvedGradeSheetId,
          })
          );
        }),
      );

      try {
        await Promise.all(
          targetCourseIds.map(async (targetCourseId) => {
            const course = availableCourses.find((item) => item.id === targetCourseId);
            await notifyCourseStudents(course, "assessmentCreated", {
              title: "New activity published",
              message: `A new activity "${data.name}" was published in ${course?.name || "your course"}.`,
              type: "success",
              link: course ? `/courses/${course.code}/assessments` : "/courses",
            });

            if (data.dueDate) {
              await notifyCourseStudents(course, "deadlineReminder", {
                title: "Deadline reminder",
                message: `Remember to complete "${data.name}" before ${new Date(data.dueDate).toLocaleDateString("en-GB")}.`,
                type: "warning",
                link: course ? `/courses/${course.code}/assessments` : "/courses",
              });
            }
          }),
        );
      } catch {
      }

      setShowCreateModal(false);
      if (targetCourseIds.length > 1 && shouldMapGradeSheetsByName) {
        const linkedCount = targetCourseIds.filter((courseId) => Boolean(mappedGradeSheetByCourseId[courseId])).length;
        const missingCount = targetCourseIds.length - linkedCount;
        alert(
          missingCount > 0
            ? `Activity assigned to ${targetCourseIds.length} courses. Grade sheet linked in ${linkedCount}; ${missingCount} courses had no matching grade sheet title.`
            : `Activity assigned to ${targetCourseIds.length} courses with grade sheet mapping by title.`,
        );
      } else {
        alert(
          targetCourseIds.length > 1
            ? `Activity assigned to ${targetCourseIds.length} courses.`
            : "Activity created successfully.",
        );
      }
      loadAssessments();
    } catch (error) {
      alert("Error creating assessment");
    }
  };

  const handleUpdateAssessment = async (data: any) => {
    try {
      if (!editingAssessment) return;

      const dueDateValue = data.dueDate;
      if (dueDateValue) {
        const date = new Date(dueDateValue);
        if (isNaN(date.getTime())) {
          alert("Invalid date");
          return;
        }
      }

      let startDateValue = null;
      if (data.assessmentType === "delivery" && data.startDate) {
        const date = new Date(data.startDate);
        if (isNaN(date.getTime())) {
          alert("Invalid start date");
          return;
        }
        startDateValue = data.startDate;
      }

      let forumCloseAtValue = null;
      if (data.assessmentType === "assessment" && data.type === "forum" && data.forumCloseAt) {
        const date = new Date(data.forumCloseAt);
        if (isNaN(date.getTime())) {
          alert("Invalid forum closing date/time");
          return;
        }
        forumCloseAtValue = date.toISOString();
      }

      const normalizedGradeSheetId =
        data.assessmentType !== "announcement" && String(data.gradeSheetId || "").trim().length > 0
          ? String(data.gradeSheetId).trim()
          : null;
      const previousGradeSheetId = String(editingAssessment.gradeSheetId || "").trim() || null;

      const updateData: any = {
        name: data.name,
        description: data.description,
        type: data.type,
        percentage: parseFloat(data.percentage || 0),
        maxPoints: parseFloat(data.maxPoints || 0),
        passingScore: parseFloat(data.passingScore || 0),
        dueDate: dueDateValue || null,
        gradeSheetId: normalizedGradeSheetId,
        assessmentType: data.assessmentType,
        deliveryType: data.deliveryType || 'text',
        startDate: startDateValue,
        forumCloseAt: forumCloseAtValue,
        forumRequirements: buildForumRequirements(data),
      };

      if (data.assessmentType === "announcement") {
        updateData.percentage = 0;
        updateData.maxPoints = 0;
        updateData.passingScore = 0;
        updateData.gradeSheetId = null;
      }

      await assessmentService.updateAssessment(editingAssessment.id, updateData);

      const shouldSyncDirectGrades = Boolean(normalizedGradeSheetId);

      if (shouldSyncDirectGrades && normalizedGradeSheetId) {
        try {
          const syncedCount = await syncDirectGradesToLinkedGradeSheet({
            assessmentId: editingAssessment.id,
            assessmentName: updateData.name,
            assessmentDescription: updateData.description,
            assessmentType: updateData.type,
            percentage: Number(updateData.percentage || 0),
            maxPoints: Number(updateData.maxPoints || 0),
            passingScore: Number(updateData.passingScore || 0),
            gradeSheetId: normalizedGradeSheetId,
          });

          if (syncedCount > 0) {
            alert(`Assessment updated. ${syncedCount} existing grades were synced to the linked grade sheet.`);
          } else if (!previousGradeSheetId || previousGradeSheetId !== normalizedGradeSheetId) {
            alert("Assessment updated. No existing direct grades were found to sync.");
          }
        } catch (syncError) {
          console.error("Error syncing direct grades to linked grade sheet:", syncError);
          alert("Assessment updated, but existing grades could not be synced to the linked grade sheet.");
        }
      }

      try {
        const course = availableCourses.find((item) => item.id === editingAssessment.courseId);
        await notifyCourseStudents(course, "assessmentUpdated", {
          title: "Activity updated",
          message: `The activity "${data.name}" was updated in ${course?.name || "your course"}.`,
          link: course ? `/courses/${course.code}/assessments` : "/courses",
        });

        if (data.dueDate) {
          await notifyCourseStudents(course, "deadlineReminder", {
            title: "Deadline updated",
            message: `"${data.name}" now has deadline ${new Date(data.dueDate).toLocaleDateString("en-GB")}.`,
            type: "warning",
            link: course ? `/courses/${course.code}/assessments` : "/courses",
          });
        }
      } catch {
      }

      setShowEditModal(false);
      setEditingAssessment(null);
      loadAssessments();
    } catch (error) {
      alert("Error updating assessment");
    }
  };

  const handleDeleteAssessment = async () => {
    if (!selectedAssessment) return;

    try {
      if (selectedAssessment.gradeSheetId) {
        try {
          const linkedSheet = await gradeSheetService.getById(selectedAssessment.gradeSheetId);

          if (linkedSheet) {
            let linkedActivity = linkedSheet.activities?.find(
              (activity: any) => activity?.assessmentId === selectedAssessment.id,
            );

            if (!linkedActivity) {
              linkedActivity = linkedSheet.activities?.find(
                (activity: any) => activity?.id === selectedAssessment.id,
              );
            }

            if (!linkedActivity) {
              const nameMatches = (linkedSheet.activities || []).filter(
                (activity: any) => activity?.name === selectedAssessment.name,
              );

              if (nameMatches.length === 1) {
                linkedActivity = nameMatches[0];
              }
            }

            if (linkedActivity?.id) {
              const updatedActivities = (linkedSheet.activities || []).filter(
                (activity: any) => activity?.id !== linkedActivity.id,
              );

              const updatedStudents = (linkedSheet.students || []).map((student: any) => {
                const existingGrades = student?.grades || {};
                const { [linkedActivity.id]: _removedGrade, ...remainingGrades } = existingGrades;

                const recalculatedTotal = Object.values(remainingGrades).reduce((sum: number, grade: any) => {
                  const numericValue = typeof grade?.value === "number" ? grade.value : 0;
                  return sum + numericValue;
                }, 0);

                return {
                  ...student,
                  grades: remainingGrades,
                  total: recalculatedTotal,
                };
              });

              await gradeSheetService.update(linkedSheet.id, {
                activities: updatedActivities as GradeSheet["activities"],
                students: updatedStudents as GradeSheet["students"],
              });
            }
          }
        } catch (cleanupError) {
          console.error("Error cleaning linked grade sheet activity:", cleanupError);
        }
      }

      await assessmentService.deleteAssessment(selectedAssessment.id);

      try {
        const course = availableCourses.find((item) => item.id === selectedAssessment.courseId);
        await notifyCourseStudents(course, "assessmentCancelled", {
          title: "Activity cancelled",
          message: `The activity "${selectedAssessment.name}" was cancelled in ${course?.name || "your course"}.`,
          type: "warning",
          link: course ? `/courses/${course.code}/assessments` : "/courses",
        });
      } catch {
      }

      setShowDeleteModal(false);
      setSelectedAssessment(null);
      loadAssessments();
    } catch (error) {
      alert("Error deleting assessment");
    }
  };

  if (!user) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
              <div className="space-y-2">
                <AlertCircle className="mx-auto h-10 w-10 text-slate-400" />
                <p className="text-xl font-bold text-slate-900">Please log in</p>
                <p className="text-sm text-slate-600">You need to be logged in to view assessments.</p>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (availableCourses.length === 0) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300/60 bg-slate-50 p-6 text-center">
              <div className="space-y-3">
                <Book className="mx-auto h-10 w-10 text-slate-400" />
                <p className="text-xl font-bold text-slate-900">
                  {isTeacherView ? "No courses assigned" : "No enrolled courses"}
                </p>
                <p className="text-sm text-slate-600">
                  {isTeacherView
                    ? "You are not teaching any courses yet."
                    : "You are not enrolled in any courses yet."}
                </p>
                <Link
                  to={isTeacherView ? "/courses" : "/dashboard"}
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to {isTeacherView ? "Courses" : "Dashboard"}</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loading && selectedCourseId) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="text-center space-y-2">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-slate-900">Loading assessments</p>
                  <p className="text-sm text-slate-600">Please wait while we load the assessment data.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
        <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="space-y-4">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-200/35" />
              <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-200/35" />

              <div className="relative z-10">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                      <Zap className="h-3.5 w-3.5" />
                      Assessment Workspace
                    </div>
                    <h2 className="mt-3 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                      Assessment control center
                    </h2>
                    <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                      Track due items, organize evaluation types, and open grading quickly.
                    </p>
                  </div>
                  {canManageAssessments && (
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(true)}
                      aria-label="Add activity"
                      title="Add activity"
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                    >
                      <Plus className="h-4 w-4" />
                      New activity
                    </button>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <CalendarDays className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{stats.todayCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Today</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                        <CalendarClock className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{stats.upcomingCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Upcoming</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 text-slate-700">
                        <CalendarOff className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{stats.pastCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Past</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{stats.noDueDateCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">No date</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.8fr_1fr_1fr]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search assessments..."
                    className="h-10 w-full rounded-xl border border-slate-300/60 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="relative">
                  <School className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    value={selectedCourseId || ""}
                    onChange={(e) => {
                      const course = availableCourses.find((c) => c.id === e.target.value);
                      if (course) handleCourseChange(course);
                    }}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-300/60 bg-white pl-9 pr-9 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="">Select course...</option>
                    {availableCourses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.code}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>

                <div className="relative">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    className="h-10 w-full appearance-none rounded-xl border border-slate-300/60 bg-white pl-9 pr-9 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                  >
                    <option value="all">All Types</option>
                    <option value="announcement">Announcements</option>
                    <option value="delivery">Delivery Activities</option>
                    <option value="exam">Exams</option>
                    <option value="quiz">Quizzes</option>
                    <option value="homework">Homework</option>
                    <option value="project">Projects</option>
                    <option value="participation">Participation</option>
                    <option value="forum">Forum</option>
                    <option value="self_evaluation">Self Evaluation</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>

              
              </div>
            </section>

            {assessments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300/60 bg-slate-50 p-8 text-center">
                <FileText className="mx-auto h-10 w-10 text-slate-400" />
                <p className="mt-3 text-lg font-bold text-slate-900">No assessments available</p>
                <p className="mt-1 text-sm text-slate-600">
                  {canManageAssessments
                    ? "Create your first assessment to get started."
                    : "There are no assessments scheduled yet."}
                </p>
                {canManageAssessments && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create first assessment</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredToday.length > 0 && (
                  <section className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-slate-900">Today's Assessments</h3>
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            {filteredToday.length} urgent
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">Due today. Submit before the deadline.</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {filteredToday.map((assessment) => (
                        <AssessmentCard
                          key={assessment.id}
                          assessment={assessment}
                          courseCode={selectedCourse?.code || ""}
                          isTeacher={canManageAssessments}
                          onEdit={() => {
                            setEditingAssessment(assessment);
                            setShowEditModal(true);
                          }}
                          onDelete={() => {
                            setSelectedAssessment(assessment);
                            setShowDeleteModal(true);
                          }}
                          isToday={true}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {(filteredUpcoming.length > 0 || filteredPast.length > 0) && (
                  <div
                    className={cn(
                      "grid grid-cols-1 gap-4",
                      filteredUpcoming.length > 0 && filteredPast.length > 0 && "xl:grid-cols-2",
                    )}
                  >
                    {filteredUpcoming.length > 0 && (
                      <section className="rounded-2xl border border-sky-200 bg-sky-50/20 p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                            <CalendarClock className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-bold text-slate-900">Upcoming Assessments</h3>
                              <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                {filteredUpcoming.length} coming
                              </span>
                            </div>
                            <p className="text-xs text-slate-600">Next 30 days. Plan ahead.</p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {filteredUpcoming.map((assessment) => (
                            <AssessmentCard
                              key={assessment.id}
                              assessment={assessment}
                              courseCode={selectedCourse?.code || ""}
                              isTeacher={canManageAssessments}
                              onEdit={() => {
                                setEditingAssessment(assessment);
                                setShowEditModal(true);
                              }}
                              onDelete={() => {
                                setSelectedAssessment(assessment);
                                setShowDeleteModal(true);
                              }}
                              isUpcoming={true}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                    {filteredPast.length > 0 && (
                      <section className="rounded-2xl border border-slate-200/60 bg-slate-50/40 p-4 shadow-sm">
                        <button
                          type="button"
                          onClick={() => setShowCompletedAssessments((prev) => !prev)}
                          className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-left transition hover:border-slate-300/60"
                          aria-expanded={showCompletedAssessments}
                        >
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-slate-900">Completed Assessments</h3>
                            <span className="inline-flex items-center rounded-full border border-slate-200/60 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                              {filteredPast.length}
                            </span>
                          </div>
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 text-slate-500 transition-transform",
                              showCompletedAssessments && "rotate-180",
                            )}
                          />
                        </button>

                        {!showCompletedAssessments && (
                          <p className="mt-2 text-xs text-slate-600">Click to show completed items.</p>
                        )}

                        {showCompletedAssessments && (
                          <div className="mt-3 space-y-2">
                            {filteredPast.map((assessment) => (
                              <AssessmentCard
                                key={assessment.id}
                                assessment={assessment}
                                courseCode={selectedCourse?.code || ""}
                                isTeacher={canManageAssessments}
                                onEdit={() => {
                                  setEditingAssessment(assessment);
                                  setShowEditModal(true);
                                }}
                                onDelete={() => {
                                  setSelectedAssessment(assessment);
                                  setShowDeleteModal(true);
                                }}
                                isPast={true}
                              />
                            ))}
                          </div>
                        )}
                      </section>
                    )}
                  </div>
                )}

                {filteredNoDueDate.length > 0 && (
                  <section className="rounded-2xl border border-violet-200 bg-violet-50/20 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-slate-900">No Deadline</h3>
                          <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                            {filteredNoDueDate.length} flexible
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">Activities without deadline. Take your time.</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {filteredNoDueDate.map((assessment) => (
                        <AssessmentCard
                          key={assessment.id}
                          assessment={assessment}
                          courseCode={selectedCourse?.code || ""}
                          isTeacher={canManageAssessments}
                          onEdit={() => {
                            setEditingAssessment(assessment);
                            setShowEditModal(true);
                          }}
                          onDelete={() => {
                            setSelectedAssessment(assessment);
                            setShowDeleteModal(true);
                          }}
                          noDueDate={true}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {filteredToday.length === 0 &&
                  filteredUpcoming.length === 0 &&
                  filteredPast.length === 0 &&
                  filteredNoDueDate.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300/60 bg-slate-50 p-8 text-center">
                      <Search className="mx-auto h-9 w-9 text-slate-400" />
                      <p className="mt-2 text-lg font-bold text-slate-900">No matching assessments</p>
                      <p className="text-sm text-slate-600">Try different search terms or filters.</p>
                      <button
                        onClick={() => {
                          setSearchTerm("");
                          setFilterType("all");
                        }}
                        className="mt-4 inline-flex items-center rounded-xl border border-slate-300/60 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      </div>
      {showCreateModal && selectedCourseId && (
        <CreateAssessmentModal
          courseId={selectedCourseId}
          courseName={selectedCourse?.name || ''}
          availableCourses={availableCourses}
          onSubmit={handleCreateAssessment}
          onClose={() => setShowCreateModal(false)}
        />
      )}
      
      {showEditModal && editingAssessment && selectedCourseId && (
        <EditAssessmentModal
          assessment={editingAssessment}
          courseId={selectedCourseId}
          onSubmit={handleUpdateAssessment}
          onClose={() => {
            setShowEditModal(false);
            setEditingAssessment(null);
          }}
        />
      )}
      
      {showDeleteModal && selectedAssessment && (
        <DeleteConfirmationModal
          title={`Delete "${selectedAssessment.name}"?`}
          message="This action will delete the assessment and all associated grades. This cannot be undone."
          onConfirm={handleDeleteAssessment}
          onCancel={() => {
            setShowDeleteModal(false);
            setSelectedAssessment(null);
          }}
        />
      )}
    </DashboardLayout>
  );
}

function AssessmentCard({ assessment, courseCode, isTeacher, onEdit, onDelete, isToday, isUpcoming, isPast, noDueDate }: any) {
  const dueDate = assessment.dueDate ? new Date(assessment.dueDate) : null;
  const startDate = assessment.startDate ? new Date(assessment.startDate) : null;
  const descriptionPreview = getPlainTextFromHtml(String(assessment.description || ""));

  const getAssessmentIcon = () => {
    if (assessment.assessmentType === 'announcement') {
      return <Megaphone className="h-4 w-4" />;
    } else if (assessment.assessmentType === 'delivery') {
      return <Upload className="h-4 w-4" />;
    } else {
      return assessment.type === "exam" ? <FileText className="h-4 w-4" /> :
             assessment.type === "quiz" ? <BookOpen className="h-4 w-4" /> :
             assessment.type === "homework" ? <FileCheck className="h-4 w-4" /> :
             assessment.type === "project" ? <TrendingUp className="h-4 w-4" /> :
             assessment.type === "forum" ? <MessageSquare className="h-4 w-4" /> :
             assessment.type === "self_evaluation" ? <ClipboardCheck className="h-4 w-4" /> :
             <Users className="h-4 w-4" />;
    }
  };

  const getAssessmentTypeLabel = () => {
    if (assessment.assessmentType === 'announcement') {
      return "Announcement";
    } else if (assessment.assessmentType === 'delivery') {
      return "Delivery Activity";
    } else {
      return assessment.type === "exam" ? "Exam" :
             assessment.type === "quiz" ? "Quiz" :
             assessment.type === "homework" ? "Homework" :
             assessment.type === "project" ? "Project" :
             assessment.type === "forum" ? "Forum" :
             assessment.type === "self_evaluation" ? "Self Evaluation" :
             "Participation";
    }
  };

  const getAssessmentTypePillClass = () => {
    if (assessment.type === "forum") {
      return "border-violet-200 bg-violet-50 text-violet-700";
    }
    return "border-slate-200/60 bg-white text-slate-700";
  };

  const cardToneClass = isToday
    ? "border-amber-200 bg-amber-50/40"
    : isUpcoming
      ? "border-sky-200 bg-white"
      : isPast
        ? "border-slate-200/60 bg-slate-50/70"
        : noDueDate
          ? "border-violet-200 bg-violet-50/30"
          : "border-slate-200/60 bg-white";

  return (
    <div className={cn("rounded-xl border p-3 shadow-sm transition hover:shadow-md", cardToneClass)}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
              {getAssessmentIcon()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-bold text-slate-900">{assessment.name}</h3>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    getAssessmentTypePillClass(),
                  )}
                >
                  {getAssessmentTypeLabel()}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {assessment.assessmentType === "delivery" && startDate && (
                  <div className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                    <Calendar className="h-3 w-3" />
                    <span>Starts: {format(parseISO(assessment.startDate), "MMM dd", { locale: enUS })}</span>
                  </div>
                )}
                {dueDate && (
                  <p className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {assessment.assessmentType === "delivery" ? "Deadline:" : "Due:"}{" "}
                      {format(parseISO(assessment.dueDate), "MMM dd, yyyy", { locale: enUS })}
                    </span>
                  </p>
                )}
                {assessment.percentage > 0 && (
                  <div className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                    <Percent className="h-3 w-3" />
                    <span>{assessment.percentage}% of grade</span>
                  </div>
                )}
              </div>
              {descriptionPreview && <p className="mt-2 line-clamp-2 text-xs text-slate-600">{descriptionPreview}</p>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end xl:self-start">
          <Link
            to={`/courses/${courseCode}/assessments/${assessment.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/60 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50"
          >
            <Eye className="h-4 w-4" />
            <span>View details</span>
          </Link>

          {isTeacher && (
            <div className="inline-flex items-center gap-1">
              <button
                onClick={onEdit}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/60 bg-white text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                title="Edit"
              >
                <Edit className="h-4 w-4" />
              </button>

              <button
                onClick={onDelete}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RichTextEditor({
  name,
  value,
  onValueChange,
  placeholder = "Write a description...",
}: {
  name: string;
  value: string;
  onValueChange: (name: string, value: string) => void;
  placeholder?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [htmlMode, setHtmlMode] = useState(false);

  useEffect(() => {
    if (!htmlMode && editorRef.current && editorRef.current.innerHTML !== (value || "")) {
      editorRef.current.innerHTML = value || "";
    }
  }, [htmlMode, value]);

  const emitValue = (nextValue: string) => onValueChange(name, nextValue);

  const applyCommand = (command: string, commandValue?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    emitValue(editorRef.current?.innerHTML || "");
  };

  const handleLinkInsert = () => {
    const url = window.prompt("Paste the URL");
    if (!url) return;
    applyCommand("createLink", url.trim());
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50 p-2">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
          onClick={() => applyCommand("bold")}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
          onClick={() => applyCommand("italic")}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
          onClick={() => applyCommand("underline")}
          title="Underline"
        >
          <Underline className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
          onClick={() => applyCommand("insertUnorderedList")}
          title="Bullet list"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
          onClick={() => applyCommand("insertOrderedList")}
          title="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
          onClick={() => applyCommand("formatBlock", "pre")}
          title="Code block"
        >
          <Code2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
          onClick={handleLinkInsert}
          title="Insert link"
        >
          <Link2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-semibold",
            htmlMode ? "bg-sky-100 text-sky-700" : "text-slate-600 transition hover:bg-slate-100",
          )}
          onClick={() => setHtmlMode((prev) => !prev)}
          title="Toggle HTML mode"
        >
          <Braces className="mr-1 h-3.5 w-3.5" />
          HTML
        </button>
      </div>

      {htmlMode ? (
        <textarea
          name={name}
          rows={5}
          className="w-full rounded-xl border border-slate-200/60 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          placeholder={placeholder}
          value={value}
          onChange={(event) => emitValue(event.target.value)}
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          onInput={(event) => emitValue((event.target as HTMLDivElement).innerHTML)}
          className="min-h-[120px] w-full rounded-xl border border-slate-200/60 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          data-placeholder={placeholder}
          suppressContentEditableWarning
        />
      )}
      <p className="text-xs text-slate-500">You can add links and HTML content for this description.</p>
    </div>
  );
}

function CreateAssessmentModal({ courseId, courseName, availableCourses, onSubmit, onClose }: any) {
  const assignableCourses = useMemo(
    () => (availableCourses || []).filter((course: any) => !isMandatoryTeacherCourse(course)),
    [availableCourses],
  );
  const [formData, setFormData] = useState({
    targetCourseIds: isMandatoryTeacherCourse(
      (availableCourses || []).find((course: any) => course.id === courseId),
    )
      ? []
      : [courseId],
    name: "",
    description: "",
    type: "exam",
    percentage: "",
    maxPoints: "",
    passingScore: "",
    dueDate: "",
    startDate: "",
    gradeSheetId: "",
    mapGradeSheetByTitle: true,
    assessmentType: "assessment",
    deliveryType: "text",
    forumCloseAt: "",
    forumPreset: "basic" as ForumPresetKey,
    forumMainResponseMinWords: String(FORUM_PRESETS.basic.mainResponseMinWords),
    forumPeerRepliesRequired: String(FORUM_PRESETS.basic.peerRepliesRequired),
    forumPeerReplyCommentsRequired: String(FORUM_PRESETS.basic.peerReplyCommentsRequired),
    forumMainResponsesRequired: String(FORUM_PRESETS.basic.mainResponsesRequired),
  });

  const [gradeSheets, setGradeSheets] = useState<GradeSheet[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [errorSheets, setErrorSheets] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const selectedTargetCourseIds = formData.targetCourseIds || [];
  const hasMultipleCoursesSelected = selectedTargetCourseIds.length > 1;
  const primaryCourseId = selectedTargetCourseIds[0] || courseId;
  const gradeSheetsGroupedByUnit = useMemo(() => {
    const grouped = new Map<string, GradeSheet[]>();

    gradeSheets.forEach((sheet) => {
      const rawUnit = String(
        (sheet as Record<string, unknown>)?.unitName ||
          (sheet as Record<string, unknown>)?.unit ||
          sheet.gradingPeriod ||
          "Without unit",
      )
        .trim();
      const unitLabel = rawUnit || "Without unit";

      if (!grouped.has(unitLabel)) grouped.set(unitLabel, []);
      grouped.get(unitLabel)?.push(sheet);
    });

    return Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([unitLabel, sheets]) => ({
        unitLabel,
        sheets: [...sheets].sort((a, b) => a.title.localeCompare(b.title)),
      }));
  }, [gradeSheets]);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      targetCourseIds: (() => {
        const current = Array.isArray(prev.targetCourseIds)
          ? prev.targetCourseIds.filter((targetId) =>
              assignableCourses.some((course: any) => course.id === targetId),
            )
          : [];

        if (current.length > 0) return current;
        if (assignableCourses.some((course: any) => course.id === courseId)) return [courseId];
        if (assignableCourses[0]?.id) return [assignableCourses[0].id];
        return [];
      })(),
    }));
  }, [assignableCourses, courseId]);

  useEffect(() => {
    const loadGradeSheets = async () => {
      if (!primaryCourseId) {
        setGradeSheets([]);
        setErrorSheets("");
        return;
      }

      setLoadingSheets(true);
      setErrorSheets("");
      try {
        const sheets = await gradeSheetService.getByCourse(primaryCourseId);
        setGradeSheets(sheets);
        if (sheets.length === 0) {
          setErrorSheets("No grade sheets available for this course");
        }
      } catch (error: any) {
        setErrorSheets("Error loading grade sheets");
      } finally {
        setLoadingSheets(false);
      }
    };

    loadGradeSheets();
  }, [primaryCourseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreating) return;

    if (selectedTargetCourseIds.length === 0) {
      alert("Please select at least one course");
      return;
    }

    if (
      !hasMultipleCoursesSelected &&
      formData.assessmentType !== 'announcement' &&
      !formData.gradeSheetId &&
      gradeSheets.length > 0
    ) {
      alert("Please select a grade sheet");
      return;
    }
    if (
      hasMultipleCoursesSelected &&
      formData.assessmentType !== "announcement" &&
      formData.mapGradeSheetByTitle &&
      !formData.gradeSheetId &&
      gradeSheets.length > 0
    ) {
      alert("Select a reference grade sheet to map by title across courses");
      return;
    }

    setIsCreating(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsCreating(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name } = e.target;
    const value = (e.target as HTMLInputElement).type === "checkbox"
      ? (e.target as HTMLInputElement).checked
      : e.target.value;
    if (name === "forumPreset" && value !== "custom") {
      const preset = FORUM_PRESETS[value as Exclude<ForumPresetKey, "custom">];
      setFormData((prev) => ({
        ...prev,
        forumPreset: value as ForumPresetKey,
        forumMainResponseMinWords: String(preset.mainResponseMinWords),
        forumPeerRepliesRequired: String(preset.peerRepliesRequired),
        forumPeerReplyCommentsRequired: String(preset.peerReplyCommentsRequired),
        forumMainResponsesRequired: String(preset.mainResponsesRequired),
      }));
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRichTextChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  const handleToggleTargetCourse = (targetId: string) => {
    setFormData((prev) => {
      const current = Array.isArray(prev.targetCourseIds) ? prev.targetCourseIds : [];
      const exists = current.includes(targetId);
      const next = exists ? current.filter((id) => id !== targetId) : [...current, targetId];
      return {
        ...prev,
        targetCourseIds: next,
      };
    });
  };

  const getCurrentDate = () => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  };

  const getMaxDate = () => {
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(today.getFullYear() + 1);
    return nextYear.toISOString().split('T')[0];
  };

  const getCurrentDateTimeLocal = () => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
        <div className="relative border-b border-slate-200/60 bg-gradient-to-r from-sky-50 via-indigo-50/70 to-violet-50 p-6">
          <div className="pointer-events-none absolute -left-10 -top-16 h-28 w-28 rounded-full bg-sky-200/45 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 right-0 h-24 w-24 rounded-full bg-indigo-200/40 blur-xl" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200 bg-white/80 shadow-sm">
                <Plus className="h-5 w-5 text-sky-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">New Assessment</h3>
                <p className="mt-1 text-sm text-slate-600">{courseName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/80 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className={modalLabelClass}>Assessment Type *</label>
              <select
                name="assessmentType"
                required
                className={modalInputClass}
                value={formData.assessmentType}
                onChange={handleChange}
              >
                <option value="assessment">Regular Assessment</option>
                <option value="announcement">Announcement</option>
                <option value="delivery">Delivery Activity</option>
              </select>
            </div>

            <div>
              <label className={modalLabelClass}>Name *</label>
              <input
                type="text"
                name="name"
                required
                className={modalInputClass}
                placeholder="Assessment name"
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div className="lg:col-span-2">
              <label className={modalLabelClass}>Assign To Courses *</label>
              <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-slate-200/60 bg-slate-50 p-3 md:grid-cols-2">
                {assignableCourses.map((course: any) => (
                  <label
                    key={course.id}
                    className="flex items-start gap-2 p-2 rounded-lg hover:bg-white cursor-pointer border border-transparent hover:border-slate-200/60"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTargetCourseIds.includes(course.id)}
                      onChange={() => handleToggleTargetCourse(course.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300/60 text-sky-600"
                    />
                    <span className="text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">{course.name}</span>
                      <span className="block text-xs text-slate-500">{course.code}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Selected: {selectedTargetCourseIds.length}. The same activity will be created in each selected course.
              </p>
            </div>

            <div className="lg:col-span-2">
              <label className={modalLabelClass}>Description</label>
              <RichTextEditor
                name="description"
                value={formData.description}
                onValueChange={handleRichTextChange}
                placeholder="Description (optional)"
              />
            </div>

            {formData.assessmentType === 'assessment' && (
              <div>
                <div>
                  <label className={modalLabelClass}>Type *</label>
                  <select
                    name="type"
                    required
                    className={modalInputClass}
                    value={formData.type}
                    onChange={handleChange}
                  >
                    <option value="exam">Exam</option>
                    <option value="quiz">Quiz</option>
                    <option value="homework">Homework</option>
                    <option value="project">Project</option>
                    <option value="participation">Participation</option>
                    <option value="forum">Forum</option>
                  </select>
                </div>
              </div>
            )}

            {formData.assessmentType === 'assessment' && formData.type === 'forum' && (
              <div className="space-y-3 lg:col-span-2">
                <div>
                  <label className={modalLabelClass}>Forum Closes At</label>
                  <input
                    type="datetime-local"
                    name="forumCloseAt"
                    className={modalInputClass}
                    value={formData.forumCloseAt}
                    onChange={handleChange}
                    min={getCurrentDateTimeLocal()}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    This controls forum locking. After this date/time, new comments and replies are blocked.
                  </p>
                </div>

                <div>
                  <label className={modalLabelClass}>Forum Rules Preset</label>
                  <select
                    name="forumPreset"
                    className={modalInputClass}
                    value={formData.forumPreset}
                    onChange={handleChange}
                  >
                    <option value="basic">Basic</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={modalLabelClass}>Main Post Min Words</label>
                    <input
                      type="number"
                      name="forumMainResponseMinWords"
                      min="0"
                      step="1"
                      className={modalInputClass}
                      value={formData.forumMainResponseMinWords}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label className={modalLabelClass}>Main Posts Required</label>
                    <input
                      type="number"
                      name="forumMainResponsesRequired"
                      min="1"
                      step="1"
                      className={modalInputClass}
                      value={formData.forumMainResponsesRequired}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label className={modalLabelClass}>Replies to Peers</label>
                    <input
                      type="number"
                      name="forumPeerRepliesRequired"
                      min="0"
                      step="1"
                      className={modalInputClass}
                      value={formData.forumPeerRepliesRequired}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label className={modalLabelClass}>Comments on Peer Replies</label>
                    <input
                      type="number"
                      name="forumPeerReplyCommentsRequired"
                      min="0"
                      step="1"
                      className={modalInputClass}
                      value={formData.forumPeerReplyCommentsRequired}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>
            )}

            {formData.assessmentType === 'delivery' && (
              <div>
                <label className={modalLabelClass}>Delivery Type *</label>
                <select
                  name="deliveryType"
                  required
                  className={modalInputClass}
                  value={formData.deliveryType}
                  onChange={handleChange}
                >
                  <option value="text">Text Only</option>
                </select>
                <p className="text-xs text-slate-500 mt-2">Delivery activities only accept text submissions</p>
              </div>
            )}

            {formData.assessmentType !== 'announcement' && (
              <div>
                <label className={modalLabelClass}>
                  {hasMultipleCoursesSelected ? "Reference Grade Sheet" : "Grade Sheet *"}
                </label>
                <div className="relative">
                  <select
                    name="gradeSheetId"
                    required={
                      (!hasMultipleCoursesSelected && gradeSheets.length > 0) ||
                      (hasMultipleCoursesSelected && formData.mapGradeSheetByTitle && gradeSheets.length > 0)
                    }
                    disabled={loadingSheets}
                    className={modalInputDisabledClass}
                    value={formData.gradeSheetId}
                    onChange={handleChange}
                  >
                    <option value="">
                      {loadingSheets
                        ? "Loading..."
                        : gradeSheets.length === 0
                          ? "No grade sheets"
                          : hasMultipleCoursesSelected
                            ? "Select reference grade sheet"
                            : "Select grade sheet"}
                    </option>
                    {gradeSheetsGroupedByUnit.map((group) => (
                      <optgroup key={group.unitLabel} label={group.unitLabel}>
                        {group.sheets.map((sheet) => (
                          <option key={sheet.id} value={sheet.id}>
                            {sheet.title}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {loadingSheets && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-sky-500" />
                  )}
                </div>
                {errorSheets && (
                  <p className="text-sm text-slate-500 mt-2">{errorSheets}</p>
                )}
                {!loadingSheets && gradeSheets.length > 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    Sheets are grouped by unit/period to make selection easier.
                  </p>
                )}
                {hasMultipleCoursesSelected && (
                  <div className="mt-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        name="mapGradeSheetByTitle"
                        checked={Boolean(formData.mapGradeSheetByTitle)}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-slate-300/60 text-sky-600"
                      />
                      Link grade sheet by the same title in each selected course
                    </label>
                    <p className="text-xs text-slate-500">
                      Uses the selected reference grade sheet title and matches it in each course.
                    </p>
                  </div>
                )}
              </div>
            )}

            {formData.assessmentType === 'delivery' && (
              <div className="space-y-2 lg:col-span-2">
                <div>
                  <label className={modalLabelClass}>Start Date *</label>
                  <input
                    type="date"
                    name="startDate"
                    required
                    className={modalInputClass}
                    value={formData.startDate}
                    onChange={handleChange}
                    min={getCurrentDate()}
                    max={getMaxDate()}
                  />
                  <p className="text-xs text-slate-500 mt-2">Date when students can start submitting</p>
                </div>

                <div>
                  <label className={modalLabelClass}>Deadline *</label>
                  <input
                    type="date"
                    name="dueDate"
                    required
                    className={modalInputClass}
                    value={formData.dueDate}
                    onChange={handleChange}
                    min={formData.startDate || getCurrentDate()}
                    max={getMaxDate()}
                  />
                  <p className="text-xs text-slate-500 mt-2">Final submission deadline</p>
                </div>
              </div>
            )}

            {formData.assessmentType === 'assessment' && (
              <div>
                <label className={modalLabelClass}>
                  {formData.type === 'forum' ? 'Due Date (Optional)' : 'Due Date'}
                </label>
                <input
                  type="date"
                  name="dueDate"
                  className={modalInputClass}
                  value={formData.dueDate}
                  onChange={handleChange}
                  min={getCurrentDate()}
                  max={getMaxDate()}
                />
                {formData.type === 'forum' && (
                  <p className="text-xs text-slate-500 mt-2">
                    This is separate from <strong>Forum Closes At</strong>.
                  </p>
                )}
              </div>
            )}

            {formData.assessmentType === 'announcement' && (
              <div>
                <label className={modalLabelClass}>Expiration Date (Optional)</label>
                <input
                  type="date"
                  name="dueDate"
                  className={modalInputClass}
                  value={formData.dueDate}
                  onChange={handleChange}
                  min={getCurrentDate()}
                  max={getMaxDate()}
                />
                <p className="text-xs text-slate-500 mt-2">Date when announcement expires (optional)</p>
              </div>
            )}

            {(formData.assessmentType === 'assessment' || formData.assessmentType === 'delivery') && (
              <div className="grid grid-cols-2 gap-4 lg:col-span-2">
                <div>
                  <label className={modalLabelClass}>Max Points *</label>
                  <input
                    type="number"
                    name="maxPoints"
                    required
                    min="0"
                    step="0.1"
                    className={modalInputClass}
                    placeholder="4.5"
                    value={formData.maxPoints}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className={modalLabelClass}>Passing Score *</label>
                  <input
                    type="number"
                    name="passingScore"
                    required
                    min="0"
                    step="0.1"
                    className={modalInputClass}
                    placeholder="4.3"
                    value={formData.passingScore}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}

          </div>

          <div className="mt-6 flex gap-3 border-t border-slate-200/60 pt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className={cn(modalSecondaryButtonClass, "flex-1")}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className={cn(
                modalPrimaryButtonClass,
                "flex-1 disabled:cursor-not-allowed disabled:opacity-70",
              )}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditAssessmentModal({ assessment, courseId, onSubmit, onClose }: any) {
  const resolvedForumRequirements = resolveForumRequirementsFromAssessment(assessment);
  const detectedPreset = detectForumPreset(resolvedForumRequirements || undefined);
  const [formData, setFormData] = useState({
    name: assessment?.name || "",
    description: assessment?.description || "",
    type: assessment?.type || "exam",
    maxPoints: assessment?.maxPoints?.toString() || "",
    passingScore: assessment?.passingScore?.toString() || "",
    dueDate: assessment?.dueDate ? new Date(assessment.dueDate).toISOString().split('T')[0] : "",
    startDate: assessment?.startDate ? new Date(assessment.startDate).toISOString().split('T')[0] : "",
    gradeSheetId: assessment?.gradeSheetId || "",
    assessmentType: assessment?.assessmentType || "assessment",
    deliveryType: assessment?.deliveryType || "text",
    forumCloseAt: assessment?.forumCloseAt
      ? new Date(assessment.forumCloseAt).toISOString().slice(0, 16)
      : "",
    forumPreset: detectedPreset,
    forumMainResponseMinWords: String(resolvedForumRequirements?.mainResponseMinWords ?? FORUM_PRESETS.basic.mainResponseMinWords),
    forumPeerRepliesRequired: String(resolvedForumRequirements?.peerRepliesRequired ?? FORUM_PRESETS.basic.peerRepliesRequired),
    forumPeerReplyCommentsRequired: String(resolvedForumRequirements?.peerReplyCommentsRequired ?? FORUM_PRESETS.basic.peerReplyCommentsRequired),
    forumMainResponsesRequired: String(resolvedForumRequirements?.mainResponsesRequired ?? FORUM_PRESETS.basic.mainResponsesRequired),
  });

  const [gradeSheets, setGradeSheets] = useState<GradeSheet[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const gradeSheetsGroupedByUnit = useMemo(() => {
    const grouped = new Map<string, GradeSheet[]>();

    gradeSheets.forEach((sheet) => {
      const rawUnit = String(
        (sheet as Record<string, unknown>)?.unitName ||
          (sheet as Record<string, unknown>)?.unit ||
          sheet.gradingPeriod ||
          "Without unit",
      )
        .trim();
      const unitLabel = rawUnit || "Without unit";

      if (!grouped.has(unitLabel)) grouped.set(unitLabel, []);
      grouped.get(unitLabel)?.push(sheet);
    });

    return Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([unitLabel, sheets]) => ({
        unitLabel,
        sheets: [...sheets].sort((a, b) => a.title.localeCompare(b.title)),
      }));
  }, [gradeSheets]);

  useEffect(() => {
    const loadGradeSheets = async () => {
      setLoadingSheets(true);
      try {
        const sheets = await gradeSheetService.getByCourse(courseId);
        setGradeSheets(sheets);
      } catch (error) {
      } finally {
        setLoadingSheets(false);
      }
    };

    loadGradeSheets();
  }, [courseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === "forumPreset" && value !== "custom") {
      const preset = FORUM_PRESETS[value as Exclude<ForumPresetKey, "custom">];
      setFormData((prev) => ({
        ...prev,
        forumPreset: value as ForumPresetKey,
        forumMainResponseMinWords: String(preset.mainResponseMinWords),
        forumPeerRepliesRequired: String(preset.peerRepliesRequired),
        forumPeerReplyCommentsRequired: String(preset.peerReplyCommentsRequired),
        forumMainResponsesRequired: String(preset.mainResponsesRequired),
      }));
      return;
    }
    if (name === "type" && value === "self_evaluation") {
      setFormData((prev) => ({
        ...prev,
        type: "self_evaluation",
        maxPoints: "5",
        passingScore: prev.passingScore ? prev.passingScore : "3",
      }));
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRichTextChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const getCurrentDate = () => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  };
  const isSelfEvaluationType =
    formData.assessmentType === "assessment" && formData.type === "self_evaluation";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
        <div className="relative border-b border-slate-200/60 bg-gradient-to-r from-sky-50 via-indigo-50/70 to-violet-50 p-6">
          <div className="pointer-events-none absolute -left-10 -top-16 h-28 w-28 rounded-full bg-sky-200/45 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 right-0 h-24 w-24 rounded-full bg-indigo-200/40 blur-xl" />
          <div className="relative flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200 bg-white/80 shadow-sm">
                <Edit className="h-5 w-5 text-sky-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900">Edit Assessment</h3>
                <p className="mt-1 text-sm text-slate-600">Update assessment details</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/80 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className={modalLabelClass}>Assessment Type</label>
              <select
                name="assessmentType"
                className={modalInputClass}
                value={formData.assessmentType}
                onChange={handleChange}
              >
                <option value="assessment">Regular Assessment</option>
                <option value="announcement">Announcement</option>
                <option value="delivery">Delivery Activity</option>
              </select>
            </div>

            <div>
              <label className={modalLabelClass}>Name *</label>
              <input
                type="text"
                name="name"
                required
                className={modalInputClass}
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div className="lg:col-span-2">
              <label className={modalLabelClass}>Description</label>
              <RichTextEditor
                name="description"
                value={formData.description}
                onValueChange={handleRichTextChange}
                placeholder="Description (optional)"
              />
            </div>

            {formData.assessmentType === 'assessment' && (
              <div>
                <div>
                  <label className={modalLabelClass}>Type *</label>
                  <select
                    name="type"
                    required
                    className={modalInputClass}
                    value={formData.type}
                    onChange={handleChange}
                  >
                    <option value="exam">Exam</option>
                    <option value="quiz">Quiz</option>
                    <option value="homework">Homework</option>
                    <option value="project">Project</option>
                    <option value="participation">Participation</option>
                    <option value="forum">Forum</option>
                    <option value="self_evaluation">Self Evaluation</option>
                  </select>
                </div>
              </div>
            )}

            {formData.assessmentType === 'assessment' && formData.type === 'forum' && (
              <div className="space-y-3 lg:col-span-2">
                <div>
                  <label className={modalLabelClass}>Forum Closes At</label>
                  <input
                    type="datetime-local"
                    name="forumCloseAt"
                    className={modalInputClass}
                    value={formData.forumCloseAt}
                    onChange={handleChange}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    This controls forum locking. After this date/time, new comments and replies are blocked.
                  </p>
                </div>

                <div>
                  <label className={modalLabelClass}>Forum Rules Preset</label>
                  <select
                    name="forumPreset"
                    className={modalInputClass}
                    value={formData.forumPreset}
                    onChange={handleChange}
                  >
                    <option value="basic">Basic</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={modalLabelClass}>Main Post Min Words</label>
                    <input
                      type="number"
                      name="forumMainResponseMinWords"
                      min="0"
                      step="1"
                      className={modalInputClass}
                      value={formData.forumMainResponseMinWords}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label className={modalLabelClass}>Main Posts Required</label>
                    <input
                      type="number"
                      name="forumMainResponsesRequired"
                      min="1"
                      step="1"
                      className={modalInputClass}
                      value={formData.forumMainResponsesRequired}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label className={modalLabelClass}>Replies to Peers</label>
                    <input
                      type="number"
                      name="forumPeerRepliesRequired"
                      min="0"
                      step="1"
                      className={modalInputClass}
                      value={formData.forumPeerRepliesRequired}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label className={modalLabelClass}>Comments on Peer Replies</label>
                    <input
                      type="number"
                      name="forumPeerReplyCommentsRequired"
                      min="0"
                      step="1"
                      className={modalInputClass}
                      value={formData.forumPeerReplyCommentsRequired}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>
            )}

            {formData.assessmentType === 'delivery' && (
              <div>
                <label className={modalLabelClass}>Delivery Type</label>
                <select
                  name="deliveryType"
                  required
                  className={modalInputClass}
                  value={formData.deliveryType}
                  onChange={handleChange}
                >
                  <option value="text">Text Only</option>
                </select>
              </div>
            )}

            {formData.assessmentType !== 'announcement' && (
              <div>
                <label className={modalLabelClass}>Grade Sheet</label>
                <div className="relative">
                  <select
                    name="gradeSheetId"
                    disabled={loadingSheets}
                    className={modalInputClass}
                    value={formData.gradeSheetId}
                    onChange={handleChange}
                  >
                    <option value="">No grade sheet</option>
                    {gradeSheetsGroupedByUnit.map((group) => (
                      <optgroup key={group.unitLabel} label={group.unitLabel}>
                        {group.sheets.map((sheet) => (
                          <option key={sheet.id} value={sheet.id}>
                            {sheet.title}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                {!loadingSheets && gradeSheets.length > 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    Sheets are grouped by unit/period to make selection easier.
                  </p>
                )}
              </div>
            )}

            {formData.assessmentType === 'delivery' && (
              <div className="space-y-2 lg:col-span-2">
                <div>
                  <label className={modalLabelClass}>Start Date</label>
                  <input
                    type="date"
                    name="startDate"
                    className={modalInputClass}
                    value={formData.startDate}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className={modalLabelClass}>Deadline</label>
                  <input
                    type="date"
                    name="dueDate"
                    className={modalInputClass}
                    value={formData.dueDate}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}

            {formData.assessmentType === 'assessment' && (
              <div>
                <label className={modalLabelClass}>
                  {formData.type === 'forum' ? 'Due Date (Optional)' : 'Due Date'}
                </label>
                <input
                  type="date"
                  name="dueDate"
                  className={modalInputClass}
                  value={formData.dueDate}
                  onChange={handleChange}
                />
                {formData.type === 'forum' && (
                  <p className="text-xs text-slate-500 mt-2">
                    This is separate from <strong>Forum Closes At</strong>.
                  </p>
                )}
              </div>
            )}

            {formData.assessmentType === 'announcement' && (
              <div>
                <label className={modalLabelClass}>Expiration Date</label>
                <input
                  type="date"
                  name="dueDate"
                  className={modalInputClass}
                  value={formData.dueDate}
                  onChange={handleChange}
                />
              </div>
            )}

            {(formData.assessmentType === 'assessment' || formData.assessmentType === 'delivery') && (
              <div className="grid grid-cols-2 gap-4 lg:col-span-2">
                <div>
                  <label className={modalLabelClass}>Max Points *</label>
                  <input
                    type="number"
                    name="maxPoints"
                    required
                    min={isSelfEvaluationType ? "5" : "0"}
                    max={isSelfEvaluationType ? "5" : undefined}
                    step="0.1"
                    className={modalInputClass}
                    value={formData.maxPoints}
                    onChange={handleChange}
                    readOnly={isSelfEvaluationType}
                  />
                  {isSelfEvaluationType && (
                    <p className="text-xs text-slate-500 mt-2">Self Evaluation uses Colombian scale (0.0 - 5.0).</p>
                  )}
                </div>

                <div>
                  <label className={modalLabelClass}>Passing Score *</label>
                  <input
                    type="number"
                    name="passingScore"
                    required
                    min="0"
                    max={isSelfEvaluationType ? "5" : undefined}
                    step="0.1"
                    className={modalInputClass}
                    value={formData.passingScore}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}

          </div>

          <div className="mt-6 flex gap-3 border-t border-slate-200/60 pt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className={cn(modalSecondaryButtonClass, "flex-1")}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={cn(
                modalPrimaryButtonClass,
                "flex-1 disabled:cursor-not-allowed disabled:opacity-70",
              )}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Edit className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  ); 
}

function DeleteConfirmationModal({ title, message, onConfirm, onCancel }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/60 bg-white p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-red-100 bg-red-50">
            <AlertCircle className="h-10 w-10 text-red-500" />
          </div>

          <h3 className="mb-3 text-xl font-bold text-slate-900">{title}</h3>
          <p className="mb-6 text-slate-600">{message}</p>

          <div className="flex justify-center gap-3">
            <button
              onClick={onCancel}
              className={modalSecondaryButtonClass}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="inline-flex items-center justify-center rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 hover:shadow-md"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
