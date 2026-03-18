import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Link } from 'react-router-dom';

import { 
  ArrowLeft,
  Save,
  Trash2,
  Plus,
  X,
  FileSpreadsheet,
  Calendar,
  Percent,
  AlertCircle,
  Check,
  Eye,
  EyeOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAcademic } from '@/contexts/AcademicContext';
import { 
  doc, 
  getDoc, 
  updateDoc,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { firebaseDB } from '@/lib/firebase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getTeacherOwnedCourses } from '@/lib/courseAccess';

interface Activity {
  id: string;
  name: string;
  description: string;
  maxScore: number;
  type: string;
}

interface StudentGrade {
  studentId: string;
  name: string;
  grades: Record<string, {
    value?: number;
    comment?: string;
    submittedAt?: any;
  }>;
  total?: number;
  status: string;
}

interface GradeSheet {
  id: string;
  title: string;
    courseId?: string;
  courseCode: string;
  courseName: string;
  teacherId: string;
  teacherName: string;
  gradingPeriod: string;
  activities: Activity[];
  students: StudentGrade[];
  createdAt: any;
  updatedAt: any;
  isPublished: boolean;
  weightPercentage: number;
}

const GRADING_PERIODS = [
  '1st Term',     // Cambiado de 'First Term'
  '2nd Term',     // Cambiado de 'Second Term' 
  'Final',        // Mantener
  '3rd Term',   // Si necesitas más
  '4th Term',  // Si necesitas más
].map(period => period.trim())

const ACTIVITY_TYPES = [
  { value: 'exam', label: 'Exam' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'homework', label: 'Homework' },
  { value: 'project', label: 'Project' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'participation', label: 'Participation' },
  { value: 'lab', label: 'Lab Work' },
  { value: 'essay', label: 'Essay' },
  { value: 'test', label: 'Test' },
  { value: 'other', label: 'Other' }
];

const MAX_SCORES = [1, 2, 3, 4, 5, 10, 20, 50, 100];

export default function EditGradeSheetPage() {
  const { user } = useAuth();
  const { courseCode, gradeSheetId } = useParams<{ courseCode: string; gradeSheetId: string }>();
  const [searchParams] = useSearchParams();
  const focusStudentId = (searchParams.get('student') || '').trim();
  
  const navigate = useNavigate();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [gradeSheet, setGradeSheet] = useState<GradeSheet | null>(null);
  
  const [title, setTitle] = useState('');
  const [gradingPeriod, setGradingPeriod] = useState('');
  const [weightPercentage, setWeightPercentage] = useState<number>(0);
  const [isPublished, setIsPublished] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([
    {
      id: `activity_${Date.now()}_1`,
      name: '',
      description: '',
      maxScore: 5,
      type: 'quiz'
    }
  ]);
  
  const [courseName, setCourseName] = useState('');
  const { courses, loading } = useAcademic();
  const teacherCourses = useMemo(
    () => getTeacherOwnedCourses(courses, user?.id),
    [courses, user?.id],
  );
  const selectedCourse = useMemo(
    () => teacherCourses.find((course) => course.code === courseCode || course.id === courseCode) || null,
    [teacherCourses, courseCode],
  );

  const focusedStudent = useMemo(() => {
    if (!focusStudentId || !gradeSheet?.students) return null;
    return gradeSheet.students.find((student) => student.studentId === focusStudentId) || null;
  }, [focusStudentId, gradeSheet]);

  // Fetch grade sheet data
  useEffect(() => {
    const fetchGradeSheet = async () => {
      if (!courseCode || !gradeSheetId || !user) return;
      if (loading.courses) return;
      
      setIsLoading(true);
      try {
        const gradeSheetRef = doc(firebaseDB, 'gradeSheets', gradeSheetId);
        const gradeSheetDoc = await getDoc(gradeSheetRef);
        
        if (!gradeSheetDoc.exists()) {
          toast.error('Grade sheet not found');
          navigate(`/courses/${courseCode}/grade-sheets`);
          return;
        }
        
        const data = gradeSheetDoc.data();

        if (!data.courseId && !data.courseCode) {
          toast.error('Grade sheet has invalid course information');
          navigate(`/courses/${courseCode}/grade-sheets`);
          return;
        }

        const storedCourseCode = String(data.courseCode || '').trim();
        const urlCourseCode = String(courseCode || '').trim();
        const storedCourseId = String(data.courseId || '').trim();
        const normalizedStoredCourseCode = storedCourseCode.toLowerCase();
        const normalizedUrlCourseCode = urlCourseCode.toLowerCase();

        const matchedTeacherCourse =
          teacherCourses.find((course) => {
            const normalizedCourseCode = String(course.code || '').trim().toLowerCase();
            return (
              (storedCourseId && course.id === storedCourseId) ||
              (normalizedStoredCourseCode && normalizedCourseCode === normalizedStoredCourseCode)
            );
          }) || null;

        const teacherOwnsCourse = Boolean(matchedTeacherCourse);
        if (!teacherOwnsCourse) {
          toast.error('You do not have permission to edit this grade sheet');
          navigate(`/courses/${courseCode}/grade-sheets`);
          return;
        }

        const belongsToRequestedCourse = Boolean(
          selectedCourse &&
            ((storedCourseId && storedCourseId === selectedCourse.id) ||
              (normalizedStoredCourseCode &&
                normalizedStoredCourseCode === String(selectedCourse.code || '').trim().toLowerCase()) ||
              normalizedStoredCourseCode === normalizedUrlCourseCode),
        );

        if (!belongsToRequestedCourse) {
          toast.error('Grade sheet does not belong to this course');
          navigate(`/courses/${courseCode}/grade-sheets`);
          return;
        }


        // Set form data
        setTitle(data.title || '');
        setGradingPeriod(data.gradingPeriod || '1st Term');
        setWeightPercentage(data.weightPercentage || 0);
        setIsPublished(data.isPublished || false);

        if (data.gradingPeriod) {
  const period = data.gradingPeriod.trim();
  const matchingPeriod = GRADING_PERIODS.find(p => 
    p.toLowerCase() === period.toLowerCase()
  );
  setGradingPeriod(matchingPeriod || period);
} else {
  setGradingPeriod('1st Term');
}

setWeightPercentage(data.weightPercentage || 0);
setIsPublished(data.isPublished || false);
        
        // Set activities
        if (data.activities && Array.isArray(data.activities)) {
          setActivities(data.activities.map((act: any) => ({
            id: act.id || `activity_${Date.now()}_${Math.random()}`,
            name: act.name || '',
            description: act.description || '',
            maxScore: act.maxScore || 5,
            type: act.type || 'quiz'
          })));
        }
        
        // Set course name
        setCourseName(matchedTeacherCourse?.name || data.courseName || '');
        
        // Set full grade sheet object
        setGradeSheet({
          id: gradeSheetDoc.id,
          ...data
        } as GradeSheet);
        
      } catch (error) {
        toast.error('Failed to load grade sheet');
        navigate(`/courses/${courseCode}/grade-sheets`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGradeSheet();
  }, [courseCode, gradeSheetId, loading.courses, navigate, selectedCourse, teacherCourses, user]);

  // Add new activity
  const addActivity = () => {
    setActivities([
      ...activities,
      {
        id: `activity_${Date.now()}_${activities.length + 1}`,
        name: '',
        description: '',
        maxScore: 5,
        type: 'quiz'
      }
    ]);
  };

  // Update activity
  const updateActivity = (index: number, field: keyof Activity, value: string | number) => {
    const newActivities = [...activities];
    newActivities[index] = {
      ...newActivities[index],
      [field]: value
    };
    setActivities(newActivities);
  };

  // Remove activity
  const removeActivity = (index: number) => {
    const newActivities = activities.filter((_, i) => i !== index);
    setActivities(newActivities);
  };

  // Validate form
  const validateForm = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (!title.trim()) {
      errors.push('Title is required');
    }
    
    if (!gradingPeriod) {
      errors.push('Grading period is required');
    }
    
    if (weightPercentage < 0 || weightPercentage > 100) {
      errors.push('Weight percentage must be between 0 and 100');
    }
    
    for (let i = 0; i < activities.length; i++) {
      const activity = activities[i];
      
      if (!activity.name.trim()) {
        errors.push(`Activity ${i + 1}: Name is required`);
      }
      
      if (activity.maxScore <= 0) {
        errors.push(`Activity ${i + 1}: Maximum score must be greater than 0`);
      }
      
      if (!activity.type) {
        errors.push(`Activity ${i + 1}: Type is required`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  };

  // Save grade sheet
  const handleSave = async () => {
    if (!user || !courseCode || !gradeSheetId) return;
    
    const validation = validateForm();
    if (!validation.isValid) {
      validation.errors.forEach(error => toast.error(error));
      return;
    }
    
    setIsSaving(true);
    
    try {
      const gradeSheetRef = doc(firebaseDB, 'gradeSheets', gradeSheetId);
      
      const updatedData = {
       title: title.trim(),
  gradingPeriod: gradingPeriod, // Asegúrate de que esté aquí
  weightPercentage: Number(weightPercentage),
  isPublished,
        activities: activities.map(activity => ({
          id: activity.id,
          name: activity.name.trim(),
          description: activity.description.trim(),
          maxScore: Number(activity.maxScore),
          type: activity.type
        })),
        updatedAt: Timestamp.now(),
        updatedBy: user.id,
        updatedByName: user.name
      };
      
      await updateDoc(gradeSheetRef, updatedData);
      
      toast.success('Grade sheet updated successfully');
      
      // Navigate to grades overview after saving
      navigate('/grades');
      
    } catch (error) {
      toast.error('Failed to update grade sheet');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete grade sheet
  const handleDelete = async () => {
    if (!courseCode || !gradeSheetId) return;

    setShowDeleteModal(false);
    setIsDeleting(true);
    
    try {
      const gradeSheetRef = doc(firebaseDB, 'gradeSheets', gradeSheetId);
      await deleteDoc(gradeSheetRef);
      
      toast.success('Grade sheet deleted successfully');
      navigate(`/courses/${courseCode}/grade-sheets`);
      
    } catch (error) {
      toast.error('Failed to delete grade sheet');
    } finally {
      setIsDeleting(false);
    }
  };

  // Publish/Unpublish grade sheet
  const togglePublish = async () => {
    if (!user || !gradeSheetId || isSaving) return;
    
    const newPublishState = !isPublished;
    setIsPublished(newPublishState);
    
    try {
      const gradeSheetRef = doc(firebaseDB, 'gradeSheets', gradeSheetId);
      
      await updateDoc(gradeSheetRef, {
        isPublished: newPublishState,
        updatedAt: Timestamp.now()
      });
      
      toast.success(`Grade sheet ${newPublishState ? 'published' : 'unpublished'} successfully`);
      
    } catch (error) {
      toast.error(`Failed to ${newPublishState ? 'publish' : 'unpublish'} grade sheet`);
      setIsPublished(!newPublishState); // Revert on error
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative border border-slate-200/60 bg-white p-3 lg:p-5 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)]">
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
                <p className="text-xs font-semibold text-slate-700">Loading grade sheet...</p>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!gradeSheet) {
    return (
      <DashboardLayout contentClassName="pt-0 lg:pt-1">
        <div className="relative overflow-x-hidden">
          <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
          <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />
          <div className="relative border border-slate-200/60 bg-white p-3 lg:p-5 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)]">
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="text-center">
                <AlertCircle className="mx-auto mb-3 h-10 w-10 text-slate-400" />
                <h3 className="mb-2 text-base font-semibold text-slate-900">Grade sheet not found</h3>
                <p className="mb-5 text-xs text-slate-500">
                  The grade sheet you are looking for does not exist.
                </p>
                <Button
                  onClick={() => navigate(`/courses/${courseCode}/grade-sheets`)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Grade Sheets
                </Button>
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
        <div className="relative border border-slate-200/60 bg-white p-3 lg:p-5 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)]">
          <div className="flex flex-col gap-3">
            <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50 to-sky-50/70 p-3.5 shadow-sm">
              <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-sky-200/35" />
              <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-indigo-200/35" />
              <div className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                    <FileSpreadsheet className="h-3 w-3" />
                    Grade Sheet Editor
                  </div>
                  <h2 className="mt-2 text-lg font-extrabold leading-tight text-slate-900 sm:text-xl">
                    Edit Grade Sheet
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Update grading activities, weight and publication status.
                  </p>
                  <div className="mt-2.5">
                    <Link
                      to={`/courses/${courseCode}/grade-sheets`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Back to Grade Sheets
                    </Link>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={togglePublish}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition',
                      isPublished
                        ? 'border-sky-200 bg-sky-50 text-sky-600 hover:bg-sky-100'
                        : 'border-slate-200/60 bg-white text-slate-700 hover:bg-slate-50',
                    )}
                    disabled={isSaving}
                  >
                    {isPublished ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {isPublished ? 'Published' : 'Draft'}
                  </Button>

                  <Button
                    onClick={() => setShowDeleteModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </Button>

                  <Button
                    onClick={handleSave}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-600"
                    disabled={isSaving}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="space-y-3 lg:col-span-2">
            {focusStudentId && (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-3.5 shadow-sm">
                <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-sky-800">
                  <Eye className="h-3.5 w-3.5" />
                  Student Grade Detail
                </h2>

                {focusedStudent ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <div className="rounded-lg border border-sky-100 bg-white p-2">
                        <p className="text-xs text-slate-500">Student</p>
                        <p className="font-semibold text-slate-900">{focusedStudent.name}</p>
                      </div>
                      <div className="rounded-lg border border-sky-100 bg-white p-2">
                        <p className="text-xs text-slate-500">Status</p>
                        <p className="font-semibold text-slate-900">{focusedStudent.status || 'pending'}</p>
                      </div>
                      <div className="rounded-lg border border-sky-100 bg-white p-2">
                        <p className="text-xs text-slate-500">Total</p>
                        <p className="font-semibold text-slate-900">
                          {typeof focusedStudent.total === 'number' ? focusedStudent.total.toFixed(2) : 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-sky-100 bg-white">
                      <table className="w-full min-w-[560px]">
                        <thead className="bg-sky-50">
                          <tr>
                            <th className="px-2.5 py-1 text-left text-xs font-semibold text-sky-900">Activity</th>
                            <th className="px-2.5 py-1 text-left text-xs font-semibold text-sky-900">Type</th>
                            <th className="px-2.5 py-1 text-left text-xs font-semibold text-sky-900">Score</th>
                            <th className="px-2.5 py-1 text-left text-xs font-semibold text-sky-900">Comment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activities.map((activity) => {
                            const grade = focusedStudent.grades?.[activity.id];
                            const value = typeof grade?.value === 'number' ? grade.value : null;
                            return (
                              <tr key={activity.id} className="border-t border-sky-50">
                                <td className="px-2.5 py-1 text-xs text-slate-800">{activity.name || 'Untitled activity'}</td>
                                <td className="px-2.5 py-1 text-xs text-slate-600">{activity.type || '-'}</td>
                                <td className="px-2.5 py-1 text-xs font-semibold text-slate-900">
                                  {value !== null ? `${value}/${activity.maxScore}` : 'Not graded'}
                                </td>
                                <td className="px-2.5 py-1 text-xs text-slate-600">{grade?.comment || '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-sky-700">
                    Student not found in this grade sheet.
                  </p>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-slate-200/60 bg-white p-3.5 shadow-sm">
              <h2 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <FileSpreadsheet className="h-3.5 w-3.5 text-sky-600" />
                Grade Sheet Information
              </h2>
              
              <div className="space-y-2">
                <div>
                  <label className="mb-2 block text-xs font-medium text-slate-700">
                    Title *
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter grade sheet title"
                    className="w-full rounded-xl border-slate-300/60 bg-white text-slate-700 focus-visible:ring-sky-200"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    A descriptive title for this grade sheet (e.g., "Midterm Exam", "Quarter 1 Assessments")
                  </p>
                </div>
                
                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  <div>
                  <label className="mb-2 block text-xs font-medium text-slate-700">
                      Grading Period *
                    </label>
                   <select
  value={gradingPeriod || ''}
  onChange={(e) => setGradingPeriod(e.target.value)}
  className="h-9 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
>
  <option value="">Select grading period...</option>
  {GRADING_PERIODS.map(period => (
    <option key={period} value={period}>
      {period}
    </option>
  ))}
</select>
                  </div>
                  
                  <div>
                    <label className="mb-2 block text-xs font-medium text-slate-700">
                      Weight Percentage *
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={weightPercentage}
                        onChange={(e) => setWeightPercentage(Number(e.target.value))}
                        placeholder="0"
                        className="w-full rounded-xl border-slate-300/60 bg-white pl-3 pr-10 text-slate-700 focus-visible:ring-sky-200"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                        %
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Percentage this sheet contributes to final grade
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/60 bg-white p-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-slate-900">Activities</h2>
                <Button
                  onClick={addActivity}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Activity
                </Button>
              </div>
              
              <div className="space-y-2">
                {activities.map((activity, index) => (
                  <div
                    key={activity.id}
                    className="rounded-xl border border-slate-200/60 bg-slate-50 p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-slate-900">Activity {index + 1}</h3>
                      <Button
                        onClick={() => removeActivity(index)}
                        className="h-7 w-7 rounded-lg border border-rose-200 bg-rose-50 p-0 text-rose-600 transition hover:bg-rose-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    
                    <div className="mb-2 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-medium text-slate-700">
                          Activity Name *
                        </label>
                        <Input
                          value={activity.name}
                          onChange={(e) => updateActivity(index, 'name', e.target.value)}
                          placeholder="e.g., Quiz 1, Final Exam, Homework"
                          className="w-full rounded-xl border-slate-300/60 bg-white text-slate-700 focus-visible:ring-sky-200"
                        />
                      </div>
                      
                      <div>
                        <label className="mb-2 block text-xs font-medium text-slate-700">
                          Activity Type *
                        </label>
                        <select
                          value={activity.type}
                          onChange={(e) => updateActivity(index, 'type', e.target.value)}
                          className="h-9 w-full rounded-xl border border-slate-300/60 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                        >
                          <option value="">Select type...</option>
                          {ACTIVITY_TYPES.map(type => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div className="mb-2 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-medium text-slate-700">
                          Maximum Score *
                        </label>
                        <div className="flex items-center gap-2">
                          <select
                            value={activity.maxScore}
                            onChange={(e) => updateActivity(index, 'maxScore', Number(e.target.value))}
                            className="h-9 flex-1 rounded-xl border border-slate-300/60 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                          >
                            {MAX_SCORES.map(score => (
                              <option key={score} value={score}>
                                {score} points
                              </option>
                            ))}
                          </select>
                          <Input
                            type="number"
                            min="1"
                            max="1000"
                            value={activity.maxScore}
                            onChange={(e) => updateActivity(index, 'maxScore', Number(e.target.value))}
                            className="w-24 rounded-xl border-slate-300/60 bg-white text-slate-700 focus-visible:ring-sky-200"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="mb-2 block text-xs font-medium text-slate-700">
                          Current Score
                        </label>
                        <div className="rounded-xl border border-slate-200/60 bg-white p-2 text-sm text-slate-500">
                          Students will enter scores from 0 to {activity.maxScore}
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <label className="mb-2 block text-xs font-medium text-slate-700">
                        Description (Optional)
                      </label>
                      <Textarea
                        value={activity.description}
                        onChange={(e) => updateActivity(index, 'description', e.target.value)}
                        placeholder="Brief description of the activity..."
                        rows={2}
                        className="w-full rounded-xl border-slate-300/60 bg-white text-slate-700 focus-visible:ring-sky-200"
                      />
                    </div>
                  </div>
                ))}
              </div>
              
              {activities.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-slate-300/60 py-8 text-center">
                  <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                  <p className="text-slate-500">No activities added yet</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Add activities to start grading students
                  </p>
                  <Button
                    onClick={addActivity}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add First Activity
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200/60 bg-white p-3.5 shadow-sm">
              <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-800">Summary</h3>
              
              <div className="space-y-1.5">
                <div className="flex justify-between gap-3 text-[12px]">
                  <span className="text-slate-600">Course:</span>
                  <span className="text-right font-semibold text-slate-900">{courseName}</span>
                </div>
                
                <div className="flex justify-between gap-3 text-[12px]">
                  <span className="text-slate-600">Course Code:</span>
                  <span className="text-right font-semibold text-sky-600">{courseCode}</span>
                </div>
                
                <div className="flex justify-between gap-3 text-[12px]">
                  <span className="text-slate-600">Status:</span>
                  <Badge
                    variant="outline"
                    className={
                      isPublished
                        ? 'border-sky-200 bg-sky-50 px-2 py-0 text-[10px] font-semibold text-sky-600'
                        : 'border-slate-200/60 bg-slate-100 px-2 py-0 text-[10px] font-semibold text-slate-700'
                    }
                  >
                    {isPublished ? 'Published' : 'Draft'}
                  </Badge>
                </div>
                
                <div className="flex justify-between gap-3 text-[12px]">
                  <span className="text-slate-600">Weight:</span>
                  <span className="text-right font-semibold text-sky-600">{weightPercentage}%</span>
                </div>
                
                <div className="flex justify-between gap-3 text-[12px]">
                  <span className="text-slate-600">Activities:</span>
                  <span className="text-right font-semibold text-slate-900">{activities.length}</span>
                </div>
                
                <div className="flex justify-between gap-3 text-[12px]">
                  <span className="text-slate-600">Created:</span>
                  <span className="text-right font-semibold text-slate-900">
                    {gradeSheet.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                  </span>
                </div>
                
                <div className="flex justify-between gap-3 text-[12px]">
                  <span className="text-slate-600">Last Updated:</span>
                  <span className="text-right font-semibold text-slate-900">
                    {gradeSheet.updatedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                  </span>
                </div>
              </div>
              
              <div className="mt-3 border-t border-slate-200/60 pt-2.5">
                <Button
                  onClick={() => navigate(`/courses/${courseCode}/grade-sheets`)}
                  className="mt-3 h-8 w-full rounded-xl border border-slate-200/60 bg-white text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </Button>
              </div>
            </div>

            <div className={cn(
              'rounded-2xl border p-3.5 shadow-sm',
              weightPercentage > 0
                ? weightPercentage <= 100
                  ? 'border-sky-100 bg-sky-50'
                  : 'border-rose-200 bg-rose-50'
                : 'border-slate-200/60 bg-slate-50'
            )}>
              <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <Percent className="h-3.5 w-3.5" />
                Weight Validation
              </h3>
              
              <div className="space-y-1.5">
                <div className="flex justify-between text-[12px]">
                  <span className="text-xs text-slate-700">Current weight:</span>
                  <span className={cn(
                    'text-[12px] font-semibold',
                    weightPercentage > 0
                      ? weightPercentage <= 100
                        ? 'text-sky-600'
                        : 'text-rose-700'
                      : 'text-slate-700'
                  )}>
                    {weightPercentage}%
                  </span>
                </div>
                
                {weightPercentage === 0 && (
                  <p className="text-xs text-slate-700">
                    This grade sheet currently has 0% weight. Students won't see it in their final grade.
                  </p>
                )}
                
                {weightPercentage > 100 && (
                  <p className="text-xs text-rose-700">
                    Weight cannot exceed 100%. Adjust the percentage.
                  </p>
                )}
                
                {weightPercentage > 0 && weightPercentage <= 100 && (
                  <p className="text-xs text-sky-600">
                    Valid weight percentage. This sheet will contribute {weightPercentage}% to final grades.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
          </div>
        </div>
      </div>

      {showDeleteModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
          onClick={() => {
            if (!isDeleting) setShowDeleteModal(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200/60 bg-white shadow-[0_32px_72px_-40px_rgba(15,23,42,0.6)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Delete grade sheet?</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-4 py-3 text-sm text-slate-600">
              You are about to permanently remove <span className="font-semibold text-slate-900">{title || 'this sheet'}</span> and all its grades.
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200/60 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="inline-flex items-center rounded-lg border border-slate-200/60 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
