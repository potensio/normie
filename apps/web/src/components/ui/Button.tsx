import React from "react";

export type ButtonVariant = "primary" | "purple" | "ghost" | "small";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  children,
  icon,
  className = "",
  ...props
}) => {
  const baseClasses =
    "inline-flex items-center justify-center gap-2 font-sans transition-all duration-200";

  const variantClasses = {
    primary:
      "bg-primary-dark text-white rounded-full px-7 py-3.5 text-sm hover:opacity-90",
    purple:
      "bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-full px-7 py-3.5 text-sm border border-purple-400 shadow-purple hover:shadow-lg hover:scale-[1.02]",
    ghost:
      "bg-white/50 text-text-primary rounded-full px-7 py-3.5 text-sm border border-gray-200/50 hover:bg-white/70",
    small:
      "bg-primary-dark text-white rounded-full px-4 py-2 text-xs hover:opacity-90",
  };

  const glassWrapperClasses =
    "inline-block p-1.5 pb-0.5 rounded-full bg-white/40 border border-white/60 shadow-glass";

  return (
    <span className={glassWrapperClasses}>
      <button
        className={`${baseClasses} ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {icon && <span className="w-4 h-4">{icon}</span>}
        {children}
      </button>
    </span>
  );
};
