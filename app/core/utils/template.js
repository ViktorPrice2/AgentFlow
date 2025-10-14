export function getValueByPath(source, pathExpression) {
  if (!source || !pathExpression) {
    return undefined;
  }

  const segments = String(pathExpression)
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.reduce((acc, key) => {
    if (acc === undefined || acc === null) {
      return undefined;
    }

    if (Array.isArray(acc)) {
      const index = Number.parseInt(key, 10);

      if (Number.isNaN(index)) {
        return undefined;
      }

      return acc[index];
    }

    return acc[key];
  }, source);
}

export function renderTemplate(template, data) {
  if (typeof template !== 'string') {
    return '';
  }

  const safeData = data || {};

  return template.replace(/{{\s*([\w.[\]0-9]+)\s*}}/g, (_match, token) => {
    const value = getValueByPath(safeData, token);

    if (value === undefined || value === null) {
      return '';
    }

    return String(value);
  });
}

export function renderTemplateWithFallback(template, fallback, data) {
  if (typeof template === 'string' && template.length > 0) {
    return renderTemplate(template, data);
  }

  if (typeof fallback === 'string' && fallback.length > 0) {
    return renderTemplate(fallback, data);
  }

  return '';
}
