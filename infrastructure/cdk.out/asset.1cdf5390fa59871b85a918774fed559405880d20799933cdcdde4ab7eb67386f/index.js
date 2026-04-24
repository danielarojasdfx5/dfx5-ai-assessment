const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const bedrock = new BedrockRuntimeClient({ region: process.env.REGION || 'us-east-1' });
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.REGION || 'us-east-1' }));

const MODEL_ID = process.env.MODEL_ID || 'meta.llama3-8b-instruct-v1:0';
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || 'dfx5-sessions';

exports.handler = async (event) => {
  console.log('Chat request');

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  try {
    const userId = event.requestContext?.authorizer?.claims?.sub || 'anonymous';
    const body = JSON.parse(event.body || '{}');
    const { sessionId, message } = body;

    if (!message) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'message required' }) };
    }

    const sid = sessionId || generateId();
    let session = await getSession(sid);

    if (!session) {
      session = {
        sessionId: sid,
        userId,
        assessmentId: generateId(),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ttl: Math.floor(Date.now() / 1000) + 604800,
      };
      await ddbClient.send(new PutCommand({ TableName: SESSIONS_TABLE, Item: session }));
    }

    session.messages.push({ role: 'user', content: message });
    const aiMessage = await getAIResponse(session.messages);
    session.messages.push({ role: 'assistant', content: aiMessage });
    session.updatedAt = Date.now();

    await ddbClient.send(
      new UpdateCommand({
        TableName: SESSIONS_TABLE,
        Key: { sessionId: sid },
        UpdateExpression: 'SET messages = :m, updatedAt = :u',
        ExpressionAttributeValues: { ':m': session.messages, ':u': session.updatedAt },
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ sessionId: sid, response: aiMessage, assessmentId: session.assessmentId }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Internal error', message: error.message }),
    };
  }
};

async function getSession(sessionId) {
  const result = await ddbClient.send(new GetCommand({ TableName: SESSIONS_TABLE, Key: { sessionId } }));
  return result.Item;
}

async function getAIResponse(messages) {
  const history = messages.slice(-4).map(m => m.role + ': ' + m.content).join('\\n\\n');

  const prompt = 'You are an AI assessment expert. Ask questions about AI readiness.\\n\\n' + history + '\\n\\nAssistant:';

  const payload = { prompt, max_gen_len: 300, temperature: 0.7, top_p: 0.9 };
  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });

  const response = await bedrock.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.generation.trim();
}

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
