// src/pages/AssessmentDetailPage.tsx - VERSIÓN CON DISEÑO JUVENIL MODERNO (COMPLETA)
import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademic } from '@/contexts/AcademicContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { assessmentService } from '@/lib/services/assessmentService';
import { gradeSheetService } from '@/lib/services/gradeSheetService';
import { submissionService, type CreateSubmissionData, type UpdateSubmissionData } from '@/lib/services/submissionService';
import { toast } from 'sonner';
import { useRef } from 'react'
import {
  ArrowLeft,
  Calendar,
  FileText, BookMarked, Globe, LinkIcon, FileQuestion, FileCode,
  Users,
  BarChart3,
  Clock,
  Percent,
  TrendingUp,
  CheckCircle, 
  XCircle,
  AlertCircle,
  Edit,
  Download,
  Eye,
  EyeOff,
  FileCheck,
  BookOpen,
  Presentation,
  Target,
  FileSpreadsheet,
  Award,
  Info,
  CalendarDays,
  ClipboardCheck,
  Timer,
  CalendarClock,
  ShieldCheck,
  MessageSquare,
  ExternalLink,
  ChevronRight,
  Star,
  Trophy,
  LineChart,
  PieChart,
  Activity,
  FileUp,
  Upload,
  Send,
  Save,
  Trash2,
  Lock,
  Unlock,
  CalendarCheck,
  AlertTriangle,
  Text,
  Type,
  FileEdit,
  X,
  Plus,
  File,
  Sparkles,
  Zap,
  Rocket,
  Target as TargetIcon,
  Bell,
  Bookmark,
  FileBarChart,
  FileBox,
  Megaphone,
  FileImage,
  Video,
  Paperclip,
  Download as DownloadIcon,
  ExternalLink as ExternalLinkIcon,
  CheckSquare,
  Hash
} from 'lucide-react';
import { format, parseISO, isBefore, isAfter, differenceInHours, differenceInMinutes } from 'date-fns';
import { es } from 'date-fns/locale';

export default function AssessmentDetailPage() {
  const { courseCode, assessmentId } = useParams<{ courseCode: string; assessmentId: string }>();
  const { user } = useAuth();
  const { courses } = useAcademic();
  const navigate = useNavigate();
  
  const [assessment, setAssessment] = useState<any>(null);
  const [gradeSheet, setGradeSheet] = useState<any>(null);
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllGrades, setShowAllGrades] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [instructions, setInstructions] = useState<any[]>([]);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  
  // Estados para entregas de estudiantes
  const [studentSubmission, setStudentSubmission] = useState<any>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditingSubmission, setIsEditingSubmission] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<'draft' | 'submitted' | 'graded'>('draft');

  const course = courses.find(c => c.code === courseCode);
  const courseId = course ? course.id : null;
  const isTeacher = user?.role === 'docente';
  const isStudent = user?.role === 'estudiante';

  useEffect(() => {
    if (courseCode && assessmentId && courseId) {
      loadAssessment();
      if (isStudent) {
        loadStudentSubmission();
      }
    }
  }, [courseCode, assessmentId, user?.id, courseId]);

  useEffect(() => {
  if (textAreaRef.current && submissionText) {
    textAreaRef.current.style.height = 'auto';
    textAreaRef.current.style.height = `${Math.min(textAreaRef.current.scrollHeight, 400)}px`;
  }
}, [submissionText]);

  const loadAssessment = async () => {
    setLoading(true);
    try {
      const assessmentData = await assessmentService.getAssessmentById(assessmentId!);
      
      if (!assessmentData) {
        console.error('No se encontró la evaluación');
        setAssessment(null);
        return;
      }
      
      setAssessment(assessmentData);
      await loadDynamicData(assessmentData);

      if (isTeacher && assessmentData.gradeSheetId) {
        try {
          const sheet = await gradeSheetService.getById(assessmentData.gradeSheetId);
          setGradeSheet(sheet);
          
          if (sheet && sheet.students) {
            const gradesData = await extractGradesFromSheet(sheet, assessmentData);
            setGrades(gradesData);
            calculateStats(gradesData);
          } else {
            setGrades([]);
            calculateStats([]);
          }
        } catch (sheetError) {
          console.error('Error cargando hoja de calificaciones:', sheetError);
          setGrades([]);
          calculateStats([]);
        }
      } else {
        setGrades([]);
        calculateStats([]);
      }
    } catch (error) {
      console.error('Error loading assessment:', error);
      toast.error('Error al cargar los datos de la evaluación');
      setAssessment(null);
    } finally {
      setLoading(false);
    }
  };

  const loadStudentSubmission = async () => {
    try {
      if (!user?.id || !assessmentId || !courseId) return;
      
      const submission = await submissionService.getSubmissionByStudentAndAssessment(user.id, assessmentId);
      if (submission) {
        setStudentSubmission(submission);
        setSubmissionText(submission.content || '');
        setSubmissionStatus(submission.status || 'draft');
      }
    } catch (error) {
      console.error('Error loading student submission:', error);
    }
  };

  const loadDynamicData = async (assessmentData: any) => {
    try {
      if (assessmentData.metadata) {
        const metadata = assessmentData.metadata;
        
        if (metadata.attachments && Array.isArray(metadata.attachments)) {
          setAttachments(metadata.attachments);
        } else if (assessmentData.attachmentUrls) {
          const formattedAttachments = assessmentData.attachmentUrls.map((url: string, index: number) => ({
            id: `attachment_${index}`,
            name: `Archivo ${index + 1}`,
            url: url,
            type: getFileTypeFromUrl(url),
            uploadedAt: new Date().toISOString()
          }));
          setAttachments(formattedAttachments);
        }

        if (metadata.instructions && Array.isArray(metadata.instructions)) {
          setInstructions(metadata.instructions);
        } else if (assessmentData.instructionsText) {
          const extractedInstructions = extractInstructionsFromText(assessmentData.instructionsText, assessmentData.type);
          setInstructions(extractedInstructions);
        } else if (assessmentData.description) {
          const extractedInstructions = extractInstructionsFromText(assessmentData.description, assessmentData.type);
          setInstructions(extractedInstructions);
        } else {
          const defaultInstructions = generateDefaultInstructions(assessmentData);
          setInstructions(defaultInstructions);
        }
      } else {
        if (assessmentData.description) {
          const extractedInstructions = extractInstructionsFromText(assessmentData.description, assessmentData.type);
          setInstructions(extractedInstructions);
        } else {
          const defaultInstructions = generateDefaultInstructions(assessmentData);
          setInstructions(defaultInstructions);
        }

        if (assessmentData.attachments) {
          setAttachments(assessmentData.attachments);
        }
      }
    } catch (error) {
      console.error('Error loading dynamic data:', error);
      const defaultInstructions = generateDefaultInstructions(assessmentData);
      setInstructions(defaultInstructions);
    }
  };

  const canSubmit = () => {
    if (!assessment) return false;
    
    const now = new Date();
    const startDate = assessment.startDate ? new Date(assessment.startDate) : null;
    const deadline = assessment.dueDate ? new Date(assessment.dueDate) : null;
    
    if (assessment.assessmentType !== 'delivery') {
      return false;
    }
    
    if (assessment.deliveryType !== 'text') {
      toast.error('Esta actividad no acepta entregas de texto');
      return false;
    }
    
    if (startDate && isBefore(now, startDate)) {
      toast.error('La actividad aún no ha comenzado');
      return false;
    }
    
    if (deadline && isAfter(now, deadline)) {
      toast.error('El plazo de entrega ha finalizado');
      return false;
    }
    
    return true;
  };

  const canEditSubmission = () => {
    if (!studentSubmission || !assessment) return false;
    
    const now = new Date();
    const deadline = assessment.dueDate ? new Date(assessment.dueDate) : null;
    
    return studentSubmission.status === 'draft' && 
           (!deadline || isBefore(now, deadline)) &&
           submissionStatus !== 'graded';
  };

  const canDeleteSubmission = () => {
    if (!studentSubmission || !assessment) return false;
    
    const now = new Date();
    const deadline = assessment.dueDate ? new Date(assessment.dueDate) : null;
    
    return studentSubmission.status === 'draft' && 
           (!deadline || isBefore(now, deadline));
  };

  const handleSaveDraft = async () => {
    if (!canSubmit()) {
      toast.error('No puedes guardar la entrega en este momento');
      return;
    }

    if (!submissionText.trim()) {
      toast.error('La respuesta no puede estar vacía');
      return;
    }

    setIsSubmitting(true);
    try {
      const submissionData: CreateSubmissionData = {
        studentId: user?.id!,
        assessmentId: assessmentId!,
        courseId: courseId!,
        content: submissionText,
        status: 'draft',
        wordCount: submissionText.trim().split(/\s+/).length,
        characterCount: submissionText.length
      };

      let result;
      if (studentSubmission) {
        result = await submissionService.updateSubmission(studentSubmission.id!, {
          content: submissionText,
          status: 'draft',
          wordCount: submissionText.trim().split(/\s+/).length,
          characterCount: submissionText.length
        } as UpdateSubmissionData);
      } else {
        result = await submissionService.createSubmission(submissionData);
      }

      setStudentSubmission(result);
      setSubmissionStatus('draft');
      toast.success('Borrador guardado correctamente');
      setIsEditingSubmission(false);
    } catch (error) {
      console.error('Error saving draft:', error);
      toast.error('Error al guardar el borrador');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit()) {
      toast.error('No puedes enviar la entrega en este momento');
      return;
    }

    if (!submissionText.trim()) {
      toast.error('La respuesta no puede estar vacía');
      return;
    }

    setIsSubmitting(true);
    try {
      const submissionData = {
        studentId: user?.id!,
        assessmentId: assessmentId!,
        courseId: courseId!,
        content: submissionText,
        status: 'submitted' as const,
        wordCount: submissionText.trim().split(/\s+/).length,
        characterCount: submissionText.length
      };

      let result;
      if (studentSubmission) {
        result = await submissionService.updateSubmission(studentSubmission.id!, {
          content: submissionText,
          status: 'submitted' as const,
          wordCount: submissionText.trim().split(/\s+/).length,
          characterCount: submissionText.length
        });
      } else {
        result = await submissionService.createSubmission(submissionData);
      }

      setStudentSubmission(result);
      setSubmissionStatus('submitted');
      toast.success('¡Entrega enviada correctamente!');
      setIsEditingSubmission(false);
    } catch (error) {
      console.error('Error submitting:', error);
      toast.error('Error al enviar la entrega');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSubmission = async () => {
    if (!canDeleteSubmission()) {
      toast.error('No puedes eliminar esta entrega');
      return;
    }

    if (!confirm('¿Estás seguro de que deseas eliminar esta entrega? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      await submissionService.deleteSubmission(studentSubmission.id);
      setStudentSubmission(null);
      setSubmissionText('');
      setSubmissionStatus('draft');
      toast.success('Entrega eliminada correctamente');
    } catch (error) {
      console.error('Error deleting submission:', error);
      toast.error('Error al eliminar la entrega');
    }
  };

  const handleStartEditing = () => {
    if (canEditSubmission()) {
      setIsEditingSubmission(true);
    } else {
      toast.error('No puedes editar esta entrega');
    }
  };
  

  const getFileTypeFromUrl = (url: string): string => {
    if (!url) return 'file';
    
    const extension = url.split('.').pop()?.toLowerCase();
    
    if (['pdf'].includes(extension || '')) return 'pdf';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '')) return 'image';
    if (['mp4', 'avi', 'mov', 'wmv'].includes(extension || '')) return 'video';
    if (['doc', 'docx'].includes(extension || '')) return 'document';
    if (['ppt', 'pptx'].includes(extension || '')) return 'presentation';
    if (['xls', 'xlsx'].includes(extension || '')) return 'spreadsheet';
    if (url.startsWith('http')) return 'link';
    
    return 'file';
  };

  const extractInstructionsFromText = (text: string, type: string) => {
    const instructions = [];
    
    if (!text) return instructions;
    
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('leer') || lowerText.includes('read') || 
        lowerText.includes('capítulo') || lowerText.includes('chapter') ||
        lowerText.includes('material') || lowerText.includes('book')) {
      const match = text.match(/[^.!?]*?(leer|read|capítulo|chapter|material|book)[^.!?]*[.!?]/i);
      instructions.push({
        id: 'study_material',
        type: 'study',
        icon: 'BookMarked',
        title: 'Material de Estudio',
        content: match ? match[0] : 'Revise los materiales de estudio asignados para esta evaluación.',
        color: 'emerald'
      });
    }
    
    if (lowerText.includes('entregar') || lowerText.includes('submit') || 
        lowerText.includes('subir') || lowerText.includes('upload') ||
        lowerText.includes('enviar') || lowerText.includes('entrega')) {
      const match = text.match(/[^.!?]*?(entregar|submit|subir|upload|enviar|entrega)[^.!?]*[.!?]/i);
      instructions.push({
        id: 'submission',
        type: 'submission',
        icon: 'FileBarChart',
        title: getTypeName(type) === 'Exam' ? 'Instrucciones del Examen' : 
               getTypeName(type) === 'Project' ? 'Entrega del Proyecto' : 'Instrucciones de Entrega',
        content: match ? match[0] : getSubmissionGuidelines(type),
        color: 'blue'
      });
    }
    
    if (lowerText.includes('tiempo') || lowerText.includes('time') || 
        lowerText.includes('minutos') || lowerText.includes('minutes') ||
        lowerText.includes('duración') || lowerText.includes('duration')) {
      const match = text.match(/[^.!?]*?(tiempo|time|minutos|minutes|duración|duration)[^.!?]*[.!?]/i);
      instructions.push({
        id: 'time',
        type: 'time',
        icon: 'Timer',
        title: 'Tiempo y Duración',
        content: match ? match[0] : getTimeAllowed(type),
        color: 'purple'
      });
    }
    
    if (lowerText.includes('formato') || lowerText.includes('format') || 
        lowerText.includes('estructura') || lowerText.includes('structure')) {
      const match = text.match(/[^.!?]*?(formato|format|estructura|structure)[^.!?]*[.!?]/i);
      instructions.push({
        id: 'format',
        type: 'format',
        icon: 'FileText',
        title: 'Formato Requerido',
        content: match ? match[0] : 'Siga el formato especificado por el profesor.',
        color: 'indigo'
      });
    }
    
    if (lowerText.includes('evaluación') || lowerText.includes('evaluation') || 
        lowerText.includes('criterio') || lowerText.includes('criteria') ||
        lowerText.includes('calificación') || lowerText.includes('grading')) {
      const match = text.match(/[^.!?]*?(evaluación|evaluation|criterio|criteria|calificación|grading)[^.!?]*[.!?]/i);
      instructions.push({
        id: 'evaluation',
        type: 'evaluation',
        icon: 'Target',
        title: 'Criterios de Evaluación',
        content: match ? match[0] : 'Los criterios de evaluación se basan en la rúbrica proporcionada.',
        color: 'red'
      });
    }
    
    if (instructions.length === 0) {
      instructions.push({
        id: 'general',
        type: 'general',
        icon: 'ClipboardCheck',
        title: 'Instrucciones Generales',
        content: text.length > 150 ? text.substring(0, 150) + '...' : text,
        color: 'gray'
      });
    }
    
    return instructions;
  };

  const generateDefaultInstructions = (assessmentData: any) => {
    const typeName = getTypeName(assessmentData.type);
    
    return [
      {
        id: 'study_material',
        type: 'study',
        icon: 'BookMarked',
        title: 'Material de Estudio',
        content: `Revise los materiales relacionados con "${assessmentData.name}" antes de realizar la ${typeName.toLowerCase()}.`,
        color: 'emerald'
      },
      {
        id: 'submission',
        type: 'submission',
        icon: 'FileBarChart',
        title: typeName === 'Exam' ? 'Instrucciones del Examen' : 
               typeName === 'Project' ? 'Entrega del Proyecto' : 'Instrucciones de Entrega',
        content: getSubmissionGuidelines(assessmentData.type),
        color: 'blue'
      },
      {
        id: 'time',
        type: 'time',
        icon: 'Timer',
        title: 'Tiempo y Duración',
        content: getTimeAllowed(assessmentData.type),
        color: 'purple'
      },
      {
        id: 'evaluation',
        type: 'evaluation',
        icon: 'Target',
        title: 'Criterios de Evaluación',
        content: `Esta ${typeName.toLowerCase()} representa el ${assessmentData.percentage}% de la calificación final.`,
        color: 'red'
      },
      {
        id: 'integrity',
        type: 'integrity',
        icon: 'ShieldCheck',
        title: 'Integridad Académica',
        content: 'Este trabajo debe cumplir con las políticas de integridad académica de la institución.',
        color: 'amber'
      }
    ];
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'exam': return 'Exam';
      case 'quiz': return 'Quiz';
      case 'homework': return 'Homework';
      case 'project': return 'Project';
      case 'participation': return 'Participation';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  const getSubmissionGuidelines = (type: string) => {
    switch (type) {
      case 'exam':
        return 'Complete todas las secciones del examen. Las respuestas deben ser claras y concisas.';
      case 'quiz':
        return 'Responda todas las preguntas dentro del tiempo límite establecido.';
      case 'homework':
        return 'Entregue el trabajo completo en formato PDF a través de la plataforma.';
      case 'project':
        return 'Entregue todos los componentes del proyecto según las especificaciones proporcionadas.';
      case 'participation':
        return 'La participación será evaluada basándose en la contribución durante las sesiones.';
      default:
        return 'Siga las instrucciones específicas proporcionadas por el profesor.';
    }
  };

  const getTimeAllowed = (type: string) => {
    const dueDate = assessment?.dueDate ? format(new Date(assessment.dueDate), "d 'de' MMMM", { locale: es }) : 'la fecha establecida';
    
    switch (type) {
      case 'exam':
        return `El examen debe completarse en una sesión. Fecha límite: ${dueDate}.`;
      case 'quiz':
        return `El quiz tiene un límite de tiempo de 30 minutos. Disponible hasta: ${dueDate}.`;
      case 'homework':
        return `Fecha límite de entrega: ${dueDate}.`;
      case 'project':
        return `Fecha límite de entrega: ${dueDate}.`;
      default:
        return `Complete antes de: ${dueDate}.`;
    }
  };

  const getInstructionIcon = (iconName: string, color: string) => {
    const IconComponent = {
      BookMarked,
      FileBarChart,
      Timer,
      ShieldCheck,
      FileText,
      BookOpen,
      FileCheck,
      Presentation,
      Video,
      Globe,
      LinkIcon,
      FileUp,
      FileQuestion,
      FileCode,
      FileImage,
      Target,
      ClipboardCheck,
      Paperclip
    }[iconName] || BookMarked;
    
    return <IconComponent className={`h-6 w-6 text-${color}-600`} />;
  };

  const getColorClass = (color: string, type: 'bg' | 'border' | 'text' | 'ring') => {
    const colorClasses = {
      emerald: {
        bg: 'bg-emerald-100',
        border: 'border-emerald-200',
        text: 'text-emerald-600',
        ring: 'ring-emerald-500'
      },
      blue: {
        bg: 'bg-blue-100',
        border: 'border-blue-200',
        text: 'text-blue-600',
        ring: 'ring-blue-500'
      },
      purple: {
        bg: 'bg-purple-100',
        border: 'border-purple-200',
        text: 'text-purple-600',
        ring: 'ring-purple-500'
      },
      amber: {
        bg: 'bg-amber-100',
        border: 'border-amber-200',
        text: 'text-amber-600',
        ring: 'ring-amber-500'
      },
      red: {
        bg: 'bg-red-100',
        border: 'border-red-200',
        text: 'text-red-600',
        ring: 'ring-red-500'
      },
      green: {
        bg: 'bg-green-100',
        border: 'border-green-200',
        text: 'text-green-600',
        ring: 'ring-green-500'
      },
      indigo: {
        bg: 'bg-indigo-100',
        border: 'border-indigo-200',
        text: 'text-indigo-600',
        ring: 'ring-indigo-500'
      },
      pink: {
        bg: 'bg-pink-100',
        border: 'border-pink-200',
        text: 'text-pink-600',
        ring: 'ring-pink-500'
      },
      gray: {
        bg: 'bg-gray-100',
        border: 'border-gray-200',
        text: 'text-gray-600',
        ring: 'ring-gray-500'
      }
    };

    return colorClasses[color as keyof typeof colorClasses]?.[type] || colorClasses.emerald[type];
  };

  const extractGradesFromSheet = async (sheet: any, assessment: any) => {
    const gradesList: any[] = [];
    
    if (!sheet.students || sheet.students.length === 0) {
      return gradesList;
    }

    const activity = sheet.activities?.find((act: any) => 
      act.name === assessment.name || 
      act.id === assessment.id ||
      act.assessmentId === assessmentId
    );

    if (!activity) {
      return gradesList;
    }

    sheet.students.forEach((student: any) => {
      if (student.grades && student.grades[activity.id]) {
        const gradeData = student.grades[activity.id];
        
        gradesList.push({
          id: `${student.studentId}_${activity.id}`,
          studentId: student.studentId,
          studentName: student.name || `Student ${student.studentId.substring(0, 8)}`,
          studentEmail: student.email || '',
          score: gradeData.value,
          maxScore: activity.maxScore || assessment.maxPoints,
          comment: gradeData.comment || '',
          status: gradeData.value !== undefined ? 'graded' : 'pending',
          gradedAt: gradeData.submittedAt?.toDate?.() || new Date(),
          activityId: activity.id,
          activityName: activity.name,
          percentage: gradeData.value !== undefined ? 
            ((gradeData.value / (activity.maxScore || assessment.maxPoints)) * 100).toFixed(1) : null
        });
      } else {
        gradesList.push({
          id: `${student.studentId}_${activity.id}`,
          studentId: student.studentId,
          studentName: student.name || `Student ${student.studentId.substring(0, 8)}`,
          studentEmail: student.email || '',
          score: null,
          maxScore: activity.maxScore || assessment.maxPoints,
          comment: '',
          status: 'pending',
          gradedAt: null,
          activityId: activity.id,
          activityName: activity.name,
          percentage: null
        });
      }
    });

    return gradesList;
  };

  const calculateStats = (gradesData: any[]) => {
    if (!gradesData || gradesData.length === 0) {
      setStats({
        total: 0,
        graded: 0,
        average: 0,
        highest: 0,
        lowest: 0,
        passingRate: 0,
        passingCount: 0,
        failingCount: 0,
        pending: 0,
        distribution: {
          excellent: 0,
          good: 0,
          average: 0,
          poor: 0,
          failing: 0
        }
      });
      return;
    }

    const gradedStudents = gradesData.filter(g => g.score !== null && g.score !== undefined);
    const scores = gradedStudents.map(g => g.score);
    
    if (scores.length === 0) {
      setStats({
        total: gradesData.length,
        graded: 0,
        average: 0,
        highest: 0,
        lowest: 0,
        passingRate: 0,
        passingCount: 0,
        failingCount: 0,
        pending: gradesData.length,
        distribution: {
          excellent: 0,
          good: 0,
          average: 0,
          poor: 0,
          failing: 0
        }
      });
      return;
    }

    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    const passingScore = assessment?.passingScore || 0;
    const maxScore = assessment?.maxPoints || 100;
    
    const distribution = {
      excellent: 0,
      good: 0,
      average: 0,
      poor: 0,
      failing: 0
    };

    gradedStudents.forEach(g => {
      const percentage = (g.score / maxScore) * 100;
      if (percentage >= 90) distribution.excellent++;
      else if (percentage >= 80) distribution.good++;
      else if (percentage >= 70) distribution.average++;
      else if (percentage >= 60) distribution.poor++;
      else distribution.failing++;
    });

    const passingCount = gradedStudents.filter(g => g.score >= passingScore).length;
    const failingCount = gradedStudents.length - passingCount;
    const passingRate = (passingCount / gradedStudents.length) * 100;

    setStats({
      total: gradesData.length,
      graded: gradedStudents.length,
      average: average.toFixed(1),
      highest: highest.toFixed(1),
      lowest: lowest.toFixed(1),
      passingRate: passingRate.toFixed(0),
      passingCount,
      failingCount,
      pending: gradesData.length - gradedStudents.length,
      distribution
    });
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'draft':
        return { 
          color: 'bg-amber-100 text-amber-800 border-amber-200', 
          icon: <AlertCircle className="h-4 w-4" />, 
          label: 'Draft',
          description: 'Esta evaluación está en borrador y no es visible para los estudiantes'
        };
      case 'published':
        return { 
          color: 'bg-blue-100 text-blue-800 border-blue-200', 
          icon: <Eye className="h-4 w-4" />, 
          label: 'Published',
          description: 'Esta evaluación está publicada y visible para los estudiantes'
        };
      case 'graded':
        return { 
          color: 'bg-emerald-100 text-emerald-800 border-emerald-200', 
          icon: <CheckCircle className="h-4 w-4" />, 
          label: 'Graded',
          description: 'Todas las calificaciones han sido asignadas'
        };
      default:
        return { 
          color: 'bg-gray-100 text-gray-800 border-gray-200', 
          icon: <AlertCircle className="h-4 w-4" />, 
          label: status,
          description: 'Unknown status'
        };
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString || isNaN(new Date(dateString).getTime())) {
      return 'No date defined';
    }
    return format(new Date(dateString), "eeee.  MMMM d, yyyy");
  };

  const formatTime = (dateString: string) => {
    if (!dateString || isNaN(new Date(dateString).getTime())) {
      return '';
    }
    return format(new Date(dateString), "hh:mm a");
  };

  const getTimeRemaining = (dueDate: string) => {
    if (!dueDate) return 'Sin fecha límite';
    
    const now = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return `Vencido hace ${Math.abs(diffDays)} días`;
    } else if (diffDays === 0) {
      const diffHours = differenceInHours(due, now);
      if (diffHours > 0) return `It expires in ${diffHours} hours`;
      const diffMinutes = differenceInMinutes(due, now);
      return diffMinutes > 0 ? `It expired ${diffMinutes} minutes ago` : 'Expired less than a minute ago';
    } else if (diffDays === 1) {
      return 'Tomorrow expires';
    } else {
      return `It expires in ${diffDays} days`;
    }
  };

  const handleExportGrades = () => {
    if (grades.length === 0) {
      toast.warning('There are no grades to export');
      return;
    }

    const csvContent = [
      ['Estudiante', 'Correo', 'Calificación', 'Porcentaje', 'Estado', 'Fecha', 'Comentario'],
      ...grades.map(g => [
        g.studentName,
        g.studentEmail,
        g.score || 'Pendiente',
        g.percentage ? `${g.percentage}%` : 'N/A',
        g.score === null ? 'Pendiente' : g.score >= (assessment?.passingScore || 0) ? 'Aprobado' : 'No aprobado',
        g.gradedAt ? format(new Date(g.gradedAt), 'dd/MM/yyyy') : 'Pendiente',
        g.comment || ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `calificaciones_${assessment?.name?.replace(/\s+/g, '_') || 'evaluacion'}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Calificaciones exportadas correctamente');
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'pdf': return <FileText className="h-5 w-5" />;
      case 'image': return <FileImage className="h-5 w-5" />;
      case 'video': return <Video className="h-5 w-5" />;
      case 'document': return <FileText className="h-5 w-5" />;
      case 'presentation': return <Presentation className="h-5 w-5" />;
      case 'spreadsheet': return <FileSpreadsheet className="h-5 w-5" />;
      case 'link': return <ExternalLinkIcon className="h-5 w-5" />;
      default: return <Paperclip className="h-5 w-5" />;
    }
  };

  const getSubmissionStatusInfo = () => {
    const now = new Date();
    const startDate = assessment?.startDate ? new Date(assessment.startDate) : null;
    const deadline = assessment?.dueDate ? new Date(assessment.dueDate) : null;
    
    if (!assessment || assessment.assessmentType !== 'delivery') {
      return { 
        status: 'not_delivery',
        message: 'This activity does not require a submission',
        canSubmit: false,
        canEdit: false,
        canDelete: false
      };
    }
    
    if (startDate && isBefore(now, startDate)) {
      return { 
        status: 'not_started',
        message: 'The activity has not yet started',
        canSubmit: false,
        canEdit: false,
        canDelete: false
      };
    }
    
    if (deadline && isAfter(now, deadline)) {
      return { 
        status: 'closed',
        message: 'The submission deadline has passed',
        canSubmit: false,
        canEdit: false,
        canDelete: false
      };
    }
    
    if (submissionStatus === 'submitted') {
      return { 
        status: 'submitted',
        message: 'Your submission has been sent',
        canSubmit: false,
        canEdit: false,
        canDelete: false
      };
    }
    
    if (submissionStatus === 'graded') {
      return { 
        status: 'graded',
        message: 'Your submission has been graded',
        canSubmit: false,
        canEdit: false,
        canDelete: false
      };
    }
    
    return { 
      status: 'open',
      message: 'The activity is open for submissions',
      canSubmit: true,
      canEdit: true,
      canDelete: studentSubmission?.status === 'draft'
    };
  };

  // Función para obtener el color del tipo de evaluación (MODERNA)
  const getTypeColorModern = (type: string) => {
    switch (type) {
      case 'exam': return 'bg-gradient-to-br from-red-100 to-red-50 text-red-700 border border-red-200';
      case 'quiz': return 'bg-gradient-to-br from-blue-100 to-cyan-50 text-blue-700 border border-blue-200';
      case 'homework': return 'bg-gradient-to-br from-green-100 to-emerald-50 text-green-700 border border-green-200';
      case 'project': return 'bg-gradient-to-br from-purple-100 to-pink-50 text-purple-700 border border-purple-200';
      case 'participation': return 'bg-gradient-to-br from-amber-100 to-orange-50 text-amber-700 border border-amber-200';
      case 'delivery': return 'bg-gradient-to-br from-cyan-100 to-blue-50 text-cyan-700 border border-cyan-200';
      case 'announcement': return 'bg-gradient-to-br from-gray-100 to-gray-50 text-gray-700 border border-gray-200';
      default: return 'bg-gradient-to-br from-gray-100 to-gray-50 text-gray-700 border border-gray-200';
    }
  };

  // Función para obtener el ícono del tipo (MODERNO)
  const getTypeIconModern = (type: string) => {
    switch (type) {
      case 'exam': return <FileText className="h-4 w-4" />;
      case 'quiz': return <BookOpen className="h-4 w-4" />;
      case 'homework': return <FileCheck className="h-4 w-4" />;
      case 'project': return <TrendingUp className="h-4 w-4" />;
      case 'participation': return <Users className="h-4 w-4" />;
      case 'delivery': return <Upload className="h-4 w-4" />;
      case 'announcement': return <Megaphone className="h-4 w-4" />;
      default: return <File className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Loading Assessment...">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <div className="h-12 w-12 mx-auto rounded-2xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
            <div className="space-y-2">
              <p className="text-lg font-bold text-gray-900">Loading assessment details</p>
              <p className="text-sm text-gray-600">Preparing your personalized view</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!assessment || !course) {
    return (
      <DashboardLayout title="Assessment not found">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2 max-w-md">
            <div className="h-20 w-20 mx-auto rounded-2xl bg-gradient-to-br from-red-100 to-pink-100 flex items-center justify-center border border-red-200">
              <AlertCircle className="h-10 w-10 text-red-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-gray-900">Assessment not found</h3>
              <p className="text-gray-600">
                The specified assessment does not exist or you do not have permission to access it.
              </p>
            </div>
            <Link
              to={`/courses/${courseCode}/assessments`}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg transition-all duration-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Assessments
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const dueDate = assessment.dueDate ? new Date(assessment.dueDate) : null;
  const startDate = assessment.startDate ? new Date(assessment.startDate) : null;
  const isPastDue = dueDate && isAfter(new Date(), dueDate);
  const isNotStarted = startDate && isBefore(new Date(), startDate);
  const statusInfo = getStatusInfo(assessment.status);
  const displayedGrades = showAllGrades ? grades : grades.slice(0, 50);
  const timeRemaining = getTimeRemaining(assessment.dueDate);
  const typeName = getTypeName(assessment.type);
  const submissionStatusInfo = getSubmissionStatusInfo();

  return (
    <DashboardLayout
      title={`${assessment.name}`}
      subtitle={`${course.name} • ${course.code}`}
    >
      <div className="space-y-2">
    

        {/* Tabs de navegación - DISEÑO MODERNO */}
        <div className="bg-white border border-gray-200 rounded-2xl p-2 shadow-sm">
          <nav className="flex space-x-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-5 py-3 rounded-xl font-medium text-sm transition-all duration-300 flex items-center gap-2 ${
                activeTab === 'overview'
                  ? 'bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-700 border border-blue-200 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Info className="h-4 w-4" />
              Overview
            </button>
            
            {isTeacher && grades.length > 0 && (
              <button
                onClick={() => setActiveTab('grades')}
                className={`px-5 py-3 rounded-xl font-medium text-sm transition-all duration-300 flex items-center gap-2 ${
                  activeTab === 'grades'
                    ? 'bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-700 border border-emerald-200 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Award className="h-4 w-4" />
                Grades ({grades.length})
              </button>
            )}
            
            {isTeacher && stats && (
              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-5 py-3 rounded-xl font-medium text-sm transition-all duration-300 flex items-center gap-2 ${
                  activeTab === 'analytics'
                    ? 'bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 border border-purple-200 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                Analytics
              </button>
            )}
            
            {isStudent && assessment.assessmentType === 'delivery' && (
              <button
                onClick={() => setActiveTab('submission')}
                className={`px-5 py-3 rounded-xl font-medium text-sm transition-all duration-300 flex items-center gap-2 ${
                  activeTab === 'submission'
                    ? 'bg-gradient-to-r from-cyan-50 to-blue-50 text-cyan-700 border border-cyan-200 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Upload className="h-4 w-4" />
                My Submission
                {studentSubmission && (
                  <span className={`ml-1 px-2 py-0.5 text-xs rounded-full font-bold ${
                    studentSubmission.status === 'submitted' 
                      ? 'bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-800 border border-emerald-200' 
                      : 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 border border-amber-200'
                  }`}>
                    {studentSubmission.status === 'submitted' ? 'Sent' : 'Sent'}
                  </span>
                )}
              </button>
            )}
          </nav>
        </div>

        {/* Contenido del Overview - DISEÑO MODERNO */}
        {activeTab === 'overview' && (
          <div className="space-y-2">
            {/* Tarjeta principal */}
            <div >
                 {/* Hoja de calificaciones (profesores) */}
            {isTeacher && assessment.gradeSheetId && gradeSheet && (
              <div className="modern-card mb-2">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-2">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                      Linked Grade Sheet
                    </h3>
                    <p className="text-gray-600">
                      This assessment is linked to a grade sheet for tracking results.
                    </p>
                  </div>
                  
                 
                </div>
                
                <div className="bg-gradient-to-br from-blue-50/50 to-cyan-50/50 border border-blue-100 rounded-xl p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex items-center gap-4">
                      <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center shadow-sm">
                        <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-blue-600 font-bold">Grade Sheet</p>
                        <p className="font-bold text-gray-900 line-clamp-2 text-sm">{gradeSheet.title}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-100 to-green-100 flex items-center justify-center shadow-sm">
                        <Award className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm text-emerald-600 font-bold">Activities</p>
                        <p className="font-bold text-gray-900 text-sm">
                          {gradeSheet.activities?.length || 0} activities
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center shadow-sm">
                        <Users className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm text-purple-600 font-bold">Students</p>
                        <p className="font-bold text-gray-900 text-sm">
                          {gradeSheet.students?.length || 0} students
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Columna izquierda */}

                <div className="lg:col-span-2 space-y-2">
                  {/* Descripción */}
                  {assessment.description && (
                    <div className="modern-card">
                      <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <FileBox className="h-5 w-5 text-blue-600" />
                        Description
                      </h3>
                      <div className="bg-gradient-to-br from-blue-50/50 to-cyan-50/50 rounded-xl p-6 border border-blue-100">
                        <p className="text-gray-700 whitespace-pre-line leading-relaxed">
                          {assessment.description}
                          <br /><br />
                          Review materials related to "{assessment.name}" before taking the {typeName.toLowerCase()}.
                        </p>

                      </div>

                    </div>
                    
                  )}



                 

                  {/* Estado de entrega para estudiantes */}
                  {isStudent && assessment.assessmentType === 'delivery' && (
                    <div className={`modern-card ${submissionStatusInfo.status === 'closed' ? 'border-red-200' : submissionStatusInfo.status === 'not_started' ? 'border-amber-200' : 'border-blue-200'}`}>
                      <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                        <ClipboardCheck className="h-5 w-5 text-blue-600" />
                        Submission Instructions
                      </h3>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                            submissionStatusInfo.status === 'closed' 
                              ? 'bg-gradient-to-br from-red-100 to-pink-100 text-red-600' 
                              : submissionStatusInfo.status === 'not_started'
                              ? 'bg-gradient-to-br from-amber-100 to-orange-100 text-amber-600'
                              : 'bg-gradient-to-br from-blue-100 to-cyan-100 text-blue-600'
                          }`}>
                            {submissionStatusInfo.status === 'closed' ? (
                              <Lock className="h-6 w-6" />
                            ) : submissionStatusInfo.status === 'not_started' ? (
                              <CalendarClock className="h-6 w-6" />
                            ) : (
                              <Upload className="h-6 w-6" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900">
                              {submissionStatusInfo.status === 'closed' 
                                ? 'Submission Closed' 
                                : submissionStatusInfo.status === 'not_started'
                                ? 'Not Started'
                                : 'Delivery Status'}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {submissionStatusInfo.message}
                            </p>
                          </div>
                        </div>
                        {submissionStatusInfo.canSubmit && (
                          <button
                            onClick={() => setActiveTab('submission')}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg transition-all duration-300"
                          >
                            <Upload className="h-4 w-4" />
                            Submit Now
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Columna derecha - Metadatos */}
                <div className="space-y-2">
                  {/* Información General */}
                  <div className="modern-card">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">General Information</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Status</span>
                        <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${statusInfo.color}`}>
                          <span className="flex items-center gap-1.5">
                            {statusInfo.icon}
                            {statusInfo.label}
                          </span>
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Type</span>
                        <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${getTypeColorModern(assessment.type)}`}>
                          <span className="flex items-center gap-1.5">
                            {getTypeIconModern(assessment.type)}
                            {typeName}
                          </span>
                        </span>
                      </div>
                      
                      {assessment.assessmentType === 'delivery' && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Submission Type</span>
                          <span className="px-3 py-1.5 rounded-lg text-sm font-bold bg-gradient-to-r from-cyan-100 to-blue-100 text-cyan-700 border border-cyan-200">
                            <span className="flex items-center gap-1.5">
                              <Text className="h-3 w-3" />
                               Only Text
                            </span>
                          </span>
                        </div>
                      )}
                      
                      {assessment.percentage > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Course Weight</span>
                          <span className="px-3 py-1.5 rounded-lg text-sm font-bold bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 border border-blue-200">
                            {assessment.percentage}%
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Navegación superior - DISEÑO MODERNO */}
<div className="flex justify-center pt-3">
  {isTeacher && (
      <Link
        to={`/courses/${courseCode}/assessments/${assessmentId}/grade`}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg transition-all duration-300 font-medium shadow-sm "
      >
        <CheckCircle className="h-3 w-3" />
        Grade
      </Link>
      
  )}
</div>
                  </div>

                  {/* Fechas importantes */}
                  <div className="modern-card">
                    <h3 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                      <CalendarDays className="h-5 w-5 text-blue-600" />
                      Important Dates
                    </h3>
                    <div className="space-y-2">
                      {/* Fecha de inicio */}
                      {assessment.assessmentType === 'delivery' && startDate && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Start Date</span>
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                              isNotStarted 
                                ? 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700' 
                                : 'bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-700'
                            }`}>
                              {isNotStarted ? 'Not Started' : 'Active'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-blue-500" />
                            <span className="font-medium text-gray-900">
                              {formatDate(assessment.startDate)}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {/* Fecha límite */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-600">Due Date</span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                            isPastDue 
                              ? 'bg-gradient-to-r from-red-100 to-pink-100 text-red-700' 
                              : 'bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700'
                          }`}>
                            {timeRemaining}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-blue-500" />
                          <span className="font-medium text-gray-900">
                            {formatDate(assessment.dueDate)}
                          </span>
                        </div>
                        {formatTime(assessment.dueDate) && (
                          <p className="text-sm text-gray-500 mt-1 ml-6">
                            Time: {formatTime(assessment.dueDate)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Archivos adjuntos */}
            {attachments.length > 0 && (
              <div className="modern-card">
                <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <Paperclip className="h-5 w-5 text-purple-600" />
                  Attached Files
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {attachments.map((attachment: any, index: number) => (
                    <a
                      key={index}
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group bg-white border border-gray-200 rounded-xl p-4 hover:bg-gradient-to-r hover:from-purple-50/50 hover:to-pink-50/50 hover:border-purple-200 transition-all duration-300 hover:shadow-sm"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center group-hover:from-purple-200 group-hover:to-pink-200 transition-all">
                          {getFileIcon(attachment.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-gray-900 truncate group-hover:text-purple-700 transition-colors">
                              {attachment.name}
                            </p>
                            <DownloadIcon className="h-4 w-4 text-gray-400 group-hover:text-purple-600 transition-colors" />
                          </div>
                          {attachment.size && (
                            <p className="text-sm text-gray-500 mt-1">
                              {attachment.size} • {attachment.type?.toUpperCase() || 'FILE'}
                            </p>
                          )}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

         
          </div>
        )}

        {/* Tab de entrega para estudiantes - DISEÑO MODERNO */}
        {activeTab === 'submission' && isStudent && assessment.assessmentType === 'delivery' && (
          <div className="space-y-2">
            <div className="modern-card">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-2">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <Upload className="h-6 w-6 text-blue-600" />
                    My Submission
                  </h2>
                  <p className="text-gray-600">
                    {assessment.deliveryType === 'text' 
                      ? 'Write your response in the text field below. Only text submissions are accepted.'
                      : 'Upload your file for this activity.'}
                  </p>
                </div>
                
                {/* Estado de la entrega */}
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                    submissionStatusInfo.status === 'closed' 
                      ? 'bg-gradient-to-r from-red-100 to-pink-100 text-red-700 border border-red-200'
                      : submissionStatusInfo.status === 'not_started'
                      ? 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 border border-amber-200'
                      : submissionStatus === 'submitted'
                      ? 'bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-700 border border-emerald-200'
                      : submissionStatus === 'graded'
                      ? 'bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 border border-purple-200'
                      : 'bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 border border-blue-200'
                  }`}>
                    {submissionStatusInfo.status === 'closed' 
                      ? 'Closed'
                      : submissionStatusInfo.status === 'not_started'
                      ? 'Not Started'
                      : submissionStatus === 'submitted'
                      ? 'Submitted'
                      : submissionStatus === 'graded'
                      ? 'Graded'
                      : 'In Progress'}
                  </span>
                  
                  {studentSubmission && studentSubmission.submittedAt && (
                    <span className="text-sm text-gray-500">
                      {format(new Date(studentSubmission.submittedAt), "dd/MM/yyyy HH:mm")}
                    </span>
                  )}
                </div>
              </div>

              {/* Alertas de estado */}
              {submissionStatusInfo.status === 'closed' && (
                <div className="mb-6 bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 rounded-xl p-5">
                  <div className="flex items-center gap-3">
                    <Lock className="h-5 w-5 text-red-600 flex-shrink-0" />
                    <div>
                      <h4 className="font-bold text-red-900 mb-1">Submission Closed</h4>
                      <p className="text-red-700">
                        The submission deadline ended on {formatDate(assessment.dueDate)} at {formatTime(assessment.dueDate)}. 
                        You can no longer edit, delete, or submit new submissions.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {submissionStatusInfo.status === 'not_started' && (
                <div className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5">
                  <div className="flex items-center gap-3">
                    <CalendarClock className="h-5 w-5 text-amber-600 flex-shrink-0" />
                    <div>
                      <h4 className="font-bold text-amber-900 mb-1">Activity Not Started</h4>
                      <p className="text-amber-700">
                        The activity will begin on {formatDate(assessment.startDate)} at {formatTime(assessment.startDate)}. 
                        You will be able to submit your work from that date onwards.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {submissionStatus === 'graded' && (
                <div className="mb-6 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-5">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-purple-600 flex-shrink-0" />
                    <div>
                      <h4 className="font-bold text-purple-900 mb-1">Submission Graded</h4>
                      <p className="text-purple-700">
                        Your submission has been graded by the professor. You can no longer edit it.
                        {studentSubmission?.grade && (
                          <span className="font-bold ml-2">
                            Grade: {studentSubmission.grade}/{assessment.maxPoints}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Editor de texto */}
{assessment.deliveryType === 'text' && (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
        <Type className="h-5 w-5 text-blue-600" />
        Your Response
      </h3>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        {submissionText && (
          <>
            <span>{submissionText.trim().split(/\s+/).length} words</span>
            <span>•</span>
            <span>{submissionText.length} characters</span>
          </>
        )}
      </div>
    </div>
  <div className="border border-gray-300 rounded-xl overflow-hidden hover:border-blue-300 transition-colors">
      {isEditingSubmission || !studentSubmission ? (
        <>
          <div className="relative">
            <textarea
              ref={textAreaRef}
              value={submissionText}
              onChange={(e) => {
                setSubmissionText(e.target.value);
                // Auto-expand textarea
                if (textAreaRef.current) {
                  textAreaRef.current.style.height = 'auto';
                  textAreaRef.current.style.height = `${Math.min(textAreaRef.current.scrollHeight, 400)}px`;
                }
              }}
              placeholder="Write your response here..."
              className="w-full min-h-[120px] max-h-[400px] p-5 focus:outline-none resize-none text-gray-700 bg-white transition-height duration-200"
              disabled={!submissionStatusInfo.canSubmit || isSubmitting}
              rows={4}
              onFocus={() => {
                // Expand slightly on focus
                if (textAreaRef.current && submissionText.length === 0) {
                  textAreaRef.current.style.height = '160px';
                }
              }}
              onBlur={() => {
                // Shrink back if empty on blur
                if (textAreaRef.current && submissionText.length === 0) {
                  textAreaRef.current.style.height = '120px';
                }
              }}
            />
            
            {/* Character counter in bottom right */}
            <div className="absolute bottom-3 right-3 flex items-center gap-2 text-sm text-gray-500 bg-white/80 px-2 py-1 rounded">
              <span className={submissionText.length > 10000 ? 'text-red-500 font-medium' : ''}>
                {submissionText.length}/10000
              </span>
            </div>
          </div>
          
          <div className="border-t border-gray-300 bg-gradient-to-r from-gray-50 to-white p-4 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="text-sm text-gray-500">
              {submissionStatusInfo.canSubmit 
                ? 'Write your response and choose to save as draft or submit definitively.'
                : 'You cannot edit this submission.'}
            </div>
            <div className="flex gap-2">
              {submissionStatusInfo.canDelete && studentSubmission && (
                <button
                  onClick={handleDeleteSubmission}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              )}
              
              {submissionStatusInfo.canSubmit && (
                <>
                  <button
                    onClick={handleSaveDraft}
                    disabled={isSubmitting || !submissionText.trim()}
                    className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {isSubmitting ? 'Saving...' : 'Save Draft'}
                  </button>
                  
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !submissionText.trim()}
                    className="px-5 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Send className="h-4 w-4" />
                    {isSubmitting ? 'Submitting...' : 'Submit Assignment'}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
       <div className="p-5 bg-gradient-to-br from-gray-50 to-white">
            <div className="prose max-w-none">
              <div className="whitespace-pre-line text-gray-700 min-h-[120px]">
                {studentSubmission.content}
              </div>
            </div>
          </div>

{/* MOSTRAR FEEDBACK DEL PROFESOR - NUEVA SECCIÓN */}
          {studentSubmission.feedback && (
            <div className="border-t border-gray-300 bg-gradient-to-br from-purple-50/50 to-pink-50/50 p-5">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="h-5 w-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-gray-900 flex items-center gap-2">
                      Teacher Feedback
                    
                    </h4>
                    {studentSubmission.gradedAt && (
                      <span className="text-xs text-gray-500">
                        {format(new Date(studentSubmission.gradedAt), "dd/MM/yyyy HH:mm")}
                      </span>
                    )}
                  </div>
                  <div className="bg-white border border-purple-200 rounded-lg p-4 shadow-sm">
                    <p className="text-gray-700 whitespace-pre-line">
                      {studentSubmission.feedback}
                    </p>
                  </div>
               
                </div>
              </div>
            </div>
          )}
          
          <div className="border-t border-gray-300 bg-gradient-to-r from-gray-50 to-white p-4 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="text-sm text-gray-500">
              {submissionStatus === 'submitted' 
                ? 'Submitted on ' + format(new Date(studentSubmission.submittedAt), "dd/MM/yyyy HH:mm")
                : 'Draft saved on ' + format(new Date(studentSubmission.updatedAt), "dd/MM/yyyy HH:mm")}
            </div>
            <div className="flex gap-2">
              {submissionStatusInfo.canEdit && (
                <button
                  onClick={handleStartEditing}
                  className="px-4 py-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
    

         
    
    {/* Información de la actividad */}
    <div className="bg-gradient-to-br from-blue-50/50 to-cyan-50/50 border border-blue-100 rounded-xl p-5">
      <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
        <Info className="h-4 w-4 text-blue-600" />
        Activity Information
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-600 mb-1">Start Date</p>
          <p className="font-medium text-gray-900">
            {formatDate(assessment.startDate)} {formatTime(assessment.startDate) && `at ${formatTime(assessment.startDate)}`}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600 mb-1">Due Date</p>
          <p className="font-medium text-gray-900">
            {formatDate(assessment.dueDate)} {formatTime(assessment.dueDate) && `at ${formatTime(assessment.dueDate)}`}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600 mb-1">Time Remaining</p>
          <p className={`font-bold ${isPastDue ? 'text-red-600' : 'text-blue-600'}`}>
            {timeRemaining}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600 mb-1">Status</p>
          <p className="font-medium text-gray-900">
            {submissionStatusInfo.status === 'closed' 
              ? 'Closed' 
              : submissionStatusInfo.status === 'not_started'
              ? 'Not Started'
              : submissionStatus === 'submitted'
              ? 'Submitted'
              : submissionStatus === 'graded'
              ? 'Graded'
              : 'In Progress'}
          </p>
        </div>
      </div>
    </div>
  </div>
)}


              
              {/* Si no es una actividad de entrega de texto */}
              {assessment.deliveryType !== 'text' && (
                <div className="text-center py-12">
                  <FileUp className="h-16 w-16 mx-auto text-gray-300 mb-2" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Unsupported Delivery Type</h3>
                  <p className="text-gray-500 max-w-md mx-auto mb-2">
                    This activity requires a different delivery type than text. Please contact the teacher for more information.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab de calificaciones (profesores) - DISEÑO MODERNO */}
        {activeTab === 'grades' && isTeacher && (
          <div className="space-y-2">
            <div className="modern-card">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-2">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <Award className="h-6 w-6 text-emerald-600" />
                    Student Grades
                  </h2>
                  <p className="text-gray-600">
                    Manage and review grades assigned to students for this assessment.
                  </p>
                </div>
                
                <button 
                  onClick={handleExportGrades}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg transition-all duration-300 font-medium"
                >
                  <Download className="h-5 w-5" />
                  Export CSV
                </button>
              </div>
              
              {/* Estadísticas */}
              {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-700 font-bold">Total Students</p>
                        <p className="text-xl font-bold text-gray-900">{stats.total}</p>
                      </div>
                      <Users className="h-6 w-6 text-gray-600" />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-emerald-600 font-bold">{stats.graded} graded</span>
                      <span className="text-gray-400">•</span>
                      <span className="text-amber-600">{stats.pending} pending</span>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-emerald-700 font-bold">Average Score</p>
                        <p className="text-xl font-bold text-emerald-900">{stats.average}</p>
                      </div>
                      <BarChart3 className="h-6 w-6  text-emerald-600" />
                    </div>
                    <div className="mt-2 text-sm text-emerald-600">
                      out of {assessment.maxPoints} points
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-purple-700 font-bold">Passing Rate</p>
                        <p className="text-xl font-bold text-purple-900">{stats.passingRate}%</p>
                      </div>
                      <Percent className="h-6 w-6  text-purple-600" />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-emerald-600 font-bold">{stats.passingCount} passed</span>
                      <span className="text-gray-400">•</span>
                      <span className="text-red-600">{stats.failingCount} failed</span>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-amber-50 to-orange-100 border border-amber-200 rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-amber-700 font-bold">Score Range</p>
                        <p className="text-xl font-bold text-amber-900">{stats.highest} / {stats.lowest}</p>
                      </div>
                      <TrendingUp className="h-6 w-6 text-amber-600" />
                    </div>
                    <div className="mt-2 text-sm text-amber-600">
                      Highest / Lowest
                    </div>
                  </div>
                </div>
              )}
              
              {/* Tabla de calificaciones */}
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                      <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Student
                        </div>
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4" />
                          Grade
                        </div>
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          Status
                        </div>
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Graded At
                        </div>
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">
                        Actions
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          Comments
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {displayedGrades.map((grade, index) => (
                      <tr key={grade.id || index} className="hover:bg-gradient-to-r hover:from-blue-50/30 hover:to-cyan-50/30 transition-all">
                        <td className="py-4 px-6 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold shadow-sm">
                              {grade.studentName?.charAt(0)?.toUpperCase() || 'S'}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900 text-sm">{grade.studentName}</p>
                              <p className="text-xs text-gray-500">{grade.studentEmail}</p>
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${grade.score !== null && grade.score >= assessment.passingScore ? 'text-emerald-600' : 'text-red-600'}`}>
                              {grade.score !== null ? grade.score.toFixed(1) : '--'} / {assessment.maxPoints}
                            </span>
                          </div>
                        </td>
                      
                        <td className="py-4 px-6 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                            grade.score === null 
                              ? 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700' 
                              : grade.score >= assessment.passingScore 
                              ? 'bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-700' 
                              : 'bg-gradient-to-r from-red-100 to-pink-100 text-red-700'
                          }`}>
                            {grade.score === null ? (
                              <>
                                <Clock className="h-3 w-3" />
                                Pending
                              </>
                            ) : grade.score >= assessment.passingScore ? (
                              <>
                                <CheckCircle className="h-3 w-3" />
                                Passed
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3 w-3" />
                                Failed
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-4 px-6 whitespace-nowrap">
                          <div className="text-sm text-gray-600">
                            {grade.gradedAt ? (
                              <>
                                <div>{format(new Date(grade.gradedAt), 'dd/MM/yyyy')}</div>
                                <div className="text-xs text-gray-500">{format(new Date(grade.gradedAt), 'HH:mm')}</div>
                              </>
                            ) : (
                              <span className="text-gray-400">Not graded</span>
                            )}
                          </div>
                        </td>
                        
                        <td className="py-4 px-6 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {assessment.gradeSheetId && (
                              <Link
                                to={`/courses/${courseCode}/grade-sheets/${assessment.gradeSheetId}?student=${grade.studentId}`}
                                className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                title="View details"
                              >
                                <Eye className="h-4 w-4" />
                              </Link>
                            )}
                            <Link
                              to={`/courses/${courseCode}/assessments/${assessmentId}/grade?student=${grade.studentId}`}
                              className="p-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Edit grade"
                            >
                              <Edit className="h-4 w-4" />
                            </Link>
                          </div>
                        </td>

                        <td className="py-4 px-6">
                          <p className="text-sm text-gray-600 max-w-xs line-clamp-3">
                            {grade.comment || (
                              <span className="text-gray-400 italic text-sm">No comments</span>
                            )}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {grades.length > 50 && (
                  <div className="border-t border-gray-200 px-6 py-4">
                    <button
                      onClick={() => setShowAllGrades(!showAllGrades)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-blue-600 hover:text-blue-700 font-bold"
                    >
                      {showAllGrades ? (
                        <>
                          <EyeOff className="h-4 w-4" />
                          Show Less (50)
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4" />
                          Show All Grades ({grades.length})
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
              
              {grades.length === 0 && (
                <div className="text-center py-12">
                  <Award className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">No grades recorded</h3>
                  <p className="text-gray-500 mb-6 max-w-md mx-auto">
                    {assessment.gradeSheetId 
                      ? 'No grades found for this assessment in the linked grade sheet.'
                      : 'This assessment is not linked to a grade sheet.'}
                  </p>
                  <Link
                    to={`/courses/${courseCode}/assessments/${assessmentId}/grade`}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg transition-all duration-300 font-bold"
                  >
                    <CheckCircle className="h-5 w-5" />
                    {assessment.gradeSheetId ? 'View Grades' : 'Start Grading'}
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab de análisis (solo profesores) - DISEÑO MODERNO */}
        {activeTab === 'analytics' && isTeacher && stats && (
          <div className="space-y-2">
            <div className="modern-card">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-2">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <LineChart className="h-6 w-6 text-blue-600" />
                    Análisis de Rendimiento
                  </h2>
                  <p className="text-gray-600 mt-1">
                    Resumen estadístico de las calificaciones de esta evaluación
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">
                    {stats.graded} calificados de {stats.total} estudiantes
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    stats.pending > 0
                      ? "bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800"
                      : "bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-800"
                  }`}>
                    {stats.pending > 0
                      ? `${stats.pending} pendientes`
                      : "Todos calificados"}
                  </span>
                </div>
              </div>

              {/* Estadísticas principales */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-700 font-bold">Promedio</p>
                      <p className="text-xl font-bold text-blue-900">{stats.average}</p>
                    </div>
                    <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                      <BarChart3 className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-blue-600">
                    de {assessment.maxPoints} puntos
                  </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-emerald-700 font-bold">Aprobación</p>
                      <p className="text-xl font-bold text-emerald-900">{stats.passingRate}%</p>
                    </div>
                    <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                      <Percent className="h-5 w-5 text-emerald-600" />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-emerald-600">
                    {stats.passingCount} de {stats.graded}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-amber-700 font-bold">Más Alta</p>
                      <p className="text-xl font-bold text-amber-900">{stats.highest}</p>
                    </div>
                    <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                      <TrendingUp className="h-5 w-5 text-amber-600" />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-amber-600">
                    Calificación máxima
                  </div>
                </div>

                <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-red-700 font-bold">Más Baja</p>
                      <p className="text-xl font-bold text-red-900">{stats.lowest}</p>
                    </div>
                    <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                      <TrendingUp className="h-5 w-5 text-red-600 rotate-180" />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-red-600">
                    Calificación mínima
                  </div>
                </div>
              </div>

              {/* Distribución de calificaciones */}
              {stats.graded > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <PieChart className="h-5 w-5 text-purple-600" />
                      Distribución por Rangos
                    </h3>
                    <span className="text-sm text-gray-500">
                      {stats.graded} estudiantes calificados
                    </span>
                  </div>

                  <div className="space-y-2">
                    {[
                      {
                        label: "Excelente",
                        range: "90-100%",
                        value: stats.distribution.excellent,
                        color: "bg-emerald-500",
                        textColor: "text-emerald-700",
                      },
                      {
                        label: "Bueno",
                        range: "80-89%",
                        value: stats.distribution.good,
                        color: "bg-blue-500",
                        textColor: "text-blue-700",
                      },
                      {
                        label: "Aceptable",
                        range: "70-79%",
                        value: stats.distribution.average,
                        color: "bg-amber-500",
                        textColor: "text-amber-700",
                      },
                      {
                        label: "Regular",
                        range: "60-69%",
                        value: stats.distribution.poor,
                        color: "bg-orange-500",
                        textColor: "text-orange-700",
                      },
                      {
                        label: "Necesita Mejorar",
                        range: "0-59%",
                        value: stats.distribution.failing,
                        color: "bg-red-500",
                        textColor: "text-red-700",
                      },
                    ].map((item, index) => {
                      const percentage = stats.graded > 0 ? (item.value / stats.graded) * 100 : 0;
                      const showBar = item.value > 0;

                      return (
                        <div key={index} className={`space-y-2 ${!showBar ? "opacity-60" : ""}`}>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-3">
                              <span className={`w-3 h-3 rounded-full ${item.color}`}></span>
                              <div>
                                <span className="font-bold text-gray-700">{item.label}</span>
                                <span className="text-gray-500 ml-2">({item.range})</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${item.textColor}`}>{item.value}</span>
                              <span className="text-gray-500 text-xs w-12 text-right">({percentage.toFixed(0)}%)</span>
                            </div>
                          </div>
                          {showBar && (
                            <div className="h-2 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${item.color}`} style={{ width: `${percentage}%` }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

           

            </div>

      
            {/* Si no hay estudiantes calificados */}
            {stats.graded === 0 && (
              <div className="modern-card">
                <div className="text-center py-12">
                  <BarChart3 className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-bold text-gray-900 mb-2">No hay datos para analizar</h3>
                  <p className="text-gray-500 mb-6 max-w-md mx-auto">
                    Aún no hay estudiantes calificados para esta evaluación. Una vez que califiques a los estudiantes, podrás ver análisis detallados aquí.
                  </p>
                  <Link
                    to={`/courses/${courseCode}/assessments/${assessmentId}/grade`}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg transition-all duration-300 font-bold"
                  >
                    <CheckCircle className="h-5 w-5" />
                    Comenzar a Calificar
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}