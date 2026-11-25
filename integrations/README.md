# 业务应用接入配置

| 应用 | 配置 | 说明 |
|------|------|------|
| AI Smart 儿童英语 | [`ai-smart-english.env.example`](./ai-smart-english.env.example) | 对应 ApplicationKey=`ai-smart-english` |

## 流程

1. 启动中台：`cd platform-api && npm run start:dev`
2. 种子与密钥：`npm run prisma:seed`，再轮换 TenantApp secret（见脚本或运营接口）
3. 把 `VITE_*` 写入业务仓 `.env.local`；`CLIENT_SECRET` 仅服务端使用
4. 业务仓实现：登录 SSO、权益查询、订单/用量事件回传

真实密钥文件 `*.env` 已 gitignore，勿提交。
