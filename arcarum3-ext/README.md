# GBF Arcarum3 Map — Chrome 扩展

侧边栏展示地图状态与窗口控制，**独立地图窗口**可在全图与导本记录之间切换，实时拦截游戏接口。

## 架构

```
游戏页 (game.granbluefantasy.jp)
  └─ content/page-hook.js  hook fetch + XHR
  └─ content/bridge.js     转发到 background
       └─ background.js    解析 node_list，写入 storage
            ├─ sidepanel/  地图状态 +「打开地图窗口」
            └─ map/        独立 popup 窗口（地图 + 导本记录）
```

## 安装（开发者模式）

1. Chrome 打开 `chrome://extensions`
2. 打开 **开发者模式**
3. **加载已解压的扩展程序** → 选择扩展目录  
   `...\arcarum3-ext`
4. 固定扩展图标；点击图标打开**侧边栏**

## 使用

1. 打开并登录 [碧蓝幻想](https://game.granbluefantasy.jp)
2. 进入转世沙盒地图 `#arcarum3/dungeon`
3. 侧边栏应显示「已就绪 · N 节点」
4. 点 **打开地图窗口**  
   - 独立窗口，可随意拉大  
   - 顶部 **地图 / 导本** 按钮可切换窗口内容  
   - **滚轮**：以光标为中心缩放  
   - **拖拽**：平移  
   - **双击 / 适应窗口**：整图适配  
5. 在游戏里移动 / 缩圈后，窗口会自动刷新（拦截 `move_node` 等）

## 导本记录

打开独立地图窗口后，使用顶部的 **地图 / 导本** 按钮切换。导本页包含：

- **本次选择（左侧 40%）**：互斥显示 `action_type=401` 的导本候选，或事件格 `scenario_type=2` 的选项、结果说明、`choice_id` 与回合消耗
- **已有导本（右侧 60%）**：保留当前持有、全部收录、稀有度筛选、搜索和导出功能；右侧筛选不影响左侧候选
- **当前持有**：按最新 `spacebook_status_list`、获得/移除事件、商店购买与战斗结算维护数量
- **全部收录**：跨局保留曾在持有列表、事件候选或商店中出现过的导本
- **稀有度筛选**：使用游戏官方 unique / rare / normal / cursed 标签图
- **导出 JSON**：同时导出导本数据库与累计事件选项目录

运行时目录 v3 保存在 `chrome.storage.local` 的 `arcarum3Guidebooks`。当前候选也保存在同一状态中，因此关闭或刷新弹窗后仍会恢复。确认选择并触发 `spacebook_status_add` 时，扩展会在更新持有数量的同时清除候选；若游戏取消选择时没有发出请求，可使用左栏右上角的清除按钮。后续捕获新的 401 会直接替换旧候选。

开始新一局会清空当前持有、商店缓存和未完成候选，**不会清空历史收录**。候选在确认前只进入历史目录，不计入当前持有。

原始名称按接口文本原样保存；界面显示时只去掉游戏文本中的 `@@` 标记。若同一 `status_id` 后来出现不同文本，`rawNames` 会保留所有版本。

### 中日英本地数据库

随扩展维护的基础库位于 [`data/guidebooks.json`](data/guidebooks.json)。每条记录以稳定的 `statusId` 为唯一键，并保存：

- `text.zh-CN`：中文翻译
- `text.ja`：日文原文
- `text.en`：英文原文
- `observedTexts`：抓包遇到过的所有语言文本
- 稀有度、图标类型、来源和首次/末次发现时间

显示顺序为：中文 → 最近一次接口原文 → 日文 → 英文 → 未知 ID。无法可靠判断语言的文本标记为 `und`，不会误填到中文字段。

事件完整数据库位于 [`data/events.json`](data/events.json)，接口原文、观测记录和选项元数据均保存在这里；它通常由合并工具生成，不建议手工编辑。人工维护的中文场景、选项翻译和收益风险备注位于 [`data/events.zh-CN.json`](data/events.zh-CN.json)，扩展启动时会自动把该覆盖层合入完整数据库。普通事件以六位 `selectionId` 为键并使用 `eventKind: "normal"`；特殊事件以 `special:<special_incident_id>` 为键并使用 `eventKind: "special"`。请在 `events.zh-CN.json` 对应条目的 `notes.zh-CN` 中填写备注；普通事件备注会显示在左侧事件选项列表下方。特殊事件当前保存已有名称和玩法说明，实际对话与选项需要抓取对应接口后补充。

扩展不会自动下载数据库。运行中新增的数据保存在 `chrome.storage.local`；在地图窗口点击导出按钮时，会同时下载：

```text
gbf-guidebooks-<时间戳>.json
gbf-events-<时间戳>.json
```

只有手动点击导出按钮才会产生文件。事件目录按选项 ID 的公共前缀分组，保留场景叙述、图片标识、每个 `choice_id` 的多语言标题与结果、回合消耗、首次和最后出现时间。

修改基础库或升级扩展后，需要在 `chrome://extensions` 重载扩展，再刷新游戏页面。

### 合并其他玩家的数据库

把多个 `guidebooks.local.json` 放到工作区后运行：

```powershell
node tools/merge_guidebook_databases.mjs --output arcarum3-ext/data/guidebooks.json player-a.json player-b.json
node tools/merge_event_databases.mjs --output arcarum3-ext/data/events.json events-a.json events-b.json
```

相同 ID 的空语言字段会自动补齐，观察文本和来源会去重合并。两个非空翻译不一致时不会静默覆盖，工具会保留第一个输入的内容，同时生成：

```text
arcarum3-ext/data/guidebooks.conflicts.json
```

无冲突时退出码为 `0`；存在冲突时文件仍会生成，但退出码为 `2`，需要人工确认冲突报告。

## 地图窗口 UI（对齐贤者助手）

- **左下角图例**：图标条，可筛选高亮（再点取消）；工具栏「左下图例」或「图例」按钮可显隐/收起  
- **右下角**：+/− 缩放  
- **右侧详情**：加大中文说明；调试字段折叠在「调试字段」里  
- **路径规划**：最短 / 收益 / 安全；右键设目标与途经  

## 节点详情（玩法说明）

点击地图节点时，右侧会显示：

- **中文类型名** + type / special_incident_id  
- **玩法说明**（对齐 arcarumDungeon 知识库）  
- **官方图例**一行（`node_icon_info`）  
- 状态：当前位置 / 已访问 / 瘴气 / 任务格  

文案：`shared/nodeTypes.js`、`shared/nodeDetail.js`。  
寻路说明：[`docs/pathfinding.md`](../docs/pathfinding.md)。

## 关于 Boss

首次进图通常 **没有** `node_type=1`。  
Boss 在首次缩圈时由服务端把某个已有节点改成 Boss；扩展会在后续接口里更新。

## 权限说明

- 仅匹配 `game.granbluefantasy.jp` 与 GBF 静态 CDN  
- 数据存在本地 `chrome.storage`，不上传  
- 导本和事件数据库只在用户点击导出按钮时下载  
- 仅供个人离线分析 / 路径观察，请勿用于自动化操作账号

## 手动调试

- 侧边栏点「刷新状态」  
- 扩展 service worker 日志：`chrome://extensions` → 本扩展 → Service Worker  
- 若无数据：确认已进沙盒地图，F12 Network 里是否有  
  `arcarum3/dungeon/content/index/`
