type AdminMetricCardProps = {
  label: string;
  value: string | number;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
};

export function AdminMetricCard({
  label,
  value,
  className = "border-slate-200 bg-slate-50",
  valueClassName = "text-slate-900",
  labelClassName = "text-slate-500",
}: AdminMetricCardProps) {
  return (
    <article className={`rounded-xl border p-3 ${className}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${labelClassName}`}>{label}</p>
      <p className={`mt-1 text-lg font-bold ${valueClassName}`}>{value}</p>
    </article>
  );
}
