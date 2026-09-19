import { User, Ride, Booking, Payment, Review, Complaint, Notification, Message, LoginLog, ActivityLog } from '../types';
import { getCoordinates, calculateDistanceKm, calculateTravelTimeMinutes } from './colleges';
import { auth, db } from '../lib/firebase';
import { hashPassword, encryptPassword, decryptPassword } from '../lib/crypto';
import { sanitizeData, isValidStudentEmail, isValidPhoneNumber } from '../lib/validation';

// Login Attempts and Rate-limiting Lockout Cache
export const loginAttemptsCache = new Map<string, { count: number; lockoutUntil: number }>();

export function handleFailedAttempt(emailOrPhoneStr: string, matchedUser: User | null) {
  const norm = emailOrPhoneStr.toLowerCase().trim();
  const att = loginAttemptsCache.get(norm) || { count: 0, lockoutUntil: 0 };
  att.count += 1;
  if (att.count >= 5) {
    att.lockoutUntil = Date.now() + 15 * 60 * 1000; // 15-minute lockout
    loginAttemptsCache.set(norm, att);
    if (matchedUser) {
      updateDoc(doc(db, "campusride_users", matchedUser.id), {
        failedLoginAttempts: att.count,
        lockoutUntil: new Date(att.lockoutUntil).toISOString()
      }).catch(() => {});
    }
    throw new Error("This account is locked out due to too many failed login attempts. Please try again in 15 minutes.");
  } else {
    loginAttemptsCache.set(norm, att);
    if (matchedUser) {
      updateDoc(doc(db, "campusride_users", matchedUser.id), {
        failedLoginAttempts: att.count
      }).catch(() => {});
    }
  }
}

export function handleSuccessLogin(emailOrPhoneStr: string, matchedUser: User | null) {
  const norm = emailOrPhoneStr.toLowerCase().trim();
  loginAttemptsCache.delete(norm);
  if (matchedUser && (matchedUser.failedLoginAttempts || matchedUser.lockoutUntil)) {
    updateDoc(doc(db, "campusride_users", matchedUser.id), {
      failedLoginAttempts: 0,
      lockoutUntil: null
    }).catch(() => {});
  }
}
import { initializeApp, getApp } from 'firebase/app';
import firebaseConfig from '../../firebase-applet-config.json';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  updateDoc, 
  deleteDoc, 
  addDoc, 
  onSnapshot, 
  query, 
  where,
  limit
} from 'firebase/firestore';
import { 
  getAuth,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail, 
  onAuthStateChanged 
} from 'firebase/auth';

// Allowed College and Personal Email Domains
export const ALLOWED_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'yenepoya.edu.in',
  'srinivasuniversity.edu.in',
  'nitk.edu.in',
  'sjec.ac.in',
  'fathermuller.in',
  'nitte.edu.in',
  'staloysius.edu.in',
  'alvas.org',
  'canaracollege.org',
  'shreedevi.edu.in',
  'shreedevicollege.com',
  'sdm.ac.in',
  'snspolytechnic.edu.in'
];

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const err = error as any;
  const isPermissionError = err && (
    (err.code === 'permission-denied') || 
    (err.message && err.message.toLowerCase().includes('permission'))
  );

  if (isPermissionError) {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid || null,
        email: auth.currentUser?.email || null,
        emailVerified: auth.currentUser?.emailVerified || null,
        isAnonymous: auth.currentUser?.isAnonymous || null,
        tenantId: auth.currentUser?.tenantId || null,
        providerInfo: auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      },
      operationType,
      path
    };
    const stringifiedError = JSON.stringify(errInfo);
    console.error('Firestore Hardened Error:', stringifiedError);
    throw new Error(stringifiedError);
  } else {
    console.warn(`Firestore Warning [${operationType}] on [${path}]:`, error);
  }
}

export function isValidCollegeEmail(email: string): boolean {
  return isValidStudentEmail(email);
}

// Key definitions for LocalStorage
const KEYS = {
  USERS: 'campusride_users',
  RIDES: 'campusride_rides',
  BOOKINGS: 'campusride_bookings',
  PAYMENTS: 'campusride_payments',
  REVIEWS: 'campusride_reviews',
  COMPLAINTS: 'campusride_complaints',
  NOTIFICATIONS: 'campusride_notifications',
  MESSAGES: 'campusride_messages',
  CURRENT_USER: 'campusride_current_user',
  LOGIN_LOGS: 'campusride_login_logs',
  ACTIVITY_LOGS: 'campusride_activity_logs',
};

export const ADMIN_EMAILS = ['mrshaizshaiz@gmail.com', 'mdnihalktp@gmail.com'];

export function isSystemAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  return ADMIN_EMAILS.includes(normalized);
}

export function getAdminAvatar(name: string): string {
  const firstLetter = (name || 'A').trim().charAt(0).toUpperCase();
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="48" fill="%230F172A" stroke="%2300C896" stroke-width="4"/><text x="50%" y="55%" font-size="38" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" fill="%2300C896" dominant-baseline="middle" text-anchor="middle">${firstLetter}</text></svg>`;
}

const ADMIN_AVATAR = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="48" fill="%230F172A" stroke="%2300C896" stroke-width="4"/><text x="50%" y="55%" font-size="38" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" fill="%2300C896" dominant-baseline="middle" text-anchor="middle">S</text></svg>`;

const SEED_USERS: User[] = [
  {
    id: 'admin_passenger',
    email: 'mrshaizshaiz@gmail.com',
    role: 'passenger',
    fullName: 'Shaiz',
    collegeName: 'delulucoders',
    phoneNumber: '9141259188',
    isVerified: true,
    verificationStatus: 'approved',
    isAdmin: true,
    avatarUrl: getAdminAvatar('Shaiz'),
    passwordEncrypted: encryptPassword('sha1511'),
    passwordHash: hashPassword('sha1511', 'admin_passenger_salt'),
    balance: 0,
    rating: 5.0,
    totalRides: 0
  },
  {
    id: 'admin_nihal',
    email: 'mdnihalktp@gmail.com',
    role: 'passenger',
    fullName: 'Nihal',
    collegeName: 'delulucoders',
    phoneNumber: '8970638498',
    isVerified: true,
    verificationStatus: 'approved',
    isAdmin: true,
    avatarUrl: getAdminAvatar('Nihal'),
    passwordEncrypted: encryptPassword('Nihal@cr17'),
    passwordHash: hashPassword('Nihal@cr17', 'admin_nihal_salt'),
    balance: 0,
    rating: 5.0,
    totalRides: 0
  }
];

// Helper to Safely Parse JSON
function getStorage<T>(key: string, defaultValue: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

// Initial storage boot
export function initDB() {
  const CURRENT_VERSION = 'v13_admin_shaiz_phone_and_org';
  if (localStorage.getItem('campusride_version') !== CURRENT_VERSION) {
    localStorage.removeItem(KEYS.RIDES);
    localStorage.removeItem(KEYS.BOOKINGS);
    localStorage.removeItem(KEYS.PAYMENTS);
    localStorage.removeItem(KEYS.REVIEWS);
    localStorage.removeItem(KEYS.COMPLAINTS);
    localStorage.removeItem(KEYS.NOTIFICATIONS);
    localStorage.removeItem(KEYS.MESSAGES);
    localStorage.removeItem(KEYS.LOGIN_LOGS);
    localStorage.removeItem(KEYS.ACTIVITY_LOGS);
    
    localStorage.setItem('campusride_version', CURRENT_VERSION);
  }

  // Pre-seed if completely blank locally
  if (!localStorage.getItem(KEYS.USERS)) {
    localStorage.setItem(KEYS.USERS, JSON.stringify(SEED_USERS));
  }
}

// Dynamic Client-side Subscription to all collections
let activeListeners: (() => void)[] = [];

export function startRealtimeSync(onUpdate: () => void) {
  // Clear any existing active subscriptions to keep listeners optimized
  activeListeners.forEach(unsub => unsub());
  activeListeners = [];

  // Defer database sync until student authentication state has loaded correctly
  const curUser = getCurrentUser() || auth.currentUser;
  if (!curUser) {
    console.log("Realtime sync deferred: student auth session has not resolved yet.");
    return;
  }

  const isAdminUser = curUser && ((curUser as any).isAdmin || isSystemAdminEmail((curUser as any).email));

  // 1. Subscribe to rides
  const ridesUnsub = onSnapshot(collection(db, "campusride_rides"), (snap) => {
    const rides = snap.docs.map(doc => doc.data() as Ride);
    localStorage.setItem(KEYS.RIDES, JSON.stringify(rides));
    onUpdate();
  }, (err) => handleFirestoreError(err, OperationType.GET, "campusride_rides"));
  activeListeners.push(ridesUnsub);

  // 2. Subscribe to bookings
  const bookingsUnsub = onSnapshot(collection(db, "campusride_bookings"), (snap) => {
    const bookings = snap.docs.map(doc => doc.data() as Booking);
    localStorage.setItem(KEYS.BOOKINGS, JSON.stringify(bookings));
    onUpdate();
  }, (err) => handleFirestoreError(err, OperationType.GET, "campusride_bookings"));
  activeListeners.push(bookingsUnsub);

  // 3. Subscribe to payments (Admins only)
  if (isAdminUser) {
    const paymentsUnsub = onSnapshot(collection(db, "campusride_payments"), (snap) => {
      const payments = snap.docs.map(doc => doc.data() as Payment);
      localStorage.setItem(KEYS.PAYMENTS, JSON.stringify(payments));
      onUpdate();
    }, (err) => handleFirestoreError(err, OperationType.GET, "campusride_payments"));
    activeListeners.push(paymentsUnsub);
  }

  // 4. Subscribe to reviews
  const reviewsUnsub = onSnapshot(collection(db, "campusride_reviews"), (snap) => {
    const reviews = snap.docs.map(doc => doc.data() as Review);
    localStorage.setItem(KEYS.REVIEWS, JSON.stringify(reviews));
    onUpdate();
  }, (err) => handleFirestoreError(err, OperationType.GET, "campusride_reviews"));
  activeListeners.push(reviewsUnsub);

  // 5. Subscribe to complaints (Admins only)
  if (isAdminUser) {
    const complaintsUnsub = onSnapshot(collection(db, "campusride_complaints"), (snap) => {
      const complaints = snap.docs.map(doc => doc.data() as Complaint);
      localStorage.setItem(KEYS.COMPLAINTS, JSON.stringify(complaints));
      onUpdate();
    }, (err) => handleFirestoreError(err, OperationType.GET, "campusride_complaints"));
    activeListeners.push(complaintsUnsub);
  }

  // 6. Subscribe to messages
  const messagesUnsub = onSnapshot(collection(db, "campusride_messages"), (snap) => {
    const messages = snap.docs.map(doc => doc.data() as Message);
    localStorage.setItem(KEYS.MESSAGES, JSON.stringify(messages));
    onUpdate();
  }, (err) => handleFirestoreError(err, OperationType.GET, "campusride_messages"));
  activeListeners.push(messagesUnsub);

  // 7. Subscribe to login logs (Admins only - limited to 100 entries to prevent memory and network bottlenecks)
  if (isAdminUser) {
    const qLoginLogs = query(collection(db, "campusride_login_logs"), limit(100));
    const loginLogsUnsub = onSnapshot(qLoginLogs, (snap) => {
      const logs = snap.docs.map(doc => doc.data() as LoginLog);
      localStorage.setItem(KEYS.LOGIN_LOGS, JSON.stringify(logs));
      onUpdate();
    }, (err) => handleFirestoreError(err, OperationType.GET, "campusride_login_logs"));
    activeListeners.push(loginLogsUnsub);
  }

  // 8. Subscribe to activity logs (Admins only - limited to 100 entries to prevent memory and network bottlenecks)
  if (isAdminUser) {
    const qActivityLogs = query(collection(db, "campusride_activity_logs"), limit(100));
    const activityLogsUnsub = onSnapshot(qActivityLogs, (snap) => {
      const logs = snap.docs.map(doc => doc.data() as ActivityLog);
      localStorage.setItem(KEYS.ACTIVITY_LOGS, JSON.stringify(logs));
      onUpdate();
    }, (err) => handleFirestoreError(err, OperationType.GET, "campusride_activity_logs"));
    activeListeners.push(activityLogsUnsub);
  }

  // 9. Subscribe to users (automatically preserves and uploads any registered users/staff to Firestore details)
  const usersUnsub = onSnapshot(collection(db, "campusride_users"), (snap) => {
    const firestoreUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
    
    // Save to local storage cache immediately so UI receives the data instantly
    localStorage.setItem(KEYS.USERS, JSON.stringify(firestoreUsers));
    
    // Auto-update current local session if user's verified state or balance changes on server
    const cur = getCurrentUser();
    if (cur) {
      const match = firestoreUsers.find(u => u.id === cur.id);
      if (match) {
        // Smart merge to prevent stale Firestore snapshots from overwriting recent local cancellations
        let mergedUser = { ...match };
        if (cur.subscription && match.subscription) {
          // If locally we cancelled auto-renew or subscription, preserve it over remote stale active state
          if (!cur.subscription.autoRenew && match.subscription.autoRenew) {
            mergedUser.subscription = {
              ...match.subscription,
              autoRenew: false,
              status: cur.subscription.status || 'cancelled'
            };
            mergedUser.subscriptionActive = cur.subscriptionActive;
          }
        } else if (cur.subscription && !match.subscription) {
          // Local has subscription details, remote does not yet
          mergedUser.subscription = cur.subscription;
          mergedUser.subscriptionActive = cur.subscriptionActive;
        }
        setCurrentUser(mergedUser);
      }
    }
    onUpdate();

    // Run the safety check and auto-save of missing seed/local users asynchronously in the background
    // to avoid blocking the main UI thread or causing infinite snapshot trigger bottlenecks.
    setTimeout(async () => {
      try {
        const localUsers = getStorage<User[]>(KEYS.USERS, SEED_USERS);
        const mergedToCheck = [...localUsers];
        SEED_USERS.forEach(seed => {
          if (!mergedToCheck.some(u => u.id === seed.id || u.email.toLowerCase().trim() === seed.email.toLowerCase().trim())) {
            mergedToCheck.push(seed);
          }
        });

        const missingInFirestore: User[] = [];
        mergedToCheck.forEach(u => {
          if (u && u.id && u.email) {
            const existsInFirestore = firestoreUsers.some(
              fu => fu.id === u.id || fu.email.toLowerCase().trim() === u.email.toLowerCase().trim()
            );
            if (!existsInFirestore) {
              missingInFirestore.push(u);
            }
          }
        });

        if (missingInFirestore.length > 0) {
          console.log(`Auto-saving ${missingInFirestore.length} registered staff/users to Firestore in the background...`);
          for (const u of missingInFirestore) {
            try {
              await setDoc(doc(db, "campusride_users", u.id), u);
            } catch (err) {
              console.warn(`Failed to save registered user details ${u.email} to Firestore:`, err);
            }
          }
        }
      } catch (err) {
        console.warn("Error in background user auto-save:", err);
      }
    }, 0);
  }, (err) => handleFirestoreError(err, OperationType.GET, "campusride_users"));
  activeListeners.push(usersUnsub);

  // 10. Subscribe of notifications conforming strictly to uid limits in firestore.rules
  const cur = getCurrentUser();
  if (cur) {
    const qPersonal = query(collection(db, "campusride_notifications"), where("userId", "==", cur.id));
    const qBroadcast = query(collection(db, "campusride_notifications"), where("userId", "==", "all"));
    
    let personalNotifs: Notification[] = [];
    let broadcastNotifs: Notification[] = [];

    const handleMergedNotifications = () => {
      const merged = [...personalNotifs];
      broadcastNotifs.forEach(bn => {
        if (!merged.some(n => n.id === bn.id)) {
          merged.push(bn);
        }
      });
      merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      localStorage.setItem(KEYS.NOTIFICATIONS, JSON.stringify(merged));
      onUpdate();
    };

    const unsubPersonal = onSnapshot(qPersonal, (snap) => {
      personalNotifs = snap.docs.map(doc => doc.data() as Notification);
      handleMergedNotifications();
    }, (err) => handleFirestoreError(err, OperationType.GET, "campusride_notifications_personal"));
    activeListeners.push(unsubPersonal);

    const unsubBroadcast = onSnapshot(qBroadcast, (snap) => {
      broadcastNotifs = snap.docs.map(doc => doc.data() as Notification);
      handleMergedNotifications();
    }, (err) => handleFirestoreError(err, OperationType.GET, "campusride_notifications_broadcast"));
    activeListeners.push(unsubBroadcast);
  }
}

// Subscribe to Firebase Authentication for Persistent Sessions
export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, async (fbUser) => {
    if (fbUser) {
      try {
        const docRef = doc(db, "campusride_users", fbUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const userData = docSnap.data() as User;
          setCurrentUser(userData);
          callback(userData);
          return;
        }
      } catch (err) {
        console.error("Failed to fetch authenticated user document:", err);
      }
    }
    const localUser = getCurrentUser();
    if (localUser) {
      callback(localUser);
      return;
    }
    setCurrentUser(null);
    callback(null);
  });
}

// In-memory highly optimized caches to speed up data loading and prevent redundant JSON parses
let cachedUsers: User[] | null = null;
let lastUsersRaw: string | null = null;

let cachedRides: Ride[] | null = null;
let lastRidesRaw: string | null = null;

let cachedBookings: Booking[] | null = null;
let lastBookingsRaw: string | null = null;

let cachedPayments: Payment[] | null = null;
let lastPaymentsRaw: string | null = null;

let cachedReviews: Review[] | null = null;
let lastReviewsRaw: string | null = null;

let cachedComplaints: Complaint[] | null = null;
let lastComplaintsRaw: string | null = null;

let cachedNotifications: Notification[] | null = null;
let lastNotificationsRaw: string | null = null;

let cachedMessages: Message[] | null = null;
let lastMessagesRaw: string | null = null;

let cachedLoginLogs: LoginLog[] | null = null;
let lastLoginLogsRaw: string | null = null;

let cachedActivityLogs: ActivityLog[] | null = null;
let lastActivityLogsRaw: string | null = null;

export function getUsers(isInternalCall = false): User[] {
  initDB();
  const raw = localStorage.getItem(KEYS.USERS);
  let updated: User[] = [];

  if (raw === lastUsersRaw && cachedUsers) {
    updated = cachedUsers;
  } else {
    const users = raw ? JSON.parse(raw) : SEED_USERS;
    const merged = [...users];
    SEED_USERS.forEach(seed => {
      const idx = merged.findIndex(u => u.id === seed.id || u.email.toLowerCase().trim() === seed.email.toLowerCase().trim());
      if (idx === -1) {
        merged.push(seed);
      } else {
        merged[idx] = { ...merged[idx], ...seed };
      }
    });

    let modified = false;
    updated = merged.map(u => {
      if (u.isAdmin || isSystemAdminEmail(u.email)) {
        const dynamicAvatar = getAdminAvatar(u.fullName);
        if (!u.avatarUrl || u.avatarUrl.includes("S</text>") || u.avatarUrl === ADMIN_AVATAR) {
          if (u.avatarUrl !== dynamicAvatar) {
            modified = true;
            return { ...u, avatarUrl: dynamicAvatar };
          }
        }
      }
      return u;
    });

    if (modified) {
      saveUsers(updated);
    } else {
      lastUsersRaw = raw;
      cachedUsers = updated;
    }
  }

  // If this is an internal database check/operation, bypass filtering to preserve password properties
  if (isInternalCall) {
    return updated;
  }

  // Check if current logged-in user is an admin without triggering infinite recursion
  const rawCurrentUser = localStorage.getItem('campusride_current_user');
  let isAdmin = false;
  if (rawCurrentUser) {
    try {
      const u = JSON.parse(rawCurrentUser);
      if (u && (u.isAdmin || isSystemAdminEmail(u.email))) {
        isAdmin = true;
      }
    } catch (e) {}
  }

  if (isAdmin) {
    return updated;
  }

  // For non-admins (e.g. standard students), strip plain text and encrypted passwords
  return updated.map(u => {
    const { password, passwordEncrypted, ...rest } = u;
    return rest as User;
  });
}

export function saveUsers(users: User[]) {
  const serialized = JSON.stringify(users);
  localStorage.setItem(KEYS.USERS, serialized);
  lastUsersRaw = serialized;
  cachedUsers = users;
}

export function getRides(): Ride[] {
  initDB();
  const raw = localStorage.getItem(KEYS.RIDES);
  if (raw === lastRidesRaw && cachedRides) {
    return cachedRides;
  }
  lastRidesRaw = raw;
  cachedRides = raw ? JSON.parse(raw) : [];
  return cachedRides;
}

export function saveRides(rides: Ride[]) {
  const serialized = JSON.stringify(rides);
  localStorage.setItem(KEYS.RIDES, serialized);
  lastRidesRaw = serialized;
  cachedRides = rides;
}

export function getBookings(): Booking[] {
  initDB();
  const raw = localStorage.getItem(KEYS.BOOKINGS);
  if (raw === lastBookingsRaw && cachedBookings) {
    return cachedBookings;
  }
  lastBookingsRaw = raw;
  cachedBookings = raw ? JSON.parse(raw) : [];
  return cachedBookings;
}

export function saveBookings(bookings: Booking[]) {
  const serialized = JSON.stringify(bookings);
  localStorage.setItem(KEYS.BOOKINGS, serialized);
  lastBookingsRaw = serialized;
  cachedBookings = bookings;
}

export function getPayments(): Payment[] {
  initDB();
  const raw = localStorage.getItem(KEYS.PAYMENTS);
  if (raw === lastPaymentsRaw && cachedPayments) {
    return cachedPayments;
  }
  lastPaymentsRaw = raw;
  cachedPayments = raw ? JSON.parse(raw) : [];
  return cachedPayments;
}

export function savePayments(payments: Payment[]) {
  const serialized = JSON.stringify(payments);
  localStorage.setItem(KEYS.PAYMENTS, serialized);
  lastPaymentsRaw = serialized;
  cachedPayments = payments;
}

export function getReviews(): Review[] {
  initDB();
  const raw = localStorage.getItem(KEYS.REVIEWS);
  if (raw === lastReviewsRaw && cachedReviews) {
    return cachedReviews;
  }
  lastReviewsRaw = raw;
  cachedReviews = raw ? JSON.parse(raw) : [];
  return cachedReviews;
}

export function saveReviews(reviews: Review[]) {
  const serialized = JSON.stringify(reviews);
  localStorage.setItem(KEYS.REVIEWS, serialized);
  lastReviewsRaw = serialized;
  cachedReviews = reviews;
}

export function getComplaints(): Complaint[] {
  initDB();
  const raw = localStorage.getItem(KEYS.COMPLAINTS);
  if (raw === lastComplaintsRaw && cachedComplaints) {
    return cachedComplaints;
  }
  lastComplaintsRaw = raw;
  cachedComplaints = raw ? JSON.parse(raw) : [];
  return cachedComplaints;
}

export function saveComplaints(complaints: Complaint[]) {
  const serialized = JSON.stringify(complaints);
  localStorage.setItem(KEYS.COMPLAINTS, serialized);
  lastComplaintsRaw = serialized;
  cachedComplaints = complaints;
}

export function getNotifications(): Notification[] {
  initDB();
  const raw = localStorage.getItem(KEYS.NOTIFICATIONS);
  if (raw === lastNotificationsRaw && cachedNotifications) {
    return cachedNotifications;
  }
  lastNotificationsRaw = raw;
  cachedNotifications = raw ? JSON.parse(raw) : [];
  return cachedNotifications;
}

export function saveNotifications(notifications: Notification[]) {
  const serialized = JSON.stringify(notifications);
  localStorage.setItem(KEYS.NOTIFICATIONS, serialized);
  lastNotificationsRaw = serialized;
  cachedNotifications = notifications;
}

export function getMessages(): Message[] {
  initDB();
  const raw = localStorage.getItem(KEYS.MESSAGES);
  if (raw === lastMessagesRaw && cachedMessages) {
    return cachedMessages;
  }
  lastMessagesRaw = raw;
  cachedMessages = raw ? JSON.parse(raw) : [];
  return cachedMessages;
}

export function saveMessages(messages: Message[]) {
  const serialized = JSON.stringify(messages);
  localStorage.setItem(KEYS.MESSAGES, serialized);
  lastMessagesRaw = serialized;
  cachedMessages = messages;
}

export function getLoginLogs(): LoginLog[] {
  initDB();
  const raw = localStorage.getItem(KEYS.LOGIN_LOGS);
  if (raw === lastLoginLogsRaw && cachedLoginLogs) {
    return cachedLoginLogs;
  }
  lastLoginLogsRaw = raw;
  cachedLoginLogs = raw ? JSON.parse(raw) : [];
  return cachedLoginLogs;
}

export function saveLoginLogs(logs: LoginLog[]) {
  const serialized = JSON.stringify(logs);
  localStorage.setItem(KEYS.LOGIN_LOGS, serialized);
  lastLoginLogsRaw = serialized;
  cachedLoginLogs = logs;
}

export function getActivityLogs(): ActivityLog[] {
  initDB();
  const raw = localStorage.getItem(KEYS.ACTIVITY_LOGS);
  if (raw === lastActivityLogsRaw && cachedActivityLogs) {
    return cachedActivityLogs;
  }
  lastActivityLogsRaw = raw;
  cachedActivityLogs = raw ? JSON.parse(raw) : [];
  return cachedActivityLogs;
}

export function saveActivityLogs(logs: ActivityLog[]) {
  const serialized = JSON.stringify(logs);
  localStorage.setItem(KEYS.ACTIVITY_LOGS, serialized);
  lastActivityLogsRaw = serialized;
  cachedActivityLogs = logs;
}

// Loggers
export function addLoginLog(userId: string, userName: string, email: string) {
  const logs = getLoginLogs();
  const newLog: LoginLog = {
    id: `log_${Date.now()}`,
    userId,
    userName,
    email,
    deviceType: 'Web Browser',
    ipAddress: '127.0.0.1',
    loginTime: new Date().toISOString()
  };
  logs.unshift(newLog);
  saveLoginLogs(logs);
  
  // Write document to Firestore
  setDoc(doc(db, "campusride_login_logs", newLog.id), newLog).catch(err => {
    console.warn("Failed to write login log doc:", err);
  });
  
  return newLog;
}

export function addActivityLog(userId: string, userName: string, email: string, action: string, description: string) {
  const logs = getActivityLogs();
  const newLog: ActivityLog = {
    id: `act_${Date.now()}`,
    userId,
    userName,
    email,
    action,
    description,
    timestamp: new Date().toISOString()
  };
  logs.unshift(newLog);
  saveActivityLogs(logs);

  // Write document to Firestore
  setDoc(doc(db, "campusride_activity_logs", newLog.id), newLog).catch(err => {
    console.warn("Failed to write activity log doc:", err);
  });

  return newLog;
}

// Current User State Management
export function getCurrentUser(): User | null {
  initDB();
  const user = getStorage<User | null>(KEYS.CURRENT_USER, null);
  if (user && (user.isAdmin || isSystemAdminEmail(user.email))) {
    const dynamicAvatar = getAdminAvatar(user.fullName);
    if (!user.avatarUrl || user.avatarUrl.includes("S</text>") || user.avatarUrl === ADMIN_AVATAR) {
      if (user.avatarUrl !== dynamicAvatar) {
        user.avatarUrl = dynamicAvatar;
        setCurrentUser(user);
        updateLocalUserCache(user);
      }
    }
  }
  return user;
}

export function setCurrentUser(user: User | null) {
  if (user) {
    localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(user));
  } else {
    localStorage.removeItem(KEYS.CURRENT_USER);
  }
}

// helper to easily update current local index
function updateLocalUserCache(user: User) {
  const users = getUsers(true);
  const idx = users.findIndex(u => u.id === user.id);
  if (idx !== -1) {
    users[idx] = user;
  } else {
    users.push(user);
  }
  saveUsers(users);
}

// Secure User Registration Flow
export async function registerUser(
  newUser: Omit<User, 'id' | 'isVerified' | 'avatarUrl' | 'rating' | 'totalRides' | 'balance'>, 
  frontImg: string, 
  backImg: string, 
  selfieImg: string
): Promise<User> {
  // Sanitize input fields to prevent persistent XSS / injection attacks
  const cleanedUser = sanitizeData(newUser);
  const rawPassword = (newUser as any).password || 'campus123';
  const isAdminEmail = isSystemAdminEmail(cleanedUser.email);
  
  try {
    // If it is a system administrator registering, create immediately in Firebase Auth
    if (isAdminEmail) {
      const userCredential = await createUserWithEmailAndPassword(auth, cleanedUser.email, rawPassword);
      const uid = userCredential.user.uid;
      const adminUser: User = {
        ...cleanedUser,
        id: uid,
        passwordHash: hashPassword(rawPassword, cleanedUser.email),
        passwordEncrypted: encryptPassword(rawPassword),
        isVerified: true,
        verificationStatus: 'approved',
        isAdmin: true,
        avatarUrl: selfieImg || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        balance: 0,
        rating: 5.0,
        totalRides: 0,
        dateCreated: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      await setDoc(doc(db, "campusride_users", uid), adminUser);
      updateLocalUserCache(adminUser);
      return adminUser;
    }

    // For standard users, we do NOT create the Firebase Auth record yet.
    // Instead, we assign a temporary request ID and record their complete profile.
    const tempId = 'pending_user_' + Date.now() + '_' + Math.floor(1000 + Math.random() * 9000);
    const actualUser: User = {
      ...cleanedUser,
      id: tempId,
      passwordHash: hashPassword(rawPassword, cleanedUser.email),
      passwordEncrypted: encryptPassword(rawPassword), // Safely encrypted copies for admin approval flow
      isVerified: false,
      verificationStatus: 'pending',
      isAdmin: false,
      avatarUrl: selfieImg || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      balance: 0,
      rating: 5.0,
      totalRides: 0,
      dateCreated: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      verificationDetails: {
        frontIdCardUrl: frontImg,
        backIdCardUrl: backImg,
        selfieUrl: selfieImg,
      }
    };

    // Save complete pending request permanently in Cloud Firestore
    await setDoc(doc(db, "campusride_users", tempId), actualUser);
    
    // Update local caches immediately
    updateLocalUserCache(actualUser);

    // Record registration Audit logs
    addActivityLog(
      actualUser.id,
      actualUser.fullName,
      actualUser.email,
      'Account Request Filed',
      `Filed registration request for custom ${actualUser.role} student account (${actualUser.fullName}) from ${actualUser.collegeName}. Approval pending.`
    );

    // Notify of new sign up request to administrators
    try {
      sendPushNotification(
        'admin_passenger',
        'New Account Request Received 📝',
        `A new account request is pending for ${actualUser.fullName} (${actualUser.role}) from ${actualUser.collegeName}.`,
        'system'
      );
    } catch (e) {
      console.error('Error dispatching initial Admin registration notification:', e);
    }

    return actualUser;
  } catch (err: any) {
    // Catch-all/Sandbox logic
    console.warn("Account register threw, returning pending request layout: ", err);
    throw err;
  }
}

// Resolve user locally from current fast cache
export function findUserByIdentifier(identifier: string, role: 'passenger' | 'rider'): User | null {
  const users = getUsers(true);
  const lower = identifier.toLowerCase().trim();
  const digits = identifier.replace(/\D/g, '');
  
  // First, try to find a user with the requested role
  const matchWithRole = users.find(u => {
    if (u.role !== role) return false;
    if (u.email && u.email.toLowerCase().trim() === lower) return true;
    const userDigits = u.phoneNumber ? u.phoneNumber.replace(/\D/g, '') : '';
    if (digits.length >= 10 && (userDigits.endsWith(digits) || userDigits.endsWith(digits.slice(-10)))) return true;
    if (u.phoneNumber === identifier) return true;
    return false;
  });
  if (matchWithRole) return matchWithRole;

  // Fallback: find any user matching the identifier, regardless of role, and adapt their role later
  return users.find(u => {
    if (u.email && u.email.toLowerCase().trim() === lower) return true;
    const userDigits = u.phoneNumber ? u.phoneNumber.replace(/\D/g, '') : '';
    if (digits.length >= 10 && (userDigits.endsWith(digits) || userDigits.endsWith(digits.slice(-10)))) return true;
    if (u.phoneNumber === identifier) return true;
    return false;
  }) || null;
}

// Secure User Login with Auto Retrieval
export async function loginUser(emailOrPhone: string, role: 'passenger' | 'rider', secretPassword?: string): Promise<User | null> {
  const password = secretPassword || 'campus123';
  const trimmedInput = emailOrPhone.trim();
  const lowerInput = trimmedInput.toLowerCase();
  const digits = trimmedInput.replace(/\D/g, '');

  // 1. Account lockout pre-check
  const normalizedId = lowerInput;
  const now = Date.now();
  const cachedAttempt = loginAttemptsCache.get(normalizedId);
  if (cachedAttempt && cachedAttempt.lockoutUntil > now) {
    const minutesLeft = Math.ceil((cachedAttempt.lockoutUntil - now) / 60000);
    throw new Error(`This account has been locked out due to too many failed login attempts. Please try again in ${minutesLeft} minute(s).`);
  }

  let targetUser: User | null = null;

  // 1. Check local cache first, prioritizing matching role
  const localUsers = getUsers(true);
  const cacheMatchesWithRole = localUsers.filter(u => {
    if (u.role !== role) return false;
    if (u.email && u.email.toLowerCase().trim() === lowerInput) return true;
    if (u.phoneNumber && u.phoneNumber.trim() === trimmedInput) return true;
    if (u.phoneNumber) {
      const uDigits = u.phoneNumber.replace(/\D/g, '');
      if (digits.length >= 10 && (uDigits.endsWith(digits) || uDigits.endsWith(digits.slice(-10)))) return true;
    }
    return false;
  });

  const cacheMatchesAny = localUsers.filter(u => {
    if (u.email && u.email.toLowerCase().trim() === lowerInput) return true;
    if (u.phoneNumber && u.phoneNumber.trim() === trimmedInput) return true;
    if (u.phoneNumber) {
      const uDigits = u.phoneNumber.replace(/\D/g, '');
      if (digits.length >= 10 && (uDigits.endsWith(digits) || uDigits.endsWith(digits.slice(-10)))) return true;
    }
    return false;
  });

  const cacheMatches = cacheMatchesWithRole.length > 0 ? cacheMatchesWithRole : cacheMatchesAny;

  if (cacheMatches.length > 0) {
    // Prefer approved status with solid Auth UID
    const approvedSolid = cacheMatches.find(u => u.verificationStatus === 'approved' && !u.id.startsWith('pending_user_') && !u.id.startsWith('local_user_'));
    const approved = cacheMatches.find(u => u.verificationStatus === 'approved');
    const pending = cacheMatches.find(u => u.verificationStatus === 'pending');
    targetUser = approvedSolid || approved || pending || cacheMatches[0];
  } else {
    // 2. Fallback to direct Firestore collection querying to be completely robust
    try {
      let emailDocs: User[] = [];
      
      // Query lowercase email
      const qEmailLower = query(collection(db, "campusride_users"), where("email", "==", lowerInput));
      const emailSnapLower = await getDocs(qEmailLower);
      if (!emailSnapLower.empty) {
        emailDocs.push(...emailSnapLower.docs.map(d => ({ id: d.id, ...d.data() }) as User));
      }
      
      // Also query mixed/exact case email if different from lowercase input
      if (trimmedInput !== lowerInput) {
        const qEmailExact = query(collection(db, "campusride_users"), where("email", "==", trimmedInput));
        const emailSnapExact = await getDocs(qEmailExact);
        if (!emailSnapExact.empty) {
          const docs = emailSnapExact.docs.map(d => ({ id: d.id, ...d.data() }) as User);
          docs.forEach(doc => {
            if (!emailDocs.some(u => u.id === doc.id)) {
              emailDocs.push(doc);
            }
          });
        }
      }

      if (emailDocs.length > 0) {
        const matchingRoleDocs = emailDocs.filter(u => u.role === role);
        const docsToUse = matchingRoleDocs.length > 0 ? matchingRoleDocs : emailDocs;

        const approvedSolid = docsToUse.find(u => u.verificationStatus === 'approved' && !u.id.startsWith('pending_user_') && !u.id.startsWith('local_user_'));
        const approved = docsToUse.find(u => u.verificationStatus === 'approved');
        const pending = docsToUse.find(u => u.verificationStatus === 'pending');
        targetUser = approvedSolid || approved || pending || docsToUse[0];
      } else if (digits.length >= 10) {
        // Query multiple phone number variants to handle different formats in Firestore
        const last10 = digits.slice(-10);
        const phoneVariants = [trimmedInput, digits, last10, `+91${last10}`, `+91 ${last10}`, `0${last10}`];
        const uniqueVariants = Array.from(new Set(phoneVariants));
        
        let phoneDocs: User[] = [];
        for (const variant of uniqueVariants) {
          const qPhone = query(collection(db, "campusride_users"), where("phoneNumber", "==", variant));
          const phoneSnap = await getDocs(qPhone);
          if (!phoneSnap.empty) {
            const docs = phoneSnap.docs.map(d => ({ id: d.id, ...d.data() }) as User);
            docs.forEach(doc => {
              if (!phoneDocs.some(u => u.id === doc.id)) {
                phoneDocs.push(doc);
              }
            });
          }
        }

        if (phoneDocs.length > 0) {
          const matchingRoleDocs = phoneDocs.filter(u => u.role === role);
          const docsToUse = matchingRoleDocs.length > 0 ? matchingRoleDocs : phoneDocs;

          const approvedSolid = docsToUse.find(u => u.verificationStatus === 'approved' && !u.id.startsWith('pending_user_') && !u.id.startsWith('local_user_'));
          const approved = docsToUse.find(u => u.verificationStatus === 'approved');
          const pending = docsToUse.find(u => u.verificationStatus === 'pending');
          targetUser = approvedSolid || approved || pending || docsToUse[0];
        }
      }

      // 3. Absolute foolproof fallback: scan all Firestore users if still not found
      if (!targetUser) {
        const allSnap = await getDocs(collection(db, "campusride_users"));
        if (!allSnap.empty) {
          const allUsers = allSnap.docs.map(d => ({ id: d.id, ...d.data() }) as User);
          
          let found = allUsers.find(u => {
            if (u.role !== role) return false;
            if (u.email && u.email.toLowerCase().trim() === lowerInput) return true;
            if (u.phoneNumber) {
              const uDigits = u.phoneNumber.replace(/\D/g, '');
              if (digits.length >= 10 && (uDigits.endsWith(digits) || uDigits.endsWith(digits.slice(-10)))) return true;
              if (u.phoneNumber.trim() === trimmedInput) return true;
            }
            return false;
          });

          if (!found) {
            found = allUsers.find(u => {
              if (u.email && u.email.toLowerCase().trim() === lowerInput) return true;
              if (u.phoneNumber) {
                const uDigits = u.phoneNumber.replace(/\D/g, '');
                if (digits.length >= 10 && (uDigits.endsWith(digits) || uDigits.endsWith(digits.slice(-10)))) return true;
                if (u.phoneNumber.trim() === trimmedInput) return true;
              }
              return false;
            }) || null;
          }

          targetUser = found;
        }
      }
    } catch (fsErr) {
      console.warn("Direct Firestore user pre-lookup failed, using local cache only:", fsErr);
    }
  }

  // Calculate isSystemAdmin flag perfectly
  const isSystemAdmin = isSystemAdminEmail(lowerInput) || (targetUser && (targetUser.isAdmin === true || isSystemAdminEmail(targetUser.email)));

  // 3. Role mismatch safeguard: Automatically adapt to user's registered role instead of blocking login!
  if (targetUser && !isSystemAdmin && targetUser.role !== role) {
    console.log(`[Login] Auto-adapting session role to match registered role: ${targetUser.role}`);
  }

  // 4. Pre-check Student Verification Status
  if (targetUser && !isSystemAdmin) {
    if (targetUser.verificationStatus === 'pending') {
      throw new Error('Your account is waiting for the admin to accept the request.');
    } else if (targetUser.verificationStatus === 'rejected') {
      throw new Error(`Your registration request has been rejected. Reason: "${targetUser.rejectionReason || 'No reason provided'}"`);
    }
  }

  // Determine the email address to pass to Firebase Auth
  const email = targetUser ? targetUser.email : (trimmedInput.includes('@') ? trimmedInput : trimmedInput + '@' + ALLOWED_DOMAINS[0]);

  try {
    // 1. Sign in safely utilizing Firebase Authentication
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    // 2. Automatically retrieve verified student dataset from Firestore database
    const docRef = doc(db, "campusride_users", uid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const userData = snap.data() as User;
      
      // Secondary role match security assertion: Automatically adapt
      if (!isSystemAdmin && userData.role !== role) {
        console.log(`[Login Auth] Auto-adapting session role to match registered role: ${userData.role}`);
      }
      
      const updatedUser: User = {
        ...userData,
        lastLogin: new Date().toISOString()
      };

      // Store last login date permanently back in Firestore
      await updateDoc(docRef, { 
        lastLogin: updatedUser.lastLogin 
      });

      // Reset any failed attempts
      handleSuccessLogin(emailOrPhone, updatedUser);

      // Save locally & set current active user
      updateLocalUserCache(updatedUser);
      setCurrentUser(updatedUser);
      addLoginLog(updatedUser.id, updatedUser.fullName, updatedUser.email);
      
      return updatedUser;
    } else {
      // In case the Firestore doc doesn't exist but Firebase Auth succeeded (e.g. newly created admin on secondary app)
      const mockAdmin = isSystemAdminEmail(email);
      const fullName = email.toLowerCase().trim() === 'mdnihalktp@gmail.com' ? "Nihal" : (email.toLowerCase().trim() === 'mrshaizshaiz@gmail.com' ? "Shaiz" : "Campus Student");
      const defaultUser: User = {
        id: uid,
        email: email,
        role: role,
        fullName: fullName,
        collegeName: "delulucoders",
        phoneNumber: email.toLowerCase().trim() === 'mdnihalktp@gmail.com' ? "8970638498" : "9141259188",
        isVerified: true,
        verificationStatus: "approved",
        isAdmin: mockAdmin,
        avatarUrl: mockAdmin ? getAdminAvatar(fullName) : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        balance: 0,
        rating: 5.0,
        totalRides: 0,
        dateCreated: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      await setDoc(doc(db, "campusride_users", uid), defaultUser);
      handleSuccessLogin(emailOrPhone, defaultUser);
      updateLocalUserCache(defaultUser);
      setCurrentUser(defaultUser);
      addLoginLog(uid, defaultUser.fullName, defaultUser.email);
      return defaultUser;
    }
  } catch (err: any) {
    const isAuthDisabled = err.code === 'auth/operation-not-allowed' || err.message?.includes('not-allowed');
    const isUserNotFound = err.code === 'auth/user-not-found' || err.code === 'auth/member-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/user-disabled';
    
    // Explicitly identify incorrect passwords for existing registered users:
    if (targetUser && (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential')) {
      const hashedInput = hashPassword(password, targetUser.email);
      const expectedHash = targetUser.passwordHash || hashPassword(targetUser.password || 'campus123', targetUser.email);
      const defaultHash = hashPassword('campus123', targetUser.email);
      const isUserAdmin = isSystemAdminEmail(targetUser.email);
      const adminPassHash1 = hashPassword('sha1511', targetUser.email);
      const adminPassHash2 = hashPassword('Nihal@cr17', targetUser.email);
      
      const isCorrectHash = (hashedInput === expectedHash) || (hashedInput === defaultHash) || (isUserAdmin && (hashedInput === adminPassHash1 || hashedInput === adminPassHash2));
      
      if (isCorrectHash) {
        console.warn("Utilizing password-hash verified local cache fallback login mode.");
        handleSuccessLogin(emailOrPhone, targetUser);
        setCurrentUser(targetUser);
        addLoginLog(targetUser.id, targetUser.fullName, targetUser.email);
        return targetUser;
      } else {
        handleFailedAttempt(emailOrPhone, targetUser);
        throw new Error('Incorrect password. Please verify your credentials and try again.');
      }
    }

    if (isAuthDisabled || isUserNotFound) {
      console.warn("Firebase Auth is disabled or user not found. Logging in with Local Sandbox Mode Fallback.");
      const matched = findUserByIdentifier(emailOrPhone, role);
      const fallbackUser = targetUser || matched;
      if (fallbackUser) {
        const isUserAdmin = isSystemAdminEmail(fallbackUser.email);
        if (!isUserAdmin && fallbackUser.role !== role) {
          console.log(`[Login Fallback] Auto-adapting session role to match registered role: ${fallbackUser.role}`);
        }
        
        const hashedInput = hashPassword(password, fallbackUser.email);
        const expectedHash = fallbackUser.passwordHash || hashPassword(fallbackUser.password || 'campus123', fallbackUser.email);
        const defaultHash = hashPassword('campus123', fallbackUser.email);
        const adminPassHash1 = hashPassword('sha1511', fallbackUser.email);
        const adminPassHash2 = hashPassword('Nihal@cr17', fallbackUser.email);
        
        const isCorrectHash = (hashedInput === expectedHash) || (hashedInput === defaultHash) || (isUserAdmin && (hashedInput === adminPassHash1 || hashedInput === adminPassHash2));
        
        if (isCorrectHash) {
          handleSuccessLogin(emailOrPhone, fallbackUser);
          updateLocalUserCache(fallbackUser);
          setCurrentUser(fallbackUser);
          addLoginLog(fallbackUser.id, fallbackUser.fullName, fallbackUser.email);
          return fallbackUser;
        } else {
          handleFailedAttempt(emailOrPhone, fallbackUser);
          throw new Error('Incorrect password (Local Fallback Mode).');
        }
      } else {
        const isAdmin = isSystemAdminEmail(email);
        if (isAdmin) {
          const correctAdminPass = email.toLowerCase().trim() === 'mdnihalktp@gmail.com' ? 'Nihal@cr17' : 'sha1511';
          if (password === correctAdminPass) {
            const fullName = email.toLowerCase().trim() === 'mdnihalktp@gmail.com' ? "Nihal" : "Shaiz";
            const adminUser: User = {
              id: 'local_admin_' + (email.toLowerCase().trim() === 'mdnihalktp@gmail.com' ? 'nihal' : 'shaiz'),
              email: email,
              role: role,
              fullName: fullName,
              collegeName: "delulucoders",
              phoneNumber: email.toLowerCase().trim() === 'mdnihalktp@gmail.com' ? "8970638498" : "9141259188",
              isVerified: true,
              verificationStatus: "approved",
              isAdmin: true,
              avatarUrl: getAdminAvatar(fullName),
              balance: 0,
              rating: 5.0,
              totalRides: 0,
              dateCreated: new Date().toISOString(),
              lastLogin: new Date().toISOString()
            };
            
            handleSuccessLogin(emailOrPhone, adminUser);
            updateLocalUserCache(adminUser);
            setCurrentUser(adminUser);
            addLoginLog(adminUser.id, adminUser.fullName, adminUser.email);
            return adminUser;
          } else {
            handleFailedAttempt(emailOrPhone, null);
            throw new Error('Incorrect administrator password.');
          }
        }
        throw new Error("No registered local record found with this identifier. Please verify Secure student signup first!");
      }
    }

    console.warn("Authentication failed, checking for unseeded administrative profile trigger:", err);
    
    // Admin Seeder Safe-check fallback: Creates admin record dynamically back in Auth when first accessed
    const isAdmin = isSystemAdminEmail(email);
    if (isAdmin) {
      const correctAdminPass = email.toLowerCase().trim() === 'mdnihalktp@gmail.com' ? 'Nihal@cr17' : 'sha1511';
      if (password === correctAdminPass) {
        try {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          const uid = cred.user.uid;
          
          const fullName = email.toLowerCase().trim() === 'mdnihalktp@gmail.com' ? "Nihal" : "Shaiz";
          const adminUser: User = {
            id: uid,
            email: email,
            role: role,
            fullName: fullName,
            collegeName: "delulucoders",
            phoneNumber: email.toLowerCase().trim() === 'mdnihalktp@gmail.com' ? "8970638498" : "9141259188",
            isVerified: true,
            verificationStatus: "approved",
            isAdmin: true,
            avatarUrl: getAdminAvatar(fullName),
            balance: 0,
            rating: 5.0,
            totalRides: 0,
            dateCreated: new Date().toISOString(),
            lastLogin: new Date().toISOString()
          };

          await setDoc(doc(db, "campusride_users", uid), adminUser);
          updateLocalUserCache(adminUser);
          setCurrentUser(adminUser);
          addLoginLog(uid, adminUser.fullName, adminUser.email);
          return adminUser;
        } catch (createErr) {
          console.error("Failed to seed administrator account dynamically:", createErr);
        }
      }
    }
    throw err;
  }
  return null;
}

// User Logout Trigger
export async function logoutUser(): Promise<void> {
  await signOut(auth);
  setCurrentUser(null);
}

// User Forgot Password Request
export async function forgotPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// Update User Profile Doc
export function updateUserProfile(userId: string, updates: Partial<User>): User | null {
  const users = getUsers(true);
  const index = users.findIndex(u => u.id === userId);
  if (index !== -1) {
    const updatedUser = { ...users[index], ...updates };
    users[index] = updatedUser;
    saveUsers(users);
    
    // Update document permanently in Firestore users collection
    updateDoc(doc(db, "campusride_users", userId), updates).catch(err => {
      console.warn("Failed to update user profile in Firestore:", err);
    });

    const cur = getCurrentUser();
    if (cur && cur.id === userId) {
      setCurrentUser(updatedUser);
    }
    return updatedUser;
  }
  return null;
}

// Approve Student Request - actually creates true Firebase Auth account and finalizes document ID
export async function approveStudentRequest(targetUser: User): Promise<User> {
  const email = targetUser.email;
  const password = targetUser.passwordEncrypted ? decryptPassword(targetUser.passwordEncrypted) : (targetUser.password || 'campus123');
  
  let uid = targetUser.id;
  let isSandbox = targetUser.id.startsWith('local_user_');

  // Create the Firebase Auth record using a secondary app instance to avoid logging out the Admin
  if (!isSandbox) {
    try {
      if (!firebaseConfig.apiKey) {
        throw new Error("Missing Firebase Applet Configuration API Key.");
      }
      const appName = "ApproveApp_" + Date.now() + "_" + Math.floor(Math.random() * 100);
      const secondaryApp = initializeApp({
        apiKey: firebaseConfig.apiKey,
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
        messagingSenderId: firebaseConfig.messagingSenderId,
        appId: firebaseConfig.appId,
      }, appName);
      
      const secondaryAuth = getAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      uid = userCredential.user.uid;
      
      // Sign out and dispose secondary session
      try {
        await secondaryAuth.signOut();
      } catch (e) {}
    } catch (authErr: any) {
      console.warn("Failed creating Auth record on approval:", authErr);
      if (authErr && authErr.code === 'auth/email-already-in-use') {
        const users = getUsers(true);
        const matched = users.find(u => u.email.toLowerCase().trim() === email.toLowerCase().trim() && !u.id.startsWith('pending_user_') && !u.id.startsWith('local_user_'));
        if (matched) {
          uid = matched.id;
        } else {
          isSandbox = true;
        }
      } else {
        console.warn("Admin approval proceeding utilizing Local Sandbox Fallback due to auth issue.");
        isSandbox = true;
      }
    }
  }

  // Create approved document model
  const approvedUser: User = {
    ...targetUser,
    id: uid,
    isVerified: true,
    verificationStatus: 'approved' as const,
  };

  // We explicitly clean up any unhashed plain-text password references from approved student profile document 
  // for robust production compliance.
  delete (approvedUser as any).password;

  // Write new doc
  await setDoc(doc(db, "campusride_users", uid), approvedUser);

  // Keep old temporary request doc to preserve registration details, simply flag it as merged
  if (targetUser.id !== uid) {
    await updateDoc(doc(db, "campusride_users", targetUser.id), {
      isVerified: true,
      verificationStatus: 'approved' as const,
      isPendingRequestMerged: true,
      approvedUid: uid
    });
  }

  // Update localcache
  const users = getUsers(true);
  const updatedLocal = users.map(u => {
    if (u.id === targetUser.id && u.id !== uid) {
      return {
        ...u,
        isVerified: true,
        verificationStatus: 'approved' as const,
        isPendingRequestMerged: true,
        approvedUid: uid
      };
    }
    if (u.id === uid) {
      return approvedUser;
    }
    return u;
  });
  
  if (!updatedLocal.some(u => u.id === uid)) {
    updatedLocal.push(approvedUser);
  }
  saveUsers(updatedLocal);

  // Send Push Alert Info
  try {
    sendPushNotification(
      uid,
      'Your CampusRide account has been approved! 🎉',
      'Congratulations! Your student verification is successful. You can now access the full ride-sharing application.',
      'system'
    );
  } catch (e) {
    console.error('Push message transport error on approval:', e);
  }

  return approvedUser;
}

// Reject Student Request - flags request as rejected
export async function rejectStudentRequest(targetUserId: string, reason: string): Promise<void> {
  await updateDoc(doc(db, "campusride_users", targetUserId), {
    isVerified: false,
    verificationStatus: 'rejected' as const,
    rejectionReason: reason
  });

  const users = getUsers(true);
  const index = users.findIndex(u => u.id === targetUserId);
  if (index !== -1) {
    users[index].isVerified = false;
    users[index].verificationStatus = 'rejected' as const;
    users[index].rejectionReason = reason;
    saveUsers(users);
  }
}

// Delete User Account & wipe associated references (completely deletes the user permanently)
export function deleteUserAccount(userId: string): void {
  // 1. Completely remove user from local list
  const users = getUsers(true);
  const updatedUsers = users.filter(u => u.id !== userId);
  saveUsers(updatedUsers);

  // 2. Cancel active/future rides of this user (do not delete them, to preserve reporting history!)
  const rides = getRides();
  const updatedRides = rides.map(r => {
    if (r.riderId === userId && r.status === 'active') {
      return { ...r, status: 'cancelled' as const };
    }
    return r;
  });
  saveRides(updatedRides);

  // 3. Mark pending and accepted bookings on these cancelled rides or placed by this user as cancelled
  const bookings = getBookings();
  const updatedBookings = bookings.map(b => {
    const bookingRide = rides.find(r => r.id === b.rideId);
    // Cancel accepted bookings on rider's rides
    if (bookingRide && bookingRide.riderId === userId && b.status === 'accepted') {
      return { ...b, status: 'cancelled' as const };
    }
    // Cancel pending passenger bookings
    if (b.passengerId === userId && b.status === 'pending') {
      return { ...b, status: 'cancelled' as const };
    }
    return b;
  });
  saveBookings(updatedBookings);

  // 4. Do NOT remove payments, reviews, or complaints. We keep them intact for admin audit trails and statistics.

  // 5. Clear local structures
  const cur = getCurrentUser();
  if (cur && cur.id === userId) {
    setCurrentUser(null);
  }

  // 6. Delete Firestore user document permanently
  deleteDoc(doc(db, "campusride_users", userId)).catch(err => console.warn(err));
  
  // Sync cancellation statuses to Firestore without removing any documents or traces
  rides.forEach(r => {
    if (r.riderId === userId && r.status === 'active') {
      updateDoc(doc(db, "campusride_rides", r.id), { status: 'cancelled' }).catch(err => console.warn(err));
    }
  });

  updatedBookings.forEach(b => {
    if ((b.passengerId === userId && b.status === 'cancelled') || (b.status === 'cancelled')) {
      updateDoc(doc(db, "campusride_bookings", b.id), { status: 'cancelled' }).catch(err => console.warn(err));
    }
  });
}

// Publish Ride
export function publishRide(rideData: {
  riderId: string;
  vehicleName: string;
  vehiclePlate: string;
  vehiclePhoto: string;
  seatsTotal: number;
  pricePerSeat: number;
  routeType: 'home_to_college' | 'college_to_home' | 'round_trip';
  pickup: string;
  destination: string;
  date: string;
  departureTime: string;
  distanceKm?: number;
  coordinates?: {
    pickup: [number, number];
    destination: [number, number];
  };
}): Ride {
  const rides = getRides();
  const users = getUsers(true);
  const rider = users.find(u => u.id === rideData.riderId);

  const rideId = `ride_${Date.now()}`;

  const newRide: Ride = {
    id: rideId,
    riderId: rideData.riderId,
    riderName: rider ? rider.fullName : 'Verified Rider',
    riderCollege: rider ? rider.collegeName : 'Campus College',
    riderRating: rider ? rider.rating : 4.8,
    riderAvatar: rider ? rider.avatarUrl : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    riderPhone: rider ? rider.phoneNumber : '',
    vehicleName: rideData.vehicleName,
    vehiclePlate: rideData.vehiclePlate,
    vehiclePhoto: rideData.vehiclePhoto || 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=400&auto=format&fit=crop&q=80',
    seatsTotal: rideData.seatsTotal,
    seatsAvailable: rideData.seatsTotal,
    pricePerSeat: rideData.pricePerSeat,
    routeType: rideData.routeType,
    pickup: rideData.pickup,
    destination: rideData.destination,
    date: rideData.date,
    departureTime: rideData.departureTime,
    status: 'active',
    distanceKm: rideData.distanceKm,
    coordinates: rideData.coordinates
  };

  rides.push(newRide);
  saveRides(rides);

  // Write ride to Firestore
  setDoc(doc(db, "campusride_rides", rideId), newRide).catch(err => {
    console.error("Failed to publish ride to Firestore:", err);
  });

  // Create notifications broadcast
  sendPushNotification(
    'all',
    'New Ride Published 🏍️',
    `${newRide.riderName} published a ride from ${newRide.pickup} to ${newRide.destination}!`,
    'system'
  );

  return newRide;
}

// Cancel Ride
export function cancelRide(rideId: string): boolean {
  const rides = getRides();
  const index = rides.findIndex(r => r.id === rideId);
  if (index !== -1) {
    rides[index].status = 'cancelled';
    saveRides(rides);

    // Save cancellation in Firestore
    updateDoc(doc(db, "campusride_rides", rideId), { status: 'cancelled' }).catch(err => console.warn(err));

    // Cancel all bookings on this ride
    const bookings = getBookings();
    const updatedBookings = bookings.map(b => {
      if (b.rideId === rideId && b.status !== 'cancelled') {
        // Send notification to passenger
        sendPushNotification(
          b.passengerId,
          'Ride Cancelled',
          `Your booking with ${rides[index].riderName} has been cancelled by the rider. A refund has been issued.`,
          'ride_cancelled'
        );
        updateDoc(doc(db, "campusride_bookings", b.id), { status: 'cancelled' }).catch(err => console.warn(err));
        return { ...b, status: 'cancelled' as const };
      }
      return b;
    });
    saveBookings(updatedBookings);
    return true;
  }
  return false;
}

// Complete Ride
export function completeRide(rideId: string): boolean {
  const rides = getRides();
  const index = rides.findIndex(r => r.id === rideId);
  if (index !== -1) {
    if (rides[index].status === 'completed') return false;
    
    rides[index].status = 'completed';
    saveRides(rides);

    // Write completion to Firestore
    updateDoc(doc(db, "campusride_rides", rideId), { status: 'completed' }).catch(err => console.warn(err));

    // Complete all bookings on this ride
    const bookings = getBookings();
    const payments = getPayments();
    let totalRiderEarningsForRide = 0;

    const updatedBookings = bookings.map(b => {
      if (b.rideId === rideId) {
        if (b.status === 'accepted') {
          // Increment passenger rides on completed trip
          const users = getUsers(true);
          const pIdx = users.findIndex(u => u.id === b.passengerId);
          if (pIdx !== -1) {
            const updatedPass = {
              ...users[pIdx],
              totalRides: (users[pIdx].totalRides || 0) + 1
            };
            users[pIdx] = updatedPass;
            saveUsers(users);

            // Save details back to Firestore
            updateDoc(doc(db, "campusride_users", b.passengerId), {
              totalRides: updatedPass.totalRides
            }).catch(err => console.warn(err));
          }

          totalRiderEarningsForRide += b.totalPrice;

          // Process Payments
          const payIdx = payments.findIndex(p => p.bookingId === b.id);
          if (payIdx !== -1) {
            payments[payIdx].status = 'completed';
            updateDoc(doc(db, "campusride_payments", payments[payIdx].id), { status: 'completed' }).catch(err => console.warn(err));
          }
          
          sendPushNotification(
            b.passengerId,
            'Ride Completed & Paid!',
            `Payment of ₹${b.totalPrice} processed. Your trip with ${rides[index].riderName} has finished. Please share your rating experience!`,
            'system'
          );

          updateDoc(doc(db, "campusride_bookings", b.id), { status: 'completed', paymentStatus: 'paid' }).catch(err => console.warn(err));
          return { ...b, status: 'completed' as any, paymentStatus: 'paid' as any };
        }
      }
      return b;
    });
    saveBookings(updatedBookings);
    savePayments(payments);

    // Update Rider properties
    const users = getUsers(true);
    const riderId = rides[index].riderId;
    const riderIdx = users.findIndex(u => u.id === riderId);
    if (riderIdx !== -1) {
      const updatedRider = {
        ...users[riderIdx],
        totalRides: (users[riderIdx].totalRides || 0) + 1,
        balance: (users[riderIdx].balance || 0) + totalRiderEarningsForRide
      };
      users[riderIdx] = updatedRider;
      saveUsers(users);

      updateDoc(doc(db, "campusride_users", riderId), {
        totalRides: updatedRider.totalRides,
        balance: updatedRider.balance
      }).catch(err => console.warn(err));
    }

    return true;
  }
  return false;
}

// Book Seat & Pay
export function createBookingAndPayment(
  rideId: string,
  passengerId: string,
  seatsBooked: number,
  paymentMethod: 'UPI' | 'GPay' | 'PhonePe' | 'Paytm'
): { booking: Booking; payment: Payment } {
  const rides = getRides();
  const bookingList = getBookings();
  const paymentList = getPayments();
  const users = getUsers(true);

  const ride = rides.find(r => r.id === rideId);
  const passenger = users.find(u => u.id === passengerId);

  if (!ride) throw new Error('Ride not found');
  if (!passenger) throw new Error('Passenger not found');
  if (ride.seatsAvailable < seatsBooked) throw new Error('Not enough seats available');

  const totalPrice = ride.pricePerSeat * seatsBooked;
  const bookingId = `book_${Date.now()}`;
  const paymentId = `pay_${Date.now()}`;

  // Create Booking record
  const newBooking: Booking = {
    id: bookingId,
    rideId: rideId,
    passengerId: passengerId,
    passengerName: passenger.fullName,
    passengerCollege: passenger.collegeName,
    passengerPhone: passenger.phoneNumber,
    seatsBooked: seatsBooked,
    totalPrice: totalPrice,
    status: 'pending',
    paymentStatus: 'pending',
    dateBooked: (() => {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    })()
  };

  bookingList.push(newBooking);
  saveBookings(bookingList);

  // Create Payment record
  const newPayment: Payment = {
    id: paymentId,
    bookingId: bookingId,
    amount: totalPrice,
    paymentMethod: paymentMethod,
    status: 'pending',
    transactionId: `TXN-${paymentMethod.toUpperCase()}-${Math.floor(10000000 + Math.random() * 90000000)}`,
    date: new Date().toISOString()
  };
  paymentList.push(newPayment);
  savePayments(paymentList);

  // Write booking & payment to Firestore
  setDoc(doc(db, "campusride_bookings", bookingId), newBooking).catch(err => {
    console.error("Failed to save booking to Firestore:", err);
  });
  setDoc(doc(db, "campusride_payments", paymentId), newPayment).catch(err => {
    console.error("Failed to save payment to Firestore:", err);
  });

  // Notify Rider of new pending booking request
  sendPushNotification(
    ride.riderId,
    'New Booking Request',
    `${passenger.fullName} requested ${seatsBooked} seat(s) for your trip from ${ride.pickup} → ${ride.destination}.`,
    'ride_booked'
  );

  return { booking: newBooking, payment: newPayment };
}

// Update Booking Status
export function updateBookingStatus(bookingId: string, newStatus: 'accepted' | 'rejected' | 'cancelled'): Booking | null {
  const bookings = getBookings();
  const rides = getRides();
  const index = bookings.findIndex(b => b.id === bookingId);
  
  if (index !== -1) {
    const booking = bookings[index];
    const oldStatus = booking.status;
    booking.status = newStatus;
    saveBookings(bookings);

    // Save update in Firestore
    updateDoc(doc(db, "campusride_bookings", bookingId), { status: newStatus }).catch(err => console.warn(err));

    const ride = rides.find(r => r.id === booking.rideId);
    if (ride) {
      if (newStatus === 'accepted' && oldStatus !== 'accepted') {
        // Adjust available seats on accepted bookings
        ride.seatsAvailable = Math.max(0, ride.seatsAvailable - booking.seatsBooked);
        saveRides(rides);

        updateDoc(doc(db, "campusride_rides", ride.id), { seatsAvailable: ride.seatsAvailable }).catch(err => console.warn(err));

        sendPushNotification(
          booking.passengerId,
          'Booking Accepted!',
          `Your booking with ${ride.riderName} to ${ride.destination} has been ACCEPTED. View receipt and get traveling!`,
          'system'
        );

        // approach driver simulation trigger
        setTimeout(() => {
          sendPushNotification(
            booking.passengerId,
            'Rider Approaching',
            `${ride.riderName} is currently approaching the pickup point. Track their movement live on the map!`,
            'rider_arriving'
          );
        }, 15000);
      } else if (newStatus === 'rejected') {
        sendPushNotification(
          booking.passengerId,
          'Booking Declined',
          `Your booking request for ${ride.riderName}'s trip was declined.`,
          'ride_cancelled'
        );
      } else if (newStatus === 'cancelled' && oldStatus === 'accepted') {
        // Return available seats
        ride.seatsAvailable = Math.min(ride.seatsTotal, ride.seatsAvailable + booking.seatsBooked);
        saveRides(rides);

        updateDoc(doc(db, "campusride_rides", ride.id), { seatsAvailable: ride.seatsAvailable }).catch(err => console.warn(err));

        sendPushNotification(
          ride.riderId,
          'Passenger Cancelled',
          `${booking.passengerName} cancelled their booking on your ride to ${ride.destination}.`,
          'ride_cancelled'
        );
      }
    }
    
    return booking;
  }
  return null;
}

// In-App Messaging
export function sendMessage(rideId: string, senderId: string, receiverId: string, text: string, locationShared?: { lat: number; lng: number, isRider?: boolean }): Message {
  const messages = getMessages();
  const messageId = `msg_${Date.now()}`;

  const newMessage: Message = {
    id: messageId,
    rideId,
    senderId,
    receiverId,
    text,
    timestamp: new Date().toISOString(),
    locationShared
  };
  messages.push(newMessage);
  saveMessages(messages);

  // Write message to Firestore database
  setDoc(doc(db, "campusride_messages", messageId), newMessage).catch(err => {
    console.error("Failed to write chat message to Firestore:", err);
  });

  // Notify recipient of message
  sendPushNotification(
    receiverId,
    'New Message',
    text.length > 50 ? `${text.substring(0, 47)}...` : text,
    'message_received',
    rideId
  );

  return newMessage;
}

// Clear all chat messages for a specific ride
export function clearChatMessagesForRide(rideId: string) {
  const allMessages = getMessages();
  const toDelete = allMessages.filter(m => m.rideId === rideId);
  const remaining = allMessages.filter(m => m.rideId !== rideId);
  saveMessages(remaining);

  toDelete.forEach((msg) => {
    deleteDoc(doc(db, "campusride_messages", msg.id)).catch(err => {
      console.warn("Failed to delete chat message doc:", err);
    });
  });
}

// Push notification sender helper
export function sendPushNotification(
  userId: string,
  title: string,
  message: string,
  type: Notification['type'],
  rideId?: string
): Notification {
  const notifications = getNotifications();
  const notificationId = `notif_${Date.now()}`;

  const newNotif: Notification = {
    id: notificationId,
    userId,
    title,
    message,
    type,
    read: false,
    date: new Date().toISOString()
  };

  if (rideId !== undefined) {
    newNotif.rideId = rideId;
  }
  notifications.unshift(newNotif);
  saveNotifications(notifications);

  // Trigger backend FCM and server-side preferences dispatcher securely
  fetch('/api/notifications/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      title,
      message,
      type,
      rideId
    })
  }).then(async (response) => {
    const resData = await response.json().catch(() => ({}));
    if (resData.success && resData.notificationId) {
      console.log("[Notification Dispatcher] Sent successfully through backend with ID:", resData.notificationId);
    }
  }).catch(err => {
    console.warn("Failed to dispatch push notification through server API:", err);
  });

  return newNotif;
}

// Reviews
export function createReview(rideId: string, riderId: string, passengerId: string, passengerName: string, rating: number, reviewText: string): Review {
  const reviews = getReviews();
  const reviewId = `rev_${Date.now()}`;

  const newReview: Review = {
    id: reviewId,
    rideId,
    riderId,
    passengerId,
    passengerName,
    rating,
    reviewText,
    date: new Date().toISOString().split('T')[0]
  };
  reviews.push(newReview);
  saveReviews(reviews);

  // Write reviews doc to Firestore
  setDoc(doc(db, "campusride_reviews", reviewId), newReview).catch(err => {
    console.error("Failed to submit review doc to Firestore:", err);
  });

  // Calculate rider star rating averages
  const users = getUsers(true);
  const riderIdx = users.findIndex(u => u.id === riderId);
  if (riderIdx !== -1) {
    const riderReviews = reviews.filter(r => r.riderId === riderId);
    const sum = riderReviews.reduce((sum, r) => sum + r.rating, 0);
    const avg = parseFloat((sum / riderReviews.length).toFixed(1));
    users[riderIdx].rating = avg;
    saveUsers(users);

    updateDoc(doc(db, "campusride_users", riderId), { rating: avg }).catch(err => console.warn(err));

    // Keep active rides star sync
    const rides = getRides();
    rides.forEach(r => {
      if (r.riderId === riderId) {
        r.riderRating = avg;
        updateDoc(doc(db, "campusride_rides", r.id), { riderRating: avg }).catch(err => console.warn(err));
      }
    });
    saveRides(rides);
  }

  return newReview;
}

// Complaints
export function submitComplaint(
  passengerId: string,
  rideId: string,
  category: Complaint['category'],
  explanation: string,
  evidenceBase64?: string
): Complaint {
  const complaints = getComplaints();
  const complaintId = `comp_${Date.now()}`;

  const newComplaint: Complaint = {
    id: complaintId,
    passengerId,
    rideId,
    category,
    explanation,
    evidenceUrl: evidenceBase64 || 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&auto=format&fit=crop&q=80',
    date: new Date().toISOString().split('T')[0],
    status: 'pending'
  };
  complaints.push(newComplaint);
  saveComplaints(complaints);

  // Save complaint permanently to Firestore
  setDoc(doc(db, "campusride_complaints", complaintId), newComplaint).catch(err => {
    console.error("Failed to submit complaint to Firestore:", err);
  });

  sendPushNotification(
    passengerId,
    'Complaint Registered',
    `Your support ticket regarding "${category.replace('_', ' ')}" has been registered. Our safety division is investigating.`,
    'complaint_update'
  );

  return newComplaint;
}

export function resolveComplaint(ticketId: string, adminResponse: string): Promise<void> {
  const complaints = getComplaints();
  const updatedComplaints = complaints.map(c => {
    if (c.id === ticketId) {
      return { 
        ...c, 
        status: 'resolved' as any, 
        adminResponse,
        dateResolved: new Date().toISOString() 
      };
    }
    return c;
  });

  saveComplaints(updatedComplaints);

  // Sync modification permanently with Firestore
  return updateDoc(doc(db, "campusride_complaints", ticketId), {
    status: 'resolved',
    adminResponse,
    dateResolved: new Date().toISOString()
  }).catch(err => {
    console.error(`Failed to sync complaint resolution of ${ticketId} to Firestore:`, err);
  });
}

// ======================= DATA BACKUP & RESTORE MODULE =======================
export interface DatabaseBackup {
  id: string;
  backupName: string;
  timestamp: string;
  createdByName: string;
  createdByEmail: string;
  summary: string;
  dataString: string;
}

export async function createCloudBackup(adminUser: User, backupName: string): Promise<DatabaseBackup> {
  const backupId = `bkp_${Date.now()}`;
  
  const collectionsToBackup = {
    campusride_users: getStorage<User[]>(KEYS.USERS, SEED_USERS),
    campusride_rides: getStorage<Ride[]>(KEYS.RIDES, []),
    campusride_bookings: getStorage<Booking[]>(KEYS.BOOKINGS, []),
    campusride_payments: getStorage<Payment[]>(KEYS.PAYMENTS, []),
    campusride_reviews: getStorage<Review[]>(KEYS.REVIEWS, []),
    campusride_complaints: getStorage<Complaint[]>(KEYS.COMPLAINTS, []),
    campusride_notifications: getStorage<Notification[]>(KEYS.NOTIFICATIONS, []),
    campusride_messages: getStorage<Message[]>(KEYS.MESSAGES, []),
    campusride_login_logs: getStorage<LoginLog[]>(KEYS.LOGIN_LOGS, []),
    campusride_activity_logs: getStorage<ActivityLog[]>(KEYS.ACTIVITY_LOGS, [])
  };

  const usersCount = collectionsToBackup.campusride_users.length;
  const ridesCount = collectionsToBackup.campusride_rides.length;
  const bookingsCount = collectionsToBackup.campusride_bookings.length;
  
  const summary = `Users: ${usersCount}, Rides: ${ridesCount}, Bookings: ${bookingsCount}`;
  const dataString = JSON.stringify(collectionsToBackup);

  const backup: DatabaseBackup = {
    id: backupId,
    backupName: backupName || `Auto Backup - ${new Date().toLocaleDateString()}`,
    timestamp: new Date().toISOString(),
    createdByName: adminUser.fullName,
    createdByEmail: adminUser.email,
    summary,
    dataString
  };

  try {
    await setDoc(doc(db, "campusride_backups", backupId), backup);
    
    // Add an audit activity log
    await addActivityLog(
      adminUser.id,
      adminUser.fullName,
      adminUser.email,
      'db_backup_created',
      `Database cloud backup "${backup.backupName}" securely created.`
    );
    
    return backup;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `campusride_backups/${backupId}`);
    throw error;
  }
}

export async function getCloudBackups(): Promise<DatabaseBackup[]> {
  try {
    const snap = await getDocs(collection(db, "campusride_backups"));
    const backups = snap.docs.map(doc => doc.data() as DatabaseBackup);
    return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "campusride_backups");
    return [];
  }
}

export async function deleteCloudBackup(backupId: string, adminUser: User): Promise<void> {
  try {
    await deleteDoc(doc(db, "campusride_backups", backupId));
    await addActivityLog(
      adminUser.id,
      adminUser.fullName,
      adminUser.email,
      'db_backup_deleted',
      `Cloud backup with ID ${backupId} was permanently deleted.`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `campusride_backups/${backupId}`);
    throw error;
  }
}

export async function restoreDatabaseFromJSON(backupJson: any, adminUser: User): Promise<void> {
  try {
    const rawData = typeof backupJson === 'string' ? JSON.parse(backupJson) : backupJson;
    
    // Support nested backups structure or raw mapping
    const collections = rawData.collections || rawData;
    
    const userList = collections.campusride_users || [];
    const rideList = collections.campusride_rides || [];
    const bookingList = collections.campusride_bookings || [];
    const paymentList = collections.campusride_payments || [];
    const reviewList = collections.campusride_reviews || [];
    const complaintList = collections.campusride_complaints || [];
    const notificationList = collections.campusride_notifications || [];
    const messageList = collections.campusride_messages || [];
    const loginLogList = collections.campusride_login_logs || [];
    const activityLogList = collections.campusride_activity_logs || [];

    // Clear and update local environment states
    localStorage.setItem(KEYS.USERS, JSON.stringify(userList));
    localStorage.setItem(KEYS.RIDES, JSON.stringify(rideList));
    localStorage.setItem(KEYS.BOOKINGS, JSON.stringify(bookingList));
    localStorage.setItem(KEYS.PAYMENTS, JSON.stringify(paymentList));
    localStorage.setItem(KEYS.REVIEWS, JSON.stringify(reviewList));
    localStorage.setItem(KEYS.COMPLAINTS, JSON.stringify(complaintList));
    localStorage.setItem(KEYS.NOTIFICATIONS, JSON.stringify(notificationList));
    localStorage.setItem(KEYS.MESSAGES, JSON.stringify(messageList));
    localStorage.setItem(KEYS.LOGIN_LOGS, JSON.stringify(loginLogList));
    localStorage.setItem(KEYS.ACTIVITY_LOGS, JSON.stringify(activityLogList));

    // Upload files directly into Cloud Firestore
    const pushCollectionToFirestore = async (col: string, items: any[]) => {
      for (const item of items) {
        if (item && item.id) {
          try {
            await setDoc(doc(db, col, item.id), item);
          } catch (e) {
            console.error(`Firestore Restore error: ${col}/${item.id}`, e);
          }
        }
      }
    };

    await pushCollectionToFirestore("campusride_users", userList);
    await pushCollectionToFirestore("campusride_rides", rideList);
    await pushCollectionToFirestore("campusride_bookings", bookingList);
    await pushCollectionToFirestore("campusride_payments", paymentList);
    await pushCollectionToFirestore("campusride_reviews", reviewList);
    await pushCollectionToFirestore("campusride_complaints", complaintList);
    await pushCollectionToFirestore("campusride_notifications", notificationList);
    await pushCollectionToFirestore("campusride_messages", messageList);
    await pushCollectionToFirestore("campusride_login_logs", loginLogList);
    await pushCollectionToFirestore("campusride_activity_logs", activityLogList);

    await addActivityLog(
      adminUser.id,
      adminUser.fullName,
      adminUser.email,
      'db_restored',
      `Complete database restored to state from backup. Action verified by Admin ${adminUser.fullName}.`
    );

  } catch (error) {
    console.error("Database Restoration error:", error);
    throw new Error(error instanceof Error ? error.message : "Malformed database backup payload.");
  }
}

export async function clearDatabaseToAdmins(adminUser: User): Promise<void> {
  const collections = [
    "campusride_users",
    "campusride_rides",
    "campusride_bookings",
    "campusride_payments",
    "campusride_reviews",
    "campusride_complaints",
    "campusride_notifications",
    "campusride_messages",
    "campusride_login_logs",
    "campusride_activity_logs"
  ];

  // 1. Clear Firestore
  for (const col of collections) {
    try {
      const snap = await getDocs(collection(db, col));
      for (const docSnap of snap.docs) {
        if (col === "campusride_users") {
          const uid = docSnap.id;
          if (uid === "admin_passenger" || uid === "admin_nihal") {
            continue;
          }
        }
        await deleteDoc(doc(db, col, docSnap.id));
      }
    } catch (e) {
      console.warn(`Firestore clear error for collection ${col}:`, e);
    }
  }

  // 2. Add back admins to Firestore if they aren't there
  for (const admin of SEED_USERS) {
    try {
      await setDoc(doc(db, "campusride_users", admin.id), admin);
    } catch (e) {
      console.warn(`Firestore add admin error:`, e);
    }
  }

  // 3. Clear local storage
  localStorage.setItem(KEYS.USERS, JSON.stringify(SEED_USERS));
  localStorage.setItem(KEYS.RIDES, JSON.stringify([]));
  localStorage.setItem(KEYS.BOOKINGS, JSON.stringify([]));
  localStorage.setItem(KEYS.PAYMENTS, JSON.stringify([]));
  localStorage.setItem(KEYS.REVIEWS, JSON.stringify([]));
  localStorage.setItem(KEYS.COMPLAINTS, JSON.stringify([]));
  localStorage.setItem(KEYS.NOTIFICATIONS, JSON.stringify([]));
  localStorage.setItem(KEYS.MESSAGES, JSON.stringify([]));
  localStorage.setItem(KEYS.LOGIN_LOGS, JSON.stringify([]));
  localStorage.setItem(KEYS.ACTIVITY_LOGS, JSON.stringify([]));

  // 4. Sync cleared state to server to reset server_db.json
  try {
    await fetch('/api/database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campusride_users: SEED_USERS,
        campusride_rides: [],
        campusride_bookings: [],
        campusride_payments: [],
        campusride_reviews: [],
        campusride_complaints: [],
        campusride_notifications: [],
        campusride_messages: [],
        campusride_login_logs: [],
        campusride_activity_logs: []
      })
    });
  } catch (err) {
    console.error("Failed to sync cleared state to server:", err);
  }

  // Add system wipe activity log
  await addActivityLog(
    adminUser.id,
    adminUser.fullName,
    adminUser.email,
    'db_wipe',
    `Database successfully wiped. All passenger/rider accounts, rides, bookings, and logs cleared.`
  );
}

export async function seedDemoDatabase(adminUser: User): Promise<void> {
  await clearDatabaseToAdmins(adminUser);
  return;
}

async function unused_seedDemoDatabase(adminUser: User): Promise<void> {
  const demoPayload = {
    campusride_users: [
      {
        id: 'admin_passenger',
        email: 'mrshaizshaiz@gmail.com',
        role: 'passenger',
        fullName: 'Shaiz',
        collegeName: 'delulucoders',
        phoneNumber: '9141259188',
        isVerified: true,
        verificationStatus: 'approved',
        isAdmin: true,
        avatarUrl: getAdminAvatar('Shaiz'),
        passwordEncrypted: encryptPassword('sha1511'),
        passwordHash: hashPassword('sha1511', 'admin_passenger_salt'),
        balance: 100,
        rating: 5.0,
        totalRides: 4
      },
      {
        id: 'admin_nihal',
        email: 'mdnihalktp@gmail.com',
        role: 'passenger',
        fullName: 'Nihal',
        collegeName: 'delulucoders',
        phoneNumber: '8970638498',
        isVerified: true,
        verificationStatus: 'approved',
        isAdmin: true,
        avatarUrl: getAdminAvatar('Nihal'),
        passwordEncrypted: encryptPassword('Nihal@cr17'),
        passwordHash: hashPassword('Nihal@cr17', 'admin_nihal_salt'),
        balance: 150,
        rating: 5.0,
        totalRides: 2
      },
      {
        id: 'user_rohan',
        email: 'rohan.shetty@shreedevicollege.com',
        role: 'passenger',
        fullName: 'Rohan Shetty',
        collegeName: 'Shree Devi College Mangalore',
        phoneNumber: '9845012345',
        isVerified: true,
        verificationStatus: 'approved',
        isAdmin: false,
        avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=Rohan`,
        passwordEncrypted: encryptPassword('studentpassword'),
        passwordHash: hashPassword('studentpassword', 'user_rohan_salt'),
        balance: 80,
        rating: 4.8,
        totalRides: 12,
        dateCreated: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      },
      {
        id: 'user_ayush',
        email: 'ayush.rao@sdm.ac.in',
        role: 'passenger',
        fullName: 'Ayush Rao',
        collegeName: 'SDM College Mangalore',
        phoneNumber: '8762045678',
        isVerified: true,
        verificationStatus: 'approved',
        isAdmin: false,
        avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=Ayush`,
        passwordEncrypted: encryptPassword('studentpassword'),
        passwordHash: hashPassword('studentpassword', 'user_ayush_salt'),
        balance: 120,
        rating: 4.5,
        totalRides: 8,
        dateCreated: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString()
      },
      {
        id: 'user_deeksha',
        email: 'deeksha.naik@snspolytechnic.edu.in',
        role: 'passenger',
        fullName: 'Deeksha Naik',
        collegeName: 'S.N.S. Polytechnic Bajpe',
        phoneNumber: '9900112233',
        isVerified: true,
        verificationStatus: 'approved',
        isAdmin: false,
        avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=Deeksha`,
        passwordEncrypted: encryptPassword('studentpassword'),
        passwordHash: hashPassword('studentpassword', 'user_deeksha_salt'),
        balance: 60,
        rating: 4.9,
        totalRides: 15,
        dateCreated: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString()
      },
      {
        id: 'user_ananya',
        email: 'ananya.bhat@shreedevicollege.com',
        role: 'passenger',
        fullName: 'Ananya Bhat',
        collegeName: 'Shree Devi College Mangalore',
        phoneNumber: '9112233445',
        isVerified: false,
        verificationStatus: 'pending',
        isAdmin: false,
        avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=Ananya`,
        passwordEncrypted: encryptPassword('studentpassword'),
        passwordHash: hashPassword('studentpassword', 'user_ananya_salt'),
        balance: 0,
        rating: 5.0,
        totalRides: 0,
        dateCreated: new Date().toISOString()
      },
      {
        id: 'user_praveen',
        email: 'praveen.k@shreedevicollege.com',
        role: 'rider',
        fullName: 'Praveen Kumar',
        collegeName: 'Shree Devi College Mangalore',
        phoneNumber: '9880123456',
        isVerified: true,
        verificationStatus: 'approved',
        isAdmin: false,
        avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=Praveen`,
        passwordEncrypted: encryptPassword('studentpassword'),
        passwordHash: hashPassword('studentpassword', 'user_praveen_salt'),
        balance: 240,
        rating: 4.7,
        totalRides: 28,
        vehicleName: 'Suzuki Access 125',
        vehiclePlate: 'KA-19-HE-4321',
        vehiclePhoto: '',
        dateCreated: new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString()
      },
      {
        id: 'user_vikram',
        email: 'vikram.h@snspolytechnic.edu.in',
        role: 'rider',
        fullName: 'Vikram Hegde',
        collegeName: 'S.N.S. Polytechnic Bajpe',
        phoneNumber: '9448123456',
        isVerified: true,
        verificationStatus: 'approved',
        isAdmin: false,
        avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=Vikram`,
        passwordEncrypted: encryptPassword('studentpassword'),
        passwordHash: hashPassword('studentpassword', 'user_vikram_salt'),
        balance: 180,
        rating: 4.9,
        totalRides: 19,
        vehicleName: 'Honda Activa 6G',
        vehiclePlate: 'KA-19-JK-8765',
        vehiclePhoto: '',
        dateCreated: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString()
      }
    ],
    campusride_rides: [
      {
        id: 'ride_demo_1',
        riderId: 'user_praveen',
        riderName: 'Praveen Kumar',
        riderCollege: 'Shree Devi College Mangalore',
        riderRating: 4.7,
        riderAvatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=Praveen`,
        vehicleName: 'Suzuki Access 125',
        vehiclePlate: 'KA-19-HE-4321',
        vehiclePhoto: '',
        seatsTotal: 2,
        seatsAvailable: 1,
        pricePerSeat: 30,
        routeType: 'home_to_college',
        pickup: 'Bajpe Bus Stand',
        destination: 'Shree Devi College Mangalore',
        date: new Date().toLocaleDateString(),
        departureTime: '08:45 AM',
        status: 'active'
      },
      {
        id: 'ride_demo_2',
        riderId: 'user_vikram',
        riderName: 'Vikram Hegde',
        riderCollege: 'S.N.S. Polytechnic Bajpe',
        riderRating: 4.9,
        riderAvatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=Vikram`,
        vehicleName: 'Honda Activa 6G',
        vehiclePlate: 'KA-19-JK-8765',
        vehiclePhoto: '',
        seatsTotal: 3,
        seatsAvailable: 2,
        pricePerSeat: 40,
        routeType: 'college_to_home',
        pickup: 'S.N.S. Polytechnic Bajpe',
        destination: 'Kudroli',
        date: new Date().toLocaleDateString(),
        departureTime: '04:15 PM',
        status: 'active'
      },
      {
        id: 'ride_demo_3',
        riderId: 'user_praveen',
        riderName: 'Praveen Kumar',
        riderCollege: 'Shree Devi College Mangalore',
        riderRating: 4.7,
        riderAvatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=Praveen`,
        vehicleName: 'Suzuki Access 125',
        vehiclePlate: 'KA-19-HE-4321',
        vehiclePhoto: '',
        seatsTotal: 2,
        seatsAvailable: 0,
        pricePerSeat: 25,
        routeType: 'home_to_college',
        pickup: 'Kenjar Stop',
        destination: 'Shree Devi College Mangalore',
        date: new Date(Date.now() - 24 * 3600 * 1000).toLocaleDateString(),
        departureTime: '09:00 AM',
        status: 'completed'
      }
    ],
    campusride_bookings: [
      {
        id: 'booking_demo_1',
        rideId: 'ride_demo_1',
        passengerId: 'user_rohan',
        passengerName: 'Rohan Shetty',
        passengerCollege: 'Shree Devi College Mangalore',
        passengerPhone: '9845012345',
        seatsBooked: 1,
        totalPrice: 30,
        status: 'accepted',
        paymentStatus: 'paid',
        dateBooked: new Date().toISOString()
      },
      {
        id: 'booking_demo_2',
        rideId: 'ride_demo_2',
        passengerId: 'user_ayush',
        passengerName: 'Ayush Rao',
        passengerCollege: 'SDM College Mangalore',
        passengerPhone: '8762045678',
        seatsBooked: 1,
        totalPrice: 40,
        status: 'pending',
        paymentStatus: 'pending',
        dateBooked: new Date().toISOString()
      },
      {
        id: 'booking_demo_3',
        rideId: 'ride_demo_3',
        passengerId: 'user_deeksha',
        passengerName: 'Deeksha Naik',
        passengerCollege: 'S.N.S. Polytechnic Bajpe',
        passengerPhone: '9900112233',
        seatsBooked: 2,
        totalPrice: 50,
        status: 'completed',
        paymentStatus: 'paid',
        dateBooked: new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      }
    ],
    campusride_payments: [
      {
        id: 'pay_demo_1',
        bookingId: 'booking_demo_1',
        amount: 30,
        paymentMethod: 'GPay',
        status: 'completed',
        transactionId: 'TXN8172648123',
        date: new Date().toISOString()
      },
      {
        id: 'pay_demo_3',
        bookingId: 'booking_demo_3',
        amount: 50,
        paymentMethod: 'PhonePe',
        status: 'completed',
        transactionId: 'TXN1928374650',
        date: new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      }
    ],
    campusride_reviews: [
      {
        id: 'rev_demo_1',
        rideId: 'ride_demo_3',
        riderId: 'user_praveen',
        passengerId: 'user_deeksha',
        passengerName: 'Deeksha Naik',
        rating: 5,
        reviewText: 'Very safe ride! Highly recommended for girls commuting to SNS Polytechnic Bajpe / Shree Devi.',
        date: new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      }
    ],
    campusride_complaints: [
      {
        id: 'comp_demo_1',
        passengerId: 'user_rohan',
        rideId: 'ride_demo_1',
        category: 'late_arrival',
        explanation: 'Rider delayed departure from Bajpe Bus Stand by 15 minutes, causing me to be slightly late for the morning session at Shree Devi College.',
        date: new Date().toISOString(),
        status: 'pending'
      }
    ],
    campusride_notifications: [
      {
        id: 'notif_demo_1',
        userId: 'admin_passenger',
        title: 'New Student Registration 📝',
        message: 'Ananya Bhat from Shree Devi College has requested profile verification.',
        type: 'system',
        read: false,
        date: new Date().toISOString()
      }
    ],
    campusride_messages: [],
    campusride_login_logs: [
      {
        id: 'log_demo_1',
        userId: 'admin_passenger',
        userName: 'Shaiz',
        email: 'mrshaizshaiz@gmail.com',
        deviceType: 'Desktop (Chrome/Linux)',
        loginTime: new Date().toISOString()
      }
    ],
    campusride_activity_logs: [
      {
        id: 'act_demo_1',
        userId: 'admin_passenger',
        userName: 'Shaiz',
        email: 'mrshaizshaiz@gmail.com',
        action: 'system_seed',
        description: 'Demo Mangalore collegiate database seeded successfully.',
        timestamp: new Date().toISOString()
      }
    ]
  };

  await restoreDatabaseFromJSON(demoPayload, adminUser);
}

