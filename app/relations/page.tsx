"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import BottomNav from "../../components/BottomNav";

type Person = {
  id: string;
  name: string;
};

type Relation = {
  id: string;
  family_id: string;
  relation_type: string;
  person1_id: string;
  person2_id: string;
  person1?: Person;
  person2?: Person;
};

type CoupleChild = {
  id: string;
  family_id: string;
  relationship_id: string;
  child_id: string;
  display_order: number | null;
  child?: Person;
  relationship?: Relation;
};

export default function RelationsPage() {
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [coupleChildren, setCoupleChildren] = useState<CoupleChild[]>([]);

  const [person1Id, setPerson1Id] = useState("");
  const [person2Id, setPerson2Id] = useState("");
  const [relationType, setRelationType] = useState("spouse");

  const [selectedCoupleId, setSelectedCoupleId] = useState("");
  const [childId, setChildId] = useState("");
  const [displayOrder, setDisplayOrder] = useState("");

  const [editingRelationId, setEditingRelationId] = useState<string | null>(null);
  const [editRelation, setEditRelation] = useState({
    family_id: "",
    person1_id: "",
    person2_id: "",
    relation_type: "spouse",
  });

  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [editChild, setEditChild] = useState({
    family_id: "",
    relationship_id: "",
    child_id: "",
    display_order: "",
  });

  const [message, setMessage] = useState("");

  const [familyOptions, setFamilyOptions] = useState<any[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState("");

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

    const { data: families } = await supabase
      .from("families")
      .select("id, name")
      .in("id", ids);

    setFamilyOptions(families ?? []);

    if (families && families.length > 0) {
      const fid = families[0].id;
      setSelectedFamilyId(fid);
      setFamilyId(fid);
      await reloadAll(fid);
    }
  }

  async function reloadAll(fid: string) {
    await loadPeople(fid);
    await loadRelations(fid);
    await loadCoupleChildren(fid);
  }

  async function loadPeople(fid: string) {
    const { data, error } = await supabase
      .from("person_families")
      .select(`
      person:people(
        id,
        name
      )
    `)
      .eq("family_id", fid);

    if (error) {
      setMessage(error.message);
      return;
    }

    const list = (data ?? [])
      .map((x: any) => x.person)
      .filter(Boolean)
      .sort((a: Person, b: Person) => a.name.localeCompare(b.name, "ja"));

    setPeople(list);
  }

  async function loadRelations(fid: string) {
    const { data, error } = await supabase
      .from("relationships")
      .select(`
        id,
        family_id,
        relation_type,
        person1_id,
        person2_id,
        person1:person1_id(id, name),
        person2:person2_id(id, name)
      `)
      .eq("family_id", fid)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(error.message);
      return;
    }

    setRelations((data ?? []) as unknown as Relation[]);
  }

  async function loadCoupleChildren(fid: string) {
    const { data, error } = await supabase
      .from("couple_children")
      .select(`
  id,
  family_id,
  relationship_id,
  child_id,
  display_order,
  child:child_id(id, name),
  relationship:relationship_id(
    id,
    family_id,
    relation_type,
    person1_id,
    person2_id,
    person1:person1_id(id, name),
    person2:person2_id(id, name)
  )
`)
      .eq("family_id", fid)
      .is("deleted_at", null)
      .order("display_order", { ascending: true });

    if (error) {
      setMessage(error.message);
      return;
    }

    setCoupleChildren((data ?? []) as unknown as CoupleChild[]);
  }

  function relationLabel(type: string) {
    if (type === "spouse") return "夫婦";
    if (type === "divorced") return "離縁・離婚";
    return type;
  }

  function coupleLabel(r: Relation) {
    return `${r.person1?.name ?? "人物1"} ─ ${r.person2?.name ?? "人物2"}（${relationLabel(r.relation_type)}）`;
  }

  const coupleRelations = relations.filter(
    (r) => r.relation_type === "spouse" || r.relation_type === "divorced"
  );

  async function addRelation() {
    setMessage("");

    if (!familyId) return;

    if (!person1Id || !person2Id) {
      setMessage("人物を2人選択してください。");
      return;
    }

    if (person1Id === person2Id) {
      setMessage("同じ人物同士は登録できません。");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("relationships").insert({
      family_id: selectedFamilyId,
      person1_id: person1Id,
      person2_id: person2Id,
      relation_type: relationType,
      created_by: userData.user?.id ?? null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setPerson1Id("");
    setPerson2Id("");
    setRelationType("spouse");
    setMessage("関係を登録しました。");

    await loadRelations(familyId);
  }

  async function addCoupleChild() {
    setMessage("");

    if (!familyId) return;

    if (!selectedCoupleId || !childId) {
      setMessage("夫婦と子どもを選択してください。");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("couple_children").insert({
      family_id: familyId,
      relationship_id: selectedCoupleId,
      child_id: childId,
      display_order: displayOrder ? Number(displayOrder) : null,
      created_by: userData.user?.id ?? null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setChildId("");
    setDisplayOrder("");
    setMessage("夫婦の子を登録しました。");

    await loadCoupleChildren(familyId);
  }

  function startEditRelation(r: Relation) {
    setEditingRelationId(r.id);
    setEditRelation({
      family_id: r.family_id,
      person1_id: r.person1_id,
      person2_id: r.person2_id,
      relation_type: r.relation_type,
    });
  }

  async function saveEditRelation() {
    if (!familyId || !editingRelationId) return;

    if (!editRelation.family_id) {
      setMessage("家系グループを選択してください。");
      return;
    }

    if (!editRelation.person1_id || !editRelation.person2_id) {
      setMessage("人物を2人選択してください。");
      return;
    }

    if (editRelation.person1_id === editRelation.person2_id) {
      setMessage("同じ人物同士は登録できません。");
      return;
    }

    const { error } = await supabase
      .from("relationships")
      .update({
        family_id: editRelation.family_id,
        person1_id: editRelation.person1_id,
        person2_id: editRelation.person2_id,
        relation_type: editRelation.relation_type,
      })
      .eq("id", editingRelationId);

    if (error) {
      setMessage(error.message);
      return;
    }

    const { error: childError } = await supabase
      .from("couple_children")
      .update({
        family_id: editRelation.family_id,
      })
      .eq("relationship_id", editingRelationId);

    if (childError) {
      setMessage(childError.message);
      return;
    }

    setEditingRelationId(null);
    setMessage("関係を更新しました。");

    if (selectedFamilyId) {
      await reloadAll(selectedFamilyId);
    }
  }

  async function deleteRelation(id: string) {
    if (!familyId) return;
    if (!confirm("この夫婦・離縁関係を削除しますか？")) return;

    setMessage("");

    const { error } = await supabase.rpc("soft_delete_relationship", {
      target_relationship_id: id,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("関係を削除しました。");
    await reloadAll(familyId);
  }

  function startEditChild(cc: CoupleChild) {
    setEditingChildId(cc.id);
    setEditChild({
      family_id: cc.family_id,
      relationship_id: cc.relationship_id,
      child_id: cc.child_id,
      display_order: cc.display_order ? String(cc.display_order) : "",
    });
  }

  async function saveEditChild() {
    if (!familyId || !editingChildId) return;

    if (!editChild.relationship_id || !editChild.child_id) {
      setMessage("夫婦と子どもを選択してください。");
      return;
    }

    const { error } = await supabase
      .from("couple_children")
      .update({
        family_id: editChild.family_id,
        relationship_id: editChild.relationship_id,
        child_id: editChild.child_id,
        display_order: editChild.display_order ? Number(editChild.display_order) : null,
      })
      .eq("id", editingChildId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setEditingChildId(null);
    setMessage("夫婦の子を更新しました。");
    await loadCoupleChildren(familyId);
  }

  async function deleteCoupleChild(id: string) {
    if (!familyId) return;
    if (!confirm("この子ども登録を削除しますか？")) return;

    setMessage("");

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("couple_children")
      .update({ deleted_at: now })
      .eq("id", id)
      .select("id, deleted_at")
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("夫婦の子登録を削除しました。");
    await loadCoupleChildren(familyId);
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-5 pb-24 text-white">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-bold">関係登録</h1>

        <select
          className="mt-4 w-full rounded-xl bg-neutral-800 p-3"
          value={selectedFamilyId}
          onChange={async (e) => {
            const fid = e.target.value;
            setSelectedFamilyId(fid);
            setFamilyId(fid);
            setPerson1Id("");
            setPerson2Id("");
            setSelectedCoupleId("");
            setChildId("");
            await reloadAll(fid);
          }}
        >
          {familyOptions.map(f => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        <div className="mt-5 rounded-2xl bg-neutral-900 p-4">
          <h2 className="font-bold">夫婦・離縁を登録</h2>
          <p>家系図作成の都合上、子を登録する場合、２名１組で登録</p>
          <p>親１名の場合、仮登録可</p>

          <select className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3" value={person1Id} onChange={(e) => setPerson1Id(e.target.value)}>
            <option value="">人物1</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <select className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3" value={relationType} onChange={(e) => setRelationType(e.target.value)}>
            <option value="spouse">夫婦</option>
            <option value="divorced">離縁・離婚</option>
          </select>

          <select className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3" value={person2Id} onChange={(e) => setPerson2Id(e.target.value)}>
            <option value="">人物2</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <button onClick={addRelation} className="mt-4 w-full rounded-xl bg-blue-600 py-3 font-semibold">
            関係を登録
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-neutral-900 p-4">
          <h2 className="font-bold">夫婦の子を登録</h2>

          <select className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3" value={selectedCoupleId} onChange={(e) => setSelectedCoupleId(e.target.value)}>
            <option value="">夫婦・離縁を選択</option>
            {coupleRelations.map((r) => <option key={r.id} value={r.id}>{coupleLabel(r)}</option>)}
          </select>

          <select className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3" value={childId} onChange={(e) => setChildId(e.target.value)}>
            <option value="">子どもを選択</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <input className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3" type="number" placeholder="兄弟順 例：1=長男/長女、2=次男/次女" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} />

          <button onClick={addCoupleChild} className="mt-4 w-full rounded-xl bg-green-600 py-3 font-semibold">
            夫婦の子として登録
          </button>
        </div>

        {message && <div className="mt-4 rounded-xl bg-neutral-800 p-3 text-sm">{message}</div>}

        <div className="mt-6 rounded-2xl bg-neutral-900 p-4">
          <h2 className="font-bold">登録済みの夫婦・離縁</h2>

          <div className="mt-3 space-y-3">
            {coupleRelations.map((r) => (
              <div key={r.id} className="rounded-xl bg-neutral-800 p-3 text-sm">
                {editingRelationId === r.id ? (
                  <>
                    <select
                      className="mb-2 w-full rounded bg-neutral-700 p-2"
                      value={editRelation.family_id}
                      onChange={(e) =>
                        setEditRelation({
                          ...editRelation,
                          family_id: e.target.value,
                        })
                      }
                    >
                      {familyOptions.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>

                    <select
                      className="w-full rounded bg-neutral-700 p-2"
                      value={editRelation.person1_id}
                      onChange={(e) =>
                        setEditRelation({ ...editRelation, person1_id: e.target.value })
                      }
                    >
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>

                    <select
                      className="mt-2 w-full rounded bg-neutral-700 p-2"
                      value={editRelation.relation_type}
                      onChange={(e) =>
                        setEditRelation({ ...editRelation, relation_type: e.target.value })
                      }
                    >
                      <option value="spouse">夫婦</option>
                      <option value="divorced">離縁・離婚</option>
                    </select>

                    <select
                      className="mt-2 w-full rounded bg-neutral-700 p-2"
                      value={editRelation.person2_id}
                      onChange={(e) =>
                        setEditRelation({ ...editRelation, person2_id: e.target.value })
                      }
                    >
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={saveEditRelation}
                      className="mt-3 w-full rounded bg-green-600 p-2 font-semibold"
                    >
                      保存
                    </button>

                    <button
                      onClick={() => setEditingRelationId(null)}
                      className="mt-2 w-full rounded bg-neutral-600 p-2"
                    >
                      キャンセル
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate font-semibold">
                      {coupleLabel(r)}
                    </div>

                    <button
                      onClick={() => startEditRelation(r)}
                      className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold"
                    >
                      編集
                    </button>

                    <button
                      onClick={() => deleteRelation(r.id)}
                      className="shrink-0 rounded bg-red-700 px-3 py-1.5 text-xs font-semibold"
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-neutral-900 p-4">
          <h2 className="font-bold">登録済みの夫婦の子</h2>

          <div className="mt-3 space-y-3">
            {coupleChildren.map((cc) => (
              <div key={cc.id} className="rounded-xl bg-neutral-800 p-3 text-sm">
                {editingChildId === cc.id ? (
                  <>
                    <select
                      className="mb-2 w-full rounded bg-neutral-700 p-2"
                      value={editChild.family_id}
                      onChange={(e) =>
                        setEditChild({
                          ...editChild,
                          family_id: e.target.value,
                        })
                      }
                    >
                      {familyOptions.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>

                    <select
                      className="w-full rounded bg-neutral-700 p-2"
                      value={editChild.relationship_id}
                      onChange={(e) =>
                        setEditChild({ ...editChild, relationship_id: e.target.value })
                      }
                    >
                      {coupleRelations.map((r) => (
                        <option key={r.id} value={r.id}>
                          {coupleLabel(r)}
                        </option>
                      ))}
                    </select>

                    <select
                      className="mt-2 w-full rounded bg-neutral-700 p-2"
                      value={editChild.child_id}
                      onChange={(e) =>
                        setEditChild({ ...editChild, child_id: e.target.value })
                      }
                    >
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>

                    <input
                      className="mt-2 w-full rounded bg-neutral-700 p-2"
                      type="number"
                      placeholder="兄弟順"
                      value={editChild.display_order}
                      onChange={(e) =>
                        setEditChild({ ...editChild, display_order: e.target.value })
                      }
                    />

                    <button
                      onClick={saveEditChild}
                      className="mt-3 w-full rounded bg-green-600 p-2 font-semibold"
                    >
                      保存
                    </button>

                    <button
                      onClick={() => setEditingChildId(null)}
                      className="mt-2 w-full rounded bg-neutral-600 p-2"
                    >
                      キャンセル
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate">
                      <span className="font-semibold">
                        {cc.relationship?.person1?.name} ─ {cc.relationship?.person2?.name}
                      </span>
                      <span className="mx-1 text-neutral-400">＞</span>
                      <span>{cc.child?.name ?? "不明"}</span>
                    </div>

                    <button
                      onClick={() => startEditChild(cc)}
                      className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold"
                    >
                      編集
                    </button>

                    <button
                      onClick={() => deleteCoupleChild(cc.id)}
                      className="shrink-0 rounded bg-red-700 px-3 py-1.5 text-xs font-semibold"
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}