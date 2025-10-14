import PropTypes from 'prop-types';

export function InfoCard({ title, subtitle = null, children, footer = null }) {
  return (
    <section className="info-card">
      <header className="info-card__header">
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      <div className="info-card__content">{children}</div>
      {footer ? <footer className="info-card__footer">{footer}</footer> : null}
    </section>
  );
}

InfoCard.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  children: PropTypes.node.isRequired,
  footer: PropTypes.node
};
