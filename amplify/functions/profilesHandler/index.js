const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-northeast-1';
const tableName = process.env.PROFILES_TABLE || process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';

const client = new DynamoDBClient({ region });
const doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

exports.handler = async function (event) {
  // event expected to be { action, payload } (when invoked via Invoke API)
  let body = event;
  // If invoked via Lambda InvokeCommand, payload may be in event.body or the raw input
  try {
    if (typeof event === 'string') body = JSON.parse(event);
    if (event && event.body) body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch (e) {
    // ignore
  }

  const action = (body && body.action) || (body && body.actionName) || null;
  const payload = (body && body.payload) || {};

  try {
    if (action === 'findByEmail') {
      const email = String(payload.email || '').toLowerCase();
      const res = await doc.send(new ScanCommand({ TableName: tableName, FilterExpression: 'email = :email', ExpressionAttributeValues: { ':email': email } }));
      const item = (res && res.Items && res.Items[0]) || null;
      return { statusCode: 200, body: JSON.stringify({ item }) };
    }

    if (action === 'getById') {
      const id = payload.id;
      const res = await doc.send(new GetCommand({ TableName: tableName, Key: { id } }));
      return { statusCode: 200, body: JSON.stringify({ item: res.Item || null }) };
    }

    if (action === 'put') {
      const profile = payload.profile || payload;
      await doc.send(new PutCommand({ TableName: tableName, Item: profile }));
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (err) {
    console.error('profilesHandler error', err);
    return { statusCode: 500, body: JSON.stringify({ error: err?.message || String(err) }) };
  }
};
