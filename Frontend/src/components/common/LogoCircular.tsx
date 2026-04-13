import { useState } from 'react';

interface LogoCircularProps {
  variant?: 'full' | 'icon' | 'horizontal';
  className?: string;
  isDark?: boolean;
  showTagline?: boolean;
  animate?: boolean;
}

interface IconCircularProps {
  goldColor: string;
  goldLight: string;
  subtleGold: string;
  animate: boolean;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  size?: number;
  svgClassName?: string;
}

// Icon-only circular logo with orbital rings and radial glow
const IconCircular = ({ 
  goldColor, 
  goldLight, 
  subtleGold, 
  animate, 
  isHovered, 
  onMouseEnter, 
  onMouseLeave,
  size,
  svgClassName
}: IconCircularProps) => {
  const outerOrbitClass = animate ? 'nretech-orbit-slow' : undefined;
  const middleOrbitClass = animate ? 'nretech-orbit-reverse' : undefined;
  const sparkOrbitClass = animate ? 'nretech-orbit-spark' : undefined;
  const nodePulseClass = animate ? 'nretech-node-pulse' : undefined;
  const glowBreatheClass = animate ? 'nretech-glow-breathe' : '';
  const backgroundOrbitClass = animate ? 'nretech-orbit-parallax' : undefined;

  const outerOrbitalNodes = [
    { cx: 100, cy: 25, r: 6, delay: '0s' },
    { cx: 164, cy: 100, r: 6, delay: '0.6s' },
    { cx: 100, cy: 175, r: 6, delay: '1.2s' },
    { cx: 36, cy: 100, r: 6, delay: '1.8s' },
  ];

  const middleOrbitalNodes = [
    { cx: 135, cy: 35, r: 5, delay: '0.3s' },
    { cx: 165, cy: 65, r: 5, delay: '0.9s' },
    { cx: 165, cy: 135, r: 5, delay: '1.5s' },
    { cx: 135, cy: 165, r: 5, delay: '2.1s' },
    { cx: 65, cy: 165, r: 5, delay: '2.7s' },
    { cx: 35, cy: 135, r: 5, delay: '3.3s' },
    { cx: 35, cy: 65, r: 5, delay: '3.9s' },
    { cx: 65, cy: 35, r: 5, delay: '4.5s' },
  ];

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Radial gradient glow background */}
      <div 
        className={`absolute inset-0 rounded-full ${glowBreatheClass}`.trim()}
        style={{
          background: `radial-gradient(circle, rgba(234,179,8,0.25) 0%, transparent 70%)`,
          filter: 'blur(10px)',
          transform: 'scale(1.2)',
          pointerEvents: 'none'
        }}
      />
      
      <svg
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
        {...(typeof size === 'number' ? { width: size, height: size } : {})}
        className={`${svgClassName ?? ''} ${animate && isHovered ? 'animate-spin-slow' : ''}`.trim()}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{ position: 'relative', zIndex: 1 }}
      >
      <defs>
        <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={goldLight} />
          <stop offset="50%" stopColor={goldColor} />
          <stop offset="100%" stopColor="#b8960f" />
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background circle */}
      <g className={backgroundOrbitClass}>
        <circle cx="100" cy="100" r="95" fill="none" stroke={subtleGold} strokeWidth="1" opacity="0.35" />
      </g>

      {/* Outer orbital ring and nodes */}
      <g className={outerOrbitClass}>
        <circle 
          cx="100" 
          cy="100" 
          r="75" 
          fill="none" 
          stroke={goldColor} 
          strokeWidth="2" 
          opacity="0.55"
        />
        {outerOrbitalNodes.map(({ cx, cy, r, delay }, index) => (
          <circle 
            key={`outer-node-${index}`}
            cx={cx}
            cy={cy}
            r={r}
            fill={goldColor}
            opacity={0.82}
            className={nodePulseClass}
            style={animate ? { animationDelay: delay } : undefined}
          />
        ))}
      </g>

      {/* Middle orbital ring and nodes */}
      <g className={middleOrbitClass}>
        <circle 
          cx="100" 
          cy="100" 
          r="55" 
          fill="none" 
          stroke={goldColor} 
          strokeWidth="2.5" 
          opacity="0.72"
        />
        {middleOrbitalNodes.map(({ cx, cy, r, delay }, index) => (
          <circle 
            key={`middle-node-${index}`}
            cx={cx}
            cy={cy}
            r={r}
            fill={goldColor}
            opacity={0.7}
            className={nodePulseClass}
            style={animate ? { animationDelay: delay } : undefined}
          />
        ))}
      </g>

      {/* Inner orbital ring */}
      <g className={animate ? 'nretech-orbit-inner' : undefined}>
        <circle 
          cx="100" 
          cy="100" 
          r="35" 
          fill="none" 
          stroke={goldColor} 
          strokeWidth="2" 
          opacity="0.5"
        />
      </g>

      {/* Central sphere with glow and pulse animation */}
      <circle 
        cx="100" 
        cy="100" 
        r="18" 
        fill="url(#goldGradient)" 
        filter="url(#glow)"
        className={animate ? 'nretech-dot-pulse' : undefined}
      />

      {/* Inner luminous core */}
      <circle 
        cx="100" 
        cy="100" 
        r="10" 
        fill={goldLight} 
        opacity={animate ? 0.95 : 0.9}
        className={animate ? 'nretech-core-glow' : undefined}
      />
      <circle 
        cx="100" 
        cy="100" 
        r="5" 
        fill="#fef08a" 
        opacity={animate ? 0.98 : 0.92}
      />

      {/* Orbiting spark trail */}
      {animate && (
        <g className={sparkOrbitClass}>
          <circle cx="100" cy="28" r="4" fill={goldLight} opacity="0.95" />
          <circle cx="100" cy="28" r="7" fill="none" stroke={`rgba(234,179,8,0.4)`} strokeWidth="1" opacity="0.8" />
        </g>
      )}
      </svg>
    </div>
  );
};
  
  export const LogoCircular = ({ 
    variant = 'full', 
    className = '', 
    isDark = true,
    showTagline = false,
    animate = false
  }: LogoCircularProps) => {
    const [isHovered, setIsHovered] = useState(false);
    
    // Muted gold colors for light mode (enterprise look)
    const goldColor = isDark ? '#d4af37' : '#a89968';
    const goldLight = isDark ? '#eab308' : '#c4b59a';
    const subtleGold = isDark ? 'rgba(212, 175, 55, 0.3)' : 'rgba(160, 153, 104, 0.15)';
  
    if (variant === 'icon') {
      return (
        <div className={`flex items-center justify-center ${className || 'w-44 h-44'}`}>
          <IconCircular 
            goldColor={goldColor}
            goldLight={goldLight}
            subtleGold={subtleGold}
            animate={animate}
            isHovered={isHovered}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            svgClassName="w-full h-full"
          />
        </div>
      );
    }

  if (variant === 'horizontal') {
    return (
      <div 
        className={`flex items-center gap-2.5 ${className}`} 
        onMouseEnter={() => animate && setIsHovered(true)} 
        onMouseLeave={() => animate && setIsHovered(false)}
      >
        <div className="flex-shrink-0 relative top-[1px]">
          <IconCircular 
            goldColor={goldColor}
            goldLight={goldLight}
            subtleGold={subtleGold}
            animate={animate}
            isHovered={isHovered}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            size={58}
          />
        </div>
        <div className="flex flex-col justify-center">
          <div 
            className={`font-heading font-bold text-lg tracking-tight leading-[1.1] ${
              isDark ? 'text-amber-400' : 'text-gray-900'
            }`}
          >
            <span className="font-extrabold">NRE</span>
            <span className="font-semibold">Tech</span>
          </div>
          {showTagline && (
            <div 
              className={`text-[10px] tracking-[0.22em] uppercase leading-[1.25] ${
                isDark ? 'text-gray-300/80' : 'text-gray-500'
              }`}
            >
              IT'S TIME TO MAKE IT
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full/Stacked variant (default)
  return (
    <div 
      className={`flex flex-col items-center gap-2 ${className}`} 
      onMouseEnter={() => animate && setIsHovered(true)} 
      onMouseLeave={() => animate && setIsHovered(false)}
    >
      <IconCircular 
        goldColor={goldColor}
        goldLight={goldLight}
        subtleGold={subtleGold}
        animate={animate}
        isHovered={isHovered}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        size={160}
      />
      <div className="text-center">
        <div 
          className={`font-heading font-bold text-2xl tracking-tight leading-[1.1] ${
            isDark ? 'text-amber-400' : 'text-gray-900'
          }`}
        >
          <span className="font-extrabold">NRE</span>
          <span className="font-semibold">Tech</span>
        </div>
        {showTagline && (
          <div 
            className={`text-[10px] tracking-[0.22em] uppercase mt-1 leading-[1.25] ${
              isDark ? 'text-gray-300/80' : 'text-gray-500'
            }`}
          >
            IT'S TIME TO MAKE IT
          </div>
        )}
      </div>
    </div>
  );
};
