export default function StatusBadge({ tone = "neutral", children, className = "" }) {
  return (
    <span className={`sg-ui-status is-${tone} ${className}`.trim()}>
      <i />
      {children}
    </span>
  );
}
