export default function SegmentedControl({ options, value, onChange, className = "" }) {
  return (
    <div className={`sg-ui-segmented ${className}`.trim()}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "is-active" : ""}
          onClick={() => onChange?.(option.value)}
        >
          <span>{option.label}</span>
          {option.meta && <small>{option.meta}</small>}
        </button>
      ))}
    </div>
  );
}
