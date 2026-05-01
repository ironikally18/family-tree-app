"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import BottomNav from "../../components/BottomNav";

export default function InvitePage() {
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [role, setRole] = useState("editor");
  const [maxUses, setMaxUses] = useState(1);
  const [inviteUrl, setInviteUrl] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadFamily();
  }, []);

  async function loadFamily() {
    const { data, error } = await supabase
      .from("families")
      .select("id, name")
      .limit(1)
      .single();

    if (error || !data) {
      setMessage("家系グループが見つかりません。");
      return;
    }

    setFamilyId(data.id);
  }

  async function createInvite() {
    setMessage("");
    setInviteUrl("");

    if (!familyId) {
      setMessage("家系グループがありません。");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      setMessage("ログインしてください。");
      return;
    }

    const { data, error } = await supabase
      .from("family_invites")
      .insert({
        family_id: familyId,
        role,
        max_uses: maxUses,
        created_by: userId,
      })
      .select("code")
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    const url = `${window.location.origin}/accept-invite?code=${data.code}`;
    setInviteUrl(url);
    setMessage("招待URLを作成しました。");
  }

  async function copyUrl() {
    if (!inviteUrl) return;

    await navigator.clipboard.writeText(inviteUrl);
    setMessage("招待URLをコピーしました。LINEなどで送れます。");
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-5 pb-24 text-white">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-bold">招待</h1>

        <div className="mt-5 rounded-2xl bg-neutral-900 p-4">
          <label className="text-sm text-neutral-400">招待する権限</label>

          <select
            className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="editor">編集者</option>
            <option value="viewer">閲覧のみ</option>
            <option value="admin">管理者</option>
          </select>

          <label className="mt-4 block text-sm text-neutral-400">
            使用可能回数
          </label>

          <input
            className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3"
            type="number"
            min={1}
            max={20}
            value={maxUses}
            onChange={(e) => setMaxUses(Number(e.target.value))}
          />

          <button
            onClick={createInvite}
            className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-semibold"
          >
            招待URLを作成
          </button>
        </div>

        {inviteUrl && (
          <div className="mt-5 rounded-2xl bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">招待URL</p>

            <div className="mt-2 break-all rounded-xl bg-neutral-800 p-3 text-sm">
              {inviteUrl}
            </div>

            <button
              onClick={copyUrl}
              className="mt-4 w-full rounded-xl bg-green-600 py-3 font-semibold"
            >
              URLをコピー
            </button>
          </div>
        )}

        {message && (
          <div className="mt-4 rounded-xl bg-neutral-800 p-3 text-sm">
            {message}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}