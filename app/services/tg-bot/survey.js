const BASE_STEPS = [
  {
    id: 'goals',
    label: 'Цели кампании',
    prompt: 'Опишите главные цели кампании — чего нужно добиться?',
    hint: 'Например: лиды, продажи, узнаваемость, регистрации'
  },
  {
    id: 'audience',
    label: 'Аудитория',
    prompt: 'Кто ваша ключевая аудитория? Какие боли и мотивация?',
    hint: 'Опишите сегменты, инсайты, ограничения'
  },
  {
    id: 'offer',
    label: 'Предложение',
    prompt: 'В чём суть продукта или оффера? Что делаем уникального?',
    hint: 'Коротко и по существу'
  },
  {
    id: 'tone',
    label: 'Тон коммуникации',
    prompt: 'Какой тон и стиль коммуникации предпочтителен?',
    hint: 'Дружелюбный, экспертный, провокационный и т.п.'
  },
  {
    id: 'keyMessages',
    label: 'Ключевые сообщения',
    prompt: 'Что обязательно нужно сказать аудитории?',
    hint: '2-3 тезиса, ценностные предложения'
  },
  {
    id: 'callToAction',
    label: 'Призыв к действию',
    prompt: 'Какое действие ожидаем от аудитории?',
    hint: 'Регистрация, покупка, подписка и др.'
  },
  {
    id: 'successMetrics',
    label: 'Метрики успеха',
    prompt: 'По каким метрикам будете оценивать результат?',
    hint: 'Лиды, конверсия, CPA, охват и т.д.'
  },
  {
    id: 'references',
    label: 'Референсы',
    prompt: 'Есть ли референсы или материалы для изучения?',
    hint: 'Ссылки, прошлые кампании, брендбук'
  }
];

export function buildSurvey(context = {}) {
  const { previousAnswers = {}, emphasis } = context;
  const steps = BASE_STEPS.filter((step) => !previousAnswers[step.id]);

  if (emphasis === 'launch' && !previousAnswers.budget) {
    steps.push({
      id: 'budget',
      label: 'Бюджет',
      prompt: 'Какой бюджет доступен на кампанию?',
      hint: 'Можно указать вилку или ориентир'
    });
  }

  return {
    id: 'default-brief-survey',
    version: '1.0.0',
    steps,
    closing: 'Спасибо! Как будете готовы — отправьте /finish для сохранения брифа.'
  };
}

export function mapAnswersToBrief(answers = {}) {
  return {
    goals: answers.goals || '',
    audience: answers.audience || '',
    offer: answers.offer || '',
    tone: answers.tone || '',
    keyMessages: answers.keyMessages || '',
    callToAction: answers.callToAction || '',
    successMetrics: answers.successMetrics || '',
    references: answers.references || '',
    budget: answers.budget || ''
  };
}

export function summarizeAnswers(answers = {}) {
  const summaryParts = [];

  if (answers.goals) {
    summaryParts.push(`Цели: ${answers.goals}`);
  }
  if (answers.audience) {
    summaryParts.push(`Аудитория: ${answers.audience}`);
  }
  if (answers.offer) {
    summaryParts.push(`Оффер: ${answers.offer}`);
  }
  if (answers.keyMessages) {
    summaryParts.push(`Сообщения: ${answers.keyMessages}`);
  }

  return summaryParts.join(' | ');
}
