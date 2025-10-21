import { createElement, useMemo } from 'react';
import PropTypes from 'prop-types';

function renderInlineNodes(text, keyPrefix) {
  const nodes = [];
  if (!text) {
    return nodes;
  }

  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^\)]+\))/g;
  let lastIndex = 0;
  let match;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const tokenKey = `${keyPrefix}-${index}`;
    index += 1;

    if (token.startsWith('**') && token.endsWith('**')) {
      const value = token.slice(2, -2);
      nodes.push(createElement('strong', { key: tokenKey }, value));
    } else if (token.startsWith('*') && token.endsWith('*')) {
      const value = token.slice(1, -1);
      nodes.push(createElement('em', { key: tokenKey }, value));
    } else if (token.startsWith('`') && token.endsWith('`')) {
      const value = token.slice(1, -1);
      nodes.push(createElement('code', { key: tokenKey }, value));
    } else if (token.startsWith('[')) {
      const closingBracket = token.indexOf(']');
      const separator = token.indexOf('](');

      if (closingBracket !== -1 && separator !== -1) {
        const label = token.slice(1, closingBracket);
        const url = token.slice(separator + 2, -1);
        const safeUrl = /^https?:/i.test(url) ? url : '#';
        nodes.push(
          createElement(
            'a',
            {
              key: tokenKey,
              href: safeUrl,
              target: '_blank',
              rel: 'noreferrer'
            },
            label
          )
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(token);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function buildMarkdownElements(markdown) {
  const elements = [];
  if (!markdown) {
    return elements;
  }

  const lines = String(markdown).split(/\r?\n/);
  let listBuffer = [];
  let inCodeBlock = false;
  let codeBuffer = [];
  let elementIndex = 0;

  const flushList = () => {
    if (listBuffer.length === 0) {
      return;
    }

    elements.push(
      createElement(
        'ul',
        { key: `ul-${elementIndex}` },
        listBuffer.map((item, idx) =>
          createElement('li', { key: `li-${elementIndex}-${idx}` }, renderInlineNodes(item, `li-${elementIndex}-${idx}`))
        )
      )
    );
    elementIndex += 1;
    listBuffer = [];
  };

  const flushCodeBlock = () => {
    if (!inCodeBlock) {
      return;
    }

    elements.push(
      createElement(
        'pre',
        { key: `pre-${elementIndex}` },
        createElement('code', { key: `code-${elementIndex}` }, codeBuffer.join('\n'))
      )
    );
    elementIndex += 1;
    inCodeBlock = false;
    codeBuffer = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushList();
        inCodeBlock = true;
        codeBuffer = [];
      }
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      return;
    }

    if (!trimmed) {
      flushList();
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = Math.min(headingMatch[1].length, 6);
      const content = headingMatch[2];
      elements.push(
        createElement(
          `h${level}`,
          { key: `h${level}-${elementIndex}` },
          renderInlineNodes(content, `h${level}-${elementIndex}`)
        )
      );
      elementIndex += 1;
      return;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const item = trimmed.replace(/^[-*]\s+/, '');
      listBuffer.push(item);
      return;
    }

    flushList();
    elements.push(
      createElement('p', { key: `p-${elementIndex}` }, renderInlineNodes(trimmed, `p-${elementIndex}`))
    );
    elementIndex += 1;
  });

  flushCodeBlock();
  flushList();

  return elements;
}

export default function ReactMarkdown({ children, className }) {
  const content = Array.isArray(children) ? children.join('') : children;
  const elements = useMemo(() => buildMarkdownElements(content), [content]);

  const mergedClassName = className ? `markdown-body ${className}` : 'markdown-body';

  return createElement('div', { className: mergedClassName }, elements);
}

ReactMarkdown.propTypes = {
  children: PropTypes.oneOfType([PropTypes.arrayOf(PropTypes.node), PropTypes.node]),
  className: PropTypes.string
};

ReactMarkdown.defaultProps = {
  children: '',
  className: ''
};
