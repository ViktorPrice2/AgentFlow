import PropTypes from 'prop-types';

export function EmptyState({ title, description = null, action = null }) {
  return (
    <div className="empty-state">
      <h4>{title}</h4>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}

EmptyState.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  action: PropTypes.node
};
