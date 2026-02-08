// src/components/layout/DashboardLayout.tsx - MODIFICADO
import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Menu } from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  const { user } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar 
        isCollapsed={isSidebarCollapsed} 
        onToggleCollapse={toggleSidebar}
      />
      
      <main className={cn(
        "min-h-screen transition-all duration-300",
        isSidebarCollapsed ? "lg:ml-16" : "lg:ml-64"
      )}>
        {/* Header */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="px-4 py-4 lg:px-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Toggle button para desktop */}
                <button
                  onClick={toggleSidebar}
                  className="hidden lg:flex items-center justify-center h-5 w-5 rounded-lg hover:bg-accent text-foreground/70 hover:text-foreground transition-colors"
                  aria-label={isSidebarCollapsed ? 'Expandir sidebar' : 'Contraer sidebar'}
                >
                  <Menu className="h-5 w-5" />
                </button>
                
                <div className="flex flex-col gap-1">
                  {title && (
                    <h1 className="text-2xl font-bold text-foreground lg:text-3xl">
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="text-muted-foreground">{subtitle}</p>
                  )}
                </div>
              </div>
              
              {/* User info en header para mobile */}
              <div className="lg:hidden flex items-center gap-3 hidden sm:flex">
                <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-primary font-semibold">
                  {user?.name?.charAt(0) || 'U'}
                </div>
                <div className="flex flex-col ">
                  <span className="text-sm font-medium">{user?.name}</span>
                  <span className="text-xs text-muted-foreground capitalize">
                    {user?.role === 'docente' ? 'Docente' : 'Estudiante'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

// Si no tienes la función cn, puedes usar esta simple versión
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}