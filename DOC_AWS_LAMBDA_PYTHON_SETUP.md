# AWS Lambda Python Executor Setup Guide

This document describes how to set up the AWS Lambda function required by the Workflow Engine to execute Python scripts in a Serverless environment (like AWS Amplify).

## 1. Create a New Lambda Function

- **Function Name**: `RunPythonWorkflowNode`
- **Runtime**: `Python 3.12` (or newer)
- **Architecture**: `x86_64` or `arm64`

## 2. Configuration Settings (Crucial for Security & Cost)

Go to **Configuration** -> **General configuration**:

| Setting | Recommended Value | Reason |
| :--- | :--- | :--- |
| **Memory** | `128 MB` | Pure logic execution is memory-efficient. |
| **Timeout** | `3 - 5 seconds` | **Crucial!** Prevents infinite loops (`while True:`) from consuming costs. |
| **Ephemeral storage** | `512 MB` | Standard default. |

## 3. Python Function Code (`lambda_function.py`)

Replace the default Lambda code with the following implementation:

```python
import sys
import io
import traceback
import json

def lambda_handler(event, context):
    """
    Standard entry point for AWS Lambda.
    Expected event body:
    {
        "script": "print('hello')",
        "data": {"key": "value"}
    }
    """
    user_script = event.get('script', '')
    payload_data = event.get('data', {})
    
    if not user_script.strip():
        return {
            'ok': False,
            'stdout': '',
            'stderr': 'No script provided',
            'output': None
        }

    # 1. Capture stdout and stderr
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    redirected_output = io.StringIO()
    redirected_error = io.StringIO()
    sys.stdout = redirected_output
    sys.stderr = redirected_error
    
    # 2. Prepare Sandbox Environment
    # Inject 'data' from Next.js and provide an 'output' variable for the user
    local_env = {
        'data': payload_data,
        'output': None 
    }
    
    # Keep builtins but you can restrict __import__ here if needed for higher security
    global_env = {'__builtins__': __builtins__}
    
    execution_success = False

    # 3. Execute User Script
    try:
        exec(user_script, global_env, local_env)
        execution_success = True
    except Exception as e:
        traceback.print_exc()
        execution_success = False
    finally:
        # Restore stdout/stderr
        sys.stdout = old_stdout
        sys.stderr = old_stderr
        
    stdout_str = redirected_output.getvalue()
    stderr_str = redirected_error.getvalue()
    
    # 4. Standardized Response
    return {
        'ok': execution_success,
        'stdout': stdout_str,
        'stderr': stderr_str,
        'output': local_env.get('output', None)
    }
```

## 4. IAM Permissions (Execution Role)

The Lambda function only needs the basic `AWSLambdaBasicExecutionRole` permission to write logs to CloudWatch. It does **not** need access to S3 or DynamoDB unless your workflows specifically require it.

## 5. Next.js / Amplify Environment Variables

Ensure the following variables are set in your Amplify environment console:

- `AWS_REGION`: e.g., `ap-northeast-1`
- `AWS_ACCESS_KEY_ID`: Your IAM user access key.
- `AWS_SECRET_ACCESS_KEY`: Your IAM user secret key.
- `AWS_LAMBDA_FUNCTION_NAME`: `RunPythonWorkflowNode` (if different from default).

## 6. How it works in Workflow Node

In your Python node on the Workflow canvas:
1. You can access the incoming trigger/payload data via the `data` variable.
2. You can use normal `print()` to debug; the output will show up in the "Test" result.
3. To return processed data to the next workflow node, set the `output` variable (e.g., `output = {"status": "ok"}`).
