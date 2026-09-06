-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'guest',
    "authProvider" TEXT,
    "googleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "query" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchResult" (
    "id" TEXT NOT NULL,
    "searchSessionId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "title" TEXT,
    "snippet" TEXT,
    "content" TEXT,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "retrievalMethod" TEXT,
    "rankScore" DOUBLE PRECISION,
    "rawMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "name" TEXT NOT NULL DEFAULT '临时工作区',
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "searchResultId" TEXT,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "snippet" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "thumbnail" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeepResearchJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'workspace',
    "timeRange" TEXT NOT NULL DEFAULT 'all',
    "reportType" TEXT NOT NULL DEFAULT 'quick',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "errorCode" TEXT,
    "report" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DeepResearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "url" TEXT,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreationProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "title" TEXT NOT NULL DEFAULT '未命名创作',
    "goal" TEXT,
    "contentType" TEXT,
    "platform" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "brief" TEXT,
    "timeline" JSONB,
    "content" JSONB,
    "sources" JSONB,
    "startMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreationProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreationAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'reference',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "usage" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreationAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "payload" JSONB,
    "result" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "displayName" TEXT,
    "externalId" TEXT,
    "scopes" TEXT,
    "metadata" JSONB,
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "platform" TEXT NOT NULL,
    "accountId" TEXT,
    "connectionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "externalUrl" TEXT,
    "externalPostId" TEXT,
    "externalId" TEXT,
    "payload" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER,
    "description" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "capability" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCost" DOUBLE PRECISION,
    "creditsUsed" INTEGER,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "errorCode" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoStore" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL DEFAULT 'US',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "cogs" DOUBLE PRECISION NOT NULL,
    "platformFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "fbaFeePerUnit" DOUBLE PRECISION NOT NULL,
    "logisticsFeePerUnit" DOUBLE PRECISION NOT NULL,
    "problemProfile" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoDailyMetric" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "sessions" INTEGER NOT NULL,
    "orders" INTEGER NOT NULL,
    "units" INTEGER NOT NULL,
    "sales" DOUBLE PRECISION NOT NULL,
    "adSpend" DOUBLE PRECISION NOT NULL,
    "adSales" DOUBLE PRECISION NOT NULL,
    "adClicks" INTEGER NOT NULL DEFAULT 0,
    "refunds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refundUnits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DemoDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoAdCampaign" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'sponsored_products',
    "status" TEXT NOT NULL DEFAULT 'enabled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoAdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoAdDaily" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "spend" DOUBLE PRECISION NOT NULL,
    "orders" INTEGER NOT NULL,
    "sales" DOUBLE PRECISION NOT NULL,
    "placementTop" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "placementProduct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "placementRest" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "DemoAdDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoSearchTerm" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL,
    "spend" DOUBLE PRECISION NOT NULL,
    "orders" INTEGER NOT NULL,
    "sales" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DemoSearchTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoInventory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitsOnHand" INTEGER NOT NULL,
    "inboundUnits" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TikTokDemoStore" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL DEFAULT 'US',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TikTokDemoStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TikTokDemoProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "problemProfile" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TikTokDemoProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TikTokDemoDailyMetric" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "exposure" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "orders" INTEGER NOT NULL,
    "gmv" DOUBLE PRECISION NOT NULL,
    "videoGmv" DOUBLE PRECISION NOT NULL,
    "creatorGmv" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "TikTokDemoDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TikTokDemoCreator" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "niche" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TikTokDemoCreator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TikTokDemoVideo" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "creatorId" TEXT,
    "title" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TikTokDemoVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TikTokDemoVideoDaily" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL,
    "productClicks" INTEGER NOT NULL,
    "orders" INTEGER NOT NULL,
    "gmv" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "TikTokDemoVideoDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_token_idx" ON "AuthSession"("token");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "SearchSession_userId_idx" ON "SearchSession"("userId");

-- CreateIndex
CREATE INDEX "SearchResult_searchSessionId_idx" ON "SearchResult"("searchSessionId");

-- CreateIndex
CREATE INDEX "Workspace_sessionId_idx" ON "Workspace"("sessionId");

-- CreateIndex
CREATE INDEX "Workspace_userId_idx" ON "Workspace"("userId");

-- CreateIndex
CREATE INDEX "WorkspaceSource_workspaceId_idx" ON "WorkspaceSource"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSource_workspaceId_url_key" ON "WorkspaceSource"("workspaceId", "url");

-- CreateIndex
CREATE INDEX "DeepResearchJob_workspaceId_idx" ON "DeepResearchJob"("workspaceId");

-- CreateIndex
CREATE INDEX "Asset_userId_idx" ON "Asset"("userId");

-- CreateIndex
CREATE INDEX "Asset_type_idx" ON "Asset"("type");

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE INDEX "CreationProject_userId_idx" ON "CreationProject"("userId");

-- CreateIndex
CREATE INDEX "CreationProject_workspaceId_idx" ON "CreationProject"("workspaceId");

-- CreateIndex
CREATE INDEX "CreationProject_status_idx" ON "CreationProject"("status");

-- CreateIndex
CREATE INDEX "CreationProject_platform_idx" ON "CreationProject"("platform");

-- CreateIndex
CREATE INDEX "CreationAsset_projectId_idx" ON "CreationAsset"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CreationAsset_projectId_assetId_key" ON "CreationAsset"("projectId", "assetId");

-- CreateIndex
CREATE INDEX "Job_userId_idx" ON "Job"("userId");

-- CreateIndex
CREATE INDEX "Job_type_idx" ON "Job"("type");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Connection_provider_idx" ON "Connection"("provider");

-- CreateIndex
CREATE INDEX "Connection_status_idx" ON "Connection"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_userId_provider_key" ON "Connection"("userId", "provider");

-- CreateIndex
CREATE INDEX "PublishRecord_userId_idx" ON "PublishRecord"("userId");

-- CreateIndex
CREATE INDEX "PublishRecord_projectId_idx" ON "PublishRecord"("projectId");

-- CreateIndex
CREATE INDEX "PublishRecord_platform_idx" ON "PublishRecord"("platform");

-- CreateIndex
CREATE INDEX "PublishRecord_status_idx" ON "PublishRecord"("status");

-- CreateIndex
CREATE INDEX "CreditLedger_userId_idx" ON "CreditLedger"("userId");

-- CreateIndex
CREATE INDEX "CreditLedger_type_idx" ON "CreditLedger"("type");

-- CreateIndex
CREATE INDEX "CreditLedger_referenceType_referenceId_idx" ON "CreditLedger"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "AIUsageLog_userId_idx" ON "AIUsageLog"("userId");

-- CreateIndex
CREATE INDEX "AIUsageLog_capability_idx" ON "AIUsageLog"("capability");

-- CreateIndex
CREATE INDEX "AIUsageLog_provider_idx" ON "AIUsageLog"("provider");

-- CreateIndex
CREATE INDEX "AIUsageLog_status_idx" ON "AIUsageLog"("status");

-- CreateIndex
CREATE INDEX "AIUsageLog_createdAt_idx" ON "AIUsageLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SearchCache_cacheKey_key" ON "SearchCache"("cacheKey");

-- CreateIndex
CREATE INDEX "SearchCache_cacheKey_idx" ON "SearchCache"("cacheKey");

-- CreateIndex
CREATE INDEX "SearchCache_expiresAt_idx" ON "SearchCache"("expiresAt");

-- CreateIndex
CREATE INDEX "DemoProduct_storeId_idx" ON "DemoProduct"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoProduct_storeId_asin_key" ON "DemoProduct"("storeId", "asin");

-- CreateIndex
CREATE INDEX "DemoDailyMetric_productId_date_idx" ON "DemoDailyMetric"("productId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DemoDailyMetric_productId_date_key" ON "DemoDailyMetric"("productId", "date");

-- CreateIndex
CREATE INDEX "DemoAdCampaign_productId_idx" ON "DemoAdCampaign"("productId");

-- CreateIndex
CREATE INDEX "DemoAdDaily_campaignId_date_idx" ON "DemoAdDaily"("campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DemoAdDaily_campaignId_date_key" ON "DemoAdDaily"("campaignId", "date");

-- CreateIndex
CREATE INDEX "DemoSearchTerm_campaignId_date_idx" ON "DemoSearchTerm"("campaignId", "date");

-- CreateIndex
CREATE INDEX "DemoSearchTerm_campaignId_term_idx" ON "DemoSearchTerm"("campaignId", "term");

-- CreateIndex
CREATE UNIQUE INDEX "DemoInventory_productId_key" ON "DemoInventory"("productId");

-- CreateIndex
CREATE INDEX "TikTokDemoProduct_storeId_idx" ON "TikTokDemoProduct"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "TikTokDemoProduct_storeId_productId_key" ON "TikTokDemoProduct"("storeId", "productId");

-- CreateIndex
CREATE INDEX "TikTokDemoDailyMetric_productId_date_idx" ON "TikTokDemoDailyMetric"("productId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TikTokDemoDailyMetric_productId_date_key" ON "TikTokDemoDailyMetric"("productId", "date");

-- CreateIndex
CREATE INDEX "TikTokDemoCreator_storeId_idx" ON "TikTokDemoCreator"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "TikTokDemoCreator_storeId_handle_key" ON "TikTokDemoCreator"("storeId", "handle");

-- CreateIndex
CREATE INDEX "TikTokDemoVideo_productId_idx" ON "TikTokDemoVideo"("productId");

-- CreateIndex
CREATE INDEX "TikTokDemoVideo_creatorId_idx" ON "TikTokDemoVideo"("creatorId");

-- CreateIndex
CREATE INDEX "TikTokDemoVideo_theme_idx" ON "TikTokDemoVideo"("theme");

-- CreateIndex
CREATE INDEX "TikTokDemoVideoDaily_videoId_date_idx" ON "TikTokDemoVideoDaily"("videoId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TikTokDemoVideoDaily_videoId_date_key" ON "TikTokDemoVideoDaily"("videoId", "date");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchResult" ADD CONSTRAINT "SearchResult_searchSessionId_fkey" FOREIGN KEY ("searchSessionId") REFERENCES "SearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SearchSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSource" ADD CONSTRAINT "WorkspaceSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSource" ADD CONSTRAINT "WorkspaceSource_searchResultId_fkey" FOREIGN KEY ("searchResultId") REFERENCES "SearchResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeepResearchJob" ADD CONSTRAINT "DeepResearchJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreationProject" ADD CONSTRAINT "CreationProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreationProject" ADD CONSTRAINT "CreationProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreationAsset" ADD CONSTRAINT "CreationAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CreationProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreationAsset" ADD CONSTRAINT "CreationAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishRecord" ADD CONSTRAINT "PublishRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishRecord" ADD CONSTRAINT "PublishRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CreationProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoProduct" ADD CONSTRAINT "DemoProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "DemoStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoDailyMetric" ADD CONSTRAINT "DemoDailyMetric_productId_fkey" FOREIGN KEY ("productId") REFERENCES "DemoProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoAdCampaign" ADD CONSTRAINT "DemoAdCampaign_productId_fkey" FOREIGN KEY ("productId") REFERENCES "DemoProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoAdDaily" ADD CONSTRAINT "DemoAdDaily_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DemoAdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoSearchTerm" ADD CONSTRAINT "DemoSearchTerm_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DemoAdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoInventory" ADD CONSTRAINT "DemoInventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "DemoProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TikTokDemoProduct" ADD CONSTRAINT "TikTokDemoProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "TikTokDemoStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TikTokDemoDailyMetric" ADD CONSTRAINT "TikTokDemoDailyMetric_productId_fkey" FOREIGN KEY ("productId") REFERENCES "TikTokDemoProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TikTokDemoCreator" ADD CONSTRAINT "TikTokDemoCreator_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "TikTokDemoStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TikTokDemoVideo" ADD CONSTRAINT "TikTokDemoVideo_productId_fkey" FOREIGN KEY ("productId") REFERENCES "TikTokDemoProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TikTokDemoVideo" ADD CONSTRAINT "TikTokDemoVideo_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "TikTokDemoCreator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TikTokDemoVideoDaily" ADD CONSTRAINT "TikTokDemoVideoDaily_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "TikTokDemoVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
