export default function Button({ children, variant = "secondary", className = "", ...props }) {
  return (
    <button className={`sg-ui-button is-${variant} ${className}`.trim()} type="button" {...props}>
      {children}
    </button>
  );
}
