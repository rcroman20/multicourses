type AdminLoadingStateProps = {
  message: string;
};

export function AdminLoadingState({ message }: AdminLoadingStateProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-600">
      {message}
    </div>
  );
}
