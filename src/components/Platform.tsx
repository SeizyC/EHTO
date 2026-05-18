export function Platform({
  width = 180,
  color = "#3a8ec8",
}: {
  width?: number;
  color?: string;
}) {
  const w = width;
  const h = w * 0.36;
  const rx = w * 0.45;
  const ry = h * 0.42;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="pixelated select-none"
      shapeRendering="geometricPrecision"
    >
      <defs>
        <radialGradient id="plat-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.55" />
          <stop offset="60%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="plat-core" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="#dff4ff" stopOpacity="0.7" />
          <stop offset="60%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* outer glow */}
      <ellipse cx={w / 2} cy={h / 2} rx={rx} ry={ry} fill="url(#plat-glow)" />

      {/* outer ring */}
      <ellipse
        cx={w / 2}
        cy={h / 2}
        rx={rx * 0.78}
        ry={ry * 0.78}
        fill="none"
        stroke={color}
        strokeWidth={1}
        opacity={0.8}
      />

      {/* mid ring */}
      <ellipse
        cx={w / 2}
        cy={h / 2}
        rx={rx * 0.6}
        ry={ry * 0.6}
        fill="none"
        stroke={color}
        strokeWidth={0.7}
        opacity={0.55}
      />

      {/* inner ring */}
      <ellipse
        cx={w / 2}
        cy={h / 2}
        rx={rx * 0.4}
        ry={ry * 0.4}
        fill="none"
        stroke={color}
        strokeWidth={0.5}
        opacity={0.4}
      />

      {/* center core */}
      <ellipse cx={w / 2} cy={h / 2} rx={rx * 0.3} ry={ry * 0.35} fill="url(#plat-core)" />

      {/* tick marks at compass points */}
      {[0, 90, 180, 270].map((deg) => {
        const a = (deg * Math.PI) / 180;
        const x1 = w / 2 + Math.cos(a) * rx * 0.78;
        const y1 = h / 2 + Math.sin(a) * ry * 0.78;
        const x2 = w / 2 + Math.cos(a) * rx * 0.88;
        const y2 = h / 2 + Math.sin(a) * ry * 0.88;
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1} />;
      })}
    </svg>
  );
}
