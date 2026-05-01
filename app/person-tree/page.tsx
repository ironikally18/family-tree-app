"use client";

import { Suspense } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import BottomNav from "../../components/BottomNav";

type Person = {
  id: string;
  name: string;
  kana: string | null;
  sibling_order: number | null;
};

type Relation = {
  id: string;
  relation_type: "spouse" | "divorced" | "parent_child" | "adoptive_parent_child";
  person1_id: string;
  person2_id: string;
};

type CoupleChild = {
  id: string;
  relationship_id: string;
  child_id: string;
  display_order: number | null;
};

type NodeItem = {
  key: string;
  person: Person;
  x: number;
  y: number;
  active?: boolean;
};

type LineItem = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: "spouse" | "divorced" | "parent" | "sibling";
};

const PERSON_W = 60;
const PERSON_H = 106;
const COUPLE_GAP = 12;
const SIBLING_GAP = 48;
const BRANCH_GAP = 90;
const GENERATION_GAP = 170;
const PAGE_MARGIN = 48;

function PersonTreeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const centerId = searchParams.get("id");

  const [people, setPeople] = useState<Person[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [coupleChildren, setCoupleChildren] = useState<CoupleChild[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadFamily();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFamily() {
    const { data, error } = await supabase
      .from("family_members")
      .select("family_id")
      .limit(1)
      .single();

    if (error || !data) {
      setMessage("参加中の家系グループが見つかりません。");
      return;
    }

    const familyId = data.family_id;

    const { data: peopleData } = await supabase
      .from("people")
      .select("id, name, kana, sibling_order")
      .eq("family_id", familyId)
      .is("deleted_at", null)
      .order("kana", { ascending: true });

    const { data: relationData } = await supabase
      .from("relationships")
      .select("id, relation_type, person1_id, person2_id")
      .eq("family_id", familyId)
      .is("deleted_at", null);

    const { data: ccData } = await supabase
      .from("couple_children")
      .select("id, relationship_id, child_id, display_order")
      .eq("family_id", familyId)
      .is("deleted_at", null);

    setPeople(peopleData ?? []);
    setRelations((relationData ?? []) as Relation[]);
    setCoupleChildren(ccData ?? []);

    if (!centerId && peopleData && peopleData.length > 0) {
      setSelectedId(peopleData[0].id);
    }
  }

  const personMap = useMemo(() => {
    const m = new Map<string, Person>();
    people.forEach((p) => m.set(p.id, p));
    return m;
  }, [people]);

  function isCoupleRelation(type: string) {
    return type === "spouse" || type === "divorced";
  }

  const relationMap = useMemo(() => {
    const m = new Map<string, Relation>();
    relations.forEach((r) => {
      if (isCoupleRelation(r.relation_type)) {
        m.set(r.id, r);
      }
    });
    return m;
  }, [relations]);

  const actualCenterId = centerId || selectedId;
  const center = actualCenterId ? personMap.get(actualCenterId) ?? null : null;

  function sortPeople(a: Person, b: Person) {
    const oa = a.sibling_order ?? 9999;
    const ob = b.sibling_order ?? 9999;
    if (oa !== ob) return oa - ob;
    return (a.kana || a.name).localeCompare(b.kana || b.name, "ja");
  }

  function spouseRelationsOf(personId: string) {
    return relations.filter(
      (r) =>
        isCoupleRelation(r.relation_type) &&
        (r.person1_id === personId || r.person2_id === personId)
    );
  }

  function parentCoupleRelationsOf(personId: string) {
    return coupleChildren
      .filter((cc) => cc.child_id === personId)
      .map((cc) => relationMap.get(cc.relationship_id))
      .filter((r): r is Relation => Boolean(r));
  }

  function childrenOfCouple(relationId: string) {
    return coupleChildren
      .filter((cc) => cc.relationship_id === relationId)
      .map((cc) => ({
        child: personMap.get(cc.child_id),
        display_order: cc.display_order,
      }))
      .filter((x): x is { child: Person; display_order: number | null } => Boolean(x.child))
      .sort((a, b) => {
        const oa = a.display_order ?? a.child.sibling_order ?? 9999;
        const ob = b.display_order ?? b.child.sibling_order ?? 9999;
        if (oa !== ob) return oa - ob;
        return sortPeople(a.child, b.child);
      })
      .map((x) => x.child);
  }

  function ownUnitWidth() {
    return PERSON_W * 2 + COUPLE_GAP;
  }

  function topAncestorRelationsForPerson(personId: string) {
    const result = new Map<string, Relation>();

    function climbRelation(r: Relation, seen = new Set<string>()) {
      if (seen.has(r.id)) return;
      seen.add(r.id);

      const parentRels = [
        ...parentCoupleRelationsOf(r.person1_id),
        ...parentCoupleRelationsOf(r.person2_id),
      ].filter((pr) => pr.id !== r.id);

      if (parentRels.length === 0) {
        result.set(r.id, r);
        return;
      }

      parentRels.forEach((pr) => climbRelation(pr, seen));
    }

    const directParentRels = parentCoupleRelationsOf(personId);

    if (directParentRels.length > 0) {
      directParentRels.forEach((r) => climbRelation(r));
      return Array.from(result.values());
    }

    const ownSpouseRels = spouseRelationsOf(personId);
    ownSpouseRels.forEach((r) => climbRelation(r));

    return Array.from(result.values());
  }

  const layout = useMemo(() => {
    const nodes: NodeItem[] = [];
    const lines: LineItem[] = [];
    const measured = new Map<string, number>();
    const nodePos = new Map<string, { x: number; y: number }>();

    function addNode(person: Person, x: number, y: number, active = false) {
      const existing = nodePos.get(person.id);
      if (existing) return existing;

      const pos = { x, y };

      nodes.push({
        key: person.id,
        person,
        x,
        y,
        active,
      });

      nodePos.set(person.id, pos);
      return pos;
    }

    function addLine(
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      kind: LineItem["kind"]
    ) {
      if (![x1, y1, x2, y2].every(Number.isFinite)) return;
      lines.push({ x1, y1, x2, y2, kind });
    }

    function relationOtherPerson(r: Relation, personId: string) {
      const otherId = r.person1_id === personId ? r.person2_id : r.person1_id;
      return personMap.get(otherId) ?? null;
    }

    function measurePersonWithMultipleRelations(
      person: Person,
      rels: Relation[],
      path: Set<string>
    ): number {
      if (rels.length === 0) return PERSON_W;

      const total =
        rels.reduce((sum, r) => sum + measureRelation(r, path), 0) +
        BRANCH_GAP * Math.max(0, rels.length - 1);

      return Math.max(PERSON_W, total);
    }

    function measureRelation(r: Relation, path = new Set<string>()): number {
      if (measured.has(r.id)) return measured.get(r.id)!;
      if (path.has(r.id)) return ownUnitWidth();

      const nextPath = new Set(path);
      nextPath.add(r.id);

      const children = childrenOfCouple(r.id);

      if (children.length === 0) {
        measured.set(r.id, ownUnitWidth());
        return ownUnitWidth();
      }

      const childWidths = children.map((child) => {
        const childRelations = spouseRelationsOf(child.id).filter(
          (sr) => sr.id !== r.id && !nextPath.has(sr.id)
        );

        if (childRelations.length === 0) return PERSON_W;

        if (childRelations.length >= 2) {
          return measurePersonWithMultipleRelations(child, childRelations, nextPath);
        }

        return Math.max(PERSON_W, measureRelation(childRelations[0], nextPath));
      });

      const childrenWidth =
        childWidths.reduce((sum, w) => sum + w, 0) +
        SIBLING_GAP * Math.max(0, childWidths.length - 1);

      const width = Math.max(ownUnitWidth(), childrenWidth);
      measured.set(r.id, width);
      return width;
    }

    function layoutPersonOnly(person: Person, xStart: number, generation: number) {
      const y = PAGE_MARGIN + generation * GENERATION_GAP;
      addNode(person, xStart, y, center?.id === person.id);
    }

    function layoutPersonWithMultipleRelations(
      person: Person,
      rels: Relation[],
      xStart: number,
      generation: number,
      path: Set<string>
    ) {
      const y = PAGE_MARGIN + generation * GENERATION_GAP;
      const totalWidth = measurePersonWithMultipleRelations(person, rels, path);
      const personX = xStart + totalWidth / 2 - PERSON_W / 2;

      const personPos = addNode(person, personX, y, center?.id === person.id);
      const personCenterX = personPos.x + PERSON_W / 2;

      let relCursor = xStart;

      rels.forEach((r) => {
        if (path.has(r.id)) return;

        const other = relationOtherPerson(r, person.id);
        if (!other) return;

        const nextPath = new Set(path);
        nextPath.add(r.id);

        const relWidth = measureRelation(r, nextPath);
        const slotCenter = relCursor + relWidth / 2;

        let otherCenterX: number;

        if (r.relation_type === "spouse") {
          otherCenterX =
            r.person1_id === person.id
              ? personCenterX + PERSON_W + COUPLE_GAP
              : personCenterX - PERSON_W - COUPLE_GAP;
        } else {
          const DIVORCED_EXTRA_GAP = 220;

          const spouseRel = rels.find((rel) => rel.relation_type === "spouse");
          const spouseOther = spouseRel ? relationOtherPerson(spouseRel, person.id) : null;

          let spouseSide: "left" | "right" | null = null;

          if (spouseOther) {
            if (spouseRel?.person1_id === person.id) {
              spouseSide = "right";
            } else {
              spouseSide = "left";
            }
          }

          if (spouseSide === "right") {
            otherCenterX = personCenterX - PERSON_W - COUPLE_GAP - DIVORCED_EXTRA_GAP;
          } else if (spouseSide === "left") {
            otherCenterX = personCenterX + PERSON_W + COUPLE_GAP + DIVORCED_EXTRA_GAP;
          } else {
            otherCenterX =
              slotCenter < personCenterX
                ? personCenterX - PERSON_W - COUPLE_GAP - DIVORCED_EXTRA_GAP
                : personCenterX + PERSON_W + COUPLE_GAP + DIVORCED_EXTRA_GAP;
          }
        }

        const otherPos = addNode(
          other,
          otherCenterX - PERSON_W / 2,
          y,
          center?.id === other.id
        );

        const actualOtherCenterX = otherPos.x + PERSON_W / 2;
        const coupleY = y + PERSON_H / 2;

        addLine(
          Math.min(personCenterX, actualOtherCenterX) + PERSON_W / 2,
          coupleY,
          Math.max(personCenterX, actualOtherCenterX) - PERSON_W / 2,
          coupleY,
          r.relation_type === "divorced" ? "divorced" : "spouse"
        );

        const children = childrenOfCouple(r.id).filter(
          (child) => !nodePos.has(child.id)
        );

        if (children.length > 0) {
          const parentCenter =
            r.relation_type === "divorced"
              ? actualOtherCenterX
              : (personCenterX + actualOtherCenterX) / 2;
          const jointY = y + PERSON_H + 28;

          const childInfos = children.map((child) => {
            const childRelations = spouseRelationsOf(child.id).filter(
              (sr) => sr.id !== r.id && !nextPath.has(sr.id)
            );

            const childWidth =
              childRelations.length === 0
                ? PERSON_W
                : childRelations.length >= 2
                  ? measurePersonWithMultipleRelations(child, childRelations, nextPath)
                  : Math.max(PERSON_W, measureRelation(childRelations[0], nextPath));

            return { child, childRelations, childWidth };
          });

          const childrenTotalWidth =
            childInfos.reduce((sum, info) => sum + info.childWidth, 0) +
            SIBLING_GAP * Math.max(0, childInfos.length - 1);

          let childCursor = parentCenter - childrenTotalWidth / 2;

          if (r.relation_type === "divorced") {
            const divorcedSide =
              actualOtherCenterX < personCenterX ? "left" : "right";

            if (divorcedSide === "left") {
              childCursor = actualOtherCenterX - childrenTotalWidth / 2;
            } else {
              childCursor = actualOtherCenterX - childrenTotalWidth / 2;
            }
          }

          const childCenters: number[] = [];

          childInfos.forEach((info) => {
            const childCenter = childCursor + info.childWidth / 2;

            if (info.childRelations.length >= 2) {
              layoutPersonWithMultipleRelations(
                info.child,
                info.childRelations,
                childCursor,
                generation + 1,
                nextPath
              );
            } else if (info.childRelations.length === 1) {
              layoutRelation(
                info.childRelations[0],
                childCursor,
                generation + 1,
                nextPath
              );
            } else {
              layoutPersonOnly(
                info.child,
                childCenter - PERSON_W / 2,
                generation + 1
              );
            }

            const childPos = nodePos.get(info.child.id);
            if (childPos) {
              const cx = childPos.x + PERSON_W / 2;
              childCenters.push(cx);
              addLine(cx, jointY, cx, childPos.y, "parent");
            }

            childCursor += info.childWidth + SIBLING_GAP;
          });

          if (childCenters.length > 0) {
            addLine(parentCenter, y + PERSON_H, parentCenter, jointY, "parent");
          }

          if (childCenters.length >= 2) {
            addLine(
              Math.min(...childCenters),
              jointY,
              Math.max(...childCenters),
              jointY,
              "sibling"
            );
          }
        }

        relCursor += relWidth + BRANCH_GAP;
      });
    }

    function layoutRelation(
      r: Relation,
      xStart: number,
      generation: number,
      path = new Set<string>()
    ) {
      if (path.has(r.id)) return;

      const nextPath = new Set(path);
      nextPath.add(r.id);

      const p1 = personMap.get(r.person1_id);
      const p2 = personMap.get(r.person2_id);
      if (!p1 || !p2) return;

      const children = childrenOfCouple(r.id);

      let childCursor = xStart;
      const childLayouts = children.map((child) => {
        const childRelations = spouseRelationsOf(child.id).filter(
          (sr) => sr.id !== r.id && !nextPath.has(sr.id)
        );

        const childWidth =
          childRelations.length === 0
            ? PERSON_W
            : childRelations.length >= 2
              ? measurePersonWithMultipleRelations(child, childRelations, nextPath)
              : Math.max(PERSON_W, measureRelation(childRelations[0], nextPath));

        const relation =
          childRelations.find((cr) => cr.relation_type === "spouse") ??
          childRelations[0] ??
          null;

        const result = {
          person: child,
          xStart: childCursor,
          width: childWidth,
          centerX: childCursor + childWidth / 2,
          relations: childRelations,
          relation,
        };

        childCursor += childWidth + SIBLING_GAP;
        return result;
      });

      const branchWidth = measureRelation(r, nextPath);
      const unitWidth = ownUnitWidth();

      const unitX =
        childLayouts.length > 0
          ? (childLayouts[0].centerX + childLayouts[childLayouts.length - 1].centerX) /
          2 -
          unitWidth / 2
          : xStart + branchWidth / 2 - unitWidth / 2;

      const y = PAGE_MARGIN + generation * GENERATION_GAP;
      const p2X = unitX + PERSON_W + COUPLE_GAP;

      const p1Pos = addNode(p1, unitX, y, center?.id === p1.id);
      const p2Pos = addNode(p2, p2X, y, center?.id === p2.id);

      const leftX = Math.min(p1Pos.x, p2Pos.x);
      const rightX = Math.max(p1Pos.x, p2Pos.x);

      addLine(
        leftX + PERSON_W,
        y + PERSON_H / 2,
        rightX,
        y + PERSON_H / 2,
        r.relation_type === "divorced" ? "divorced" : "spouse"
      );

      if (childLayouts.length > 0) {
        const unitCenter = unitX + ownUnitWidth() / 2;
        const parentBottom = y + PERSON_H;
        const jointY = parentBottom + 28;

        addLine(unitCenter, parentBottom, unitCenter, jointY, "parent");

        const actualChildCenters: number[] = [];

        childLayouts.forEach((cl) => {
          if (cl.relations.length >= 2) {
            layoutPersonWithMultipleRelations(
              cl.person,
              cl.relations,
              cl.xStart,
              generation + 1,
              nextPath
            );
          } else if (cl.relation) {
            layoutRelation(cl.relation, cl.xStart, generation + 1, nextPath);
          } else {
            layoutPersonOnly(
              cl.person,
              cl.xStart + cl.width / 2 - PERSON_W / 2,
              generation + 1
            );
          }

          const pos = nodePos.get(cl.person.id);
          if (pos) {
            const centerX = pos.x + PERSON_W / 2;
            actualChildCenters.push(centerX);
            addLine(centerX, jointY, centerX, pos.y, "parent");
          }
        });

        if (actualChildCenters.length >= 2) {
          addLine(
            Math.min(...actualChildCenters),
            jointY,
            Math.max(...actualChildCenters),
            jointY,
            "sibling"
          );
        }
      }
    }

    let roots: Relation[] = [];

    if (center) {
      const rootMap = new Map<string, Relation>();

      topAncestorRelationsForPerson(center.id).forEach((r) => rootMap.set(r.id, r));

      spouseRelationsOf(center.id).forEach((sr) => {
        const otherId = sr.person1_id === center.id ? sr.person2_id : sr.person1_id;
        topAncestorRelationsForPerson(otherId).forEach((r) => rootMap.set(r.id, r));
      });

      roots = Array.from(rootMap.values());
    }

    if (roots.length === 0 && center) {
      const ownRels = spouseRelationsOf(center.id);
      if (ownRels.length > 0) {
        roots = ownRels;
      }
    }

    if (roots.length === 0 && center) {
      layoutPersonOnly(center, PAGE_MARGIN, 0);
    } else {
      let cursorX = PAGE_MARGIN;

      roots.forEach((r) => {
        const width = measureRelation(r);
        layoutRelation(r, cursorX, 0);
        cursorX += width + BRANCH_GAP;
      });
    }

    const maxX = Math.max(
      PAGE_MARGIN + 400,
      ...nodes.map((n) => n.x + PERSON_W),
      ...lines.map((l) => Math.max(l.x1, l.x2))
    );

    const maxY = Math.max(
      PAGE_MARGIN + 400,
      ...nodes.map((n) => n.y + PERSON_H),
      ...lines.map((l) => Math.max(l.y1, l.y2))
    );

    return {
      nodes,
      lines,
      width: maxX + PAGE_MARGIN,
      height: maxY + PAGE_MARGIN,
    };
  }, [center, people, relations, coupleChildren, personMap]);

  function PersonCard({ node }: { node: NodeItem }) {
    return (
      <button
        onClick={() => router.push(`/person-tree?id=${node.person.id}`)}
        className={[
          "absolute flex items-center justify-center rounded-lg border text-white shadow-lg",
          node.active
            ? "border-blue-400 bg-blue-950/70"
            : "border-amber-400/80 bg-neutral-950",
        ].join(" ")}
        style={{
          left: node.x,
          top: node.y,
          width: PERSON_W,
          height: PERSON_H,
          padding: 2,
        }}
      >
        <div
          className="text-base font-bold leading-none"
          style={{
            writingMode: "vertical-rl",
            textOrientation: "upright",
          }}
        >
          {node.person.name}
        </div>
      </button>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-5 pb-24 text-white">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-bold">中心家系図</h1>
        <p className="mt-2 text-sm text-neutral-400">
          中心人物から上位の夫婦枝をたどって表示します。
        </p>

        <select
          className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3"
          value={actualCenterId || ""}
          onChange={(e) => router.push(`/person-tree?id=${e.target.value}`)}
        >
          <option value="">中心人物を選択</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {message && <div className="mt-4 rounded-xl bg-neutral-800 p-3 text-sm">{message}</div>}
      </div>

      <div className="mt-5 overflow-auto rounded-2xl border border-neutral-700 bg-[radial-gradient(circle_at_top,rgba(38,38,38,0.9),rgba(10,10,10,0.95))] p-5">
        {!center ? (
          <div className="p-8 text-center text-sm text-neutral-400">
            中心人物を選択してください。
          </div>
        ) : (
          <div className="relative" style={{ width: layout.width, height: layout.height }}>
            <svg className="absolute left-0 top-0" width={layout.width} height={layout.height}>
              {layout.lines.map((l, i) => (
                <line
                  key={i}
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  stroke={
                    l.kind === "spouse"
                      ? "#facc15"
                      : l.kind === "divorced"
                        ? "#fb7185"
                        : "rgba(255,255,255,0.85)"
                  }
                  strokeWidth={l.kind === "spouse" || l.kind === "divorced" ? 3 : 2}
                  strokeDasharray={l.kind === "divorced" ? "6 6" : undefined}
                />
              ))}
            </svg>

            {layout.nodes.map((node) => (
              <PersonCard key={node.key} node={node} />
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
export default function PersonTreePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black text-white p-5">
          読み込み中...
        </div>
      }
    >
      <PersonTreeContent />
    </Suspense>
  );
}