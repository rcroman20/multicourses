import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types/academic';
import { Loader2 } from 'lucide-react';
import { isTeacherPlanExpired } from '@/lib/services/teacherPlanAccessService';
import { useAdminPlatformSettings } from '@/lib/services/adminSettingsService';
import { isAdminEmail } from '@/lib/services/adminAccessService';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: UserRole | UserRole[];
}

const getRoleHomePath = (role?: UserRole): string => {
  if (role === "docente") return "/teacher";
  if (role === "admin") return "/admin/dashboard";
  if (role === "institucion") return "/institution";
  return "/student";
};

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { settings, isLoading: isSettingsLoading } = useAdminPlatformSettings();
  const location = useLocation();
  const waitingPath = "/teacher-approval-waiting";
  const rejectedPath = "/teacher-approval-rejected";
  const isAdminRole = user?.role === "admin" || isAdminEmail(user?.email);
  const isInstitutionManagedTeacher =
    user?.role === "docente" &&
    (user?.institutionManaged === true || Boolean(user?.institutionId));
  const isMaintenanceMode = settings.maintenanceMode === true;
  const isPendingTeacher =
    !isAdminRole &&
    !isInstitutionManagedTeacher &&
    user?.requestedRole === "docente" && user?.teacherApprovalStatus === "pending";
  const isRejectedTeacher =
    !isAdminRole &&
    !isInstitutionManagedTeacher &&
    user?.requestedRole === "docente" &&
    user?.teacherApprovalStatus === "rejected" &&
    user?.role !== "docente";
  const teacherPlanStatus = String(user?.teacherPlanStatus || "").trim().toLowerCase();
  const isPaymentPendingTeacher =
    !isAdminRole &&
    !isInstitutionManagedTeacher &&
    user?.requestedRole === "docente" && teacherPlanStatus === "pending_payment";
  const institutionPlanStatus = String(user?.institutionPlanStatus || "").trim().toLowerCase();
  const isPendingInstitutionPayment =
    !isAdminRole && user?.role === "institucion" && institutionPlanStatus === "pending_payment";
  const isInactiveInstitutionPlan =
    !isAdminRole && user?.role === "institucion" && institutionPlanStatus === "inactive";
  const isExpiredTeacherPlan = !isAdminRole && !isPaymentPendingTeacher && isTeacherPlanExpired({
    role: user?.role,
    teacherPlanStatus: user?.teacherPlanStatus,
    teacherPlanExpiresAt: user?.teacherPlanExpiresAt,
  }) && !isInstitutionManagedTeacher;

  if (isLoading || isSettingsLoading) {
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

  if (isMaintenanceMode && !isAdminRole) {
    return <Navigate to="/maintenance" replace />;
  }

  if (isPendingTeacher && location.pathname !== waitingPath) {
    return <Navigate to={waitingPath} replace />;
  }

  if (isRejectedTeacher && location.pathname !== rejectedPath) {
    return <Navigate to={rejectedPath} replace />;
  }

  if (
    isPaymentPendingTeacher &&
    location.pathname !== waitingPath &&
    location.pathname !== rejectedPath
  ) {
    return <Navigate to={`${waitingPath}?reason=payment-pending`} replace />;
  }

  if (isPendingInstitutionPayment && location.pathname !== waitingPath) {
    return <Navigate to={`${waitingPath}?reason=institution-payment-pending`} replace />;
  }

  if (isInactiveInstitutionPlan && location.pathname !== waitingPath) {
    return <Navigate to={`${waitingPath}?reason=institution-plan-inactive`} replace />;
  }

  if (
    isExpiredTeacherPlan &&
    location.pathname !== waitingPath &&
    location.pathname !== rejectedPath
  ) {
    return <Navigate to={`${waitingPath}?reason=plan-expired`} replace />;
  }

  if (
    !isPendingTeacher &&
    !isExpiredTeacherPlan &&
    !isPaymentPendingTeacher &&
    !isPendingInstitutionPayment &&
    !isInactiveInstitutionPlan &&
    location.pathname === waitingPath
  ) {
    if (isRejectedTeacher) return <Navigate to={rejectedPath} replace />;
    return <Navigate to={getRoleHomePath(user?.role)} replace />;
  }

  if (!isRejectedTeacher && !isExpiredTeacherPlan && !isPaymentPendingTeacher && location.pathname === rejectedPath) {
    if (isPendingTeacher) return <Navigate to={waitingPath} replace />;
    return <Navigate to={getRoleHomePath(user?.role)} replace />;
  }

  if (requiredRole) {
    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!allowedRoles.includes(user?.role as UserRole)) {
      return <Navigate to={getRoleHomePath(user?.role)} replace />;
    }
  }

  return <>{children}</>;
}
