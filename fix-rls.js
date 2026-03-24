import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function fixRLS() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    // Check existing policies
    const res = await client.query(`
      SELECT policyname, permissive, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE tablename = 'CustomBuildRequest';
    `);
    console.log("Existing policies:", res.rows);

    // Create SELECT policy for user (email match)
    await client.query(`
      DROP POLICY IF EXISTS "Users can read own CustomBuildRequests" ON "CustomBuildRequest";
      CREATE POLICY "Users can read own CustomBuildRequests" ON "CustomBuildRequest"
      FOR SELECT
      TO public
      USING ( lower(email) = lower(auth.jwt() ->> 'email') );
    `);

    // Create SELECT policy for admin
    await client.query(`
      DROP POLICY IF EXISTS "Admin can read all CustomBuildRequests" ON "CustomBuildRequest";
      CREATE POLICY "Admin can read all CustomBuildRequests" ON "CustomBuildRequest"
      FOR SELECT
      TO public
      USING ( auth.jwt() ->> 'email' = 'ujjwalrajan2@gmail.com' );
    `);

    // Create UPDATE policy for admin
    await client.query(`
      DROP POLICY IF EXISTS "Admin can update CustomBuildRequests" ON "CustomBuildRequest";
      CREATE POLICY "Admin can update CustomBuildRequests" ON "CustomBuildRequest"
      FOR UPDATE
      TO public
      USING ( auth.jwt() ->> 'email' = 'ujjwalrajan2@gmail.com' );
    `);

    // Create INSERT policy for everyone (since Home.tsx allows anonymous)
    await client.query(`
      DROP POLICY IF EXISTS "Anyone can insert CustomBuildRequests" ON "CustomBuildRequest";
      CREATE POLICY "Anyone can insert CustomBuildRequests" ON "CustomBuildRequest"
      FOR INSERT
      TO public
      WITH CHECK ( true );
    `);

    console.log("RLS Policies applied successfully.");
  } catch (err) {
    console.error("Error executing SQL:", err);
  } finally {
    await client.end();
  }
}

fixRLS();
