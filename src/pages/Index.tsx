import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { GraduationCap, Loader2 } from 'lucide-react';

const Index = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated && user) {
        // Redirigir según el rol
        if (user.role === 'docente') {
          navigate('/teacher', { replace: true });
        } else {
          navigate('/student', { replace: true });
        }
      } else {
        navigate('/auth', { replace: true });
      }
    }
  }, [isAuthenticated, isLoading, user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-xl bg-primary text-primary-foreground mb-4">
          <GraduationCap className="h-8 w-8" />
        </div>
        <h1 className="mb-2 text-2xl font-bold">Multicourses</h1>
        <p className="text-muted-foreground mb-4">Academic Platform</p>
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
      </div>
    </div>
  );
};

export default Index;
