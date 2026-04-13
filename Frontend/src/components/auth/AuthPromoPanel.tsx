import { Award, ShieldCheck, Workflow, Sparkles } from 'lucide-react';

interface AuthPromoPanelProps {
  variant?: 'login' | 'register';
}

const features = [
  {
    icon: Workflow,
    title: 'Resume intelligence',
    description: 'Import, version, and deliver DOCX-ready resumes with collaborative editing.',
  },
  {
    icon: Sparkles,
    title: 'Pipeline mastery',
    description: 'Track requirements, interviews, and consultants with live status telemetry.',
  },
  {
    icon: ShieldCheck,
    title: 'Enterprise safeguards',
    description: 'JWT auth, granular roles, audit logs, and rate limiting keep every action protected.',
  },
];

export const AuthPromoPanel = ({ variant = 'login' }: AuthPromoPanelProps) => {
  const heroCopy =
    variant === 'login'
      ? 'Centralize resumes, CRM, interviews, and outreach in a single intelligent workspace built for premium staffing teams.'
      : 'Spin up your unified staffing command center with CRM, resume intelligence, and interview orchestration all working from day one.';

  return (
    <div className="relative min-h-full w-full overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Subtle gradient elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -left-40 -bottom-40 h-80 w-80 rounded-full bg-blue-500/5 blur-3xl" />
      </div>

      <div className="relative flex h-full flex-col gap-5 px-5 py-8 sm:gap-6 sm:px-7 sm:py-9 md:gap-7 md:px-9 md:py-10 lg:gap-8 lg:px-11 lg:py-11">
        {/* Header Section */}
        <div className="space-y-3 text-pretty sm:space-y-3.5 md:space-y-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 border border-blue-400/30 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-300">
            <Award className="h-3.5 w-3.5" aria-hidden="true" />
            NRETech OneHub
          </span>
          <h2 className="text-balance text-2xl font-bold leading-snug text-white sm:text-3xl md:text-2xl lg:text-3xl">
            Your talent operations, perfectly in orbit.
          </h2>
          <p className="max-w-lg text-balance text-xs leading-relaxed text-slate-300 sm:text-sm md:text-sm">
            {heroCopy}
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid gap-3 sm:gap-3.5 md:gap-4">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex items-start gap-3 rounded-lg bg-white/5 border border-white/10 p-3 backdrop-blur-sm transition-colors hover:bg-white/8 sm:rounded-lg sm:gap-3 sm:p-3 md:gap-3 md:p-3.5">
              <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-blue-500/20 border border-blue-400/30 text-blue-200 sm:h-10 sm:w-10 md:h-10 md:w-10">
                <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5 md:h-5 md:w-5" aria-hidden="true" />
              </div>
              <div className="space-y-0.5 text-pretty flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-200 sm:text-xs md:text-xs">{title}</p>
                <p className="text-xs leading-tight text-slate-300 sm:text-xs md:text-xs">{description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Text */}
        <div className="mt-auto pt-2 sm:pt-3 md:pt-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">
            One platform. Every mission-critical orbit.
          </p>
        </div>
      </div>
    </div>
  );
};
