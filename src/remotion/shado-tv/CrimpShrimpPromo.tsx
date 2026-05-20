import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

type PromoVariant = 'trailer' | 'featurette'

type CrimpShrimpPromoProps = {
  variant: PromoVariant
}

type SceneProps = {
  start: number
  duration: number
  children: React.ReactNode
}

const assets = {
  hero: 'entertainment/shado-tv/crimp-shrimp/series-hub-hero.webp',
  cover: 'entertainment/shado-tv/crimp-shrimp/episode-1-cover.webp',
  countdown: 'entertainment/shado-tv/crimp-shrimp/status-coming-soon-bg.webp',
  frame: 'entertainment/shado-tv/crimp-shrimp/featured-episode-frame.webp',
  marquee: 'entertainment/shado-tv/marquee-frame.webp',
  header: 'entertainment/shado-tv/header-banner.webp',
}

const palette = {
  black: '#050503',
  ink: '#11100c',
  rust: '#b94728',
  deepRust: '#762615',
  gold: '#d7aa46',
  parchment: '#ddc7a1',
  bone: '#f0dfc7',
  muted: '#9e8b72',
}

const easeOut = Easing.bezier(0.16, 1, 0.3, 1)

const full = {
  width: '100%',
  height: '100%',
} satisfies React.CSSProperties

const backgroundBase: React.CSSProperties = {
  ...full,
  backgroundColor: palette.black,
  color: palette.bone,
  fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", Arial, sans-serif',
  overflow: 'hidden',
}

const letterbox: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  height: 72,
  background: 'linear-gradient(180deg, rgba(0,0,0,0.96), rgba(0,0,0,0.8))',
  zIndex: 30,
}

const subtleGrain = (opacity = 0.16): React.CSSProperties => ({
  position: 'absolute',
  inset: 0,
  opacity,
  backgroundImage: [
    'radial-gradient(circle at 16% 20%, rgba(255,222,162,0.16) 0 1px, transparent 1px)',
    'radial-gradient(circle at 76% 66%, rgba(255,255,255,0.12) 0 1px, transparent 1px)',
    'linear-gradient(115deg, rgba(255,255,255,0.04), transparent 36%, rgba(255,255,255,0.03) 62%, transparent)',
  ].join(','),
  backgroundSize: '7px 7px, 11px 11px, 100% 100%',
  mixBlendMode: 'screen',
})

function easeValue(frame: number, fps: number, start: number, end: number, outStart = 0, outEnd = 1) {
  return interpolate(frame, [start * fps, end * fps], [outStart, outEnd], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  })
}

function Scene({ start, duration, children }: SceneProps) {
  return (
    <Sequence from={start} durationInFrames={duration}>
      {children}
    </Sequence>
  )
}

function FilmShell({ children }: { children: React.ReactNode }) {
  return (
    <AbsoluteFill style={backgroundBase}>
      {children}
      <div style={{ ...letterbox, top: 0 }} />
      <div style={{ ...letterbox, bottom: 0, transform: 'rotate(180deg)' }} />
      <div style={subtleGrain()} />
      <div
        style={{
          position: 'absolute',
          inset: 24,
          border: `3px solid rgba(215,170,70,0.18)`,
          boxShadow: 'inset 0 0 90px rgba(0,0,0,0.94), 0 0 0 1px rgba(185,71,40,0.18)',
          zIndex: 35,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  )
}

function KenBurnsImage({
  src,
  startScale = 1.08,
  endScale = 1.18,
  opacity = 1,
  objectPosition = 'center',
}: {
  src: string
  startScale?: number
  endScale?: number
  opacity?: number
  objectPosition?: string
}) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const scale = interpolate(frame, [0, durationInFrames], [startScale, endScale], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <Img
      src={staticFile(src)}
      style={{
        ...full,
        objectFit: 'cover',
        objectPosition,
        opacity,
        transform: `scale(${scale})`,
      }}
    />
  )
}

function TitleText({
  kicker,
  title,
  subtitle,
  align = 'left',
  delay = 0,
}: {
  kicker?: string
  title: string
  subtitle?: string
  align?: 'left' | 'center'
  delay?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = easeValue(frame, fps, delay, delay + 1.2)
  const x = align === 'left' ? interpolate(enter, [0, 1], [-52, 0]) : 0

  return (
    <div
      style={{
        position: 'absolute',
        left: align === 'left' ? 140 : 0,
        right: align === 'left' ? 760 : 0,
        top: align === 'left' ? 246 : 250,
        textAlign: align,
        opacity: enter,
        transform: `translateX(${x}px)`,
        zIndex: 10,
      }}
    >
      {kicker && (
        <div
          style={{
            color: palette.gold,
            fontSize: 34,
            letterSpacing: 16,
            textTransform: 'uppercase',
            marginBottom: 26,
          }}
        >
          {kicker}
        </div>
      )}
      <div
        style={{
          color: palette.rust,
          fontSize: align === 'center' ? 132 : 120,
          lineHeight: 0.86,
          letterSpacing: 2,
          textTransform: 'uppercase',
          textShadow: '0 12px 38px rgba(0,0,0,0.94)',
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            marginTop: 30,
            color: palette.bone,
            fontFamily: 'Arial, sans-serif',
            fontWeight: 800,
            fontSize: 34,
            lineHeight: 1.35,
            letterSpacing: 0,
            textShadow: '0 8px 28px rgba(0,0,0,0.96)',
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  )
}

function PosterStack({ delay = 0 }: { delay?: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const entrance = spring({ frame: frame - delay * fps, fps, config: { damping: 20, stiffness: 74 } })
  const rotate = interpolate(entrance, [0, 1], [8, -2])
  const y = interpolate(entrance, [0, 1], [110, 0])

  return (
    <div
      style={{
        position: 'absolute',
        right: 158,
        top: 108,
        width: 560,
        height: 842,
        zIndex: 14,
        opacity: entrance,
        transform: `translateY(${y}px) rotate(${rotate}deg)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: -18,
          background: `linear-gradient(145deg, ${palette.gold}, ${palette.deepRust})`,
          filter: 'blur(28px)',
          opacity: 0.42,
        }}
      />
      <Img
        src={staticFile(assets.cover)}
        style={{
          ...full,
          objectFit: 'cover',
          objectPosition: 'top',
          border: `5px solid rgba(221,199,161,0.74)`,
          boxShadow: '0 34px 86px rgba(0,0,0,0.76)',
          filter: 'brightness(1.08) contrast(1.08) saturate(1.05)',
        }}
      />
    </div>
  )
}

function ParchmentCard({
  children,
  left,
  top,
  width,
  delay,
}: {
  children: React.ReactNode
  left: number
  top: number
  width: number
  delay: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = easeValue(frame, fps, delay, delay + 0.8)
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        padding: '34px 42px',
        color: palette.ink,
        background: 'linear-gradient(145deg, rgba(221,199,161,0.98), rgba(158,121,74,0.9))',
        border: '3px solid rgba(255,236,191,0.52)',
        boxShadow: '0 22px 58px rgba(0,0,0,0.58)',
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [42, 0])}px) rotate(${interpolate(enter, [0, 1], [2, -1])}deg)`,
        zIndex: 12,
      }}
    >
      {children}
    </div>
  )
}

function CountdownNumbers({ delay = 0 }: { delay?: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = easeValue(frame, fps, delay, delay + 1)
  return (
    <div
      style={{
        position: 'absolute',
        left: 158,
        right: 158,
        bottom: 160,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 18,
        opacity: enter,
        zIndex: 20,
      }}
    >
      {[
        ['06', 'days'],
        ['23', 'hrs'],
        ['59', 'mins'],
        ['59', 'secs'],
      ].map(([value, label]) => (
        <div
          key={label}
          style={{
            textAlign: 'center',
            padding: '24px 16px',
            background: 'rgba(0,0,0,0.42)',
            border: '2px solid rgba(215,170,70,0.28)',
          }}
        >
          <div style={{ color: palette.rust, fontSize: 74, lineHeight: 0.9 }}>{value}</div>
          <div style={{ marginTop: 10, color: palette.parchment, fontSize: 24, letterSpacing: 9, textTransform: 'uppercase' }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

function FooterBug({ text }: { text: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 78,
        right: 78,
        bottom: 22,
        zIndex: 38,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: palette.muted,
        fontFamily: 'Arial, sans-serif',
        fontSize: 18,
        fontWeight: 800,
        letterSpacing: 5,
        textTransform: 'uppercase',
      }}
    >
      <span>Polder Films</span>
      <span>{text}</span>
      <span>Shado TV</span>
    </div>
  )
}

function TrailerTimeline() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <FilmShell>
      <Scene start={0} duration={fps * 6}>
        <AbsoluteFill>
          <KenBurnsImage src={assets.hero} startScale={1.1} endScale={1.2} opacity={0.82} objectPosition="42% center" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.36), rgba(0,0,0,0.9))' }} />
          <TitleText kicker="Polder Films Presents" title="The Crimp & Shrimp Show" subtitle="A rustic family comedy about two tiny thieves with a plan too big for their boots." delay={0.4} />
        </AbsoluteFill>
      </Scene>

      <Scene start={fps * 5} duration={fps * 8}>
        <AbsoluteFill>
          <KenBurnsImage src={assets.frame} startScale={1.02} endScale={1.1} opacity={0.72} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.84), rgba(0,0,0,0.3), rgba(0,0,0,0.92))' }} />
          <PosterStack delay={0.25} />
          <ParchmentCard left={128} top={190} width={700} delay={0.8}>
            <div style={{ fontSize: 48, lineHeight: 1.02, textTransform: 'uppercase', color: palette.deepRust }}>Two little criminals.</div>
            <div style={{ marginTop: 14, fontFamily: 'Arial, sans-serif', fontSize: 30, lineHeight: 1.32, fontWeight: 900 }}>
              One nervous chicken. A woods full of bad decisions.
            </div>
          </ParchmentCard>
        </AbsoluteFill>
      </Scene>

      <Scene start={fps * 12} duration={fps * 10}>
        <AbsoluteFill>
          <KenBurnsImage src={assets.countdown} startScale={1.05} endScale={1.13} opacity={0.9} />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, rgba(0,0,0,0.05), rgba(0,0,0,0.76))' }} />
          <TitleText kicker="Episode 1" title="The Chicken Snatchers" subtitle="The first caper starts with a simple snatch and ends with more trouble than anyone bargained for." align="center" delay={0.8} />
        </AbsoluteFill>
      </Scene>

      <Scene start={fps * 21} duration={fps * 9}>
        <AbsoluteFill>
          <KenBurnsImage src={assets.hero} startScale={1.18} endScale={1.26} opacity={0.72} objectPosition="58% center" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.32), rgba(0,0,0,0.92))' }} />
          <div style={{ position: 'absolute', left: 150, top: 188, width: 760, zIndex: 12 }}>
            {['old-school trouble', 'family comedy', 'coming soon'].map((line, index) => {
              const enter = easeValue(frame, fps, index * 0.45 + 0.5, index * 0.45 + 1.2)
              return (
                <div
                  key={line}
                  style={{
                    marginBottom: 34,
                    color: index === 1 ? palette.gold : palette.rust,
                    fontSize: index === 1 ? 74 : 94,
                    letterSpacing: index === 1 ? 12 : 2,
                    lineHeight: 0.9,
                    textTransform: 'uppercase',
                    opacity: enter,
                    transform: `translateX(${interpolate(enter, [0, 1], [-70, 0])}px)`,
                    textShadow: '0 12px 34px rgba(0,0,0,0.9)',
                  }}
                >
                  {line}
                </div>
              )
            })}
          </div>
          <PosterStack delay={1.3} />
        </AbsoluteFill>
      </Scene>

      <Scene start={fps * 29} duration={fps * 11}>
        <AbsoluteFill>
          <KenBurnsImage src={assets.cover} startScale={1.04} endScale={1.12} opacity={0.78} objectPosition="center 22%" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.88), rgba(0,0,0,0.4), rgba(0,0,0,0.88))' }} />
          <TitleText kicker="Premiere Event" title="The Chicken Snatchers" subtitle="Watch the countdown. Catch the premiere. Stream it after launch on Shado TV." align="center" delay={0.3} />
          <CountdownNumbers delay={4.4} />
        </AbsoluteFill>
      </Scene>
      <FooterBug text="Official trailer" />
    </FilmShell>
  )
}

function FeaturetteTimeline() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const chapterStyle: React.CSSProperties = {
    color: palette.gold,
    fontSize: 30,
    letterSpacing: 12,
    textTransform: 'uppercase',
  }

  return (
    <FilmShell>
      <Scene start={0} duration={fps * 14}>
        <AbsoluteFill>
          <KenBurnsImage src={assets.hero} startScale={1.08} endScale={1.17} opacity={0.84} objectPosition="42% center" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.25), rgba(0,0,0,0.88))' }} />
          <TitleText kicker="Launch Featurette" title="Meet Crimp & Shrimp" subtitle="A first look at the family comedy series arriving on Shado TV." delay={0.7} />
          <PosterStack delay={2.5} />
        </AbsoluteFill>
      </Scene>

      <Scene start={fps * 13} duration={fps * 16}>
        <AbsoluteFill>
          <KenBurnsImage src={assets.frame} startScale={1.08} endScale={1.16} opacity={0.76} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.9))' }} />
          <ParchmentCard left={122} top={176} width={770} delay={0.4}>
            <div style={chapterStyle}>Chapter 1 / The plan</div>
            <div style={{ marginTop: 24, color: palette.deepRust, fontSize: 68, lineHeight: 0.94, textTransform: 'uppercase' }}>Start small.</div>
            <div style={{ marginTop: 10, color: palette.deepRust, fontSize: 68, lineHeight: 0.94, textTransform: 'uppercase' }}>Run fast.</div>
            <div style={{ marginTop: 22, fontFamily: 'Arial, sans-serif', fontSize: 29, lineHeight: 1.36, fontWeight: 900 }}>
              Crimp and Shrimp think a chicken snatch is easy work. The woods disagree.
            </div>
          </ParchmentCard>
          <PosterStack delay={1.5} />
        </AbsoluteFill>
      </Scene>

      <Scene start={fps * 28} duration={fps * 16}>
        <AbsoluteFill>
          <KenBurnsImage src={assets.cover} startScale={1.03} endScale={1.12} opacity={0.76} objectPosition="center 18%" />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 66% 32%, rgba(0,0,0,0.06), rgba(0,0,0,0.88))' }} />
          <ParchmentCard left={990} top={160} width={700} delay={0.7}>
            <div style={chapterStyle}>Chapter 2 / The trouble</div>
            <div style={{ marginTop: 22, color: palette.deepRust, fontSize: 64, lineHeight: 0.98, textTransform: 'uppercase' }}>Every shortcut has a witness.</div>
            <div style={{ marginTop: 22, fontFamily: 'Arial, sans-serif', fontSize: 30, lineHeight: 1.36, fontWeight: 900 }}>
              A flashlight, a pile of junk, and one suspicious bird turn a tiny job into a full caper.
            </div>
          </ParchmentCard>
        </AbsoluteFill>
      </Scene>

      <Scene start={fps * 43} duration={fps * 16}>
        <AbsoluteFill>
          <KenBurnsImage src={assets.countdown} startScale={1.04} endScale={1.11} opacity={0.96} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.76))' }} />
          <TitleText kicker="Premiere mode" title="Everyone watches together" subtitle="The stream starts from the same timestamp for the whole audience, then becomes available after launch." align="center" delay={0.5} />
          <CountdownNumbers delay={5} />
        </AbsoluteFill>
      </Scene>

      <Scene start={fps * 58} duration={fps * 16}>
        <AbsoluteFill>
          <KenBurnsImage src={assets.hero} startScale={1.18} endScale={1.24} opacity={0.8} objectPosition="54% center" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.9), rgba(0,0,0,0.24), rgba(0,0,0,0.92))' }} />
          <div style={{ position: 'absolute', left: 142, top: 188, right: 142, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 28, zIndex: 13 }}>
            {[
              ['Cast', 'Alyssa Polder as Crimp'],
              ['Cast', 'Lindyann Polder as Shrimp'],
              ['Episode 1', 'The Chicken Snatchers'],
            ].map(([label, body], index) => {
              const enter = easeValue(frame, fps, 0.6 + index * 0.5, 1.5 + index * 0.5)
              return (
                <div
                  key={body}
                  style={{
                    minHeight: 420,
                    padding: 34,
                    background: 'rgba(0,0,0,0.58)',
                    border: '2px solid rgba(215,170,70,0.28)',
                    boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
                    opacity: enter,
                    transform: `translateY(${interpolate(enter, [0, 1], [54, 0])}px)`,
                  }}
                >
                  <div style={chapterStyle}>{label}</div>
                  <div style={{ marginTop: 118, color: index === 2 ? palette.rust : palette.bone, fontSize: 58, lineHeight: 1, textTransform: 'uppercase' }}>{body}</div>
                </div>
              )
            })}
          </div>
        </AbsoluteFill>
      </Scene>

      <Scene start={fps * 73} duration={fps * 23}>
        <AbsoluteFill>
          <KenBurnsImage src={assets.cover} startScale={1.05} endScale={1.16} opacity={0.82} objectPosition="center 16%" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.9), rgba(0,0,0,0.22), rgba(0,0,0,0.9))' }} />
          <TitleText kicker="Coming to Shado TV" title="The Chicken Snatchers" subtitle="Trailer first. Premiere next. Now streaming after launch." align="center" delay={0.5} />
          <div
            style={{
              position: 'absolute',
              left: 320,
              right: 320,
              bottom: 190,
              display: 'flex',
              justifyContent: 'space-between',
              color: palette.parchment,
              fontFamily: 'Arial, sans-serif',
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: 5,
              textTransform: 'uppercase',
              zIndex: 20,
              opacity: easeValue(frame, fps, 5, 6),
            }}
          >
            <span>Trailer</span>
            <span>Premiere</span>
            <span>Now streaming</span>
          </div>
        </AbsoluteFill>
      </Scene>
      <FooterBug text="Launch featurette" />
    </FilmShell>
  )
}

export function CrimpShrimpPromo({ variant }: CrimpShrimpPromoProps) {
  return variant === 'featurette' ? <FeaturetteTimeline /> : <TrailerTimeline />
}
