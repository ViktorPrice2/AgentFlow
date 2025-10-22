import clsx from 'clsx';
import type { FC } from 'react';

interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  paused: 'bg-gray-100 text-gray-800'
};

export const StatusBadge: FC<StatusBadgeProps> = ({ status }) => {
  return (
    <span className={clsx('rounded px-2 py-1 text-xs font-semibold', statusStyles[status] ?? statusStyles.pending)}>
      {status.toUpperCase()}
    </span>
  );
};
