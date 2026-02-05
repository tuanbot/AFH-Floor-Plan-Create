import React, { useState, useCallback, useRef, useMemo } from 'react';
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
  Utensils
} from 'lucide-react';
import { Room, ExitPoint, HouseFeature, HouseDetails, AppState, SafetyRoute, RoutePoint } from './types';
import { analyzeSafetyPlan, convertSketchToDiagram } from './geminiService';

const CANVAS_SIZE = 800;
// Scale: 1px = 0.6 inches (Assuming 20px = 1ft = 12 inches)
const PX_TO_INCH = 0.6;

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    rooms: [
      { id: '1', name: 'Master Bedroom', x: 100, y: 100, width: 240, height: 180, color: '#ffffff' },
      { id: '2', name: 'Living Room', x: 340, y: 100, width: 300, height: 240, color: '#ffffff' },
    ],
    exits: [],
    features: [],
    routes: [],
    details: { address: '', owner: '', contact: '', notes: '' },
    backgroundUrl: null,
    selectedId: null,
    mode: 'edit',
    showDimensions: false,
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<{ id: string, offsetX: number, offsetY: number } | null>(null);
  const [resizingItem, setResizingItem] = useState<{ id: string, startX: number, startY: number, startW: number, startH: number } | null>(null);
  const [activeRoute, setActiveRoute] = useState<RoutePoint[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatDim = (px: number) => `${Math.round(px * PX_TO_INCH)}"`;

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
    setIsConverting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setState(prev => ({ ...prev, backgroundUrl: base64 }));
      const newRooms = await convertSketchToDiagram(base64);
      if (newRooms.length > 0) {
        const roomsWithIds: Room[] = newRooms.map((r, i) => ({
          id: `ai-room-${Date.now()}-${i}`,
          name: r.name || 'Room',
          x: r.x || 100,
          y: r.y || 100,
          width: r.width || 160,
          height: r.height || 120,
          color: r.color || '#ffffff'
        }));
        setState(prev => ({ ...prev, rooms: roomsWithIds }));
      }
      setIsConverting(false);
    };
    reader.readAsDataURL(file);
  };

  const addRoom = () => {
    const newRoom: Room = { id: `room-${Date.now()}`, name: 'New Room', x: 100, y: 100, width: 160, height: 120, color: '#ffffff' };
    setState(prev => ({ ...prev, rooms: [...prev.rooms, newRoom], selectedId: newRoom.id }));
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
      'water-heater': { w: 30, h: 30 }, 'elec-panel': { w: 30, h: 10 }, fireplace: { w: 80, h: 30 }
    }[type];
    const newFeature: HouseFeature = {
      id: `feature-${Date.now()}`, type, x: 250, y: 250, width: dimensions.w, height: dimensions.h, 
      rotation: 0, label: type.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
    };
    setState(prev => ({ ...prev, features: [...prev.features, newFeature], selectedId: newFeature.id }));
  };

  const addExit = (type: ExitPoint['type']) => {
    const newExit: ExitPoint = {
      id: `exit-${Date.now()}`, x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2, type, label: type.split('-').join(' ').toUpperCase()
    };
    setState(prev => ({ ...prev, exits: [...prev.exits, newExit], selectedId: newExit.id }));
  };

  const updateRoom = (id: string, updates: Partial<Room>) => {
    setState(prev => ({ ...prev, rooms: prev.rooms.map(r => r.id === id ? { ...r, ...updates } : r) }));
  };

  const updateFeature = (id: string, updates: Partial<HouseFeature>) => {
    setState(prev => ({ ...prev, features: prev.features.map(f => f.id === id ? { ...f, ...updates } : f) }));
  };

  const deleteSelected = () => {
    if (!state.selectedId) return;
    setState(prev => ({
      ...prev,
      rooms: prev.rooms.filter(r => r.id !== prev.selectedId),
      exits: prev.exits.filter(e => e.id !== prev.selectedId),
      features: prev.features.filter(f => f.id !== prev.selectedId),
      routes: prev.routes.filter(r => r.id !== prev.selectedId),
      selectedId: null
    }));
  };

  const startRoute = () => {
    setState(p => ({ ...p, mode: 'route', selectedId: null }));
    setActiveRoute([]);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (state.mode === 'route' && activeRoute) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) / 5) * 5;
      const y = Math.round((e.clientY - rect.top) / 5) * 5;
      setActiveRoute(prev => [...prev, { x, y }]);
    } else if (e.target === e.currentTarget) {
      setState(prev => ({ ...prev, selectedId: null }));
    }
  };

  const finishRoute = () => {
    if (activeRoute && activeRoute.length > 1) {
      const newRoute: SafetyRoute = { id: `route-${Date.now()}`, points: activeRoute, color: '#ef4444' };
      setState(prev => ({ ...prev, routes: [...prev.routes, newRoute], mode: 'safety' }));
    }
    setActiveRoute(null);
  };

  const onMouseDown = (e: React.MouseEvent, type: 'room' | 'exit' | 'feature' | 'resize' | 'route', id: string) => {
    if (state.mode === 'route') return;
    e.stopPropagation();
    setState(prev => ({ ...prev, selectedId: id }));
    if (type === 'resize') {
      const item = state.rooms.find(r => r.id === id) || state.features.find(f => f.id === id);
      if (item) setResizingItem({ id, startX: e.clientX, startY: e.clientY, startW: item.width, startH: item.height });
    } else if (type !== 'route') {
      const item = [...state.rooms, ...state.exits, ...state.features].find(i => i.id === id);
      if (item) setDraggingItem({ id, offsetX: e.clientX - item.x, offsetY: e.clientY - item.y });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (draggingItem) {
      const nx = Math.round((e.clientX - draggingItem.offsetX) / 5) * 5;
      const ny = Math.round((e.clientY - draggingItem.offsetY) / 5) * 5;
      if (state.rooms.some(r => r.id === draggingItem.id)) updateRoom(draggingItem.id, { x: nx, y: ny });
      else if (state.features.some(f => f.id === draggingItem.id)) updateFeature(draggingItem.id, { x: nx, y: ny });
      else setState(prev => ({ ...prev, exits: prev.exits.map(ex => ex.id === draggingItem.id ? { ...ex, x: nx, y: ny } : ex) }));
    } else if (resizingItem) {
      const dw = e.clientX - resizingItem.startX;
      const dh = e.clientY - resizingItem.startY;
      const newWidth = Math.max(10, resizingItem.startW + dw);
      const newHeight = Math.max(10, resizingItem.startH + dh);
      if (state.rooms.some(r => r.id === resizingItem.id)) updateRoom(resizingItem.id, { width: newWidth, height: newHeight });
      else updateFeature(resizingItem.id, { width: newWidth, height: newHeight });
    }
  };

  const onMouseUp = () => { setDraggingItem(null); setResizingItem(null); };

  const selectedRoom = state.rooms.find(r => r.id === state.selectedId);
  const selectedFeature = state.features.find(f => f.id === state.selectedId);

  const sidebarButtonClass = "flex flex-col items-center justify-center gap-1 p-2 bg-white border border-slate-200 rounded-xl text-[9px] font-bold hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm active:scale-95";

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans" onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />

      <aside className="w-80 bg-white border-r border-slate-300 flex flex-col shadow-2xl z-30 overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-center gap-3 bg-slate-50">
          <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-md"><Home size={20} /></div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-800">AFH Planner</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="space-y-3">
            <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button onClick={() => setState(p => ({...p, mode: 'edit'}))} className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all tracking-widest ${state.mode === 'edit' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>LAYOUT</button>
              <button onClick={() => setState(p => ({...p, mode: 'safety'}))} className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all tracking-widest ${state.mode === 'safety' ? 'bg-white shadow-sm text-red-600' : 'text-slate-400 hover:text-slate-600'}`}>SAFETY</button>
            </div>
            
            <button 
              onClick={() => setState(prev => ({...prev, showDimensions: !prev.showDimensions}))}
              className={`w-full flex items-center justify-between px-4 py-2 rounded-xl border text-[10px] font-black tracking-widest transition-all ${state.showDimensions ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-inner' : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'}`}
            >
              <div className="flex items-center gap-2"><Ruler size={14}/> SHOW DIMENSIONS</div>
              <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${state.showDimensions ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                <div className={`w-3 h-3 bg-white rounded-full transition-transform ${state.showDimensions ? 'translate-x-4' : ''}`}/>
              </div>
            </button>
          </div>

          {state.mode === 'edit' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-4">
              <section className="space-y-3">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b pb-1">Architecture</h2>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={addRoom} className={sidebarButtonClass}><Plus size={14}/> Room</button>
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

              <section className="space-y-3">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b pb-1">Outdoor & Utility</h2>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => addFeature('garden')} className={sidebarButtonClass}><TreePine size={14}/> Garden</button>
                  <button onClick={() => addFeature('driveway')} className={sidebarButtonClass}><Car size={14}/> Driveway</button>
                  <button onClick={() => addFeature('elec-panel')} className={sidebarButtonClass}><Zap size={14}/> Elec Panel</button>
                </div>
              </section>

              <button onClick={() => fileInputRef.current?.click()} disabled={isConverting} className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-[10px] font-black text-indigo-700 hover:bg-indigo-100 shadow-sm">
                {isConverting ? <Loader2 size={16} className="animate-spin"/> : <Upload size={16}/>}
                {isConverting ? 'CONVERTING...' : 'IMPORT HAND-DRAWN SKETCH'}
              </button>

              {(selectedRoom || selectedFeature) && (
                <div className="p-4 bg-slate-900 rounded-2xl space-y-4 shadow-xl animate-in zoom-in-95">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Settings</span>
                    <button onClick={deleteSelected} className="text-red-400 hover:text-red-300 p-1 hover:bg-white/10 rounded-lg"><Trash2 size={16}/></button>
                  </div>
                  <div className="space-y-3">
                    <input type="text" value={selectedRoom?.name || selectedFeature?.label || ''} 
                      onChange={e => selectedRoom ? updateRoom(selectedRoom.id, {name: e.target.value}) : updateFeature(selectedFeature!.id, {label: e.target.value})}
                      className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg text-white"
                    />
                    {selectedFeature && (
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Rotation</label>
                        <input type="range" min="0" max="360" step="45" value={selectedFeature.rotation} onChange={e => updateFeature(selectedFeature.id, {rotation: Number(e.target.value)})} className="w-full accent-indigo-500"/>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {state.mode === 'safety' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-4">
              <section className="space-y-3">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b pb-1">Emergency Markers</h2>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => addExit('extinguisher')} className="flex flex-col items-center gap-1 p-3 bg-red-50 border border-red-200 rounded-xl text-[10px] font-black text-red-700 shadow-sm hover:bg-red-100 transition-colors"><Flame size={18}/> FIRE EXT.</button>
                  <button onClick={() => addExit('fire-alarm')} className="flex flex-col items-center gap-1 p-3 bg-red-50 border border-red-200 rounded-xl text-[10px] font-black text-red-700 shadow-sm hover:bg-red-100 transition-colors"><Bell size={18}/> ALARM</button>
                  <button onClick={() => addExit('first-aid')} className="flex flex-col items-center gap-1 p-3 bg-blue-50 border border-blue-200 rounded-xl text-[10px] font-black text-blue-700 shadow-sm hover:bg-blue-100 transition-colors"><Stethoscope size={18}/> FIRST AID</button>
                  <button onClick={() => addExit('primary')} className="flex flex-col items-center gap-1 p-3 bg-green-50 border border-green-200 rounded-xl text-[10px] font-black text-green-700 shadow-sm hover:bg-green-100 transition-colors"><ArrowUpRight size={18}/> PRIMARY EXIT</button>
                </div>
              </section>
              <button onClick={startRoute} className="w-full flex items-center justify-center gap-3 p-4 bg-red-600 text-white rounded-2xl text-[11px] font-black shadow-xl hover:bg-red-700 transition-all hover:scale-[1.02] active:scale-95">
                <PenTool size={18}/> DRAW EVACUATION PATH
              </button>
              <button onClick={handleAIAnalysis} disabled={isAnalyzing} className="w-full py-4 bg-slate-800 text-white rounded-2xl text-[11px] font-black flex items-center justify-center gap-3 shadow-2xl hover:bg-slate-700 transition-all">
                {isAnalyzing ? <Loader2 size={18} className="animate-spin"/> : <BrainCircuit size={18}/>}
                {isAnalyzing ? 'RUNNING AI SAFETY AUDIT...' : 'AI SAFETY AUDIT'}
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 relative overflow-auto p-12 flex items-start justify-center">
        <div 
          className="relative bg-white shadow-2xl rounded-lg border-2 border-slate-300 overflow-hidden"
          style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, cursor: state.mode === 'route' ? 'crosshair' : 'default' }}
          onClick={handleCanvasClick}
        >
          <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: `linear-gradient(#000 1.5px, transparent 1.5px), linear-gradient(90deg, #000 1.5px, transparent 1.5px)`, backgroundSize: '20px 20px' }} />
          {state.backgroundUrl && <img src={state.backgroundUrl} className="absolute inset-0 w-full h-full object-contain opacity-20 pointer-events-none grayscale" />}

          <svg className="absolute inset-0 w-full h-full">
            {state.routes.map(route => (
              <polyline key={route.id} points={route.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {activeRoute && <polyline points={activeRoute.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth="6" strokeDasharray="10 5" className="animate-pulse" />}

            {state.rooms.map(room => (
              <g key={room.id} onMouseDown={e => onMouseDown(e, 'room', room.id)} onClick={e => e.stopPropagation()}>
                <rect x={room.x} y={room.y} width={room.width} height={room.height} fill="white" stroke={state.selectedId === room.id ? '#4f46e5' : '#000'} strokeWidth={state.selectedId === room.id ? 4 : 2} className="cursor-move" />
                <text x={room.x + 8} y={room.y + 18} className="font-black text-[9px] fill-slate-800 uppercase pointer-events-none tracking-widest">{room.name}</text>
                
                {state.showDimensions && (
                  <>
                    <text x={room.x + room.width / 2} y={room.y - 8} textAnchor="middle" className="text-[10px] font-black fill-indigo-600">
                      {formatDim(room.width)}
                    </text>
                    <text x={room.x - 8} y={room.y + room.height / 2} textAnchor="middle" transform={`rotate(-90, ${room.x - 8}, ${room.y + room.height / 2})`} className="text-[10px] font-black fill-indigo-600">
                      {formatDim(room.height)}
                    </text>
                  </>
                )}
                
                {state.selectedId === room.id && <circle cx={room.x + room.width} cy={room.y + room.height} r={8} className="fill-indigo-600 cursor-nwse-resize stroke-white stroke-2" onMouseDown={e => onMouseDown(e, 'resize', room.id)} />}
              </g>
            ))}

            {state.features.map(f => (
              <g key={f.id} transform={`translate(${f.x}, ${f.y}) rotate(${f.rotation}, ${f.width/2}, ${f.height/2})`} onMouseDown={e => onMouseDown(e, 'feature', f.id)} onClick={e => e.stopPropagation()} className="cursor-move group">
                {/* DRAWING LOGIC */}
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
                {f.type === 'stairs' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="#f8fafc" stroke="#000" strokeWidth="2" />
                    {[...Array(Math.floor(f.height/15))].map((_, i) => (
                      <line key={i} x1="0" y1={i*15} x2={f.width} y2={i*15} stroke="#000" strokeWidth="1" />
                    ))}
                    <path d={`M ${f.width/2},${f.height-10} L ${f.width/2},10 M ${f.width/2-5},15 L ${f.width/2},10 L ${f.width/2+5},15`} fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
                  </g>
                )}
                {f.type === 'closet-unit' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" />
                    <line x1={8} y1={0} x2={8} y2={f.height} stroke="#cbd5e1" strokeWidth="1" />
                    <path d={`M 0,${f.height*0.5} A ${f.width*0.5},${f.height*0.5} 0 0 1 ${f.width*0.5},0`} fill="none" stroke="#000" strokeWidth="2" strokeDasharray="3 3"/>
                  </g>
                )}
                {f.type === 'closet-double' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" />
                    <line x1={8} y1={0} x2={8} y2={f.height} stroke="#cbd5e1" strokeWidth="1" />
                    <polyline points={`0,0 ${f.width*0.2},${f.height*0.1} 0,${f.height*0.25} ${f.width*0.2},${f.height*0.4} 0,${f.height*0.5} ${f.width*0.2},${f.height*0.6} 0,${f.height*0.75} ${f.width*0.2},${f.height*0.9} 0,${f.height}`} fill="none" stroke="#000" strokeWidth="2" />
                  </g>
                )}
                {f.type === 'toilet' && (
                  <g>
                    <rect x={f.width*0.1} y={0} width={f.width*0.8} height={f.height*0.25} fill="white" stroke="#000" strokeWidth="2" rx={2}/>
                    <ellipse cx={f.width/2} cy={f.height*0.65} rx={f.width*0.35} ry={f.height*0.3} fill="white" stroke="#000" strokeWidth="2"/>
                    <circle cx={f.width/2} cy={f.height*0.5} r={4} fill="#e2e8f0" />
                  </g>
                )}
                {f.type === 'shower' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="#f1f5f9" stroke="#000" strokeWidth="2"/>
                    <line x1="0" y1="0" x2={f.width} y2={f.height} stroke="#000" strokeWidth="0.5" strokeDasharray="2 2" />
                    <line x1={f.width} y1="0" x2="0" y2={f.height} stroke="#000" strokeWidth="0.5" strokeDasharray="2 2" />
                    <circle cx={f.width/2} cy={f.height/2} r={3} fill="#94a3b8" />
                  </g>
                )}
                {f.type === 'bathtub' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={15}/>
                    <ellipse cx={f.width/2} cy={f.height/2} rx={f.width*0.4} ry={f.height*0.3} fill="none" stroke="#e2e8f0" strokeWidth="1"/>
                    <circle cx={f.width*0.15} cy={f.height/2} r={3} fill="#94a3b8" />
                  </g>
                )}
                {f.type === 'sink-single' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={5}/>
                    <ellipse cx={f.width/2} cy={f.height/2} rx={f.width*0.3} ry={f.height*0.35} fill="none" stroke="#cbd5e1" strokeWidth="1"/>
                    <circle cx={f.width/2} cy={3} r={2} fill="#000" />
                  </g>
                )}
                {f.type === 'sink-double' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={5}/>
                    <ellipse cx={f.width*0.28} cy={f.height/2} rx={f.width*0.18} ry={f.height*0.3} fill="none" stroke="#cbd5e1" strokeWidth="1"/>
                    <ellipse cx={f.width*0.72} cy={f.height/2} rx={f.width*0.18} ry={f.height*0.3} fill="none" stroke="#cbd5e1" strokeWidth="1"/>
                    <rect x={f.width/2-3} y={0} width={6} height={4} fill="#000" />
                  </g>
                )}
                {f.type === 'vanity-single' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2"/>
                    <ellipse cx={f.width/2} cy={f.height*0.5} rx={f.width*0.25} ry={f.height*0.25} fill="none" stroke="#cbd5e1" strokeWidth="1.5"/>
                    <circle cx={f.width/2} cy={4} r={2} fill="#000" />
                  </g>
                )}
                {f.type === 'vanity-double' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2"/>
                    <ellipse cx={f.width*0.25} cy={f.height*0.5} rx={f.width*0.15} ry={f.height*0.2} fill="none" stroke="#cbd5e1" strokeWidth="1.5"/>
                    <ellipse cx={f.width*0.75} cy={f.height*0.5} rx={f.width*0.15} ry={f.height*0.2} fill="none" stroke="#cbd5e1" strokeWidth="1.5"/>
                    <circle cx={f.width*0.25} cy={4} r={2} fill="#000" />
                    <circle cx={f.width*0.75} cy={4} r={2} fill="#000" />
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
                    <rect x={0} y={0} width={f.width} height={f.height*0.2} fill="#f1f5f9" stroke="#000" strokeWidth="1"/>
                    <rect x={f.width*0.1} y={f.height*0.25} width={f.width*0.35} height={f.height*0.2} fill="white" stroke="#cbd5e1" rx={5}/>
                    <rect x={f.width*0.55} y={f.height*0.25} width={f.width*0.35} height={f.height*0.2} fill="white" stroke="#cbd5e1" rx={5}/>
                  </g>
                )}
                {f.type === 'sofa' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={10}/>
                    <rect x={0} y={f.height-12} width={f.width} height={12} fill="#f8fafc" stroke="#000" strokeWidth="2" />
                    <rect x={0} y={0} width={10} height={f.height} fill="#f8fafc" stroke="#000" strokeWidth="2" />
                    <rect x={f.width-10} y={0} width={10} height={f.height} fill="#f8fafc" stroke="#000" strokeWidth="2" />
                  </g>
                )}
                {f.type === 'kitchen-island' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2"/>
                    <rect x={4} y={4} width={f.width-8} height={f.height-8} fill="none" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 2"/>
                  </g>
                )}
                {f.type === 'balcony' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="#f8fafc" stroke="#000" strokeWidth="2"/>
                    <line x1={0} y1={2} x2={f.width} y2={2} stroke="#000" strokeWidth="4" />
                    <line x1={2} y1={0} x2={2} y2={f.height} stroke="#000" strokeWidth="4" />
                    <line x1={f.width-2} y1={0} x2={f.width-2} y2={f.height} stroke="#000" strokeWidth="4" />
                  </g>
                )}
                {f.type === 'entry' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="#cbd5e1" stroke="#475569" strokeWidth="2" rx={4}/>
                    <text x={f.width/2} y={f.height/2+4} textAnchor="middle" className="text-[10px] font-black fill-white">WELCOME</text>
                  </g>
                )}
                {f.type === 'garden' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="#f0fdf4" stroke="#166534" strokeWidth="2"/>
                    {[...Array(12)].map((_, i) => (
                      <circle key={i} cx={Math.random()*f.width} cy={Math.random()*f.height} r={2} fill="#22c55e" />
                    ))}
                  </g>
                )}
                {f.type === 'driveway' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="#f1f5f9" stroke="#94a3b8" strokeWidth="2"/>
                    <line x1={f.width/2} y1={10} x2={f.width/2} y2={f.height-10} stroke="#cbd5e1" strokeWidth="2" strokeDasharray="10 5" />
                  </g>
                )}
                {f.type === 'washer-dryer' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={2}/>
                    <circle cx={f.width*0.25} cy={f.height/2} r={f.height*0.3} fill="none" stroke="#cbd5e1" />
                    <circle cx={f.width*0.75} cy={f.height/2} r={f.height*0.3} fill="none" stroke="#cbd5e1" />
                  </g>
                )}
                {f.type === 'fridge' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={2}/>
                    <line x1={0} y1={f.height*0.6} x2={f.width} y2={f.height*0.6} stroke="#000" strokeWidth="2" />
                    <rect x={f.width-5} y={f.height*0.1} width={2} height={f.height*0.3} fill="#475569" rx={1}/>
                  </g>
                )}
                {f.type === 'range' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={2}/>
                    <circle cx={f.width*0.3} cy={f.height*0.3} r={6} fill="none" stroke="#000" />
                    <circle cx={f.width*0.7} cy={f.height*0.3} r={6} fill="none" stroke="#000" />
                    <circle cx={f.width*0.3} cy={f.height*0.7} r={6} fill="none" stroke="#000" />
                    <circle cx={f.width*0.7} cy={f.height*0.7} r={6} fill="none" stroke="#000" />
                  </g>
                )}
                {f.type === 'fireplace' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="#475569" stroke="#000" strokeWidth="2"/>
                    <path d={`M 0,0 L ${f.width},${f.height} M ${f.width},0 L 0,${f.height}`} stroke="#94a3b8" strokeWidth="1" />
                    <circle cx={f.width/2} cy={f.height/2} r={8} fill="#ef4444" opacity="0.2" className="animate-pulse" />
                  </g>
                )}
                {f.type === 'elec-panel' && (
                  <g>
                    <rect width={f.width} height={f.height} fill="#1e293b"/>
                    <text x={f.width/2} y={f.height/2+3} textAnchor="middle" fill="white" className="text-[7px] font-bold">E-PANEL</text>
                  </g>
                )}
                {f.type === 'water-heater' && (
                  <g>
                    <circle cx={f.width/2} cy={f.height/2} r={f.width/2-1} fill="white" stroke="#000" strokeWidth="2"/>
                    <text x={f.width/2} y={f.height/2+3} textAnchor="middle" className="text-[7px] font-bold">WH</text>
                  </g>
                )}

                {/* Generic Fallback */}
                {!['door', 'sliding-door', 'window', 'stairs', 'closet-unit', 'closet-double', 'toilet', 'shower', 'bathtub', 'sink-single', 'sink-double', 'vanity-single', 'vanity-double', 'single-bed', 'double-bed', 'sofa', 'kitchen-island', 'balcony', 'entry', 'garden', 'driveway', 'washer-dryer', 'fridge', 'range', 'fireplace', 'elec-panel', 'water-heater'].includes(f.type) && (
                   <rect width={f.width} height={f.height} fill="white" stroke="#000" strokeWidth="2" rx={2}/>
                )}

                <rect width={f.width} height={f.height} fill="transparent" stroke={state.selectedId === f.id ? '#4f46e5' : 'transparent'} strokeWidth={4} strokeDasharray="5 5" />
                <text x={f.width/2} y={f.height + 11} textAnchor="middle" className="text-[8px] font-black fill-slate-500 uppercase tracking-tight pointer-events-none">{f.label}</text>
                
                {state.showDimensions && (
                  <>
                    <text x={f.width / 2} y={-10} textAnchor="middle" className="text-[10px] font-black fill-indigo-600 uppercase">
                      {formatDim(f.width)}
                    </text>
                    <text x={-10} y={f.height / 2} textAnchor="middle" transform={`rotate(-90, -10, ${f.height / 2})`} className="text-[10px] font-black fill-indigo-600 uppercase">
                      {formatDim(f.height)}
                    </text>
                  </>
                )}
                
                {state.selectedId === f.id && <circle cx={f.width} cy={f.height} r={9} className="fill-indigo-600 stroke-white stroke-2 shadow-sm" onMouseDown={e => onMouseDown(e, 'resize', f.id)} />}
              </g>
            ))}

            {state.exits.map(ex => (
              <g key={ex.id} onMouseDown={e => onMouseDown(e, 'exit', ex.id)} onClick={e => e.stopPropagation()} className="cursor-move z-20 group">
                <circle cx={ex.x} cy={ex.y} r={18} fill={ex.type === 'primary' ? '#22c55e' : '#ef4444'} stroke="white" strokeWidth="4" className="shadow-xl" />
                <text x={ex.x} y={ex.y + 35} textAnchor="middle" className="text-[10px] font-black fill-slate-900 uppercase pointer-events-none drop-shadow-sm">{ex.label}</text>
                {ex.type === 'primary' && <path d={`M ${ex.x-8},${ex.y} l 10,0 m -5,-5 l 5,5 l -5,5`} fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" />}
              </g>
            ))}
          </svg>
        </div>

        {analysisResult && (
          <div className="absolute right-12 top-12 w-[520px] bg-slate-900 shadow-2xl rounded-3xl border border-white/10 overflow-hidden flex flex-col z-50 animate-in slide-in-from-right-10 duration-500">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <BrainCircuit size={28} className="text-white animate-pulse" />
                <span className="text-xl font-black tracking-tight">AI SAFETY AUDIT</span>
              </div>
              <button onClick={() => setAnalysisResult(null)} className="hover:bg-white/20 p-2 rounded-xl transition-all"><X size={24}/></button>
            </div>
            <div className="p-10 overflow-y-auto max-h-[70vh] text-base leading-relaxed text-slate-300 font-mono whitespace-pre-wrap scrollbar-thin scrollbar-thumb-slate-700">
              {analysisResult}
            </div>
            <div className="p-5 bg-white/5 border-t border-white/10 text-[10px] text-slate-500 text-center font-bold tracking-widest uppercase">
              Notice: This tool provides guidance only. Verify all plans with local authorities.
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;