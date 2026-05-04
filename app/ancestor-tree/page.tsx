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

const CARD_W = 48;
const CARD_H = 200;
const X_GAP = 60;
const Y_GAP = 70;
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

function westernBirthFull(p: Person) {
  if (!p.birth_date) return "";

  const d = new Date(`${p.birth_date}T00:00:00`);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();

  return `${y}年${m}月${day}日`;
}

function warekiBirthYear(p: Person) {
  if (!p.birth_date) return "";

  const w = wareki(p.birth_date);
  return w.replace(/年.*$/, "年");
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

    const { data: peopleData, error: peopleError } = await supabase
      .from("people")
      .select("id, name, kana, birth_date")
      .is("deleted_at", null);

    if (peopleError) {
      setMessage(peopleError.message);
      return;
    }

    const allPeople = ((peopleData ?? []) as Person[]).sort((a, b) =>
      (a.kana || a.name).localeCompare(b.kana || b.name, "ja")
    );

    const { data: relData, error: relError } = await supabase
      .from("relationships")
      .select("id, family_id, relation_type, person1_id, person2_id")
      .is("deleted_at", null);

    if (relError) {
      setMessage(relError.message);
      return;
    }

    const rels = ((relData ?? []) as Relation[]).filter(
      (r) => r.relation_type === "spouse" || r.relation_type === "divorced"
    );

    const { data: ccData, error: ccError } = await supabase
      .from("couple_children")
      .select("id, relationship_id, child_id")
      .is("deleted_at", null);

    if (ccError) {
      setMessage(ccError.message);
      return;
    }

    const ccs = (ccData ?? []) as CoupleChild[];

    setPeople(allPeople);
    setRelations(rels);
    setCoupleChildren(ccs);

    setSelectedPersonId(allPeople[0]?.id ?? "");
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
        nodes: [] as (AncestorNode & { key: string })[],
        lines: [] as AncestorLine[],
        width: 400,
        height: 400,
      };
    }

    const selected = personMap.get(selectedPersonId);
    if (!selected) {
      return {
        nodes: [] as (AncestorNode & { key: string })[],
        lines: [] as AncestorLine[],
        width: 400,
        height: 400,
      };
    }

    function getParents(personId: string) {
      return parentsOf(personId).slice(0, 2);
    }

    function measureWidth(person: Person, seen = new Set<string>()): number {
      if (seen.has(person.id)) return CARD_W;

      const nextSeen = new Set(seen);
      nextSeen.add(person.id);

      const parents = getParents(person.id);

      if (parents.length === 0) return CARD_W;

      const parentWidth =
        parents.reduce((sum, p) => sum + measureWidth(p, nextSeen), 0) +
        X_GAP * Math.max(0, parents.length - 1);

      return Math.max(CARD_W, parentWidth);
    }

    function measureDepth(person: Person, seen = new Set<string>()): number {
      if (seen.has(person.id)) return 0;

      const nextSeen = new Set(seen);
      nextSeen.add(person.id);

      const parents = getParents(person.id);
      if (parents.length === 0) return 0;

      return 1 + Math.max(...parents.map((p) => measureDepth(p, nextSeen)));
    }

    const totalWidth = measureWidth(selected);
    const maxDepth = measureDepth(selected);

    const nodes: (AncestorNode & { key: string })[] = [];
    const lines: AncestorLine[] = [];

    function placePerson(
      person: Person,
      xStart: number,
      generationFromBottom: number,
      path: string
    ) {
      const subtreeWidth = measureWidth(person);
      const x = xStart + subtreeWidth / 2 - CARD_W / 2;
      const y =
        PAGE_MARGIN +
        (maxDepth - generationFromBottom) * (CARD_H + Y_GAP);

      const node = {
        key: `${path}-${person.id}`,
        person,
        generation: generationFromBottom,
        x,
        y,
      };

      nodes.push(node);

      const parents = getParents(person.id);
      if (parents.length === 0) return node;

      const parentWidths = parents.map((p) => measureWidth(p));
      const parentsTotalWidth =
        parentWidths.reduce((sum, w) => sum + w, 0) +
        X_GAP * Math.max(0, parents.length - 1);

      let parentCursor = xStart + subtreeWidth / 2 - parentsTotalWidth / 2;

      const parentNodes = parents.map((p, index) => {
        const placed = placePerson(
          p,
          parentCursor,
          generationFromBottom + 1,
          `${path}-${index}`
        );

        parentCursor += parentWidths[index] + X_GAP;
        return placed;
      });

      const childTopX = x + CARD_W / 2;
      const childTopY = y;

      if (parentNodes.length === 1) {
        const p = parentNodes[0];
        lines.push({
          x1: p.x + CARD_W / 2,
          y1: p.y + CARD_H,
          x2: childTopX,
          y2: childTopY,
        });
      }

      if (parentNodes.length >= 2) {
        const p1 = parentNodes[0];
        const p2 = parentNodes[1];

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

      return node;
    }

    placePerson(selected, PAGE_MARGIN, 0, "root");

    const width = Math.max(500, totalWidth + PAGE_MARGIN * 2);
    const height =
      PAGE_MARGIN * 2 +
      (maxDepth + 1) * CARD_H +
      maxDepth * Y_GAP;

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
                key={n.key}
                className="absolute flex flex-col items-center justify-center rounded-lg border border-sky-400 bg-neutral-950 text-white"
                style={{
                  left: n.x,
                  top: n.y,
                  width: CARD_W,
                  height: CARD_H,
                }}
              >
                <div
                  className="text-lg font-bold leading-none"
                  style={{
                    writingMode: "vertical-rl",
                    textOrientation: "upright",
                  }}
                >
                  {n.person.name}
                </div>

                {n.person.birth_date && (
                  <div
                    className="absolute flex gap-1 text-base font-bold leading-none text-neutral-300"
                    style={{
                      right: -45,
                      top: 0,
                      height: CARD_H,
                    }}
                  >
                    <div
                      style={{
                        writingMode: "vertical-rl",
                        textOrientation: "upright",
                      }}
                    >
                      {westernBirthFull(n.person)}
                    </div>

                    <div
                      style={{
                        writingMode: "vertical-rl",
                        textOrientation: "upright",
                      }}
                    >
                      {warekiBirthYear(n.person)}
                    </div>
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