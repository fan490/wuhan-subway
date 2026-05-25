/**
 * SHP 文件双库导入工具
 * 使用 shapefile npm 包读取 .shp，同时写入 PostgreSQL + Neo4j
 * 可用 ogr2ogr (需要 GDAL) 作为备选方案
 */
const shapefile = require('shapefile');
const pg = require('../db/postgres');
const neo4j = require('../db/neo4j');

async function importShpToBoth(shpPath) {
  let features = [];
  const source = await shapefile.open(shpPath);

  // 读取所有 features
  while (true) {
    const { done, value } = await source.read();
    if (done) break;
    features.push(value);
  }

  let pgCount = 0;
  let neo4jCount = 0;

  const pgClient = await pg.pool.connect();
  try {
    await pgClient.query('BEGIN');

    for (let i = 0; i < features.length; i++) {
      const feat = features[i];
      const geom = feat.geometry;
      const props = feat.properties || {};
      const entityId = 1000 + i; // 保证 id 在两库中一致

      if (geom.type === 'Point') {
        const [lng, lat] = geom.coordinates;
        const name = props.name || props.NAME || `Point_${entityId}`;

        // PostgreSQL
        await pgClient.query(
          `INSERT INTO traffic_nodes (id, name, node_type, geom, properties)
           VALUES ($1,$2,$3, ST_SetSRID(ST_MakePoint($4,$5), 4326), $6)
           ON CONFLICT (id) DO UPDATE SET name=$2, geom=ST_SetSRID(ST_MakePoint($4,$5), 4326)`,
          [entityId, name, 'shp_point', lng, lat, JSON.stringify(props)]
        );
        pgCount++;

        // Neo4j: Point → KeyLocation 节点
        await neo4j.createNode('KeyLocation', {
          id: entityId, name, lng, lat, nodeType: 'shp_point',
          properties: JSON.stringify(props),
        });
        neo4jCount++;
      } else if (geom.type === 'LineString') {
        const coords = geom.coordinates;
        const name = props.name || props.NAME || `Line_${entityId}`;
        const points = coords.map(c => `${c[0]} ${c[1]}`).join(',');

        // PostgreSQL
        await pgClient.query(
          `INSERT INTO roads (id, name, road_type, geom, properties)
           VALUES ($1,$2,$3, ST_SetSRID(ST_GeomFromText($4), 4326), $5)
           ON CONFLICT (id) DO UPDATE SET name=$2, geom=ST_SetSRID(ST_GeomFromText($4), 4326)`,
          [entityId, name, 'shp_line', `LINESTRING(${points})`, JSON.stringify(props)]
        );
        pgCount++;

        // Neo4j: LineString → Route 节点
        await neo4j.createNode('Route', {
          id: entityId, name, roadType: 'shp_line',
          coords: JSON.stringify(coords), properties: JSON.stringify(props),
        });
        neo4jCount++;
      } else if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
        // Polygon: 取中心点存为节点
        const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
        const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
        const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
        const name = props.name || props.NAME || `Polygon_${entityId}`;

        await pgClient.query(
          `INSERT INTO traffic_nodes (id, name, node_type, geom, properties)
           VALUES ($1,$2,$3, ST_SetSRID(ST_MakePoint($4,$5), 4326), $6)
           ON CONFLICT (id) DO UPDATE SET name=$2, geom=ST_SetSRID(ST_MakePoint($4,$5), 4326)`,
          [entityId, name, 'shp_polygon', lng, lat, JSON.stringify(props)]
        );
        pgCount++;
        await neo4j.createNode('KeyLocation', {
          id: entityId, name, lng, lat, nodeType: 'shp_polygon',
          properties: JSON.stringify(props),
        });
        neo4jCount++;
      }
    }

    await pgClient.query('COMMIT');
  } catch (e) {
    await pgClient.query('ROLLBACK');
    throw e;
  } finally {
    pgClient.release();
  }

  return { totalFeatures: features.length, postgresCount: pgCount, neo4jCount: neo4jCount };
}

module.exports = { importShpToBoth };
