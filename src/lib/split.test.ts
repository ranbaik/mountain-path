import { describe, expect, it } from 'vitest'
import type { Sermon } from '../db'
import { expandRef, formatRef, parseRef } from './bible'
import { currentWeek, dayDate, dayPlans, splitRef, toYmd } from './split'

describe('parseRef', () => {
  it('여러 표기를 읽는다', () => {
    expect(parseRef('요한복음 15:1-17')).toEqual({ book: 43, from: { c: 15, v: 1 }, to: { c: 15, v: 17 } })
    expect(parseRef('요 15:1~17')).toEqual(parseRef('요한복음 15:1-17'))
    expect(parseRef('요한복음 15장 1-17절')).toEqual(parseRef('요한복음 15:1-17'))
    expect(parseRef('요한복음 15:1-16:4')).toEqual({ book: 43, from: { c: 15, v: 1 }, to: { c: 16, v: 4 } })
    expect(parseRef('시편 23')).toEqual({ book: 19, from: { c: 23, v: 1 }, to: { c: 23, v: 6 } })
    expect(parseRef('요나 1:1')?.book).toBe(32)
    expect(parseRef('요일 1:1')?.book).toBe(62)
  })
  it('잘못된 범위는 null', () => {
    expect(parseRef('요한복음 99:1')).toBeNull()
    expect(parseRef('요한복음 15:17-1')).toBeNull()
    expect(parseRef('없는책 1:1')).toBeNull()
  })
})

describe('splitRef', () => {
  const covers = (passage: string) => {
    const ref = parseRef(passage)!
    const plans = splitRef(ref)
    const all = plans.flatMap((p) => expandRef(p.ref))
    return { plans, all, total: expandRef(ref) }
  }

  it('17절을 4·4·3·3·3 으로 빠짐없이 나눈다', () => {
    const { plans, all, total } = covers('요한복음 15:1-17')
    expect(plans.map((p) => expandRef(p.ref).length)).toEqual([4, 4, 3, 3, 3])
    expect(all).toEqual(total)
    expect(plans.map((p) => p.weekday)).toEqual([1, 2, 3, 4, 5])
  })

  it('장을 넘어가는 본문도 이어서 나눈다', () => {
    const { plans, all, total } = covers('요한복음 15:24-16:4') // 15장은 27절 → 4+4 = 8절
    expect(all).toEqual(total)
    expect(plans.map((p) => formatRef(p.ref))).toEqual([
      '요한복음 15:24-25', '요한복음 15:26-27', '요한복음 16:1-2', '요한복음 16:3', '요한복음 16:4',
    ])
    expect(formatRef(splitRef(parseRef('요 15:27-16:4')!)[0].ref)).toBe('요한복음 15:27')
    expect(formatRef(splitRef(parseRef('요 15:27-16:9')!)[0].ref)).toBe('요한복음 15:27-16:1') // 하루 분량이 장을 넘음
  })

  it('5절 미만이면 같은 본문을 매일 묵상한다', () => {
    const ref = parseRef('요한복음 3:16')!
    const plans = splitRef(ref)
    expect(plans).toHaveLength(5)
    expect(plans.every((p) => p.ref === ref)).toBe(true)
    expect(new Set(plans.map((p) => p.focus)).size).toBe(5)
  })

  it('담당자가 저장한 분할을 우선한다', () => {
    const custom = splitRef(parseRef('시편 23')!).map((p) => ({ ...p, focus: 'x' }))
    const s: Sermon = { id: 'a', date: '2026-11-08', title: '', passage: '요한복음 1:1-5', preacher: '', days: custom }
    expect(dayPlans(s)).toBe(custom)
  })
})

describe('날짜', () => {
  const s: Sermon = { id: 'a', date: '2026-11-15', title: '', passage: '마 5:1-16', preacher: '' }
  it('월~금 = 주일 다음 날부터 5일', () => {
    expect(toYmd(dayDate(s, 1))).toBe('2026-11-16')
    expect(toYmd(dayDate(s, 5))).toBe('2026-11-20')
  })
  it('오늘이 속한 주와 요일을 찾는다', () => {
    const older: Sermon = { ...s, id: 'b', date: '2026-11-08' }
    expect(currentWeek([older, s], new Date(2026, 10, 18))).toMatchObject({ sermon: s, weekday: 3, inWeek: true })
    expect(currentWeek([older, s], new Date(2026, 10, 15)).weekday).toBeNull() // 주일
    expect(currentWeek([older, s], new Date(2026, 10, 21)).weekday).toBeNull() // 토요일
    expect(currentWeek([older, s], new Date(2026, 10, 30)).inWeek).toBe(false)
  })
})
