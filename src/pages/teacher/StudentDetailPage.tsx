import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { firebaseDB } from '@/lib/firebase';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  updateDoc,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import {
  ArrowLeft,
  Users,
  Mail,
  Phone,
  BookOpen,
  GraduationCap,
  Calendar,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Edit,
  Save,
  Plus,
  Trash2,
  Shield,
  Hash,
  ExternalLink,
  Clock,
  FileText,
  BarChart3,
  X,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Student {
  id: string;
  idNumber: string;
  email: string;
  name: string;
  role: 'estudiante' | 'docente';
  whatsApp: string;
  createdAt?: Date;
  courses?: string[];
}

interface Course {
  id: string;
  name: string;
  code: string;
  description: string;
  semester: string;
  group: string;
  enrolledStudents: string[];
  teacherId: string;
  teacherName: string;
  status: string;
}

export default function StudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [student, setStudent] = useState<Student | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [studentGrades, setStudentGrades] = useState<any[]>([]);
  const [studentAssessments, setStudentAssessments] = useState<any[]>([]);
  
  // Estados para edición
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    idNumber: '',
    email: '',
    whatsApp: ''
  });

  const isTeacher = user?.role === 'docente';

  useEffect(() => {
    if (studentId) {
      fetchStudentData();
    }
  }, [studentId]);

  // Inicializar el formulario de edición cuando se carga el estudiante
  useEffect(() => {
    if (student) {
      setEditForm({
        name: student.name,
        idNumber: student.idNumber,
        email: student.email,
        whatsApp: student.whatsApp
      });
    }
  }, [student]);

  const fetchStudentData = async () => {
    setIsLoading(true);
    try {
      // Fetch student from 'estudiantes' collection
      const studentRef = doc(firebaseDB, 'estudiantes', studentId!);
      const studentSnap = await getDoc(studentRef);
      
      if (!studentSnap.exists()) {
        navigate('/students/list');
        return;
      }

      const studentData = studentSnap.data();
      console.log('Student data:', studentData);
      
      const studentObj: Student = {
        id: studentSnap.id,
        idNumber: studentData.idNumber || '',
        email: studentData.email,
        name: studentData.name,
        role: studentData.role,
        whatsApp: studentData.whatsApp,
        createdAt: studentData.createdAt?.toDate(),
        courses: Array.isArray(studentData.courses) ? studentData.courses : [],
      };

      setStudent(studentObj);

      // Fetch student grades from gradeSheets
      await fetchStudentGrades(studentSnap.id);

      // Fetch student assessments
      await fetchStudentAssessments(studentSnap.id);

      // Fetch all courses (only for teachers)
      if (isTeacher) {
        await fetchTeacherCourses(studentObj.courses || []);
      }

    } catch (err) {
      console.error('Error loading student data:', err);
      setError('Error loading student data');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTeacherCourses = async (studentCourseIds: string[]) => {
    try {
      const coursesRef = collection(firebaseDB, 'cursos');
      const teacherCoursesQuery = query(
        coursesRef,
        where('teacherId', '==', user?.id)
      );
      const coursesSnapshot = await getDocs(teacherCoursesQuery);
      
      const coursesList: Course[] = [];
      coursesSnapshot.forEach((doc) => {
        const data = doc.data();
        coursesList.push({
          id: doc.id,
          name: data.name || data.nombre || 'Unnamed Course',
          code: data.code || data.codigo || 'N/A',
          description: data.description || '',
          semester: data.semester || '',
          group: data.group || '',
          enrolledStudents: data.enrolledStudents || [],
          teacherId: data.teacherId,
          teacherName: data.teacherName || '',
          status: data.status || 'active',
        });
      });

      setCourses(coursesList);

      // Separate enrolled and available courses
      const enrolled = coursesList.filter(course => 
        studentCourseIds.includes(course.id)
      );
      const available = coursesList.filter(course => 
        !studentCourseIds.includes(course.id)
      );

      setEnrolledCourses(enrolled);
      setAvailableCourses(available);

    } catch (err) {
      console.error('Error loading courses:', err);
    }
  };

  const fetchStudentGrades = async (studentId: string) => {
    try {
      const gradeSheetsRef = collection(firebaseDB, 'gradeSheets');
      const gradeSheetsSnapshot = await getDocs(gradeSheetsRef);
      
      const grades: any[] = [];
      
      gradeSheetsSnapshot.forEach((doc) => {
        const sheetData = doc.data();
        const studentInSheet = sheetData.students?.find((s: any) => s.studentId === studentId);
        
        if (studentInSheet && studentInSheet.total) {
          grades.push({
            sheetId: doc.id,
            sheetTitle: sheetData.title || 'Unnamed Sheet',
            courseName: sheetData.courseName || 'Unknown Course',
            gradingPeriod: sheetData.gradingPeriod || 'N/A',
            grade: studentInSheet.total,
            status: studentInSheet.status || 'pending',
            updatedAt: sheetData.updatedAt?.toDate() || new Date(),
          });
        }
      });
      
      // Sort by most recent
      grades.sort((a, b) => b.updatedAt - a.updatedAt);
      setStudentGrades(grades);
      
    } catch (err) {
      console.error('Error fetching student grades:', err);
    }
  };

  const fetchStudentAssessments = async (studentId: string) => {
    try {
      const assessmentsRef = collection(firebaseDB, 'assessments');
      const assessmentsSnapshot = await getDocs(assessmentsRef);
      
      const assessments: any[] = [];
      
      assessmentsSnapshot.forEach((doc) => {
        const assessmentData = doc.data();
        if (assessmentData) {
          assessments.push({
            id: doc.id,
            name: assessmentData.name || 'Unnamed Assessment',
            courseId: assessmentData.courseId,
            type: assessmentData.type || 'homework',
            status: assessmentData.status || 'draft',
            dueDate: assessmentData.dueDate,
            createdAt: assessmentData.createdAt,
          });
        }
      });
      
      setStudentAssessments(assessments.slice(0, 5));
      
    } catch (err) {
      console.error('Error fetching student assessments:', err);
    }
  };

  // Función para guardar los cambios del estudiante
  const handleSaveChanges = async () => {
    if (!student) return;

    // Validaciones básicas
    if (!editForm.name.trim()) {
      setError('El nombre es requerido');
      return;
    }
    if (!editForm.idNumber.trim()) {
      setError('El número de ID es requerido');
      return;
    }
    if (!editForm.email.trim()) {
      setError('El correo electrónico es requerido');
      return;
    }
    if (!editForm.whatsApp.trim()) {
      setError('El número de WhatsApp es requerido');
      return;
    }

    setIsUpdating(true);
    try {
      // Actualizar en Firestore
      const studentRef = doc(firebaseDB, 'estudiantes', student.id);
      await updateDoc(studentRef, {
        name: editForm.name.trim(),
        idNumber: editForm.idNumber.trim(),
        email: editForm.email.trim(),
        whatsApp: editForm.whatsApp.trim(),
        updatedAt: new Date()
      });

      // Actualizar también en la colección de usuarios si existe
      try {
        const userRef = doc(firebaseDB, 'usuarios', student.id);
        await updateDoc(userRef, {
          name: editForm.name.trim(),
          idNumber: editForm.idNumber.trim(),
          email: editForm.email.trim(),
          whatsApp: editForm.whatsApp.trim(),
          updatedAt: new Date()
        });
      } catch (err) {
        console.log('Usuario no encontrado en colección usuarios, solo actualizando en estudiantes');
      }

      // Actualizar estado local
      setStudent(prev => prev ? {
        ...prev,
        name: editForm.name.trim(),
        idNumber: editForm.idNumber.trim(),
        email: editForm.email.trim(),
        whatsApp: editForm.whatsApp.trim()
      } : null);

      setSuccess('Información del estudiante actualizada exitosamente');
      setTimeout(() => setSuccess(''), 3000);
      setIsEditing(false);

    } catch (err) {
      console.error('Error updating student:', err);
      setError('Error al actualizar la información del estudiante');
    } finally {
      setIsUpdating(false);
    }
  };

  const enrollStudentInCourse = async (courseId: string) => {
    if (!student || !isTeacher) return;

    setIsUpdating(true);
    try {
      const courseRef = doc(firebaseDB, 'cursos', courseId);
      const courseSnap = await getDoc(courseRef);
      
      if (courseSnap.exists()) {
        const courseData = courseSnap.data();
        const currentStudents = courseData.enrolledStudents || [];
        
        if (!currentStudents.includes(student.id)) {
          await updateDoc(courseRef, {
            enrolledStudents: arrayUnion(student.id)
          });
        }
      }

      const studentRef = doc(firebaseDB, 'estudiantes', student.id);
      await updateDoc(studentRef, {
        courses: arrayUnion(courseId)
      });

      const course = courses.find(c => c.id === courseId);
      if (course) {
        setEnrolledCourses(prev => [...prev, course]);
        setAvailableCourses(prev => prev.filter(c => c.id !== courseId));
        
        setStudent(prev => prev ? {
          ...prev,
          courses: [...(prev.courses || []), courseId]
        } : null);

        setSuccess(`Student enrolled in ${course.code} successfully`);
        setTimeout(() => setSuccess(''), 3000);
        
        setTimeout(() => fetchStudentData(), 500);
      }

    } catch (err) {
      console.error('Error enrolling student:', err);
      setError('Error enrolling student in course');
    } finally {
      setIsUpdating(false);
    }
  };

  const unenrollStudentFromCourse = async (courseId: string) => {
    if (!student || !isTeacher) return;

    if (!confirm('Are you sure you want to unenroll this student from the course?')) {
      return;
    }

    setIsUpdating(true);
    try {
      const courseRef = doc(firebaseDB, 'cursos', courseId);
      await updateDoc(courseRef, {
        enrolledStudents: arrayRemove(student.id)
      });

      const studentRef = doc(firebaseDB, 'estudiantes', student.id);
      await updateDoc(studentRef, {
        courses: arrayRemove(courseId)
      });

      const course = courses.find(c => c.id === courseId);
      if (course) {
        setEnrolledCourses(prev => prev.filter(c => c.id !== courseId));
        setAvailableCourses(prev => [...prev, course]);
        
        setStudent(prev => prev ? {
          ...prev,
          courses: prev.courses?.filter(id => id !== courseId) || []
        } : null);

        setSuccess(`Student unenrolled from ${course.code} successfully`);
        setTimeout(() => setSuccess(''), 3000);
        
        setTimeout(() => fetchStudentData(), 500);
      }

    } catch (err) {
      console.error('Error unenrolling student:', err);
      setError('Error unenrolling student from course');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEditFormChange = (field: keyof typeof editForm, value: string) => {
    setEditForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const cancelEdit = () => {
    if (student) {
      setEditForm({
        name: student.name,
        idNumber: student.idNumber,
        email: student.email,
        whatsApp: student.whatsApp
      });
    }
    setIsEditing(false);
    setError('');
  };

  if (isLoading) {
    return (
      <DashboardLayout
        title="Student Details"
        subtitle="Loading student information..."
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
            <div className="space-y-2">
              <p className="text-lg font-semibold text-gray-900">Loading student data</p>
              <p className="text-sm text-gray-600">
                Please wait while we load the student information
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!student) {
    return (
      <DashboardLayout
        title="Student Not Found"
        subtitle="The requested student could not be found"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">Student not found</h3>
            <p className="text-gray-500 mb-6">The student you're looking for doesn't exist.</p>
            <button
              onClick={() => navigate('/students/list')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Students List
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Student Details"
      subtitle={`Viewing information for ${student.name}`}
    >
      <div className="space-y-2">
        {/* Back button */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/students/list')}
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Students List
          </button>
          
          {isTeacher && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
            >
              <Edit className="h-4 w-4" />
              Edit Student
            </button>
          )}
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="modern-card bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-green-800">{success}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="modern-card bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-medium text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Student Information Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="flex-1">
              {/* Header con opción de edición */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                    <User className="h-8 w-8 text-blue-600" />
                  </div>
                  <div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => handleEditFormChange('name', e.target.value)}
                          className="text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-blue-500 focus:outline-none focus:border-blue-700 px-1 py-1"
                          placeholder="Nombre completo"
                        />
                        <div className="flex items-center gap-3 mt-1">
                          <span className={cn(
                            "inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold",
                            student.role === 'docente' 
                              ? 'bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 border border-purple-200' 
                              : 'bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 border border-blue-200'
                          )}>
                            {student.role === 'docente' ? (
                              <>
                                <Shield className="h-3 w-3" />
                                Teacher
                              </>
                            ) : (
                              <>
                                <GraduationCap className="h-3 w-3" />
                                Student
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h2 className="text-2xl font-bold text-gray-900">{student.name}</h2>
                        <div className="flex items-center gap-3 mt-1">
                          <span className={cn(
                            "inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold",
                            student.role === 'docente' 
                              ? 'bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 border border-purple-200' 
                              : 'bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 border border-blue-200'
                          )}>
                            {student.role === 'docente' ? (
                              <>
                                <Shield className="h-3 w-3" />
                                Teacher
                              </>
                            ) : (
                              <>
                                <GraduationCap className="h-3 w-3" />
                                Student
                              </>
                            )}
                          </span>
                          <span className="text-sm text-gray-500">•</span>
                          <span className="text-sm text-gray-500">
                            Joined: {student.createdAt ? student.createdAt.toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            }) : 'N/A'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                {/* Columna izquierda */}
                <div className="space-y-2">
                  {/* ID Number */}
                  <div className="p-3 bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
                        <Hash className="h-5 w-5 text-blue-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-500">ID Number</p>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.idNumber}
                            onChange={(e) => handleEditFormChange('idNumber', e.target.value)}
                            className="font-semibold text-gray-900 bg-transparent border-b border-blue-500 focus:outline-none focus:border-blue-700 w-full px-1 py-1"
                            placeholder="Número de identificación"
                          />
                        ) : (
                          <p className="font-semibold text-gray-900">{student.idNumber}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="p-3 bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center">
                        <Mail className="h-5 w-5 text-green-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-500">Email</p>
                        {isEditing ? (
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => handleEditFormChange('email', e.target.value)}
                            className="font-semibold text-gray-900 bg-transparent border-b border-blue-500 focus:outline-none focus:border-blue-700 w-full px-1 py-1"
                            placeholder="correo@ejemplo.com"
                          />
                        ) : (
                          <p className="font-semibold text-gray-900">{student.email}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Columna derecha */}
                <div className="space-y-2">
                  {/* Phone / WhatsApp */}
                  <div className="p-3 bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center">
                        <Phone className="h-5 w-5 text-purple-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-500">Phone / WhatsApp</p>
                        {isEditing ? (
                          <input
                            type="tel"
                            value={editForm.whatsApp}
                            onChange={(e) => handleEditFormChange('whatsApp', e.target.value)}
                            className="font-semibold text-gray-900 bg-transparent border-b border-blue-500 focus:outline-none focus:border-blue-700 w-full px-1 py-1"
                            placeholder="Número de teléfono"
                          />
                        ) : (
                          <p className="font-semibold text-gray-900">{student.whatsApp}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Enrolled Courses */}
                  <div className="p-3 bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
                        <BookOpen className="h-5 w-5 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Enrolled Courses</p>
                        <p className="font-semibold text-gray-900">
                          {student.courses?.length || 0} course{student.courses?.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botones de acción para edición */}
              {isEditing && (
                <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-all duration-300 flex items-center gap-2"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveChanges}
                    disabled={isUpdating}
                    className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:shadow-lg font-medium transition-all duration-300 flex items-center gap-2 disabled:opacity-50"
                  >
                    {isUpdating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
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
              )}
            </div>
          </div>
        </div>

        {/* Course Management Section (Only for Teachers) */}
        {isTeacher && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Enrolled Courses */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Enrolled Courses</h3>
                    <p className="text-sm text-gray-500">
                      {enrolledCourses.length} of {courses.length} courses
                    </p>
                  </div>
                </div>
                <Link
                  to={`/students/${student.id}/enroll`}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium hover:underline"
                >
                  Manage Enrollment
                </Link>
              </div>

              {enrolledCourses.length === 0 ? (
                <div className="text-center py-8">
                  <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-900 font-medium mb-2">No enrolled courses</p>
                  <p className="text-sm text-gray-600">This student is not enrolled in any of your courses</p>
                  <Link
                    to={`/students/${student.id}/enroll`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium mt-4"
                  >
                    <Plus className="h-4 w-4" />
                    Enroll in Courses
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {enrolledCourses.map((course) => (
                    <div
                      key={course.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-lg transition-all duration-300"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-semibold text-gray-900">{course.name}</h4>
                          <span className="text-xs px-2 py-1 rounded-full bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 font-medium">
                            {course.code}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span>Semester {course.semester} - Group {course.group}</span>
                          </div>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>{course.enrolledStudents.length} students</span>
                          </div>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              course.status === 'active' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {course.status}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => unenrollStudentFromCourse(course.id)}
                        disabled={isUpdating}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-gradient-to-r hover:from-red-50 hover:to-pink-50 rounded-xl transition-all duration-300 disabled:opacity-50"
                        title="Unenroll from course"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Available Courses */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                    <Plus className="h-6 w-6 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Available Courses</h3>
                    <p className="text-sm text-gray-500">
                      Courses where student is not enrolled
                    </p>
                  </div>
                </div>
                <span className="text-sm text-gray-500">
                  {availableCourses.length} available
                </span>
              </div>

              {availableCourses.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-4" />
                  <p className="text-gray-900 font-medium mb-2">All courses enrolled</p>
                  <p className="text-sm text-gray-600">Student is enrolled in all your available courses</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableCourses.map((course) => (
                    <div
                      key={course.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-green-300 hover:shadow-lg transition-all duration-300"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-semibold text-gray-900">{course.name}</h4>
                          <span className="text-xs px-2 py-1 rounded-full bg-gradient-to-br from-green-100 to-emerald-100 text-green-700 font-medium">
                            {course.code}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span>Semester {course.semester} - Group {course.group}</span>
                          </div>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>{course.enrolledStudents.length} students</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => enrollStudentInCourse(course.id)}
                        disabled={isUpdating}
                        className="p-2 text-green-600 hover:text-green-700 hover:bg-gradient-to-r hover:from-green-50 hover:to-emerald-50 rounded-xl transition-all duration-300 disabled:opacity-50"
                        title="Enroll in course"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}