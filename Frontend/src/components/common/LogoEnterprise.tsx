import { useState } from 'react';

interface LogoEnterpriseProps {
  variant?: 'full' | 'icon' | 'horizontal';
  className?: string;
  isDark?: boolean;
  showTagline?: boolean;
  animate?: boolean;
  colorMode?: 'slate' | 'blue';
}

// Flat, monochrome enterprise icon - NT monogram
const IconEnterprise = ({ 
  colorMode = 'slate',
  animate = false,
  isHovered = false,
  setIsHovered = () => {}
}: { 
  colorMode: string;
  animate: boolean;
  isHovered: boolean;
  setIsHovered: (val: boolean) => void;
}) => {
  // Enterprise colors - flat, no gradients
  const textColor = colorMode === 'blue' ? '#1e40af' : '#1e293b'; // Blue-700 or Slate-900
  const borderColor = colorMode === 'blue' ? '#3b82f6' : '#475569'; // Blue-500 or Slate-600
  
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      className={animate && isHovered ? 'animate-scale-subtle' : ''}
      onMouseEnter={() => animate && setIsHovered(true)}
      onMouseLeave={() => animate && setIsHovered(false)}
      style={{ position: 'relative', zIndex: 1 }}
    >
      {/* Simple square border - enterprise minimal style */}
      <rect
        x="10"
        y="10"
        width="100"
        height="100"
        fill="none"
        stroke={borderColor}
        strokeWidth="2"
        rx="4"
      />

      {/* Monogram text - NT */}
      <text
        x="60"
        y="70"
        fontSize="52"
        fontWeight="900"
        fontFamily="'Plus Jakarta Sans', 'Inter', sans-serif"
        fill={textColor}
        textAnchor="middle"
        dominantBaseline="middle"
        letterSpacing="-2"
      >
        NT
      </text>
    </svg>
  );
};

export const LogoEnterprise = ({
  variant = 'full',
  className = '',
  showTagline = false,
  animate = false,
  colorMode = 'slate'
}: LogoEnterpriseProps) => {
  const [isHovered, setIsHovered] = useState(false);

  if (variant === 'icon') {
    return (
      <div className={`flex items-center justify-center ${className || 'w-44 h-44'}`}>
        <IconEnterprise
          colorMode={colorMode}
          animate={animate}
          isHovered={isHovered}
          setIsHovered={setIsHovered}
        />
      </div>
    );
  }

  if (variant === 'horizontal') {
    const textColor = colorMode === 'blue' ? 'text-blue-700' : 'text-slate-900';
    const taglineColor = colorMode === 'blue' ? 'text-blue-600' : 'text-slate-700';

    return (
      <div
        className={`flex items-center gap-3 ${className}`}
        onMouseEnter={() => animate && setIsHovered(true)}
        onMouseLeave={() => animate && setIsHovered(false)}
      >
        <div className="flex-shrink-0 w-14 h-14">
          <IconEnterprise
            colorMode={colorMode}
            animate={animate}
            isHovered={isHovered}
            setIsHovered={setIsHovered}
          />
        </div>
        <div className="flex flex-col justify-center">
          <div className={`font-heading font-bold text-base tracking-tight leading-none ${textColor}`}>
            <span className="font-extrabold">NRE</span>
            <span className="font-semibold">Tech</span>
          </div>
          {showTagline && (
            <div className={`text-[10px] tracking-[0.15em] uppercase mt-0.5 ${taglineColor}`}>
              Enterprise
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full/Stacked variant (default)
  const textColor = colorMode === 'blue' ? 'text-blue-700' : 'text-slate-900';
  const taglineColor = colorMode === 'blue' ? 'text-blue-600' : 'text-slate-700';

  return (
    <div
      className={`flex flex-col items-center gap-3 ${className}`}
      onMouseEnter={() => animate && setIsHovered(true)}
      onMouseLeave={() => animate && setIsHovered(false)}
    >
      <div className="w-40 h-40">
        <IconEnterprise
          colorMode={colorMode}
          animate={animate}
          isHovered={isHovered}
          setIsHovered={setIsHovered}
        />
      </div>
      <div className="text-center">
        <div className={`font-heading font-bold text-xl tracking-tight leading-none ${textColor}`}>
          <span className="font-extrabold">NRE</span>
          <span className="font-semibold">Tech</span>
        </div>
        {showTagline && (
          <div className={`text-[10px] tracking-[0.15em] uppercase mt-1 ${taglineColor}`}>
            Enterprise
          </div>
        )}
      </div>
    </div>
  );
};
