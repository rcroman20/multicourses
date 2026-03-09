import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  PlusCircle,
  CalendarDays,
  Trash2,
  Zap,
  Target,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import type { CourseClassSchedule } from '@/types/academic';
import { createCourseWithPlan } from '@/lib/services/teacherPlanEnforcementService';

const createCourseSchema = z.object({
  name: z.string().min(3, 'Course name is required'),
  code: z.string().min(3, 'Course code is required'),
  semester: z.string().min(1, 'Semester is required'),
  group: z.string().min(1, 'Group is required'),
  credits: z.number().min(0, 'Credits cannot be negative'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
});

const fieldLabelClass = 'mb-2 block text-sm font-semibold text-slate-700';
const fieldInputClass =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';
const fieldTextAreaClass =
  'min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50';
const SEMESTER_OPTIONS = Array.from({ length: (2040 - 2026 + 1) * 2 }, (_, index) => {
  const year = 2026 + Math.floor(index / 2);
  const half = (index % 2) + 1;
  return `${year}-${half}`;
});

export default function CreateCoursePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const teacherPlanName = (user?.teacherPlanName || "No assigned plan").trim();
  const teacherPlanCourseLimit =
    typeof user?.teacherPlanCourseLimit === "number" && user.teacherPlanCourseLimit > 0
      ? user.teacherPlanCourseLimit
      : null;
  const teacherPlanStudentLimit =
    typeof user?.teacherPlanStudentLimit === "number" && user.teacherPlanStudentLimit > 0
      ? user.teacherPlanStudentLimit
      : null;
  const teacherPlanPriceText =
    typeof user?.teacherPlanPriceCop === "number" && user.teacherPlanPriceCop > 0
      ? `$${user.teacherPlanPriceCop.toLocaleString("en-US")} COP`
      : "Custom";
  const teacherPlanExpiresAt =
    user?.teacherPlanExpiresAt instanceof Date
      ? user.teacherPlanExpiresAt
      : user?.teacherPlanExpiresAt
        ? new Date(user.teacherPlanExpiresAt)
        : null;
  const teacherPlanExpiresText =
    teacherPlanExpiresAt && !Number.isNaN(teacherPlanExpiresAt.getTime())
      ? teacherPlanExpiresAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "No expiration date";

  const [courseData, setCourseData] = useState({
    name: '',
    code: '',
    semester: '',
    group: '',
    credits: 3,
    description: '',
  });

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [classSchedule, setClassSchedule] = useState<Array<CourseClassSchedule & { rowId: string }>>([
    { rowId: uuidv4(), dayOfWeek: 1, startTime: '', endTime: '', location: '' },
  ]);

  const weekDays = [
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
    { value: 0, label: 'Sunday' },
  ];

  const requirementItems = [
    { title: 'Course Name', subtitle: 'Minimum 3 characters' },
    { title: 'Unique Code', subtitle: 'Format: ABC-123' },
    { title: 'Semester & Group', subtitle: 'Define active period and section' },
    { title: 'Description', subtitle: 'Minimum 10 characters' },
  ];

  const tipItems = [
    'Use clear and descriptive course names',
    "Keep the course code aligned with your institution's format",
    'Add detailed descriptions to guide students from day one',
  ];

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setCourseData({
      ...courseData,
      [name]: name === 'credits' ? Number(value) : value,
    });
  };

  const handleScheduleChange = (
    rowId: string,
    field: 'dayOfWeek' | 'startTime' | 'endTime' | 'location',
    value: string,
  ) => {
    setClassSchedule((prev) =>
      prev.map((row) =>
        row.rowId === rowId
          ? {
              ...row,
              [field]: field === 'dayOfWeek' ? Number(value) : value,
            }
          : row,
      ),
    );
  };

  const addScheduleRow = () => {
    setClassSchedule((prev) => [
      ...prev,
      { rowId: uuidv4(), dayOfWeek: 1, startTime: '', endTime: '', location: '' },
    ]);
  };

  const removeScheduleRow = (rowId: string) => {
    setClassSchedule((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((row) => row.rowId !== rowId);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!user?.id) {
      setError('You must be signed in as teacher to create courses.');
      return;
    }

    const result = createCourseSchema.safeParse(courseData);
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    const normalizedSchedule = classSchedule
      .map((row) => ({
        dayOfWeek: Number(row.dayOfWeek),
        startTime: row.startTime.trim(),
        endTime: row.endTime.trim(),
        location: row.location?.trim() || '',
      }))
      .filter((row) => row.startTime && row.endTime);

    const hasInvalidRange = normalizedSchedule.some((row) => row.startTime >= row.endTime);
    if (hasInvalidRange) {
      setError('Each class schedule must have an end time later than start time.');
      return;
    }

    setIsLoading(true);

    try {
      if (
        teacherPlanExpiresAt &&
        !Number.isNaN(teacherPlanExpiresAt.getTime()) &&
        teacherPlanExpiresAt.getTime() < Date.now()
      ) {
        setError(
          `Your ${teacherPlanName} plan has expired. Renew your plan to create new courses.`,
        );
        setIsLoading(false);
        return;
      }

      await createCourseWithPlan({
        ...courseData,
        classSchedule: normalizedSchedule,
      });

      navigate('/courses');
    } catch (error: any) {
      setError(
        typeof error?.message === 'string' && error.message.trim().length > 0
          ? error.message
          : 'Error creating course. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="relative overflow-x-hidden">
        <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
        <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

        <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
                <div className="pointer-events-none absolute -left-16 -top-20 h-44 w-44 rounded-full bg-sky-200/30" />
                <div className="pointer-events-none absolute -bottom-24 -right-20 h-56 w-56 rounded-full bg-indigo-200/30" />
                <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                      <PlusCircle className="h-3.5 w-3.5" />
                      Course Builder
                    </div>
                    <h1 className="mt-2 text-xl font-extrabold text-slate-900 sm:text-2xl">Create New Course</h1>
                    <p className="mt-1.5 text-sm text-slate-600">
                      Set up basic details, schedule blocks and description for your new class.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/courses')}
                    className={secondaryButtonClass}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                </div>
              </div>

              {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="alert">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <p className="text-sm font-medium text-red-700">{error}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-4 space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className={fieldLabelClass} htmlFor="name">
                      Course Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={courseData.name}
                      onChange={handleChange}
                      className={fieldInputClass}
                      placeholder="e.g., Contemporary English Literature"
                      required
                    />
                    <p className="mt-1 text-xs text-slate-500">Full course name</p>
                  </div>

                  <div>
                    <label className={fieldLabelClass} htmlFor="code">
                      Course Code *
                    </label>
                    <input
                      type="text"
                      id="code"
                      name="code"
                      value={courseData.code}
                      onChange={handleChange}
                      className={fieldInputClass}
                      placeholder="e.g., LIT-401"
                      required
                    />
                    <p className="mt-1 text-xs text-slate-500">Unique identifier code</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label className={fieldLabelClass} htmlFor="semester">
                      Semester *
                    </label>
                    <select
                      id="semester"
                      name="semester"
                      value={courseData.semester}
                      onChange={handleChange}
                      className={fieldInputClass}
                      required
                    >
                      <option value="">Select</option>
                      {SEMESTER_OPTIONS.map((semester) => (
                        <option key={semester} value={semester}>
                          {semester}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={fieldLabelClass} htmlFor="group">
                      Group *
                    </label>
                    <input
                      type="text"
                      id="group"
                      name="group"
                      value={courseData.group}
                      onChange={handleChange}
                      className={fieldInputClass}
                      placeholder="e.g., 01"
                      required
                    />
                  </div>

                  <div>
                    <label className={fieldLabelClass} htmlFor="credits">
                      Credits *
                    </label>
                    <select
                      id="credits"
                      name="credits"
                      value={courseData.credits}
                      onChange={handleChange}
                      className={fieldInputClass}
                      required
                    >
                      <option value="0">No credits</option>
                      <option value="1">1 Credit</option>
                      <option value="2">2 Credits</option>
                      <option value="3">3 Credits</option>
                      <option value="4">4 Credits</option>
                      <option value="5">5 Credits</option>
                      <option value="6">6 Credits</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <label className={fieldLabelClass}>Class Schedule (Optional)</label>
                      <p className="text-xs text-slate-500">
                        Add weekly class blocks if this course has fixed times.
                      </p>
                    </div>
                    <button type="button" className={secondaryButtonClass} onClick={addScheduleRow}>
                      <PlusCircle className="h-4 w-4" />
                      Add block
                    </button>
                  </div>

                  <div className="space-y-3">
                    {classSchedule.map((row, index) => (
                      <div key={row.rowId} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                            <CalendarDays className="h-3.5 w-3.5" />
                            Block {index + 1}
                          </p>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => removeScheduleRow(row.rowId)}
                            disabled={classSchedule.length === 1}
                            aria-label={`Remove schedule block ${index + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <select
                            className={fieldInputClass}
                            value={row.dayOfWeek}
                            onChange={(event) =>
                              handleScheduleChange(row.rowId, 'dayOfWeek', event.target.value)
                            }
                          >
                            {weekDays.map((day) => (
                              <option key={day.value} value={day.value}>
                                {day.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="time"
                            className={fieldInputClass}
                            value={row.startTime}
                            onChange={(event) =>
                              handleScheduleChange(row.rowId, 'startTime', event.target.value)
                            }
                          />
                          <input
                            type="time"
                            className={fieldInputClass}
                            value={row.endTime}
                            onChange={(event) =>
                              handleScheduleChange(row.rowId, 'endTime', event.target.value)
                            }
                          />
                        </div>

                        <input
                          type="text"
                          className={`${fieldInputClass} mt-3`}
                          placeholder="Classroom / meeting link (optional)"
                          value={row.location || ''}
                          onChange={(event) =>
                            handleScheduleChange(row.rowId, 'location', event.target.value)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={fieldLabelClass} htmlFor="description">
                    Course Description *
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={courseData.description}
                    onChange={handleChange}
                    className={fieldTextAreaClass}
                    placeholder="Describe course objectives, content, and methodology..."
                    required
                  />
                  <div className="mt-2 flex items-start gap-2 text-xs text-slate-500">
                    <Info className="mt-0.5 h-3.5 w-3.5" />
                    <p>Minimum 10 characters. Describe the course content in detail.</p>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => navigate(-1)} className={secondaryButtonClass}>
                    Cancel
                  </button>

                  <button type="submit" disabled={isLoading} className={primaryButtonClass}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating Course...
                      </>
                    ) : (
                      <>
                        <PlusCircle className="h-4 w-4" />
                        Create Course
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>

            <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  Active Teacher Plan
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {teacherPlanName} · {teacherPlanPriceText}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Course limit: {teacherPlanCourseLimit ?? "Unlimited"} · Student limit:{" "}
                  {teacherPlanStudentLimit ?? "Unlimited"}
                </p>
                <p className="text-xs text-slate-600">Expires: {teacherPlanExpiresText}</p>
              </div>

              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <Target className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Course Requirements</h2>
                  <p className="text-xs text-slate-500">Checklist before creating the class</p>
                </div>
              </div>

              <ul className="space-y-2">
                {requirementItems.map((item, index) => (
                  <li key={item.title} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-700">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                      <p className="text-xs text-slate-500">{item.subtitle}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-700" />
                  <h3 className="text-sm font-bold text-amber-800">Quick Tips</h3>
                </div>
                <ul className="space-y-2">
                  {tipItems.map((tip) => (
                    <li key={tip} className="flex items-start gap-2 text-xs text-amber-900">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
