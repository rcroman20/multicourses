import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminEmail } from "@/lib/services/adminAccessService";

interface AdminRouteProps {
  children: ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!isAdminEmail(user?.email) && user?.role !== "admin") {
    const fallbackPath =
      user?.role === "docente"
        ? "/teacher"
        : user?.role === "admin"
          ? "/admin/dashboard"
          : user?.role === "institucion"
            ? "/institution"
          : "/student";
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
}
