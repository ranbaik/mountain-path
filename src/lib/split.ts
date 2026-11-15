import type { DayPlan, Ref, Sermon, Weekday } from '../db'
import { expandRef, parseRef } from './bible'

export const WEEKDAYS: { key: Weekday; label: string; short: string; focus: string }[] = [
  { key: 1, label: '월요일', short: '월', focus: '천천히 읽고, 눈에 들어오는 단어와 장면을 적어 보세요.' },
  { key: 2, label: '화요일', short: '화', focus: '이 말씀이 하나님에 대해 무엇을 알려 주는지 생각해 보세요.' },
  { key: 3, label: '수요일', short: '수', focus: '나는 이 말씀 앞에서 어떤 모습인지 비추어 보세요.' },
  { key: 4, label: '목요일', short: '목', focus: '오늘 하루, 이 말씀대로 살아 볼 한 가지를 정해 보세요.' },
  { key: 5, label: '금요일', short: '금', focus: '한 주를 돌아보며 감사와 결단을 드려요.' },
]

/**
 * 본문 범위를 월~금 5일로 나눔.
 * - 5절 이상: 앞에서부터 연속 구간으로 최대한 고르게 (남는 절은 앞쪽 날에 1절씩 더)
 * - 5절 미만: 같은 본문을 매일 묵상하되 요일별 초점만 달리 함
 */
export function splitRef(ref: Ref): DayPlan[] {
  const verses = expandRef(ref)
  const n = verses.length
  if (n < 5) return WEEKDAYS.map((d) => ({ weekday: d.key, ref, focus: d.focus }))
  const base = Math.floor(n / 5), extra = n % 5
  const plans: DayPlan[] = []
  let i = 0
  for (const d of WEEKDAYS) {
    const size = base + (d.key <= extra ? 1 : 0)
    plans.push({ weekday: d.key, ref: { book: ref.book, from: verses[i], to: verses[i + size - 1] }, focus: d.focus })
    i += size
  }
  return plans
}

/** 담당자가 저장한 분할이 있으면 그것을, 없으면 자동 분할 */
export function dayPlans(sermon: Sermon): DayPlan[] | null {
  if (sermon.days?.length === 5) return sermon.days
  const ref = parseRef(sermon.passage)
  return ref ? splitRef(ref) : null
}

/* ── 날짜 (모두 기기 현지 시각 기준) ── */

export function parseDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** 설교(주일) 기준 요일 날짜: 월=+1 … 금=+5 */
export const dayDate = (sermon: Sermon, weekday: Weekday) => addDays(parseDate(sermon.date), weekday)

export const fmtDate = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일`

/**
 * 오늘이 속한 주의 설교(주일~토요일)와 오늘의 요일(월~금이면 1~5, 주일·토요일이면 null).
 * 이번 주 설교가 아직 없으면 가장 최근 설교를 돌려줌.
 */
export function currentWeek(sermons: Sermon[], today = new Date()) {
  const t = toYmd(today)
  const past = sermons.filter((s) => s.date <= t).sort((a, b) => b.date.localeCompare(a.date))
  const sermon = past[0] ?? [...sermons].sort((a, b) => a.date.localeCompare(b.date))[0]
  if (!sermon) return { sermon: undefined, weekday: null as Weekday | null, inWeek: false }
  const diff = Math.round((parseDate(t).getTime() - parseDate(sermon.date).getTime()) / 86400000)
  const inWeek = diff >= 0 && diff <= 6
  const weekday = inWeek && diff >= 1 && diff <= 5 ? (diff as Weekday) : null
  return { sermon, weekday, inWeek }
}
