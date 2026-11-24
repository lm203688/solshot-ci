// Solshot · polar sun-path diagram drawn with plain Views (no SVG dependency).
//
// Geometry: azimuth runs clockwise from North around the outer ring, altitude is the radius
// (horizon = outer ring, zenith = centre). That is the "look up at the sky" convention used by
// every sun-path chart, so a compass bearing read off the phone maps straight onto the diagram.
import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { colors } from './theme';
import { solarPosition, DAY } from './engine/solar';

const RING_ALTITUDES = [30, 60];

function project(azDeg, altDeg, cx, cy, R) {
  const rad = (azDeg * Math.PI) / 180;
  const r = R * Math.max(0, 1 - altDeg / 90);
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function arcSegments(points, cx, cy, R, color, opacity, thickness) {
  const segs = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len || len > R * 0.6) continue; // skip horizon jumps across the north passage
    segs.push({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      len,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      color,
      opacity,
      thickness,
    });
  }
  return segs;
}

export default function SunPathChart({
  size,
  lat,
  lng,
  dayStartMs,
  nowMs,
  seasonalArcs = [],
  accent = colors.sun,
  showLabels = true,
  compact = false,
}) {
  const R = size / 2 - (compact ? 18 : 26);
  const cx = size / 2;
  const cy = size / 2;

  const today = useMemo(() => {
    const points = [];
    const stepMin = compact ? 10 : 5;
    for (let m = 0; m <= 1440; m += stepMin) {
      const t = dayStartMs + m * 60000;
      const p = solarPosition(t, lat, lng);
      if (p.altitude < -0.2) {
        points.push(null);
        continue;
      }
      points.push({ t, ...p, ...project(p.azimuth, p.altitude, cx, cy, R) });
    }
    return points;
  }, [dayStartMs, lat, lng, cx, cy, R, compact]);

  const seasonal = useMemo(
    () =>
      seasonalArcs.map((arc) => {
        const pts = [];
        for (let m = 0; m <= 1440; m += 30) {
          const t = arc.dayStartMs + m * 60000;
          const p = solarPosition(t, arc.lat, arc.lng);
          if (p.altitude < 0) {
            pts.push(null);
            continue;
          }
          pts.push({ t, ...p, ...project(p.azimuth, p.altitude, cx, cy, R) });
        }
        return { label: arc.label, segs: arcSegments(pts, cx, cy, R, colors.sky, 0.22, 1) };
      }),
    [seasonalArcs, cx, cy, R]
  );

  const todaySegs = useMemo(() => arcSegments(today, cx, cy, R, accent, 0.95, compact ? 2 : 2.4), [today, cx, cy, R, accent, compact]);

  const markers = useMemo(() => {
    const out = [];
    for (const p of today) {
      if (!p) continue;
      out.push(p);
    }
    return out;
  }, [today]);

  const nowPoint = useMemo(() => {
    if (!Number.isFinite(nowMs) || nowMs < dayStartMs || nowMs > dayStartMs + DAY) return null;
    const p = solarPosition(nowMs, lat, lng);
    if (p.altitude < -0.2) return { below: true, ...p };
    return { ...p, ...project(p.azimuth, p.altitude, cx, cy, R) };
  }, [nowMs, dayStartMs, lat, lng, cx, cy, R]);

  const first = markers[0];
  const last = markers[markers.length - 1];

  return (
    <View style={{ width: size, height: size }}>
      {RING_ALTITUDES.map((alt) => {
        const rr = R * (1 - alt / 90);
        return (
          <View
            key={'ring' + alt}
            style={{
              position: 'absolute',
              left: cx - rr,
              top: cy - rr,
              width: rr * 2,
              height: rr * 2,
              borderRadius: rr,
              borderWidth: 1,
              borderColor: colors.line,
            }}
          />
        );
      })}
      <View
        style={{
          position: 'absolute',
          left: cx - R,
          top: cy - R,
          width: R * 2,
          height: R * 2,
          borderRadius: R,
          borderWidth: 1.4,
          borderColor: colors.sky,
          opacity: 0.55,
        }}
      />
      {/* horizon-to-zenith spokes every 45 degrees, so bearings are readable without a compass */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const half = R / 2;
        return (
          <View
            key={'spoke' + deg}
            style={{
              position: 'absolute',
              left: cx + (half * Math.sin(rad)) / 1 - half,
              top: cy - (half * Math.cos(rad)) / 1,
              width: half * 2,
              height: 1,
              backgroundColor: colors.line,
              transform: [{ rotate: (deg - 90) + 'deg' }],
              opacity: 0.5,
            }}
          />
        );
      })}

      {seasonal.map((arc, i) =>
        arc.segs.map((s, j) => (
          <View
            key={'sea' + i + '-' + j}
            style={{
              position: 'absolute',
              left: s.x - s.len / 2,
              top: s.y,
              width: s.len,
              height: s.thickness,
              backgroundColor: s.color,
              opacity: s.opacity,
              transform: [{ rotate: s.angle + 'rad' }],
            }}
          />
        ))
      )}

      {todaySegs.map((s, i) => (
        <View
          key={'sun' + i}
          style={{
            position: 'absolute',
            left: s.x - s.len / 2,
            top: s.y - s.thickness / 2,
            width: s.len,
            height: s.thickness,
            backgroundColor: s.color,
            opacity: s.opacity,
            transform: [{ rotate: s.angle + 'rad' }],
          }}
        />
      ))}

      {first ? <View style={{ position: 'absolute', left: first.x - 4, top: first.y - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sky }} /> : null}
      {last ? <View style={{ position: 'absolute', left: last.x - 4, top: last.y - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.night }} /> : null}

      {nowPoint && !nowPoint.below ? (
        <View style={{ position: 'absolute', left: nowPoint.x - 6, top: nowPoint.y - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.sun }} />
      ) : null}

      {showLabels ? (
        <>
          <Text style={{ position: 'absolute', left: cx - 6, top: 2, fontSize: 10, fontWeight: '800', color: colors.sky }}>N</Text>
          <Text style={{ position: 'absolute', left: cx - 5, top: size - 16, fontSize: 10, fontWeight: '800', color: colors.sky }}>S</Text>
          <Text style={{ position: 'absolute', left: size - 15, top: cy - 7, fontSize: 10, fontWeight: '800', color: colors.sky }}>E</Text>
          <Text style={{ position: 'absolute', left: 3, top: cy - 7, fontSize: 10, fontWeight: '800', color: colors.sky }}>W</Text>
          <Text style={{ position: 'absolute', left: cx + 6, top: cy - 7, fontSize: 9, color: colors.sub }}>90°</Text>
          <Text style={{ position: 'absolute', left: cx - 12, top: cy - R * (1 - 30 / 90) + 4, fontSize: 9, color: colors.sub }}>30°</Text>
          <Text style={{ position: 'absolute', left: cx - 12, top: cy - R * (1 - 60 / 90) + 4, fontSize: 9, color: colors.sub }}>60°</Text>
        </>
      ) : null}
    </View>
  );
}
