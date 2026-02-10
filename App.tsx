import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Home, 
  Plus, 
  Trash2, 
  Move, 
  Maximize,
  BrainCircuit,
  X,
  Loader2,
  RotateCcw,
  RotateCw,
  DoorOpen,
  Layers,
  Bed,
  Bath,
  ArrowUpRight,
  Flame,
  Bell,
  Stethoscope,
  PenTool,
  Square,
  Armchair,
  TreePine,
  Car,
  Refrigerator,
  Zap,
  Ruler,
  Coffee,
  Waves,
  Hammer,
  Wind,
  Box,
  Monitor,
  Table as TableIcon,
  LogOut,
  ChevronRight,
  Upload,
  Settings,
  ArrowUp,
  MapPin,
  Utensils,
  Save,
  FolderOpen,
  FilePlus,
  Download,
  Printer,
  FileText,
  Copy,
  Grid3X3,
  MousePointer2,
  ImageOff,
  FileUp,
  FileDown,
  Scaling,
  RefreshCcw,
  Undo,
  Redo,
  Clipboard,
  BrickWall,
  RotateCw as RotateIcon,
  Type,
  AlignCenter,
  RotateCcw as ResetIcon,
  Minus,
  Fence,
  Magnet
} from 'lucide-react';
import { Room, ExitPoint, HouseFeature, HouseDetails, AppState, SafetyRoute, RoutePoint, SavedProject } from './types';
import { analyzeSafetyPlan, convertSketchToDiagram } from './geminiService';

const DEFAULT_CANVAS_SIZE = 800;
const FIXED_THICKNESS_TYPES = ['wall', 'fence', 'window', 'sliding-door'];
const SNAP_THRESHOLD = 15; // Pixels

const generateId = () => `id-${Math.random().toString(36).slice(2, 11)}-${Date.now()}`;

// --- Geometry Helpers ---

// Get world coordinates of corners for a rotated rectangle
const getItemCorners = (item: Room | HouseFeature) => {
  const w = item.width;
  const h = item.height;
  const cx = item.x + w / 2;
  const cy = item.y + h / 2;
  const r = item.rotation || 0;
  const rad = r * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Relative corner positions from center
  // TL, TR, BR, BL
  const offsets = [
    { x: -w/2, y: -h/2 },
    { x: w/2, y: -h/2 },
    { x: w/2, y: h/2 },
    { x: -w/2, y: h/2 }
  ];

  return offsets.map(p => ({
    x: cx + (p.x * cos - p.y * sin),
    y: cy + (p.x * sin + p.y * cos)
  }));
};

// Get world coordinate of a specific point in local space (e.g. width, height/2)
const localToWorld = (lx: number, ly: number, item: Room | HouseFeature) => {
  const w = item.width;
  const h = item.height;
  const cx = item.x + w / 2;
  const cy = item.y + h / 2;
  const r = item.rotation || 0;
  const rad = r * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // vector from center
  const dx = lx - w/2;
  const dy = ly - h/2;

  return {
    x: cx + (dx * cos - dy * sin),
    y: cy + (dx * sin + dy * cos)
  };
};

const worldToLocal = (wx: number, wy: number, item: Room | HouseFeature) => {
  const w = item.width;
  const h = item.height;
  const cx = item.x + w / 2;
  const cy = item.y + h / 2;
  const r = item.rotation || 0;
  const rad = r * (Math.PI / 180);
  const cos = Math.cos(-rad); // Inverse rotation
  const sin = Math.sin(-rad);

  const dx = wx - cx;
  const dy = wy - cy;

  const localDx = dx * cos - dy * sin;
  const localDy = dx * sin + dy * cos;

  return {
    x: localDx + w/2,
    y: localDy + h/2
  };
};

const getDist = (p1: {x:number, y:number}, p2: {x:number, y:number}) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

// Factory function to create fresh initial state with unique IDs
const createInitialState = (): AppState => ({
  projectId: generateId(),
  projectName: 'New Project',
  rooms: [
    { id: generateId(), name: 'Master Bedroom', x: 100, y: 100, width: 240, height: 180, color: '#ffffff', rotation: 0 },
    { id: generateId(), name: 'Living Room', x: 340, y: 100, width: 300, height: 240, color: '#ffffff', rotation: 0 },
  ],
  exits: [],
  features: [],
  routes: [],
  details: { address: '', owner: '', contact: '', notes: '' },
  backgroundUrl: null,
  selectedId: null,
  mode: 'edit',
  showDimensions: false,
  gridSize: 20,
  snapToGrid: true,
  canvasWidth: DEFAULT_CANVAS_SIZE,
  canvasHeight: DEFAULT_CANVAS_SIZE,
  scale: 0.6, // Default: 1px = 0.6 inches
  snapToObjects: true,
  snapIndicator: null,
});

const App: React.FC = () => {
  // Initialize state using factory function
  const [state, setState] = useState<AppState>(createInitialState);
  
  // History Management
  const [history, setHistory] = useState<AppState[]>([createInitialState()]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  // Clipboard Management
  const [clipboard, setClipboard] = useState<{type: 'room'|'feature'|'exit', data: any} | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<{ id: string, offsetX: number, offsetY: number } | null>(null);
  const [resizingItem, setResizingItem] = useState<{ id: string, startX: number, startY: number, startW: number, startH: number, rotation: number } | null>(null);
  const [rotatingItem, setRotatingItem] = useState<{ id: string, startAngle: number, startRotation: number, cx: number, cy: number } | null>(null);
  const [movingLabel, setMovingLabel] = useState<{ id: string, startX: number, startY: number, startLabelX: number, startLabelY: number, rotation: number } | null>(null);
  const [activeRoute, setActiveRoute] = useState<RoutePoint[] | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  
  // Ref to track state at start of drag for history diffing
  const dragStartStateRef = useRef<AppState | null>(null);

  useEffect(() => {
    // Ensure initial history matches initial state if IDs generated differently
    if (history.length === 1 && history[0].projectId !== state.projectId) {
       setHistory([state]);
    }
  }, [state]);

  useEffect(() => {
    try {
      const projects = localStorage.getItem('afh_projects');
      if (projects) {
        const parsed = JSON.parse(projects);
        if (Array.isArray(parsed)) {
          setSavedProjects(parsed);
        } else {
          setSavedProjects([]);
        }
      }
    } catch (e) {
      console.error("Failed to load projects", e);
      setSavedProjects([]);
    }
  }, []);

  // --- History Functions ---

  const pushHistory = (newState: AppState) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newState);
    // Limit history size to prevent memory issues
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setState(history[newIndex]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setState(history[newIndex]);
    }
  };

  // --- Copy / Paste Functions ---

  const handleCopy = () => {
    if (!state.selectedId) return;
    const room = state.rooms.find(r => r.id === state.selectedId);
    if (room) { setClipboard({ type: 'room', data: room }); return; }
    
    const feature = state.features.find(f => f.id === state.selectedId);
    if (feature) { setClipboard({ type: 'feature', data: feature }); return; }
    
    const exit = state.exits.find(e => e.id === state.selectedId);
    if (exit) { setClipboard({ type: 'exit', data: exit }); return; }
  };

  const handlePaste = () => {
    if (!clipboard) return;
    const offset = 20;
    
    if (clipboard.type === 'room') {
       const newRoom = { ...clipboard.data, id: generateId(), x: clipboard.data.x + offset, y: clipboard.data.y + offset, name: `${clipboard.data.name} (Copy)` };
       setState(prev => {
          const next = { ...prev, rooms: [...prev.rooms, newRoom], selectedId: newRoom.id };
          pushHistory(next);
          return next;
       });
    } else if (clipboard.type === 'feature') {
       const newFeature = { ...clipboard.data, id: generateId(), x: clipboard.data.x + offset, y: clipboard.data.y + offset };
       setState(prev => {
          const next = { ...prev, features: [...prev.features, newFeature], selectedId: newFeature.id };
          pushHistory(next);
          return next;
       });
    } else if (clipboard.type === 'exit') {
       const newExit = { ...clipboard.data, id: generateId(), x: clipboard.data.x + offset, y: clipboard.data.y + offset };
       setState(prev => {
          const next = { ...prev, exits: [...prev.exits, newExit], selectedId: newExit.id };
          pushHistory(next);
          return next;
       });
    }
  };

  // --- Keyboard Shortcuts ---
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) redo();
        else undo();
        e.preventDefault();
      }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'y')) {
        redo();
        e.preventDefault();
      }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        handleCopy();
        e.preventDefault();
      }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        handlePaste();
        e.preventDefault();
      }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
         if (state.selectedId) deleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, historyIndex, history, clipboard]);


  // Consolidates the current working state into the savedProjects list and persists to localStorage
  const saveCurrentWork = (currentState: AppState, currentSavedList: SavedProject[]) => {
    const currentEntry: SavedProject = {
      id: currentState.projectId,
      name: currentState.projectName,
      updatedAt: Date.now(),
      state: currentState,
    };

    // Remove old version of current project if exists, then add updated version
    const others = currentSavedList.filter(p => p.id !== currentState.projectId);
    const updatedList = [currentEntry, ...others];
    
    setSavedProjects(updatedList);
    try {
      localStorage.setItem('afh_projects', JSON.stringify(updatedList));
      return updatedList;
    } catch (e) {
      console.error("Auto-save failed", e);
      return currentSavedList; // Return original if save failed
    }
  };

  const saveToLocalStorage = (projects: SavedProject[]): boolean => {
    setSavedProjects(projects);
    try {
      localStorage.setItem('afh_projects', JSON.stringify(projects));
      return true;
    } catch (e) {
      console.error("LocalStorage Save failed", e);
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        alert("Storage Limit Reached! Project saved in MEMORY ONLY.");
      } else {
        alert("Warning: Saved to memory only. Failed to write to disk.");
      }
      return false;
    }
  };

  const handleSaveProject = () => {
    try {
      if (state.projectName === 'New Project') {
        const name = prompt('Enter a name for your project:', state.projectName);
        if (!name) return;
        doSave(name, state.projectId);
      } else {
        doSave(state.projectName, state.projectId);
      }
    } catch (e) {
      console.error("Save error:", e);
      alert("An unexpected error occurred while saving.");
    }
  };

  const handleSaveAs = () => {
    try {
      const defaultName = `${state.projectName} (Copy)`;
      const name = prompt('Enter a name for the new project copy:', defaultName);
      if (!name) return;
      
      const newId = generateId();
      doSave(name, newId);
    } catch (e) {
      console.error("Save As error:", e);
      alert("An unexpected error occurred during Save As.");
    }
  };

  const doSave = (name: string, id: string) => {
    const newState: AppState = { 
      ...state, 
      projectName: name, 
      projectId: id, 
      selectedId: null 
    };

    setState(newState);
    pushHistory(newState);

    const newProject: SavedProject = {
      id,
      name,
      updatedAt: Date.now(),
      state: newState,
    };

    const otherProjects = savedProjects.filter(p => p.id !== id);
    const updatedList = [newProject, ...otherProjects];
    
    const diskSuccess = saveToLocalStorage(updatedList);
    if (diskSuccess) {
       setTimeout(() => alert(`Project "${name}" saved successfully.`), 50);
    } 
  };

  const handleNewProject = () => {
    // 1. Auto-save current work so it becomes a "tab"
    const updatedList = saveCurrentWork(state, savedProjects);
    
    // 2. Create fresh state
    const freshState = createInitialState();
    freshState.projectId = `id-new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    // 3. Switch to new state
    setState(freshState);
    setHistory([freshState]);
    setHistoryIndex(0);
    
    // 4. Reset UI states
    setDraggingItem(null);
    setResizingItem(null);
    setRotatingItem(null);
    setMovingLabel(null);
    setActiveRoute(null);
    setAnalysisResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowProjectModal(false);
  };

  // Helper to switch projects (Tabs)
  const handleSwitchProject = (projectToLoad: SavedProject) => {
    if (projectToLoad.id === state.projectId) return;
    
    // Save current before switching
    saveCurrentWork(state, savedProjects);
    
    // Load target
    handleLoadProject(projectToLoad);
  };

  const handleLoadProject = (project: SavedProject) => {
    try {
      const newState = {
        ...project.state,
        projectId: project.id,
        projectName: project.name,
        gridSize: project.state.gridSize || 20,
        snapToGrid: project.state.snapToGrid ?? true,
        features: project.state.features || [],
        exits: project.state.exits || [],
        rooms: project.state.rooms || [],
        routes: project.state.routes || [],
        canvasWidth: project.state.canvasWidth || DEFAULT_CANVAS_SIZE,
        canvasHeight: project.state.canvasHeight || DEFAULT_CANVAS_SIZE,
        scale: project.state.scale || 0.6,
        snapToObjects: project.state.snapToObjects ?? true,
      };
      setState(newState);
      setHistory([newState]);
      setHistoryIndex(0);
      setShowProjectModal(false);
    } catch (e) {
      console.error("Load failed", e);
      alert("Failed to load project structure.");
    }
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Permanently delete this project? This cannot be undone.')) {
      const updatedList = savedProjects.filter(p => p.id !== id);
      saveToLocalStorage(updatedList);
      
      // If we deleted the active project, load the first available or create new
      if (id === state.projectId) {
         if (updatedList.length > 0) {
            handleLoadProject(updatedList[0]);
         } else {
             // Create a truly fresh state with a unique ID to ensure re-render
             const freshState = createInitialState();
             freshState.projectId = `id-new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            setState(freshState);
            setHistory([freshState]);
            setHistoryIndex(0);
         }
      }
    }
  };

  // --- Handlers for Export/Import etc. ---
  const handleExportFile = () => {
    try {
      const dataStr = JSON.stringify(state, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(state.projectName || 'project').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export error:", e);
      alert("Failed to export project.");
    }
  };

  const handleImportFileClick = () => {
    projectFileInputRef.current?.click();
  };

  const handleProjectFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (!parsed.projectId || !parsed.rooms) throw new Error("Invalid project structure");

        if (confirm('Load project from file? Unsaved changes will be lost.')) {
          const newState = {
            ...parsed,
            canvasWidth: parsed.canvasWidth || DEFAULT_CANVAS_SIZE,
            canvasHeight: parsed.canvasHeight || DEFAULT_CANVAS_SIZE,
          };
          setState(newState);
          setHistory([newState]);
          setHistoryIndex(0);
          setTimeout(() => alert("Project loaded from file."), 50);
        }
      } catch (err) {
        console.error("Import failed", err);
        alert("Failed to load project file.");
      } finally {
        if (projectFileInputRef.current) projectFileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };
  
  const handlePrint = () => window.print();

  const handleExportPNG = async () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const w = state.canvasWidth;
    const h = state.canvasHeight;
    canvas.width = w;
    canvas.height = h;
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = pngUrl;
        downloadLink.download = `${state.projectName || 'FloorPlan'}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const formatDim = (px: number) => {
    const scale = state.scale || 0.6;
    const totalInches = Math.round(px * scale);
    return `${totalInches}"`;
  };

  const handleAIAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const result = await analyzeSafetyPlan(state.rooms, state.exits, state.details);
      setAnalysisResult(result);
    } catch (error) {
      setAnalysisResult("An error occurred during analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      alert("Warning: This image is large (>1.5MB). Browser storage is limited.");
    }

    setIsConverting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setState(prev => {
         const next = { ...prev, backgroundUrl: base64 };
         pushHistory(next);
         return next;
      });
      if (fileInputRef.current) fileInputRef.current.value = '';

      try {
        // Pass current canvas dimensions so the AI scales the layout correctly
        const newRooms = await convertSketchToDiagram(base64, state.canvasWidth, state.canvasHeight);
        if (newRooms.length > 0) {
          const roomsWithIds: Room[] = newRooms.map((r, i) => ({
            id: `ai-room-${Date.now()}-${i}`,
            name: r.name || 'Room',
            x: r.x || 100,
            y: r.y || 100,
            width: r.width || 160,
            height: r.height || 120,
            color: r.color || '#ffffff',
            rotation: 0
          }));
          setState(prev => {
             const next = { ...prev, rooms: [...prev.rooms, ...roomsWithIds] };
             pushHistory(next);
             return next;
          });
        }
      } catch (err) {
        console.error("Conversion failed", err);
      } finally {
        setIsConverting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeBackground = () => {
    if(confirm("Remove background image?")) setState(prev => {
       const next = { ...prev, backgroundUrl: null };
       pushHistory(next);
       return next;
    });
  };

  // --- Element Adders ---
  const addRoom = () => {
    const newRoom: Room = { id: `room-${Date.now()}`, name: 'New Room', x: 100, y: 100, width: 160, height: 120, color: '#ffffff', rotation: 0 };
    setState(prev => {
       const next = { ...prev, rooms: [...prev.rooms, newRoom], selectedId: newRoom.id };
       pushHistory(next);
       return next;
    });
  };

  const addFeature = (type: HouseFeature['type']) => {
    const dimensions = {
      door: { w: 40, h: 40 }, 'sliding-door': { w: 80, h: 10 }, 'closet-door': { w: 60, h: 10 }, window: { w: 60, h: 10 }, 
      stairs: { w: 60, h: 120 }, 'closet-unit': { w: 80, h: 40 }, 'closet-double': { w: 120, h: 40 }, 
      'single-bed': { w: 50, h: 90 }, 'double-bed': { w: 90, h: 100 }, shower: { w: 60, h: 60 }, 
      bathtub: { w: 120, h: 60 }, 'sink-single': { w: 30, h: 30 }, 'sink-double': { w: 60, h: 30 },
      'vanity-single': { w: 60, h: 40 }, 'vanity-double': { w: 120, h: 40 }, toilet: { w: 30, h: 45 },
      sofa: { w: 120, h: 60 }, table: { w: 80, h: 80 }, desk: { w: 80, h: 45 }, 
      balcony: { w: 200, h: 60 }, entry: { w: 60, h: 40 }, garden: { w: 300, h: 200 }, 
      driveway: { w: 100, h: 300 }, hallway: { w: 40, h: 200 }, pantry: { w: 40, h: 40 }, 
      linen: { w: 40, h: 20 }, 'kitchen-island': { w: 100, h: 50 }, fridge: { w: 40, h: 40 }, 
      dishwasher: { w: 30, h: 30 }, range: { w: 40, h: 40 }, 'washer-dryer': { w: 60, h: 35 }, 
      'water-heater': { w: 30, h: 30 }, 'elec-panel': { w: 30, h: 10 }, fireplace: { w: 80, h: 30 },
      wall: { w: 200, h: 6 }, label: { w: 100, h: 30 },
      fence: { w: 200, h: 4 }, bathroom: { w: 120, h: 100 }
    }[type];
    const newFeature: HouseFeature = {
      id: `feature-${Date.now()}`, type, x: 250, y: 250, width: dimensions.w, height: dimensions.h, 
      rotation: 0, label: type === 'label' ? 'Text Label' : type.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
    };
    setState(prev => {
       const next = { ...prev, features: [...prev.features, newFeature], selectedId: newFeature.id };
       pushHistory(next);
       return next;
    });
  };

  const addExit = (type: ExitPoint['type']) => {
    const newExit: ExitPoint = {
      id: `exit-${Date.now()}`, x: state.canvasWidth / 2, y: state.canvasHeight / 2, type, label: type.split('-').join(' ').toUpperCase(), rotation: 0
    };
    setState(prev => {
       const next = { ...prev, exits: [...prev.exits, newExit], selectedId: newExit.id };
       pushHistory(next);
       return next;
    });
  };

  // State update helpers (these do NOT push history automatically, used for Drag/Inputs)
  const updateRoom = (id: string, updates: Partial<Room>) => {
    setState(prev => ({ ...prev, rooms: prev.rooms.map(r => r.id === id ? { ...r, ...updates } : r) }));
  };

  const updateFeature = (id: string, updates: Partial<HouseFeature>) => {
    setState(prev => ({ ...prev, features: prev.features.map(f => f.id === id ? { ...f, ...updates } : f) }));
  };

  const updateExit = (id: string, updates: Partial<ExitPoint>) => {
    setState(prev => ({ ...prev, exits: prev.exits.map(e => e.id === id ? { ...e, ...updates } : e) }));
  };

  const deleteSelected = () => {
    if (!state.selectedId) return;
    setState(prev => {
       const next = {
         ...prev,
         rooms: prev.rooms.filter(r => r.id !== prev.selectedId),
         exits: prev.exits.filter(e => e.id !== prev.selectedId),
         features: prev.features.filter(f => f.id !== prev.selectedId),
         routes: prev.routes.filter(r => r.id !== prev.selectedId),
         selectedId: null
       };
       pushHistory(next);
       return next;
    });
  };

  const startRoute = () => {
    setState(p => ({ ...p, mode: 'route', selectedId: null }));
    setActiveRoute([]);
  };

  const snap = (val: number) => {
    if (!state.snapToGrid) return val;
    return Math.round(val / state.gridSize) * state.gridSize;
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (state.mode === 'route' && activeRoute) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = snap(e.clientX - rect.left);
      const y = snap(e.clientY - rect.top);
      setActiveRoute(prev => [...prev, { x, y }]);
    } else if (e.target === e.currentTarget) {
      setState(prev => ({ ...prev, selectedId: null }));
    }
  };

  const finishRoute = () => {
    if (activeRoute && activeRoute.length > 1) {
      const newRoute: SafetyRoute = { id: `route-${Date.now()}`, points: activeRoute, color: '#ef4444' };
      setState(prev => {
         // Fix: Explicitly type 'next' as AppState to ensure 'mode' is typed as the union type and not string
         const next: AppState = { ...prev, routes: [...prev.routes, newRoute], mode: 'safety' };
         pushHistory(next);
         return next;
      });
    }
    setActiveRoute(null);
  };

  // Gather all potential snap points (corners/endpoints) from rooms and features
  const getSnapPoints = useCallback((excludeId: string | null) => {
    const points: {x:number, y:number}[] = [];
    state.rooms.forEach(r => {
      if (r.id !== excludeId) points.push(...getItemCorners(r));
    });
    state.features.forEach(f => {
      if (f.id !== excludeId) points.push(...getItemCorners(f));
    });
    // Add simple center points for exits/small items
    state.exits.forEach(e => {
        if (e.id !== excludeId) points.push({x: e.x, y: e.y});
    });
    return points;
  }, [state.rooms, state.features, state.exits]);

  const onMouseDown = (e: React.MouseEvent, type: 'room' | 'exit' | 'feature' | 'resize' | 'rotate' | 'route' | 'label_move', id: string) => {
    if (state.mode === 'route') return;
    e.stopPropagation();
    
    // Capture state before drag starts for history diffing
    dragStartStateRef.current = state;

    setState(prev => ({ ...prev, selectedId: id }));
    
    const item = [...state.rooms, ...state.exits, ...state.features].find(i => i.id === id);

    if (type === 'label_move' && item) {
       setMovingLabel({ 
         id, 
         startX: e.clientX, 
         startY: e.clientY, 
         startLabelX: item.labelX || 0, 
         startLabelY: item.labelY || 0,
         rotation: item.rotation || 0
       });
    } else if (type === 'rotate' && item) {
        let cx, cy;
        const room = state.rooms.find(r => r.id === id);
        const feature = state.features.find(f => f.id === id);
        const exit = state.exits.find(e => e.id === id);

        if (room) {
          cx = room.x + room.width / 2;
          cy = room.y + room.height / 2;
        } else if (feature) {
          cx = feature.x + feature.width / 2;
          cy = feature.y + feature.height / 2;
        } else if (exit) {
          cx = exit.x;
          cy = exit.y;
        } else {
           return;
        }
        
        const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
        setRotatingItem({ id, startAngle, startRotation: item.rotation || 0, cx, cy });
    } else if (type === 'resize' && item) {
      // Logic for feature/room resize
      const feature = state.features.find(f => f.id === id);
      const room = state.rooms.find(r => r.id === id);
      const w = room ? room.width : (feature ? feature.width : 0);
      const h = room ? room.height : (feature ? feature.height : 0);
      setResizingItem({ id, startX: e.clientX, startY: e.clientY, startW: w, startH: h, rotation: item.rotation || 0 });
    } else if (type !== 'route') {
      const it = [...state.rooms, ...state.exits, ...state.features].find(i => i.id === id);
      if (it) setDraggingItem({ id, offsetX: e.clientX - it.x, offsetY: e.clientY - it.y });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    let indicator: {x:number, y:number} | null = null;

    if (movingLabel) {
      const dx = e.clientX - movingLabel.startX;
      const dy = e.clientY - movingLabel.startY;
      
      const rad = -movingLabel.rotation * Math.PI / 180;
      const localDx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const localDy = dx * Math.sin(rad) + dy * Math.cos(rad);

      const newLabelX = movingLabel.startLabelX + localDx;
      const newLabelY = movingLabel.startLabelY + localDy;

      if (state.rooms.some(r => r.id === movingLabel.id)) updateRoom(movingLabel.id, { labelX: newLabelX, labelY: newLabelY });
      else if (state.features.some(f => f.id === movingLabel.id)) updateFeature(movingLabel.id, { labelX: newLabelX, labelY: newLabelY });
      else updateExit(movingLabel.id, { labelX: newLabelX, labelY: newLabelY });

    } else if (rotatingItem) {
      const { cx, cy, startAngle, startRotation } = rotatingItem;
      const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      const delta = currentAngle - startAngle;
      let newRotation = (startRotation + delta + 360) % 360;
      
      if (e.shiftKey) {
        newRotation = Math.round(newRotation / 45) * 45;
      }

      if (state.rooms.some(r => r.id === rotatingItem.id)) updateRoom(rotatingItem.id, { rotation: newRotation });
      else if (state.features.some(f => f.id === rotatingItem.id)) updateFeature(rotatingItem.id, { rotation: newRotation });
      else updateExit(rotatingItem.id, { rotation: newRotation });

    } else if (draggingItem) {
      // Base position from grid snap
      let nx = snap(e.clientX - draggingItem.offsetX);
      let ny = snap(e.clientY - draggingItem.offsetY);

      // --- Object Snapping Logic for Drag ---
      if (state.snapToObjects !== false) {
        const item = [...state.rooms, ...state.features, ...state.exits].find(i => i.id === draggingItem.id);
        if (item) {
            const snapPoints = getSnapPoints(item.id);
            // We need to check if any of THIS item's corners align with any target snap point
            // Calculate relative vectors of this item's corners to its origin (x,y)
            const cornersRelative = ('width' in item) ? getItemCorners({...item, x:0, y:0}) : [{x:0, y:0}];
            
            let bestDist = SNAP_THRESHOLD;
            let snapOffset = { x: 0, y: 0 };
            let snapped = false;

            // Try to align each corner of the dragging item to each target snap point
            // Proposed World Corner = (nx, ny) + RelativeCorner
            // We want Proposed World Corner approx Target Snap Point
            // So (nx, ny) approx Target Snap Point - RelativeCorner
            
            for (const cornerRel of cornersRelative) {
                for (const target of snapPoints) {
                    // Where the item origin would be if we snapped this corner
                    const neededOriginX = target.x - cornerRel.x;
                    const neededOriginY = target.y - cornerRel.y;
                    
                    // Distance from our current mouse-proposed origin to this needed origin
                    const dist = Math.sqrt(Math.pow(nx - neededOriginX, 2) + Math.pow(ny - neededOriginY, 2));
                    
                    if (dist < bestDist) {
                        bestDist = dist;
                        snapOffset = { x: neededOriginX - nx, y: neededOriginY - ny };
                        indicator = target; // Indicator at the snap target
                        snapped = true;
                    }
                }
            }

            if (snapped) {
                nx += snapOffset.x;
                ny += snapOffset.y;
            }
        }
      }

      if (state.rooms.some(r => r.id === draggingItem.id)) updateRoom(draggingItem.id, { x: nx, y: ny });
      else if (state.features.some(f => f.id === draggingItem.id)) updateFeature(draggingItem.id, { x: nx, y: ny });
      else setState(prev => ({ ...prev, exits: prev.exits.map(ex => ex.id === draggingItem.id ? { ...ex, x: nx, y: ny } : ex) }));

    } else if (resizingItem) {
      const dw = e.clientX - resizingItem.startX;
      const dh = e.clientY - resizingItem.startY;
      
      const rawNewWidth = Math.max(state.gridSize, resizingItem.startW + dw);
      const rawNewHeight = Math.max(state.gridSize, resizingItem.startH + dh);
      
      let newWidth = state.snapToGrid ? Math.round(rawNewWidth / state.gridSize) * state.gridSize : rawNewWidth;
      const isFixedThickness = state.features.some(f => f.id === resizingItem.id && FIXED_THICKNESS_TYPES.includes(f.type));
      const newHeight = isFixedThickness 
          ? resizingItem.startH 
          : (state.snapToGrid ? Math.round(rawNewHeight / state.gridSize) * state.gridSize : rawNewHeight);

      // --- Object Snapping Logic for Resize (Width only mainly) ---
      if (state.snapToObjects !== false) {
         // Determine the world position of the handle we are dragging.
         // Assume handle is at local (width, height/2) or (width, height)
         // Let's use (width, height/2) as the "End" of a wall.
         const item = [...state.rooms, ...state.features].find(i => i.id === resizingItem.id);
         if (item) {
             // Calculate where the mouse is in world space roughly (or just use e.clientX/Y relative to canvas rect if we had it, but here we use offsets)
             // Better: Calculate the World Coordinate corresponding to `newWidth`.
             const currentWorldEnd = localToWorld(newWidth, newHeight/2, {...item, width: newWidth, height: newHeight, x: item.x, y: item.y, rotation: resizingItem.rotation});
             
             const snapPoints = getSnapPoints(resizingItem.id);
             let bestDist = SNAP_THRESHOLD;
             
             for (const target of snapPoints) {
                 const dist = getDist(currentWorldEnd, target);
                 if (dist < bestDist) {
                     // We found a point close to where we are dragging the end.
                     // We need to calculate what 'width' would put the end exactly at 'target'.
                     // Convert 'target' to local coordinates.
                     const localTarget = worldToLocal(target.x, target.y, {...item, x: item.x, y: item.y, rotation: resizingItem.rotation, width: item.width, height: item.height});
                     // The new width should be localTarget.x
                     // Check if localTarget.y is reasonable (within height/2 +/- threshold)
                     if (Math.abs(localTarget.y - newHeight/2) < Math.max(newHeight, SNAP_THRESHOLD)) {
                         newWidth = localTarget.x;
                         bestDist = dist;
                         indicator = target;
                     }
                 }
             }
         }
      }
      
      if (state.rooms.some(r => r.id === resizingItem.id)) updateRoom(resizingItem.id, { width: newWidth, height: newHeight });
      else updateFeature(resizingItem.id, { width: newWidth, height: newHeight });
    }

    // Update indicator state
    if (JSON.stringify(indicator) !== JSON.stringify(state.snapIndicator)) {
        setState(prev => ({...prev, snapIndicator: indicator}));
    }
  };

  const onMouseUp = () => { 
    setDraggingItem(null); 
    setResizingItem(null);
    setRotatingItem(null);
    setMovingLabel(null);
    setState(prev => ({...prev, snapIndicator: null}));
    
    // Check if drag resulted in a state change
    if (dragStartStateRef.current && dragStartStateRef.current !== state) {
       pushHistory(state);
    }
    dragStartStateRef.current = null;
  };

  const handleCanvasSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    let w = DEFAULT_CANVAS_SIZE;
    let h = DEFAULT_CANVAS_SIZE;

    if (value === 'screen') {
        const availableW = window.innerWidth - 320 - 96; 
        const availableH = window.innerHeight - 64 - 96;
        w = Math.max(800, Math.floor(availableW / 20) * 20); // Snap to gridish
        h = Math.max(600, Math.floor(availableH / 20) * 20);
    } else if (value.includes('x')) {
        const [width, height] = value.split('x').map(Number);
        w = width;
        h = height;
    }

    setState(prev => {
       const next = { ...prev, canvasWidth: w, canvasHeight: h };
       pushHistory(next);
       return next;
    });
  };

  const handleRotatePlan = () => {
    if (!confirm("Rotate the entire plan 90 degrees clockwise? This will adjust all items.")) return;

    const cx = state.canvasWidth / 2;
    const cy = state.canvasHeight / 2;

    const rotatePoint = (x: number, y: number) => {
      return {
        x: -(y - cy) + cx,
        y: (x - cx) + cy
      };
    };

    setState(prev => {
       const newRooms = prev.rooms.map(room => {
          const rcx = room.x + room.width / 2;
          const rcy = room.y + room.height / 2;
          const newCenter = rotatePoint(rcx, rcy);
          return {
             ...room,
             width: room.height,
             height: room.width,
             x: newCenter.x - room.height / 2,
             y: newCenter.y - room.width / 2,
             rotation: (room.rotation + 90) % 360
          };
       });

       const newFeatures = prev.features.map(f => {
          const fcx = f.x + f.width / 2;
          const fcy = f.y + f.height / 2;
          const newCenter = rotatePoint(fcx, fcy);
          return {
            ...f,
            rotation: (f.rotation + 90) % 360,
            x: newCenter.x - f.width / 2,
            y: newCenter.y - f.height / 2
          };
       });

       const newExits = prev.exits.map(e => {
          const newPos = rotatePoint(e.x, e.y);
          return { ...e, x: newPos.x, y: newPos.y, rotation: (e.rotation + 90) % 360 };
       });
       
       const newRoutes = prev.routes.map(r => ({
          ...r,
          points: r.points.map(p => rotatePoint(p.x, p.y))
       }));

       const next = {
         ...prev,
         canvasWidth: prev.canvasHeight,
         canvasHeight: prev.canvasWidth,
         rooms: newRooms,
         features: newFeatures,
         exits: newExits,
         routes: newRoutes
       };
       pushHistory(next);
       return next;
    });
  };

  const selectedRoom = state.rooms.find(r => r.id === state.selectedId);
  const selectedFeature = state.features.find(f => f.id === state.selectedId);
  const selectedExit = state.exits.find(e => e.id === state.selectedId);
  
  const sidebarButtonClass = "flex flex-col items-center justify-center gap-1 p-2 bg-white border border-slate-200 rounded-xl text-[9px] font-bold hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm active:scale-95";

  // Prepare Tabs Logic
  const tabs = [...savedProjects];
  const existingIndex = tabs.findIndex(p => p.id === state.projectId);
  if (existingIndex >= 0) {
    tabs[existingIndex] = { ...tabs[existingIndex], name: state.projectName, state: state };
  } else {
    tabs.unshift({ id: state.projectId, name: state.projectName, updatedAt: Date.now(), state: state });
  }
  tabs.sort((a, b) => b.updatedAt - a.updatedAt);
  
  const standardSizes = ["800x800", "1200x1200", "1024x768", "1200x800", "1600x900", "1920x1080", "2000x1000"];
  const currentSizeStr = `${state.canvasWidth}x${state.canvasHeight}`;

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans" onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
      <input type="file" ref={projectFileInputRef} className="hidden" accept=".json" onChange={handleProjectFileImport} />

      {/* Project Modal */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
              <h2 className="text-lg font-black uppercase tracking-widest text-slate-700">All Projects</h2>
              <button type="button" onClick={() => setShowProjectModal(false)} className="p-2 hover:bg-slate-200 rounded-xl"><X size={20}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <button type="button" onClick={handleNewProject} className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all text-slate-400 hover:text-indigo-600">
                <FilePlus size={20}/> <span className="font-black text-xs uppercase tracking-widest">Start New</span>
              </button>
              {savedProjects.map(project => (
                  <div key={project.id} onClick={() => handleSwitchProject(project)} className={`group flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all ${project.id === state.projectId ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-400'}`}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm border border-slate-100">
                        <FileText size={20}/>
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800">{project.name}</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          {new Date(project.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={(e) => handleDeleteProject(project.id, e)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-white rounded-lg transition-colors">
                      <Trash2 size={18}/>
                    </button>
                  </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <aside className="w-80 bg-white border-r border-slate-300 flex flex-col shadow-2xl z-30 overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-center gap-3 bg-slate-50">
          <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-md"><Home size={20} /></div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-800">AFH Planner</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* ... Sidebar Controls ... */}
          <section className="space-y-3">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b pb-1">Project</h2>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest px-1">Project Name</label>
                <input 
                  type="text" 
                  value={state.projectName} 
                  onChange={(e) => setState(p => ({ ...p, projectName: e.target.value }))}
                  onBlur={() => pushHistory(state)}
                  className="w-full text-xs font-black p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="Enter Project Name..."
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={handleSaveProject} className="flex items-center justify-center gap-2 p-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black hover:bg-indigo-700 transition-all shadow-md active:scale-95">
                  <Save size={16}/> SAVE
                </button>
                <button type="button" onClick={handleSaveAs} className="flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all active:scale-95">
                  <Copy size={16}/> SAVE AS
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setShowProjectModal(true)} className="flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all active:scale-95">
                  <FolderOpen size={16}/> OPEN LIST
                </button>
                <button type="button" onClick={handleNewProject} className="flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all active:scale-95">
                  <FilePlus size={16}/> NEW
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={handleExportFile} className="flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all active:scale-95">
                  <FileDown size={16}/> EXPORT FILE
                </button>
                <button type="button" onClick={handleImportFileClick} className="flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all active:scale-95">
                  <FileUp size={16}/> IMPORT FILE
                </button>
              </div>
            </div>
          </section>

          <div className="space-y-3">
            <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button type="button" onClick={() => setState(p => ({...p, mode: 'edit'}))} className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all tracking-widest ${state.mode === 'edit' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>LAYOUT</button>
              <button type="button" onClick={() => setState(p => ({...p, mode: 'safety'}))} className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all tracking-widest ${state.mode === 'safety' ? 'bg-white shadow-sm text-red-600' : 'text-slate-400 hover:text-slate-600'}`}>SAFETY</button>
            </div>
          </div>

          {state.mode === 'edit' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-4">
              <section className="space-y-3">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b pb-1">Architecture</h2>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={addRoom} className={sidebarButtonClass}><Plus size={14}/> Room</button>
                  <button onClick={() => addFeature('label')} className={sidebarButtonClass}><Type size={14}/> Label</button>
                  <button onClick={() => addFeature('wall')} className={sidebarButtonClass}><BrickWall size={14}/> Wall</button>
                  <button onClick={() => addFeature('fence')} className={sidebarButtonClass}><Fence size={14}/> Fence</button>
                  <button onClick={() => addFeature('garden')} className={sidebarButtonClass}><TreePine size={14}/> Garden</button>
                  <button onClick={() => addFeature('driveway')} className={sidebarButtonClass}><Car size={14}/> Driveway</button>
                  <button onClick={() => addFeature('door')} className={sidebarButtonClass}><DoorOpen size={14}/> Door</button>
                  <button onClick={() => addFeature('sliding-door')} className={sidebarButtonClass}><DoorOpen size={14}/> Sliding</button>
                  <button onClick={() => addFeature('window')} className={sidebarButtonClass}><Maximize size={14}/> Window</button>
                  <button onClick={() => addFeature('closet-unit')} className={sidebarButtonClass}><Move size={14}/> Closet S</button>
                  <button onClick={() => addFeature('closet-double')} className={sidebarButtonClass}><Maximize size={14}/> Bi-fold</button>
                  <button onClick={() => addFeature('hallway')} className={sidebarButtonClass}><Layers size={14}/> Hallway</button>
                  <button onClick={() => addFeature('stairs')} className={sidebarButtonClass}><Layers size={14}/> Stairs</button>
                  <button onClick={() => addFeature('entry')} className={sidebarButtonClass}><LogOut size={14}/> Entry</button>
                  <button onClick={() => addFeature('balcony')} className={sidebarButtonClass}><Wind size={14}/> Balcony</button>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b pb-1">Kitchen & Utility</h2>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => addFeature('fridge')} className={sidebarButtonClass}><Refrigerator size={14}/> Fridge</button>
                  <button onClick={() => addFeature('range')} className={sidebarButtonClass}><Zap size={14}/> Range</button>
                  <button onClick={() => addFeature('dishwasher')} className={sidebarButtonClass}><Waves size={14}/> DishW</button>
                  <button onClick={() => addFeature('sink-double')} className={sidebarButtonClass}><Settings size={14}/> Sink x2</button>
                  <button onClick={() => addFeature('sink-single')} className={sidebarButtonClass}><Settings size={14}/> Sink x1</button>
                  <button onClick={() => addFeature('kitchen-island')} className={sidebarButtonClass}><Utensils size={14}/> Island</button>
                  <button onClick={() => addFeature('pantry')} className={sidebarButtonClass}><Box size={14}/> Pantry</button>
                  <button onClick={() => addFeature('washer-dryer')} className={sidebarButtonClass}><Waves size={14}/> W/D</button>
                  <button onClick={() => addFeature('water-heater')} className={sidebarButtonClass}><Flame size={14}/> Heater</button>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b pb-1">Bath & Private</h2>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => addFeature('bathroom')} className={sidebarButtonClass}><Bath size={14}/> Bath Unit</button>
                  <button onClick={() => addFeature('toilet')} className={sidebarButtonClass}><Bath size={14}/> Toilet</button>
                  <button onClick={() => addFeature('shower')} className={sidebarButtonClass}><Waves size={14}/> Shower</button>
                  <button onClick={() => addFeature('bathtub')} className={sidebarButtonClass}><Bath size={14}/> Bath</button>
                  <button onClick={() => addFeature('vanity-single')} className={sidebarButtonClass}><Bath size={14}/> Vanity S</button>
                  <button onClick={() => addFeature('vanity-double')} className={sidebarButtonClass}><Bath size={14}/> Vanity D</button>
                  <button onClick={() => addFeature('linen')} className={sidebarButtonClass}><Layers size={14}/> Linen</button>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b pb-1">Furniture & Living</h2>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => addFeature('single-bed')} className={sidebarButtonClass}><Bed size={14}/> Bed S</button>
                  <button onClick={() => addFeature('double-bed')} className={sidebarButtonClass}><Bed size={14}/> Bed D</button>
                  <button onClick={() => addFeature('sofa')} className={sidebarButtonClass}><Armchair size={14}/> Sofa</button>
                  <button onClick={() => addFeature('table')} className={sidebarButtonClass}><TableIcon size={14}/> Table</button>
                  <button onClick={() => addFeature('desk')} className={sidebarButtonClass}><Monitor size={14}/> Desk</button>
                  <button onClick={() => addFeature('fireplace')} className={sidebarButtonClass}><Flame size={14}/> Fireplace</button>
                </div>
              </section>

              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isConverting} className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-[10px] font-black text-indigo-700 hover:bg-indigo-100 shadow-sm transition-all active:scale-95">
                {isConverting ? <Loader2 size={16} className="animate-spin"/> : <Upload size={16}/>}
                {isConverting ? 'ANALYZING...' : 'IMPORT IMAGE / SCREENSHOT'}
              </button>

              {state.backgroundUrl && (
                <button type="button" onClick={removeBackground} className="w-full flex items-center justify-center gap-2 p-2 mt-2 bg-red-50 border border-red-200 rounded-xl text-[10px] font-black text-red-600 hover:bg-red-100 shadow-sm transition-all active:scale-95">
                  <ImageOff size={14}/> REMOVE BACKGROUND (FREE SPACE)
                </button>
              )}

              {(selectedRoom || selectedFeature || selectedExit) && (
                <div className="p-4 bg-slate-900 rounded-2xl space-y-4 shadow-xl animate-in zoom-in-95">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Settings</span>
                    <button type="button" onClick={deleteSelected} className="text-red-400 hover:text-red-300 p-1 hover:bg-white/10 rounded-lg"><Trash2 size={16}/></button>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                        <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Label / Name</label>
                        <input type="text" value={selectedRoom?.name || selectedFeature?.label || selectedExit?.label || ''} 
                          onChange={e => {
                            if (selectedRoom) updateRoom(selectedRoom.id, {name: e.target.value});
                            else if (selectedFeature) updateFeature(selectedFeature.id, {label: e.target.value});
                            else if (selectedExit) updateExit(selectedExit.id, {label: e.target.value});
                          }}
                          onBlur={() => pushHistory(state)}
                          className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:ring-1 focus:ring-indigo-400"
                          placeholder="Enter label..."
                        />
                    </div>

                    {/* Specific Thickness control for Walls and Fences */}
                    {selectedFeature && FIXED_THICKNESS_TYPES.includes(selectedFeature.type) && (
                        <div className="space-y-1">
                            <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Thickness (px)</label>
                            <div className="flex items-center gap-2">
                                <button onClick={() => {
                                    updateFeature(selectedFeature.id, { height: Math.max(2, selectedFeature.height - 1) });
                                    pushHistory(state);
                                }} className="p-2 bg-white/10 rounded-lg text-white hover:bg-indigo-500 transition-colors"><Minus size={14}/></button>
                                
                                <div className="flex-1 text-center font-bold text-white text-xs py-2 bg-white/5 rounded-lg">
                                    {selectedFeature.height} px
                                </div>

                                <button onClick={() => {
                                    updateFeature(selectedFeature.id, { height: Math.max(2, selectedFeature.height + 1) });
                                    pushHistory(state);
                                }} className="p-2 bg-white/10 rounded-lg text-white hover:bg-indigo-500 transition-colors"><Plus size={14}/></button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Font Size</label>
                      <div className="flex items-center gap-2">
                        <button onClick={() => {
                            const delta = -1;
                            if (selectedRoom) updateRoom(selectedRoom.id, { fontSize: Math.max(6, (selectedRoom.fontSize || 9) + delta) });
                            else if (selectedExit) updateExit(selectedExit.id, { fontSize: Math.max(6, (selectedExit.fontSize || 9) + delta) });
                            else if (selectedFeature) {
                                let current = selectedFeature.fontSize;
                                if (!current) {
                                     // Calculate default to start from if not set
                                     if (selectedFeature.type === 'label') current = Math.max(12, selectedFeature.height * 0.6);
                                     else current = 8;
                                }
                                updateFeature(selectedFeature.id, { fontSize: Math.max(6, Math.round(current + delta)) });
                            }
                            pushHistory(state);
                        }} className="p-2 bg-white/10 rounded-lg text-white hover:bg-indigo-500 transition-colors"><Minus size={14}/></button>
                        
                        <div className="flex-1 text-center font-bold text-white text-xs py-2 bg-white/5 rounded-lg">
                           {(selectedRoom?.fontSize || selectedFeature?.fontSize || selectedExit?.fontSize || 'Auto')} px
                        </div>

                        <button onClick={() => {
                            const delta = 1;
                            if (selectedRoom) updateRoom(selectedRoom.id, { fontSize: Math.max(6, (selectedRoom.fontSize || 9) + delta) });
                            else if (selectedExit) updateExit(selectedExit.id, { fontSize: Math.max(6, (selectedExit.fontSize || 9) + delta) });
                            else if (selectedFeature) {
                                let current = selectedFeature.fontSize;
                                if (!current) {
                                     if (selectedFeature.type === 'label') current = Math.max(12, selectedFeature.height * 0.6);
                                     else current = 8;
                                }
                                updateFeature(selectedFeature.id, { fontSize: Math.max(6, Math.round(current + delta)) });
                            }
                            pushHistory(state);
                        }} className="p-2 bg-white/10 rounded-lg text-white hover:bg-indigo-500 transition-colors"><Plus size={14}/></button>

                        <button onClick={() => {
                            if (selectedRoom) updateRoom(selectedRoom.id, { fontSize: undefined });
                            else if (selectedFeature) updateFeature(selectedFeature.id, { fontSize: undefined });
                            else if (selectedExit) updateExit(selectedExit.id, { fontSize: undefined });
                            pushHistory(state);
                        }} className="p-2 bg-white/10 rounded-lg text-white hover:bg-indigo-500 transition-colors" title="Reset Font Size"><ResetIcon size={14}/></button>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Label Position</label>
                      <div className="grid grid-cols-2 gap-2">
                         <button type="button" onClick={() => {
                            if (selectedRoom) updateRoom(selectedRoom.id, { labelX: 0, labelY: 0 });
                            else if (selectedFeature) updateFeature(selectedFeature.id, { labelX: 0, labelY: 0 });
                            else if (selectedExit) updateExit(selectedExit.id, { labelX: 0, labelY: 0 });
                            pushHistory(state);
                         }} className="flex items-center justify-center gap-2 p-2 bg-white/10 rounded-lg text-xs font-bold text-white hover:bg-indigo-500 transition-colors">
                            <ResetIcon size={12}/> Reset Pos
                         </button>
                         <button type="button" onClick={() => {
                            if (selectedRoom) updateRoom(selectedRoom.id, { labelX: selectedRoom.width/2 - 8, labelY: selectedRoom.height/2 - 18 });
                            else if (selectedFeature) updateFeature(selectedFeature.id, { labelX: 0, labelY: -(selectedFeature.height/2 + 11) });
                            else if (selectedExit) updateExit(selectedExit.id, { labelX: 0, labelY: -28 });
                            pushHistory(state);
                         }} className="flex items-center justify-center gap-2 p-2 bg-white/10 rounded-lg text-xs font-bold text-white hover:bg-indigo-500 transition-colors">
                            <AlignCenter size={12}/> Center
                         </button>
                      </div>
                    </div>
                    
                    {/* Rotation Control for All Types */}
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Rotation</label>
                      <div className="flex items-center gap-2">
                          <button onClick={() => {
                            const item = selectedRoom || selectedFeature || selectedExit;
                            if(item) {
                                const newRot = (item.rotation - 90 + 360) % 360;
                                if (selectedRoom) updateRoom(selectedRoom.id, {rotation: newRot});
                                else if (selectedFeature) updateFeature(selectedFeature.id, {rotation: newRot});
                                else if (selectedExit) updateExit(selectedExit.id, {rotation: newRot});
                                pushHistory(state); // Push history after click
                            }
                          }} className="p-2 bg-white/10 rounded-lg text-white hover:bg-indigo-500 transition-colors"><RotateCcw size={14}/></button>
                          
                          <input type="range" min="0" max="360" step="15" 
                            value={selectedRoom?.rotation || selectedFeature?.rotation || selectedExit?.rotation || 0} 
                            onChange={e => {
                                const val = Number(e.target.value);
                                if (selectedRoom) updateRoom(selectedRoom.id, {rotation: val});
                                else if (selectedFeature) updateFeature(selectedFeature.id, {rotation: val});
                                else if (selectedExit) updateExit(selectedExit.id, {rotation: val});
                            }}
                            onMouseUp={() => pushHistory(state)}
                            className="flex-1 accent-indigo-500 cursor-pointer"
                          />
                          
                          <button onClick={() => {
                            const item = selectedRoom || selectedFeature || selectedExit;
                            if(item) {
                                const newRot = (item.rotation + 90) % 360;
                                if (selectedRoom) updateRoom(selectedRoom.id, {rotation: newRot});
                                else if (selectedFeature) updateFeature(selectedFeature.id, {rotation: newRot});
                                else if (selectedExit) updateExit(selectedExit.id, {rotation: newRot});
                                pushHistory(state); // Push history after click
                            }
                          }} className="p-2 bg-white/10 rounded-lg text-white hover:bg-indigo-500 transition-colors"><RotateCw size={14}/></button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {(state.mode === 'safety' || state.mode === 'route') && (
             <div className="space-y-6 animate-in fade-in slide-in-from-left-4">
                <section className="space-y-3">
                   <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b pb-1">Safety Equipment</h2>
                   <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => addExit('primary')} className={sidebarButtonClass}><LogOut size={14}/> Primary Exit</button>
                      <button onClick={() => addExit('secondary')} className={sidebarButtonClass}><LogOut size={14}/> Secondary Exit</button>
                      <button onClick={() => addExit('fire-alarm')} className={sidebarButtonClass}><Bell size={14}/> Alarm</button>
                      <button onClick={() => addExit('extinguisher')} className={sidebarButtonClass}><Flame size={14}/> Extinguisher</button>
                      <button onClick={() => addExit('first-aid')} className={sidebarButtonClass}><Stethoscope size={14}/> First Aid</button>
                   </div>
                </section>
                
                <section className="space-y-3">
                   <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b pb-1">Evacuation Routes</h2>
                   <button onClick={startRoute} className={`w-full flex items-center justify-center gap-2 p-3 border rounded-xl text-[10px] font-black transition-all shadow-sm ${state.mode === 'route' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400'}`}>
                      <ArrowUpRight size={16}/> {state.mode === 'route' ? 'DRAWING ROUTE...' : 'DRAW EVACUATION ROUTE'}
                   </button>
                   <p className="text-[9px] text-slate-400">Click on canvas to place points. Click Finish when done.</p>
                </section>

                <section className="space-y-3">
                   <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b pb-1">AI Analysis</h2>
                   <button onClick={handleAIAnalysis} disabled={isAnalyzing} className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black hover:bg-indigo-700 shadow-md transition-all">
                      {isAnalyzing ? <Loader2 size={16} className="animate-spin"/> : <BrainCircuit size={16}/>}
                      ANALYZE SAFETY PLAN
                   </button>
                </section>
             </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header with Project Tabs and Controls */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-20 shadow-sm print:hidden">
            {/* Tabs Container */}
          <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar mr-6">
            {tabs.map(tab => (
              <div 
                key={tab.id}
                onClick={() => handleSwitchProject(tab)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer group flex-shrink-0
                   ${tab.id === state.projectId 
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm' 
                      : 'text-slate-500 hover:bg-slate-100 border border-transparent hover:border-slate-200'}`}
              >
                 <FileText size={14} className={tab.id === state.projectId ? 'text-indigo-600' : 'text-slate-400'}/>
                 <span className="max-w-[120px] truncate">{tab.name || 'Untitled'}</span>
                 <button onClick={(e) => handleDeleteProject(tab.id, e)} className={`p-0.5 rounded-md hover:bg-red-100 hover:text-red-600 transition-all ${tab.id === state.projectId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} title="Delete Project"><X size={12} /></button>
              </div>
            ))}
            <button onClick={handleNewProject} className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-all ml-1 flex-shrink-0" title="New Project"><Plus size={16}/></button>
          </div>
          
          <div className="flex items-center gap-2">
             <div className="flex items-center gap-0.5 mr-2 border border-slate-200 rounded-lg bg-white p-1">
               <button onClick={undo} disabled={historyIndex <= 0} className={`p-1.5 rounded-md transition-all ${historyIndex > 0 ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300'}`} title="Undo"><Undo size={14} /></button>
               <button onClick={redo} disabled={historyIndex >= history.length - 1} className={`p-1.5 rounded-md transition-all ${historyIndex < history.length - 1 ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300'}`} title="Redo"><Redo size={14} /></button>
               <div className="w-px h-4 bg-slate-200 mx-1"></div>
               <button onClick={handleCopy} disabled={!state.selectedId} className={`p-1.5 rounded-md transition-all ${state.selectedId ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300'}`} title="Copy"><Copy size={14} /></button>
               <button onClick={handlePaste} disabled={!clipboard} className={`p-1.5 rounded-md transition-all ${clipboard ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300'}`} title="Paste"><Clipboard size={14} /></button>
             </div>
             
             {/* Scale Control */}
            <div className="flex items-center gap-1 mr-2 border border-slate-200 rounded-lg bg-white p-1" title="Scale">
               <button onClick={() => setState(p => ({...p, scale: Math.max(0.2, p.scale - 0.1)}))} className="p-1 hover:bg-slate-100 rounded text-slate-600"><Minus size={12}/></button>
               <span className="text-[10px] font-bold w-8 text-center">{Math.round(state.scale * 100)}%</span>
               <button onClick={() => setState(p => ({...p, scale: Math.min(2, p.scale + 0.1)}))} className="p-1 hover:bg-slate-100 rounded text-slate-600"><Plus size={12}/></button>
            </div>

            {/* Screen Size */}
            <select value={`${state.canvasWidth}x${state.canvasHeight}`} onChange={handleCanvasSizeChange} className="bg-white border border-slate-200 text-[10px] font-bold rounded-lg p-1.5 outline-none shadow-sm cursor-pointer w-24">
                 <option value="screen">Fit Screen</option>
                 {standardSizes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <button onClick={handleRotatePlan} className="p-2 mr-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-indigo-600 hover:border-indigo-400 transition-all" title="Rotate Plan 90°">
              <RefreshCcw size={16}/>
            </button>

            {/* Grid Controls */}
            <div className="flex items-center gap-1 mr-2 border border-slate-200 rounded-lg bg-white p-1">
              <button
                type="button"
                onClick={() => setState(prev => ({...prev, snapToGrid: !prev.snapToGrid}))}
                title="Toggle Snap to Grid"
                className={`p-1.5 rounded-md transition-all ${state.snapToGrid ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Grid3X3 size={16} />
              </button>
              <button
                type="button"
                onClick={() => setState(prev => ({...prev, snapToObjects: !prev.snapToObjects}))}
                title="Toggle Object Snap (Magnetic)"
                className={`p-1.5 rounded-md transition-all ${state.snapToObjects !== false ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Magnet size={16} />
              </button>
              <button 
                type="button"
                onClick={() => setState(prev => ({...prev, showDimensions: !prev.showDimensions}))}
                className={`p-1.5 rounded-md transition-all ${state.showDimensions ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}
                title="Show Dimensions"
              >
                <Ruler size={16}/>
              </button>
            </div>
            
            <div className="w-px h-6 bg-slate-200 mx-1" />

             <button type="button" onClick={handlePrint} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all active:scale-95"><Printer size={16}/></button>
             <button type="button" onClick={handleExportPNG} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-[10px] font-black hover:bg-slate-700 transition-all shadow-md active:scale-95"><Download size={16}/></button>
          </div>
        </header>

        {/* Canvas Area */}
        <div className="flex-1 relative overflow-auto p-12 flex items-start justify-center bg-slate-200/50 print:bg-white print:p-0">
         
         {/* Analysis Overlay */}
         {analysisResult && (
            <div className="absolute top-4 right-4 w-80 bg-white rounded-xl shadow-xl border border-indigo-100 overflow-hidden z-20 animate-in slide-in-from-right-10">
                <div className="p-3 bg-indigo-600 text-white font-bold flex justify-between items-center">
                   <span className="flex items-center gap-2"><BrainCircuit size={16}/> AI Analysis</span>
                   <button onClick={() => setAnalysisResult(null)} className="hover:bg-white/20 p-1 rounded"><X size={14}/></button>
                </div>
                <div className="p-4 text-xs leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap text-slate-600 custom-scrollbar">
                    {analysisResult}
                </div>
            </div>
         )}
         
         <div ref={canvasRef} 
              className="bg-white shadow-2xl relative transition-all duration-300 ease-out border-2 border-slate-300 rounded-lg print:border-none print:shadow-none"
              style={{ width: state.canvasWidth, height: state.canvasHeight, cursor: state.mode === 'route' ? 'crosshair' : 'default' }}
              onClick={handleCanvasClick}
         >
             {/* Background Image */}
             {state.backgroundUrl && <img src={state.backgroundUrl} className="absolute inset-0 w-full h-full object-contain opacity-40 pointer-events-none" />}
             
             <svg ref={svgRef} width="100%" height="100%" className="absolute inset-0 overflow-visible" viewBox={`0 0 ${state.canvasWidth} ${state.canvasHeight}`}>
                <rect width={state.canvasWidth} height={state.canvasHeight} fill="white" className="hidden print:block" />
                <defs>
                   <pattern id="grid" width={state.gridSize} height={state.gridSize} patternUnits="userSpaceOnUse">
                      <path d={`M ${state.gridSize} 0 L 0 0 0 ${state.gridSize}`} fill="none" stroke="#f1f5f9" strokeWidth="1"/>
                   </pattern>
                   <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155" />
                   </marker>
                </defs>
                {state.snapToGrid && <rect width="100%" height="100%" fill="url(#grid)" className="print:hidden" />}

                {/* Routes Layer (Bottom) */}
                {state.routes.map(route => (
                   <polyline key={route.id} points={route.points.map(p => `${p.x},${p.y}`).join(' ')} 
                             fill="none" stroke={route.color} strokeWidth={4} strokeDasharray="8 6" opacity={0.8} strokeLinecap="round" strokeLinejoin="round" />
                ))}
                {/* Active Route Drawing */}
                {activeRoute && activeRoute.length > 0 && (
                   <polyline points={activeRoute.map(p => `${p.x},${p.y}`).join(' ')} 
                             fill="none" stroke="#ef4444" strokeWidth={4} strokeDasharray="8 6" className="animate-pulse" />
                )}

                {/* Snap Indicator */}
                {state.snapIndicator && (
                    <circle cx={state.snapIndicator.x} cy={state.snapIndicator.y} r={6} fill="none" stroke="#ec4899" strokeWidth={2} className="animate-ping opacity-75" />
                )}
                {state.snapIndicator && (
                    <circle cx={state.snapIndicator.x} cy={state.snapIndicator.y} r={3} fill="#ec4899" />
                )}

                {/* Rooms Layer */}
                {state.rooms.map(room => (
                   <g key={room.id} transform={`rotate(${room.rotation || 0}, ${room.x + room.width/2}, ${room.y + room.height/2})`}
                      onMouseDown={(e) => onMouseDown(e, 'room', room.id)}
                      onClick={(e) => e.stopPropagation()}
                      className={`cursor-move group ${state.selectedId === room.id ? 'opacity-100' : 'opacity-100'}`}
                   >
                      <rect x={room.x} y={room.y} width={room.width} height={room.height} fill="white" stroke={state.selectedId === room.id ? '#4f46e5' : '#334155'} strokeWidth={state.selectedId === room.id ? 3 : 2} />
                      <text x={room.x + 8 + (room.labelX || 0)} y={room.y + 18 + (room.labelY || 0)} className="font-black fill-slate-800 uppercase pointer-events-none tracking-widest" style={{ fontSize: room.fontSize || 9 }}>{room.name}</text>
                      
                      {state.showDimensions && (
                        <>
                          <text x={room.x + room.width / 2} y={room.y - 8} textAnchor="middle" className="text-[10px] font-black fill-indigo-600 print:hidden">{formatDim(room.width)}</text>
                          <text x={room.x - 8} y={room.y + room.height / 2} textAnchor="middle" transform={`rotate(-90, ${room.x - 8}, ${room.y + room.height / 2})`} className="text-[10px] font-black fill-indigo-600 print:hidden">{formatDim(room.height)}</text>
                        </>
                      )}
                      
                      {/* Interaction Handles */}
                      {state.selectedId === room.id && (
                         <>
                            <circle cx={room.x + 8 + (room.labelX || 0) - 6} cy={room.y + 18 + (room.labelY || 0) - 3} r={3} fill="#f59e0b" className="cursor-move print:hidden" onMouseDown={e => onMouseDown(e, 'label_move', room.id)} />
                            <circle cx={room.x + room.width} cy={room.y + room.height} r={6} fill="white" stroke="#6366f1" strokeWidth={2} className="cursor-nwse-resize print:hidden" onMouseDown={(e) => onMouseDown(e, 'resize', room.id)} />
                            <g className="print:hidden cursor-grab active:cursor-grabbing group/rotate" onMouseDown={e => onMouseDown(e, 'rotate', room.id)}>
                                <line x1={room.x + room.width/2} y1={room.y} x2={room.x + room.width/2} y2={room.y - 25} stroke="#4f46e5" strokeWidth="2" />
                                <circle cx={room.x + room.width/2} cy={room.y - 25} r={6} className="fill-white stroke-indigo-600 stroke-2 group-hover/rotate:fill-indigo-100" />
                            </g>
                         </>
                      )}
                   </g>
                ))}

                {/* Features Layer */}
                {state.features.map(f => {
                    const isSelected = state.selectedId === f.id;
                    return (
                       <g key={f.id} transform={`translate(${f.x},${f.y}) rotate(${f.rotation}, ${f.width/2}, ${f.height/2})`}
                          onMouseDown={(e) => onMouseDown(e, 'feature', f.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="cursor-move group"
                       >
                          {/* --- Feature Rendering Block --- */}
                          {f.type === 'door' && (
                             <g>
                              <path d={`M 0,${f.height} A ${f.width},${f.height} 0 0 1 ${f.width},0`} fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="4 2"/>
                              <line x1="0" y1="0" x2="0" y2={f.height} stroke="#334155" strokeWidth="4" />
                             </g>
                          )}
                          {f.type === 'sliding-door' && (
                            <g>
                              <rect width={f.width} height={f.height} fill="white" stroke="#334155" strokeWidth="1" />
                              <line x1={0} y1={f.height*0.3} x2={f.width*0.6} y2={f.height*0.3} stroke="#334155" strokeWidth="2" />
                              <line x1={f.width*0.4} y1={f.height*0.7} x2={f.width} y2={f.height*0.7} stroke="#334155" strokeWidth="2" />
                            </g>
                          )}
                           {f.type === 'window' && (
                            <g>
                              <rect width={f.width} height={f.height} fill="#e0f2fe" stroke="#334155" strokeWidth="2" />
                              <line x1={0} y1={f.height/2} x2={f.width} y2={f.height/2} stroke="#334155" strokeWidth="1" />
                            </g>
                          )}
                          {f.type === 'wall' && (
                            <rect width={f.width} height={f.height} fill="#94a3b8" rx={2} />
                          )}
                          {f.type === 'fence' && (
                            <g>
                              <rect width={f.width} height={f.height} fill="#78350f" rx={1} />
                              {[...Array(Math.floor(f.width / 30) + 1)].map((_, i) => (
                                 <circle key={i} cx={Math.min(i * 30, f.width - (f.height/2))} cy={f.height/2} r={f.height} fill="#78350f" />
                              ))}
                            </g>
                          )}
                          {f.type === 'stairs' && (
                            <g>
                              <rect width={f.width} height={f.height} fill="white" stroke="#334155" strokeWidth="1" />
                              {[...Array(8)].map((_, i) => (
                                 <line key={i} x1={0} y1={f.height * (i/8)} x2={f.width} y2={f.height * (i/8)} stroke="#cbd5e1" strokeWidth="1" />
                              ))}
                              <line x1={f.width/2} y1={f.height*0.1} x2={f.width/2} y2={f.height*0.9} stroke="#334155" strokeWidth="1" markerEnd="url(#arrow)" />
                            </g>
                          )}
                          {(f.type === 'single-bed' || f.type === 'double-bed') && (
                            <g>
                              <rect width={f.width} height={f.height} fill="#f8fafc" stroke="#334155" strokeWidth="2" rx={2} />
                              <rect x={2} y={2} width={f.width-4} height={f.height*0.25} fill="#e2e8f0" rx={2} /> 
                              <path d={`M 2,${f.height*0.35} Q ${f.width/2},${f.height*0.45} ${f.width-2},${f.height*0.35}`} fill="none" stroke="#cbd5e1" />
                            </g>
                          )}
                          {(f.type.includes('sink') || f.type.includes('vanity')) && (
                            <g>
                              <rect width={f.width} height={f.height} fill="#f1f5f9" stroke="#334155" strokeWidth="1" />
                              {f.type.includes('double') ? (
                                 <>
                                   <ellipse cx={f.width*0.25} cy={f.height/2} rx={Math.min(f.width, f.height)*0.2} ry={Math.min(f.width, f.height)*0.25} fill="white" stroke="#94a3b8" />
                                   <ellipse cx={f.width*0.75} cy={f.height/2} rx={Math.min(f.width, f.height)*0.2} ry={Math.min(f.width, f.height)*0.25} fill="white" stroke="#94a3b8" />
                                 </>
                              ) : (
                                   <ellipse cx={f.width/2} cy={f.height/2} rx={Math.min(f.width, f.height)*0.3} ry={Math.min(f.width, f.height)*0.35} fill="white" stroke="#94a3b8" />
                              )}
                            </g>
                          )}
                          {f.type === 'toilet' && (
                            <g>
                              <rect x={f.width*0.15} y={0} width={f.width*0.7} height={f.height*0.25} fill="white" stroke="#334155" strokeWidth="1" />
                              <ellipse cx={f.width/2} cy={f.height*0.6} rx={f.width*0.35} ry={f.height*0.35} fill="white" stroke="#334155" strokeWidth="1" />
                            </g>
                          )}
                          {f.type === 'shower' && (
                            <g>
                              <rect width={f.width} height={f.height} fill="white" stroke="#334155" strokeWidth="1" />
                              <line x1={0} y1={0} x2={f.width} y2={f.height} stroke="#e2e8f0" />
                              <line x1={f.width} y1={0} x2={0} y2={f.height} stroke="#e2e8f0" />
                              <circle cx={f.width/2} cy={f.height/2} r={3} fill="white" stroke="#334155" />
                            </g>
                          )}
                          {f.type === 'bathtub' && (
                            <g>
                              <rect width={f.width} height={f.height} fill="white" stroke="#334155" strokeWidth="1" />
                              <rect x={4} y={4} width={f.width-8} height={f.height-8} rx={f.height/3} fill="#f1f5f9" stroke="#94a3b8" />
                            </g>
                          )}
                          {f.type === 'sofa' && (
                            <g>
                              <rect width={f.width} height={f.height} rx={4} fill="#f1f5f9" stroke="#334155" />
                              <path d={`M 0,0 L 0,${f.height} L ${f.width},${f.height} L ${f.width},0`} fill="none" stroke="none" />
                              <rect x={0} y={0} width={f.width} height={f.height*0.2} fill="#e2e8f0" stroke="#94a3b8" />
                              <rect x={0} y={0} width={f.width*0.15} height={f.height} fill="#e2e8f0" stroke="#94a3b8" />
                              <rect x={f.width*0.85} y={0} width={f.width*0.15} height={f.height} fill="#e2e8f0" stroke="#94a3b8" />
                            </g>
                          )}
                          {f.type === 'range' && (
                            <g>
                              <rect width={f.width} height={f.height} fill="#f8fafc" stroke="#334155" />
                              <circle cx={f.width*0.25} cy={f.height*0.25} r={f.width*0.15} fill="none" stroke="#94a3b8" />
                              <circle cx={f.width*0.75} cy={f.height*0.25} r={f.width*0.15} fill="none" stroke="#94a3b8" />
                              <circle cx={f.width*0.25} cy={f.height*0.75} r={f.width*0.15} fill="none" stroke="#94a3b8" />
                              <circle cx={f.width*0.75} cy={f.height*0.75} r={f.width*0.15} fill="none" stroke="#94a3b8" />
                            </g>
                          )}
                          {f.type === 'fridge' && (
                            <g>
                                <rect width={f.width} height={f.height} fill="white" stroke="#334155" />
                                <line x1={0} y1={f.height*0.3} x2={f.width} y2={f.height*0.3} stroke="#e2e8f0" />
                                <text x={f.width/2} y={f.height*0.15} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(10, f.width/3)} fill="#94a3b8">Ref</text>
                            </g>
                          )}
                          {f.type === 'dishwasher' && (
                            <g>
                                <rect width={f.width} height={f.height} fill="white" stroke="#334155" />
                                <rect x={0} y={0} width={f.width} height={f.height*0.2} fill="#e2e8f0" />
                                <circle cx={f.width*0.2} cy={f.height*0.1} r={2} fill="#94a3b8" />
                                <circle cx={f.width*0.35} cy={f.height*0.1} r={2} fill="#94a3b8" />
                                <text x={f.width/2} y={f.height*0.6} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(10, f.width/3)} fill="#94a3b8">DW</text>
                            </g>
                          )}
                          {f.type === 'fireplace' && (
                            <g>
                                <rect width={f.width} height={f.height} fill="#fff7ed" stroke="#7c2d12" />
                                <rect x={f.width*0.2} y={f.height*0.2} width={f.width*0.6} height={f.height*0.8} fill="#451a03" />
                                <path d={`M ${f.width*0.5},${f.height*0.8} Q ${f.width*0.3},${f.height*0.5} ${f.width*0.5},${f.height*0.3} Q ${f.width*0.7},${f.height*0.5} ${f.width*0.5},${f.height*0.8}`} fill="#ea580c" />
                            </g>
                          )}
                          {(['table', 'desk', 'kitchen-island'].includes(f.type)) && (
                            <rect width={f.width} height={f.height} fill="#fff7ed" stroke="#7c2d12" strokeWidth="1" rx={2} />
                          )}
                          {f.type === 'washer-dryer' && (
                            <g>
                              <rect width={f.width} height={f.height} fill="white" stroke="#334155" />
                              <text x={f.width/2} y={f.height/2} dominantBaseline="middle" textAnchor="middle" fontSize={10} fill="#94a3b8">W/D</text>
                            </g>
                          )}
                          {(f.type === 'closet-unit' || f.type === 'closet-double') && (
                              <g>
                                  <rect width={f.width} height={f.height} fill="#f8fafc" stroke="#334155" strokeWidth="1" />
                                  <line x1={0} y1={f.height/2} x2={f.width} y2={f.height/2} stroke="#cbd5e1" strokeDasharray="2 2" />
                                  <line x1={2} y1={2} x2={f.width-2} y2={f.height-2} stroke="#e2e8f0" />
                                  <line x1={2} y1={f.height-2} x2={f.width-2} y2={2} stroke="#e2e8f0" />
                              </g>
                          )}
                          {f.type === 'bathroom' && (
                            <g>
                              <rect width={f.width} height={f.height} fill="#f0f9ff" stroke="#334155" strokeWidth="2" />
                              <rect x={f.width*0.1} y={f.height*0.1} width={f.width*0.25} height={f.height*0.25} fill="white" stroke="#94a3b8" rx={2} />
                              <circle cx={f.width*0.225} cy={f.height*0.225} r={f.width*0.05} fill="#cbd5e1" />
                              <rect x={f.width*0.6} y={f.height*0.1} width={f.width*0.3} height={f.height*0.2} fill="white" stroke="#94a3b8" />
                              <text x={f.width/2} y={f.height*0.7} textAnchor="middle" className="text-[10px] font-bold fill-slate-400">BATH</text>
                            </g>
                          )}
                          {/* Generic Fallback for other items */}
                          {!['door', 'sliding-door', 'window', 'wall', 'fence', 'bathroom', 'stairs', 'single-bed', 'double-bed', 'toilet', 'shower', 'bathtub', 'sofa', 'range', 'table', 'desk', 'kitchen-island', 'washer-dryer', 'closet-unit', 'closet-double', 'fridge', 'dishwasher', 'fireplace'].includes(f.type) && !f.type.includes('sink') && !f.type.includes('vanity') && f.type !== 'label' && (
                             <rect width={f.width} height={f.height} fill="#f1f5f9" stroke="#334155" strokeWidth="2" rx={2}/>
                          )}
                          {f.type === 'label' && (
                            <rect width={f.width} height={f.height} fill="transparent" stroke={isSelected ? "#4f46e5" : "none"} strokeWidth="1" strokeDasharray="4 2" />
                          )}

                          {/* Label Rendering */}
                          <text 
                            x={f.width/2 + (f.labelX || 0)} 
                            y={f.type === 'label' ? f.height/2 + (f.labelY||0) : f.height + 11 + (f.labelY || 0)} 
                            dominantBaseline="middle" 
                            textAnchor="middle" 
                            className="font-bold fill-slate-900 pointer-events-none select-none"
                            style={{ fontSize: f.fontSize || (f.type === 'label' ? Math.max(12, f.height * 0.6) : 8) }}
                          >
                            {f.label}
                          </text>
                          
                          {isSelected && (
                             <>
                                <circle cx={f.width} cy={f.height} r={5} fill="white" stroke="#6366f1" strokeWidth={2} className="cursor-nwse-resize print:hidden" onMouseDown={(e) => onMouseDown(e, 'resize', f.id)} />
                                <circle cx={f.width/2 + (f.labelX||0) + (f.type==='label'?6:6)} cy={(f.type === 'label' ? f.height/2 : f.height + 11) + (f.labelY||0) - (f.type==='label'?6:3)} r={3} fill="#f59e0b" className="cursor-move print:hidden" onMouseDown={(e) => onMouseDown(e, 'label_move', f.id)} />
                                <g className="print:hidden cursor-grab active:cursor-grabbing group/rotate" onMouseDown={e => onMouseDown(e, 'rotate', f.id)}>
                                    <line x1={f.width/2} y1={0} x2={f.width/2} y2={-25} stroke="#4f46e5" strokeWidth="2" />
                                    <circle cx={f.width/2} cy={-25} r={6} className="fill-white stroke-indigo-600 stroke-2 group-hover/rotate:fill-indigo-100" />
                                </g>
                             </>
                          )}
                       </g>
                    );
                })}

                {/* Exits Layer */}
                {state.exits.map(exit => (
                    <g key={exit.id} transform={`translate(${exit.x},${exit.y}) rotate(${exit.rotation})`}
                       onMouseDown={(e) => onMouseDown(e, 'exit', exit.id)}
                       onClick={(e) => e.stopPropagation()}
                       className="cursor-move"
                    >
                       {['extinguisher', 'fire-alarm', 'first-aid'].includes(exit.type) ? (
                           <circle r={8} fill={exit.type === 'first-aid' ? '#bfdbfe' : '#fecaca'} stroke={exit.type === 'first-aid' ? '#1d4ed8' : '#dc2626'} strokeWidth="2" />
                       ) : (
                           <rect x={-15} y={-10} width={30} height={20} fill="#dcfce7" stroke="#16a34a" strokeWidth="2" rx={4} />
                       )}
                       
                       {exit.type === 'extinguisher' && <text dy={3} textAnchor="middle" className="font-bold fill-red-700 text-[8px] pointer-events-none">EXT</text>}
                       {exit.type === 'fire-alarm' && <text dy={3} textAnchor="middle" className="font-bold fill-red-700 text-[8px] pointer-events-none">ALM</text>}
                       {exit.type === 'first-aid' && <text dy={3} textAnchor="middle" className="font-bold fill-blue-700 text-[8px] pointer-events-none">+</text>}
                       {exit.type === 'primary' && <text dy={4} textAnchor="middle" className="font-black fill-green-800 text-[8px] tracking-tighter pointer-events-none">EXIT</text>}
                       {exit.type === 'secondary' && <text dy={4} textAnchor="middle" className="font-black fill-green-800 text-[8px] tracking-tighter pointer-events-none">2ND</text>}

                       <text x={0 + (exit.labelX || 0)} y={20 + (exit.labelY || 0)} textAnchor="middle" fontSize={exit.fontSize || 8} fontWeight="bold" fill="#1e293b" className="select-none uppercase tracking-wider">{exit.label}</text>
                       
                       {state.selectedId === exit.id && (
                          <>
                            <circle cx={0} cy={-20} r={5} fill="#6366f1" className="cursor-grab print:hidden" onMouseDown={(e) => onMouseDown(e, 'rotate', exit.id)} />
                            <circle cx={0 + (exit.labelX||0) + 4} cy={20 + (exit.labelY||0) - 2} r={3} fill="#f59e0b" className="cursor-move print:hidden" onMouseDown={(e) => onMouseDown(e, 'label_move', exit.id)} />
                          </>
                       )}
                    </g>
                ))}
             </svg>
             
             {/* Floating Controls for Active Route */}
             {state.mode === 'route' && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl text-xs font-bold flex items-center gap-4 z-30 animate-in fade-in slide-in-from-bottom-4">
                   <div className="flex items-center gap-2 text-indigo-300"><PenTool size={14}/> <span>Click on map to place points</span></div>
                   <div className="h-4 w-px bg-slate-700"></div>
                   <button onClick={finishRoute} className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-full transition-colors">FINISH</button>
                   <button onClick={() => { setActiveRoute(null); setState(p => ({...p, mode: 'safety'})); }} className="hover:text-red-400 transition-colors">CANCEL</button>
                </div>
             )}
         </div>
      </main>
    </div>
  );
};

export default App;