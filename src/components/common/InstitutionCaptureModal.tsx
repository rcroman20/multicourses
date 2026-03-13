import { FormEvent, useEffect, useMemo, useRef } from "react";
import { Building2, Loader2, Sparkles } from "lucide-react";

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

interface InstitutionCaptureModalProps {
  open: boolean;
  roleLabel: "Teacher" | "Student" | "Admin";
  institutionValue: string;
  suggestions: string[];
  saving: boolean;
  errorMessage: string;
  onInstitutionChange: (value: string) => void;
  onSave: () => void;
}

export function InstitutionCaptureModal({
  open,
  roleLabel,
  institutionValue,
  suggestions,
  saving,
  errorMessage,
  onInstitutionChange,
  onSave,
}: InstitutionCaptureModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  const selectedSuggestion = useMemo(() => {
    const normalizedValue = normalizeText(institutionValue);
    if (!normalizedValue) return "";
    return suggestions.find((item) => normalizeText(item) === normalizedValue) || "";
  }, [institutionValue, suggestions]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    onSave();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
        <div className="border-b border-slate-200 bg-slate-50/90 px-5 py-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
            <Sparkles className="h-3.5 w-3.5" />
            Profile completion
          </div>
          <div className="mt-3 flex items-start gap-3">
            <div className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-sky-700">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Set your institution</h3>
              <p className="mt-1 text-sm text-slate-600">
                {roleLabel} accounts must have an institution linked before continuing.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Institution name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={institutionValue}
              onChange={(event) => onInstitutionChange(event.target.value)}
              placeholder="Type your school, academy, or organization"
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              maxLength={190}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Institutions already in the platform
            </p>
            {suggestions.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                No suggestions yet. Save your institution to add it to the shared options.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                <select
                  value={selectedSuggestion}
                  onChange={(event) => onInstitutionChange(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">Select an institution</option>
                  {suggestions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  Pick one from the list or type a new institution above.
                </p>
              </div>
            )}
          </div>

          {errorMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-sky-500 bg-gradient-to-b from-sky-500 to-sky-600 text-sm font-semibold text-white shadow-[0_12px_24px_-14px_rgba(2,132,199,0.95)] transition hover:from-sky-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Saving institution..." : "Save and continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
