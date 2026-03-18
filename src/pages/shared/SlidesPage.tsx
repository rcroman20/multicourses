import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAccessibleCoursesForUser } from "@/lib/courseAccess";
import { unitService, weekService, slideService } from "@/lib/unitService";
import { notificationService } from "@/lib/services/notificationService";
import { isNotificationAutomationEnabled } from "@/lib/services/notificationAutomation";
import {
  Presentation,
  ChevronDown,
  ExternalLink,
  ChevronRight,
  FolderOpen,
  Plus,
  Trash2,
  X,
  Save,
  BookOpen,
  Calendar,
  FileText,
  Loader2,
  AlertTriangle,
  Search,
  Sparkles,
  Copy,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TEACHER_ONBOARDING_COURSE_CODE } from "@/lib/services/teacherOnboardingService";

const modalInputClass =
  "w-full rounded-xl border border-slate-200/60 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100";
const modalLabelClass = "mb-2 block text-sm font-semibold text-slate-700";
const modalSecondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";
const modalPrimaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60";

export default function SlidesPage() {
  const { user } = useAuth();
  const { courses, units: contextUnits, selectedCourseId, setSelectedCourseId } = useAcademic();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [expandedUnits, setExpandedUnits] = useState<string[]>([]);
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUnitFilter, setSelectedUnitFilter] = useState("");
  const [showCourseStructure, setShowCourseStructure] = useState(false);
  const [courseBackfillExecuted, setCourseBackfillExecuted] = useState<string[]>([]);
  const latestUnitsRequestRef = useRef(0);

  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showWeekModal, setShowWeekModal] = useState(false);
  const [showSlideModal, setShowSlideModal] = useState(false);
  const [creatingSlide, setCreatingSlide] = useState(false);

  const [unitForm, setUnitForm] = useState({
    name: "",
    description: "",
    order: 0,
  });
  const [weekForm, setWeekForm] = useState({
    number: 1,
    topic: "",
    unitId: "",
  });
  const [slideForm, setSlideForm] = useState({
    title: "",
    description: "",
    canvaUrl: "",
    weekId: "",
    order: 0,
  });

  const isTeacher = user?.role === "docente";
  const isAdmin = user?.role === "admin";

  const userCourses = useMemo(() => {
    if (!user) return [];
    return getAccessibleCoursesForUser(courses, user, {
      includeAllForAdmin: isAdmin,
      includeEnrolledForTeacher: isTeacher,
    });
  }, [courses, user, isAdmin, isTeacher]);

  const selectedCourse = useMemo(
    () => userCourses.find((c) => c.id === selectedCourseId),
    [userCourses, selectedCourseId],
  );
  const selectedCourseRecord = selectedCourse
    ? (selectedCourse as unknown as Record<string, unknown>)
    : null;
  const isOnboardingCourse =
    String(selectedCourse?.code || "")
      .trim()
      .toUpperCase() === TEACHER_ONBOARDING_COURSE_CODE;
  const isMandatoryCourse =
    isOnboardingCourse ||
    Boolean(
      selectedCourseRecord?.isMandatory ||
        selectedCourseRecord?.mandatory ||
        selectedCourseRecord?.required ||
        selectedCourseRecord?.isRequired ||
        selectedCourseRecord?.isMandatoryForTeachers ||
        selectedCourseRecord?.mandatoryForTeachers ||
        selectedCourseRecord?.mandatoryTeacherCourse ||
        selectedCourseRecord?.requiredForTeachers ||
        selectedCourseRecord?.requiredForDocentes ||
        selectedCourseRecord?.obligatorio ||
        selectedCourseRecord?.obligatorioDocentes ||
        selectedCourseRecord?.obligatorioParaDocentes ||
        selectedCourseRecord?.onboarding ||
        selectedCourseRecord?.isOnboarding,
    );
  const canManageContent =
    isAdmin || (isTeacher && selectedCourse?.teacherId === user?.id && !isMandatoryCourse);

  useEffect(() => {
    if (userCourses.length === 0) {
      if (selectedCourseId) setSelectedCourseId("");
      return;
    }

    if (!selectedCourseId || !userCourses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(userCourses[0].id);
    }
  }, [selectedCourseId, setSelectedCourseId, userCourses]);

  useEffect(() => {
    if (selectedCourseId) {
      const filteredUnits = contextUnits.filter(
        (u) => u.courseId === selectedCourseId,
      );
      setUnits(filteredUnits);
    }
  }, [contextUnits, selectedCourseId]);

  useEffect(() => {
    const targetCourseId = searchParams.get("courseId")?.trim();
    if (!targetCourseId) return;
    if (targetCourseId === selectedCourseId) return;
    if (!userCourses.some((course) => course.id === targetCourseId)) return;

    setSelectedCourseId(targetCourseId);
  }, [searchParams, selectedCourseId, setSelectedCourseId, userCourses]);

  const handleCourseChange = (courseId: string) => {
    latestUnitsRequestRef.current += 1;
    setSelectedCourseId(courseId);
    setSelectedUnitFilter("");
    setShowCourseStructure(false);

    setExpandedUnits([]);
    setExpandedWeeks([]);
    setUnits([]);
    setLoading(false);
  };

  const loadUnits = async (courseIdOverride?: string) => {
    const targetCourseId = String(courseIdOverride || selectedCourseId || "").trim();
    if (!targetCourseId) return;

    const requestId = latestUnitsRequestRef.current + 1;
    latestUnitsRequestRef.current = requestId;
    setLoading(true);
    try {
      const loadedUnits = await unitService.getByCourse(targetCourseId);
      if (requestId !== latestUnitsRequestRef.current) return;
      setUnits(loadedUnits);
    } catch {
    } finally {
      if (requestId !== latestUnitsRequestRef.current) return;
      setLoading(false);
    }
  };

  useEffect(() => {
    latestUnitsRequestRef.current += 1;
    setLoading(false);
  }, [selectedCourseId]);

  useEffect(() => {
    if (!canManageContent || !selectedCourseId) return;
    if (courseBackfillExecuted.includes(selectedCourseId)) return;

    let mounted = true;

    const runBackfill = async () => {
      try {
        await unitService.backfillCourseContentCourseIds(selectedCourseId);
      } catch {
      }

      if (!mounted) return;
      setCourseBackfillExecuted((prev) =>
        prev.includes(selectedCourseId) ? prev : [...prev, selectedCourseId],
      );
      await loadUnits(selectedCourseId);
    };

    void runBackfill();

    return () => {
      mounted = false;
    };
  }, [canManageContent, courseBackfillExecuted, selectedCourseId]);

  useEffect(() => {
    const targetCourseId = searchParams.get("courseId")?.trim();
    const targetWeekId = searchParams.get("weekId")?.trim();
    const targetSlideId = searchParams.get("slideId")?.trim();

    if (!targetWeekId && !targetSlideId) return;
    if (targetCourseId && targetCourseId !== selectedCourseId) return;

    for (const unit of units) {
      for (const week of unit.weeks || []) {
        const weekMatches = targetWeekId ? week.id === targetWeekId : false;
        const matchedSlide = targetSlideId
          ? (week.slides || []).find((slide: any) => slide.id === targetSlideId)
          : null;

        if (!weekMatches && !matchedSlide) continue;

        setExpandedUnits((prev) =>
          prev.includes(unit.id) ? prev : [...prev, unit.id],
        );
        setExpandedWeeks((prev) =>
          prev.includes(week.id) ? prev : [...prev, week.id],
        );

        return;
      }
    }
  }, [searchParams, selectedCourseId, units]);

  const toggleUnit = (unitId: string) => {
    setExpandedUnits((prev) =>
      prev.includes(unitId)
        ? prev.filter((id) => id !== unitId)
        : [...prev, unitId],
    );
  };

  const toggleWeek = (weekId: string) => {
    setExpandedWeeks((prev) =>
      prev.includes(weekId)
        ? prev.filter((id) => id !== weekId)
        : [...prev, weekId],
    );
  };

  const getNextWeekNumber = (weeks: any[]): number => {
    const numericWeekNumbers = (weeks || [])
      .map((week: any) => Number(week?.number))
      .filter((value) => Number.isInteger(value));

    if (numericWeekNumbers.length === 0) return 1;
    return Math.max(...numericWeekNumbers) + 1;
  };

  const allSlides = useMemo(() => {
    const slides: any[] = [];
    units.forEach((unit) => {
      (unit.weeks || []).forEach((week: any) => {
        (week.slides || []).forEach((slide: any) => {
          slides.push({
            ...slide,
            unitId: unit.id,
            weekNumber: week.number,
            weekTopic: week.topic,
            unitName: unit.name,
          });
        });
      });
    });
    return slides;
  }, [units]);

  const filteredSlides = useMemo(() => {
    if (!searchTerm) return allSlides;

    const searchLower = searchTerm.toLowerCase();
    return allSlides.filter(
      (slide) =>
        slide.title.toLowerCase().includes(searchLower) ||
        slide.description?.toLowerCase().includes(searchLower) ||
        slide.unitName.toLowerCase().includes(searchLower) ||
        slide.weekTopic?.toLowerCase().includes(searchLower) ||
        slide.canvaUrl?.toLowerCase().includes(searchLower),
    );
  }, [allSlides, searchTerm]);

  const isValidUrl = (urlString: string): boolean => {
    try {
      const url = new URL(urlString);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  };

  const normalizeResourceUrl = (value: string): string => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const getResourceHost = (value: string): string => {
    const normalized = normalizeResourceUrl(value);
    if (!isValidUrl(normalized)) return "Invalid link";

    try {
      return new URL(normalized).hostname.replace(/^www\./, "");
    } catch {
      return "Invalid link";
    }
  };

  const getCompactResourceLabel = (value: string): string => {
    const original = String(value || "").trim();
    if (!original) return "No link provided";

    const normalized = normalizeResourceUrl(original);
    const compact = (text: string, max = 42) =>
      text.length <= max ? text : `${text.slice(0, max - 1)}...`;

    if (!isValidUrl(normalized)) return compact(original);

    try {
      const url = new URL(normalized);
      const host = url.hostname.replace(/^www\./, "");
      const path = url.pathname.replace(/\/+$/, "");
      return compact(`${host}${path}`);
    } catch {
      return compact(original);
    }
  };

  const sortedSlides = useMemo(
    () =>
      [...filteredSlides].sort((a, b) => {
        const unitCompare = String(a.unitName || "").localeCompare(String(b.unitName || ""));
        if (unitCompare !== 0) return unitCompare;

        const weekA = Number(a.weekNumber) || 0;
        const weekB = Number(b.weekNumber) || 0;
        if (weekA !== weekB) return weekA - weekB;

        const orderA = Number(a.order) || 0;
        const orderB = Number(b.order) || 0;
        if (orderA !== orderB) return orderA - orderB;

        return String(a.title || "").localeCompare(String(b.title || ""));
      }),
    [filteredSlides],
  );

  const unitFilterOptions = useMemo(
    () =>
      [...units]
        .sort((a: any, b: any) => {
          const bTime = new Date(b?.createdAt || b?.id || 0).getTime();
          const aTime = new Date(a?.createdAt || a?.id || 0).getTime();
          return bTime - aTime;
        })
        .map((unit: any) => ({
          id: String(unit?.id || ""),
          name: String(unit?.name || "Without unit"),
        })),
    [units],
  );

  useEffect(() => {
    if (!selectedUnitFilter) return;
    const filterStillAvailable = unitFilterOptions.some((unit) => unit.id === selectedUnitFilter);
    if (!filterStillAvailable) {
      setSelectedUnitFilter("");
    }
  }, [selectedUnitFilter, unitFilterOptions]);

  const unitRecencyRank = useMemo(() => {
    const rank = new Map<string, number>();

    [...units]
      .sort((a: any, b: any) => {
        const bTime = new Date(b?.createdAt || b?.id || 0).getTime();
        const aTime = new Date(a?.createdAt || a?.id || 0).getTime();
        return bTime - aTime;
      })
      .forEach((unit: any, index: number) => {
        const unitId = String(unit?.id || "").trim();
        if (unitId) rank.set(unitId, index);
      });

    return rank;
  }, [units]);

  const slidesGroupedByUnit = useMemo(() => {
    const grouped = new Map<
      string,
      { unitId: string; unitName: string; slides: any[] }
    >();

    sortedSlides.forEach((slide) => {
      const unitName =
        String(slide.unitName || "Without unit").trim() || "Without unit";
      const unitId = String(slide.unitId || "").trim() || `unknown:${unitName}`;

      if (!grouped.has(unitId)) {
        grouped.set(unitId, { unitId, unitName, slides: [] });
      }
      grouped.get(unitId)?.slides.push(slide);
    });

    const fallbackRank = unitRecencyRank.size + 1000;

    return Array.from(grouped.values()).sort((a, b) => {
      const rankA = unitRecencyRank.get(a.unitId) ?? fallbackRank;
      const rankB = unitRecencyRank.get(b.unitId) ?? fallbackRank;
      if (rankA !== rankB) return rankA - rankB;
      return a.unitName.localeCompare(b.unitName);
    });
  }, [sortedSlides, unitRecencyRank]);

  const visibleSlidesByUnit = useMemo(() => {
    if (!selectedUnitFilter) return slidesGroupedByUnit;
    return slidesGroupedByUnit.filter((group) => group.unitId === selectedUnitFilter);
  }, [selectedUnitFilter, slidesGroupedByUnit]);

  const visibleSlidesCount = useMemo(
    () =>
      visibleSlidesByUnit.reduce(
        (acc, group) => acc + (Array.isArray(group.slides) ? group.slides.length : 0),
        0,
      ),
    [visibleSlidesByUnit],
  );

  const selectedUnitFilterLabel = useMemo(
    () => unitFilterOptions.find((unit) => unit.id === selectedUnitFilter)?.name || "",
    [selectedUnitFilter, unitFilterOptions],
  );

  const emptySlidesMessage = useMemo(() => {
    if (allSlides.length === 0) {
      return canManageContent
        ? "Create your first slide to populate this library."
        : "Your teacher has not published slides yet.";
    }

    if (selectedUnitFilter && searchTerm) {
      return `No results in ${selectedUnitFilterLabel || "the selected unit"} for the current search term.`;
    }

    if (selectedUnitFilter) {
      return `No slides found in ${selectedUnitFilterLabel || "the selected unit"}. Try All units.`;
    }

    if (searchTerm) {
      return "No results for the current search term.";
    }

    return "No slides match the active filters.";
  }, [allSlides.length, canManageContent, searchTerm, selectedUnitFilter, selectedUnitFilterLabel]);

  const linkedSlidesCount = useMemo(
    () =>
      allSlides.filter((slide) => {
        const normalized = normalizeResourceUrl(slide.canvaUrl || "");
        return isValidUrl(normalized);
      }).length,
    [allSlides],
  );

  const handleCreateUnit = async () => {
    if (!selectedCourseId) return;

    try {
      await unitService.create({
        ...unitForm,
        courseId: selectedCourseId,
      });
      setShowUnitModal(false);
      setUnitForm({ name: "", description: "", order: 0 });
      await loadUnits();
    } catch {}
  };

  const handleCreateWeek = async () => {
    if (!weekForm.unitId || !weekForm.topic.trim()) return;

    const parsedWeekNumber = Number(weekForm.number);
    if (!Number.isInteger(parsedWeekNumber) || parsedWeekNumber < 0) {
      alert("Week number must be an integer greater than or equal to 0.");
      return;
    }

    try {
      await weekService.create({
        ...weekForm,
        number: parsedWeekNumber,
        topic: weekForm.topic.trim(),
      });
      setShowWeekModal(false);
      setWeekForm({ number: 1, topic: "", unitId: "" });
      await loadUnits();
    } catch {}
  };

  const handleUpdateWeekNumber = async (
    weekId: string,
    currentNumber: number,
  ) => {
    const input = prompt("Enter the new week number", String(currentNumber));
    if (input === null) return;

    const parsedWeekNumber = Number(input.trim());
    if (!Number.isInteger(parsedWeekNumber) || parsedWeekNumber < 0) {
      alert("Week number must be an integer greater than or equal to 0.");
      return;
    }

    try {
      await weekService.update(weekId, { number: parsedWeekNumber });
      await loadUnits();
    } catch {}
  };

  const handleCreateSlide = async () => {
    if (!slideForm.weekId || !selectedCourseId || !user?.id || creatingSlide) return;

    setCreatingSlide(true);
    try {
      await slideService.create(slideForm);

      if (selectedCourse && isNotificationAutomationEnabled(user.id, "newMaterial")) {
        const recipientIds = (selectedCourse.enrolledStudents || []).filter(
          (entry): entry is string => typeof entry === "string" && entry.length > 0,
        );
        if (recipientIds.length > 0) {
          await Promise.all(
            recipientIds.map((studentId) =>
              notificationService.createNotification(studentId, {
                title: "New slide available",
                message: `"${slideForm.title}" was uploaded in ${selectedCourse.name}.`,
                type: "success",
                link: "/slides",
              }),
            ),
          );
        }
      }

      setShowSlideModal(false);
      setSlideForm({
        title: "",
        description: "",
        canvaUrl: "",
        weekId: "",
        order: 0,
      });
      await loadUnits();
    } catch {}
    finally {
      setCreatingSlide(false);
    }
  };

  const closeUnitModal = () => {
    setShowUnitModal(false);
    setUnitForm({ name: "", description: "", order: 0 });
  };

  const closeWeekModal = () => {
    setShowWeekModal(false);
    setWeekForm({ number: 1, topic: "", unitId: "" });
  };

  const closeSlideModal = () => {
    setShowSlideModal(false);
    setSlideForm({
      title: "",
      description: "",
      canvaUrl: "",
      weekId: "",
      order: 0,
    });
  };

  const handleDeleteUnit = async (unitId: string) => {
    if (!confirm("¿Estás seguro de eliminar esta unidad y todo su contenido?"))
      return;

    try {
      await unitService.delete(unitId);
      await loadUnits();
    } catch {}
  };

  const handleDeleteWeek = async (weekId: string) => {
    if (
      !confirm(
        "¿Estás seguro de eliminar esta semana y todas sus diapositivas?",
      )
    )
      return;

    try {
      await weekService.delete(weekId);
      await loadUnits();
    } catch {}
  };

  const handleDeleteSlide = async (slideId: string) => {
    if (!confirm("¿Estás seguro de eliminar esta diapositiva?")) return;

    try {
      await slideService.delete(slideId);
      await loadUnits();
    } catch {}
  };
  const totalWeeks = useMemo(
    () =>
      units.reduce(
        (acc, unit) => acc + (Array.isArray(unit?.weeks) ? unit.weeks.length : 0),
        0,
      ),
    [units],
  );

  if (loading && selectedCourseId) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="space-y-2 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                <p className="text-lg font-semibold text-slate-900">Loading slides</p>
                <p className="text-sm text-slate-600">Preparing your study materials.</p>
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
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-slate-50/70 p-4 shadow-sm">
              <div>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                        Slides Workspace
                      </span>
                    </div>
                    <h1 className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">
                      Presentation control center
                    </h1>
                    <p className="mt-1 max-w-3xl text-sm text-slate-600">
                      Organize units and weeks, and share slides from any link source in one place.
                    </p>
                  </div>
                  {canManageContent && (
                    <button
                      type="button"
                      onClick={() => setShowUnitModal(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <Plus className="h-4 w-4 text-sky-600" />
                      New unit
                    </button>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <BookOpen className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-bold leading-tight text-slate-900">{units.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">Units</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-bold leading-tight text-slate-900">{totalWeeks}</p>
                    </div>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">Weeks</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <Presentation className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-bold leading-tight text-slate-900">{allSlides.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">Slides</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <ExternalLink className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-bold leading-tight text-slate-900">{linkedSlidesCount}</p>
                    </div>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">Valid links</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/60 bg-white p-3 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1 flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search slides, topics, units..."
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200/60 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all text-sm font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm("")}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="relative min-w-[180px]">
                    <select
                      value={selectedUnitFilter}
                      onChange={(e) => setSelectedUnitFilter(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-300/60 bg-white px-3 pr-9 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    >
                      <option value="">All units</option>
                      {unitFilterOptions.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                  <div className="relative min-w-[180px]">
                    <select
                      value={selectedCourseId}
                      onChange={(e) => handleCourseChange(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-300/60 bg-white px-3 pr-9 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    >
                      {userCourses.length === 0 ? (
                        <option value="">No courses available</option>
                      ) : (
                        <>
                          <option value="">Select a course...</option>
                          {userCourses
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((course) => (
                              <option key={course.id} value={course.id}>
                                {course.code}
                              </option>
                            ))}
                        </>
                      )}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
                {selectedCourseId && (
                  <button
                    type="button"
                    onClick={() => setShowCourseStructure((prev) => !prev)}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300/60 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    {showCourseStructure ? "Hide structure" : "Show structure"}
                  </button>
                )}
              </div>

              {(searchTerm || selectedUnitFilter) && visibleSlidesCount > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200/60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-sky-600">
                        Showing {visibleSlidesCount} slide
                        {visibleSlidesCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setSearchTerm("");
                        setSelectedUnitFilter("");
                      }}
                      className="text-sm text-slate-600 hover:text-slate-800 font-medium"
                    >
                      Clear filters
                    </button>
                  </div>
                </div>
              )}

              {(searchTerm || selectedUnitFilter) && visibleSlidesCount === 0 && allSlides.length > 0 && (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300/60 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-700">No matching slides</p>
                  <p className="text-xs text-slate-500">Try another term, another unit, or clear the filters.</p>
                </div>
              )}
            </section>

        {!selectedCourseId && userCourses.length === 0 && (
          <div className="rounded-2xl border border-slate-200/60 bg-white p-8 text-center shadow-sm">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Presentation className="h-10 w-10 text-slate-400" />
            </div>
            <h3 className="font-bold text-xl mb-3 text-slate-900">
              No courses available
            </h3>
            <p className="text-slate-500 max-w-md mx-auto mb-6">
              {isAdmin
                ? "No courses created yet. Create a course to start organizing slides."
                : isTeacher
                  ? "You have no courses assigned as a teacher. Contact the administrator."
                  : "You are not enrolled in any course. Contact your teacher."}
            </p>
            {(isTeacher || isAdmin) && (
              <button
                type="button"
                onClick={() => navigate("/courses/create")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 text-white font-medium hover:shadow-lg transition-all duration-300"
              >
                <Plus className="h-4 w-4" />
                {isAdmin ? "Create course" : "Request Course Assignment"}
              </button>
            )}
          </div>
        )}

        {selectedCourseId && (
          <div className="space-y-6">
            {showCourseStructure && (
              <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-sky-100 flex items-center justify-center">
                      <FolderOpen className="h-4 w-4 text-sky-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Course Content
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {selectedCourse?.name}
                      </p>
                    </div>
                  </div>
                </div>

                <div className=" pr-2">
                  {units.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                        <FolderOpen className="h-8 w-8 text-slate-400" />
                      </div>
                      <p className="text-slate-500 font-medium">
                        No content available
                      </p>
                      {canManageContent && (
                        <button
                          onClick={() => setShowUnitModal(true)}
                          className="inline-flex items-center gap-2 mt-4 px-4 py-2.5 bg-sky-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                        >
                          <Plus className="h-4 w-4" />
                          Create first unit
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {units
                        .sort((a: any, b: any) => {
                          return (
                            new Date(b.createdAt || b.id).getTime() -
                            new Date(a.createdAt || a.id).getTime()
                          );
                        })
                        .map((unit) => (
                          <div
                            key={unit.id}
                            className="border border-slate-200/60 rounded-xl overflow-hidden hover:border-slate-300/60 transition-all duration-300 hover:shadow-sm"
                          >
                            <div className="flex items-center justify-between p-3 bg-white hover:bg-slate-100 transition-all duration-300">
                              <button
                                onClick={() => toggleUnit(unit.id)}
                                className="flex-1 flex items-center justify-between text-left group"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-lg bg-sky-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <BookOpen className="h-4 w-4 text-sky-600" />
                                  </div>
                                  <div>
                                    <span className="font-semibold text-sm block text-left text-slate-900">
                                      {unit.name}
                                    </span>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-xs px-1.5 py-0.5 bg-sky-50 text-sky-700 rounded">
                                        {(unit.weeks || []).length} weeks
                                      </span>
                                      <span className="text-xs text-slate-500">
                                        •{" "}
                                        {(unit.weeks || []).reduce(
                                          (acc: number, week: any) =>
                                            acc + (week.slides?.length || 0),
                                          0,
                                        )}{" "}
                                        slides
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <ChevronRight
                                  className={cn(
                                    "h-4 w-4 text-slate-400 transition-transform duration-300",
                                    expandedUnits.includes(unit.id) &&
                                      "rotate-90",
                                  )}
                                />
                              </button>
                              {canManageContent && (
                                <div className="flex gap-1 ml-3">
                                  <button
                                    onClick={() => {
                                      setWeekForm({
                                        number: getNextWeekNumber(unit.weeks || []),
                                        topic: "",
                                        unitId: unit.id,
                                      });
                                      setShowWeekModal(true);
                                    }}
                                    className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors hover:scale-110"
                                    title="Add week"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteUnit(unit.id)}
                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors hover:scale-110"
                                    title="Delete unit"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>

                            {expandedUnits.includes(unit.id) && (
                              <div className="border-t border-slate-200/60 bg-slate-50/30 p-3 space-y-2">
                                {(unit.weeks || []).length === 0 ? (
                                  <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-100">
                                    <Calendar className="h-4 w-4 text-slate-400" />
                                    <p className="text-xs text-slate-500">
                                      No weeks available
                                    </p>
                                    {canManageContent && (
                                      <button
                                        onClick={() => {
                                          setWeekForm({
                                            number: getNextWeekNumber(unit.weeks || []),
                                            topic: "",
                                            unitId: unit.id,
                                          });
                                          setShowWeekModal(true);
                                        }}
                                        className="ml-auto p-1 text-sky-600 hover:bg-sky-50 rounded transition-colors hover:scale-110"
                                        title="Add week"
                                      >
                                        <Plus className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  (unit.weeks || [])
                                    .sort(
                                      (a: any, b: any) => b.number - a.number,
                                    )
                                    .map((week: any) => (
                                      <div
                                        key={week.id}
                                        className="space-y-2"
                                      >
                                        <div className="flex items-center justify-between rounded-lg border border-slate-200/60 bg-white px-3 py-2 transition-colors hover:border-slate-300/60">
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() =>
                                                toggleWeek(week.id)
                                              }
                                              className="flex items-center gap-2 hover:text-sky-600 transition-colors group"
                                            >
                                              <ChevronRight
                                                className={cn(
                                                  "h-4 w-4 text-slate-400 transition-transform duration-300",
                                                  expandedWeeks.includes(
                                                    week.id,
                                                  ) && "rotate-90",
                                                )}
                                              />
                                              <Calendar className="h-4 w-4 text-slate-400 group-hover:text-sky-500" />
                                            </button>
                                            <div className="text-left">
                                              <p className="text-xs font-semibold text-slate-900">
                                                Week {week.number}
                                              </p>
                                              <p className="text-xs text-slate-500 truncate max-w-[140px]">
                                                {week.topic}
                                              </p>
                                            </div>
                                          </div>
                                          {canManageContent && (
                                            <div className="flex gap-1">
                                              <button
                                                onClick={() =>
                                                  handleUpdateWeekNumber(
                                                    week.id,
                                                    Number(week.number) || 0,
                                                  )
                                                }
                                                className="p-1 text-amber-600 hover:bg-amber-50 rounded transition-colors hover:scale-110"
                                                title="Edit week number"
                                              >
                                                <Pencil className="h-4 w-4" />
                                              </button>
                                              <button
                                                onClick={() => {
                                                  setSlideForm({
                                                    title: "",
                                                    description: "",
                                                    canvaUrl: "",
                                                    weekId: week.id,
                                                    order: 0,
                                                  });
                                                  setShowSlideModal(true);
                                                }}
                                                className="p-1 text-sky-600 hover:bg-sky-50 rounded transition-colors hover:scale-110"
                                                title="Add slide"
                                              >
                                                <Plus className="h-4 w-4" />
                                              </button>
                                              <button
                                                onClick={() =>
                                                  handleDeleteWeek(week.id)
                                                }
                                                className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors hover:scale-110"
                                                title="Delete week"
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </button>
                                            </div>
                                          )}
                                        </div>

                                        {expandedWeeks.includes(week.id) && (
                                          <div className="pl-6 border-l border-slate-200/60 space-y-2">
                                            {(week.slides || []).length ===
                                            0 ? (
                                              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg">
                                                <FileText className="h-4 w-4 text-slate-400" />
                                                <p className="text-xs text-slate-500">
                                                  No slides available
                                                </p>
                                                {canManageContent && (
                                                  <button
                                                    onClick={() => {
                                                      setSlideForm({
                                                        title: "",
                                                        description: "",
                                                        canvaUrl: "",
                                                        weekId: week.id,
                                                        order: 0,
                                                      });
                                                      setShowSlideModal(true);
                                                    }}
                                                    className="ml-auto p-1 text-slate-600 hover:bg-slate-50 rounded transition-colors hover:scale-110"
                                                    title="Add slide"
                                                  >
                                                    <Plus className="h-4 w-4" />
                                                  </button>
                                                )}
                                              </div>
                                            ) : (
                                              (week.slides || [])
                                                .sort(
                                                  (a: any, b: any) =>
                                                    b.order - a.order,
                                                )
                                                .map((slide: any) => {
                                                  const resourceUrl = normalizeResourceUrl(slide.canvaUrl || "");
                                                  const hasValidResource = isValidUrl(resourceUrl);

                                                  return (
                                                    <div
                                                      key={slide.id}
                                                      className="group flex items-center gap-2 rounded-lg border border-slate-200/60 bg-white transition-colors hover:border-sky-200"
                                                    >
                                                      <div className="flex-1 flex items-center gap-3 px-3 py-2">
                                                        <Presentation className="h-4 w-4 shrink-0 text-slate-600 group-hover:text-sky-500 transition-colors" />
                                                        <div className="flex-1 min-w-0">
                                                          <span className="text-xs font-medium text-slate-900 truncate block">
                                                            {slide.title}
                                                          </span>
                                                          {slide.description && (
                                                            <p className="text-xs text-slate-500 truncate mt-0.5">
                                                              {slide.description}
                                                            </p>
                                                          )}
                                                        </div>
                                                      </div>
                                                      {hasValidResource && (
                                                        <a
                                                          href={resourceUrl}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          className="p-2 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                                                          title="Open resource"
                                                        >
                                                          <ExternalLink className="h-4 w-4" />
                                                        </a>
                                                      )}
                                                      {canManageContent && (
                                                        <button
                                                          onClick={() =>
                                                            handleDeleteSlide(
                                                              slide.id,
                                                            )
                                                          }
                                                          className="p-2 text-red-600 hover:bg-red-50 rounded-r-lg transition-colors hover:scale-110"
                                                          title="Delete slide"
                                                        >
                                                          <Trash2 className="h-4 w-4" />
                                                        </button>
                                                      )}
                                                    </div>
                                                  );
                                                })
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ))
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
                <div className="px-5 py-4 border-b border-slate-200/60 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Slides Library</h3>
                      <p className="text-xs text-slate-500">Cards with full slide details and external resource links.</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                      {visibleSlidesCount} visible
                    </span>
                  </div>
                </div>

                <div className="p-4">
                  {visibleSlidesCount === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-8 text-center">
                      <h4 className="text-base font-semibold text-slate-900">No slides to display</h4>
                      <p className="mt-1 text-sm text-slate-500">{emptySlidesMessage}</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {visibleSlidesByUnit.map((group) => (
                        <section key={group.unitId} className="space-y-3">
                          <div className="flex items-center justify-between gap-3 border-b border-slate-200/60 pb-2">
                            <h4 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                              {group.unitName}
                            </h4>
                            <span className="inline-flex items-center rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              {group.slides.length} slide{group.slides.length !== 1 ? "s" : ""}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {group.slides.map((slide: any) => {
                              const resourceUrl = normalizeResourceUrl(slide.canvaUrl || "");
                              const hasValidResource = isValidUrl(resourceUrl);
                              const resourceHost = getResourceHost(slide.canvaUrl || "");

                              return (
                                <article
                                  key={slide.id}
                                  className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm transition hover:border-sky-200 hover:shadow-md"
                                >
                                  <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                                      Week {slide.weekNumber}
                                    </span>
                                    <span
                                      className={cn(
                                        "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                                        hasValidResource
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                          : "border-amber-200 bg-amber-50 text-amber-700",
                                      )}
                                    >
                                      {resourceHost}
                                    </span>
                                  </div>

                                  <h4 className="text-base font-bold text-slate-900">{slide.title}</h4>
                                  {slide.description && (
                                    <p className="mt-1 text-sm text-slate-600">{slide.description}</p>
                                  )}

                                  <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                                    <p>
                                      Topic:{" "}
                                      <span className="font-medium text-slate-700">{slide.weekTopic || "No topic specified"}</span>
                                    </p>
                                    <p className="truncate">
                                      Link:{" "}
                                      <span
                                        className="font-medium text-slate-700"
                                        title={slide.canvaUrl || "No link provided"}
                                      >
                                        {getCompactResourceLabel(slide.canvaUrl || "")}
                                      </span>
                                    </p>
                                  </div>

                                  <div className="mt-4 flex flex-wrap items-center gap-2">
                                    {hasValidResource ? (
                                      <a
                                        href={resourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700 transition hover:bg-sky-100"
                                        title="Open link"
                                        aria-label="Open link"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        Invalid link
                                      </span>
                                    )}

                                    {hasValidResource && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard
                                            .writeText(resourceUrl)
                                            .then(() => alert("Link copied to clipboard!"))
                                            .catch(() => alert("Could not copy the link."));
                                        }}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/60 bg-white text-slate-700 transition hover:bg-slate-50"
                                        title="Copy link"
                                        aria-label="Copy link"
                                      >
                                        <Copy className="h-3.5 w-3.5" />
                                      </button>
                                    )}

                                    {canManageContent && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteSlide(slide.id)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100"
                                        title="Delete slide"
                                        aria-label="Delete slide"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
        )}

        {showUnitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
              <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Create New Unit</h3>
                    <p className="text-sm text-slate-600">Add a new unit to organize your content.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeUnitModal}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/60 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 p-6">
                <div>
                  <label className={modalLabelClass}>Unit Name *</label>
                  <input
                    type="text"
                    className={modalInputClass}
                    value={unitForm.name}
                    onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                    placeholder="Unit name"
                  />
                </div>

                <div>
                  <label className={modalLabelClass}>Description</label>
                  <textarea
                    className={cn(modalInputClass, "min-h-[96px] resize-y")}
                    value={unitForm.description}
                    onChange={(e) => setUnitForm({ ...unitForm, description: e.target.value })}
                    placeholder="Optional description"
                  />
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeUnitModal} className={modalSecondaryButtonClass}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateUnit}
                    disabled={!unitForm.name.trim()}
                    className={modalPrimaryButtonClass}
                  >
                    <Save className="h-4 w-4" />
                    <span>Create Unit</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showWeekModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
              <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Add New Week</h3>
                    <p className="text-sm text-slate-600">Organize slides by week and topic.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeWeekModal}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/60 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 p-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={modalLabelClass}>Week Number *</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className={modalInputClass}
                      value={weekForm.number}
                      onChange={(e) =>
                        setWeekForm({
                          ...weekForm,
                          number: Number(e.target.value),
                        })
                      }
                      placeholder="Week number"
                    />
                  </div>
                  <div>
                    <label className={modalLabelClass}>Week Topic *</label>
                    <input
                      type="text"
                      className={modalInputClass}
                      value={weekForm.topic}
                      onChange={(e) => setWeekForm({ ...weekForm, topic: e.target.value })}
                      placeholder="Week topic"
                    />
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeWeekModal} className={modalSecondaryButtonClass}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateWeek}
                    disabled={
                      !weekForm.topic.trim() ||
                      !Number.isInteger(Number(weekForm.number)) ||
                      Number(weekForm.number) < 0
                    }
                    className={modalPrimaryButtonClass}
                  >
                    <Save className="h-4 w-4" />
                    <span>Add Week</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showSlideModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
              <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                    <Presentation className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Add New Slide</h3>
                    <p className="text-sm text-slate-600">Share any presentation or resource link with your class.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeSlideModal}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/60 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 p-6">
                <div>
                  <label className={modalLabelClass}>Slide Title *</label>
                  <input
                    type="text"
                    className={modalInputClass}
                    value={slideForm.title}
                    onChange={(e) => setSlideForm({ ...slideForm, title: e.target.value })}
                    placeholder="Slide title"
                  />
                </div>

                <div>
                  <label className={modalLabelClass}>Description</label>
                  <textarea
                    className={cn(modalInputClass, "min-h-[96px] resize-y")}
                    value={slideForm.description}
                    onChange={(e) => setSlideForm({ ...slideForm, description: e.target.value })}
                    placeholder="Optional context for students"
                  />
                </div>

                <div>
                  <label className={modalLabelClass}>Resource URL *</label>
                  <input
                    type="url"
                    className={modalInputClass}
                    value={slideForm.canvaUrl}
                    onChange={(e) => setSlideForm({ ...slideForm, canvaUrl: e.target.value })}
                    placeholder="https://..."
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    You can paste Canva, Google Slides, YouTube, Drive, or any public https:// link.
                  </p>
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeSlideModal} className={modalSecondaryButtonClass}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateSlide}
                    disabled={!slideForm.title.trim() || !slideForm.canvaUrl.trim() || creatingSlide}
                    className={modalPrimaryButtonClass}
                  >
                    {creatingSlide ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Adding...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>Add Slide</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
