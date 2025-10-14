import PropTypes from 'prop-types';

export function Navigation({ sections, activeId, onChange }) {
  return (
    <nav className="nav-tabs">
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          className={`nav-tab ${section.id === activeId ? 'active' : ''}`}
          onClick={() => onChange(section.id)}
        >
          <span className="nav-tab__label">{section.label}</span>
          {section.badge ? <span className="nav-tab__badge">{section.badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}

Navigation.propTypes = {
  sections: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      badge: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
    })
  ).isRequired,
  activeId: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired
};
