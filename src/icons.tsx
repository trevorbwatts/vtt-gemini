import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number; // accepted but unused (Lucide compat)
}

const FA = ({ name, size = 16, className = '', style }: { name: string } & IconProps) => (
  <i
    className={`fa-solid fa-${name}${className ? ' ' + className : ''}`}
    style={{ fontSize: `${size}px`, lineHeight: 1, display: 'inline-block', ...style }}
    aria-hidden="true"
  />
);

// Navigation / UI
export const Menu = (p: IconProps) => <FA name="bars" {...p} />;
export const ChevronRight = (p: IconProps) => <FA name="chevron-right" {...p} />;
export const ChevronLeft = (p: IconProps) => <FA name="chevron-left" {...p} />;
export const ChevronUp = (p: IconProps) => <FA name="chevron-up" {...p} />;
export const ChevronDown = (p: IconProps) => <FA name="chevron-down" {...p} />;
export const ArrowLeft = (p: IconProps) => <FA name="arrow-left" {...p} />;
export const X = (p: IconProps) => <FA name="xmark" {...p} />;
export const Plus = (p: IconProps) => <FA name="plus" {...p} />;
export const PlusCircle = (p: IconProps) => <FA name="circle-plus" {...p} />;
export const Settings = (p: IconProps) => <FA name="gear" {...p} />;
export const Edit2 = (p: IconProps) => <FA name="pen" {...p} />;
export const MoreVertical = (p: IconProps) => <FA name="ellipsis-vertical" {...p} />;
export const Search = (p: IconProps) => <FA name="magnifying-glass" {...p} />;
export const RefreshCw = (p: IconProps) => <FA name="rotate-right" {...p} />;
export const LogOut = (p: IconProps) => <FA name="right-from-bracket" {...p} />;
export const Download = (p: IconProps) => <FA name="download" {...p} />;
export const Upload = (p: IconProps) => <FA name="upload" {...p} />;

// Layout / Files
export const Layout = (p: IconProps) => <FA name="table-columns" {...p} />;
export const Folder = (p: IconProps) => <FA name="folder" {...p} />;
export const FolderOpen = (p: IconProps) => <FA name="folder-open" {...p} />;
export const FileText = (p: IconProps) => <FA name="file-lines" {...p} />;
export const Map = (p: IconProps) => <FA name="map" {...p} />;
export const Cloud = (p: IconProps) => <FA name="cloud" {...p} />;
export const Package = (p: IconProps) => <FA name="box" {...p} />;
export const TreasureChest = (p: IconProps) => <FA name="treasure-chest" {...p} />;
export const ImagePlus = (p: IconProps) => <FA name="image" {...p} />;

// Combat / D&D
export const Swords = (p: IconProps) => <FA name="khanda" {...p} />;
export const Sword = (p: IconProps) => <FA name="khanda" {...p} />;
export const Skull = (p: IconProps) => <FA name="skull" {...p} />;
export const Zap = (p: IconProps) => <FA name="bolt" {...p} />;
export const Sparkles = (p: IconProps) => <FA name="wand-magic-sparkles" {...p} />;

// People / Characters
export const Users = (p: IconProps) => <FA name="users" {...p} />;
export const User = (p: IconProps) => <FA name="user" {...p} />;

// Stats / Info
export const Heart = (p: IconProps) => <FA name="heart" {...p} />;
export const Shield = (p: IconProps) => <FA name="shield" {...p} />;
export const Eye = (p: IconProps) => <FA name="eye" {...p} />;
export const EyeOff = (p: IconProps) => <FA name="eye-slash" {...p} />;
export const Wind = (p: IconProps) => <FA name="wind" {...p} />;
export const Award = (p: IconProps) => <FA name="award" {...p} />;
export const BookOpen = (p: IconProps) => <FA name="book-open" {...p} />;
export const Backpack = (p: IconProps) => <FA name="bag-shopping" {...p} />;
export const Info = (p: IconProps) => <FA name="circle-info" {...p} />;
export const AlertCircle = (p: IconProps) => <FA name="circle-exclamation" {...p} />;
export const MessageSquareQuote = (p: IconProps) => <FA name="comment" {...p} />;

// Actions
export const Trash2 = (p: IconProps) => <FA name="trash" {...p} />;
export const Link = (p: IconProps) => <FA name="link" {...p} />;

// Monitor (no direct free FA equivalent — using display icon)
export const MonitorUp = (p: IconProps) => <FA name="display" {...p} />;
export const MonitorX = (p: IconProps) => <FA name="display" {...p} />;
