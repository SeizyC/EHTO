import clsx from "clsx";
import type { Member, Mood } from "@/types/world";
import { Bubble } from "./Bubble";
import { Character } from "./Character";

// --- isometric projection -----------------------------------------------
// tile: 32 wide × 16 tall (2:1)
const TILE_W = 32;
const TILE_H = 16;

// floor grid
const COLS = 8;
const ROWS = 8;

function isoToScreen(col: number, row: number) {
  return {
    x: (col - row) * (TILE_W / 2),
    y: (col + row) * (TILE_H / 2),
  };
}

// origin offsets so room fits viewport
const ORIGIN_X = (COLS * TILE_W) / 2; // center horizontally
const ORIGIN_Y = 60; // top padding for back wall

// floor canvas size
const FLOOR_W = (COLS + ROWS) * (TILE_W / 2);
const FLOOR_H = (COLS + ROWS) * (TILE_H / 2);

// --- mood palettes ------------------------------------------------------

const MOOD_BG: Record<Mood, string> = {
  cozy: "#2a1f1a",
  rainy: "#0f1a26",
  chaotic: "#1a0f1f",
  lonely: "#0d0d12",
};

const MOOD_FLOOR: Record<Mood, [string, string]> = {
  cozy: ["#c8956b", "#a87a55"],
  rainy: ["#3a5e85", "#2d4a6c"],
  chaotic: ["#5a3a6e", "#432a55"],
  lonely: ["#2a2a36", "#1d1d28"],
};

const MOOD_WALL: Record<Mood, [string, string]> = {
  // [left wall, right wall]
  cozy: ["#5b3a28", "#4a2e1f"],
  rainy: ["#26384d", "#1c2a3a"],
  chaotic: ["#3a1f4a", "#2c1738"],
  lonely: ["#1a1a24", "#13131c"],
};

interface AmbientFx {
  rain?: boolean;
  clutter?: boolean;
  warm?: boolean;
  void?: boolean;
}

export function IsoRoom({
  mood,
  members,
  bubbles,
  ambient,
}: {
  mood: Mood;
  members: Member[];
  bubbles: Record<string, string | null>;
  ambient?: AmbientFx;
}) {
  const bg = MOOD_BG[mood];
  const [tileA, tileB] = MOOD_FLOOR[mood];
  const [wallL, wallR] = MOOD_WALL[mood];

  const sceneW = FLOOR_W + 80;
  const sceneH = FLOOR_H + ORIGIN_Y + 40;

  // floor tiles
  const tiles: { col: number; row: number; fill: string }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      tiles.push({ col: c, row: r, fill: (c + r) % 2 === 0 ? tileA : tileB });
    }
  }

  // wall polygons in isometric:
  // back-left wall sits along col=0 edge, extending up
  const WALL_H = 70;
  // left-back wall: from (col=0, row=0) to (col=0, row=ROWS), going up by WALL_H
  const lw_top_back = isoToScreen(0, 0);
  const lw_top_front = isoToScreen(0, ROWS);
  const leftWallPts = [
    [lw_top_back.x, lw_top_back.y - WALL_H],
    [lw_top_front.x, lw_top_front.y - WALL_H],
    [lw_top_front.x, lw_top_front.y],
    [lw_top_back.x, lw_top_back.y],
  ];
  // right-back wall: from (col=0, row=0) to (col=COLS, row=0)
  const rw_top_back = isoToScreen(0, 0);
  const rw_top_front = isoToScreen(COLS, 0);
  const rightWallPts = [
    [rw_top_back.x, rw_top_back.y - WALL_H],
    [rw_top_front.x, rw_top_front.y - WALL_H],
    [rw_top_front.x, rw_top_front.y],
    [rw_top_back.x, rw_top_back.y],
  ];

  // sort members by row+col so further ones render first (depth)
  const sorted = [...members].sort(
    (a, b) => a.tile.row + a.tile.col - (b.tile.row + b.tile.col),
  );

  return (
    <div className="relative w-full overflow-hidden" style={{ background: bg, aspectRatio: "9 / 11" }}>
      {/* deep starfield for sci-fi feel (optional, subtle) */}
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage: `radial-gradient(circle at 30% 20%, ${bg} 0%, #000 100%)`,
        }}
      />

      {/* the scene — centered */}
      <div
        className="absolute left-1/2 top-0 pixelated"
        style={{
          width: sceneW,
          height: sceneH,
          transform: `translateX(-50%)`,
        }}
      >
        <svg
          width={sceneW}
          height={sceneH}
          viewBox={`${-sceneW / 2 + ORIGIN_X - sceneW / 2} 0 ${sceneW} ${sceneH}`}
          style={{ position: "absolute", left: 0, top: 0 }}
          shapeRendering="crispEdges"
          preserveAspectRatio="xMidYMin meet"
        >
          <g transform={`translate(${sceneW / 2}, ${ORIGIN_Y})`}>
            {/* walls behind floor */}
            <polygon
              points={leftWallPts.map((p) => p.join(",")).join(" ")}
              fill={wallL}
            />
            <polygon
              points={rightWallPts.map((p) => p.join(",")).join(" ")}
              fill={wallR}
            />
            {/* wall trim line at floor */}
            <polyline
              points={`${lw_top_back.x},${lw_top_back.y} ${lw_top_front.x},${lw_top_front.y}`}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth="0.6"
              fill="none"
            />
            <polyline
              points={`${rw_top_back.x},${rw_top_back.y} ${rw_top_front.x},${rw_top_front.y}`}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth="0.6"
              fill="none"
            />

            {/* floor tiles */}
            {tiles.map((t) => {
              const { x, y } = isoToScreen(t.col, t.row);
              const pts = [
                [x, y],
                [x + TILE_W / 2, y + TILE_H / 2],
                [x, y + TILE_H],
                [x - TILE_W / 2, y + TILE_H / 2],
              ];
              return (
                <polygon
                  key={`${t.col}-${t.row}`}
                  points={pts.map((p) => p.join(",")).join(" ")}
                  fill={t.fill}
                  stroke="rgba(0,0,0,0.25)"
                  strokeWidth="0.3"
                />
              );
            })}
          </g>
        </svg>

        {/* characters absolutely positioned over the scene */}
        {sorted.map((m) => {
          const { x, y } = isoToScreen(m.tile.col, m.tile.row);
          // screen-space position; character anchor is feet (bottom-center)
          const left = sceneW / 2 + x;
          const top = ORIGIN_Y + y + TILE_H / 2;
          const bubble = bubbles[m.id];
          return (
            <div
              key={m.id}
              className="absolute"
              style={{
                left,
                top,
                transform: "translate(-50%, -100%)",
              }}
            >
              <div className="flex flex-col items-center gap-1">
                {bubble && (
                  <div className="-mb-1">
                    <Bubble text={bubble} />
                  </div>
                )}
                <Character kind={m.creature} presence={m.presence} outfit={m.outfit} />
                <span className="mt-1 text-[9px] tracking-widest text-white/55 bg-black/40 px-1 rounded-sm">
                  {m.name}
                </span>
              </div>
            </div>
          );
        })}

        {/* ambient effects layered above */}
        {ambient?.rain && (
          <div
            className="absolute inset-0 opacity-25 mix-blend-screen pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(105deg, rgba(180,210,255,0.6) 0 1px, transparent 1px 6px)",
            }}
          />
        )}
        {ambient?.warm && (
          <div
            className="absolute left-1/2 top-2/3 h-44 w-64 -translate-x-1/2 rounded-full opacity-30 blur-2xl pointer-events-none"
            style={{ background: "#ff8e5e" }}
          />
        )}
        {ambient?.void && (
          <div className="absolute inset-0 pointer-events-none bg-black/30" />
        )}
      </div>

      {/* clutter dots on top */}
      {ambient?.clutter && (
        <svg className="absolute inset-0 pointer-events-none opacity-70" viewBox="0 0 100 100" shapeRendering="crispEdges" preserveAspectRatio="none">
          {[[12,18,"#ff5ec4"],[86,22,"#7af0ff"],[24,82,"#f4c98a"],[74,80,"#ff5ec4"],[48,12,"#7af0ff"],[14,52,"#9ad3a8"],[90,52,"#ff7ab6"],[38,30,"#7af0ff"],[64,88,"#f4c98a"]].map(([x,y,c],i)=>(
            <rect key={i} x={x as number} y={y as number} width={1.4} height={1.4} fill={c as string} />
          ))}
        </svg>
      )}

      {/* corner vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 80px rgba(0,0,0,0.7)" }} />
    </div>
  );
}
