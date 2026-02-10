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
  Minus
} from 'lucide-react';
import { Room, ExitPoint, HouseFeature, HouseDetails, AppState, SafetyRoute, RoutePoint, SavedProject } from './types';
import { analyzeSafetyPlan, convertSketchToDiagram } from './geminiService';

const DEFAULT_CANVAS_SIZE = 800;

const generateId = () => `id-${Math.random().toString(36).slice(2, 11)}-${Date.now()}`;

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
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    if (feet > 0) return `${feet}' ${inches}"`;
    return `${inches}"`;
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
      wall: { w: 200, h: 10 }, label: { w: 100, h: 30 }
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
         const next = { ...prev, routes: [...prev.routes, newRoute], mode: 'safety' };
         pushHistory(next);
         return next;
      });
    }
    setActiveRoute(null);
  };

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
    if (movingLabel) {
      const dx = e.clientX - movingLabel.startX;
      const dy = e.clientY - movingLabel.startY;
      
      // Rotate delta to match item's local coordinate system
      // Rotation is clockwise in SVG/CSS, so we rotate counter-clockwise to find local delta
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
      const nx = snap(e.clientX - draggingItem.offsetX);
      const ny = snap(e.clientY - draggingItem.offsetY);
      if (state.rooms.some(r => r.id === draggingItem.id)) updateRoom(draggingItem.id, { x: nx, y: ny });
      else if (state.features.some(f => f.id === draggingItem.id)) updateFeature(draggingItem.id, { x: nx, y: ny });
      else setState(prev => ({ ...prev, exits: prev.exits.map(ex => ex.id === draggingItem.id ? { ...ex, x: nx, y: ny } : ex) }));
    } else if (resizingItem) {
      const dw = e.clientX - resizingItem.startX;
      const dh = e.clientY - resizingItem.startY;
      
      const rawNewWidth = Math.max(state.gridSize, resizingItem.startW + dw);
      const rawNewHeight = Math.max(state.gridSize, resizingItem.startH + dh);
      
      const newWidth = state.snapToGrid ? Math.round(rawNewWidth / state.gridSize) * state.gridSize : rawNewWidth;
      const newHeight = state.snapToGrid ? Math.round(rawNewHeight / state.gridSize) * state.gridSize : rawNewHeight;
      
      if (state.rooms.some(r => r.id === resizingItem.id)) updateRoom(resizingItem.id, { width: newWidth, height: newHeight });
      else updateFeature(resizingItem.id, { width: newWidth, height: newHeight });
    }
  };

  const onMouseUp = () => { 
    setDraggingItem(null); 
    setResizingItem(null);
    setRotatingItem(null);
    setMovingLabel(null);
    
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
        // Sidebar is 320px (w-80), padding p-12 (48px) * 2 = 96px
        // Header is 64px (h-16), padding p-12 (48px) * 2 = 96px
        // Let's make it fill the available space comfortably minus margins
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
          
          {state.mode === 'safety' && (
             <div className="space-y-6 animate-in fade-in slide-in-from-left-4">
               {/* Safety Controls Logic... reused from previous code */}
               <section className="space-y-3">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b pb-1">Emergency Markers</h2>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => addExit('extinguisher')} className="flex flex-col items-center gap-1 p-3 bg-red-50 border border-red-200 rounded-xl text-[10px] font-black text-red-700 shadow-sm hover:bg-red-100 transition-colors"><Flame size={18}/> FIRE EXT.</button>
                  <button onClick={() => addExit('fire-alarm')} className="flex flex-col items-center gap-1 p-3 bg-red-50 border border-red-200 rounded-xl text-[10px] font-black text-red-700 shadow-sm hover:bg-red-100 transition-colors"><Bell size={18}/> ALARM</button>
                  <button onClick={() => addExit('first-aid')} className="flex flex-col items-center gap-1 p-3 bg-blue-50 border border-blue-200 rounded-xl text-[10px] font-black text-blue-700 shadow-sm hover:bg-blue-100 transition-colors"><Stethoscope size={18}/> FIRST AID</button>
                  <button onClick={() => addExit('primary')} className="flex flex-col items-center gap-1 p-3 bg-green-50 border border-green-200 rounded-xl text-[10px] font-black text-green-700 shadow-sm hover:bg-green-100 transition-colors"><ArrowUpRight size={18}/> PRIMARY EXIT</button>
                </div>
              </section>
              <button type="button" onClick={startRoute} className="w-full flex items-center justify-center gap-3 p-4 bg-red-600 text-white rounded-2xl text-[11px] font-black shadow-xl hover:bg-red-700 transition-all hover:scale-[1.02] active:scale-95">
                <PenTool size={18}/> DRAW EVACUATION PATH
              </button>
              <button type="button" onClick={handleAIAnalysis} disabled={isAnalyzing} className="w-full py-4 bg-slate-800 text-white rounded-2xl text-[11px] font-black flex items-center justify-center gap-3 shadow-2xl hover:bg-slate-700 transition-all active:scale-95">
                {isAnalyzing ? <Loader2 size={18} className="animate-spin"/> : <BrainCircuit size={18}/>}
                {isAnalyzing ? 'RUNNING AI SAFETY AUDIT...' : 'AI SAFETY AUDIT'}
              </button>
             </div>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* ... Header Code (unchanged) ... */}
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
               <button onClick={undo} disabled={historyIndex <= 0} className={`p-1.5 rounded-md transition-all ${historyIndex > 0 ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300'}`}><Undo size={14} /></button>
               <button onClick={redo} disabled={historyIndex >= history.length - 1} className={`p-1.5 rounded-md transition-all ${historyIndex < history.length - 1 ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300'}`}><Redo size={14} /></button>
               <div className="w-px h-4 bg-slate-200 mx-1"></div>
               <button onClick={handleCopy} disabled={!state.selectedId} className={`p-1.5 rounded-md transition-all ${state.selectedId ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300'}`}><Copy size={14} /></button>
               <button onClick={handlePaste} disabled={!clipboard} className={`p-1.5 rounded-md transition-all ${clipboard ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300'}`}><Clipboard size={14} /></button>
             </div>
             
             {/* Screen/Canvas Size */}
            <div className="flex items-center gap-1 mr-2 border border-slate-200 rounded-lg bg-white p-1" title="Canvas Size">
              <Scaling size={16} className="text-slate-400 ml-1"/>
              <select 
                value={currentSizeStr}
                onChange={handleCanvasSizeChange}
                className="text-[10px] font-black bg-transparent outline-none text-slate-600 w-24 text-center cursor-pointer"
              >
                <option value="800x800">Square (800x800)</option>
                <option value="1200x1200">Square L (1200x1200)</option>
                <option value="1024x768">Tablet (1024x768)</option>
                <option value="1200x800">Landscape (1200x800)</option>
                <option value="1600x900">HD+ (1600x900)</option>
                <option value="1920x1080">Full HD (1920x1080)</option>
                <option value="2000x1000">Wide (2000x1000)</option>
                <option value="screen">Fit to Screen</option>
                {!standardSizes.includes(currentSizeStr) && (
                   <option value={currentSizeStr}>Custom ({currentSizeStr})</option>
                )}
              </select>
            </div>

            {/* Rotate Whole Plan */}
            <button type="button" onClick={handleRotatePlan} className="p-2 mr-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-indigo-600 hover:border-indigo-400 transition-all" title="Rotate Plan 90°">
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
              <select 
                value={state.gridSize}
                onChange={(e) => setState(prev => ({...prev, gridSize: Number(e.target.value)}))}
                className="text-[10px] font-black bg-transparent outline-none text-slate-600 w-12 text-center cursor-pointer"
              >
                <option value="10">10px</option>
                <option value="20">20px</option>
                <option value="40">40px</option>
                <option value="50">50px</option>
              </select>
            </div>

            {/* Scale Control */}
            <div className="flex items-center gap-1 mr-2 border border-slate-200 rounded-lg bg-white p-1" title="Scale (Inches per Pixel)">
              <Scaling size={16} className="text-slate-400 ml-1"/>
              <select 
                value={state.scale}
                onChange={(e) => setState(prev => ({...prev, scale: Number(e.target.value)}))}
                className="text-[10px] font-black bg-transparent outline-none text-slate-600 w-20 text-center cursor-pointer"
              >
                <option value="0.25">1px = 0.25"</option>
                <option value="0.5">1px = 0.5"</option>
                <option value="0.6">1px = 0.6" (Def)</option>
                <option value="1">1px = 1"</option>
                <option value="2">1px = 2"</option>
                <option value="6">1px = 6"</option>
                <option value="12">1px = 1'</option>
              </select>
            </div>

            {/* Dimensions Toggle */}
            <button 
              type="button"
              onClick={() => setState(prev => ({...prev, showDimensions: !prev.showDimensions}))}
              className={`flex items-center gap-2 px-3 py-1.5 mr-2 rounded-lg border text-[10px] font-black tracking-widest transition-all ${state.showDimensions ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-400 hover:text-indigo-600'}`}
            >
              <Ruler size={14}/> DIMENSIONS
            </button>
            
            <div className="w-px h-6 bg-slate-200 mx-1" />

             {/* Other header controls ... */}
             <button type="button" onClick={handlePrint} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all active:scale-95"><Printer size={16}/> PRINT</button>
             <button type="button" onClick={handleExportPNG} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-[10px] font-black hover:bg-slate-700 transition-all shadow-md active:scale-95"><Download size={16}/> EXPORT PNG</button>
          </div>
        </header>

        <div className="flex-1 relative overflow-auto p-12 flex items-start justify-center bg-slate-100 print:bg-white print:p-0">
          <div 
            ref={canvasRef}
            key={`${state.projectId}-${state.canvasWidth}-${state.canvasHeight}`} 
            className="relative bg-white shadow-2xl rounded-lg border-2 border-slate-300 overflow-hidden print:shadow-none print:border-none"
            style={{ width: state.canvasWidth, height: state.canvasHeight, cursor: state.mode === 'route' ? 'crosshair' : 'default' }}
            onClick={handleCanvasClick}
          >
            {/* ... Background Grid & Image ... */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.05] print:hidden transition-all duration-300" style={{ backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`, backgroundSize: `${state.gridSize}px ${state.gridSize}px` }} />
            {state.backgroundUrl && <img src={state.backgroundUrl} className="absolute inset-0 w-full h-full object-contain opacity-20 pointer-events-none grayscale" />}

            <svg ref={svgRef} className="absolute inset-0 w-full h-full" viewBox={`0 0 ${state.canvasWidth} ${state.canvasHeight}`}>
              <rect width={state.canvasWidth} height={state.canvasHeight} fill="white" className="hidden print:block" />
              
              {/* Routes */}
              {state.routes.map(route => (
                <polyline key={route.id} points={route.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {activeRoute && <polyline points={activeRoute.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth="6" strokeDasharray="10 5" className="animate-pulse" />}

              {/* ROOMS */}
              {state.rooms.map(room => (
                <g 
                    key={room.id} 
                    transform={`rotate(${room.rotation || 0}, ${room.x + room.width/2}, ${room.y + room.height/2})`}
                    onMouseDown={e => onMouseDown(e, 'room', room.id)} 
                    onClick={e => e.stopPropagation()}
                >
                  <rect x={room.x} y={room.y} width={room.width} height={room.height} fill="white" stroke={state.selectedId === room.id ? '#4f46e5' : '#000'} strokeWidth={state.selectedId === room.id ? 4 : 2} className="cursor-move" />
                  <text x={room.x + 8 + (room.labelX || 0)} y={room.y + 18 + (room.labelY || 0)} className="font-black fill-slate-800 uppercase pointer-events-none tracking-widest" style={{ fontSize: room.fontSize || 9 }}>{room.name}</text>
                  
                  {/* Dimensions - rotate them back so they are readable? Or keep with room. */}
                  {state.showDimensions && (
                    <>
                      <text x={room.x + room.width / 2} y={room.y - 8} textAnchor="middle" className="text-[10px] font-black fill-indigo-600">{formatDim(room.width)}</text>
                      <text x={room.x - 8} y={room.y + room.height / 2} textAnchor="middle" transform={`rotate(-90, ${room.x - 8}, ${room.y + room.height / 2})`} className="text-[10px] font-black fill-indigo-600">{formatDim(room.height)}</text>
                    </>
                  )}
                  
                  {state.selectedId === room.id && (
                     <>
                        {/* Label Move Handle */}
                        <circle cx={room.x + 8 + (room.labelX || 0) - 6} cy={room.y + 18 + (room.labelY || 0) - 3} r={3} fill="#f59e0b" className="cursor-move print:hidden" onMouseDown={e => onMouseDown(e, 'label_move', room.id)} />
                        
                        {/* Resize Handle */}
                        <circle cx={room.x + room.width} cy={room.y + room.height} r={8} className="fill-indigo-600 cursor-nwse-resize stroke-white stroke-2 print:hidden" onMouseDown={e => onMouseDown(e, 'resize', room.id)} />
                        {/* Rotation Handle - Top Center */}
                        <g className="print:hidden cursor-grab active:cursor-grabbing group/rotate" onMouseDown={e => onMouseDown(e, 'rotate', room.id)}>
                            <line x1={room.x + room.width/2} y1={room.y} x2={room.x + room.width/2} y2={room.y - 25} stroke="#4f46e5" strokeWidth="2" />
                            <circle cx={room.x + room.width/2} cy={room.y - 25} r={8} className="fill-white stroke-indigo-600 stroke-2 group-hover/rotate:fill-indigo-100" />
                            <RotateIcon x={room.x + room.width/2 - 5} y={room.y - 30} size={10} className="text-indigo-600 pointer-events-none" />
                        </g>
                     </>
                  )}
                </g>
              ))}

              {/* FEATURES */}
              {state.features.map(f => (
                <g key={f.id} transform={`translate(${f.x}, ${f.y}) rotate(${f.rotation}, ${f.width/2}, ${f.height/2})`} onMouseDown={e => onMouseDown(e, 'feature', f.id)} onClick={e => e.stopPropagation()} className="cursor-move group">
                  {/* ... Feature Render Logic (Door, Window, Bed, etc.) ... */}
                  {f.type === 'door' && (
                     <g>
                      <path d={`M 0,${f.height} A ${f.width},${f.height} 0 0 1 ${f.width},0`} fill="none" stroke="#000" strokeWidth="2" strokeDasharray="4 2"/>
                      <line x1="0" y1="0" x2="0" y2={f.height} stroke="#000" strokeWidth="4" />
                     </g>
                  )}
                  {f.type === 'sliding-door' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="1" />
                      <line x1={0} y1={f.height*0.3} x2={f.width*0.6} y2={f.height*0.3} stroke="#000" strokeWidth="2" />
                      <line x1={f.width*0.4} y1={f.height*0.7} x2={f.width} y2={f.height*0.7} stroke="#000" strokeWidth="2" />
                    </g>
                  )}
                   {f.type === 'window' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="#e0f2fe" stroke="#000" strokeWidth="2" />
                      <line x1={0} y1={f.height/2} x2={f.width} y2={f.height/2} stroke="#000" strokeWidth="1" />
                    </g>
                  )}
                  {f.type === 'wall' && (
                    <rect width={f.width} height={f.height} fill="#1e293b" stroke="#000" strokeWidth="1" rx={0.5} />
                  )}
                  {f.type === 'garden' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="#ecfccb" stroke="#4d7c0f" strokeWidth="2" rx={8} />
                      <circle cx={f.width * 0.2} cy={f.height * 0.2} r={f.width * 0.1} fill="#84cc16" opacity="0.3" />
                      <circle cx={f.width * 0.8} cy={f.height * 0.7} r={f.width * 0.15} fill="#84cc16" opacity="0.3" />
                      <circle cx={f.width * 0.4} cy={f.height * 0.6} r={f.width * 0.08} fill="#84cc16" opacity="0.3" />
                    </g>
                  )}
                  {f.type === 'driveway' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="#f1f5f9" stroke="#475569" strokeWidth="2" />
                      <line x1={f.width * 0.1} y1={0} x2={f.width * 0.1} y2={f.height} stroke="#cbd5e1" strokeWidth="2" />
                      <line x1={f.width * 0.9} y1={0} x2={f.width * 0.9} y2={f.height} stroke="#cbd5e1" strokeWidth="2" />
                      <line x1={f.width * 0.5} y1={0} x2={f.width * 0.5} y2={f.height} stroke="#cbd5e1" strokeWidth="2" strokeDasharray="20 10" />
                    </g>
                  )}
                  {f.type === 'stairs' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="#f8fafc" stroke="#000" strokeWidth="2" />
                      {[...Array(Math.floor(f.height/15))].map((_, i) => (
                        <line key={i} x1="0" y1={i*15} x2={f.width} y2={i*15} stroke="#000" strokeWidth="1" />
                      ))}
                      <path d={`M ${f.width/2},${f.height-10} L ${f.width/2},10 M ${f.width/2-5},15 L ${f.width/2},10 L ${f.width/2+5},15`} fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
                    </g>
                  )}
                  {f.type === 'toilet' && (
                    <g>
                      <rect x={f.width*0.1} y={0} width={f.width*0.8} height={f.height*0.25} fill="white" stroke="#000" strokeWidth="2" rx={2}/>
                      <ellipse cx={f.width/2} cy={f.height*0.65} rx={f.width*0.35} ry={f.height*0.3} fill="white" stroke="#000" strokeWidth="2"/>
                    </g>
                  )}
                  {f.type === 'single-bed' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={4}/>
                      <rect x={0} y={0} width={f.width} height={f.height*0.25} fill="#f1f5f9" stroke="#000" strokeWidth="1"/>
                      <rect x={f.width*0.15} y={f.height*0.3} width={f.width*0.7} height={f.height*0.2} fill="white" stroke="#cbd5e1" rx={5}/>
                    </g>
                  )}
                  {f.type === 'double-bed' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={4}/>
                      <rect x={0} y={0} width={f.width} height={f.height*0.25} fill="#f1f5f9" stroke="#000" strokeWidth="1"/>
                      <rect x={f.width*0.1} y={f.height*0.05} width={f.width*0.35} height={f.height*0.15} fill="white" stroke="#cbd5e1" rx={3}/>
                      <rect x={f.width*0.55} y={f.height*0.05} width={f.width*0.35} height={f.height*0.15} fill="white" stroke="#cbd5e1" rx={3}/>
                    </g>
                  )}
                  {f.type === 'sink-single' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={2}/>
                      <ellipse cx={f.width/2} cy={f.height/2} rx={f.width*0.3} ry={f.height*0.3} fill="#f8fafc" stroke="#000" strokeWidth="1"/>
                      <line x1={f.width/2} y1={f.height*0.1} x2={f.width/2} y2={f.height*0.3} stroke="#000" strokeWidth="2"/>
                    </g>
                  )}
                  {f.type === 'sink-double' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={2}/>
                      <ellipse cx={f.width*0.25} cy={f.height/2} rx={f.width*0.15} ry={f.height*0.3} fill="#f8fafc" stroke="#000" strokeWidth="1"/>
                      <ellipse cx={f.width*0.75} cy={f.height/2} rx={f.width*0.15} ry={f.height*0.3} fill="#f8fafc" stroke="#000" strokeWidth="1"/>
                    </g>
                  )}
                  {f.type === 'bathtub' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={4}/>
                      <rect x={f.width*0.1} y={f.height*0.1} width={f.width*0.8} height={f.height*0.8} fill="#f8fafc" stroke="#000" strokeWidth="1" rx={8}/>
                      <circle cx={f.width*0.5} cy={f.height*0.2} r={3} fill="#94a3b8"/>
                    </g>
                  )}
                  {f.type === 'shower' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2"/>
                      <line x1={0} y1={0} x2={f.width} y2={f.height} stroke="#000" strokeWidth="1"/>
                      <line x1={f.width} y1={0} x2={0} y2={f.height} stroke="#000" strokeWidth="1"/>
                      <circle cx={f.width/2} cy={f.height/2} r={3} fill="white" stroke="#000" strokeWidth="1"/>
                    </g>
                  )}
                  {f.type === 'sofa' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={2}/>
                      <rect x={0} y={0} width={f.width} height={f.height*0.3} fill="white" stroke="#000" strokeWidth="1"/>
                      <rect x={0} y={0} width={f.width*0.15} height={f.height} fill="white" stroke="#000" strokeWidth="1"/>
                      <rect x={f.width*0.85} y={0} width={f.width*0.15} height={f.height} fill="white" stroke="#000" strokeWidth="1"/>
                    </g>
                  )}
                  {f.type === 'table' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="#f8fafc" stroke="#000" strokeWidth="2" rx={2}/>
                      <rect x={f.width*0.1} y={f.height*0.1} width={f.width*0.8} height={f.height*0.8} fill="white" stroke="#e2e8f0" strokeWidth="1" rx={1}/>
                    </g>
                  )}
                  {f.type === 'range' && (
                      <g>
                          <rect width={f.width} height={f.height} fill="#f1f5f9" stroke="#000" strokeWidth="2" rx={2}/>
                          <circle cx={f.width*0.25} cy={f.height*0.25} r={f.width*0.15} fill="none" stroke="#000" strokeWidth="1"/>
                          <circle cx={f.width*0.75} cy={f.height*0.25} r={f.width*0.15} fill="none" stroke="#000" strokeWidth="1"/>
                          <circle cx={f.width*0.25} cy={f.height*0.75} r={f.width*0.15} fill="none" stroke="#000" strokeWidth="1"/>
                          <circle cx={f.width*0.75} cy={f.height*0.75} r={f.width*0.15} fill="none" stroke="#000" strokeWidth="1"/>
                      </g>
                  )}
                  {f.type === 'fridge' && (
                      <g>
                          <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={2}/>
                          <line x1={0} y1={f.height*0.3} x2={f.width} y2={f.height*0.3} stroke="#000" strokeWidth="1"/>
                          <text x={f.width/2} y={f.height*0.7} textAnchor="middle" fontSize={10} className="font-bold fill-slate-400">REF</text>
                      </g>
                  )}
                  {f.type === 'closet-double' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="none" stroke="#000" strokeWidth="1" strokeDasharray="2 2" />
                      <polyline
                          points={`0,${f.height} ${f.width * 0.25},${f.height * 0.5} ${f.width * 0.5},${f.height} ${f.width * 0.75},${f.height * 0.5} ${f.width},${f.height}`}
                          fill="none"
                          stroke="#000"
                          strokeWidth="2"
                      />
                    </g>
                  )}
                  {f.type === 'closet-unit' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" />
                      <line x1={0} y1={f.height/2} x2={f.width} y2={f.height/2} stroke="#000" strokeWidth="1" strokeDasharray="5 5"/>
                    </g>
                  )}
                  {f.type === 'washer-dryer' && (
                      <g>
                          <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={2}/>
                          <circle cx={f.width/2} cy={f.height/2} r={f.width*0.3} fill="none" stroke="#000" strokeWidth="1"/>
                          <rect x={f.width*0.1} y={f.height*0.1} width={f.width*0.8} height={f.height*0.15} fill="#cbd5e1"/>
                          <text x={f.width/2} y={f.height*0.6} textAnchor="middle" fontSize={8} className="font-bold fill-slate-400">W/D</text>
                      </g>
                  )}
                  {f.type === 'fireplace' && (
                      <g>
                          <rect width={f.width} height={f.height} fill="#fff7ed" stroke="#000" strokeWidth="2"/>
                          <path d={`M ${f.width*0.2},${f.height} L ${f.width*0.2},${f.height*0.2} L ${f.width*0.8},${f.height*0.2} L ${f.width*0.8},${f.height}`} fill="none" stroke="#000" strokeWidth="2"/>
                          <path d={`M ${f.width*0.3},${f.height} Q ${f.width*0.5},${f.height*0.5} ${f.width*0.7},${f.height}`} fill="none" stroke="#fdba74" strokeWidth="2"/>
                      </g>
                  )}
                  {f.type.startsWith('vanity') && (
                      <g>
                          <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2"/>
                          {f.type === 'vanity-single' ? (
                              <ellipse cx={f.width/2} cy={f.height/2} rx={f.width*0.25} ry={f.height*0.35} fill="#f1f5f9" stroke="#000" strokeWidth="1"/>
                          ) : (
                              <>
                              <ellipse cx={f.width*0.25} cy={f.height/2} rx={f.width*0.15} ry={f.height*0.35} fill="#f1f5f9" stroke="#000" strokeWidth="1"/>
                              <ellipse cx={f.width*0.75} cy={f.height/2} rx={f.width*0.15} ry={f.height*0.35} fill="#f1f5f9" stroke="#000" strokeWidth="1"/>
                              </>
                          )}
                      </g>
                  )}
                  {f.type === 'desk' && (
                      <g>
                          <rect width={f.width} height={f.height} fill="#f8fafc" stroke="#000" strokeWidth="2"/>
                          <rect x={f.width*0.1} y={f.height*0.1} width={f.width*0.2} height={f.height*0.8} fill="white" stroke="#000" strokeWidth="1"/>
                          <rect x={f.width*0.7} y={f.height*0.1} width={f.width*0.2} height={f.height*0.8} fill="white" stroke="#000" strokeWidth="1"/>
                      </g>
                  )}
                  {f.type === 'water-heater' && (
                      <g>
                          <circle cx={f.width/2} cy={f.height/2} r={Math.min(f.width, f.height)/2} fill="white" stroke="#000" strokeWidth="2"/>
                          <text x={f.width/2} y={f.height/2 + 3} textAnchor="middle" fontSize={8} className="font-bold">WH</text>
                      </g>
                  )}
                  {f.type === 'label' && (
                    <g>
                      <rect width={f.width} height={f.height} fill="transparent" stroke={state.selectedId === f.id ? "#4f46e5" : "none"} strokeWidth="1" strokeDasharray="4 2" />
                      <text 
                        x={f.width/2 + (f.labelX || 0)} 
                        y={f.height/2 + (f.labelY || 0)} 
                        dominantBaseline="middle" 
                        textAnchor="middle" 
                        className="font-bold fill-slate-900 pointer-events-none"
                        style={{ fontSize: f.fontSize || Math.max(12, f.height * 0.6) }}
                      >
                        {f.label}
                      </text>
                      {state.selectedId === f.id && (
                        <circle cx={f.width/2 + (f.labelX || 0) + 6} cy={f.height/2 + (f.labelY || 0) - 6} r={3} fill="#f59e0b" className="cursor-move print:hidden" onMouseDown={e => onMouseDown(e, 'label_move', f.id)} />
                      )}
                    </g>
                  )}
                  {/* Fallback for others */}
                  {!['door', 'sliding-door', 'window', 'stairs', 'toilet', 'single-bed', 'double-bed', 'sink-single', 'sink-double', 'bathtub', 'shower', 'sofa', 'table', 'range', 'fridge', 'closet-double', 'closet-unit', 'washer-dryer', 'fireplace', 'vanity-single', 'vanity-double', 'desk', 'water-heater', 'wall', 'garden', 'driveway', 'label'].includes(f.type) && (
                     <rect width={f.width} height={f.height} fill={f.type.includes('bed') || f.type.includes('table') || f.type.includes('sofa') ? "white" : "#f1f5f9"} stroke="#000" strokeWidth="2" rx={2}/>
                  )}
                   {/* Fallback label */}
                   {f.type !== 'label' && (
                     <>
                      <text x={f.width/2 + (f.labelX || 0)} y={f.height + 11 + (f.labelY || 0)} textAnchor="middle" className="font-black fill-slate-500 uppercase tracking-tight pointer-events-none" style={{ fontSize: f.fontSize || 8 }}>{f.label}</text>
                      {state.selectedId === f.id && (
                        <circle cx={f.width/2 + (f.labelX || 0) + 6} cy={f.height + 11 + (f.labelY || 0) - 3} r={3} fill="#f59e0b" className="cursor-move print:hidden" onMouseDown={e => onMouseDown(e, 'label_move', f.id)} />
                      )}
                     </>
                   )}

                  {state.selectedId === f.id && (
                     <>
                        <circle cx={f.width} cy={f.height} r={9} className="fill-indigo-600 stroke-white stroke-2 shadow-sm print:hidden" onMouseDown={e => onMouseDown(e, 'resize', f.id)} />
                        {/* Rotation Handle - Top Center */}
                        <g className="print:hidden cursor-grab active:cursor-grabbing group/rotate" onMouseDown={e => onMouseDown(e, 'rotate', f.id)}>
                            <line x1={f.width/2} y1={0} x2={f.width/2} y2={-25} stroke="#4f46e5" strokeWidth="2" />
                            <circle cx={f.width/2} cy={-25} r={8} className="fill-white stroke-indigo-600 stroke-2 group-hover/rotate:fill-indigo-100" />
                            <RotateIcon x={f.width/2 - 5} y={-30} size={10} className="text-indigo-600 pointer-events-none" />
                        </g>
                     </>
                  )}
                </g>
              ))}

              {/* EXITS */}
              {state.exits.map(ex => (
                <g 
                    key={ex.id} 
                    transform={`rotate(${ex.rotation || 0}, ${ex.x}, ${ex.y})`}
                    onMouseDown={e => onMouseDown(e, 'exit', ex.id)} 
                    onClick={e => e.stopPropagation()} 
                    className="cursor-move z-20 group"
                >
                   {/* PRIMARY EXIT */}
                   {ex.type === 'primary' && (
                      <g>
                         <circle cx={ex.x} cy={ex.y} r={18} fill="#22c55e" stroke="white" strokeWidth="2" className="shadow-sm"/>
                         <path d={`M ${ex.x-6},${ex.y} l 12,0 m -4,-4 l 4,4 l -4,4`} fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                         <text x={ex.x} y={ex.y + 30} textAnchor="middle" className="font-black fill-green-700 uppercase select-none" style={{ fontSize: ex.fontSize || 10 }}>EXIT</text>
                      </g>
                   )}

                   {/* FIRST AID */}
                   {ex.type === 'first-aid' && (
                      <g>
                        <rect x={ex.x - 15} y={ex.y - 15} width={30} height={30} rx={6} fill="#22c55e" stroke="white" strokeWidth="2" className="shadow-sm" />
                        <path d={`M ${ex.x-4},${ex.y-10} L ${ex.x+4},${ex.y-10} L ${ex.x+4},${ex.y-4} L ${ex.x+10},${ex.y-4} L ${ex.x+10},${ex.y+4} L ${ex.x+4},${ex.y+4} L ${ex.x+4},${ex.y+10} L ${ex.x-4},${ex.y+10} L ${ex.x-4},${ex.y+4} L ${ex.x-10},${ex.y+4} L ${ex.x-10},${ex.y-4} L ${ex.x-4},${ex.y-4} Z`} fill="white" />
                        <text x={ex.x + (ex.labelX || 0)} y={ex.y + 28 + (ex.labelY || 0)} textAnchor="middle" className="font-black fill-green-700 uppercase drop-shadow-sm select-none" style={{ fontSize: ex.fontSize || 9 }}>{ex.label}</text>
                      </g>
                   )}

                   {/* FIRE EXTINGUISHER */}
                   {ex.type === 'extinguisher' && (
                      <g>
                        <path d={`M ${ex.x-6},${ex.y-10} L ${ex.x+6},${ex.y-10} L ${ex.x+8},${ex.y+15} L ${ex.x-8},${ex.y+15} Z`} fill="#ef4444" stroke="#991b1b" strokeWidth="2" />
                        <rect x={ex.x-3} y={ex.y-14} width={6} height={4} fill="#374151" />
                        <path d={`M ${ex.x+3},${ex.y-12} Q ${ex.x+12},${ex.y-12} ${ex.x+12},${ex.y}`} fill="none" stroke="#1f2937" strokeWidth="2" />
                        <text x={ex.x + (ex.labelX || 0)} y={ex.y + 28 + (ex.labelY || 0)} textAnchor="middle" className="font-black fill-red-700 uppercase drop-shadow-sm select-none" style={{ fontSize: ex.fontSize || 9 }}>{ex.label}</text>
                      </g>
                   )}

                   {/* FIRE ALARM */}
                   {ex.type === 'fire-alarm' && (
                      <g>
                        <circle cx={ex.x} cy={ex.y} r={14} fill="#ef4444" stroke="#991b1b" strokeWidth="2" />
                        <circle cx={ex.x} cy={ex.y} r={10} fill="none" stroke="white" strokeWidth="1" />
                        <path d={`M ${ex.x-2},${ex.y-6} L ${ex.x-2},${ex.y+4} L ${ex.x+4},${ex.y+4}`} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
                        <path d={`M ${ex.x-18},${ex.y-8} Q ${ex.x-22},${ex.y} ${ex.x-18},${ex.y+8}`} fill="none" stroke="#ef4444" strokeWidth="2" opacity="0.6" />
                        <path d={`M ${ex.x+18},${ex.y-8} Q ${ex.x+22},${ex.y} ${ex.x+18},${ex.y+8}`} fill="none" stroke="#ef4444" strokeWidth="2" opacity="0.6" />
                        <text x={ex.x + (ex.labelX || 0)} y={ex.y + 28 + (ex.labelY || 0)} textAnchor="middle" className="font-black fill-red-700 uppercase drop-shadow-sm select-none" style={{ fontSize: ex.fontSize || 9 }}>{ex.label}</text>
                      </g>
                   )}

                   {/* Fallback for 'secondary' or others */}
                   {!['primary', 'first-aid', 'extinguisher', 'fire-alarm'].includes(ex.type) && (
                      <g>
                        <circle cx={ex.x} cy={ex.y} r={18} fill="#fff" stroke="#94a3b8" strokeWidth="2" className="shadow-sm"/>
                        <text x={ex.x} y={ex.y+4} textAnchor="middle" className="text-[10px] font-black fill-slate-500">{ex.type.substring(0,2).toUpperCase()}</text>
                        <text x={ex.x + (ex.labelX || 0)} y={ex.y + 35 + (ex.labelY || 0)} textAnchor="middle" className="font-black fill-slate-900 uppercase pointer-events-none drop-shadow-sm" style={{ fontSize: ex.fontSize || 10 }}>{ex.label}</text>
                      </g>
                   )}

                   {/* Selection and Rotation handles remain the same */}
                   {state.selectedId === ex.id && (
                     <>
                        {/* Label Move Handle */}
                        {ex.type !== 'primary' && (
                          <circle cx={ex.x + (ex.labelX || 0) + 6} cy={ex.y + (ex.type !== 'fire-alarm' && ex.type !== 'extinguisher' && ex.type !== 'first-aid' ? 35 : 28) + (ex.labelY || 0) - 3} r={3} fill="#f59e0b" className="cursor-move print:hidden" onMouseDown={e => onMouseDown(e, 'label_move', ex.id)} />
                        )}

                        <g className="print:hidden cursor-grab active:cursor-grabbing group/rotate" onMouseDown={e => onMouseDown(e, 'rotate', ex.id)}>
                            <line x1={ex.x} y1={ex.y - 20} x2={ex.x} y2={ex.y - 45} stroke="#4f46e5" strokeWidth="2" />
                            <circle cx={ex.x} cy={ex.y - 45} r={8} className="fill-white stroke-indigo-600 stroke-2 group-hover/rotate:fill-indigo-100" />
                            <RotateIcon x={ex.x - 5} y={ex.y - 50} size={10} className="text-indigo-600 pointer-events-none" />
                        </g>
                     </>
                   )}
                </g>
              ))}
            </svg>
          </div>
          
          {/* ... Analysis Result Panel ... */}
        </div>
      </main>
    </div>
  );
};

export default App;