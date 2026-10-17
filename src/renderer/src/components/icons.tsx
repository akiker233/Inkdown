import type { ReactNode, SVGProps } from 'react'

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number
  children: ReactNode
}

function Icon({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

type Props = Omit<IconProps, 'children'>

export function FileIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </Icon>
  )
}

export function FolderIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </Icon>
  )
}

export function ChevronIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  )
}

export function CloseIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  )
}

export function PlusIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function RefreshIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </Icon>
  )
}

export function SidebarIcon(props: Props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </Icon>
  )
}

export function SearchIcon(props: Props) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.4-3.4" />
    </Icon>
  )
}

export function OpenIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M4 19V7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v2" />
      <path d="M4.2 19h14.9a1.6 1.6 0 0 0 1.6-1.2l1.4-5.2a1 1 0 0 0-1-1.2H7.2a2 2 0 0 0-1.9 1.4L3.6 18a.8.8 0 0 0 .6 1Z" />
    </Icon>
  )
}

export function SaveIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M7 3v5h8V3" />
      <path d="M7 13h10v8H7z" />
    </Icon>
  )
}

export function SaveAsIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M5 3h10l4 4v5" />
      <path d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" />
      <path d="M7 3v5h7V3" />
      <path d="M7 21v-6h8v3" />
      <path d="M16 3h5v5" />
      <path d="M21 3l-5 5" />
    </Icon>
  )
}

export function SettingsIcon(props: Props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </Icon>
  )
}

export function DefaultAppIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M12 3.2c3.2 3.9 6 6.9 6 10.4a6 6 0 0 1-12 0c0-3.5 2.8-6.5 6-10.4Z" />
      <path d="m9.1 13.4 2 2 3.8-4" />
    </Icon>
  )
}

export function ImageIcon(props: Props) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m5 18 5-5 4 4 3-3 3 3" />
    </Icon>
  )
}

export function HighlighterIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="m9 11-6 6v3h3l6-6" />
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4l8 8Z" />
    </Icon>
  )
}

export function TaskListIcon(props: Props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="7" height="7" rx="1.5" />
      <path d="m4.8 7.5 1.5 1.5 2.4-2.6" />
      <path d="M14 7.5h7M14 16.5h7" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  )
}

export function BulletListIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function OrderedListIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M10 6h11M10 12h11M10 18h11" />
      <path d="M4 5h1.5v4M3.5 9h3" />
      <path d="M3.5 14h3v1.6L4 18h2.5" />
    </Icon>
  )
}

export function QuoteIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M5 5v14" />
      <path d="M10 8h9M10 12h9M10 16h6" />
    </Icon>
  )
}

export function LinkIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <path d="M8 12h8" />
    </Icon>
  )
}

export function TableIcon(props: Props) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M9 10v9M15 10v9" />
    </Icon>
  )
}

export function CodeBlockIcon(props: Props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m10 10-2 2 2 2M14 10l2 2-2 2" />
    </Icon>
  )
}

export function InlineCodeIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="m8 8-4 4 4 4M16 8l4 4-4 4" />
      <path d="m13.5 5-3 14" />
    </Icon>
  )
}

export function HrIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M3 12h18" />
      <path d="M6 8h12M6 16h12" opacity="0.35" />
    </Icon>
  )
}

export function UndoIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </Icon>
  )
}

export function RedoIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </Icon>
  )
}

export function MoreIcon(props: Props) {
  return (
    <Icon {...props}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </Icon>
  )
}
