import { type ComponentType, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAcademic } from "@/contexts/AcademicContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertCircle,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  GraduationCap,
  MapPin,
  Sparkles,
  X,
} from "lucide-react";

type CalendarMode = "upcoming" | "all" | "past";
type CalendarEventType = "start" | "due" | "class";

interface CalendarEvent {
  id: string;
  courseId: string;
  courseName: string;
  courseCode: string;
  assessmentId?: string;
  title: string;
  type: CalendarEventType;
  date: Date;
  endDate?: Date;
  location?: string;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const converter = value as { toDate: () => Date };
    return converter.toDate();
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split("-").map(Number);
      return new Date(year, month - 1, day, 12, 0, 0, 0);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function withTime(baseDate: Date, hhmm: string): Date | null {
  const parts = hhmm.split(":").map(Number);
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  const [hour, minute] = parts;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hour,
    minute,
    0,
    0,
  );
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getMonthGrid(monthDate: Date): Array<Date | null> {
  const first = startOfMonth(monthDate);
  const firstWeekday = first.getDay();
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();

  const cells: Array<Date | null> = [];

  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function formatEventTime(event: CalendarEvent): string {
  if (event.type === "class" && event.endDate) {
    return `${event.date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })} - ${event.endDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return event.date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getEventIcon(type: CalendarEventType): ComponentType<{ className?: string }> {
  if (type === "due") return Clock3;
  if (type === "start") return CalendarDays;
  return GraduationCap;
}

function getEventTypeLabel(type: CalendarEventType): string {
  if (type === "due") return "Due date";
  if (type === "start") return "Start date";
  return "Class session";
}

function getTypeTone(type: CalendarEventType): string {
  if (type === "due") return "border-amber-200 bg-amber-50 text-amber-700";
  if (type === "start") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function getTypeIconTone(type: CalendarEventType): string {
  if (type === "due") return "bg-amber-100 text-amber-700";
  if (type === "start") return "bg-sky-100 text-sky-700";
  return "bg-emerald-100 text-emerald-700";
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { courses, assessments } = useAcademic();

  const [mode, setMode] = useState<CalendarMode>("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState(() => dayKey(new Date()));
  const [showDayModal, setShowDayModal] = useState(false);
  const [dayModalClassOnly, setDayModalClassOnly] = useState(false);

  const availableCourses = useMemo(() => {
    if (!user) return [];
    if (user.role === "docente") {
      return courses.filter((course) => course.teacherId === user.id);
    }
    return courses.filter((course) =>
      (course.enrolledStudents || []).some((entry) => entry === user.id),
    );
  }, [courses, user]);

  const courseById = useMemo(() => {
    const map: Record<string, (typeof courses)[number]> = {};
    availableCourses.forEach((course) => {
      map[course.id] = course;
    });
    return map;
  }, [availableCourses]);

  const events = useMemo(() => {
    const all: CalendarEvent[] = [];

    assessments.forEach((assessment) => {
      const course = courseById[assessment.courseId];
      if (!course) return;

      const dueDate = toDate(assessment.dueDate);
      if (dueDate) {
        all.push({
          id: `${assessment.id}-due`,
          courseId: course.id,
          courseName: course.name || "Course",
          courseCode: course.code || "N/A",
          assessmentId: assessment.id,
          title: assessment.name || "Assessment",
          type: "due",
          date: dueDate,
        });
      }

      const startDate = toDate(assessment.startDate);
      if (startDate) {
        all.push({
          id: `${assessment.id}-start`,
          courseId: course.id,
          courseName: course.name || "Course",
          courseCode: course.code || "N/A",
          assessmentId: assessment.id,
          title: assessment.name || "Assessment",
          type: "start",
          date: startDate,
        });
      }
    });

    const rangeStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 2, 1, 0, 0, 0, 0);
    const rangeEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 3, 0, 23, 59, 59, 999);

    availableCourses.forEach((course) => {
      const schedule = Array.isArray(course.classSchedule) ? course.classSchedule : [];
      schedule.forEach((slot, slotIndex) => {
        if (
          !Number.isInteger(slot.dayOfWeek) ||
          slot.dayOfWeek < 0 ||
          slot.dayOfWeek > 6 ||
          !slot.startTime ||
          !slot.endTime
        ) {
          return;
        }

        const cursor = new Date(rangeStart);
        const dayShift = (slot.dayOfWeek - cursor.getDay() + 7) % 7;
        cursor.setDate(cursor.getDate() + dayShift);

        while (cursor.getTime() <= rangeEnd.getTime()) {
          const startDate = withTime(cursor, slot.startTime);
          const endDate = withTime(cursor, slot.endTime);
          if (startDate && endDate && endDate.getTime() > startDate.getTime()) {
            all.push({
              id: `${course.id}-class-${slotIndex}-${dayKey(cursor)}`,
              courseId: course.id,
              courseName: course.name || "Course",
              courseCode: course.code || "N/A",
              title: "Class session",
              type: "class",
              date: startDate,
              endDate,
              location: slot.location || "",
            });
          }
          cursor.setDate(cursor.getDate() + 7);
        }
      });
    });

    all.sort((a, b) => a.date.getTime() - b.date.getTime());
    return all;
  }, [assessments, availableCourses, courseById, monthCursor]);

  const courseScopedEvents = useMemo(() => {
    if (courseFilter === "all") return events;
    return events.filter((event) => event.courseId === courseFilter);
  }, [courseFilter, events]);

  const filteredEvents = useMemo(() => {
    const nowTs = Date.now();
    return courseScopedEvents.filter((event) => {
      if (mode === "upcoming") return event.date.getTime() >= nowTs;
      if (mode === "past") return event.date.getTime() < nowTs;
      return true;
    });
  }, [courseScopedEvents, mode]);

  const monthDays = useMemo(() => getMonthGrid(monthCursor), [monthCursor]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    filteredEvents.forEach((event) => {
      const key = dayKey(event.date);
      if (!map[key]) map[key] = [];
      map[key].push(event);
    });
    Object.values(map).forEach((list) => {
      list.sort((a, b) => a.date.getTime() - b.date.getTime());
    });
    return map;
  }, [filteredEvents]);

  const scopedEventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    courseScopedEvents.forEach((event) => {
      const key = dayKey(event.date);
      if (!map[key]) map[key] = [];
      map[key].push(event);
    });
    return map;
  }, [courseScopedEvents]);

  const selectedDayEvents = useMemo(() => eventsByDay[selectedDateKey] || [], [eventsByDay, selectedDateKey]);
  const selectedDayModalEvents = useMemo(
    () =>
      dayModalClassOnly
        ? selectedDayEvents.filter((event) => event.type === "class")
        : selectedDayEvents,
    [dayModalClassOnly, selectedDayEvents],
  );

  const nowTs = Date.now();
  const upcomingCount = useMemo(
    () => courseScopedEvents.filter((event) => event.date.getTime() >= nowTs).length,
    [courseScopedEvents, nowTs],
  );
  const pastCount = Math.max(0, courseScopedEvents.length - upcomingCount);

  const modeButtonOptions = [
    { key: "upcoming" as const, label: "Upcoming", count: upcomingCount, icon: CalendarClock },
    { key: "all" as const, label: "All", count: courseScopedEvents.length, icon: CalendarDays },
    { key: "past" as const, label: "Past", count: pastCount, icon: Clock3 },
  ];

  const monthLabel = monthCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const selectedCourseCode =
    courseFilter === "all"
      ? "ALL"
      : availableCourses.find((course) => course.id === courseFilter)?.code || "N/A";

  const selectedDate = useMemo(() => parseDayKey(selectedDateKey), [selectedDateKey]);
  const selectedDayLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const todayKey = dayKey(new Date());
  const todayEventsCount = scopedEventsByDay[todayKey]?.length ?? 0;

  const classSessionCount = courseScopedEvents.filter((event) => event.type === "class").length;
  const selectedDayClassCount = selectedDayEvents.filter((event) => event.type === "class").length;
  const visibleCourseCount = useMemo(
    () => new Set(filteredEvents.map((event) => event.courseId)).size,
    [filteredEvents],
  );
  const busyDaysInMonth = useMemo(
    () =>
      monthDays.reduce((count, date) => {
        if (!date) return count;
        return count + ((eventsByDay[dayKey(date)]?.length ?? 0) > 0 ? 1 : 0);
      }, 0),
    [eventsByDay, monthDays],
  );

  const visibleTypeCounts = useMemo(
    () =>
      filteredEvents.reduce(
        (acc, event) => {
          acc[event.type] += 1;
          return acc;
        },
        { due: 0, start: 0, class: 0 } as Record<CalendarEventType, number>,
      ),
    [filteredEvents],
  );

  const upcomingEvents = useMemo(
    () =>
      courseScopedEvents
        .filter((event) => event.date.getTime() >= Date.now())
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, 6),
    [courseScopedEvents],
  );

  const dayQueryParam = searchParams.get("day");
  const focusQueryParam = searchParams.get("focus");
  const openQueryParam = searchParams.get("open");
  const querySnapshot = searchParams.toString();

  useEffect(() => {
    if (openQueryParam !== "1") return;

    let targetDate = new Date();
    if (dayQueryParam && dayQueryParam !== "today" && /^\d{4}-\d{2}-\d{2}$/.test(dayQueryParam)) {
      targetDate = parseDayKey(dayQueryParam);
    }

    const targetKey = dayKey(targetDate);
    setMonthCursor(startOfMonth(targetDate));
    setSelectedDateKey(targetKey);
    setCourseFilter("all");
    setMode("all");
    setDayModalClassOnly(focusQueryParam === "classes");
    setShowDayModal(true);

    const nextParams = new URLSearchParams(querySnapshot);
    nextParams.delete("open");
    setSearchParams(nextParams, { replace: true });
  }, [dayQueryParam, focusQueryParam, openQueryParam, querySnapshot, setSearchParams]);

  const getEventTarget = (event: CalendarEvent) => {
    if (event.type === "class" || !event.assessmentId) {
      return `/courses/view/${event.courseCode}`;
    }
    return `/courses/${event.courseCode}/assessments/${event.assessmentId}`;
  };

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex flex-col gap-4">
              <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
                <div className="pointer-events-none absolute -left-[70px] -top-[90px] h-[180px] w-[180px] rounded-full bg-sky-300/25" />
                <div className="pointer-events-none absolute -right-[90px] -bottom-[90px] h-[200px] w-[200px] rounded-full bg-violet-300/20" />

                <div className="relative z-10">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Calendar Workspace
                  </div>
                  <h2 className="mt-3 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                    Academic Calendar Center
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-600">
                    Track classes, starts and due dates in one timeline with live filters.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                      <CalendarDays className="h-4 w-4" />
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Scoped events</p>
                    <p className="text-lg font-extrabold leading-5 text-slate-900">{courseScopedEvents.length}</p>
                  </div>

                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                      <CalendarClock className="h-4 w-4" />
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Upcoming</p>
                    <p className="text-lg font-extrabold leading-5 text-slate-900">{upcomingCount}</p>
                  </div>

                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <GraduationCap className="h-4 w-4" />
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Class sessions</p>
                    <p className="text-lg font-extrabold leading-5 text-slate-900">{classSessionCount}</p>
                  </div>

                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-2.5">
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Today</p>
                    <p className="text-lg font-extrabold leading-5 text-slate-900">{todayEventsCount}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Filters</p>
                      <p className="text-xs text-slate-500">Choose timeline mode and course scope.</p>
                    </div>

                    <div className="relative inline-flex w-full items-center lg:w-auto">
                      <Filter className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
                      <select
                        value={courseFilter}
                        onChange={(event) => setCourseFilter(event.target.value)}
                        className="h-10 rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      >
                        <option value="all">All courses</option>
                        {availableCourses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.code} - {course.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {modeButtonOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setMode(option.key)}
                          className={`inline-flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                            mode === option.key
                              ? "border-sky-300 bg-sky-50 text-sky-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span>{option.label}</span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] leading-none text-slate-600">
                            {option.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-5 w-5 text-sky-700" />
                      <p className="text-lg font-bold text-slate-900">{monthLabel}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedCourseCode === "ALL" ? "All course timelines" : `Course scope: ${selectedCourseCode}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setMonthCursor(startOfMonth(new Date()))}
                      className="mt-2 inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Go to current month
                    </button>
                  </div>

                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMonthCursor((prev) => addMonths(prev, -1))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonthCursor((prev) => addMonths(prev, 1))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
                      aria-label="Next month"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Due {visibleTypeCounts.due}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                    <span className="h-2 w-2 rounded-full bg-sky-500" />
                    Start {visibleTypeCounts.start}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Class {visibleTypeCounts.class}
                  </span>
                </div>

                {filteredEvents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                    <AlertCircle className="mx-auto h-9 w-9 text-slate-400" />
                    <p className="mt-2 text-sm font-semibold text-slate-700">No calendar events found</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Adjust filters or add dated assessments and class schedules.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white p-2">
                    <div className="grid grid-cols-7 gap-1">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
                        <div
                          key={weekday}
                          className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                        >
                          {weekday}
                        </div>
                      ))}
                    </div>

                    <div className="mt-1 grid grid-cols-7 gap-1">
                      {monthDays.map((date, index) => {
                        if (!date) {
                          return <div key={`empty-${index}`} className="h-24 rounded-lg bg-slate-50" />;
                        }

                        const key = dayKey(date);
                        const dayEvents = eventsByDay[key] || [];
                        const isToday = isSameDay(date, new Date());
                        const isSelected = key === selectedDateKey;

                        return (
                          <button
                            type="button"
                            key={key}
                            onClick={() => {
                              setSelectedDateKey(key);
                              setDayModalClassOnly(false);
                              setShowDayModal(true);
                            }}
                            className={`h-24 rounded-lg border p-1.5 text-left transition ${
                              isSelected
                                ? "border-sky-300 bg-sky-50"
                                : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/40"
                            } ${isToday ? "ring-1 ring-sky-200" : ""}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className={`text-xs font-semibold ${isToday ? "text-sky-700" : "text-slate-700"}`}>
                                {date.getDate()}
                              </span>
                              {dayEvents.length > 0 && (
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-bold text-white">
                                  {dayEvents.length}
                                </span>
                              )}
                            </div>

                            <div className="mt-1 hidden space-y-1 lg:block">
                              {dayEvents.slice(0, 2).map((event) => {
                                const Icon = getEventIcon(event.type);
                                const isPastEvent = event.date.getTime() < Date.now();
                                return (
                                  <div
                                    key={event.id}
                                    className={`inline-flex w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${getTypeTone(
                                      event.type,
                                    )} ${isPastEvent ? "opacity-60" : ""}`}
                                    title={`${event.title} (${event.courseCode})`}
                                  >
                                    <Icon className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                      {event.type === "class" ? `${event.title} ${formatEventTime(event)}` : event.title}
                                    </span>
                                  </div>
                                );
                              })}
                              {dayEvents.length > 2 && (
                                <p className="text-[10px] font-semibold text-slate-500">+{dayEvents.length - 2} more</p>
                              )}
                            </div>

                            <div className="mt-1 flex items-center gap-1 lg:hidden">
                              {dayEvents.slice(0, 3).map((event) => (
                                <span
                                  key={event.id}
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    event.type === "due"
                                      ? "bg-amber-500"
                                      : event.type === "start"
                                        ? "bg-sky-500"
                                        : "bg-emerald-500"
                                  } ${event.date.getTime() < Date.now() ? "opacity-50" : ""}`}
                                />
                              ))}
                              {dayEvents.length > 3 && (
                                <span className="text-[10px] font-semibold text-slate-500">+{dayEvents.length - 3}</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            </div>

            <aside className="flex flex-col gap-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900">Overview</h2>
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {selectedCourseCode}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Past</p>
                    <p className="mt-1 text-lg font-extrabold leading-none text-slate-900">{pastCount}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Courses in view</p>
                    <p className="mt-1 text-lg font-extrabold leading-none text-slate-900">{visibleCourseCount}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Busy month days</p>
                    <p className="mt-1 text-lg font-extrabold leading-none text-slate-900">{busyDaysInMonth}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Selected day</p>
                    <p className="mt-1 text-lg font-extrabold leading-none text-slate-900">{selectedDayEvents.length}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDayModal(true);
                      setDayModalClassOnly(false);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50"
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    {selectedDayLabel}
                  </button>
                  <button
                    type="button"
                    disabled={selectedDayClassCount === 0}
                    onClick={() => {
                      setShowDayModal(true);
                      setDayModalClassOnly(true);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <GraduationCap className="h-3.5 w-3.5" />
                    Class sessions ({selectedDayClassCount})
                  </button>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900">Next Dates</h2>
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {upcomingEvents.length}
                  </span>
                </div>
                {upcomingEvents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                    <p className="mt-2 text-sm font-semibold text-slate-700">No upcoming events.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upcomingEvents.map((event) => {
                      const Icon = getEventIcon(event.type);
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => navigate(getEventTarget(event))}
                          className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-left transition hover:border-sky-200 hover:bg-sky-50/40"
                        >
                          <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${getTypeIconTone(event.type)}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{event.title}</p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                              {event.courseCode} • {event.courseName}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getTypeTone(event.type)}`}
                              >
                                {getEventTypeLabel(event.type)}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                                {formatEventTime(event)}
                              </span>
                              {event.location ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                                  <MapPin className="h-3 w-3" />
                                  {event.location}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                            {event.date.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </aside>
          </div>
        </div>
      </div>

      {showDayModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onClick={() => {
            setShowDayModal(false);
            setDayModalClassOnly(false);
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-sky-50 via-indigo-50/70 to-violet-50 px-4 py-3">
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {parseDayKey(selectedDateKey).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedDayModalEvents.length} events in current timeline
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowDayModal(false);
                  setDayModalClassOnly(false);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-white hover:text-slate-800"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {dayModalClassOnly && (
              <div className="m-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Showing class sessions for this day
              </div>
            )}

            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3">
              {selectedDayModalEvents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
                  {dayModalClassOnly ? "No class sessions for this day." : "No events for this day."}
                </div>
              ) : (
                selectedDayModalEvents.map((event) => {
                  const Icon = getEventIcon(event.type);
                  const isPastEvent = event.date.getTime() < Date.now();
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => {
                        setShowDayModal(false);
                        navigate(getEventTarget(event));
                      }}
                      className={`flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-sky-200 hover:bg-sky-50/40 ${
                        isPastEvent ? "opacity-70" : ""
                      }`}
                    >
                      <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${getTypeIconTone(event.type)}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                            <BookOpen className="h-3 w-3" />
                            {event.courseCode}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getTypeTone(event.type)}`}
                          >
                            {getEventTypeLabel(event.type)}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">{formatEventTime(event)}</span>
                          {event.location ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                              <MapPin className="h-3 w-3" />
                              {event.location}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
