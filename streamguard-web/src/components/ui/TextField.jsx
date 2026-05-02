export default function TextField({ label, action, className = "", ...inputProps }) {
  return (
    <label className={`sg-ui-field ${className}`.trim()}>
      {label && <span>{label}</span>}
      <div className="sg-ui-field-row">
        <input {...inputProps} />
        {action}
      </div>
    </label>
  );
}
