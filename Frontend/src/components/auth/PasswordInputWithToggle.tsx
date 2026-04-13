import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export type PasswordInputWithToggleProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * Password input with a show/hide toggle. Adds right padding for the icon; include your full input `className` as usual.
 */
export const PasswordInputWithToggle = forwardRef<HTMLInputElement, PasswordInputWithToggleProps>(
  function PasswordInputWithToggle({ className = '', disabled, ...rest }, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative w-full">
        <input
          ref={ref}
          {...rest}
          type={visible ? 'text' : 'password'}
          disabled={disabled}
          className={`${className} pr-10`.trim()}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-40"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="h-4 w-4" strokeWidth={2} aria-hidden /> : <Eye className="h-4 w-4" strokeWidth={2} aria-hidden />}
        </button>
      </div>
    );
  }
);
