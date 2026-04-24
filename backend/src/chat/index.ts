import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const bedrock = new BedrockRuntimeClient({ region: process.env.REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const MODEL_ID = process.env.MODEL_ID || 'meta.llama3-8b-instruct-v1:0';
const SESSIONS_TABLE = process.env.SESSIONS_TABLE!;
const RESPONSES_TABLE = process.env.RESPONSES_TABLE!;
const ASSESSMENTS_TABLE = process.env.ASSESSMENTS_TABLE!;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  sessionId: string;
  message: string;
  assessmentId?: string;
  context?: {
    company?: string;
    industry?: string;
    currentStep?: string;
  };
}

interface Session {
  sessionId: string;
  assessmentId: string;
  userId: string;
  messages: ChatMessage[];
  currentDimension: string;
  questionsAsked: number;
  createdAt: number;
  updatedAt: number;
  ttl: number;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Extract user ID from Cognito authorizer
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const body: ChatRequest = JSON.parse(event.body || '{}');
    const { sessionId, message, assessmentId, context } = body;

    if (!sessionId || !message) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'sessionId and message are required' }),
      };
    }

    // Get or create session
    let session = await getSession(sessionId);
    if (!session) {
      session = await createSession(sessionId, userId, assessmentId || sessionId);
    }

    // Add user message to conversation
    session.messages.push({
      role: 'user',
      content: message,
    });

    // Get AI response
    const aiResponse = await getAIResponse(session, context);

    // Add AI response to conversation
    session.messages.push({
      role: 'assistant',
      content: aiResponse,
    });

    // Update session
    session.updatedAt = Date.now();
    session.questionsAsked += 1;
    await updateSession(session);

    // Save response to DynamoDB
    await saveResponse(session.assessmentId, session.questionsAsked.toString(), {
      question: extractQuestion(aiResponse),
      answer: message,
      timestamp: Date.now(),
    });

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        sessionId: session.sessionId,
        response: aiResponse,
        questionsAsked: session.questionsAsked,
        currentDimension: session.currentDimension,
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

async function getSession(sessionId: string): Promise<Session | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionId },
    })
  );

  return result.Item as Session | null;
}

async function createSession(
  sessionId: string,
  userId: string,
  assessmentId: string
): Promise<Session> {
  const now = Date.now();
  const session: Session = {
    sessionId,
    assessmentId,
    userId,
    messages: [
      {
        role: 'system',
        content: getSystemPrompt(),
      },
    ],
    currentDimension: 'introduction',
    questionsAsked: 0,
    createdAt: now,
    updatedAt: now,
    ttl: Math.floor(now / 1000) + 7 * 24 * 60 * 60, // 7 days TTL
  };

  await docClient.send(
    new PutCommand({
      TableName: SESSIONS_TABLE,
      Item: session,
    })
  );

  return session;
}

async function updateSession(session: Session): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionId: session.sessionId },
      UpdateExpression:
        'SET messages = :messages, updatedAt = :updatedAt, questionsAsked = :questionsAsked, currentDimension = :currentDimension',
      ExpressionAttributeValues: {
        ':messages': session.messages,
        ':updatedAt': session.updatedAt,
        ':questionsAsked': session.questionsAsked,
        ':currentDimension': session.currentDimension,
      },
    })
  );
}

async function getAIResponse(session: Session, context?: any): Promise<string> {
  // Build conversation history for the AI
  const conversationHistory = session.messages
    .slice(-10) // Keep last 10 messages for context
    .map((msg) => {
      if (msg.role === 'system') return null;
      return `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`;
    })
    .filter(Boolean)
    .join('\n\n');

  const prompt = buildPrompt(conversationHistory, session, context);

  // Call Bedrock
  const payload = {
    prompt: prompt,
    max_gen_len: 512,
    temperature: 0.7,
    top_p: 0.9,
  };

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });

  const response = await bedrock.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  return responseBody.generation.trim();
}

function buildPrompt(
  conversationHistory: string,
  session: Session,
  context?: any
): string {
  const systemPrompt = getSystemPrompt();

  return `${systemPrompt}

Conversation History:
${conversationHistory}

Context:
- Current dimension being assessed: ${session.currentDimension}
- Questions asked so far: ${session.questionsAsked}
${context?.company ? `- Company: ${context.company}` : ''}
${context?.industry ? `- Industry: ${context.industry}` : ''}

Instructions:
- Continue the AI readiness assessment conversation naturally
- Ask insightful, contextual questions about their ${session.currentDimension}
- Provide thoughtful follow-ups based on previous answers
- When you've covered one dimension thoroughly (after 3-5 questions), move to the next
- Dimensions to cover: Data Readiness, Infrastructure, Team Skills, Governance, Use Cases
- Keep responses conversational but professional
- End each response with a clear, specific question