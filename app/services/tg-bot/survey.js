const QUESTION_DEFINITIONS = [
  {
    id: 'goals',
    field: 'goals',
    prompt: (projectName) =>
      `Расскажите, каких целей вы хотите добиться по проекту «${projectName}»?`,
    hint: 'Например: увеличить лиды на 20%, укрепить узнаваемость, протестировать оффер.'
  },
  {
    id: 'audience',
    field: 'audience',
    prompt: () => 'Опишите целевую аудиторию: чем интересуется, какой боли хотим помочь?',
    hint: 'Сегменты, профессии, должности, возражения.'
  },
  {
    id: 'offer',
    field: 'offer',
    prompt: () => 'Сформулируйте ключевой оффер или уникальное предложение.',
    hint: 'Что именно продаём, чем отличается от конкурентов?'
  },
  {
    id: 'tone',
    field: 'tone',
    prompt: () => 'Какой тон и стиль коммуникации вам нужен?',
    hint: 'Дружелюбный, экспертный, лаконичный и т.д.'
  },
  {
    id: 'channels',
    field: 'channels',
    prompt: () => 'На какие каналы планируете выпускать материалы?',
    hint: 'Telegram, email, реклама, блоги и прочее.'
  },
  {
    id: 'callToAction',
    field: 'callToAction',
    prompt: () => 'Какое действие должна совершить аудитория после контакта?',
    hint: 'Зарегистрироваться, купить, оставить заявку, подписаться.'
  },
  {
    id: 'keyMessages',
    field: 'keyMessages',
    prompt: () => 'Какие ключевые сообщения важно донести?',
    hint: '2-3 тезиса с главными преимуществами.'
  },
  {
    id: 'successMetrics',
    field: 'successMetrics',
    prompt: () => 'Какие метрики считаем успехом для кампании?',
    hint: 'Количество заявок, продажи, охват, CTR.'
  }
];

function safeParseContent(content) {
  // accept object or JSON string, return object or null
  if (!content) return null;
  if (typeof content === 'object') return content;
  try {
    return JSON.parse(content);
  } catch {
    // not JSON — return null to avoid crash
    return null;
  }
}

export function buildSurvey(project, lastBrief = null) {
  const projectName = project?.name || 'проект';
  const lastContent = safeParseContent(lastBrief?.content);

  return QUESTION_DEFINITIONS.map((question) => ({
    id: question.id,
    field: question.field,
    prompt: question.prompt(projectName),
    hint: question.hint,
    previous: lastContent ? (lastContent[question.field] ?? null) : null
  }));
}

export function buildPlan(answers, project) {
  const goal = answers.goals || 'Уточнить цели';
  const audience = answers.audience || 'Уточнить аудиторию';
  const channels = answers.channels || 'Уточнить каналы';
  const cta = answers.callToAction || 'Определить CTA';
  const messages = answers.keyMessages || 'Сформулировать ключевые сообщения';

  return [
    `Проект: ${project?.name || '—'}`,
    `Цель: ${goal}`,
    `Аудитория: ${audience}`,
    `Каналы: ${channels}`,
    `Следующее действие: ${cta}`,
    `Контент-план:`,
    `1. Объяснить ценность предложения (${answers.offer || 'требует уточнения'}).`,
    `2. Поддержать тональность (${answers.tone || 'нужно выбрать тон'}).`,
    `3. Донести ключевые сообщения (${messages}).`,
    `4. Встроить измеримые метрики (${answers.successMetrics || 'нужно определить KPI'}).`
  ].join('\n');
}

export function buildBriefContent(answers) {
  return {
    goals: answers.goals ?? '',
    audience: answers.audience ?? '',
    offer: answers.offer ?? '',
    tone: answers.tone ?? '',
    channels: answers.channels ?? '',
    callToAction: answers.callToAction ?? '',
    keyMessages: answers.keyMessages ?? '',
    successMetrics: answers.successMetrics ?? ''
  };
}

// Compatibility wrapper: older code expects generateSurvey(projectId, meta)
export function generateSurvey(projectIdOrObj, meta = {}) {
  // accept either project object or projectId string
  const project = typeof projectIdOrObj === 'string' ? { id: projectIdOrObj, name: projectIdOrObj } : (projectIdOrObj || {});
  const questions = buildSurvey(project, meta?.lastBrief || null);
  return {
    id: `survey_${Date.now()}`,
    projectId: project.id || null,
    generatedAt: new Date().toISOString(),
    meta,
    questions
  };
}
