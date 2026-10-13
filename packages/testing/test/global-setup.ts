import pg from 'pg';
import { setupTemplateDatabase } from '../src/database-setup.ts';

// Stands in for a package's migrations: one table with one row.
export default setupTemplateDatabase(async (url) => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('create table fixture (id int primary key, label text not null)');
    await client.query("insert into fixture values (1, 'from the template')");
  } finally {
    await client.end();
  }
});
