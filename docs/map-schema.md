# Arcarum3 沙盒地图 Schema

基于 HAR 抓包 `captures/01_enter_map.har` 确认。

## 主接口（地图全量）

```
GET /arcarum3/dungeon/content/index/{map_or_layer?}
```

示例：

```
GET https://game.granbluefantasy.jp/arcarum3/dungeon/content/index/0?_=...&t=...&uid=...
```

- 响应：`application/json`，约 140KB
- 地图逻辑数据在 **`option.dungeon`**（`data` 字段是 HTML 壳，可忽略）

## 移动 / 事件相关 REST

| 方法路径 | 用途 |
|---------|------|
| `rest/arcarum3/dungeon/move_node` | 移动到邻接节点 |
| `rest/arcarum3/dungeon/finish_node_event` | 结束节点事件 |
| `rest/arcarum3/dungeon/proceed_node_event*` | 推进各类节点事件 |
| `rest/arcarum3/dungeon/incident_choose` | 特殊事件选择 |
| `rest/arcarum3/dungeon/party_status` | 队伍状态 |
| `rest/arcarum3/dungeon/dungeon_item_list` | 道具列表 |
| `rest/arcarum3/dungeon/dungeon_shop_lineup/` | 商店 |
| `rest/arcarum3/dungeon/retire_dungeon` | 撤退 |
| `rest/arcarum3/start_dungeon` | 开始探索 |

## `option.dungeon` 关键字段

| 字段 | 含义 |
|------|------|
| `name` | 地图名（如 Allotropic Microcosm） |
| `map_id` | 地图 ID |
| `current_node_id` | **玩家当前所在节点** |
| `node_list` | 全部节点（图） |
| `node_icon_info` | 图例：类型 → 名称/说明 |
| `miasma_info` | 瘴气状态 |
| `possession_arcarum3_dungeon_point` | 探索点数 |
| `dungeon_status` | 副本状态枚举 |
| `total_turn` | 回合/步数 |
| `hint` | 教程提示（含 `target_node_types`） |

## 节点 `node_list[]`

不是网格，而是 **带坐标的图节点**：

```json
{
  "node_id": 1,
  "position_x": 1134,
  "position_y": 634,
  "node_type": 0,
  "adjacent_node_ids": [21, 60, 62, 84],
  "is_shrinking": false,
  "is_visited": false,
  "is_quest_check": false,
  "special_incident_id": null
}
```

| 字段 | 含义 |
|------|------|
| `node_id` | 节点 ID（路径规划主键） |
| `position_x` / `position_y` | UI 像素坐标（仅用于展示，寻路用邻接） |
| `node_type` | 事件类型（见下表） |
| `adjacent_node_ids` | **可直接走到的邻接点**（边） |
| `is_visited` | 是否已访问 |
| `is_shrinking` | 是否在瘴气/安全区外（毒圈开启后：距圆心 > 安全半径则为 true） |
| `is_quest_check` | 是否与任务检测相关 |
| `special_incident_id` | `node_type=10` 时的特殊事件子类型 |

截图对应关系：

- 地图上的 **点** = `node_list` 每一项  
- **连线** = `adjacent_node_ids`  
- **小图标** = `node_type`（+ 可选 `special_incident_id`）

## `node_type` 图例

对齐 `node_icon_info` 与参考项目 [arcarumDungeon](https://github.com/)（本地 `Desktop/arcarumDungeon-main`）知识库。

| type | 名称 | 说明 |
|-----:|------|------|
| 0 | 空地 | 无事件，可安全经过 |
| 1 | Boss | 探索目标；不可撤退。**首包通常不存在**，缩圈时改写某 `node_id` 的 type |
| 2 | 普通战斗 | 常规战；阶段 1 寻路高价值途经 |
| 3 | 强敌 | 难度更高；寻路建议避开 |
| 4 | 君临者 | 区域领主级遭遇 |
| 5 | 事件 | 随机事件；可能掉火山监狱钥匙；战不可撤退 |
| 6 | 宝箱 | 选导本效果 |
| 7 | 回复 | 约 30% HP + 复活 |
| 8 | 商店 | 可反复进；货不刷新（已购不补） |
| 9 | 传送门 | 可选传到其他门 |
| 10 | 特殊 | 见 `special_incident_id` 下表 |
| 11 | 超强敌 | 显著高于强敌 |

### `special_incident_id`（type=10）

官方枚举 `DUNGEON_SPECIAL_NODE_TYPE`（`out/client_constants.typed.js`）：

| id | 枚举 | 中文 | 图标 | 金色底图 `scpecial_node_bg/{id}.png` |
|---:|------|------|------|--------------------------------------|
| 1 | GURU | 邪教祖 | `10_guru` | 无 |
| 2–3 | FANATIC_* | 狂信者 | `10_fanatic` | 无 |
| 4 | FLOATING_CASTLE | 真浮空城 | incident | **有** |
| 5–7 | FLOATING_CASTLE_TELEPORT_* | 浮空城传送口 | teleport / glow | 无 |
| 8 | FLOATING_CASTLE_RESEARCHER | 浮空城研究者 | research | 无 |
| 9 | CLOCK_TOWER | 时停塔/时钟塔 | incident | **有** |
| 10 | FLOWER_GARDEN | 花畑 | incident | **有** |
| 11 | PRISON | 监狱 | incident | **有** |
| 12 | HOT_SPRING | 温泉 | incident | **有** |
| 13 | BLACKSMITH_TABLE | 铁匠台 | incident | **有** |
| 14 | FORT | 要塞 | incident | **有** |
| 15 | CATHEDRAL | 大教堂 | incident | **有** |
| 16 | CAVE | 洞窟 | incident | **有** |
| 17 | STONE_FACE | 石像 | incident | **有** |
| 18 | VILLAGE | 村庄 | incident | **有** |

官方图例（`node_icon_info`，日文）：id 4/9–18 统称 **「特殊イベント」**  
文案：`その場所に対応した特定のイベントが発生するマス`  
→ 地图上的**金色区域**即 `scpecial_node_bg/{id}.png` 地点底图（非毒圈白圈）。

扩展：`arcarum3-ext/shared/nodeTypes.js`、`nodeDetail.js`；绘制见 `map/map.js`。

## 路径规划模型

1. 以 `node_id` 为顶点  
2. 以 `adjacent_node_ids` 为无向边（数据里双向都写了）  
3. BFS 最短跳数；可选避开某些 `node_type`  
4. 起点默认 `current_node_id`  
5. 终点：指定 `node_id`，或「最近的某类型节点」

```powershell
py tools/pathfind.py out/001_arcarum3_dungeon_content_index_0.json --summary
py tools/pathfind.py out/001_arcarum3_dungeon_content_index_0.json --goal-type treasure --nearest
py tools/pathfind.py out/001_arcarum3_dungeon_content_index_0.json --start 2 --goal 48
```

## 导出的中间文件

| 文件 | 内容 |
|------|------|
| `out/001_arcarum3_dungeon_content_index_0.json` | 完整 content/index 响应 |
| `out/map_graph.json` | 精简图（节点+邻接+图例） |
| `out/map_structure_slim.json` | 结构预览 |
| `out/client_api_*.js` | 客户端 schema/fetch（从 HAR 抽出） |
