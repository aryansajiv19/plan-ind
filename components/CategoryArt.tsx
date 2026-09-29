import { CATEGORY_GROUPS, type GroupKey } from "@/components/categoryGroups";

// A place with no photo still gets a picture: a small desert-night scene in
// the owner's palette, one per kind of night, drawn in SVG (no requests, no
// licence). It fills its positioned parent like a photo would.
const GROUP_OF = new Map<string, GroupKey>(
  CATEGORY_GROUPS.flatMap((group) => group.categories.map((category) => [category.key, group.key] as const)),
);

const SCENES: Record<GroupKey, { sky: [string, string]; orb: string; orbY: number; moon?: boolean; skyline?: boolean; waves?: boolean; arch?: boolean }> = {
  food: { sky: ["#174050", "#704121"], orb: "#ce9963", orbY: 80 },
  night: { sky: ["#0f2a36", "#174050"], orb: "#f2f2f2", orbY: 80, moon: true, skyline: true },
  water: { sky: ["#0c657c", "#7d9bbc"], orb: "#ce9963", orbY: 90, waves: true },
  active: { sky: ["#704121", "#ce9963"], orb: "#f2e3cf", orbY: 110 },
  leisure: { sky: ["#0f2a36", "#704121"], orb: "#ce9963", orbY: 120, arch: true },
};

export default function CategoryArt({ category, className = "" }: { category: string; className?: string }) {
  const group = GROUP_OF.get(category) ?? "food";
  const scene = SCENES[group];
  const id = `art-${group}`;
  return (
    <svg className={`category-art ${className}`.trim()} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={scene.sky[0]} />
          <stop offset="1" stopColor={scene.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id}-sky)`} />
      <circle cx="290" cy={scene.orbY} r={scene.moon ? 26 : 38} fill={scene.orb} opacity="0.9" />
      {scene.moon && <circle cx="302" cy={scene.orbY - 8} r="24" fill={scene.sky[0]} />}
      {scene.skyline && (
        <path fill="#0f2a36" d="M0 230 h40 v-40 h20 v40 h25 v-70 h14 v70 h30 v-30 h22 v30 h18 l6 -150 l6 150 h20 v-55 h24 v55 h30 v-35 h28 v35 h97 v70 H0z" />
      )}
      {scene.arch && (
        <path fill="#442816" opacity="0.9" d="M150 300 v-90 a50 50 0 0 1 100 0 v90 h-22 v-88 a28 28 0 0 0 -56 0 v88z" />
      )}
      {scene.waves ? (
        <>
          <path fill="#174050" opacity="0.85" d="M0 225 q50 -18 100 0 t100 0 t100 0 t100 0 v75 H0z" />
          <path fill="#0f2a36" d="M0 255 q50 -14 100 0 t100 0 t100 0 t100 0 v45 H0z" />
        </>
      ) : (
        <>
          <path fill="#704121" opacity="0.85" d="M0 240 C90 200 170 215 240 235 S360 250 400 225 V300 H0z" />
          <path fill="#3f230b" d="M0 265 C110 240 200 250 280 268 S370 280 400 262 V300 H0z" />
        </>
      )}
    </svg>
  );
}
