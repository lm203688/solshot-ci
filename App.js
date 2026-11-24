import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { layoutForSize } from './src/duoLayout';
import SunPathChart from './src/SunPathChart';
import { colors, radius, shadow, type } from './src/theme';
import { loadStore, PRESETS, saveStore } from './src/store';
import {
  DAY,
  HOUR,
  fmtAngle,
  fmtCoord,
  fmtDay,
  fmtDuration,
  fmtElevation,
  fmtLength,
  fmtTime,
  localDayStartMs,
  nominalTzHours,
} from './src/format';
import { crossingTimes, daySummary, solarPosition } from './src/engine/solar';
import { findFirstDate } from './src/engine/solve';
import { compassPoint, ratioAt, shadowHeading, shadowLength } from './src/engine/shadow';

const SEASON_LABELS = ['Mar 21', 'Jun 21', 'Sep 21', 'Dec 21'];
const SEASON_MONTHS = [2, 5, 8, 11];

function clockSpans(dayStart, lat, lng) {
  const at = (deg) => crossingTimes(dayStart, lat, lng, deg);
  const high = at(6);
  const low = at(-4);
  const civil = at(-6);
  return {
    goldenMorning: [low.rise, high.rise],
    goldenEvening: [high.set, low.set],
    blueMorning: [civil.rise, low.rise],
    blueEvening: [low.set, civil.set],
  };
}

function spanText(range, tz, dst, use24) {
  if (!range[0] || !range[1]) return '—';
  return fmtTime(range[0], tz, dst, use24) + ' – ' + fmtTime(range[1], tz, dst, use24);
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const layout = useMemo(() => layoutForSize(width, height), [width, height]);
  // Two columns only when there is real room (iPad); Duo's 669pt panel reads better stacked.
  const split = layout.twoPane && width >= 760;

  const [store, setStore] = useState(() => loadStore());
  const [offset, setOffset] = useState(0);
  const [locationOpen, setLocationOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [latText, setLatText] = useState(String(store.lat));
  const [lngText, setLngText] = useState(String(store.lng));
  const [labelText, setLabelText] = useState(store.label);
  const [targetText, setTargetText] = useState('90');
  const [solverMode, setSolverMode] = useState('azimuth');
  const [heightText, setHeightText] = useState(String(store.objectHeightM));
  const [azText, setAzText] = useState(String(store.azOffset));
  const [altText, setAltText] = useState(String(store.altOffset));
  const [solution, setSolution] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  void tick; // re-render every 30 s so "now" markers stay honest
  const tz = nominalTzHours(store.lng);
  const todayStart = localDayStartMs(now, tz, store.dst);
  const dayStart = offset === 0 ? todayStart : localDayStartMs(todayStart + offset * DAY + DAY / 2, tz, store.dst);
  const isToday = offset === 0;

  const update = useCallback((patch) => setStore({ ...saveStore(patch) }), []);

  const summary = useMemo(() => daySummary(dayStart, store.lat, store.lng), [dayStart, store.lat, store.lng]);
  const spans = useMemo(() => clockSpans(dayStart, store.lat, store.lng), [dayStart, store.lat, store.lng]);
  const posNow = useMemo(() => solarPosition(now, store.lat, store.lng), [now, store.lat, store.lng]);

  const seasonalArcs = useMemo(() => {
    const year = new Date(dayStart).getUTCFullYear();
    return SEASON_MONTHS.map((m, i) => {
      const noonish = Date.UTC(year, m, 21, 12) - tz * HOUR;
      return {
        label: SEASON_LABELS[i],
        dayStartMs: localDayStartMs(noonish, tz, store.dst),
        lat: store.lat,
        lng: store.lng,
      };
    });
  }, [dayStart, store.lat, store.lng, tz, store.dst]);

  const displayAz = ((posNow.azimuth + store.azOffset + 360) % 360);
  const displayAlt = posNow.altitude + store.altOffset;

  const shadowRows = useMemo(() => {
    return [9, 12, 15].map((h) => {
      const t = dayStart + h * HOUR;
      const p = solarPosition(t, store.lat, store.lng);
      const alt = p.altitude + store.altOffset;
      return { h, t, alt, length: shadowLength(store.objectHeightM, alt), heading: shadowHeading(p.azimuth + store.azOffset) };
    });
  }, [dayStart, store.lat, store.lng, store.azOffset, store.altOffset, store.objectHeightM]);

  const noonRatio = ratioAt(summary.solarNoon.altitude + store.altOffset);
  const target = Number.parseFloat(String(targetText).replace(',', '.'));

  const applyLocation = () => {
    const lat = Number.parseFloat(latText.replace(',', '.'));
    const lng = Number.parseFloat(lngText.replace(',', '.'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 89.9 || Math.abs(lng) > 180) return;
    const label = labelText.trim() || fmtCoord(lat, 'lat') + ' ' + fmtCoord(lng, 'lng');
    const recents = [label, ...store.recents.filter((r) => r !== label)].slice(0, 8);
    update({ lat, lng, label, recents });
    setSolution(null);
    setLocationOpen(false);
  };

  const pickPreset = (p) => {
    update({ lat: p.lat, lng: p.lng, label: p.label, dst: p.dst });
    setLatText(String(p.lat));
    setLngText(String(p.lng));
    setLabelText(p.label);
    setSolution(null);
    setLocationOpen(false);
  };

  const runSolver = () => {
    if (!Number.isFinite(target)) return;
    const hit = findFirstDate({
      todayStartMs: todayStart,
      lat: store.lat,
      lng: store.lng,
      targetAzimuth: solverMode === 'azimuth' ? ((target % 360) + 360) % 360 : null,
      targetAltitude: solverMode === 'altitude' ? target : null,
      days: 370,
    });
    setSolution(hit || { empty: true });
  };

  const shareSummary = () => {
    const lines = [
      'Solshot — ' + store.label + ' (' + fmtCoord(store.lat, 'lat') + ', ' + fmtCoord(store.lng, 'lng') + ')',
      fmtDay(dayStart + DAY / 2, tz, store.dst),
      'Sunrise ' + (summary.sunrise ? fmtTime(summary.sunrise, tz, store.dst, store.use24) + ' at ' + fmtAngle(summary.sunriseAzimuth + store.azOffset, store.dms) : 'none (polar)'),
      'Sunset ' + (summary.sunset ? fmtTime(summary.sunset, tz, store.dst, store.use24) + ' at ' + fmtAngle(summary.sunsetAzimuth + store.azOffset, store.dms) : 'none (polar)'),
      'Solar noon ' + fmtTime(summary.solarNoon.ms, tz, store.dst, store.use24) + ', altitude ' + fmtElevation(summary.solarNoon.altitude + store.altOffset),
      'Day length ' + fmtDuration(summary.dayLengthMs),
      'Golden hour AM ' + spanText(spans.goldenMorning, tz, store.dst, store.use24),
      'Golden hour PM ' + spanText(spans.goldenEvening, tz, store.dst, store.use24),
      store.azOffset ? 'Compass offset ' + store.azOffset + '°' : null,
      'NOAA solar algorithm, computed on device.',
    ].filter(Boolean);
    Share.share({ message: lines.join('\n') }).catch(() => {});
  };

  const locationCard = (
    <View style={[styles.card, shadow]}>
      <Pressable onPress={() => setLocationOpen(true)} style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={type.label}>Location</Text>
          <Text style={type.h1} numberOfLines={1}>{store.label}</Text>
          <Text style={type.small}>
            {fmtCoord(store.lat, 'lat')} · {fmtCoord(store.lng, 'lng')} · UTC{tz >= 0 ? '+' : '−'}{Math.abs(tz)}
          </Text>
        </View>
        <Text style={styles.link}>Change</Text>
      </Pressable>
      <View style={styles.dayNav}>
        <Pressable onPress={() => { setOffset(offset - 1); setSolution(null); }} style={styles.navBtn} hitSlop={8}>
          <Text style={styles.navGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.navLabel}>{isToday ? 'Today · ' + fmtDay(dayStart + DAY / 2, tz, store.dst) : fmtDay(dayStart + DAY / 2, tz, store.dst)}</Text>
        <Pressable onPress={() => { setOffset(offset + 1); setSolution(null); }} style={styles.navBtn} hitSlop={8}>
          <Text style={styles.navGlyph}>›</Text>
        </Pressable>
      </View>
    </View>
  );

  const heroCard = (
    <View style={[styles.card, shadow]}>
      <Text style={type.label}>Sun</Text>
      {summary.polar === 'alwaysAbove' ? (
        <Text style={[type.h2, { marginTop: 8 }]}>Midnight sun — the sun stays above the horizon all day</Text>
      ) : summary.polar === 'alwaysBelow' ? (
        <Text style={[type.h2, { marginTop: 8 }]}>Polar night — the sun stays below the horizon</Text>
      ) : (
        <View>
          <View style={[styles.twoUp, { marginTop: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.timeLabel}>Sunrise</Text>
              <Text style={type.hero}>{summary.sunrise ? fmtTime(summary.sunrise, tz, store.dst, store.use24) : '—'}</Text>
              <Text style={type.small}>
                {summary.sunriseAzimuth != null ? fmtAngle(summary.sunriseAzimuth + store.azOffset, store.dms) + ' ' + compassPoint(summary.sunriseAzimuth + store.azOffset) : '—'}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.timeLabel}>Sunset</Text>
              <Text style={type.hero}>{summary.sunset ? fmtTime(summary.sunset, tz, store.dst, store.use24) : '—'}</Text>
              <Text style={type.small}>
                {summary.sunsetAzimuth != null ? fmtAngle(summary.sunsetAzimuth + store.azOffset, store.dms) + ' ' + compassPoint(summary.sunsetAzimuth + store.azOffset) : '—'}
              </Text>
            </View>
          </View>
          <View style={styles.nextBox}>
            <View>
              <Text style={styles.nextType}>SOLAR NOON</Text>
              <Text style={styles.nextTime}>{fmtTime(summary.solarNoon.ms, tz, store.dst, store.use24)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.nextMeta}>{fmtElevation(summary.solarNoon.altitude + store.altOffset)}</Text>
              <Text style={styles.nextMeta}>{fmtDuration(summary.dayLengthMs)} of daylight</Text>
            </View>
          </View>
        </View>
      )}
      {isToday ? (
        <Text style={[type.small, { marginTop: 10 }]}>
          Now: sun {fmtElevation(displayAlt)} at {fmtAngle(displayAz, store.dms)} ({compassPoint(displayAz)})
        </Text>
      ) : null}
    </View>
  );

  const chartSize = Math.min(split ? layout.left - 56 : Math.min(width, 760) - 64, 340);

  const chartCard = (
    <View style={[styles.card, shadow]}>
      <View style={styles.rowBetween}>
        <Text style={type.label}>Sun path</Text>
        <Text style={type.small}>rings 30° · 60°</Text>
      </View>
      <View style={{ alignItems: 'center', marginTop: 6 }}>
        <SunPathChart
          size={chartSize}
          lat={store.lat}
          lng={store.lng}
          dayStartMs={dayStart}
          nowMs={isToday ? now : null}
          seasonalArcs={seasonalArcs}
        />
      </View>
      <View style={styles.legend}>
        <View style={[styles.legendDot, { backgroundColor: colors.sun }]} />
        <Text style={type.small}>This day</Text>
        <View style={[styles.legendDot, { backgroundColor: colors.sky, opacity: 0.45 }]} />
        <Text style={type.small}>Equinox / solstice</Text>
        <View style={[styles.legendDot, { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.sun }]} />
        <Text style={type.small}>Now</Text>
      </View>
    </View>
  );

  const twilightRows = [
    ['Golden hour AM', spanText(spans.goldenMorning, tz, store.dst, store.use24), colors.sun],
    ['Golden hour PM', spanText(spans.goldenEvening, tz, store.dst, store.use24), colors.sun],
    ['Blue hour AM', spanText(spans.blueMorning, tz, store.dst, store.use24), colors.sky],
    ['Blue hour PM', spanText(spans.blueEvening, tz, store.dst, store.use24), colors.sky],
    ['Civil twilight', summary.civil.rise ? fmtTime(summary.civil.rise, tz, store.dst, store.use24) + ' – ' + fmtTime(summary.civil.set, tz, store.dst, store.use24) : '—', colors.sub],
    ['Nautical', summary.nautical.rise ? fmtTime(summary.nautical.rise, tz, store.dst, store.use24) + ' – ' + fmtTime(summary.nautical.set, tz, store.dst, store.use24) : '—', colors.night],
    ['Astronomical', summary.astronomical.rise ? fmtTime(summary.astronomical.rise, tz, store.dst, store.use24) + ' – ' + fmtTime(summary.astronomical.set, tz, store.dst, store.use24) : '—', colors.night],
  ];

  const twilightCard = (
    <View style={[styles.card, shadow]}>
      <Text style={type.label}>Light windows</Text>
      {twilightRows.map(([label, value, color]) => (
        <View key={label} style={styles.tableRow}>
          <View style={[styles.tableBar, { backgroundColor: color, opacity: 0.9 }]} />
          <Text style={styles.tableLabel}>{label}</Text>
          <Text style={styles.tableValue} numberOfLines={1}>{value}</Text>
        </View>
      ))}
    </View>
  );

  const shadowCard = (
    <View style={[styles.card, shadow]}>
      <View style={styles.rowBetween}>
        <Text style={type.label}>Shadow</Text>
        <Text style={type.small}>flat ground, no buildings</Text>
      </View>
      <View style={styles.heightRow}>
        <Text style={type.small}>Object height</Text>
        <TextInput
          value={heightText}
          onChangeText={(v) => {
            setHeightText(v);
            const n = Number.parseFloat(String(v).replace(',', '.'));
            if (Number.isFinite(n) && n > 0) update({ objectHeightM: n });
          }}
          onBlur={() => {
            const n = Number.parseFloat(String(heightText).replace(',', '.'));
            const safe = Number.isFinite(n) && n > 0 ? n : store.objectHeightM;
            setHeightText(String(safe));
            update({ objectHeightM: safe });
          }}
          keyboardType="decimal-pad"
          style={styles.heightInput}
        />
        <Text style={type.small}>metres</Text>
      </View>
      {shadowRows.map((row) => (
        <View key={row.h} style={styles.tableRow}>
          <Text style={styles.tableLabel}>{fmtTime(row.t, tz, store.dst, store.use24)}</Text>
          <Text style={styles.tableValue} numberOfLines={2}>
            {!Number.isFinite(row.length) || row.length > 1e6
              ? 'sun down · ' + fmtElevation(row.alt)
              : fmtLength(row.length, store.units === 'imperial' ? 'ft' : 'm') + ' toward ' + compassPoint(row.heading) + ' · sun ' + fmtElevation(row.alt)}
          </Text>
        </View>
      ))}
      <Text style={[type.small, { marginTop: 8 }]}>
        At solar noon the shadow is {Number.isFinite(noonRatio) ? noonRatio.toFixed(2) + '× the object height' : 'undefined — sun at zenith'}.
      </Text>
    </View>
  );

  const solverCard = (
    <View style={[styles.card, shadow]}>
      <Text style={type.label}>Reverse search</Text>
      <View style={styles.segRow}>
        {[
          ['azimuth', 'Sun bearing'],
          ['altitude', 'Sun height'],
        ].map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => { setSolverMode(key); setSolution(null); }}
            style={[styles.seg, solverMode === key && styles.segActive]}
          >
            <Text style={[styles.segText, solverMode === key && styles.segTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.solverRow}>
        <TextInput
          value={targetText}
          onChangeText={(v) => { setTargetText(v); setSolution(null); }}
          keyboardType="numbers-and-punctuation"
          style={styles.solverInput}
        />
        <Text style={type.h2}>{solverMode === 'azimuth' ? '° bearing' : '° altitude'}</Text>
        <Pressable onPress={runSolver} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Find date</Text>
        </Pressable>
      </View>
      {solution && !solution.empty ? (
        <View style={{ marginTop: 10 }}>
          <Text style={type.h2}>{fmtDay(solution.ms, tz, store.dst)}</Text>
          <Text style={type.body}>
            {fmtTime(solution.ms, tz, store.dst, store.use24)} · sun {fmtElevation(solution.altitude + store.altOffset)} at {fmtAngle(solution.azimuth + store.azOffset, store.dms)}
          </Text>
          {solution.dayOffset === 0 ? <Text style={[type.small, { marginTop: 2 }]}>That is today.</Text> : null}
        </View>
      ) : null}
      {solution && solution.empty ? (
        <Text style={[type.small, { marginTop: 10 }]}>No crossing in the next year at this place.</Text>
      ) : null}
      <Text style={[type.small, { marginTop: 8 }]}>
        Searches the next 370 days at 5-minute resolution and refines each hit by bisection.
      </Text>
    </View>
  );

  const footer = (
    <Text style={[type.small, { textAlign: 'center', marginTop: 4, marginBottom: 26 }]}>
      NOAA solar algorithm, computed on device with no network. Position accuracy about 0.02°; sunrise and sunset shift by minutes behind terrain or buildings. Not for legal surveying.
    </Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: layout.topInset,
          paddingBottom: 40,
          paddingLeft: 16,
          paddingRight: layout.gutter + 16,
          flexGrow: 1,
          justifyContent: 'flex-start',
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View>
            <Text style={styles.brand}>Solshot</Text>
            <Text style={type.small}>Offline sun path · golden hour · shadow</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Pressable onPress={shareSummary} style={styles.headerBtn} hitSlop={6}>
              <Text style={styles.headerGlyph}>↗</Text>
            </Pressable>
            <Pressable onPress={() => setSettingsOpen(true)} style={[styles.headerBtn, { marginLeft: 8 }]} hitSlop={6}>
              <Text style={styles.headerGlyph}>⚙︎</Text>
            </Pressable>
          </View>
        </View>

        {split ? (
          <View style={styles.paneRow}>
            <View style={{ width: layout.left - 8, marginRight: 12 }}>{locationCard}{heroCard}{chartCard}</View>
            <View style={{ flex: 1 }}>{twilightCard}{shadowCard}{solverCard}</View>
          </View>
        ) : (
          <View style={{ width: Math.min(width - layout.gutter - 32, 760) }}>
            {locationCard}{heroCard}{chartCard}{twilightCard}{shadowCard}{solverCard}
          </View>
        )}
        {footer}
      </ScrollView>

      <Modal visible={locationOpen} animationType="slide" transparent onRequestClose={() => setLocationOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={type.h1}>Location</Text>
              <Pressable onPress={() => setLocationOpen(false)} hitSlop={10}><Text style={styles.link}>Done</Text></Pressable>
            </View>
            <Text style={[type.small, { marginBottom: 8 }]}>Solshot never asks for location permission. Type coordinates or pick a preset.</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            {PRESETS.map((p) => (
              <Pressable key={p.label} onPress={() => pickPreset(p)} style={styles.stationRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stationName}>{p.label}</Text>
                  <Text style={type.small}>{fmtCoord(p.lat, 'lat')} · {fmtCoord(p.lng, 'lng')}</Text>
                </View>
                {p.label === store.label ? <Text style={styles.currentTag}>CURRENT</Text> : null}
              </Pressable>
            ))}
            <Text style={[type.label, { marginTop: 14 }]}>Custom</Text>
            <TextInput value={labelText} onChangeText={setLabelText} placeholder="Label (e.g. Back garden)" style={styles.input} />
            <View style={{ flexDirection: 'row' }}>
              <TextInput value={latText} onChangeText={setLatText} keyboardType="numbers-and-punctuation" placeholder="Latitude 42.3601" style={[styles.input, { flex: 1, marginRight: 8 }]} />
              <TextInput value={lngText} onChangeText={setLngText} keyboardType="numbers-and-punctuation" placeholder="Longitude -71.0589" style={[styles.input, { flex: 1 }]} />
            </View>
            <Pressable onPress={applyLocation} style={styles.primaryBtnFull}>
              <Text style={styles.primaryBtnText}>Use this location</Text>
            </Pressable>
            {store.recents.length ? (
              <Text style={[type.small, { marginTop: 10 }]}>Recent: {store.recents.join(' · ')}</Text>
            ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={settingsOpen} animationType="slide" transparent onRequestClose={() => setSettingsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={type.h1}>Settings</Text>
              <Pressable onPress={() => setSettingsOpen(false)} hitSlop={10}><Text style={styles.link}>Done</Text></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            {[
              ['24-hour clock', 'use24'],
              ['Degrees and minutes', 'dms'],
              ['Feet for shadow length', null],
              ['US daylight saving', 'dst'],
            ].map(([label, key]) => (
              <View key={label} style={styles.settingRow}>
                <Text style={styles.settingLabel}>{label}</Text>
                <Switch
                  value={key ? !!store[key] : store.units === 'imperial'}
                  onValueChange={(v) => (key ? update({ [key]: v }) : update({ units: v ? 'imperial' : 'metric' }))}
                  trackColor={{ true: colors.sun }}
                />
              </View>
            ))}
            <Text style={[type.label, { marginTop: 14 }]}>Compass calibration</Text>
            <Text style={[type.small, { marginBottom: 6 }]}>
              Shift every bearing and shadow heading by a fixed offset to match a known bearing on site.
            </Text>
            <View style={styles.solverRow}>
              <TextInput
                value={azText}
                onChangeText={(v) => {
                  setAzText(v);
                  const n = Number.parseFloat(String(v).replace(',', '.'));
                  if (Number.isFinite(n)) update({ azOffset: Math.max(-30, Math.min(30, n)) });
                }}
                keyboardType="numbers-and-punctuation"
                style={styles.solverInput}
              />
              <Text style={type.h2}>° offset</Text>
              <Pressable onPress={() => { setAzText('0'); setAltText('0'); update({ azOffset: 0, altOffset: 0 }); }} style={styles.ghostBtn}>
                <Text style={styles.ghostBtnText}>Reset</Text>
              </Pressable>
            </View>
            <Text style={[type.small, { marginTop: 10 }]}>
              Altitude offset {altText}° (used for horizon corrections).
            </Text>
            <View style={styles.solverRow}>
              <TextInput
                value={altText}
                onChangeText={(v) => {
                  setAltText(v);
                  const n = Number.parseFloat(String(v).replace(',', '.'));
                  if (Number.isFinite(n)) update({ altOffset: Math.max(-10, Math.min(10, n)) });
                }}
                keyboardType="numbers-and-punctuation"
                style={styles.solverInput}
              />
              <Text style={type.h2}>° altitude</Text>
            </View>
            <Text style={[type.small, { marginTop: 14 }]}>Version 1.0 · no account, no tracking, no network.</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = {
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: 16, marginBottom: 12 },
  paneRow: { flexDirection: 'row' },
  brand: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  headerGlyph: { fontSize: 17, color: colors.ink },
  link: { fontSize: 14, fontWeight: '700', color: colors.sun },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, backgroundColor: colors.bg, borderRadius: 12, padding: 6 },
  navBtn: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center' },
  navGlyph: { fontSize: 20, fontWeight: '700', color: colors.ink },
  navLabel: { fontSize: 13, fontWeight: '700', color: colors.ink },
  twoUp: { flexDirection: 'row', alignItems: 'flex-start' },
  timeLabel: { fontSize: 12, fontWeight: '700', color: colors.sub, letterSpacing: 0.4 },
  nextBox: { marginTop: 14, backgroundColor: colors.sunSoft, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  nextType: { fontSize: 11, fontWeight: '800', color: colors.sun, letterSpacing: 0.6 },
  nextTime: { fontSize: 18, fontWeight: '800', color: colors.ink },
  nextMeta: { fontSize: 12, color: colors.sub },
  legend: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5, marginLeft: 10 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  tableBar: { width: 3, height: 16, borderRadius: 2, marginRight: 8 },
  tableLabel: { width: 120, fontSize: 13, fontWeight: '600', color: colors.ink },
  tableValue: { flex: 1, fontSize: 13, color: colors.sub },
  heightRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  heightInput: { width: 70, height: 36, marginHorizontal: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, fontSize: 15, color: colors.ink },
  segRow: { flexDirection: 'row', marginTop: 10, backgroundColor: colors.bg, borderRadius: 12, padding: 4 },
  seg: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segActive: { backgroundColor: colors.card },
  segText: { fontSize: 13, fontWeight: '600', color: colors.sub },
  segTextActive: { color: colors.ink, fontWeight: '800' },
  solverRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  solverInput: { width: 72, height: 40, marginRight: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, fontSize: 16, color: colors.ink },
  primaryBtn: { marginTop: 12, backgroundColor: colors.sun, borderRadius: 12, paddingVertical: 12, alignItems: 'center', flex: 1, marginLeft: 8 },
  primaryBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  primaryBtnFull: { marginTop: 12, backgroundColor: colors.sun, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  ghostBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
  ghostBtnText: { fontSize: 13, fontWeight: '700', color: colors.sub },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(43,33,24,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30, maxHeight: '92%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  input: { marginTop: 8, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, height: 44, fontSize: 15, color: colors.ink },
  stationRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  stationName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  currentTag: { fontSize: 10, fontWeight: '800', color: colors.sun, letterSpacing: 0.6 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  settingLabel: { fontSize: 14, color: colors.ink },
};
