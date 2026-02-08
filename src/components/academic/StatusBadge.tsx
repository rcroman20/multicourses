import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'passing' | 'at-risk' | 'failing';
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

const statusConfig = {
  passing: {
    label: 'Aprobando',
    className: 'status-passing',
    dotColor: 'bg-passing',
  },
  'at-risk': {
    label: 'En riesgo',
    className: 'status-at-risk',
    dotColor: 'bg-at-risk',
  },
  failing: {
    label: 'Reprobando',
    className: 'status-failing',
    dotColor: 'bg-failing',
  },
};

export function StatusBadge({ status, showLabel = true, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'academic-badge',
        config.className,
        size === 'sm' && 'text-xs px-2 py-0.5'
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', config.dotColor)} />
      {showLabel && config.label}
    </span>
  );
}
