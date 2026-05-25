const neo4j = require('neo4j-driver');
const config = require('../config');

const driver = neo4j.driver(
  config.neo4j.uri,
  neo4j.auth.basic(config.neo4j.user, config.neo4j.password),
  {
    maxConnectionLifetime: 30 * 60 * 1000,
    disableLosslessIntegers: true,
    connectionTimeout: 10000,
    connectionAcquisitionTimeout: 15000,
  }
);

const sessionOptions = { database: 'neo4j' };

async function run(cypher, params = {}) {
  const session = driver.session(sessionOptions);
  try {
    return await session.run(cypher, params);
  } finally {
    await session.close();
  }
}

async function waitForConnection(maxRetries = 12) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await run('RETURN 1');
      console.log('[Neo4j] 连接成功');
      return true;
    } catch (_) {
      console.log(`[Neo4j] 等待就绪... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  throw new Error('Neo4j 连接超时，请确认容器已启动');
}

async function initConstraints() {
  await run('CREATE CONSTRAINT station_id IF NOT EXISTS FOR (n:Station) REQUIRE n.id IS UNIQUE');
  await run('CREATE CONSTRAINT metro_line_id IF NOT EXISTS FOR (n:MetroLine) REQUIRE n.id IS UNIQUE');
  console.log('[Neo4j] 地铁约束创建完成');
}

async function clearAll() {
  await run('MATCH (n) DETACH DELETE n');
}

async function createMetroData(data) {
  const stationMap = new Map(data.stations.map(station => [station.id, station]));

  for (const station of data.stations) {
    await run(
      `MERGE (s:Station {id: $id})
       SET s.name = $name,
           s.district = $district,
           s.category = $category,
           s.lng = $lng,
           s.lat = $lat,
           s.x = $x,
           s.y = $y`,
      station
    );
  }

  for (const line of data.lines) {
    await run(
      `MERGE (l:MetroLine {id: $id})
       SET l.name = $name,
           l.color = $color,
           l.direction = $direction`,
      line
    );

    for (let i = 0; i < line.stations.length; i++) {
      const stationId = line.stations[i];
      await run(
        `MATCH (l:MetroLine {id: $lineId})
         MATCH (s:Station {id: $stationId})
         MERGE (s)-[r:ON_LINE]->(l)
         SET r.sequence = $sequence`,
        { lineId: line.id, stationId, sequence: i + 1 }
      );
    }

    for (let i = 0; i < line.stations.length - 1; i++) {
      const from = stationMap.get(line.stations[i]);
      const to = stationMap.get(line.stations[i + 1]);
      if (!from || !to) continue;
      await run(
        `MATCH (a:Station {id: $fromId})
         MATCH (b:Station {id: $toId})
         MERGE (a)-[r1:NEXT_TO {lineId: $lineId}]->(b)
         SET r1.lineName = $lineName, r1.sequence = $sequence
         MERGE (b)-[r2:NEXT_TO {lineId: $lineId}]->(a)
         SET r2.lineName = $lineName, r2.sequence = $sequence`,
        {
          fromId: from.id,
          toId: to.id,
          lineId: line.id,
          lineName: line.name,
          sequence: i + 1,
        }
      );
    }
  }

  await run(
    `MATCH (s:Station)-[:ON_LINE]->(l:MetroLine)
     WITH s, collect(l.id) AS lines
     WHERE size(lines) > 1
     SET s.transfer = true, s.transferLines = lines`
  );
}

async function getFullGraph() {
  const result = await run(
    `MATCH (n)
     OPTIONAL MATCH (n)-[r:NEXT_TO|ON_LINE]->(m)
     RETURN n, labels(n) AS nLabels, r, m,
            CASE WHEN m IS NOT NULL THEN labels(m) ELSE [] END AS mLabels`
  );

  const nodeMap = {};
  const edges = [];
  const edgeSet = new Set();

  for (const record of result.records) {
    const n = record.get('n');
    const nLabels = record.get('nLabels');
    const nProps = n.properties;
    if (!nProps.id) continue;
    nodeMap[nProps.id] = nodeMap[nProps.id] || { ...nProps, labels: nLabels };

    const m = record.get('m');
    const r = record.get('r');
    if (!m || !r || !m.properties.id) continue;
    nodeMap[m.properties.id] = nodeMap[m.properties.id] || { ...m.properties, labels: record.get('mLabels') };
    const key = `${nProps.id}-${r.type}-${m.properties.id}-${r.properties.lineId || ''}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push({
        from: nProps.id,
        to: m.properties.id,
        label: r.type,
        lineId: r.properties.lineId,
        lineName: r.properties.lineName,
      });
    }
  }

  return { nodes: Object.values(nodeMap), edges };
}

async function close() {
  await driver.close();
}

module.exports = {
  driver,
  run,
  waitForConnection,
  initConstraints,
  clearAll,
  createMetroData,
  getFullGraph,
  close,
};
