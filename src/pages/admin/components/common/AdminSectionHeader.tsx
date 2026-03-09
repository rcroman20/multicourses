import { type ComponentType, type ReactNode } from "react";

type AdminSectionHeaderProps = {
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function AdminSectionHeader({
  icon: Icon,
  iconClassName,
  title,
  description,
  actions,
}: AdminSectionHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border ${iconClassName}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      {actions}
    </div>
  );
}
