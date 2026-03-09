import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, MessageSquare } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { AdminWorkspaceShell } from "@/pages/admin/components/AdminWorkspaceShell";
import { useAdminWorkspaceCounts } from "@/pages/admin/hooks/useAdminWorkspaceCounts";
import { AdminSectionHeader } from "@/pages/admin/components/common/AdminSectionHeader";
import { AdminMetricCard } from "@/pages/admin/components/common/AdminMetricCard";
import { AdminLoadingState } from "@/pages/admin/components/common/AdminLoadingState";
import { AdminEmptyState } from "@/pages/admin/components/common/AdminEmptyState";
import { getOwnerAdminEmail, normalizeAdminEmail } from "@/lib/services/adminAccessService";
import {
  getPricingContactRequests,
  markPricingContactRequestResolved,
  type PricingContactRequestRecord,
} from "@/lib/services/pricingContactService";
import {
  getContactMessages,
  markContactMessageResolved,
  type ContactMessageRecord,
} from "@/lib/services/contactMessageService";
import { getTeacherPlanDefinition } from "@/lib/services/teacherPlanService";

export default function AdminAccessInboxPage() {
  const { user } = useAuth();
  const { counts, refreshCounts } = useAdminWorkspaceCounts();
  const [pricingContactRequests, setPricingContactRequests] = useState<PricingContactRequestRecord[]>([]);
  const [loadingPricingContactRequests, setLoadingPricingContactRequests] = useState(false);
  const [contactMessages, setContactMessages] = useState<ContactMessageRecord[]>([]);
  const [loadingContactMessages, setLoadingContactMessages] = useState(false);
  const [resolvingInboundKey, setResolvingInboundKey] = useState<string | null>(null);

  const ownerEmail = getOwnerAdminEmail();
  const normalizedUserEmail = normalizeAdminEmail(user?.email);
  const pricingLeadCount = pricingContactRequests.length;
  const contactMessageCount = contactMessages.length;

  const resolvedBy = useMemo(
    () => normalizedUserEmail || ownerEmail,
    [normalizedUserEmail, ownerEmail],
  );

  const loadPricingContactRequests = async () => {
    setLoadingPricingContactRequests(true);
    try {
      const requests = await getPricingContactRequests();
      setPricingContactRequests(requests.filter((request) => request.status !== "resolved"));
    } catch {
      toast.error("Could not load pricing contact requests.");
    } finally {
      setLoadingPricingContactRequests(false);
    }
  };

  const loadContactMessages = async () => {
    setLoadingContactMessages(true);
    try {
      const requests = await getContactMessages();
      setContactMessages(requests.filter((request) => request.status !== "resolved"));
    } catch {
      toast.error("Could not load contact form messages.");
    } finally {
      setLoadingContactMessages(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadPricingContactRequests(), loadContactMessages()]);
  }, []);

  const handleResolveContactMessage = async (request: ContactMessageRecord) => {
    if (resolvingInboundKey) return;
    const key = `contact:${request.id}`;
    setResolvingInboundKey(key);
    try {
      await markContactMessageResolved(request.id, resolvedBy);
      toast.success("Contact message marked as resolved.");
      await Promise.all([loadContactMessages(), refreshCounts()]);
    } catch {
      toast.error("Could not mark contact message as resolved.");
    } finally {
      setResolvingInboundKey(null);
    }
  };

  const handleResolvePricingRequest = async (request: PricingContactRequestRecord) => {
    if (resolvingInboundKey) return;
    const key = `pricing:${request.id}`;
    setResolvingInboundKey(key);
    try {
      await markPricingContactRequestResolved(request.id, resolvedBy);
      toast.success("Estimator lead marked as resolved.");
      await Promise.all([loadPricingContactRequests(), refreshCounts()]);
    } catch {
      toast.error("Could not mark estimator lead as resolved.");
    } finally {
      setResolvingInboundKey(null);
    }
  };

  return (
    <DashboardLayout contentClassName="pt-0 lg:pt-1">
      <AdminWorkspaceShell activeTab="pricingLeads" counts={counts}>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <AdminSectionHeader
            icon={MessageSquare}
            iconClassName="border-sky-200 bg-sky-50 text-sky-700"
            title="Inbound Requests"
            description="Messages from Contact page and pricing estimator."
          />

          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <AdminMetricCard label="Contact messages" value={contactMessageCount} />
            <AdminMetricCard label="Estimator leads" value={pricingLeadCount} />
          </div>

          <div className="space-y-4">
            <article className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2">
                <p className="text-sm font-semibold text-slate-900">Contact Page Messages</p>
                <p className="text-xs text-slate-500">Submitted from the Contact page form.</p>
              </div>

              {loadingContactMessages ? (
                <AdminLoadingState message="Loading contact messages..." />
              ) : contactMessages.length === 0 ? (
                <AdminEmptyState message="No contact messages yet." />
              ) : (
                <div className="space-y-2">
                  {contactMessages.map((request) => {
                    const createdAtText = request.createdAt
                      ? request.createdAt.toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Unknown date";
                    const roleLabel =
                      request.role === "organization"
                        ? "Organization"
                        : request.role === "admin"
                          ? "Admin"
                          : request.role === "student"
                            ? "Student"
                            : request.role === "teacher"
                              ? "Teacher"
                              : "Other";

                    return (
                      <article key={request.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{request.name}</p>
                            <p className="break-all text-xs text-slate-600">{request.email}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                              {createdAtText}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleResolveContactMessage(request)}
                              disabled={resolvingInboundKey === `contact:${request.id}`}
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {resolvingInboundKey === `contact:${request.id}` ? "Saving..." : "Resolved"}
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                          <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                            Role: <span className="font-semibold text-slate-800">{roleLabel}</span>
                          </p>
                          <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                            Phone: <span className="font-semibold text-slate-800">{request.phone || "Not provided"}</span>
                          </p>
                          <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                            Institution: <span className="font-semibold text-slate-800">{request.institution || "Not provided"}</span>
                          </p>
                          <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 sm:col-span-2 lg:col-span-3">
                            Subject: <span className="font-semibold text-slate-800">{request.subject}</span>
                          </p>
                        </div>

                        <div className="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Message</p>
                          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">
                            {request.message || "No message."}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2">
                <p className="text-sm font-semibold text-slate-900">Estimator Contact Requests</p>
                <p className="text-xs text-slate-500">Requests submitted from the landing page pricing estimator.</p>
              </div>

              {loadingPricingContactRequests ? (
                <AdminLoadingState message="Loading contact requests..." />
              ) : pricingContactRequests.length === 0 ? (
                <AdminEmptyState message="No pricing contact requests yet." />
              ) : (
                <div className="space-y-2">
                  {pricingContactRequests.map((request) => {
                    const createdAtText = request.createdAt
                      ? request.createdAt.toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Unknown date";

                    const roleLabel =
                      request.role === "organization"
                        ? "Organization"
                        : request.role === "admin_team"
                          ? "Admin Team"
                          : "Teacher";
                    const planLabel = request.interestedPlanId
                      ? getTeacherPlanDefinition(request.interestedPlanId).label
                      : "No plan preference";

                    return (
                      <article key={request.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{request.name}</p>
                            <p className="break-all text-xs text-slate-600">{request.email}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                              {createdAtText}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleResolvePricingRequest(request)}
                              disabled={resolvingInboundKey === `pricing:${request.id}`}
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {resolvingInboundKey === `pricing:${request.id}` ? "Saving..." : "Resolved"}
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                          <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                            Institution: <span className="font-semibold text-slate-800">{request.institutionName}</span>
                          </p>
                          <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                            Role: <span className="font-semibold text-slate-800">{roleLabel}</span>
                          </p>
                          <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                            Plan preference: <span className="font-semibold text-slate-800">{planLabel}</span>
                          </p>
                          <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                            Desired courses: <span className="font-semibold text-slate-800">{request.desiredCourses}</span>
                          </p>
                          <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                            Desired students: <span className="font-semibold text-slate-800">{request.desiredStudents}</span>
                          </p>
                          <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                            Source: <span className="font-semibold text-slate-800">Landing estimator</span>
                          </p>
                        </div>

                        <div className="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Message</p>
                          <p className="mt-1 text-xs text-slate-700">{request.message || "No additional message."}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </article>
          </div>
        </section>
      </AdminWorkspaceShell>
    </DashboardLayout>
  );
}
