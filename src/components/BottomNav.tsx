import { Link, useLocation } from 'react-router-dom'

const items = [
  { to: '/', label: '오늘', icon: '☀️', active: (p: string) => p === '/' || p.startsWith('/day/') },
  { to: '/path', label: '나의 길', icon: '⛰️', active: (p: string) => p === '/path' },
  { to: '/mokjang', label: '목장', icon: '🌿', active: (p: string) => p === '/mokjang' },
  { to: '/family', label: '가정예배', icon: '🏡', active: (p: string) => p === '/family' },
  { to: '/more', label: '더보기', icon: '⋯', active: (p: string) => p.startsWith('/more') },
]

export default function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav aria-label="주요 메뉴" className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-moss-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-xl">
        {items.map((it) => {
          const on = it.active(pathname)
          return (
            <Link key={it.to} to={it.to} aria-current={on ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 pt-2 text-xs font-semibold ${on ? 'text-moss-700' : 'text-ink-500'}`}>
              <span className="text-xl leading-none" aria-hidden>{it.icon}</span>{it.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
