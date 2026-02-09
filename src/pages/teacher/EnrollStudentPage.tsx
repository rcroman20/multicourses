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
  Save,
  Plus,
  Trash2,
  Search,
  Filter,
  ChevronRight,
  Shield,
  Hash,
  Bookmark,
  Target,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Student {
  id: string;
  idNumber: string;
  email: string;
  name: string;
  role: 'estudiante' | 'docente';
  whatsApp: string;
  courses: string[]; // Cambiado de enrolledCourses a courses
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
  credits: number;
}

export default function EnrollStudentPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [student, setStudent] = useState<Student | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [studentCourses, setStudentCourses] = useState<string[]>([]); // Cambiado de enrolledCourses a studentCourses
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [semesterFilter, setSemesterFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const isTeacher = user?.role === 'docente';

  useEffect(() => {
    if (studentId) {
      fetchStudentData();
    }
  }, [studentId]);

  useEffect(() => {
    filterCourses();
  }, [courses, studentCourses, searchTerm, semesterFilter, statusFilter]);

  const fetchStudentData = async () => {
    setIsLoading(true);
    try {
      // Fetch student
      const studentRef = doc(firebaseDB, 'estudiantes', studentId!);
      const studentSnap = await getDoc(studentRef);
      
      if (!studentSnap.exists()) {
        navigate('/students/list');
        return;
      }

      const studentData = studentSnap.data();
      const studentObj: Student = {
        id: studentSnap.id,
        idNumber: studentData.idNumber || '',
        email: studentData.email,
        name: studentData.name,
        role: studentData.role,
        whatsApp: studentData.whatsApp,
        courses: studentData.courses || [], // Cambiado a courses
      };

      setStudent(studentObj);
      setStudentCourses(studentData.courses || []); // Cambiado a courses

      // Fetch all courses (only for teachers)
      if (isTeacher) {
        const coursesRef = collection(firebaseDB, 'cursos');
        const coursesQuery = query(
          coursesRef,
          where('teacherId', '==', user?.id)
        );
        const coursesSnapshot = await getDocs(coursesQuery);
        
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
            credits: data.credits || 0,
          });
        });

        setCourses(coursesList);
      }

    } catch (err) {
      setError('Error loading student data');
    } finally {
      setIsLoading(false);
    }
  };

  const filterCourses = () => {
    let filtered = courses;

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(course =>
        course.name.toLowerCase().includes(term) ||
        course.code.toLowerCase().includes(term) ||
        course.description.toLowerCase().includes(term)
      );
    }

    // Filter by semester
    if (semesterFilter !== 'all') {
      filtered = filtered.filter(course => course.semester === semesterFilter);
    }

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(course => course.status === statusFilter);
    }

    setFilteredCourses(filtered);
  };

  const enrollStudentInCourse = async (courseId: string) => {
    if (!student || !isTeacher) return;

    setIsUpdating(true);
    try {
      // Update course's enrolled students
      const courseRef = doc(firebaseDB, 'cursos', courseId);
      await updateDoc(courseRef, {
        enrolledStudents: arrayUnion(student.id)
      });

      // Update student's courses array (cambiar a courses en lugar de enrolledCourses)
      const studentRef = doc(firebaseDB, 'estudiantes', student.id);
      await updateDoc(studentRef, {
        courses: arrayUnion(courseId) // Cambiado a courses
      });

      // Update local state
      setStudentCourses(prev => [...prev, courseId]);
      
      const course = courses.find(c => c.id === courseId);
      if (course) {
        setSuccess(`Student enrolled in ${course.code} successfully`);
        setTimeout(() => setSuccess(''), 3000);
      }

    } catch (err) {
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
      // Update course's enrolled students
      const courseRef = doc(firebaseDB, 'cursos', courseId);
      await updateDoc(courseRef, {
        enrolledStudents: arrayRemove(student.id)
      });

      // Update student's courses array (cambiar a courses en lugar de enrolledCourses)
      const studentRef = doc(firebaseDB, 'estudiantes', student.id);
      await updateDoc(studentRef, {
        courses: arrayRemove(courseId) // Cambiado a courses
      });

      // Update local state
      setStudentCourses(prev => prev.filter(id => id !== courseId));
      
      const course = courses.find(c => c.id === courseId);
      if (course) {
        setSuccess(`Student unenrolled from ${course.code} successfully`);
        setTimeout(() => setSuccess(''), 3000);
      }

    } catch (err) {
      setError('Error unenrolling student from course');
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleEnrollment = async (courseId: string, isEnrolled: boolean) => {
    if (isEnrolled) {
      await unenrollStudentFromCourse(courseId);
    } else {
      await enrollStudentInCourse(courseId);
    }
  };

  const getSemesterOptions = () => {
    const semesters = new Set(courses.map(course => course.semester).filter(Boolean));
    return Array.from(semesters).sort();
  };

  if (isLoading) {
    return (
      <DashboardLayout
        title="Enroll Student"
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
      title="Enroll Student in Courses"
      subtitle={`Manage course enrollment for ${student.name}`}
    >
      <div className="space-y-2">
        {/* Back button and Student Info */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <button
            onClick={() => navigate('/students/list')}
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Students List
          </button>

          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
              <span className="text-xl font-bold text-blue-600">
                {student.name.charAt(0)}
              </span>
            </div>
            <div>
              <h2 className="font-bold text-gray-900">{student.name}</h2>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>{student.idNumber}</span>
                <span>•</span>
                <span>{student.email}</span>
              </div>
            </div>
          </div>
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

        {/* Summary Card */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-blue-600 mb-1">Total Courses</p>
                <p className="text-2xl font-bold text-gray-900">{courses.length}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-green-600 mb-1">Enrolled In</p>
                <p className="text-2xl font-bold text-gray-900">{studentCourses.length}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-amber-600 mb-1">Available</p>
                <p className="text-2xl font-bold text-gray-900">
                  {courses.length - studentCourses.length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
                <Target className="h-5 w-5 text-amber-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search courses by name, code or description..."
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
                  value={semesterFilter}
                  onChange={(e) => setSemesterFilter(e.target.value)}
                  className="pl-10 pr-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none text-sm font-medium"
                >
                  <option value="all">All Semesters</option>
                  {getSemesterOptions().map(semester => (
                    <option key={semester} value={semester}>Semester {semester}</option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="pl-10 pr-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none text-sm font-medium"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Courses List */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                    <BookOpen className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Available Courses</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {filteredCourses.length} courses found
                      {searchTerm && ` for "${searchTerm}"`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {filteredCourses.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="h-20 w-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                <BookOpen className="h-10 w-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No courses found</h3>
              <p className="text-gray-600 max-w-md mx-auto mb-6">
                {searchTerm || semesterFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try different search terms or filters'
                  : 'No courses available for enrollment'}
              </p>
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSemesterFilter('all');
                    setStatusFilter('all');
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-blue-50/50 to-cyan-50/50 border-b border-gray-200">
                    <th className="text-left px-6 py-4 font-bold text-gray-900 min-w-[200px]">Course</th>
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[100px]">Semester</th>
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[80px]">Group</th>
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[100px]">Credits</th>
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[120px]">Students</th>
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[100px]">Status</th>
                    <th className="text-left px-4 py-4 font-bold text-gray-900 min-w-[140px]">Enrollment</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCourses.map((course, index) => {
                    const isEnrolled = studentCourses.includes(course.id);
                    
                    return (
                      <tr key={course.id} className={cn(
                        "border-b border-gray-200 hover:bg-gradient-to-r hover:from-blue-50/30 hover:to-cyan-50/30 transition-all duration-300",
                        index % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                      )}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                              <BookOpen className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-900">{course.name}</h4>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm font-mono text-blue-600">{course.code}</span>
                              </div>
                              {course.description && (
                                <p className="text-xs text-gray-500 mt-1 line-clamp-2" title={course.description}>
                                  {course.description}
                                </p>
                              )} 
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{course.semester || 'N/A'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="font-medium text-gray-900">{course.group || 'N/A'}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="font-medium text-gray-900">{course.credits || 0}</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-gray-400" />
                            <span className="font-medium text-gray-900">
                              {course.enrolledStudents.length}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={cn(
                            "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold",
                            course.status === 'active'
                              ? 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-700'
                              : 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700'
                          )}>
                            {course.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => toggleEnrollment(course.id, isEnrolled)}
                            disabled={isUpdating}
                            className={cn(
                              "inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-300",
                              isEnrolled
                                ? "text-red-600 hover:text-red-700 hover:bg-gradient-to-r hover:from-red-50 hover:to-pink-50 border border-red-200"
                                : "text-green-600 hover:text-green-700 hover:bg-gradient-to-r hover:from-green-50 hover:to-emerald-50 border border-green-200"
                            )}
                          >
                            {isEnrolled ? (
                              <>
                                <Trash2 className="h-4 w-4" />
                                
                              </>
                            ) : (
                              <>
                                <Plus className="h-4 w-4" />
                                
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-100 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <Zap className="h-6 w-6 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-bold text-gray-900 mb-2">How to use this page</h4>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Enroll</strong>: Click the "Enroll" button to add the student to a course</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Unenroll</strong>: Click the "Unenroll" button to remove the student from a course</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Search</strong>: Use the search bar to find specific courses by name, code, or description</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Filter</strong>: Use the semester and status filters to narrow down the course list</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}