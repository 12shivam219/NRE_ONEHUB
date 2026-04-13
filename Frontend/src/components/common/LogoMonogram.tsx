import { useState } from 'react';

interface LogoMonogramProps {
  variant?: 'full' | 'icon' | 'horizontal';
  className?: string;
  isDark?: boolean;
  showTagline?: boolean;
  animate?: boolean;
}

interface IconMonogramProps {
  animate: boolean;
  isHovered: boolean;
  setIsHovered: (val: boolean) => void;
  goldColor: string;
  goldLight: string;
  darkAlt: string;
}

// Icon: NT Monogram in shield/badge shape
const IconMonogram = ({ animate, isHovered, setIsHovered, goldColor, goldLight, darkAlt }: IconMonogramProps) => (
    <svg
      viewBox="0 0 200 200"
      width={160}
      height={160}
      xmlns="http://www.w3.org/2000/svg"
      className={animate && isHovered ? 'animate-scale-subtle' : ''}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <defs>
        <linearGradient id="monoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={goldLight} />
          <stop offset="50%" stopColor={goldColor} />
          <stop offset="100%" stopColor="#b8960f" />
        </linearGradient>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={darkAlt} />
          <stop offset="100%" stopColor="#0d1117" />
        </linearGradient>
        <filter id="monoGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Shield background */}
      <path
        d="M 100 25 L 150 50 L 150 105 Q 100 155 100 155 Q 100 155 50 105 L 50 50 Z"
        fill="url(#bgGradient)"
        stroke={goldColor}
        strokeWidth="2.5"
      />

      {/* Inner shield highlight */}
      <path
        d="M 100 30 L 145 52 L 145 105 Q 100 150 100 150 Q 100 150 55 105 L 55 52 Z"
        fill="none"
        stroke={goldColor}
        strokeWidth="1.5"
        opacity="0.5"
      />

      {/* Monogram text - NT in gold */}
      <text
        x="100"
        y="110"
        fontSize="70"
        fontWeight="900"
        fontFamily="'Plus Jakarta Sans', 'Inter', sans-serif"
        fill="url(#monoGradient)"
        textAnchor="middle"
        dominantBaseline="middle"
        filter="url(#monoGlow)"
        letterSpacing="-3"
      >
        NT
      </text>

      {/* Decorative corner accents */}
      <circle cx="60" cy="35" r="4" fill={goldColor} opacity="0.6" />
      <circle cx="140" cy="35" r="4" fill={goldColor} opacity="0.6" />

      {/* Bottom accent line */}
      <line
        x1="75"
        y1="145"
        x2="125"
        y2="145"
        stroke={goldColor}
        strokeWidth="2"
        opacity="0.7"
      />

      {/* Subtle reflection on shield */}
      <ellipse cx="95" cy="80" rx="12" ry="8" fill="white" opacity="0.15" />
    </svg>
  );

export const LogoMonogram = ({ 
  variant = 'full', 
  className = '', 
  isDark = true,
  showTagline = false,
  animate = false
}: LogoMonogramProps) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const goldColor = '#d4af37';
  const goldLight = '#eab308';
  const darkAlt = '#1a1f27';
  const textColor = isDark ? '#ffffff' : '#0d1117';

  if (variant === 'icon') {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <IconMonogram animate={animate} isHovered={isHovered} setIsHovered={setIsHovered} goldColor={goldColor} goldLight={goldLight} darkAlt={darkAlt} />
      </div>
    );
  }

  if (variant === 'horizontal') {
    return (
      <div className={`flex items-center gap-3 ${className}`} onMouseEnter={() => animate && setIsHovered(true)} onMouseLeave={() => animate && setIsHovered(false)}>
        <div className={`flex-shrink-0 ${animate && isHovered ? 'animate-scale-subtle' : ''}`}>
          <svg
            viewBox="0 0 200 200"
            width={48}
            height={48}
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="monoGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={goldLight} />
                <stop offset="50%" stopColor={goldColor} />
                <stop offset="100%" stopColor="#b8960f" />
              </linearGradient>
              <linearGradient id="bgGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={darkAlt} />
                <stop offset="100%" stopColor="#0d1117" />
              </linearGradient>
              <filter id="monoGlow2" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path d="M 100 25 L 150 50 L 150 105 Q 100 155 100 155 Q 100 155 50 105 L 50 50 Z" fill="url(#bgGradient2)" stroke={goldColor} strokeWidth="2.5" />
            <path d="M 100 30 L 145 52 L 145 105 Q 100 150 100 150 Q 100 150 55 105 L 55 52 Z" fill="none" stroke={goldColor} strokeWidth="1.5" opacity="0.5" />
            <text x="100" y="110" fontSize="70" fontWeight="900" fontFamily="'Plus Jakarta Sans', 'Inter', sans-serif" fill="url(#monoGradient2)" textAnchor="middle" dominantBaseline="middle" filter="url(#monoGlow2)" letterSpacing="-3">
              NT
            </text>
          </svg>
        </div>
        <div className="flex flex-col">
          <div className="font-bold text-lg tracking-tight" style={{ color: goldColor }}>
            NRETech
          </div>
          {showTagline && (
            <div className="text-xs tracking-widest uppercase" style={{ color: textColor, opacity: 0.7 }}>
              IT'S TIME TO MAKE IT
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full variant (default)
  return (
    <div className={`flex flex-col items-center gap-4 ${className}`} onMouseEnter={() => animate && setIsHovered(true)} onMouseLeave={() => animate && setIsHovered(false)}>
      <IconMonogram animate={animate} isHovered={isHovered} setIsHovered={setIsHovered} goldColor={goldColor} goldLight={goldLight} darkAlt={darkAlt} />
      <div className="text-center">
        <div className="font-bold text-2xl tracking-tight" style={{ color: goldColor }}>
          NRETech
        </div>
        {showTagline && (
          <div className="text-xs tracking-widest uppercase mt-2" style={{ color: textColor, opacity: 0.7 }}>
            IT'S TIME TO MAKE IT
          </div>
        )}
      </div>
    </div>
  );
};
