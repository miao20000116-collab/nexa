# Nexa V2.1 AI Smoke Test Result

> 测试时间：2026-09-02T11:10:13.508Z
> 输入：`什么是 RAG？`
> hardcode：否

## 结果

- **status**: `blocked_ai_unavailable`
- **configured**: false
- **available**: false

### 未获得真实回答

```
AI 服务暂未接入：请在服务端 .env 配置 AI_BASE_URL 与 AI_API_KEY
```

请在服务端 `.env` 配置：

```
AI_BASE_URL=https://your-domestic-endpoint/v1
AI_API_KEY=server_side_key_only
AI_MODEL_MAIN=your-model-id
```

然后重新运行：`npx tsx scripts/ai-smoke-rag.ts`

