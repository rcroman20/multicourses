// src/pages/CourseFilesPage.tsx
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademic } from '@/contexts/AcademicContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import FileManager from '@/components/course/FileManager';
import { 
  ArrowLeft, 
  FolderOpen,
  FileText,
  Zap,
  Sparkles
} from 'lucide-react';

export default function CourseFilesPage() {
  const { courseCode } = useParams<{ courseCode: string }>();
  const { user } = useAuth();
  const { courses } = useAcademic();
   
  const course = courseCode ? courses.find(c => c.code === courseCode) : null;
  const isTeacher = user?.role === 'docente';

  if (!course) {
    return (
      <DashboardLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <div className="h-24 w-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <FolderOpen className="h-12 w-12 text-gray-400" />
            </div>
            <h2 className="text-2xl font-bold mb-3 text-gray-900">Course not found</h2>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              The course you are looking for does not exist or you don't have access to it.
            </p>
            <Link
              to="/courses"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to courses
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="File Manager"
      subtitle={`${course.code} • ${course.name}`}
    >
      <div className="space-y-6">
        {/* Header con información del curso */}
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-100 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <FileText className="h-7 w-7 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Course Materials</h2>
                <p className="text-gray-600 mt-1">Access and manage all course files and resources</p>
              </div>
            </div>
            <div className="flex items-center gap-2 ">
              <div className="px-4 py-2 bg-white/80 backdrop-blur-sm rounded-xl border border-blue-100 hidden sm:block">
                <p className="text-xs font-medium text-blue-600">Course Code</p>
                <p className="text-sm font-bold text-gray-900">{course.code}</p>
              </div>
              <div className="px-4 py-2 bg-white/80 backdrop-blur-sm rounded-xl border border-blue-100 hidden sm:block">
                <p className="text-xs font-medium text-cyan-600">Teacher</p>
                <p className="text-sm font-bold text-gray-900">{course.teacherName}</p>
              </div>
            </div>
          </div>
          
          {/* Quick stats */}
          <div className="grid grid-cols-4 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-blue-500 hidden sm:block" />
                <p className="text-xs font-semibold text-blue-600">Total Files</p>
              </div>
              <p className="text-xl font-bold text-gray-900">2</p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-amber-500 hidden sm:block" />
                <p className="text-xs font-semibold text-amber-600">Recently Added</p>
              </div>
              <p className="text-xl font-bold text-gray-900">2</p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-purple-500 hidden sm:block" />
                <p className="text-xs font-semibold text-purple-600">PDF Files</p>
              </div>
              <p className="text-xl font-bold text-gray-900">2</p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <FolderOpen className="h-4 w-4 text-green-500 hidden sm:block" />
                <p className="text-xs font-semibold text-green-600">Storage</p>
              </div>
              <p className="text-xl font-bold text-gray-900">536 mb</p>
            </div>
          </div>
        </div>

        {/* File Manager */}
        <FileManager courseId={course.id} isTeacher={isTeacher} />
      </div>
    </DashboardLayout>
  );
}  