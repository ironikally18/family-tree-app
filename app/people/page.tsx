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
  deleted_at?: string | null;
};

type FamilyOption = {
  id: string;
  name: string;
};

type EditData = {
  name: string;
  kana: string;
  maiden_name: string;
  birth_order_label: string;
  profile_note: string;
  birth_date: string;
  sibling_order: number | null;
  family_ids: string[];
};

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [deletedPeople, setDeletedPeople] = useState<Person[]>([]);
  const [familyOptions, setFamilyOptions] = useState<FamilyOption[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState("");

  const [name, setName] = useState("");
  const [kana, setKana] = useState("");
  const [maidenName, setMaidenName] = useState("");
  const [birthOrderLabel, setBirthOrderLabel] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [profileNote, setProfileNote] = useState("");
  const [siblingOrder, setSiblingOrder] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData>({
    name: "",
    kana: "",
    maiden_name: "",
    birth_order_label: "",
    profile_note: "",
    birth_date: "",
    sibling_order: null,
    family_ids: [],
  });

  const [message, setMessage] = useState("");

  useEffect(() => {
    loadFamilies();
  }, []);

  async function loadFamilies() {
    const { data: memberData, error } = await supabase
      .from("family_members")
      .select("family_id");

    if (error || !memberData || memberData.length === 0) {
      setMessage("参加中の家系グループが見つかりません。");
      return;
    }

    const ids = Array.from(new Set(memberData.map((x) => x.family_id)));

    const { data: families, error: familyError } = await supabase
      .from("families")
      .select("id, name")
      .in("id", ids)
      .order("created_at", { ascending: true });

    if (familyError) {
      setMessage(familyError.message);
      return;
    }

    const options = (families ?? []) as FamilyOption[];
    setFamilyOptions(options);

    if (options.length > 0) {
      setSelectedFamilyId(options[0].id);
      await loadPeople(options[0].id);
      await loadDeletedPeople(options[0].id);
    }
  }

  async function loadPeople(fid: string) {
    const { data, error } = await supabase
      .from("person_families")
      .select(`
        person:people(
          id,
          name,
          kana,
          maiden_name,
          birth_order_label,
          profile_note,
          birth_date,
          sibling_order,
          deleted_at
        )
      `)
      .eq("family_id", fid);

    if (error) {
      setMessage(error.message);
      return;
    }

    const list = (data ?? [])
      .map((x: any) => x.person)
      .filter((p: Person | null) => p && !p.deleted_at)
      .sort((a: Person, b: Person) =>
        (a.kana || a.name).localeCompare(b.kana || b.name, "ja")
      );

    setPeople(list);
  }

  async function loadDeletedPeople(fid: string) {
    const { data, error } = await supabase
      .from("person_families")
      .select(`
        person:people(
          id,
          name,
          kana,
          maiden_name,
          birth_order_label,
          profile_note,
          birth_date,
          sibling_order,
          deleted_at
        )
      `)
      .eq("family_id", fid);

    if (error) {
      setMessage(error.message);
      return;
    }

    const list = (data ?? [])
      .map((x: any) => x.person)
      .filter((p: Person | null) => p && p.deleted_at)
      .sort((a: Person, b: Person) =>
        (a.kana || a.name).localeCompare(b.kana || b.name, "ja")
      );

    setDeletedPeople(list);
  }

  async function addPerson() {
    if (!selectedFamilyId) return;

    if (!name.trim()) {
      setMessage("氏名を入力してください。");
      return;
    }

    const { data: inserted, error } = await supabase
      .from("people")
      .insert({
        family_id: selectedFamilyId,
        name: name.trim(),
        kana,
        maiden_name: maidenName,
        birth_order_label: birthOrderLabel,
        sibling_order: siblingOrder ? Number(siblingOrder) : null,
        birth_date: birthDate || null,
        profile_note: profileNote,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      setMessage(error?.message ?? "人物登録に失敗しました。");
      return;
    }

    const { error: linkError } = await supabase.from("person_families").insert({
      person_id: inserted.id,
      family_id: selectedFamilyId,
    });

    if (linkError) {
      setMessage(linkError.message);
      return;
    }

    setName("");
    setKana("");
    setMaidenName("");
    setBirthOrderLabel("");
    setBirthDate("");
    setProfileNote("");
    setSiblingOrder("");

    setMessage("追加しました。");
    await loadPeople(selectedFamilyId);
  }

  async function startEdit(p: Person) {
    setEditingId(p.id);

    const { data, error } = await supabase
      .from("person_families")
      .select("family_id")
      .eq("person_id", p.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    const familyIds = (data ?? []).map((x: any) => x.family_id);

    setEditData({
      name: p.name ?? "",
      kana: p.kana ?? "",
      maiden_name: p.maiden_name ?? "",
      birth_order_label: p.birth_order_label ?? "",
      profile_note: p.profile_note ?? "",
      birth_date: p.birth_date ?? "",
      sibling_order: p.sibling_order,
      family_ids: familyIds,
    });
  }

  async function saveEdit() {
    if (!editingId) return;

    if (!editData.name.trim()) {
      setMessage("氏名を入力してください。");
      return;
    }

    if (editData.family_ids.length === 0) {
      setMessage("所属する家系グループを1つ以上選択してください。");
      return;
    }

    const { error } = await supabase
      .from("people")
      .update({
        name: editData.name.trim(),
        kana: editData.kana,
        maiden_name: editData.maiden_name,
        birth_order_label: editData.birth_order_label,
        sibling_order: editData.sibling_order,
        birth_date: editData.birth_date || null,
        profile_note: editData.profile_note,
      })
      .eq("id", editingId);

    if (error) {
      setMessage(error.message);
      return;
    }

    const { error: deleteLinkError } = await supabase
      .from("person_families")
      .delete()
      .eq("person_id", editingId);

    if (deleteLinkError) {
      setMessage(deleteLinkError.message);
      return;
    }

    const { error: insertLinkError } = await supabase
      .from("person_families")
      .insert(
        editData.family_ids.map((fid) => ({
          person_id: editingId,
          family_id: fid,
        }))
      );

    if (insertLinkError) {
      setMessage(insertLinkError.message);
      return;
    }

    setEditingId(null);
    setMessage("更新しました。");

    if (selectedFamilyId) {
      await loadPeople(selectedFamilyId);
      await loadDeletedPeople(selectedFamilyId);
    }
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

    if (selectedFamilyId) {
      await loadPeople(selectedFamilyId);
      await loadDeletedPeople(selectedFamilyId);
    }
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

    if (selectedFamilyId) {
      await loadPeople(selectedFamilyId);
      await loadDeletedPeople(selectedFamilyId);
    }
  }

  function familyNamesForPerson(personId: string) {
    return "";
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-5 pb-24 text-white">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-bold">人登録</h1>

        <div className="mt-5 rounded-2xl bg-neutral-900 p-4">
          <select
            className="mb-3 w-full rounded bg-neutral-800 p-3"
            value={selectedFamilyId}
            onChange={async (e) => {
              const fid = e.target.value;
              setSelectedFamilyId(fid);
              setEditingId(null);
              await loadPeople(fid);
              await loadDeletedPeople(fid);
            }}
          >
            {familyOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          <input
            className="mb-2 w-full rounded bg-neutral-800 p-3"
            placeholder="氏名"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            className="mb-2 w-full rounded bg-neutral-800 p-3"
            placeholder="ふりがな（入力あり→下記一覧で名前順表示）"
            value={kana}
            onChange={(e) => setKana(e.target.value)}
          />

          <input
            className="mb-2 w-full rounded bg-neutral-800 p-3"
            placeholder="旧姓"
            value={maidenName}
            onChange={(e) => setMaidenName(e.target.value)}
          />

          <input
            className="mb-2 w-full rounded bg-neutral-800 p-3"
            placeholder="長男・次男など"
            value={birthOrderLabel}
            onChange={(e) => setBirthOrderLabel(e.target.value)}
          />

          <input
            type="number"
            className="mb-2 w-full rounded bg-neutral-800 p-3"
            placeholder="誕生順番（第1子=1、第2子=2、…）"
            value={siblingOrder}
            onChange={(e) => setSiblingOrder(e.target.value)}
          />

          <input
            type="date"
            className="mb-2 w-full rounded bg-neutral-800 p-3"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />

          <textarea
            className="mb-2 w-full rounded bg-neutral-800 p-3"
            placeholder="補足"
            value={profileNote}
            onChange={(e) => setProfileNote(e.target.value)}
          />

          <button onClick={addPerson} className="w-full rounded bg-blue-600 p-3">
            追加
          </button>
        </div>

        {message && (
          <div className="mt-3 rounded bg-neutral-800 p-3 text-sm">
            {message}
          </div>
        )}

        <div className="mt-5 overflow-x-auto">
          <div className="min-w-[1200px] space-y-2">
            {people.map((p) => (
              <div key={p.id} className="rounded-xl bg-neutral-800 p-3">
                {editingId === p.id ? (
                  <div className="grid grid-cols-[180px_140px_140px_120px_120px_90px_140px_1fr_80px_80px] items-center gap-2 text-sm">
                    <div className="rounded bg-neutral-700 p-2 max-h-18 overflow-y-auto">
                      {familyOptions.map((f) => (
                        <label key={f.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editData.family_ids.includes(f.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditData({
                                  ...editData,
                                  family_ids: [...editData.family_ids, f.id],
                                });
                              } else {
                                setEditData({
                                  ...editData,
                                  family_ids: editData.family_ids.filter(
                                    (id) => id !== f.id
                                  ),
                                });
                              }
                            }}
                          />
                          {f.name}
                        </label>
                      ))}
                    </div>

                    <input
                      className="rounded bg-neutral-700 p-2"
                      value={editData.name}
                      onChange={(e) =>
                        setEditData({ ...editData, name: e.target.value })
                      }
                    />

                    <input
                      className="rounded bg-neutral-700 p-2"
                      value={editData.kana}
                      onChange={(e) =>
                        setEditData({ ...editData, kana: e.target.value })
                      }
                    />

                    <input
                      className="rounded bg-neutral-700 p-2"
                      value={editData.maiden_name}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          maiden_name: e.target.value,
                        })
                      }
                    />

                    <input
                      className="rounded bg-neutral-700 p-2"
                      value={editData.birth_order_label}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          birth_order_label: e.target.value,
                        })
                      }
                    />

                    <input
                      type="number"
                      className="rounded bg-neutral-700 p-2"
                      value={editData.sibling_order ?? ""}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          sibling_order: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    />

                    <input
                      type="date"
                      className="rounded bg-neutral-700 p-2"
                      value={editData.birth_date}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          birth_date: e.target.value,
                        })
                      }
                    />

                    <textarea
                      className="min-h-[40px] rounded bg-neutral-700 p-2"
                      value={editData.profile_note}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          profile_note: e.target.value,
                        })
                      }
                    />

                    <button
                      onClick={saveEdit}
                      className="rounded bg-green-600 p-2 font-semibold"
                    >
                      保存
                    </button>

                    <button
                      onClick={deletePerson}
                      className="rounded bg-red-600 p-2 font-semibold"
                    >
                      削除
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-[180px_140px_140px_120px_120px_90px_140px_1fr_80px] items-center gap-3 text-sm">
                    <div className="text-neutral-300">
                      表示中：{
                        familyOptions.find((f) => f.id === selectedFamilyId)?.name || "-"
                      }
                    </div>

                    <div className="font-bold text-white">{p.name || "-"}</div>
                    <div className="text-neutral-300">{p.kana || "-"}</div>
                    <div>{p.maiden_name ? `旧姓：${p.maiden_name}` : "-"}</div>
                    <div>{p.birth_order_label || "-"}</div>
                    <div>
                      {p.sibling_order ? `兄弟順：${p.sibling_order}` : "-"}
                    </div>
                    <div>{p.birth_date || "-"}</div>
                    <div className="truncate">{p.profile_note || "-"}</div>

                    <button
                      onClick={() => startEdit(p)}
                      className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold"
                    >
                      編集
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
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
                  {p.kana && (
                    <div className="text-sm text-neutral-400">{p.kana}</div>
                  )}

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