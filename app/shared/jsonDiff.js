function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function toPath(base, key) {
  if (!base) {
    return Array.isArray(key) ? `[${key}]` : String(key);
  }

  if (Number.isInteger(key)) {
    return `${base}[${key}]`;
  }

  if (typeof key === 'string' && key.includes('.')) {
    return `${base}["${key}"]`;
  }

  return `${base}.${key}`;
}

function pushChange(changes, path, type, beforeValue, afterValue) {
  changes.push({
    path: path || 'root',
    type,
    before: beforeValue ?? null,
    after: afterValue ?? null
  });
}

function diffArray(path, left, right, changes) {
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    const childPath = toPath(path, index);
    const leftValue = left[index];
    const rightValue = right[index];
    diffRecursive(childPath, leftValue, rightValue, changes);
  }
}

function diffObject(path, left, right, changes) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

  keys.forEach((key) => {
    const childPath = toPath(path, key);
    diffRecursive(childPath, left[key], right[key], changes);
  });
}

function diffRecursive(path, left, right, changes) {
  if (left === right) {
    return;
  }

  if (left === undefined || left === null) {
    if (right === undefined || right === null) {
      return;
    }

    pushChange(changes, path, 'added', left, right);
    return;
  }

  if (right === undefined || right === null) {
    pushChange(changes, path, 'removed', left, right);
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    diffArray(path, left, right, changes);
    return;
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    diffObject(path, left, right, changes);
    return;
  }

  pushChange(changes, path, 'changed', left, right);
}

export function computeJsonDiff(left, right) {
  const changes = [];
  diffRecursive('', left, right, changes);

  const summary = changes.reduce(
    (acc, change) => {
      if (change.type === 'added') {
        acc.added += 1;
      } else if (change.type === 'removed') {
        acc.removed += 1;
      } else {
        acc.changed += 1;
      }

      return acc;
    },
    { added: 0, removed: 0, changed: 0 }
  );

  return {
    equal: changes.length === 0,
    changes,
    summary
  };
}
