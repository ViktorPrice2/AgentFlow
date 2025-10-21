import PropTypes from 'prop-types';

export function Navigation({ sections, activeId, onChange }) {
  return (
    <nav className="nav-tabs">
      {sections.map((section) => {
        const isActive = section.id === activeId;
        const isDisabled = Boolean(section.disabled);

        return (
          <button
            key={section.id}
            type="button"
            className={`nav-tab ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
            onClick={() => {
              if (!isDisabled) {
                onChange(section.id);
              }
            }}
            aria-label={section.label}
            aria-current={isActive ? 'page' : undefined}
            aria-disabled={isDisabled}
            disabled={isDisabled}
          >
            <span className="nav-tab__label">{section.label}</span>
            {section.badge ? <span className="nav-tab__badge">{section.badge}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}

Navigation.propTypes = {
  sections: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      badge: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      disabled: PropTypes.bool
    })
  ).isRequired,
  activeId: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired
};
