import React from 'react';

interface KolkataLineArtProps {
  className?: string;
}

/**
 * Restrained architectural line-art silhouette of Kolkata's Victoria Memorial
 * and Howrah Bridge cantilever span, rendered in soft slate-blue tones to
 * sit cleanly beneath the hero proposition without competing with copy.
 */
export function KolkataLineArt({ className = '' }: KolkataLineArtProps) {
  return (
    <div
      className={`pointer-events-none select-none overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 680 185"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
      >
        <defs>
          <linearGradient id="kolkataSunWash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F5D0C2" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#FAF3EE" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id="kolkataSkyFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#D6B5A3" stopOpacity="0.18" />
            <stop offset="45%" stopColor="#C48B71" stopOpacity="0.58" />
            <stop offset="85%" stopColor="#C48B71" stopOpacity="0.52" />
            <stop offset="100%" stopColor="#D6B5A3" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {/* Subtle morning sun circle behind Victoria Memorial */}
        <circle cx="426" cy="58" r="34" fill="url(#kolkataSunWash)" />

        {/* Soft distant urban skyline blocks */}
        <g stroke="#DFC8B8" strokeWidth="1.15" fill="#F7EFE9" fillOpacity="0.55">
          <rect x="64" y="136" width="24" height="32" rx="1" />
          <rect x="92" y="124" width="20" height="44" rx="1" />
          <rect x="116" y="140" width="26" height="28" rx="1" />
          <rect x="536" y="128" width="22" height="40" rx="1" />
          <rect x="562" y="114" width="26" height="54" rx="1" />
          <rect x="592" y="134" width="22" height="34" rx="1" />
        </g>

        {/* Victoria Memorial Architectural Silhouette (Center-Left Focus) */}
        <g stroke="#B57B62" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
          {/* Plinth & Base Terrace */}
          <rect x="164" y="154" width="212" height="14" fill="#FAF6F2" />
          <line x1="152" y1="168" x2="388" y2="168" stroke="#A36B52" strokeWidth="1.5" />

          {/* Lower Portico Wings */}
          <rect x="174" y="132" width="192" height="22" fill="#FDFBF9" />
          {/* Left colonnade arches */}
          <path d="M184 154 V141 A4 4 0 0 1 192 141 V154" fill="#F2E2D8" />
          <path d="M198 154 V141 A4 4 0 0 1 206 141 V154" fill="#F2E2D8" />
          <path d="M212 154 V141 A4 4 0 0 1 220 141 V154" fill="#F2E2D8" />
          {/* Right colonnade arches */}
          <path d="M320 154 V141 A4 4 0 0 1 328 141 V154" fill="#F2E2D8" />
          <path d="M334 154 V141 A4 4 0 0 1 342 141 V154" fill="#F2E2D8" />
          <path d="M348 154 V141 A4 4 0 0 1 356 141 V154" fill="#F2E2D8" />

          {/* Left & Right Corner Chhatri Towers */}
          <rect x="180" y="118" width="22" height="14" fill="#F8F1EC" />
          <path d="M179 118 C179 109, 203 109, 203 118 Z" fill="#EEDAD0" />
          <line x1="191" y1="109" x2="191" y2="102" />

          <rect x="338" y="118" width="22" height="14" fill="#F8F1EC" />
          <path d="M337 118 C337 109, 361 109, 361 118 Z" fill="#EEDAD0" />
          <line x1="349" y1="109" x2="349" y2="102" />

          {/* Central Entrance Pavilion */}
          <rect x="236" y="114" width="68" height="40" fill="#FFFFFF" />
          <path d="M254 154 V130 A16 14 0 0 1 286 130 V154" fill="#EEDAD0" />
          <path d="M258 154 V133 A12 10 0 0 1 282 133 V154" fill="#F7EFE9" />
          {/* Pediment */}
          <polygon points="234,114 270,101 306,114" fill="#F4E6DD" />

          {/* Upper Drum & Side Cupolas */}
          <rect x="234" y="102" width="12" height="12" fill="#F8F1EC" />
          <path d="M233 102 C233 95, 247 95, 247 102 Z" fill="#EEDAD0" />
          <rect x="294" y="102" width="12" height="12" fill="#F8F1EC" />
          <path d="M293 102 C293 95, 307 95, 307 102 Z" fill="#EEDAD0" />

          {/* Main Central Drum */}
          <rect x="246" y="84" width="48" height="20" fill="#FFFFFF" />
          <line x1="254" y1="84" x2="254" y2="104" strokeOpacity="0.55" />
          <line x1="262" y1="84" x2="262" y2="104" strokeOpacity="0.55" />
          <line x1="270" y1="84" x2="270" y2="104" strokeOpacity="0.55" />
          <line x1="278" y1="84" x2="278" y2="104" strokeOpacity="0.55" />
          <line x1="286" y1="84" x2="286" y2="104" strokeOpacity="0.55" />

          {/* Iconic Central Dome & Angel Finial */}
          <path d="M244 84 C244 54, 296 54, 296 84 Z" fill="#F2E2D8" />
          <path d="M262 58 L270 50 L278 58" fill="#F7EFE9" />
          <line x1="270" y1="50" x2="270" y2="39" />
          <circle cx="270" cy="38" r="2" fill="#B57B62" />
        </g>

        {/* Howrah Bridge Cantilever Span (Right Side) */}
        <g stroke="#C28C74" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
          {/* Deck line */}
          <line x1="382" y1="154" x2="656" y2="154" stroke="#A36B52" strokeWidth="1.5" />
          <line x1="382" y1="158" x2="656" y2="158" stroke="#D5B3A1" strokeWidth="1" />

          {/* Left Anchor & Main Tower */}
          <path d="M402 154 L410 90 L422 90 L430 154" fill="#F8F1EC" fillOpacity="0.65" />
          <line x1="406" y1="118" x2="426" y2="118" />
          <line x1="408" y1="102" x2="424" y2="102" />
          <line x1="404" y1="138" x2="428" y2="138" />

          {/* Right Main Tower */}
          <path d="M558 154 L566 90 L578 90 L586 154" fill="#F8F1EC" fillOpacity="0.65" />
          <line x1="562" y1="118" x2="582" y2="118" />
          <line x1="564" y1="102" x2="580" y2="102" />
          <line x1="560" y1="138" x2="584" y2="138" />

          {/* Cantilever Top Chords & Approach */}
          <polyline points="382,138 410,90 462,126 526,126 578,90 618,136 654,154" />
          {/* Steel Lattice Diagonal Webs */}
          <polyline points="410,90 426,154 446,115 462,154 484,126 504,154 526,126 544,154 566,90" />
          <polyline points="422,90 446,154 462,126 484,154 504,126 526,154 544,126 562,154" strokeOpacity="0.7" />
          {/* Vertical Hangers */}
          <line x1="446" y1="115" x2="446" y2="154" strokeOpacity="0.65" />
          <line x1="462" y1="126" x2="462" y2="154" strokeOpacity="0.65" />
          <line x1="484" y1="126" x2="484" y2="154" strokeOpacity="0.65" />
          <line x1="504" y1="126" x2="504" y2="154" strokeOpacity="0.65" />
          <line x1="526" y1="126" x2="526" y2="154" strokeOpacity="0.65" />
          <line x1="544" y1="115" x2="544" y2="154" strokeOpacity="0.65" />
          {/* Right Anchor Span */}
          <polyline points="586,154 600,116 618,154 636,144" strokeOpacity="0.85" />
        </g>

        {/* Hooghly Water / Promenade Horizon Line */}
        <line x1="20" y1="169" x2="660" y2="169" stroke="url(#kolkataSkyFade)" strokeWidth="1.5" />
        <line x1="396" y1="175" x2="594" y2="175" stroke="#DEC5B6" strokeWidth="1" strokeDasharray="6 6" />
        <line x1="432" y1="180" x2="552" y2="180" stroke="#EAD8CD" strokeWidth="1" strokeDasharray="4 8" />
      </svg>
    </div>
  );
}
