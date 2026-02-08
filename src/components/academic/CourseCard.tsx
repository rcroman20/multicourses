// src/components/academic/CourseCard.tsx
import { Link } from 'react-router-dom';
import { BookOpen, Users, Calendar, ChevronRight } from 'lucide-react';
import type { Course } from '@/types/academic';
import { cn } from '@/lib/utils';

interface CourseCardProps {
  course: Course;
  showStudentCount?: boolean;
  progress?: {
    value: number;
    status: 'passing' | 'at-risk' | 'failing';
  };
  customStats?: Array<{
    label: string;
    value: string;
    icon?: React.ReactNode;
  }>;
}

export function CourseCard({ 
  course, 
  showStudentCount = false, 
  progress,
  customStats 
}: CourseCardProps) {
  return (
    <Link
      to={`/courses/${course.id}`}
      className="academic-card block group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
              {course.code}
            </span>
            <h3 className="font-semibold text-foreground mt-1 group-hover:text-primary transition-colors">
              {course.name}
            </h3>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
      </div>

      {course.description && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
          {course.description}
        </p>
      )}

      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-4 w-4" />
          <span>{course.semester}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs bg-secondary px-2 py-0.5 rounded">
            Grupo {course.group}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs bg-secondary px-2 py-0.5 rounded">
            {course.credits} créditos
          </span>
        </div>
        {showStudentCount && (
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            <span>{course.enrolledStudents.length} estudiantes</span>
          </div>
        )}
      </div>

      {/* Custom Stats Section */}
      {customStats && customStats.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="grid grid-cols-2 gap-3">
            {customStats.map((stat, index) => (
              <div key={index} className="flex flex-col">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                <span className="font-medium text-sm">
                  {stat.icon && <span className="inline-block mr-1">{stat.icon}</span>}
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {progress && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">Tu progreso</span>
            <span className={cn(
              'font-medium',
              progress.status === 'passing' && 'text-passing',
              progress.status === 'at-risk' && 'text-at-risk',
              progress.status === 'failing' && 'text-failing',
            )}>
              {progress.value.toFixed(1)}
            </span>
          </div>
          <div className="progress-academic">
            <div
              className={cn(
                'progress-academic-fill',
                progress.status === 'passing' && 'bg-passing',
                progress.status === 'at-risk' && 'bg-at-risk',
                progress.status === 'failing' && 'bg-failing',
              )}
              style={{ width: `${(progress.value / 5) * 100}%` }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}