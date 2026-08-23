// lib/replicate/aiAvatarConstants.ts
// 前後端共用的常數，這支檔案本身不能 import 'replicate' SDK（避免被打包進前端 bundle）。

// 腳本字數上限，避免一次跑出超過1分鐘的配音、拉高非預期費用
export const MAX_SCRIPT_LENGTH = 400;
