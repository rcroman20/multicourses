// src/pages/teacher/CoursesEditPage.tsx - COMPLETO CORREGIDO
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademic } from "@/contexts/AcademicContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { courseService } from "@/lib/firestore";
import {
  ArrowLeft,
  BookOpen,
  CreditCard,
  Calendar,
  User,
  Save,
  Loader2Icon,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

export default function CoursesEditPage() {
  const { courseCode } = useParams<{ courseCode: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { courses } = useAcademic();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  const course = courses.find(c => c.code === courseCode);
  
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    credits: 3,
    semester: "2026-1",
    teacherName: "",
    teacherId: "",
  });

  useEffect(() => {
    if (course && user) {
      // Verificar que el usuario es el profesor del curso
      if (user.role !== "docente" || course.teacherId !== user.id) {
        navigate(`/courses/view/${course.code}`);
        return;
      }
      
      setFormData({
        name: course.name || "",
        code: course.code || "",
        description: course.description || "",
        credits: course.credits || 3,
        semester: course.semester || "2026-1",
        teacherName: course.teacherName || "",
        teacherId: course.teacherId || "",
      });
      setLoading(false);
    } else if (courses.length > 0 && !course) {
      // Curso no encontrado
      navigate("/courses");
    }
  }, [course, user, courses, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === "credits" ? parseInt(value) || 0 : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!course?.id) {
      setError("Course ID not found");
      return;
    }
    
    setSaving(true);
    setError("");
    setSuccess("");
    
    try {
      // Validaciones
      if (!formData.name.trim()) {
        throw new Error("Course name is required");
      }
      if (!formData.code.trim()) {
        throw new Error("Course code is required");
      }
      if (!formData.credits || formData.credits < 1) {
        throw new Error("Credits must be at least 1");
      }
      
      const updatedCourse = {
        ...formData,
        updatedAt: new Date(),
      };
      
      // Ahora courseService.update devuelve el objeto correcto
      const result = await courseService.update(course.id, updatedCourse);
      
      if (result.success) {
        setSuccess("Course updated successfully!");
        setTimeout(() => {
          navigate(`/courses/view/${course.code}`);
        }, 1500);
      } else {
        setError(result.message || "Failed to update course");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
      console.error("Update error:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Loading..." subtitle="Please wait">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2Icon className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
        </div>
      </DashboardLayout>
    );
  }

  if (!course) {
    return (
      <DashboardLayout title="Course Not Found" subtitle="">
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Course Not Found</h2>
            <p className="text-gray-600 mb-6">
              The course you're trying to edit doesn't exist.
            </p>
            <Link
              to="/courses"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Courses
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title={`Edit Course: ${course.name}`} 
      subtitle="Update course information"
    >
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link
            to={`/courses/view/${course.code}`}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Course
          </Link>
        </div>

        {/* Form */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
              <BookOpen className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Edit Course Details</h2>
              <p className="text-sm text-gray-500">Update the course information below</p>
            </div>
          </div>

          {/* Success/Error Messages */}
          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <p className="text-green-700 font-medium">{success}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <p className="text-red-700 font-medium">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-2">
            {/* Course Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Course Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
                placeholder="e.g., English Level A1"
                required
              />
            </div>

            {/* Course Code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Course Code *
              </label>
              <input
                type="text"
                name="code"
                value={formData.code}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
                placeholder="e.g., ENG-A1"
                required
              />
              <p className="text-xs text-gray-500 mt-2">
                Unique identifier for the course
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
                placeholder="Course description and objectives..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Credits */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Credits *
                </label>
                <input
                  type="number"
                  name="credits"
                  value={formData.credits}
                  onChange={handleChange}
                  min="1"
                  max="10"
                  className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
                  required
                />
              </div>

              {/* Semester */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Semester *
                </label>
                <select
                  name="semester"
                  value={formData.semester}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
                  required
                >
                  <option value="2026-1">2026-1</option>
                  <option value="2025-2">2025-2</option>
                  <option value="2025-1">2025-1</option>
                  <option value="2024-2">2024-2</option>
                  <option value="2024-1">2024-1</option>
                </select>
              </div>
            </div>

            {/* Teacher Info (read-only) */}
            <div className="bg-gray-50 p-4 rounded-xl">
              <div className="flex items-center gap-3 mb-2">
                <User className="h-5 w-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Teacher</span>
              </div>
              <p className="text-gray-900 font-semibold">{formData.teacherName}</p>
              <p className="text-sm text-gray-500 mt-1">This field cannot be changed</p>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-200">
              <Link
                to={`/courses/view/${course.code}`}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-all duration-300"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
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
        </div>
      
      </div>
    </DashboardLayout>
  );
}