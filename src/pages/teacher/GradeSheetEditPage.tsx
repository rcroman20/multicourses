import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Link } from 'react-router-dom';

import { 
  ArrowLeft,
  Save,
  Trash2,
  Plus,
  X,
  FileSpreadsheet,
  Calendar,
  Percent,
  AlertCircle,
  Check,
  Eye,
  EyeOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAcademic } from '@/contexts/AcademicContext';
import { 
  doc, 
  getDoc, 
  updateDoc,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { firebaseDB } from '@/lib/firebase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Activity {
  id: string;
  name: string;
  description: string;
  maxScore: number;
  type: string;
}

interface StudentGrade {
  studentId: string;
  name: string;
  grades: Record<string, {
    value?: number;
    comment?: string;
    submittedAt?: any;
  }>;
  total?: number;
  status: string;
}

interface GradeSheet {
  id: string;
  title: string;
    courseId?: string;
  courseCode: string;
  courseName: string;
  teacherId: string;
  teacherName: string;
  gradingPeriod: string;
  activities: Activity[];
  students: StudentGrade[];
  createdAt: any;
  updatedAt: any;
  isPublished: boolean;
  weightPercentage: number;
}

const GRADING_PERIODS = [
  '1st Term',     // Cambiado de 'First Term'
  '2nd Term',     // Cambiado de 'Second Term' 
  'Final',        // Mantener
  '3rd Term',   // Si necesitas más
  '4th Term',  // Si necesitas más
].map(period => period.trim())

const ACTIVITY_TYPES = [
  { value: 'exam', label: 'Exam' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'homework', label: 'Homework' },
  { value: 'project', label: 'Project' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'participation', label: 'Participation' },
  { value: 'lab', label: 'Lab Work' },
  { value: 'essay', label: 'Essay' },
  { value: 'test', label: 'Test' },
  { value: 'other', label: 'Other' }
];

const MAX_SCORES = [1, 2, 3, 4, 5, 10, 20, 50, 100];

export default function EditGradeSheetPage() {
  const { user } = useAuth();
  const { courseCode, gradeSheetId } = useParams<{ courseCode: string; gradeSheetId: string }>();
  
  const navigate = useNavigate();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [gradeSheet, setGradeSheet] = useState<GradeSheet | null>(null);
  
  const [title, setTitle] = useState('');
  const [gradingPeriod, setGradingPeriod] = useState('');
  const [weightPercentage, setWeightPercentage] = useState<number>(0);
  const [isPublished, setIsPublished] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([
    {
      id: `activity_${Date.now()}_1`,
      name: '',
      description: '',
      maxScore: 5,
      type: 'quiz'
    }
  ]);
  
  const [courseName, setCourseName] = useState('');
  const { courses } = useAcademic();
const selectedCourse = useMemo(() => 
  courses.find(c => c.code === courseCode || c.id === courseCode),
  [courses, courseCode]
);

  // Fetch grade sheet data
  useEffect(() => {
    const fetchGradeSheet = async () => {
      if (!courseCode || !gradeSheetId || !user) return;
      
      setIsLoading(true);
      try {
        const gradeSheetRef = doc(firebaseDB, 'gradeSheets', gradeSheetId);
        const gradeSheetDoc = await getDoc(gradeSheetRef);
        
        if (!gradeSheetDoc.exists()) {
          toast.error('Grade sheet not found');
          navigate(`/courses/${courseCode}/grade-sheets`);
          return;
        }
        
        const data = gradeSheetDoc.data();
        
        // Verify ownership
        if (data.teacherId !== user.id) {
          toast.error('You do not have permission to edit this grade sheet');
          navigate(`/courses/${courseCode}/grade-sheets`);
          return;
        };
        

        
        
if (!data.courseId && !data.courseCode) {
  toast.error('Grade sheet has invalid course information');
  navigate(`/courses/${courseCode}/grade-sheets`);
  return;
}


const storedCourseCode = data.courseCode || '';
const urlCourseCode = courseCode || '';
const storedCourseId = data.courseId || '';

// Log para diagnóstico
console.log('Validating course ownership:', {
  storedCourseCode,
  urlCourseCode,
  storedCourseId,
  dataCourseCode: data.courseCode,
  dataCourseId: data.courseId
});

// Verifica si hay match en courseCode (insensible a mayúsculas) O en courseId
const courseCodeMatches = storedCourseCode.toLowerCase() === urlCourseCode.toLowerCase();
const courseIdMatches = storedCourseId && selectedCourse && storedCourseId === selectedCourse.id;


if (!courseCodeMatches && !courseIdMatches) {
  console.log('Validation failed:', {
    storedCourseCode,
    urlCourseCode,
    storedCourseId,
    selectedCourseId: selectedCourse?.id
  });
  toast.error('Grade sheet does not belong to this course');
  navigate(`/courses/${courseCode}/grade-sheets`);
  return;
}


        // Set form data
        setTitle(data.title || '');
        setGradingPeriod(data.gradingPeriod || '1st Term');
        setWeightPercentage(data.weightPercentage || 0);
        setIsPublished(data.isPublished || false);

        if (data.gradingPeriod) {
  const period = data.gradingPeriod.trim();
  const matchingPeriod = GRADING_PERIODS.find(p => 
    p.toLowerCase() === period.toLowerCase()
  );
  setGradingPeriod(matchingPeriod || period);
} else {
  setGradingPeriod('1st Term');
}

setWeightPercentage(data.weightPercentage || 0);
setIsPublished(data.isPublished || false);
        
        // Set activities
        if (data.activities && Array.isArray(data.activities)) {
          setActivities(data.activities.map((act: any) => ({
            id: act.id || `activity_${Date.now()}_${Math.random()}`,
            name: act.name || '',
            description: act.description || '',
            maxScore: act.maxScore || 5,
            type: act.type || 'quiz'
          })));
        }
        
        // Set course name
        setCourseName(data.courseName || '');
        
        // Set full grade sheet object
        setGradeSheet({
          id: gradeSheetDoc.id,
          ...data
        } as GradeSheet);
        
      } catch (error) {
        console.error('Error fetching grade sheet:', error);
        toast.error('Failed to load grade sheet');
        navigate(`/courses/${courseCode}/grade-sheets`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGradeSheet();
  }, [courseCode, gradeSheetId, user, navigate]);

  // Add new activity
  const addActivity = () => {
    setActivities([
      ...activities,
      {
        id: `activity_${Date.now()}_${activities.length + 1}`,
        name: '',
        description: '',
        maxScore: 5,
        type: 'quiz'
      }
    ]);
  };

  // Update activity
  const updateActivity = (index: number, field: keyof Activity, value: string | number) => {
    const newActivities = [...activities];
    newActivities[index] = {
      ...newActivities[index],
      [field]: value
    };
    setActivities(newActivities);
  };

  // Remove activity
  const removeActivity = (index: number) => {
    if (activities.length <= 1) {
      toast.error('At least one activity is required');
      return;
    }
    
    const newActivities = activities.filter((_, i) => i !== index);
    setActivities(newActivities);
  };

  // Validate form
  const validateForm = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (!title.trim()) {
      errors.push('Title is required');
    }
    
    if (!gradingPeriod) {
      errors.push('Grading period is required');
    }
    
    if (weightPercentage < 0 || weightPercentage > 100) {
      errors.push('Weight percentage must be between 0 and 100');
    }
    
    if (activities.length === 0) {
      errors.push('At least one activity is required');
    }
    
    for (let i = 0; i < activities.length; i++) {
      const activity = activities[i];
      
      if (!activity.name.trim()) {
        errors.push(`Activity ${i + 1}: Name is required`);
      }
      
      if (activity.maxScore <= 0) {
        errors.push(`Activity ${i + 1}: Maximum score must be greater than 0`);
      }
      
      if (!activity.type) {
        errors.push(`Activity ${i + 1}: Type is required`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  };

  // Save grade sheet
  const handleSave = async () => {
    if (!user || !courseCode || !gradeSheetId) return;
    
    const validation = validateForm();
    if (!validation.isValid) {
      validation.errors.forEach(error => toast.error(error));
      return;
    }
    
    setIsSaving(true);
    
    try {
      const gradeSheetRef = doc(firebaseDB, 'gradeSheets', gradeSheetId);
      
      const updatedData = {
       title: title.trim(),
  gradingPeriod: gradingPeriod, // Asegúrate de que esté aquí
  weightPercentage: Number(weightPercentage),
  isPublished,
        activities: activities.map(activity => ({
          id: activity.id,
          name: activity.name.trim(),
          description: activity.description.trim(),
          maxScore: Number(activity.maxScore),
          type: activity.type
        })),
        updatedAt: Timestamp.now(),
        updatedBy: user.id,
        updatedByName: user.name
      };
      
      await updateDoc(gradeSheetRef, updatedData);
      
      toast.success('Grade sheet updated successfully');
      
      // Navigate back to grade sheets list
      navigate(`/courses/${courseCode}/grade-sheets`);
      
    } catch (error) {
      console.error('Error updating grade sheet:', error);
      toast.error('Failed to update grade sheet');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete grade sheet
  const handleDelete = async () => {
    if (!courseCode || !gradeSheetId) return;
    
    if (!confirm('Are you sure you want to delete this grade sheet? This action cannot be undone.')) {
      return;
    }
    
    setIsDeleting(true);
    
    try {
      const gradeSheetRef = doc(firebaseDB, 'gradeSheets', gradeSheetId);
      await deleteDoc(gradeSheetRef);
      
      toast.success('Grade sheet deleted successfully');
      navigate(`/courses/${courseCode}/grade-sheets`);
      
    } catch (error) {
      console.error('Error deleting grade sheet:', error);
      toast.error('Failed to delete grade sheet');
    } finally {
      setIsDeleting(false);
    }
  };

  // Publish/Unpublish grade sheet
  const togglePublish = async () => {
    if (!user || !gradeSheetId || isSaving) return;
    
    const newPublishState = !isPublished;
    setIsPublished(newPublishState);
    
    try {
      const gradeSheetRef = doc(firebaseDB, 'gradeSheets', gradeSheetId);
      
      await updateDoc(gradeSheetRef, {
        isPublished: newPublishState,
        updatedAt: Timestamp.now()
      });
      
      toast.success(`Grade sheet ${newPublishState ? 'published' : 'unpublished'} successfully`);
      
    } catch (error) {
      console.error('Error toggling publish state:', error);
      toast.error(`Failed to ${newPublishState ? 'publish' : 'unpublish'} grade sheet`);
      setIsPublished(!newPublishState); // Revert on error
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Edit Grade Sheet" subtitle="Loading...">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-600 border-t-transparent mx-auto mb-4"></div>
            <p className="text-gray-600">Loading grade sheet...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!gradeSheet) {
    return (
      <DashboardLayout title="Edit Grade Sheet" subtitle="Grade sheet not found">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">Grade sheet not found</h3>
            <p className="text-gray-500 mb-6">The grade sheet you're looking for doesn't exist.</p>
            <Button onClick={() => navigate(`/courses/${courseCode}/grade-sheets`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Grade Sheets
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Edit Grade Sheet"
      subtitle={`Editing: ${gradeSheet.title}`}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Link
                  to={`/courses/${courseCode}/grade-sheets`}
                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Grade Sheets
                </Link>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Edit Grade Sheet</h1>
              <p className="text-gray-600 mt-1">{courseName} ({courseCode})</p>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                onClick={togglePublish}
                variant={isPublished ? "outline" : "default"}
                className={cn(
                  "flex items-center gap-2",
                  isPublished ? "bg-green-50 text-green-700 hover:bg-green-100 border-green-200" : ""
                )}
                disabled={isSaving}
              >
                {isPublished ? (
                  <>
                    <Eye className="h-4 w-4" />
                    Published
                  </>
                ) : (
                  <>
                    <EyeOff className="h-4 w-4" />
                    Unpublished
                  </>
                )}
              </Button>
              
              <Button
                onClick={handleDelete}
                variant="destructive"
                className="flex items-center gap-2"
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
              
              <Button
                onClick={handleSave}
                className="flex items-center gap-2"
                disabled={isSaving}
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>

        {/* Main Form */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Basic Information */}
          <div className="lg:col-span-2 space-y-6">
            {/* Grade Sheet Information */}
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                Grade Sheet Information
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title *
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter grade sheet title"
                    className="w-full"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    A descriptive title for this grade sheet (e.g., "Midterm Exam", "Quarter 1 Assessments")
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Grading Period *
                    </label>
                   <select
  value={gradingPeriod || ''} // Asegurar que no sea undefined
  onChange={(e) => setGradingPeriod(e.target.value)}
  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
>
  <option value="">Select grading period...</option>
  {GRADING_PERIODS.map(period => (
    <option key={period} value={period}>
      {period}
    </option>
  ))}
</select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Weight Percentage *
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={weightPercentage}
                        onChange={(e) => setWeightPercentage(Number(e.target.value))}
                        placeholder="0"
                        className="w-full pl-3 pr-10"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                        %
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Percentage this sheet contributes to final grade
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Activities */}
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Activities</h2>
                <Button
                  onClick={addActivity}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Activity
                </Button>
              </div>
              
              <div className="space-y-4">
                {activities.map((activity, index) => (
                  <div
                    key={activity.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium">Activity {index + 1}</h3>
                      <Button
                        onClick={() => removeActivity(index)}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                        disabled={activities.length <= 1}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Activity Name *
                        </label>
                        <Input
                          value={activity.name}
                          onChange={(e) => updateActivity(index, 'name', e.target.value)}
                          placeholder="e.g., Quiz 1, Final Exam, Homework"
                          className="w-full"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Activity Type *
                        </label>
                        <select
                          value={activity.type}
                          onChange={(e) => updateActivity(index, 'type', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        >
                          <option value="">Select type...</option>
                          {ACTIVITY_TYPES.map(type => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Maximum Score *
                        </label>
                        <div className="flex items-center gap-2">
                          <select
                            value={activity.maxScore}
                            onChange={(e) => updateActivity(index, 'maxScore', Number(e.target.value))}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                          >
                            {MAX_SCORES.map(score => (
                              <option key={score} value={score}>
                                {score} points
                              </option>
                            ))}
                          </select>
                          <Input
                            type="number"
                            min="1"
                            max="1000"
                            value={activity.maxScore}
                            onChange={(e) => updateActivity(index, 'maxScore', Number(e.target.value))}
                            className="w-24"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Current Score
                        </label>
                        <div className="text-sm text-gray-500 p-2 bg-gray-50 rounded">
                          Students will enter scores from 0 to {activity.maxScore}
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Description (Optional)
                      </label>
                      <Textarea
                        value={activity.description}
                        onChange={(e) => updateActivity(index, 'description', e.target.value)}
                        placeholder="Brief description of the activity..."
                        rows={2}
                        className="w-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
              
              {activities.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                  <FileSpreadsheet className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No activities added yet</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Add activities to start grading students
                  </p>
                  <Button
                    onClick={addActivity}
                    className="mt-4"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Activity
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold mb-4">Summary</h3>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Course:</span>
                  <span className="font-medium">{courseName}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Course Code:</span>
                  <span className="font-medium text-blue-600">{courseCode}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <Badge
                    variant="outline"
                    className={
                      isPublished
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }
                  >
                    {isPublished ? 'Published' : 'Draft'}
                  </Badge>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Weight:</span>
                  <span className="font-medium text-blue-600">{weightPercentage}%</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Activities:</span>
                  <span className="font-medium">{activities.length}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Created:</span>
                  <span className="font-medium">
                    {gradeSheet.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Last Updated:</span>
                  <span className="font-medium">
                    {gradeSheet.updatedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                  </span>
                </div>
              </div>
              
              <div className="mt-6 pt-4 border-t">
               
                
                <Button
                  variant="outline"
                  onClick={() => navigate(`/courses/${courseCode}/grade-sheets`)}
                  className="w-full mt-3"
                >
                  Cancel
                </Button>
              </div>
            </div>

            {/* Tips Card */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
              <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Tips
              </h3>
              
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm text-blue-700">
                    Make sure the total weight percentage across all grade sheets equals 100%
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm text-blue-700">
                    Use descriptive titles for activities to help students understand
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm text-blue-700">
                    Publish grade sheets only when you're ready for students to see them
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm text-blue-700">
                    Consider using consistent max scores (like 5 or 10 points) for easier grading
                  </span>
                </li>
              </ul>
            </div>

            {/* Weight Validation Card */}
            <div className={cn(
              "border rounded-xl p-5",
              weightPercentage > 0
                ? weightPercentage <= 100
                  ? "bg-green-50 border-green-100"
                  : "bg-red-50 border-red-100"
                : "bg-gray-50 border-gray-100"
            )}>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Percent className="h-5 w-5" />
                Weight Validation
              </h3>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Current weight:</span>
                  <span className={cn(
                    "font-semibold",
                    weightPercentage > 0
                      ? weightPercentage <= 100
                        ? "text-green-700"
                        : "text-red-700"
                      : "text-gray-700"
                  )}>
                    {weightPercentage}%
                  </span>
                </div>
                
                {weightPercentage === 0 && (
                  <p className="text-sm text-amber-600">
                    This grade sheet currently has 0% weight. Students won't see it in their final grade.
                  </p>
                )}
                
                {weightPercentage > 100 && (
                  <p className="text-sm text-red-600">
                    Weight cannot exceed 100%. Adjust the percentage.
                  </p>
                )}
                
                {weightPercentage > 0 && weightPercentage <= 100 && (
                  <p className="text-sm text-green-600">
                    Valid weight percentage. This sheet will contribute {weightPercentage}% to final grades.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

      
      </div>
    </DashboardLayout>
  );
}