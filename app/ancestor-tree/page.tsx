"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import BottomNav from "../../components/BottomNav";

type Person = {
  id: string;
  name: string;
  kana: string | null;
  birth_date: string | null;
};

type Relation = {
  id: string;
  family_id: string;
  relation_type: string;
  person1_id: string;
  person2_id: string;
};

type CoupleChild = {
  id: string;
  relationship_id: string;
  child_id: string;
};

type FamilyOption = {
  id: string;
  name: string;
};

type AncestorNode = {
  person: Person;
  generation: number;
  x: number;
  y: number;
};

type AncestorLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

const CARD_W = 72;
const CARD_H = 150;
const X_GAP = 48;
const Y_GAP = 90;
const PAGE_MARGIN = 40;

function wareki(dateText: string | null) {
  if (!dateText) return "";

  const d = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";

  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();

  const eras = [
    { name: "令和", start: new Date("2019-05-01"), year: 2019 },
    { name: "平成", start: new Date("1989-01-08"), year: 1989 },
    { name: "昭和", start: new Date("1926-12-25"), year: 1926 },
    { name: "大正", start: new Date("1912-07-30"), year: 1912 },
    { name: "明治", start: new Date("1868-01-25"), year: 1868 },
    { name: "慶応", start: new Date("1865-05-01"), year: 1865 },
    { name: "元治", start: new Date("1864-03-27"), year: 1864 },
    { name: "文久", start: new Date("1861-03-29"), year: 1861 },
    { name: "万延", start: new Date("1860-03-18"), year: 1860 },
    { name: "安政", start: new Date("1854-11-27"), year: 1854 },
    { name: "嘉永", start: new Date("1848-04-01"), year: 1848 },
    { name: "弘化", start: new Date("1844-12-02"), year: 1844 },
    { name: "天保", start: new Date("1830-12-10"), year: 1830 },
    { name: "文政", start: new Date("1818-04-22"), year: 1818 },
    { name: "文化", start: new Date("1804-02-11"), year: 1804 },
  ];

  const era = eras.find((e) => d >= e.start);
  if (!era) return "";

  const eraYear = y - era.year + 1;
  const eraYearText = eraYear === 1 ? "元" : String(eraYear);

  return `${era.name}${eraYearText}年${m}月${day}日`;
}

function birthText(p: Person) {
  if (!p.birth_date) return "";
  return `${p.birth_date} / ${wareki(p.birth_date)}`;
}

export default function AncestorTreePage() {
  const [families, setFamilies] = useState<FamilyOption[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState("");

  const [people, setPeople] = useState<Person[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [coupleChildren, setCoupleChildren] = useState<CoupleChild[]>([]);

  const [selectedPersonId, setSelectedPersonId] = useState("");
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

    const { data: familyData, error: familyError } = await supabase
      .from("families")
      .select("id, name")
      .in("id", ids)
      .order("created_at", { ascending: true });

    if (familyError) {
      setMessage(familyError.message);
      return;
    }

    const options = (familyData ?? []) as FamilyOption[];
    setFamilies(options);

    if (options.length > 0) {
      setSelectedFamilyId(options[0].id);
      await loadFamilyData(options[0].id);
    }
  }

  async function loadFamilyData(fid: string) {
    setMessage("");

    const { data: peopleLinkData, error: peopleError } = await supabase
      .from("person_families")
      .select(`
        person:people(
          id,
          name,
          kana,
          birth_date
        )
      `)
      .eq("family_id", fid);

    if (peopleError) {
      setMessage(peopleError.message);
      return;
    }

    const basePeople = (peopleLinkData ?? [])
      .map((x: any) => x.person)
      .filter(Boolean) as Person[];

    const baseIds = Array.from(new Set(basePeople.map((p) => p.id)));

    let rels: Relation[] = [];
    let ccs: CoupleChild[] = [];

    if (baseIds.length > 0) {
      const { data: relData } = await supabase
        .from("relationships")
        .select("id, family_id, relation_type, person1_id, person2_id")
        .or(
          `person1_id.in.(${baseIds.join(",")}),person2_id.in.(${baseIds.join(",")})`
        )
        .is("deleted_at", null);

      rels = ((relData ?? []) as Relation[]).filter(
        (r) => r.relation_type === "spouse" || r.relation_type === "divorced"
      );

      const relIds = rels.map((r) => r.id);

      if (relIds.length > 0) {
        const { data: ccData } = await supabase
          .from("couple_children")
          .select("id, relationship_id, child_id")
          .in("relationship_id", relIds)
          .is("deleted_at", null);

        ccs = (ccData ?? []) as CoupleChild[];
      }
    }

    const allIds = Array.from(
      new Set([
        ...baseIds,
        ...rels.flatMap((r) => [r.person1_id, r.person2_id]),
        ...ccs.map((cc) => cc.child_id),
      ])
    );

    let allPeople: Person[] = [];

    if (allIds.length > 0) {
      const { data } = await supabase
        .from("people")
        .select("id, name, kana, birth_date")
        .in("id", allIds)
        .is("deleted_at", null);

      allPeople = ((data ?? []) as Person[]).sort((a, b) =>
        (a.kana || a.name).localeCompare(b.kana || b.name, "ja")
      );
    }

    setPeople(allPeople);
    setRelations(rels);
    setCoupleChildren(ccs);

    setSelectedPersonId(basePeople[0]?.id ?? "");
  }

  const personMap = useMemo(() => {
    const m = new Map<string, Person>();
    people.forEach((p) => m.set(p.id, p));
    return m;
  }, [people]);

  const relationMap = useMemo(() => {
    const m = new Map<string, Relation>();
    relations.forEach((r) => m.set(r.id, r));
    return m;
  }, [relations]);

  function parentRelationsOf(childId: string) {
    return coupleChildren
      .filter((cc) => cc.child_id === childId)
      .map((cc) => relationMap.get(cc.relationship_id))
      .filter((r): r is Relation => Boolean(r));
  }

  function parentsOf(childId: string) {
    const parentRels = parentRelationsOf(childId);
    const parentIds = new Set<string>();

    parentRels.forEach((r) => {
      parentIds.add(r.person1_id);
      parentIds.add(r.person2_id);
    });

    return Array.from(parentIds)
      .map((id) => personMap.get(id))
      .filter((p): p is Person => Boolean(p));
  }

  const tree = useMemo(() => {
    if (!selectedPersonId) {
      return {
        nodes: [] as AncestorNode[],
        lines: [] as AncestorLine[],
        width: 400,
        height: 400,
      };
    }

    const levels: Person[][] = [];
    const visited = new Set<string>();

    let current = [personMap.get(selectedPersonId)].filter(Boolean) as Person[];
    let generation = 0;

    while (current.length > 0 && generation < 12) {
      levels.push(current);

      const nextMap = new Map<string, Person>();

      current.forEach((p) => {
        visited.add(p.id);

        parentsOf(p.id).forEach((parent) => {
          if (!visited.has(parent.id)) {
            nextMap.set(parent.id, parent);
          }
        });
      });

      current = Array.from(nextMap.values());
      generation += 1;
    }

    const reversed = [...levels].reverse();

    const maxCount = Math.max(1, ...reversed.map((level) => level.length));
    const width = Math.max(
      420,
      PAGE_MARGIN * 2 + maxCount * CARD_W + Math.max(0, maxCount - 1) * X_GAP
    );

    const nodes: AncestorNode[] = [];

    reversed.forEach((level, rowIndex) => {
      const rowWidth =
        level.length * CARD_W + Math.max(0, level.length - 1) * X_GAP;

      let x = width / 2 - rowWidth / 2;
      const y = PAGE_MARGIN + rowIndex * (CARD_H + Y_GAP);

      level.forEach((p) => {
        nodes.push({
          person: p,
          generation: reversed.length - 1 - rowIndex,
          x,
          y,
        });
        x += CARD_W + X_GAP;
      });
    });

    const nodeById = new Map(nodes.map((n) => [n.person.id, n]));
    const lines: AncestorLine[] = [];

    nodes.forEach((childNode) => {
      const parents = parentsOf(childNode.person.id)
        .map((p) => nodeById.get(p.id))
        .filter((n): n is AncestorNode => Boolean(n));

      if (parents.length === 0) return;

      const childTopX = childNode.x + CARD_W / 2;
      const childTopY = childNode.y;

      if (parents.length === 1) {
        const p = parents[0];
        const px = p.x + CARD_W / 2;
        const py = p.y + CARD_H;

        lines.push({
          x1: px,
          y1: py,
          x2: childTopX,
          y2: childTopY,
        });
      } else {
        const p1 = parents[0];
        const p2 = parents[1];

        const p1x = p1.x + CARD_W / 2;
        const p2x = p2.x + CARD_W / 2;
        const py = Math.max(p1.y + CARD_H, p2.y + CARD_H);

        const jointY = py + 28;

        lines.push({ x1: p1x, y1: py, x2: p1x, y2: jointY });
        lines.push({ x1: p2x, y1: py, x2: p2x, y2: jointY });
        lines.push({
          x1: Math.min(p1x, p2x),
          y1: jointY,
          x2: Math.max(p1x, p2x),
          y2: jointY,
        });
        lines.push({
          x1: childTopX,
          y1: jointY,
          x2: childTopX,
          y2: childTopY,
        });
      }
    });

    const height =
      PAGE_MARGIN * 2 + reversed.length * CARD_H + Math.max(0, reversed.length - 1) * Y_GAP;

    return { nodes, lines, width, height };
  }, [selectedPersonId, personMap, relations, coupleChildren]);

  return (
    <main className="min-h-screen bg-neutral-950 p-5 pb-24 text-white">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-bold">先祖図</h1>

        <select
          className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3"
          value={selectedFamilyId}
          onChange={async (e) => {
            const fid = e.target.value;
            setSelectedFamilyId(fid);
            await loadFamilyData(fid);
          }}
        >
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        <select
          className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3"
          value={selectedPersonId}
          onChange={(e) => setSelectedPersonId(e.target.value)}
        >
          <option value="">人物を選択</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {message && (
          <div className="mt-4 rounded-xl bg-neutral-800 p-3 text-sm">
            {message}
          </div>
        )}
      </div>

      <div className="mt-5 overflow-auto rounded-2xl border border-neutral-700 bg-neutral-900 p-5">
        {!selectedPersonId ? (
          <div className="p-8 text-center text-sm text-neutral-400">
            人物を選択してください。
          </div>
        ) : (
          <div className="relative" style={{ width: tree.width, height: tree.height }}>
            <svg className="absolute left-0 top-0" width={tree.width} height={tree.height}>
              {tree.lines.map((l, i) => (
                <line
                  key={i}
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={2}
                />
              ))}
            </svg>

            {tree.nodes.map((n) => (
              <div
                key={n.person.id}
                className="absolute flex flex-col items-center justify-center rounded-lg border border-sky-400 bg-neutral-950 text-white"
                style={{
                  left: n.x,
                  top: n.y,
                  width: CARD_W,
                  height: CARD_H,
                }}
              >
                <div
                  className="text-base font-bold leading-none"
                  style={{
                    writingMode: "vertical-rl",
                    textOrientation: "upright",
                  }}
                >
                  {n.person.name}
                </div>

                {n.person.birth_date && (
                  <div className="mt-1 text-[10px] text-neutral-300">
                    {birthText(n.person)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}