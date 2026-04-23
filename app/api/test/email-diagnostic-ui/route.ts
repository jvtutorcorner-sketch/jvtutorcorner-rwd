import { NextRequest, NextResponse } from 'next/server';

/**
 * 簡單的 HTML 測試頁面，用於驗證 Email 發送功能
 */
export async function GET(req: NextRequest) {
    const html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email 驗證信發送診斷工具</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 40px;
            max-width: 600px;
            width: 100%;
        }
        
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }
        
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            color: #333;
            margin-bottom: 8px;
            font-weight: 500;
        }
        
        input {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
            transition: border-color 0.2s;
        }
        
        input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        button {
            width: 100%;
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
        }
        
        button:active {
            transform: translateY(0);
        }
        
        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        
        .result {
            margin-top: 30px;
            padding: 20px;
            border-radius: 8px;
            display: none;
        }
        
        .result.success {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
        }
        
        .result.error {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
        }
        
        .result.info {
            background: #d1ecf1;
            border: 1px solid #bee5eb;
            color: #0c5460;
        }
        
        .result h3 {
            margin-bottom: 10px;
            font-size: 16px;
        }
        
        .result-content {
            font-size: 14px;
            line-height: 1.5;
        }
        
        .log-section {
            margin-top: 30px;
            padding: 20px;
            background: #f5f5f5;
            border-radius: 8px;
        }
        
        .log-section h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 14px;
        }
        
        .log {
            background: white;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 12px;
            font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
            font-size: 12px;
            line-height: 1.5;
            color: #333;
            max-height: 300px;
            overflow-y: auto;
        }
        
        .log-entry {
            margin-bottom: 8px;
            word-break: break-all;
        }
        
        .log-success {
            color: #28a745;
        }
        
        .log-error {
            color: #dc3545;
        }
        
        .log-info {
            color: #007bff;
        }
        
        .instructions {
            margin-top: 30px;
            padding: 15px;
            background: #e7f3ff;
            border-left: 4px solid #007bff;
            border-radius: 4px;
            font-size: 14px;
            color: #004085;
        }
        
        .instructions h4 {
            margin-bottom: 10px;
        }
        
        .instructions ol {
            margin-left: 20px;
        }
        
        .instructions li {
            margin-bottom: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📧 Email 驗證信發送診斷</h1>
        <p class="subtitle">測試 JV Tutor Corner 的 Email 驗證信發送功能</p>
        
        <form id="testForm">
            <div class="form-group">
                <label for="email">Email 地址:</label>
                <input 
                    type="email" 
                    id="email" 
                    name="email" 
                    value="n7842165@gmail.com"
                    placeholder="輸入要測試的 Email 地址"
                    required
                >
            </div>
            <button type="submit" id="submitBtn">🚀 開始測試</button>
        </form>
        
        <div id="result" class="result"></div>
        
        <div class="log-section">
            <h3>📝 Server Logs (實時更新):</h3>
            <div class="log" id="logContainer">
                <div class="log-entry log-info">等待測試開始...</div>
            </div>
        </div>
        
        <div class="instructions">
            <h4>🔍 診斷步驟:</h4>
            <ol>
                <li>輸入測試 Email 地址</li>
                <li>點擊「開始測試」按鈕</li>
                <li>檢查 Server Logs 中的 [VerificationService] 消息</li>
                <li>查看結果區域的發送狀態</li>
                <li>若出現錯誤，參考 <strong>EMAIL_VERIFICATION_TROUBLESHOOTING.md</strong> 進行除錯</li>
            </ol>
        </div>
    </div>
    
    <script>
        const form = document.getElementById('testForm');
        const emailInput = document.getElementById('email');
        const submitBtn = document.getElementById('submitBtn');
        const resultDiv = document.getElementById('result');
        const logContainer = document.getElementById('logContainer');
        
        function addLog(message, type = 'info') {
            const entry = document.createElement('div');
            entry.className = \`log-entry log-\${type}\`;
            entry.textContent = \`[\${new Date().toLocaleTimeString()}] \${message}\`;
            logContainer.appendChild(entry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
        
        function showResult(type, title, content) {
            resultDiv.className = \`result \${type}\`;
            resultDiv.innerHTML = \`<h3>\${title}</h3><div class="result-content">\${content}</div>\`;
            resultDiv.style.display = 'block';
        }
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = emailInput.value.trim();
            if (!email) {
                showResult('error', '❌ 錯誤', '請輸入有效的 Email 地址');
                return;
            }
            
            logContainer.innerHTML = '';
            resultDiv.style.display = 'none';
            submitBtn.disabled = true;
            
            addLog(\`開始測試 \${email} 的 Email 發送...\`, 'info');
            
            try {
                const response = await fetch('/api/test/send-verification-email', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    addLog(\`✅ API 請求成功\`, 'success');
                    addLog(\`📧 目標 Email: \${data.email}\`, 'info');
                    addLog(\`🔐 Token 預覽: \${data.tokenPreview}\`, 'info');
                    addLog(\`📤 發送結果: \${data.sendResult ? '成功' : '失敗'}\`, data.sendResult ? 'success' : 'error');
                    addLog(\`📋 \${data.instructions}\`, 'info');
                    
                    if (data.sendResult) {
                        showResult('success', '✅ Email 發送成功', 
                            \`驗證信已成功發送至 <strong>\${data.email}</strong><br><br>
                            <strong>下一步:</strong><br>
                            1. 請檢查此 Email 的收件箱<br>
                            2. 若 5 分鐘內未收到，請檢查垃圾郵件夾<br>
                            3. 若仍未收到，參考故障排除指南進行診斷\`);
                    } else {
                        showResult('error', '❌ Email 發送失敗', 
                            \`驗證信發送失敗。<br><br>
                            <strong>建議:</strong><br>
                            1. 檢查 SMTP 或 Resend 是否已正確配置<br>
                            2. 查看 Server Logs 中的詳細錯誤信息<br>
                            3. 參考 EMAIL_VERIFICATION_TROUBLESHOOTING.md 進行除錯\`);
                    }
                } else {
                    addLog(\`❌ API 返回錯誤: \${data.error}\`, 'error');
                    showResult('error', '❌ 測試失敗', 
                        \`API 返回錯誤: <strong>\${data.error}</strong><br><br>
                        請檢查伺服器日誌了解詳情。\`);
                }
            } catch (error) {
                addLog(\`❌ 網絡錯誤: \${error.message}\`, 'error');
                showResult('error', '❌ 網絡連接失敗', 
                    \`無法連接到測試 API。<br>
                    請確保開發伺服器正在運行。\`);
            } finally {
                submitBtn.disabled = false;
            }
        });
        
        window.addEventListener('load', () => {
            addLog('診斷工具已就緒', 'info');
            addLog('請輸入 Email 地址並點擊「開始測試」', 'info');
        });
    </script>
</body>
</html>
    `;

    return new NextResponse(html, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
        },
    });
}
