// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { firebaseAuth, firebaseDB } from '@/lib/firebase';

// Solo dos roles: docente y estudiante
export type UserRole = 'docente' | 'estudiante';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Cargar información adicional del usuario desde Firestore
  const loadUserData = async (firebaseUser: FirebaseUser): Promise<User> => {
    try {
      // Buscar en colección de usuarios
      const userDoc = await getDoc(doc(firebaseDB, 'usuarios', firebaseUser.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        return {
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: userData.name || firebaseUser.displayName || 'Usuario',
          // Solo docente o estudiante, por defecto estudiante
          role: userData.role === 'docente' ? 'docente' : 'estudiante',
          createdAt: userData.createdAt?.toDate() || new Date(),
        };
      }
      
      // Si no existe en usuarios, buscar en estudiantes
      const studentDoc = await getDoc(doc(firebaseDB, 'estudiantes', firebaseUser.uid));
      
      if (studentDoc.exists()) {
        const studentData = studentDoc.data();
        return {
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: studentData.name || 'Estudiante',
          role: 'estudiante',
          createdAt: studentData.createdAt?.toDate() || new Date(),
        };
      }
      
      // Usuario por defecto (estudiante)
      return {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || 'Usuario',
        role: 'estudiante',
        createdAt: new Date(),
      };
    } catch (error) {
      console.error('Error cargando datos del usuario:', error);
      return {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || 'Usuario',
        role: 'estudiante',
        createdAt: new Date(),
      };
    }
  };

  // Escuchar cambios en la autenticación
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      setIsLoading(true);
      
      if (firebaseUser) {
        try {
          const userData = await loadUserData(firebaseUser);
          setUser(userData);
        } catch (error) {
          console.error('Error procesando usuario:', error);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Iniciar sesión
  const login = async (email: string, password: string): Promise<void> => {
    try {
      setIsLoading(true);
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    } catch (error) {
      console.error('Error en login:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Cerrar sesión
  const logout = async (): Promise<void> => {
    try {
      setIsLoading(true);
      await signOut(firebaseAuth);
      setUser(null);
    } catch (error) {
      console.error('Error en logout:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useRequireAuth(requiredRole?: UserRole) {
  const { user, isAuthenticated, isLoading } = useAuth();

  const hasAccess = isAuthenticated && (!requiredRole || user?.role === requiredRole);

  return {
    user,
    isAuthenticated,
    isLoading,
    hasAccess,
    isTeacher: user?.role === 'docente',
    isStudent: user?.role === 'estudiante',
  };
}