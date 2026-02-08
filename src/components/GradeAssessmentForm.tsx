// src/components/GradeAssessmentForm.tsx
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { assessmentService } from '@/lib/services/assessmentService';


interface GradeAssessmentFormProps {
  assessmentId: string;
  studentId: string;
  courseId: string;
  existingGrade?: number;
  existingComments?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function GradeAssessmentForm({ 
  assessmentId, 
  studentId, 
  courseId, 
  existingGrade = 0,
  existingComments = '',
  onSuccess,
  onCancel 
}: GradeAssessmentFormProps) {
  const { user } = useAuth();
  const [grade, setGrade] = useState(existingGrade.toString());
  const [comments, setComments] = useState(existingComments);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setGrade(existingGrade.toString());
    setComments(existingComments);
  }, [existingGrade, existingComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    const gradeValue = parseFloat(grade);
    
    if (isNaN(gradeValue)) {
      setError('Por favor ingresa una calificación válida');
      setLoading(false);
      return;
    }
    
    if (gradeValue < 0) {
      setError('La calificación no puede ser negativa');
      setLoading(false);
      return;
    }
    
    try {
      if (!user) throw new Error('Usuario no autenticado');
      
      await assessmentService.gradeAssessment({
        assessmentId,
        studentId,
        courseId,
        value: gradeValue,
        comments,
        gradedBy: user.id
      });
      
      alert('Calificación guardada exitosamente');
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Error:', error);
      setError(error.message || 'Error al guardar la calificación');
    } finally {
      setLoading(false);
    }
  };

  const getGradeColor = (grade: string) => {
    const numGrade = parseFloat(grade);
    if (isNaN(numGrade)) return '';
    
    if (numGrade >= 4.0) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (numGrade >= 3.5) return 'text-blue-700 bg-blue-50 border-blue-200';
    if (numGrade >= 3.0) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-red-700 bg-red-50 border-red-200';
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Calificar Evaluación</h3>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Calificación (0.0 - 5.0)
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0"
              max="5"
              required
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${getGradeColor(grade)}`}
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="Ej: 4.5"
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500">
              / 5.0
            </div>
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs text-gray-500">Mínimo: 0.0</span>
            <span className="text-xs text-gray-500">Máximo: 5.0</span>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Comentarios
          </label>
          <textarea
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Escribe comentarios sobre la calificación..."
          />
        </div>
      </div>
      
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
            disabled={loading}
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
              Guardando...
            </>
          ) : existingGrade > 0 ? 'Actualizar Calificación' : 'Guardar Calificación'}
        </button>
      </div>
    </form>
  );
}