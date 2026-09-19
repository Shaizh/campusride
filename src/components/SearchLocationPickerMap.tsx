import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Info, Compass, HelpCircle, Check, MapPinOff, Search, Trash2 } from 'lucide-react';
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

// Display the selected route polyline in Google Maps
function SearchRouteDisplay({ 
  origin, 
  destination 
}: {
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
      fields: ['path', 'viewport'],
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

interface SearchLocationPickerMapProps {
  pickupName: string;
  destinationName: string;
  onSelectLocations: (details: {
    pickup: string;
    destination: string;
  }) => void;
  onClearFilters: () => void;
}

export default function SearchLocationPickerMap({
  pickupName,
  destinationName,
  onSelectLocations,
  onClearFilters,
}: SearchLocationPickerMapProps) {
  // Read current coordinates
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

  // Sync state if names change from the search boxes
  useEffect(() => {
    setPickupCoords(getCoordinates(pickupName));
  }, [pickupName]);

  useEffect(() => {
    setDestinationCoords(getCoordinates(destinationName));
  }, [destinationName]);

  const reportUpdates = (newPickupName: string, newDestName: string) => {
    onSelectLocations({
      pickup: newPickupName,
      destination: newDestName
    });
  };

  const findNearestLandmarkName = (lat: number, lng: number) => {
    let nearestName = '';
    let nearestDist = 999999;

    for (const [name, coord] of Object.entries(LOCATION_COORDINATES)) {
      const d = calculateDistanceKm(lat, lng, coord.lat, coord.lng);
      if (d < nearestDist) {
        nearestDist = d;
        if (d <= 0.6) {
          nearestName = name; // snap to nearest known landmark within reasonable distance
        }
      }
    }
    return nearestName || `Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
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
      reportUpdates(locName, destinationName);
      setPinMode('destination'); // auto-toggle for high usability
    } else {
      const newDest = { lat, lng };
      setDestinationCoords(newDest);
      reportUpdates(pickupName, locName);
      setPinMode('pickup'); // auto-toggle back
    }
  };

  const selectPredefinedLandmark = (name: string, coord: { lat: number; lng: number }) => {
    if (pinMode === 'pickup') {
      setPickupCoords(coord);
      reportUpdates(name, destinationName);
      setPinMode('destination');
    } else {
      setDestinationCoords(coord);
      reportUpdates(pickupName, name);
      setPinMode('pickup');
    }
  };

  return (
    <div id="search-location-picker" className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-4 space-y-4">
      {/* Header metadata */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900 pb-3">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-sky-400 animate-pulse" />
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Passenger Route Locator</h4>
            <p className="text-[10px] text-slate-450">Select college landmarks to filter matching commute schedules</p>
          </div>
        </div>

        {/* Map Engine Toggle */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[10px]">
          <button
            type="button"
            onClick={() => setMapMode('gmap')}
            className={`px-2 py-1 rounded cursor-pointer font-bold transition ${mapMode === 'gmap' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
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
            <MapPin className="w-3.5 h-3.5" /> Destination
          </button>
        </div>

        {/* Clear filters button */}
        {(pickupName || destinationName) && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-[10px] font-bold uppercase tracking-wider text-red-400 hover:text-red-300 transition flex items-center gap-1 bg-red-950/20 px-2.5 py-1.5 rounded-lg border border-red-500/20 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" /> Clear Route
          </button>
        )}
      </div>

      {/* Map view container */}
      <div className="relative w-full h-[340px] rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
        
        {mapMode === 'gmap' && hasValidKey ? (
          <APIProvider apiKey={API_KEY} version="weekly">
            <div className="w-full h-full relative">
              <Map
                defaultZoom={11}
                defaultCenter={pickupCoords}
                mapId="DEMO_MAP_ID"
                onClick={handleMapClick}
                options={{
                  disableDefaultUI: true,
                  zoomControl: true,
                  styles: [
                    { elementType: 'geometry', stylers: [{ color: '#131e3a' }] },
                    { elementType: 'labels.text.stroke', stylers: [{ color: '#131e3a' }] },
                    { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
                  ]
                }}
              >
                {/* Pickup marker */}
                <AdvancedMarker position={pickupCoords} title="Pickup Point">
                  <div className="flex flex-col items-center">
                    <span className="bg-blue-600 text-[9px] text-white font-extrabold px-1.5 py-0.5 rounded shadow whitespace-nowrap mb-1">
                      Start: {pickupName || 'Set Location'}
                    </span>
                    <Pin background={'#2563EB'} borderColor={'#1D4ED8'} glyphColor={'#FFFFFF'} scale={0.9} />
                  </div>
                </AdvancedMarker>

                {/* Destination marker */}
                <AdvancedMarker position={destinationCoords} title="Destination Point">
                  <div className="flex flex-col items-center">
                    <span className="bg-emerald-600 text-[9px] text-white font-extrabold px-1.5 py-0.5 rounded shadow whitespace-nowrap mb-1">
                      Dest: {destinationName || 'Set Location'}
                    </span>
                    <Pin background={'#10B981'} borderColor={'#047857'} glyphColor={'#FFFFFF'} scale={0.9} />
                  </div>
                </AdvancedMarker>

                {/* Dynamic routing polylines if both set */}
                {pickupName && destinationName && (
                  <SearchRouteDisplay origin={pickupCoords} destination={destinationCoords} />
                )}
              </Map>
            </div>
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
                        ? 'bg-sky-400 text-[#0B132B]'
                        : 'bg-slate-900 hover:bg-slate-880 text-slate-400 hover:text-slate-205'
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
                          {isPickup && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse border border-white/20" title="Selected Pickup Filters" />}
                          {isDest && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse border border-white/20" title="Selected Destination Filters" />}
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
                <div className="text-[10px] truncate max-w-[100px] text-slate-200 font-bold">{pickupName || 'Any Pickup'}</div>
                <div className="text-slate-500 shrink-0 text-[10px]">→</div>
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[8px] font-extrabold text-white shrink-0">B</div>
                <div className="text-[10px] truncate max-w-[100px] text-slate-200 font-bold">{destinationName || 'Any Destination'}</div>
              </div>
              <span className="text-[9px] font-mono text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20 shrink-0 whitespace-nowrap">
                Search Filters
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-900/50 border border-slate-900 p-2.5 rounded-xl flex items-center gap-2">
        <div className="bg-sky-500/10 p-1.5 rounded-lg border border-sky-500/20">
          <Info className="w-3.5 h-3.5 text-sky-450" />
        </div>
        <div className="text-[10.5px] text-slate-400 leading-tight">
          Click <span className="text-blue-400 font-bold">Pickup</span> or <span className="text-emerald-400 font-bold">Destination</span> above, then tap cards or clicking the map point to quickly filter rides.
        </div>
      </div>
    </div>
  );
}
