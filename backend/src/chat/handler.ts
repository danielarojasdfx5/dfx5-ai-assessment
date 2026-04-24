import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { corsHeaders, getSystemPrompt, generateId } from '../shared/utils';

const bedrock = new BedrockRuntimeClient({ region: process.env.REGION || 'us-east-1' });
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.REGION || 'us-east-1' }));

const MODEL_ID = process.env.MODEL_ID || 'meta.llama3-8b-instruct-v1:0';
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || 'dfx5-sessions';
const RESPONSES_TABLE = process.env.RESPONSES_TABLE || 'dfx5-responses';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Chat request:', JSON.stringify(event, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  try {
    const userId = event.requestContext.authorizer?.claims?.sub || 'anonymous';
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
        messages: [{ role: 'system', content: getSystemPrompt() }],
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

    await ddbClient.send(
      new PutCommand({
        TableName: RESPONSES_TABLE,
        Item: {
          assessmentId: session.assessmentId,
          questionId: generateId(),
          question: aiMessage,
          answer: message,
          timestamp: Date.now(),
        },
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ sessionId: sid, response: aiMessage, assessmentId: session.assessmentId }),
    };
  } catch (error: any) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Internal error', message: error.message }),
    };
  }
}

async function getSession(sessionId: string) {
  const result = await ddbClient.send(new GetCommand({ TableName: SESSIONS_TABLE, Key: { sessionId } }));
  return result.Item as any;
}

async function getAIResponse(messages: any[]): Promise<string> {
  const history = messages
    .filter((m) => m.role !== 'system')
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const prompt = `${getSystemPrompt()}

Conversation:
${history}

Ask the next relevant question to assess their AI readiness. Be concise.