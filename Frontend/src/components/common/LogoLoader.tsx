/**
 * Logo Loader Component
 * Brand-styled loader using the NREtech circular logo with smooth animation
 */

interface LogoLoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  label?: string;
  showText?: boolean;
  fullScreen?: boolean;
}

export const LogoLoader = ({
  size = 'md',
  className = '',
  label = 'Loading',
  showText = false,
  fullScreen = false,
}: LogoLoaderProps) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  };

  const logoUrl = '/logos/nretech-circular-icon.svg';

  const loaderContent = (
    <div className="flex flex-col items-center justify-center gap-4">
      <div
        className={`${sizeClasses[size]} ${className} animate-spin`}
        role="status"
        aria-label={label}
        style={{
          animationDuration: '2s',
        }}
      >
        <img
          src={logoUrl}
          alt="Loading"
          className="w-full h-full object-contain"
          style={{
            filter: 'drop-shadow(0 0 8px rgba(234, 179, 8, 0.3))',
          }}
        />
      </div>
      {showText && (
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
        </div>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-950 bg-opacity-95 dark:bg-opacity-95 flex items-center justify-center z-50">
        {loaderContent}
      </div>
    );
  }

  return loaderContent;
};
