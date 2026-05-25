const fs = require('fs');
const path = require('path');
const pg = require('./postgres');
const neo4j = require('./neo4j');

function loadMetroDataset() {
  const dataPath = path.join(__dirname, '../../data/wuhan-metro.json');
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

async function main() {
  const metroData = loadMetroDataset();

  console.log('=== 武汉地铁查询系统数据初始化 ===');
  console.log(`数据集: ${metroData.meta.titleZh}`);
  console.log(`线路: ${metroData.lines.length} 条, 站点: ${metroData.stations.length} 个`);

  console.log('\n=== 等待 Neo4j 就绪 ===');
  await neo4j.waitForConnection();

  console.log('\n=== 初始化数据库结构 ===');
  await pg.initTables();
  await neo4j.initConstraints();

  console.log('\n=== 清空旧数据 ===');
  await pg.clearAll();
  await neo4j.clearAll();

  console.log('\n=== 写入 PostgreSQL/PostGIS ===');
  await pg.insertMetroData(metroData);
  console.log('[PostgreSQL] 地铁线路、站点和空间线段写入完成');

  console.log('\n=== 写入 Neo4j 图数据库 ===');
  await neo4j.createMetroData(metroData);
  console.log('[Neo4j] 站点、线路、相邻站和换乘关系写入完成');

  await neo4j.close();
  console.log('\n=== 初始化完成 ===');
  console.log('课程要求对应:');
  console.log('1. STAC: server/data/stac/catalog.json');
  console.log('2. XML/JSON: server/data/wuhan-metro.xml + server/data/wuhan-metro.json');
  console.log('3. 开源数据库: PostgreSQL/PostGIS + Neo4j');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
