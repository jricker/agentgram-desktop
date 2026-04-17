import { useEffect, useRef, useState, useMemo } from "react";
import { useAgentStore } from "../stores/agentStore";

// Unique color per agent (deterministic from index)
const AGENT_COLORS = [
  { r: 99,  g: 102, b: 241 },  // indigo
  { r: 16,  g: 185, b: 129 },  // emerald
  { r: 244, g: 114, b: 182 },  // pink
  { r: 251, g: 191, b: 36  },  // amber
  { r: 139, g: 92,  b: 246 },  // violet
  { r: 34,  g: 211, b: 238 },  // cyan
  { r: 251, g: 146, b: 60  },  // orange
  { r: 52,  g: 211, b: 153 },  // teal
  { r: 248, g: 113, b: 113 },  // red
  { r: 96,  g: 165, b: 250 },  // blue
  { r: 163, g: 230, b: 53  },  // lime
  { r: 232, g: 121, b: 249 },  // fuchsia
];

function getColor(index: number) {
  return AGENT_COLORS[index % AGENT_COLORS.length];
}

// Build a flat-top hex path for SVG
function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

// Assign each hex cell to an agent (or leave unassigned for ambient cells)
interface HexData {
  row: number;
  col: number;
  cx: number;
  cy: number;
  agentIndex: number | null; // null = ambient/unassigned cell
}

function buildHexGrid(
  width: number,
  agentCount: number
): { cells: HexData[]; height: number } {
  const r = 9; // hex radius (small)
  const gap = 1.5;
  const colW = (r + gap) * Math.sqrt(3);
  const rowH = (r + gap) * 1.5;
  const cols = Math.max(1, Math.floor(width / colW));

  // We want enough rows to fill a meaningful board — at least 3 rows,
  // scale up with agent count
  const minCells = Math.max(agentCount * 12, 80);
  const totalRows = Math.max(6, Math.ceil(minCells / cols));
  const totalCells = totalRows * cols;

  // Distribute agent-owned cells across the grid
  // Each agent gets roughly equal share of cells, placed semi-randomly but deterministically
  const cells: HexData[] = [];
  const agentAssignments: (number | null)[] = new Array(totalCells).fill(null);

  if (agentCount > 0) {
    // Assign cells to agents using a deterministic scatter
    const cellsPerAgent = Math.floor(totalCells / agentCount);
    const extraCells = totalCells - cellsPerAgent * agentCount;

    let cellIdx = 0;
    for (let a = 0; a < agentCount; a++) {
      const count = cellsPerAgent + (a < extraCells ? 1 : 0);
      for (let c = 0; c < count; c++) {
        agentAssignments[cellIdx] = a;
        cellIdx++;
      }
    }

    // Shuffle deterministically (seeded by agentCount)
    let seed = agentCount * 31 + 7;
    for (let i = agentAssignments.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const j = seed % (i + 1);
      [agentAssignments[i], agentAssignments[j]] = [agentAssignments[j], agentAssignments[i]];
    }
  }

  let idx = 0;
  for (let row = 0; row < totalRows; row++) {
    const isOddRow = row % 2 === 1;
    const offsetX = isOddRow ? colW / 2 : 0;

    for (let col = 0; col < cols; col++) {
      const cx = colW / 2 + col * colW + offsetX;
      const cy = r + row * rowH;

      cells.push({
        row,
        col,
        cx,
        cy,
        agentIndex: agentAssignments[idx] ?? null,
      });
      idx++;
    }
  }

  const height = totalRows * rowH + r;
  return { cells, height };
}

export function HexBoard({
  onSelectAgent,
  selectedAgentId,
}: {
  onSelectAgent: (id: string | null) => void;
  selectedAgentId: string | null;
}) {
  const { agents, activities } = useAgentStore();
  const [containerWidth, setContainerWidth] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  const agentList = useMemo(
    () =>
      Object.values(agents).sort((a, b) =>
        a.agent.displayName.localeCompare(b.agent.displayName)
      ),
    [agents]
  );

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { cells, height } = useMemo(
    () => buildHexGrid(containerWidth, agentList.length),
    [containerWidth, agentList.length]
  );

  if (agentList.length === 0) return null;

  const r = 9;

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <svg
        width={containerWidth}
        height={height}
        className="block"
      >
        <defs>
          {/* Glow filter for active hexes */}
          <filter id="hex-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {cells.map((cell, i) => {
          const points = hexPoints(cell.cx, cell.cy, r);

          if (cell.agentIndex === null || cell.agentIndex >= agentList.length) {
            // Ambient/unassigned cell — very subtle
            return (
              <polygon
                key={i}
                points={points}
                fill="var(--border)"
                opacity={0.15}
                stroke="none"
              />
            );
          }

          const managed = agentList[cell.agentIndex];
          const color = getColor(cell.agentIndex);
          const isRunning = managed.processStatus === "running";
          const isActive =
            isRunning && activities[managed.agent.id] != null;
          const isSelected = managed.agent.id === selectedAgentId;
          const rgb = `${color.r}, ${color.g}, ${color.b}`;

          return (
            <g key={i}>
              {/* Active glow */}
              {isActive && (
                <polygon
                  points={hexPoints(cell.cx, cell.cy, r + 2)}
                  fill={`rgba(${rgb}, 0.3)`}
                  filter="url(#hex-glow)"
                >
                  <animate
                    attributeName="opacity"
                    values="0.2;0.5;0.2"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </polygon>
              )}

              {/* Hex cell */}
              <polygon
                points={points}
                fill={
                  !isRunning
                    ? "var(--border)"
                    : isActive
                      ? `rgba(${rgb}, 0.5)`
                      : `rgba(${rgb}, 0.15)`
                }
                opacity={!isRunning ? 0.2 : 1}
                stroke={isSelected ? `rgba(${rgb}, 0.7)` : "none"}
                strokeWidth={isSelected ? 1.5 : 0}
                className="cursor-pointer transition-all"
                onClick={() =>
                  onSelectAgent(
                    managed.agent.id === selectedAgentId ? null : managed.agent.id
                  )
                }
              >
                {isActive && (
                  <animate
                    attributeName="fill-opacity"
                    values="0.4;0.7;0.4"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                )}
                <title>{managed.agent.displayName}</title>
              </polygon>

            </g>
          );
        })}
      </svg>
    </div>
  );
}

export { getColor as getAgentColor, AGENT_COLORS };
