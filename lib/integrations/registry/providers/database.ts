// lib/integrations/registry/providers/database.ts
// 資料庫 / 向量庫服務定義。欄位 key 對齊 add-app handleSubmit 的持久化結果。
import type { ProviderDefinition } from '../types';

export const DATABASE_PROVIDERS: ProviderDefinition[] = [
    {
        type: 'DYNAMODB',
        category: 'database',
        defaults: { label: 'DynamoDB', desc: 'AWS 無伺服器資料庫', icon: '🗄️', badge: 'bg-orange-100 text-orange-800', sortOrder: 10, visible: true },
        capabilities: { testConnection: true, multiInstance: true },
        fields: [
            { key: 'tableName', label: '資料表名稱', type: 'text', required: true },
            { key: 'partitionKey', label: '分割鍵 (Partition Key)', type: 'text' },
            { key: 'sortKey', label: '排序鍵 (Sort Key)', type: 'text' },
            { key: 'region', label: 'AWS 區域 (Region)', type: 'text', default: 'ap-northeast-1' },
        ],
    },
    {
        type: 'MONGODB',
        category: 'database',
        defaults: { label: 'MongoDB', desc: 'NoSQL 文件型資料庫', icon: '🍃', badge: 'bg-green-100 text-green-800', sortOrder: 20, visible: true },
        capabilities: { testConnection: true, multiInstance: true },
        fields: [
            { key: 'uri', label: '連線 URI', type: 'password', required: true, secret: true, placeholder: 'mongodb+srv://...' },
            { key: 'database', label: '資料庫名稱', type: 'text', required: true },
            { key: 'collection', label: 'Collection 名稱', type: 'text' },
        ],
    },
    {
        type: 'POSTGRESQL',
        category: 'database',
        defaults: { label: 'PostgreSQL', desc: '功能豐富的開源 SQL 資料庫', icon: '🐘', badge: 'bg-blue-100 text-blue-800', sortOrder: 30, visible: true },
        capabilities: { testConnection: true, multiInstance: true },
        fields: [
            { key: 'host', label: '主機', type: 'text', required: true },
            { key: 'port', label: '通訊埠', type: 'text', default: '5432' },
            { key: 'user', label: '使用者', type: 'text', required: true },
            { key: 'password', label: '密碼', type: 'password', required: true, secret: true },
            { key: 'database', label: '資料庫名稱', type: 'text', required: true },
            { key: 'table', label: '資料表', type: 'text' },
        ],
    },
    {
        type: 'MYSQL',
        category: 'database',
        defaults: { label: 'MySQL', desc: '輕量高效能的 SQL 資料庫', icon: '🐬', badge: 'bg-cyan-100 text-cyan-800', sortOrder: 40, visible: true },
        capabilities: { testConnection: true, multiInstance: true },
        fields: [
            { key: 'host', label: '主機', type: 'text', required: true },
            { key: 'port', label: '通訊埠', type: 'text', default: '3306' },
            { key: 'user', label: '使用者', type: 'text', required: true },
            { key: 'password', label: '密碼', type: 'password', required: true, secret: true },
            { key: 'database', label: '資料庫名稱', type: 'text', required: true },
            { key: 'table', label: '資料表', type: 'text' },
        ],
    },
    {
        type: 'REDIS',
        category: 'database',
        defaults: { label: 'Redis', desc: '超高速記憶體快取與資料存儲', icon: '⚡', badge: 'bg-red-100 text-red-800', sortOrder: 50, visible: true },
        capabilities: { testConnection: true, multiInstance: true },
        fields: [
            { key: 'host', label: '主機', type: 'text', required: true },
            { key: 'port', label: '通訊埠', type: 'text', default: '6379' },
            { key: 'password', label: '密碼', type: 'password', secret: true },
            { key: 'db', label: 'DB 編號', type: 'number', default: 0 },
        ],
    },
    {
        type: 'QDRANT',
        category: 'database',
        defaults: { label: 'Qdrant', desc: '開源向量資料庫，支援語義搜索', icon: '🧠', badge: 'bg-purple-100 text-purple-800', sortOrder: 60, visible: true },
        capabilities: { testConnection: true, multiInstance: true },
        fields: [
            { key: 'url', label: 'Qdrant URL', type: 'text', required: true, placeholder: 'https://xxx.qdrant.io' },
            { key: 'apiKey', label: 'API Key', type: 'password', secret: true },
            { key: 'collectionName', label: 'Collection 名稱', type: 'text', required: true },
            { key: 'embeddingModel', label: '嵌入模型', type: 'text' },
        ],
    },
];
