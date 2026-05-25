# 武汉地铁查询系统

面向 WebGIS 课程项目的武汉地铁查询与最少换乘路径规划系统。项目使用 STAC 组织数据源目录，用 JSON 与 XML 表达地铁业务数据，并将站点、线路和换乘关系写入 PostgreSQL/PostGIS 与 Neo4j。

## 课程要求对应

| 要求 | 项目实现 |
|----|----|
| 应用 STAC 规范提供数据源 | `server/data/stac/catalog.json`、`collection.json`、`items/wuhan-metro-network.json` |
| 应用 XML 与 JSON 组织数据 | `server/data/wuhan-metro.json`、`server/data/wuhan-metro.xml` |
| 应用开源数据库存储数据 | PostgreSQL/PostGIS 存储空间点线，Neo4j 存储站点、线路、相邻站关系 |

## 技术栈

| 层 | 技术 |
|----|----|
| 前端 | Vue 3 + Vite + Pinia |
| 后端 | Node.js + Express |
| 空间数据库 | PostgreSQL 15 + PostGIS 3 |
| 图数据库 | Neo4j 5 Community |
| 数据源规范 | STAC 1.0.0 |
| 数据格式 | JSON + XML |
| 容器 | Docker Compose |

## 快速开始

```powershell
cd E:\桌面\实验\5
docker compose up -d
```

初始化武汉地铁数据：

```powershell
cd E:\桌面\实验\5\server
npm.cmd install
npm.cmd run init-db
npm.cmd run dev
```

另开一个终端启动前端：

```powershell
cd E:\桌面\实验\5\client
npm.cmd install
npm.cmd run dev
```

访问：

```text
http://localhost:5173
```

## 数据库

```text
PostgreSQL/PostGIS: localhost:5432
数据库: webgis
用户/密码: postgres/postgres

Neo4j Browser: http://localhost:7474
用户/密码: neo4j/neo4j123456
```

## API

| 方法 | 路径 | 说明 |
|----|----|----|
| GET | `/api/metro/network` | 地铁网络、站点、线路和空间线段 |
| GET | `/api/metro/stations` | 站点列表 |
| GET | `/api/metro/lines` | 线路列表 |
| GET | `/api/metro/search?q=光谷` | 站点检索 |
| GET | `/api/metro/route?from=guanggu_square&to=wuhan_railway` | 最少换乘路径 |
| GET | `/api/graph` | Neo4j 图数据 |
| GET | `/api/stac/catalog` | STAC Catalog |
| GET | `/api/source-data/json` | JSON 数据源 |
| GET | `/api/source-data/xml` | XML 数据源 |
| GET | `/api/health` | 数据库连通性 |

## 功能

- 地铁站点、线路、换乘关系示意图展示
- 站点关键词查询和线路高亮
- 按“换乘次数优先、站数次之”生成路径方案
- 页面直接提供 STAC、JSON、XML 数据入口
- PostGIS 保存站点 Point 与区间 LineString
- Neo4j 保存 `Station`、`MetroLine`、`NEXT_TO`、`ON_LINE` 关系
