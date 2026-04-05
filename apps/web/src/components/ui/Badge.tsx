import React from "react";

interface StatusBadgeProps {
  children: React.ReactNode;
  showDot?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  children,
  showDot = true,
  className = "",
}) => {
  return (
    <div
      className={`inline-flex items-center gap-3 px-11 py-3.5 bg-white rounded-full shadow-md ${className}`}
    >
      <span className="text-sm text-text-primary tracking-tight">
        {children}
      </span>
      {showDot && <div className="w-3 h-3 bg-green-500 rounded-full" />}
    </div>
  );
};

interface PillBadgeProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const PillBadge: React.FC<PillBadgeProps> = ({
  children,
  icon,
  className = "",
}) => {
  return (
    <div
      className={`inline-flex items-center gap-2 px-4.5 py-2.5 bg-white border border-border-light rounded-full shadow-sm ${className}`}
    >
      {icon && <span className="w-4 h-4">{icon}</span>}
      <span className="text-sm text-text-primary">{children}</span>
    </div>
  );
};
