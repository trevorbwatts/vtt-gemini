/**
 * Geometry helpers for Tier 2 sound zones.
 *
 * A sound zone is a polygon with a falloff radius. A "listener" point (the
 * party centroid) is mapped to a volume:
 *   - inside the polygon → 1.0
 *   - outside but within `falloffPx` of the nearest edge → linear ramp 1.0 → 0
 *   - beyond falloffPx → 0
 */

/** Squared distance from point (px,py) to segment (ax,ay)–(bx,by). */
function distSqToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
}

/** True if (px,py) is inside the polygon (even-odd rule). */
function pointInPolygon(px: number, py: number, points: number[]): boolean {
  if (points.length < 6) return false;
  let inside = false;
  const n = points.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i * 2], yi = points[i * 2 + 1];
    const xj = points[j * 2], yj = points[j * 2 + 1];
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Compute the volume contribution of a listener at (px, py) for a sound zone
 * polygon with the given falloff. Returns a number in [0, 1].
 */
export function zoneVolumeAtPoint(
  px: number,
  py: number,
  polygonPoints: number[],
  falloffPx: number,
): number {
  if (polygonPoints.length < 6) return 0;
  if (pointInPolygon(px, py, polygonPoints)) return 1;
  if (falloffPx <= 0) return 0;
  // Find the nearest edge distance.
  let minDistSq = Infinity;
  const n = polygonPoints.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const d = distSqToSegment(
      px, py,
      polygonPoints[i * 2], polygonPoints[i * 2 + 1],
      polygonPoints[j * 2], polygonPoints[j * 2 + 1],
    );
    if (d < minDistSq) minDistSq = d;
  }
  const dist = Math.sqrt(minDistSq);
  if (dist >= falloffPx) return 0;
  return 1 - (dist / falloffPx);
}
