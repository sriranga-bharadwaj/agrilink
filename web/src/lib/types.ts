export type Crop = { crop_id: number; crop_name: string; category: string };

export type ActiveListing = {
  listing_id: number;
  farmer_id: number;
  farm_name: string;
  district: string;
  state: string;
  crop_name: string;
  category: string;
  variety: string | null;
  available_kg: number;
  price_per_kg: number;
  quality_grade: "A" | "B" | "C";
  is_organic: number;
  harvest_date: string;
  days_since_harvest: number;
  freshness_pct: number;
  available_until: string;
};

export type Match = {
  match_rank: number;
  match_id: number;
  match_status: "SUGGESTED" | "ACCEPTED" | "REJECTED";
  score: number;
  distance_km: number;
  listing_id: number;
  farm_name: string;
  district: string;
  crop_name: string;
  variety: string | null;
  available_kg: number;
  price_per_kg: number;
  quality_grade: string;
  is_organic: number;
  harvest_date: string;
};

export type OrderRow = {
  order_id: number;
  status: "PLACED" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELLED";
  placed_at: string;
  buyer: string;
  farmer: string;
  crop_name: string;
  variety: string | null;
  quantity_kg: number;
  price_per_kg: number;
  total_amount: number;
  requirement_id: number | null;
  expected_date: string | null;
  delivered_date: string | null;
};
