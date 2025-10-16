export function createBriefSurvey() {
  return [
    {
      key: 'goals',
      question: '🎯 Расскажите про цели проекта (чего хотите добиться?)',
      hint: 'Например: увеличить продажи на 20%, повысить узнаваемость, собрать предзаказы.'
    },
    {
      key: 'audience',
      question: '👥 Кто ваша основная аудитория? Какие боли и мотивации?',
      hint: 'Опишите пару сегментов: кто они, где находятся, что им важно.'
    },
    {
      key: 'offer',
      question: '💡 В чем уникальность продукта/оффера?',
      hint: 'Что вы предлагаете и почему клиенты должны выбрать именно вас?'
    },
    {
      key: 'tone',
      question: '🗣️ Какой тон и стиль коммуникации нужен?',
      hint: 'Например: экспертный, дружелюбный, дерзкий, официально-деловой.'
    },
    {
      key: 'keyMessages',
      question: '🔑 Какие ключевые сообщения обязательно проговорить?',
      hint: 'Перечислите 2-3 тезиса, которые должны прозвучать во всех материалах.'
    },
    {
      key: 'callToAction',
      question: '🚀 Какое целевое действие вы ожидаете от аудитории?',
      hint: 'Например: оставить заявку, записаться на демо, оформить заказ, подписаться.'
    },
    {
      key: 'successMetrics',
      question: '📈 Как измеряете успех кампании?',
      hint: 'Укажите метрики: количество лидов, конверсия, охват, ROI и т.д.'
    },
    {
      key: 'references',
      question: '📚 Есть ли полезные ссылки или референсы?',
      hint: 'Пришлите ссылки на сайты, медиаматериалы, примеры, которыми вдохновляетесь.'
    }
  ];
}

export function summarizeAnswers(answers = {}) {
  const segments = [];

  if (answers.goals) {
    segments.push(`Цели: ${answers.goals}`);
  }

  if (answers.audience) {
    segments.push(`Аудитория: ${answers.audience}`);
  }

  if (answers.offer) {
    segments.push(`Оффер: ${answers.offer}`);
  }

  if (answers.keyMessages) {
    segments.push(`Сообщения: ${answers.keyMessages}`);
  }

  if (answers.callToAction) {
    segments.push(`CTA: ${answers.callToAction}`);
  }

  if (segments.length === 0) {
    return 'Бриф пока заполнен частично — обновите данные через /setup.';
  }

  return segments.join('\n');
}

export function buildExecutionPlan(answers = {}) {
  const sections = [];

  sections.push(`1. Цель кампании: ${answers.goals || 'уточнить'}`);
  sections.push(
    `2. ЦА и инсайты: ${
      answers.audience || 'описать сегменты, боли, мотиваторы и барьеры'
    }`
  );
  sections.push(`3. Ценное предложение: ${answers.offer || 'раскрыть продукт и выгодные отличия'}`);
  sections.push(`4. Ключевые сообщения: ${answers.keyMessages || 'сформулировать 2-3 тезиса'}`);
  sections.push(`5. Каналы/форматы: подобрать исходя из аудитории и задач.`);
  sections.push(`6. Тон коммуникации: ${answers.tone || 'уточнить желаемый стиль'}`);
  sections.push(`7. Призыв к действию: ${answers.callToAction || 'определить'}`);
  sections.push(`8. Метрики успеха: ${answers.successMetrics || 'согласовать измеримые показатели'}`);
  sections.push(`9. Материалы и референсы: ${answers.references || 'собрать ссылки и примеры'}`);

  return sections.join('\n');
}
