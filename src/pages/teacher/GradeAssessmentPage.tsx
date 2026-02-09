// courses/:courseCode/assessments/:assessmentId/grade - VERSIÓN OPTIMIZADA
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademic } from '@/contexts/AcademicContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { assessmentService } from '@/lib/services/assessmentService';
import { gradeSheetService } from '@/lib/services/gradeSheetService';
import { submissionService } from '@/lib/services/submissionService';
import { enrollmentService } from '@/lib/firestore';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft, 
  Save, X,
  Users, 
  FileText, 
  Calendar,
  Percent,
  AlertCircle,
  CheckCircle,
  FileSpreadsheet,
  MessageSquare,
  Eye,
  Download,
  Clock,
  CalendarClock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  File,
  ExternalLink,
  BookOpen,
  Search,
  Filter,
  Loader2,
  Sparkles,
  Zap,
  Target,
  Trophy,
  BarChart3,
  TrendingUp,
  Award,
  Bookmark,
  Shield,
  Activity,
  LineChart,
  PieChart,
  CheckSquare,
  XCircle,
  FileCheck,
  FileBarChart,
  UserCheck
} from 'lucide-react';

interface StudentGrade {
  studentId: string;
  name: string;
  email?: string;
  grade?: number;
  comment?: string;
  status: 'pending' | 'graded' | 'completed' | 'incomplete';
  submittedAt?: Date | null;
  submission?: any;
  hasSubmission?: boolean;
  submissionStatus?: 'draft' | 'submitted' | 'graded' | 'pending' | 'no_submission';

  submissionContent?: string;
  wordCount?: number;
  characterCount?: number;
  submissionDate?: Date;
}

interface FirestoreGrade {
  value: number;
  comment: string;
  submittedAt: Date;
}

interface SubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: StudentGrade | null;
  assessmentName: string;
}

// Componente Modal para ver entregas
const SubmissionModal: React.FC<SubmissionModalProps> = ({
  isOpen,
  onClose,
  student,
  assessmentName
}) => {
  if (!isOpen || !student || !student.submissionContent) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header del modal */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-600 to-cyan-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6" />
              <div>
                <h2 className="text-xl font-bold">Entrega de {student.name}</h2>
                <p className="text-sm text-blue-100 opacity-90">
                  {assessmentName} • {student.wordCount} palabras • {student.characterCount} caracteres
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors"
            >
              <XCircle className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Contenido de la entrega */}
        <div className="p-6">
          <div className="mb-2 p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200">
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-blue-600" />
                <span className="font-medium">{student.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-amber-600" />
                <span>
                  {student.submissionDate ? 
                    format(student.submissionDate, "dd/MM/yyyy HH:mm", { locale: es }) : 
                    "Sin fecha de envío"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <File className="h-4 w-4 text-emerald-600" />
                <span>{student.wordCount} palabras</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-600" />
                <span>{student.characterCount} caracteres</span>
              </div>
            </div>
          </div>

          {/* Contenido de la entrega */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-xl p-6">
            <div className="bg-white rounded-lg p-6 shadow-sm max-h-[50vh] overflow-y-auto">
              <pre className="text-gray-800 whitespace-pre-wrap font-sans leading-relaxed text-sm">
                {student.submissionContent}
              </pre>
            </div>

            {/* Feedback existente si lo hay */}
            {student.submission?.feedback && (
              <div className="mt-6 p-4 bg-gradient-to-r from-blue-50/50 to-cyan-50/50 border border-blue-200 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                  <h4 className="font-bold text-blue-900">Retroalimentación anterior:</h4>
                </div>
                <p className="text-sm text-blue-800 bg-white/50 p-3 rounded-lg">
                  {student.submission.feedback}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer del modal */}
        <div className="sticky bottom-0 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200 p-4">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Componente de skeleton para loading
const LoadingSkeleton = () => (
  <div className="space-y-2">
    {/* Header Skeleton */}
    <div className="modern-card">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-2">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse"></div>
          <div className="space-y-2">
            <div className="h-6 w-48 bg-gradient-to-r from-gray-200 to-gray-300 rounded animate-pulse"></div>
            <div className="h-4 w-32 bg-gradient-to-r from-gray-200 to-gray-300 rounded animate-pulse"></div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 w-40 bg-gradient-to-r from-gray-200 to-gray-300 rounded-xl animate-pulse"></div>
        </div>
      </div>

      {/* Assessment Info Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300 rounded-xl p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-gray-200 to-gray-300"></div>
              <div className="space-y-2">
                <div className="h-3 w-20 bg-gradient-to-r from-gray-200 to-gray-300 rounded"></div>
                <div className="h-4 w-16 bg-gradient-to-r from-gray-200 to-gray-300 rounded"></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Statistics Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="modern-card">
            <div className="text-center">
              <div className="h-3 w-24 bg-gradient-to-r from-gray-200 to-gray-300 rounded mx-auto mb-2 animate-pulse"></div>
              <div className="h-8 w-16 bg-gradient-to-r from-gray-200 to-gray-300 rounded mx-auto animate-pulse"></div>
              <div className="h-2 w-20 bg-gradient-to-r from-gray-200 to-gray-300 rounded mx-auto mt-2 animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Table Skeleton */}
    <div className="modern-card">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse"></div>
          <div className="space-y-2">
            <div className="h-5 w-48 bg-gradient-to-r from-gray-200 to-gray-300 rounded animate-pulse"></div>
            <div className="h-3 w-32 bg-gradient-to-r from-gray-200 to-gray-300 rounded animate-pulse"></div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
              {[...Array(5)].map((_, i) => (
                <th key={i} className="py-4 px-6">
                  <div className="h-4 w-24 bg-gradient-to-r from-gray-200 to-gray-300 rounded animate-pulse"></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {[...Array(5)].map((_, rowIndex) => (
              <tr key={rowIndex}>
                {[...Array(5)].map((_, cellIndex) => (
                  <td key={cellIndex} className="py-4 px-6">
                    <div className="flex items-center gap-4">
                      <div className="space-y-2">
                        <div className="h-4 w-32 bg-gradient-to-r from-gray-200 to-gray-300 rounded animate-pulse"></div>
                        {cellIndex === 0 && (
                          <div className="h-3 w-20 bg-gradient-to-r from-gray-200 to-gray-300 rounded animate-pulse"></div>
                        )}
                      </div>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default function GradeAssessmentPage() {
  const { courseCode, assessmentId } = useParams<{ courseCode: string; assessmentId: string }>();
  const { user } = useAuth();
  const { courses } = useAcademic();
  const navigate = useNavigate(); 
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [assessment, setAssessment] = useState<any>(null);
  const [gradeSheet, setGradeSheet] = useState<any>(null);
  const [students, setStudents] = useState<StudentGrade[]>([]);
  const [courseName, setCourseName] = useState('');
  const [courseId, setCourseId] = useState<string>('');
  
  const [activeTab, setActiveTab] = useState<'grades' | 'submissions'>('grades');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Estado para el modal
  const [submissionModal, setSubmissionModal] = useState<{
    isOpen: boolean;
    student: StudentGrade | null;
  }>({
    isOpen: false,
    student: null,
  });

  // Estado para datos básicos ya cargados
  const [basicInfoLoaded, setBasicInfoLoaded] = useState(false);

  // Función para abrir el modal
  const openSubmissionModal = (student: StudentGrade) => {
    setSubmissionModal({
      isOpen: true,
      student: student
    });
  };

  // Función para cerrar el modal
  const closeSubmissionModal = () => {
    setSubmissionModal({
      isOpen: false,
      student: null
    });
  };

  // Función para obtener color de tipo de evaluación
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'exam': return 'bg-gradient-to-br from-red-100 to-pink-100 text-red-700 border border-red-200';
      case 'quiz': return 'bg-gradient-to-br from-blue-100 to-cyan-100 text-blue-700 border border-blue-200';
      case 'homework': return 'bg-gradient-to-br from-green-100 to-emerald-100 text-green-700 border border-green-200';
      case 'project': return 'bg-gradient-to-br from-purple-100 to-pink-100 text-purple-700 border border-purple-200';
      case 'participation': return 'bg-gradient-to-br from-amber-100 to-orange-100 text-amber-700 border border-amber-200';
      case 'delivery': return 'bg-gradient-to-br from-cyan-100 to-blue-100 text-cyan-700 border border-cyan-200';
      default: return 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-700 border border-gray-300';
    }
  };

  // Función para obtener ícono de tipo
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'exam': return <FileText className="h-4 w-4" />;
      case 'quiz': return <BookOpen className="h-4 w-4" />;
      case 'homework': return <FileCheck className="h-4 w-4" />;
      case 'project': return <TrendingUp className="h-4 w-4" />;
      case 'participation': return <Users className="h-4 w-4" />;
      case 'delivery': return <FileBarChart className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const loadSubmissionsDirectly = async (assessmentId: string): Promise<any[]> => {
    try {
      const q = query(
        collection(db, 'submissions'),
        where('assessmentId', '==', assessmentId)
      );
      
      const querySnapshot = await getDocs(q);
      
      const submissions: any[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();

        let submittedAt = null;
        if (data.submittedAt) {
          if (data.submittedAt.toDate) {
            submittedAt = data.submittedAt.toDate();
          } else if (data.submittedAt.seconds) {
            submittedAt = new Date(data.submittedAt.seconds * 1000);
          } else if (typeof data.submittedAt === 'string') {
            submittedAt = new Date(data.submittedAt);
          }
        }

        let updatedAt = null;
        if (data.updatedAt) {
          if (data.updatedAt.toDate) {
            updatedAt = data.updatedAt.toDate();
          } else if (data.updatedAt.seconds) {
            updatedAt = new Date(data.updatedAt.seconds * 1000);
          } else if (typeof data.updatedAt === 'string') {
            updatedAt = new Date(data.updatedAt);
          }
        }
        
        const actualStatus = submittedAt ? 'submitted' : (data.status || 'draft');

        submissions.push({
          id: doc.id,
          studentId: data.studentId,
          assessmentId: data.assessmentId,
          courseId: data.courseId,
          content: data.content || '',
          status: actualStatus,
          grade: data.grade,
          feedback: data.feedback,
          submittedAt: submittedAt,
          updatedAt: updatedAt,
          wordCount: data.wordCount || 0,
          characterCount: data.characterCount || 0,
          metadata: data.metadata || {}
        });
      });
      
      return submissions;
    } catch (error: any) {
      console.error('Error cargando entregas:', error);
      return [];
    }
  };

  useEffect(() => {
    if (courseCode && assessmentId && user) {
      // Cargar primero la información básica
      loadBasicInfo();
    }
  }, [courseCode, assessmentId, user]);

  // Función para cargar solo la información básica rápidamente
  const loadBasicInfo = async () => {
    try {
      const course = courses.find(c => c.code === courseCode);
      if (!course) {
        toast.error('Curso no encontrado');
        navigate('/courses');
        return;
      }
      
      setCourseId(course.id);
      setCourseName(course.name || 'Course');
      
      // Cargar evaluación
      const assessmentData = await assessmentService.getAssessmentById(assessmentId!);
      if (!assessmentData) {
        toast.error('Evaluación no encontrada');
        navigate(`/courses/${courseCode}/assessments`);
        return;
      }
      setAssessment(assessmentData);
      
      setBasicInfoLoaded(true);
      
      // Luego cargar el resto en segundo plano
      loadRestOfData(course, assessmentData);
    } catch (error) {
      console.error('Error cargando información básica:', error);
      toast.error('Error al cargar la evaluación');
      setIsLoading(false);
    }
  };

  // Función para cargar el resto de datos
  const loadRestOfData = async (course: any, assessmentData: any) => {
    try {
      // Cargar estudiantes inscritos
      const enrolledStudents = await enrollmentService.getEnrolledStudents(course.id);
      
      let studentSubmissions: any[] = [];
      if (assessmentData.assessmentType === 'delivery') {
        try {
          const submissions = await submissionService.getSubmissionsByAssessment(assessmentId!);
          studentSubmissions = submissions;
        } catch (serviceError) {
          console.log('Cargando entregas directamente...');
          studentSubmissions = await loadSubmissionsDirectly(assessmentId!);
        }
      }

      let gradeSheetData = null;
      if (assessmentData.gradeSheetId) {
        gradeSheetData = await gradeSheetService.getById(assessmentData.gradeSheetId);
        setGradeSheet(gradeSheetData);
      }

  // En la función loadRestOfData, corrige la asignación de submissionStatus:
const studentsData: StudentGrade[] = enrolledStudents.map((student: any) => {
  const studentSubmission = studentSubmissions.find(
    (sub: any) => sub.studentId === student.id
  );
  
  // Mejorar la detección del estado con tipos correctos
  let submissionStatus: 'draft' | 'submitted' | 'graded' | 'pending' | 'no_submission' = 'no_submission';
  let hasSubmission = false;
  let submissionDate = undefined;
  
  if (studentSubmission) {
    hasSubmission = true;
    
    // Si tiene fecha de envío y no está en estado draft, es submitted
    if (studentSubmission.submittedAt) {
      submissionDate = studentSubmission.submittedAt;
      submissionStatus = studentSubmission.status === 'draft' ? 'draft' : 'submitted';
    } 
    // Si no tiene fecha de envío pero tiene contenido, es draft
    else if (studentSubmission.content && studentSubmission.content.trim().length > 0) {
      submissionStatus = 'draft';
    }
    // Si tiene estado definido, usarlo asegurándonos que sea un tipo válido
    else if (studentSubmission.status) {
      const validStatuses = ['draft', 'submitted', 'graded', 'pending', 'no_submission'] as const;
      if (validStatuses.includes(studentSubmission.status as any)) {
        submissionStatus = studentSubmission.status as 'draft' | 'submitted' | 'graded' | 'pending' | 'no_submission';
      }
    }
  }
  
  let gradeInfo = { 
    grade: undefined as number | undefined, 
    comment: '', 
    status: 'pending' as 'pending' | 'graded',
    submittedAt: null as Date | null
  };
  
  if (gradeSheetData) {
    const activity = gradeSheetData?.activities?.find((act: any) => 
      act.name === assessmentData.name || 
      act.id === assessmentData.id ||
      act.assessmentId === assessmentId
    );
    
    if (activity && gradeSheetData?.students) {
      const studentGrade = gradeSheetData.students.find((s: any) => s.studentId === student.id);
      
      if (studentGrade && studentGrade.grades && studentGrade.grades[activity.id]) {
        const gradeData = studentGrade.grades[activity.id];
        
        let submittedAt = null;
        if (gradeData.submittedAt) {
          if (gradeData.submittedAt instanceof Date) {
            submittedAt = gradeData.submittedAt;
          } else if (typeof gradeData.submittedAt === 'string') {
            submittedAt = new Date(gradeData.submittedAt);
          } else if (gradeData.submittedAt && typeof gradeData.submittedAt === 'object') {
            if ('toDate' in gradeData.submittedAt) {
              submittedAt = (gradeData.submittedAt as any).toDate();
            } else if ('seconds' in gradeData.submittedAt) {
              submittedAt = new Date((gradeData.submittedAt as any).seconds * 1000);
            }
          }
        }
        
        gradeInfo = {
          grade: gradeData.value,
          comment: gradeData.comment || '',
          status: 'graded',
          submittedAt: submittedAt
        };
      }
    }
  }
  
  return {
    studentId: student.id,
    name: student.name || `Student ${student.id.substring(0, 8)}`,
    email: student.email,
    grade: gradeInfo.grade,
    comment: gradeInfo.comment,
    status: gradeInfo.status,
    submittedAt: gradeInfo.submittedAt,
    submission: studentSubmission,
    hasSubmission: hasSubmission,
    submissionStatus: submissionStatus, // Ahora tiene el tipo correcto
    submissionContent: studentSubmission?.content,
    wordCount: studentSubmission?.wordCount,
    characterCount: studentSubmission?.characterCount,
    submissionDate: submissionDate
  };
});

      const sortedStudents = studentsData.sort((a, b) => {
        const nameA = a.name.toUpperCase();
        const nameB = b.name.toUpperCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      });

      setStudents(sortedStudents);
      
    } catch (error) {
      console.error('Error cargando datos adicionales:', error);
      toast.error('Error al cargar datos de estudiantes');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredStudents = students.filter(student => {
    const matchesSearch = searchTerm === '' || 
      student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.studentId.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === 'all' || 
      (filterStatus === 'with_submission' && student.hasSubmission) ||
      (filterStatus === 'without_submission' && !student.hasSubmission) ||
      (filterStatus === 'submitted' && student.submissionStatus === 'submitted') ||
      (filterStatus === 'draft' && student.submissionStatus === 'draft') ||
      (filterStatus === 'graded' && student.status === 'graded') ||
      (filterStatus === 'pending' && student.status === 'pending');
    
    return matchesSearch && matchesFilter;
  });

  const downloadSubmission = (student: StudentGrade) => {
    if (!student.submissionContent) {
      toast.error('No hay contenido para descargar');
      return;
    }
    
    const blob = new Blob([student.submissionContent], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `entrega_${student.name.replace(/\s+/g, '_')}_${assessment?.name?.replace(/\s+/g, '_') || 'evaluacion'}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success(`Entrega de ${student.name} descargada`);
  };

  const updateStudentGrade = (studentId: string, field: 'grade' | 'comment', value: string | number) => {
    const studentIndex = students.findIndex(s => s.studentId === studentId);
    if (studentIndex === -1) return;
    
    const newStudents = [...students];
    if (field === 'grade') {
      const numValue = value === '' ? undefined : Number(value);
      newStudents[studentIndex] = {
        ...newStudents[studentIndex],
        grade: numValue,
        status: numValue !== undefined ? 'graded' : 'pending',
        ...(numValue !== undefined && { submittedAt: new Date() })
      };
    } else {
      newStudents[studentIndex] = {
        ...newStudents[studentIndex],
        [field]: String(value)
      };
    }
    setStudents(newStudents);
  };

  const validateGrades = (): boolean => {
    if (!assessment) return false;
    
    for (const student of students) {
      if (student.grade !== undefined) {
        if (student.grade < 0 || student.grade > assessment.maxPoints) {
          toast.error(`La calificación para ${student.name} debe estar entre 0 y ${assessment.maxPoints}`);
          return false;
        }
      }
    }
    return true;
  };

  const handleSaveGrades = async () => {
    if (!assessment || !user || !courseId || !assessmentId) return;
    
    if (!validateGrades()) return;
    
    setIsSaving(true);
      
    try {
      if (assessment.gradeSheetId) {
        const sheet = await gradeSheetService.getById(assessment.gradeSheetId);
        if (!sheet) {
          toast.error('Grade sheet not found');
          return;
        }
          
        let activityId = sheet?.activities?.find((act: any) => 
          act.name === assessment.name || 
          act.id === assessment.id ||
          act.assessmentId === assessmentId
        )?.id;
        
        const currentActivities = sheet?.activities || [];
        let updatedActivities = [...currentActivities];
          
        if (!activityId) {
          activityId = `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
          const newActivity = {
            id: activityId,
            name: assessment.name,
            description: assessment.description || '',
            maxScore: assessment.maxPoints,
            type: assessment.type || 'quiz',
            percentage: assessment.percentage || 0,
            weight: assessment.percentage || 0,
            passingScore: assessment.passingScore || 0,
            status: 'graded',
            createdAt: new Date(),
            assessmentId: assessmentId
          };
            
          updatedActivities.push(newActivity);
            
          await gradeSheetService.update(assessment.gradeSheetId, {
            activities: updatedActivities
          });
        }
          
        const updatedStudents = [...(sheet.students || [])];
        
        for (const student of students) {
          if (student.grade !== undefined) {
            const studentIndex = updatedStudents.findIndex((s: any) => s.studentId === student.studentId);
            
            const gradeData: FirestoreGrade = {
              value: student.grade,
              comment: student.comment || '',
              submittedAt: new Date()
            };
            
            if (studentIndex >= 0) {
              const existingStudent = updatedStudents[studentIndex];
              
              updatedStudents[studentIndex] = {
                ...existingStudent,
                grades: {
                  ...existingStudent.grades,
                  [activityId]: gradeData
                },
                status: 'completed'
              };
            } else {
              updatedStudents.push({
                studentId: student.studentId,
                name: student.name,
                grades: {
                  [activityId]: gradeData
                },
                status: 'completed'
              });
            }
            
            if (student.hasSubmission && student.submission?.id) {
              try {
                await submissionService.gradeSubmission(
                  student.submission.id,
                  student.grade,
                  student.comment,
                  user.id
                );
              } catch (error) {
                console.error(`Error grading submission for ${student.name}:`, error);
              }
            }
          }
        }
        
        await gradeSheetService.update(assessment.gradeSheetId, {
          students: updatedStudents,
          updatedAt: new Date(),
          isPublished: true
        });
          
        await assessmentService.updateAssessment(assessmentId, {
          status: 'graded'
        });
        
        toast.success('Calificaciones y comentarios guardados exitosamente');
        navigate(`/courses/${courseCode}/assessments/${assessmentId}`);
          
      } else {
        console.warn('⚠️ No grade sheet ID found, cannot save grades');
        toast.error('No hay hoja de calificaciones asociada a esta evaluación');
        return;
      }
      
    } catch (error: any) {
      console.error('❌ Error saving grades:', error);
      toast.error(`Error al guardar calificaciones: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

const calculateStats = () => {
  const graded = students.filter(s => s.grade !== undefined && s.status === 'graded');
  const total = students.length;
  const average = graded.length > 0 
    ? graded.reduce((sum, s) => sum + (s.grade || 0), 0) / graded.length 
    : 0;
  const passing = graded.filter(s => (s.grade || 0) >= (assessment?.passingScore || 0)).length;
    
  // CORREGIDO: Contar borradores correctamente
  const submittedCount = students.filter(s => 
    s.hasSubmission && 
    s.submissionStatus === 'submitted' && 
    s.submissionDate
  ).length;
  
  const draftCount = students.filter(s => 
    s.hasSubmission && 
    (s.submissionStatus === 'draft' || 
     (!s.submissionDate && s.submissionStatus !== 'submitted') ||
     (s.submissionContent && !s.submissionDate))
  ).length;
  
  const noSubmissionCount = students.filter(s => !s.hasSubmission).length;
    
  return {
    total,
    graded: graded.length,
    average: average.toFixed(1),
    passingRate: total > 0 ? ((passing / total) * 100).toFixed(0) : '0',
    pending: total - graded.length,
    passingCount: passing,
    failingCount: graded.length - passing,
    submittedCount,
    draftCount,
    noSubmissionCount,
    submissionRate: total > 0 ? ((submittedCount / total) * 100).toFixed(0) : '0'
  };
};

  const stats = calculateStats();

  // Mostrar skeleton mientras carga la información básica
  if (!basicInfoLoaded) {
    return (
      <DashboardLayout title="Calificar Evaluación" subtitle="Cargando...">
        <LoadingSkeleton />
      </DashboardLayout>
    );
  }

  if (!assessment) {
    return (
      <DashboardLayout title="Calificar Evaluación" subtitle="Evaluación no encontrada">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <div className="h-20 w-20 mx-auto rounded-2xl bg-gradient-to-br from-red-100 to-pink-100 flex items-center justify-center border border-red-200">
              <AlertCircle className="h-10 w-10 text-red-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-gray-900">Evaluación no encontrada</h3>
              <p className="text-gray-600">La evaluación que buscas no existe o no tienes acceso.</p>
            </div>
            <button
              onClick={() => navigate(`/courses/${courseCode}/assessments`)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg transition-all duration-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a Evaluaciones
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={`Calificar: ${assessment.name}`}
      subtitle={courseName}
    >
      <div className="space-y-2">
        {/* Header - DISEÑO MODERNO */}
        <div>
        


          {/* Statistics - DISEÑO MODERNO */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-2">
  {/* Total Estudiantes */}
  <div className="modern-card">
    <div className="text-center">
      <p className="text-sm text-gray-700 font-bold">Total Estudiantes</p>
      <p className="text-2xl font-bold text-gray-900">
        {isLoading ? '...' : stats.total}
      </p>
      <div className="mt-2 text-xs text-gray-500">
        Inscritos en el curso
      </div>
    </div>
  </div>
  
  {/* Calificados */}
  <div className="modern-card border-blue-200">
    <div className="text-center">
      <p className="text-sm text-blue-700 font-bold">Calificados</p>
      <p className="text-2xl font-bold text-blue-600">
        {isLoading ? '...' : stats.graded}
      </p>
      <div className="mt-2 text-xs text-blue-500">
        {isLoading ? '...' : stats.pending} pendientes
      </div>
    </div>
  </div>
  
  {/* Promedio */}
  <div className="modern-card border-emerald-200">
    <div className="text-center">
      <p className="text-sm text-emerald-700 font-bold">Promedio</p>
      <p className="text-2xl font-bold text-emerald-600">
        {isLoading ? '...' : stats.average}
      </p>
      <div className="mt-2 text-xs text-emerald-500">
        de {assessment.maxPoints} puntos
      </div>
    </div>
  </div>
  
  {/* Tasa de Aprobación */}
  <div className="modern-card border-purple-200">
    <div className="text-center">
      <p className="text-sm text-purple-700 font-bold">Tasa de Aprobación</p>
      <p className="text-2xl font-bold text-purple-600">
        {isLoading ? '...' : stats.passingRate}%
      </p>
      <div className="mt-2 text-xs text-purple-500">
        {isLoading ? '...' : stats.passingCount} de {stats.total}
      </div>
    </div>
  </div>
  
  {/* Entregas Enviadas (solo si es delivery) */}
  {assessment.assessmentType === 'delivery' ? (
    <div className="modern-card border-cyan-200">
      <div className="text-center">
        <p className="text-sm text-cyan-700 font-bold">Entregas Enviadas</p>
        <p className="text-2xl font-bold text-cyan-600">
          {isLoading ? '...' : stats.submittedCount}
        </p>
        <div className="mt-2 text-xs text-cyan-500">
          {isLoading ? '...' : stats.submissionRate}% enviado
        </div>
      </div>
    </div>
  ) : (
    <div className="modern-card border-amber-200">
      <div className="text-center">
        <p className="text-sm text-amber-700 font-bold">Porcentaje</p>
        <p className="text-2xl font-bold text-amber-600">
          {assessment.percentage}%
        </p>
        <div className="mt-2 text-xs text-amber-500">
          de la calificación final
        </div>
      </div>
    </div>
  )}
</div>



       
        </div>

 

        {/* Barra de búsqueda y filtros - DISEÑO MODERNO */}
        <div className="modern-card">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar estudiantes..."
                  className="w-full pl-11 pr-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 text-sm font-medium"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
                    <div className="flex flex-col sm:flex-row gap-3">
            
              <button
                onClick={handleSaveGrades}
                disabled={isSaving}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg transition-all duration-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                 <span className="flex items-center gap-2">
                    <Save className="h-4 w-4" />
                   
                  </span>
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select
                  className="pl-10 pr-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 appearance-none text-sm font-medium"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="all">Todos los estudiantes</option>
                  <option value="with_submission">Con entrega</option>
                  <option value="without_submission">Sin entrega</option>
                  <option value="submitted">Enviados</option>
                  <option value="draft">Borradores</option>
                  <option value="graded">Calificados</option>
                  <option value="pending">Pendientes</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Grading Table - DISEÑO MODERNO */}
   {/* Grading Table - DISEÑO MODERNO */}
<div className="modern-card">
  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-2">
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
        <Users className="h-5 w-5 text-blue-600" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-gray-900"> 
          Entregas de Estudiantes
        </h2>
        <p className="text-sm text-gray-600">
          {isLoading ? 'Cargando...' : `${filteredStudents.length} de ${students.length} estudiantes`}
        </p>
      </div>
    </div>
    <div className="flex items-center gap-4">
      <div className="text-sm text-gray-600">
        Puntos máx: <span className="font-bold text-gray-900">{assessment.maxPoints}.0</span>
      </div>
      <div className="text-sm text-gray-600">
        Aprobación: <span className="font-bold text-gray-900">{assessment.passingScore}.0</span>
      </div>
    </div>
  </div>

  {isLoading ? (
    <div className="text-center py-8">
      <div className="inline-flex items-center gap-2 text-gray-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Cargando estudiantes...</span>
      </div>
    </div>
  ) : (
    <>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
              <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">Estudiante</th>
              <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">
                Calificación (0-{assessment.maxPoints})
              </th>
              <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">Estado Entrega</th>
              <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">Comentarios</th>
              <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredStudents.map((student) => {
              const isPassing = student.grade !== undefined && student.grade >= assessment.passingScore;
              const isGraded = student.status === 'graded' && student.grade !== undefined;
      
              let submissionStatusColor = '';
              let submissionStatusText = '';
              let submissionIcon = null;
              
              if (student.hasSubmission) {
                switch (student.submissionStatus) {
                  case 'submitted': 
                    submissionStatusColor = 'bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 border border-blue-200';
                    submissionStatusText = 'Submitted';
                    submissionIcon = <CheckCircle className="h-3 w-3" />;
                    break;
                  case 'draft':
                    submissionStatusColor = 'bg-gradient-to-br from-amber-100 to-orange-100 text-amber-700 border border-amber-200';
                    submissionStatusText = 'Draft';
                    submissionIcon = <Clock className="h-3 w-3" />;
                    break;
                  case 'graded':
                    submissionStatusColor = 'bg-gradient-to-br from-emerald-100 to-green-100 text-emerald-700 border border-emerald-200';
                    submissionStatusText = 'Graded';
                    submissionIcon = <CheckSquare className="h-3 w-3" />;
                    break;
                  default:
                    submissionStatusColor = 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-700 border border-gray-300';
                    submissionStatusText = 'Pending';
                    submissionIcon = <Clock className="h-3 w-3" />;
                }
              } else {
                submissionStatusColor = 'bg-gradient-to-br from-red-100 to-pink-100 text-red-700 border border-red-200';
                submissionStatusText = 'No Submission';
                submissionIcon = <AlertTriangle className="h-3 w-3" />;
              }
              
              // Estado de calificación
              let gradeStatusColor = '';
              let gradeStatusText = '';
              
              if (isGraded) {
                if (isPassing) {
                  gradeStatusColor = 'bg-gradient-to-br from-emerald-100 to-green-100 text-emerald-700 border border-emerald-200';
                  gradeStatusText = 'Approved';
                } else {
                  gradeStatusColor = 'bg-gradient-to-br from-red-100 to-pink-100 text-red-700 border border-red-200';
                  gradeStatusText = 'No Approved';
                }
              } else {
                gradeStatusColor = 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-700 border border-gray-300';
                gradeStatusText = 'Pending';
              }
              
              return (
                <tr key={student.studentId} className="hover:bg-gradient-to-r hover:from-blue-50/30 hover:to-cyan-50/30 transition-all">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{student.name}</p>
                       
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <input
                            type="number"
                            value={student.grade ?? ''}
                            onChange={(e) => updateStudentGrade(student.studentId, 'grade', e.target.value)}
                            className="w-20 px-4 py-1.5 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 text-sm font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="3.5"
                            min={0}
                            max={assessment.maxPoints}
                            step="0.1"
                          />
                        </div>
                        <span className="text-sm text-gray-600 font-medium">
                          / {assessment.maxPoints}.0
                        </span>
                      </div>
                     
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="space-y-2">
                      <span className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${submissionStatusColor}`}>
                        {submissionIcon}
                        {submissionStatusText}
                      </span>
                     
                     
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="relative">
                      <textarea
                        value={student.comment || ''}
                        onChange={(e) => updateStudentGrade(student.studentId, 'comment', e.target.value)}
                        placeholder="Comments..."
                        rows={2}
                        className="w-full px-4 py-2.5 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 text-sm font-medium resize-none"
                      />
                    </div>
                    {student.comment && (
                      <p className="text-xs text-gray-500 mt-2">
                        {student.comment.length} caracteres
                      </p>
                    )}
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openSubmissionModal(student)}
                        disabled={!student.submissionContent}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 hover:from-blue-200 hover:to-cyan-200 transition-all duration-300 font-medium text-sm border border-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Ver entrega"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => downloadSubmission(student)}
                        disabled={!student.submissionContent}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-cyan-100 to-blue-100 text-cyan-700 hover:from-cyan-200 hover:to-blue-200 transition-all duration-300 font-medium text-sm border border-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Descargar entrega"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredStudents.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-16 w-16 text-gray-300 mx-auto mb-2" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">No hay estudiantes que coincidan con los filtros</h3>
          <p className="text-gray-500">Intenta con otros términos de búsqueda o filtros.</p>
          <button
            onClick={() => {
              setSearchTerm('');
              setFilterStatus('all');
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 mt-4 rounded-xl bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 hover:from-gray-200 hover:to-gray-300 transition-all duration-300 font-medium border border-gray-300"
          >
            Limpiar filtros
          </button>
        </div>
      )}
    </>
  )}
</div>

   

        {/* Footer Actions - DISEÑO MODERNO */}
        <div className="modern-card">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <p className="text-sm text-gray-600">
                Las calificaciones y comentarios serán guardados en la hoja de calificaciones y marcados como "calificados".
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Los estudiantes podrán ver sus calificaciones una vez publicadas.
              </p>
            </div>
            
    
          </div>
        </div>
      </div>

      {/* Modal para ver entregas */}
      <SubmissionModal
        isOpen={submissionModal.isOpen}
        onClose={closeSubmissionModal}
        student={submissionModal.student}
        assessmentName={assessment?.name || ''}
      />
    </DashboardLayout>
  );
}