import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademic } from '@/contexts/AcademicContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
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
  School,
  AlertTriangle,
  Zap,
  AlertCircle,
  Save,
  Edit,
  Layers
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type CourseFile } from '@/lib/services/fileService';
import { notificationService } from '@/lib/services/notificationService';
import { isNotificationAutomationEnabled } from '@/lib/services/notificationAutomation';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy,
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
  const [showFileModal, setShowFileModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [editingFile, setEditingFile] = useState<CourseFile | null>(null);
  const [expandedPeriods, setExpandedPeriods] = useState<string[]>([]);
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>([]);

  const [showDeletePeriodConfirm, setShowDeletePeriodConfirm] = useState<string | null>(null);
  const [showDeleteWeekConfirm, setShowDeleteWeekConfirm] = useState<string | null>(null);
  
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

  const userCourses = useMemo(() => {
    if (!user) return [];
    return isTeacher
      ? courses.filter(c => c.teacherId === user.id)
      : courses.filter(c => c.enrolledStudents.includes(user.id));
  }, [courses, user, isTeacher]);

  const selectedCourse = useMemo(() => 
    userCourses.find(c => c.id === selectedCourseId),
    [userCourses, selectedCourseId]
  );

  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);
    setSelectedFile(null);
    setFiles([]);
    setPeriods([]);
    setWeeks([]);
    const nextCourse = userCourses.find((course) => course.id === courseId);
    if (nextCourse) {
      navigate(`/courses/${nextCourse.code}/files`);
    }
  };
  const loadWeeks = async (courseId: string) => {
    try {
      const weeksRef = collection(firebaseDB, 'weeks');
      const q = query(
        weeksRef,
        where('courseId', '==', courseId),
        orderBy('order', 'asc')
      );

      const querySnapshot = await getDocs(q);
      const weeksData: Week[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date()
        } as Week;
      });

      if (courseId !== selectedCourseId) return;
      setWeeks(weeksData);
    } catch (error) {
      if (courseId !== selectedCourseId) return;
      setWeeks([]);
    }
  };

  const loadPeriods = async (courseId: string) => {
    try {
      const periodsRef = collection(firebaseDB, 'periods');
      const q = query(
        periodsRef,
        where('courseId', '==', courseId),
        orderBy('order', 'asc')
      );

      const querySnapshot = await getDocs(q);
      const periodsData: Period[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date()
        } as Period;
      });

      if (courseId !== selectedCourseId) return;
      setPeriods(periodsData);
    } catch (error) {
      if (courseId !== selectedCourseId) return;
      setPeriods([]);
    }
  };

  const loadFiles = async (courseId: string) => {
    if (!courseId) return;

    setLoading(true);
    try {
      const filesRef = collection(firebaseDB, 'course_files');
      const q = query(
        filesRef,
        where('courseId', '==', courseId),
        orderBy('uploadedAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const loadedFiles: CourseFile[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          uploadedAt: data.uploadedAt?.toDate() || new Date()
        } as CourseFile;
      });

      if (courseId !== selectedCourseId) return;
      setFiles(loadedFiles);
    } catch (error) {
      if (courseId !== selectedCourseId) return;
      setFiles([]);
    } finally {
      if (courseId === selectedCourseId) {
        setLoading(false);
      }
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
  if (!fileForm.name.trim() || !fileForm.url.trim() || !selectedCourseId || !user?.id) {
    alert('Please provide file name and URL');
    return;
  }

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
        await Promise.all(
          recipientIds.map((studentId) =>
            notificationService.createNotification(studentId, {
              title: "New material available",
              message: `"${newFileData.name}" was uploaded in ${selectedCourse.name}.`,
              type: "success",
              link: `/courses/${selectedCourse.code}/files`,
            }),
          ),
        );
      }
    }
    
  } catch (error) {
    alert('Error creating file. Please try again.');
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
  return files.filter((file) => file.weekId === weekId);
};

const getUnassignedFiles = () => {
  return files.filter(file => !file.weekId);
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

    const urlCourse = courseCode
      ? userCourses.find((course) => course.code === courseCode)
      : null;

    if (urlCourse) {
      if (selectedCourseId !== urlCourse.id) {
        setSelectedCourseId(urlCourse.id);
      }
      return;
    }

    if (selectedCourse && courseCode !== selectedCourse.code) {
      navigate(`/courses/${selectedCourse.code}/files`, { replace: true });
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
      loadPeriods(selectedCourseId);
      loadWeeks(selectedCourseId);
      loadFiles(selectedCourseId);
      return;
    }
    setSelectedFile(null);
    setFiles([]);
    setPeriods([]);
    setWeeks([]);
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

  if (loading && selectedCourseId) {
    return (
      <DashboardLayout title="Files" subtitle="Course materials and resources">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
            <div className="space-y-2">
              <p className="text-lg font-semibold text-gray-900">Loading files</p>
              <p className="text-sm text-gray-500">
                Preparing your course materials
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="File Manager"
      subtitle="Course materials organized by periods and weeks"
       contentClassName="pt-0 lg:pt-1"
    >
      <div className="space-y-2">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1 flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search files, descriptions..."
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="relative min-w-[180px]">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                  <School className="h-5 w-5 text-gray-400" />
                </div>
                <select
                  value={selectedCourseId}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium appearance-none cursor-pointer"
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
                        ))
                      }
                    </>
                  )}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
            {isTeacher && selectedCourseId && (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowPeriodModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Add Period
                </button>
                <button
                  onClick={() => {
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
                    setShowFileModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Add File Link
                </button>
              </div>
            )}
          </div>
        </div>

        {!selectedCourseId && userCourses.length === 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center shadow-sm">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-100 flex items-center justify-center">
              <FolderOpen className="h-10 w-10 text-gray-400" />
            </div>
            <h3 className="font-bold text-xl mb-3 text-gray-900">No courses available</h3>
            <p className="text-gray-500 max-w-md mx-auto mb-6">
              {isTeacher 
                ? 'You have no courses assigned as a teacher. Contact the administrator.' 
                : 'You are not enrolled in any course. Contact your teacher.'}
            </p>
          </div>
        )}

        {selectedCourseId && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                      <Layers className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-sm text-gray-500 mt-1">{selectedCourse?.name}</h3>
                    </div>
                  </div>
                </div>
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                  {periods.length === 0 ? (
                    <div className="text-center py-6">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center">
                        <Layers className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-gray-500 text-sm font-medium mb-3">No periods created yet</p>
                      {isTeacher && (
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
                      <div key={period.id} className="border border-gray-200 rounded-xl overflow-hidden">
                       <div className="flex items-center justify-between p-3 bg-blue-50">
  <button
    onClick={() => togglePeriod(period.id)}
    className="flex-1 flex items-center justify-between text-left group"
  >
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
        <Layers className="h-4 w-4 text-blue-600" />
      </div>
      <div>
        <span className="font-semibold text-sm text-gray-900">{period.name}</span>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs px-1.5 py-0.5 bg-white/50 text-blue-700 rounded">
            {getWeeksByPeriod(period.id).length} weeks
          </span>
        </div>
      </div>
    </div>
    <ChevronRight
      className={cn(
        'h-4 w-4 text-gray-400 transition-transform duration-300',
        expandedPeriods.includes(period.id) && 'rotate-90'
      )}
    />
  </button>
  
  {isTeacher && (
    <div className="flex gap-1 ml-2">
      <button
        onClick={() => {
          setWeekForm({ 
            number: getWeeksByPeriod(period.id).length + 1, 
            topic: '', 
            periodId: period.id 
          });
          setShowWeekModal(true);
        }}
        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        title="Add week"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        onClick={() => setShowDeletePeriodConfirm(period.id)}
        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        title="Delete period"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )}
</div>
                        {expandedPeriods.includes(period.id) && (
                          <div className="border-t border-gray-200 bg-gray-50/30 p-3 space-y-2">
                            {getWeeksByPeriod(period.id).length === 0 ? (
                              <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-100">
                                <Calendar className="h-4 w-4 text-gray-400" />
                                <p className="text-xs text-gray-500">No weeks available</p>
                                {isTeacher && (
                                  <button
                                    onClick={() => {
                                      setWeekForm({ 
                                        number: 1, 
                                        topic: '', 
                                        periodId: period.id 
                                      });
                                      setShowWeekModal(true);
                                    }}
                                    className="ml-auto p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title="Add week"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              getWeeksByPeriod(period.id).map(week => (
                                <div key={week.id} className="space-y-2">
                                 <div className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-gray-100">
  <div className="flex items-center gap-2">
    <button
      onClick={() => toggleWeek(week.id)}
      className="flex items-center gap-2 text-sm text-gray-900 hover:text-blue-600 transition-colors"
    >
      <ChevronRight
        className={cn(
          'h-4 w-4 text-gray-400 transition-transform duration-300',
          expandedWeeks.includes(week.id) && 'rotate-90'
        )}
      />
      <Calendar className="h-4 w-4 text-gray-400" />
      <span className="font-medium">Week {week.number}</span>
      <span className="text-gray-500 ml-1 truncate max-w-[100px]">
        {week.topic}
      </span>
    </button>
  </div>
  
  {isTeacher && (
    <div className="flex gap-1">
      <button
        onClick={() => setShowDeleteWeekConfirm(week.id)}
        className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
        title="Delete week"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )}
</div>
                                  {expandedWeeks.includes(week.id) && (
                                    <div className="pl-6 border-l border-gray-200 space-y-1.5">
                                      {getFilesByWeek(week.id).length === 0 ? (
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                                          <FileText className="h-4 w-4 text-gray-400" />
                                          <p className="text-xs text-gray-500">No files</p>
                                          {isTeacher && (
                                            <button
                                              onClick={() => {
                                                setFileForm(prev => ({
                                                  ...prev,
                                                  periodId: period.id,
                                                  weekId: week.id
                                                }));
                                                setShowFileModal(true);
                                              }}
                                              className="ml-auto p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                              title="Add file"
                                            >
                                              <Plus className="h-4 w-4" />
                                            </button>
                                          )}
                                        </div>
                                      ) : (
                                        getFilesByWeek(week.id).map(file => (
                                          <div key={file.id} className="flex items-center gap-2 bg-white rounded-lg border border-gray-100 hover:border-blue-200 transition-all">
                                            <button
                                              onClick={() => setSelectedFile(file)}
                                              className={cn(
                                                'flex-1 flex items-center gap-2 px-3 py-2 rounded-l-lg text-left transition-all',
                                                selectedFile?.id === file.id
                                                  ? 'bg-blue-50 border-r-2 border-blue-500'
                                                  : 'hover:bg-blue-50/50'
                                              )}
                                            >
                                              <div className={`h-8 w-8 rounded ${getFileColor(file.type)} flex items-center justify-center text-white`}>
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
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Unassigned Files</h4>
                      <div className="space-y-2">
                        {getUnassignedFiles().map(file => (
                          <div key={file.id} className="flex items-center gap-2 bg-gray-100 rounded-lg border border-gray-200 p-2">
                            <button
                              onClick={() => setSelectedFile(file)}
                              className={cn(
                                'flex-1 flex items-center gap-2 text-left',
                                selectedFile?.id === file.id && 'text-blue-600'
                              )}
                            >
                              <div className={`h-8 w-8 rounded ${getFileColor(file.type)} flex items-center justify-center text-white`}>
                                {getFileIcon(file.type)}
                              </div>
                              <span className="text-xs font-medium text-gray-900 truncate">{file.name}</span>
                            </button>
                            {isTeacher && (
                              <button
                                onClick={() => handleEditFile(file.id)}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Assign to week"
                              >
                                <Edit className="h-4 w-4" />
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
                            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 hover:shadow-md transition-all duration-300 font-medium"
                          >
                            <Maximize2 className="h-4 w-4" />
                          </button>
                        )}
                        {isTeacher && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEditFile(selectedFile.id)}
                              className="p-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 hover:shadow-md transition-all duration-300"
                              title="Edit file"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(selectedFile.id)}
                              className="p-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-red-50 hover:shadow-md transition-all duration-300"
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
                        "rounded-xl overflow-hidden border-2 border-gray-200 shadow-lg bg-white",
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
                      <div className="aspect-video bg-white rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300">
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
                        <div className="mt-4 pt-4 border-t border-gray-200">
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
                        <div className="flex items-center gap-3">

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
                </div>
              ) : (
                <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center shadow-sm">
                  <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <FileText className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="font-bold text-2xl mb-3 text-gray-900">
                    {files.length > 0 ? 'Select a File' : 'No Files Yet'}
                  </h3>
                  <p className="text-gray-500 max-w-md mx-auto mb-8">
                    {files.length > 0
                      ? 'Choose a file'
                      : 'No files have been added yet for this course.'
                    }
                  </p>
                  
                  {files.length > 0 && (
                    <div className="max-w-2xl mx-auto">
                        
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {files.slice(0, 4).map(file => (
                          <button
                            key={file.id}
                            onClick={() => setSelectedFile(file)}
                            className="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-200 hover:border-blue-200 hover:shadow-md transition-all duration-300 group text-left"
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
        {showPeriodModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
              <div className="p-6 border-b bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                      <Layers className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">Create Period</h3>
                      <p className="text-sm text-gray-500">Add a new period to organize content</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPeriodModal(false)}
                    className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Period Number *</label>
                    <select
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={periodForm.number}
                      onChange={(e) => setPeriodForm({ ...periodForm, number: parseInt(e.target.value) })}
                    >
                      {[1, 2, 3, 4].map(num => (
                        <option key={num} value={num}>{num} Term</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Period Name *</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      value={periodForm.name}
                      onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })}
                      placeholder="e.g., First Period, Quarter 1"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setShowPeriodModal(false)}
                      className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreatePeriod}
                      disabled={!periodForm.name.trim()}
                      className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white hover:shadow-lg disabled:opacity-50 font-medium transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      <Save className="h-4 w-4" />
                      Create Period
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
{showDeletePeriodConfirm && (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
      <div className="p-6 border-b bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-gray-100 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-gray-700" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-gray-900">Delete Period</h3>
              <p className="text-sm text-gray-500">This action cannot be undone</p>
            </div>
          </div>
          <button
            onClick={() => setShowDeletePeriodConfirm(null)}
            className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="space-y-4">
          <div className="bg-gray-100 border border-gray-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-gray-700 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-700">
                <p className="font-medium mb-1">Deleting this period will:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Remove all {weeks.filter(w => w.periodId === showDeletePeriodConfirm).length} weeks in this period</li>
                  <li>Unassign {files.filter(f => f.periodId === showDeletePeriodConfirm).length} files from this period</li>
                  <li>Files will remain in the course but without period assignment</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setShowDeletePeriodConfirm(null)}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
            >
              Cancel
            </button>
            <button
              onClick={() => handleDeletePeriod(showDeletePeriodConfirm)}
              className="flex-1 px-4 py-3 rounded-xl bg-gray-900 text-white hover:shadow-lg font-medium transition-all duration-300"
            >
              Delete Period
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
)}
{showDeleteWeekConfirm && (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
      <div className="p-6 border-b bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-gray-100 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-gray-700" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-gray-900">Delete Week</h3>
              <p className="text-sm text-gray-500">This action cannot be undone</p>
            </div>
          </div>
          <button
            onClick={() => setShowDeleteWeekConfirm(null)}
            className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="space-y-4">
          <div className="bg-gray-100 border border-gray-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-gray-700 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-700">
                <p className="font-medium mb-1">Deleting this week will:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Unassign {files.filter(f => f.weekId === showDeleteWeekConfirm).length} files from this week</li>
                  <li>Files will remain in the course but without week assignment</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setShowDeleteWeekConfirm(null)}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
            >
              Cancel
            </button>
            <button
              onClick={() => handleDeleteWeek(showDeleteWeekConfirm)}
              className="flex-1 px-4 py-3 rounded-xl bg-gray-900 text-white hover:shadow-lg font-medium transition-all duration-300"
            >
              Delete Week
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
)}
        {showWeekModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
              <div className="p-6 border-b bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                      <Calendar className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">Add Week</h3>
                      <p className="text-sm text-gray-500">Add a week to organize files</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowWeekModal(false)}
                    className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Week Number *</label>
                    <input
                      type="number"
                      min="1"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      value={weekForm.number}
                      onChange={(e) => setWeekForm({ ...weekForm, number: parseInt(e.target.value) })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Week Topic *</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      value={weekForm.topic}
                      onChange={(e) => setWeekForm({ ...weekForm, topic: e.target.value })}
                      placeholder="e.g., Introduction to Grammar"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setShowWeekModal(false)}
                      className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateWeek}
                      disabled={!weekForm.topic.trim() || !weekForm.periodId}
                      className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white hover:shadow-lg disabled:opacity-50 font-medium transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      <Save className="h-4 w-4" />
                      Add Week
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {showFileModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
              <div className="p-6 border-b bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                      <LinkIcon className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">
                        {editingFile ? 'Edit File Link' : 'Add File Link'}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {editingFile ? 'Update the file information' : 'Share external resources with students'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
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
                    }}
                    className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-2">
                <div className="space-y-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">File Name *</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      value={fileForm.name}
                      onChange={(e) => setFileForm({ ...fileForm, name: e.target.value })}
                      placeholder="e.g., English Grammar Guide"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">File URL *</label>
                    <input
                      type="url"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      value={fileForm.url}
                      onChange={(e) => setFileForm({ ...fileForm, url: e.target.value })}
                      placeholder="https://example.com/file.pdf"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">File Type</label>
                      <select
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">File Size (Optional)</label>
                      <input
                        type="number"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={fileForm.size}
                        onChange={(e) => setFileForm({ ...fileForm, size: parseInt(e.target.value) || 0 })}
                        placeholder="Size in bytes"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Period (Optional)</label>
                      <select
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={fileForm.periodId}
                        onChange={(e) => {
                          setFileForm({ ...fileForm, periodId: e.target.value, weekId: '' });
                        }}
                      >
                        <option value="">No period</option>
                        {periods.map(period => (
                          <option key={period.id} value={period.id}>
                            {period.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Week (Optional)</label>
                      <select
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={fileForm.weekId}
                        onChange={(e) => setFileForm({ ...fileForm, weekId: e.target.value })}
                        disabled={!fileForm.periodId}
                      >
                        <option value="">No week</option>
                        {fileForm.periodId && getWeeksByPeriod(fileForm.periodId).map(week => (
                          <option key={week.id} value={week.id}>
                            Week {week.number}: {week.topic}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                    <textarea
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={fileForm.description}
                      onChange={(e) => setFileForm({ ...fileForm, description: e.target.value })}
                      rows={3}
                      placeholder="Describe what this file contains..."
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => {
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
                      }}
                      className="flex-1 px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={editingFile ? handleSaveEdit : handleCreateFile}
                      disabled={!fileForm.name.trim() || !fileForm.url.trim()}
                      className="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white hover:shadow-lg disabled:opacity-50 font-medium transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      {editingFile ? (
                        <>
                          <Save className="h-4 w-4" />
                          Save Changes
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4" />
                          Add File Link
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
              <div className="p-6 border-b bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-gray-100 flex items-center justify-center">
                      <AlertTriangle className="h-4 w-4 text-gray-700" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">Delete File</h3>
                      <p className="text-sm text-gray-500">This action cannot be undone</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDeleteConfirm(null)}
                    className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <p className="text-gray-700 mb-6">
                  Are you sure you want to delete this file link? This will remove it from the course.
                  <br />
                  <span className="text-sm text-gray-500 mt-2 block">
                    Note: The actual file will remain at its external location.
                  </span>
                </p>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(null)}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDeleteFile(showDeleteConfirm)}
                    className="flex-1 px-4 py-3 rounded-xl bg-gray-900 text-white hover:shadow-lg font-medium transition-all duration-300"
                  >
                    Delete File Link
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
