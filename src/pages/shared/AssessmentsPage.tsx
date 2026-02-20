import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
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
  BarChart3,
  Search,
  Clock, 
  AlertCircle,
  FileCheck, 
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
  Braces
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    
    if (user.role === "docente") {
      return courses.filter(course => course.teacherId === user.id);
    } else {
      return courses.filter(course => 
        course.enrolledStudents?.includes(user.id) || 
        course.enrolledStudents?.some((student: any) => typeof student === 'string' ? student === user.id : student.id === user.id)
      );
    }
  }, [courses, user]);

  const selectedCourse = useMemo(
    () => availableCourses.find((course) => course.id === selectedCourseId) || null,
    [availableCourses, selectedCourseId],
  );

  useEffect(() => {
    if (availableCourses.length === 0) {
      if (selectedCourseId) setSelectedCourseId("");
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

    if (selectedCourse) {
      if (courseCode !== selectedCourse.code) {
        navigate(`/courses/${selectedCourse.code}/assessments`, { replace: true });
      }
      return;
    }

    const firstCourse = availableCourses[0];
    setSelectedCourseId(firstCourse.id);
    if (courseCode !== firstCourse.code) {
      navigate(`/courses/${firstCourse.code}/assessments`, { replace: true });
    }
  }, [availableCourses, courseCode, navigate, selectedCourse, selectedCourseId, setSelectedCourseId]);

  useEffect(() => {
    if (!selectedCourseId) return;
    
    loadAssessments();
  }, [selectedCourseId]);

  const handleCourseChange = (course: any) => {
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

  const loadAssessments = async () => {
    if (!selectedCourseId) return;
    
    setLoading(true);
    try {
      const data = await assessmentService.getCourseAssessments(selectedCourseId);
      setAssessments(data);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

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

  const handleCreateAssessment = async (data: any) => {
    try {
      if (!user) return;

      const targetCourseIds = Array.from(
        new Set(
          (Array.isArray(data.targetCourseIds) ? data.targetCourseIds : [data.courseId || selectedCourseId])
            .map((id: unknown) => String(id || ""))
            .filter((id) => id.length > 0),
        ),
      );

      if (targetCourseIds.length === 0) {
        alert("Please select a course");
        return;
      }

      let dueDateValue = data.dueDate;
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
        percentage: parseFloat(data.percentage || 0),
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

      let dueDateValue = data.dueDate;
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

      const updateData: any = {
        name: data.name,
        description: data.description,
        type: data.type,
        percentage: parseFloat(data.percentage || 0),
        maxPoints: parseFloat(data.maxPoints || 0),
        passingScore: parseFloat(data.passingScore || 0),
        dueDate: dueDateValue || null,
        gradeSheetId: data.gradeSheetId,
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
      <DashboardLayout title="Assessments" subtitle="Please log in">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-100 flex items-center justify-center">
              <AlertCircle className="h-10 w-10 text-gray-400" />
            </div>
            <div className="space-y-2">
              <p className="text-xl font-bold text-gray-900">Please log in</p>
              <p className="text-gray-500">You need to be logged in to view assessments</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (availableCourses.length === 0) {
    return (
      <DashboardLayout title="Assessments" subtitle="No courses available">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Book className="h-10 w-10 text-gray-400" />
            </div>
            <div className="space-y-2">
              <p className="text-xl font-bold text-gray-900">
                {user.role === "docente"  
                  ? "No courses assigned" 
                  : "No enrolled courses"}
              </p>
              <p className="text-gray-500">
                {user.role === "docente" 
                  ? "You are not teaching any courses yet" 
                  : "You are not enrolled in any courses yet"}
              </p>
            </div>
            <Link
              to={user.role === "docente" ? "/courses" : "/dashboard"}
              className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:shadow-lg transition-all duration-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to {user.role === "docente" ? "Courses" : "Dashboard"}
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loading && selectedCourseId) {
    return (
      <DashboardLayout 
        title="Assessments"
        subtitle={`${selectedCourse?.name || "Loading..."}`}
         contentClassName="pt-0 lg:pt-1"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto" />
            <div className="space-y-2">
              <p className="text-lg font-semibold text-gray-900">Loading assessments</p>
              <p className="text-sm text-gray-500">Please wait while we load the assessment data</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Assessments"
      subtitle={selectedCourse ? `${selectedCourse.name} • ${selectedCourse.code}` : "Select a course"}
       contentClassName="pt-0 lg:pt-1"
    >
      <div className="space-y-2">
        <div className="grid grid-cols-4 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-semibold text-blue-600 tracking-wide">Today</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{stats.todayCount}</p>
              </div>
              <div className="hidden sm:flex h-8 w-8 rounded-xl bg-blue-100 items-center justify-center">
                <CalendarDays className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-semibold text-blue-600 tracking-wide">Upcoming</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{stats.upcomingCount}</p>
              </div>
              <div className="hidden sm:flex h-8 w-8 rounded-xl bg-blue-100 items-center justify-center">
                <CalendarClock className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-semibold text-blue-600 tracking-wide">Past</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{stats.pastCount}</p>
              </div>
              <div className="hidden sm:flex h-8 w-8 rounded-xl bg-blue-100 items-center justify-center">
                <CalendarOff className="h-4 w-4 text-gray-500" />
              </div>
            </div>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-semibold text-blue-600 tracking-wide">No Date</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{stats.noDueDateCount}</p>
              </div>
              <div className="hidden sm:flex h-8 w-8 rounded-xl bg-gray-100 items-center justify-center">
                <Calendar className="h-4 w-4 text-gray-500" />
              </div>
            </div>
          </div>
        </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-2 shadow-sm">
  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
    <div className="flex-1 flex flex-col sm:flex-row gap-4">
      <div className="flex-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search assessments..."
            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      
      <div className="relative min-w-[180px]">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
          <School className="h-5 w-5 text-gray-400" />
        </div>
        <select
          value={selectedCourseId || ""} 
          onChange={(e) => {
            const course = availableCourses.find(c => c.id === e.target.value);
            if (course) {
              handleCourseChange(course);
            }
          }}
          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium appearance-none"
        >
          <option value="">Select course...</option>
          {availableCourses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.code} 
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
    
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative hidden md:block">
        <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <select
          className="pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none text-sm font-medium"
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
        </select>
      </div>
      
      {user.role === "docente" && (
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  </div>
</div>

        {assessments.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center shadow-sm">
            <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gray-100 flex items-center justify-center">
              <FileText className="h-12 w-12 text-gray-400" />
            </div>
            <h3 className="font-bold text-xl mb-3 text-gray-900">No assessments available</h3>
            <p className="text-gray-500 max-w-md mx-auto mb-6">
              {user.role === "docente"
                ? "Create your first assessment to get started"
                : "There are no assessments scheduled yet"}
            </p>
            {user.role === "docente" && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
              >
                <Plus className="h-4 w-4" />
                Create First Assessment
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredToday.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-red-50 flex items-center justify-center border border-red-200">
                      <AlertTriangle className="h-6 w-6 text-red-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-xl text-gray-900">Today's Assessments</h3>
                        <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                          {filteredToday.length} URGENT
                        </span>
                      </div>
                      <p className="text-sm text-red-600 mt-1">Due today • Submit before deadline</p>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  {filteredToday.map((assessment) => (
                    <AssessmentCard
                      key={assessment.id}
                      assessment={assessment}
                      courseCode={selectedCourse?.code || ''}
                      isTeacher={user.role === "docente"}
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
              </div>
            )}

            {filteredUpcoming.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100">
                      <CalendarClock className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-xl text-gray-900">Upcoming Assessments</h3>
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                          {filteredUpcoming.length} Coming
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">Next 30 days • Plan ahead</p>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  {filteredUpcoming.map((assessment) => (
                    <AssessmentCard
                      key={assessment.id}
                      assessment={assessment}
                      courseCode={selectedCourse?.code || ''}
                      isTeacher={user.role === "docente"}
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
              </div>
            )}

            {filteredPast.length > 0 && (
              <div className="space-y-2 rounded-xl border border-gray-300 bg-gray-50/60 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setShowCompletedAssessments((prev) => !prev)}
                  className="flex w-full items-center justify-between text-left"
                  aria-expanded={showCompletedAssessments}
                >
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base text-gray-700">Completed Assessments</h3>
                    <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded-full">
                      {filteredPast.length}
                    </span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-gray-500 transition-transform duration-200",
                      showCompletedAssessments && "rotate-180"
                    )}
                  />
                </button>

                {!showCompletedAssessments && (
                  <p className="text-xs text-gray-500">Click to show completed items</p>
                )}

                {showCompletedAssessments && (
                  <div className="grid grid-cols-1 gap-4 pt-2">
                    {filteredPast.map((assessment) => (
                      <AssessmentCard
                        key={assessment.id}
                        assessment={assessment}
                        courseCode={selectedCourse?.code || ''}
                        isTeacher={user.role === "docente"}
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
              </div>
            )}

            {filteredNoDueDate.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center border border-gray-200">
                      <Calendar className="h-6 w-6 text-gray-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-xl text-gray-900">No Deadline</h3>
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-full">
                          {filteredNoDueDate.length} FLEXIBLE
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">Activities without deadline • Take your time</p>
                    </div>
                  </div>
                  <Clock className="h-5 w-5 text-gray-400 hidden lg:block" />
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  {filteredNoDueDate.map((assessment) => (
                    <AssessmentCard
                      key={assessment.id}
                      assessment={assessment}
                      courseCode={selectedCourse?.code || ''}
                      isTeacher={user.role === "docente"}
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
              </div>
            )}

            {filteredToday.length === 0 && 
             filteredUpcoming.length === 0 && 
             filteredPast.length === 0 && 
             filteredNoDueDate.length === 0 && (
              <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center shadow-sm">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <Search className="h-10 w-10 text-gray-400" />
                </div>
                <h3 className="font-bold text-xl mb-3 text-gray-900">No matching assessments</h3>
                <p className="text-gray-500 max-w-md mx-auto mb-6">
                  Try different search terms or filters
                </p>
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterType('all');
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-700 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}
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
      return <Megaphone className="h-6 w-6" />;
    } else if (assessment.assessmentType === 'delivery') {
      return <Upload className="h-6 w-6" />;
    } else {
      return assessment.type === "exam" ? <FileText className="h-6 w-6" /> :
             assessment.type === "quiz" ? <BookOpen className="h-6 w-6" /> :
             assessment.type === "homework" ? <FileCheck className="h-6 w-6" /> :
             assessment.type === "project" ? <TrendingUp className="h-6 w-6" /> :
             assessment.type === "forum" ? <MessageSquare className="h-6 w-6" /> :
             <Users className="h-6 w-6" />;
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
             "Participation";
    }
  };

  const getIconColor = () => {
    return assessment.assessmentType === "announcement" ? "bg-blue-600" : "bg-blue-600";
  };

  return (
    <div className={cn(
      "bg-white border rounded-2xl p-4 shadow-sm hover:shadow-xl transition-all duration-300 group",
      isToday ? "border-gray-200 hover:border-gray-300" :
      isUpcoming ? "border-blue-200 hover:border-blue-300" :
      isPast ? "border-blue-200 hover:border-blue-300" :
      "border-gray-200 hover:border-gray-300"
    )}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-start gap-4">
            <div className={`h-10 w-10 rounded-xl ${getIconColor()} flex items-center justify-center text-white shadow-sm`}>
              {getAssessmentIcon()}
            </div>
            
            <div className="flex-1 ">
              <div className="flex flex-wrap items-center gap-3 mb-2 ">
                <h3 className={cn(
                  "font-bold text-lg text-gray-900 transition-colors",
                  isToday ? "group-hover:text-red-600" : "group-hover:text-blue-600",
                )}>
                  {assessment.name}
                </h3>
              </div>
              
              <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                {assessment.assessmentType === 'delivery' && startDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="font-medium">
                      Starts: {format(parseISO(assessment.startDate), "MMM dd", { locale: enUS })}
                    </span>
                  </div>
                )}
                {dueDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className={cn(
                      "h-4 w-4",
                      isToday ? "text-red-500" :
                      isUpcoming ? "text-blue-500" :
                      "text-gray-400"
                    )} />
                    <span className={cn(
                      "font-medium",
                      isToday ? "text-red-600" :
                      isUpcoming ? "text-blue-600" :
                      "text-gray-600"
                    )}>
                      {assessment.assessmentType === 'delivery' ? 'Deadline: ' : 'Due: '}
                      {format(parseISO(assessment.dueDate), "MMM dd, yyyy", { locale: enUS })}
                    </span>
                  </div>
                )}
                {assessment.percentage > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-600">{assessment.percentage}% of grade</span>
                  </div>
                )} 
              </div>

              {descriptionPreview && (
                <p className={cn(
                  "text-sm mt-1 line-clamp-2",
                  isToday ? "text-gray-700" : "text-gray-500",
                )}>
                  {descriptionPreview}
                </p>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 lg:flex-col lg:items-end">
          <div className="">
            <Link
            to={`/courses/${courseCode}/assessments/${assessment.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 text-gray-700 hover:text-gray-900 hover:shadow-sm transition-all duration-300 font-medium text-sm border border-gray-200 group/view "
          >
            <Eye className="h-4 w-4 group-hover/view:scale-110 transition-transform" />
            View Details
          </Link>
          </div>
          
          {isTeacher && (
            <div className="flex items-center gap-1">
              {assessment.assessmentType !== 'announcement' && (
                <Link
                  to={`/courses/${courseCode}/assessments/${assessment.id}/grade`}
                  className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors hover:scale-110"
                  title="Grade"
                >
                  <BarChart3 className="h-5 w-5" />
                </Link>
              )}
              
              <button
                onClick={onEdit}
                className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors hover:scale-110"
                title="Edit"
              >
                <Edit className="h-5 w-5" />
              </button>
              
              <button
                onClick={onDelete}
                className="p-2 text-gray-700 hover:text-gray-800 hover:bg-red-50 rounded-lg transition-colors hover:scale-110"
                title="Delete"
              >
                <Trash2 className="h-5 w-5 text-red-600" />
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
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-200"
          onClick={() => applyCommand("bold")}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-200"
          onClick={() => applyCommand("italic")}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-200"
          onClick={() => applyCommand("underline")}
          title="Underline"
        >
          <Underline className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-200"
          onClick={() => applyCommand("insertUnorderedList")}
          title="Bullet list"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-200"
          onClick={() => applyCommand("insertOrderedList")}
          title="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-200"
          onClick={() => applyCommand("formatBlock", "pre")}
          title="Code block"
        >
          <Code2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-200"
          onClick={handleLinkInsert}
          title="Insert link"
        >
          <Link2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-semibold",
            htmlMode ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-200",
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
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          placeholder={placeholder}
          value={value}
          onChange={(event) => emitValue(event.target.value)}
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          onInput={(event) => emitValue((event.target as HTMLDivElement).innerHTML)}
          className="min-h-[120px] w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          data-placeholder={placeholder}
          suppressContentEditableWarning
        />
      )}
      <p className="text-xs text-gray-500">You can add links and HTML content for this description.</p>
    </div>
  );
}

function CreateAssessmentModal({ courseId, courseName, availableCourses, onSubmit, onClose }: any) {
  const [formData, setFormData] = useState({
    targetCourseIds: [courseId],
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
  const selectedTargetCourseIds = formData.targetCourseIds || [];
  const hasMultipleCoursesSelected = selectedTargetCourseIds.length > 1;
  const primaryCourseId = selectedTargetCourseIds[0] || courseId;

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      targetCourseIds:
        Array.isArray(prev.targetCourseIds) && prev.targetCourseIds.length > 0
          ? prev.targetCourseIds
          : [courseId],
    }));
  }, [courseId]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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

    onSubmit(formData);
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
<div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] border border-gray-200">        <div className="p-6 border-b bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Plus className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">New Assessment</h3>
                <p className="text-sm text-gray-500 mt-1">{courseName}</p>
              </div>
            </div> 
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Assessment Type *</label>
              <select
                name="assessmentType"
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                value={formData.assessmentType}
                onChange={handleChange}
              >
                <option value="assessment">Regular Assessment</option>
                <option value="announcement">Announcement</option>
                <option value="delivery">Delivery Activity</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
              <input
                type="text"
                name="name"
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                placeholder="Assessment name"
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Assign To Courses *</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border border-gray-200 rounded-xl p-3 bg-gray-50 max-h-48 overflow-y-auto">
                {(availableCourses || []).map((course: any) => (
                  <label
                    key={course.id}
                    className="flex items-start gap-2 p-2 rounded-lg hover:bg-white cursor-pointer border border-transparent hover:border-gray-200"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTargetCourseIds.includes(course.id)}
                      onChange={() => handleToggleTargetCourse(course.id)}
                      className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">
                      <span className="font-semibold text-gray-900">{course.name}</span>
                      <span className="block text-xs text-gray-500">{course.code}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Selected: {selectedTargetCourseIds.length}. The same activity will be created in each selected course.
              </p>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <RichTextEditor
                name="description"
                value={formData.description}
                onValueChange={handleRichTextChange}
                placeholder="Description (optional)"
              />
            </div>

            {formData.assessmentType === 'assessment' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type *</label>
                  <select
                    name="type"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Percentage *</label>
                  <input
                    type="number"
                    name="percentage"
                    required
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    placeholder="5%"
                    value={formData.percentage}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}

            {formData.assessmentType === 'assessment' && formData.type === 'forum' && (
              <div className="space-y-3 lg:col-span-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Forum Closes At</label>
                  <input
                    type="datetime-local"
                    name="forumCloseAt"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.forumCloseAt}
                    onChange={handleChange}
                    min={getCurrentDateTimeLocal()}
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    This controls forum locking. After this date/time, new comments and replies are blocked.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Forum Rules Preset</label>
                  <select
                    name="forumPreset"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Main Post Min Words</label>
                    <input
                      type="number"
                      name="forumMainResponseMinWords"
                      min="0"
                      step="1"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      value={formData.forumMainResponseMinWords}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Main Posts Required</label>
                    <input
                      type="number"
                      name="forumMainResponsesRequired"
                      min="1"
                      step="1"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      value={formData.forumMainResponsesRequired}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Replies to Peers</label>
                    <input
                      type="number"
                      name="forumPeerRepliesRequired"
                      min="0"
                      step="1"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      value={formData.forumPeerRepliesRequired}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Comments on Peer Replies</label>
                    <input
                      type="number"
                      name="forumPeerReplyCommentsRequired"
                      min="0"
                      step="1"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      value={formData.forumPeerReplyCommentsRequired}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>
            )}

            {formData.assessmentType === 'delivery' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Type *</label>
                <select
                  name="deliveryType"
                  required
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  value={formData.deliveryType}
                  onChange={handleChange}
                >
                  <option value="text">Text Only</option>
                </select>
                <p className="text-xs text-gray-500 mt-2">Delivery activities only accept text submissions</p>
              </div>
            )}

            {formData.assessmentType !== 'announcement' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-gray-100 text-sm font-medium"
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
                    {gradeSheets.map((sheet) => (
                      <option key={sheet.id} value={sheet.id}>
                        {sheet.title}
                      </option>
                    ))}
                  </select>
                  {loadingSheets && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500" />
                  )}
                </div>
                {errorSheets && (
                  <p className="text-sm text-gray-500 mt-2">{errorSheets}</p>
                )}
                {hasMultipleCoursesSelected && (
                  <div className="mt-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        name="mapGradeSheetByTitle"
                        checked={Boolean(formData.mapGradeSheetByTitle)}
                        onChange={handleChange}
                        className="h-4 w-4 text-blue-600 rounded border-gray-300"
                      />
                      Link grade sheet by the same title in each selected course
                    </label>
                    <p className="text-xs text-gray-500">
                      Uses the selected reference grade sheet title and matches it in each course.
                    </p>
                  </div>
                )}
              </div>
            )}

            {formData.assessmentType === 'delivery' && (
              <div className="space-y-2 lg:col-span-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date *</label>
                  <input
                    type="date"
                    name="startDate"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.startDate}
                    onChange={handleChange}
                    min={getCurrentDate()}
                    max={getMaxDate()}
                  />
                  <p className="text-xs text-gray-500 mt-2">Date when students can start submitting</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Deadline *</label>
                  <input
                    type="date"
                    name="dueDate"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.dueDate}
                    onChange={handleChange}
                    min={formData.startDate || getCurrentDate()}
                    max={getMaxDate()}
                  />
                  <p className="text-xs text-gray-500 mt-2">Final submission deadline</p>
                </div>
              </div>
            )}

            {formData.assessmentType === 'assessment' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {formData.type === 'forum' ? 'Due Date (Optional)' : 'Due Date'}
                </label>
                <input
                  type="date"
                  name="dueDate"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  value={formData.dueDate}
                  onChange={handleChange}
                  min={getCurrentDate()}
                  max={getMaxDate()}
                />
                {formData.type === 'forum' && (
                  <p className="text-xs text-gray-500 mt-2">
                    This is separate from <strong>Forum Closes At</strong>.
                  </p>
                )}
              </div>
            )}

            {formData.assessmentType === 'announcement' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Expiration Date (Optional)</label>
                <input
                  type="date"
                  name="dueDate"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  value={formData.dueDate}
                  onChange={handleChange}
                  min={getCurrentDate()}
                  max={getMaxDate()}
                />
                <p className="text-xs text-gray-500 mt-2">Date when announcement expires (optional)</p>
              </div>
            )}

            {(formData.assessmentType === 'assessment' || formData.assessmentType === 'delivery') && (
              <div className="grid grid-cols-2 gap-4 lg:col-span-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Max Points *</label>
                  <input
                    type="number"
                    name="maxPoints"
                    required
                    min="0"
                    step="0.1"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    placeholder="4.5"
                    value={formData.maxPoints}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Passing Score *</label>
                  <input
                    type="number"
                    name="passingScore"
                    required
                    min="0"
                    step="0.1"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    placeholder="4.3"
                    value={formData.passingScore}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}

          </div>

          <div className="flex gap-3 pt-6 mt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white hover:shadow-lg font-medium transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditAssessmentModal({ assessment, courseId, onSubmit, onClose }: any) {
  const detectedPreset = detectForumPreset(assessment?.forumRequirements);
  const [formData, setFormData] = useState({
    name: assessment?.name || "",
    description: assessment?.description || "",
    type: assessment?.type || "exam",
    percentage: assessment?.percentage?.toString() || "",
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
    forumMainResponseMinWords: String(assessment?.forumRequirements?.mainResponseMinWords ?? FORUM_PRESETS.basic.mainResponseMinWords),
    forumPeerRepliesRequired: String(assessment?.forumRequirements?.peerRepliesRequired ?? FORUM_PRESETS.basic.peerRepliesRequired),
    forumPeerReplyCommentsRequired: String(assessment?.forumRequirements?.peerReplyCommentsRequired ?? FORUM_PRESETS.basic.peerReplyCommentsRequired),
    forumMainResponsesRequired: String(assessment?.forumRequirements?.mainResponsesRequired ?? FORUM_PRESETS.basic.mainResponsesRequired),
  });

  const [gradeSheets, setGradeSheets] = useState<GradeSheet[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
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

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRichTextChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const getCurrentDate = () => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] border border-gray-200">
        <div className="p-4 border-b bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Edit className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">Edit Assessment</h3>
                <p className="text-sm text-gray-500 mt-1">Update assessment details</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Assessment Type</label>
              <select
                name="assessmentType"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                value={formData.assessmentType}
                onChange={handleChange}
              >
                <option value="assessment">Regular Assessment</option>
                <option value="announcement">Announcement</option>
                <option value="delivery">Delivery Activity</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
              <input
                type="text"
                name="name"
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <RichTextEditor
                name="description"
                value={formData.description}
                onValueChange={handleRichTextChange}
                placeholder="Description (optional)"
              />
            </div>

            {formData.assessmentType === 'assessment' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type *</label>
                  <select
                    name="type"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Percentage *</label>
                  <input
                    type="number"
                    name="percentage"
                    required
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.percentage}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}

            {formData.assessmentType === 'assessment' && formData.type === 'forum' && (
              <div className="space-y-3 lg:col-span-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Forum Closes At</label>
                  <input
                    type="datetime-local"
                    name="forumCloseAt"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.forumCloseAt}
                    onChange={handleChange}
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    This controls forum locking. After this date/time, new comments and replies are blocked.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Forum Rules Preset</label>
                  <select
                    name="forumPreset"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Main Post Min Words</label>
                    <input
                      type="number"
                      name="forumMainResponseMinWords"
                      min="0"
                      step="1"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      value={formData.forumMainResponseMinWords}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Main Posts Required</label>
                    <input
                      type="number"
                      name="forumMainResponsesRequired"
                      min="1"
                      step="1"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      value={formData.forumMainResponsesRequired}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Replies to Peers</label>
                    <input
                      type="number"
                      name="forumPeerRepliesRequired"
                      min="0"
                      step="1"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      value={formData.forumPeerRepliesRequired}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Comments on Peer Replies</label>
                    <input
                      type="number"
                      name="forumPeerReplyCommentsRequired"
                      min="0"
                      step="1"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      value={formData.forumPeerReplyCommentsRequired}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>
            )}

            {formData.assessmentType === 'delivery' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Type</label>
                <select
                  name="deliveryType"
                  required
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  value={formData.deliveryType}
                  onChange={handleChange}
                >
                  <option value="text">Text Only</option>
                </select>
              </div>
            )}

            {formData.assessmentType !== 'announcement' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Grade Sheet</label>
                <div className="relative">
                  <select
                    name="gradeSheetId"
                    disabled={loadingSheets}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.gradeSheetId}
                    onChange={handleChange}
                  >
                    <option value="">No grade sheet</option>
                    {gradeSheets.map((sheet) => (
                      <option key={sheet.id} value={sheet.id}>
                        {sheet.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {formData.assessmentType === 'delivery' && (
              <div className="space-y-2 lg:col-span-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                  <input
                    type="date"
                    name="startDate"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.startDate}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Deadline</label>
                  <input
                    type="date"
                    name="dueDate"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.dueDate}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}

            {formData.assessmentType === 'assessment' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {formData.type === 'forum' ? 'Due Date (Optional)' : 'Due Date'}
                </label>
                <input
                  type="date"
                  name="dueDate"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  value={formData.dueDate}
                  onChange={handleChange}
                />
                {formData.type === 'forum' && (
                  <p className="text-xs text-gray-500 mt-2">
                    This is separate from <strong>Forum Closes At</strong>.
                  </p>
                )}
              </div>
            )}

            {formData.assessmentType === 'announcement' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Expiration Date</label>
                <input
                  type="date"
                  name="dueDate"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                  value={formData.dueDate}
                  onChange={handleChange}
                />
              </div>
            )}

            {(formData.assessmentType === 'assessment' || formData.assessmentType === 'delivery') && (
              <div className="grid grid-cols-2 gap-4 lg:col-span-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Max Points *</label>
                  <input
                    type="number"
                    name="maxPoints"
                    required
                    min="0"
                    step="0.1"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.maxPoints}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Passing Score *</label>
                  <input
                    type="number"
                    name="passingScore"
                    required
                    min="0"
                    step="0.1"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={formData.passingScore}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}

          </div>

          <div className="flex gap-3 pt-6 mt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white hover:shadow-lg font-medium transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Edit className="h-4 w-4" />
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  ); 
}

function DeleteConfirmationModal({ title, message, onConfirm, onCancel }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-200">
        <div className="text-center">
          <div className="h-20 w-20 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center border border-gray-200">
            <AlertCircle className="h-10 w-10 text-gray-600" />
          </div>
          
          <h3 className="font-bold text-xl text-gray-900 mb-3">{title}</h3>
          <p className="text-gray-600 mb-6">{message}</p>
          
          <div className="flex justify-center gap-3">
            <button
              onClick={onCancel}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-all duration-300"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-6 py-3 bg-gray-900 text-white rounded-xl hover:shadow-lg font-medium transition-all duration-300"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
