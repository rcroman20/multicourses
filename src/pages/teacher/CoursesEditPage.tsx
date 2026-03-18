import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademic } from '@/contexts/AcademicContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { courseService } from '@/lib/firestore';
import { collection, getDocs, query, where } from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import { transferCourseOwnership } from '@/lib/services/courseTransferService';
import { v4 as uuidv4 } from 'uuid';
import { TEACHER_ONBOARDING_COURSE_CODE } from '@/lib/services/teacherOnboardingService';
import {
  ArrowLeft,
  ArrowRightLeft,
  CalendarDays,
  BookOpen,
  PlusCircle,
  Trash2,
  User,
  Save,
  Loader2Icon,
  CheckCircle,
  AlertCircle,
  Info,
} from 'lucide-react';
import type { CourseClassSchedule } from '@/types/academic';

const fieldLabelClass = 'mb-2 block text-sm font-semibold text-slate-700';
const fieldInputClass =
  'h-11 w-full rounded-xl border border-slate-200/60 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';
const fieldTextAreaClass =
  'min-h-[120px] w-full rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200/60 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50';
const SEMESTER_OPTIONS = Array.from({ length: (2040 - 2026 + 1) * 2 }, (_, index) => {
  const year = 2026 + Math.floor(index / 2);
  const half = (index % 2) + 1;
  return `${year}-${half}`;
});

export default function CoursesEditPage() {
  const { courseCode } = useParams<{ courseCode: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { courses } = useAcademic();
  const institutionId = typeof user?.institutionId === "string" ? user.institutionId.trim() : "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [transferEmail, setTransferEmail] = useState('');

  const course = courses.find((c) => c.code === courseCode);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    credits: 3,
    semester: '2026-1',
    teacherName: '',
    teacherId: '',
    classSchedule: [] as Array<CourseClassSchedule & { rowId: string }>,
  });

  const isMandatoryCourse =
    String(formData.code || course?.code || '')
      .trim()
      .toUpperCase() === TEACHER_ONBOARDING_COURSE_CODE;

  const weekDays = [
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
    { value: 0, label: 'Sunday' },
  ];

  useEffect(() => {
    const hydrateForm = (targetCourse: typeof course) => {
      if (!targetCourse) return;
      setFormData({
        name: targetCourse.name || '',
        code: targetCourse.code || '',
        description: targetCourse.description || '',
        credits: targetCourse.credits || 3,
        semester: targetCourse.semester || '2026-1',
        teacherName: targetCourse.teacherName || '',
        teacherId: targetCourse.teacherId || '',
        classSchedule: (targetCourse.classSchedule || []).length
          ? (targetCourse.classSchedule || []).map((row) => ({
              rowId: uuidv4(),
              dayOfWeek: Number(row.dayOfWeek),
              startTime: row.startTime || '',
              endTime: row.endTime || '',
              location: row.location || '',
            }))
          : [
              {
                rowId: uuidv4(),
                dayOfWeek: 1,
                startTime: '',
                endTime: '',
                location: '',
              },
            ],
      });
      setLoading(false);
    };

    const loadCourseFromFirestore = async () => {
      if (!courseCode) return;
      setLoading(true);
      try {
        const snapshot = await getDocs(
          query(collection(firebaseDB, "cursos"), where("code", "==", courseCode)),
        );
        if (snapshot.empty) {
          navigate('/courses');
          return;
        }
        const doc = snapshot.docs[0];
        const data = doc.data();
        hydrateForm({
          id: doc.id,
          name: data.name || '',
          code: data.code || '',
          description: data.description || '',
          credits: data.credits || 3,
          semester: data.semester || '2026-1',
          group: data.group || '',
          teacherName: data.teacherName || '',
          teacherId: data.teacherId || '',
          classSchedule: Array.isArray(data.classSchedule) ? data.classSchedule : [],
          enrolledStudents: data.enrolledStudents || [],
          createdAt: data.createdAt?.toDate?.() || new Date(),
        });
      } catch {
        navigate('/courses');
      } finally {
        setLoading(false);
      }
    };

    if (!user) return;

    if (course) {
      const isAdmin = user.role === "admin";
      const isInstitutionManager =
        user.role === "institucion" &&
        institutionId.length > 0 &&
        String(course.institutionId || "").trim() === institutionId;
      if (!isAdmin && !isInstitutionManager) {
        if (user.role !== 'docente' || course.teacherId !== user.id) {
          navigate(`/courses/view/${course.code}`);
          return;
        }
      }
      hydrateForm(course);
      return;
    }

    if (courses.length > 0 && !course) {
      void loadCourseFromFirestore();
      return;
    }
  }, [course, user, courses, navigate, courseCode, institutionId]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'credits' ? parseInt(value) || 0 : value,
    }));
  };

  const handleScheduleChange = (
    rowId: string,
    field: 'dayOfWeek' | 'startTime' | 'endTime' | 'location',
    value: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      classSchedule: prev.classSchedule.map((row) =>
        row.rowId === rowId
          ? {
              ...row,
              [field]: field === 'dayOfWeek' ? Number(value) : value,
            }
          : row,
      ),
    }));
  };

  const addScheduleRow = () => {
    setFormData((prev) => ({
      ...prev,
      classSchedule: [
        ...prev.classSchedule,
        {
          rowId: uuidv4(),
          dayOfWeek: 1,
          startTime: '',
          endTime: '',
          location: '',
        },
      ],
    }));
  };

  const removeScheduleRow = (rowId: string) => {
    setFormData((prev) => {
      if (prev.classSchedule.length <= 1) return prev;
      return {
        ...prev,
        classSchedule: prev.classSchedule.filter((row) => row.rowId !== rowId),
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (transferring) return;

    if (!course?.id) {
      setError('Course ID not found');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      if (!formData.name.trim()) {
        throw new Error('Course name is required');
      }
      if (!formData.code.trim()) {
        throw new Error('Course code is required');
      }
      if (formData.description.trim().length > 100) {
        throw new Error('Description must be 100 characters or less');
      }
      if (!Number.isFinite(formData.credits) || formData.credits < 0) {
        throw new Error('Credits cannot be negative');
      }

      const normalizedSchedule = formData.classSchedule
        .map((row) => ({
          dayOfWeek: Number(row.dayOfWeek),
          startTime: row.startTime.trim(),
          endTime: row.endTime.trim(),
          location: row.location?.trim() || '',
        }))
        .filter((row) => row.startTime && row.endTime);

      const hasInvalidRange = normalizedSchedule.some((row) => row.startTime >= row.endTime);
      if (hasInvalidRange) {
        throw new Error('Each class schedule must have an end time later than start time');
      }

      const updatedCourse = {
        ...formData,
        classSchedule: normalizedSchedule,
        updatedAt: new Date(),
      };

      const result = await courseService.update(course.id, updatedCourse);

      if (result.success) {
        setSuccess('Course updated successfully!');
        setTimeout(() => {
          navigate(`/courses/view/${course.code}`);
        }, 1500);
      } else {
        setError(result.message || 'Failed to update course');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleTransferCourse = async () => {
    if (!course?.id || !user?.id || transferring || saving) return;
    if (isMandatoryCourse) {
      setError('This mandatory course cannot be transferred.');
      setSuccess('');
      return;
    }

    const targetEmail = transferEmail.trim().toLowerCase();
    if (!targetEmail) {
      setError('Enter the destination teacher email.');
      setSuccess('');
      return;
    }

    const confirmed = window.confirm(
      `Transfer "${course.name}" to ${targetEmail}? This keeps all course data (schedule, students, grades, assessments, and materials) and changes only teacher ownership.`,
    );
    if (!confirmed) return;

    setError('');
    setSuccess('');
    setTransferring(true);

    try {
      const result = await transferCourseOwnership({
        courseId: course.id,
        targetTeacherEmail: targetEmail,
        actorUserId: user.id,
      });
      setSuccess(
        `Course transferred to ${result.targetTeacherName} (${result.targetTeacherEmail}). Redirecting...`,
      );
      setTransferEmail('');
      setTimeout(() => {
        navigate('/courses');
      }, 1400);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not transfer course.';
      setError(message);
    } finally {
      setTransferring(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="flex min-h-[420px] items-center justify-center">
              <div className="text-center">
                <Loader2Icon className="mx-auto h-8 w-8 animate-spin text-sky-600" />
                <p className="mt-3 text-sm font-medium text-slate-600">Loading course data...</p>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!course) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative border border-slate-200/60 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
            <div className="flex min-h-[420px] items-center justify-center p-4">
              <div className="max-w-md text-center">
                <AlertCircle className="mx-auto h-16 w-16 text-red-500" />
                <h2 className="mt-4 text-xl font-bold text-slate-900">Course Not Found</h2>
                <p className="mt-2 text-sm text-slate-600">
                  The course you are trying to edit does not exist.
                </p>
                <Link to="/courses" className={`${secondaryButtonClass} mt-6`}>
                  <ArrowLeft className="h-4 w-4" />
                  Back to Courses
                </Link>
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
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
                <div className="pointer-events-none absolute -left-16 -top-20 h-44 w-44 rounded-full bg-sky-200/30" />
                <div className="pointer-events-none absolute -bottom-24 -right-20 h-56 w-56 rounded-full bg-indigo-200/30" />
                <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                      <BookOpen className="h-3.5 w-3.5" />
                      Course Editor
                    </div>
                    <h1 className="mt-2 text-xl font-extrabold text-slate-900 sm:text-2xl">Edit Course</h1>
                    <p className="mt-1.5 text-sm text-slate-600">
                      Update your course details, schedule and metadata in one place.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/courses/view/${course.code}`)}
                    className={secondaryButtonClass}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                </div>
              </div>

              {success && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                    <p className="text-sm font-medium text-emerald-700">{success}</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <p className="text-sm font-medium text-red-700">{error}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-4 space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className={fieldLabelClass}>Course Name *</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      className={fieldInputClass}
                      placeholder="e.g., English Level A1"
                      required
                    />
                  </div>

                  <div>
                    <label className={fieldLabelClass}>Course Code *</label>
                    <input
                      type="text"
                      name="code"
                      value={formData.code}
                      onChange={handleChange}
                      className={fieldInputClass}
                      placeholder="e.g., ENG-A1"
                      required
                    />
                    <p className="mt-1 text-xs text-slate-500">Unique identifier for the course</p>
                  </div>
                </div>

                <div>
                  <label className={fieldLabelClass}>Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={4}
                    className={fieldTextAreaClass}
                    placeholder="Course description and objectives..."
                    maxLength={100}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {formData.description.length}/100 characters
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className={fieldLabelClass}>Credits *</label>
                    <input
                      type="number"
                      name="credits"
                      value={formData.credits}
                      onChange={handleChange}
                      min="0"
                      max="10"
                      className={fieldInputClass}
                      required
                    />
                  </div>

                  <div>
                    <label className={fieldLabelClass}>Semester *</label>
                    <select
                      name="semester"
                      value={formData.semester}
                      onChange={handleChange}
                      className={fieldInputClass}
                      required
                    >
                      {!SEMESTER_OPTIONS.includes(formData.semester) && (
                        <option value={formData.semester}>{formData.semester}</option>
                      )}
                      {SEMESTER_OPTIONS.map((semester) => (
                        <option key={semester} value={semester}>
                          {semester}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Class Schedule</p>
                      <p className="text-xs text-slate-500">
                        Weekly timetable used in Calendar for class sessions (optional).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addScheduleRow}
                      className={secondaryButtonClass}
                    >
                      <PlusCircle className="h-4 w-4" />
                      Add block
                    </button>
                  </div>

                  <div className="space-y-3">
                    {formData.classSchedule.map((row, index) => (
                      <div key={row.rowId} className="rounded-xl border border-slate-200/60 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                            <CalendarDays className="h-3.5 w-3.5" />
                            Block {index + 1}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeScheduleRow(row.rowId)}
                            disabled={formData.classSchedule.length <= 1}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/60 text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`Remove block ${index + 1}`}
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

                <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-700">Teacher</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{formData.teacherName}</p>
                  <p className="mt-1 text-xs text-slate-500">This field cannot be changed</p>
                </div>

                <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <ArrowRightLeft className="h-4 w-4 text-indigo-700" />
                    <span className="text-sm font-semibold text-indigo-900">Transfer Course Ownership</span>
                  </div>
                  <p className="text-xs text-indigo-800">
                    Move this course to another approved teacher. All data is preserved: schedule,
                    students, grade sheets, assessments, notes, and materials.
                  </p>
                  {isMandatoryCourse ? (
                    <p className="mt-2 text-xs font-semibold text-slate-600">
                      Mandatory courses cannot be transferred.
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="email"
                      value={transferEmail}
                      onChange={(event) => setTransferEmail(event.target.value)}
                      className={fieldInputClass}
                      placeholder="teacher@email.com"
                      disabled={isMandatoryCourse}
                    />
                    <button
                      type="button"
                      onClick={handleTransferCourse}
                      disabled={transferring || saving || isMandatoryCourse}
                      className={primaryButtonClass}
                    >
                      {transferring ? (
                        <>
                          <Loader2Icon className="h-4 w-4 animate-spin" />
                          Transferring...
                        </>
                      ) : (
                        <>
                          <ArrowRightLeft className="h-4 w-4" />
                          Transfer
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-slate-200/60 pt-4 sm:flex-row sm:justify-end">
                  <Link to={`/courses/view/${course.code}`} className={secondaryButtonClass}>
                    Cancel
                  </Link>
                  <button type="submit" disabled={saving || transferring} className={primaryButtonClass}>
                    {saving ? (
                      <>
                        <Loader2Icon className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>

            <aside className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                  <Info className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Editing Notes</h2>
                  <p className="text-xs text-slate-500">Keep this course consistent for students</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current course</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{course.name}</p>
                  <p className="mt-1 text-xs text-slate-500">Code: {course.code}</p>
                </div>

                <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Enrollment impact</p>
                  <p className="mt-1 text-sm text-slate-700">
                    Changes to schedule and semester immediately affect classroom planning and calendar views.
                  </p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Recommendation</p>
                  <p className="mt-1 text-sm text-amber-900">
                    Save after verifying class blocks to avoid overlapping sessions for students.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
