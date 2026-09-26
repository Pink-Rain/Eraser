import { redirect } from "next/navigation"

import { AuthPanel } from "@/components/eraser/auth-panel"
import { currentAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ authError?: string }>
}) {
  if (await currentAccount()) redirect("/")
  const { authError } = await searchParams
  return (
    <main className="paper-grain flex min-h-svh items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.png" alt="" className="size-16 object-contain" />
          <h1 className="font-display mt-3 text-4xl font-semibold tracking-[-0.03em]">Eraser</h1>
        </div>
        <div className="rounded-3xl border bg-card/95 p-6 shadow-[0_24px_80px_rgb(65_44_24/0.12)] sm:p-7">
          <AuthPanel initialError={authError?.slice(0, 240)} />
        </div>
      </div>
    </main>
  )
}
