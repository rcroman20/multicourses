import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useNavigate } from "react-router-dom";
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
  Maximize2,
  BookOpen,
  Calendar,
  FileText,
  Loader2,
  AlertTriangle, 
  Search,
  Eye,
  Sparkles,
  Link as LinkIcon,
  Copy,
  Play,
  Clock,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";

const modalInputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100";
const modalLabelClass = "mb-2 block text-sm font-semibold text-slate-700";
const modalSecondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";
const modalPrimaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60";

export default function SlidesPage() {
  const { user } = useAuth();
  const { courses, units: contextUnits, selectedCourseId, setSelectedCourseId } = useAcademic();
  const navigate = useNavigate();
  const [expandedUnits, setExpandedUnits] = useState<string[]>([]);
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>([]);
  const [selectedSlide, setSelectedSlide] = useState<string | null>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
  const [courseBackfillExecuted, setCourseBackfillExecuted] = useState<string[]>([]);

  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showWeekModal, setShowWeekModal] = useState(false);
  const [showSlideModal, setShowSlideModal] = useState(false);

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

  const userCourses = useMemo(() => {
    if (!user) return [];
    return isTeacher
      ? courses.filter((c) => c.teacherId === user.id)
      : courses.filter((c) => c.enrolledStudents.includes(user.id));
  }, [courses, user, isTeacher]);

  const selectedCourse = useMemo(
    () => userCourses.find((c) => c.id === selectedCourseId),
    [userCourses, selectedCourseId],
  );

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

  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);

    setSelectedSlide(null);
    setExpandedUnits([]);
    setExpandedWeeks([]);
    setUnits([]);
  };

  const loadUnits = async () => {
    if (!selectedCourseId) return;

    setLoading(true);
    try {
      const loadedUnits = await unitService.getByCourse(selectedCourseId);
      setUnits(loadedUnits);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isTeacher || !selectedCourseId) return;
    if (courseBackfillExecuted.includes(selectedCourseId)) return;

    let mounted = true;

    const runBackfill = async () => {
      try {
        await unitService.backfillCourseContentCourseIds(selectedCourseId);
      } catch {
      } finally {
        if (!mounted) return;
        setCourseBackfillExecuted((prev) =>
          prev.includes(selectedCourseId) ? prev : [...prev, selectedCourseId],
        );
        await loadUnits();
      }
    };

    void runBackfill();

    return () => {
      mounted = false;
    };
  }, [courseBackfillExecuted, isTeacher, selectedCourseId]);

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
        slide.weekTopic?.toLowerCase().includes(searchLower),
    );
  }, [allSlides, searchTerm]);

  const selectedSlideData = useMemo(() => {
    if (!selectedSlide) return null;

    for (const unit of units) {
      for (const week of unit.weeks || []) {
        const slides = week.slides || [];
        const slide = slides.find((s: any) => s.id === selectedSlide);
        if (slide) return { slide, week, unit };
      }
    }
    return null;
  }, [selectedSlide, units]);

  useEffect(() => {
    if (selectedSlideData?.slide) {
      const slide = selectedSlideData.slide;
      const recent = {
        id: slide.id,
        title: slide.title,
        unit: selectedSlideData.unit.name,
        week: selectedSlideData.week.number,
        timestamp: new Date().toISOString(),
      };

      setRecentlyViewed((prev) => {
        const filtered = prev.filter((s) => s.id !== slide.id);
        return [recent, ...filtered].slice(0, 5);
      });
    }
  }, [selectedSlideData]);

  const getCanvaEmbedUrl = (canvaUrl: string): string => {
    try {
      if (!canvaUrl || typeof canvaUrl !== "string") return "";

      const cleanUrl = canvaUrl.trim().replace(/\s+/g, "");
      if (!cleanUrl) return "";

      if (cleanUrl.includes("?embed")) return cleanUrl;

      if (
        cleanUrl.includes("canva.com/design/") &&
        cleanUrl.includes("/view")
      ) {
        return cleanUrl.includes("?")
          ? cleanUrl.replace("/view?", "/view?embed&")
          : cleanUrl + "?embed";
      }

      if (cleanUrl.includes("canva.com/design/")) {
        const designMatch = cleanUrl.match(/canva\.com\/design\/([^/?]+)/);
        if (designMatch?.[1]) {
          return `https://www.canva.com/design/${designMatch[1]}/view?embed`;
        }
      }

      return cleanUrl;
    } catch {
      return "";
    }
  };

  const getCanvaNormalUrl = (canvaUrl: string): string => {
    try {
      if (!canvaUrl) return "";
      return canvaUrl.includes("?embed")
        ? canvaUrl.replace("?embed", "")
        : canvaUrl;
    } catch {
      return canvaUrl || "";
    }
  };

  const isValidUrl = (urlString: string): boolean => {
    try {
      const url = new URL(urlString);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  };

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
    if (!slideForm.weekId || !selectedCourseId || !user?.id) return;

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
      if (selectedSlide === slideId) setSelectedSlide(null);
    } catch {}
  };

  const toggleFullscreen = () => {
    const embedContainer = document.getElementById("canva-embed-container");
    if (embedContainer) {
      if (!document.fullscreenElement) {
        embedContainer.requestFullscreen().then(() => {
          setIsFullscreen(true);
        });
      } else {
        document.exitFullscreen().then(() => {
          setIsFullscreen(false);
        });
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const embedUrl = selectedSlideData
    ? getCanvaEmbedUrl(selectedSlideData.slide.canvaUrl)
    : "";
  const hasValidEmbedUrl = embedUrl && isValidUrl(embedUrl);
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
          <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
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

        <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="space-y-4">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
              <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-200/35" />
              <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-200/35" />

              <div className="relative z-10">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                      <Sparkles className="h-3.5 w-3.5" />
                      Slides Workspace
                    </div>
                    <h2 className="mt-3 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                      Presentation control center
                    </h2>
                    <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                      Organize units and weeks, preview Canva decks, and keep classroom material structured.
                    </p>
                  </div>
                  {isTeacher && (
                    <button
                      type="button"
                      onClick={() => setShowUnitModal(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                    >
                      <Plus className="h-4 w-4" />
                      New unit
                    </button>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <BookOpen className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{units.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Units</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{totalWeeks}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Weeks</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <Presentation className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{allSlides.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Slides</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <Clock className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{recentlyViewed.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Recent</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1 flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search slides, topics, units..."
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all text-sm font-medium"
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
                      value={selectedCourseId}
                      onChange={(e) => handleCourseChange(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-300 bg-white px-3 pr-9 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
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
              </div>

              {searchTerm && filteredSlides.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-sky-600">
                        Found {filteredSlides.length} slide
                        {filteredSlides.length !== 1 ? "s" : ""}
                      </span>
                      {selectedSlideData && (
                        <span className="text-xs text-slate-500">
                          • Currently viewing: {selectedSlideData.slide.title}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setSearchTerm("")}
                      className="text-sm text-slate-600 hover:text-slate-800 font-medium"
                    >
                      Clear search
                    </button>
                  </div>
                </div>
              )}

              {searchTerm && filteredSlides.length === 0 && allSlides.length > 0 && (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-700">No matching slides</p>
                  <p className="text-xs text-slate-500">Try another term or clear the search.</p>
                </div>
              )}
            </section>

        {!selectedCourseId && userCourses.length === 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center shadow-sm">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Presentation className="h-10 w-10 text-slate-400" />
            </div>
            <h3 className="font-bold text-xl mb-3 text-slate-900">
              No courses available
            </h3>
            <p className="text-slate-500 max-w-md mx-auto mb-6">
              {isTeacher
                ? "You have no courses assigned as a teacher. Contact the administrator."
                : "You are not enrolled in any course. Contact your teacher."}
            </p>
            {isTeacher && (
              <button
                type="button"
                onClick={() => navigate("/courses/create")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 text-white font-medium hover:shadow-lg transition-all duration-300"
              >
                <Plus className="h-4 w-4" />
                Request Course Assignment
              </button>
            )}
          </div>
        )}

        {selectedCourseId && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-sky-100 flex items-center justify-center">
                      <FolderOpen className="h-4 w-4 text-sky-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-900">
                        Course Content
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                        {selectedCourse?.name}
                      </p>
                    </div>
                  </div>
                </div>

                {!isTeacher && recentlyViewed.length > 0 && (
                  <div className="mb-5 hidden sm:block">
                    <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-sky-500" />
                      Recently Viewed
                    </h4>
                    <div className="space-y-2">
                      {recentlyViewed.slice(0, 3).map((slide) => (
                        <button
                          key={slide.id}
                          onClick={() => setSelectedSlide(slide.id)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-100 border border-sky-100 hover:border-sky-200 transition-all duration-300 group"
                        >
                          <div className="h-8 w-8 rounded-lg bg-sky-600 flex items-center justify-center">
                            <Eye className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex-1 text-left">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {slide.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-slate-500">
                                Unit {slide.unit}
                              </span>
                              <span className="text-xs text-slate-500">•</span>
                              <span className="text-xs text-slate-500">
                                Week {slide.week}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-sky-400 group-hover:translate-x-1 transition-transform" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className=" pr-2">
                  {units.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                        <FolderOpen className="h-8 w-8 text-slate-400" />
                      </div>
                      <p className="text-slate-500 font-medium">
                        No content available
                      </p>
                      {isTeacher && (
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
                            className="border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-all duration-300 hover:shadow-sm"
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
                              {isTeacher && (
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
                              <div className="border-t border-slate-200 bg-slate-50/30 p-3 space-y-2">
                                {(unit.weeks || []).length === 0 ? (
                                  <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-100">
                                    <Calendar className="h-4 w-4 text-slate-400" />
                                    <p className="text-xs text-slate-500">
                                      No weeks available
                                    </p>
                                    {isTeacher && (
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
                                        <div className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
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
                                          {isTeacher && (
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
                                          <div className="pl-6 border-l border-slate-200 space-y-2">
                                            {(week.slides || []).length ===
                                            0 ? (
                                              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg">
                                                <FileText className="h-4 w-4 text-slate-400" />
                                                <p className="text-xs text-slate-500">
                                                  No slides available
                                                </p>
                                                {isTeacher && (
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
                                                .map((slide: any) => (
                                                  <div
                                                    key={slide.id}
                                                    className="flex items-center gap-2 bg-white rounded-lg border border-slate-100 hover:border-sky-200 transition-all duration-300 group"
                                                  >
                                                    <button
                                                      onClick={() =>
                                                        setSelectedSlide(
                                                          slide.id,
                                                        )
                                                      }
                                                      className={cn(
                                                        "flex-1 flex items-center gap-3 px-3 py-2 rounded-l-lg text-left transition-all duration-300",
                                                        selectedSlide ===
                                                          slide.id
                                                          ? "bg-sky-50 border-r-2 border-sky-500"
                                                          : "hover:bg-sky-50/50",
                                                      )}
                                                    >
                                                      <Presentation
                                                        className={cn(
                                                          "h-4 w-4 shrink-0 transition-colors",
                                                          selectedSlide ===
                                                            slide.id
                                                            ? "text-sky-600"
                                                            : "text-slate-600 group-hover:text-sky-500",
                                                        )}
                                                      />
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
                                                    </button>
                                                    {isTeacher && (
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
                                                ))
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
            </div>

            <div className="lg:col-span-2">
              {selectedSlideData ? (
                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b bg-white">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xs px-2.5 py-1 bg-sky-100 text-sky-700 rounded-full font-medium">
                            {selectedSlideData.unit.name}
                          </span>
                          <span className="text-xs px-2.5 py-1 bg-sky-100 text-sky-700 rounded-full font-medium">
                            Week {selectedSlideData.week.number}
                          </span>
                          {selectedSlideData.week.topic && (
                            <span className="text-xs text-slate-500 hidden sm:block">
                              • {selectedSlideData.week.topic}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-xl text-slate-900 mb-2">
                          {selectedSlideData.slide.title}
                        </h3>
                        {selectedSlideData.slide.description && (
                          <p className="text-sm text-slate-600 mb-3">
                            {selectedSlideData.slide.description}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <a
                          href={getCanvaNormalUrl(
                            selectedSlideData.slide.canvaUrl,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                          title="View in Canva"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open in Canva
                        </a>
                        {hasValidEmbedUrl && (
                          <button
                            onClick={toggleFullscreen}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 hover:shadow-md transition-all duration-300 font-medium"
                            title="Fullscreen"
                          >
                            <Maximize2 className="h-4 w-4" />
                            Fullscreen
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-6">
                    {hasValidEmbedUrl ? (
                      <div
                        id="canva-embed-container"
                        className={cn(
                          "relative rounded-xl overflow-hidden border-2 border-slate-200 shadow-xl transition-all duration-300 bg-white",
                          isFullscreen ? "fixed inset-0 z-50" : "aspect-video",
                        )}
                      >
                        <div className="absolute top-4 left-4 z-10">
                          <div className="flex items-center gap-2 bg-black/70 text-white px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm">
                            <Play className="h-3 w-3" />
                            Presentation Mode
                          </div>
                        </div>

                        <div
                          className={cn(
                            "w-full h-full",
                            isFullscreen ? "" : "relative pb-[56.25%]",
                          )}
                        >
                          <iframe
                            loading="lazy"
                            className={cn(
                              "absolute top-0 left-0 w-full h-full border-0",
                              isFullscreen ? "" : "rounded-xl",
                            )}
                            src={embedUrl}
                            title={selectedSlideData.slide.title}
                            allowFullScreen
                            allow="fullscreen"
                            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                            referrerPolicy="no-referrer"
                          />
                        </div>

                        {isFullscreen && (
                          <div className="absolute top-4 right-4 z-10 flex gap-2">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  selectedSlideData.slide.canvaUrl,
                                );
                                alert("Link copied to clipboard!");
                              }}
                              className="p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors backdrop-blur-sm"
                              title="Copy link"
                            >
                              <Copy className="h-5 w-5" />
                            </button>
                            <button
                              onClick={toggleFullscreen}
                              className="p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors backdrop-blur-sm"
                              title="Exit fullscreen"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="aspect-video bg-white rounded-2xl flex items-center justify-center border-2 border-dashed border-slate-300">
                        <div className="text-center p-6 max-w-md">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                            <AlertTriangle className="h-8 w-8 text-slate-500" />
                          </div>
                          <h4 className="font-semibold text-lg mb-2 text-slate-900">
                            Preview Unavailable
                          </h4>
                          <p className="text-slate-500 mb-4">
                            The Canva URL is invalid or cannot be embedded.
                          </p>
                          <a
                            href={selectedSlideData.slide.canvaUrl || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 text-white font-medium hover:shadow-lg transition-all duration-300"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Try Opening Directly
                          </a>
                        </div>
                      </div>
                    )}

                    <div className="mt-6 bg-white rounded-xl border border-slate-100 p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-sky-100 flex items-center justify-center">
                            <LinkIcon className="h-4 w-4 text-sky-600" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-slate-500">
                              Canva Link
                            </p>
                            <a
                              href={selectedSlideData.slide.canvaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-sky-600 hover:text-sky-700 truncate block max-w-[200px]"
                            >
                              View on Canva
                            </a>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-sky-100 flex items-center justify-center">
                            <Calendar className="h-4 w-4 text-sky-600" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-slate-500">
                              Week Info
                            </p>
                            <p className="text-sm font-medium text-slate-900">
                              Week {selectedSlideData.week.number} •{" "}
                              {selectedSlideData.unit.name}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {hasValidEmbedUrl && (
                      <div className="mt-4 p-4 bg-sky-50 rounded-xl border border-sky-100">
                        <h4 className="text-sm font-semibold text-sky-900 mb-3 flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          Navigation Tips
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="flex items-start gap-2 p-2 bg-white/50 rounded-lg">
                            <div className="h-6 w-6 rounded bg-sky-600 text-white text-xs flex items-center justify-center font-bold">
                              1
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-900">
                                Arrow Keys
                              </p>
                              <p className="text-xs text-slate-600">
                                Navigate between slides
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2 p-2 bg-white/50 rounded-lg">
                            <div className="h-6 w-6 rounded bg-sky-600 text-white text-xs flex items-center justify-center font-bold">
                              2
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-900">
                                Spacebar
                              </p>
                              <p className="text-xs text-slate-600">
                                Play/pause presentation
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2 p-2 bg-white/50 rounded-lg">
                            <div className="h-6 w-6 rounded bg-sky-600 text-white text-xs flex items-center justify-center font-bold">
                              3
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-900">
                                Fullscreen
                              </p>
                              <p className="text-xs text-slate-600">
                                Best viewing experience
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-slate-100 rounded-2xl p-4 text-center shadow-sm">
                  <h3 className="font-bold text-2xl mb-2 text-slate-900">
                    Select a Slide to View
                  </h3>
                  <p className="text-slate-500 max-w-md mx-auto mb-8">
                    Choose a presentation from the sidebar to preview it here.
                  </p>

                  {filteredSlides.length > 0 && (
                    <div className="max-w-2xl mx-auto">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {filteredSlides.slice(0, 4).map((slide) => (
                          <button
                            key={slide.id}
                            onClick={() => setSelectedSlide(slide.id)}
                            className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200 hover:border-sky-200 hover:shadow-md transition-all duration-300 group text-left"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-900 truncate text-sm">
                                {slide.title}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs px-1.5 py-0.5 bg-sky-50 text-sky-700 rounded">
                                  {slide.unitName}
                                </span>
                                <span className="text-xs text-slate-500">
                                  Week {slide.weekNumber}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-sky-500 group-hover:translate-x-1 transition-all" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredSlides.length === 0 && allSlides.length === 0 && (
                    <div className="mt-6">
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full">
                        <Sparkles className="h-4 w-4 text-slate-500" />
                        <span className="text-sm text-slate-600">
                          No slides available yet.{" "}
                          {isTeacher
                            ? "Start by creating a unit!"
                            : "Check back soon!"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showUnitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
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
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
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
            <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
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
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
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
            <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                    <Presentation className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Add New Slide</h3>
                    <p className="text-sm text-slate-600">Share a Canva presentation with your class.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeSlideModal}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
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
                  <label className={modalLabelClass}>Canva URL *</label>
                  <input
                    type="url"
                    className={modalInputClass}
                    value={slideForm.canvaUrl}
                    onChange={(e) => setSlideForm({ ...slideForm, canvaUrl: e.target.value })}
                    placeholder="https://canva.com/design/..."
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Tip: use Canva Share and copy the View link.
                  </p>
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeSlideModal} className={modalSecondaryButtonClass}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateSlide}
                    disabled={!slideForm.title.trim() || !slideForm.canvaUrl.trim()}
                    className={modalPrimaryButtonClass}
                  >
                    <Save className="h-4 w-4" />
                    <span>Add Slide</span>
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
