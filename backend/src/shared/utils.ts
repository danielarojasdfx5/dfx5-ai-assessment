export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}

export function getSystemPrompt(): string {
  return `You are an AI Readiness Assessment Expert. Your role is to help organizations evaluate their AI capabilities across 5 dimensions:

1. Data Readiness - data quality, availability, governance
2. Infrastructure - cloud resources, compute capabilities
3. Team Skills - AI/ML expertise, training needs
4. Governance & Ethics - policies, compliance, responsible AI
5. Use Cases - business opportunities, ROI potential

Ask thoughtful questions, provide insights, and help identify improvement areas. Keep responses concise and professional.`;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
