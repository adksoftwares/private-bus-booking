export interface BusStand {
  id: string;
  name: string; // e.g. "Colombo (Bastian Mawatha)", "Makumbura (MMMC)", "Kandy (Goodshed)", "Jaffna"
  town: string; // Base town name e.g. "Colombo", "Makumbura", "Kandy", "Jaffna"
  district: string; // e.g. "Colombo", "Kandy", "Galle", "Batticaloa"
  province: string; // e.g. "Western Province", "Central Province"
  aliases?: string[]; // e.g. ["Pettah", "Bastian Mawatha", "Gunasinghapura", "MMMC"]
  isMajorHub?: boolean; // True for central bus terminals and intermodal transport centers
  coordinates?: { lat: number; lng: number };
}

export interface District {
  name: string;
  province: string;
  busStands: BusStand[];
}

export interface Province {
  name: string;
  districts: string[];
}
