import ApiService from './ApiService';
import { API_ENDPOINTS } from '../config/api';

export const getRankings = async ({ clubId = null } = {}) => {
  const params = { matches: 25 };
  if (clubId) params.club_id = clubId;
  const response = await ApiService.get(API_ENDPOINTS.PLAYERS_RANKINGS, { params });
  if (response?.success === false) throw new Error(response.message || 'Rankings unavailable.');
  return {
    meta: response?.meta || {},
    legend: response?.legend || null,
    batting: response?.batting || [],
    bowling: response?.bowling || [],
    allRounder: response?.allRounder || [],
    source: 'api',
  };
};
