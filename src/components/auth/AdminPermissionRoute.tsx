import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  ADMIN_EMAILS_CHANGED_EVENT,
  isAdminEmail,
  isOwnerAdminEmail,
} from "@/lib/services/adminAccessService";
import {
  ADMIN_PERMISSIONS_CHANGED_EVENT,
  canAccessDelegatedAdminPermission,
  type DelegatedAdminPermissions,
} from "@/lib/services/adminPermissionsService";

interface AdminPermissionRouteProps {
  children: ReactNode;
  permission?: keyof DelegatedAdminPermissions;
  ownerOnly?: boolean;
}

export function AdminPermissionRoute({
  children,
  permission,
  ownerOnly = false,
}: AdminPermissionRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  const email = user?.email || "";
  const [, setVersion] = useState(0);

  useEffect(() => {
    const handleChange = () => setVersion((current) => current + 1);
    window.addEventListener("storage", handleChange);
    window.addEventListener(ADMIN_EMAILS_CHANGED_EVENT, handleChange as EventListener);
    window.addEventListener(ADMIN_PERMISSIONS_CHANGED_EVENT, handleChange as EventListener);

    return () => {
      window.removeEventListener("storage", handleChange);
      window.removeEventListener(ADMIN_EMAILS_CHANGED_EVENT, handleChange as EventListener);
      window.removeEventListener(ADMIN_PERMISSIONS_CHANGED_EVENT, handleChange as EventListener);
    };
  }, []);

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

  if (!isAdminEmail(email) && user?.role !== "admin") {
    const fallbackPath =
      user?.role === "docente"
        ? "/teacher"
        : user?.role === "admin"
          ? "/admin/dashboard"
          : "/student";
    return <Navigate to={fallbackPath} replace />;
  }

  if (ownerOnly && !isOwnerAdminEmail(email)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (permission && !canAccessDelegatedAdminPermission(permission, email)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <>{children}</>;
}
