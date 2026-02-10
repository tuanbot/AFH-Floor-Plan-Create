export type Room = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  rotation: number;
  labelX?: number;
  labelY?: number;
  fontSize?: number;
};

export type ExitPoint = {
  id: string;
  x: number;
  y: number;
  type: 'primary' | 'secondary' | 'extinguisher' | 'first-aid' | 'fire-alarm';
  label: string;
  rotation: number;
  labelX?: number;
  labelY?: number;
  fontSize?: number;
};

export type HouseFeature = {
  id: string;
  type: 
    | 'door' | 'sliding-door' | 'closet-door' | 'window' | 'stairs' | 'closet-unit' | 'closet-double' 
    | 'single-bed' | 'double-bed' | 'shower' | 'bathtub' | 'sink-single' | 'sink-double' 
    | 'vanity-single' | 'vanity-double' | 'toilet' | 'sofa' | 'table' | 'desk' 
    | 'balcony' | 'entry' | 'garden' | 'driveway' | 'hallway' | 'pantry' | 'linen' 
    | 'kitchen-island' | 'fridge' | 'dishwasher' | 'range' | 'washer-dryer' 
    | 'water-heater' | 'elec-panel' | 'fireplace' | 'wall' | 'fence' | 'bathroom'
    | 'label';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
  labelX?: number;
  labelY?: number;
  fontSize?: number;
};

export type RoutePoint = { x: number; y: number };

export type SafetyRoute = {
  id: string;
  points: RoutePoint[];
  color: string;
};

export type HouseDetails = {
  address: string;
  owner: string;
  contact: string;
  notes: string;
};

export type AppState = {
  projectId: string;
  projectName: string;
  rooms: Room[];
  exits: ExitPoint[];
  features: HouseFeature[];
  routes: SafetyRoute[];
  details: HouseDetails;
  backgroundUrl: string | null;
  selectedId: string | null;
  mode: 'edit' | 'safety' | 'details' | 'route';
  showDimensions: boolean;
  gridSize: number;
  snapToGrid: boolean;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
};

export type SavedProject = {
  id: string;
  name: string;
  updatedAt: number;
  state: AppState;
};