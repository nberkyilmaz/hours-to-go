const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const ProgressIcon = () => (
  <svg {...base}>
    <path d="M12 3a9 9 0 1 0 9 9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const BookIcon = () => (
  <svg {...base}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 21V5M9 7h6M9 11h6" />
  </svg>
);

export const UserIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

export const LockIcon = ({ open }: { open: boolean }) => (
  <svg {...base} width={18} height={18}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d={open ? 'M8 11V7a4 4 0 0 1 7.5-2' : 'M8 11V7a4 4 0 0 1 8 0v4'} />
  </svg>
);

export const CheckIcon = () => (
  <svg {...base} width={14} height={14} strokeWidth={3}>
    <path d="M5 12l5 5 9-10" />
  </svg>
);

export const PlusIcon = () => (
  <svg {...base} width={18} height={18}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** A page of the standard, for "every requirement cited". */
export const CiteIcon = () => (
  <svg {...base}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M14 3v5h5M9 13h7M9 17h5" />
  </svg>
);

export const CloudCheckIcon = () => (
  <svg {...base} width={16} height={16}>
    <path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.5 18z" />
    <path d="M9.5 13.5l2 2 3.5-4" />
  </svg>
);

/** The app mark: a progress ring closing in cyan, the cockpit's set-value colour, on the graphite panel. */
export const Mark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <rect x=".5" y=".5" width="31" height="31" rx="7.5" fill="#111827" stroke="rgba(255,255,255,.16)" />
    <circle cx="16" cy="16" r="9" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="3" />
    <path d="M16 7a9 9 0 1 1-9 9" fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" />
    <circle cx="16" cy="16" r="2.5" fill="#fff" />
  </svg>
);
