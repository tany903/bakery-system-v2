// components/Logo.tsx
import Image from 'next/image'

export function LogoSmall() {
  return <Image src="/FREDS_ICON1.png" alt="Logo" width={40} height={40} className="object-contain" priority />
}

export function LogoWatermark({ opacity = 0.3 }: { opacity?: number }) {
  return (
    <div className="fixed pointer-events-none select-none"
      style={{ opacity, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50%', zIndex: 0 }}>
      <Image src="/logo-big.png" alt="" fill style={{ objectFit: 'contain' }} />
    </div>
  )
}