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

---

## 一、本地开发

### 前提条件

- Docker Desktop（运行中）
- Node.js 18+

### 1. 启动数据库容器

```powershell
docker compose up -d
```

验证：

```powershell
docker ps
# 应看到 webgis-postgres 和 webgis-neo4j 两个容器
```

### 2. 初始化地铁数据

```powershell
cd server
npm.cmd install
npm.cmd run init-db
```

### 3. 启动后端

```powershell
npm.cmd run dev
```

### 4. 启动前端（另开终端）

```powershell
cd client
npm.cmd install
npm.cmd run dev
```

### 5. 访问

- 前端页面：http://localhost:5173
- Neo4j Browser：http://localhost:7474

### 数据库信息

```text
PostgreSQL/PostGIS: localhost:5432
数据库: webgis
用户/密码: postgres/postgres

Neo4j Browser: http://localhost:7474
用户/密码: neo4j/neo4j123456
```

---

## 二、阿里云服务器部署

### 前提条件

- 阿里云 ECS 实例（建议 2 核 4G 以上，系统 CentOS 7+ / Ubuntu 20.04+）
- 安全组已放行端口：**80**（前端）、**5000**（后端 API，可选）、**7474**（Neo4j，可选）
- 已绑定公网 IP（如 `47.xx.xx.xx`）

### 步骤 1：连接到服务器

```bash
ssh root@47.xx.xx.xx
```

### 步骤 2：安装 Docker

**Ubuntu / Debian：**

```bash
# 安装依赖
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release

# 添加 Docker 官方 GPG 密钥
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# 添加阿里云镜像源（国内更快）
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装 Docker Engine + Docker Compose 插件
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

**CentOS 7+：**

```bash
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
```

### 步骤 3：验证安装

```bash
docker --version
docker compose version
```

### 步骤 4：上传项目到服务器

在**本地**（你的 Windows 电脑）打包项目：

```powershell
cd C:\Users\hly\Desktop\"Junior spring semester"
tar -czf wuhan_subway.tar.gz --exclude=node_modules --exclude=dist --exclude=.git wuhan_subway
```

上传到服务器：

```bash
scp wuhan_subway.tar.gz root@47.xx.xx.xx:/root/
```

在**服务器**上解压：

```bash
cd /root
tar -xzf wuhan_subway.tar.gz
cd wuhan_subway
```

### 步骤 5：启动所有服务

```bash
# 构建镜像并启动（-d 后台运行）
docker compose up -d --build
```

这个过程会：
- 拉取 postgis/postgis:15-3.3（PostgreSQL）
- 拉取 neo4j:5-community（图数据库）
- 构建 server 镜像（Node.js 后端）
- 构建 client 镜像（Nginx 前端）

### 步骤 6：初始化数据库

```bash
docker compose --profile init run --rm init-db
```

> 如果 Neo4j 启动较慢，可能报连接超时。等一分钟后再执行一次即可。

### 步骤 7：验证部署

```bash
# 查看容器状态
docker compose ps
# 应看到 4 个容器均为 Up 状态

# 测试后端
curl http://localhost:5000/api/health

# 测试前端
curl http://localhost:80
```

### 步骤 8：访问

在浏览器打开：`http://47.xx.xx.xx`

---

## 三、服务端口说明

| 容器 | 内部端口 | 对外端口 | 说明 |
|------|----------|----------|------|
| client (Nginx) | 80 | 80 | 前端页面 + API 反向代理 |
| server (Express) | 5000 | 5000 | 后端 API（Nginx 内部代理，可不对外） |
| postgres | 5432 | 5432 | PostgreSQL（建议仅内部使用） |
| neo4j | 7474/7687 | 7474/7687 | Neo4j HTTP + Bolt（建议仅内部使用） |

## 四、安全配置建议（生产环境）

1. **修改数据库密码**：编辑 `.env.example` 中的密码，创建 `.env` 文件后通过 `docker compose --env-file .env up -d` 启动

2. **收紧安全组**：只对公网开放 **80** 端口；5432、5000、7474、7687 仅放开内网或关闭

3. **配置 HTTPS**：在 Nginx 配置中添加 SSL 证书（推荐 Let's Encrypt 免费证书）

4. **防火墙**：

```bash
# 仅开放必要端口
sudo ufw allow 80/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

## 五、日常运维命令

```bash
# 查看日志
docker compose logs -f --tail=100 server

# 重启某个服务
docker compose restart server

# 停止所有服务
docker compose down

# 停止并删除数据库卷（慎用！会清空数据）
docker compose down -v

# 重新构建并启动
docker compose up -d --build

# 查看资源占用
docker stats
```

---

## API 文档

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
- 按"换乘次数优先、站数次之"生成路径方案
- 页面直接提供 STAC、JSON、XML 数据入口
- PostGIS 保存站点 Point 与区间 LineString
- Neo4j 保存 `Station`、`MetroLine`、`NEXT_TO`、`ON_LINE` 关系
