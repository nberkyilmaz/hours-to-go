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

/** The app mark: a progress ring closing on a heading line. */
export const Mark = () => (
  <svg width={28} height={28} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="#1d4ed8" />
    <circle cx="16" cy="16" r="9" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="3" />
    <path d="M16 7a9 9 0 1 1-9 9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    <circle cx="16" cy="16" r="2.5" fill="#fff" />
  </svg>
);
