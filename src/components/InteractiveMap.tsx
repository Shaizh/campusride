import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RefreshCw, Navigation, MapPin, Target, CheckCircle2, Copy, ExternalLink, Sliders } from 'lucide-react';
import { RouteCoord } from '../types';
import { getCoordinates, calculateDistanceKm, calculateTravelTimeMinutes, LOCATION_COORDINATES } from '../data/colleges';
import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

// Read API key from environment variables
const API_KEY =
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  '';

const isGoogleMapsKeyFormat = (key: string) => {
  return typeof key === 'string' && key.startsWith('AIzaSy') && key.trim().length >= 35;
};

const hasValidKey = Boolean(API_KEY) && isGoogleMapsKeyFormat(API_KEY);

interface InteractiveMapProps {
  pickupName: string;
  destinationName: string;
  riderMode?: boolean; // Is it the rider viewing vs the passenger viewing
  onUpdateLocation?: (lat: number, lng: number) => void;
  showApproachSimulation?: boolean; // If passenger is viewing booked ride, show driver approaching
}

// Inner helper component to calculate and draw Google Maps routes
function RouteDisplay({ origin, destination }: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!routesLib || !map) return;
    
    // Clear previous polylines
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    routesLib.Route.computeRoutes({
      origin,
      destination,
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    }).then(({ routes }) => {
      if (routes?.[0]) {
        const newPolylines = routes[0].createPolylines();
        newPolylines.forEach(polyline => {
          polyline.setOptions({
            strokeColor: '#00C896',
            strokeOpacity: 0.85,
            strokeWeight: 5,
          });
          polyline.setMap(map);
        });
        polylinesRef.current = newPolylines;
        if (routes[0].viewport) {
          map.fitBounds(routes[0].viewport);
        }
      }
    }).catch(err => {
      console.warn("Could not calculate actual Google Maps routing polyline:", err);
    });

    return () => {
      polylinesRef.current.forEach(p => p.setMap(null));
    };
  }, [routesLib, map, origin.lat, origin.lng, destination.lat, destination.lng]);

  return null;
}

export default function InteractiveMap({
  pickupName,
  destinationName,
  riderMode = false,
  onUpdateLocation,
  showApproachSimulation = false,
}: InteractiveMapProps) {
  const pickup = getCoordinates(pickupName);
  const destination = getCoordinates(destinationName);

  // Core Math Calculations for ETA & distance
  const distance = calculateDistanceKm(pickup.lat, pickup.lng, destination.lat, destination.lng);
  const travelTime = calculateTravelTimeMinutes(distance);

  // Map Mode selection: 'gmap' vs 'simulation'
  const [mapMode, setMapMode] = useState<'gmap' | 'simulation'>(hasValidKey ? 'gmap' : 'simulation');
  const [copied, setCopied] = useState(false);

  // Simulator Progress (0 to 100 representing position along the route)
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(showApproachSimulation);
  const animationRef = useRef<number | null>(null);

  // Auto-fit selection state: 'remaining' | 'full' | 'off'
  const [autoFitMode, setAutoFitMode] = useState<'remaining' | 'full' | 'off'>('remaining');

  // Position of moving vehicle
  const currentLat = pickup.lat + ((destination.lat - pickup.lat) * progress) / 100;
  const currentLng = pickup.lng + ((destination.lng - pickup.lng) * progress) / 100;

  // Keep onUpdateLocation in a stable ref to prevent infinite loops from inline callback references
  const onUpdateLocationRef = useRef(onUpdateLocation);
  useEffect(() => {
    onUpdateLocationRef.current = onUpdateLocation;
  }, [onUpdateLocation]);

  // Trigger optional location update callback for sync
  useEffect(() => {
    if (onUpdateLocationRef.current) {
      onUpdateLocationRef.current(currentLat, currentLng);
    }
  }, [currentLat, currentLng]);

  // Handle simulation animation loop
  useEffect(() => {
    if (isPlaying) {
      const startTime = Date.now();
      const duration = 25000; // 25 seconds for a full college transit sim

      const tick = () => {
        const elapsed = Date.now() - startTime;
        const nextProgress = Math.min(100, (elapsed / duration) * 100);

        setProgress(nextProgress);

        if (nextProgress < 100) {
          animationRef.current = requestAnimationFrame(tick);
        } else {
          setIsPlaying(false);
        }
      };

      animationRef.current = requestAnimationFrame(tick);
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying]);

  // Auto restart/trigger approaching simulation if prop changes
  useEffect(() => {
    if (showApproachSimulation) {
      setIsPlaying(true);
      setProgress(0);
    }
  }, [showApproachSimulation]);

  const copySecretLabel = () => {
    navigator.clipboard.writeText('GOOGLE_MAPS_PLATFORM_KEY');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // SVGs projections bounds for Fallback mode
  const minLat = 12.78;
  const maxLat = 13.10;
  const minLng = 74.75;
  const maxLng = 74.99;

  const projectCoordX = (lng: number) => {
    return ((lng - minLng) / (maxLng - minLng)) * 100;
  };

  const projectCoordY = (lat: number) => {
    return 100 - ((lat - minLat) / (maxLat - minLat)) * 100;
  };

  const x1 = projectCoordX(pickup.lng);
  const y1 = projectCoordY(pickup.lat);
  const x2 = projectCoordX(destination.lng);
  const y2 = projectCoordY(destination.lat);

  const xm = projectCoordX(currentLng);
  const ym = projectCoordY(currentLat);

  // Dynamic Auto-Fit scaling for Fallback Map
  let centerPointX = 50;
  let centerPointY = 50;
  let zoomScale = 1;

  if (autoFitMode !== 'off') {
    let pts: { x: number; y: number }[] = [];
    if (autoFitMode === 'remaining') {
      pts = [{ x: xm, y: ym }, { x: x2, y: y2 }];
    } else {
      pts = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    }

    if (autoFitMode === 'full') {
      pts.push({ x: xm, y: ym });
    }

    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);

    const padding = 15;
    const widthBox = Math.max(10, (xMax - xMin) + padding * 2);
    const heightBox = Math.max(10, (yMax - yMin) + padding * 2);

    centerPointX = (xMin + xMax) / 2;
    centerPointY = (yMin + yMax) / 2;

    const scaleX = 100 / widthBox;
    const scaleY = 100 / heightBox;
    zoomScale = Math.max(1.0, Math.min(3.5, Math.min(scaleX, scaleY)));
  }

  const transformStyle = {
    transform: autoFitMode !== 'off' 
      ? `translate(${(50 - centerPointX) * zoomScale}%, ${(50 - centerPointY) * zoomScale}%) scale(${zoomScale})`
      : 'none',
    transformOrigin: '50% 50%',
    transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
  };

  const resetSimulator = () => {
    setProgress(0);
    setIsPlaying(false);
  };

  return (
    <div id="interactive-map-layout" className="relative w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-[#0F172A] shadow-2xl">
      {/* Engine Switching Header */}
      <div className="absolute top-3 left-3 z-[40] flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 text-white rounded-xl px-2.5 py-1 text-[10px] shadow-lg backdrop-blur-md">
        <Sliders className="w-3 h-3 text-[#00C896]" />
        <span className="font-semibold select-none text-slate-300">Map Mode:</span>
        <button
          onClick={() => setMapMode('gmap')}
          className={`px-1.5 py-0.5 rounded-lg cursor-pointer font-bold transition ${mapMode === 'gmap' ? 'bg-[#00C896] text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}`}
        >
          Google Maps
        </button>
        <button
          onClick={() => setMapMode('simulation')}
          className={`px-1.5 py-0.5 rounded-lg cursor-pointer font-bold transition ${mapMode === 'simulation' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
        >
          Offline Sim
        </button>
      </div>

      <div className="relative w-full h-[320px] md:h-[400px]">
        {/* ================= MAP MODE A: GOOGLE MAPS PROPER ================= */}
        {mapMode === 'gmap' && (
          <>
            {hasValidKey ? (
              <div className="w-full h-full relative" style={{ minHeight: '320px' }}>
                <APIProvider apiKey={API_KEY} version="weekly">
                  <Map
                    defaultCenter={pickup}
                    defaultZoom={12}
                    mapId="DEMO_MAP_ID"
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    style={{ width: '100%', height: '100%' }}
                    gestureHandling="greedy"
                    disableDefaultUI={false}
                  >
                    {/* Compute & display real routing polyline */}
                    <RouteDisplay origin={pickup} destination={destination} />

                    {/* Standard Pickup pin */}
                    <AdvancedMarker position={pickup} title={`Pickup: ${pickupName}`}>
                      <Pin background="#2563EB" glyphColor="#fff" />
                    </AdvancedMarker>

                    {/* Standard Destination pin */}
                    <AdvancedMarker position={destination} title={`Destination: ${destinationName}`}>
                      <Pin background="#00C896" glyphColor="#fff" />
                    </AdvancedMarker>

                    {/* Live Moving vehicle marker */}
                    <AdvancedMarker 
                      position={{ lat: currentLat, lng: currentLng }} 
                      title={`Moving vehicle - ${progress.toFixed(0)}%`}
                    >
                      {/* Sized explicitly inline to avoid CF3 sizing collapses */}
                      <div 
                        className="w-[42px] h-[42px] bg-slate-900 border-2 border-[#00C896] rounded-full flex items-center justify-center shadow-xl animate-subtle-bounce select-none" 
                        style={{ width: '42px', height: '42px' }}
                      >
                        <span className="text-lg">🛵</span>
                      </div>
                    </AdvancedMarker>
                  </Map>
                </APIProvider>

                {/* Floating GPS coordinates details bubble */}
                <div className="absolute bottom-4 right-4 z-10 glass-panel px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-emerald-400 font-bold tracking-tight">
                  GPS: {currentLat.toFixed(5)}N, {currentLng.toFixed(5)}E
                </div>
              </div>
            ) : (
              /* If no Google Maps Key is supplied yet, render the elegant guided installation setup screen */
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 border border-slate-850 p-6 md:p-10 text-white z-20 text-center select-none overflow-y-auto">
                <div className="max-w-[500px] space-y-4">
                  <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/30">
                    <MapPin className="w-6 h-6 text-amber-500 animate-bounce" />
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-100">Google Maps API Key Required</h3>
                    <p className="text-xs text-slate-400">Unlock fully interactive satellite maps, directions polylines, and real landmarks.</p>
                  </div>

                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-left text-xs space-y-2.5">
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-400 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <p className="text-[11px] text-slate-300">
                        <a 
                          href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-[#00C896] hover:underline font-bold inline-flex items-center gap-1"
                        >
                          Generate a Maps API key <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>

                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-400 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-slate-300">Add the secret to AI Studio:</p>
                        <ul className="list-disc pl-4 text-[10.5px] text-slate-400 space-y-1">
                          <li>Open Settings (⚙️ gear icon, <strong>top-right corner</strong>)</li>
                          <li>Select <strong>Secrets</strong></li>
                          <li>Type secret name: <code className="text-emerald-400 bg-slate-950 px-1 py-0.5 rounded font-mono font-bold select-all">GOOGLE_MAPS_PLATFORM_KEY</code></li>
                          <li>Paste your API key value, and click **Save**</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <button
                      onClick={copySecretLabel}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-2 cursor-pointer transition w-full sm:w-auto justify-center"
                    >
                      {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      <span>{copied ? 'Copied Secret Name!' : 'Copy Secret Name'}</span>
                    </button>

                    <button
                      onClick={() => setMapMode('simulation')}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#00C896] hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 cursor-pointer transition w-full sm:w-auto justify-center font-mono"
                    >
                      <span>Launch Simulated Fallback</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

          {/* ================= MAP MODE B: HIGH-FIDELITY OFFLINE FALLBACK VECTOR SIMULATION ================= */}
          {mapMode === 'simulation' && (
            <div className="w-full h-full relative bg-[#0F172A] overflow-hidden">
              {/* Decorative Blue Grid Canvas */}
              <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
                <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="grid-inner" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#2563EB" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid-inner)" />
                </svg>
              </div>

              {/* Landscape SVG */}
              <svg className="absolute inset-0 w-full h-full p-6 z-0" overflow="visible">
                {/* Coastal wave outlines */}
                <path
                  d="M -50,500 Q 50,300 20,150 T 150,-50"
                  fill="none"
                  stroke="#1D4ED8"
                  strokeWidth="3"
                  className="opacity-30 stroke-dasharray-[5,10]"
                />
                <path
                  d="M -70,520 Q 30,320 5,160 T 135,-30"
                  fill="none"
                  stroke="#0284C7"
                  strokeWidth="1.5"
                  className="opacity-15"
                />

                {/* Perspective zoom matrix */}
                <g style={transformStyle}>
                  {/* Base track backline */}
                  <line
                    x1={`${x1}%`}
                    y1={`${y1}%`}
                    x2={`${x2}%`}
                    y2={`${y2}%`}
                    stroke="#1E293B"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                  {/* Scheduled trace */}
                  <line
                    x1={`${x1}%`}
                    y1={`${y1}%`}
                    x2={`${x2}%`}
                    y2={`${y2}%`}
                    stroke="#2563EB"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  
                  {/* Completed journey highlight */}
                  <line
                    x1={`${x1}%`}
                    y1={`${y1}%`}
                    x2={`${xm}%`}
                    y2={`${ym}%`}
                    stroke="#00C896"
                    strokeWidth="4"
                    strokeLinecap="round"
                    className="transition-all duration-300"
                  />

                  {/* Pulsing dotted loop */}
                  <line
                    x1={`${x1}%`}
                    y1={`${y1}%`}
                    x2={`${x2}%`}
                    y2={`${y2}%`}
                    stroke="#60A5FA"
                    strokeWidth="2"
                    strokeDasharray="6,4"
                    strokeLinecap="round"
                    className="animate-[dash_10s_linear_infinite]"
                  />

                  {/* Neighboring regional student hubs */}
                  {Object.entries(LOCATION_COORDINATES).map(([key, coord]) => {
                    if (key === pickupName || key === destinationName) return null;
                    const px = projectCoordX(coord.lng);
                    const py = projectCoordY(coord.lat);
                    return (
                      <g key={key} className="opacity-30 hover:opacity-75 transition-opacity">
                        <circle cx={`${px}%`} cy={`${py}%`} r="3.5" fill="#475569" />
                        <text
                          x={`${px}%`}
                          y={`${py - 1.5}%`}
                          textAnchor="middle"
                          className="font-mono text-[8.5px] fill-slate-400 select-none hidden md:block"
                        >
                          {key.split(' ')[0]}
                        </text>
                      </g>
                    );
                  })}

                  {/* Pickup Pin */}
                  <g>
                    <circle cx={`${x1}%`} cy={`${y1}%`} r="12" fill="#2563EB" fillOpacity="0.2" className="animate-ping" />
                    <circle cx={`${x1}%`} cy={`${y1}%`} r="6" fill="#2563EB" />
                    <circle cx={`${x1}%`} cy={`${y1}%`} r="2" fill="#FFFFFF" />
                  </g>

                  {/* Destination Pin */}
                  <g>
                    <circle cx={`${x2}%`} cy={`${y2}%`} r="12" fill="#00C896" fillOpacity="0.2" className="animate-ping" />
                    <circle cx={`${x2}%`} cy={`${y2}%`} r="6" fill="#00C896" />
                    <polygon points="0,-4 3,2 -3,2" transform={`translate(${(x2 / 100) * 400}, ${(y2 / 100) * 300})`} fill="#FFFFFF" />
                  </g>

                  {/* Travelling Driver */}
                  <g className="transition-all duration-350">
                    <circle cx={`${xm}%`} cy={`${ym}%`} r="9.5" fill="#0F172A" stroke="#00C896" strokeWidth="2.5" />
                    <circle cx={`${xm}%`} cy={`${ym}%`} r="4.5" fill="#00C896" />
                  </g>
                </g>
              </svg>

              {/* Auto-Fit HUD controls */}
              <div className="absolute top-14 left-3 z-[41]">
                <button
                  onClick={() => {
                    setAutoFitMode(prev => prev === 'remaining' ? 'full' : prev === 'full' ? 'off' : 'remaining');
                  }}
                  className={`px-2 py-1 rounded-lg text-[9px] font-bold flex items-center gap-1.5 border transition-all cursor-pointer shadow-md text-white bg-slate-900 border-slate-700 hover:bg-slate-800`}
                >
                  <Target className={`w-3 h-3 ${autoFitMode !== 'off' ? 'animate-pulse text-emerald-400' : ''}`} />
                  <span className="font-mono uppercase">
                    {autoFitMode === 'remaining' && 'Fit: Remaining'}
                    {autoFitMode === 'full' && 'Fit: Full Plan'}
                    {autoFitMode === 'off' && 'Fit: Off'}
                  </span>
                </button>
              </div>

              {/* Bottom absolute overlay indicators */}
              <div className="absolute bottom-3 left-3 z-10 glass-panel px-3 py-1 bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-400 rounded-lg">
                GPS: {currentLat.toFixed(4)}N, {currentLng.toFixed(4)}E
              </div>
            </div>
          )}
      </div>

      {/* Shared Route details and ETA Overlay card */}
      <div className="absolute bottom-3 left-3 z-10 hidden sm:flex flex-col gap-2.5 glass-panel-heavy p-3 rounded-2xl text-white shadow-xl max-w-[240px] bg-slate-950/90 border border-slate-800 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-[#2563EB]/20 text-[#2563EB]">
            <Navigation className="w-3.5 h-3.5" />
          </div>
          <div className="text-xs">
            <span className="text-slate-400 block text-[9px] uppercase tracking-wide">Transit Route</span>
            <span className="font-bold text-slate-100 block truncate">
              {pickupName.slice(0, 14)} → {destinationName.slice(0, 14)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1.5 border-t border-slate-900">
          <div>
            <span className="text-slate-400 block text-[8px] uppercase tracking-normal">Zone Dist.</span>
            <span className="text-xs font-bold text-[#00C896] font-mono">{distance} Km</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[8px] uppercase tracking-normal">Target ETA</span>
            <span className="text-xs font-bold text-emerald-400 font-mono">~{travelTime}m</span>
          </div>
        </div>
      </div>

      {/* Interactive Simulation Controls Footer */}
      <div className="bg-slate-100 dark:bg-[#070c14] border-t border-slate-200 dark:border-slate-850 p-3 sm:p-4 flex flex-col sm:flex-row gap-3 items-center justify-between select-none">
        <div className="text-[11px] text-slate-500 dark:text-slate-450 flex items-center gap-1.5 font-medium">
          <MapPin className="w-3.5 h-3.5 text-[#00C896] shrink-0" />
          <span>
            {progress === 100
              ? 'Arrived safely at destination terminal.'
              : `Simulating progress: ${progress.toFixed(0)}% (${(distance * progress / 100).toFixed(1)} / ${distance} km)`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            id="btn-play-pause-simulation"
            className={`p-1.5 rounded-xl border flex items-center gap-1 text-[11px] font-bold transition duration-200 cursor-pointer ${
              isPlaying
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/25'
                : 'bg-emerald-500/10 border-emerald-500/20 text-[#00C896] hover:bg-emerald-500/20'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlaying ? 'Pause' : 'Start Simulation'}</span>
          </button>

          <button
            onClick={resetSimulator}
            id="btn-reset-simulation"
            className="p-1.5 rounded-xl border border-slate-350 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold flex items-center gap-1 transition duration-200 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
}
