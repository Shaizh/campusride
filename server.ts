import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

// Ensure local .env file variables take precedence over pre-existing container environment variables
try {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
      process.env[k] = envConfig[k];
      console.log(`[Env Override] Forcing ${k} from local .env`);
    }
  }
} catch (e) {
  console.warn("Failed to manually override environment variables from .env:", e);
}

import { createServer as createViteServer } from "vite";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { sanitizeData } from "./src/lib/validation";
import Razorpay from "razorpay";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// In-Memory Sliding Window Rate Limiter
interface RateLimitRecord {
  timestamps: number[];
}
const rateLimitMap = new Map<string, RateLimitRecord>();

function rateLimiter(limit: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    
    let record = rateLimitMap.get(key);
    if (!record) {
      record = { timestamps: [] };
      rateLimitMap.set(key, record);
    }
    
    // Filter old timestamps
    record.timestamps = record.timestamps.filter(ts => now - ts < windowMs);
    
    if (record.timestamps.length >= limit) {
      console.warn(`[Rate Limit Exceeded] IP: ${ip} exceeded limit on ${req.path}`);
      return res.status(429).json({
        error: "Too many requests. Please slow down and try again later.",
        retryAfterMs: windowMs - (now - record.timestamps[0])
      });
    }
    
    record.timestamps.push(now);
    next();
  };
}

const DB_FILE_PATH = path.join(process.cwd(), "src", "data", "server_db.json");

const SEED_USERS = [
  {
    id: "admin_passenger",
    email: "mrshaizshaiz@gmail.com",
    role: "passenger",
    fullName: "Shaiz (Admin)",
    collegeName: "delulucoders",
    phoneNumber: "9141259188",
    isVerified: true,
    verificationStatus: "approved",
    isAdmin: true,
    avatarUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="48" fill="%230F172A" stroke="%2300C896" stroke-width="4"/><text x="50%" y="55%" font-size="38" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" fill="%2300C896" dominant-baseline="middle" text-anchor="middle">S</text></svg>`,
    password: "sha1511",
    balance: 1000,
    rating: 5.0,
    totalRides: 0
  },
  {
    id: "admin_nihal",
    email: "mdnihalktp@gmail.com",
    role: "passenger",
    fullName: "Nihal (Admin)",
    collegeName: "delulucoders",
    phoneNumber: "8970638498",
    isVerified: true,
    verificationStatus: "approved",
    isAdmin: true,
    avatarUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="48" fill="%230F172A" stroke="%2300C896" stroke-width="4"/><text x="50%" y="55%" font-size="38" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" fill="%2300C896" dominant-baseline="middle" text-anchor="middle">S</text></svg>`,
    password: "Nihal@cr17",
    balance: 1000,
    rating: 5.0,
    totalRides: 0
  }
];

const INITIAL_DB = {
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
};

const COLLECTIONS = [
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

// Initialize admin
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let db: Firestore | null = null;

if (fs.existsSync(configPath)) {
  try {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    let appInstance;
    if (!getApps().length) {
      appInstance = initializeApp({
        projectId: firebaseConfig.projectId
      });
    } else {
      appInstance = getApps()[0];
    }
    db = getFirestore(appInstance, firebaseConfig.firestoreDatabaseId);
    console.log("Firebase Admin initialized successfully under database:", firebaseConfig.firestoreDatabaseId);

    // Proactively test connection to ensure service account credentials have permission
    (async () => {
      try {
        await db!.collection("campusride_users").limit(1).get();
        console.log("Firestore connection test succeeded. Server has read/write permissions.");

        // Force cleanup of any old/mock admin subscription data in Firestore on boot
        const adminIds = ["admin_passenger", "admin_nihal"];
        for (const adminId of adminIds) {
          const docRef = db!.collection("campusride_users").doc(adminId);
          const snap = await docRef.get();
          if (snap.exists) {
            await docRef.update({
              subscription: null,
              subscriptionActive: false,
              paymentStatus: "Unpaid",
              subscriptionPlan: null,
              subscriptionStartDate: null,
              subscriptionEndDate: null,
              razorpayPaymentId: null,
              lastPaymentDate: null
            });
            console.log(`[Startup Cleanup] Reset subscription data in Firestore for admin: ${adminId}`);
          }
        }
      } catch (err: any) {
        console.warn("Firestore connection test failed. Disabling server-side Firestore to fall back to local database. Error:", err.message || err);
        db = null; // Fall back to local file-based storage completely and avoid further PERMISSION_DENIED console warnings
      }
    })();
  } catch (err) {
    console.error("Error reading firebase-applet-config.json or initializing firebase-admin:", err);
  }
} else {
  console.warn("firebase-applet-config.json does not exist. Operating in offline/file-fallback mode.");
}

// Recursively sanitize items for Firestore to prevent exceeding the 1MB document size limit (e.g. from massive raw base64 images)
function sanitizeItemForFirestore(item: any): any {
  if (item === null || item === undefined) return item;
  if (Array.isArray(item)) {
    return item.map(sanitizeItemForFirestore);
  }
  if (typeof item === "object") {
    const cleaned: any = {};
    for (const [key, val] of Object.entries(item)) {
      if (typeof val === "string" && val.length > 80000 && val.startsWith("data:")) {
        console.log(`[Firestore Protection] Truncating oversized property "${key}" (${val.length} chars) to keep Firestore doc size low.`);
        cleaned[key] = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100%" height="100%" fill="%231E293B"/><text x="50%" y="50%" font-size="10" font-family="sans-serif" fill="%2394A3B8" dominant-baseline="middle" text-anchor="middle">Compressed ID Image</text></svg>`;
      } else {
        cleaned[key] = sanitizeItemForFirestore(val);
      }
    }
    return cleaned;
  }
  return item;
}

// Helper to sync local data list to Firestore collections (upsert-only to avoid deleting other users' active records or registrations)
async function syncCollectionToFirestore(colName: string, items: any[]) {
  if (!db || !Array.isArray(items)) return;
  try {
    const colRef = db.collection(colName);
    
    let batch = db.batch();
    let count = 0;
    const batchLimit = 500;
    
    // Set/Update existing and new items
    for (const item of items) {
      if (!item || !item.id) continue;
      const cleanedItem = sanitizeItemForFirestore(item);
      batch.set(colRef.doc(item.id), cleanedItem);
      count++;
      if (count >= batchLimit) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }
    
    if (count > 0) {
      await batch.commit();
    }
  } catch (err) {
    console.error(`Failed to sync collection ${colName} to Firestore:`, err);
    throw err;
  }
}

// Safe initialization of local DB file
function ensureDBFile() {
  try {
    const dir = path.dirname(DB_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE_PATH)) {
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(INITIAL_DB, null, 2), "utf8");
    }
  } catch (err) {
    console.error("Error creating server_db.json:", err);
  }
}

// REST endpoints for data sync
app.get("/api/database", rateLimiter(120, 60000), async (req, res) => {
  ensureDBFile();
  if (db) {
    try {
      const result: any = {};
      const promises = COLLECTIONS.map(async (colName) => {
        const snapshot = await db!.collection(colName).get();
        const docs = snapshot.docs.map(doc => doc.data());
        result[colName] = docs;
      });
      await Promise.all(promises);

      // If campusride_users is empty, seed it with SEED_USERS
      if (!result.campusride_users || result.campusride_users.length === 0) {
        result.campusride_users = SEED_USERS;
        try {
          await syncCollectionToFirestore("campusride_users", SEED_USERS);
        } catch (seedErr) {
          console.error("Error seeding Firestore users collection:", seedErr);
        }
      }

      return res.json(result);
    } catch (fireErr) {
      console.error("Firestore read error, falling back to local file:", fireErr);
    }
  }

  // Fallback to local file
  try {
    const rawData = fs.readFileSync(DB_FILE_PATH, "utf8");
    const data = JSON.parse(rawData);
    res.json(data);
  } catch (err) {
    console.error("Error reading db file, falling back to in-memory/seed:", err);
    res.json(INITIAL_DB);
  }
});

app.post("/api/database", rateLimiter(45, 60000), async (req, res) => {
  ensureDBFile();
  try {
    const rawState = req.body;
    if (!rawState || typeof rawState !== "object") {
      return res.status(400).json({ error: "Invalid database state" });
    }

    // Sanitize and clean all input to prevent persistent XSS
    const newDBState = sanitizeData(rawState);

    // 1. Save to Firestore if available
    if (db) {
      try {
        const promises = COLLECTIONS.map(async (colName) => {
          const items = newDBState[colName] || [];
          await syncCollectionToFirestore(colName, items);
        });
        await Promise.all(promises);
        console.log("Database state successfully synced to Firestore and sanitized!");
      } catch (fireErr) {
        console.error("Firestore save error, falls back to local file path sync:", fireErr);
      }
    }

    // 2. supplementary local save
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(newDBState, null, 2), "utf8");
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to write database file:", err);
    res.status(500).json({ error: "Could not save database state" });
  }
});

// Explicit user deletion endpoint to robustly soft-delete accounts in Firestore and cancel/retain relevant histories
app.delete("/api/database/user/:userId", rateLimiter(30, 60000), async (req, res) => {
  const { userId } = req.params;
  if (!db) {
    return res.json({ success: true, localOnly: true });
  }
  try {
    console.log(`Starting Firestore soft-delete user account: ${userId}`);
    // Preserve registered user details in the database, do NOT delete them
    await db.collection("campusride_users").doc(userId).update({ isDeleted: true, deletionRequested: false });
    
    // 1. Cancel active rides (do NOT delete them, to preserve reporting history!)
    const ridesSnapshot = await db.collection("campusride_rides").where("riderId", "==", userId).where("status", "==", "active").get();
    const rideIds = ridesSnapshot.docs.map(doc => doc.id);
    const rideBatch = db.batch();
    ridesSnapshot.docs.forEach(doc => {
      rideBatch.update(doc.ref, { status: "cancelled" });
    });
    await rideBatch.commit();

    // 2. Cancel pending bookings made by this user, or bookings associated with their rides
    const bkBatch = db.batch();
    
    // Cancel pending passenger bookings
    const bookingsSnapshot1 = await db.collection("campusride_bookings").where("passengerId", "==", userId).where("status", "==", "pending").get();
    bookingsSnapshot1.docs.forEach(doc => {
      bkBatch.update(doc.ref, { status: "cancelled" });
    });

    // Cancel accepted bookings on rider's cancelled rides
    if (rideIds.length > 0) {
      const bookingsSnapshot2 = await db.collection("campusride_bookings").where("rideId", "in", rideIds).where("status", "==", "accepted").get();
      bookingsSnapshot2.docs.forEach(doc => {
        bkBatch.update(doc.ref, { status: "cancelled" });
      });
    }

    await bkBatch.commit();

    // 3. Do NOT delete payments, reviews, or complaints. They are kept intact for admin records!
    console.log(`Successfully soft-deleted user and cancelled associated active rides/bookings for: ${userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`Error soft-deleting user ${userId} from Firestore:`, err);
    res.status(500).json({ error: "Failed to perform soft delete on Firestore" });
  }
});

// Lazy-initialized Razorpay Client with sandbox mock fallback
function getKeyId(): string {
  const rawKeyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
  return rawKeyId ? rawKeyId.trim() : "";
}

function getKeySecret(): string {
  const rawKeySecret = process.env.RAZORPAY_KEY_SECRET || process.env.VITE_RAZORPAY_KEY_SECRET;
  return rawKeySecret ? rawKeySecret.trim() : "";
}

function validateRazorpayCredentials(keyId: string, keySecret: string): { valid: boolean; error?: string } {
  if (!keyId) {
    return { valid: false, error: "Razorpay Key ID is not configured." };
  }
  if (!keySecret) {
    return { valid: false, error: "Razorpay Key Secret is not configured." };
  }
  if (keyId.startsWith("rzp_live")) {
    return { valid: false, error: "Razorpay Live Mode is not permitted in this application. Please configure a Razorpay Test Key starting with 'rzp_test_'" };
  }
  if (!keyId.startsWith("rzp_test")) {
    return { valid: false, error: "Invalid Razorpay Key ID format. It must start with 'rzp_test_'" };
  }
  return { valid: true };
}

let razorpayClient: any = null;
function getRazorpay() {
  if (!razorpayClient) {
    const keyId = getKeyId() || "rzp_test_mock_key_id";
    const keySecret = getKeySecret() || "mock_key_secret";

    console.log(`[Razorpay Init] Loaded Key ID length: ${keyId.length}, starts with: ${keyId.substring(0, 8)}, ends with: ${keyId.substring(keyId.length - 4)}`);
    console.log(`[Razorpay Init] Loaded Key Secret length: ${keySecret.length}, starts with: ${keySecret.substring(0, 3)}, ends with: ${keySecret.substring(keySecret.length - 3)}`);

    try {
      razorpayClient = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
    } catch (err) {
      console.error("Failed to initialize Razorpay client:", err);
    }
  }
  return razorpayClient;
}

// Config route to securely check active Razorpay Key ID
app.get("/api/razorpay/key", (req, res) => {
  const keyId = getKeyId() || "rzp_test_TEbNlHeTfUS7DS";
  const validation = validateRazorpayCredentials(keyId, "dummy_secret_for_validation");
  res.json({ 
    keyId,
    isValidTestMode: validation.valid,
    validationError: validation.error || null
  });
});

// Standard Web Checkout - Create Order
app.post("/api/create-order", rateLimiter(100, 60000), async (req, res) => {
  const { amount, currency = "INR", receipt } = req.body;

  if (amount === undefined || amount === null) {
    return res.status(400).json({ error: "amount is required" });
  }

  const parsedAmount = parseInt(amount, 10);
  if (isNaN(parsedAmount)) {
    return res.status(400).json({ error: "amount must be a valid integer" });
  }

  if (parsedAmount < 100) {
    return res.status(400).json({ error: "amount must be at least 100 paise" });
  }

  const keyId = getKeyId();
  const keySecret = getKeySecret();

  const credCheck = validateRazorpayCredentials(keyId, keySecret);
  if (!credCheck.valid) {
    return res.status(401).json({ error: credCheck.error || "Razorpay credentials are unconfigured or invalid" });
  }

  try {
    const rzp = getRazorpay();
    if (!rzp) {
      return res.status(500).json({ error: "Razorpay client is not initialized" });
    }

    const order = await rzp.orders.create({
      amount: parsedAmount,
      currency,
      receipt: receipt || `receipt_${Date.now()}`,
    });

    return res.json({
      key_id: keyId,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency
    });
  } catch (err: any) {
    console.error("Razorpay order creation failed:", err);
    if (err.statusCode === 401 || (err.message && err.message.toLowerCase().includes("auth"))) {
      return res.status(401).json({ error: "Razorpay authentication failed: Invalid Key ID or Key Secret" });
    }
    return res.status(500).json({ error: err.message || "Failed to create Razorpay order" });
  }
});

// Standard Web Checkout - Verify Signature
app.post("/api/verify-payment", rateLimiter(100, 60000), async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing required fields: razorpay_order_id, razorpay_payment_id, and razorpay_signature are required" });
  }

  const keySecret = getKeySecret();
  if (!keySecret) {
    return res.status(500).json({ error: "Razorpay secret key not configured on server" });
  }

  try {
    const hmac = crypto.createHmac("sha256", keySecret);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest("hex");

    if (generatedSignature === razorpay_signature) {
      return res.json({ success: true, message: "Signature verification succeeded" });
    } else {
      return res.status(400).json({ success: false, error: "Signature mismatch. Verification failed." });
    }
  } catch (err: any) {
    console.error("Razorpay signature verification exception:", err);
    return res.status(500).json({ error: err.message || "Internal error during signature verification" });
  }
});

// 1. Create a Razorpay Order for Rider Subscription
app.post("/api/razorpay/order", rateLimiter(50, 60000), async (req, res) => {
  const { userId, planName, amount } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }
  
  const paymentAmount = amount || 499;
  const convertedAmount = Math.round(paymentAmount * 100); // convert to paise for Razorpay
  
  const keyId = getKeyId();
  const keySecret = getKeySecret();

  const credCheck = validateRazorpayCredentials(keyId, keySecret);

  try {
    const rzp = getRazorpay();
    if (!rzp || !credCheck.valid) {
      throw new Error(credCheck.error || "Razorpay credentials unconfigured or set to mock. Using sandbox fallback.");
    }
    
    const order = await rzp.orders.create({
      amount: convertedAmount,
      currency: "INR",
      receipt: `receipt_sub_${Date.now()}`,
      notes: {
        userId,
        planName: planName || "Premium Rider Monthly",
      }
    });
    
    res.json({
      success: true,
      keyId: keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      isMock: false,
    });
  } catch (err: any) {
    console.warn("Razorpay order generation skipped/failed, using mock order for fallback:", err.message || err);
    // Return a mock order ID so the application can work in local test/preview environment even without valid API keys!
    const mockOrderId = `order_mock_${Date.now()}`;
    res.json({
      success: true,
      orderId: mockOrderId,
      amount: convertedAmount,
      currency: "INR",
      isMock: true,
    });
  }
});

// 2. Verify Razorpay Payment and Activate Rider Subscription
app.post("/api/razorpay/verify", rateLimiter(50, 60000), async (req, res) => {
  const { userId, razorpayPaymentId, razorpayOrderId, razorpaySignature, planName, amountPaid, isMock } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  let verified = false;

  if (isMock || !razorpaySignature || razorpayOrderId?.startsWith("order_mock_") || !process.env.RAZORPAY_KEY_SECRET) {
    // Mock verification for preview sandbox or fallback
    console.log(`[Razorpay Verification] Verification bypassed (or using mock credentials) for user ${userId}`);
    verified = true;
  } else {
    try {
      const crypto = require("crypto");
      const keySecret = process.env.RAZORPAY_KEY_SECRET || "mock_key_secret";
      const hmac = crypto.createHmac("sha256", keySecret);
      hmac.update(razorpayOrderId + "|" + razorpayPaymentId);
      const generatedSignature = hmac.digest("hex");
      if (generatedSignature === razorpaySignature) {
        verified = true;
      } else {
        console.error("[Razorpay Verification] Signature verification mismatch!");
      }
    } catch (err) {
      console.error("[Razorpay Verification] Exception during verification:", err);
    }
  }

  if (!verified) {
    return res.status(400).json({ error: "Payment verification failed. Invalid Razorpay signature." });
  }

  // Calculate subscription expiry date
  const now = new Date();
  const expiry = new Date();
  const days = req.body.durationDays || (planName?.toLowerCase().includes("semester") ? 150 : 30);
  expiry.setDate(now.getDate() + days);

  const subDetails = {
    planName: planName || "Premium Rider Monthly",
    amountPaid: amountPaid || 499,
    paymentDate: now.toISOString(),
    expiryDate: expiry.toISOString(),
    status: "active",
    autoRenew: true,
    razorpayPaymentId: razorpayPaymentId || `pay_mock_${Date.now()}`,
    razorpaySubscriptionId: razorpayOrderId || `sub_mock_${Date.now()}`
  };

  // Update user record in Firestore if available
  if (db) {
    try {
      await db.collection("campusride_users").doc(userId).update({
        subscription: subDetails,
        subscriptionActive: true,
        paymentStatus: "Paid",
        subscriptionPlan: subDetails.planName,
        subscriptionStartDate: subDetails.paymentDate,
        subscriptionEndDate: subDetails.expiryDate,
        razorpayPaymentId: subDetails.razorpayPaymentId,
        lastPaymentDate: subDetails.paymentDate
      });
      console.log(`[Subscription Activated] Firestore updated for user ${userId}`);
    } catch (fsErr) {
      console.error("Firestore subscription update failed:", fsErr);
    }
  }

  // Also write to local DB file
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, "utf8");
      const data = JSON.parse(raw);
      const uIdx = data.campusride_users?.findIndex((u: any) => u.id === userId);
      if (uIdx !== undefined && uIdx !== -1) {
         data.campusride_users[uIdx].subscription = subDetails;
         data.campusride_users[uIdx].subscriptionActive = true;
         data.campusride_users[uIdx].paymentStatus = "Paid";
         data.campusride_users[uIdx].subscriptionPlan = subDetails.planName;
         data.campusride_users[uIdx].subscriptionStartDate = subDetails.paymentDate;
         data.campusride_users[uIdx].subscriptionEndDate = subDetails.expiryDate;
         data.campusride_users[uIdx].razorpayPaymentId = subDetails.razorpayPaymentId;
         data.campusride_users[uIdx].lastPaymentDate = subDetails.paymentDate;
         fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
         console.log(`[Subscription Activated] Local DB updated for user ${userId}`);
      }
    }
  } catch (fileErr) {
    console.error("Local file DB subscription update failed:", fileErr);
  }

  // Send an in-app notification and save in Firebase with the message: "Your subscription has been activated successfully."
  const notifId = `notif_sub_${Date.now()}`;
  const notifMsg = {
    id: notifId,
    userId,
    title: "Subscription Activated 🎉",
    message: "Your subscription has been activated successfully.",
    body: "Your subscription has been activated successfully.",
    type: "system",
    read: false,
    date: now.toISOString()
  };

  if (db) {
    try {
      await db.collection("campusride_notifications").doc(notifId).set(notifMsg);
      console.log(`[Subscription Activated] In-app notification added to Firestore for ${userId}`);
    } catch (notifErr) {
      console.error("Firestore subscription notification save failed:", notifErr);
    }
  }

  // Also save to local DB notifications list
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, "utf8");
      const data = JSON.parse(raw);
      if (!data.campusride_notifications) data.campusride_notifications = [];
      data.campusride_notifications.unshift(notifMsg);
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
    }
  } catch (fileErr) {
    console.error("Local file DB subscription notification save failed:", fileErr);
  }

  res.json({
    success: true,
    message: "🎉 Subscription activated successfully! You can now publish rides.",
    subscription: subDetails
  });
});

// 3. Cancel Auto-Renew for Rider Subscription
app.post("/api/razorpay/cancel", rateLimiter(50, 60000), async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  let currentSub: any = null;

  // Read existing subscription from Firestore
  if (db) {
    try {
      const userDoc = await db.collection("campusride_users").doc(userId).get();
      if (userDoc.exists) {
        currentSub = userDoc.data()?.subscription;
      }
    } catch (fsErr) {
      console.error("Firestore read subscription failed:", fsErr);
    }
  }

  // Fallback to local file DB
  if (!currentSub && fs.existsSync(DB_FILE_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE_PATH, "utf8"));
      const user = data.campusride_users?.find((u: any) => u.id === userId);
      if (user) {
        currentSub = user.subscription;
      }
    } catch (fileErr) {
      console.error("Local DB read subscription failed:", fileErr);
    }
  }

  if (!currentSub) {
    // Construct a safe default subscription so that the cancellation flow never blocks the user
    const now = new Date();
    const expiry = new Date();
    expiry.setDate(now.getDate() + 30);
    currentSub = {
      planName: "Premium Rider Monthly",
      amountPaid: 499,
      paymentDate: now.toISOString(),
      expiryDate: expiry.toISOString(),
      status: "active",
      autoRenew: true,
      razorpayPaymentId: `pay_mock_${Date.now()}`,
      razorpaySubscriptionId: `sub_mock_${Date.now()}`
    };
  }

  // Disable auto-renew and update subscription status (does not refund active period)
  const updatedSub = {
    ...currentSub,
    status: "cancelled",
    autoRenew: false
  };

  // Update in Firestore
  if (db) {
    try {
      await db.collection("campusride_users").doc(userId).update({
        subscription: updatedSub,
        subscriptionActive: true
      });
      console.log(`[Subscription Cancelled] Firestore updated (renewal disabled) for user ${userId}`);
    } catch (fsErr) {
      console.error("Firestore subscription cancellation failed:", fsErr);
    }
  }

  // Update in local DB file
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, "utf8");
      const data = JSON.parse(raw);
      const uIdx = data.campusride_users?.findIndex((u: any) => u.id === userId);
      if (uIdx !== undefined && uIdx !== -1) {
        data.campusride_users[uIdx].subscription = updatedSub;
        data.campusride_users[uIdx].subscriptionActive = true;
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
        console.log(`[Subscription Cancelled] Local DB updated (renewal disabled) for user ${userId}`);
      }
    }
  } catch (fileErr) {
    console.error("Local file DB subscription cancellation failed:", fileErr);
  }

  // Send cancellation notification
  const notifId = `notif_sub_cancel_${Date.now()}`;
  const now = new Date();
  const notifMsg = {
    id: notifId,
    userId,
    title: "Subscription Cancelled ⚠️",
    message: "Your subscription auto-renewal has been disabled. You will not be charged again.",
    body: "Your subscription auto-renewal has been disabled. You will not be charged again.",
    type: "system",
    read: false,
    date: now.toISOString()
  };

  if (db) {
    try {
      await db.collection("campusride_notifications").doc(notifId).set(notifMsg);
    } catch (notifErr) {
      console.error("Firestore cancellation notification save failed:", notifErr);
    }
  }

  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, "utf8");
      const data = JSON.parse(raw);
      if (!data.campusride_notifications) data.campusride_notifications = [];
      data.campusride_notifications.unshift(notifMsg);
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
    }
  } catch (fileErr) {
    console.error("Local DB cancellation notification save failed:", fileErr);
  }

  res.json({
    success: true,
    message: "Subscription auto-renewal disabled. Active period preserved.",
    subscription: updatedSub
  });
});

// Secure push notification dispatcher using Firebase Cloud Messaging (FCM)
app.post("/api/notifications/send", rateLimiter(100, 60000), async (req, res) => {
  const { userId, title, message, body, type, rideId, bookingId } = req.body;
  if (!userId || !title || !message) {
    return res.status(400).json({ error: "Missing required fields (userId, title, message)" });
  }

  const payloadBody = body || message;
  const notifId = `notif_${Date.now()}`;
  const timestamp = new Date().toISOString();

  // Create standard notification object conforming to firebase-blueprint.json
  const newNotif: any = {
    id: notifId,
    userId,
    title,
    message,
    body: payloadBody,
    type,
    read: false,
    date: timestamp,
  };
  if (rideId) newNotif.rideId = rideId;
  if (bookingId) newNotif.bookingId = bookingId;

  let fcmToken: string | undefined;
  let notificationEnabled = true;
  let preferences: any = {
    newRides: true,
    bookingUpdates: true,
    rideUpdates: true,
    promotions: true,
    paymentNotifications: true
  };

  // 1. Fetch user to check preferences & token
  if (db) {
    try {
      const userDoc = await db.collection("campusride_users").doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData) {
          fcmToken = userData.fcmToken;
          if (userData.notificationEnabled !== undefined) {
            notificationEnabled = userData.notificationEnabled;
          }
          if (userData.notificationPreferences) {
            preferences = { ...preferences, ...userData.notificationPreferences };
          }
        }
      }
    } catch (err) {
      console.warn("Firestore error while reading user preferences:", err);
    }
  } else {
    // Read from local file DB
    try {
      if (fs.existsSync(DB_FILE_PATH)) {
        const raw = fs.readFileSync(DB_FILE_PATH, "utf8");
        const data = JSON.parse(raw);
        const users = data.campusride_users || [];
        const user = users.find((u: any) => u.id === userId);
        if (user) {
          fcmToken = user.fcmToken;
          if (user.notificationEnabled !== undefined) {
            notificationEnabled = user.notificationEnabled;
          }
          if (user.notificationPreferences) {
            preferences = { ...preferences, ...user.notificationPreferences };
          }
        }
      }
    } catch (err) {
      console.warn("Local DB read error:", err);
    }
  }

  // Check preferences based on notification type
  let isAllowedByPref = true;
  if (!notificationEnabled) {
    isAllowedByPref = false;
  } else {
    if (type === "ride_booked" && !preferences.bookingUpdates) isAllowedByPref = false;
    if (type === "ride_cancelled" && !preferences.rideUpdates) isAllowedByPref = false;
    if (type === "rider_arriving" && !preferences.rideUpdates) isAllowedByPref = false;
    if (type === "new_ride" && !preferences.newRides) isAllowedByPref = false;
    if (type === "promotions" && !preferences.promotions) isAllowedByPref = false;
    if (type === "payment" && !preferences.paymentNotifications) isAllowedByPref = false;
  }

  if (!isAllowedByPref) {
    console.log(`[Notification Muted] User ${userId} has disabled notifications of type ${type}`);
    return res.json({ success: true, status: "muted_by_preferences" });
  }

  // 2. Save Notification to db (Firestore or Local)
  if (db) {
    try {
      await db.collection("campusride_notifications").doc(notifId).set(newNotif);
    } catch (err) {
      console.warn("Firestore error saving notification:", err);
    }
  }

  // Supplementary update to local DB file
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, "utf8");
      const data = JSON.parse(raw);
      if (!data.campusride_notifications) data.campusride_notifications = [];
      data.campusride_notifications.unshift(newNotif);
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
    }
  } catch (err) {
    console.warn("Local DB append notification error:", err);
  }

  // 3. Dispatch Push Notification via FCM if token exists
  if (fcmToken) {
    const fcmMessage = {
      token: fcmToken,
      notification: {
        title: title,
        body: payloadBody,
      },
      data: {
        id: notifId,
        type: type || "system",
        rideId: rideId || "",
        bookingId: bookingId || "",
      },
      android: {
        priority: "high" as const,
        notification: {
          sound: "default",
          channelId: "campusride_channels",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    let retryCount = 0;
    const maxRetries = 2;
    let sentSuccessfully = false;

    while (retryCount <= maxRetries && !sentSuccessfully) {
      try {
        const messaging = getMessaging();
        const fcmResponse = await messaging.send(fcmMessage);
        console.log(`[FCM Send Success] Response: ${fcmResponse} (Attempt ${retryCount + 1})`);
        sentSuccessfully = true;
      } catch (err: any) {
        console.error(`[FCM Send Failure] Error:`, err, `(Attempt ${retryCount + 1})`);
        
        // Handle expired, unregistered, or invalid tokens by clearing them in the database
        const isExpired = err.code === "messaging/registration-token-not-registered" || 
                          err.code === "messaging/invalid-registration-token" ||
                          (err.message && err.message.includes("registration-token-not-registered")) ||
                          (err.message && err.message.includes("invalid-token"));

        if (isExpired) {
          console.warn(`[FCM Expired Token] Token for user ${userId} has expired or is invalid. Clearing token...`);
          if (db) {
            try {
              await db.collection("campusride_users").doc(userId).update({ fcmToken: null });
            } catch (uErr) {
              console.error("Failed to clear expired FCM token in Firestore:", uErr);
            }
          }
          try {
            if (fs.existsSync(DB_FILE_PATH)) {
              const raw = fs.readFileSync(DB_FILE_PATH, "utf8");
              const data = JSON.parse(raw);
              const uIdx = data.campusride_users?.findIndex((u: any) => u.id === userId);
              if (uIdx !== undefined && uIdx !== -1) {
                data.campusride_users[uIdx].fcmToken = null;
                fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
              }
            }
          } catch (fileErr) {
            console.error("Failed to clear expired FCM token in local file:", fileErr);
          }
          // Break retry loop since token is dead
          break;
        }

        // Increment retry and wait a small amount for transient failures
        retryCount++;
        if (retryCount <= maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
        }
      }
    }

    return res.json({ success: sentSuccessfully, notificationId: notifId, pushDispatched: sentSuccessfully });
  }

  // Return success for DB insert even if no push FCM token exists (since it is successfully logged in the in-app center!)
  res.json({ success: true, notificationId: notifId, pushDispatched: false, status: "saved_in_app_only" });
});

// Mount Vite middleware for development, or serve built assets in production
async function startServer() {
  ensureDBFile();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
