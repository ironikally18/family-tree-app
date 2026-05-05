"use client";

import { Suspense } from "react";
import { useEffect, useMemo, useState } from "react";
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
  family_id: string;
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

type FamilyOption = {
  family_id: string;
  label: string;
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

const PERSON_W = 45;
const PERSON_H = 115;
const COUPLE_GAP = 12;
const SIBLING_GAP = 42;
const BRANCH_GAP = 90;
const GENERATION_GAP = 170;
const PAGE_MARGIN = 48;
const DIVORCED_EXTRA_GAP = 180;

function PersonTreeContent() {
  const [familyOptions, setFamilyOptions] = useState<FamilyOption[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState("");

  const [people, setPeople] = useState<Person[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [coupleChildren, setCoupleChildren] = useState<CoupleChild[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [basePersonIds, setBasePersonIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadFamilies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const { data: families } = (await supabase
      .from("families")
      .select("id, name")
      .in("id", ids)) as {
        data: { id: string; name: string }[] | null;
      };

    const options: FamilyOption[] =
      families?.map((f) => ({
        family_id: f.id,
        label: f.name,
      })) ?? [];

    setFamilyOptions(options);

    if (options.length > 0) {
      setSelectedFamilyId(options[0].family_id);
      await loadFamilyData(options[0].family_id);
    }
  }

  async function loadFamilyData(fid: string) {
    setMessage("");

    // 1. 選択中の家系に所属している人物を取得
    const { data: peopleLinkData, error: peopleError } = await supabase
      .from("person_families")
      .select(`
      person:people(
        id,
        name,
        kana,
        sibling_order
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

    const basePersonIds = Array.from(new Set(basePeople.map((p) => p.id)));
    setBasePersonIds(basePersonIds);

    // 2. その家系に直接登録されている夫婦・離縁関係
    const { data: relationsByFamily } = await supabase
      .from("relationships")
      .select("id, family_id, relation_type, person1_id, person2_id")
      .eq("family_id", fid)
      .is("deleted_at", null);

    // 3. 所属人物を含む夫婦・離縁関係も拾う
    let relationsByPerson: Relation[] = [];

    if (basePersonIds.length > 0) {
      const { data: r1 } = await supabase
        .from("relationships")
        .select("id, family_id, relation_type, person1_id, person2_id")
        .in("person1_id", basePersonIds)
        .is("deleted_at", null);

      const { data: r2 } = await supabase
        .from("relationships")
        .select("id, family_id, relation_type, person1_id, person2_id")
        .in("person2_id", basePersonIds)
        .is("deleted_at", null);

      relationsByPerson = [
        ...((r1 ?? []) as Relation[]),
        ...((r2 ?? []) as Relation[]),
      ];
    }

    // 4. 所属人物が「子」として登録されている親子関係も拾う
    let coupleChildrenByChild: CoupleChild[] = [];

    if (basePersonIds.length > 0) {
      const { data: ccByChild } = await supabase
        .from("couple_children")
        .select("id, relationship_id, child_id, display_order")
        .in("child_id", basePersonIds)
        .is("deleted_at", null);

      coupleChildrenByChild = (ccByChild ?? []) as CoupleChild[];
    }

    const relationIdsFromChild = Array.from(
      new Set(coupleChildrenByChild.map((cc) => cc.relationship_id))
    );

    let relationsFromChild: Relation[] = [];

    if (relationIdsFromChild.length > 0) {
      const { data } = await supabase
        .from("relationships")
        .select("id, family_id, relation_type, person1_id, person2_id")
        .in("id", relationIdsFromChild)
        .is("deleted_at", null);

      relationsFromChild = (data ?? []) as Relation[];
    }

    // 5. 関係を重複除去してまとめる
    const relationMap = new Map<string, Relation>();

    [
      ...((relationsByFamily ?? []) as Relation[]),
      ...relationsByPerson,
      ...relationsFromChild,
    ].forEach((r) => {
      if (r.relation_type === "spouse" || r.relation_type === "divorced") {
        relationMap.set(r.id, r);
      }
    });

    const loadedRelations = Array.from(relationMap.values());
    const relationIds = loadedRelations.map((r) => r.id);

    // 6. 表示対象の夫婦・離縁関係に紐づく子を取得
    let coupleChildrenByRelation: CoupleChild[] = [];

    if (relationIds.length > 0) {
      const { data } = await supabase
        .from("couple_children")
        .select("id, relationship_id, child_id, display_order")
        .in("relationship_id", relationIds)
        .is("deleted_at", null);

      coupleChildrenByRelation = (data ?? []) as CoupleChild[];
    }

    const coupleChildMap = new Map<string, CoupleChild>();

    [...coupleChildrenByChild, ...coupleChildrenByRelation].forEach((cc) => {
      coupleChildMap.set(cc.id, cc);
    });

    const loadedCoupleChildren = Array.from(coupleChildMap.values());

    // 7. 関係に出てくる人物も追加取得
    const allPersonIds = Array.from(
      new Set([
        ...basePersonIds,
        ...loadedRelations.flatMap((r) => [r.person1_id, r.person2_id]),
        ...loadedCoupleChildren.map((cc) => cc.child_id),
      ])
    );

    let loadedPeople: Person[] = [];

    if (allPersonIds.length > 0) {
      const { data } = await supabase
        .from("people")
        .select("id, name, kana, sibling_order")
        .in("id", allPersonIds)
        .is("deleted_at", null);

      loadedPeople = ((data ?? []) as Person[]).sort((a, b) =>
        (a.kana || a.name).localeCompare(b.kana || b.name, "ja")
      );
    }

    setPeople(loadedPeople);
    setRelations(loadedRelations);
    setCoupleChildren(loadedCoupleChildren);

    const mainRelations = loadedRelations.filter(
      (r) => r.family_id === fid
    );

    const mainRelationIds = new Set(mainRelations.map((r) => r.id));

    const mainCoupleChildren = loadedCoupleChildren.filter((cc) =>
      mainRelationIds.has(cc.relationship_id)
    );

    const topPersonId = findTopPersonId(
      basePeople,
      mainRelations,
      mainCoupleChildren
    );

    setSelectedId(topPersonId);
  }

  function findTopPersonId(
    targetPeople: Person[],
    targetRelations: Relation[],
    targetCoupleChildren: CoupleChild[]
  ) {
    if (targetPeople.length === 0) return "";

    const childIds = new Set(targetCoupleChildren.map((cc) => cc.child_id));

    const rootPeople = targetPeople
      .filter((p) => !childIds.has(p.id))
      .sort((a, b) => {
        const ak = a.kana || a.name;
        const bk = b.kana || b.name;
        return ak.localeCompare(bk, "ja");
      });

    const rootWithCouple = rootPeople.find((p) =>
      targetRelations.some(
        (r) =>
          (r.relation_type === "spouse" || r.relation_type === "divorced") &&
          (r.person1_id === p.id || r.person2_id === p.id)
      )
    );

    return rootWithCouple?.id ?? rootPeople[0]?.id ?? targetPeople[0].id;
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

  const actualCenterId = selectedId;
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
      .filter((r): r is Relation => {
        return !!r && r.family_id === selectedFamilyId;
      });
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

    const measuredRelation = new Map<string, number>();
    const measuredMulti = new Map<string, number>();

    const nodePos = new Map<string, { x: number; y: number }>();
    const personPos = new Map<string, { x: number; y: number }>();

    const RELATION_GAP = 70;
    const RELATION_SAFE_PADDING = 36;
    const DIVORCED_CHILD_OFFSET = 65;

    function addNode(
      person: Person,
      x: number,
      y: number,
      active = false,
      nodeKey = person.id
    ) {
      const existing = nodePos.get(nodeKey);
      if (existing) return existing;

      const pos = { x, y };

      nodes.push({
        key: nodeKey,
        person,
        x,
        y,
        active,
      });

      nodePos.set(nodeKey, pos);

      if (!personPos.has(person.id)) {
        personPos.set(person.id, pos);
      }

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

    function relationKey(r: Relation, path: Set<string>) {
      return `${r.id}:${Array.from(path).sort().join(",")}`;
    }

    function multiKey(person: Person, rels: Relation[], path: Set<string>) {
      return `${person.id}:${rels.map((r) => r.id).sort().join(",")}:${Array.from(path)
        .sort()
        .join(",")}`;
    }

    function orderRelationsForPerson(person: Person, rels: Relation[]) {
      const spouseRels = rels.filter((r) => r.relation_type === "spouse");
      const divorcedRels = rels.filter((r) => r.relation_type === "divorced");

      const mainSpouse = spouseRels[0] ?? null;
      const otherSpouses = spouseRels.slice(1);

      const leftDivorced = divorcedRels.filter((_, i) => i % 2 === 0);
      const rightDivorced = divorcedRels.filter((_, i) => i % 2 === 1);

      if (mainSpouse) {
        return [
          ...leftDivorced,
          mainSpouse,
          ...rightDivorced,
          ...otherSpouses,
        ];
      }

      return divorcedRels.length > 0 ? divorcedRels : rels;
    }

    function childLayoutInfos(r: Relation, path: Set<string>) {
      const nextPath = new Set(path);
      nextPath.add(r.id);

      return childrenOfCouple(r.id).map((child) => {
        const childRelations = spouseRelationsOf(child.id).filter(
          (sr) => sr.id !== r.id && !nextPath.has(sr.id)
        );

        const width =
          childRelations.length === 0
            ? PERSON_W
            : childRelations.length >= 2
              ? measurePersonWithMultipleRelations(child, childRelations, nextPath)
              : Math.max(PERSON_W, measureRelation(childRelations[0], nextPath));

        const relation =
          childRelations.find((cr) => cr.relation_type === "spouse") ??
          childRelations[0] ??
          null;

        return {
          child,
          width,
          relations: childRelations,
          relation,
        };
      });
    }

    function measureChildrenWidth(r: Relation, path: Set<string>) {
      const infos = childLayoutInfos(r, path);

      if (infos.length === 0) return 0;

      return (
        infos.reduce((sum, info) => sum + info.width, 0) +
        SIBLING_GAP * Math.max(0, infos.length - 1)
      );
    }

    function measureRelation(r: Relation, path = new Set<string>()): number {
      const key = relationKey(r, path);
      if (measuredRelation.has(key)) return measuredRelation.get(key)!;
      if (path.has(r.id)) return ownUnitWidth();

      const nextPath = new Set(path);
      nextPath.add(r.id);

      const childrenWidth = measureChildrenWidth(r, nextPath);
      const width =
        Math.max(ownUnitWidth(), childrenWidth + RELATION_SAFE_PADDING);

      measuredRelation.set(key, width);
      return width;
    }

    function measurePersonWithMultipleRelations(
      person: Person,
      rels: Relation[],
      path: Set<string>
    ): number {
      if (rels.length === 0) return PERSON_W;

      const ordered = orderRelationsForPerson(person, rels);
      const key = multiKey(person, ordered, path);

      if (measuredMulti.has(key)) return measuredMulti.get(key)!;

      const widths = ordered.map((r) => measureRelation(r, path));
      const total =
        widths.reduce((sum, w) => sum + w, 0) +
        RELATION_GAP * Math.max(0, widths.length - 1);

      const width = Math.max(PERSON_W, total);
      measuredMulti.set(key, width);

      return width;
    }

    function layoutPersonOnly(person: Person, xStart: number, generation: number) {
      const y = PAGE_MARGIN + generation * GENERATION_GAP;
      addNode(person, xStart, y, center?.id === person.id);
    }

    function layoutChildrenFromRelation(
      r: Relation,
      parentCenter: number,
      generation: number,
      path: Set<string>
    ) {
      const infos = childLayoutInfos(r, path);
      if (infos.length === 0) return;

      const y = PAGE_MARGIN + generation * GENERATION_GAP;
      const parentBottom = y + PERSON_H;
      const jointY = parentBottom + 28;

      const childrenTotalWidth =
        infos.reduce((sum, info) => sum + info.width, 0) +
        SIBLING_GAP * Math.max(0, infos.length - 1);

      let childCursor = parentCenter - childrenTotalWidth / 2;

      if (r.relation_type === "divorced") {
        const p1 = personMap.get(r.person1_id);
        const p2 = personMap.get(r.person2_id);

        const p1Pos = p1 ? personPos.get(p1.id) : null;
        const p2Pos = p2 ? personPos.get(p2.id) : null;

        if (p1Pos && p2Pos) {
          const p1Center = p1Pos.x + PERSON_W / 2;
          const p2Center = p2Pos.x + PERSON_W / 2;

          const relationCenter = (p1Center + p2Center) / 2;

          // 離縁相手が本人より左なら左、右なら右へ逃がす
          const mainCenter =
            basePersonIds.includes(r.person1_id) && !basePersonIds.includes(r.person2_id)
              ? p1Center
              : basePersonIds.includes(r.person2_id) && !basePersonIds.includes(r.person1_id)
                ? p2Center
                : parentCenter;

          const otherCenter =
            Math.abs(p1Center - mainCenter) > Math.abs(p2Center - mainCenter)
              ? p1Center
              : p2Center;

          const divorcedSide = otherCenter < mainCenter ? -1 : 1;

          childCursor =
            relationCenter -
            childrenTotalWidth / 2 +
            divorcedSide * DIVORCED_CHILD_OFFSET;
        }
      }
      const childCenters: number[] = [];

      infos.forEach((info) => {
        const childCenter = childCursor + info.width / 2;

        if (info.relations.length >= 2) {
          layoutPersonWithMultipleRelations(
            info.child,
            info.relations,
            childCursor,
            generation + 1,
            path
          );
        } else if (info.relation) {
          layoutRelation(info.relation, childCursor, generation + 1, path);
        } else {
          layoutPersonOnly(
            info.child,
            childCenter - PERSON_W / 2,
            generation + 1
          );
        }

        const pos = personPos.get(info.child.id);
        if (pos) {
          const cx = pos.x + PERSON_W / 2;
          childCenters.push(cx);
          addLine(cx, jointY, cx, pos.y, "parent");
        }

        childCursor += info.width + SIBLING_GAP;
      });

      if (childCenters.length > 0) {
        addLine(parentCenter, parentBottom, parentCenter, jointY, "parent");
      }

      if (childCenters.length === 1) {
        addLine(parentCenter, jointY, childCenters[0], jointY, "sibling");
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

    function layoutPersonWithMultipleRelations(
      person: Person,
      rels: Relation[],
      xStart: number,
      generation: number,
      path: Set<string>
    ) {
      const ordered = orderRelationsForPerson(person, rels);
      const y = PAGE_MARGIN + generation * GENERATION_GAP;

      const relationWidths = ordered.map((r) => measureRelation(r, path));
      const totalWidth =
        relationWidths.reduce((sum, w) => sum + w, 0) +
        RELATION_GAP * Math.max(0, relationWidths.length - 1);

      const spouseIndex = ordered.findIndex((r) => r.relation_type === "spouse");

      let personX = xStart + totalWidth / 2 - PERSON_W / 2;

      if (spouseIndex >= 0) {
        const spouseRel = ordered[spouseIndex];

        const beforeWidth =
          relationWidths.slice(0, spouseIndex).reduce((sum, w) => sum + w, 0) +
          RELATION_GAP * spouseIndex;

        const slotX = xStart + beforeWidth;
        const slotW = relationWidths[spouseIndex];
        const unitX = slotX + slotW / 2 - ownUnitWidth() / 2;

        if (spouseRel.person1_id === person.id) {
          personX = unitX;
        } else {
          personX = unitX + PERSON_W + COUPLE_GAP;
        }
      }

      const personNodeKey = `multi-${person.id}-${ordered.map((r) => r.id).join("-")}`;
      const personPosNow = addNode(
        person,
        personX,
        y,
        center?.id === person.id,
        personNodeKey
      );

      personPos.set(person.id, personPosNow);

      const personCenterX = personPosNow.x + PERSON_W / 2;

      let cursor = xStart;

      ordered.forEach((r, index) => {
        if (path.has(r.id)) {
          cursor += relationWidths[index] + RELATION_GAP;
          return;
        }

        const other = relationOtherPerson(r, person.id);
        if (!other) {
          cursor += relationWidths[index] + RELATION_GAP;
          return;
        }

        const nextPath = new Set(path);
        nextPath.add(r.id);

        const slotW = relationWidths[index];
        const slotX = cursor;
        const unitX = slotX + slotW / 2 - ownUnitWidth() / 2;

        let otherX: number;

        if (r.relation_type === "spouse") {
          otherX =
            r.person1_id === person.id
              ? personPosNow.x + PERSON_W + COUPLE_GAP
              : personPosNow.x - PERSON_W - COUPLE_GAP;
        } else {
          const slotCenter = slotX + slotW / 2;

          if (slotCenter < personCenterX) {
            otherX = slotCenter - PERSON_W / 2;
          } else {
            otherX = slotCenter - PERSON_W / 2;
          }
        }

        const otherPos = addNode(
          other,
          otherX,
          y,
          center?.id === other.id,
          `${r.id}-${other.id}`
        );

        const otherCenterX = otherPos.x + PERSON_W / 2;
        const coupleY = y + PERSON_H / 2;

        addLine(
          Math.min(personCenterX, otherCenterX) + PERSON_W / 2,
          coupleY,
          Math.max(personCenterX, otherCenterX) - PERSON_W / 2,
          coupleY,
          r.relation_type === "divorced" ? "divorced" : "spouse"
        );

        const parentCenter = (personCenterX + otherCenterX) / 2;

        layoutChildrenFromRelation(r, parentCenter, generation, nextPath);

        cursor += slotW + RELATION_GAP;
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

      const p1IsBaseFamily = basePersonIds.includes(p1.id);
      const p2IsBaseFamily = basePersonIds.includes(p2.id);

      let leftPerson = p1;
      let rightPerson = p2;

      if (!p1IsBaseFamily && p2IsBaseFamily) {
        leftPerson = p2;
        rightPerson = p1;
      }

      const branchWidth = measureRelation(r, path);
      const unitX = xStart + branchWidth / 2 - ownUnitWidth() / 2;
      const y = PAGE_MARGIN + generation * GENERATION_GAP;

      const leftPos = addNode(
        leftPerson,
        unitX,
        y,
        center?.id === leftPerson.id,
        `${r.id}-${leftPerson.id}`
      );

      const rightPos = addNode(
        rightPerson,
        unitX + PERSON_W + COUPLE_GAP,
        y,
        center?.id === rightPerson.id,
        `${r.id}-${rightPerson.id}`
      );

      personPos.set(leftPerson.id, leftPos);
      personPos.set(rightPerson.id, rightPos);

      const leftCenter = leftPos.x + PERSON_W / 2;
      const rightCenter = rightPos.x + PERSON_W / 2;

      addLine(
        leftPos.x + PERSON_W,
        y + PERSON_H / 2,
        rightPos.x,
        y + PERSON_H / 2,
        r.relation_type === "divorced" ? "divorced" : "spouse"
      );

      const parentCenter = (leftCenter + rightCenter) / 2;

      layoutChildrenFromRelation(r, parentCenter, generation, nextPath);
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

    const minX = Math.min(
      0,
      ...nodes.map((n) => n.x),
      ...lines.map((l) => Math.min(l.x1, l.x2))
    );

    if (minX < PAGE_MARGIN) {
      const shift = PAGE_MARGIN - minX;

      nodes.forEach((n) => {
        n.x += shift;
      });

      lines.forEach((l) => {
        l.x1 += shift;
        l.x2 += shift;
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
  }, [center, people, relations, coupleChildren, personMap, basePersonIds]);

  function PersonCard({ node }: { node: NodeItem }) {
    return (
      <div
        className="absolute flex items-center justify-center rounded-lg border border-amber-400/80 bg-neutral-950 text-white shadow-lg"
        style={{
          left: node.x,
          top: node.y,
          width: PERSON_W,
          height: PERSON_H,
          padding: 0,
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
      </div>
    );
  }

  function handlePrint() {
    const printArea = document.querySelector(".print-area") as HTMLElement;
    const treeInner = document.querySelector(".tree-print-inner") as HTMLElement;

    if (!printArea || !treeInner) return;

    const treeWidth = treeInner.scrollWidth;
    const treeHeight = treeInner.scrollHeight;

    const A4_WIDTH = 940;
    const A4_HEIGHT = 660;

    const scale = Math.min(A4_WIDTH / treeWidth, A4_HEIGHT / treeHeight, 1) * 0.9;

    printArea.style.width = `${treeWidth * scale}px`;
    printArea.style.height = `${treeHeight * scale}px`;
    printArea.style.overflow = "hidden";

    treeInner.style.transform = `scale(${scale})`;
    treeInner.style.transformOrigin = "top left";

    const cleanup = () => {
      printArea.style.width = "";
      printArea.style.height = "";
      printArea.style.overflow = "";
      treeInner.style.transform = "";
      treeInner.style.transformOrigin = "";
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);

    setTimeout(() => {
      window.print();
    }, 100);
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-5 pb-24 text-white">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-bold">家系図</h1>
        <p className="mt-2 text-sm text-neutral-400">
          -
        </p>

        <select
          className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3"
          value={selectedFamilyId}
          onChange={async (e) => {
            const fid = e.target.value;
            setSelectedFamilyId(fid);
            await loadFamilyData(fid);
          }}
        >
          <option value="">家系グループを選択</option>
          {familyOptions.map((f) => (
            <option key={f.family_id} value={f.family_id}>
              {f.label}
            </option>
          ))}
        </select>

        <button
          onClick={handlePrint}
          className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold print:hidden"
        >
          PDF出力
        </button>

        {message && <div className="mt-4 rounded-xl bg-neutral-800 p-3 text-sm">{message}</div>}
      </div>

      <div className="print-area mt-5 overflow-auto rounded-2xl border border-neutral-700 bg-[radial-gradient(circle_at_top,rgba(38,38,38,0.9),rgba(10,10,10,0.95))] p-5">
        {!center ? (
          <div className="p-8 text-center text-sm text-neutral-400">
            -
          </div>
        ) : (
          <div
            className="tree-print-inner relative"
            style={{ width: layout.width, height: layout.height }}
          >
            <svg className="absolute left-0 top-0" width={layout.width} height={layout.height}>
              {[...layout.lines]
                .sort((a, b) => {
                  const order = {
                    parent: 1,
                    sibling: 1,
                    spouse: 2,
                    divorced: 2,
                  } as Record<LineItem["kind"], number>;

                  return order[a.kind] - order[b.kind];
                })
                .map((l, i) => (
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