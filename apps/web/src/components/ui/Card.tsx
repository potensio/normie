import React from "react";

interface CardProps {
  children: React.ReactNode;
  variant?: "default" | "gradient" | "glass";
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = "default",
  className = "",
}) => {
  const variantClasses = {
    default: "bg-white border border-border-light shadow-sm",
    gradient:
      "bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-400/20 shadow-md",
    glass: "bg-white/40 border border-white/60 backdrop-blur-md shadow-glass",
  };

  return (
    <div className={`rounded-lg p-6 ${variantClasses[variant]} ${className}`}>
      {children}
    </div>
  );
};

interface ProcessCardProps {
  number: string;
  title: string;
  description: string;
  className?: string;
}

export const ProcessCard: React.FC<ProcessCardProps> = ({
  number,
  title,
  description,
  className = "",
}) => {
  return (
    <div
      className={`bg-gradient-to-b from-surface-secondary to-white border border-border-light rounded-lg p-9 shadow-sm flex flex-col gap-32 ${className}`}
    >
      <div className="text-6xl font-normal text-text-primary tracking-tight">
        {number}
      </div>
      <div className="flex flex-col gap-3.5">
        <h4 className="text-xl font-normal text-text-primary tracking-tight">
          {title}
        </h4>
        <p className="text-base text-text-secondary leading-loose">
          {description}
        </p>
      </div>
    </div>
  );
};
