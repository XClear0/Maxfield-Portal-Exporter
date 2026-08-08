# Maxfield Portal Exporter

一个运行在 [IITC-CE](https://iitc.app/) 中的用户脚本，用于把 Draw Tools 图形或 Portal Bookmarks 转换为 [Ingress Maxfield](https://github.com/XClear0/maxfield) 可直接读取的 Portal 列表。

脚本可以读取 C.O.R.E. Inventory 中的真实 Key 数量，并将普通背包与 Capsule / Key Locker 中属于同一 Portal 的 Key 合并统计；还可以扫描 Intel 当前已加载的真实 Link，生成 Maxfield 的有向 `EXISTING_LINK` 指令。导出结果可以直接复制，或下载为 UTF-8 编码的 `maxfield-portals.txt`。

> 本项目是非官方工具，与 Niantic、Ingress、IITC-CE 或 Maxfield 项目没有隶属关系。

## 脚本链接

[点击安装](https://github.com/XClear0/Maxfield-Portal-Exporter/raw/refs/heads/main/iitc-maxfield-portal-exporter.user.js)

## 主要功能

- 从 Draw Tools 线段、Polyline、Polygon 和 Marker 的顶点匹配 Portal；
- 导出 Draw Tools 多边形、矩形和圆形区域内的 Portal；
- 合并顶点匹配结果与区域内 Portal；
- 导出指定的 IITC Bookmarks 文件夹；
- 顶点按可配置距离匹配最近 Portal，默认距离为 25 米；
- 同时使用当前已加载 Portal 和 Bookmarks 作为候选数据；
- 提示未匹配的 Draw Tools 顶点及最近 Portal 距离；
- 从 Intel `window.links` 读取当前已经存在的 Link；
- 只导出两个端点都属于所选 Portal 集合的己方 Link；
- 使用 Intel `oGuid → dGuid` 作为实际 Link 方向；
- Draw Tools 仅用于选择 Portal 或区域，绘制线不会直接成为 Existing Link；
- 按最终 Portal 行顺序输出 Maxfield `EXISTING_LINK; 起点 ID; 终点 ID` 指令；
- 自动去重并处理同名 Portal；
- 自动移除名称中的 `;`、`#` 和换行符，避免 Maxfield 误解析；
- 自动读取 C.O.R.E. Inventory、Live Inventory 或 IITC Keys 中的 Key 数量；
- 汇总普通背包和 Capsule / Key Locker 中的 Key；
- 使用 10 分钟库存缓存，避免频繁请求 Intel；
- 支持复制结果和下载 `maxfield-portals.txt`；
- 保存上次使用的导出模式、匹配距离、Bookmarks 文件夹、Key 及 Existing Link 选项。

## 运行要求

### 必需

- 已登录的 [Ingress Intel Map](https://intel.ingress.com/)
- IITC-CE
- Tampermonkey、Violentmonkey 或其他兼容用户脚本管理器

### 按功能选装

| 组件 | 用途 |
| --- | --- |
| Draw Tools | 使用顶点、区域或合并导出模式时必需 |
| Bookmarks | 提供 Bookmarks 文件夹导出，并补充未加载的 Portal 数据 |
| Live Inventory | 首选的 C.O.R.E. Key 数据源 |
| Keys | C.O.R.E. Inventory 不可用时的手工库存回退数据源 |
| C.O.R.E. 订阅 | 通过 Intel Inventory 接口自动读取真实库存时必需 |

不使用库存功能时，无需安装 Live Inventory、Keys，也不需要 C.O.R.E. 订阅；取消勾选“包含已有 Key 数量”即可。

## 安装

1. 下载仓库中的 [`iitc-maxfield-portal-exporter.user.js`](./iitc-maxfield-portal-exporter.user.js)。
2. 在用户脚本管理器中打开或导入该文件。
3. 确认安装脚本。
4. 刷新 `https://intel.ingress.com/`。
5. 在 IITC 的工具箱中找到 **Maxfield Export**。

如果浏览器只是显示脚本文本，可在 Tampermonkey 中使用：

```text
管理面板 → 实用工具 → 从文件导入
```

## 使用方法

打开：

```text
IITC → Toolbox → Maxfield Export
```

导出窗口提供四种数据来源。

### Draw Tools 顶点

适合导出已经画好的 Link 规划所涉及的 Portal。

1. 使用 Draw Tools 绘制线段、Polyline 或 Polygon；也可以放置 Marker。
2. 打开 **Maxfield Export**。
3. 选择 **Draw Tools 顶点**。
4. 设置顶点匹配距离，默认为 `25` 米。
5. 点击 **重新生成**。
6. 检查是否存在未匹配顶点。
7. 复制结果或下载 TXT。

脚本会将每个 Draw Tools 顶点匹配到距离最近的 Portal。匹配候选包括：

- IITC 当前已经加载的 Portal；
- 所有 Bookmarks 文件夹中的 Portal。

建议在 Draw Tools 中启用 Portal 吸附，并尽量把端点准确放在 Portal 中心。圆形不提供顶点，只参与区域导出。

### Draw Tools 区域内

适合从一个候选区域中导出所有 Portal。

1. 使用 Draw Tools 绘制 Polygon、Rectangle 或 Circle。
2. 移动和缩放地图，让区域内 Portal 完整加载。
3. 选择 **Draw Tools 区域内**。
4. 点击 **重新生成**。

区域候选数据来自：

- IITC 当前已经加载的 Portal；
- Bookmarks 中保存的 Portal。

脚本不会主动向 Intel 批量请求区域内尚未加载的 Portal。因此，大范围导出前应分块移动地图并等待数据加载，或先把相关 Portal 加入 Bookmarks。

### 顶点 + 区域（合并）

此模式同时执行顶点匹配和区域筛选，然后按 Portal GUID 或坐标去重。适合在一个候选区域基础上，额外加入外围锚点或规划线端点。

### Bookmarks 文件夹

选择 **Bookmarks 文件夹** 后，可以直接导出某个 IITC Portal Bookmarks 文件夹中的全部 Portal，不需要 Draw Tools。

## 导出现有 Link

最新版 Maxfield 可以在 Portal 文件中声明行动期间需要保留的己方现有 Link：

```text
EXISTING_LINK; 0; 1
```

这表示有向 Link `Portal 0 → Portal 1`。Portal ID 从 `0` 开始，按照文件中有效 Portal 行的顺序分配；空行、注释和 `EXISTING_LINK` 行不占用 ID。方向固定并占用起点 Portal 的出链容量，因此不能只知道两个端点而忽略方向。

### 数据来源和操作流程

1. 在 Intel 中移动和缩放地图，确保需要保留的 Portal 和 Link 已经加载并显示；
2. 使用 Draw Tools 顶点或区域选择本次需要导出的 Portal，也可以选择 Bookmarks 文件夹；
3. 打开 **Maxfield Export**；
4. 勾选 **导出所选 Portal 间已加载的己方 Intel Link**；
5. 点击 **重新生成**；
6. 检查 Intel 已加载 Link 数量和已导出的 `EXISTING_LINK` 数量。

脚本先建立所选 Portal 的 GUID 映射，然后直接遍历 `window.links`。只有 `oGuid` 和 `dGuid` 都在所选 Portal 集合中的真实 Intel Link 才会导出，方向始终使用：

```js
link.options.data.oGuid // 起点 Portal GUID
link.options.data.dGuid // 终点 Portal GUID
```

Draw Tools Polyline 即使连接了两个 Portal，也只影响顶点模式下选中了哪些 Portal。若 Intel 中不存在对应 Link，该线不会生成 `EXISTING_LINK`。

### Existing Link 导出规则

- Existing Link 的唯一数据源是 IITC 当前的 `window.links`；
- Draw Tools Polyline、Polygon 边界、Circle 和 Marker 都不会直接生成 Link；
- Link 的两个端点都必须已经被当前导出范围选中；
- 顶点、区域和 Bookmarks 模式均可导出所选 Portal 之间的 Intel Link；
- 只导出当前玩家阵营的 Link，已识别的敌方 Link 会忽略；
- 尚未建立或当前地图尚未加载的 Link 不会导出；
- 相同端点的重复线会按无向 Portal 对去重；
- 指令使用最终 Portal 行顺序对应的零基整数 ID，避免名称重复或名称清理造成歧义；
- 该功能只应用于行动期间继续保留的己方现有 Link，不应把尚未建立的规划线标记为 `EXISTING_LINK`。

## C.O.R.E. Inventory 与 Key 数量

勾选“包含已有 Key 数量”后，每个 Portal 会按照以下顺序选择库存来源：

1. `window.plugin.LiveInventory.keyMap`
2. 本插件仍在有效期内的 C.O.R.E. Inventory 缓存
3. `window.plugin.keys.keys` 中的 IITC Keys 手工记录
4. `0`

Live Inventory 的 `keyMap` 一旦可用，就始终拥有最高优先级。若当前使用的是完整的 Live Inventory 或 C.O.R.E. Inventory 映射，而某个 Portal GUID 不在映射中，该 Portal 的数量会被视为 `0`，不会再混入 Keys 插件的手工数值。

### 直接读取 C.O.R.E. Inventory

未安装 Live Inventory 时，本插件也可以通过 IITC 的登录会话读取库存：

```text
getHasActiveSubscription
→ getInventory
→ 按 Portal GUID 汇总 Key
→ 写入 10 分钟本地缓存
```

普通背包中的 Key 以单个实体统计；Capsule 和 Key Locker 中的堆叠 Key 使用 `itemGuids.length` 统计。两部分最终合并为 Maxfield 输入文件中的 `Have` 数量。

### 刷新按钮

- **刷新库存（遵守缓存）**：缓存仍在 10 分钟有效期内时不重新请求 Intel；
- **强制刷新**：忽略缓存并立即重新请求，执行前会要求确认。

插件初始化时，如果没有安装 Live Inventory 且不存在有效缓存，会自动尝试读取一次 C.O.R.E. Inventory。

过期缓存不会用于导出。读取失败时，脚本会显示错误，并回退到 IITC Keys 或 `0`。

## 输出格式

开启 Key 数量后，每行格式为：

```text
Portal 名称; Intel URL; 已有 Key 数量
```

例如：

```text
人民广场雕塑; https://intel.ingress.com/intel?ll=31.230400,121.473700&z=17&pll=31.230400,121.473700; 7
上海博物馆; https://intel.ingress.com/intel?ll=31.228300,121.475200&z=17&pll=31.228300,121.475200; 2
```

取消勾选“包含已有 Key 数量”后，第三列会被省略：

```text
人民广场雕塑; https://intel.ingress.com/intel?ll=31.230400,121.473700&z=17&pll=31.230400,121.473700
```

### Portal 名称处理

Maxfield 使用英文分号拆分字段，并将 `#` 视为注释。导出时脚本会：

- 将 `;` 和 `#` 替换为空格；
- 移除换行和制表符；
- 合并连续空格；
- 为重名 Portal 添加 `(2)`、`(3)` 等序号。

Portal 名称处理不会影响 Existing Link 的端点解析。脚本会在最终 Portal 顺序确定后分配从 `0` 开始的 ID，例如：

```text
Portal Alpha; https://intel.ingress.com/intel?...&pll=31.230400,121.473700; 3
Portal Bravo; https://intel.ingress.com/intel?...&pll=31.231000,121.474500; 1

# Existing friendly links retained in Intel
EXISTING_LINK; 0; 1
```

这里的 `0` 是 `Portal Alpha`，`1` 是 `Portal Bravo`。该编号与 Maxfield 地图及结果文件中的 `#` 编号一致。

### SBUL

脚本不会判断 Portal 是否已经安装或计划安装 SBUL。需要时可以在导出文本框中手动追加：

```text
Portal 名称; Intel URL; Key 数量; SBUL
```

例如：

```text
人民广场雕塑; https://intel.ingress.com/intel?ll=31.230400,121.473700&z=17&pll=31.230400,121.473700; 7; SBUL
```

编辑完成后再点击“复制”或“下载 TXT”，脚本会使用文本框中的当前内容。

## 运行 Maxfield

下载文件后，可以将其直接传给本地 Maxfield：

```bash
maxfield-plan maxfield-portals.txt \
  --num_agents 1 \
  --verbose \
  --output_csv
```

使用 Docker 时，可在包含 `maxfield-portals.txt` 的目录中运行：

```powershell
docker run --rm `
  --mount "type=bind,source=$PWD,target=/app" `
  maxfield `
  ./maxfield-portals.txt `
  --num_agents 1 `
  --verbose `
  --output_csv
```

具体安装方式和参数以 [Maxfield 项目文档](https://github.com/XClear0/maxfield) 为准。

## 常见问题

### 工具箱中没有 Maxfield Export

- 确认脚本已启用；
- 确认当前页面是 `https://intel.ingress.com/`；
- 确认 IITC-CE 已正常加载；
- 刷新 Intel 页面；
- 查看浏览器控制台是否出现 `Maxfield Portal Exporter v2.2.0 loaded`。

### 提示 Draw Tools 未安装或尚未加载

顶点、区域和合并模式依赖 Draw Tools。安装并启用 Draw Tools 后刷新 Intel，或改用 Bookmarks 文件夹模式。

### Draw Tools 顶点没有匹配到 Portal

- 放大地图并等待目标 Portal 加载；
- 把目标 Portal 加入 Bookmarks；
- 确认顶点画在正确位置；
- 适当增加匹配距离；
- 不要把过大的匹配距离当作常规设置，以免匹配到错误 Portal。

未匹配列表会显示顶点坐标、最近 Portal 名称和距离。复制或下载存在未匹配顶点的结果前，脚本会再次确认。

### 区域内缺少 Portal

区域模式不会批量获取未加载的 Intel 数据。请分块移动地图、等待 Portal 出现，或使用 Bookmarks 补充数据后重新生成。

### Intel 现有 Link 没有导出为 EXISTING_LINK

- 确认勾选了“导出所选 Portal 间已加载的己方 Intel Link”；
- 确认 Link 在 Intel 中已经实际存在并且当前已加载显示；
- 确认起点和终点 Portal 都包含在当前导出的 Portal 列表中；
- 确认该 Link 属于当前玩家阵营；
- 放大并移动地图，等待 Portal 和 Link 数据完整加载后重新生成；
- Draw Tools 规划线本身不会被导出，除非 Intel 中确实存在相同端点的真实 Link。

### Key 数量全部为 0

依次检查：

1. 是否勾选“包含已有 Key 数量”；
2. Live Inventory 是否已经完成加载；
3. 当前账号是否具有有效 C.O.R.E. 订阅；
4. 点击“刷新库存（遵守缓存）”查看具体错误；
5. 如果使用 Keys 回退，确认 Keys 插件中已经手工录入数量。

### 中文文件读取异常

下载的 TXT 使用 UTF-8 并带 BOM。若本地 Python 环境仍出现编码错误，可在运行 Maxfield 前启用 Python UTF-8 模式。

PowerShell：

```powershell
$env:PYTHONUTF8=1
```

Bash：

```bash
export PYTHONUTF8=1
```

## 数据与隐私

- 库存请求通过 IITC 的 `window.postAjax()` 发送到当前已登录的 Intel 会话；
- 脚本不会把 Portal、Bookmarks 或 Inventory 上传到第三方服务器；
- C.O.R.E. Inventory 缓存和界面设置只保存在浏览器 `localStorage` 中；
- 导出文件仅在浏览器本地生成。

## 开发与检查

脚本是一个无需构建步骤的单文件用户脚本。修改后可以使用 Node.js 做基本语法检查：

```bash
node --check iitc-maxfield-portal-exporter.user.js
```

当前脚本版本：`2.2.0`。

## 开源许可

本项目采用 [MIT License](./LICENSE) 开源。使用、复制、修改或分发本脚本时，须保留版权与许可声明。

## 相关项目

- [IITC-CE](https://github.com/IITC-CE/ingress-intel-total-conversion)
- [IITC-CE Community Plugins](https://github.com/IITC-CE/Community-plugins)
- [Ingress Maxfield](https://github.com/XClear0/maxfield)
