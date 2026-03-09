import type { ReactNode } from "react";
import {
  BadgeCheck,
  Clock3,
  FileText,
  MessageSquare,
  ShieldCheck,
  Users,
} from "lucide-react";
import type {
  AdminWorkspaceCounts,
  AdminWorkspaceTab,
} from "@/pages/admin/hooks/useAdminWorkspaceCounts";

type AdminWorkspaceShellProps = {
  activeTab: AdminWorkspaceTab;
  counts: AdminWorkspaceCounts;
  children: ReactNode;
};

export function AdminWorkspaceShell({ activeTab, counts, children }: AdminWorkspaceShellProps) {
  void activeTab;

  return (
    <div className="relative overflow-x-hidden">
      <div className="pointer-events-none absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/70 blur-[40px]" />
      <div className="pointer-events-none absolute -right-10 bottom-8 h-44 w-44 rounded-full bg-slate-300/50 blur-[40px]" />

      <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] lg:p-6">
        <div className="mx-auto w-full max-w-[1400px] space-y-4 pb-2">
          <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-4 shadow-sm lg:p-5">
            <div className="pointer-events-none absolute -left-10 top-0 h-28 w-28 rounded-full bg-sky-100/70 blur-sm" />
            <div className="pointer-events-none absolute -bottom-12 -right-8 h-36 w-36 rounded-full bg-indigo-100/60 blur-sm" />

            <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-100/80 px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-sky-800">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Admin Workspace
                </span>
                <h1 className="text-2xl font-bold leading-tight text-slate-900">Admin Access Control</h1>
                <p className="max-w-3xl text-sm text-slate-600">
                  Manage approvals, operations, inbox requests and admin permissions from one place.
                </p>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Admins</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{counts.admins}</p>
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
                  <p className="mt-1 text-lg font-bold text-slate-900">{counts.approvals}</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <BadgeCheck className="h-4 w-4" />
                </span>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Teacher Ops</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{counts.teacherOps}</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                  <FileText className="h-4 w-4" />
                </span>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Deletions</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{counts.deletions}</p>
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
                  <p className="mt-1 text-lg font-bold text-slate-900">{counts.inbox}</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <MessageSquare className="h-4 w-4" />
                </span>
              </div>
            </article>
          </section>

          {children}
        </div>
      </div>
    </div>
  );
}
