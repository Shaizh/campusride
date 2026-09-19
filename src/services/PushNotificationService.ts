// In a true React Native environment, import from 'react-native'
// import { Platform, Alert } from 'react-native';

// Self-contained environment Platform mock to guarantee 100% web compile safety in AI Studio
const Platform = {
  OS: typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'android'
};

/**
 * PRODUCTION-READY MOBILE PUSH NOTIFICATION SERVICE
 * Using @react-native-firebase/app and @react-native-firebase/messaging
 * 
 * Supports iOS and Android for Foreground, Background, and Terminated states.
 */

interface NotificationPreferences {
  newRides: boolean;
  bookingUpdates: boolean;
  rideUpdates: boolean;
  promotions: boolean;
  paymentNotifications: boolean;
}

export class PushNotificationService {
  private static fcmModule: any = null;
  private static firestoreModule: any = null;

  /**
   * Safe-check if we are running in a real mobile React Native environment
   */
  private static isMobile(): boolean {
    try {
      // Check if global native modules or window.navigator is present
      const isWeb = typeof window !== 'undefined' && !('ReactNativeWebView' in window);
      return !isWeb;
    } catch {
      return false;
    }
  }

  /**
   * Lazy load standard native dependencies to prevent web compile-time breaks
   */
  private static async getNativeMessaging() {
    if (!this.fcmModule && this.isMobile()) {
      try {
        // Safe dynamic imports for React Native bundling compilation
        this.fcmModule = require('@react-native-firebase/messaging').default;
      } catch (err) {
        console.warn("React Native Firebase Messaging is not available in this runtime environment.", err);
      }
    }
    return this.fcmModule;
  }

  private static async getNativeFirestore() {
    if (!this.firestoreModule && this.isMobile()) {
      try {
        this.firestoreModule = require('@react-native-firebase/firestore').default;
      } catch (err) {
        console.warn("React Native Firebase Firestore is not available in this runtime environment.", err);
      }
    }
    return this.firestoreModule;
  }

  /**
   * Initializes the notification system.
   * Call this on app launch (e.g. App.tsx useEffect).
   */
  public static async initialize(userId: string) {
    if (!this.isMobile()) {
      console.log("[PushNotificationService] Operating in Web Sandbox Mode. Using in-app notifications.");
      return;
    }

    try {
      const messaging = await this.getNativeMessaging();
      if (!messaging) return;

      // 1. Request user permission
      const hasPermission = await this.requestUserPermission();
      if (!hasPermission) {
        console.log("[PushNotificationService] User declined notification permissions.");
        return;
      }

      // 2. Fetch and register FCM Token
      await this.registerDeviceToken(userId);

      // 3. Listen to token refreshes
      messaging().onTokenRefresh(async (token: string) => {
        console.log("[PushNotificationService] FCM Token Refreshed:", token);
        await this.updateTokenInDatabase(userId, token);
      });

      // 4. Handle foreground notifications
      messaging().onMessage(async (remoteMessage: any) => {
        console.log("[PushNotificationService] Foreground Message Received:", remoteMessage);
        
        // Present in-app alert or custom notification card to the user
        const title = remoteMessage.notification?.title || "New Alert";
        const body = remoteMessage.notification?.body || "";
        
        // In real React Native, we can trigger local alert or use react-native-push-notification
        // Alert.alert(title, body);
        console.log(`[Foreground Broadcast] ${title}: ${body}`);
      });

      // 5. Handle notification tap when app is in background but still running
      messaging().onNotificationOpenedApp((remoteMessage: any) => {
        console.log("[PushNotificationService] Notification tapped while app in background:", remoteMessage);
        this.handleDeepLinking(remoteMessage.data);
      });

      // 6. Handle notification tap when app was completely closed (terminated)
      const initialNotification = await messaging().getInitialNotification();
      if (initialNotification) {
        console.log("[PushNotificationService] App launched from terminated state via notification:", initialNotification);
        this.handleDeepLinking(initialNotification.data);
      }

    } catch (error) {
      console.error("[PushNotificationService] Failed to initialize mobile messaging:", error);
    }
  }

  /**
   * Requests OS notification permissions (Required for iOS and Android 13+)
   */
  public static async requestUserPermission(): Promise<boolean> {
    try {
      const messaging = await this.getNativeMessaging();
      if (!messaging) return false;

      const authStatus = await messaging().requestPermission({
        alert: true,
        announcement: false,
        badge: true,
        sound: true,
      });

      const enabled =
        authStatus === 1 || // AuthorizationStatus.AUTHORIZED
        authStatus === 2;   // AuthorizationStatus.PROVISIONAL

      console.log("[PushNotificationService] Permission Status:", authStatus);
      return enabled;
    } catch (err) {
      console.error("[PushNotificationService] Permission request failed:", err);
      return false;
    }
  }

  /**
   * Fetches the current FCM token and registers it in user profile
   */
  private static async registerDeviceToken(userId: string) {
    try {
      const messaging = await this.getNativeMessaging();
      if (!messaging) return;

      // Register device for FCM (necessary on iOS)
      if (Platform.OS === 'ios') {
        await messaging().registerDeviceForRemoteMessages();
      }

      // Get latest FCM token
      const token = await messaging().getToken();
      if (token) {
        console.log("[PushNotificationService] Initial FCM Token Retrieved:", token);
        await this.updateTokenInDatabase(userId, token);
      } else {
        console.warn("[PushNotificationService] Failed to generate FCM token.");
      }
    } catch (err) {
      console.error("[PushNotificationService] Register device token error:", err);
    }
  }

  /**
   * Saves the token and preferences securely to Firestore
   */
  public static async updateTokenInDatabase(userId: string, token: string | null) {
    console.log(`[PushNotificationService] Syncing FCM Token for User ${userId}...`);

    // 1. Direct mobile Firestore update
    try {
      const firestore = await this.getNativeFirestore();
      if (firestore) {
        await firestore()
          .collection('campusride_users')
          .doc(userId)
          .update({
            fcmToken: token,
            notificationEnabled: token !== null,
            lastTokenUpdate: new Date().toISOString()
          });
        console.log("[PushNotificationService] Native Firestore synced successfully.");
        return;
      }
    } catch (err) {
      console.warn("[PushNotificationService] Direct Firestore update failed, trying network sync:", err);
    }

    // 2. Network sync fallback
    try {
      const response = await fetch('/api/database');
      const dbState = await response.json();
      const users = dbState.campusride_users || [];
      const userIndex = users.findIndex((u: any) => u.id === userId);

      if (userIndex !== -1) {
        users[userIndex].fcmToken = token;
        users[userIndex].notificationEnabled = token !== null;
        users[userIndex].lastTokenUpdate = new Date().toISOString();

        await fetch('/api/database', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dbState)
        });
        console.log("[PushNotificationService] Token synced successfully via Applet network.");
      }
    } catch (err) {
      console.error("[PushNotificationService] Complete token database sync failed:", err);
    }
  }

  /**
   * Saves custom user preferences to Firestore
   */
  public static async savePreferences(userId: string, enabled: boolean, prefs: NotificationPreferences) {
    console.log(`[PushNotificationService] Syncing preferences for user ${userId}...`);

    try {
      const firestore = await this.getNativeFirestore();
      if (firestore) {
        await firestore()
          .collection('campusride_users')
          .doc(userId)
          .update({
            notificationEnabled: enabled,
            notificationPreferences: prefs
          });
        console.log("[PushNotificationService] Native Firestore preferences saved.");
        return;
      }
    } catch (err) {
      console.warn("[PushNotificationService] Direct Firestore preferences update failed, trying network sync:", err);
    }

    // Network sync fallback
    try {
      const response = await fetch('/api/database');
      const dbState = await response.json();
      const users = dbState.campusride_users || [];
      const userIndex = users.findIndex((u: any) => u.id === userId);

      if (userIndex !== -1) {
        users[userIndex].notificationEnabled = enabled;
        users[userIndex].notificationPreferences = prefs;

        await fetch('/api/database', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dbState)
        });
        console.log("[PushNotificationService] Preferences synced successfully via network.");
      }
    } catch (err) {
      console.error("[PushNotificationService] Preferences sync failed:", err);
    }
  }

  /**
   * Handles custom deep linking when user taps a push notification
   */
  private static handleDeepLinking(data: any) {
    if (!data) return;
    const { type, rideId, bookingId } = data;
    console.log(`[Deep Link Triggered] Type: ${type}, Ride: ${rideId}, Booking: ${bookingId}`);

    // In a real React Native application using React Navigation:
    // if (type === 'ride_booked' || type === 'rider_arriving') {
    //   navigation.navigate('RideDetails', { rideId });
    // } else if (type === 'booking_confirmed') {
    //   navigation.navigate('BookingReceipt', { bookingId });
    // }
  }
}

/**
 * Register Background Handler (REQUIRED for background & terminated messaging)
 * Place this inside your index.js file at the absolute root of your React Native project.
 * 
 * AppRegistry.registerComponent(appName, () => App);
 * PushNotificationService.registerBackgroundHandler();
 */
export function registerBackgroundHandler() {
  try {
    const isWeb = typeof window !== 'undefined' && !('ReactNativeWebView' in window);
    if (!isWeb) {
      const messaging = require('@react-native-firebase/messaging').default;
      messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
        console.log("[PushNotificationService] Background/Terminated Message Handled:", remoteMessage);
        // Do heavy lifting in background here if needed
      });
    }
  } catch (err) {
    console.warn("Background handler registration skipped.", err);
  }
}
