import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 12l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </Base>
);
export const IconSparkle = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z" />
    <path d="M19 15l.8 1.8L21.6 18l-1.8.7L19 21l-.7-1.8L16.4 18l1.8-.7L19 15z" />
  </Base>
);
export const IconMessage = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Base>
);
export const IconDB = (p: IconProps) => (
  <Base {...p}>
    <ellipse cx={12} cy={5} rx={8} ry={3} />
    <path d="M20 12c0 1.66-3.58 3-8 3s-8-1.34-8-3" />
    <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
  </Base>
);
export const IconLayout = (p: IconProps) => (
  <Base {...p}>
    <rect x={3} y={3} width={18} height={18} rx={2} />
    <path d="M3 9h18M9 21V9" />
  </Base>
);
export const IconChevL = (p: IconProps) => (
  <Base {...p}>
    <polyline points="15 18 9 12 15 6" />
  </Base>
);
export const IconChevR = (p: IconProps) => (
  <Base {...p}>
    <polyline points="9 18 15 12 9 6" />
  </Base>
);
export const IconPlus = (p: IconProps) => (
  <Base {...p}>
    <line x1={12} y1={5} x2={12} y2={19} />
    <line x1={5} y1={12} x2={19} y2={12} />
  </Base>
);
export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx={11} cy={11} r={7} />
    <line x1={21} y1={21} x2={16.65} y2={16.65} />
  </Base>
);
export const IconSend = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 12l16-8-6 16-2-7-8-1z" />
  </Base>
);
export const IconStop = (p: IconProps) => (
  <Base {...p}>
    <rect x={6} y={6} width={12} height={12} rx={1.5} />
  </Base>
);
export const IconWrench = (p: IconProps) => (
  <Base {...p}>
    <path d="M14.7 6.3a4 4 0 1 1 3 3L18 10l-2 2-2-2 1-1" />
    <path d="M13 10L4 19l1.5 1.5L14.5 11.5" />
  </Base>
);
export const IconTable = (p: IconProps) => (
  <Base {...p}>
    <rect x={3} y={4} width={18} height={16} rx={1.5} />
    <path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
  </Base>
);
export const IconBar = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20V10M10 20V4M16 20V14M22 20V8" />
  </Base>
);
export const IconLine = (p: IconProps) => (
  <Base {...p}>
    <polyline points="3 17 9 11 13 15 21 5" />
  </Base>
);
export const IconPie = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 12a9 9 0 1 1-9-9" />
    <path d="M21 12h-9V3" />
  </Base>
);
export const IconHash = (p: IconProps) => (
  <Base {...p}>
    <line x1={4} y1={9} x2={20} y2={9} />
    <line x1={4} y1={15} x2={20} y2={15} />
    <line x1={10} y1={3} x2={8} y2={21} />
    <line x1={16} y1={3} x2={14} y2={21} />
  </Base>
);
export const IconSettings = (p: IconProps) => (
  <Base {...p}>
    <circle cx={12} cy={12} r={3} />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Base>
);
export const IconClose = (p: IconProps) => (
  <Base {...p}>
    <line x1={18} y1={6} x2={6} y2={18} />
    <line x1={6} y1={6} x2={18} y2={18} />
  </Base>
);
export const IconArrowUp = (p: IconProps) => (
  <Base {...p}>
    <line x1={12} y1={19} x2={12} y2={5} />
    <polyline points="5 12 12 5 19 12" />
  </Base>
);
export const IconArrowDown = (p: IconProps) => (
  <Base {...p}>
    <line x1={12} y1={5} x2={12} y2={19} />
    <polyline points="19 12 12 19 5 12" />
  </Base>
);
export const IconArrowR = (p: IconProps) => (
  <Base {...p}>
    <line x1={5} y1={12} x2={19} y2={12} />
    <polyline points="12 5 19 12 12 19" />
  </Base>
);
export const IconDots = (p: IconProps) => (
  <Base {...p}>
    <circle cx={5} cy={12} r={1.5} />
    <circle cx={12} cy={12} r={1.5} />
    <circle cx={19} cy={12} r={1.5} />
  </Base>
);
export const IconEdit = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </Base>
);
export const IconTrash = (p: IconProps) => (
  <Base {...p}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </Base>
);
export const IconDownload = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v12" />
    <polyline points="7 10 12 15 17 10" />
    <path d="M5 21h14" />
  </Base>
);
export const IconSpinner = ({ style, ...rest }: IconProps) => (
  <Base {...rest} style={{ animation: "spin 1s linear infinite", ...style }}>
    <path d="M12 3a9 9 0 0 1 9 9" />
  </Base>
);
export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <polyline points="20 6 9 17 4 12" />
  </Base>
);
export const IconAlert = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 2L2 21h20L12 2z" />
    <line x1={12} y1={9} x2={12} y2={14} />
    <circle cx={12} cy={17.5} r={0.5} />
  </Base>
);
export const IconFilter = (p: IconProps) => (
  <Base {...p}>
    <polygon points="3 4 21 4 14 12 14 20 10 18 10 12 3 4" />
  </Base>
);
export const IconClock = (p: IconProps) => (
  <Base {...p}>
    <circle cx={12} cy={12} r={9} />
    <polyline points="12 7 12 12 15 14" />
  </Base>
);
export const IconMenu = (p: IconProps) => (
  <Base {...p}>
    <line x1={3} y1={6} x2={21} y2={6} />
    <line x1={3} y1={12} x2={21} y2={12} />
    <line x1={3} y1={18} x2={21} y2={18} />
  </Base>
);
