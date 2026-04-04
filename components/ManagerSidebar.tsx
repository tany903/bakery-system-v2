'use client'
import { usePathname } from 'next/navigation'
const links = [
  { href: '/dashboard',        icon: '/icons/menu.svg',        label: 'Dashboard' },
  { href: '/restock-requests', icon: '/icons/Plus_square.svg', label: 'Restock' },
  { href: '/inventory',        icon: '/icons/Box.svg',         label: 'Inventory' },
  { href: '/expenses',         icon: '/icons/payment.svg',     label: 'Expenses' },
  { href: '/analytics',        icon: '/icons/Bar_chart.svg',   label: 'Analytics' },
  { href: '/users',            icon: '/icons/person.svg',      label: 'Staff' },
  { href: '/products',         icon: '/icons/Tag.svg',         label: 'Products' },
  { href: '/ingredients',      icon: '/icons/flour.svg',       label: 'Ingredients' },
  { href: '/purchase-orders',  icon: '/icons/Plus_square.svg', label: 'PO' },
  { href: '/transactions',     icon: '/icons/Book.svg',        label: 'Transactions' },
  { href: '/audit-logs',       icon: '/icons/Book.svg',        label: 'Audit' },
  
]
export default function ManagerSidebar() {
  const pathname = usePathname()
  return (
    <div className="relative z-10 flex flex-col gap-2 p-3 w-28 shrink-0">
      {links.map(link => {
        const active = pathname === link.href
        return (
          <a key={link.label} href={link.href}
            className={`flex flex-col items-center justify-center gap-1 p-3 rounded-sm text-center transition-colors no-underline ${active ? 'text-white' : 'bg-white bg-opacity-80 hover:bg-opacity-100 text-gray-800'}`}
            style={active ? { backgroundColor: '#1a2340' } : { boxShadow: '2px 2px 7px rgba(0,0,0,0.2)' }}>
            <img src={link.icon} alt="" className="w-7 h-7"
              style={active ? { filter: 'brightness(0) invert(1)' } : {}} />
            <span className="text-xs font-semibold leading-tight">{link.label}</span>
          </a>
        )
      })}
    </div>
  )
}
