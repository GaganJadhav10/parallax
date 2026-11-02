import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => (
  <div className={`skeleton ${className}`} aria-hidden="true" />
);

/**
 * Placeholder rows matching the real table's geometry, so the layout does not
 * jump when data arrives.
 */
export const SkeletonTable: React.FC<{ rows?: number; columns: number }> = ({
  rows = 6,
  columns,
}) => (
  <>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <tr key={rowIndex} className="border-b border-surface-border/60 last:border-0">
        {Array.from({ length: columns }).map((__, colIndex) => (
          <td key={colIndex} className="py-3.5 px-4">
            <Skeleton className={`h-4 ${colIndex === 0 ? 'w-40' : 'w-16'}`} />
          </td>
        ))}
      </tr>
    ))}
  </>
);

export const SkeletonTiles: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <>
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="card p-5 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-1 w-full" />
      </div>
    ))}
  </>
);
