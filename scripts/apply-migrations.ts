import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const host = 'aws-0-ap-southeast-1.pooler.supabase.com';
  const port = 5432;
  const user = 'postgres.yeixbbhqckysjugtelix';
  const password = '@Arikarran14';
  const database = 'postgres';

  console.log(`Connecting to ${host}:${port} as ${user}...`);
  const client = new Client({
    host,
    port,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to Supabase PostgreSQL!');

  console.log('\nResetting public schema for clean migration sequence...');
  await client.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
    GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
  `);

  const migrationFiles = [
    '20261006_init.sql',
    '20261007_hardening.sql',
    '20261007_phase1_hardening.sql',
    '20261007_phase2_hardening.sql',
    '20261007_phase3_hardening.sql',
    '20261007_phase4_routes_rls.sql',
    '20261007_phase5_seat_locks_fix.sql'
  ];

  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');

  for (const file of migrationFiles) {
    console.log(`\n========================================`);
    console.log(`Applying migration: ${file}`);
    console.log(`========================================`);

    if (file === '20261007_hardening.sql') {
      await client.query(`
        DROP FUNCTION IF EXISTS public.lock_seats_atomic CASCADE;
        DROP FUNCTION IF EXISTS public.unlock_seat_atomic CASCADE;
        DROP FUNCTION IF EXISTS public.confirm_booking_seats_atomic CASCADE;
        DROP FUNCTION IF EXISTS public.board_passenger_atomic CASCADE;
      `);
    } else if (file === '20261007_phase1_hardening.sql') {
      await client.query(`
        DROP FUNCTION IF EXISTS public.cancel_booking_atomic CASCADE;
        DROP FUNCTION IF EXISTS public.lock_seats_atomic CASCADE;
        DROP FUNCTION IF EXISTS public.confirm_booking_seats_atomic CASCADE;
        DROP FUNCTION IF EXISTS public.process_payment_webhook_atomic CASCADE;
        DROP FUNCTION IF EXISTS public.board_passenger_atomic CASCADE;
        DROP FUNCTION IF EXISTS public.unlock_seat_atomic CASCADE;
        DROP FUNCTION IF EXISTS public.get_trip_seat_availability CASCADE;
      `);
    } else if (file === '20261007_phase3_hardening.sql') {
      await client.query(`
        DROP FUNCTION IF EXISTS public.lock_seats_atomic CASCADE;
        DROP FUNCTION IF EXISTS public.create_pending_booking_atomic CASCADE;
        DROP FUNCTION IF EXISTS public.confirm_booking_seats_atomic CASCADE;
        DROP FUNCTION IF EXISTS public.process_payment_webhook_atomic CASCADE;
        DROP FUNCTION IF EXISTS public.cancel_booking_atomic CASCADE;
      `);
    }

    const filePath = path.join(migrationsDir, file);
    if (!fs.existsSync(filePath)) {
      console.error(`Migration file not found: ${filePath}`);
      continue;
    }

    const sql = fs.readFileSync(filePath, 'utf-8');
    try {
      await client.query(sql);
      console.log(`[SUCCESS] Migration ${file} executed successfully.`);
    } catch (err: unknown) {
      const error = err as Error & { hint?: string };
      console.error(`[ERROR] Migration ${file} failed:`, error.message);
      if (error.hint) console.error(`Hint:`, error.hint);
      throw err;
    }
  }

  console.log('\n========================================');
  console.log('Verifying created tables and functions');
  console.log('========================================');

  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log(`\nCreated Tables (${tablesRes.rows.length}):`);
  for (const row of tablesRes.rows) {
    console.log(`  ✓ ${row.table_name}`);
  }

  const rpcRes = await client.query(`
    SELECT routine_name 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    ORDER BY routine_name;
  `);

  console.log(`\nCreated RPC Functions (${rpcRes.rows.length}):`);
  for (const row of rpcRes.rows) {
    console.log(`  ✓ ${row.routine_name}`);
  }

  await client.end();
  console.log('\n>>> ALL MIGRATIONS COMPLETED SUCCESSFULLY! <<<');
}

main().catch(err => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
