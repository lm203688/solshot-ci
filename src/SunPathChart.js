// Solshot · polar sun-path diagram.
//
// Geometry: azimuth runs clockwise from North around the outer ring, altitude is the radius
// (horizon = outer ring, zenith = centre). That is the "look up at the sky" convention used by
// every sun-path chart, so a compass bearing read off the phone maps straight onto the diagram.
//
// The arcs themselves are drawn as SVG paths (react-native-svg) so they stay smooth at 3x on
// device instead of the beaded look you get from a chain of rotated Views.
import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { colors } from './theme';
import { solarPosition, DAY } from './engine/solar';

const RING_ALTITUDES = [30, 60];

function project(azDeg, altDeg, cx, cy, R) {
  const rad = (azDeg * Math.PI) / 180;
  const r = R * Math.max(0, 1 - altDeg / 90);
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

// Turn a point list (with nulls marking gaps) into one SVG path string per continuous run.
function arcPaths(points, R) {
  const out = [];
  let cur = null;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (!p) {
      if (cur) {
        out.push(cur);
        cur = null;
      }
      continue;
    }
    if (cur) {
      const prev = points[i - 1];
      const jump = prev ? Math.hypot(p.x - prev.x, p.y - prev.y) : 0;
      if (jump > R * 0.6) {
        out.push(cur);
        cur = 'M ' + p.x.toFixed(2) + ' ' + p.y.toFixed(2);
      } else {
        cur += ' L ' + p.x.toFixed(2) + ' ' + p.y.toFixed(2);
      }
    } else {
      cur = 'M ' + p.x.toFixed(2) + ' ' + p.y.toFixed(2);
    }
  }
  if (cur) out.push(cur);
  return out;
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
        for (let m = 0; m <= 1440; m += 20) {
          const t = arc.dayStartMs + m * 60000;
          const p = solarPosition(t, arc.lat, arc.lng);
          if (p.altitude < 0.5) {
            pts.push(null);
            continue;
          }
          pts.push({ t, ...p, ...project(p.azimuth, p.altitude, cx, cy, R) });
        }
        let peak = null;
        for (const p of pts) {
          if (!p) continue;
          if (!peak || p.altitude > peak.altitude) peak = p;
        }
        return { label: arc.label, peak, paths: arcPaths(pts, R) };
      }),
    [seasonalArcs, cx, cy, R]
  );

  const todayPaths = useMemo(() => arcPaths(today, R), [today, R]);

  const markers = useMemo(() => today.filter(Boolean), [today]);

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
              left: cx + half * Math.sin(rad) - half,
              top: cy - half * Math.cos(rad),
              width: half * 2,
              height: 1,
              backgroundColor: colors.line,
              transform: [{ rotate: deg - 90 + 'deg' }],
              opacity: 0.5,
            }}
          />
        );
      })}

      <Svg width={size} height={size} style={{ position: 'absolute', left: 0, top: 0 }}>
        {seasonal.map((arc, i) =>
          arc.paths.map((d, j) => (
            <Path
              key={'sea' + i + '-' + j}
              d={d}
              stroke={colors.sky}
              strokeWidth={compact ? 1.2 : 1.6}
              strokeOpacity={0.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))
        )}
        {todayPaths.map((d, i) => (
          <Path
            key={'sun' + i}
            d={d}
            stroke={accent}
            strokeWidth={compact ? 2 : 3}
            strokeOpacity={1}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
        {first ? <Circle cx={first.x} cy={first.y} r={4} fill={colors.sky} /> : null}
        {last ? <Circle cx={last.x} cy={last.y} r={4} fill={colors.night} /> : null}
        {nowPoint && !nowPoint.below ? (
          <Circle cx={nowPoint.x} cy={nowPoint.y} r={6} fill={colors.card} stroke={colors.sun} strokeWidth={2} />
        ) : null}
      </Svg>

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
