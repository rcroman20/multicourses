import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { firebaseDB } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { 
  ArrowLeft, 
  BookOpen, 
  Loader2, 
  AlertCircle,
  PlusCircle,
  Sparkles,
  Zap,
  Target,
  CheckCircle2,
  Info,
  User
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

const createCourseSchema = z.object({
  name: z.string().min(3, 'Course name is required'),
  code: z.string().min(3, 'Course code is required'),
  semester: z.string().min(1, 'Semester is required'),
  group: z.string().min(1, 'Group is required'),
  credits: z.number().min(1, 'Credits must be at least 1'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
});

export default function CreateCoursePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Form state
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

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCourseData({
      ...courseData,
      [name]: name === 'credits' ? Number(value) : value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const result = createCourseSchema.safeParse(courseData);
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setIsLoading(true);

    try {
      const courseId = uuidv4();
      await setDoc(doc(firebaseDB, 'cursos', courseId), {
        ...courseData,
        teacherId: user?.id,
        teacherName: user?.name,
        createdAt: new Date(),
        status: 'active',
        enrolledStudents: [],
      });

      navigate('/courses');
    } catch (err) {
      setError('Error creating course. Please try again.');
      console.error('Error creating course:', err);
    } finally {
      setIsLoading(false);
    } 
  };

  return (
    <DashboardLayout
      title="Create New Course"
      subtitle="Complete the information to create a new course"
    >
      <div className="animate-fade-in">
        {/* Header */}
        <div className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-2xl p-6 mb-8 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => navigate(-1)}
                  className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors font-medium"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                  <BookOpen className="h-7 w-7 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Create New Course</h1>
                  <p className="text-gray-600 mt-2">
                    Configure your course details to start managing students and grades.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-400" />
              <span className="text-sm font-medium text-blue-600">New Course Setup</span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                  <PlusCircle className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Course Information</h3>
                  <p className="text-sm text-gray-500">Fill in all required fields</p>
                </div>
              </div>
              
              {error && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-red-50 to-pink-50 border border-red-200 text-red-700 mb-6">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <p className="font-medium">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="name">
                      Course Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={courseData.name}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      placeholder="e.g., Contemporary English Literature"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Full course name
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="code">
                      Course Code *
                    </label>
                    <input
                      type="text"
                      id="code"
                      name="code"
                      value={courseData.code}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      placeholder="e.g., LIT-401"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Unique identifier code
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="semester">
                      Semester *
                    </label>
                    <select
                      id="semester"
                      name="semester"
                      value={courseData.semester}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium appearance-none"
                      required
                    >
                      <option value="">Select</option>
                      <option value="1">Semester 1</option>
                      <option value="2">Semester 2</option>
                      <option value="3">Semester 3</option>
                      <option value="4">Semester 4</option>
                      <option value="5">Semester 5</option>
                      <option value="6">Semester 6</option>
                      <option value="7">Semester 7</option>
                      <option value="8">Semester 8</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="group">
                      Group *
                    </label>
                    <input
                      type="text"
                      id="group"
                      name="group"
                      value={courseData.group}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      placeholder="e.g., 01"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="credits">
                      Credits *
                    </label>
                    <select
                      id="credits"
                      name="credits"
                      value={courseData.credits}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium appearance-none"
                      required
                    >
                      <option value="1">1 Credit</option>
                      <option value="2">2 Credits</option>
                      <option value="3">3 Credits</option>
                      <option value="4">4 Credits</option>
                      <option value="5">5 Credits</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="description">
                    Course Description *
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={courseData.description}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium min-h-[140px] resize-none"
                    placeholder="Describe course objectives, content, and methodology..."
                    required
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <Info className="h-4 w-4 text-gray-400" />
                    <p className="text-xs text-gray-500">
                      Minimum 10 characters. Describe the course content in detail.
                    </p>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-200">
                  <div className="flex flex-col sm:flex-row items-center justify-end gap-4">
                    <button
                      type="button"
                      onClick={() => navigate(-1)}
                      className="w-full sm:w-auto px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-all duration-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Creating Course...
                        </>
                      ) : (
                        <>
                          <PlusCircle className="h-5 w-5" />
                          Create Course
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                  <Target className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Course Requirements</h3>
                  <p className="text-sm text-gray-500">Everything you need to know</p>
                </div>
              </div>
              
              <ul className="space-y-4">
                <li className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-cyan-50/50 transition-all duration-300">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-blue-700">1</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Course Name</p>
                    <p className="text-xs text-gray-500 mt-1">Minimum 3 characters</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-cyan-50/50 transition-all duration-300">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-blue-700">2</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Unique Code</p>
                    <p className="text-xs text-gray-500 mt-1">Format: ABC-123</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-cyan-50/50 transition-all duration-300">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-blue-700">3</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Semester & Group</p>
                    <p className="text-xs text-gray-500 mt-1">Specify correctly</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-cyan-50/50 transition-all duration-300">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-blue-700">4</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Description</p>
                    <p className="text-xs text-gray-500 mt-1">Minimum 10 characters</p>
                  </div>
                </li>
              </ul>

             

              {/* Quick Tips */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <h4 className="text-sm font-semibold text-gray-900">Quick Tips</h4>
                </div>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-600">Use clear and descriptive course names</p>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-600">Follow the institution's coding format</p>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-600">Add detailed descriptions for students</p>
                  </li>
                </ul>
              </div>
            </div>

          
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}