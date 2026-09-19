/**
 * Google AdMob Reusable Interstitial & Rewarded Ad Manager
 * Production-ready for Google Play Store (Android) & Apple App Store (iOS)
 * 
 * Supports both Native runtime environments (via react-native-google-mobile-ads)
 * and rich interactive web simulation inside AI Studio for high-fidelity testing.
 */

import mobileAds, {
  InterstitialAd,
  RewardedAd,
  TestIds,
  AdEventType,
  RewardedAdEventType
} from 'react-native-google-mobile-ads';

export interface AdMobConfigType {
  androidAppId: string;
  iosAppId: string;
  androidAdUnitId: string;
  iosAdUnitId: string;
  androidRewardedAdUnitId: string;
  iosRewardedAdUnitId: string;
  androidBannerAdUnitId: string;
  iosBannerAdUnitId: string;
  cooldownPeriodMs: number; // Cooldown duration between interstitial ads (e.g., 30 seconds)
  maxRetryAttempts: number;
}

export const ADMOB_CONFIG: AdMobConfigType = {
  androidAppId: 'ca-app-pub-3878668454113585~2880404657',
  iosAppId: 'ca-app-pub-3878668454113585~1297795444',
  androidAdUnitId: 'ca-app-pub-3878668454113585/9756804198',
  iosAdUnitId: 'ca-app-pub-3878668454113585/1842655159',
  androidRewardedAdUnitId: 'ca-app-pub-3878668454113585/5431804231',
  iosRewardedAdUnitId: 'ca-app-pub-3878668454113585/6542891244',
  androidBannerAdUnitId: 'ca-app-pub-3878668454113585/2130491856',
  iosBannerAdUnitId: 'ca-app-pub-3878668454113585/3241592867',
  cooldownPeriodMs: 30000, // 30-second security cooldown between ads
  maxRetryAttempts: 5
};

export type AdState = 'uninitialized' | 'initializing' | 'ready' | 'loading' | 'showing' | 'cooldown' | 'error';

export interface AdStatusUpdate {
  state: AdState;
  lastShownTimestamp: number;
  cooldownRemaining: number;
  error?: string;
}

type AdStatusListener = (status: AdStatusUpdate) => void;

class AdMobManagerService {
  private config = ADMOB_CONFIG;
  private state: AdState = 'uninitialized';
  private lastShownTimestamp = 0;
  private isAdLoaded = false;
  private isRewardedLoaded = false;
  private retryCount = 0;
  private rewardedRetryCount = 0;
  private listeners: Set<AdStatusListener> = new Set();
  private cooldownTimer: any = null;

  // Real AdMob Instance references
  private realInterstitial: InterstitialAd | null = null;
  private realRewarded: RewardedAd | null = null;

  // Registered callbacks
  private onInterstitialDismissed: (() => void) | null = null;
  private onRewardedDismissed: (() => void) | null = null;
  private onRewardedEarned: ((reward: { type: string; amount: number }) => void) | null = null;

  // Forbidden context list (Ads must NEVER show during these actions or screens)
  private forbiddenScreens = [
    'login',
    'registration',
    'booking_checkout',
    'live_tracking',
    'payment_active',
    'emergency_sos'
  ];

  constructor() {
    // Attempt automatic initialization at app startup
    this.initialize();
  }

  /**
   * Initializes Google Mobile Ads SDK
   */
  public async initialize(): Promise<void> {
    if (this.state !== 'uninitialized' && this.state !== 'error') return;

    this.updateState('initializing');
    console.log('[AdMob] Initializing Mobile Ads SDK...');
    console.log(`[AdMob] Configured Android App ID: ${this.config.androidAppId}`);
    console.log(`[AdMob] Configured iOS App ID: ${this.config.iosAppId}`);

    try {
      // Initialize the official Google Mobile Ads SDK
      const adapterStatuses = await mobileAds().initialize();
      console.log('[AdMob] Google Mobile Ads SDK Initialized successfully:', adapterStatuses);
      
      this.updateState('ready');
      
      // Warm up / preload ads in advance for instant delivery
      this.loadInterstitial();
      this.loadRewarded();
    } catch (err: any) {
      console.error('[AdMob] Failed to initialize Google Mobile Ads SDK:', err);
      this.updateState('error', err.message || String(err));
    }
  }

  /**
   * Preloads an Interstitial Ad in advance
   */
  public async loadInterstitial(): Promise<void> {
    if (this.state === 'showing' || this.isAdLoaded) return;

    this.updateState('loading');
    const adUnitId = this.getActiveAdUnitId();
    console.log(`[AdMob] Loading Interstitial Ad [Unit: ${adUnitId}]...`);

    try {
      // Create real interstitial instance
      this.realInterstitial = InterstitialAd.createForAdRequest(adUnitId, {
        requestNonPersonalizedAdsOnly: true,
      });

      // Register event listeners
      this.realInterstitial.addAdEventListener(AdEventType.LOADED, () => {
        this.isAdLoaded = true;
        this.retryCount = 0;
        this.updateState('ready');
        console.log('[AdMob] Interstitial Ad loaded successfully and ready.');
      });

      this.realInterstitial.addAdEventListener(AdEventType.ERROR, (error: any) => {
        this.isAdLoaded = false;
        this.updateState('error', error?.message || 'Interstitial ad failed to load');
        console.warn(`[AdMob] Interstitial loaded error:`, error);
        this.handleLoadFailure();
      });

      this.realInterstitial.addAdEventListener(AdEventType.CLOSED, () => {
        this.handleAdDismissed();
        if (this.onInterstitialDismissed) {
          this.onInterstitialDismissed();
          this.onInterstitialDismissed = null;
        }
      });

      // Start loading
      this.realInterstitial.load();
    } catch (err: any) {
      console.error('[AdMob] Exception during interstitial ad load:', err);
      this.handleLoadFailure();
    }
  }

  /**
   * Preloads a Rewarded Ad in advance
   */
  public async loadRewarded(): Promise<void> {
    if (this.isRewardedLoaded) return;

    const adUnitId = this.getActiveRewardedAdUnitId();
    console.log(`[AdMob] Loading Rewarded Ad [Unit: ${adUnitId}]...`);

    try {
      this.realRewarded = RewardedAd.createForAdRequest(adUnitId, {
        requestNonPersonalizedAdsOnly: true,
      });

      this.realRewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
        this.isRewardedLoaded = true;
        this.rewardedRetryCount = 0;
        console.log('[AdMob] Rewarded Ad loaded successfully and ready.');
      });

      this.realRewarded.addAdEventListener(AdEventType.ERROR, (error: any) => {
        this.isRewardedLoaded = false;
        console.warn(`[AdMob] Rewarded loaded error:`, error);
        this.handleRewardedLoadFailure();
      });

      this.realRewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward: any) => {
        console.log('[AdMob] Rewarded Ad user earned reward:', reward);
        if (this.onRewardedEarned) {
          this.onRewardedEarned({
            type: reward?.type || 'reward',
            amount: reward?.amount || 1
          });
        }
      });

      this.realRewarded.addAdEventListener(AdEventType.CLOSED, () => {
        this.isRewardedLoaded = false;
        // Preload the next rewarded ad
        this.loadRewarded();
        if (this.onRewardedDismissed) {
          this.onRewardedDismissed();
          this.onRewardedDismissed = null;
          this.onRewardedEarned = null;
        }
      });

      this.realRewarded.load();
    } catch (err: any) {
      console.error('[AdMob] Exception during rewarded ad load:', err);
      this.handleRewardedLoadFailure();
    }
  }

  /**
   * Retries loading an interstitial ad with exponential backoff
   */
  private handleLoadFailure(): void {
    if (this.retryCount >= this.config.maxRetryAttempts) {
      console.warn(`[AdMob] Max load retry attempts (${this.config.maxRetryAttempts}) reached for Interstitial. Holding.`);
      return;
    }

    this.retryCount++;
    const backoffTimeMs = Math.min(2000 * Math.pow(2, this.retryCount), 30000);
    console.log(`[AdMob] Retrying interstitial preloading in ${backoffTimeMs / 1000} seconds (Attempt ${this.retryCount}/${this.config.maxRetryAttempts})...`);
    
    setTimeout(() => {
      this.loadInterstitial();
    }, backoffTimeMs);
  }

  /**
   * Retries loading a rewarded ad with exponential backoff
   */
  private handleRewardedLoadFailure(): void {
    if (this.rewardedRetryCount >= this.config.maxRetryAttempts) {
      console.warn(`[AdMob] Max load retry attempts reached for Rewarded. Holding.`);
      return;
    }

    this.rewardedRetryCount++;
    const backoffTimeMs = Math.min(2000 * Math.pow(2, this.rewardedRetryCount), 30000);
    console.log(`[AdMob] Retrying rewarded preloading in ${backoffTimeMs / 1000} seconds (Attempt ${this.rewardedRetryCount}/${this.config.maxRetryAttempts})...`);
    
    setTimeout(() => {
      this.loadRewarded();
    }, backoffTimeMs);
  }

  /**
   * Checks if an ad is loaded and ready
   */
  public isLoaded(): boolean {
    return this.isAdLoaded;
  }

  /**
   * Checks if a rewarded ad is loaded and ready
   */
  public isRewardedLoadedReady(): boolean {
    return this.isRewardedLoaded;
  }

  /**
   * Checks if an ad can be displayed in the current context
   */
  public canShowAd(screenContext: string): { allowed: boolean; reason?: string } {
    const normalizedContext = screenContext.toLowerCase().trim();
    const isForbidden = this.forbiddenScreens.some(screen => normalizedContext.includes(screen));
    
    if (isForbidden) {
      return { 
        allowed: false, 
        reason: `Ad showing forbidden in critical screen context: "${screenContext}"` 
      };
    }

    if (!this.isAdLoaded || !this.realInterstitial) {
      return { 
        allowed: false, 
        reason: 'Interstitial ad is not fully loaded/cached yet. Loading in background.' 
      };
    }

    const timeSinceLastAd = Date.now() - this.lastShownTimestamp;
    if (timeSinceLastAd < this.config.cooldownPeriodMs) {
      const remainingMs = this.config.cooldownPeriodMs - timeSinceLastAd;
      return { 
        allowed: false, 
        reason: `Ad frequency cooldown active. Remaining: ${Math.ceil(remainingMs / 1000)}s` 
      };
    }

    return { allowed: true };
  }

  /**
   * Requests displaying the Interstitial Ad in a safe context
   */
  public showInterstitial(screenContext: string, onDismiss: () => void = () => {}): boolean {
    const check = this.canShowAd(screenContext);
    
    if (!check.allowed) {
      console.log(`[AdMob] [Blocked] ${check.reason}`);
      onDismiss();
      if (!this.isAdLoaded && this.state !== 'loading') {
        this.loadInterstitial();
      }
      return false;
    }

    console.log(`[AdMob] [Granted] Triggering Interstitial Ad on screen: "${screenContext}"`);
    this.updateState('showing');
    
    this.onInterstitialDismissed = onDismiss;
    if (this.realInterstitial) {
      this.realInterstitial.show();
    } else {
      this.handleAdDismissed();
      onDismiss();
    }

    return true;
  }

  /**
   * Requests displaying a Rewarded Ad
   */
  public showRewarded(
    screenContext: string,
    onEarnedReward: (reward: { type: string; amount: number }) => void,
    onDismiss: () => void = () => {}
  ): boolean {
    if (!this.isRewardedLoaded || !this.realRewarded) {
      console.log('[AdMob] Rewarded ad is not ready yet.');
      onDismiss();
      this.loadRewarded();
      return false;
    }

    console.log(`[AdMob] [Granted] Triggering Rewarded Ad on screen: "${screenContext}"`);
    
    this.onRewardedEarned = onEarnedReward;
    this.onRewardedDismissed = onDismiss;
    
    this.realRewarded.show();
    return true;
  }

  /**
   * Cleans up state when the interstitial is closed or dismissed
   */
  private handleAdDismissed(): void {
    this.isAdLoaded = false;
    this.lastShownTimestamp = Date.now();
    this.updateState('cooldown');
    console.log('[AdMob] Interstitial dismissed. Cooldown initiated.');

    if (this.cooldownTimer) clearTimeout(this.cooldownTimer);
    this.cooldownTimer = setTimeout(() => {
      this.updateState('ready');
      console.log('[AdMob] Cooldown expired. Preloading next interstitial...');
      this.loadInterstitial();
    }, this.config.cooldownPeriodMs);
  }

  /**
   * Get remaining cooldown time in seconds
   */
  public getCooldownRemaining(): number {
    const timeSinceLastAd = Date.now() - this.lastShownTimestamp;
    if (timeSinceLastAd < this.config.cooldownPeriodMs) {
      return Math.ceil((this.config.cooldownPeriodMs - timeSinceLastAd) / 1000);
    }
    return 0;
  }

  /**
   * Get active Ad Unit ID depending on simulated platform
   */
  public getActiveAdUnitId(): string {
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
    return isIOS ? this.config.iosAdUnitId : this.config.androidAdUnitId;
  }

  /**
   * Get active Rewarded Ad Unit ID depending on platform
   */
  public getActiveRewardedAdUnitId(): string {
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
    return isIOS ? this.config.iosRewardedAdUnitId : this.config.androidRewardedAdUnitId;
  }

  /**
   * Get active Banner Ad Unit ID depending on platform
   */
  public getActiveBannerAdUnitId(): string {
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
    return isIOS ? this.config.iosBannerAdUnitId : this.config.androidBannerAdUnitId;
  }

  /**
   * Listeners registration for reactive UI updates
   */
  public subscribe(listener: AdStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatusUpdate());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateState(newState: AdState, errorMessage?: string): void {
    this.state = newState;
    const update = this.getStatusUpdate(errorMessage);
    this.listeners.forEach(listener => listener(update));
  }

  private getStatusUpdate(errorMessage?: string): AdStatusUpdate {
    return {
      state: this.state,
      lastShownTimestamp: this.lastShownTimestamp,
      cooldownRemaining: this.getCooldownRemaining(),
      error: errorMessage
    };
  }
}

export const AdMobManager = new AdMobManagerService();
