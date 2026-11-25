// District centres used for distance-based matching. Users pick a district at
// sign-up instead of typing coordinates.
export const DISTRICTS = [
  { district: "Bengaluru Urban", state: "Karnataka", lat: 12.9716, lon: 77.5946 },
  { district: "Belagavi", state: "Karnataka", lat: 15.8497, lon: 74.4977 },
  { district: "Chikkaballapur", state: "Karnataka", lat: 13.4355, lon: 77.7315 },
  { district: "Davanagere", state: "Karnataka", lat: 14.4644, lon: 75.9218 },
  { district: "Dharwad", state: "Karnataka", lat: 15.4589, lon: 75.0078 },
  { district: "Hassan", state: "Karnataka", lat: 13.0072, lon: 76.0962 },
  { district: "Kolar", state: "Karnataka", lat: 13.1367, lon: 78.1292 },
  { district: "Mandya", state: "Karnataka", lat: 12.5218, lon: 76.8951 },
  { district: "Mysuru", state: "Karnataka", lat: 12.2958, lon: 76.6394 },
  { district: "Shivamogga", state: "Karnataka", lat: 13.9299, lon: 75.5681 },
  { district: "Tumakuru", state: "Karnataka", lat: 13.3409, lon: 77.101 },
  { district: "Chennai", state: "Tamil Nadu", lat: 13.0827, lon: 80.2707 },
  { district: "Hyderabad", state: "Telangana", lat: 17.385, lon: 78.4867 },
  { district: "Nashik", state: "Maharashtra", lat: 19.9975, lon: 73.7898 },
  { district: "Pune", state: "Maharashtra", lat: 18.5204, lon: 73.8567 },
] as const;

export function findDistrict(name: string) {
  return DISTRICTS.find((d) => d.district === name);
}
