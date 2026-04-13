import { useState } from 'react';

interface LogoGeometricProps {
  variant?: 'full' | 'icon' | 'horizontal';
  className?: string;
  isDark?: boolean;
  showTagline?: boolean;
  animate?: boolean;
}

interface IconGeometricProps {
  animate: boolean;
  isHovered: boolean;
  setIsHovered: (val: boolean) => void;
  goldColor: string;
  goldLight: string;
}

const IconGeometric = ({ animate, isHovered, setIsHovered, goldColor, goldLight }: IconGeometricProps) => (
    <svg
      viewBox="0 0 200 200"
      width={160}
      height={160}
      xmlns="http://www.w3.org/2000/svg"
      className={animate && isHovered ? 'animate-pulse-gold' : ''}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <defs>
        <linearGradient id="netGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={goldLight} />
          <stop offset="50%" stopColor={goldColor} />
          <stop offset="100%" stopColor="#b8960f" />
        </linearGradient>
        <filter id="netGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        d="M 100 30 L 145 55 L 145 105 L 100 130 L 55 105 L 55 55 Z"
        fill="none"
        stroke={goldColor}
        strokeWidth="2.5"
        opacity="0.6"
      />

      <path
        d="M 100 50 L 130 70 L 130 110 L 100 130 L 70 110 L 70 70 Z"
        fill="none"
        stroke={goldColor}
        strokeWidth="2"
        opacity="0.8"
      />

      <circle cx="100" cy="30" r="8" fill="url(#netGradient)" filter="url(#netGlow)" />
      <circle cx="145" cy="55" r="8" fill="url(#netGradient)" filter="url(#netGlow)" />
      <circle cx="145" cy="105" r="8" fill="url(#netGradient)" filter="url(#netGlow)" />
      <circle cx="100" cy="130" r="8" fill="url(#netGradient)" filter="url(#netGlow)" />
      <circle cx="55" cy="105" r="8" fill="url(#netGradient)" filter="url(#netGlow)" />
      <circle cx="55" cy="55" r="8" fill="url(#netGradient)" filter="url(#netGlow)" />

      <circle cx="100" cy="80" r="10" fill="url(#netGradient)" filter="url(#netGlow)" />

      <line x1="100" y1="80" x2="100" y2="30" stroke={goldColor} strokeWidth="1.5" opacity="0.4" />
      <line x1="100" y1="80" x2="145" y2="55" stroke={goldColor} strokeWidth="1.5" opacity="0.4" />
      <line x1="100" y1="80" x2="145" y2="105" stroke={goldColor} strokeWidth="1.5" opacity="0.4" />
      <line x1="100" y1="80" x2="100" y2="130" stroke={goldColor} strokeWidth="1.5" opacity="0.4" />
      <line x1="100" y1="80" x2="55" y2="105" stroke={goldColor} strokeWidth="1.5" opacity="0.4" />
      <line x1="100" y1="80" x2="55" y2="55" stroke={goldColor} strokeWidth="1.5" opacity="0.4" />

      <path
        d="M 100 30 L 110 50 L 90 50 Z"
        fill={goldColor}
        opacity="0.5"
      />
      <path
        d="M 145 105 L 135 115 L 145 125 Z"
        fill={goldColor}
        opacity="0.5"
      />

      <ellipse cx="110" cy="70" rx="6" ry="4" fill="white" opacity="0.3" />
    </svg>
  );

export const LogoGeometric = ({ 
  variant = 'full', 
  className = '', 
  isDark = true,
  showTagline = false,
  animate = false
}: LogoGeometricProps) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const goldColor = '#d4af37';
  const goldLight = '#eab308';
  const textColor = isDark ? '#ffffff' : '#0d1117';

  if (variant === 'icon') {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <IconGeometric animate={animate} isHovered={isHovered} setIsHovered={setIsHovered} goldColor={goldColor} goldLight={goldLight} />
      </div>
    );
  }

  if (variant === 'horizontal') {
    return (
      <div className={`flex items-center gap-3 ${className}`} onMouseEnter={() => animate && setIsHovered(true)} onMouseLeave={() => animate && setIsHovered(false)}>
        <div className={`flex-shrink-0 ${animate && isHovered ? 'animate-pulse-gold' : ''}`}>
          <svg
            viewBox="0 0 200 200"
            width={48}
            height={48}
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="netGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={goldLight} />
                <stop offset="50%" stopColor={goldColor} />
                <stop offset="100%" stopColor="#b8960f" />
              </linearGradient>
              <filter id="netGlow2" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path d="M 100 30 L 145 55 L 145 105 L 100 130 L 55 105 L 55 55 Z" fill="none" stroke={goldColor} strokeWidth="2.5" opacity="0.6" />
            <path d="M 100 50 L 130 70 L 130 110 L 100 130 L 70 110 L 70 70 Z" fill="none" stroke={goldColor} strokeWidth="2" opacity="0.8" />
            <circle cx="100" cy="30" r="8" fill="url(#netGradient2)" filter="url(#netGlow2)" />
            <circle cx="145" cy="55" r="8" fill="url(#netGradient2)" filter="url(#netGlow2)" />
            <circle cx="145" cy="105" r="8" fill="url(#netGradient2)" filter="url(#netGlow2)" />
            <circle cx="100" cy="130" r="8" fill="url(#netGradient2)" filter="url(#netGlow2)" />
            <circle cx="55" cy="105" r="8" fill="url(#netGradient2)" filter="url(#netGlow2)" />
            <circle cx="55" cy="55" r="8" fill="url(#netGradient2)" filter="url(#netGlow2)" />
            <circle cx="100" cy="80" r="10" fill="url(#netGradient2)" filter="url(#netGlow2)" />
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

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`} onMouseEnter={() => animate && setIsHovered(true)} onMouseLeave={() => animate && setIsHovered(false)}>
      <IconGeometric animate={animate} isHovered={isHovered} setIsHovered={setIsHovered} goldColor={goldColor} goldLight={goldLight} />
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
