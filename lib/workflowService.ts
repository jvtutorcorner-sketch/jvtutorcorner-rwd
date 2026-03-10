import {
    PutCommand,
    GetCommand,
    ScanCommand,
    DeleteCommand,
    UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from './dynamo';
import { WorkflowDefinition } from './types/workflow';

const TABLE_NAME = 'jvtutorcorner-workflows';

export async function createWorkflow(workflow: WorkflowDefinition) {
    const now = new Date().toISOString();
    const item = {
        ...workflow,
        createdAt: now,
        updatedAt: now,
    };

    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
    });

    await ddbDocClient.send(command);
    return item;
}

export async function getWorkflow(id: string): Promise<WorkflowDefinition | null> {
    const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id },
    });

    const response = await ddbDocClient.send(command);
    return (response.Item as WorkflowDefinition) || null;
}

export async function listWorkflows(): Promise<WorkflowDefinition[]> {
    const command = new ScanCommand({
        TableName: TABLE_NAME,
    });

    const response = await ddbDocClient.send(command);
    return (response.Items as WorkflowDefinition[]) || [];
}

export async function updateWorkflow(
    id: string,
    updates: Partial<Omit<WorkflowDefinition, 'id' | 'createdAt'>>
) {
    const now = new Date().toISOString();

    let updateExpression = 'SET updatedAt = :updatedAt';
    const expressionAttributeValues: Record<string, any> = {
        ':updatedAt': now,
    };
    const expressionAttributeNames: Record<string, string> = {};

    Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
            updateExpression += `, #${key} = :${key}`;
            expressionAttributeNames[`#${key}`] = key;
            expressionAttributeValues[`:${key}`] = value;
        }
    });

    const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
    });

    const response = await ddbDocClient.send(command);
    return response.Attributes as WorkflowDefinition;
}

export async function deleteWorkflow(id: string) {
    const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id },
    });

    await ddbDocClient.send(command);
}
