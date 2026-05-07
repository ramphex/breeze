import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import {
  fontFamily,
  palette,
  radii,
  spacing,
  type,
  useApprovalTheme,
} from '../../theme';
import { duration, ease, haptic } from '../../lib/motion';

interface Props {
  onComplete: () => void;
}

const PAGE_COUNT = 3;

export function OnboardingScreen({ onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const theme = useApprovalTheme('dark');
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const { width } = Dimensions.get('window');

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(PAGE_COUNT - 1, index));
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    haptic.tap();
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  }

  function finish() {
    haptic.approve();
    onComplete();
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg0 }}>
      <View
        style={{
          position: 'absolute',
          top: insets.top + spacing[3],
          right: spacing[5],
          zIndex: 10,
        }}
      >
        <Pressable onPress={finish} hitSlop={12} accessibilityLabel="Skip onboarding">
          <Text style={[type.metaCaps, { color: theme.textMd }]}>SKIP</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
      >
        <Page width={width}>
          <ApprovalPreview />
          <Copy
            eyebrow="APPROVALS COME TO YOU"
            headline="Approve in one tap."
            body="When the AI agent or your team needs your sign-off, your phone buzzes. Read what's being asked, approve or deny."
          />
        </Page>

        <Page width={width}>
          <ChatPreview />
          <Copy
            eyebrow="ASK THE FLEET"
            headline="Your fleet, in one chat."
            body="Ask Breeze about your devices, alerts, or recent activity. The AI runs the queries and shows you the answer inline."
          />
        </Page>

        <Page width={width}>
          <SystemsPreview />
          <Copy
            eyebrow="STAY GROUNDED"
            headline="Health at a glance."
            body="The Systems tab shows your fleet's status, active issues, and what just happened. Pull to refresh, pushes update silently."
          />
        </Page>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: insets.bottom + spacing[5],
          paddingHorizontal: spacing[6],
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: spacing[2],
            marginBottom: spacing[6],
          }}
        >
          {Array.from({ length: PAGE_COUNT }).map((_, i) => (
            <Dot key={i} active={i === page} onPress={() => goTo(i)} />
          ))}
        </View>

        {page === PAGE_COUNT - 1 ? (
          <Pressable
            onPress={finish}
            accessibilityLabel="Get started"
            style={({ pressed }) => ({
              backgroundColor: pressed ? palette.brand.deep : palette.brand.base,
              borderRadius: radii.lg,
              paddingVertical: spacing[5],
              alignItems: 'center',
            })}
          >
            <Text
              style={[
                type.bodyMd,
                { color: palette.dark.textHi, letterSpacing: 0.2 },
              ]}
            >
              Get started
            </Text>
          </Pressable>
        ) : (
          // Reserve the same vertical space the button would occupy so dots
          // don't jump when the last page swaps the CTA in.
          <View style={{ height: 24 + spacing[5] * 2 }} />
        )}
      </View>
    </View>
  );
}

function Page({ width, children }: { width: number; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        width,
        flex: 1,
        paddingTop: insets.top + spacing[12],
        paddingBottom: insets.bottom + spacing[20] + spacing[10],
        paddingHorizontal: spacing[6],
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}

function Copy({
  eyebrow,
  headline,
  body,
}: {
  eyebrow: string;
  headline: string;
  body: string;
}) {
  const theme = useApprovalTheme('dark');
  return (
    <View style={{ marginTop: spacing[10] }}>
      <Text style={[type.metaCaps, { color: palette.brand.soft }]}>{eyebrow}</Text>
      <Text
        style={[
          type.display,
          { color: theme.textHi, marginTop: spacing[3] },
        ]}
      >
        {headline}
      </Text>
      <Text
        style={[
          type.bodyLg,
          { color: theme.textMd, marginTop: spacing[3] },
        ]}
      >
        {body}
      </Text>
    </View>
  );
}

function Dot({ active, onPress }: { active: boolean; onPress: () => void }) {
  // Reanimated width + color transition so the active dot grows and tints
  // brand-teal. Inactive dots stay compact and Surface-3.
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: duration.base,
      easing: ease,
    });
  }, [active]);

  const style = useAnimatedStyle(() => {
    const w = 6 + progress.value * 18;
    return {
      width: w,
    };
  });

  return (
    <Pressable onPress={onPress} hitSlop={12}>
      <Animated.View
        style={[
          {
            height: 6,
            borderRadius: radii.full,
            backgroundColor: active ? palette.brand.base : palette.dark.bg3,
          },
          style,
        ]}
      />
    </Pressable>
  );
}

// --- Stylized previews ---------------------------------------------------

function ApprovalPreview() {
  const theme = useApprovalTheme('dark');
  return (
    <View
      style={{
        backgroundColor: theme.bg1,
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: theme.border,
        padding: spacing[5],
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <StaticRing />
        <View
          style={{
            paddingHorizontal: spacing[3],
            paddingVertical: spacing[1],
            borderRadius: radii.full,
            backgroundColor: palette.warning.base,
          }}
        >
          <Text style={[type.metaCaps, { color: palette.warning.onBase }]}>
            MEDIUM RISK
          </Text>
        </View>
      </View>

      <Text
        style={[
          type.title,
          { color: theme.textHi, marginTop: spacing[5] },
        ]}
      >
        Restart the print server.
      </Text>
      <Text
        style={[type.meta, { color: theme.textMd, marginTop: spacing[2] }]}
      >
        Requested by Claude · 8s ago
      </Text>

      <View
        style={{
          marginTop: spacing[5],
          borderTopWidth: 1,
          borderTopColor: theme.border,
          paddingTop: spacing[4],
          flexDirection: 'row',
          gap: spacing[3],
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: theme.bg2,
            borderRadius: radii.lg,
            paddingVertical: spacing[4],
            alignItems: 'center',
          }}
        >
          <Text style={[type.bodyMd, { color: theme.textHi }]}>Deny</Text>
        </View>
        <View
          style={{
            flex: 1.4,
            backgroundColor: palette.approve.base,
            borderRadius: radii.lg,
            paddingVertical: spacing[4],
            alignItems: 'center',
          }}
        >
          <Text style={[type.bodyMd, { color: palette.approve.onBase }]}>
            Approve
          </Text>
        </View>
      </View>
    </View>
  );
}

function StaticRing() {
  // Static visual analogue of the CountdownRing on ApprovalScreen — same
  // geometry, fixed at ~70% remaining so the brand arc reads as confident.
  const size = 56;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const remaining = 0.7;
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={palette.dark.bg3}
        strokeWidth={stroke}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={palette.brand.base}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - remaining)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

function ChatPreview() {
  const theme = useApprovalTheme('dark');
  return (
    <View style={{ gap: spacing[3] }}>
      <View
        style={{
          alignSelf: 'flex-end',
          maxWidth: '80%',
          backgroundColor: palette.brand.deep,
          borderRadius: radii.lg,
          paddingVertical: spacing[3],
          paddingHorizontal: spacing[4],
        }}
      >
        <Text style={[type.body, { color: palette.dark.textHi }]}>
          Any Windows servers offline this morning?
        </Text>
      </View>

      <View
        style={{
          alignSelf: 'flex-start',
          maxWidth: '85%',
          backgroundColor: theme.bg1,
          borderRadius: radii.lg,
          paddingVertical: spacing[3],
          paddingHorizontal: spacing[4],
          borderWidth: 1,
          borderColor: theme.border,
        }}
      >
        <Text
          style={[
            type.metaCaps,
            { color: palette.brand.soft, marginBottom: spacing[1] },
          ]}
        >
          BREEZE
        </Text>
        <Text style={[type.body, { color: theme.textHi }]}>
          Two servers stopped checking in. PRINT-01 since 06:42, BACKUP-03 since
          07:14.
        </Text>
        <View
          style={{
            marginTop: spacing[3],
            backgroundColor: theme.bg2,
            borderRadius: radii.md,
            padding: spacing[3],
          }}
        >
          <Text
            style={[
              { fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 },
              { color: theme.textMd },
            ]}
          >
            list_devices · status=offline
          </Text>
        </View>
      </View>

      <View
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          gap: 6,
          paddingVertical: spacing[2],
          paddingHorizontal: spacing[3],
        }}
      >
        <Pulse delay={0} />
        <Pulse delay={120} />
        <Pulse delay={240} />
      </View>
    </View>
  );
}

function Pulse({ delay }: { delay: number }) {
  // A staggered fade-in gives the chat preview a "thinking" feel without
  // ever spelling the word. One-shot timing on mount — Reanimated cleans
  // up the shared value when this component unmounts.
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    const id = setTimeout(() => {
      opacity.value = withTiming(1, { duration: 600, easing: ease });
    }, delay);
    return () => clearTimeout(id);
  }, [delay]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 6,
          height: 6,
          borderRadius: radii.full,
          backgroundColor: palette.brand.soft,
        },
        style,
      ]}
    />
  );
}

function SystemsPreview() {
  const theme = useApprovalTheme('dark');
  return (
    <View
      style={{
        backgroundColor: theme.bg1,
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: theme.border,
        padding: spacing[5],
      }}
    >
      <Text style={[type.metaCaps, { color: theme.textMd }]}>FLEET HEALTH</Text>
      <Text
        style={[
          type.title,
          { color: theme.textHi, marginTop: spacing[2] },
        ]}
      >
        118 of 124 healthy.
      </Text>

      <View
        style={{
          marginTop: spacing[4],
          height: 6,
          flexDirection: 'row',
          borderRadius: radii.full,
          overflow: 'hidden',
          backgroundColor: theme.bg3,
        }}
      >
        <View style={{ flex: 118, backgroundColor: palette.approve.base }} />
        <View style={{ flex: 4, backgroundColor: palette.warning.base }} />
        <View style={{ flex: 2, backgroundColor: palette.deny.base }} />
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: spacing[3],
        }}
      >
        <Legend color={palette.approve.base} label="118 healthy" />
        <Legend color={palette.warning.base} label="4 warning" />
        <Legend color={palette.deny.base} label="2 critical" />
      </View>

      <View
        style={{
          marginTop: spacing[5],
          paddingTop: spacing[4],
          borderTopWidth: 1,
          borderTopColor: theme.border,
        }}
      >
        <Row label="Active alerts" value="6" tone={theme.textHi} />
        <Row label="Pending patches" value="42" tone={theme.textMd} />
        <Row label="Last sync" value="2m ago" tone={theme.textMd} />
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const theme = useApprovalTheme('dark');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: radii.full,
          backgroundColor: color,
        }}
      />
      <Text style={[type.meta, { color: theme.textMd }]}>{label}</Text>
    </View>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  const theme = useApprovalTheme('dark');
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing[2],
      }}
    >
      <Text style={[type.body, { color: theme.textMd }]}>{label}</Text>
      <Text style={[type.bodyMd, { color: tone }]}>{value}</Text>
    </View>
  );
}
