/**
 * Commerce Store & Connector types (V4.5-G).
 * Enhance Connector — do not redesign account system.
 */

export type CommercePlatform = "Amazon" | "TikTok Shop";

/** Live API connection status — never Fake Connected */
export type StoreConnectionStatus =
  | "Connected"
  | "Disconnected"
  | "Permission Required"
  | "Unsupported"
  | "Not Connected";

export type CommerceStoreRecord = {
  id: string;
  platform: CommercePlatform;
  marketplace: string;
  country: string;
  currency: string;
  /** Demo seed file / data key — isolated per store */
  dataKey: string;
  label: string;
  /** Live OAuth / SP-API etc. — false until real connector exists */
  liveApiSupported: boolean;
  connectionStatus: StoreConnectionStatus;
  /** Demo data available for this store (separate from Connected) */
  demoAvailable: boolean;
};

export type CommerceStoreContext = {
  storeId: string;
  platform: CommercePlatform;
  marketplace: string;
  country: string;
  currency: string;
  connectionStatus: StoreConnectionStatus;
  isDemo: boolean;
  dataKey: string;
  label: string;
};
