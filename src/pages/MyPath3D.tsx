import { Billboard, Html, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import BottomNav from '../components/BottomNav'
import { db, hasContent, type Meditation, type Sermon } from '../db'
import { makeFaceCanvas, type AvatarGender } from '../lib/avatar'
import { useProfile } from '../lib/profile'
import { useSermons } from '../lib/sermons'
import { WEEKDAYS, fmtDate, parseDate } from '../lib/split'

type Walk = 'idle' | 'walking' | 'paused'
const STEP_Y = 1.25      // 정거장(주일)마다 오르는 높이
const SEG = 3.2          // 정거장 사이 길 길이(대략)

/* 3D 라벨(Html)을 React가 관리하지 않는 별도 레이어에 붙여 화면 전환 시 DOM 충돌 방지 */
const LabelLayer = createContext<RefObject<HTMLDivElement | null> | null>(null)
function Label(props: React.ComponentProps<typeof Html>) {
  const portal = useContext(LabelLayer)
  return <Html {...props} portal={(portal ?? undefined) as RefObject<HTMLElement> | undefined} />
}

/* ───────────── 산과 나선 산길 ───────────── */

/**
 * 원뿔 모양 산의 겉면을 감아 오르는 나선 길.
 * 점 0 = 등산로 입구(출발), 점 i+1 = i번째 주일 정거장. 설교가 늘수록 산이 커짐.
 */
function useMountain(count: number) {
  return useMemo(() => {
    const n = count + 1
    const H = (n - 1) * STEP_Y + 4.5                    // 산 높이 (정상은 마지막 정거장보다 위)
    const R0 = Math.max(8, Math.sqrt(n) * 3.2)          // 산 밑면 반지름
    const radiusAt = (y: number) => R0 * (1 - (y + 0.6) / H) + 0.75  // 산 겉면 + 길 폭
    let a = 0
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < n; i++) {
      const y = i * STEP_Y
      const r = radiusAt(y)
      if (i > 0) a += SEG / r
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r))
    }
    if (pts.length === 1) pts.push(pts[0].clone().add(new THREE.Vector3(0, 0.01, -0.5))) // 곡선은 점이 2개 이상 필요
    return { curve: new THREE.CatmullRomCurve3(pts), points: pts, H, R0 }
  }, [count])
}

/** CatmullRom 의 getPoint(t)는 t = i/(n-1) 에서 정확히 i번째 점을 지남 */
const tOf = (i: number, n: number) => (n <= 1 ? 0 : i / (n - 1))

function Mountain({ H, R0 }: { H: number; R0: number }) {
  return (
    <group>
      <mesh position={[0, H / 2 - 0.6, 0]}>
        <coneGeometry args={[R0, H, 64, 1, true]} />
        <meshStandardMaterial color="#a4c493" roughness={0.95} flatShading side={THREE.DoubleSide} />
      </mesh>
      {/* 눈 덮인 정상 */}
      <mesh position={[0, H - 0.6 - H * 0.09, 0]}>
        <coneGeometry args={[R0 * 0.18, H * 0.18, 48]} />
        <meshStandardMaterial color="#f6f8f3" roughness={0.6} />
      </mesh>
      {/* 정상의 십자가 */}
      <group position={[0, H - 0.6, 0]}>
        <mesh position={[0, 0.9, 0]}><boxGeometry args={[0.12, 1.8, 0.12]} /><meshStandardMaterial color="#e7964a" emissive="#e7964a" emissiveIntensity={0.5} /></mesh>
        <mesh position={[0, 1.3, 0]}><boxGeometry args={[0.9, 0.12, 0.12]} /><meshStandardMaterial color="#e7964a" emissive="#e7964a" emissiveIntensity={0.5} /></mesh>
      </group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.62, 0]}>
        <circleGeometry args={[R0 * 1.8, 64]} /><meshStandardMaterial color="#e3eedc" />
      </mesh>
    </group>
  )
}

/* 한 주 정거장: 발판 + 월~금 돌 5개 (묵상한 날은 빛남) */
function Station({ p, sermon, days, selected, onSelect, big }: {
  p: THREE.Vector3; sermon: Sermon; days: boolean[]; selected: boolean; onSelect: (s: Sermon) => void; big: boolean
}) {
  const outward = new THREE.Vector3(p.x, 0, p.z).normalize()
  const side = new THREE.Vector3(-outward.z, 0, outward.x)
  const count = days.filter(Boolean).length
  return (
    <group>
      <mesh position={p} onClick={(e) => { e.stopPropagation(); onSelect(sermon) }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <cylinderGeometry args={[0.85, 0.95, 0.2, 36]} />
        <meshStandardMaterial color={count ? '#44703a' : '#c7dcbb'} emissive={selected ? '#e7964a' : '#000'} emissiveIntensity={selected ? 0.4 : 0} />
      </mesh>
      {days.map((on, k) => {
        const off = (k - 2) * 0.42
        const pos = new THREE.Vector3(p.x + outward.x * 1.25 + side.x * off, p.y + 0.18, p.z + outward.z * 1.25 + side.z * off)
        return (
          <mesh key={k} position={pos}>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshStandardMaterial color={on ? '#f7c48b' : '#b9c0b5'} emissive={on ? '#e7964a' : '#000'} emissiveIntensity={on ? 0.9 : 0} />
          </mesh>
        )
      })}
      <Label position={[p.x + outward.x * 0.2, p.y - 0.55, p.z + outward.z * 0.2]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 font-semibold text-ink-700 shadow ${big ? 'text-[14px]' : 'text-[11px]'}`}>
          {fmtDate(parseDate(sermon.date))} · {sermon.title.length > 9 ? sermon.title.slice(0, 9) + '…' : sermon.title}
        </div>
      </Label>
    </group>
  )
}

/* ───────────── 아바타 ───────────── */

function useFaceTexture(photo: string | undefined, gender: AvatarGender) {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    let alive = true
    makeFaceCanvas({ photo, gender }).then((c) => {
      if (!alive) return
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      setTex(t)
    })
    return () => { alive = false }
  }, [photo, gender])
  return tex
}

function Limb({ x, y, len, r, color, swing, phase }: { x: number; y: number; len: number; r: number; color: string; swing: React.RefObject<number>; phase: number }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.x = Math.sin(clock.elapsedTime * 9 + phase) * 0.6 * (swing.current ?? 0) })
  return (
    <group ref={ref} position={[x, y, 0]}>
      <mesh position={[0, -len / 2, 0]}><capsuleGeometry args={[r, len - r * 2, 4, 12]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  )
}

function Avatar({ curve, n, homeIdx, walk, progress, photo, gender, name }: {
  curve: THREE.CatmullRomCurve3; n: number; homeIdx: number; walk: Walk
  progress: React.RefObject<number>; photo?: string; gender: AvatarGender; name: string
}) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const swing = useRef(0)
  const onPath = walk !== 'idle'
  const moving = walk === 'walking'
  const wasOnPath = useRef(onPath)
  const face = useFaceTexture(photo, gender)
  const female = gender === 'female'
  const outfit = female ? '#e7964a' : '#4f7fb6'
  const pants = female ? '#f6d9c0' : '#34405a'

  useFrame(({ clock, camera }) => {
    const g = root.current
    if (!g) return
    const t = onPath ? (progress.current ?? 0) : tOf(homeIdx, n)
    const p = curve.getPoint(t)
    const target = new THREE.Vector3(p.x, p.y + 0.12, p.z)
    const facing = moving ? curve.getTangent(t) : new THREE.Vector3(camera.position.x - p.x, 0, camera.position.z - p.z)
    const snap = onPath !== wasOnPath.current
    wasOnPath.current = onPath
    g.position.lerp(target, snap || onPath ? 1 : 0.12)
    const yaw = Math.atan2(facing.x, facing.z)
    g.rotation.y += Math.atan2(Math.sin(yaw - g.rotation.y), Math.cos(yaw - g.rotation.y)) * 0.15
    swing.current += ((moving ? 1 : 0) - swing.current) * 0.1
    if (body.current) body.current.position.y = Math.abs(Math.sin(clock.elapsedTime * 9)) * 0.06 * swing.current
  })

  return (
    <group ref={root} scale={0.75}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.38, 32]} /><meshBasicMaterial color="#26401f" transparent opacity={0.2} />
      </mesh>
      <group ref={body}>
        <Limb x={-0.11} y={0.58} len={0.58} r={0.075} color={pants} swing={swing} phase={0} />
        <Limb x={0.11} y={0.58} len={0.58} r={0.075} color={pants} swing={swing} phase={Math.PI} />
        {female ? (
          <>
            <mesh position={[0, 0.82, 0]}><coneGeometry args={[0.4, 0.62, 32]} /><meshStandardMaterial color={outfit} /></mesh>
            <mesh position={[0, 1.13, 0]}><cylinderGeometry args={[0.17, 0.2, 0.3, 24]} /><meshStandardMaterial color={outfit} /></mesh>
          </>
        ) : (
          <mesh position={[0, 0.9, 0]}><cylinderGeometry args={[0.25, 0.22, 0.66, 24]} /><meshStandardMaterial color={outfit} /></mesh>
        )}
        <Limb x={-0.29} y={1.2} len={0.5} r={0.06} color={female ? '#f6d9c0' : outfit} swing={swing} phase={Math.PI} />
        <Limb x={0.29} y={1.2} len={0.5} r={0.06} color={female ? '#f6d9c0' : outfit} swing={swing} phase={0} />
        <mesh position={[0, 1.33, 0]}><cylinderGeometry args={[0.07, 0.08, 0.12, 12]} /><meshStandardMaterial color="#f6d9c0" /></mesh>
        <Billboard position={[0, 1.72, 0]}>
          {face && <mesh><circleGeometry args={[0.4, 48]} /><meshBasicMaterial map={face} transparent toneMapped={false} /></mesh>}
        </Billboard>
        <Label position={[0, 2.3, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded-full bg-moss-700 px-2 py-0.5 text-[11px] font-bold text-white shadow">{name}</div>
        </Label>
      </group>
    </group>
  )
}

/* 전경 시점: 산 전체가 들어오도록 (세로 화면은 더 멀리) */
function overview(camera: THREE.Camera, controls: OrbitControlsImpl | null, H: number, R0: number, aspect: number) {
  const far = (aspect < 0.8 ? 1.6 : 1) * Math.max(R0 * 1.6, H * 0.95, 14)
  camera.position.set(far * 0.75, H * 0.55 + far * 0.25, far * 0.75)
  controls?.target.set(0, H * 0.38, 0)
  controls?.update()
}

function CameraRig({ walk, curve, n, endIdx, progress, H, R0, onStation, onDone }: {
  walk: Walk; curve: THREE.CatmullRomCurve3; n: number; endIdx: number; progress: React.RefObject<number>
  H: number; R0: number; onStation: (i: number | null) => void; onDone: () => void
}) {
  const { camera, size } = useThree()
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null
  const last = useRef<number | null>(null)
  const prev = useRef<Walk | null>(null)
  const aspect = size.width / size.height

  useEffect(() => {
    if (walk === 'idle' && prev.current !== 'idle') {
      progress.current = 0
      last.current = null
      onStation(null)
      overview(camera, controls, H, R0, aspect)
    }
    prev.current = walk
  }, [walk, controls, progress, onStation, camera, aspect, H, R0])

  const end = tOf(endIdx, n)
  useFrame((_, delta) => {
    if (walk !== 'walking') return
    // 한 주 구간을 약 2.2초에 오름
    const t = (progress.current = Math.min((progress.current ?? 0) + delta / (2.2 * Math.max(n - 1, 1)), end))
    const p = curve.getPoint(t)
    const ahead = curve.getPoint(Math.min(t + 0.02, 1))
    const outward = new THREE.Vector3(p.x, 0, p.z).normalize().multiplyScalar(5)
    camera.position.lerp(new THREE.Vector3(p.x + outward.x, p.y + 2.6, p.z + outward.z), 0.08)
    const look = new THREE.Vector3((p.x + ahead.x) / 2, p.y + 1, (p.z + ahead.z) / 2)
    controls?.target.copy(look)
    camera.lookAt(look)
    const idx = Math.round(t * (n - 1)) - 1 // 점 0은 등산로 입구
    if (idx !== last.current) { last.current = idx; onStation(idx >= 0 ? idx : null) }
    if (t >= end) onDone()
  })
  return null
}

function PathWorld({ sermons, meds, selected, onSelect, walk, onWalkDone, onStation, avatar, homeIdx, big }: {
  sermons: Sermon[]; meds: Meditation[]; selected?: Sermon; onSelect: (s?: Sermon) => void; walk: Walk; onWalkDone: () => void
  onStation: (i: number | null) => void; avatar: { name: string; gender: AvatarGender; photo?: string }; homeIdx: number; big: boolean
}) {
  const { curve, points, H, R0 } = useMountain(sermons.length)
  const n = sermons.length + 1
  const tube = useMemo(() => new THREE.TubeGeometry(curve, Math.max(60, n * 24), 0.22, 10, false), [curve, n])
  const progress = useRef(0)

  return (
    <>
      <Mountain H={H} R0={R0} />
      <mesh geometry={tube}><meshStandardMaterial color="#d9c3a0" roughness={0.9} /></mesh>
      <Label position={[points[0].x, points[0].y - 0.5, points[0].z]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded-full bg-moss-700/90 px-2 py-0.5 text-[11px] font-semibold text-white">🚩 출발</div>
      </Label>
      {sermons.map((s, i) => (
        <Station key={s.id} p={points[i + 1]} sermon={s} selected={selected?.id === s.id} onSelect={onSelect} big={big}
          days={WEEKDAYS.map((d) => hasContent(meds.find((m) => m.sermonId === s.id && m.weekday === d.key)))} />
      ))}
      <Avatar curve={curve} n={n} homeIdx={homeIdx + 1} walk={walk} progress={progress}
        photo={avatar.photo} gender={avatar.gender} name={avatar.name} />
      <CameraRig walk={walk} curve={curve} n={n} endIdx={homeIdx + 1} progress={progress} H={H} R0={R0} onStation={onStation} onDone={onWalkDone} />
    </>
  )
}

/* ───────────── 페이지 ───────────── */

export default function MyPath3D() {
  const labelRef = useRef<HTMLDivElement>(null)
  const profile = useProfile()
  const { sermons } = useSermons()
  const meds = useLiveQuery(() => db.meditations.toArray(), [], [] as Meditation[])
  const [selected, setSelected] = useState<Sermon | undefined>()
  const [walk, setWalk] = useState<Walk>('idle')
  const [station, setStation] = useState<number | null>(null)
  const [help, setHelp] = useState(true)
  const walking = walk === 'walking'
  const big = !!profile?.seniorMode

  // 아바타 위치 = 묵상 기록이 하루라도 있는 가장 최근 주 (-1 = 아직 출발 전)
  const homeIdx = sermons.reduce((acc, s, i) => (meds.some((m) => m.sermonId === s.id && hasContent(m)) ? i : acc), -1)
  const climbed = sermons.filter((s) => meds.some((m) => m.sermonId === s.id && hasContent(m))).length
  const selDays = selected ? WEEKDAYS.filter((d) => hasContent(meds.find((m) => m.sermonId === selected.id && m.weekday === d.key))) : []
  const select = (s?: Sermon) => { setSelected(s); if (s) setWalk((w) => (w === 'walking' ? 'paused' : w)) }

  return (
    <div className="flex h-dvh flex-col bg-gradient-to-b from-dawn-100 via-moss-50 to-moss-100">
      <header className="safe-top z-10 px-4 pb-2">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <h1 className="flex-1 font-serif text-lg font-bold">나의 길</h1>
          <span className="text-sm text-ink-700">⛰️ {climbed}주 묵상 · {sermons.length}개 정거장</span>
        </div>
      </header>

      <div className="relative flex-1">
        {sermons.length === 0 ? (
          <p className="p-10 text-center text-ink-500">아직 등록된 설교가 없어요. 설교가 올라오면 산길이 생겨요.</p>
        ) : (
          <>
            <Canvas camera={{ position: [24, 16, 24], fov: 50 }} dpr={[1, 2]} onPointerMissed={() => setSelected(undefined)}>
              <ambientLight intensity={0.8} />
              <directionalLight position={[10, 20, 8]} intensity={1.2} />
              <hemisphereLight args={['#fdeedd', '#a4c493', 0.5]} />
              <OrbitControls makeDefault enabled={!walking} enableDamping rotateSpeed={big ? 0.5 : 1}
                autoRotate={walk === 'idle' && !selected} autoRotateSpeed={0.4} minDistance={3} maxDistance={140} />
              <LabelLayer.Provider value={labelRef}>
                <PathWorld sermons={sermons} meds={meds} selected={selected} onSelect={select} walk={walk} big={big}
                  onWalkDone={() => setWalk('paused')} onStation={setStation} homeIdx={homeIdx}
                  avatar={{ name: profile?.name || '나', gender: profile?.avatarGender ?? 'female', photo: profile?.avatarPhoto }} />
              </LabelLayer.Provider>
            </Canvas>
            <div ref={labelRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden" />

            <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 gap-2">
              {walk === 'idle' && homeIdx >= 0 && (
                <button className="btn-primary whitespace-nowrap !px-5 !py-2 text-sm" onClick={() => { setSelected(undefined); setWalk('walking') }}>▶ 처음부터 올라 보기</button>
              )}
              {walk === 'walking' && <button className="btn-primary whitespace-nowrap !px-5 !py-2 text-sm" onClick={() => setWalk('paused')}>⏸ 잠깐 쉬기</button>}
              {walk === 'paused' && (
                <>
                  {station !== homeIdx && <button className="btn-primary whitespace-nowrap !px-4 !py-2 text-sm" onClick={() => { setSelected(undefined); setWalk('walking') }}>▶ 이어 오르기</button>}
                  <button className="btn-ghost whitespace-nowrap bg-white/90 !px-4 !py-2 text-sm" onClick={() => { setSelected(undefined); setWalk('idle') }}>■ 전체 보기</button>
                </>
              )}
            </div>

            {walk !== 'idle' && !selected && station !== null && sermons[station] && (
              <div className="pointer-events-none absolute inset-x-3 top-16 z-20 mx-auto max-w-sm rounded-2xl bg-white/90 px-4 py-2.5 text-center shadow-card">
                <p className="text-xs font-semibold text-moss-700">{fmtDate(parseDate(sermons[station].date))} 주일</p>
                <p className="mt-0.5 text-sm text-ink-700">{sermons[station].title} · {sermons[station].passage}</p>
              </div>
            )}

            {walk === 'idle' && !selected && help && (
              <div className="absolute inset-x-3 bottom-24 z-20 mx-auto max-w-md rounded-2xl bg-white/90 p-3 pr-8 text-[13px] leading-relaxed text-ink-700 shadow">
                <button className="absolute right-3 top-2 text-ink-500" aria-label="설명 닫기" onClick={() => setHelp(false)}>✕</button>
                <b>주일마다 정거장이 하나씩</b> 생기는 산길이에요. 정거장 옆 작은 돌 5개는 월~금이고,
                묵상한 날은 <span className="font-semibold text-dawn-700">빛나요</span>.
                아바타는 내가 묵상한 가장 최근 주까지 올라가 있어요.
                {homeIdx < 0 && <span className="mt-1 block font-semibold text-moss-700">아직 출발 전이에요. 오늘 묵상을 하면 첫 정거장으로 올라가요!</span>}
              </div>
            )}

            {selected && (
              <div className="absolute inset-x-3 bottom-24 z-20 mx-auto max-w-md rounded-3xl bg-white/95 p-4 shadow-card">
                <div className="flex items-center text-xs text-ink-500">
                  <span>{fmtDate(parseDate(selected.date))} 주일{selected.preacher ? ` · ${selected.preacher}` : ''}</span>
                  <button className="ml-auto text-ink-500" aria-label="닫기" onClick={() => setSelected(undefined)}>✕</button>
                </div>
                <p className="mt-1 font-serif text-lg font-bold">{selected.title}</p>
                <p className="text-sm text-ink-500">{selected.passage}</p>
                <div className="mt-2 flex items-center gap-1">
                  {WEEKDAYS.map((d) => (
                    <span key={d.key} className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${selDays.includes(d) ? 'bg-dawn-300 text-ink-900' : 'bg-moss-50 text-ink-300'}`}>{d.short}</span>
                  ))}
                  <Link to={`/day/${selected.id}/1`} className="ml-auto text-sm font-semibold text-moss-700">이 주 묵상 →</Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
