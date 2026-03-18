import { useEffect, useState } from "react";
import { Building2, X } from "lucide-react";
import type { AdminDirectoryUserRecord } from "@/lib/services/adminDirectoryService";

interface AdminInstitutionAssignmentModalProps {
  open: boolean;
  user: AdminDirectoryUserRecord | null;
  suggestions: string[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (institutionName: string) => Promise<void>;
}

export default function AdminInstitutionAssignmentModal({
  open,
  user,
  suggestions,
  saving,
  onClose,
  onSubmit,
}: AdminInstitutionAssignmentModalProps) {
  const [institutionName, setInstitutionName] = useState("");
  const effectiveRole = user?.requestedRole === "docente" ? "docente" : user?.role;

  useEffect(() => {
    if (!open || !user) return;
    setInstitutionName(user.institutionName || "");
  }, [open, user]);

  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
        <div className="flex items-center justify-between border-b border-slate-200/60 bg-slate-50 px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Assign institution</h3>
            <p className="text-sm text-slate-600">
              Update the organization linked to {user.name}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-white/80 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-100">
                <Building2 className="h-4 w-4 text-cyan-700" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {user.email || "No email"} • {effectiveRole === "docente" ? "Teacher" : effectiveRole === "admin" ? "Admin" : effectiveRole === "institucion" ? "Institution" : "Student"}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Institution name</label>
            <input
              type="text"
              value={institutionName}
              onChange={(event) => setInstitutionName(event.target.value)}
              className="w-full rounded-xl border border-slate-200/60 bg-white px-4 py-2.5 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
              placeholder="Type a school, academy, or organization"
            />
            {suggestions.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {suggestions.slice(0, 12).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setInstitutionName(suggestion)}
                    className="rounded-full border border-slate-200/60 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200/60 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || institutionName.trim().length < 2}
              onClick={() => void onSubmit(institutionName)}
              className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save institution"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
