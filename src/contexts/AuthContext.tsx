// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseAuth, firebaseDB } from '@/lib/firebase';

// Solo dos roles: docente y estudiante
export type UserRole = 'docente' | 'estudiante';

export interface UserPreferences {
  notifications: boolean;
  compactSidebar: boolean;
  darkMode: boolean;
  soundEffects: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  avatarEmoji?: string;
  avatarSetupCompleted?: boolean;
  bio?: string;
  phone?: string;
  location?: string;
  website?: string;
  instagram?: string;
  preferences?: UserPreferences;
  createdAt: Date;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (
    updates: Partial<
      Pick<
        User,
        "name" | "avatarUrl" | "avatarEmoji" | "avatarSetupCompleted" | "bio" | "phone" | "location" | "website" | "instagram" | "preferences"
      >
    >,
  ) => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Cargar información adicional del usuario desde Firestore
  const loadUserData = async (firebaseUser: FirebaseUser): Promise<User> => {
    try {
      const [userDoc, studentDoc] = await Promise.all([
        getDoc(doc(firebaseDB, 'usuarios', firebaseUser.uid)),
        getDoc(doc(firebaseDB, 'estudiantes', firebaseUser.uid)),
      ]);

      const userData = userDoc.exists() ? userDoc.data() : null;
      const studentData = studentDoc.exists() ? studentDoc.data() : null;

      if (userData || studentData) {
        return {
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          name:
            userData?.name ||
            studentData?.name ||
            firebaseUser.displayName ||
            'Usuario',
          role: userData?.role === 'docente' ? 'docente' : 'estudiante',
          avatarUrl: userData?.avatarUrl || studentData?.avatarUrl || '',
          avatarEmoji: userData?.avatarEmoji || studentData?.avatarEmoji || '',
          avatarSetupCompleted:
            Boolean(userData?.avatarSetupCompleted) ||
            Boolean(studentData?.avatarSetupCompleted) ||
            Boolean((userData?.avatarUrl || studentData?.avatarUrl || '').trim()) ||
            Boolean((userData?.avatarEmoji || studentData?.avatarEmoji || '').trim()),
          bio: userData?.bio || studentData?.bio || '',
          location: userData?.location || studentData?.location || '',
          website: userData?.website || studentData?.website || '',
          instagram: userData?.instagram || studentData?.instagram || '',
          phone:
            userData?.phone ||
            userData?.whatsApp ||
            userData?.whatsapp ||
            studentData?.phone ||
            studentData?.whatsApp ||
            studentData?.whatsapp ||
            '',
          preferences: {
            notifications:
              userData?.preferences?.notifications ??
              studentData?.preferences?.notifications ??
              true,
            compactSidebar:
              userData?.preferences?.compactSidebar ??
              studentData?.preferences?.compactSidebar ??
              false,
            darkMode:
              userData?.preferences?.darkMode ??
              studentData?.preferences?.darkMode ??
              false,
            soundEffects:
              userData?.preferences?.soundEffects ??
              studentData?.preferences?.soundEffects ??
              true,
          },
          createdAt:
            userData?.createdAt?.toDate() ||
            studentData?.createdAt?.toDate() ||
            new Date(),
        };
      }
      
      // Usuario por defecto (estudiante)
      return {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || 'Usuario',
        role: 'estudiante',
        preferences: {
          notifications: true,
          compactSidebar: false,
          darkMode: false,
          soundEffects: true,
        },
        createdAt: new Date(),
      };
    } catch (error) {
      return {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || 'Usuario',
        role: 'estudiante',
        preferences: {
          notifications: true,
          compactSidebar: false,
          darkMode: false,
          soundEffects: true,
        },
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
          setUser(null);
        }
      } else {
        setUser(null);
      }
      
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (user?.preferences?.darkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [user?.preferences?.darkMode]);

  // Iniciar sesión
  const login = async (email: string, password: string): Promise<void> => {
    try {
      setIsLoading(true);
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    } catch (error) {
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
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (
    updates: Partial<
      Pick<
        User,
        "name" | "avatarUrl" | "avatarEmoji" | "avatarSetupCompleted" | "bio" | "phone" | "location" | "website" | "instagram" | "preferences"
      >
    >,
  ): Promise<void> => {
    if (!user) {
      throw new Error("No authenticated user");
    }
    const nextName = updates.name?.trim();

    const userRef = doc(firebaseDB, 'usuarios', user.id);
    const studentRef = doc(firebaseDB, 'estudiantes', user.id);

    const [userDoc, studentDoc] = await Promise.all([
      getDoc(userRef),
      getDoc(studentRef),
    ]);

    const profilePayload: Record<string, unknown> = {
      role: user.role,
      email: user.email,
      updatedAt: serverTimestamp(),
    };

    if (nextName !== undefined && nextName.length > 0) profilePayload.name = nextName;
    if (updates.avatarUrl !== undefined) profilePayload.avatarUrl = updates.avatarUrl.trim();
    if (updates.avatarEmoji !== undefined) profilePayload.avatarEmoji = updates.avatarEmoji;
    if (updates.avatarSetupCompleted === true) profilePayload.avatarSetupCompleted = true;
    if (updates.bio !== undefined) profilePayload.bio = updates.bio.trim();
    if (updates.phone !== undefined) profilePayload.phone = updates.phone.trim();
    if (updates.location !== undefined) profilePayload.location = updates.location.trim();
    if (updates.website !== undefined) profilePayload.website = updates.website.trim();
    if (updates.instagram !== undefined) profilePayload.instagram = updates.instagram.trim();
    if (updates.preferences !== undefined) profilePayload.preferences = updates.preferences;

    if (userDoc.exists()) {
      await updateDoc(userRef, profilePayload);
    } else {
      await setDoc(
        userRef,
        {
          ...profilePayload,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    if (nextName && studentDoc.exists()) {
      await updateDoc(studentRef, {
        name: nextName,
        updatedAt: serverTimestamp(),
      });
    }

    setUser((prev) =>
      prev
        ? {
            ...prev,
            ...(nextName ? { name: nextName } : {}),
            ...(updates.avatarUrl !== undefined ? { avatarUrl: updates.avatarUrl.trim() } : {}),
            ...(updates.avatarEmoji !== undefined ? { avatarEmoji: updates.avatarEmoji } : {}),
            ...(updates.avatarSetupCompleted === true ? { avatarSetupCompleted: true } : {}),
            ...(updates.bio !== undefined ? { bio: updates.bio.trim() } : {}),
            ...(updates.phone !== undefined ? { phone: updates.phone.trim() } : {}),
            ...(updates.location !== undefined ? { location: updates.location.trim() } : {}),
            ...(updates.website !== undefined ? { website: updates.website.trim() } : {}),
            ...(updates.instagram !== undefined ? { instagram: updates.instagram.trim() } : {}),
            ...(updates.preferences !== undefined ? { preferences: updates.preferences } : {}),
          }
        : prev,
    );
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        updateProfile,
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
