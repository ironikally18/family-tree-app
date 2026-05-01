"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import BottomNav from "../../components/BottomNav";

type Person = {
  id: string;
  name: string;
  kana?: string | null;
  birth_order_label?: string | null;
  sibling_order?: number | null;
};

type Relation = {
  id: string;
  relation_type: string;
  person1_id: string;
  person2_id: string;
};

export default function TreePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadFamily();
  }, []);

  async function loadFamily() {
    const { data, error } = await supabase
      .from("families")
      .select("id")
      .limit(1)
      .single();

    if (error || !data) {
      setMessage("家系グループが見つかりません。");
      return;
    }

    await loadData(data.id);
  }

  async function loadData(familyId: string) {
    const { data: peopleData } = await supabase
      .from("people")
      .select("id, name, kana, birth_order_label, sibling_order")
      .eq("family_id", familyId)
      .is("deleted_at", null)
      .order("kana", { ascending: true });

    const { data: relationData } = await supabase
      .from("relationships")
      .select("id, relation_type, person1_id, person2_id")
      .eq("family_id", familyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    setPeople(peopleData ?? []);
    setRelations(relationData ?? []);
  }

  const personMap = useMemo(() => {
    const map = new Map<string, Person>();
    people.forEach((p) => map.set(p.id, p));
    return map;
  }, [people]);

  const validPersonIds = useMemo(() => {
    return new Set(people.map((p) => p.id));
  }, [people]);

  const spouseMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; type: string }[]>();

    relations
      .filter(
        (r) =>
          (r.relation_type === "spouse" ||
            r.relation_type === "divorced") &&
          validPersonIds.has(r.person1_id) &&
          validPersonIds.has(r.person2_id)
      )
      .forEach((r) => {
        const p1 = personMap.get(r.person1_id);
        const p2 = personMap.get(r.person2_id);
        if (!p1 || !p2) return;

        if (!map.has(r.person1_id)) map.set(r.person1_id, []);
        if (!map.has(r.person2_id)) map.set(r.person2_id, []);

        map.get(r.person1_id)!.push({ id: r.person2_id, name: p2.name, type: r.relation_type });
        map.get(r.person2_id)!.push({ id: r.person1_id, name: p1.name, type: r.relation_type });
      });

    return map;
  }, [relations, personMap]);

  const childrenMap = useMemo(() => {
    const map = new Map<string, string[]>();

    relations
      .filter(
        (r) =>
          (r.relation_type === "parent_child" ||
            r.relation_type === "adoptive_parent_child") &&
          validPersonIds.has(r.person1_id) &&
          validPersonIds.has(r.person2_id)
      )
      .forEach((r) => {
        if (!map.has(r.person1_id)) map.set(r.person1_id, []);
        map.get(r.person1_id)!.push(r.person2_id);
      });

    for (const [parentId, children] of map.entries()) {
      children.sort((a, b) => {
        const pa = personMap.get(a);
        const pb = personMap.get(b);

        const orderA = pa?.sibling_order ?? 9999;
        const orderB = pb?.sibling_order ?? 9999;

        if (orderA !== orderB) {
          return orderA - orderB;
        }

        return (pa?.kana || pa?.name || "").localeCompare(
          pb?.kana || pb?.name || "",
          "ja"
        );
      });
      map.set(parentId, children);
    }

    return map;
  }, [relations, personMap]);

  const rootPeople = useMemo(() => {
    const childIds = new Set<string>();
    const spouseHiddenIds = new Set<string>();

    relations
      .filter(
        (r) =>
          r.relation_type === "parent_child" ||
          r.relation_type === "adoptive_parent_child"
      )
      .forEach((r) => childIds.add(r.person2_id));

    relations
      .filter((r) => r.relation_type === "spouse" || r.relation_type === "divorced")
      .forEach((r) => {
        const hideId = r.person1_id < r.person2_id ? r.person2_id : r.person1_id;
        spouseHiddenIds.add(hideId);
      });

    return people.filter((p) => !childIds.has(p.id) && !spouseHiddenIds.has(p.id));
  }, [people, relations]);

  function VerticalName({ person }: { person: Person }) {
    return (
      <div className="flex flex-col items-center">
        <div
          className="flex min-h-[116px] min-w-[48px] items-center justify-center rounded-xl border border-amber-400/70 bg-neutral-950 px-2 py-3 text-base font-bold shadow-[0_0_16px_rgba(245,158,11,0.12)]"
          style={{
            writingMode: "vertical-rl",
            textOrientation: "upright",
          }}
        >
          {person.name}
        </div>

      </div>
    );
  }

  function FamilyNode({
    personId,
    visited,
  }: {
    personId: string;
    visited: Set<string>;
  }) {
    const person = personMap.get(personId);
    if (!person) return null;

    if (visited.has(personId)) {
      return (
        <div className="rounded-xl bg-red-950 p-3 text-sm text-red-200">
          循環データの可能性：{person.name}
        </div>
      );
    }

    const nextVisited = new Set(visited);
    nextVisited.add(personId);

    const spouses = spouseMap.get(personId) ?? [];
    const mainSpouse = spouses.find((s) => personId < s.id);
    const spousePerson = mainSpouse ? personMap.get(mainSpouse.id) : null;

    const personChildren = childrenMap.get(personId) ?? [];
    const spouseChildren = mainSpouse ? childrenMap.get(mainSpouse.id) ?? [] : [];
    const childIds = Array.from(new Set([...personChildren, ...spouseChildren]));

    return (
      <div className="flex flex-col items-start overflow-visible">
        {/* 本人＋配偶者 */}
        <div className="relative flex items-start gap-4 overflow-visible">
          <VerticalName person={person} />

          {spousePerson && (
            <>
              <div className="mt-[58px] h-[3px] w-10 rounded-full bg-amber-300" />

              <div className="flex flex-col items-center">
                <VerticalName person={spousePerson} />
                {mainSpouse?.type === "divorced" && (
                  <div className="mt-1 rounded-full bg-red-950 px-2 py-0.5 text-xs text-red-300">
                    離縁
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* 子がいる場合：本人カード中央から下へ線を出す */}
        {childIds.length > 0 && (
          <>
            {/* 夫婦線の中央から下へ */}
            <div className={spousePerson ? "ml-[94px] h-8 w-[2px] bg-white/85" : "ml-[23px] h-8 w-[2px] bg-white/85"} />

            <div
              className={
                spousePerson
                  ? "relative ml-[71px] flex w-max items-start justify-start gap-16 pt-10"
                  : "relative flex w-max items-start justify-start gap-16 pt-10"
              }
            >
              {/* 兄弟間の横線：子本人の中央同士だけをつなぐ */}
              {childIds.length > 1 && (
                <div className="absolute top-0 left-[23px] right-[73px] h-[2px] bg-white/85" />
              )}

              {childIds.map((childId) => (
                <div
                  key={childId}
                  className="relative flex w-[96px] shrink-0 flex-col items-start overflow-visible"
                >
                  {/* 横線から子本人中央へ */}
                  <div className="absolute left-[23px] -top-10 h-10 w-[2px] bg-white/85" />
                  <div className="absolute left-[19px] -top-[5px] h-2.5 w-2.5 rounded-full bg-white" />

                  <FamilyNode personId={childId} visited={nextVisited} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-5 pb-24 text-white">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-bold">家系図</h1>
        <p className="mt-2 text-sm text-neutral-400">
          夫婦線は金色、親子線は白色で表示します。横に広い場合は左右にスクロールできます。
        </p>

        {message && (
          <div className="mt-4 rounded-xl bg-neutral-800 p-3 text-sm">
            {message}
          </div>
        )}
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-neutral-700 bg-[radial-gradient(circle_at_top,rgba(38,38,38,0.9),rgba(10,10,10,0.95))] p-10">
        <div className="inline-flex w-max min-w-full justify-center gap-28 py-8">
          {rootPeople.length === 0 ? (
            <p className="text-sm text-neutral-400">
              家系図に表示できる人物がありません。
            </p>
          ) : (
            rootPeople.map((p) => (
              <FamilyNode key={p.id} personId={p.id} visited={new Set()} />
            ))
          )}
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
        <div className="flex items-center gap-3">
          <span className="h-[3px] w-8 rounded-full bg-amber-300" />
          <span>夫婦</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="h-[2px] w-8 bg-white/85" />
          <span>親子</span>
        </div>
      </div>

      <BottomNav />
    </main>
  );
}