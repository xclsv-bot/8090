import { get, buildQueryString } from '@/lib/api/client';
import type {
  GameSchedule,
  Recommendation,
  TrafficScoreResponse,
  VenueHistoryData,
} from '@/types/trafficPrediction';

function toIsoDateTime(date: string, time: string): string {
  if (!date) return new Date().toISOString();
  const fallbackTime = time || '18:00';
  const merged = new Date(`${date}T${fallbackTime}:00`);
  return Number.isNaN(merged.getTime()) ? new Date().toISOString() : merged.toISOString();
}

export const trafficPredictionAPI = {
  async getTrafficScore(venueId: string, date: string, time: string): Promise<TrafficScoreResponse> {
    const eventDate = toIsoDateTime(date, time);
    const query = buildQueryString({ venueId, eventDate });
    const response = await get<TrafficScoreResponse>(`/api/v1/traffic-prediction/score${query}`);
    return response.data;
  },

  async getRecommendations(week: number, region: string): Promise<Recommendation[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + Math.max(0, week - 1) * 7);

    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const query = buildQueryString({
      week,
      region,
      dateFrom: start.toISOString().split('T')[0],
      dateTo: end.toISOString().split('T')[0],
      limit: 20,
    });

    const response = await get<Recommendation[]>(`/api/v1/traffic-prediction/recommendations${query}`);
    return response.data;
  },

  async getSportsCalendar(date: string, region: string): Promise<GameSchedule[]> {
    const query = buildQueryString({ date, region });
    const response = await get<GameSchedule[]>(`/api/v1/traffic-prediction/sports-calendar${query}`);
    return response.data;
  },

  async getVenueHistory(venueId: string): Promise<VenueHistoryData> {
    const query = buildQueryString({ venueId });
    const response = await get<VenueHistoryData>(`/api/v1/traffic-prediction/venue-history${query}`);
    return response.data;
  },
};
