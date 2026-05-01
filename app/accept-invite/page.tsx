"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import BottomNav from "../../components/BottomNav";

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const [message, setMessage] = useState("招待を確認中です...");

  useEffect(() => {
    acceptInvite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function acceptInvite() {
    if (!code) {
      setMessage("招待コードがありません。");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setMessage("先にログインしてください。ログイン後、もう一度このURLを開いてください。");
      return;
    }

    const { error } = await supabase.rpc("accept_family_invite", {
      invite_code: code,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("家系グループに参加しました。");
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-5 pb-24 text-white">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-bold">招待を受ける</h1>

        <div className="mt-5 rounded-2xl bg-neutral-900 p-4 text-sm">
          {message}
        </div>

        <a
          href="/tree"
          className="mt-5 block rounded-xl bg-blue-600 py-3 text-center font-semibold"
        >
          家系図を見る
        </a>

        <a
          href="/"
          className="mt-3 block rounded-xl bg-neutral-800 py-3 text-center text-sm font-semibold"
        >
          ホームへ
        </a>
      </div>

      <BottomNav />
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-950 p-5 pb-24 text-white">
          <div className="mx-auto max-w-md">
            <h1 className="text-xl font-bold">招待を受ける</h1>
            <div className="mt-5 rounded-2xl bg-neutral-900 p-4 text-sm">
              読み込み中です...
            </div>
          </div>
          <BottomNav />
        </main>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}