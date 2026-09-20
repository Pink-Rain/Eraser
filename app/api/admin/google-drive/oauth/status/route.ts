import { NextResponse } from "next/server"

import { getGoogleAuthorization } from "@/lib/google-oauth"
import { authorizedAccount, currentAuthToken } from "@/lib/server-auth"

export async function GET() {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  return NextResponse.json({ authorization: await getGoogleAuthorization(await currentAuthToken()) })
}
