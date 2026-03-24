import dotenv from 'dotenv';
dotenv.config();

async function check() {
  const url = process.env.VITE_SUPABASE_URL + '/rest/v1/CustomBuildRequest?select=*';
  
  // Since we are not doing a full login, let's use the service_role key to bypass RLS if it exists,
  // Or we just use anon key and hope RLS allows select. 
  // Wait, I can just mock the admin token or use the ANON_KEY and see if we get them!
  const res = await fetch(url, {
    headers: {
      'apikey': process.env.VITE_SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`
    }
  });
  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));
}

check().catch(console.error);
