import React from 'react';

interface SvgRenderProps {
  className?: string;
  titleId?: string;
  descId?: string;
  title?: string;
  desc?: string;
}

export function SvgNewLaunch({ className, titleId, descId, title, desc }: SvgRenderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      fill="none"
      className={className}
      aria-labelledby={titleId && descId ? `${titleId} ${descId}` : titleId || undefined}
    >
      {title && <title id={titleId}>{title}</title>}
      {desc && <desc id={descId}>{desc}</desc>}
      <rect width="240" height="180" rx="12" className="fill-[#FAFAF8] dark:fill-[#18181B]" />
      <circle cx="180" cy="50" r="32" className="fill-[#E85D3F]/10 dark:fill-[#E85D3F]/20" />
      <path d="M20 150H220" className="stroke-[#111111]/20 dark:stroke-white/20" strokeWidth="1.75" strokeLinecap="round" />
      <rect x="50" y="45" width="65" height="105" rx="3" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" strokeLinejoin="round" />
      <rect x="62" y="58" width="16" height="12" rx="1.5" className="fill-[#E85D3F]/20 stroke-[#E85D3F]" strokeWidth="1.25" />
      <rect x="86" y="58" width="16" height="12" rx="1.5" className="fill-[#111111]/5 dark:fill-white/10 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <rect x="62" y="78" width="16" height="12" rx="1.5" className="fill-[#111111]/5 dark:fill-white/10 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <rect x="86" y="78" width="16" height="12" rx="1.5" className="fill-[#111111]/5 dark:fill-white/10 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <rect x="62" y="98" width="16" height="12" rx="1.5" className="fill-[#111111]/5 dark:fill-white/10 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <rect x="86" y="98" width="16" height="12" rx="1.5" className="fill-[#E85D3F]/20 stroke-[#E85D3F]" strokeWidth="1.25" />
      <rect x="74" y="126" width="18" height="24" rx="1" className="fill-[#111111] dark:fill-white/90" />
      <path d="M42 64H50" className="stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M42 84H50" className="stroke-[#E85D3F]" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M42 104H50" className="stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M125 35L150 15H195" className="stroke-[#E85D3F]" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M140 35V150" className="stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M140 25L132 35M140 45L132 55M140 65L132 75M140 85L132 95M140 105L132 115" className="stroke-[#111111]/40 dark:stroke-white/30" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M175 15V45L182 52H168L175 45" className="stroke-[#E85D3F]" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M195 40L198 48L206 51L198 54L195 62L192 54L184 51L192 48Z" className="fill-[#E85D3F]" />
      <circle cx="160" cy="70" r="2.5" className="fill-[#E85D3F]" />
      <path d="M26 150C26 142 32 136 40 136C48 136 54 142 54 150" className="fill-[#111111]/10 dark:fill-white/10 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.5" />
    </svg>
  );
}

export function SvgBuyResale({ className, titleId, descId, title, desc }: SvgRenderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      fill="none"
      className={className}
      aria-labelledby={titleId && descId ? `${titleId} ${descId}` : titleId || undefined}
    >
      {title && <title id={titleId}>{title}</title>}
      {desc && <desc id={descId}>{desc}</desc>}
      <rect width="240" height="180" rx="12" className="fill-[#FAFAF8] dark:fill-[#18181B]" />
      <circle cx="70" cy="55" r="30" className="fill-[#E85D3F]/10 dark:fill-[#E85D3F]/20" />
      <path d="M20 150H220" className="stroke-[#111111]/20 dark:stroke-white/20" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M40 150V90L85 55L130 90V150H40Z" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M85 55L130 90H170L135 55H85Z" className="fill-[#111111]/5 dark:fill-white/5 stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M130 90V150H170V90" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" strokeLinejoin="round" />
      <rect x="58" y="95" width="22" height="20" rx="2" className="fill-[#111111]/5 dark:fill-white/5 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.5" />
      <line x1="69" y1="95" x2="69" y2="115" className="stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <line x1="58" y1="105" x2="80" y2="105" className="stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <rect x="96" y="112" width="18" height="38" rx="1" className="fill-[#111111] dark:fill-white/90" />
      <circle cx="165" cy="55" r="14" className="fill-white dark:fill-[#27272A] stroke-[#E85D3F]" strokeWidth="2" />
      <circle cx="165" cy="55" r="6" className="fill-[#E85D3F]/20 stroke-[#E85D3F]" strokeWidth="1.5" />
      <path d="M179 55H208V63H202V55H196V61H190V55H179" className="stroke-[#E85D3F]" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="188" cy="108" r="7" className="fill-[#111111] dark:fill-white/90" />
      <path d="M176 150V130C176 123 181 119 188 119C195 119 200 123 200 130V150" className="fill-[#111111] dark:fill-white/90 stroke-[#111111] dark:stroke-white/90" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M176 130L168 138" className="stroke-[#111111] dark:stroke-white/60" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SvgRent({ className, titleId, descId, title, desc }: SvgRenderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      fill="none"
      className={className}
      aria-labelledby={titleId && descId ? `${titleId} ${descId}` : titleId || undefined}
    >
      {title && <title id={titleId}>{title}</title>}
      {desc && <desc id={descId}>{desc}</desc>}
      <rect width="240" height="180" rx="12" className="fill-[#FAFAF8] dark:fill-[#18181B]" />
      <circle cx="170" cy="50" r="28" className="fill-[#E85D3F]/10 dark:fill-[#E85D3F]/20" />
      <path d="M20 150H220" className="stroke-[#111111]/20 dark:stroke-white/20" strokeWidth="1.75" strokeLinecap="round" />
      <rect x="50" y="55" width="80" height="95" rx="3" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" strokeLinejoin="round" />
      <rect x="62" y="68" width="18" height="15" rx="1.5" className="fill-[#111111]/5 dark:fill-white/5 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <rect x="94" y="68" width="22" height="15" rx="1.5" className="fill-[#E85D3F]/15 stroke-[#E85D3F]" strokeWidth="1.25" />
      <rect x="62" y="92" width="18" height="15" rx="1.5" className="fill-[#111111]/5 dark:fill-white/5 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <rect x="94" y="92" width="22" height="15" rx="1.5" className="fill-[#111111]/5 dark:fill-white/5 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <rect x="76" y="120" width="16" height="30" rx="1" className="fill-[#111111] dark:fill-white/90" />
      <rect x="150" y="118" width="34" height="32" rx="2" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" />
      <path d="M150 126H184" className="stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <path d="M167 126V150" className="stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <path d="M158 118L163 110H171L176 118" className="fill-[#111111]/5 dark:fill-white/5 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <circle cx="166" cy="74" r="10" className="fill-white dark:fill-[#27272A] stroke-[#E85D3F]" strokeWidth="1.75" />
      <path d="M176 74H196V80H192V74H186V78H182V74" className="stroke-[#E85D3F]" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M34 150V136M34 142C30 140 26 142 26 144M34 138C38 136 42 138 42 140" className="stroke-[#218C5A]" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SvgLocationDiscovery({ className, titleId, descId, title, desc }: SvgRenderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      fill="none"
      className={className}
      aria-labelledby={titleId && descId ? `${titleId} ${descId}` : titleId || undefined}
    >
      {title && <title id={titleId}>{title}</title>}
      {desc && <desc id={descId}>{desc}</desc>}
      <rect width="240" height="180" rx="12" className="fill-[#FAFAF8] dark:fill-[#18181B]" />
      <circle cx="120" cy="70" r="40" className="fill-[#E85D3F]/10 dark:fill-[#E85D3F]/20" />
      <path d="M30 135L100 100L210 125" className="stroke-[#111111] dark:stroke-white/60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M100 100L100 45" className="stroke-[#111111] dark:stroke-white/40" strokeWidth="1.5" strokeDasharray="3 3" strokeLinecap="round" />
      <path d="M40 90L100 100L160 145" className="stroke-[#111111]/30 dark:stroke-white/30" strokeWidth="1.25" strokeLinecap="round" />
      <rect x="45" y="65" width="34" height="42" rx="2" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.5" />
      <rect x="52" y="73" width="8" height="8" rx="1" className="fill-[#111111]/10 dark:fill-white/10" />
      <rect x="64" y="73" width="8" height="8" rx="1" className="fill-[#111111]/10 dark:fill-white/10" />
      <rect x="52" y="87" width="8" height="8" rx="1" className="fill-[#111111]/10 dark:fill-white/10" />
      <rect x="64" y="87" width="8" height="8" rx="1" className="fill-[#111111]/10 dark:fill-white/10" />
      <rect x="155" y="75" width="42" height="50" rx="2" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.5" />
      <rect x="164" y="85" width="10" height="10" rx="1" className="fill-[#111111]/10 dark:fill-white/10" />
      <rect x="180" y="85" width="10" height="10" rx="1" className="fill-[#111111]/10 dark:fill-white/10" />
      <g transform="translate(105, 30)">
        <path d="M15 0C6.716 0 0 6.716 0 15C0 26.25 15 42 15 42C15 42 30 26.25 30 15C30 6.716 23.284 0 15 0Z" className="fill-[#E85D3F] stroke-white" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="15" cy="15" r="5.5" className="fill-white" />
      </g>
      <ellipse cx="120" cy="74" rx="24" ry="10" className="stroke-[#E85D3F]" strokeWidth="1.5" strokeDasharray="3 3" strokeOpacity="0.6" />
    </svg>
  );
}

export function SvgReraVerified({ className, titleId, descId, title, desc }: SvgRenderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      fill="none"
      className={className}
      aria-labelledby={titleId && descId ? `${titleId} ${descId}` : titleId || undefined}
    >
      {title && <title id={titleId}>{title}</title>}
      {desc && <desc id={descId}>{desc}</desc>}
      <rect width="240" height="180" rx="12" className="fill-[#FAFAF8] dark:fill-[#18181B]" />
      <circle cx="155" cy="90" r="45" className="fill-[#218C5A]/10 dark:fill-[#218C5A]/20" />
      <path d="M20 150H220" className="stroke-[#111111]/20 dark:stroke-white/20" strokeWidth="1.75" strokeLinecap="round" />
      <rect x="40" y="55" width="55" height="95" rx="2" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.5" />
      <rect x="50" y="68" width="14" height="12" rx="1" className="fill-[#111111]/10 dark:fill-white/10" />
      <rect x="70" y="68" width="14" height="12" rx="1" className="fill-[#111111]/10 dark:fill-white/10" />
      <rect x="50" y="88" width="14" height="12" rx="1" className="fill-[#111111]/10 dark:fill-white/10" />
      <rect x="70" y="88" width="14" height="12" rx="1" className="fill-[#111111]/10 dark:fill-white/10" />
      <rect x="105" y="35" width="80" height="105" rx="4" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="2" />
      <rect x="115" y="48" width="35" height="8" rx="1" className="fill-[#111111] dark:fill-white/90" />
      <line x1="115" y1="65" x2="175" y2="65" className="stroke-[#111111] dark:stroke-white/40" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="115" y1="75" x2="175" y2="75" className="stroke-[#111111] dark:stroke-white/40" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="115" y1="85" x2="155" y2="85" className="stroke-[#111111] dark:stroke-white/40" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="150" cy="115" r="18" className="fill-[#218C5A] stroke-white" strokeWidth="2" />
      <path d="M142 115L147 120L158 109" className="stroke-white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M144 133L144 145L150 140L156 145L156 133" className="fill-[#218C5A] stroke-[#218C5A]" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

export function SvgAdvisor({ className, titleId, descId, title, desc }: SvgRenderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      fill="none"
      className={className}
      aria-labelledby={titleId && descId ? `${titleId} ${descId}` : titleId || undefined}
    >
      {title && <title id={titleId}>{title}</title>}
      {desc && <desc id={descId}>{desc}</desc>}
      <rect width="240" height="180" rx="12" className="fill-[#FAFAF8] dark:fill-[#18181B]" />
      <circle cx="120" cy="55" r="42" className="fill-[#E85D3F]/10 dark:fill-[#E85D3F]/20" />
      <path d="M20 150H220" className="stroke-[#111111]/20 dark:stroke-white/20" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M85 150V90L120 62L155 90V150H85Z" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="100" y="98" width="16" height="14" rx="1" className="fill-[#111111]/5 dark:fill-white/5 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <rect x="124" y="98" width="16" height="14" rx="1" className="fill-[#E85D3F]/20 stroke-[#E85D3F]" strokeWidth="1.25" />
      <circle cx="68" cy="85" r="9" className="fill-[#111111] dark:fill-white/90" />
      <path d="M52 150V122C52 113 59 107 68 107C77 107 84 113 84 122V150" className="fill-[#111111] dark:fill-white/90 stroke-[#111111] dark:stroke-white/90" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M78 120L95 125L92 138L75 132" className="fill-white dark:fill-[#27272A] stroke-[#E85D3F]" strokeWidth="1.75" strokeLinejoin="round" />
      <rect x="90" y="122" width="14" height="18" rx="1.5" transform="rotate(15 90 122)" className="fill-white dark:fill-[#27272A] stroke-[#E85D3F]" strokeWidth="1.5" />
      <circle cx="172" cy="90" r="8" className="fill-[#111111] dark:fill-white/90" />
      <path d="M158 150V126C158 118 164 112 172 112C180 112 186 118 186 126V150" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M165 128L150 132" className="stroke-[#111111] dark:stroke-white/60" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="120" cy="40" r="3" className="fill-[#E85D3F]" />
      <circle cx="132" cy="48" r="2" className="fill-[#218C5A]" />
    </svg>
  );
}

export function SvgSavedHome({ className, titleId, descId, title, desc }: SvgRenderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      fill="none"
      className={className}
      aria-labelledby={titleId && descId ? `${titleId} ${descId}` : titleId || undefined}
    >
      {title && <title id={titleId}>{title}</title>}
      {desc && <desc id={descId}>{desc}</desc>}
      <rect width="240" height="180" rx="12" className="fill-[#FAFAF8] dark:fill-[#18181B]" />
      <circle cx="120" cy="85" r="54" className="fill-[#E85D3F]/10 dark:fill-[#E85D3F]/20" />
      <path d="M70 142V88L120 48L170 88V142H70Z" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" strokeLinejoin="round" />
      <rect x="86" y="96" width="24" height="20" rx="2" className="fill-[#111111]/5 dark:fill-white/5 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.5" />
      <line x1="98" y1="96" x2="98" y2="116" className="stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <rect x="130" y="96" width="24" height="20" rx="2" className="fill-[#111111]/5 dark:fill-white/5 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.5" />
      <line x1="142" y1="96" x2="142" y2="116" className="stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <path d="M142 34V84L156 74L170 84V34H142Z" className="fill-[#E85D3F] stroke-[#E85D3F]" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M40 142H200" className="stroke-[#111111]/20 dark:stroke-white/20" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function SvgEmptySaved({ className, titleId, descId, title, desc }: SvgRenderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      fill="none"
      className={className}
      aria-labelledby={titleId && descId ? `${titleId} ${descId}` : titleId || undefined}
    >
      {title && <title id={titleId}>{title}</title>}
      {desc && <desc id={descId}>{desc}</desc>}
      <rect width="240" height="180" rx="12" className="fill-[#FAFAF8] dark:fill-[#18181B]" />
      <circle cx="120" cy="85" r="50" className="fill-[#E85D3F]/10 dark:fill-[#E85D3F]/20" />
      <path d="M20 150H220" className="stroke-[#111111]/20 dark:stroke-white/20" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M75 142V90L120 54L165 90V142H75Z" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" strokeDasharray="4 4" strokeLinejoin="round" />
      <path d="M106 50V105L120 95L134 105V50H106Z" className="fill-white dark:fill-[#27272A] stroke-[#E85D3F]" strokeWidth="2" strokeLinejoin="round" />
      <line x1="120" y1="65" x2="120" y2="81" className="stroke-[#E85D3F]" strokeWidth="2" strokeLinecap="round" />
      <line x1="112" y1="73" x2="128" y2="73" className="stroke-[#E85D3F]" strokeWidth="2" strokeLinecap="round" />
      <circle cx="62" cy="70" r="3" className="fill-[#E85D3F]" />
      <circle cx="178" cy="75" r="2.5" className="fill-[#111111]/30 dark:fill-white/30" />
    </svg>
  );
}

export function SvgEmptySearch({ className, titleId, descId, title, desc }: SvgRenderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      fill="none"
      className={className}
      aria-labelledby={titleId && descId ? `${titleId} ${descId}` : titleId || undefined}
    >
      {title && <title id={titleId}>{title}</title>}
      {desc && <desc id={descId}>{desc}</desc>}
      <rect width="240" height="180" rx="12" className="fill-[#FAFAF8] dark:fill-[#18181B]" />
      <circle cx="110" cy="80" r="48" className="fill-[#E85D3F]/10 dark:fill-[#E85D3F]/20" />
      <path d="M20 150H220" className="stroke-[#111111]/20 dark:stroke-white/20" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M50 130L95 105L170 120" className="stroke-[#111111]/30 dark:stroke-white/30" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
      <g transform="translate(10, -5)">
        <circle cx="110" cy="80" r="32" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="2.5" />
        <circle cx="110" cy="80" r="26" className="fill-[#FAFAF8] dark:fill-[#18181B] stroke-[#E85D3F]" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d="M98 92V78L110 68L122 78V92H98Z" className="fill-white dark:fill-[#27272A] stroke-[#E85D3F]" strokeWidth="1.75" strokeLinejoin="round" />
        <path d="M133 103L160 130" className="stroke-[#111111] dark:stroke-white/90" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M133 103L160 130" className="stroke-[#E85D3F]" strokeWidth="2" strokeLinecap="round" />
      </g>
      <circle cx="178" cy="55" r="3" className="fill-[#E85D3F]" />
    </svg>
  );
}

export function SvgEmptyRecent({ className, titleId, descId, title, desc }: SvgRenderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      fill="none"
      className={className}
      aria-labelledby={titleId && descId ? `${titleId} ${descId}` : titleId || undefined}
    >
      {title && <title id={titleId}>{title}</title>}
      {desc && <desc id={descId}>{desc}</desc>}
      <rect width="240" height="180" rx="12" className="fill-[#FAFAF8] dark:fill-[#18181B]" />
      <circle cx="120" cy="80" r="48" className="fill-[#E85D3F]/10 dark:fill-[#E85D3F]/20" />
      <path d="M20 150H220" className="stroke-[#111111]/20 dark:stroke-white/20" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M40 145C80 145 85 120 125 120C165 120 170 95 200 95" className="stroke-[#111111]/40 dark:stroke-white/40" strokeWidth="1.75" strokeDasharray="4 4" strokeLinecap="round" />
      <circle cx="55" cy="112" r="7" className="fill-[#111111] dark:fill-white/90" />
      <path d="M45 145V130C45 124 50 120 55 120C60 120 65 124 65 130V145" className="fill-[#111111] dark:fill-white/90 stroke-[#111111] dark:stroke-white/90" strokeWidth="1.5" />
      <path d="M55 128L68 122" className="stroke-[#E85D3F]" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="165" cy="65" r="14" className="fill-white dark:fill-[#27272A] stroke-[#E85D3F]" strokeWidth="1.75" />
      <polygon points="165,56 169,65 165,63 161,65" className="fill-[#E85D3F]" />
    </svg>
  );
}

export function SvgSiteVisit({ className, titleId, descId, title, desc }: SvgRenderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      fill="none"
      className={className}
      aria-labelledby={titleId && descId ? `${titleId} ${descId}` : titleId || undefined}
    >
      {title && <title id={titleId}>{title}</title>}
      {desc && <desc id={descId}>{desc}</desc>}
      <rect width="240" height="180" rx="12" className="fill-[#FAFAF8] dark:fill-[#18181B]" />
      <circle cx="65" cy="50" r="30" className="fill-[#E85D3F]/10 dark:fill-[#E85D3F]/20" />
      <path d="M20 150H220" className="stroke-[#111111]/20 dark:stroke-white/20" strokeWidth="1.75" strokeLinecap="round" />
      <rect x="135" y="50" width="65" height="100" rx="3" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" />
      <rect x="147" y="62" width="16" height="14" rx="1" className="fill-[#111111]/10 dark:fill-white/10 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <rect x="171" y="62" width="16" height="14" rx="1" className="fill-[#E85D3F]/20 stroke-[#E85D3F]" strokeWidth="1.25" />
      <rect x="147" y="86" width="16" height="14" rx="1" className="fill-[#111111]/10 dark:fill-white/10 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <rect x="171" y="86" width="16" height="14" rx="1" className="fill-[#111111]/10 dark:fill-white/10 stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" />
      <rect x="158" y="118" width="18" height="32" rx="1" className="fill-[#111111] dark:fill-white/90" />
      <rect x="42" y="42" width="46" height="42" rx="3" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" />
      <rect x="42" y="42" width="46" height="12" rx="2" className="fill-[#E85D3F]" />
      <line x1="53" y1="36" x2="53" y2="44" className="stroke-[#111111] dark:stroke-white/90" strokeWidth="2" strokeLinecap="round" />
      <line x1="77" y1="36" x2="77" y2="44" className="stroke-[#111111] dark:stroke-white/90" strokeWidth="2" strokeLinecap="round" />
      <circle cx="65" cy="74" r="3" className="fill-[#E85D3F]" />
      <circle cx="52" cy="112" r="6.5" className="fill-[#111111] dark:fill-white/90" />
      <path d="M42 150V130C42 124 47 121 52 121C57 121 62 124 62 130V150" className="fill-[#111111] dark:fill-white/90 stroke-[#111111] dark:stroke-white/90" strokeWidth="1.5" />
      <circle cx="85" cy="108" r="7.5" className="fill-[#111111] dark:fill-white/90" />
      <path d="M72 150V126C72 119 78 115 85 115C92 115 98 119 98 126V150" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" />
      <path d="M92 128L115 120" className="stroke-[#E85D3F]" strokeWidth="1.75" strokeLinecap="round" />
      <polygon points="115,116 122,120 115,124" className="fill-[#E85D3F]" />
    </svg>
  );
}

export function SvgDeveloperAssistance({ className, titleId, descId, title, desc }: SvgRenderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      fill="none"
      className={className}
      aria-labelledby={titleId && descId ? `${titleId} ${descId}` : titleId || undefined}
    >
      {title && <title id={titleId}>{title}</title>}
      {desc && <desc id={descId}>{desc}</desc>}
      <rect width="240" height="180" rx="12" className="fill-[#FAFAF8] dark:fill-[#18181B]" />
      <circle cx="180" cy="50" r="32" className="fill-[#E85D3F]/10 dark:fill-[#E85D3F]/20" />
      <path d="M20 150H220" className="stroke-[#111111]/20 dark:stroke-white/20" strokeWidth="1.75" strokeLinecap="round" />
      <rect x="135" y="45" width="55" height="72" rx="3" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" />
      <line x1="148" y1="62" x2="164" y2="62" className="stroke-[#111111] dark:stroke-white/40" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="148" y1="74" x2="178" y2="74" className="stroke-[#111111] dark:stroke-white/40" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="170" cy="100" r="9" className="fill-[#E85D3F]/20 stroke-[#E85D3F]" strokeWidth="1.5" />
      <path d="M166 100L169 103L175 97" className="stroke-[#E85D3F]" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="58" cy="98" r="7.5" className="fill-[#111111] dark:fill-white/90" />
      <path d="M46 150V126C46 120 51 116 58 116C65 116 70 120 70 126V150" className="fill-[#111111] dark:fill-white/90 stroke-[#111111] dark:stroke-white/90" strokeWidth="1.5" />
      <circle cx="115" cy="98" r="7.5" className="fill-[#111111] dark:fill-white/90" />
      <path d="M103 150V126C103 120 108 116 115 116C122 116 127 120 127 126V150" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.5" />
    </svg>
  );
}

export function SvgPropertyIntelligence({ className, titleId, descId, title, desc }: SvgRenderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      fill="none"
      className={className}
      aria-labelledby={titleId && descId ? `${titleId} ${descId}` : titleId || undefined}
    >
      {title && <title id={titleId}>{title}</title>}
      {desc && <desc id={descId}>{desc}</desc>}
      <rect width="240" height="180" rx="12" className="fill-[#FAFAF8] dark:fill-[#18181B]" />
      <circle cx="80" cy="65" r="35" className="fill-[#E85D3F]/10 dark:fill-[#E85D3F]/20" />
      <path d="M20 150H220" className="stroke-[#111111]/20 dark:stroke-white/20" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M45 150V85L85 52L125 85V150H45Z" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" />
      <rect x="135" y="42" width="75" height="95" rx="3" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" />
      <rect x="145" y="70" width="55" height="12" rx="2" className="fill-[#FAFAF8] dark:fill-[#18181B] stroke-[#111111] dark:stroke-white/40" strokeWidth="1" />
      <rect x="147" y="72" width="35" height="8" rx="1" className="fill-[#E85D3F]" />
      <rect x="145" y="88" width="55" height="12" rx="2" className="fill-[#FAFAF8] dark:fill-[#18181B] stroke-[#111111] dark:stroke-white/40" strokeWidth="1" />
      <rect x="147" y="90" width="45" height="8" rx="1" className="fill-[#218C5A]" />
      <circle cx="115" cy="50" r="13" className="fill-white dark:fill-[#27272A] stroke-[#E85D3F]" strokeWidth="1.75" />
      <text x="115" y="55" fontFamily="var(--font-manrope), sans-serif" fontSize="14" fontWeight="700" className="fill-[#E85D3F]" textAnchor="middle">₹</text>
    </svg>
  );
}

export function SvgAccount({ className, titleId, descId, title, desc }: SvgRenderProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      fill="none"
      className={className}
      aria-labelledby={titleId && descId ? `${titleId} ${descId}` : titleId || undefined}
    >
      {title && <title id={titleId}>{title}</title>}
      {desc && <desc id={descId}>{desc}</desc>}
      <rect width="240" height="180" rx="12" className="fill-[#FAFAF8] dark:fill-[#18181B]" />
      <circle cx="120" cy="85" r="50" className="fill-[#E85D3F]/10 dark:fill-[#E85D3F]/20" />
      <path d="M20 150H220" className="stroke-[#111111]/20 dark:stroke-white/20" strokeWidth="1.75" strokeLinecap="round" />
      <rect x="80" y="45" width="80" height="95" rx="4" className="fill-white dark:fill-[#27272A] stroke-[#111111] dark:stroke-white/60" strokeWidth="1.75" />
      <circle cx="120" cy="75" r="14" className="fill-[#E85D3F]/20 stroke-[#E85D3F]" strokeWidth="1.5" />
      <circle cx="120" cy="72" r="5" className="fill-[#E85D3F]" />
      <path d="M111 85C111 81 115 78 120 78C125 78 129 81 129 85" className="fill-[#E85D3F]" />
      <rect x="95" y="98" width="50" height="6" rx="1" className="fill-[#111111] dark:fill-white/90" />
      <circle cx="148" cy="55" r="8" className="fill-[#218C5A] stroke-white" strokeWidth="1.5" />
      <path d="M145 55L147 57L152 52" className="stroke-white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
