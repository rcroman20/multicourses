import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademic } from '@/contexts/AcademicContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { getAccessibleCoursesForUser } from '@/lib/courseAccess';
import { 
  FileText, 
  X, 
  Search,
  User,
  Loader2,
  FolderOpen,
  ChevronRight,
  File,
  FileSpreadsheet,
  FileImage,
  Film,
  Music,
  Archive,
  ExternalLink,
  Maximize2,
  Calendar,
  Plus,
  Trash2,
  ChevronDown,
  Link as LinkIcon,
  Copy,
  AlertTriangle,
  AlertCircle,
  Save,
  Edit,
  Layers,
  Sparkles,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type CourseFile } from '@/lib/services/fileService';
import { notificationService } from '@/lib/services/notificationService';
import { isNotificationAutomationEnabled } from '@/lib/services/notificationAutomation';
import { TEACHER_ONBOARDING_COURSE_CODE } from '@/lib/services/teacherOnboardingService';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  doc,
  deleteDoc,
  updateDoc 
} from 'firebase/firestore';
import { firebaseDB } from '@/lib/firebase';

interface Period {
  id: string;
  number: number;
  name: string;
  courseId: string;
  order: number;
  createdAt: Date;
}

interface Week {
  id: string;
  number: number;
  topic: string;
  periodId: string;
  courseId: string;
  order: number;
  createdAt: Date;
}

const modalInputClass =
  'w-full rounded-xl border border-slate-200/60 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100';
const modalLabelClass = 'mb-2 block text-sm font-semibold text-slate-700';
const modalSecondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50';
const modalPrimaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60';
const modalDangerButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60';

export default function FileManagerPage() {
  const { courseCode } = useParams<{ courseCode?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { courses, selectedCourseId, setSelectedCourseId } = useAcademic();
  const [selectedFile, setSelectedFile] = useState<CourseFile | null>(null);
  const [files, setFiles] = useState<CourseFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState('');
  const [selectedWeekFilter, setSelectedWeekFilter] = useState('');
  const [showCourseStructure, setShowCourseStructure] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [editingFile, setEditingFile] = useState<CourseFile | null>(null);
  const [expandedPeriods, setExpandedPeriods] = useState<string[]>([]);
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>([]);

  const [showDeletePeriodConfirm, setShowDeletePeriodConfirm] = useState<string | null>(null);
  const [showDeleteWeekConfirm, setShowDeleteWeekConfirm] = useState<string | null>(null);
  const latestFilesRequestRef = useRef(0);
  const latestWeeksRequestRef = useRef(0);
  const latestPeriodsRequestRef = useRef(0);
  
  const [periods, setPeriods] = useState<Period[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [showWeekModal, setShowWeekModal] = useState(false);

  const [fileForm, setFileForm] = useState({
    name: '',
    url: '',
    type: 'application/pdf',
    description: '',
    size: 0,
    periodId: '',
    weekId: ''
  });

  const [periodForm, setPeriodForm] = useState({
    number: 1,
    name: ''
  });

  const [weekForm, setWeekForm] = useState({
    number: 1,
    topic: '',
    periodId: ''
  });

  const isTeacher = user?.role === 'docente';
  const isAdmin = user?.role === 'admin';

  const userCourses = useMemo(() => {
    if (!user) return [];
    return getAccessibleCoursesForUser(courses, user, {
      includeAllForAdmin: isAdmin,
      includeEnrolledForTeacher: isTeacher,
    });
  }, [courses, user, isAdmin, isTeacher]);

  const selectedCourse = useMemo(() => 
    userCourses.find(c => c.id === selectedCourseId), 
    [userCourses, selectedCourseId]
  );
  const isOnboardingCourse =
    String(selectedCourse?.code || '').trim().toUpperCase() === TEACHER_ONBOARDING_COURSE_CODE;
  const isMandatoryCourse =
    isOnboardingCourse ||
    Boolean(
      (selectedCourse as Record<string, unknown> | null)?.isMandatory ||
        (selectedCourse as Record<string, unknown> | null)?.mandatory ||
        (selectedCourse as Record<string, unknown> | null)?.required ||
        (selectedCourse as Record<string, unknown> | null)?.isRequired ||
        (selectedCourse as Record<string, unknown> | null)?.isMandatoryForTeachers ||
        (selectedCourse as Record<string, unknown> | null)?.mandatoryForTeachers ||
        (selectedCourse as Record<string, unknown> | null)?.mandatoryTeacherCourse ||
        (selectedCourse as Record<string, unknown> | null)?.requiredForTeachers ||
        (selectedCourse as Record<string, unknown> | null)?.requiredForDocentes ||
        (selectedCourse as Record<string, unknown> | null)?.obligatorio ||
        (selectedCourse as Record<string, unknown> | null)?.obligatorioDocentes ||
        (selectedCourse as Record<string, unknown> | null)?.obligatorioParaDocentes ||
        (selectedCourse as Record<string, unknown> | null)?.onboarding ||
        (selectedCourse as Record<string, unknown> | null)?.isOnboarding,
    );
  const canManageContent =
    isAdmin || (isTeacher && selectedCourse?.teacherId === user?.id && !isMandatoryCourse);

  const coerceToDate = (value: unknown): Date => {
    if (value instanceof Date) return value;
    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as { toDate?: unknown }).toDate === 'function'
    ) {
      try {
        return (value as { toDate: () => Date }).toDate();
      } catch {
        return new Date(0);
      }
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date(0);
  };

  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);
    setSelectedFile(null);
    setSelectedPeriodFilter('');
    setSelectedWeekFilter('');
    setShowCourseStructure(false);
    setFiles([]);
    setPeriods([]);
    setWeeks([]);
    const nextCourse = userCourses.find((course) => course.id === courseId);
    if (nextCourse) {
      navigate(`/courses/${nextCourse.code}/files`);
    }
  };
  const loadWeeks = async (courseId: string) => {
    const requestId = latestWeeksRequestRef.current + 1;
    latestWeeksRequestRef.current = requestId;
    try {
      const weeksRef = collection(firebaseDB, 'weeks');
      const q = query(
        weeksRef,
        where('courseId', '==', courseId)
      );

      const querySnapshot = await getDocs(q);
      const weeksData: Week[] = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: coerceToDate(data.createdAt)
        } as Week;
      })
      .sort((a, b) => {
        const orderA = Number(a.order ?? 0);
        const orderB = Number(b.order ?? 0);
        if (orderA !== orderB) return orderA - orderB;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      if (requestId !== latestWeeksRequestRef.current) return;
      setWeeks(weeksData);
    } catch (error) {
      if (requestId !== latestWeeksRequestRef.current) return;
      setWeeks([]);
    }
  };

  const loadPeriods = async (courseId: string) => {
    const requestId = latestPeriodsRequestRef.current + 1;
    latestPeriodsRequestRef.current = requestId;
    try {
      const periodsRef = collection(firebaseDB, 'periods');
      const q = query(
        periodsRef,
        where('courseId', '==', courseId)
      );

      const querySnapshot = await getDocs(q);
      const periodsData: Period[] = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: coerceToDate(data.createdAt)
        } as Period;
      })
      .sort((a, b) => {
        const orderA = Number(a.order ?? 0);
        const orderB = Number(b.order ?? 0);
        if (orderA !== orderB) return orderA - orderB;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      if (requestId !== latestPeriodsRequestRef.current) return;
      setPeriods(periodsData);
    } catch (error) {
      if (requestId !== latestPeriodsRequestRef.current) return;
      setPeriods([]);
    }
  };

  const loadFiles = async (courseId: string) => {
    if (!courseId) return;

    const requestId = latestFilesRequestRef.current + 1;
    latestFilesRequestRef.current = requestId;
    setLoading(true);
    try {
      const filesRef = collection(firebaseDB, 'course_files');
      const q = query(
        filesRef,
        where('courseId', '==', courseId)
      );

      const querySnapshot = await getDocs(q);
      const loadedFiles: CourseFile[] = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          uploadedAt: coerceToDate(data.uploadedAt || data.createdAt)
        } as CourseFile;
      })
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

      if (requestId !== latestFilesRequestRef.current) return;
      setFiles(loadedFiles);
    } catch (error) {
      if (requestId !== latestFilesRequestRef.current) return;
      setFiles([]);
    } finally {
      if (requestId !== latestFilesRequestRef.current) return;
      setLoading(false);
    }
  };

const handleCreatePeriod = async () => {
  if (!selectedCourseId || !periodForm.name.trim()) return;

  try {
    const periodsRef = collection(firebaseDB, 'periods');
    const newPeriod = {
      number: periodForm.number,
      name: periodForm.name,
      courseId: selectedCourseId,
      teacherId: user?.id,
      order: periods.length,
      createdAt: new Date()
    };
    
    const docRef = await addDoc(periodsRef, newPeriod);

    setPeriods(prev => [...prev, { ...newPeriod, id: docRef.id }]);
    setShowPeriodModal(false);
    setPeriodForm({ number: 1, name: '' });

    await loadPeriods(selectedCourseId);
  } catch (error) {
    alert('Error creating period. Please try again.');
  }
};

  const handleCreateWeek = async () => {
    if (!weekForm.periodId || !weekForm.topic.trim()) return;

    try {
      const weeksRef = collection(firebaseDB, 'weeks');
      const periodWeeks = weeks.filter(w => w.periodId === weekForm.periodId);
      
      const newWeek = {
        number: weekForm.number,
        topic: weekForm.topic,
        periodId: weekForm.periodId,
        courseId: selectedCourseId,
        order: periodWeeks.length,
        createdAt: new Date()
      };

      const docRef = await addDoc(weeksRef, newWeek);

      setWeeks(prev => [...prev, { ...newWeek, id: docRef.id }]);
      setShowWeekModal(false);
      setWeekForm({ number: 1, topic: '', periodId: '' });
    } catch (error) {
      alert('Error creating week. Please try again.');
    }
  };

const handleCreateFile = async () => {
  if (creatingFile) return;
  if (!fileForm.name.trim() || !fileForm.url.trim() || !selectedCourseId || !user?.id) {
    alert('Please provide file name and URL');
    return;
  }

  setCreatingFile(true);
  try {
    const newFileData = {
      name: fileForm.name,
      url: fileForm.url,
      size: fileForm.size,
      type: fileForm.type,
      uploadedBy: user.name,
      uploadedAt: new Date(),
      courseId: selectedCourseId,
      periodId: fileForm.periodId || null,
      weekId: fileForm.weekId || null,
      description: fileForm.description,
      storagePath: '',
      order: files.length
    };

    const filesRef = collection(firebaseDB, 'course_files');
    const docRef = await addDoc(filesRef, newFileData);

    const newFile: CourseFile = {
      id: docRef.id,
      ...newFileData
    };
    
    setFiles(prev => [newFile, ...prev]);
    
    setFileForm({
      name: '',
      url: '',
      type: 'application/pdf',
      description: '',
      size: 0,
      periodId: '',
      weekId: ''
    });
    setShowFileModal(false);

    if (selectedCourse && isNotificationAutomationEnabled(user?.id, "newMaterial")) {
      const recipientIds = (selectedCourse.enrolledStudents || []).filter(
        (entry): entry is string => typeof entry === "string" && entry.length > 0,
      );
      if (recipientIds.length > 0) {
        const failedNotifications: Array<{ studentId: string; error: unknown }> = [];
        for (const studentId of recipientIds) {
          try {
            await notificationService.createNotification(studentId, {
              title: "New material available",
              message: `"${newFileData.name}" was uploaded in ${selectedCourse.name}.`,
              type: "success",
              link: `/courses/${selectedCourse.code}/files`,
            });
          } catch (error) {
            failedNotifications.push({ studentId, error });
          }
        }
        if (failedNotifications.length > 0) {
          console.error('Some notifications failed after file creation:', failedNotifications);
          alert('File created successfully, but some student notifications could not be sent.');
        }
      }
    }
    
  } catch (error) {
    const errorCode = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
    const fallbackMessage = 'Please try again.';
    if (errorCode) {
      alert(`Error creating file (${errorCode}). ${fallbackMessage}`);
    } else {
      alert(`Error creating file. ${fallbackMessage}`);
    }
    console.error('Error creating file link:', error);
  } finally {
    setCreatingFile(false);
  }
};

  const handleEditFile = async (fileId: string) => {
    const fileToEdit = files.find(f => f.id === fileId);
    if (!fileToEdit) return;

    setEditingFile(fileToEdit);
    setFileForm({
      name: fileToEdit.name,
      url: fileToEdit.url,
      type: fileToEdit.type,
      description: fileToEdit.description || '',
      size: fileToEdit.size,
      periodId: fileToEdit.periodId || '',
      weekId: fileToEdit.weekId || ''
    });
    setShowFileModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingFile || !fileForm.name.trim() || !fileForm.url.trim()) return;

    try {
      const fileRef = doc(firebaseDB, 'course_files', editingFile.id);
      await updateDoc(fileRef, {
        name: fileForm.name,
        url: fileForm.url,
        type: fileForm.type,
        description: fileForm.description,
        size: fileForm.size,
        periodId: fileForm.periodId || null,
        weekId: fileForm.weekId || null
      });
      
      const updatedFiles = files.map(file => 
        file.id === editingFile.id 
          ? {
              ...file,
              name: fileForm.name,
              url: fileForm.url,
              type: fileForm.type,
              description: fileForm.description,
              size: fileForm.size,
              periodId: fileForm.periodId || null,
              weekId: fileForm.weekId || null
            }
          : file
      );
      
      setFiles(updatedFiles);
      
      setEditingFile(null);
      setFileForm({
        name: '',
        url: '',
        type: 'application/pdf',
        description: '',
        size: 0,
        periodId: '',
        weekId: ''
      });
      setShowFileModal(false);
      
      if (selectedFile?.id === editingFile.id) {
        setSelectedFile(updatedFiles.find(f => f.id === editingFile.id) || null);
      }
      
    } catch (error) {
      alert('Error updating file. Please try again.');
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!selectedCourseId) return;
    
    try {
      const fileRef = doc(firebaseDB, 'course_files', fileId);
      await deleteDoc(fileRef);
      
      setFiles(prev => prev.filter(file => file.id !== fileId));
      
      if (selectedFile?.id === fileId) setSelectedFile(null);
      setShowDeleteConfirm(null);
    } catch (error) {
      alert('Error deleting file. Please try again.');
    }
  };

const handleDeleteWeek = async (weekId: string) => {
  if (!selectedCourseId) return;
  
  try {
    const filesToUpdate = files.filter(file => file.weekId === weekId);

    const weekRef = doc(firebaseDB, 'weeks', weekId);
    await deleteDoc(weekRef);

    for (const file of filesToUpdate) {
      const fileRef = doc(firebaseDB, 'course_files', file.id);
      await updateDoc(fileRef, {
        weekId: null,
        periodId: null
      });
    }

    setWeeks(prev => prev.filter(week => week.id !== weekId));

    setFiles(prev => prev.map(file => 
      file.weekId === weekId
        ? { ...file, weekId: null, periodId: null }
        : file
    ));

    if (selectedFile?.weekId === weekId) {
      setSelectedFile(prev => prev ? { ...prev, weekId: null, periodId: null } : null);
    }
    
    setShowDeleteWeekConfirm(null);
    
  } catch (error) {
    alert('Error deleting week. Please try again.');
  }
};
const handleDeletePeriod = async (periodId: string) => {
  if (!selectedCourseId) return;
  
  try {
    const weeksToDelete = weeks.filter(week => week.periodId === periodId);

    const filesToUpdate = files.filter(file => 
      file.periodId === periodId || 
      weeksToDelete.some(week => week.id === file.weekId)
    );

    for (const week of weeksToDelete) {
      const weekRef = doc(firebaseDB, 'weeks', week.id);
      await deleteDoc(weekRef);
    }

    const periodRef = doc(firebaseDB, 'periods', periodId);
    await deleteDoc(periodRef);

    for (const file of filesToUpdate) {
      const fileRef = doc(firebaseDB, 'course_files', file.id);
      await updateDoc(fileRef, {
        periodId: null,
        weekId: null
      });
    }
    
    setPeriods(prev => prev.filter(period => period.id !== periodId));
    setWeeks(prev => prev.filter(week => week.periodId !== periodId));

    setFiles(prev => prev.map(file => 
      file.periodId === periodId || weeksToDelete.some(week => week.id === file.weekId)
        ? { ...file, periodId: null, weekId: null }
        : file
    ));

    if (selectedFile?.periodId === periodId) {
      setSelectedFile(prev => prev ? { ...prev, periodId: null, weekId: null } : null);
    }

    setExpandedPeriods(prev => prev.filter(id => id !== periodId));
    
    setShowDeletePeriodConfirm(null);
    
  } catch (error) {
    alert('Error deleting period. Please try again.');
  }
};

const getWeeksByPeriod = (periodId: string) => {
  return weeks.filter((week) => String(week.periodId) === String(periodId));
};

  const getFilesByWeek = (weekId: string) => {
  return visibleFiles.filter((file) => file.weekId === weekId);
};

const getUnassignedFiles = () => {
  return visibleFiles.filter(file => !file.weekId);
};

  const togglePeriod = (periodId: string) => {
    setExpandedPeriods(prev =>
      prev.includes(periodId)
        ? prev.filter(id => id !== periodId)
        : [...prev, periodId]
    );
  };

  const toggleWeek = (weekId: string) => {
    setExpandedWeeks(prev =>
      prev.includes(weekId)
        ? prev.filter(id => id !== weekId)
        : [...prev, weekId]
    );
  };

  useEffect(() => {
    if (userCourses.length === 0) {
      if (selectedCourseId) setSelectedCourseId('');
      return;
    }

    if (selectedCourse) {
      if (courseCode !== selectedCourse.code) {
        navigate(`/courses/${selectedCourse.code}/files`, { replace: true });
      }
      return;
    }

    const urlCourse = courseCode
      ? userCourses.find((course) => course.code === courseCode)
      : null;

    if (urlCourse) {
      if (selectedCourseId !== urlCourse.id) {
        setSelectedCourseId(urlCourse.id);
      }
      return;
    }

    const firstCourse = [...userCourses].sort((a, b) => a.name.localeCompare(b.name))[0];
    if (firstCourse) {
      setSelectedCourseId(firstCourse.id);
      if (courseCode !== firstCourse.code) {
        navigate(`/courses/${firstCourse.code}/files`, { replace: true });
      }
    }
  }, [courseCode, navigate, selectedCourse, selectedCourseId, setSelectedCourseId, userCourses]);

  useEffect(() => {
    if (selectedCourseId) {
      setSelectedFile(null);
      setFiles([]);
      setPeriods([]);
      setWeeks([]);
      setLoading(true);
      latestFilesRequestRef.current += 1;
      latestPeriodsRequestRef.current += 1;
      latestWeeksRequestRef.current += 1;
      loadPeriods(selectedCourseId);
      loadWeeks(selectedCourseId);
      loadFiles(selectedCourseId);
      return;
    }
    setSelectedFile(null);
    setFiles([]);
    setPeriods([]);
    setWeeks([]);
    setLoading(false);
  }, [selectedCourseId]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return 'Unknown size';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return <FileText className="h-4 w-4" />;
    if (type.includes('word')) return <File className="h-4 w-4" />;
    if (type.includes('excel') || type.includes('spreadsheet')) return <FileSpreadsheet className="h-4 w-4" />;
    if (type.includes('image')) return <FileImage className="h-4 w-4" />;
    if (type.includes('video')) return <Film className="h-4 w-4" />;
    if (type.includes('audio')) return <Music className="h-4 w-4" />;
    if (type.includes('zip') || type.includes('archive')) return <Archive className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const getFileColor = (type: string) => {
    if (type.includes('pdf')) return "bg-blue-600";
    if (type.includes('word') || type.includes('document') || type.includes('text')) return "bg-blue-600";
    if (type.includes('excel') || type.includes('spreadsheet')) return "bg-blue-600";
    if (type.includes('image')) return "bg-blue-600";
    if (type.includes('video')) return "bg-blue-600";
    if (type.includes('audio')) return "bg-gray-700";
    return "bg-gray-700";
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return formatDate(date);
  };

  const normalizeResourceUrl = (value: string): string => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const isValidUrl = (value: string): boolean => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const getCompactResourceLabel = (value: string): string => {
    const original = String(value || '').trim();
    if (!original) return 'No link provided';

    const normalized = normalizeResourceUrl(original);
    const compact = (text: string, max = 42) =>
      text.length <= max ? text : `${text.slice(0, max - 1)}...`;

    if (!isValidUrl(normalized)) return compact(original);

    try {
      const url = new URL(normalized);
      const host = url.hostname.replace(/^www\./, '');
      const path = url.pathname.replace(/\/+$/, '');
      return compact(`${host}${path}`);
    } catch {
      return compact(original);
    }
  };

  const closePeriodModal = () => {
    setShowPeriodModal(false);
    setPeriodForm({ number: 1, name: '' });
  };

  const closeWeekModal = () => {
    setShowWeekModal(false);
    setWeekForm({ number: 1, topic: '', periodId: '' });
  };

  const closeFileModal = () => {
    setShowFileModal(false);
    setFileForm({
      name: '',
      url: '',
      type: 'application/pdf',
      description: '',
      size: 0,
      periodId: '',
      weekId: ''
    });
    setEditingFile(null);
  };

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredFiles = useMemo(() => {
    if (!normalizedSearchTerm) return files;
    return files.filter((file) =>
      [file.name, file.description, file.uploadedBy]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => value.toLowerCase().includes(normalizedSearchTerm))
    );
  }, [files, normalizedSearchTerm]);

  const periodFilterOptions = useMemo(
    () =>
      [...periods].sort((a, b) => {
        const bTime = new Date(b.createdAt || 0).getTime();
        const aTime = new Date(a.createdAt || 0).getTime();
        if (bTime !== aTime) return bTime - aTime;
        return (b.order ?? 0) - (a.order ?? 0);
      }),
    [periods],
  );

  const weekFilterOptions = useMemo(
    () =>
      [...weeks]
        .filter((week) => !selectedPeriodFilter || String(week.periodId) === String(selectedPeriodFilter))
        .sort((a, b) => {
          const bTime = new Date(b.createdAt || 0).getTime();
          const aTime = new Date(a.createdAt || 0).getTime();
          if (bTime !== aTime) return bTime - aTime;
          return (b.order ?? 0) - (a.order ?? 0);
        }),
    [weeks, selectedPeriodFilter],
  );

  useEffect(() => {
    if (!selectedPeriodFilter) return;
    const periodStillAvailable = periods.some((period) => period.id === selectedPeriodFilter);
    if (!periodStillAvailable) {
      setSelectedPeriodFilter('');
      setSelectedWeekFilter('');
    }
  }, [periods, selectedPeriodFilter]);

  useEffect(() => {
    if (!selectedWeekFilter) return;
    const weekStillAvailable = weekFilterOptions.some((week) => week.id === selectedWeekFilter);
    if (!weekStillAvailable) {
      setSelectedWeekFilter('');
    }
  }, [selectedWeekFilter, weekFilterOptions]);

  const visibleFiles = useMemo(
    () =>
      filteredFiles.filter((file) => {
        if (selectedWeekFilter) return String(file.weekId || '') === String(selectedWeekFilter);
        if (selectedPeriodFilter) return String(file.periodId || '') === String(selectedPeriodFilter);
        return true;
      }),
    [filteredFiles, selectedPeriodFilter, selectedWeekFilter],
  );

  const periodLabelById = useMemo(() => {
    const map = new Map<string, string>();
    periods.forEach((period) => {
      map.set(period.id, period.name);
    });
    return map;
  }, [periods]);

  const weekLabelById = useMemo(() => {
    const map = new Map<string, string>();
    weeks.forEach((week) => {
      map.set(week.id, `Week ${week.number}: ${week.topic}`);
    });
    return map;
  }, [weeks]);

  const periodRecencyRank = useMemo(() => {
    const rank = new Map<string, number>();
    periodFilterOptions.forEach((period, index) => {
      rank.set(period.id, index);
    });
    return rank;
  }, [periodFilterOptions]);

  const filesGroupedByPeriod = useMemo(() => {
    const grouped = new Map<string, { periodId: string; periodName: string; files: CourseFile[] }>();

    visibleFiles.forEach((file) => {
      const periodId = String(file.periodId || '').trim() || 'unassigned';
      const periodName = file.periodId
        ? periodLabelById.get(String(file.periodId)) || 'Unknown period'
        : 'Without period';

      if (!grouped.has(periodId)) {
        grouped.set(periodId, { periodId, periodName, files: [] });
      }
      grouped.get(periodId)?.files.push(file);
    });

    const fallbackRank = periodRecencyRank.size + 1000;
    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        files: [...group.files].sort(
          (a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime(),
        ),
      }))
      .sort((a, b) => {
        const rankA = periodRecencyRank.get(a.periodId) ?? fallbackRank;
        const rankB = periodRecencyRank.get(b.periodId) ?? fallbackRank;
        if (rankA !== rankB) return rankA - rankB;
        return a.periodName.localeCompare(b.periodName);
      });
  }, [visibleFiles, periodLabelById, periodRecencyRank]);

  const selectedPeriodFilterLabel = useMemo(
    () => periodFilterOptions.find((period) => period.id === selectedPeriodFilter)?.name || '',
    [periodFilterOptions, selectedPeriodFilter],
  );

  const selectedWeekFilterLabel = useMemo(
    () => weekFilterOptions.find((week) => week.id === selectedWeekFilter)?.topic || '',
    [selectedWeekFilter, weekFilterOptions],
  );

  const emptyFilesMessage = useMemo(() => {
    if (files.length === 0) {
      return 'No files have been added yet for this course.';
    }
    if (selectedWeekFilter && searchTerm) {
      return `No files in "${selectedWeekFilterLabel || 'selected week'}" match the current search.`;
    }
    if (selectedWeekFilter) {
      return `No files found in "${selectedWeekFilterLabel || 'selected week'}".`;
    }
    if (selectedPeriodFilter && searchTerm) {
      return `No files in "${selectedPeriodFilterLabel || 'selected period'}" match the current search.`;
    }
    if (selectedPeriodFilter) {
      return `No files found in "${selectedPeriodFilterLabel || 'selected period'}".`;
    }
    if (searchTerm) {
      return 'No files match your search.';
    }
    return 'No files available for the active filters.';
  }, [
    files.length,
    searchTerm,
    selectedPeriodFilter,
    selectedPeriodFilterLabel,
    selectedWeekFilter,
    selectedWeekFilterLabel,
  ]);

  const unassignedTotal = useMemo(
    () => files.filter((file) => !file.weekId).length,
    [files]
  );
  const latestFile = files[0] ?? null;
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
                <p className="text-lg font-semibold text-slate-900">Loading files</p>
                <p className="text-sm text-slate-600">Preparing your course library.</p>
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
                      <Sparkles className="h-3.5 w-3.5" />
                      Files Workspace
                    </div>
                    <h2 className="mt-3 text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                      Resource management center
                    </h2>
                    <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
                      Organize files by period and week, and keep course resources ready for class.
                    </p>
                    {latestFile && (
                      <p className="mt-2 text-xs font-medium text-slate-500">
                        Last update: {latestFile.name} ({formatTimeAgo(latestFile.uploadedAt)})
                      </p>
                    )}
                  </div>
                  {canManageContent && selectedCourseId && (
                    <button
                      type="button"
                      onClick={() => {
                        setFileForm((prev) => ({ ...prev, periodId: '', weekId: '' }));
                        setEditingFile(null);
                        setShowFileModal(true);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                    >
                      <Plus className="h-4 w-4" />
                      New file link
                    </button>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <FileText className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{files.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Files</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                        <Layers className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{periods.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Periods</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{weeks.length}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Weeks</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/90 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <Clock className="h-4 w-4" />
                      </div>
                      <p className="shrink-0 text-lg font-extrabold leading-5 text-slate-900">{unassignedTotal}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">Unassigned</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="md:col-span-2 xl:col-span-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search files, descriptions, authors..."
                        className="w-full rounded-xl border border-slate-200/60 bg-slate-50 py-3 pl-10 pr-4 text-sm font-medium text-slate-700 transition-all focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="relative">
                    <select
                      value={selectedPeriodFilter}
                      onChange={(e) => {
                        setSelectedPeriodFilter(e.target.value);
                        setSelectedWeekFilter('');
                      }}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-300/60 bg-white px-3 pr-9 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    >
                      <option value="">All periods</option>
                      {periodFilterOptions.map((period) => (
                        <option key={period.id} value={period.id}>
                          {period.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                  <div className="relative">
                    <select
                      value={selectedWeekFilter}
                      onChange={(e) => setSelectedWeekFilter(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-300/60 bg-white px-3 pr-9 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    >
                      <option value="">All weeks</option>
                      {weekFilterOptions.map((week) => (
                        <option key={week.id} value={week.id}>
                          Week {week.number}: {week.topic}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                  <div className="relative">
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
                            .map(course => (
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
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  {selectedCourseId && (
                    <button
                      type="button"
                      onClick={() => setShowCourseStructure((prev) => !prev)}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300/60 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      {showCourseStructure ? 'Hide structure' : 'Show structure'}
                    </button>
                  )}
                  {canManageContent && selectedCourseId && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowPeriodModal(true)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <Layers className="h-4 w-4" />
                        New period
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFileForm((prev) => ({ ...prev, periodId: '', weekId: '' }));
                          setEditingFile(null);
                          setShowFileModal(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                      >
                        <Plus className="h-4 w-4" />
                        New file
                      </button>
                    </>
                  )}
                </div>
              </div>

              {(searchTerm || selectedPeriodFilter || selectedWeekFilter) && (
                <div className="mt-4 border-t border-slate-200/60 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-sky-600">
                      Showing {visibleFiles.length} file{visibleFiles.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setSelectedPeriodFilter('');
                        setSelectedWeekFilter('');
                      }}
                      className="text-sm font-medium text-slate-600 transition hover:text-slate-800"
                    >
                      Clear filters
                    </button>
                  </div>
                </div>
              )}

              {(searchTerm || selectedPeriodFilter || selectedWeekFilter) && visibleFiles.length === 0 && files.length > 0 && (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300/60 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-700">No matching files</p>
                  <p className="text-xs text-slate-500">Try another filter combination or clear filters.</p>
                </div>
              )}
            </section>

        {!selectedCourseId && userCourses.length === 0 && (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100">
              <FolderOpen className="h-10 w-10 text-slate-400" />
            </div>
            <h3 className="mb-3 text-xl font-bold text-slate-900">No courses available</h3>
            <p className="mx-auto mb-6 max-w-md text-slate-500">
              {isAdmin
                ? 'No courses created yet. Create a course to start managing files.'
                : isTeacher 
                  ? 'You have no courses assigned as a teacher. Contact the administrator.' 
                  : 'You are not enrolled in any course. Contact your teacher.'}
            </p>
            {(isTeacher || isAdmin) && (
              <button
                type="button"
                onClick={() => navigate('/courses/create')}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 font-medium text-white transition-all duration-300 hover:shadow-lg"
              >
                <Plus className="h-4 w-4" />
                {isAdmin ? 'Create course' : 'Request Course Assignment'}
              </button>
            )}
          </div>
        )}

        {selectedCourseId && (
          <div className="space-y-6">
            {showCourseStructure && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100">
                      <Layers className="h-3.5 w-3.5 text-sky-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Course Library</h3>
                      <p className="mt-0.5 text-xs text-slate-500">{selectedCourse?.name}</p>
                    </div>
                  </div>
                </div>
                <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                  {periods.length === 0 ? (
                    <div className="text-center py-6">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center">
                        <Layers className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-gray-500 text-sm font-medium mb-3">No periods created yet</p>
                      {canManageContent && (
                        <button
                          onClick={() => setShowPeriodModal(true)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 text-sm font-medium"
                        >
                          <Plus className="h-4 w-4" />
                          Create First Period
                        </button>
                      )}
                    </div>
                  ) : (
                    periods.map(period => (
                      <div key={period.id} className="overflow-hidden rounded-xl border border-gray-200/60">
                       <div className="flex items-center justify-between bg-blue-50 px-2.5 py-2">
  <button
    onClick={() => togglePeriod(period.id)}
    className="flex-1 flex items-center justify-between text-left group"
  >
    <div className="flex items-center gap-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100">
        <Layers className="h-3.5 w-3.5 text-blue-600" />
      </div>
      <div>
        <span className="text-[13px] font-semibold text-gray-900">{period.name}</span>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="rounded bg-white/50 px-1.5 py-0 text-[11px] text-blue-700">
            {getWeeksByPeriod(period.id).length} weeks
          </span>
        </div>
      </div>
    </div>
    <ChevronRight
      className={cn(
        'h-3.5 w-3.5 text-gray-400 transition-transform duration-300',
        expandedPeriods.includes(period.id) && 'rotate-90'
      )}
    />
  </button>
  
  {canManageContent && (
    <div className="ml-2 flex gap-0.5">
      <button
        onClick={() => {
          setWeekForm({ 
            number: getWeeksByPeriod(period.id).length + 1, 
            topic: '', 
            periodId: period.id 
          });
          setShowWeekModal(true);
        }}
        className="rounded-md p-1 text-blue-600 transition-colors hover:bg-blue-50"
        title="Add week"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setShowDeletePeriodConfirm(period.id)}
        className="rounded-md p-1 text-red-600 transition-colors hover:bg-red-50"
        title="Delete period"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )}
</div>
                        {expandedPeriods.includes(period.id) && (
                          <div className="space-y-1.5 border-t border-gray-200/60 bg-gray-50/30 p-2">
                            {getWeeksByPeriod(period.id).length === 0 ? (
                              <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-2.5 py-1.5">
                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                <p className="text-xs text-gray-500">No weeks available</p>
                                {canManageContent && (
                                  <button
                                    onClick={() => {
                                      setWeekForm({ 
                                        number: 1, 
                                        topic: '', 
                                        periodId: period.id 
                                      });
                                      setShowWeekModal(true);
                                    }}
                                    className="ml-auto rounded p-1 text-blue-600 transition-colors hover:bg-blue-50"
                                    title="Add week"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              getWeeksByPeriod(period.id).map(week => (
                                <div key={week.id} className="space-y-1.5">
                                 <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-2.5 py-1.5">
  <div className="flex items-center gap-2">
    <button
      onClick={() => toggleWeek(week.id)}
      className="flex items-center gap-1.5 text-xs text-gray-900 transition-colors hover:text-blue-600"
    >
      <ChevronRight
        className={cn(
          'h-3.5 w-3.5 text-gray-400 transition-transform duration-300',
          expandedWeeks.includes(week.id) && 'rotate-90'
        )}
      />
      <Calendar className="h-3.5 w-3.5 text-gray-400" />
      <span className="font-medium">Week {week.number}</span>
      <span className="ml-1 max-w-[90px] truncate text-gray-500">
        {week.topic}
      </span>
    </button>
  </div>
  
  {canManageContent && (
    <div className="flex gap-0.5">
      <button
        onClick={() => setShowDeleteWeekConfirm(week.id)}
        className="rounded p-1 text-red-600 transition-colors hover:bg-red-50"
        title="Delete week"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )}
</div>
                                  {expandedWeeks.includes(week.id) && (
                                    <div className="space-y-1 border-l border-gray-200/60 pl-5">
                                      {getFilesByWeek(week.id).length === 0 ? (
                                        <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1">
                                          <FileText className="h-3.5 w-3.5 text-gray-400" />
                                          <p className="text-xs text-gray-500">No files</p>
                                          {canManageContent && (
                                            <button
                                              onClick={() => {
                                                setFileForm(prev => ({
                                                  ...prev,
                                                  periodId: period.id,
                                                  weekId: week.id
                                                }));
                                                setShowFileModal(true);
                                              }}
                                              className="ml-auto rounded p-1 text-blue-600 transition-colors hover:bg-blue-50"
                                              title="Add file"
                                            >
                                              <Plus className="h-3.5 w-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      ) : (
                                        getFilesByWeek(week.id).map(file => (
                                          <div key={file.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white transition-all hover:border-blue-200">
                                            <button
                                              onClick={() => setSelectedFile(file)}
                                              className={cn(
                                                'flex-1 flex items-center gap-2 rounded-l-lg px-2.5 py-1.5 text-left transition-all',
                                                selectedFile?.id === file.id
                                                  ? 'bg-blue-50 border-r-2 border-blue-500'
                                                  : 'hover:bg-blue-50/50'
                                              )}
                                            >
                                              <div className={`flex h-7 w-7 items-center justify-center rounded ${getFileColor(file.type)} text-white`}>
                                                {getFileIcon(file.type)}
                                              </div>
                                              <span className="text-xs font-medium text-gray-900 truncate">{file.name}</span>
                                            </button>
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
                    ))
                  )}
                  {files.length > 0 && getUnassignedFiles().length > 0 && (
                    <div className="mt-3 border-t border-gray-200/60 pt-3">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">Unassigned Files</h4>
                      <div className="space-y-1.5">
                        {getUnassignedFiles().map(file => (
                          <div key={file.id} className="flex items-center gap-2 rounded-lg border border-gray-200/60 bg-gray-100 p-1.5">
                            <button
                              onClick={() => setSelectedFile(file)}
                              className={cn(
                                'flex-1 flex items-center gap-2 text-left',
                                selectedFile?.id === file.id && 'text-blue-600'
                              )}
                            >
                              <div className={`flex h-7 w-7 items-center justify-center rounded ${getFileColor(file.type)} text-white`}>
                                {getFileIcon(file.type)}
                              </div>
                              <span className="text-xs font-medium text-gray-900 truncate">{file.name}</span>
                            </button>
                            {canManageContent && (
                              <button
                                onClick={() => handleEditFile(file.id)}
                                className="rounded p-1 text-blue-600 transition-colors hover:bg-blue-50"
                                title="Assign to week"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="lg:col-span-2">
              {selectedFile ? (
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b bg-white">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`h-8 w-8 rounded-lg ${getFileColor(selectedFile.type)} flex items-center justify-center text-white`}>
                            {getFileIcon(selectedFile.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-xl text-gray-900 truncate">{selectedFile.name}</h3>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span className="text-sm text-gray-600">
                                {selectedFile.size ? formatFileSize(selectedFile.size) : 'External resource'}
                              </span>
                              <span className="text-gray-400">•</span>
                              <span className="text-sm text-gray-600">
                                Added {formatTimeAgo(selectedFile.uploadedAt)}
                              </span>
                              <span className="text-gray-400">•</span>
                              <span className="text-sm text-gray-600">
                                by {selectedFile.uploadedBy}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 flex-wrap">
                        <a
                          href={selectedFile.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        {selectedFile.type.includes('pdf') && (
                          <button
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300/60 text-gray-700 rounded-xl hover:bg-gray-50 hover:shadow-md transition-all duration-300 font-medium"
                          >
                            <Maximize2 className="h-4 w-4" />
                          </button>
                        )}
                        {canManageContent && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEditFile(selectedFile.id)}
                              className="p-2.5 border border-gray-300/60 text-gray-700 rounded-xl hover:bg-gray-50 hover:shadow-md transition-all duration-300"
                              title="Edit file"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(selectedFile.id)}
                              className="p-2.5 border border-gray-300/60 text-gray-700 rounded-xl hover:bg-red-50 hover:shadow-md transition-all duration-300"
                              title="Delete file"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="p-6">
                    {selectedFile.type.includes('pdf') ? (
                      <div className={cn(
                        "rounded-xl overflow-hidden border-2 border-gray-200/60 shadow-lg bg-white",
                        isFullscreen ? "fixed inset-0 z-50" : ""
                      )}>
                        {isFullscreen && (
                          <div className="absolute top-4 right-4 z-10 flex gap-2">
                            <button
                              onClick={() => navigator.clipboard.writeText(selectedFile.url)}
                              className="p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors backdrop-blur-sm"
                              title="Copy link"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setIsFullscreen(false)}
                              className="p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors backdrop-blur-sm"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                        
                        <iframe
                          src={selectedFile.url}
                          className={cn(
                            "w-full border-0",
                            isFullscreen ? "h-screen" : "h-[500px]"
                          )}
                          title={selectedFile.name}
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="aspect-video bg-white rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300/60">
                        <div className="text-center p-6 max-w-md">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-100 flex items-center justify-center">
                            {getFileIcon(selectedFile.type)}
                          </div>
                          <h4 className="font-semibold text-lg mb-2 text-gray-900">
                            {selectedFile.type.includes('image') ? 'Image Preview' : 
                             selectedFile.type.includes('video') ? 'Video Preview' : 
                             selectedFile.type.includes('audio') ? 'Audio Preview' : 'File Preview'}
                          </h4>
                          <p className="text-gray-500 mb-4">
                            This file type is best viewed by opening the link directly.
                          </p>
                          <a
                            href={selectedFile.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:shadow-lg transition-all duration-300"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Open in New Tab
                          </a>
                        </div>
                      </div>
                    )}
 {selectedFile.description && (
                        <div className="mt-4 pt-4 border-t border-gray-200/60">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Description</h4>
                          <p className="text-gray-600">{selectedFile.description}</p>
                        </div>
                      )}
                    <div className="mt-6 bg-white rounded-xl border border-gray-100 p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                            <User className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500">Added By</p>
                            <p className="text-sm font-medium text-gray-900">{selectedFile.uploadedBy}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Calendar className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500">Date Added</p>
                            <p className="text-sm font-medium text-gray-900">
                              {formatDate(selectedFile.uploadedAt)}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                            <FileText className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500">File Type</p>
                            <p className="text-sm font-medium text-gray-900 capitalize">
                              {selectedFile.type.split('/')[1] || selectedFile.type}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                            <LinkIcon className="h-4 w-4 text-gray-700" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500">Direct Link</p>
                            <a
                              href={selectedFile.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline truncate block"
                              title={`Open: ${selectedFile.url}`}
                            >
                              {selectedFile.name}
                            </a>
                          </div>
                        </div>
                      </div>
                      
                     
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center shadow-sm">
                  <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <FileText className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="font-bold text-2xl mb-3 text-gray-900">
                    {visibleFiles.length > 0 ? 'Select a File' : 'No Files Yet'}
                  </h3>
                  <p className="text-gray-500 max-w-md mx-auto mb-8">
                    {visibleFiles.length > 0
                      ? 'Choose a file'
                      : emptyFilesMessage}
                  </p>
                  
                  {visibleFiles.length > 0 && (
                    <div className="max-w-2xl mx-auto">
                        
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {visibleFiles.slice(0, 4).map(file => (
                          <button
                            key={file.id}
                            onClick={() => setSelectedFile(file)}
                            className="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-200/60 hover:border-blue-200 hover:shadow-md transition-all duration-300 group text-left"
                          >
                            <div className={`h-8 w-8 rounded-lg ${getFileColor(file.type)} flex items-center justify-center text-white`}>
                              {getFileIcon(file.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate text-sm">{file.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-gray-500">
                                  {file.size ? formatFileSize(file.size) : 'Link'}
                                </span>
                                <span className="text-xs text-gray-500">•</span>
                                <span className="text-xs text-gray-500">
                                  {formatTimeAgo(file.uploadedAt)}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
              <div className="border-b border-slate-200/60 bg-white px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Files Library</h3>
                    <p className="text-xs text-slate-500">Cards grouped by period with quick actions.</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                    {visibleFiles.length} visible
                  </span>
                </div>
              </div>

              <div className="p-4">
                {visibleFiles.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300/60 bg-slate-50 p-8 text-center">
                    <h4 className="text-base font-semibold text-slate-900">No files to display</h4>
                    <p className="mt-1 text-sm text-slate-500">{emptyFilesMessage}</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {filesGroupedByPeriod.map((group) => (
                      <section key={group.periodId} className="space-y-3">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200/60 pb-2">
                          <h4 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                            {group.periodName}
                          </h4>
                          <span className="inline-flex items-center rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            {group.files.length} file{group.files.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {group.files.map((file) => {
                            const resourceUrl = normalizeResourceUrl(file.url || '');
                            const hasValidResource = isValidUrl(resourceUrl);
                            const weekLabel = file.weekId ? weekLabelById.get(String(file.weekId)) : '';

                            return (
                              <article
                                key={file.id}
                                className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm transition hover:border-sky-200 hover:shadow-md"
                              >
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded text-white', getFileColor(file.type))}>
                                    {getFileIcon(file.type)}
                                  </span>
                                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                                    {file.size ? formatFileSize(file.size) : 'Link'}
                                  </span>
                                  <span className="rounded-full border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                    {formatTimeAgo(file.uploadedAt)}
                                  </span>
                                </div>

                                <h4 className="text-base font-bold text-slate-900">{file.name}</h4>
                                {file.description && (
                                  <p className="mt-1 text-sm text-slate-600">{file.description}</p>
                                )}

                                <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                                  {weekLabel && (
                                    <p>
                                      Week:{' '}
                                      <span className="font-medium text-slate-700">{weekLabel}</span>
                                    </p>
                                  )}
                                  <p>
                                    Author:{' '}
                                    <span className="font-medium text-slate-700">{file.uploadedBy}</span>
                                  </p>
                                  <p className="truncate">
                                    Link:{' '}
                                    <span className="font-medium text-slate-700" title={file.url}>
                                      {getCompactResourceLabel(file.url)}
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
                                          .then(() => alert('Link copied to clipboard!'))
                                          .catch(() => alert('Could not copy the link.'));
                                      }}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/60 bg-white text-slate-700 transition hover:bg-slate-50"
                                      title="Copy link"
                                      aria-label="Copy link"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                  )}

                                  {canManageContent && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleEditFile(file.id)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/60 bg-white text-slate-700 transition hover:bg-slate-50"
                                        title="Edit file"
                                        aria-label="Edit file"
                                      >
                                        <Edit className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setShowDeleteConfirm(file.id)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100"
                                        title="Delete file"
                                        aria-label="Delete file"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </>
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
            {showPeriodModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
                <div className="w-full max-w-2xl rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
                  <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                        <Layers className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Create Period</h3>
                        <p className="text-sm text-slate-600">Add a new period to organize content.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={closePeriodModal}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/60 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-4 p-6">
                    <div>
                      <label className={modalLabelClass}>Period Number *</label>
                      <select
                        className={modalInputClass}
                        value={periodForm.number}
                        onChange={(e) => setPeriodForm({ ...periodForm, number: Number(e.target.value) })}
                      >
                        {[1, 2, 3, 4].map((num) => (
                          <option key={num} value={num}>{num} Term</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={modalLabelClass}>Period Name *</label>
                      <input
                        type="text"
                        className={modalInputClass}
                        value={periodForm.name}
                        onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })}
                        placeholder="e.g., First Period, Quarter 1"
                      />
                    </div>

                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button type="button" onClick={closePeriodModal} className={modalSecondaryButtonClass}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleCreatePeriod}
                        disabled={!periodForm.name.trim()}
                        className={modalPrimaryButtonClass}
                      >
                        <Save className="h-4 w-4" />
                        <span>Create Period</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showDeletePeriodConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
                <div className="w-full max-w-xl rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
                  <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Delete Period</h3>
                        <p className="text-sm text-slate-600">This action cannot be undone.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDeletePeriodConfirm(null)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/60 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-4 p-6">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-700">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
                        <div>
                          <p className="font-semibold">Deleting this period will:</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5">
                            <li>Remove all {weeks.filter((w) => w.periodId === showDeletePeriodConfirm).length} weeks in this period</li>
                            <li>Unassign {files.filter((f) => f.periodId === showDeletePeriodConfirm).length} files from this period</li>
                            <li>Keep files in the course without period assignment</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => setShowDeletePeriodConfirm(null)}
                        className={modalSecondaryButtonClass}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => showDeletePeriodConfirm && handleDeletePeriod(showDeletePeriodConfirm)}
                        className={modalDangerButtonClass}
                      >
                        Delete Period
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showDeleteWeekConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
                <div className="w-full max-w-xl rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
                  <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Delete Week</h3>
                        <p className="text-sm text-slate-600">This action cannot be undone.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDeleteWeekConfirm(null)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/60 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-4 p-6">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-700">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
                        <div>
                          <p className="font-semibold">Deleting this week will:</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5">
                            <li>Unassign {files.filter((f) => f.weekId === showDeleteWeekConfirm).length} files from this week</li>
                            <li>Keep files in the course without week assignment</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => setShowDeleteWeekConfirm(null)}
                        className={modalSecondaryButtonClass}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => showDeleteWeekConfirm && handleDeleteWeek(showDeleteWeekConfirm)}
                        className={modalDangerButtonClass}
                      >
                        Delete Week
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
                        <h3 className="text-lg font-bold text-slate-900">Add Week</h3>
                        <p className="text-sm text-slate-600">Add a week to organize files.</p>
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
                    <div>
                      <label className={modalLabelClass}>Week Number *</label>
                      <input
                        type="number"
                        min="1"
                        className={modalInputClass}
                        value={weekForm.number}
                        onChange={(e) => setWeekForm({ ...weekForm, number: Number(e.target.value) })}
                      />
                    </div>

                    <div>
                      <label className={modalLabelClass}>Week Topic *</label>
                      <input
                        type="text"
                        className={modalInputClass}
                        value={weekForm.topic}
                        onChange={(e) => setWeekForm({ ...weekForm, topic: e.target.value })}
                        placeholder="e.g., Introduction to Grammar"
                      />
                    </div>

                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button type="button" onClick={closeWeekModal} className={modalSecondaryButtonClass}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateWeek}
                        disabled={!weekForm.topic.trim() || !weekForm.periodId}
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

            {showFileModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
                <div className="w-full max-w-3xl rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
                  <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                        <LinkIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">
                          {editingFile ? 'Edit File Link' : 'Add File Link'}
                        </h3>
                        <p className="text-sm text-slate-600">
                          {editingFile ? 'Update file information.' : 'Share external resources with students.'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={closeFileModal}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/60 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-4 p-6">
                    <div>
                      <label className={modalLabelClass}>File Name *</label>
                      <input
                        type="text"
                        className={modalInputClass}
                        value={fileForm.name}
                        onChange={(e) => setFileForm({ ...fileForm, name: e.target.value })}
                        placeholder="e.g., English Grammar Guide"
                      />
                    </div>

                    <div>
                      <label className={modalLabelClass}>File URL *</label>
                      <input
                        type="url"
                        className={modalInputClass}
                        value={fileForm.url}
                        onChange={(e) => setFileForm({ ...fileForm, url: e.target.value })}
                        placeholder="https://example.com/file.pdf"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className={modalLabelClass}>File Type</label>
                        <select
                          className={modalInputClass}
                          value={fileForm.type}
                          onChange={(e) => setFileForm({ ...fileForm, type: e.target.value })}
                        >
                          <option value="application/pdf">PDF Document</option>
                          <option value="image/jpeg">Image (JPEG)</option>
                          <option value="image/png">Image (PNG)</option>
                          <option value="video/mp4">Video (MP4)</option>
                          <option value="audio/mp3">Audio (MP3)</option>
                          <option value="application/msword">Word Document</option>
                          <option value="application/vnd.ms-excel">Excel Spreadsheet</option>
                          <option value="text/plain">Text File</option>
                          <option value="application/zip">ZIP Archive</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label className={modalLabelClass}>File Size (Optional)</label>
                        <input
                          type="number"
                          className={modalInputClass}
                          value={fileForm.size}
                          onChange={(e) => setFileForm({ ...fileForm, size: Number(e.target.value) || 0 })}
                          placeholder="Size in bytes"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className={modalLabelClass}>Period (Optional)</label>
                        <select
                          className={modalInputClass}
                          value={fileForm.periodId}
                          onChange={(e) => setFileForm({ ...fileForm, periodId: e.target.value, weekId: '' })}
                        >
                          <option value="">No period</option>
                          {periods.map((period) => (
                            <option key={period.id} value={period.id}>
                              {period.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className={modalLabelClass}>Week (Optional)</label>
                        <select
                          className={modalInputClass}
                          value={fileForm.weekId}
                          onChange={(e) => setFileForm({ ...fileForm, weekId: e.target.value })}
                          disabled={!fileForm.periodId}
                        >
                          <option value="">No week</option>
                          {fileForm.periodId && getWeeksByPeriod(fileForm.periodId).map((week) => (
                            <option key={week.id} value={week.id}>
                              Week {week.number}: {week.topic}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className={modalLabelClass}>Description (Optional)</label>
                      <textarea
                        className={cn(modalInputClass, 'min-h-[96px] resize-y')}
                        value={fileForm.description}
                        onChange={(e) => setFileForm({ ...fileForm, description: e.target.value })}
                        rows={3}
                        placeholder="Describe what this file contains..."
                      />
                    </div>

                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button type="button" onClick={closeFileModal} className={modalSecondaryButtonClass}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={editingFile ? handleSaveEdit : handleCreateFile}
                        disabled={!fileForm.name.trim() || !fileForm.url.trim() || (!editingFile && creatingFile)}
                        className={modalPrimaryButtonClass}
                      >
                        {editingFile ? (
                          <>
                            <Save className="h-4 w-4" />
                            <span>Save Changes</span>
                          </>
                        ) : (
                          creatingFile ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Adding...</span>
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4" />
                              <span>Add File Link</span>
                            </>
                          )
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showDeleteConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
                <div className="w-full max-w-xl rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
                  <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Delete File</h3>
                        <p className="text-sm text-slate-600">This action cannot be undone.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(null)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/60 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-4 p-6">
                    <p className="text-sm text-slate-700">
                      Are you sure you want to delete this file link? This will remove it from the course.
                    </p>
                    <p className="text-xs text-slate-500">
                      Note: the original file remains at its external location.
                    </p>

                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(null)}
                        className={modalSecondaryButtonClass}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => showDeleteConfirm && handleDeleteFile(showDeleteConfirm)}
                        className={modalDangerButtonClass}
                      >
                        Delete File Link
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
