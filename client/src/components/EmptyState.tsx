import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /**
   * compact = full-bleed inside a panel (large icon, vertical layout).
   * inline  = side-by-side icon + body (used inside table empty rows).
   * Default = compact.
   */
  variant?: 'compact' | 'inline';
  /**
   * Optional className appended to the wrapper for tweaks.
   */
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'compact',
  className,
}: EmptyStateProps) {
  if (variant === 'inline') {
    return (
      <div className={`nx-empty-rich ${className || ''}`} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <div className="nx-empty-rich-icon">
          <Icon className="w-7 h-7" strokeWidth={1.6} />
        </div>
        <div className="nx-empty-rich-body" style={{ alignItems: 'flex-start', textAlign: 'left' }}>
          <h3 className="nx-empty-rich-title">{title}</h3>
          {description && <p className="nx-empty-rich-desc">{description}</p>}
          {action && <div className="nx-empty-rich-actions">{action}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className={`nx-empty-rich ${className || ''}`}>
      <div className="nx-empty-rich-icon">
        <Icon className="w-7 h-7" strokeWidth={1.6} />
      </div>
      <div className="nx-empty-rich-body">
        <h3 className="nx-empty-rich-title">{title}</h3>
        {description && <p className="nx-empty-rich-desc">{description}</p>}
        {action && <div className="nx-empty-rich-actions">{action}</div>}
      </div>
    </div>
  );
}
