export function normalizeChannels(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          const trimmed = item.trim();
          return trimmed.length > 0 ? trimmed : null;
        }

        if (item && typeof item === 'object') {
          if (typeof item.id === 'string' && item.id.trim()) {
            return item.id.trim();
          }

          if (typeof item.name === 'string' && item.name.trim()) {
            return item.name.trim();
          }
        }

        return null;
      })
      .filter((item) => item && item.length > 0);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      return normalizeChannels(parsed);
    } catch {
      return trimmed
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
  }

  if (value && typeof value === 'object') {
    return normalizeChannels(value.channels ?? value.list ?? value.items ?? []);
  }

  return [];
}

export function buildChannelSummary(value, fallback = '') {
  const channels = normalizeChannels(value);
  if (channels.length === 0) {
    return fallback;
  }

  return channels.join(', ');
}
