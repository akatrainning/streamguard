export default function Panel({ title, eyebrow, actions, children, className = "", bodyClassName = "" }) {
  return (
    <section className={`sg-ui-panel ${className}`.trim()}>
      {(title || eyebrow || actions) && (
        <div className="sg-ui-panel-head">
          <div>
            {eyebrow && <div className="sg-ui-eyebrow">{eyebrow}</div>}
            {title && <h2>{title}</h2>}
          </div>
          {actions && <div className="sg-ui-panel-actions">{actions}</div>}
        </div>
      )}
      <div className={`sg-ui-panel-body ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}
