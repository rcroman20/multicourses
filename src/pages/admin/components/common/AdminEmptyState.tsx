type AdminEmptyStateProps = {
  message: string;
  dashed?: boolean;
};

export function AdminEmptyState({ message, dashed = true }: AdminEmptyStateProps) {
  return (
    <div
      className={`rounded-xl border bg-slate-50 px-3 py-6 text-center text-sm text-slate-600 ${
        dashed ? "border-dashed border-slate-300" : "border-slate-200"
      }`}
    >
      {message}
    </div>
  );
}
