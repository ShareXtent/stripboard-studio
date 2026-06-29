import React, { useState } from 'react';

interface CollapsibleSectionProps {
  action?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  title: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  action,
  badge,
  children,
  defaultOpen = false,
  title,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b" style={{ borderBottomColor: '#2d2d44' }}>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex flex-1 items-center gap-2 text-left"
          style={{ color: '#d7dee9' }}
        >
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded text-xs font-semibold"
            style={{ background: '#102743', color: '#94a3b8', border: '1px solid #2d2d44' }}
          >
            {open ? '-' : '+'}
          </span>
          <span className="text-xs font-semibold" style={{ color: '#c7d2fe' }}>
            {title}
          </span>
          {badge && (
            <span className="text-[11px]" style={{ color: '#7f9bb8' }}>
              {badge}
            </span>
          )}
        </button>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
};
