"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import BottomNav from "../components/BottomNav";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [familyName, setFamilyName] = useState("");
  const [families, setFamilies] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setUserEmail(data.user?.email ?? null);
      if (data.user?.id) loadFamilies();
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setUserEmail(session?.user?.email ?? null);
      if (session?.user?.id) loadFamilies();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadFamilies() {
    const { data, error } = await supabase
      .from("families")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setFamilies(data ?? []);
  }

  async function signUp() {
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("新規登録しました。ログインしてください。");
  }

  async function signIn() {
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("ログインしました。");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUserId(null);
    setUserEmail(null);
    setFamilies([]);
    setMessage("ログアウトしました。");
  }

  async function createFamily() {
    setMessage("");

    if (!userId) {
      setMessage("ログインしてください。");
      return;
    }

    if (!familyName.trim()) {
      setMessage("家系グループ名を入力してください。");
      return;
    }

    const { data: family, error: familyError } = await supabase
      .from("families")
      .insert({
        name: familyName.trim(),
        created_by: userId,
      })
      .select()
      .single();

    if (familyError) {
      setMessage(familyError.message);
      return;
    }

    const { error: memberError } = await supabase.from("family_members").insert({
      family_id: family.id,
      user_id: userId,
      role: "owner",
      display_name: userEmail ?? "owner",
    });

    if (memberError) {
      setMessage(memberError.message);
      return;
    }

    setFamilyName("");
    setMessage("家系グループを作成しました。");
    await loadFamilies();
  }

  async function resetPassword() {
    setMessage("");

    if (!email) {
      setMessage("メールアドレスを入力してください。");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("パスワード再設定メールを送信しました。");
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-md px-5 py-8">
        <div className="rounded-2xl bg-neutral-900 p-6 shadow-lg">
          <h1 className="text-2xl font-bold">家系図アプリ</h1>
          <div className="mt-2 text-sm text-neutral-400 space-y-1">
            <p>家系図をちょっと共有する管理アプリです。</p>
            <p>画面再下端のメニューで登録、閲覧できます。</p>
            <p>作成：津幡晃徳</p>
          </div>

          {userEmail ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">ログイン中</p>
                <p className="mt-1 font-semibold">{userEmail}</p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <h2 className="font-bold">家系グループ作成</h2>

                <input
                  className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 outline-none"
                  placeholder="例：山田家"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                />

                <button
                  onClick={createFamily}
                  className="mt-4 w-full rounded-xl bg-blue-600 py-3 font-semibold"
                >
                  作成する
                </button>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <h2 className="font-bold">参加中の家系グループ</h2>

                {families.length === 0 ? (
                  <p className="mt-3 text-sm text-neutral-400">
                    まだ家系グループがありません。
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {families.map((f) => (
                      <div
                        key={f.id}
                        className="rounded-lg bg-neutral-900 px-4 py-3"
                      >
                        <div className="font-semibold">{f.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={signOut}
                className="w-full rounded-xl bg-red-600 py-3 font-semibold"
              >
                ログアウト
              </button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <input
                className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 outline-none"
                placeholder="メールアドレス"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 outline-none"
                placeholder="パスワード"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button
                onClick={signIn}
                className="w-full rounded-xl bg-blue-600 py-3 font-semibold"
              >
                ログイン
              </button>

              <button
                onClick={signUp}
                className="w-full rounded-xl bg-green-600 py-3 font-semibold"
              >
                新規登録
              </button>

              <button
                onClick={resetPassword}
                className="w-full rounded-xl bg-neutral-700 py-3 text-sm font-semibold"
              >
                パスワードを忘れた方
              </button>
            </div>
          )}

          {message && (
            <div className="mt-5 rounded-xl bg-neutral-800 p-4 text-sm">
              {message}
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}