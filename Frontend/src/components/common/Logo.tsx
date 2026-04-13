import { LogoCircular } from './LogoCircular';
import { LogoGeometric } from './LogoGeometric';
import { LogoMonogram } from './LogoMonogram';
import { LogoEnterprise } from './LogoEnterprise';

interface LogoProps {
  variant?: 'full' | 'icon' | 'horizontal';
  style?: 'circular' | 'geometric' | 'monogram' | 'enterprise';
  className?: string;
  isDark?: boolean;
  showTagline?: boolean;
  animate?: boolean;
  colorMode?: 'slate' | 'blue';
}

export const Logo = ({
  variant = 'full',
  style = 'circular',
  className = '',
  isDark = true,
  showTagline = false,
  animate = false,
  colorMode = 'slate',
}: LogoProps) => {
  // Render the selected logo style
  const renderLogo = () => {
    switch (style) {
      case 'geometric':
        return (
          <LogoGeometric
            variant={variant}
            className={className}
            isDark={isDark}
            showTagline={showTagline}
            animate={animate}
          />
        );
      case 'monogram':
        return (
          <LogoMonogram
            variant={variant}
            className={className}
            isDark={isDark}
            showTagline={showTagline}
            animate={animate}
          />
        );
      case 'enterprise':
        return (
          <LogoEnterprise
            variant={variant}
            className={className}
            isDark={isDark}
            showTagline={showTagline}
            animate={animate}
            colorMode={colorMode}
          />
        );
      case 'circular':
      default:
        return (
          <LogoCircular
            variant={variant}
            className={className}
            isDark={isDark}
            showTagline={showTagline}
            animate={animate}
          />
        );
    }
  };

  return <>{renderLogo()}</>;
};

// Export individual logo components for direct use
export { LogoCircular } from './LogoCircular';
export { LogoGeometric } from './LogoGeometric';
export { LogoMonogram } from './LogoMonogram';
export { LogoEnterprise } from './LogoEnterprise';
