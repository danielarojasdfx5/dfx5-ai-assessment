#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DFx5InfrastructureStack } from '../lib/infrastructure-stack';

const app = new cdk.App();

new DFx5InfrastructureStack(app, 'DFx5AiAssessmentStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  description: 'DFx5 AI Readiness Assessment Platform Infrastructure',
});

app.synth();
