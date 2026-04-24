const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.REGION || 'us-east-1' }));
const ASSESSMENTS_TABLE = process.env.ASSESSMENTS_TABLE || 'dfx5-assessments';

exports.handler = async (event) => {
  console.log('Assessment request');

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  try {
    const userId = event.requestContext?.authorizer?.claims?.sub || 'anonymous';

    // GET /assessment - List user's assessments
    if (event.httpMethod === 'GET' && !event.pathParameters?.id) {
      const result = await ddbClient.send(
        new QueryCommand({
          TableName: ASSESSMENTS_TABLE,
          IndexName: 'userId-index',
          KeyConditionExpression: 'userId = :uid',
          ExpressionAttributeValues: { ':uid': userId },
          Limit: 20,
        })
      );
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ assessments: result.Items || [] }) };
    }

    // GET /assessment/{id} - Get specific assessment
    if (event.httpMethod === 'GET' && event.pathParameters?.id) {
      const result = await ddbClient.send(
        new GetCommand({
          TableName: ASSESSMENTS_TABLE,
          Key: { assessmentId: event.pathParameters.id, timestamp: 0 },
        })
      );
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(result.Item || {}) };
    }

    // POST /assessment - Create new assessment
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const assessment = {
        assessmentId: generateId(),
        userId,
        timestamp: Date.now(),
        status: 'in-progress',
        company: body.company || '',
        industry: body.industry || '',
        createdAt: Date.now(),
      };

      await ddbClient.send(new PutCommand({ TableName: ASSESSMENTS_TABLE, Item: assessment }));
      return { statusCode: 201, headers: corsHeaders(), body: JSON.stringify(assessment) };
    }

    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Internal error', message: error.message }),
    };
  }
};

function generateId() {
  return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}
