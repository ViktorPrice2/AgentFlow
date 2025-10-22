import { Database } from '../app/core/database.js';

async function seed() {
  const db = Database.getInstance().connection;
  const providers = [
    ['openai', 'OpenAI', null, 0, 1],
    ['stability', 'Stability AI', null, 0, 2],
    ['local-llm', 'Local LLM', null, 1, 3]
  ];

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO providers (id, name, api_key, enabled, priority) VALUES (?, ?, ?, ?, ?)`
  );
  db.transaction(() => {
    for (const provider of providers) {
      stmt.run(...provider);
    }
  })();

  console.log('Seed data inserted');
}

seed().catch((error) => {
  console.error('Seeding failed', error);
  process.exit(1);
});
