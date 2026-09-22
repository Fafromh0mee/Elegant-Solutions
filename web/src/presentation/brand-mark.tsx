// Presentation-only copy of the product logo mark (inlined in components/navbar.tsx).
// Copied rather than extracted so no production file changes for the slides.

export function BrandMark({ size = 50 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="20" y="12" width="59.1667" height="75.8333" rx="26.7473" fill="url(#deck_logo_a)" />
      <path
        d="M33.75 81.5C22.5 81.5 20 65 20 61.9167C20 58.8333 24.1667 68.0265 42.0833 61.7765C55.0868 57.2404 77.0889 44.6574 88.1781 38.0974C89.0396 37.5878 89.9257 38.7414 89.1899 39.4201C75.6812 51.8801 42.6338 81.5 33.75 81.5Z"
        fill="url(#deck_logo_b)"
      />
      <path d="M38.4946 28.6398V35.3064" stroke="#0041C9" strokeWidth="5" strokeLinecap="round" />
      <path d="M45.1613 46.1393C48.6792 48.5428 50.495 48.4624 53.4946 46.1393" stroke="#0041C9" strokeWidth="5" strokeLinecap="round" />
      <path d="M60.9946 28.6398V35.3064" stroke="#0041C9" strokeWidth="5" strokeLinecap="round" />
      <defs>
        <radialGradient
          id="deck_logo_a"
          cx="0"
          cy="0"
          r="1"
          gradientTransform="matrix(-10.6359 70.2967 -54.8468 -5.70751 60.2193 17.5367)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#B7D7FF" />
          <stop offset="0.652855" stopColor="#67ACFF" />
          <stop offset="1" stopColor="#2E67AC" />
        </radialGradient>
        <radialGradient
          id="deck_logo_b"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(90.8333 35.25) rotate(143.302) scale(77.3933 122.2)"
        >
          <stop stopColor="#6999FF" />
          <stop offset="0.576923" stopColor="#0052FF" />
          <stop offset="1" stopColor="#003199" />
        </radialGradient>
      </defs>
    </svg>
  );
}
