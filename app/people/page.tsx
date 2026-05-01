"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import BottomNav from "../../components/BottomNav";

type Person = {
  id: string;
  name: string;
  kana: string | null;
  maiden_name: string | null;
  birth_order_label: string | null;
  profile_note: string | null;
  birth_date: string | null;
  sibling_order: number | null;
};

export default function PeoplePage() {
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);

  const [name, setName] = useState("");
  const [kana, setKana] = useState("");
  const [maidenName, setMaidenName] = useState("");
  const [birthOrderLabel, setBirthOrderLabel] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [profileNote, setProfileNote] = useState("");
  const [siblingOrder, setSiblingOrder] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});

  const [message, setMessage] = useState("");

  const [deletedPeople, setDeletedPeople] = useState<Person[]>([]);

  useEffect(() => {
    loadFamily();
  }, []);

  async function loadFamily() {
    const { data, error } = await supabase
      .from("family_members")
      .select("family_id, role")
      .limit(1)
      .single();

    if (error || !data) {
      setMessage("参加中の家系グループが見つかりません。");
      return;
    }

    setFamilyId(data.family_id);
    await loadPeople(data.family_id);
    await loadDeletedPeople(data.family_id);
  }

  async function restorePerson(personId: string) {
    const { error } = await supabase.rpc("restore_person", {
      target_person_id: personId,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("復元しました。");

    if (familyId) {
      await loadPeople(familyId);
      await loadDeletedPeople(familyId);
    }
  }

  async function loadPeople(fid: string) {
    const { data } = await supabase
      .from("people")
      .select("*")
      .eq("family_id", fid)
      .is("deleted_at", null)
      .order("kana");

    setPeople(data ?? []);
  }

  async function loadDeletedPeople(fid: string) {
    const { data, error } = await supabase
      .from("people")
      .select("*")
      .eq("family_id", fid)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setDeletedPeople(data ?? []);
  }

  async function addPerson() {
    if (!familyId) return;

    const { error } = await supabase.from("people").insert({
      family_id: familyId,
      name,
      kana,
      maiden_name: maidenName,
      birth_order_label: birthOrderLabel,
      sibling_order: siblingOrder ? Number(siblingOrder) : null,
      birth_date: birthDate || null,
      profile_note: profileNote,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setName("");
    setKana("");
    setMaidenName("");
    setBirthOrderLabel("");
    setBirthDate("");
    setProfileNote("");
    setSiblingOrder("");

    setMessage("追加しました");
    loadPeople(familyId);
  }

  function startEdit(p: Person) {
    setEditingId(p.id);
    setEditData({ ...p });
  }

  async function saveEdit() {
    if (!editingId) return;

    const { error } = await supabase
      .from("people")
      .update({
        name: editData.name,
        kana: editData.kana,
        maiden_name: editData.maiden_name,
        birth_order_label: editData.birth_order_label,
        sibling_order: editData.sibling_order,
        birth_date: editData.birth_date,
        profile_note: editData.profile_note,
      })
      .eq("id", editingId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setEditingId(null);
    setMessage("更新しました");
    if (familyId) loadPeople(familyId);
  }

  async function deletePerson() {
    if (!editingId) return;

    if (!confirm("本当に削除しますか？")) return;

    const { error } = await supabase.rpc("soft_delete_person", {
      target_person_id: editingId,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setEditingId(null);
    setMessage("削除しました。");

    if (familyId) loadPeople(familyId);
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-5 pb-24 text-white">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-bold">人物管理</h1>

        {/* 追加フォーム */}
        <div className="mt-5 bg-neutral-900 p-4 rounded-2xl">
          <input
            className="w-full mb-2 bg-neutral-800 p-3 rounded"
            placeholder="氏名"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full mb-2 bg-neutral-800 p-3 rounded"
            placeholder="ふりがな"
            value={kana}
            onChange={(e) => setKana(e.target.value)}
          />
          <input
            className="w-full mb-2 bg-neutral-800 p-3 rounded"
            placeholder="旧姓"
            value={maidenName}
            onChange={(e) => setMaidenName(e.target.value)}
          />
          <input
            className="w-full mb-2 bg-neutral-800 p-3 rounded"
            placeholder="長男・次男など"
            value={birthOrderLabel}
            onChange={(e) => setBirthOrderLabel(e.target.value)}
          />
          <input
            type="number"
            className="w-full mb-2 bg-neutral-800 p-3 rounded"
            placeholder="兄弟順（例：1=長男/長女、2=次男/次女）"
            value={siblingOrder}
            onChange={(e) => setSiblingOrder(e.target.value)}
          />
          <input
            type="date"
            className="w-full mb-2 bg-neutral-800 p-3 rounded"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
          <textarea
            className="w-full mb-2 bg-neutral-800 p-3 rounded"
            placeholder="補足"
            value={profileNote}
            onChange={(e) => setProfileNote(e.target.value)}
          />

          <button
            onClick={addPerson}
            className="w-full bg-blue-600 p-3 rounded"
          >
            追加
          </button>
        </div>

        {message && (
          <div className="mt-3 bg-neutral-800 p-3 rounded">{message}</div>
        )}

        {/* 一覧 */}
        <div className="mt-5 space-y-3">
          {people.map((p) => (
            <div key={p.id} className="bg-neutral-800 p-4 rounded-xl">
              {editingId === p.id ? (
                <>
                  <input
                    className="w-full mb-2 bg-neutral-700 p-2 rounded"
                    value={editData.name}
                    onChange={(e) =>
                      setEditData({ ...editData, name: e.target.value })
                    }
                  />
                  <input
                    className="w-full mb-2 bg-neutral-700 p-2 rounded"
                    value={editData.kana || ""}
                    onChange={(e) =>
                      setEditData({ ...editData, kana: e.target.value })
                    }
                  />
                  <input
                    className="w-full mb-2 bg-neutral-700 p-2 rounded"
                    value={editData.maiden_name || ""}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        maiden_name: e.target.value,
                      })
                    }
                  />
                  <input
                    className="w-full mb-2 bg-neutral-700 p-2 rounded"
                    value={editData.birth_order_label || ""}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        birth_order_label: e.target.value,
                      })
                    }
                  />
                  <input
                    type="number"
                    className="w-full mb-2 bg-neutral-700 p-2 rounded"
                    value={editData.sibling_order || ""}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        sibling_order: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                  <input
                    type="date"
                    className="w-full mb-2 bg-neutral-700 p-2 rounded"
                    value={editData.birth_date || ""}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        birth_date: e.target.value,
                      })
                    }
                  />
                  <textarea
                    className="w-full mb-2 bg-neutral-700 p-2 rounded"
                    value={editData.profile_note || ""}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        profile_note: e.target.value,
                      })
                    }
                  />

                  <button
                    onClick={saveEdit}
                    className="w-full bg-green-600 p-2 rounded"
                  >
                    保存
                  </button>
                  <button
                    onClick={deletePerson}
                    className="mt-2 w-full bg-red-600 p-2 rounded"
                  >
                    削除
                  </button>
                </>
              ) : (
                <>
                  <div className="font-bold">{p.name}</div>
                  {p.kana && <div className="text-sm">{p.kana}</div>}
                  {p.maiden_name && <div>旧姓：{p.maiden_name}</div>}
                  {p.birth_order_label && <div>{p.birth_order_label}</div>}
                  {p.sibling_order && <div>兄弟順：{p.sibling_order}</div>}
                  {p.birth_date && <div>{p.birth_date}</div>}
                  {p.profile_note && <div>{p.profile_note}</div>}

                  <button
                    onClick={() => startEdit(p)}
                    className="mt-2 w-full bg-blue-600 p-2 rounded"
                  >
                    編集
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="mt-8 rounded-2xl bg-neutral-900 p-4">
          <h2 className="font-bold text-red-300">削除済み</h2>

          {deletedPeople.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">
              削除済みの人物はありません。
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {deletedPeople.map((p) => (
                <div key={p.id} className="rounded-xl bg-neutral-800 p-4">
                  <div className="font-bold">{p.name}</div>
                  {p.kana && <div className="text-sm text-neutral-400">{p.kana}</div>}

                  <button
                    onClick={() => restorePerson(p.id)}
                    className="mt-3 w-full rounded bg-green-600 p-2 font-semibold"
                  >
                    復元
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </main>
  );
}