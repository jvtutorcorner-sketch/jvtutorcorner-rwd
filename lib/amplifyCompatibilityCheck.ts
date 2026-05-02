/**
 * Amplify Compatibility Check for Workflow Features
 * 
 * This module validates that the deployment environment supports
 * workflow script execution (Python + JavaScript).
 * 
 * ✅ REQUIREMENTS FOR PRODUCTION DEPLOYMENT:
 * 1. AWS Credentials configured in Amplify environment variables
 * 2. AWS Lambda function pre-created for Python execution
 * 3. isolated-vm package installed for JavaScript execution
 */

export interface AmplifyCompatibilityReport {
  isCompatible: boolean;
  environment: 'amplify' | 'local' | 'unknown';
  pythonExecution: {
    supported: boolean;
    reason: string;
    warnings: string[];
  };
  javascriptExecution: {
    supported: boolean;
    reason: string;
    warnings: string[];
  };
  recommendations: string[];
}

export async function checkAmplifyCompatibility(): Promise<AmplifyCompatibilityReport> {
  const report: AmplifyCompatibilityReport = {
    isCompatible: false,
    environment: 'unknown',
    pythonExecution: { supported: false, reason: '', warnings: [] },
    javascriptExecution: { supported: false, reason: '', warnings: [] },
    recommendations: []
  };

  // Detect environment
  const isAmplify = !!process.env.AWS_AMPLIFY;
  const hasAWSCredentials = !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
  
  if (isAmplify) {
    report.environment = 'amplify';
  } else if (process.env.NODE_ENV === 'development') {
    report.environment = 'local';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Python Execution Check
  // ─────────────────────────────────────────────────────────────────────────────
  
  const pythonCheck = checkPythonExecution(hasAWSCredentials, isAmplify);
  report.pythonExecution = pythonCheck;

  // ─────────────────────────────────────────────────────────────────────────────
  // JavaScript Execution Check
  // ─────────────────────────────────────────────────────────────────────────────
  
  const jsCheck = checkJavaScriptExecution();
  report.javascriptExecution = jsCheck;

  // ─────────────────────────────────────────────────────────────────────────────
  // Overall Compatibility
  // ─────────────────────────────────────────────────────────────────────────────
  
  report.isCompatible = report.pythonExecution.supported && report.javascriptExecution.supported;

  // Generate recommendations
  if (!report.isCompatible) {
    if (!report.pythonExecution.supported) {
      report.recommendations.push(
        '❌ Python execution not available - configure AWS Lambda or disable this feature'
      );
    }
    if (!report.javascriptExecution.supported) {
      report.recommendations.push(
        '❌ JavaScript execution not available - install isolated-vm package'
      );
    }
  } else if (isAmplify) {
    report.recommendations.push(
      '✅ All workflow features are compatible with Amplify deployment'
    );
  }

  // Log on startup
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG_AMPLIFY_CHECK) {
    console.log('[Amplify Compatibility] Report:', report);
  }

  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function checkPythonExecution(
  hasAWSCredentials: boolean,
  isAmplify: boolean
): { supported: boolean; reason: string; warnings: string[] } {
  const warnings: string[] = [];

  // Check 1: Lambda environment variable
  const lambdaFunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (!lambdaFunctionName) {
    warnings.push('AWS_LAMBDA_FUNCTION_NAME environment variable not set');
  }

  // Check 2: AWS Region
  const awsRegion = process.env.AWS_REGION;
  if (!awsRegion) {
    warnings.push('AWS_REGION environment variable not set (defaults to ap-northeast-1)');
  }

  // Check 3: AWS Credentials
  if (!hasAWSCredentials) {
    warnings.push('AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY not configured');
  }

  // Check 4: Amplify-specific
  if (isAmplify && !hasAWSCredentials) {
    return {
      supported: false,
      reason: 'AWS credentials required for Lambda execution on Amplify',
      warnings
    };
  }

  // Determine support level
  const isSupported = hasAWSCredentials && !!lambdaFunctionName;
  
  return {
    supported: isSupported,
    reason: isSupported 
      ? 'Python execution via AWS Lambda is ready'
      : 'Missing AWS Lambda configuration',
    warnings
  };
}

function checkJavaScriptExecution(): {
  supported: boolean;
  reason: string;
  warnings: string[];
} {
  const warnings: string[] = [];

  try {
    // Try to load isolated-vm
    require.resolve('isolated-vm');
    
    // Check environment variable
    const timeoutMs = process.env.SCRIPT_EXECUTION_TIMEOUT_MS;
    if (!timeoutMs) {
      warnings.push('SCRIPT_EXECUTION_TIMEOUT_MS not set (defaults to 3000ms)');
    }

    return {
      supported: true,
      reason: 'JavaScript execution via isolated-vm is ready',
      warnings
    };
  } catch (e) {
    return {
      supported: false,
      reason: 'isolated-vm package not installed',
      warnings: [
        'Install with: npm install isolated-vm',
        'Or: yarn add isolated-vm',
        'Or: pnpm add isolated-vm'
      ]
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment Variable Reference
// ─────────────────────────────────────────────────────────────────────────────

/**
 * REQUIRED Environment Variables (for production on Amplify)
 * 
 * Script Execution (JavaScript):
 * - SCRIPT_EXECUTION_TIMEOUT_MS   Default: 3000 (3 seconds)
 * - SCRIPT_COMPILE_TIMEOUT_MS     Default: 1000 (1 second)
 * - SCRIPT_MEMORY_LIMIT_MB        Default: 128 (128MB)
 * 
 * For .env.local (development):
 * - DEBUG_AMPLIFY_CHECK           Set to "true" to log compatibility check
 */

export const AMPLIFY_ENV_VARS = {
  // Script Execution
  SCRIPT_EXECUTION_TIMEOUT_MS: '3000',
  SCRIPT_COMPILE_TIMEOUT_MS: '1000',
  SCRIPT_MEMORY_LIMIT_MB: '128'
};
