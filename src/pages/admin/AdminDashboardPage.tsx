import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { getAdminEmails } from "@/lib/services/adminAccessService";
import { getTeacherApprovalRequests } from "@/lib/services/teacherApprovalService";
import { getPendingAccountDeletionRequests } from "@/lib/services/accountDeletionService";
import { getPricingContactRequests } from "@/lib/services/pricingContactService";
import { getContactMessages } from "@/lib/services/contactMessageService";
import {
  ArrowRight,
  Bell,
  Clock3,
  ShieldCheck,
  Users,
  UserRoundCheck,
} from "lucide-react";
 
type AdminStats = {
  admins: number;
  approvals: number;
  deletions: number;
  inbox: number;
};

const defaultStats: AdminStats = {
  admins: 0,
  approvals: 0,
  deletions: 0,
  inbox: 0,
};

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats>(defaultStats);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadStats = async () => {
      setLoading(true);
      try {
        const [approvals, deletions, pricingLeads, contactMessages] = await Promise.all([
          getTeacherApprovalRequests(),
          getPendingAccountDeletionRequests(),
          getPricingContactRequests(),
          getContactMessages(),
        ]);

        if (!mounted) return;
        setStats({
          admins: getAdminEmails().length,
          approvals: approvals.length,
          deletions: deletions.length,
          inbox: pricingLeads.length + contactMessages.length,
        });
      } catch {
        if (!mounted) return;
        setStats({
          ...defaultStats,
          admins: getAdminEmails().length,
        });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadStats();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-100/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-800">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Admin Workspace
                </p>
                <h1 className="mt-2 text-2xl font-bold text-slate-900">Admin Dashboard</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Central control for admins. Manage teacher approvals, operations, inbox, and deletions.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/admin/teacher-approvals")}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-500 bg-gradient-to-b from-sky-500 to-sky-600 px-4 text-sm font-semibold text-white transition hover:from-sky-600 hover:to-sky-700"
                >
                  Open approvals
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Admins</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{loading ? "..." : stats.admins}</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                  <Users className="h-4 w-4" />
                </span>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Approvals</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{loading ? "..." : stats.approvals}</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <UserRoundCheck className="h-4 w-4" />
                </span>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Deletions</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{loading ? "..." : stats.deletions}</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <Clock3 className="h-4 w-4" />
                </span>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Inbox</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{loading ? "..." : stats.inbox}</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Bell className="h-4 w-4" />
                </span>
              </div>
            </article>
          </section>

          <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <button
              type="button"
              onClick={() => navigate("/admin/admins")}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
            >
              Admin emails
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin/teacher-approvals")}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
            >
              Teacher approvals
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin/teacher-ops")}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
            >
              Teacher ops
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin/deletions")}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
            >
              Deletions
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin/inbox")}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
            >
              Inbox
            </button>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
