import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAcademic } from "@/contexts/AcademicContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  CalendarDays,
  Clock3,
  Filter,
  BookOpen,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

type CalendarMode = "upcoming" | "all" | "past";

type CalendarEventType = "start" | "due";

interface CalendarEvent {
  id: string;
  courseId: string;
  courseName: string;
  courseCode: string;
  assessmentId: string;
  assessmentName: string;
  type: CalendarEventType;
  date: Date;
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
      // Treat date-only values as local day to avoid UTC shifts.
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
  const firstWeekday = first.getDay(); // 0 sunday
  const daysInMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + 1,
    0,
  ).getDate();

  const cells: Array<Date | null> = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { courses, assessments } = useAcademic();
  const [mode, setMode] = useState<CalendarMode>("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState(() => dayKey(new Date()));
  const [showDayModal, setShowDayModal] = useState(false);

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
          courseName: course.name,
          courseCode: course.code,
          assessmentId: assessment.id,
          assessmentName: assessment.name,
          type: "due",
          date: dueDate,
        });
      }

      const startDate = toDate(assessment.startDate);
      if (startDate) {
        all.push({
          id: `${assessment.id}-start`,
          courseId: course.id,
          courseName: course.name,
          courseCode: course.code,
          assessmentId: assessment.id,
          assessmentName: assessment.name,
          type: "start",
          date: startDate,
        });
      }
    });

    all.sort((a, b) => a.date.getTime() - b.date.getTime());
    return all;
  }, [assessments, courseById]);

  const filteredEvents = useMemo(() => {
    const now = new Date();
    const nowTs = now.getTime();
    return events.filter((event) => {
      if (courseFilter !== "all" && event.courseId !== courseFilter) return false;

      if (mode === "upcoming") return event.date.getTime() >= nowTs;
      if (mode === "past") return event.date.getTime() < nowTs;
      return true;
    });
  }, [courseFilter, events, mode]);

  const groupedEvents = useMemo(() => {
    const groups: Record<string, CalendarEvent[]> = {};
    filteredEvents.forEach((event) => {
      const key = dayKey(event.date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredEvents]);

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

  const selectedDayEvents = eventsByDay[selectedDateKey] || [];

  return (
    <DashboardLayout
      title="Academic Calendar"
      subtitle="Unified view of key course dates"
      contentClassName="pt-0 lg:pt-1"
    >
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="inline-flex rounded-xl bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => setMode("upcoming")}
                className={`px-3 py-1.5 text-sm rounded-lg ${mode === "upcoming" ? "bg-white text-blue-700 shadow-sm" : "text-gray-700"}`}
              >
                Upcoming
              </button>
              <button
                type="button"
                onClick={() => setMode("all")}
                className={`px-3 py-1.5 text-sm rounded-lg ${mode === "all" ? "bg-white text-blue-700 shadow-sm" : "text-gray-700"}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setMode("past")}
                className={`px-3 py-1.5 text-sm rounded-lg ${mode === "past" ? "bg-white text-blue-700 shadow-sm" : "text-gray-700"}`}
              >
                Past
              </button>
            </div>

            <div className="lg:ml-auto flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <select
                value={courseFilter}
                onChange={(event) => setCourseFilter(event.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
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
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => setMonthCursor((prev) => addMonths(prev, -1))}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">
                {monthCursor.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <button
                type="button"
                onClick={() => setMonthCursor(startOfMonth(new Date()))}
                className="text-xs text-blue-600 hover:underline"
              >
                Go to current month
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMonthCursor((prev) => addMonths(prev, 1))}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {groupedEvents.length === 0 ? (
            <div className="text-center py-10">
              <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-700 font-medium">No calendar events found</p>
              <p className="text-sm text-gray-500">Adjust filters or add assessments with dates.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-7 gap-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
                  <div
                    key={weekday}
                    className="py-1.5 text-center text-[10px] sm:text-xs font-semibold text-gray-500 uppercase"
                  >
                    {weekday}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {monthDays.map((date, index) => {
                  if (!date) {
                    return <div key={`empty-${index}`} className="min-h-[72px] sm:min-h-[96px]" />;
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
                        setShowDayModal(true);
                      }}
                      className={`min-h-[72px] sm:min-h-[96px] text-left rounded-lg sm:rounded-xl border p-1.5 sm:p-2 transition-colors ${
                        isSelected
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:bg-gray-50"
                      } ${isToday ? "bg-blue-50/50" : "bg-white"}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-xs font-semibold text-gray-900 ${isToday ? "text-blue-700" : ""}`}
                        >
                          {date.getDate()}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 hidden sm:block">
                        {dayEvents.slice(0, 2).map((event) => {
                          const isPastEvent = event.date.getTime() < Date.now();
                          return (
                            <div
                              key={event.id}
                              className={`truncate rounded px-1.5 py-0.5 text-[10px] ${
                                isPastEvent
                                  ? "bg-red-50 text-red-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                              title={`${event.assessmentName} (${event.courseCode})`}
                            >
                              {event.assessmentName}
                            </div>
                          );
                        })}
                        {dayEvents.length > 2 && (
                          <p className="text-[10px] text-gray-500">+{dayEvents.length - 2} more</p>
                        )}
                      </div>

                      <div className="sm:hidden mt-1 flex items-center gap-1">
                        {dayEvents.slice(0, 3).map((event) => {
                          const isPastEvent = event.date.getTime() < Date.now();
                          return (
                            <span
                              key={event.id}
                              className={`h-1.5 w-1.5 rounded-full ${
                                isPastEvent ? "bg-red-500" : "bg-blue-500"
                              }`}
                            />
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <span className="text-[9px] text-gray-500 font-medium">
                            +{dayEvents.length - 3}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {showDayModal && (
          <div
            className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center"
            onClick={() => setShowDayModal(false)}
          >
            <div
              className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl bg-white border border-gray-200 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  {parseDayKey(selectedDateKey).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <button
                  type="button"
                  onClick={() => setShowDayModal(false)}
                  className="h-8 w-8 rounded-lg hover:bg-gray-100 inline-flex items-center justify-center"
                  aria-label="Close"
                >
                  <X className="h-4 w-4 text-gray-600" />
                </button>
              </div>

              <div className="divide-y divide-gray-100">
                {selectedDayEvents.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">
                    No events for this day.
                  </div>
                ) : (
                    selectedDayEvents.map((event) => {
                      const isPastEvent = event.date.getTime() < Date.now();
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => {
                            setShowDayModal(false);
                            navigate(`/courses/${event.courseCode}/assessments/${event.assessmentId}`);
                          }}
                          className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                        >
                          <div
                            className={`mt-1 h-8 w-8 rounded-lg flex items-center justify-center ${
                              isPastEvent
                                ? "bg-red-100 text-red-600"
                                : "bg-blue-100 text-blue-600"
                          }`}
                        >
                          {event.type === "due" ? (
                            <Clock3 className="h-4 w-4" />
                          ) : (
                            <CalendarDays className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900">
                            {event.assessmentName}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                              <BookOpen className="h-3 w-3" />
                              {event.courseCode}
                            </span>
                            <span
                              className={`inline-flex rounded-full px-2 py-1 font-medium ${
                                isPastEvent
                                  ? "bg-red-50 text-red-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {event.type === "due" ? "Due date" : "Start date"}
                            </span>
                            <span className="text-gray-500">
                              {event.date.toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
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
      </div>
    </DashboardLayout>
  );
}
