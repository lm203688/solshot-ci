// Solshot theme — warm paper palette: sunlight on cream, deep umber ink.
export const colors = {
  bg: '#FBF6EF',
  card: '#FFFFFF',
  ink: '#2B2118',
  sub: '#7A6A5A',
  line: '#EADFD1',
  sun: '#D97706', // amber-600: sunrise / sun arc
  sunSoft: '#FDF1DE',
  night: '#3F3A56', // twilight violet for nautical/astronomical rows
  nightSoft: '#EEEBFA',
  sky: '#0E7490', // horizon / compass marks
  skySoft: '#E3F4F8',
  danger: '#B42318',
  ok: '#15803D',
};

export const radius = { card: 18, pill: 999, chip: 12 };

export const type = {
  hero: { fontSize: 40, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  h1: { fontSize: 22, fontWeight: '700', color: colors.ink },
  h2: { fontSize: 17, fontWeight: '700', color: colors.ink },
  body: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  small: { fontSize: 12, color: colors.sub, lineHeight: 17 },
  label: { fontSize: 11, fontWeight: '700', color: colors.sub, letterSpacing: 0.8, textTransform: 'uppercase' },
  mono: { fontSize: 13, color: colors.ink, fontVariant: ['tabular-nums'] },
};

export const shadow = {
  shadowColor: '#3B2A1B',
  shadowOpacity: 0.07,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
