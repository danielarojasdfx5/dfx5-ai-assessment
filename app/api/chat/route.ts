import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://your-api-gateway-url.amazonaws.com/prod';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // For now, mock the response since we haven't deployed the backend yet
    // After deployment, uncomment the real API call below

    // Mock response (remove this after deployment)
    const mockResponse = {
      sessionId: body.sessionId || `session-${Date.now()}`,
      response: `Thank you for your message: "${body.message}". This is a test response. Once we deploy the backend, this will connect to the real AI assessment system.`,
      assessmentId: `assessment-${Date.now()}`,
    };

    return NextResponse.json(mockResponse);

    // Real API call (uncomment after deployment)
    /*
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add Authorization header here when Cognito is set up
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data);
    */
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
