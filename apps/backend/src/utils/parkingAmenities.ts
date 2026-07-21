export const FREE_PARKING_AMENITY = 'Free Parking';
export const PAID_PARKING_AMENITY = 'Paid Parking';

export function normalizeParkingAmenities(amenities: string[]): string[] {
  const normalized = Array.from(
    new Set(
      amenities
        .map((amenity) => amenity.trim())
        .filter((amenity) => amenity.length > 0)
    )
  );

  const hasFreeParking = normalized.includes(FREE_PARKING_AMENITY);
  const hasPaidParking = normalized.includes(PAID_PARKING_AMENITY);

  if (!hasFreeParking && !hasPaidParking) {
    return [...normalized, PAID_PARKING_AMENITY];
  }

  return normalized;
}
