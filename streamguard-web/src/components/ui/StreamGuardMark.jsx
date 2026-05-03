export default function StreamGuardMark({ size = 32, gradientId = "sgMarkStroke" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradientId} x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--fact)" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="var(--accent)" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--text-primary)" stopOpacity="0.78" />
        </linearGradient>
      </defs>
      <path
        d="M6.2 7.2c0-2.1 1.7-3.8 3.8-3.8h4.1c2.1 0 3.8 1.7 3.8 3.8S16.2 11 14.1 11H9.9c-2.1 0-3.8 1.7-3.8 3.8s1.7 3.8 3.8 3.8h4.1c2.1 0 3.8-1.7 3.8-3.8"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.2 18.2l2.1 2.1"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
