import { Image, StyleSheet, Text, View } from 'react-native';

// Metro requires a static asset reference; these are the approved bundled pixels.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NATIVE_LOADING_MARK = require('../../assets/images/shado-round-mark.png');

export function NativeLaunchLoader({ stage, progress }: { stage: string; progress?: number }) {
  const measured = typeof progress === 'number' && Number.isFinite(progress)
    ? Math.max(0, Math.min(1, progress)) : undefined;
  const percentage = measured === undefined ? undefined : Math.round(measured * 100);

  return (
    <View style={styles.panel}>
      <Image source={NATIVE_LOADING_MARK} style={styles.mark} accessible={false} />
      <Text style={styles.brand}>ShadoChat</Text>
      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={stage}
        accessibilityValue={percentage === undefined
          ? { text: 'Preparing' }
          : { min: 0, max: 100, now: percentage, text: `${percentage}% of community page loaded` }}
      >
        {/* Unknown work stays indeterminate. No timers, decorative motion, or invented percentage. */}
        <View style={[styles.fill, measured === undefined
          ? styles.indeterminate : { width: `${measured * 100}%` }]} />
      </View>
      <Text style={styles.stage}>{stage}{percentage === undefined ? '' : ` · ${percentage}%`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: '#0d0f10' },
  mark: { width: 96, height: 96 },
  brand: { color: '#f1f0ea', fontSize: 26, fontWeight: '600', letterSpacing: 0.4 },
  track: { width: 200, maxWidth: '100%', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: '#34332d' },
  fill: { height: '100%', backgroundColor: '#E9C766' },
  indeterminate: { width: '25%', alignSelf: 'center' },
  stage: { color: '#C4BBA6', fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
});
