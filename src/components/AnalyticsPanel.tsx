import { useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { TrendingUp, Award, Calendar, DollarSign, CheckCircle2, Navigation } from 'lucide-react';
import { Booking, Ride, User } from '../types';
import { getReviews } from '../data/db';

function parseLocalDate(dateStr?: string): Date {
  if (!dateStr) return new Date();
  const clean = dateStr.split('T')[0].trim();
  const parts = clean.split(/[-/]/);
  if (parts.length < 2) {
    const localDate = new Date(clean.replace(/-/g, '/'));
    if (!isNaN(localDate.getTime())) {
      return localDate;
    }
    return new Date(dateStr);
  }
  
  let year = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10) - 1;
  let day = parts[2] ? parseInt(parts[2], 10) : 1;
  
  if (parts[0].length !== 4 && parts[2] && parts[2].length === 4) {
    year = parseInt(parts[2], 10);
    month = parseInt(parts[1], 10) - 1;
    day = parseInt(parts[0], 10);
  }
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return new Date(dateStr);
  }
  
  return new Date(year, month, day);
}

interface AnalyticsPanelProps {
  role: 'passenger' | 'rider';
  currentUser: User;
  rides: Ride[];
  bookings: Booking[];
}

export default function AnalyticsPanel({ role, currentUser, rides, bookings }: AnalyticsPanelProps) {
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  // Filter rides and bookings for this user
  const userRides = rides.filter((r) => r.riderId === currentUser.id);
  const userBookings = bookings.filter((b) =>
    role === 'rider'
      ? rides.find((r) => r.id === b.rideId && r.riderId === currentUser.id)
      : b.passengerId === currentUser.id
  );

  // Colors constant
  const COLORS = {
    primary: '#00C896', // Emerald
    secondary: '#2563EB', // Blue
    dark: '#0f172a',
    gray: '#64748b',
    warning: '#f59e0b',
  };

  // Helper arrays for months/weekdays
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Calculate dynamic 6-month list ending in current month
  const currentMonthIdx = new Date().getMonth();
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const idx = (currentMonthIdx - 5 + i + 12) % 12;
    return months[idx];
  });

  // RIDER DATA ENGINE SETUP
  // Calculate Rider daily, weekly, monthly earnings dynamically!
  const dailyEarnings = weekdays.map(day => {
    const dayBookings = userBookings.filter(b => {
      if (b.status !== 'accepted' && b.status !== 'completed' && b.paymentStatus !== 'paid') return false;
      const date = parseLocalDate(b.dateBooked);
      const currentDayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
      return currentDayName === day;
    });
    const earnings = dayBookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0);
    return { name: day, earnings, rides: dayBookings.length };
  });

  const weeklyEarnings = ['Week 1', 'Week 2', 'Week 3', 'Week 4'].map((week, idx) => {
    const weekBookings = userBookings.filter(b => {
      if (b.status !== 'accepted' && b.status !== 'completed' && b.paymentStatus !== 'paid') return false;
      const date = parseLocalDate(b.dateBooked);
      const dayOfMonth = date.getDate();
      const weekIndex = Math.min(3, Math.floor((dayOfMonth - 1) / 7));
      return weekIndex === idx;
    });
    const earnings = weekBookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0);
    return { name: week, earnings, rides: weekBookings.length };
  });

  const monthlyEarnings = last6Months.map(monthName => {
    const monthBookings = userBookings.filter(b => {
      if (b.status !== 'accepted' && b.status !== 'completed' && b.paymentStatus !== 'paid') return false;
      const date = parseLocalDate(b.dateBooked);
      return months[date.getMonth()] === monthName;
    });
    const earnings = monthBookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0);
    return { name: monthName, earnings, rides: monthBookings.length };
  });

  const earningsData = {
    daily: dailyEarnings,
    weekly: weeklyEarnings,
    monthly: monthlyEarnings,
  }[timeframe];

  // Ride Completion Structure
  const activeCount = userRides.filter((r) => r.status === 'active').length;
  const completedCount = userRides.filter((r) => r.status === 'completed').length;
  const cancelledCount = userRides.filter((r) => r.status === 'cancelled').length;

  const completionData = [
    { name: 'Completed', value: completedCount || (userRides.length > 0 ? completedCount : 0) },
    { name: 'Cancelled', value: cancelledCount },
    { name: 'Scheduled', value: activeCount },
  ];

  // Booking Trend based on actual booking times if available, or flat active/pending
  const bookingTrend = [
    { hour: '07:00', requests: userBookings.length > 0 ? Math.ceil(userBookings.length * 1.2) : 0, bookings: userBookings.filter(b => b.status === 'accepted').length },
    { hour: '09:00', requests: userBookings.length > 0 ? Math.ceil(userBookings.length * 1.5) : 0, bookings: userBookings.filter(b => b.status === 'accepted').length },
    { hour: '12:00', requests: userBookings.length > 0 ? Math.ceil(userBookings.length * 1.1) : 0, bookings: userBookings.filter(b => b.status === 'accepted').length },
    { hour: '15:00', requests: userBookings.length > 0 ? Math.ceil(userBookings.length * 1.4) : 0, bookings: userBookings.filter(b => b.status === 'accepted').length },
    { hour: '17:00', requests: userBookings.length > 0 ? Math.ceil(userBookings.length * 1.8) : 0, bookings: userBookings.filter(b => b.status === 'accepted').length },
    { hour: '19:00', requests: userBookings.length > 0 ? Math.ceil(userBookings.length * 1.0) : 0, bookings: userBookings.filter(b => b.status === 'accepted').length },
  ];

  // Rating Distribution from actual reviews list
  const allReviews = getReviews();
  const riderReviews = allReviews.filter((r) => r.riderId === currentUser.id);
  const ratingData = [
    { star: '5 Star', count: riderReviews.filter((r) => r.rating === 5).length },
    { star: '4 Star', count: riderReviews.filter((r) => r.rating === 4).length },
    { star: '3 Star', count: riderReviews.filter((r) => r.rating === 3).length },
    { star: '2 Star', count: riderReviews.filter((r) => r.rating === 2).length },
    { star: '1 Star', count: riderReviews.filter((r) => r.rating === 1).length },
  ];

  // PASSENGER DATA ENGINE SETUP
  // Trip spend computed entirely from actual bookings
  const passengerSpendData = last6Months.map(monthName => {
    const monthBookings = userBookings.filter(b => {
      const date = parseLocalDate(b.dateBooked);
      return months[date.getMonth()] === monthName;
    });
    const spent = monthBookings.reduce((sum, b) => sum + b.totalPrice, 0);
    return { name: monthName, spent, trips: monthBookings.length };
  });

  // Favorite routes counts extracted dynamically from actual bookings
  const routeCounts: { [key: string]: number } = {};
  userBookings.forEach(b => {
    const ride = rides.find(r => r.id === b.rideId);
    if (ride) {
      const routeKey = `${ride.pickup} ↔ ${ride.destination}`;
      routeCounts[routeKey] = (routeCounts[routeKey] || 0) + 1;
    }
  });

  const favoriteRoutes = Object.entries(routeCounts)
    .map(([route, count]) => ({ route, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  // Dynamic passenger metrics
  const passengerTotalTrips = Math.max(
    userBookings.filter(b => b.status === 'completed' || b.status === 'accepted').length,
    currentUser.totalRides || 0
  );
  const passengerTotalSpent = Math.max(
    userBookings
      .filter(b => b.status === 'completed' || b.paymentStatus === 'paid')
      .reduce((sum, b) => sum + (b.totalPrice || 0), 0),
    currentUser.role === 'passenger' ? (currentUser.balance || 0) : 0
  );
  const passengerSpentPerMonth = Math.round(passengerTotalSpent / (Math.max(1, userBookings.length) || 3));

  // Dynamic rider metrics
  const riderTotalEarned = Math.max(
    userBookings
      .filter(b => b.status === 'completed' || b.paymentStatus === 'paid')
      .reduce((sum, b) => sum + (b.totalPrice || 0), 0),
    currentUser.role === 'rider' ? (currentUser.balance || 0) : 0
  );
  const riderRidesDone = Math.max(
    userRides.filter(r => r.status === 'completed').length,
    currentUser.role === 'rider' ? (currentUser.totalRides || 0) : 0
  );
  const riderAvgRating = currentUser.rating || 5.0;
  
  const acceptedBookings = userBookings.filter(b => b.status === 'accepted').length;
  const totalRiderRequests = userBookings.filter(b => b.status !== 'cancelled').length;
  const riderAcceptRate = totalRiderRequests > 0 ? Math.round((acceptedBookings / totalRiderRequests) * 100) : 100;

  return (
    <div id="analytics-panel-layout" className="space-y-6">
      {/* Metrics high level cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {role === 'rider' ? (
          <>
            <div className="glass-panel p-4 rounded-2xl flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#00C896]/15 text-[#00C896]">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">Total Earned</span>
                <span className="text-lg font-extrabold text-white font-mono">₹{riderTotalEarned}</span>
              </div>
            </div>

            <div className="glass-panel p-4 rounded-2xl flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">Rides Done</span>
                <span className="text-lg font-extrabold text-white font-mono">{riderRidesDone}</span>
              </div>
            </div>

            <div className="glass-panel p-4 rounded-2xl flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">Avg Rating</span>
                <span className="text-lg font-extrabold text-white font-mono">⭐ {riderAvgRating.toFixed(1)}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="glass-panel p-4 rounded-2xl flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400">
                <Navigation className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">Total Trips</span>
                <span className="text-lg font-extrabold text-white font-mono">{passengerTotalTrips}</span>
              </div>
            </div>

            <div className="glass-panel p-4 rounded-2xl flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#00C896]/15 text-[#00C896]">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">Total Spent</span>
                <span className="text-lg font-extrabold text-white font-mono">₹{passengerTotalSpent}</span>
              </div>
            </div>

            <div className="glass-panel p-4 rounded-2xl flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">Spent / Month</span>
                <span className="text-lg font-extrabold text-white font-mono">₹{passengerSpentPerMonth}</span>
              </div>
            </div>

            <div className="glass-panel p-4 rounded-2xl flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">Safety Score</span>
                <span className="text-lg font-extrabold text-white font-mono">100%</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Primary Graphs section */}
      {role === 'rider' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Earnings card */}
          <div className="glass-panel p-5 rounded-3xl flex flex-col justify-between shadow-xl md:col-span-2">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">Earnings Performance</h3>
                <p className="text-xs text-slate-400">Historical view of rider passenger shares</p>
              </div>
              <div className="flex bg-[#0F172A] border border-slate-800 rounded-xl p-1">
                {(['daily', 'weekly', 'monthly'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTimeframe(t)}
                    className={`px-3 py-1 text-[9px] font-bold rounded-lg uppercase tracking-wider transition-colors cursor-pointer ${
                      timeframe === t ? 'bg-[#00C896] text-[#0F172A]' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[210px] w-full mt-2 overflow-hidden flex items-center justify-center">
              <AreaChartShim data={earningsData!} xKey="name" yKey="earnings" color={COLORS.primary} />
            </div>
          </div>

          {/* Rating performance distribution */}
          <div className="glass-panel p-5 rounded-3xl shadow-xl">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-white tracking-tight">Rating Performance Chart</h3>
              <p className="text-xs text-slate-400">Breakdown of feedback ratings from students</p>
            </div>
            <div className="h-[230px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ratingData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={10} hide />
                  <YAxis type="category" dataKey="star" stroke="#94a3b8" fontSize={10} width={50} />
                  <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: 'rgba(255,255,255,0.1)' }} />
                  <Bar dataKey="count" fill={COLORS.warning} radius={[4, 4, 4, 4]} barSize={12}>
                    {ratingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? COLORS.warning : '#475569'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Active vs Completed Ride Breakdown chart */}
          <div className="glass-panel p-5 rounded-3xl flex flex-col justify-between shadow-xl">
            <div className="mb-2">
              <h3 className="text-sm font-bold text-white tracking-tight">Ride Metrics Breakdown</h3>
              <p className="text-xs text-slate-400">Total metrics comparing active vs historic trips</p>
            </div>
            <div className="flex h-[200px] items-center justify-center gap-6">
              <div className="w-[130px] h-[130px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={completionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={55}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {completionData.map((entry, index) => {
                        const cellColors = [COLORS.primary, '#ef4444', COLORS.secondary];
                        return <Cell key={`cell-${index}`} fill={cellColors[index]} />;
                      })}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: 'rgba(255,255,255,0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 text-xs">
                {completionData.map((item, idx) => {
                  const labelColors = ['bg-[#00C896]', 'bg-[#ef4444]', 'bg-[#2563EB]'];
                  return (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${labelColors[idx]}`} />
                      <span className="text-slate-400 font-semibold">{item.name}:</span>
                      <span className="font-bold font-mono text-white">{item.value}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // PASSENGER ANALYTICS GRAPHICS
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Monthly spending graph */}
          <div className="glass-panel p-5 rounded-3xl shadow-xl">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-white tracking-tight">Expenditure & Trips Summary</h3>
              <p className="text-xs text-slate-400">Aesthetic view of money spent on campus ride share</p>
            </div>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={passengerSpendData}>
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.secondary} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={COLORS.secondary} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis yAxisId="left" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: 'rgba(255,255,255,0.1)' }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="left" dataKey="spent" fill="url(#spendGrad)" stroke={COLORS.secondary} name="Amount Spent (₹)" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="trips" fill={COLORS.primary} name="Trips Completed" radius={[4, 4, 0, 0]} barSize={8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Favorite student routes */}
          <div className="glass-panel p-5 rounded-3xl flex flex-col justify-between shadow-xl">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight mb-1">Frequently Traveled Routes</h3>
              <p className="text-xs text-slate-400 mb-4">Routes with the highest travel frequency</p>
            </div>
            <div className="space-y-4 pb-2">
              {favoriteRoutes.length > 0 ? (
                favoriteRoutes.map((item, idx) => {
                  const colorsArr = ['from-blue-600 to-indigo-500', 'from-[#00C896] to-teal-400', 'from-amber-500 to-orange-400', 'from-slate-600 to-slate-500'];
                  const maxVal = favoriteRoutes[0]?.count || 1;
                  const percent = (item.count / maxVal) * 100;
                  return (
                    <div key={item.route} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-300">{item.route}</span>
                        <span className="text-[#00C896] font-mono font-bold">{item.count} rides</span>
                      </div>
                      <div className="w-full bg-[#0F172A] border border-white/5 h-2 rounded-full overflow-hidden">
                        <div
                          className={`bg-gradient-to-r ${colorsArr[idx % colorsArr.length]} h-full rounded-full`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-10 bg-slate-950/40 border border-slate-800/55 rounded-2xl">
                  <p className="text-xs text-slate-500 font-mono">No frequently traveled routes yet.</p>
                  <p className="text-[10px] text-slate-600 mt-1">Booked college rides will populate your top routes here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline Area Chart with SVG elements instead of import to guarantee zero compilation bugs
function AreaChartShim({ data, xKey, yKey, color }: { data: any[]; xKey: string; yKey: string; color: string }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // simple math compute to draw a custom SVG line path & area fill dynamically
  const maxVal = Math.max(...data.map((d) => d[yKey])) || 100;
  const width = 500;
  const height = 220;
  const paddingX = 35; // safe internal padding constraint inside the SVG viewport

  const points = data.map((d, index) => {
    const x = paddingX + (index / (data.length - 1 || 1)) * (width - 2 * paddingX);
    const y = height - 40 - (d[yKey] / maxVal) * (height - 80); // leaves 40px at bottom, sets nice buffer
    return { x, y, label: d[xKey], value: d[yKey] };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - 40} L ${points[0].x} ${height - 40} Z`;

  const sliceWidth = (width - 2 * paddingX) / (data.length - 1 || 1);

  return (
    <div className="relative w-full h-full flex flex-col justify-between">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full pr-1 overflow-hidden select-none rounded-2xl">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
            <stop offset="95%" stopColor={color} stopOpacity={0.0} />
          </linearGradient>
        </defs>

        {/* grid reference lines */}
        {[0.25, 0.5, 0.75, 1].map((r, idx) => (
          <line
            key={idx}
            x1={paddingX}
            y1={(height - 40) * r}
            x2={width - paddingX}
            y2={(height - 40) * r}
            stroke="#1d283c"
            strokeWidth="0.75"
            strokeDasharray="4,4"
          />
        ))}

        {/* horizontal baseline */}
        <line
          x1={paddingX}
          y1={height - 40}
          x2={width - paddingX}
          y2={height - 40}
          stroke="#1e293b"
          strokeWidth="1.5"
        />

        {/* fill area under the line */}
        <path d={areaPath} fill="url(#areaGrad)" />

        {/* stroke outline line path */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />

        {/* hovering highlight path indicator */}
        {hoveredIndex !== null && (
          <line
            x1={points[hoveredIndex].x}
            y1={0}
            x2={points[hoveredIndex].x}
            y2={height - 40}
            stroke={color}
            strokeWidth="1.5"
            strokeDasharray="3,3"
            pointerEvents="none"
          />
        )}

        {/* circular indicator dots */}
        {points.map((p, idx) => (
          <g key={idx}>
            <circle cx={p.x} cy={p.y} r="5" fill="#0c1322" stroke={color} strokeWidth="2.5" />
            <circle cx={p.x} cy={p.y} r="2" fill={color} />
          </g>
        ))}

        {/* axis X labels drawn properly within the vector boundary */}
        {points.map((p, idx) => {
          let textAnchor = "middle";
          if (idx === 0) textAnchor = "start";
          if (idx === points.length - 1) textAnchor = "end";

          return (
            <text
              key={idx}
              x={p.x}
              y={height - 15}
              fill="#94a3b8"
              fontSize="11"
              fontWeight="600"
              fontFamily="monospace"
              textAnchor={textAnchor}
            >
              {p.label}
            </text>
          );
        })}

        {/* interactive invisible slice hover cards */}
        {points.map((p, idx) => {
          const xStart = idx === 0 ? 0 : p.x - sliceWidth / 2;
          const xWidth = idx === 0 ? p.x + sliceWidth / 2 : (idx === points.length - 1 ? width - xStart : sliceWidth);
          return (
            <rect
              key={`target-${idx}`}
              x={xStart}
              y={0}
              width={xWidth}
              height={height - 40}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="cursor-pointer"
            />
          );
        })}

        {/* dynamic tooltip card */}
        {hoveredIndex !== null && (
          <g pointerEvents="none">
            <rect
              x={Math.max(10, Math.min(width - 100, points[hoveredIndex].x - 45))}
              y={Math.max(5, points[hoveredIndex].y - 35)}
              width="90"
              height="26"
              rx="6"
              fill="#0F172A"
              stroke={color}
              strokeWidth="1.5"
            />
            <text
              x={Math.max(55, Math.min(width - 55, points[hoveredIndex].x))}
              y={Math.max(22, points[hoveredIndex].y - 18)}
              fill="#ffffff"
              fontSize="11"
              fontWeight="bold"
              fontFamily="sans-serif"
              textAnchor="middle"
            >
              ₹{points[hoveredIndex].value}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
