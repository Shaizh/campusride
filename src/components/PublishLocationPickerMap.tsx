import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Info, Compass, HelpCircle, Check, MapPinOff, Search } from 'lucide-react';
import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { COLLEGES, calculateDistanceKm, LOCATION_COORDINATES, getCoordinates } from '../data/colleges';
import { getCurrentUser } from '../data/db';

const API_KEY =
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  '';

const isGoogleMapsKeyFormat = (key: string) => {
  return typeof key === 'string' && key.startsWith('AIzaSy') && key.trim().length >= 35;
};

const hasValidKey = Boolean(API_KEY) && isGoogleMapsKeyFormat(API_KEY);

// Programmatic route helper for Google Maps
function PublishRouteDisplay({ 
  origin, 
  destination,
  onComputedDistance
}: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  onComputedDistance: (km: number) => void;
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
      fields: ['path', 'distanceMeters', 'viewport'],
    }).then(({ routes }) => {
      if (routes?.[0]) {
        const route = routes[0];
        const newPolylines = route.createPolylines();
        newPolylines.forEach(polyline => {
          polyline.setOptions({
            strokeColor: '#3B82F6',
            strokeOpacity: 0.9,
            strokeWeight: 5,
          });
          polyline.setMap(map);
        });
        polylinesRef.current = newPolylines;

        // Auto-fit path
        if (route.viewport) {
          map.fitBounds(route.viewport);
        }

        // Return distance in km
        const distanceKm = route.distanceMeters ? parseFloat((route.distanceMeters / 1000).toFixed(1)) : 0;
        if (distanceKm > 0) {
          onComputedDistance(distanceKm);
        }
      }
    }).catch(err => {
      console.warn("Could not calculate actual Google Maps routing polyline:", err);
      // Fallback: use Haversine distance
      const fallbackDist = calculateDistanceKm(origin.lat, origin.lng, destination.lat, destination.lng);
      onComputedDistance(fallbackDist);
    });

    return () => {
      polylinesRef.current.forEach(p => p.setMap(null));
    };
  }, [routesLib, map, origin.lat, origin.lng, destination.lat, destination.lng]);

  return null;
}

interface PublishLocationPickerMapProps {
  pickupName: string;
  destinationName: string;
  onSelectLocations: (details: {
    pickup: string;
    destination: string;
    pickupCoords: [number, number];   // [lat, lng]
    destinationCoords: [number, number];
    distanceKm: number;
    fare: number;
  }) => void;
}

export function getFareForDistance(km: number): number {
  if (km <= 0) return 0;
  if (km <= 10) return 15;
  if (km <= 20) return 30;
  if (km <= 30) return 45;
  if (km <= 40) return 60;
  if (km <= 50) return 75;
  // Dynamic scale above 50km following the same 10km step pattern
  return Math.ceil(km / 10) * 15;
}

export default function PublishLocationPickerMap({
  pickupName,
  destinationName,
  onSelectLocations,
}: PublishLocationPickerMapProps) {
  // Read current preselected coordinates
  const initialPickup = getCoordinates(pickupName);
  const initialDestination = getCoordinates(destinationName);

  const activeState = getCurrentUser()?.state || localStorage.getItem('campusride_selected_state') || 'Karnataka';
  const activeColleges = COLLEGES.filter(c => c.state === activeState);
  const activeAreas = Array.from(new Set(activeColleges.map(c => c.area)));
  const regionOptions = ['All', ...activeAreas];

  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number }>(initialPickup);
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number }>(initialDestination);
  const [pinMode, setPinMode] = useState<'pickup' | 'destination'>('pickup');
  const [mapMode, setMapMode] = useState<'gmap' | 'simulation'>(hasValidKey ? 'gmap' : 'simulation');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All');

  useEffect(() => {
    setSelectedRegion('All');
  }, [activeState]);

  // Trigger distance calculation
  const [distanceKm, setDistanceKm] = useState<number>(() => {
    return calculateDistanceKm(initialPickup.lat, initialPickup.lng, initialDestination.lat, initialDestination.lng);
  });

  const fare = getFareForDistance(distanceKm);

  // Sync inputs if they change from external fields (like typed values)
  useEffect(() => {
    const p = getCoordinates(pickupName);
    setPickupCoords(p);
  }, [pickupName]);

  useEffect(() => {
    const d = getCoordinates(destinationName);
    setDestinationCoords(d);
  }, [destinationName]);

  // Handle local parameter updates to main form
  const reportUpdates = (
    pName: string, 
    dName: string, 
    pCo: { lat: number; lng: number }, 
    dCo: { lat: number; lng: number }, 
    dist: number
  ) => {
    const calculatedFare = getFareForDistance(dist);
    onSelectLocations({
      pickup: pName,
      destination: dName,
      pickupCoords: [pCo.lat, pCo.lng],
      destinationCoords: [dCo.lat, dCo.lng],
      distanceKm: dist,
      fare: calculatedFare,
    });
  };

  // Helper to resolve location name from custom pin or landmark
  const findNearestLandmarkName = (lat: number, lng: number) => {
    let nearestName = `Pinned Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    let nearestDist = 999999;

    for (const [name, coord] of Object.entries(LOCATION_COORDINATES)) {
      const d = calculateDistanceKm(lat, lng, coord.lat, coord.lng);
      if (d < nearestDist) {
        nearestDist = d;
        if (d <= 0.4) {
          nearestName = name; // exact or very close snap
        } else {
          nearestName = `Near ${name} (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        }
      }
    }
    return nearestName;
  };

  const handleMapClick = (e: any) => {
    const latLng = e.detail?.latLng || e.latLng;
    if (!latLng) return;
    const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
    const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;

    const locName = findNearestLandmarkName(lat, lng);

    if (pinMode === 'pickup') {
      const newPickup = { lat, lng };
      setPickupCoords(newPickup);
      const newDist = calculateDistanceKm(lat, lng, destinationCoords.lat, destinationCoords.lng);
      setDistanceKm(newDist);
      reportUpdates(locName, destinationName, newPickup, destinationCoords, newDist);
      setPinMode('destination'); // auto-toggle for high usability
    } else {
      const newDest = { lat, lng };
      setDestinationCoords(newDest);
      const newDist = calculateDistanceKm(pickupCoords.lat, pickupCoords.lng, lat, lng);
      setDistanceKm(newDist);
      reportUpdates(pickupName, locName, pickupCoords, newDest, newDist);
      setPinMode('pickup'); // auto-toggle back
    }
  };

  const selectPredefinedLandmark = (name: string, coord: { lat: number; lng: number }) => {
    if (pinMode === 'pickup') {
      setPickupCoords(coord);
      const newDist = calculateDistanceKm(coord.lat, coord.lng, destinationCoords.lat, destinationCoords.lng);
      setDistanceKm(newDist);
      reportUpdates(name, destinationName, coord, destinationCoords, newDist);
      setPinMode('destination');
    } else {
      setDestinationCoords(coord);
      const newDist = calculateDistanceKm(pickupCoords.lat, pickupCoords.lng, coord.lat, coord.lng);
      setDistanceKm(newDist);
      reportUpdates(pickupName, name, pickupCoords, coord, newDist);
      setPinMode('pickup');
    }
  };

  // For offline fallback, calculate distance when coords update
  useEffect(() => {
    const dist = calculateDistanceKm(pickupCoords.lat, pickupCoords.lng, destinationCoords.lat, destinationCoords.lng);
    setDistanceKm(dist);
  }, [pickupCoords, destinationCoords]);

  return (
    <div id="publish-location-picker" className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-4 space-y-4">
      {/* Header metadata */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900 pb-3">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-[#00C896] animate-pulse" />
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Route Kilometer Fare Calculator</h4>
            <p className="text-[10px] text-slate-400">Interactive map pinning snaps to matching college landmarks</p>
          </div>
        </div>

        {/* Map Engine Toggle */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[10px]">
          <button
            type="button"
            onClick={() => setMapMode('gmap')}
            className={`px-2 py-1 rounded cursor-pointer font-bold transition ${mapMode === 'gmap' ? 'bg-[#00C896] text-slate-950' : 'text-slate-400 hover:text-white'}`}
          >
            Google Maps
          </button>
          <button
            type="button"
            onClick={() => setMapMode('simulation')}
            className={`px-2 py-1 rounded cursor-pointer font-bold transition ${mapMode === 'simulation' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Sim Campus
          </button>
        </div>
      </div>

      {/* Control Tools for Pinning */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-xl border border-slate-800 w-full sm:w-auto">
          <span className="text-[10px] font-bold uppercase text-slate-500 pl-1">Pin target:</span>
          
          <button
            type="button"
            onClick={() => setPinMode('pickup')}
            className={`cursor-pointer px-3 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 w-1/2 sm:w-auto justify-center ${
              pinMode === 'pickup' 
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                : 'text-slate-400 hover:text-white bg-slate-950/40 border border-transparent'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" /> Pickup
          </button>

          <button
            type="button"
            onClick={() => setPinMode('destination')}
            className={`cursor-pointer px-3 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 w-1/2 sm:w-auto justify-center ${
              pinMode === 'destination' 
                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' 
                : 'text-slate-400 hover:text-white bg-slate-950/40 border border-transparent'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" /> Dest
          </button>
        </div>

        <div className="text-[11px] bg-slate-900/60 border border-slate-800 px-3 py-2 rounded-xl text-slate-300 flex items-center gap-2">
          <span>🎯 Click on map or landmark to place active pin</span>
        </div>
      </div>

      {/* Map view container */}
      <div className="relative w-full h-[340px] rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
        
        {mapMode === 'gmap' && hasValidKey ? (
          <APIProvider apiKey={API_KEY} version="weekly">
            <Map
              defaultCenter={pickupCoords}
              defaultZoom={11}
              mapId="PUBLISH_RIDE_MAP"
              onClick={handleMapClick}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
              gestureHandling="greedy"
              disableDefaultUI={true}
            >
              {/* Calculate and render route dynamically */}
              <PublishRouteDisplay 
                origin={pickupCoords} 
                destination={destinationCoords}
                onComputedDistance={(km) => {
                  setDistanceKm(km);
                  reportUpdates(pickupName, destinationName, pickupCoords, destinationCoords, km);
                }}
              />

              {/* Pickup Pin */}
              <AdvancedMarker position={pickupCoords} title={`Pickup Coords: ${pickupName}`}>
                <Pin background="#2563EB" glyphColor="#fff" />
              </AdvancedMarker>

              {/* Destination Pin */}
              <AdvancedMarker position={destinationCoords} title={`Destination Coords: ${destinationName}`}>
                <Pin background="#00C896" glyphColor="#fff" />
              </AdvancedMarker>
            </Map>
          </APIProvider>
        ) : (
          /* Robust Offline Simulation Map featuring clickable preselected campus landmarks */
          <div className="relative w-full h-full bg-[#0B132B] flex flex-col justify-between p-3 select-none gap-2">
            {/* Search and Filter Panel */}
            <div className="space-y-2 bg-slate-950/80 p-2 rounded-xl border border-slate-800/60 shrink-0">
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
                <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <input
                  type="text"
                  placeholder="Type to search campus or transit stop..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-[11px] text-slate-250 placeholder-slate-500 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-[10px] text-slate-500 hover:text-slate-350 px-1 font-bold"
                  >
                    Clear
                  </button>
                )}
              </div>
              
              {/* Region Pill Filters */}
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800 max-w-full">
                {regionOptions.map((region) => (
                  <button
                    key={region}
                    type="button"
                    onClick={() => setSelectedRegion(region)}
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition whitespace-nowrap cursor-pointer ${
                      selectedRegion === region
                        ? 'bg-[#00C896] text-[#0B132B]'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-205'
                    }`}
                  >
                    {region}
                  </button>
                ))}
              </div>
            </div>

            {/* Landmarks List Grid */}
            <div className="grow overflow-y-auto max-h-[160px] p-2 bg-slate-950/65 rounded-xl border border-slate-800/40 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {Object.entries(LOCATION_COORDINATES)
                  .filter(([name]) => {
                    const found = COLLEGES.find(c => c.name.toLowerCase() === name.toLowerCase());
                    if (!found || found.state !== activeState) return false;

                    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
                    if (selectedRegion === 'All') return matchesSearch;
                    
                    const area = found.area;
                    return matchesSearch && area.toLowerCase() === selectedRegion.toLowerCase();
                  })
                  .map(([name, coord]) => {
                    const isPickup = pickupName === name;
                    const isDest = destinationName === name;
                    const foundCol = COLLEGES.find(c => c.name.toLowerCase() === name.toLowerCase());
                    const labelArea = foundCol ? foundCol.area : 'Stop';

                    return (
                      <button
                        key={`coord-${name}`}
                        type="button"
                        onClick={() => selectPredefinedLandmark(name, coord)}
                        className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-bold text-left transition cursor-pointer flex items-center justify-between border group relative ${
                          isPickup 
                            ? 'bg-blue-950/90 text-blue-400 border-blue-500/80 shadow-md shadow-blue-950/40' 
                            : isDest 
                            ? 'bg-emerald-950/90 text-emerald-400 border-emerald-500/80 shadow-md shadow-emerald-950/40' 
                            : 'bg-slate-900/90 hover:bg-slate-850 hover:border-slate-700 text-slate-300 border-slate-800/60'
                        }`}
                      >
                        <div className="flex flex-col min-w-0 pr-1.5">
                          <span className="truncate leading-tight">{name}</span>
                          <span className="text-[8px] text-slate-500 group-hover:text-slate-450 transition-colors uppercase font-mono tracking-tight mt-0.5">
                            {labelArea}
                          </span>
                        </div>
                        <div className="shrink-0 flex items-center gap-1">
                          {isPickup && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse border border-white/20" title="Selected Pickup" />}
                          {isDest && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse border border-white/20" title="Selected Destination" />}
                        </div>
                      </button>
                    );
                  })}
                {/* Empty fallback state */}
                {Object.entries(LOCATION_COORDINATES).filter(([name]) => {
                  const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
                  if (selectedRegion === 'All') return matchesSearch;
                  const found = COLLEGES.find(c => c.name.toLowerCase() === name.toLowerCase());
                  const area = found ? found.area : 'Local Stops';
                  return matchesSearch && area.toLowerCase() === selectedRegion.toLowerCase();
                }).length === 0 && (
                  <div className="col-span-full py-4 text-center text-slate-500 text-[10px] font-mono">
                    No matching location/campus found.
                  </div>
                )}
              </div>
            </div>

            {/* Simulated route info overlay */}
            <div className="bg-slate-950/95 border border-slate-850 p-2.5 rounded-xl flex items-center justify-between gap-2 mt-1 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-3.5 h-3.5 rounded-full bg-blue-500 flex items-center justify-center text-[8px] font-extrabold text-white shrink-0">A</div>
                <div className="text-[10px] truncate max-w-[100px] text-slate-200 font-bold">{pickupName || 'Pickup Not Set'}</div>
                <div className="text-slate-500 shrink-0 text-[10px]">→</div>
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[8px] font-extrabold text-white shrink-0">B</div>
                <div className="text-[10px] truncate max-w-[100px] text-slate-200 font-bold">{destinationName || 'Destination Not Set'}</div>
              </div>
              <span className="text-[9px] font-mono text-[#00C896] bg-[#00C896]/10 px-1.5 py-0.5 rounded border border-[#00C896]/20 shrink-0 whitespace-nowrap">
                Direct Sim Route
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Real-time Distance & Peer Pricing Matrix breakdown */}
      <div className="bg-slate-900/50 border border-slate-900 p-3 rounded-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          
          <div className="bg-slate-955 p-2 rounded-lg border border-slate-800">
            <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Computed Trip Distance</span>
            <div className="text-sm font-black text-white flex items-baseline gap-1 mt-0.5">
              <span>{distanceKm}</span>
              <span className="text-xs text-slate-450 font-normal">kilometres</span>
            </div>
          </div>

          <div className="bg-slate-955 p-2 rounded-lg border border-slate-800">
            <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Automatic Student Charge Rate</span>
            <div className="text-sm font-black text-[#00C896] flex items-baseline gap-1 mt-0.5">
              <span>₹{fare}</span>
              <span className="text-xs text-slate-450 font-normal">per seat share</span>
            </div>
          </div>

          <div className="bg-slate-955 p-2 rounded-lg border border-slate-800 flex items-center gap-2 col-span-1 sm:col-span-2 md:col-span-1">
            <div className="bg-[#00C896]/10 p-1.5 rounded-lg border border-[#00C896]/20">
              <Info className="w-4 h-4 text-[#00C896]" />
            </div>
            <div className="text-[10.5px] leading-tight text-slate-300">
              Pricing is strictly calculated according to college commute grids standard scales.
            </div>
          </div>

        </div>

        {/* Pricing Guide list */}
        <div className="mt-3 bg-slate-950/80 p-2.5 rounded-lg border border-slate-850">
          <span className="text-[9.5px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Commute Pricing Grid Reference Scale:</span>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5 text-[9px] text-slate-450 font-mono">
            <div className={`p-1.5 rounded text-center border ${distanceKm <= 10 ? 'bg-blue-950/45 text-blue-400 border-blue-500/25' : 'bg-slate-900/40 border-transparent'}`}>0-10 km: ₹15</div>
            <div className={`p-1.5 rounded text-center border ${distanceKm > 10 && distanceKm <= 20 ? 'bg-blue-950/45 text-blue-400 border-blue-500/25' : 'bg-slate-900/40 border-transparent'}`}>10-20 km: ₹30</div>
            <div className={`p-1.5 rounded text-center border ${distanceKm > 20 && distanceKm <= 30 ? 'bg-blue-950/45 text-blue-400 border-blue-500/25' : 'bg-slate-900/40 border-transparent'}`}>20-30 km: ₹45</div>
            <div className={`p-1.5 rounded text-center border ${distanceKm > 30 && distanceKm <= 40 ? 'bg-blue-950/45 text-blue-400 border-blue-500/25' : 'bg-slate-900/40 border-transparent'}`}>30-40 km: ₹60</div>
            <div className={`p-1.5 rounded text-center border ${distanceKm > 40 && distanceKm <= 50 ? 'bg-[#00C896]/10 text-[#00C896] border-[#00C896]/20' : 'bg-slate-900/40 border-transparent'}`}>40-50 km: ₹75</div>
          </div>
        </div>
      </div>
    </div>
  );
}
