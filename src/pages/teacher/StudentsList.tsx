import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { firebaseDB } from '@/lib/firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  where 
} from 'firebase/firestore';
import { 
  Users, 
  Mail, 
  Phone, 
  UserPlus, 
  Trash2, 
  Search,
  Filter,
  GraduationCap,
  Hash,
  BookOpen,
  Calendar,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  Save,
  ChevronDown,
  Eye,
  Link as LinkIcon,
  Sparkles,
  Zap,
  Trophy,
  Star,
  Target,
  Award,
  BookMarked,
  UserCheck,
  Shield,
  Clock
} from 'lucide-react';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

const studentSchema = z.object({
  idNumber: z.string().min(5, 'ID must have at least 5 characters'),
  email: z.string().email('Enter a valid email'),
  name: z.string().min(3, 'Name must have at least 3 characters'),
  whatsApp: z.string().min(10, 'Enter a valid phone number'),
  role: z.enum(['estudiante', 'docente']).default('estudiante'),
});

interface Student {
  id: string;
  idNumber: string;
  email: string;
  name: string;
  role: 'estudiante' | 'docente';
  whatsApp: string;
  createdAt?: Date;
  courses: string[]; // Cambiado de 'Courses?' a 'courses' (en minúscula)
}

export default function StudentsPage() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'estudiante' | 'docente'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courseNames, setCourseNames] = useState<Record<string, string>>({});

  const isTeacher = user?.role === 'docente';

  // Form state for new student
  const [newStudent, setNewStudent] = useState({
    idNumber: '',
    email: '',
    name: '',
    whatsApp: '',
    role: 'estudiante' as 'estudiante' | 'docente',
  });

  // Función para obtener nombres de cursos
  const fetchCourseNames = async () => {
    try {
      const coursesRef = collection(firebaseDB, 'cursos');
      const querySnapshot = await getDocs(coursesRef);
      
      const names: Record<string, string> = {};
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        names[doc.id] = data.name || data.nombre || 'Unknown Course';
      });
      
      setCourseNames(names);
    } catch (err) {
      console.error('Error fetching course names:', err);
    }
  };

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const studentsRef = collection(firebaseDB, 'estudiantes');
      const q = query(studentsRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      const studentList: Student[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        
        studentList.push({
          id: doc.id,
          idNumber: data.idNumber || '',
          email: data.email,
          name: data.name,
          role: data.role,
          whatsApp: data.whatsApp,
          createdAt: data.createdAt?.toDate(),
          // IMPORTANTE: Usar data.courses (en minúscula) que es como está en Firestore
          courses: data.courses || [], // Asegurarse de usar minúscula
        });
      });

      console.log('👥 Total students loaded:', studentList.length);

      // Verificar cuántos estudiantes tienen cursos
      const studentsWithCourses = studentList.filter(s => s.courses && s.courses.length > 0);
      console.log('🎓 Students with courses:', studentsWithCourses.length);
      
      // Debug detallado de cada estudiante
      studentList.forEach(student => {
        console.log(`📋 ${student.name}:`, {
          id: student.id,
          courses: student.courses,
          courseCount: student.courses?.length || 0,
          hasCourses: !!(student.courses && student.courses.length > 0)
        });
      });

      setStudents(studentList);
      setFilteredStudents(studentList);
    } catch (err) {
      console.error('❌ Error loading students:', err);
      setError('Error loading students');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCourses = async () => {
    if (!isTeacher) return;
    
    setLoadingCourses(true);
    try {
      const coursesRef = collection(firebaseDB, 'cursos');
      const teacherCoursesQuery = query(
        coursesRef, 
        where('teacherId', '==', user?.id)
      );
      const querySnapshot = await getDocs(teacherCoursesQuery);
      
      const coursesList: any[] = [];
      querySnapshot.forEach((doc) => {
        coursesList.push({
          id: doc.id,
          ...doc.data()
        });
      });

      setCourses(coursesList);
    } catch (err) {
      console.error('Error loading courses:', err);
    } finally {
      setLoadingCourses(false);
    }
  };

  // Fetch students and courses
  useEffect(() => {
    fetchStudents();
    fetchCourses();
    fetchCourseNames();
  }, []);

  // Filter students when search or filter changes
  useEffect(() => {
    let filtered = students;

    if (roleFilter !== 'all') {
      filtered = filtered.filter(student => student.role === roleFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(student =>
        student.name.toLowerCase().includes(term) ||
        student.email.toLowerCase().includes(term) ||
        student.whatsApp.includes(term) ||
        student.idNumber.includes(term)
      );
    }

    setFilteredStudents(filtered);
  }, [students, searchTerm, roleFilter]);

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validation = studentSchema.safeParse(newStudent);
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    setIsSubmitting(true);
    try {
      // Check if student already exists
      const existingStudentById = students.find(
        student => student.idNumber === newStudent.idNumber
      );
      
      if (existingStudentById) {
        setError('A student with this ID already exists');
        return;
      }

      const existingStudentByEmail = students.find(
        student => student.email === newStudent.email
      );
      
      if (existingStudentByEmail) {
        setError('A student with this email already exists');
        return;
      }

      // Add to Firestore
      const docRef = await addDoc(collection(firebaseDB, 'estudiantes'), {
        ...newStudent,
        courses: [], // Inicializar el array de cursos
        createdAt: new Date(),
      });

      // Update local state
      const addedStudent: Student = {
        id: docRef.id,
        ...newStudent,
        courses: [], // Inicializar el array de cursos
        createdAt: new Date(),
      };

      setStudents(prev => [addedStudent, ...prev]);
      
      // Reset form
      setNewStudent({
        idNumber: '',
        email: '',
        name: '',
        whatsApp: '',
        role: 'estudiante',
      });
      setShowAddForm(false);
      
    } catch (err) {
      setError('Error adding student');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!confirm('Are you sure you want to delete this student?')) return;

    try {
      await deleteDoc(doc(firebaseDB, 'estudiantes', studentId));
      setStudents(prev => prev.filter(student => student.id !== studentId));
    } catch (err) {
      setError('Error deleting student');
    }
  };

  // Statistics
  const studentCount = students.length;
  const studentCountByRole = {
    estudiante: students.filter(s => s.role === 'estudiante').length,
    docente: students.filter(s => s.role === 'docente').length,
  };

  // Loading state
  if (isLoading) {
    return (
      <DashboardLayout
        title="Students Management"
        subtitle="Manage students and teachers in the system"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
            <div className="space-y-2">
              <p className="text-lg font-semibold text-gray-900">Loading students</p>
              <p className="text-sm text-gray-600">
                Please wait while we load the student data
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Students Management"
      subtitle="Manage students and teachers in the system"
    >
      <div className="space-y-2">
        {/* Stats Header */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Total Registered</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{studentCount}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Users in the system
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <GraduationCap className="h-4 w-4 text-green-500" />
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Students</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{studentCountByRole.estudiante}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Active students
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                <GraduationCap className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-purple-500" />
                  <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Teachers</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{studentCountByRole.docente}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Teaching staff
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                <Shield className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by ID, name, email or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                />
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as any)}
                  className="pl-10 pr-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none text-sm font-medium"
                >
                  <option value="all">All Roles</option>
                  <option value="estudiante">Students</option>
                  <option value="docente">Teachers</option>
                </select>
              </div>
              
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
              >
                <UserPlus className="h-4 w-4" />
                Add Student
              </button>
            </div>
          </div>
        </div>

        {/* Students List */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                    <UserCheck className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Registered Users</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {filteredStudents.length} of {students.length} users
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  Sorted by: <span className="font-medium">Most Recent</span>
                </span>
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setRoleFilter('all');
                    }}
                    className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="h-20 w-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                <Users className="h-10 w-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {searchTerm || roleFilter !== 'all' ? 'No results found' : 'No students registered'}
              </h3>
              <p className="text-gray-600 max-w-md mx-auto mb-6">
                {searchTerm || roleFilter !== 'all' 
                  ? 'Try different search terms' 
                  : 'Start by adding your first student or teacher'}
              </p>
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
              >
                <UserPlus className="h-4 w-4" />
                Add User
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-blue-50/50 to-cyan-50/50 border-b border-gray-200">
                    <th className="text-left px-6 py-4 font-bold text-gray-900 min-w-[180px]">
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-gray-500" />
                        ID Number
                      </div>
                    </th>
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[220px]">Name & Details</th>
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[200px]">Contact Information</th>
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[120px]">Role</th>
                    {isTeacher && (
                      <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[140px]">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student, index) => (
                    <tr key={student.id} className={cn(
                      "border-b border-gray-200 hover:bg-gradient-to-r hover:from-blue-50/30 hover:to-cyan-50/30 transition-all duration-300",
                      index % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                    )}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="font-mono text-sm font-semibold text-gray-900">{student.idNumber}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="font-semibold text-gray-900">{student.name}</span>
                            
                            {/* Mostrar información de cursos */}
                            {student.courses && student.courses.length > 0 ? (
                              <div className="flex flex-col gap-1 mt-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium px-2 py-1 bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 rounded-full">
                                    {student.courses.length} course{student.courses.length !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                
                                {/* Mostrar nombres de cursos si están disponibles */}
                                {student.courses.slice(0, 2).map((courseId, idx) => (
                                  <div key={idx} className="text-xs text-gray-600 ml-6 truncate" title={courseNames[courseId] || courseId}>
                                    
                                  </div>
                                ))}
                                
                                {student.courses.length > 2 && (
                                  <div className="text-xs text-gray-500 ml-6">
                                    +{student.courses.length - 2} more...
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-gray-400 mt-2 ml-6">
                                None
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 rounded-lg hover:bg-gray-50 transition-colors">
                            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
                              <Mail className="h-4 w-4 text-blue-500" />
                            </div>
                            <span className="text-sm text-gray-700 truncate">
                              {student.email}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 rounded-lg hover:bg-gray-50 transition-colors">
                            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center">
                              <Phone className="h-4 w-4 text-green-500" />
                            </div>
                            <span className="text-sm text-gray-700">{student.whatsApp}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn(
                          "inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold",
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
                      </td>
                      {isTeacher && (
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/students/${student.id}/enroll`}
                              className="p-2 text-blue-600 hover:text-blue-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-cyan-50 rounded-xl transition-all duration-300"
                              title="Enroll in courses"
                            >
                              <LinkIcon className="h-4 w-4" />
                            </Link>
                            <Link
                              to={`/students/${student.id}`}
                              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 rounded-xl transition-all duration-300"
                              title="View details"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => handleDeleteStudent(student.id)}
                              className="p-2 text-red-600 hover:text-red-700 hover:bg-gradient-to-r hover:from-red-50 hover:to-pink-50 rounded-xl transition-all duration-300"
                              title="Delete student"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Student Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                    <UserPlus className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">Add New User</h3>
                    <p className="text-sm text-gray-500 mt-1">Register a student or teacher</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setError('');
                  }}
                  className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {error && (
              <div className="mx-6 mt-6 p-4 rounded-xl bg-gradient-to-br from-red-50 to-pink-50 border border-red-200 text-red-700">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <p className="font-medium">{error}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleAddStudent} className="p-6">
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ID Number *
                  </label>
                  <input
                    type="text"
                    value={newStudent.idNumber}
                    onChange={(e) => setNewStudent({...newStudent, idNumber: e.target.value})}
                    placeholder="Student or teacher ID"
                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Unique identification number
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={newStudent.name}
                    onChange={(e) => setNewStudent({...newStudent, name: e.target.value})}
                    placeholder="Full name"
                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={newStudent.email}
                    onChange={(e) => setNewStudent({...newStudent, email: e.target.value})}
                    placeholder="Email address"
                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={newStudent.whatsApp}
                    onChange={(e) => setNewStudent({...newStudent, whatsApp: e.target.value})}
                    placeholder="Phone number"
                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role *
                  </label>
                  <div className="relative">
                    <select
                      value={newStudent.role}
                      onChange={(e) => setNewStudent({...newStudent, role: e.target.value as any})}
                      className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium appearance-none"
                      required
                    >
                      <option value="estudiante">Student</option>
                      <option value="docente">Teacher</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                <div className="flex gap-3 pt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setError('');
                    }}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg font-medium transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Save className="h-5 w-5" />
                        Add User
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form> 
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}