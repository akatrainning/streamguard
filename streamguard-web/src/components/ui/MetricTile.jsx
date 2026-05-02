export default function MetricTile({ label, value, tone = "neutral", className = "" }) {
  return (
    <div className={`sg-ui-metric is-${tone} ${className}`.trim()}>
      <strong className="mono">{value}</strong>
      <span>{label}</span>
    </div>
  );
}
