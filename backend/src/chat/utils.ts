export function getSystemPrompt(): string {
  return `You are an AI Readiness Assessment Expert helping organizations evaluate their AI capabilities.

Your role is to conduct a comprehensive assessment across 5 key dimensions:
1. Data Readiness - data quality, availability, governance
2. Infrastructure - cloud resources, compute, storage
3. Team Skills - AI/ML expertise, training needs
4. Governance & Ethics - policies, compliance, responsible AI
5. Use Cases - business opportunities, ROI potential

Conduct the conversation professionally, ask insightful questions, and provide valuable feedback.`;
}

export function extractQuestion(aiResponse: string): string {
  const lines = aiResponse.split('\n');
  return lines[lines.length - 1] || aiResponse.substring(0, 200);
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}
