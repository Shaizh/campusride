export type Role = 'passenger' | 'rider';

export interface User {
  id: string;
  email: string;
  role: Role;
  fullName: string;
  collegeName: string;
  state?: string;
  city?: string;
  phoneNumber: string;
  isVerified: boolean;
  avatarUrl: string;
  password?: string;
  passwordHash?: string;
  passwordEncrypted?: string;
  failedLoginAttempts?: number;
  lockoutUntil?: string | null;
  isAdmin?: boolean;
  verificationDetails?: {
    frontIdCardUrl: string;
    backIdCardUrl: string;
    selfieUrl: string;
  };
  balance: number; // Spend for passenger, Earnings for rider
  rating: number; // Only for riders (average rating), defaults to 5.0
  totalRides: number; // Rides completed
  verificationStatus?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  isSuspended?: boolean;
  isBanned?: boolean;
  isDeleted?: boolean;
  deletionRequested?: boolean;
  isPendingRequestMerged?: boolean;
  approvedUid?: string;
  vehicleName?: string;
  vehiclePlate?: string;
  vehiclePhoto?: string;
  dateCreated?: string;
  lastLogin?: string;
  fcmToken?: string | null;
  notificationEnabled?: boolean;
  lastTokenUpdate?: string;
  notificationPreferences?: {
    newRides?: boolean;
    bookingUpdates?: boolean;
    rideUpdates?: boolean;
    promotions?: boolean;
    paymentNotifications?: boolean;
  };
  subscription?: SubscriptionDetails;
  subscriptionActive?: boolean;
  paymentStatus?: 'Paid' | 'Unpaid' | 'Pending';
  subscriptionPlan?: string | null;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  razorpayPaymentId?: string | null;
  lastPaymentDate?: string | null;
}

export interface SubscriptionDetails {
  planName: string;
  amountPaid: number;
  paymentDate: string;
  expiryDate: string;
  status: 'active' | 'expired' | 'cancelled';
  autoRenew: boolean;
  razorpaySubscriptionId?: string;
  razorpayPaymentId?: string;
}

export type RouteType = 'home_to_college' | 'college_to_home' | 'round_trip';

export interface Ride {
  id: string;
  riderId: string;
  riderName: string;
  riderCollege: string;
  riderRating: number;
  riderAvatar: string;
  riderPhone?: string;
  vehicleName: string;
  vehiclePlate: string;
  vehiclePhoto: string;
  seatsTotal: number;
  seatsAvailable: number;
  pricePerSeat: number;
  routeType: RouteType;
  pickup: string;
  destination: string;
  date: string;
  departureTime: string;
  status: 'active' | 'completed' | 'cancelled';
  distanceKm?: number;
  coordinates?: {
    pickup: [number, number]; // [lat, lng] or simple relative percentage for canvas map
    destination: [number, number];
  };
}

export interface Booking {
  id: string;
  rideId: string;
  passengerId: string;
  passengerName: string;
  passengerCollege: string;
  passengerPhone: string;
  seatsBooked: number;
  totalPrice: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed';
  paymentStatus: 'pending' | 'paid';
  dateBooked: string;
}

export interface Payment {
  id: string;
  bookingId: string;
  amount: number;
  paymentMethod: 'UPI' | 'GPay' | 'PhonePe' | 'Paytm';
  status: 'pending' | 'completed' | 'failed';
  transactionId: string;
  date: string;
}

export interface Review {
  id: string;
  rideId: string;
  riderId: string;
  passengerId: string;
  passengerName: string;
  rating: number;
  reviewText: string;
  date: string;
}

export interface Complaint {
  id: string;
  passengerId: string;
  rideId: string;
  category: 'late_arrival' | 'unsafe_driving' | 'misbehavior' | 'wrong_route' | 'vehicle_issue' | 'other';
  explanation: string;
  evidenceUrl?: string;
  date: string;
  status?: 'pending' | 'resolved';
  adminResponse?: string;
  dateResolved?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  body?: string;
  type: 'ride_booked' | 'ride_cancelled' | 'message_received' | 'rider_arriving' | 'complaint_update' | 'system';
  read: boolean;
  date: string;
  rideId?: string;
  bookingId?: string;
}

export interface Message {
  id: string;
  rideId: string;
  senderId: string;
  receiverId: string;
  text: string;
  timestamp: string;
  locationShared?: {
    lat: number;
    lng: number;
    isRider?: boolean;
  };
}

export interface College {
  name: string;
  area: string;
  state?: string;
  type?: 'college' | 'stop';
}

export interface RouteCoord {
  name: string;
  lat: number;
  lng: number;
}

export interface LoginLog {
  id: string;
  userId: string;
  userName: string;
  email: string;
  deviceType: string;
  ipAddress: string;
  loginTime: string;
  logoutTime?: string;
  sessionDurationStr?: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  email: string;
  action: string;
  description: string;
  timestamp: string;
}
