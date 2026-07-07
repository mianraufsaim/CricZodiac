import { queryRows } from '../DatabaseHelper';

const CURRENT_MATCH_LIMIT = 25;
const PREVIOUS_MATCH_LIMIT = 25;

const toNumber = (value) => Number(value || 0);
const placeholders = (values) => values.map(() => '?').join(',');

const roundPoint = (value) => Math.round(toNumber(value) * 10) / 10;

const getCompletedMatchIds = async ({ clubId = null, limit = null, offset = 0 } = {}) => {
  const params = [];
  const scopeSql = clubId
    ? 'AND (m.club_id = ? OR m.club_id IS NULL)'
    : '';
  if (clubId) params.push(String(clubId));

  let limitSql = '';
  if (limit != null) {
    limitSql = 'LIMIT ? OFFSET ?';
    params.push(limit, offset);
  }

  const rows = await queryRows(`
    SELECT DISTINCT m.id
    FROM matches m
    LEFT JOIN match_results mr ON mr.match_id = m.id
    WHERE (m.status = 'completed' OR m.result_text IS NOT NULL OR mr.id IS NOT NULL)
      ${scopeSql}
    ORDER BY
      COALESCE(m.match_date, m.updated_at, m.created_at) DESC,
      m.updated_at DESC,
      m.created_at DESC
    ${limitSql}
  `, params);

  return rows.map(row => row.id).filter(Boolean);
};

const getPlayerProfiles = async (playerIds) => {
  if (!playerIds.length) return new Map();

  const rows = await queryRows(`
    SELECT
      p.id,
      p.server_id,
      COALESCE(NULLIF(u.name, ''), 'Unknown Player') AS full_name,
      COALESCE(NULLIF(p.profile_pic, ''), NULLIF(u.profile_pic, '')) AS profile_pic
    FROM players p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.id IN (${placeholders(playerIds)})
  `, playerIds);

  return new Map(rows.map(row => [String(row.id), row]));
};

const aggregateForMatches = async (matchIds) => {
  if (!matchIds.length) return new Map();

  const params = matchIds;
  const inSql = placeholders(matchIds);
  const [battingRows, bowlingRows, fieldingRows] = await Promise.all([
    queryRows(`
      SELECT bs.player_id, SUM(COALESCE(bs.runs_scored, 0)) AS runs
      FROM batting_scorecards bs
      INNER JOIN innings i ON i.id = bs.innings_id
      WHERE i.match_id IN (${inSql})
      GROUP BY bs.player_id
    `, params),
    queryRows(`
      SELECT
        bsc.player_id,
        SUM(COALESCE(bsc.wickets, 0)) AS wickets,
        SUM(COALESCE(bsc.runs_conceded, 0)) AS runs_conceded
      FROM bowling_scorecards bsc
      INNER JOIN innings i ON i.id = bsc.innings_id
      WHERE i.match_id IN (${inSql})
      GROUP BY bsc.player_id
    `, params),
    queryRows(`
      SELECT
        w.fielder_id AS player_id,
        SUM(CASE WHEN LOWER(w.wicket_type) = 'caught' THEN 1 ELSE 0 END) AS catches,
        SUM(CASE WHEN LOWER(w.wicket_type) = 'stumped' THEN 1 ELSE 0 END) AS stumpings,
        SUM(CASE WHEN LOWER(w.wicket_type) = 'run_out' THEN 1 ELSE 0 END) AS run_outs
      FROM wickets w
      INNER JOIN innings i ON i.id = w.innings_id
      WHERE i.match_id IN (${inSql})
        AND w.fielder_id IS NOT NULL
        AND LOWER(w.wicket_type) IN ('caught', 'stumped', 'run_out')
      GROUP BY w.fielder_id
    `, params),
  ]);

  const byPlayer = new Map();
  const ensure = (playerId) => {
    const key = String(playerId);
    if (!byPlayer.has(key)) {
      byPlayer.set(key, {
        id: key,
        runs: 0,
        wickets: 0,
        runsConceded: 0,
        catches: 0,
        stumpings: 0,
        runOuts: 0,
      });
    }
    return byPlayer.get(key);
  };

  battingRows.forEach(row => {
    if (!row.player_id) return;
    ensure(row.player_id).runs += toNumber(row.runs);
  });

  bowlingRows.forEach(row => {
    if (!row.player_id) return;
    const player = ensure(row.player_id);
    player.wickets += toNumber(row.wickets);
    player.runsConceded += toNumber(row.runs_conceded);
  });

  fieldingRows.forEach(row => {
    if (!row.player_id) return;
    const player = ensure(row.player_id);
    player.catches += toNumber(row.catches);
    player.stumpings += toNumber(row.stumpings);
    player.runOuts += toNumber(row.run_outs);
  });

  byPlayer.forEach(player => {
    const battingPoints = player.runs;
    const bowlingPoints = (player.wickets * 25) - (player.runsConceded * 0.5);
    const fieldingPoints = (player.catches + player.stumpings + player.runOuts) * 5;

    player.battingPoints = roundPoint(battingPoints);
    player.bowlingPoints = roundPoint(bowlingPoints);
    player.fieldingPoints = roundPoint(fieldingPoints);
    player.allRounderPoints = roundPoint(battingPoints + bowlingPoints + fieldingPoints);
  });

  return byPlayer;
};

const sortRankings = (rows) => rows
  .filter(row => row.points !== 0)
  .sort((a, b) =>
    b.points - a.points ||
    b.ath - a.ath ||
    String(a.full_name).localeCompare(String(b.full_name))
  )
  .map((row, index) => ({ ...row, standing: index + 1 }));

const buildPreviousRankMap = (aggregate, pointKey) => {
  const rows = [...aggregate.values()]
    .map(player => ({ id: player.id, points: roundPoint(player[pointKey]) }))
    .filter(row => row.points !== 0)
    .sort((a, b) => b.points - a.points);

  return new Map(rows.map((row, index) => [row.id, index + 1]));
};

const movementFor = (standing, previousStanding) => {
  if (!previousStanding) return 'up';
  if (previousStanding > standing) return 'up';
  if (previousStanding < standing) return 'down';
  return 'same';
};

const buildSection = ({ currentAggregate, previousAggregate, allTimeAggregate, profiles, pointKey }) => {
  const previousRanks = buildPreviousRankMap(previousAggregate, pointKey);

  const rows = [...currentAggregate.values()].map(player => {
    const profile = profiles.get(player.id);
    const allTime = allTimeAggregate.get(player.id);
    const points = roundPoint(player[pointKey]);
    const ath = roundPoint(Math.max(points, toNumber(allTime?.[pointKey])));

    return {
      id: player.id,
      full_name: profile?.full_name || 'Unknown Player',
      profile_pic: profile?.profile_pic || null,
      points,
      ath,
      previousStanding: previousRanks.get(player.id) || null,
    };
  });

  return sortRankings(rows).map(row => ({
    ...row,
    movement: movementFor(row.standing, row.previousStanding),
  }));
};

export const getRankings = async ({ clubId = null } = {}) => {
  const [currentMatchIds, previousMatchIds, allTimeMatchIds] = await Promise.all([
    getCompletedMatchIds({ clubId, limit: CURRENT_MATCH_LIMIT, offset: 0 }),
    getCompletedMatchIds({ clubId, limit: PREVIOUS_MATCH_LIMIT, offset: CURRENT_MATCH_LIMIT }),
    getCompletedMatchIds({ clubId }),
  ]);

  const [currentAggregate, previousAggregate, allTimeAggregate] = await Promise.all([
    aggregateForMatches(currentMatchIds),
    aggregateForMatches(previousMatchIds),
    aggregateForMatches(allTimeMatchIds),
  ]);

  const playerIds = [...new Set([
    ...currentAggregate.keys(),
    ...previousAggregate.keys(),
    ...allTimeAggregate.keys(),
  ])];
  const profiles = await getPlayerProfiles(playerIds);

  return {
    meta: {
      currentMatchCount: currentMatchIds.length,
      previousMatchCount: previousMatchIds.length,
      allTimeMatchCount: allTimeMatchIds.length,
    },
    batting: buildSection({
      currentAggregate,
      previousAggregate,
      allTimeAggregate,
      profiles,
      pointKey: 'battingPoints',
    }),
    bowling: buildSection({
      currentAggregate,
      previousAggregate,
      allTimeAggregate,
      profiles,
      pointKey: 'bowlingPoints',
    }),
    allRounder: buildSection({
      currentAggregate,
      previousAggregate,
      allTimeAggregate,
      profiles,
      pointKey: 'allRounderPoints',
    }),
  };
};
