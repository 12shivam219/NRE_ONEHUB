import React from 'react';
import { LogoLoader } from '../common/LogoLoader';

interface BrandButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  isLoading?: boolean;
  children: React.ReactNode;
}

const variantClasses = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  outline: 'btn-outline',
  danger: 'btn-danger',
  success: 'btn-success',
  ghost: 'bg-transparent text-blue-600 hover:bg-blue-50 transition-colors duration-200',
};

const sizeClasses = {
  sm: 'px-4 py-2 text-xs',
  md: 'px-6 py-3 text-sm',
  lg: 'px-8 py-4 text-base',
};

/**
 * Brand-aware Button Component
 * Implements NRETech design system with gold accents and smooth transitions
 */
export const BrandButton = React.forwardRef<HTMLButtonElement, BrandButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      isLoading = false,
      disabled = false,
      children,
      className = '',
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${fullWidth ? 'w-full' : ''}
          ${isLoading ? 'opacity-75' : ''}
          ${className}
        `}
        {...props}
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <span className="w-4 h-4"><LogoLoader size="sm" /></span>
            {children}
          </div>
        ) : (
          children
        )}
      </button>
    );
  }
);

BrandButton.displayName = 'BrandButton';
