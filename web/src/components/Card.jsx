// Content card for Settings/Attachments pages: title + optional description
// + body. A design-system primitive alongside Button/Field/Dialog.
export function Card({ title, description, actions, children }) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card__header">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {description && <p className="card__desc">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}
