export function Pedestal({ width = 140, color = "#a8d4e8" }: { width?: number; color?: string }) {
  // isometric block — top diamond + left & right side faces
  const w = width;
  const h = w * 0.5; // 2:1 iso ratio
  const sideH = w * 0.15;

  // top diamond corners
  const cx = w / 2;
  const topLeft = [0, h / 2];
  const topTop = [cx, 0];
  const topRight = [w, h / 2];
  const topBottom = [cx, h];

  // side bottom corners
  const blLeft = [0, h / 2 + sideH];
  const blMid = [cx, h + sideH];
  const blRight = [w, h / 2 + sideH];

  const dark = "#5a8aa0";
  const mid = "#7eb0c8";

  return (
    <svg
      width={w}
      height={h + sideH + 2}
      viewBox={`0 0 ${w} ${h + sideH + 2}`}
      shapeRendering="crispEdges"
      className="pixelated"
    >
      {/* left face */}
      <polygon
        points={`${topLeft.join(",")} ${topBottom.join(",")} ${blMid.join(",")} ${blLeft.join(",")}`}
        fill={mid}
      />
      {/* right face */}
      <polygon
        points={`${topRight.join(",")} ${topBottom.join(",")} ${blMid.join(",")} ${blRight.join(",")}`}
        fill={dark}
      />
      {/* top */}
      <polygon
        points={`${topLeft.join(",")} ${topTop.join(",")} ${topRight.join(",")} ${topBottom.join(",")}`}
        fill={color}
        stroke="#3a6878"
        strokeWidth={0.5}
      />
      {/* highlight on top */}
      <polygon
        points={`${cx - w * 0.18},${h * 0.4} ${cx},${h * 0.28} ${cx + w * 0.18},${h * 0.4} ${cx},${h * 0.52}`}
        fill="rgba(255,255,255,0.25)"
      />
    </svg>
  );
}
