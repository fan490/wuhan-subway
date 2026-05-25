const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool(config.postgres);

pool.on('error', (err) => {
  console.error('[PostgreSQL] 连接池异常:', err.message);
});

async function initTables() {
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS metro_lines (
        id VARCHAR(20) PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        color VARCHAR(20) NOT NULL,
        direction TEXT,
        properties JSONB DEFAULT '{}'::jsonb
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS metro_stations (
        id VARCHAR(80) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        district VARCHAR(80),
        category VARCHAR(50),
        schematic_x DOUBLE PRECISION,
        schematic_y DOUBLE PRECISION,
        geom GEOMETRY(Point, 4326),
        properties JSONB DEFAULT '{}'::jsonb
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS metro_segments (
        id SERIAL PRIMARY KEY,
        line_id VARCHAR(20) REFERENCES metro_lines(id),
        from_station_id VARCHAR(80) REFERENCES metro_stations(id),
        to_station_id VARCHAR(80) REFERENCES metro_stations(id),
        sequence INTEGER,
        geom GEOMETRY(LineString, 4326),
        properties JSONB DEFAULT '{}'::jsonb,
        UNIQUE(line_id, from_station_id, to_station_id)
      );
    `);

    await client.query('CREATE INDEX IF NOT EXISTS metro_stations_geom_idx ON metro_stations USING GIST (geom);');
    await client.query('CREATE INDEX IF NOT EXISTS metro_segments_geom_idx ON metro_segments USING GIST (geom);');
    console.log('[PostgreSQL] 地铁空间表初始化完成');
  } finally {
    client.release();
  }
}

async function clearAll() {
  await pool.query('DELETE FROM metro_segments');
  await pool.query('DELETE FROM metro_stations');
  await pool.query('DELETE FROM metro_lines');
}

async function insertMetroData(data) {
  const stationMap = new Map(data.stations.map(station => [station.id, station]));
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const line of data.lines) {
      await client.query(
        `INSERT INTO metro_lines (id, name, color, direction, properties)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           color = EXCLUDED.color,
           direction = EXCLUDED.direction,
           properties = EXCLUDED.properties`,
        [line.id, line.name, line.color, line.direction, JSON.stringify({ stationCount: line.stations.length })]
      );
    }

    for (const station of data.stations) {
      await client.query(
        `INSERT INTO metro_stations
           (id, name, district, category, schematic_x, schematic_y, geom, properties)
         VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326), $9)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           district = EXCLUDED.district,
           category = EXCLUDED.category,
           schematic_x = EXCLUDED.schematic_x,
           schematic_y = EXCLUDED.schematic_y,
           geom = EXCLUDED.geom,
           properties = EXCLUDED.properties`,
        [
          station.id,
          station.name,
          station.district,
          station.category,
          station.x,
          station.y,
          station.lng,
          station.lat,
          JSON.stringify({ source: data.meta.version }),
        ]
      );
    }

    for (const line of data.lines) {
      for (let i = 0; i < line.stations.length - 1; i++) {
        const from = stationMap.get(line.stations[i]);
        const to = stationMap.get(line.stations[i + 1]);
        if (!from || !to) continue;
        const wkt = `LINESTRING(${from.lng} ${from.lat},${to.lng} ${to.lat})`;
        await client.query(
          `INSERT INTO metro_segments
             (line_id, from_station_id, to_station_id, sequence, geom, properties)
           VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromText($5), 4326), $6)
           ON CONFLICT (line_id, from_station_id, to_station_id) DO UPDATE SET
             sequence = EXCLUDED.sequence,
             geom = EXCLUDED.geom,
             properties = EXCLUDED.properties`,
          [line.id, from.id, to.id, i + 1, wkt, JSON.stringify({ lineName: line.name })]
        );
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getLines() {
  const { rows } = await pool.query(`
    SELECT l.*,
      COALESCE(
        json_agg(s.station_id ORDER BY s.sequence) FILTER (WHERE s.station_id IS NOT NULL),
        '[]'
      ) AS station_ids
    FROM metro_lines l
    LEFT JOIN (
      SELECT line_id, from_station_id AS station_id, sequence FROM metro_segments
      UNION
      SELECT line_id, to_station_id AS station_id, sequence + 0.5 AS sequence FROM metro_segments
    ) s ON s.line_id = l.id
    GROUP BY l.id
    ORDER BY l.id
  `);
  return rows;
}

async function getStations() {
  const { rows } = await pool.query(`
    SELECT
      s.id,
      s.name,
      s.district,
      s.category,
      s.schematic_x AS x,
      s.schematic_y AS y,
      ST_X(s.geom) AS lng,
      ST_Y(s.geom) AS lat,
      COALESCE(json_agg(DISTINCT l.id) FILTER (WHERE l.id IS NOT NULL), '[]') AS line_ids
    FROM metro_stations s
    LEFT JOIN (
      SELECT line_id, from_station_id AS station_id FROM metro_segments
      UNION
      SELECT line_id, to_station_id AS station_id FROM metro_segments
    ) sl ON sl.station_id = s.id
    LEFT JOIN metro_lines l ON l.id = sl.line_id
    GROUP BY s.id
    ORDER BY s.name
  `);
  return rows;
}

async function getSegments() {
  const { rows } = await pool.query(`
    SELECT
      sg.id,
      sg.line_id,
      l.name AS line_name,
      l.color,
      sg.from_station_id,
      sg.to_station_id,
      sg.sequence,
      ST_AsGeoJSON(sg.geom)::json AS geojson
    FROM metro_segments sg
    JOIN metro_lines l ON l.id = sg.line_id
    ORDER BY sg.line_id, sg.sequence
  `);
  return rows;
}

async function searchStations(keyword) {
  const q = `%${keyword || ''}%`;
  const { rows } = await pool.query(`
    SELECT
      id,
      name,
      district,
      category,
      schematic_x AS x,
      schematic_y AS y,
      ST_X(geom) AS lng,
      ST_Y(geom) AS lat
    FROM metro_stations
    WHERE name ILIKE $1 OR district ILIKE $1 OR category ILIKE $1
    ORDER BY name
    LIMIT 20
  `, [q]);
  return rows;
}

async function getStationById(id) {
  const { rows } = await pool.query(`
    SELECT
      id,
      name,
      district,
      category,
      schematic_x AS x,
      schematic_y AS y,
      ST_X(geom) AS lng,
      ST_Y(geom) AS lat
    FROM metro_stations
    WHERE id = $1
  `, [id]);
  return rows[0] || null;
}

module.exports = {
  pool,
  initTables,
  clearAll,
  insertMetroData,
  getLines,
  getStations,
  getSegments,
  searchStations,
  getStationById,
};
