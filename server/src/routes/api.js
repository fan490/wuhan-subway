const express = require('express');
const path = require('path');
const fs = require('fs');
const pg = require('../db/postgres');
const neo4j = require('../db/neo4j');

const router = express.Router();
const dataDir = path.join(__dirname, '../../data');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(dataDir, relativePath), 'utf8');
}

function loadMetroData() {
  return readJson('wuhan-metro.json');
}

function buildLineLookup(data) {
  return new Map(data.lines.map(line => [line.id, line]));
}

function buildStationLookup(data) {
  return new Map(data.stations.map(station => [station.id, station]));
}

function buildAdjacency(data) {
  const lineMap = buildLineLookup(data);
  const adjacency = new Map(data.stations.map(station => [station.id, []]));

  for (const line of data.lines) {
    for (let i = 0; i < line.stations.length - 1; i++) {
      const from = line.stations[i];
      const to = line.stations[i + 1];
      const edge = {
        lineId: line.id,
        lineName: line.name,
        color: line.color,
        lineDirection: line.direction,
      };
      adjacency.get(from).push({ to, ...edge });
      adjacency.get(to).push({ to: from, ...edge });
    }
  }

  return { adjacency, lineMap };
}

function compareCost(a, b) {
  if (a.transfers !== b.transfers) return a.transfers - b.transfers;
  return a.stops - b.stops;
}

function findRoute(data, fromId, toId) {
  if (fromId === toId) {
    const station = buildStationLookup(data).get(fromId);
    return {
      transfers: 0,
      stops: 0,
      stations: station ? [station] : [],
      segments: [],
      instructions: [],
    };
  }

  const stationMap = buildStationLookup(data);
  const { adjacency } = buildAdjacency(data);
  const startKey = `${fromId}|`;
  const dist = new Map([[startKey, { stationId: fromId, lineId: '', transfers: 0, stops: 0 }]]);
  const prev = new Map();
  const queue = [{ key: startKey, stationId: fromId, lineId: '', transfers: 0, stops: 0 }];
  let bestTargetKey = null;

  while (queue.length) {
    queue.sort((a, b) => compareCost(a, b));
    const current = queue.shift();
    const known = dist.get(current.key);
    if (!known || compareCost(current, known) > 0) continue;

    if (current.stationId === toId) {
      bestTargetKey = current.key;
      break;
    }

    for (const edge of adjacency.get(current.stationId) || []) {
      const nextLineId = edge.lineId;
      const transferCost = current.lineId && current.lineId !== nextLineId ? 1 : 0;
      const next = {
        stationId: edge.to,
        lineId: nextLineId,
        transfers: current.transfers + transferCost,
        stops: current.stops + 1,
      };
      const nextKey = `${next.stationId}|${next.lineId}`;
      const old = dist.get(nextKey);
      if (!old || compareCost(next, old) < 0) {
        dist.set(nextKey, next);
        prev.set(nextKey, { key: current.key, edge: { from: current.stationId, ...edge } });
        queue.push({ key: nextKey, ...next });
      }
    }
  }

  if (!bestTargetKey) return null;

  const reversedEdges = [];
  let cursor = bestTargetKey;
  while (prev.has(cursor)) {
    const step = prev.get(cursor);
    reversedEdges.push(step.edge);
    cursor = step.key;
  }
  const segments = reversedEdges.reverse();
  const stationIds = [fromId, ...segments.map(segment => segment.to)];
  const stations = stationIds.map(id => stationMap.get(id)).filter(Boolean);
  const best = dist.get(bestTargetKey);
  const instructions = [];

  for (const segment of segments) {
    const last = instructions[instructions.length - 1];
    if (last && last.lineId === segment.lineId) {
      last.to = segment.to;
      last.stopCount += 1;
    } else {
      instructions.push({
        lineId: segment.lineId,
        lineName: segment.lineName,
        color: segment.color,
        from: segment.from,
        to: segment.to,
        stopCount: 1,
      });
    }
  }

  return {
    transfers: best.transfers,
    stops: best.stops,
    stations,
    segments,
    instructions: instructions.map(item => ({
      ...item,
      fromName: stationMap.get(item.from)?.name || item.from,
      toName: stationMap.get(item.to)?.name || item.to,
    })),
  };
}

router.get('/metro/network', async (_req, res) => {
  try {
    const source = loadMetroData();
    const [segments, dbStations, dbLines] = await Promise.all([
      pg.getSegments(),
      pg.getStations(),
      pg.getLines(),
    ]);
    res.json({
      success: true,
      meta: source.meta,
      lines: source.lines,
      stations: source.stations,
      dbSummary: {
        stationCount: dbStations.length,
        lineCount: dbLines.length,
        segmentCount: segments.length,
      },
      segments,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/metro/stations', async (_req, res) => {
  try {
    res.json({ success: true, data: await pg.getStations() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/metro/lines', async (_req, res) => {
  try {
    res.json({ success: true, data: await pg.getLines() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/metro/search', async (req, res) => {
  try {
    const keyword = String(req.query.q || '').trim();
    if (!keyword) return res.json({ success: true, data: [] });
    res.json({ success: true, data: await pg.searchStations(keyword) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/metro/route', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ success: false, error: '缺少 from 或 to 参数' });
    }
    const data = loadMetroData();
    const route = findRoute(data, String(from), String(to));
    if (!route) {
      return res.status(404).json({ success: false, error: '未找到可达路径' });
    }
    res.json({ success: true, data: route });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/graph', async (_req, res) => {
  try {
    const data = await neo4j.getFullGraph();
    res.json({ success: true, source: 'Neo4j', ...data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/stac/catalog', (_req, res) => {
  res.json(readJson('stac/catalog.json'));
});

router.get('/stac/collection', (_req, res) => {
  res.json(readJson('stac/collection.json'));
});

router.get('/stac/items/wuhan-metro-network', (_req, res) => {
  res.json(readJson('stac/items/wuhan-metro-network.json'));
});

router.get('/source-data/json', (_req, res) => {
  res.json(readJson('wuhan-metro.json'));
});

router.get('/source-data/xml', (_req, res) => {
  res.type('application/xml').send(readText('wuhan-metro.xml'));
});

router.get('/health', async (_req, res) => {
  const status = { pg: false, neo4j: false };
  try {
    await pg.pool.query('SELECT 1');
    status.pg = true;
  } catch (_) { /* offline */ }
  try {
    await neo4j.run('RETURN 1');
    status.neo4j = true;
  } catch (_) { /* offline */ }
  res.json({ success: true, status });
});

module.exports = router;
