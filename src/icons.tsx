import type { SVGProps } from 'react';

export {
  // Navigation / UI
  Menu,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  X,
  Plus,
  Minus,
  PlusCircle,
  Settings,
  Edit2,
  MoreVertical,
  Search,
  RefreshCw,
  LogOut,
  Download,
  Upload,

  // Layout / Files
  Layout,
  Folder,
  FolderOpen,
  FileText,
  Map,
  Cloud,
  Package,
  ImagePlus,
  Image,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Check,

  // Combat / D&D
  Swords,
  Sword,
  Skull,
  Zap,
  Sparkles,
  Dices,
  Ruler,

  // AoE shapes
  Circle,
  Cone,
  Cylinder,
  Box,
  Slash,

  // People / Characters
  Users,
  User,

  // Stats / Info
  Heart,
  Shield,
  Eye,
  EyeOff,
  TriangleAlert,
  Wind,
  Footprints,
  Droplet,
  Feather,
  Shovel,
  Award,
  Brain,
  BookOpen,
  BookOpenText,
  Backpack,
  Info,
  AlertCircle,
  MessageSquareQuote,

  // Actions
  Trash2,
  Link,
  Undo2,
  GripHorizontal,
  Pencil,
  BrickWall,
  SquareSplitHorizontal,
  Stone,
  Eraser,
  Disc2,

  // Monitor
  MonitorUp,
  MonitorX,

  // Lighting
  Sun,
  Moon,

  // Fullscreen
  Maximize,
  Minimize,

  // Damage types
  Flame,
  Snowflake,
  CloudLightning,
  Atom,
  Bubbles,
  FlaskConical,

  // Portals (Doors / Windows)
  DoorClosed,
  DoorOpen,
  Grid2x2,
  Blinds,
  Lock,

  // Floors / Transition Zones
  Layers,
  ArrowUpDown,
  SquareDashed,

  // Secret door
  SquareDashedTopSolid,

  StopCircle,
} from 'lucide-react';

// Treasure chest — lucide's Gem icon
export { Gem as TreasureChest } from 'lucide-react';

// Twenty-sided die. Lucide has no d20, so this is drawn on lucide's own Hexagon
// path — identical proportions and corner rounding to the rest of the set — with
// the die's top face added. Kept to two elements so it still reads at map-pin size.
// The same two paths are drawn with Konva in MapView's NoteMapIcon; change both.
export const D20 = ({ size = 24, className = '', ...props }: SVGProps<SVGSVGElement> & { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <path d="M12 6.5 L16.8 15.2 L7.2 15.2 Z" />
  </svg>
);
