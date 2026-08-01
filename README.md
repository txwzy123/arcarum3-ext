# 碧蓝幻想 · 转世/沙盒活动 · 地图接口发现 & 路径规划

## Chrome 扩展（推荐：实时地图）

独立窗口看全图 + 缩放，侧边栏只负责状态与打开窗口：

→ 见 [`arcarum3-ext/README.md`](arcarum3-ext/README.md)

```
chrome://extensions → 开发者模式 → 加载已解压 → 选择 arcarum3-ext/
游戏进沙盒 → 侧边栏「打开地图窗口」
```

## 目标

1. **发现** 沙盒地图数据对应的 XHR/Fetch 接口  
2. **解析** 格子/节点/连通关系  
3. **规划** 最短/最优路径（在确认地图结构后）

当前阶段：**地图接口已确认**（见 `docs/map-schema.md`）→ 路径规划可用 → 可继续抓 `move_node` 看状态变化

---

## 你不需要装浏览器 MCP

| 角色 | 做什么 |
|------|--------|
| 你（浏览器） | 进沙盒、移动/刷新、导出 HAR |
| 本仓库脚本 | 扫 HAR，按「像地图」的特征打分排序 |
| 我（Grok） | 根据高分接口精读 JSON，反推 schema + 路径算法 |

---

## 推荐抓包流程（Chrome / Edge）

1. 打开游戏页 → `F12` → **Network**
2. 勾选 **Preserve log**，过滤类型选 **Fetch/XHR**（先别选 All，噪音太大）
3. 清空记录（🚫）
4. **只做与地图相关的操作**（每次一组，便于对比）:
   - A. 首次进入沙盒地图
   - B. 刷新页面再进地图
   - C. 移动一格 / 换层 / 开迷雾 / 触发事件（各做一次单独 HAR）
5. 右键列表空白处 → **Save all as HAR with content**
6. 存到本目录：

```
captures/
  01_enter_map.har
  02_refresh_map.har
  03_move_one_step.har
  04_change_floor.har   # 若有分层
```

7. 运行分析：

```powershell
cd <project-root>
python tools/analyze_har.py captures/01_enter_map.har
# 或扫整个目录
python tools/analyze_har.py captures/
```

8. 看终端里的 **Top 候选**，把前几名的：
   - URL
   - 脚本导出的 `out/<name>_entry_N.json`  
   发给我，或继续跑对比：

```powershell
# 两次进图都出现的 JSON 接口（更像「地图资源」而不是一次性动画）
python tools/diff_har.py captures/01_enter_map.har captures/02_refresh_map.har

# 移动前后差异大的接口（更像「状态」而不是静态地图）
python tools/diff_har.py captures/01_enter_map.har captures/03_move_one_step.har --mode state
```

---

## 地图接口通常长什么样（启发式）

脚本会给这些特征加分：

- URL / body 含：`map` `stage` `field` `area` `tile` `cell` `node` `grid` `maze` `sandbox` `explore` `position` `x` `y` 等  
- JSON 里出现 **二维数组**、或大量 `{x,y}` / `{pos}` / `width`+`height`  
- 列表项结构高度一致（格子列表）  
- 响应体积中等偏大（几 KB～几百 KB），且为 `application/json`  
- **排除**：`.js` `.css` `.png` 字体、CDN 静态资源、纯 HTML

GBF 常见形态（仅供参考，以你抓到的为准）：

- 域名：`game.granbluefantasy.jp`
- 路径：`/rest/...` 或活动专用 path
- body 常包在 `data` / 多层 key 里，字段可能是数字枚举

---

## 目录结构

```
.
  captures/          # 你放 HAR
  out/               # 脚本导出的候选 JSON
  tools/
    analyze_har.py   # HAR 打分 + 导出
    diff_har.py      # 两次抓包对比
    pathfind.py      # 地图 schema 确认后的路径规划（骨架）
  docs/
    workflow.md      # 详细操作与对照实验
```

---

## 已确认：地图主接口

```
GET /arcarum3/dungeon/content/index/0
→ option.dungeon.node_list   # 154 个节点 + adjacent_node_ids
→ option.dungeon.current_node_id
→ option.dungeon.node_icon_info  # 事件图例
```

移动接口：`rest/arcarum3/dungeon/move_node`  

详细字段说明：[`docs/map-schema.md`](docs/map-schema.md)

### 地图窗口（全图 + 官方事件图标）

```powershell
py tools/map_viewer.py
# 或指定 JSON
py tools/map_viewer.py out/001_arcarum3_dungeon_content_index_0.json
```

- 底图：`assets/assets/map_bg/1.jpg`（游戏原图）
- 事件图标：`assets/assets/node_icon/{type}.png`
- 拖拽平移、滚轮缩放；点击节点看详情

### 路径规划示例

```powershell
# 地图摘要
py tools/pathfind.py out/001_arcarum3_dungeon_content_index_0.json --summary

# 从当前位置到最近宝箱 / 回复 / 商店
py tools/pathfind.py out/001_arcarum3_dungeon_content_index_0.json --goal-type treasure --nearest
py tools/pathfind.py out/001_arcarum3_dungeon_content_index_0.json --goal-type healing --nearest
py tools/pathfind.py out/001_arcarum3_dungeon_content_index_0.json --start 2 --goal 48
```

**注意**：自动化操作游戏账号可能违反服务条款；本工具默认只做 **离线 HAR 分析 + 路径计算**，不替你自动点战斗。
