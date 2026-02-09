import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademic } from '@/contexts/AcademicContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { unitService, weekService, slideService } from '@/lib/unitService';
import { 
  Presentation, 
  ChevronDown, 
  ExternalLink, 
  ChevronRight,
  FolderOpen,
  Plus,
  Trash2,
  X,
  Save,
  Maximize2,
  Download,
  Share2,
  BookOpen,
  Calendar,
  FileText,
  Loader2,
  AlertTriangle,
  Search,
  Grid3x3,
  List,
  Eye,
  ChevronLeft,
  Sparkles,
  Zap,
  Target,
  EyeOff,
  Link as LinkIcon,
  Copy,
  Play,
  Clock,
  Tag,
  School // Añadir este icono
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SlidesPage() {
  const { user } = useAuth();
  const { courses, units: contextUnits } = useAcademic();
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [expandedUnits, setExpandedUnits] = useState<string[]>([]);
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>([]);
  const [selectedSlide, setSelectedSlide] = useState<string | null>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);

  // Estados para modales
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showWeekModal, setShowWeekModal] = useState(false);
  const [showSlideModal, setShowSlideModal] = useState(false);

  // Form states
  const [unitForm, setUnitForm] = useState({ name: '', description: '', order: 0 });
  const [weekForm, setWeekForm] = useState({ number: 1, topic: '', unitId: '' });
  const [slideForm, setSlideForm] = useState({ 
    title: '', 
    description: '', 
    canvaUrl: '', 
    weekId: '', 
    order: 0 
  });

  const isTeacher = user?.role === 'docente';

  // Obtener cursos según rol
  const userCourses = useMemo(() => {
    if (!user) return [];
    return isTeacher
      ? courses.filter(c => c.teacherId === user.id)
      : courses.filter(c => c.enrolledStudents.includes(user.id));
  }, [courses, user, isTeacher]);

  const selectedCourse = useMemo(() => 
    userCourses.find(c => c.id === selectedCourseId),
    [userCourses, selectedCourseId]
  );

  // Obtener/salvar último curso seleccionado
  const getLastSelectedCourse = (): string | null => {
    if (typeof window !== 'undefined' && user?.id) {
      return localStorage.getItem(`lastSelectedCourse_slides_${user.id}`);
    }
    return null;
  };

  const saveLastSelectedCourse = (courseId: string) => {
    if (typeof window !== 'undefined' && user?.id) {
      localStorage.setItem(`lastSelectedCourse_slides_${user.id}`, courseId);
    }
  };

  // Seleccionar automáticamente un curso al cargar
  useEffect(() => {
    if (initialLoad && userCourses.length > 0 && !selectedCourseId) {
      const lastCourseId = getLastSelectedCourse();
      const lastCourse = userCourses.find(course => course.id === lastCourseId);
      
      if (lastCourse) {
        setSelectedCourseId(lastCourse.id);
      } else {
        const sortedCourses = [...userCourses].sort((a, b) => 
          a.name.localeCompare(b.name)
        );
        
        if (sortedCourses.length > 0) {
          setSelectedCourseId(sortedCourses[0].id);
          saveLastSelectedCourse(sortedCourses[0].id);
        }
      }
      
      setInitialLoad(false);
    }
  }, [userCourses, selectedCourseId, initialLoad, user?.id]);

  // Cargar unidades cuando se selecciona un curso
  useEffect(() => {
    if (selectedCourseId) {
      const filteredUnits = contextUnits.filter(u => u.courseId === selectedCourseId);
      setUnits(filteredUnits);
    }
  }, [contextUnits, selectedCourseId]);

  // Manejar cambio de curso
  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);
    
    if (courseId) {
      saveLastSelectedCourse(courseId);
    }
    
    setSelectedSlide(null);
    setExpandedUnits([]);
    setExpandedWeeks([]);
    setUnits([]);
  };

  // Cargar unidades
  const loadUnits = async () => {
    if (!selectedCourseId) return;
    
    setLoading(true);
    try {
      const loadedUnits = await unitService.getByCourse(selectedCourseId);
      setUnits(loadedUnits);
    } catch {
      // Error silencioso
    } finally {
      setLoading(false);
    }
  };

  const toggleUnit = (unitId: string) => {
    setExpandedUnits(prev =>
      prev.includes(unitId)
        ? prev.filter(id => id !== unitId)
        : [...prev, unitId]
    );
  };

  const toggleWeek = (weekId: string) => {
    setExpandedWeeks(prev =>
      prev.includes(weekId)
        ? prev.filter(id => id !== weekId)
        : [...prev, weekId]
    );
  };

  // Obtener todas las diapositivas para búsqueda
  const allSlides = useMemo(() => {
    const slides: any[] = [];
    units.forEach(unit => {
      (unit.weeks || []).forEach((week: any) => {
        (week.slides || []).forEach((slide: any) => {
          slides.push({
            ...slide,
            weekNumber: week.number,
            weekTopic: week.topic,
            unitName: unit.name
          });
        });
      });
    });
    return slides;
  }, [units]);

  // Filtrar diapositivas por búsqueda
  const filteredSlides = useMemo(() => {
    if (!searchTerm) return allSlides;
    
    const searchLower = searchTerm.toLowerCase();
    return allSlides.filter(slide =>
      slide.title.toLowerCase().includes(searchLower) ||
      slide.description?.toLowerCase().includes(searchLower) ||
      slide.unitName.toLowerCase().includes(searchLower) ||
      slide.weekTopic?.toLowerCase().includes(searchLower)
    );
  }, [allSlides, searchTerm]);

  // Obtener la diapositiva seleccionada
  const selectedSlideData = useMemo(() => {
    if (!selectedSlide) return null;
    
    for (const unit of units) {
      for (const week of unit.weeks || []) {
        const slides = week.slides || [];
        const slide = slides.find((s: any) => s.id === selectedSlide);
        if (slide) return { slide, week, unit };
      }
    }
    return null;
  }, [selectedSlide, units]);

  // Agregar a recientemente vistos
  useEffect(() => {
    if (selectedSlideData?.slide) {
      const slide = selectedSlideData.slide;
      const recent = { 
        id: slide.id, 
        title: slide.title, 
        unit: selectedSlideData.unit.name,
        week: selectedSlideData.week.number,
        timestamp: new Date().toISOString()
      };
      
      setRecentlyViewed(prev => {
        const filtered = prev.filter(s => s.id !== slide.id);
        return [recent, ...filtered].slice(0, 5);
      });
    }
  }, [selectedSlideData]);

  // Procesar URLs de Canva
  const getCanvaEmbedUrl = (canvaUrl: string): string => {
    try {
      if (!canvaUrl || typeof canvaUrl !== 'string') return '';
      
      const cleanUrl = canvaUrl.trim().replace(/\s+/g, '');
      if (!cleanUrl) return '';
      
      if (cleanUrl.includes('?embed')) return cleanUrl;
      
      if (cleanUrl.includes('canva.com/design/') && cleanUrl.includes('/view')) {
        return cleanUrl.includes('?') 
          ? cleanUrl.replace('/view?', '/view?embed&')
          : cleanUrl + '?embed';
      }
      
      if (cleanUrl.includes('canva.com/design/')) {
        const designMatch = cleanUrl.match(/canva\.com\/design\/([^\/\?]+)/);
        if (designMatch?.[1]) {
          return `https://www.canva.com/design/${designMatch[1]}/view?embed`;
        }
      }
      
      return cleanUrl;
    } catch {
      return '';
    }
  };

  const getCanvaNormalUrl = (canvaUrl: string): string => {
    try {
      if (!canvaUrl) return '';
      return canvaUrl.includes('?embed') 
        ? canvaUrl.replace('?embed', '')
        : canvaUrl;
    } catch {
      return canvaUrl || '';
    }
  };

  const getCanvaDesignId = (canvaUrl: string): string | null => {
    try {
      const match = canvaUrl?.match(/\/design\/([A-Za-z0-9_-]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  };

  const isValidUrl = (urlString: string): boolean => {
    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  // Funciones CRUD
  const handleCreateUnit = async () => {
    if (!selectedCourseId) return;

    try {
      await unitService.create({
        ...unitForm,
        courseId: selectedCourseId
      });
      setShowUnitModal(false);
      setUnitForm({ name: '', description: '', order: 0 });
      await loadUnits();
    } catch {
      // Error silencioso
    }
  };

  const handleCreateWeek = async () => {
    if (!weekForm.unitId) return;

    try {
      await weekService.create(weekForm);
      setShowWeekModal(false);
      setWeekForm({ number: 1, topic: '', unitId: '' });
      await loadUnits();
    } catch {
      // Error silencioso
    }
  };

  const handleCreateSlide = async () => {
    if (!slideForm.weekId) return;

    try {
      await slideService.create(slideForm);
      setShowSlideModal(false);
      setSlideForm({ 
        title: '', 
        description: '', 
        canvaUrl: '', 
        weekId: '', 
        order: 0 
      });
      await loadUnits();
    } catch {
      // Error silencioso
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta unidad y todo su contenido?')) return;
    
    try {
      await unitService.delete(unitId);
      await loadUnits();
    } catch {
      // Error silencioso
    }
  };

  const handleDeleteWeek = async (weekId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta semana y todas sus diapositivas?')) return;

    try {
      await weekService.delete(weekId);
      await loadUnits();
    } catch {
      // Error silencioso
    }
  };

  const handleDeleteSlide = async (slideId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta diapositiva?')) return;

    try {
      await slideService.delete(slideId);
      await loadUnits();
      if (selectedSlide === slideId) setSelectedSlide(null);
    } catch {
      // Error silencioso
    }
  };

  // Alternar pantalla completa
  const toggleFullscreen = () => {
    const embedContainer = document.getElementById('canva-embed-container');
    if (embedContainer) {
      if (!document.fullscreenElement) {
        embedContainer.requestFullscreen().then(() => {
          setIsFullscreen(true);
        });
      } else {
        document.exitFullscreen().then(() => {
          setIsFullscreen(false);
        });
      }
    }
  };

  // Escuchar cambios en pantalla completa
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const embedUrl = selectedSlideData ? getCanvaEmbedUrl(selectedSlideData.slide.canvaUrl) : '';
  const hasValidEmbedUrl = embedUrl && isValidUrl(embedUrl);

  // Loading state
  if (loading && selectedCourseId) {
    return (
      <DashboardLayout title="Slides" subtitle="Class materials and presentations">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
            <div className="space-y-2">
              <p className="text-lg font-semibold text-gray-900">Loading slides</p>
              <p className="text-sm text-gray-500">
                Preparing your study materials
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return ( 
    <DashboardLayout
      title="Slides & Materials"
      subtitle="Study materials and class presentations"
    >
      <div className="space-y-6">














           {/* Course selector */}
       <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex-1 flex flex-col sm:flex-row gap-4">

                    {/* Barra de búsqueda */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search slides, topics, units..."
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              {/* Selector de curso al lado */}
              <div className="relative min-w-[180px]">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                  <School className="h-5 w-5 text-gray-400" />
                </div>
                <select
                  value={selectedCourseId}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium appearance-none cursor-pointer"
                >
                  {userCourses.length === 0 ? (
                    <option value="">No courses available</option>
                  ) : (
                    <>
                      <option value="">Select a course...</option>
                      {userCourses
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(course => (
                          <option key={course.id} value={course.id}>
                            {course.code}
                          </option> 
                        ))
                      }
                    </>
                  )}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>

        
            </div>

            {/* Botones de acción para profesores */}
            {isTeacher && selectedCourseId && (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowUnitModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Add Unit
                </button>
              </div>
            )}
          </div>

          {/* Mostrar conteo de resultados de búsqueda */}
          {searchTerm && filteredSlides.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-blue-600">
                    Found {filteredSlides.length} slide{filteredSlides.length !== 1 ? 's' : ''}
                  </span>
                  {selectedSlideData && (
                    <span className="text-xs text-gray-500">
                      • Currently viewing: {selectedSlideData.slide.title}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setSearchTerm('')}
                  className="text-sm text-gray-600 hover:text-gray-800 font-medium"
                >
                  Clear search
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Resto del código se mantiene igual desde aquí */}
        {!selectedCourseId && userCourses.length === 0 && (
          <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-8 text-center shadow-sm">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <Presentation className="h-10 w-10 text-gray-400" />
            </div>
            <h3 className="font-bold text-xl mb-3 text-gray-900">No courses available</h3>
            <p className="text-gray-500 max-w-md mx-auto mb-6">
              {isTeacher 
                ? 'You have no courses assigned as a teacher. Contact the administrator.' 
                : 'You are not enrolled in any course. Contact your teacher.'}
            </p>
            {isTeacher && (
              <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium hover:shadow-lg transition-all duration-300">
                <Plus className="h-4 w-4" />
                Request Course Assignment
              </button>
            )}
          </div>
        )}

        {selectedCourseId && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Units/Weeks sidebar - ELIMINAR la barra de búsqueda duplicada */}
            <div className="lg:col-span-1">
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                      <FolderOpen className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">Course Content</h3>
                      <p className="text-sm text-gray-500 mt-1">{selectedCourse?.name}</p>
                    </div>
                  </div>
                 
                </div>

                {/* Recently viewed (solo para estudiantes) */}
                {!isTeacher && recentlyViewed.length > 0 && (
                  <div className="mb-5 hidden sm:block">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-500" />
                      Recently Viewed
                    </h4>
                    <div className="space-y-2">
                      {recentlyViewed.slice(0, 3).map(slide => (
                        <button
                          key={slide.id}
                          onClick={() => setSelectedSlide(slide.id)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 hover:border-amber-200 transition-all duration-300 group"
                        >
                          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                            <Eye className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex-1 text-left">
                            <p className="text-xs font-semibold text-gray-900 truncate">{slide.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">Unit {slide.unit}</span>
                              <span className="text-xs text-gray-500">•</span>
                              <span className="text-xs text-gray-500">Week {slide.week}</span>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-amber-400 group-hover:translate-x-1 transition-transform" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}


























    {/* Content list */}
    <div className=" pr-2">
      {units.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <FolderOpen className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">No content available</p>
          {isTeacher && (
            <button
              onClick={() => setShowUnitModal(true)}
              className="inline-flex items-center gap-2 mt-4 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
            >
              <Plus className="h-4 w-4" />
              Create first unit
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {units
            .sort((a: any, b: any) => {
              return new Date(b.createdAt || b.id).getTime() - new Date(a.createdAt || a.id).getTime();
            })
            .map(unit => (
              <div key={unit.id} className="border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-all duration-300 hover:shadow-sm">
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-white hover:from-gray-100 transition-all duration-300">
                  <button
                    onClick={() => toggleUnit(unit.id)}
                    className="flex-1 flex items-center justify-between text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <BookOpen className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <span className="font-semibold text-sm block text-left text-gray-900">{unit.name}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-1.5 py-0.5 bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-700 rounded">
                            {(unit.weeks || []).length} weeks
                          </span>
                          <span className="text-xs text-gray-500">
                            • {((unit.weeks || []).reduce((acc: number, week: any) => acc + (week.slides?.length || 0), 0))} slides
                          </span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 text-gray-400 transition-transform duration-300',
                        expandedUnits.includes(unit.id) && 'rotate-90'
                      )}
                    />
                  </button>
                  {isTeacher && (
                    <div className="flex gap-1 ml-3">
                      <button
                        onClick={() => {
                          setWeekForm({ 
                            number: (unit.weeks || []).length + 1, 
                            topic: '', 
                            unitId: unit.id 
                          });
                          setShowWeekModal(true);
                        }}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors hover:scale-110"
                        title="Add week"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUnit(unit.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors hover:scale-110"
                        title="Delete unit"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {expandedUnits.includes(unit.id) && (
                  <div className="border-t border-gray-200 bg-gray-50/30 p-3 space-y-2">
                    {(unit.weeks || []).length === 0 ? (
                      <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-100">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <p className="text-xs text-gray-500">No weeks available</p>
                        {isTeacher && (
                          <button
                            onClick={() => {
                              setWeekForm({ 
                                number: 1, 
                                topic: '', 
                                unitId: unit.id 
                              });
                              setShowWeekModal(true);
                            }}
                            className="ml-auto p-1 text-green-600 hover:bg-green-50 rounded transition-colors hover:scale-110"
                            title="Add week"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ) : (
                      (unit.weeks || [])
                        .sort((a: any, b: any) => b.number - a.number)
                        .map((week: any) => (
                          <div key={week.id} className="space-y-1.5">
                            {/* Week header */}
                            <div className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleWeek(week.id)}
                                  className="flex items-center gap-2 hover:text-purple-600 transition-colors group"
                                >
                                  <ChevronRight
                                    className={cn(
                                      'h-3 w-3 text-gray-400 transition-transform duration-300',
                                      expandedWeeks.includes(week.id) && 'rotate-90'
                                    )}
                                  />
                                  <Calendar className="h-3 w-3 text-gray-400 group-hover:text-purple-500" />
                                </button>
                                <div className="text-left">
                                  <p className="text-xs font-semibold text-gray-900">
                                    Week {week.number}
                                  </p>
                                  <p className="text-xs text-gray-500 truncate max-w-[140px]">
                                    {week.topic}
                                  </p>
                                </div>
                              </div>
                              {isTeacher && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => {
                                      setSlideForm({ 
                                        title: '', 
                                        description: '', 
                                        canvaUrl: '', 
                                        weekId: week.id, 
                                        order: 0 
                                      });
                                      setShowSlideModal(true);
                                    }}
                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors hover:scale-110"
                                    title="Add slide"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteWeek(week.id)}
                                    className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors hover:scale-110"
                                    title="Delete week"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                            
                            {/* Week slides */}
                            {expandedWeeks.includes(week.id) && (
                              <div className="pl-6 border-l border-gray-200 space-y-1.5">
                                {(week.slides || []).length === 0 ? (
                                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                                    <FileText className="h-3 w-3 text-gray-400" />
                                    <p className="text-xs text-gray-500">No slides available</p>
                                    {isTeacher && (
                                      <button
                                        onClick={() => {
                                          setSlideForm({ 
                                            title: '', 
                                            description: '', 
                                            canvaUrl: '', 
                                            weekId: week.id, 
                                            order: 0 
                                          });
                                          setShowSlideModal(true);
                                        }}
                                        className="ml-auto p-1 text-gray-600 hover:bg-gray-50 rounded transition-colors hover:scale-110"
                                        title="Add slide"
                                      >
                                        <Plus className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  (week.slides || [])
                                    .sort((a: any, b: any) => b.order - a.order)
                                    .map((slide: any) => (
                                      <div key={slide.id} className="flex items-center gap-2 bg-white rounded-lg border border-gray-100 hover:border-blue-200 transition-all duration-300 group">
                                        <button
                                          onClick={() => setSelectedSlide(slide.id)}
                                          className={cn(
                                            'flex-1 flex items-center gap-3 px-3 py-2 rounded-l-lg text-left transition-all duration-300',
                                            selectedSlide === slide.id
                                              ? 'bg-gradient-to-r from-blue-50 to-cyan-50 border-r-2 border-blue-500'
                                              : 'hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-cyan-50/50'
                                          )}
                                        >
                                          <Presentation className={cn(
                                            'h-4 w-4 shrink-0 transition-colors',
                                            selectedSlide === slide.id ? 'text-blue-600' : 'text-gray-600 group-hover:text-blue-500'
                                          )} />
                                          <div className="flex-1 min-w-0">
                                            <span className="text-xs font-medium text-gray-900 truncate block">{slide.title}</span>
                                            {slide.description && (
                                              <p className="text-xs text-gray-500 truncate mt-0.5">{slide.description}</p>
                                            )}
                                          </div>
                                        </button>
                                        {isTeacher && (
                                          <button
                                            onClick={() => handleDeleteSlide(slide.id)}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-r-lg transition-colors hover:scale-110"
                                            title="Delete slide"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        )}
                                      </div>
                                    ))
                                )}
                              </div>
                            )}
                          </div>
                        ))
                    )}
                  </div>
                )}
              </div>
          ))}
        </div>
      )}
    </div>
  </div>
</div>

            {/* Slide viewer */}
            <div className="lg:col-span-2">
              {selectedSlideData ? (
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b bg-gradient-to-r from-gray-50 to-white">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xs px-2.5 py-1 bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 rounded-full font-medium">
                            {selectedSlideData.unit.name}
                          </span>
                          <span className="text-xs px-2.5 py-1 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 rounded-full font-medium">
                            Week {selectedSlideData.week.number}
                          </span>
                          {selectedSlideData.week.topic && (
                            <span className="text-xs text-gray-500 hidden sm:block">
                              • {selectedSlideData.week.topic}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-xl text-gray-900 mb-2">
                          {selectedSlideData.slide.title}
                        </h3>
                        {selectedSlideData.slide.description && (
                          <p className="text-sm text-gray-600 mb-3">
                            {selectedSlideData.slide.description}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <a
                          href={getCanvaNormalUrl(selectedSlideData.slide.canvaUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                          title="View in Canva"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open in Canva
                        </a>
                        {hasValidEmbedUrl && (
                          <button
                            onClick={toggleFullscreen}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 hover:shadow-md transition-all duration-300 font-medium"
                            title="Fullscreen"
                          >
                            <Maximize2 className="h-4 w-4" />
                            Fullscreen
                          </button>
                        )}
                   
                      </div>
                    </div>
                  </div>

                  {/* Canva embed */}
                  <div className="p-6">
                    {hasValidEmbedUrl ? (
                      <div 
                        id="canva-embed-container"
                        className={cn(
                          "relative rounded-xl overflow-hidden border-2 border-gray-200 shadow-xl transition-all duration-300 bg-white",
                          isFullscreen ? "fixed inset-0 z-50" : "aspect-video"
                        )}
                      >
                        <div className="absolute top-4 left-4 z-10">
                          <div className="flex items-center gap-2 bg-black/70 text-white px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm">
                            <Play className="h-3 w-3" />
                            Presentation Mode
                          </div>
                        </div>
                        
                        <div 
                          className={cn(
                            "w-full h-full",
                            isFullscreen ? "" : "relative pb-[56.25%]"
                          )}
                        >
                          <iframe
                            loading="lazy"
                            className={cn(
                              "absolute top-0 left-0 w-full h-full border-0",
                              isFullscreen ? "" : "rounded-xl"
                            )}
                            src={embedUrl}
                            title={selectedSlideData.slide.title}
                            allowFullScreen
                            allow="fullscreen"
                            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        
                        {isFullscreen && (
                          <div className="absolute top-4 right-4 z-10 flex gap-2">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(selectedSlideData.slide.canvaUrl);
                                alert('Link copied to clipboard!');
                              }}
                              className="p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors backdrop-blur-sm"
                              title="Copy link"
                            >
                              <Copy className="h-5 w-5" />
                            </button>
                            <button
                              onClick={toggleFullscreen}
                              className="p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors backdrop-blur-sm"
                              title="Exit fullscreen"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="aspect-video bg-gradient-to-br from-gray-50 to-white rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300">
                        <div className="text-center p-6 max-w-md">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-red-100 to-pink-100 flex items-center justify-center">
                            <AlertTriangle className="h-8 w-8 text-red-400" />
                          </div>
                          <h4 className="font-semibold text-lg mb-2 text-gray-900">
                            Preview Unavailable
                          </h4>
                          <p className="text-gray-500 mb-4">
                            The Canva URL is invalid or cannot be embedded.
                          </p>
                          <a
                            href={selectedSlideData.slide.canvaUrl || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium hover:shadow-lg transition-all duration-300"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Try Opening Directly
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Slide info panel */}
                    <div className="mt-6 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-100 p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                            <LinkIcon className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500">Canva Link</p>
                            <a
                              href={selectedSlideData.slide.canvaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-blue-600 hover:text-blue-700 truncate block max-w-[200px]"
                            >
                              View on Canva
                            </a>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                            <Calendar className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500">Week Info</p>
                            <p className="text-sm font-medium text-gray-900">
                              Week {selectedSlideData.week.number} • {selectedSlideData.unit.name}
                            </p>
                          </div>
                        </div>
                        
                      
                      </div>
                    </div>

                    {/* Navigation tips */}
                    {hasValidEmbedUrl && (
                      <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
                        <h4 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          Navigation Tips
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="flex items-start gap-2 p-2 bg-white/50 rounded-lg">
                            <div className="h-6 w-6 rounded bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs flex items-center justify-center font-bold">
                              1
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-900">Arrow Keys</p>
                              <p className="text-xs text-gray-600">Navigate between slides</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2 p-2 bg-white/50 rounded-lg">
                            <div className="h-6 w-6 rounded bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs flex items-center justify-center font-bold">
                              2
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-900">Spacebar</p>
                              <p className="text-xs text-gray-600">Play/pause presentation</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2 p-2 bg-white/50 rounded-lg">
                            <div className="h-6 w-6 rounded bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs flex items-center justify-center font-bold">
                              3
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-900">Fullscreen</p>
                              <p className="text-xs text-gray-600">Best viewing experience</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-4 text-center shadow-sm">
                  
                  <h3 className="font-bold text-2xl mb-2 text-gray-900">
                    Select a Slide to View
                  </h3>
                  <p className="text-gray-500 max-w-md mx-auto mb-8">
                    Choose a presentation from the sidebar to preview it here. 
                    All your course materials in one place.
                  </p>
                  
                  {/* Quick access grid */}
                  {filteredSlides.length > 0 && (
                    <div className="max-w-2xl mx-auto">
                      <h4 className="font-semibold text-gray-700 mb-4 text-left flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-500" />
                        Choose one 
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {filteredSlides.slice(0, 4).map(slide => (
                          <button
                            key={slide.id}
                            onClick={() => setSelectedSlide(slide.id)}
                            className="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-200 hover:border-blue-200 hover:shadow-md transition-all duration-300 group text-left"
                          >
                            
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate text-sm">{slide.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs px-1.5 py-0.5 bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 rounded">
                                  {slide.unitName}
                                </span>
                                <span className="text-xs text-gray-500">Week {slide.weekNumber}</span>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Empty state tips */}
                  {filteredSlides.length === 0 && allSlides.length === 0 && (
                    <div className="mt-6">
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full">
                        <Sparkles className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-600">
                          No slides available yet. {isTeacher ? 'Start by creating a unit!' : 'Check back soon!'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}


















        {/* Unit Modal */}
        {showUnitModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
              <div className="p-6 border-b bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">Create New Unit</h3>
                      <p className="text-sm text-gray-500">Add a new unit to organize your content</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowUnitModal(false);
                      setUnitForm({ name: '', description: '', order: 0 });
                    }}
                    className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Unit Name *</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      value={unitForm.name}
                      onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                      placeholder="Unit name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <textarea
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={unitForm.description}
                      onChange={(e) => setUnitForm({ ...unitForm, description: e.target.value })}
                      rows={3}
                      placeholder="Optional description"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setShowUnitModal(false)}
                      className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateUnit}
                      disabled={!unitForm.name.trim()}
                      className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg disabled:opacity-50 font-medium transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      <Save className="h-4 w-4" />
                      Create Unit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Week Modal */}
        {showWeekModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
              <div className="p-6 border-b bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">Add New Week</h3>
                      <p className="text-sm text-gray-500">Organize slides by week</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowWeekModal(false);
                      setWeekForm({ number: 1, topic: '', unitId: '' });
                    }}
                    className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Week Topic *</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      value={weekForm.topic}
                      onChange={(e) => setWeekForm({ ...weekForm, topic: e.target.value })}
                      placeholder="Week topic"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setShowWeekModal(false)}
                      className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateWeek}
                      disabled={!weekForm.topic.trim()}
                      className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-lg disabled:opacity-50 font-medium transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      <Save className="h-4 w-4" />
                      Add Week
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Slide Modal */}
        {showSlideModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
              <div className="p-6 border-b bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-100 to-blue-100 flex items-center justify-center">
                      <Presentation className="h-5 w-5 text-cyan-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">Add New Slide</h3>
                      <p className="text-sm text-gray-500">Share a Canva presentation</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowSlideModal(false);
                      setSlideForm({ 
                        title: '', 
                        description: '', 
                        canvaUrl: '', 
                        weekId: '', 
                        order: 0 
                      });
                    }}
                    className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Slide Title *</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      value={slideForm.title}
                      onChange={(e) => setSlideForm({ ...slideForm, title: e.target.value })}
                      placeholder="Slide title"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Canva URL *
                      <span className="ml-2 text-xs text-gray-500">(Paste the Canva presentation link)</span>
                    </label>
                    <input
                      type="url"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      value={slideForm.canvaUrl}
                      onChange={(e) => setSlideForm({ ...slideForm, canvaUrl: e.target.value })}
                      placeholder="https://canva.com/design/..."
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Tip: Use the "Share" button in Canva and copy the "View" link
                    </p>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setShowSlideModal(false)}
                      className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-all duration-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateSlide}
                      disabled={!slideForm.title.trim() || !slideForm.canvaUrl.trim()}
                      className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:shadow-lg disabled:opacity-50 font-medium transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      <Save className="h-4 w-4" />
                      Add Slide
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}