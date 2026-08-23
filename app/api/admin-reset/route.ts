import { NextResponse } from "next/server";

// Temporary one-shot password reset via GoTrue admin API.
// Delete this file after use.
const ALLOWED_SECRET = "reset-rehab-2026";

export async function POST(req: Request) {
  const { secret, email, password } = await req.json();

  if (secret !== ALLOWED_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "missing env vars", supabaseUrl: !!supabaseUrl, serviceRoleKey: !!serviceRoleKey }, { status: 500 });
  }

  // Find user by email
  const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
    headers: {
      "Authorization": `Bearer ${serviceRoleKey}`,
      "apikey": serviceRoleKey,
    },
  });
  const listData = await listRes.json();

  if (!listRes.ok) {
    return NextResponse.json({ error: "list failed", details: listData }, { status: 500 });
  }

  const user = listData.users?.[0];
  if (!user) {
    return NextResponse.json({ error: "user not found", data: listData }, { status: 404 });
  }

  // Update password via admin API
  const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${serviceRoleKey}`,
      "apikey": serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  const updateData = await updateRes.json();

  if (!updateRes.ok) {
    return NextResponse.json({ error: "update failed", details: updateData, status: updateRes.status }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email: updateData.email, updated_at: updateData.updated_at });
}
