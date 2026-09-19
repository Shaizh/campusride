import React from 'react';

// Default export: mobileAds
const mobileAds = () => {
  return {
    initialize: () => Promise.resolve({}),
  };
};

export default mobileAds;

// TestIds matching standard Google AdMob testing units
export const TestIds = {
  INTERSTITIAL: 'ca-app-pub-3878668454113585/9756804198',
  REWARDED: 'ca-app-pub-3878668454113585/rewarded_test_id',
  BANNER: 'ca-app-pub-3878668454113585/banner_test_id',
};

// AdEventType Enum
export enum AdEventType {
  LOADED = 'loaded',
  OPENED = 'opened',
  CLOSED = 'closed',
  ERROR = 'error',
}

// RewardedAdEventType Enum
export enum RewardedAdEventType {
  LOADED = 'loaded',
  EARNED_REWARD = 'earned_reward',
  CLOSED = 'closed',
  ERROR = 'error',
}

// BannerAdSize options
export const BannerAdSize = {
  BANNER: 'BANNER',
  LARGE_BANNER: 'LARGE_BANNER',
  MEDIUM_RECTANGLE: 'MEDIUM_RECTANGLE',
  FULL_BANNER: 'FULL_BANNER',
  LEADERBOARD: 'LEADERBOARD',
  ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER',
};

// InterstitialAd Mock class for Web
export class InterstitialAd {
  private adUnitId: string;
  private listeners: { [key: string]: Function[] } = {};
  public loaded = false;

  private constructor(adUnitId: string) {
    this.adUnitId = adUnitId;
  }

  static createForAdRequest(adUnitId: string, _options?: any) {
    return new InterstitialAd(adUnitId);
  }

  addAdEventListener(eventType: string, listener: Function) {
    if (!this.listeners[eventType]) {
      this.listeners[eventType] = [];
    }
    this.listeners[eventType].push(listener);
    return () => {
      this.listeners[eventType] = this.listeners[eventType].filter(l => l !== listener);
    };
  }

  load() {
    this.loaded = false;
    setTimeout(() => {
      this.loaded = true;
      this.trigger(AdEventType.LOADED);
    }, 1000);
  }

  private trigger(eventType: string, data?: any) {
    if (this.listeners[eventType]) {
      this.listeners[eventType].forEach(l => l(data));
    }
  }

  show() {
    if (!this.loaded) return;
    this.loaded = false;

    if (typeof window !== 'undefined') {
      const event = new CustomEvent('show_admob_interstitial_simulator', {
        detail: {
          screenContext: 'Interstitial Ad',
          onClose: () => {
            this.trigger(AdEventType.CLOSED);
          },
        },
      });
      window.dispatchEvent(event);
    } else {
      this.trigger(AdEventType.CLOSED);
    }
  }
}

// RewardedAd Mock class for Web
export class RewardedAd {
  private adUnitId: string;
  private listeners: { [key: string]: Function[] } = {};
  public loaded = false;

  private constructor(adUnitId: string) {
    this.adUnitId = adUnitId;
  }

  static createForAdRequest(adUnitId: string, _options?: any) {
    return new RewardedAd(adUnitId);
  }

  addAdEventListener(eventType: string, listener: Function) {
    if (!this.listeners[eventType]) {
      this.listeners[eventType] = [];
    }
    this.listeners[eventType].push(listener);
    return () => {
      this.listeners[eventType] = this.listeners[eventType].filter(l => l !== listener);
    };
  }

  load() {
    this.loaded = false;
    setTimeout(() => {
      this.loaded = true;
      this.trigger(RewardedAdEventType.LOADED);
    }, 1000);
  }

  private trigger(eventType: string, data?: any) {
    if (this.listeners[eventType]) {
      this.listeners[eventType].forEach(l => l(data));
    }
  }

  show() {
    if (!this.loaded) return;
    this.loaded = false;

    if (typeof window !== 'undefined') {
      const event = new CustomEvent('show_admob_interstitial_simulator', {
        detail: {
          screenContext: 'Rewarded Video Ad',
          onClose: () => {
            this.trigger(RewardedAdEventType.EARNED_REWARD, { type: 'coins', amount: 50 });
            this.trigger(RewardedAdEventType.CLOSED);
          },
        },
      });
      window.dispatchEvent(event);
    } else {
      this.trigger(RewardedAdEventType.EARNED_REWARD, { type: 'coins', amount: 50 });
      this.trigger(RewardedAdEventType.CLOSED);
    }
  }
}

// BannerAd Mock Component
export const BannerAd: React.FC<any> = ({ unitId, size, _requestOptions, onAdLoaded }) => {
  React.useEffect(() => {
    if (onAdLoaded) {
      const timer = setTimeout(() => onAdLoaded(), 500);
      return () => clearTimeout(timer);
    }
  }, [onAdLoaded]);

  return (
    <div className="w-full bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col items-center justify-center text-center my-4">
      <div className="bg-amber-500/10 text-amber-400 text-[10px] font-extrabold px-2 py-0.5 rounded border border-amber-500/20 font-mono tracking-wider mb-2">
        AdMob Banner Sim
      </div>
      <p className="text-xs font-bold text-white mb-1">Banner Placement</p>
      <p className="text-[10px] text-slate-400 font-mono">Unit: {unitId} | Size: {JSON.stringify(size)}</p>
    </div>
  );
};
