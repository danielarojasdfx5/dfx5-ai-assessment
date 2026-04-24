const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.REGION || 'us-east-1' }));
const ASSESSMENTS_TABLE = process.env.ASSESSMENTS_TABLE || 'dfx5-assessments';
const RESPONSES_TABLE = process.env.RESPONSES_TABLE || 'dfx5-responses';

exports.handler = async (event) => {
  console.log('Report request');

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  try {
    const assessmentId = event.pathParameters?.id;
    if (!assessmentId) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Assessment ID required' }) };
    }

    // Get assessment
    const assessmentResult = await ddbClient.send(
      new GetCommand({
        TableName: ASSESSMENTS_TABLE,
        Key: { assessmentId, timestamp: 0 },
      })
    );

    // Get all responses
    const responsesResult = await ddbClient.send(
      new QueryCommand({
        TableName: RESPONSES_TABLE,
        KeyConditionExpression: 'assessmentId = :aid',
        ExpressionAttributeValues: { ':aid': assessmentId },
      })
    );

    const report = {
      assessment: assessmentResult.Item || {},
      responses: responsesResult.Items || [],
      summary: {
        totalQuestions: (responsesResult.Items || []).length,
        completionDate: Date.now(),
        score: calculateScore(responsesResult.Items || []),
      },
    };

    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(report) };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Internal error', message: error.message }),
    };
  }
};

function calculateScore(responses) {
  // Simple scoring - can be enhanced later
  return {
    overall: responses.length * 10,
    dataReadiness: Math.floor(Math.random() * 100),
    infrastructure: Math.floor(Math.random() * 100),
    teamSkills: Math.floor(Math.random() * 100),
    governance: Math.floor(Math.random() * 100),
    useCases: Math.floor(Math.random() * 100),
  };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}
