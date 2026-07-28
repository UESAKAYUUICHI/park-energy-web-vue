# 园区能源计费门户

Vue 3 展示前端，视觉布局参照 `../Docs/park-energy-billing-portal-copy.html`，业务请求严格对接 `park-energy-platform` 的实际路由和返回结构。

## 启动

```powershell
pnpm install
pnpm dev
```

默认通过 Vite 代理将 `/api` 转发到 `http://localhost:8103`；也可复制 `.env.example` 为 `.env.local`，设置 `VITE_PLATFORM_BASE_URL`。

## 关键约定

- 登录使用 `/api/platform/auth/login`，令牌自动写入 `Authorization: Bearer <token>`。
- Platform 外层响应必须为 `{ code: 0, message, data }`；列表使用 `records/total/pageNum/pageSize/pages`。
- 数据中心和接入层的代理结果会解开其内层 `{ success, message, data }` 信封。
- 后端服务不可达、无权限或接口失败时展示真实错误与重试入口，不生成模拟业务数据。
- 前端只以 `permissions` 判定功能可见性；`menus` 仅用于服务端菜单展示，不能视为授权依据。

## 覆盖功能

经营总览、档案、实时监控、历史分析、能耗/质量、告警事件/处置/规则、结算/账单/计费配置、接入诊断/设备控制/指令追踪、用户/角色/权限/审计及个人中心均有对应的真实路由。设备类型批量测点配置、报文解析测试、账单试算与生成、缴费与作废均调用 Platform 的专用接口。

## 业务闭环设计

更细的前端页面闭环设计见 [BUSINESS_CLOSED_LOOP.md](./BUSINESS_CLOSED_LOOP.md)。

## 第一阶段设计

第一阶段开发拆解见 [PHASE1_MODULE_DESIGN.md](./PHASE1_MODULE_DESIGN.md)。
