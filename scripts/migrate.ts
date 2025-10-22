import { Database } from '../app/core/database.js';
import { up as initialUp } from '../app/db/migrations/001_initial.js';

async function migrate() {
  const db = Database.getInstance();
  initialUp(db.connection);
  console.log('Migrations completed');
}

migrate().catch((error) => {
  console.error('Migration failed', error);
  process.exit(1);
});
