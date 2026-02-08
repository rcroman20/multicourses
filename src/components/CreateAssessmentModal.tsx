// Reemplaza el componente CreateAssessmentModal con esta versión mejorada
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademic } from '@/contexts/AcademicContext';
import { gradeSheetService } from '@/lib/services/gradeSheetService';
import { X, Plus, Calendar, AlertCircle } from 'lucide-react';


function CreateAssessmentModal({ courseId, onSubmit, onClose }: any) {
  const { user } = useAuth();
  const { courses } = useAcademic();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'exam',
    percentage: '',
    maxPoints: '', 
    passingScore: '',
    dueDate: '',
    courseId: courseId || '',
    gradeSheetId: ''
  });

  const [gradeSheets, setGradeSheets] = useState<any[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [errorSheets, setErrorSheets] = useState('');

  // Cargar hojas de calificación cuando se selecciona un curso
  useEffect(() => {
    const loadGradeSheets = async () => {
      if (!formData.courseId) {
        setGradeSheets([]);
        setErrorSheets('');
        return;
      }

      setLoadingSheets(true);
      setErrorSheets('');
      
      try {
        // Usar el servicio real para obtener hojas de calificación
        const sheets = await gradeSheetService.getByCourse(formData.courseId);
        setGradeSheets(sheets);
        
        if (sheets.length === 0) {
          setErrorSheets('No hay hojas de calificación disponibles para este curso.');
        }
      } catch (error: any) {
        console.error('Error cargando hojas de calificación:', error);
        setErrorSheets(`Error al cargar hojas de calificación: ${error.message}`);
        setGradeSheets([]);
      } finally {
        setLoadingSheets(false);
      }
    };

    // Esperar 300ms antes de cargar para evitar demasiadas llamadas
    const timer = setTimeout(() => {
      loadGradeSheets();
    }, 300);

    return () => clearTimeout(timer);
  }, [formData.courseId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar que se haya seleccionado una hoja de calificación
    if (!formData.gradeSheetId && gradeSheets.length > 0) {
      alert('Por favor selecciona una hoja de calificación');
      return;
    }
    
    onSubmit(formData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Si cambia el curso, resetear la hoja de calificación seleccionada
    if (name === 'courseId') {
      setFormData(prev => ({
        ...prev,
        [name]: value,
        gradeSheetId: '' // Resetear la selección cuando cambia el curso
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  // Función para obtener la fecha actual en Colombia (UTC-5)
  const getCurrentDateInColombia = () => {
    const now = new Date();
    // Ajustar a UTC-5 (Colombia)
    const colombiaOffset = -5 * 60; // -5 horas en minutos
    const localOffset = now.getTimezoneOffset();
    const colombiaTime = new Date(now.getTime() + (localOffset - colombiaOffset) * 60000);
    
    return colombiaTime.toISOString().split('T')[0];
  };

  // Obtener fecha mínima (hoy) y máxima (1 año desde hoy) para Colombia
  const getMinDate = () => {
    return getCurrentDateInColombia();
  };

  const getMaxDate = () => {
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(today.getFullYear() + 1);
    
    // Ajustar a UTC-5
    const colombiaOffset = -5 * 60;
    const localOffset = nextYear.getTimezoneOffset();
    const colombiaTime = new Date(nextYear.getTime() + (localOffset - colombiaOffset) * 60000);
    
    return colombiaTime.toISOString().split('T')[0];
  };

  // Función para crear una nueva hoja de calificación rápidamente
  const handleCreateNewSheet = async () => {
    if (!formData.courseId || !user) {
      alert('Primero selecciona un curso');
      return;
    }

    const course = courses.find(c => c.id === formData.courseId);
    if (!course) return;

    try {
      const sheetName = prompt('Ingresa el nombre de la nueva hoja de calificación:');
      if (!sheetName) return;

      const gradingPeriod = prompt(
        'Selecciona el período de calificación:\n1. quarter1\n2. quarter2\n3. quarter3\n4. quarter4\n5. semester1\n6. semester2\n7. final',
        'quarter1'
      );

      const newSheet = {
        title: sheetName,
        courseId: formData.courseId,
        courseName: course.name,
        gradingPeriod: (gradingPeriod as any) || '1st Term',
        activities: [],
        teacherId: user.id,
        teacherName: user.name || 'Docente',
        isPublished: true,
        description: `Hoja de calificación para ${course.name}`
      };

      const sheetId = await gradeSheetService.create(newSheet);
      
      // Recargar las hojas de calificación
      const updatedSheets = await gradeSheetService.getByCourse(formData.courseId);
      setGradeSheets(updatedSheets);
      
      // Seleccionar automáticamente la nueva hoja
      setFormData(prev => ({
        ...prev,
        gradeSheetId: sheetId
      }));
      
      alert('Hoja de calificación creada exitosamente');
    } catch (error) {
      console.error('Error creando hoja de calificación:', error);
      alert('Error al crear la hoja de calificación');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Nueva Evaluación</h3>
            <p className="text-gray-600">Crea una nueva evaluación para el curso</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Nombre de la actividad */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre de la actividad *
              </label>
              <input
                type="text"
                name="name"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Ej: Examen Parcial 1 - Gramática"
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción
              </label>
              <textarea
                name="description"
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Describe los objetivos, contenido y criterios de evaluación..."
                value={formData.description}
                onChange={handleChange}
              />
            </div>

            {/* Curso - Solo mostrar si no viene predeterminado */}
            {!courseId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Curso *
                </label>
                <select
                  name="courseId"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors"
                  value={formData.courseId}
                  onChange={handleChange}
                >
                  <option value="">Selecciona un curso</option>
                  {courses.map(course => (
                    <option key={course.id} value={course.id}>
                      {course.name} ({course.code}) - {course.semester}° Semestre
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Hoja de calificación */}
            <div>
                
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hoja de calificación *
              </label>
              <div className="space-y-3">
                <div className="relative">
                  <select
                    name="gradeSheetId"
                    required={gradeSheets.length > 0}
                    disabled={loadingSheets || !formData.courseId}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                    value={formData.gradeSheetId}
                    onChange={handleChange}
                  >
                    <option value="">
                      {loadingSheets 
                        ? 'Cargando hojas de calificación...' 
                        : !formData.courseId 
                          ? 'Primero selecciona un curso' 
                          : gradeSheets.length === 0
                            ? 'No hay hojas disponibles'
                            : 'Selecciona una hoja de calificación'}
                    </option>
                    {gradeSheets.map(sheet => (
                      <option key={sheet.id} value={sheet.id}>
                        {sheet.title} - {sheet.gradingPeriod} {sheet.isPublished ? '✅' : '📝'}
                      </option>
                    ))}
                  </select>
                  {loadingSheets && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                </div>
                
                {/* Información y acciones */}
                <div className="flex flex-col gap-2">
                  {errorSheets && !loadingSheets && (
                    <p className="text-sm text-amber-600">{errorSheets}</p>
                  )}
                  
                  {formData.courseId && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">
                        {gradeSheets.length} hoja(s) disponible(s)
                      </span>
                      <button
                        type="button"
                        onClick={handleCreateNewSheet}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        Crear nueva hoja
                      </button>
                    </div>
                  )}
                  
                  {/* Vista previa de la hoja seleccionada */}
                  {formData.gradeSheetId && gradeSheets.length > 0 && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-blue-800">
                            {gradeSheets.find(s => s.id === formData.gradeSheetId)?.title}
                          </p>
                          <p className="text-xs text-blue-600">
                            Período: {gradeSheets.find(s => s.id === formData.gradeSheetId)?.gradingPeriod}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${gradeSheets.find(s => s.id === formData.gradeSheetId)?.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {gradeSheets.find(s => s.id === formData.gradeSheetId)?.isPublished ? 'Publicada' : 'Borrador'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tipo y porcentaje */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de evaluación *
                </label>
                <select
                  name="type"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors"
                  value={formData.type}
                  onChange={handleChange}
                >
                  <option value="exam">Examen</option>
                  <option value="quiz">Quiz</option>
                  <option value="homework">Tarea / Homework</option>
                  <option value="project">Proyecto</option>
                  <option value="participation">Participación</option>
                  <option value="presentation">Presentación</option>
                  <option value="workshop">Taller / Workshop</option>
                  <option value="essay">Ensayo</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Porcentaje del curso *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    name="percentage"
                    required
                    min="0.1"
                    max="100"
                    step="0.1"
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="20"
                    value={formData.percentage}
                    onChange={handleChange}
                  />
                  <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Peso de esta evaluación en la calificación final
                </p>
              </div>
            </div>

            {/* Puntos y fecha */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Puntos máximos *
                </label>
                <input
                  type="number"
                  name="maxPoints"
                  required
                  min="1"
                  max="1000"
                  step="0.1"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="100"
                  value={formData.maxPoints}
                  onChange={handleChange}
                />
                <p className="mt-1 text-xs text-gray-500">Escala de calificación</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Puntos para aprobar *
                </label>
                <input
                  type="number"
                  name="passingScore"
                  required
                  min="0"
                  step="0.1"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="70"
                  value={formData.passingScore}
                  onChange={handleChange}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {formData.maxPoints && formData.passingScore ? 
                    `(${((parseFloat(formData.passingScore) / parseFloat(formData.maxPoints)) * 100).toFixed(1)}%)` : 
                    ''}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha límite (Colombia) *
                </label>
                <div className="relative">
                  <input
                    type="date"
                    name="dueDate"
                    required
                    min={getMinDate()}
                    max={getMaxDate()}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    value={formData.dueDate}
                    onChange={handleChange}
                  />
                  <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Hora: 23:59 (UTC-5)
                </p>
              </div>
            </div>

            {/* Información adicional */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-800 mb-2 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Configuración adicional
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="allowLateSubmission"
                    name="allowLateSubmission"
                    className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="allowLateSubmission" className="text-sm text-blue-700">
                    Permitir entrega tardía
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="requireAttachment"
                    name="requireAttachment"
                    className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="requireAttachment" className="text-sm text-blue-700">
                    Requerir archivo adjunto
                  </label>
                </div>
              </div>
            </div>

            // En el componente CreateAssessmentModal, añade esto después de las columnas que ya tienes:

{/* Fecha de entrega */}
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Fecha de entrega
  </label>
  <input
    type="date"
    name="dueDate"
    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
    value={formData.dueDate}
    onChange={handleChange}
    min={getMinDate()}
    max={getMaxDate()}
  />
  <p className="text-xs text-gray-500 mt-1">
    Fecha límite para la entrega de la evaluación
  </p>
</div>

{/* Puntos y porcentaje - Agregar inputs faltantes */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      Porcentaje *
    </label>
    <input
      type="number"
      name="percentage"
      required
      min="0"
      max="100"
      step="0.1"
      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
      placeholder="Ej: 25.5"
      value={formData.percentage}
      onChange={handleChange}
    />
    <p className="text-xs text-gray-500 mt-1">% del curso total</p>
  </div>

  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      Puntos máximos *
    </label>
    <input
      type="number"
      name="maxPoints"
      required
      min="0"
      step="0.1"
      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
      placeholder="Ej: 100"
      value={formData.maxPoints}
      onChange={handleChange}
    />
  </div>

  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      Puntos para aprobar *
    </label>
    <input
      type="number"
      name="passingScore"
      required
      min="0"
      step="0.1"
      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
      placeholder="Ej: 60"
      value={formData.passingScore}
      onChange={handleChange}
    />
  </div>
</div>

            {/* Vista previa */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-800 mb-3">Vista previa</h4>
              <div className="space-y-2 text-sm">
                <div className="flex">
                  <span className="w-32 text-gray-600">Actividad:</span>
                  <span className="font-medium">{formData.name || '[Nombre de la actividad]'}</span>
                </div>
                <div className="flex">
                  <span className="w-32 text-gray-600">Porcentaje:</span>
                  <span className="font-medium">{formData.percentage || '0'}% del curso</span>
                </div>
                <div className="flex">
                  <span className="w-32 text-gray-600">Fecha límite:</span>
                  <span className="font-medium">
                    {formData.dueDate ? 
                      new Date(formData.dueDate).toLocaleDateString('es-CO', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      }) : 
                      '[Selecciona fecha]'}
                  </span>
                </div>
                {formData.gradeSheetId && (
                  <div className="flex">
                    <span className="w-32 text-gray-600">Hoja de calificación:</span>
                    <span className="font-medium">
                      {gradeSheets.find(s => s.id === formData.gradeSheetId)?.title || '[No seleccionada]'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          

          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loadingSheets}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Crear Evaluación
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}