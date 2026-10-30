import React, { useMemo } from "react";

/* Global holiday decorations. Fixed, non-interactive SVG pieces chosen by `pack`,
   plus a full-screen falling-particle `effect`. Web only. */

// ---- Fixed corner / edge pieces ---------------------------------------------
const Cobweb = ({ pos }) => (
  <svg className={`pmp-hd ${pos}`} width="160" height="160" viewBox="0 0 100 100"
       fill="none" stroke="rgba(228,228,245,0.7)" strokeWidth="1.1">
    <path d="M0 0 L100 100 M0 0 L74 0 M0 0 L0 74 M0 0 L92 42 M0 0 L42 92 M0 0 L62 62" />
    <path d="M0 16 Q18 20 16 0 M0 34 Q36 38 34 0 M0 52 Q54 56 52 0 M0 72 Q74 78 72 0" />
    <path d="M12 0 Q16 18 0 16 M30 0 Q34 36 0 34 M50 0 Q54 56 0 54" />
  </svg>
);

const Spider = () => (
  <svg className="pmp-hd pmp-anim-sway" style={{ top: 0, left: "20%", transformOrigin: "top center" }}
       width="60" height="150" viewBox="0 0 60 150">
    <line x1="30" y1="0" x2="30" y2="86" stroke="rgba(200,200,220,0.55)" strokeWidth="1" />
    <g transform="translate(30,108)" stroke="#111" strokeWidth="2.4" fill="#111" strokeLinecap="round">
      <ellipse cx="0" cy="4" rx="12" ry="15" fill="#15151b" stroke="none" />
      <circle cx="0" cy="-12" r="7" fill="#15151b" stroke="none" />
      <circle cx="-2.5" cy="-13" r="1.6" fill="#ff5a3c" stroke="none" />
      <circle cx="2.5" cy="-13" r="1.6" fill="#ff5a3c" stroke="none" />
      <path d="M-10 -2 L-26 -12 M-11 4 L-28 2 M-10 10 L-26 18" />
      <path d="M10 -2 L26 -12 M11 4 L28 2 M10 10 L26 18" />
    </g>
  </svg>
);

const Ghost = ({ pos }) => (
  <svg className={`pmp-hd pmp-anim-float ${pos}`} style={{ margin: 26 }} width="84" height="96" viewBox="0 0 84 96">
    <path d="M42 6 C22 6 12 22 12 44 L12 86 L24 76 L34 86 L42 76 L50 86 L60 76 L72 86 L72 44 C72 22 62 6 42 6 Z"
          fill="rgba(245,245,255,0.92)" />
    <circle cx="32" cy="40" r="5" fill="#15151b" />
    <circle cx="54" cy="40" r="5" fill="#15151b" />
    <ellipse cx="43" cy="54" rx="5" ry="7" fill="rgba(0,0,0,0.35)" />
  </svg>
);

const Pumpkin = ({ pos }) => (
  <svg className={`pmp-hd ${pos}`} style={{ margin: 22 }} width="96" height="84" viewBox="0 0 96 84">
    <rect x="44" y="4" width="8" height="18" rx="3" fill="#5c7c3a" />
    <g fill="#ff7518">
      <ellipse cx="48" cy="52" rx="40" ry="30" />
      <ellipse cx="26" cy="52" rx="20" ry="29" fill="#f06a12" />
      <ellipse cx="70" cy="52" rx="20" ry="29" fill="#f06a12" />
    </g>
    <path d="M30 46 l10 8 l-10 0 z M66 46 l-10 8 l10 0 z M40 66 q8 8 16 0 l-4 0 -4 4 -4 -4 z" fill="#3a2410" />
  </svg>
);

const Lights = () => {
  const bulbs = useMemo(() => {
    const colors = ["#ff4d4d", "#4dd27a", "#ffd34d", "#4db4ff", "#ff8fcf"];
    return Array.from({ length: 26 }).map((_, i) => ({
      x: 10 + i * 46, color: colors[i % colors.length], delay: (i % 5) * 0.3,
    }));
  }, []);
  return (
    <svg className="pmp-hd pmp-hd-top" width="100%" height="46" viewBox="0 0 1200 46" preserveAspectRatio="none">
      <path d="M0 6 Q 11.5 30 23 6 T 46 6" fill="none" stroke="#2e3b30" strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            d2="" transform="scale(1,1)" />
      <path d={bulbs.map((b, i) => `${i === 0 ? "M" : "L"} ${b.x} ${i % 2 ? 22 : 10}`).join(" ")}
            fill="none" stroke="#2e3b30" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {bulbs.map((b, i) => (
        <g key={i} className="pmp-anim-twinkle" style={{ animationDelay: `${b.delay}s` }}>
          <circle cx={b.x} cy={i % 2 ? 26 : 14} r="5.5" fill={b.color} />
          <circle cx={b.x} cy={i % 2 ? 26 : 14} r="9" fill={b.color} opacity="0.25" />
        </g>
      ))}
    </svg>
  );
};

const Tree = ({ pos }) => (
  <svg className={`pmp-hd ${pos}`} style={{ margin: 16 }} width="92" height="120" viewBox="0 0 92 120">
    <polygon points="46,6 70,44 22,44" fill="#2e9e5b" />
    <polygon points="46,28 76,74 16,74" fill="#2b8f52" />
    <polygon points="46,54 82,104 10,104" fill="#27824a" />
    <rect x="40" y="104" width="12" height="14" fill="#6b4423" />
    <polygon points="46,0 50,8 58,9 52,14 54,22 46,17 38,22 40,14 34,9 42,8" fill="#ffd34d" />
    {[["30",64,"#ff4d4d"],["60",58,"#4db4ff"],["46",88,"#ffd34d"],["36",96,"#ff8fcf"],["58",92,"#4dd27a"]].map(([x,y,c],i)=>(
      <circle key={i} cx={x} cy={y} r="3.4" fill={c} className="pmp-anim-twinkle" style={{animationDelay:`${i*0.4}s`}} />
    ))}
  </svg>
);

const HeartCorner = ({ pos }) => (
  <svg className={`pmp-hd ${pos}`} style={{ margin: 14 }} width="120" height="120" viewBox="0 0 120 120">
    {[[30,30,1],[64,22,0.7],[26,66,0.8]].map(([x,y,s],i)=>(
      <path key={i} transform={`translate(${x},${y}) scale(${s})`}
            d="M0 10 C0 2 -14 2 -14 12 C-14 22 0 30 0 34 C0 30 14 22 14 12 C14 2 0 2 0 10 Z"
            fill="#ff4d8d" opacity={0.9} />
    ))}
  </svg>
);

const Fireworks = ({ pos }) => (
  <svg className={`pmp-hd ${pos}`} style={{ margin: 20 }} width="130" height="130" viewBox="0 0 130 130">
    {[["#ffd34d",40,40,0],["#6c8bff",92,56,0.6],["#ff8fcf",60,90,1.1]].map(([c,cx,cy,d],k)=>(
      <g key={k} className="pmp-anim-twinkle" style={{ animationDelay:`${d}s`, transformOrigin:`${cx}px ${cy}px` }} stroke={c} strokeWidth="2" strokeLinecap="round">
        {Array.from({length:12}).map((_,i)=>{const a=(i/12)*Math.PI*2;return(
          <line key={i} x1={cx} y1={cy} x2={cx+Math.cos(a)*16} y2={cy+Math.sin(a)*16} />
        );})}
        {Array.from({length:12}).map((_,i)=>{const a=(i/12)*Math.PI*2;return(
          <circle key={i} cx={cx+Math.cos(a)*18} cy={cy+Math.sin(a)*18} r="1.6" fill={c} stroke="none" />
        );})}
      </g>
    ))}
  </svg>
);

const LeafCorner = ({ pos }) => (
  <svg className={`pmp-hd ${pos}`} style={{ margin: 14 }} width="130" height="130" viewBox="0 0 130 130">
    {[["#c9712b",24,28,10],["#e0a93b",60,20,-20],["#a8551f",28,66,35],["#d98a2b",70,60,0]].map(([c,x,y,r],i)=>(
      <g key={i} transform={`translate(${x},${y}) rotate(${r})`}>
        <path d="M0 0 C -14 -8 -14 -28 0 -36 C 14 -28 14 -8 0 0 Z" fill={c} />
        <line x1="0" y1="-2" x2="0" y2="-34" stroke="rgba(0,0,0,0.25)" strokeWidth="1.3" />
      </g>
    ))}
  </svg>
);

const Egg = ({ pos, color = "#8fd1c4" }) => (
  <svg className={`pmp-hd ${pos}`} style={{ margin: 18 }} width="70" height="92" viewBox="0 0 70 92">
    <ellipse cx="35" cy="56" rx="30" ry="36" fill={color} />
    <path d="M6 52 q14 -10 29 0 t29 0" stroke="#fff" strokeWidth="4" fill="none" opacity="0.8" />
    <path d="M8 66 q14 10 27 0 t27 0" stroke="#ff8fcf" strokeWidth="4" fill="none" opacity="0.85" />
    <circle cx="24" cy="38" r="4" fill="#fff" opacity="0.8" />
    <circle cx="44" cy="34" r="3" fill="#ffd34d" opacity="0.9" />
  </svg>
);

const Flower = ({ pos }) => (
  <svg className={`pmp-hd ${pos}`} style={{ margin: 18 }} width="86" height="86" viewBox="0 0 86 86">
    {Array.from({length:6}).map((_,i)=>{const a=(i/6)*Math.PI*2;return(
      <ellipse key={i} cx={43+Math.cos(a)*16} cy={43+Math.sin(a)*16} rx="11" ry="16"
               transform={`rotate(${(i/6)*360} ${43+Math.cos(a)*16} ${43+Math.sin(a)*16})`}
               fill={["#ff8fcf","#ffd34d"][i%2]} opacity="0.92" />
    );})}
    <circle cx="43" cy="43" r="11" fill="#ffb64d" />
  </svg>
);

const Balloon = ({ pos, color = "#ff6b3d", delay = 0 }) => (
  <svg className={`pmp-hd pmp-anim-bob ${pos}`} style={{ margin: 18, animationDelay: `${delay}s` }} width="70" height="120" viewBox="0 0 70 120">
    <ellipse cx="35" cy="40" rx="28" ry="34" fill={color} />
    <ellipse cx="26" cy="30" rx="7" ry="10" fill="rgba(255,255,255,0.4)" />
    <polygon points="31,72 39,72 35,80" fill={color} />
    <path d="M35 80 Q 42 100 35 118" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" fill="none" />
  </svg>
);

const Cake = ({ pos }) => (
  <svg className={`pmp-hd pmp-hd-bottom ${pos}`} style={{ left: "50%", transform: "translateX(-50%)", margin: 14 }} width="120" height="110" viewBox="0 0 120 110">
    <rect x="18" y="58" width="84" height="42" rx="6" fill="#ff8fcf" />
    <rect x="28" y="38" width="64" height="26" rx="6" fill="#ffd4e6" />
    <path d="M18 64 q10 10 21 0 t21 0 t21 0 t21 0" fill="#fff" opacity="0.85" />
    {[36,60,84].map((x,i)=>(
      <g key={i}>
        <rect x={x-1.5} y="16" width="3" height="22" fill="#ffd34d" />
        <path d={`M${x} 10 q4 4 0 8 q-4 -4 0 -8`} fill="#ff7518" className="pmp-anim-twinkle" style={{animationDelay:`${i*0.3}s`}} />
      </g>
    ))}
  </svg>
);

const PACK_PIECES = {
  halloween: () => [<Cobweb key="w1" pos="pmp-hd-tl" />, <Cobweb key="w2" pos="pmp-hd-tr" />, <Spider key="s" />, <Pumpkin key="p" pos="pmp-hd-bl" />, <Ghost key="g" pos="pmp-hd-br" />],
  christmas: () => [<Lights key="l" />, <Tree key="t" pos="pmp-hd-bl" />],
  valentines: () => [<HeartCorner key="h1" pos="pmp-hd-tl" />, <HeartCorner key="h2" pos="pmp-hd-tr" />],
  newyear: () => [<Fireworks key="f1" pos="pmp-hd-tl" />, <Fireworks key="f2" pos="pmp-hd-tr" />],
  thanksgiving: () => [<LeafCorner key="l1" pos="pmp-hd-tl" />, <LeafCorner key="l2" pos="pmp-hd-tr" />, <Pumpkin key="p" pos="pmp-hd-bl" />],
  easter: () => [<Egg key="e" pos="pmp-hd-bl" />, <Egg key="e2" pos="pmp-hd-br" color="#ffb3d1" />, <Flower key="f" pos="pmp-hd-tr" />],
  anniversary: () => [<Balloon key="b1" pos="pmp-hd-bl" color="#ff6b3d" />, <Balloon key="b2" pos="pmp-hd-br" color="#f5c542" delay={0.8} />, <Cake key="c" pos="" />],
  generic: () => [],
};

// ---- Falling particle shapes -------------------------------------------------
function Shape({ effect, color }) {
  switch (effect) {
    case "snow": return <svg width="100%" height="100%" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#fff" /></svg>;
    case "hearts": return <svg width="100%" height="100%" viewBox="-15 0 30 36"><path d="M0 10 C0 2 -14 2 -14 12 C-14 22 0 30 0 34 C0 30 14 22 14 12 C14 2 0 2 0 10 Z" fill={color} /></svg>;
    case "leaves": return <svg width="100%" height="100%" viewBox="-14 -36 28 36"><path d="M0 0 C -14 -8 -14 -28 0 -36 C 14 -28 14 -8 0 0 Z" fill={color} /></svg>;
    case "confetti": return <svg width="100%" height="100%" viewBox="0 0 10 14"><rect width="10" height="14" rx="2" fill={color} /></svg>;
    case "bats": return <svg width="100%" height="100%" viewBox="0 0 48 24"><path d="M24 6 L18 2 L20 8 Q12 2 2 10 Q10 8 12 12 Q6 12 4 16 Q14 14 24 18 Q34 14 44 16 Q42 12 36 12 Q38 8 46 10 Q36 2 28 8 L30 2 Z" fill="#15151b" /></svg>;
    default: return <svg width="100%" height="100%" viewBox="0 0 20 20"><path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" fill={color} /></svg>;
  }
}

function Particles({ effect, primary, accent }) {
  const palette = effect === "snow" ? ["#fff"]
    : effect === "confetti" ? ["#ff4d4d", "#4dd27a", "#ffd34d", "#4db4ff", "#ff8fcf"]
    : effect === "leaves" ? ["#c9712b", "#e0a93b", "#a8551f"]
    : effect === "hearts" ? ["#ff4d8d", "#ff8fb1", "#ff6b9c"]
    : [primary, accent, "#ffd34d"];
  const items = useMemo(() => Array.from({ length: 20 }).map((_, i) => ({
    left: (i * 5 + Math.random() * 4).toFixed(1),
    size: 12 + Math.random() * (effect === "bats" ? 24 : 16),
    dur: (6 + Math.random() * 8).toFixed(1),
    delay: (Math.random() * 8).toFixed(1),
    color: palette[i % palette.length],
    key: i,
  })), [effect]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="pmp-particles" aria-hidden data-testid="holiday-particles">
      {items.map((p) => (
        <span key={p.key} className="pmp-particle"
              style={{ left: `${p.left}%`, width: p.size, height: p.size,
                       animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }}>
          <Shape effect={effect} color={p.color} />
        </span>
      ))}
    </div>
  );
}

export default function HolidayDecorations({ spec }) {
  if (!spec) return null;
  const pieces = (PACK_PIECES[spec.pack] || PACK_PIECES.generic)();
  return (
    <>
      <div className="pmp-holiday" aria-hidden data-testid="holiday-decorations">{pieces}</div>
      {spec.effect && spec.effect !== "none" && (
        <Particles effect={spec.effect} primary={spec.primary} accent={spec.accent} />
      )}
    </>
  );
}
