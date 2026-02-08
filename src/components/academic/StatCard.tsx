// src/components/academic/StatCard.tsx
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

const variantStyles = {
  default: {
    bg: 'bg-card',
    icon: 'bg-secondary text-foreground',
  },
  primary: {
    bg: 'bg-primary/5',
    icon: 'bg-primary/10 text-primary',
  },
  success: {
    bg: 'bg-passing/5',
    icon: 'bg-passing/10 text-passing',
  },
  warning: {
    bg: 'bg-at-risk/5',
    icon: 'bg-at-risk/10 text-at-risk',
  },
  danger: {
    bg: 'bg-failing/5',
    icon: 'bg-failing/10 text-failing',
  },
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
}: StatCardProps) {
  const styles = variantStyles[variant];

  return (
    <div className={cn('academic-card', styles.bg)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className="text-3xl font-bold">{value}</p>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              'text-sm mt-2 font-medium',
              trend.isPositive ? 'text-passing' : 'text-failing'
            )}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <div className={cn('p-3 rounded-lg', styles.icon)}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}