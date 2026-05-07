"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import BottomNav from "../../components/BottomNav";

type Family = {
  id: string;
  name: string;
};

export default function InvitePage() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadFamilies();
  }, []);

  async function loadFamilies() {
    const { data, error } = await supabase
      .from("family_members")
      .select(`
        family_id,
        families (
          id,
          name
        )
      `);

    if (error) {
      setMessage(error.message);
      return;
    }

    const rows = (data ?? []) as any[];

    const fs = rows
      .map((r) => r.families)
      .filter(Boolean);

    setFamilies(fs);

    if (fs.length > 0) {
      setSelectedFamilyId(fs[0].id);
    }
  }

  async function createInvite() {
    setMessage("");
    setInviteUrl("");

    if (!selectedFamilyId) {
      setMessage("家系グループを選択してください。");
      return;
    }

    const code =
      crypto.randomUUID().replace(/-/g, "") +
      Math.random().toString(36).slice(2, 8);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error } = await supabase
      .from("family_invites")
      .insert({
        family_id: selectedFamilyId,
        code,
        role: "member",
        expires_at: expiresAt.toISOString(),
      });

    if (error) {
      setMessage(error.message);
      return;
    }

    const url =
      `${window.location.origin}/accept-invite?code=${code}`;

    setInviteUrl(url);
  }

  async function copyInvite() {
    if (!inviteUrl) return;

    await navigator.clipboard.writeText(inviteUrl);

    setMessage("招待URLをコピーしました。");
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-5 pb-24 text-white">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-bold">家系招待</h1>

        <select
          className="mt-5 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3"
          value={selectedFamilyId}
          onChange={(e) => setSelectedFamilyId(e.target.value)}
        >
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        <button
          onClick={createInvite}
          className="mt-4 w-full rounded-xl bg-blue-600 py-3 font-semibold"
        >
          招待URL作成
        </button>

        {inviteUrl && (
          <div className="mt-5 rounded-2xl bg-neutral-900 p-4">
            <div className="break-all text-sm">
              {inviteUrl}
            </div>

            <button
              onClick={copyInvite}
              className="mt-4 w-full rounded-xl bg-neutral-700 py-3 text-sm font-semibold"
            >
              URLコピー
            </button>
          </div>
        )}

        {message && (
          <div className="mt-4 rounded-xl bg-neutral-900 p-4 text-sm">
            {message}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}